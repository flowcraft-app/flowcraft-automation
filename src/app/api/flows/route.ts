import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ?? "abc3566e-d898-439c-9f5a-d78f6540ea42";

if (!DEFAULT_WORKSPACE_ID) {
  console.error(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil. Lütfen .env.local dosyasına ekleyin."
  );
}

// 🔹 TÜM FLOW'LARI LİSTELE
// Artık workspace_id + isteğe bağlı user_id filtresi ile çalışıyor
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    if (!DEFAULT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: "Default workspace ID tanımlı değil." },
        { status: 500 }
      );
    }

    let query = supabase
      .from("flows")
      .select("*")
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .order("created_at", { ascending: false });

    // Eğer user_id verilmişse sadece o kullanıcıya ait flow'ları getir
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Standart: { flows: [...] }
    return NextResponse.json({ flows: data ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/flows beklenmeyen hata:", err);
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

// 🔹 YENİ FLOW OLUŞTUR
// Body: { name?: string, description?: string, userId?: string }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, userId } = body;

    if (!DEFAULT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: "Default workspace ID tanımlı değil." },
        { status: 500 }
      );
    }

    const insertData: any = {
      name: name ?? "Yeni Flow",
      description: description ?? "",
      workspace_id: DEFAULT_WORKSPACE_ID,
    };

    // Eğer client userId gönderiyorsa, flows.user_id alanına yaz
    if (userId) {
      insertData.user_id = userId;
    }

    const { data, error } = await supabase
      .from("flows")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Standart: { flow: {...} }
    return NextResponse.json({ flow: data }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/flows beklenmeyen hata:", err);
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
