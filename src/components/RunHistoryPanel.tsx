"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type RunHistoryPanelProps = {
  flowId: string;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
};

type RunItem = {
  id: string;
  status: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  trigger_type?: string;
  trigger_payload?: any;
  // Supabase'ten ekstra kolonlar geliyor olabilir
  [key: string]: any;
};

type StatusFilter = "all" | "completed" | "error" | "running" | "queued";
type DateFilter = "all" | "24h" | "7d" | "30d";

const PAGE_LIMIT = 20;

export default function RunHistoryPanel({
  flowId,
  selectedRunId,
  onSelectRun,
}: RunHistoryPanelProps) {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const [hasMore, setHasMore] = useState(false);

  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
    } catch {
      return iso;
    }
  };

  // 🔹 “3 dk önce”, “2 saat önce”, “5 gün önce” gibi basit relative time
  const formatRelative = (iso?: string) => {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";

    const now = Date.now();
    const diffMs = now - t;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "az önce";
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHour < 24) return `${diffHour} saat önce`;
    return `${diffDay} gün önce`;
  };

  // 🔹 duration_ms → “850 ms / 1.2 sn / 2 dk 5 sn / 1 sa 3 dk”
  const formatDuration = (ms?: number) => {
    if (ms == null) return null;
    if (Number.isNaN(ms) || ms < 0) return null;

    if (ms < 1000) return `${Math.round(ms)} ms`;

    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)} sn`;

    const totalMin = Math.floor(sec / 60);
    const remSec = Math.round(sec - totalMin * 60);

    if (totalMin < 60) {
      if (remSec <= 0) return `${totalMin} dk`;
      return `${totalMin} dk ${remSec} sn`;
    }

    const hours = Math.floor(totalMin / 60);
    const remMin = totalMin - hours * 60;

    if (remMin <= 0) return `${hours} sa`;
    return `${hours} sa ${remMin} dk`;
  };

  const renderStatusBadge = (status: string) => {
    let label = status;
    let classes = "bg-slate-800 text-slate-200 border border-slate-500";

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
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] capitalize ${classes}`}
      >
        {label}
      </span>
    );
  };

  // 🔹 Trigger tipi için küçük rozet (manual / webhook / schedule)
  const renderTriggerBadge = (triggerType?: string) => {
    const t = (triggerType || "manual").toLowerCase();

    let label = "Manuel";
    let icon = "🖐️";
    let classes =
      "bg-slate-900/80 text-slate-200 border border-slate-600/80";

    if (t === "webhook") {
      label = "Webhook";
      icon = "🪝";
      classes =
        "bg-sky-950/80 text-sky-300 border border-sky-600/80";
    } else if (t === "schedule") {
      label = "Schedule";
      icon = "⏰";
      classes =
        "bg-indigo-950/80 text-indigo-300 border border-indigo-600/80";
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] ${classes}`}
      >
        <span className="text-[9px] leading-none">{icon}</span>
        <span className="capitalize">{label}</span>
      </span>
    );
  };

  // 🔹 Status için küçük renkli nokta (satır başında)
  const getStatusDotClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-400";
      case "error":
        return "bg-red-400";
      case "running":
        return "bg-amber-300";
      case "queued":
        return "bg-slate-400";
      default:
        return "bg-slate-500";
    }
  };

  /**
   * Backend'den run geçmişi çek
   * - offset: kaç kayıttan sonra başlasın
   * - append: true → mevcut listeye ekle, false → listeyi sıfırla
   */
  const fetchRuns = useCallback(
    async (opts: { offset: number; append: boolean }) => {
      if (!flowId) return;

      const { offset, append } = opts;

      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const params = new URLSearchParams();
        params.set("flow_id", flowId);
        params.set("limit", String(PAGE_LIMIT));
        params.set("offset", String(offset));

        if (statusFilter !== "all") {
          params.set("status", statusFilter);
        }

        // 🔹 Tarih filtresi → from / to
        if (dateFilter !== "all") {
          const now = new Date();
          const nowMs = now.getTime();
          let thresholdMs = 0;

          switch (dateFilter) {
            case "24h":
              thresholdMs = 24 * 60 * 60 * 1000;
              break;
            case "7d":
              thresholdMs = 7 * 24 * 60 * 60 * 1000;
              break;
            case "30d":
              thresholdMs = 30 * 24 * 60 * 60 * 1000;
              break;
            default:
              thresholdMs = 0;
          }

          if (thresholdMs > 0) {
            const fromDate = new Date(nowMs - thresholdMs);
            params.set("from", fromDate.toISOString());
            params.set("to", now.toISOString());
          }
        }

        const res = await fetch(`/api/run/history?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || "Run geçmişi alınamadı.");
        }

        const newRuns: RunItem[] = json.runs ?? [];
        const newHasMore: boolean = !!json.hasMore;

        setRuns((prev) => (append ? [...prev, ...newRuns] : newRuns));
        setHasMore(newHasMore);
      } catch (err: any) {
        console.error("Run history fetch error:", err);
        setError(err.message ?? "Run geçmişi alınırken hata oluştu.");
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [flowId, statusFilter, dateFilter]
  );

  /**
   * flowId / statusFilter / dateFilter değişince baştan yükle
   */
  useEffect(() => {
    setRuns([]);
    setHasMore(false);

    if (!flowId) return;
    fetchRuns({ offset: 0, append: false });
  }, [flowId, statusFilter, dateFilter, fetchRuns]);

  // 🔎 Arama + status + tarih filtresi (UI tarafında ekstra süzgeç)
  const filteredRuns = useMemo(() => {
    let list = [...runs];

    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((r) => {
        const idPart = r.id.toLowerCase().includes(term);
        const statusPart = (r.status || "").toLowerCase().includes(term);
        const triggerPart = (r.trigger_type || "")
          .toLowerCase()
          .includes(term);
        return idPart || statusPart || triggerPart;
      });
    }

    if (dateFilter !== "all") {
      const now = Date.now();
      let thresholdMs = 0;

      switch (dateFilter) {
        case "24h":
          thresholdMs = 24 * 60 * 60 * 1000;
          break;
        case "7d":
          thresholdMs = 7 * 24 * 60 * 60 * 1000;
          break;
        case "30d":
          thresholdMs = 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          thresholdMs = 0;
      }

      if (thresholdMs > 0) {
        list = list.filter((r) => {
          if (!r.created_at) return false;
          const t = new Date(r.created_at).getTime();
          if (Number.isNaN(t)) return false;
          return now - t <= thresholdMs;
        });
      }
    }

    return list;
  }, [runs, search, statusFilter, dateFilter]);

  const displayedCount = filteredRuns.length;
  const fetchedCount = runs.length;

  return (
    <div className="h-full flex flex-col bg-slate-950/80 border-l border-slate-800">
      {/* Üst bar */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-slate-800 gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-100">
            Run Geçmişi
          </p>
          <p className="text-[10px] text-slate-400">
            En son çalıştırılan flow run&apos;ları
            {displayedCount > 0 && (
              <>
                {" "}
                · Gösterilen: {displayedCount}
                {fetchedCount > 0 && ` / ${fetchedCount}`}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px] text-slate-400">
              Yükleniyor...
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchRuns({ offset: 0, append: false })}
            className="text-[10px] px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-100"
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="px-3 py-2 border-b border-slate-800 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Run ID / status / trigger ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[120px] px-2 py-1 rounded bg-slate-950/70 border border-slate-700 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-2 py-1 rounded bg-slate-950/70 border border-slate-700 text-[11px] text-slate-100 focus:outline-none focus:border-sky-500"
        >
          <option value="all">Hepsi</option>
          <option value="completed">Başarılı</option>
          <option value="error">Hata</option>
          <option value="running">Çalışıyor</option>
          <option value="queued">Beklemede</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="px-2 py-1 rounded bg-slate-950/70 border border-slate-700 text-[11px] text-slate-100 focus:outline-none focus:border-sky-500"
        >
          <option value="all">Tüm tarihler</option>
          <option value="24h">Son 24 saat</option>
          <option value="7d">Son 7 gün</option>
          <option value="30d">Son 30 gün</option>
        </select>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto text-xs">
        {error && (
          <div className="p-3 text-[11px] text-red-400">
            Hata: {error}
          </div>
        )}

        {!error && filteredRuns.length === 0 && !loading && (
          <div className="p-3 text-[11px] text-slate-400">
            Filtrelere uyan run yok. Filtreleri temizlemeyi veya yeni
            bir run oluşturarak &quot;Çalıştır&quot; butonunu
            kullanmayı deneyebilirsin.
          </div>
        )}

        {filteredRuns.length > 0 && (
          <>
            <ul className="divide-y divide-slate-800">
              {filteredRuns.map((run) => {
                const isActive = run.id === selectedRunId;

                const rowBase =
                  "px-3 py-2 flex items-center justify-between gap-2 cursor-pointer border-l-2 transition-colors";
                const rowActive =
                  "bg-slate-800/90 border-sky-400 shadow-inner";
                const rowHover =
                  "hover:bg-slate-900/70 border-transparent";

                const durationLabel =
                  typeof run.duration_ms === "number"
                    ? formatDuration(run.duration_ms)
                    : null;

                return (
                  <li
                    key={run.id}
                    onClick={() => onSelectRun(run.id)}
                    className={`${rowBase} ${
                      isActive ? rowActive : rowHover
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {/* Status renkli nokta */}
                      <div className="pt-[3px]">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${getStatusDotClass(
                            run.status
                          )}`}
                        />
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="font-medium text-[11px] text-slate-100 truncate"
                          title={run.id}
                        >
                          Run #{run.id.slice(0, 8)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(run.created_at)}
                          {run.created_at && (
                            <span className="text-slate-500">
                              {" "}
                              · {formatRelative(run.created_at)}
                            </span>
                          )}
                          {durationLabel && (
                            <span className="text-slate-500">
                              {" "}
                              · Süre: {durationLabel}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        {renderStatusBadge(run.status)}
                        {renderTriggerBadge(run.trigger_type)}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(run.id);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700 text-slate-100"
                      >
                        Logları Göster
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Daha fazla yükle (backend pagination) */}
            {hasMore && (
              <div className="px-3 py-2 flex justify-center border-t border-slate-800 bg-slate-950">
                <button
                  type="button"
                  onClick={() =>
                    fetchRuns({
                      offset: runs.length,
                      append: true,
                    })
                  }
                  disabled={loadingMore}
                  className="text-[11px] px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMore
                    ? "Yükleniyor..."
                    : `Daha fazla yükle (${runs.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
