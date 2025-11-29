"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Flow = {
  id: string;
  name: string | null;
  description?: string | null;
  created_at?: string | null;
};

export default function HomePage() {
  const router = useRouter();

  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----------------------------------------------------
  // FLOW LİSTESİNİ YÜKLE
  // ----------------------------------------------------
  const loadFlows = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/flows");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Flowlar yüklenemedi");
      }

      // API bazen { flows: [...] } bazen { data: [...] } dönebilir, ikisini de destekle
      const list: Flow[] = (json.flows || json.data || []).filter(
        (x: any) => !!x
      );

      setFlows(list);
    } catch (err: any) {
      setError(err.message || "Flowlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlows();
  }, []);

  // ----------------------------------------------------
  // YENİ FLOW OLUŞTUR
  // ----------------------------------------------------
  const handleCreate = async () => {
    try {
      setCreating(true);
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

      // API'nin hangi formatta döndüğünü bilmediğimiz için esnek davran:
      // - { flow: {...} }
      // - { data: {...} }
      // - doğrudan {...}
      const candidate: any = json.flow || json.data || json;

      if (candidate && candidate.id) {
        const newFlow: Flow = {
          id: candidate.id,
          name: candidate.name ?? "Yeni Flow",
          description: candidate.description ?? "",
          created_at: candidate.created_at ?? null,
        };

        // Listeyi güncelle (undefined olanları temizle)
        setFlows((prev) => [newFlow, ...prev.filter((x) => !!x)]);

        // Direkt editöre gir
        router.push(`/flows/${newFlow.id}`);
      } else {
        console.warn("Yeni flow cevabı beklenen formatta değil:", json);
        // Hata fırlatmak yerine sadece listeyi yenileyelim
        await loadFlows();
      }
    } catch (err: any) {
      setError(err.message || "Flow oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  // ----------------------------------------------------
  // TEMPLATE FLOW OLUŞTUR (Ping / HTTP Check)
  // ----------------------------------------------------
  const handleCreateTemplate = async (template: "ping" | "http") => {
    try {
      setCreating(true);
      setError(null);

      // 1) Flow kaydını oluştur
      const name =
        template === "ping" ? "Ping Flow" : "HTTP Check Flow";

      const description =
        template === "ping"
          ? "Basit ping testi için hazır template flow."
          : "Bir endpoint'in HTTP durumunu kontrol eden hazır template flow.";

      const flowRes = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      const flowJson = await flowRes.json();

      if (!flowRes.ok) {
        throw new Error(flowJson.error || "Template flow oluşturulamadı");
      }

      const flowCandidate: any = flowJson.flow || flowJson.data || flowJson;
      const flowId: string | undefined = flowCandidate?.id;

      if (!flowId) {
        throw new Error("Template flow cevabı beklenen formatta değil");
      }

      // 2) Diagram (nodes + edges) oluştur
      const now = Date.now();
      const startId = `start_${now}`;
      const httpId = `http_${now}`;

      // 🔹 Dış URL yerine lokal endpoint'ler
      const url =
        template === "ping"
          ? "http://localhost:3000/api/env"
          : "http://localhost:3000/api/flows";

      const nodes = [
        {
          id: startId,
          position: { x: 0, y: 0 },
          data: {
            type: "start",
            label: "Start",
          },
        },
        {
          id: httpId,
          position: { x: 250, y: 0 },
          data: {
            type: "http_request",
            label: template === "ping" ? "Ping Request" : "HTTP Check",
            url,
            method: "GET",
          },
        },
      ];

      const edges = [
        {
          id: `e_${startId}_${httpId}`,
          source: startId,
          target: httpId,
        },
      ];

      const diagramRes = await fetch(`/api/flows/${flowId}/diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });

      const diagramJson = await diagramRes.json();

      if (!diagramRes.ok) {
        console.warn(
          "Template diagram oluşturulamadı:",
          diagramJson?.error || diagramJson
        );
        // Burada fatal hata yapmayalım, en azından flow kaydı var
      }

      // Listeyi tazele (arkaplanda)
      loadFlows().catch(() => {});

      // Direkt editöre git
      router.push(`/flows/${flowId}`);
    } catch (err: any) {
      setError(err.message || "Template flow oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  // ----------------------------------------------------
  // FLOW SİL
  // ----------------------------------------------------
  const handleDelete = async (id: string) => {
    const ok = window.confirm(
      "Bu flow'u silmek istediğinden emin misin? Bu işlem geri alınamaz."
    );
    if (!ok) return;

    try {
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

      // Listeden çıkar
      setFlows((prev) => prev.filter((f) => f && f.id !== id));
    } catch (err: any) {
      setError(err.message || "Flow silinemedi");
    }
  };

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">FlowCraft</h1>
          <p className="text-xs text-slate-400">
            Otomasyon akışlarını burada oluştur ve yönet.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 px-4 py-2 rounded text-sm font-medium"
        >
          {creating ? "Oluşturuluyor..." : "+ Yeni Flow"}
        </button>
      </header>

      {/* CONTENT */}
      <main className="px-6 py-4 space-y-4">
        {error && (
          <div className="mb-2 text-xs text-red-400">
            Hata: {error}
          </div>
        )}

        {/* 🔹 HAZIR TEMPLATE BUTONLARI – HER ZAMAN GÖRÜNSÜN */}
        <section className="mb-2 flex flex-wrap gap-2">
          <button
            onClick={() => handleCreateTemplate("ping")}
            disabled={creating}
            className="text-xs px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 border border-slate-700"
          >
            ⚡ Ping Flow Oluştur
          </button>
          <button
            onClick={() => handleCreateTemplate("http")}
            disabled={creating}
            className="text-xs px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 border border-slate-700"
          >
            🌐 HTTP Check Flow Oluştur
          </button>
        </section>

        {loading ? (
          <div className="text-sm text-slate-300">
            Flowlar yükleniyor...
          </div>
        ) : flows.length === 0 ? (
          <div className="text-sm text-slate-400">
            Henüz hiç flow yok. Yukarıdan &quot;Yeni Flow&quot; ya da
            aşağıdaki hazır template butonlarından birine basarak ilk
            flow&apos;unu oluştur.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {flows
              .filter((f) => !!f)
              .map((flow) => {
                const name = flow.name ?? "İsimsiz Flow";
                const desc = (flow.description ?? "").trim();

                return (
                  <div
                    key={flow.id}
                    className="border border-slate-800 rounded-lg bg-slate-900/60 p-4 flex flex-col justify-between"
                  >
                    {/* Kartın üstüne tıklayınca düzenlemeye girsin */}
                    <div
                      className="cursor-pointer"
                      onClick={() => router.push(`/flows/${flow.id}`)}
                    >
                      <h2 className="text-sm font-semibold mb-1">
                        {name}
                      </h2>

                      {desc !== "" && (
                        <p className="text-xs text-slate-400">
                          {desc}
                        </p>
                      )}

                      {flow.created_at && (
                        <p className="mt-2 text-[10px] text-slate-500">
                          Oluşturma:{" "}
                          {new Date(flow.created_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        onClick={() => router.push(`/flows/${flow.id}`)}
                        className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Kart tıklamasını tetiklemesin
                          handleDelete(flow.id);
                        }}
                        className="text-xs px-3 py-1 rounded bg-red-700 hover:bg-red-600"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </div>
  );
}
