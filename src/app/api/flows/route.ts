import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

// 🔹 TÜM FLOW'LARI LİSTELE
export async function GET() {
  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Standart: { flows: [...] }
  return NextResponse.json({ flows: data ?? [] }, { status: 200 });
}

// 🔹 YENİ FLOW OLUŞTUR
export async function POST(req: Request) {
  const body = await req.json();
  const { name, description } = body;

  const { data, error } = await supabase
    .from("flows")
    .insert({
      name: name ?? "Yeni Flow",
      description: description ?? "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Standart: { flow: {...} }
  return NextResponse.json({ flow: data }, { status: 201 });
}
