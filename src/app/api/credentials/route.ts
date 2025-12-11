import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

if (!process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID) {
  console.warn(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil, fallback ID kullanılacak."
  );
}

type CredentialRow = {
  id: string;
  name: string;
  type: string;
  config: any;
  created_at: string | null;
  updated_at: string | null;
  workspace_id?: string;
};

/**
 * GET /api/credentials
 * Default (veya query/body ile gelen) workspace içindeki credential listesini döndürür.
 * Dikkat: config (gizli kısım) maskelenir, direkt gönderilmez.
 *
 * Query parametreleri (opsiyonel):
 *   - workspaceId: string  → İleride multi-workspace için
 *   - type / credentialType: string → type filtresi
 *   - search / q: string → name üzerinden arama (ILIKE)
 *
 * Response:
 * {
 *   credentials: [
 *     {
 *       id,
 *       name,
 *       type,
 *       created_at,
 *       updated_at,
 *       hasConfig: boolean,
 *       workspace_id
 *     }
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const workspaceFromQuery = searchParams.get("workspaceId");
    const typeFilter =
      searchParams.get("type") || searchParams.get("credentialType");
    const search = searchParams.get("search") || searchParams.get("q");

    const workspaceId = workspaceFromQuery || DEFAULT_WORKSPACE_ID;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId belirlenemedi." },
        { status: 500 }
      );
    }

    let query = supabase
      .from("credentials")
      .select("id, name, type, config, created_at, updated_at, workspace_id")
      .eq("workspace_id", workspaceId);

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    if (search && search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/credentials Supabase hatası:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    const safeCredentials = (data ?? []).map((row: CredentialRow) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      created_at: row.created_at,
      updated_at: row.updated_at,
      hasConfig: !!row.config, // config var mı (içeriği dönmüyoruz)
      workspace_id: row.workspace_id ?? workspaceId,
    }));

    return NextResponse.json(
      { credentials: safeCredentials },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("GET /api/credentials beklenmeyen hata:", err);
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/credentials
 * Yeni bir credential ekler.
 *
 * Body:
 * {
 *   "name": "Main API Key",
 *   "type": "http_bearer" | "api_key" | "basic" | "smtp" | ...,
 *   "config": { ... },         // gizli bilgiler JSON
 *   "createdBy"?: "user_uuid", // opsiyonel
 *   "workspaceId"?: "..."      // opsiyonel, yoksa default workspace
 * }
 *
 * Response:
 * {
 *   "credential": {
 *      id, name, type, created_at, updated_at, hasConfig, workspace_id
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const name: string | undefined = body.name;
    const type: string | undefined = body.type;
    const config: any = body.config;
    const createdBy: string | undefined = body.createdBy;
    const workspaceFromBody: string | undefined = body.workspaceId;

    const workspaceId = workspaceFromBody || DEFAULT_WORKSPACE_ID;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId belirlenemedi." },
        { status: 500 }
      );
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Credential için 'name' alanı zorunludur." },
        { status: 400 }
      );
    }

    if (!type || typeof type !== "string" || !type.trim()) {
      return NextResponse.json(
        { error: "Credential için 'type' alanı zorunludur." },
        { status: 400 }
      );
    }

    if (config == null) {
      return NextResponse.json(
        { error: "Credential için 'config' alanı zorunludur." },
        { status: 400 }
      );
    }

    const insertData: any = {
      name: name.trim(),
      type: type.trim(),
      config,
      workspace_id: workspaceId,
    };

    if (createdBy && typeof createdBy === "string") {
      insertData.created_by = createdBy;
    }

    const { data, error } = await supabase
      .from("credentials")
      .insert(insertData)
      .select("id, name, type, config, created_at, updated_at, workspace_id")
      .single();

    if (error) {
      console.error("POST /api/credentials Supabase hatası:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    const row = data as CredentialRow;

    const safeCredential = {
      id: row.id,
      name: row.name,
      type: row.type,
      created_at: row.created_at,
      updated_at: row.updated_at,
      hasConfig: !!row.config,
      workspace_id: row.workspace_id ?? workspaceId,
    };

    return NextResponse.json(
      { credential: safeCredential },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/credentials beklenmeyen hata:", err);
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
