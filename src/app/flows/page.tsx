"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Flow = {
  id: string;
  name: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

type LastRunInfo = {
  status: string;
  created_at: string;
};

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingType, setCreatingType] = useState<
    "normal" | "ping" | "httpCheck" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<
    "created_desc" | "created_asc" | "updated_desc"
  >("created_desc");

  const [lastRuns, setLastRuns] = useState<Record<string, LastRunInfo | null>>(
    {}
  );
  const [lastRunsLoading, setLastRunsLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // 🔐 Auth state
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const router = useRouter();

  // Kullanıcı bilgisini yükle
  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (error) {
          console.warn("Supabase getUser (flows) hatası:", error.message);
          setUser(null);
        } else {
          setUser(data?.user ?? null);
        }
      } catch (err) {
        console.error("flows/getUser beklenmeyen hata:", err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Flow listesini yükle (sadece user varsa)
  useEffect(() => {
    if (!user) {
      setFlows([]);
      setLoading(false);
      return;
    }

    const fetchFlows = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/flows");
        const json = await res.json();

        // API bazen { flows: [...] } dönebilir, bazen direkt array
        const items: Flow[] = json.flows ?? json ?? [];
        setFlows(items);
      } catch (err: any) {
        console.error(err);
        setError("Flow listesi yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, [user]);

  // Her flow için son run'ı çek (limit=1)
  useEffect(() => {
    const loadLastRuns = async () => {
      if (!flows || flows.length === 0) {
        setLastRuns({});
        return;
      }

      try {
        setLastRunsLoading(true);
        const entries: [string, LastRunInfo | null][] = await Promise.all(
          flows.map(async (flow) => {
            try {
              const res = await fetch(
                `/api/run/history?flow_id=${encodeURIComponent(flow.id)}&limit=1`
              );
              if (!res.ok) {
                // flow için run yok veya hata → null kabul ediyoruz
                return [flow.id, null];
              }
              const json = await res.json();
              const run = json.runs?.[0];
              if (!run) return [flow.id, null];

              return [
                flow.id,
                {
                  status: run.status,
                  created_at: run.created_at,
                },
              ];
            } catch (err) {
              console.error("Last run fetch error:", err);
              return [flow.id, null];
            }
          })
        );

        const map: Record<string, LastRunInfo | null> = {};
        for (const [id, info] of entries) {
          map[id] = info;
        }
        setLastRuns(map);
      } finally {
        setLastRunsLoading(false);
      }
    };

    loadLastRuns();
  }, [flows]);

  // Yeni flow oluştur
  const handleCreateFlow = async () => {
    try {
      setCreating(true);
      setCreatingType("normal");
      setError(null);

      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Yeni Flow",
          description: "",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Flow oluşturulamadı");
      }

      // API bazen { flow: {...} } dönebilir, bazen direkt row
      const created: Flow = json.flow ?? json;

      // Listeyi güncelle
      setFlows((prev) => [created, ...prev]);

      // Editor sayfasına git
      router.push(`/flows/${created.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Flow oluşturulamadı");
    } finally {
      setCreating(false);
      setCreatingType(null);
    }
  };

  // Ping Template Flow oluştur (Start + HTTP node'lu)
  const handleCreatePingTemplateFlow = async () => {
    try {
      setCreating(true);
      setCreatingType("ping");
      setError(null);

      // 1) Flow kaydı oluştur
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ping HTTP Flow",
          description: "Otomatik oluşturulan basit ping akışı",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Ping flow oluşturulamadı");
      }

      const created: Flow = json.flow ?? json;

      // 2) Diyagramı oluştur (Start + HTTP)
      const startId = `start_${Date.now()}`;
      const httpId = `http_${Date.now() + 1}`;

      const startNode = {
        id: startId,
        type: "default",
        position: { x: 100, y: 150 },
        data: { label: "Start", type: "start" },
      };

      const httpNode = {
        id: httpId,
        type: "default",
        position: { x: 350, y: 150 },
        data: {
          label: "Ping HTTP",
          type: "http_request",
          // 🔹 V2: local env endpoint'i kullan
          url: "http://localhost:3000/api/env",
          method: "GET",
        },
      };

      const edge = {
        id: `e_${startId}_${httpId}`,
        source: startId,
        target: httpId,
        animated: true,
      };

      try {
        await fetch(`/api/flows/${created.id}/diagram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: [startNode, httpNode],
            edges: [edge],
          }),
        });
      } catch (err) {
        console.error("Ping template diagram save error:", err);
        // Diyagramı kaydedemezsek bile flow oluşturulmuş olacak, editor'e yönlendiriyoruz.
      }

      // Listeyi güncelle
      setFlows((prev) => [created, ...prev]);

      // Direkt editor'e git
      router.push(`/flows/${created.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Ping flow oluşturulamadı");
    } finally {
      setCreating(false);
      setCreatingType(null);
    }
  };

  // HTTP Check Flow (Start + HTTP + IF) template
  const handleCreateHttpCheckTemplateFlow = async () => {
    try {
      setCreating(true);
      setCreatingType("httpCheck");
      setError(null);

      // 1) Flow kaydı oluştur
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "HTTP Check Flow",
          description: "HTTP 200 status kontrolü yapan hazır akış",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "HTTP Check flow oluşturulamadı");
      }

      const created: Flow = json.flow ?? json;

      // 2) Diyagramı oluştur (Start + HTTP + IF)
      const base = Date.now();
      const startId = `start_${base}`;
      const httpId = `http_${base + 1}`;
      const ifId = `if_${base + 2}`;

      const startNode = {
        id: startId,
        type: "default",
        position: { x: 100, y: 150 },
        data: { label: "Start", type: "start" },
      };

      const httpNode = {
        id: httpId,
        type: "default",
        position: { x: 350, y: 150 },
        data: {
          label: "HTTP Check",
          type: "http_request",
          // 🔹 Yine local env endpoint, status 200 olduğu için IF geçer
          url: "http://localhost:3000/api/env",
          method: "GET",
        },
      };

      const ifNode = {
        id: ifId,
        type: "default",
        position: { x: 600, y: 150 },
        data: {
          label: "IF status == 200",
          type: "if",
          mode: "status_eq",
          expected: 200,
        },
      };

      const edge1 = {
        id: `e_${startId}_${httpId}`,
        source: startId,
        target: httpId,
        animated: true,
      };

      const edge2 = {
        id: `e_${httpId}_${ifId}`,
        source: httpId,
        target: ifId,
        animated: false,
      };

      try {
        await fetch(`/api/flows/${created.id}/diagram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: [startNode, httpNode, ifNode],
            edges: [edge1, edge2],
          }),
        });
      } catch (err) {
        console.error("HTTP Check template diagram save error:", err);
      }

      // Listeyi güncelle
      setFlows((prev) => [created, ...prev]);

      // Direkt editor'e git
      router.push(`/flows/${created.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "HTTP Check flow oluşturulamadı");
    } finally {
      setCreating(false);
      setCreatingType(null);
    }
  };

  // Flow sil
  const handleDeleteFlow = async (id: string) => {
    const ok = window.confirm(
      "Bu flow'u silmek istediğine emin misin? Bu işlem geri alınamaz."
    );
    if (!ok) return;

    try {
      setDeletingId(id);
      setError(null);

      const res = await fetch(`/api/flows/${id}`, {
        method: "DELETE",
      });

      let json: any = {};
      try {
        json = await res.json();
      } catch {
        // body olmayabilir, sorun değil
      }

      if (!res.ok) {
        throw new Error(json.error || "Flow silinemedi");
      }

      // Local listeden çıkar
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Flow silinemedi");
    } finally {
      setDeletingId(null);
    }
  };

  // Flow kopyala (flow + diagram)
  const handleDuplicateFlow = async (id: string) => {
    try {
      setDuplicatingId(id);
      setError(null);

      // 1) Orijinal flow'u çek
      const resFlow = await fetch(`/api/flows/${id}`);
      const jsonFlow = await resFlow.json();
      if (!resFlow.ok) {
        throw new Error(jsonFlow.error || "Orijinal flow alınamadı");
      }
      const original: Flow = jsonFlow.flow ?? jsonFlow;

      const baseName = original.name || "İsimsiz Flow";

      // 2) Yeni flow oluştur
      const resCreate = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${baseName} (kopya)`,
          description: original.description ?? "",
        }),
      });

      const jsonCreate = await resCreate.json();
      if (!resCreate.ok) {
        throw new Error(jsonCreate.error || "Kopya flow oluşturulamadı");
      }

      const created: Flow = jsonCreate.flow ?? jsonCreate;

      // 3) Orijinal diagramı çek
      const resDia = await fetch(`/api/flows/${id}/diagram`);
      let diaJson: any = {};
      try {
        diaJson = await resDia.json();
      } catch {
        diaJson = {};
      }

      if (resDia.ok && (diaJson.nodes || diaJson.edges)) {
        try {
          await fetch(`/api/flows/${created.id}/diagram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodes: diaJson.nodes ?? [],
              edges: diaJson.edges ?? [],
            }),
          });
        } catch (err) {
          console.error("Flow diagram kopyalanamadı:", err);
          // Diyagram kopyalanmasa da flow var, devam
        }
      }

      // Listeyi güncelle
      setFlows((prev) => [created, ...prev]);

      // Yeni flow editor'üne git
      router.push(`/flows/${created.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Flow kopyalanamadı");
    } finally {
      setDuplicatingId(null);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const renderStatusBadge = (info: LastRunInfo | null | undefined) => {
    if (!info) {
      return (
        <span className="text-[11px] rounded-full border border-slate-600 px-2 py-0.5 text-slate-400">
          Hiç çalıştırılmadı
        </span>
      );
    }

    const status = info.status;
    let label = status;
    let classes =
      "bg-slate-800 text-slate-200 border border-slate-500";

    switch (status) {
      case "completed":
        label = "Başarılı";
        classes =
          "bg-emerald-900/70 text-emerald-300 border border-emerald-500/70";
        break;
      case "error":
        label = "Hata";
        classes =
          "bg-red-900/70 text-red-300 border border-red-500/70";
        break;
      case "running":
        label = "Çalışıyor";
        classes =
          "bg-amber-900/70 text-amber-300 border border-amber-500/70";
        break;
      case "queued":
        label = "Beklemede";
        classes =
          "bg-slate-800 text-slate-200 border border-slate-500/70";
        break;
      default:
        label = status;
    }

    return (
      <span
        className={`text-[11px] inline-flex items-center px-2 py-0.5 rounded-full capitalize ${classes}`}
      >
        {label}
      </span>
    );
  };

  const toTime = (value?: string | null) =>
    value ? new Date(value).getTime() || 0 : 0;

  const filteredSortedFlows = useMemo(() => {
    const term = search.trim().toLowerCase();

    let list = flows;
    if (term) {
      list = list.filter((flow) => {
        const name = (flow.name || "İsimsiz Flow").toLowerCase();
        return name.includes(term);
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "created_desc") {
        return toTime(b.created_at || null) - toTime(a.created_at || null);
      }
      if (sortKey === "created_asc") {
        return toTime(a.created_at || null) - toTime(b.created_at || null);
      }
      if (sortKey === "updated_desc") {
        const aTime = toTime(a.updated_at || a.created_at || null);
        const bTime = toTime(b.updated_at || b.created_at || null);
        return bTime - aTime;
      }
      return 0;
    });

    return sorted;
  }, [flows, search, sortKey]);

  // 🔐 Auth state’e göre sayfa view’ları

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">
          Hesap bilgilerin yükleniyor...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl text-center">
          <h1 className="text-xl font-semibold mb-2">
            Flow’larını görmek için giriş yap
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            FlowCraft şu anda oturum açmamış kullanıcılarda akış listesini
            göstermiyor. Devam etmek için giriş yap veya hızlıca kayıt ol.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/login?redirect=${encodeURIComponent("/flows")}`
                )
              }
              className="px-4 py-2 rounded-md border border-slate-600 text-sm hover:border-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Giriş yap
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/register?redirect=${encodeURIComponent("/flows")}`
                )
              }
              className="px-4 py-2 rounded-md bg-emerald-500 text-sm font-medium text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              Kayıt ol
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Giriş yaptıktan sonra burada tüm flow’larını göreceksin. Hazır{" "}
            <span className="text-emerald-300">Ping</span> ve{" "}
            <span className="text-emerald-300">HTTP Check</span> şablonlarını
            da tek tıkla oluşturabilirsin.
          </p>
        </div>
      </div>
    );
  }

  // 🔐 Buradan sonrası: kullanıcı giriş yapmış durumda
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">FlowCraft Flows</h1>
            <p className="text-sm text-slate-400">
              Tüm otomasyon akışlarını burada yönetebilirsin.
            </p>
            {user?.email && (
              <p className="text-[11px] text-slate-500 mt-1">
                Oturum açan:{" "}
                <span className="text-emerald-300 font-medium">
                  {user.email}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleCreatePingTemplateFlow}
              disabled={creating}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {creating && creatingType === "ping"
                ? "Ping Flow Oluşturuluyor..."
                : "⚡ Ping Template Flow"}
            </button>

            <button
              onClick={handleCreateHttpCheckTemplateFlow}
              disabled={creating}
              className="rounded bg-orange-600 hover:bg-orange-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {creating && creatingType === "httpCheck"
                ? "HTTP Check Flow Oluşturuluyor..."
                : "🧪 HTTP Check Flow"}
            </button>

            <button
              onClick={handleCreateFlow}
              disabled={creating}
              className="rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {creating && creatingType === "normal"
                ? "Oluşturuluyor..."
                : "+ Yeni Flow"}
            </button>
          </div>
        </header>

        {/* Filtre / Sıralama barı */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Flow adıyla ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Sırala:</span>
            <select
              value={sortKey}
              onChange={(e) =>
                setSortKey(
                  e.target.value as
                    | "created_desc"
                    | "created_asc"
                    | "updated_desc"
                )
              }
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="created_desc">En son oluşturulan</option>
              <option value="created_asc">En eski</option>
              <option value="updated_desc">Son güncellenen</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-500 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Flow listesi yükleniyor...</p>
        ) : filteredSortedFlows.length === 0 ? (
          <div className="border border-dashed border-slate-700 rounded-lg px-4 py-8 text-center">
            <p className="mb-2 text-sm text-slate-300">
              Henüz hiç flow oluşturmadın.
            </p>
            <p className="mb-4 text-xs text-slate-500">
              Yeni bir flow oluşturabilir veya hazır Ping / HTTP Check
              şablonlarını deneyebilirsin.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={handleCreatePingTemplateFlow}
                disabled={creating}
                className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {creating && creatingType === "ping"
                  ? "Ping Flow Oluşturuluyor..."
                  : "⚡ Ping Template Flow"}
              </button>
              <button
                onClick={handleCreateHttpCheckTemplateFlow}
                disabled={creating}
                className="rounded bg-orange-600 hover:bg-orange-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {creating && creatingType === "httpCheck"
                  ? "HTTP Check Flow Oluşturuluyor..."
                  : "🧪 HTTP Check Flow"}
              </button>
              <button
                onClick={handleCreateFlow}
                disabled={creating}
                className="rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {creating && creatingType === "normal"
                  ? "Oluşturuluyor..."
                  : "Yeni Flow Oluştur"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredSortedFlows.map((flow) => {
              const lastRun = lastRuns[flow.id];
              const isDeleting = deletingId === flow.id;
              const isDuplicating = duplicatingId === flow.id;

              return (
                <Link
                  key={flow.id}
                  href={`/flows/${flow.id}`}
                  className="block rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 hover:border-blue-500 hover:bg-slate-900 transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <h2 className="font-semibold">
                        {flow.name || "İsimsiz Flow"}
                      </h2>
                      {flow.description && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {flow.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {renderStatusBadge(lastRun)}
                      <span className="text-[10px] rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">
                        ID: {flow.id.slice(0, 8)}...
                      </span>

                      {/* Kart aksiyonları */}
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isDuplicating && !isDeleting) {
                              handleDuplicateFlow(flow.id);
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-800 text-slate-100 disabled:opacity-60"
                          disabled={isDuplicating || isDeleting}
                        >
                          {isDuplicating ? "Kopyalanıyor..." : "Kopyala"}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isDeleting && !isDuplicating) {
                              handleDeleteFlow(flow.id);
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-red-700/80 hover:bg-red-900/60 text-red-200 disabled:opacity-60"
                          disabled={isDeleting || isDuplicating}
                        >
                          {isDeleting ? "Siliniyor..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span>
                      Oluşturulma:{" "}
                      <span className="text-slate-200">
                        {formatDate(flow.created_at)}
                      </span>
                    </span>

                    {flow.updated_at && (
                      <span>
                        Son güncelleme:{" "}
                        <span className="text-slate-200">
                          {formatDate(flow.updated_at)}
                        </span>
                      </span>
                    )}

                    {lastRun && (
                      <span>
                        Son run:{" "}
                        <span className="text-slate-200">
                          {formatDate(lastRun.created_at)}
                        </span>
                      </span>
                    )}

                    {lastRunsLoading && (
                      <span className="text-[10px] text-slate-500">
                        Son run bilgileri yükleniyor...
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
