import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

type HookContext = {
  params: {
    hookId: string;
  };
};

async function handleWebhook(req: Request, context: HookContext) {
  const { hookId } = context.params;

  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  // Header & query'leri basit objeye çevir
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Body (JSON ise parse etmeye çalışıyoruz)
  let rawBody: string | null = null;
  let body: any = null;

  if (method !== "GET" && method !== "HEAD") {
    try {
      rawBody = await req.text();
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody; // JSON değilse düz text
        }
      }
    } catch (err) {
      console.warn("Webhook body parse error:", err);
    }
  }

  // 1) Flow var mı?
  const { data: flow, error: flowError } = await supabase
    .from("flows")
    .select("id")
    .eq("id", hookId)
    .single();

  if (flowError || !flow) {
    return NextResponse.json(
      { error: "Flow bulunamadı", details: flowError?.message },
      { status: 404 }
    );
  }

  // 2) Diagram'dan webhook_trigger node'unu bul
  const { data: diagram, error: diagramError } = await supabase
    .from("flow_diagrams")
    .select("nodes")
    .eq("flow_id", hookId)
    .single();

  if (diagramError || !diagram?.nodes) {
    return NextResponse.json(
      {
        error: "Bu flow için webhook trigger tanımlanmamış",
        details: diagramError?.message,
      },
      { status: 400 }
    );
  }

  let webhookNode: any | null = null;
  try {
    const nodes = diagram.nodes as any[];
    webhookNode = nodes.find(
      (n) => n?.data?.type === "webhook_trigger"
    );
  } catch (err) {
    console.error("Webhook node arama hatası:", err);
  }

  if (!webhookNode?.data) {
    return NextResponse.json(
      { error: "Diagram içinde webhook_trigger node'u yok" },
      { status: 400 }
    );
  }

  const nodeData = webhookNode.data as any;

  // 3) Method kontrolü (nodeData.method ile)
  const allowedMethod = (nodeData.method as string) || "POST";
  if (allowedMethod !== "ANY" && method !== allowedMethod.toUpperCase()) {
    return NextResponse.json(
      {
        error: "Bu webhook için izin verilmeyen HTTP method",
        allowedMethod,
        receivedMethod: method,
      },
      { status: 405 }
    );
  }

  // 4) Basit token auth (authMode/token node'dan geliyor)
  const authMode = (nodeData.authMode as "none" | "token") || "none";
  const expectedToken = (nodeData.token as string | undefined) || undefined;

  if (authMode === "token") {
    const headerToken =
      req.headers.get("x-flowcraft-token") ??
      req.headers.get("x-flow-token");

    const authHeader = req.headers.get("authorization");
    let bearerToken: string | null = null;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      bearerToken = authHeader.slice(7).trim();
    }

    const queryToken = url.searchParams.get("token");

    const providedToken =
      queryToken || headerToken || bearerToken || null;

    if (!providedToken || !expectedToken || providedToken !== expectedToken) {
      return NextResponse.json(
        {
          error: "Webhook yetkisiz",
          reason: "invalid_token",
        },
        { status: 401 }
      );
    }
  }

  // 5) flow_runs içine yeni run kaydı aç (trigger_type = webhook)
  const triggerPayload = {
    method,
    query,
    headers,
    body,
  };

  const { data: run, error: runError } = await supabase
    .from("flow_runs")
    .insert({
      flow_id: hookId,
      status: "queued",
      trigger_type: "webhook",
      trigger_payload: triggerPayload,
      payload: body ?? null,
    })
    .select("*")
    .single();

  if (runError || !run) {
    console.error("Webhook run create error:", runError);
    return NextResponse.json(
      {
        error: "Run kaydı oluşturulamadı",
        details: runError?.message,
      },
      { status: 500 }
    );
  }

  const runId = run.id as string;

  // 6) Executor'ı çağır (/api/run/execute)
  const origin = url.origin;
  let executeJson: any = null;

  try {
    const execRes = await fetch(`${origin}/api/run/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId }),
    });

    executeJson = await execRes.json();

    if (!execRes.ok) {
      return NextResponse.json(
        {
          error: "Execute API hata döndürdü",
          run_id: runId,
          details: executeJson,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("Webhook execute request error:", err);
    return NextResponse.json(
      {
        error: "Executor çağrılırken hata oluştu",
        run_id: runId,
        details: String(err),
      },
      { status: 500 }
    );
  }

  const status =
    executeJson.status ||
    executeJson.run?.status ||
    executeJson.result?.status;

  // 7) Şimdilik basit JSON response (Respond to Webhook node'u gelince zenginleşecek)
  return NextResponse.json(
    {
      ok: true,
      trigger: "webhook",
      flow_id: hookId,
      run_id: runId,
      status,
      result: executeJson,
    },
    { status: 200 }
  );
}

export async function GET(req: Request, context: HookContext) {
  return handleWebhook(req, context);
}

export async function POST(req: Request, context: HookContext) {
  return handleWebhook(req, context);
}
