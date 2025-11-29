import { NextRequest } from "next/server";
import { supabase } from "../../../../../lib/supabaseClient";

/**
 * GET /api/flows/[id]/diagram
 * Belirli bir flow'a ait diagram verisini döndürür.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: flowId } = await context.params;

    if (!flowId) {
      return Response.json(
        { error: "Flow ID parametresi zorunludur." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("flow_diagrams")
      .select("*")
      .eq("flow_id", flowId)
      .maybeSingle();

    if (error) {
      return Response.json(
        { error: "Supabase GET hatası: " + error.message },
        { status: 500 }
      );
    }

    return Response.json(
      {
        flow_id: flowId,
        nodes: data?.nodes ?? [],
        edges: data?.edges ?? [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Bilinmeyen GET hatası" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/flows/[id]/diagram
 * Flow için diagram verisini kaydeder veya günceller.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: flowId } = await context.params;

    if (!flowId) {
      return Response.json(
        { error: "Flow ID parametresi zorunludur." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const nodes = body?.nodes ?? [];
    const edges = body?.edges ?? [];

    const { data, error } = await supabase
      .from("flow_diagrams")
      .upsert(
        {
          flow_id: flowId,
          nodes,
          edges,
        },
        { onConflict: "flow_id" }
      )
      .select()
      .single();

    if (error) {
      return Response.json(
        { error: "Supabase POST hatası: " + error.message },
        { status: 400 }
      );
    }

    return Response.json(data, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Bilinmeyen POST hatası" },
      { status: 500 }
    );
  }
}
