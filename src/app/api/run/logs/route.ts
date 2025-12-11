import { supabase } from "../../../../lib/supabaseClient";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("run_id");

    // 1) run_id zorunlu
    if (!runId) {
      return new Response(JSON.stringify({ error: "run_id missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Run kaydını al (workspace filtresi yok, sadece id)
    const { data: run, error: runError } = await supabase
      .from("flow_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      console.error("[GET /api/run/logs] flow_runs error:", runError);

      // Supabase 0 row için genelde PGRST116 kodunu döner
      if ((runError as any)?.code === "PGRST116") {
        return new Response(JSON.stringify({ error: "run_not_found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: runError?.message || "run_query_failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3) Flow bilgisini (varsa) çek – sadece name/description vs. için
    let flowMeta: any = null;
    if (run.flow_id) {
      const { data: flow, error: flowError } = await supabase
        .from("flows")
        .select("id, name, description")
        .eq("id", run.flow_id)
        .single();

      if (flowError) {
        // Flow bulunamazsa kritik değil, sadece loglayıp devam ediyoruz
        console.warn("[GET /api/run/logs] flows error:", flowError);
      } else if (flow) {
        flowMeta = {
          id: flow.id,
          name: (flow as any).name ?? null,
          description: (flow as any).description ?? null,
        };
      }
    }

    // 4) Node loglarını al (yine sadece run_id'ye göre)
    const { data: logs, error: logsError } = await supabase
      .from("flow_run_nodes")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (logsError) {
      console.error("[GET /api/run/logs] flow_run_nodes error:", logsError);

      return new Response(
        JSON.stringify({ error: logsError.message || "logs_query_failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 5) Run meta objesi (frontend için daha okunabilir yapı)
    const runMeta = {
      id: run.id,
      flow_id: run.flow_id ?? null,
      workspace_id: (run as any).workspace_id ?? null,
      status: run.status ?? "unknown",
      trigger_type: (run as any).trigger_type ?? null,
      trigger_payload: (run as any).trigger_payload ?? null,
      payload: (run as any).payload ?? null,
      created_at: (run as any).created_at ?? null,
      started_at: (run as any).started_at ?? null,
      finished_at: (run as any).finished_at ?? null,
      duration_ms: (run as any).duration_ms ?? null,
      error_message: (run as any).error_message ?? null,
      final_output: (run as any).final_output ?? null,
    };

    // 6) JSON response (V2 formatını bozmadan, meta ekliyoruz)
    return new Response(
      JSON.stringify({
        status: runMeta.status, // geriye dönük uyumluluk
        run: runMeta,           // 🆕 run meta
        flow: flowMeta,         // 🆕 flow meta (olsa da olur, olmasa da)
        logs: logs ?? [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("[GET /api/run/logs] fatal error:", e);

    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
