import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import { executeRun } from "../../run/execute/route";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

// 🌐 Opsiyonel global webhook token
// .env.local içine istersen şunu ekleyebilirsin:
// FLOWCRAFT_WEBHOOK_GLOBAL_TOKEN=secret_123
// Tanımlı değilse default olarak "secret_123" kullanıyoruz (dev için pratik).
const GLOBAL_WEBHOOK_TOKEN =
  process.env.FLOWCRAFT_WEBHOOK_GLOBAL_TOKEN || "secret_123";

if (!DEFAULT_WORKSPACE_ID) {
  console.error(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil. Lütfen .env.local dosyasına ekleyin."
  );
}

type AnyNode = {
  id: string;
  type?: string;
  data?: any;
};

/**
 * POST /api/trigger/webhook?flow_id=...&token=...
 *
 * Dış sistemler buraya POST atarak bir flow'u tetikleyebilir.
 * Body + query + headers (+token) bilgisi run.trigger_payload olarak saklanır.
 * Eğer flow içinde respond_webhook node'u varsa, onun ürettiği
 * HTTP status + body dış client'a döner.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const flowId =
      searchParams.get("flow_id") || searchParams.get("flowId");

    if (!flowId || !flowId.trim()) {
      return NextResponse.json(
        { error: "flow_id missing" },
        { status: 400 }
      );
    }

    if (!DEFAULT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: "Default workspace ID tanımlı değil." },
        { status: 500 }
      );
    }

    const defaultWorkspaceId = DEFAULT_WORKSPACE_ID;

    // 1) Flow'u bul (workspace ile birlikte)
    const { data: flow, error: flowErr } = await supabase
      .from("flows")
      .select("id, workspace_id")
      .eq("id", flowId)
      .eq("workspace_id", defaultWorkspaceId)
      .single();

    if (flowErr || !flow) {
      console.error("[POST /api/trigger/webhook] flow error:", flowErr);
      return NextResponse.json(
        { error: "flow_not_found" },
        { status: 404 }
      );
    }

    const workspaceId = flow.workspace_id || defaultWorkspaceId;

    // 2) Flow diagramını çek → Webhook Trigger node'unu ve auth ayarlarını oku
    const { data: diagram, error: diagramErr } = await supabase
      .from("flow_diagrams")
      .select("nodes")
      .eq("flow_id", flow.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (diagramErr || !diagram) {
      console.error(
        "[POST /api/trigger/webhook] diagram error:",
        diagramErr
      );
      return NextResponse.json(
        { error: "diagram_not_found" },
        { status: 404 }
      );
    }

    const nodes: AnyNode[] = (diagram as any)?.nodes ?? [];
    const webhookNode: AnyNode | undefined = nodes.find(
      (n: AnyNode) =>
        n?.data?.type === "webhook_trigger" ||
        n?.data?.nodeType === "webhook_trigger" ||
        n?.type === "webhook_trigger"
    );

    if (!webhookNode) {
      return NextResponse.json(
        {
          error: "webhook_trigger_not_found",
          info:
            "Bu flow için webhook_trigger node'u bulunamadı. Flow diagramını kontrol edin.",
        },
        { status: 400 }
      );
    }

    // --- AUTH KARARI ---
    // Webhook node'dan authMode / token oku
    let nodeAuthMode: "none" | "token" = "none";
    let nodeToken: string | undefined;

    if (webhookNode?.data) {
      nodeAuthMode = webhookNode.data.authMode ?? "none";
      const raw = webhookNode.data.token;
      if (typeof raw === "string" && raw.trim().length > 0) {
        nodeToken = raw.trim();
      }
    }

    // Gelen token'ı al (query, header, Authorization)
    const queryToken =
      searchParams.get("token") || searchParams.get("access_token");
    const headerToken =
      req.headers.get("x-flowcraft-token") ||
      req.headers.get("x-flowcraft-webhook-token");
    const authHeader = req.headers.get("authorization");
    let bearerToken: string | null = null;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      bearerToken = authHeader.slice(7).trim() || null;
    }

    const incomingToken =
      queryToken || headerToken || bearerToken || null;

    // Gereken token listesi:
    // - authMode "token" ise:
    //   * nodeToken varsa → validTokens içine ekle
    //   * GLOBAL_WEBHOOK_TOKEN varsa → validTokens içine ekle
    const validTokens: string[] = [];
    if (nodeAuthMode === "token") {
      if (nodeToken) validTokens.push(nodeToken);
      if (GLOBAL_WEBHOOK_TOKEN) validTokens.push(GLOBAL_WEBHOOK_TOKEN);
    }

    if (validTokens.length > 0) {
      const ok =
        incomingToken != null &&
        validTokens.some((t) => t && t === incomingToken);

      if (!ok) {
        return NextResponse.json(
          { error: "invalid_webhook_token" },
          { status: 401 }
        );
      }
    }

    // 3) Webhook'tan gelen payload'ı al (JSON dene, olmazsa null)
    let bodyPayload: any = null;
    try {
      bodyPayload = await req.json();
    } catch {
      bodyPayload = null;
    }

    // 4) query + headers'i toparla
    const queryPayload: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryPayload[key] = value;
    });

    const headersPayload: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersPayload[key.toLowerCase()] = value;
    });

    const triggerPayload = {
      body: bodyPayload,
      query: queryPayload,
      headers: headersPayload,
      token: incomingToken,
    };

    // 5) Run oluştur (manual run ile aynı mantık, ama trigger bilgisi ekliyoruz)
    const { data: run, error: runErr } = await supabase
      .from("flow_runs")
      .insert({
        flow_id: flow.id,
        workspace_id: workspaceId,
        status: "queued",
        trigger_type: "webhook",
        trigger_payload: triggerPayload,
        payload: bodyPayload, // ham body ayrı dursun
      })
      .select("*")
      .single();

    if (runErr || !run) {
      console.error("[POST /api/trigger/webhook] run insert error:", runErr);
      return NextResponse.json(
        { error: runErr?.message || "run_create_failed" },
        { status: 500 }
      );
    }

    // 6) Executor'u direkt fonksiyon olarak çağır ve cevabı olduğu gibi dış client'a döndür
    //    - Eğer flow içinde respond_webhook node'u varsa:
    //      → executeRun, respond_webhook'un ürettiği statusCode + body ile NextResponse dönecek
    //    - Yoksa:
    //      → { status: "completed", run_id, executed } gibi standart JSON dönecek
    const execResponse = await executeRun(run.id);
    return execResponse;
  } catch (err: any) {
    console.error("[POST /api/trigger/webhook] fatal error:", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
