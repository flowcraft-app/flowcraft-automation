import { supabase } from "../../../../lib/supabaseClient";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

if (!DEFAULT_WORKSPACE_ID) {
  console.error(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil. Lütfen .env.local dosyasına ekleyin."
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const flowId = searchParams.get("flow_id");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const statusParam = searchParams.get("status") || "all";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // 1) flow_id zorunlu
    if (!flowId) {
      return new Response(JSON.stringify({ error: "flow_id missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!DEFAULT_WORKSPACE_ID) {
      return new Response(
        JSON.stringify({ error: "Default workspace ID tanımlı değil." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3) limit hesapla (default 20, max 100)
    let limit = 20;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 100);
      }
    }

    // 4) offset hesapla (default 0, min 0)
    let offset = 0;
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (!Number.isNaN(parsedOffset) && parsedOffset > 0) {
        offset = parsedOffset;
      }
    }

    // 5) temel sorgu: sadece bu flow'un, bu workspace'e ait run'ları
    let query = supabase
      .from("flow_runs")
      .select("*") // V2 için tüm kolonlar gelsin, panelde işimize yarar
      .eq("flow_id", flowId)
      .eq("workspace_id", DEFAULT_WORKSPACE_ID);

    // 6) status filtresi (all ise dokunma)
    if (statusParam && statusParam !== "all") {
      query = query.eq("status", statusParam);
    }

    // 7) tarih aralığı filtreleri (from / to)
    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (!Number.isNaN(fromDate.getTime())) {
        query = query.gte("created_at", fromDate.toISOString());
      }
    }

    if (toParam) {
      const toDate = new Date(toParam);
      if (!Number.isNaN(toDate.getTime())) {
        query = query.lte("created_at", toDate.toISOString());
      }
    }

    // 8) order + pagination (offset / limit+1)
    // limit+1 çekiyoruz; böylece hasMore bilgisini doğru hesaplayabiliyoruz.
    const effectiveLimit = limit + 1;

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + effectiveLimit - 1);

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/run/history] error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const runs = hasMore ? rows.slice(0, limit) : rows;

    // 🔹 duration_ms yoksa started_at / finished_at'tan hesapla (UI için sugar)
    const normalizedRuns = runs.map((run: any) => {
      let duration_ms = run.duration_ms;

      if (
        (duration_ms == null || duration_ms < 0) &&
        run.started_at &&
        run.finished_at
      ) {
        try {
          const s = new Date(run.started_at).getTime();
          const f = new Date(run.finished_at).getTime();
          if (!Number.isNaN(s) && !Number.isNaN(f) && f >= s) {
            duration_ms = f - s;
          }
        } catch {
          // parse hatası olursa duration_ms dokunma
        }
      }

      return {
        ...run,
        duration_ms,
      };
    });

    return new Response(JSON.stringify({ runs: normalizedRuns, hasMore }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[GET /api/run/history] fatal error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
