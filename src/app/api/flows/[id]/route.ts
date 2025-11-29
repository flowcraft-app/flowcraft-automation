import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";

type ParamsContext = {
  params: Promise<{ id: string }>;
};

// 🔹 TEK FLOW GET
export async function GET(
  request: Request,
  context: ParamsContext
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ flow: data });
}

// 🔹 FLOW ADI / AÇIKLAMASI GÜNCELLE (FlowEditor içindeki meta save burayı kullanıyor)
export async function PATCH(
  request: Request,
  context: ParamsContext
) {
  const { id } = await context.params;
  const body = await request.json();

  const { name, description } = body;

  const { data, error } = await supabase
    .from("flows")
    .update({
      name,
      description,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ flow: data });
}

// 🔹 FLOW SİL
export async function DELETE(
  request: Request,
  context: ParamsContext
) {
  const { id } = await context.params;

  const { error } = await supabase
    .from("flows")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Eğer Supabase şemanda foreign key'ler ON DELETE CASCADE ise
  // flow_diagrams / flow_runs / flow_run_nodes da otomatik silinir.
  return NextResponse.json({ success: true });
}
