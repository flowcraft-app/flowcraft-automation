import { supabase } from "../../../../lib/supabaseClient";

function isValidUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value
  );
}

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

    // 2) UUID format kontrolü
    if (!isValidUuid(runId)) {
      return new Response(
        JSON.stringify({ error: "invalid run_id format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3) Run kaydını al
    const { data: run, error: runError } = await supabase
      .from("flow_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError) {
      console.error("[GET /api/run/logs] flow_runs error:", runError);

      // Supabase 0 row için genelde PGRST116 kodunu döner
      if ((runError as any).code === "PGRST116") {
        return new Response(JSON.stringify({ error: "run_not_found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: runError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4) Node loglarını al
    const { data: logs, error: logsError } = await supabase
      .from("flow_run_nodes")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (logsError) {
      console.error("[GET /api/run/logs] flow_run_nodes error:", logsError);

      return new Response(JSON.stringify({ error: logsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5) JSON response (V2 format: status + logs)
    return new Response(
      JSON.stringify({
        status: run?.status ?? "unknown",
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
