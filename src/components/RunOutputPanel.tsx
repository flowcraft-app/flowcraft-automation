"use client";

import { useEffect, useState, useMemo } from "react";

type RunOutputPanelProps = {
  runId: string | null;
};

type RunLog = {
  id?: string;
  run_id?: string;
  node_id?: string;
  status?: string;
  output?: any;
  created_at?: string;
};

type NodeFilter = "all" | "errorsOnly";

export default function RunOutputPanel({ runId }: RunOutputPanelProps) {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [status, setStatus] = useState<string>("idle"); // run status
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [nodeFilter, setNodeFilter] = useState<NodeFilter>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | "all">("all");

  // 🔄 Run değişince logları getir + polling
  useEffect(() => {
    // Run yoksa panel state'ini sıfırla
    if (!runId) {
      setLogs([]);
      setStatus("idle");
      setError(null);
      setLoading(false);
      setExpanded({});
      setNodeFilter("all");
      setSelectedNodeId("all");
      return;
    }

    setLogs([]);
    setStatus("loading");
    setError(null);
    setLoading(true);
    setExpanded({});
    setNodeFilter("all");
    setSelectedNodeId("all");

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchLogs = async () => {
      try {
        if (cancelled) return;

        const res = await fetch(
          `/api/run/logs?run_id=${encodeURIComponent(runId)}`
        );
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          throw new Error(data.error || "Loglar alınamadı");
        }

        setLogs((data.logs as RunLog[]) || []);
        setStatus(data.status || "unknown");

        // Run bittiyse polling durdur
        if (
          data.status === "completed" ||
          data.status === "error" ||
          data.status === "unknown"
        ) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Run logs fetch error:", e);
          setError("Loglar alınırken hata oluştu");
          setStatus("error");
          setLoading(false);
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      }
    };

    // İlk fetch
    void fetchLogs();
    // 2 saniyede bir yenile
    intervalId = setInterval(fetchLogs, 2000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [runId]);

  const statusColorClasses = (() => {
    switch (status) {
      case "completed":
        return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
      case "error":
        return "text-red-300 border-red-500/40 bg-red-500/10";
      case "running":
        return "text-amber-300 border-amber-500/40 bg-amber-500/10";
      case "queued":
      case "loading":
        return "text-sky-300 border-sky-500/40 bg-sky-500/10";
      default:
        return "text-gray-300 border-gray-500/40 bg-gray-800/40";
    }
  })();

  const statusLabel = (() => {
    switch (status) {
      case "completed":
        return "Başarılı";
      case "error":
        return "Hata";
      case "running":
        return "Çalışıyor";
      case "queued":
        return "Beklemede";
      case "loading":
        return "Yükleniyor";
      case "idle":
        return "Seçilmedi";
      default:
        return status || "Bilinmiyor";
    }
  })();

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderSummary = (output: any) => {
    if (!output) return "Çıkış yok.";

    if (typeof output === "string") return output;
    if (output.error) return `Hata: ${output.error}`;
    if (output.message) return output.message;
    if (output.info) return output.info;

    if (typeof output.status === "number") {
      return `HTTP ${output.status} yanıtı alındı.`;
    }

    return "Detayları görmek için JSON'u aç.";
  };

  const formatTime = (value?: string) => {
    if (!value) return null;
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return null;
    }
  };

  // 🔹 Unique node listesi (select için)
  const uniqueNodes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.node_id) set.add(log.node_id);
    });
    return Array.from(set);
  }, [logs]);

  // 🔹 Filtrelenmiş log listesi
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (nodeFilter === "errorsOnly" && log.status !== "error") {
        return false;
      }

      if (selectedNodeId !== "all" && log.node_id !== selectedNodeId) {
        return false;
      }

      return true;
    });
  }, [logs, nodeFilter, selectedNodeId]);

  const visibleCount = filteredLogs.length;
  const totalCount = logs.length;

  return (
    <div className="h-full flex flex-col bg-black/95 text-white text-sm">
      {!runId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Henüz çalıştırılmadı.
        </div>
      ) : (
        <>
          {/* Üst bilgi */}
          <div className="px-3 py-2 flex items-center justify-between gap-4 border-b border-neutral-800">
            <div className="space-y-1">
              <div className="text-[11px] text-gray-400">
                Seçili Çalıştırma
              </div>
              <div className="text-[11px] break-all">
                <span className="font-semibold text-gray-200">Run ID:</span>{" "}
                {runId}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div
                className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusColorClasses}`}
              >
                {statusLabel}
              </div>
              {loading && (
                <div className="text-[10px] text-gray-400 animate-pulse">
                  Loglar güncelleniyor...
                </div>
              )}
            </div>
          </div>

          {/* Hata mesajı */}
          {error && (
            <div className="mx-3 mt-2 mb-1 text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              Hata: {error}
            </div>
          )}

          {/* Filtreler */}
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] border-b border-neutral-800">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Node:</span>
              <select
                value={selectedNodeId}
                onChange={(e) =>
                  setSelectedNodeId(
                    e.target.value === "all" ? "all" : e.target.value
                  )
                }
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-sky-500"
              >
                <option value="all">Tümü</option>
                {uniqueNodes.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-gray-400">Göster:</span>
              <select
                value={nodeFilter}
                onChange={(e) =>
                  setNodeFilter(e.target.value as NodeFilter)
                }
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-sky-500"
              >
                <option value="all">Tümü</option>
                <option value="errorsOnly">Sadece hata logları</option>
              </select>
            </div>

            <div className="ml-auto text-gray-400">
              <span className="text-[10px]">
                Gösterilen log: {visibleCount}/{totalCount}
              </span>
            </div>
          </div>

          {/* Log listesi */}
          <div className="flex-1 overflow-auto px-3 py-2">
            <div className="text-xs font-semibold text-gray-200 mb-1">
              Logs
            </div>

            {filteredLogs.length === 0 && !loading && !error && (
              <p className="mt-2 text-xs text-gray-400">
                Şu anda gösterilecek log yok.
              </p>
            )}

            {filteredLogs.length > 0 && (
              <ul className="mt-2 space-y-2">
                {filteredLogs.map((log, i) => {
                  const key = String(log.id ?? i);
                  const isExpanded = !!expanded[key];
                  const timeLabel = formatTime(log.created_at);

                  const nodeStatusColor =
                    log.status === "success"
                      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/40"
                      : log.status === "error"
                      ? "text-red-300 bg-red-500/10 border-red-500/40"
                      : "text-gray-300 bg-gray-800/60 border-gray-600/40";

                  return (
                    <li
                      key={key}
                      className="p-2.5 rounded-lg bg-neutral-900/70 border border-neutral-700/70"
                    >
                      {/* Başlık satırı */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400">
                            Node
                          </span>
                          <span className="text-[11px] font-mono text-gray-200 break-all">
                            {log.node_id || "Bilinmeyen node"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {timeLabel && (
                            <span className="text-[10px] text-gray-500">
                              {timeLabel}
                            </span>
                          )}
                          {log.status && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] border ${nodeStatusColor}`}
                            >
                              {log.status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Kısa özet */}
                      <div className="text-[11px] text-gray-300 mb-1.5">
                        {renderSummary(log.output)}
                      </div>

                      {/* JSON aç/kapa */}
                      <div className="flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(key)}
                          className="text-[11px] text-sky-300 hover:text-sky-200 underline underline-offset-2"
                        >
                          {isExpanded
                            ? "JSON detayını gizle"
                            : "JSON detayını göster"}
                        </button>
                      </div>

                      {isExpanded && (
                        <pre className="mt-2 text-[11px] bg-black/60 border border-neutral-700 rounded-md p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                          {JSON.stringify(log.output, null, 2)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
