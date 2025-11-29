import { supabase } from "../../../../lib/supabaseClient";

function isValidUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value
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

    // 2) UUID format kontrolü
    if (!isValidUuid(flowId)) {
      return new Response(
        JSON.stringify({ error: "invalid flow_id format" }),
        {
          status: 400,
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

    // 5) temel sorgu: sadece bu flow'un run'ları
    let query = supabase
      .from("flow_runs")
      .select("*") // V2 için tüm kolonlar gelsin, panelde işimize yarar
      .eq("flow_id", flowId);

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

    return new Response(JSON.stringify({ runs, hasMore }), {
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
