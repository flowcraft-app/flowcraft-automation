import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import { executeRun } from "../../run/execute/route";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

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
 * POST /api/trigger/schedule?flow_id=...
 *
 * Supabase cron, Vercel Cron veya başka bir scheduler burayı çağırarak
 * bir flow'u "schedule" tetikleyicisi ile çalıştırabilir.
 *
 * Body'de istersen ekstra payload gönderebilirsin:
 * {
 *   "payload": { ... }
 * }
 *
 * Veya body olmadan query param kullanabilirsin:
 * /api/trigger/schedule?flow_id=...&value=123.45&foo=bar
 *  -> payload: { value: "123.45", foo: "bar" }
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

    // 1) Body'den opsiyonel payload'u al
    let bodyPayload: any = null;
    try {
      bodyPayload = await req.json();
    } catch {
      bodyPayload = null;
    }

    // 2) Query param'lardan payload üret (flow_id / flowId hariç her şey)
    const queryPayload: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key === "flow_id" || key === "flowId") continue;
      queryPayload[key] = value;
    }
    const hasQueryPayload = Object.keys(queryPayload).length > 0;

    // 3) Nihai payload öncelik sırası:
    //    - Body bir obje ise: body.payload veya body (aynı V2 mantığı)
    //    - Aksi halde: queryPayload varsa onu kullan
    //    - Hiçbiri yoksa: null
    const payload =
      bodyPayload && typeof bodyPayload === "object"
        ? bodyPayload.payload ?? bodyPayload
        : hasQueryPayload
        ? queryPayload
        : null;

    // 4) Flow'u bul (workspace ile birlikte)
    const { data: flow, error: flowErr } = await supabase
      .from("flows")
      .select("id, workspace_id")
      .eq("id", flowId)
      .eq("workspace_id", defaultWorkspaceId)
      .single();

    if (flowErr || !flow) {
      console.error("[POST /api/trigger/schedule] flow error:", flowErr);
      return NextResponse.json(
        { error: "flow_not_found" },
        { status: 404 }
      );
    }

    const workspaceId = flow.workspace_id || defaultWorkspaceId;

    // 5) Diagram'dan schedule_trigger node'unu ve cron/timezone bilgilerini okumayı dene
    const { data: diagram, error: diagramErr } = await supabase
      .from("flow_diagrams")
      .select("nodes")
      .eq("flow_id", flow.id)
      .eq("workspace_id", workspaceId)
      .single();

    let cron: string | null = null;
    let timezone: string | null = null;

    if (!diagramErr && diagram && (diagram as any).nodes) {
      const nodes: AnyNode[] = (diagram as any).nodes ?? [];
      const scheduleNode: AnyNode | undefined = nodes.find(
        (n: AnyNode) =>
          n?.data?.type === "schedule_trigger" ||
          n?.data?.nodeType === "schedule_trigger" ||
          n?.type === "schedule_trigger"
      );

      if (scheduleNode?.data) {
        cron =
          typeof scheduleNode.data.cron === "string"
            ? scheduleNode.data.cron
            : null;
        timezone =
          typeof scheduleNode.data.timezone === "string"
            ? scheduleNode.data.timezone
            : null;
      }
    } else if (diagramErr) {
      console.error(
        "[POST /api/trigger/schedule] diagram error:",
        diagramErr
      );
      // executor zaten "diagram yok" durumunu handle ediyor, burada durdurmuyoruz.
    }

    const nowIso = new Date().toISOString();

    const triggerPayload = {
      scheduledAt: nowIso,
      cron,
      timezone,
      source: "api_trigger_schedule",
      payload,
      trigger: "schedule",
      triggerType: "schedule",
    };

    // 6) Run oluştur (trigger_type: "schedule")
    const { data: run, error: runErr } = await supabase
      .from("flow_runs")
      .insert({
        flow_id: flow.id,
        workspace_id: workspaceId,
        status: "queued",
        trigger_type: "schedule",
        trigger_payload: triggerPayload,
        payload,
      })
      .select("*")
      .single();

    if (runErr || !run) {
      console.error(
        "[POST /api/trigger/schedule] run insert error:",
        runErr
      );
      return NextResponse.json(
        { error: runErr?.message || "run_create_failed" },
        { status: 500 }
      );
    }

    // 7) Executor'u çağır ve sonucu olduğu gibi geri dön
    const execResponse = await executeRun(run.id);
    return execResponse;
  } catch (err: any) {
    console.error("[POST /api/trigger/schedule] fatal error:", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
