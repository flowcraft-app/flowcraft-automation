import { supabase } from "../../../lib/supabaseClient";

export async function GET() {
  try {
    const { data, error } = await supabase.from("env_vars").select("*");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    /**
     * 2 kullanım destekliyoruz:
     * - Tek kayıt: { key: "...", value: "...", description?: "..." }
     * - Çoklu kayıt: [{ key, value, description? }, ...]
     */
    const records = Array.isArray(body) ? body : [body];

    const payload = records
      .filter((item) => item && item.key)
      .map((item) => ({
        key: String(item.key),
        value: item.value != null ? String(item.value) : "",
        description:
          item.description != null ? String(item.description) : null,
      }));

    if (!payload.length) {
      return new Response(
        JSON.stringify({ error: "Geçerli bir env kaydı gönderilmedi." }),
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("env_vars")
      .upsert(payload, { onConflict: "key" })
      .select("*");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500 }
    );
  }
}
