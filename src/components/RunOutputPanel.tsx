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
  output_data?: any; // 🔹 Supabase'te output_data kolonunu da destekle
  created_at?: string;
};

type RunMeta = {
  id: string;
  flow_id?: string | null;
  workspace_id?: string | null;
  status: string;
  trigger_type?: string | null;
  trigger_payload?: any;
  payload?: any;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  final_output?: any;
};

type FlowMeta = {
  id: string;
  name?: string | null;
  description?: string | null;
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

  // 🆕 Run + Flow meta
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [flowMeta, setFlowMeta] = useState<FlowMeta | null>(null);
  const [showFinalOutput, setShowFinalOutput] = useState(false);

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
      setRunMeta(null);
      setFlowMeta(null);
      setShowFinalOutput(false);
      return;
    }

    setLogs([]);
    setStatus("loading");
    setError(null);
    setLoading(true);
    setExpanded({});
    setNodeFilter("all");
    setSelectedNodeId("all");
    setRunMeta(null);
    setFlowMeta(null);
    setShowFinalOutput(false);

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

        // 🔹 Supabase JSON'u: { status, run, flow, logs: [...] }
        const incomingLogs: RunLog[] = (data.logs as RunLog[]) || [];
        const incomingRun: RunMeta | null = data.run ?? null;
        const incomingFlow: FlowMeta | null = data.flow ?? null;

        setLogs(incomingLogs);
        setRunMeta(incomingRun);
        setFlowMeta(incomingFlow);

        const nextStatus =
          data.status ||
          incomingRun?.status ||
          "unknown";

        setStatus(nextStatus);

        // Run bittiyse polling durdur
        if (
          nextStatus === "completed" ||
          nextStatus === "error" ||
          nextStatus === "unknown"
        ) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setLoading(false);
        }
      } catch (e: any) {
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

  // 🔹 Özet üretirken hem output hem output_data'ya bak
  const renderSummary = (log: RunLog) => {
    const output = log.output ?? log.output_data;

    if (!output) return "Çıkış yok.";

    if (typeof output === "string") return output;
    if ((output as any).error) return `Hata: ${(output as any).error}`;
    if ((output as any).message) return (output as any).message;
    if ((output as any).info) return (output as any).info;

    if (typeof (output as any).status === "number") {
      return `HTTP ${(output as any).status} yanıtı alındı.`;
    }

    return "Detayları görmek için JSON'u aç.";
  };

  const formatTime = (value?: string | null) => {
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

  const formatDateTime = (value?: string | null) => {
    if (!value) return null;
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
    } catch {
      return null;
    }
  };

  const formatDuration = (ms?: number | null) => {
    if (ms == null || Number.isNaN(ms)) return null;
    if (ms < 1000) return `${ms} ms`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)} sn`;
    const min = sec / 60;
    return `${min.toFixed(1)} dk`;
  };

  const triggerLabel = (() => {
    const t = runMeta?.trigger_type;
    if (!t) return null;
    switch (t) {
      case "webhook":
        return "Webhook";
      case "schedule":
        return "Zamanlanmış";
      case "manual":
        return "Manuel";
      default:
        return t;
    }
  })();

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

  const createdAtLabel =
    formatDateTime(runMeta?.created_at ?? runMeta?.started_at) || undefined;
  const finishedAtLabel =
    formatDateTime(runMeta?.finished_at ?? null) || undefined;
  const durationLabel = formatDuration(runMeta?.duration_ms ?? null);

  return (
    <div className="h-full flex flex-col bg-black/95 text-white text-sm">
      {!runId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Henüz çalıştırılmadı.
        </div>
      ) : (
        <>
          {/* Üst bilgi + meta */}
          <div className="px-3 py-2 flex items-center justify-between gap-4 border-b border-neutral-800">
            <div className="space-y-1 min-w-0">
              <div className="text-[11px] text-gray-400">
                Seçili Çalıştırma
              </div>

              {/* Flow adı (varsa) */}
              {flowMeta?.name && (
                <div className="text-[11px] font-semibold text-sky-300 truncate">
                  {flowMeta.name}
                </div>
              )}

              <div className="text-[11px] break-all">
                <span className="font-semibold text-gray-200">Run ID:</span>{" "}
                {runId}
              </div>

              {/* Run meta satırı */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400">
                {triggerLabel && (
                  <span>
                    Trigger:{" "}
                    <span className="text-gray-200">{triggerLabel}</span>
                  </span>
                )}
                {createdAtLabel && (
                  <span>
                    Başlangıç:{" "}
                    <span className="text-gray-200">{createdAtLabel}</span>
                  </span>
                )}
                {finishedAtLabel && (
                  <span>
                    Bitiş:{" "}
                    <span className="text-gray-200">{finishedAtLabel}</span>
                  </span>
                )}
                {durationLabel && (
                  <span>
                    Süre:{" "}
                    <span className="text-gray-200">{durationLabel}</span>
                  </span>
                )}
              </div>

              {/* Hata mesajı kısa özet */}
              {runMeta?.error_message && (
                <div className="text-[10px] text-red-300 line-clamp-2">
                  Hata: {runMeta.error_message}
                </div>
              )}
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

          {/* Final output toggle */}
          {runMeta?.final_output !== undefined &&
            runMeta?.final_output !== null && (
              <div className="px-3 py-2 border-b border-neutral-800 bg-black/80 flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-300">
                  Son output (final_output)
                </div>
                <button
                  type="button"
                  onClick={() => setShowFinalOutput((v) => !v)}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-800 text-slate-100"
                >
                  {showFinalOutput
                    ? "Gizle"
                    : "Görüntüle"}
                </button>
              </div>
            )}

          {showFinalOutput &&
            runMeta?.final_output !== undefined &&
            runMeta?.final_output !== null && (
              <div className="px-3 py-2 border-b border-neutral-800 bg-black/70">
                <pre className="text-[11px] bg-black/60 border border-neutral-700 rounded-md p-2 overflow-auto max-h-56 whitespace-pre-wrap">
                  {JSON.stringify(runMeta.final_output, null, 2)}
                </pre>
              </div>
            )}

          {/* Hata mesajı (network / fetch hata) */}
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
                  const outputToShow = log.output ?? log.output_data;

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
                        {renderSummary(log)}
                      </div>

                      {/* JSON aç/kapa */}
                      {outputToShow && (
                        <>
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
                              {JSON.stringify(outputToShow, null, 2)}
                            </pre>
                          )}
                        </>
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
