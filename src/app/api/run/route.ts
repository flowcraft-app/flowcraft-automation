import { supabase } from "../../../lib/supabaseClient";
import { NextResponse } from "next/server";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

if (!DEFAULT_WORKSPACE_ID) {
  console.error(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil. Lütfen .env.local dosyasına ekleyin."
  );
}

// 🔹 RUN OLUŞTUR (POST /api/run)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));

    const flow_id = body?.flow_id as string | undefined;
    const user_id = body?.user_id ?? null;
    const payload = body?.payload ?? null;

    // 🆕 Trigger bilgisi (manuel/webhook/schedule testleri için)
    const rawTriggerType = body?.trigger_type ?? body?.triggerType;
    const trigger_type =
      rawTriggerType && typeof rawTriggerType === "string"
        ? rawTriggerType
        : "manual";

    const trigger_payload =
      body?.trigger_payload ?? body?.triggerPayload ?? null;

    if (!flow_id || typeof flow_id !== "string" || !flow_id.trim()) {
      return NextResponse.json(
        { error: "flow_id zorunludur." },
        { status: 400 }
      );
    }

    if (!DEFAULT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: "Default workspace ID tanımlı değil." },
        { status: 500 }
      );
    }

    // ❌ Artık UUID format kontrolü yapmıyoruz.
    // flow_id Supabase tarafında TEXT kolonuna yazılacak.

    // 1) RUN oluştur
    const { data, error } = await supabase
      .from("flow_runs")
      .insert({
        flow_id,
        user_id,
        payload,
        status: "queued",
        workspace_id: DEFAULT_WORKSPACE_ID,
        // 🆕 trigger alanları
        trigger_type,
        trigger_payload,
      })
      .select("*")
      .single(); // 🔥 id'yi almak için önemli

    if (error || !data) {
      console.error("[POST /api/run] insert error:", error);
      return NextResponse.json(
        { error: error?.message || "Run oluşturulamadı." },
        { status: 400 }
      );
    }

    // 2) Oluşturulan run'in id ve status bilgisini dön
    // Executor'u burada ÇAĞIRMIYORUZ, onu frontend (FlowEditorClient) çağırıyor.
    return NextResponse.json(
      {
        id: data.id, // FlowEditorClient json.id olarak kullanıyor
        status: data.status, // queued
        trigger_type: data.trigger_type, // 🆕 log/debug için faydalı
        run: data, // İleride başka yerden ihtiyaç olursa diye full kayıt da duruyor
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[POST /api/run] fatal error:", err);
    return NextResponse.json(
      { error: err?.message || "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

// 🔹 BASİT RUN LİSTESİ (GET /api/run?flow_id=...)
// Not: asıl gelişmiş filtreler /api/run/history endpoint'inde.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flowId = searchParams.get("flow_id");
    const limitParam = searchParams.get("limit");

    if (!flowId) {
      return NextResponse.json(
        { error: "flow_id parametresi zorunludur." },
        { status: 400 }
      );
    }

    if (!DEFAULT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: "Default workspace ID tanımlı değil." },
        { status: 500 }
      );
    }

    // ❌ Burada da artık UUID format kontrolü yok.
    // flow_runs.flow_id TEXT olduğu için direkt eşitlik filtresi kullanıyoruz.

    // default 50, max 100
    let limit = 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 100);
      }
    }

    const { data, error } = await supabase
      .from("flow_runs")
      .select("id, status, created_at")
      .eq("flow_id", flowId)
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[GET /api/run] select error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ runs: data ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error("[GET /api/run] fatal error:", err);
    return NextResponse.json(
      { error: err?.message || "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
