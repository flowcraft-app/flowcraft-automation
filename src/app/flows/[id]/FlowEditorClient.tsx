"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  useStore,
  Handle,
  Position,
} from "reactflow";
import { useRouter } from "next/navigation";

import RunOutputPanel from "../../../components/RunOutputPanel";
import RunHistoryPanel from "../../../components/RunHistoryPanel";
import "reactflow/dist/style.css";

// V1'de tipleri gevşek tutuyoruz
type NodeData = {
  label?: string;
  type?: string;
  url?: string;
  method?: string;
  mode?: string; // IF / Formatter için
  expected?: number | string; // IF node için beklenen değer
  message?: string; // Log node için
  fieldPath?: string; // Formatter için: okumak istediğin alan (body.xxx)
  targetPath?: string; // Formatter için: sonucu yazacağın alan

  // Wait node için
  seconds?: number; // bekleme süresi (saniye)
  ms?: number; // opsiyonel: milisaniye
  delay?: number; // opsiyonel alias

  // Stop&Error node için
  code?: string;
  reason?: string;

  // Set / Edit Fields node için
  assignments?: {
    path: string; // Örn: "body.title"
    value: string; // Şimdilik string olarak saklıyoruz
  }[];

  // UI için (DB'ye kaydedilmeyecek fonksiyonlar)
  onChangeData?: (patch: Partial<NodeData>) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onOpenSettings?: () => void;
};

type NodeSettingsPanelProps = {
  nodeId: string;
  data: NodeData;
  onChangeData: (patch: Partial<NodeData>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

type Toast = {
  id: number;
  message: string;
  variant?: "default" | "success" | "error";
};

// 🔹 Sağda duran global ayar paneli (sidebar)
function NodeSettingsPanel({
  nodeId,
  data,
  onChangeData,
  onDuplicate,
  onDelete,
  onClose,
}: NodeSettingsPanelProps) {
  const label = data.label ?? nodeId;

  return (
    <div className="h-full w-full max-h-full overflow-y-auto bg-slate-900 text-slate-100 p-4 space-y-4">
      {/* Başlık barı */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-slate-50">
            Node Ayarları
          </p>
          <p className="text-[11px] text-slate-300">{label}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="
            text-xs px-2 py-1 rounded
            border border-slate-600
            bg-slate-800 hover:bg-slate-700
            text-slate-50
          "
        >
          Kapat
        </button>
      </div>

      {/* Label */}
      <div>
        <p className="font-semibold text-xs mb-1 text-slate-50">Label</p>
        <input
          type="text"
          value={data.label ?? ""}
          onChange={(e) => onChangeData({ label: e.target.value })}
          className="
            w-full bg-slate-950 border border-slate-700
            rounded px-2 py-1 text-sm
            text-slate-100 placeholder:text-slate-500
            focus:outline-none focus:border-sky-500
          "
        />
      </div>

      {/* HTTP */}
      {data.type === "http_request" && (
        <>
          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">URL</p>
            <input
              type="text"
              value={data.url ?? ""}
              onChange={(e) => onChangeData({ url: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100 placeholder:text-slate-500
                focus:outline-none focus:border-sky-500
              "
            />
          </div>

          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Method
            </p>
            <select
              value={data.method ?? "GET"}
              onChange={(e) => onChangeData({ method: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100
                focus:outline-none focus:border-sky-500
              "
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
        </>
      )}

      {/* IF */}
      {data.type === "if" && (
        <>
          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Koşul tipi
            </p>
            <select
              value={data.mode ?? "status_eq"}
              onChange={(e) => onChangeData({ mode: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100
                focus:outline-none focus:border-sky-500
              "
            >
              <option value="status_eq">Son status == 200?</option>
              <option value="ok_true">Son ok == true?</option>
            </select>
          </div>

          {(data.mode ?? "status_eq") === "status_eq" && (
            <div>
              <p className="font-semibold text-xs mb-1 text-slate-50">
                Beklenen status
              </p>
              <input
                type="number"
                value={data.expected ?? 200}
                onChange={(e) =>
                  onChangeData({
                    expected: Number(e.target.value) || 0,
                  })
                }
                className="
                  w-full bg-slate-950 border border-slate-700
                  rounded px-2 py-1 text-sm
                  text-slate-100
                  focus:outline-none focus:border-sky-500
                "
              />
            </div>
          )}
        </>
      )}

      {/* Formatter */}
      {data.type === "formatter" && (
        <>
          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Formatlama modu
            </p>
            <select
              value={data.mode ?? "pick_field"}
              onChange={(e) => onChangeData({ mode: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100
                focus:outline-none focus:border-sky-500
              "
            >
              <option value="pick_field">
                Sadece alanı al (pick_field)
              </option>
              <option value="to_upper">Büyük harf (to_upper)</option>
              <option value="to_lower">Küçük harf (to_lower)</option>
              <option value="trim">Trim (trim)</option>
            </select>
          </div>

          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Kaynak alan (fieldPath)
            </p>
            <input
              type="text"
              value={data.fieldPath ?? "body"}
              onChange={(e) => onChangeData({ fieldPath: e.target.value })}
              placeholder="Örn: body.flows.0.name"
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100 placeholder:text-slate-500
                focus:outline-none focus:border-sky-500
              "
            />
          </div>

          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Hedef alan (targetPath)
            </p>
            <input
              type="text"
              value={data.targetPath ?? data.fieldPath ?? "body"}
              onChange={(e) => onChangeData({ targetPath: e.target.value })}
              placeholder="Örn: body.formattedName"
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100 placeholder:text-slate-500
                focus:outline-none focus:border-sky-500
              "
            />
          </div>
        </>
      )}

      {/* Set Fields */}
      {data.type === "set_fields" && (
        <div>
          <p className="font-semibold text-xs mb-1 text-slate-50">
            Atamalar (path → value)
          </p>
          <p className="text-[11px] text-slate-300 mb-2">
            Solda JSON path (ör. &quot;body.title&quot;), sağda atanacak
            string değeri yaz.
          </p>

          {(data.assignments ?? []).map((item, idx) => (
            <div key={idx} className="flex items-center gap-1 mb-1">
              <input
                type="text"
                value={item.path}
                onChange={(e) => {
                  const next = [...(data.assignments ?? [])];
                  next[idx] = { ...next[idx], path: e.target.value };
                  onChangeData({ assignments: next });
                }}
                placeholder="Örn: body.title"
                className="
                  flex-1 bg-slate-950 border border-slate-700
                  rounded px-2 py-1 text-sm
                  text-slate-100 placeholder:text-slate-500
                  focus:outline-none focus:border-sky-500
                "
              />
              <input
                type="text"
                value={item.value}
                onChange={(e) => {
                  const next = [...(data.assignments ?? [])];
                  next[idx] = { ...next[idx], value: e.target.value };
                  onChangeData({ assignments: next });
                }}
                placeholder='Örn: "Merhaba"'
                className="
                  flex-1 bg-slate-950 border border-slate-700
                  rounded px-2 py-1 text-sm
                  text-slate-100 placeholder:text-slate-500
                  focus:outline-none focus:border-sky-500
                "
              />
              <button
                type="button"
                onClick={() => {
                  const next = [...(data.assignments ?? [])];
                  next.splice(idx, 1);
                  onChangeData({ assignments: next });
                }}
                className="
                  text-xs px-2 py-1 rounded
                  bg-red-700 hover:bg-red-600
                  text-white
                "
              >
                Sil
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              const next = [...(data.assignments ?? [])];
              next.push({ path: "body.example", value: "değer" });
              onChangeData({ assignments: next });
            }}
            className="
              mt-1 text-xs px-2 py-1 rounded
              bg-slate-800 hover:bg-slate-700
              text-slate-50
            "
          >
            + Yeni satır ekle
          </button>
        </div>
      )}

      {/* Log */}
      {data.type === "log" && (
        <div>
          <p className="font-semibold text-xs mb-1 text-slate-50">
            Log Mesajı
          </p>
          <textarea
            rows={3}
            value={data.message ?? ""}
            onChange={(e) => onChangeData({ message: e.target.value })}
            placeholder="Bu node çalıştığında loglamak istediğin mesaj"
            className="
              w-full bg-slate-950 border border-slate-700
              rounded px-2 py-1 text-sm
              text-slate-100 placeholder:text-slate-500
              resize-none
              focus:outline-none focus:border-sky-500
            "
          />
        </div>
      )}

      {/* Execution Data */}
      {data.type === "execution_data" && (
        <div>
          <p className="font-semibold text-xs mb-1 text-slate-50">
            Execution Data
          </p>
          <p className="text-[11px] text-slate-300">
            Bu node çalıştığında runId, flowId ve son lastOutput
            snapshot&apos;ını loglarda gösterir. Ek bir ayar gerekmez.
          </p>
        </div>
      )}

      {/* Wait */}
      {data.type === "wait" && (
        <div>
          <p className="font-semibold text-xs mb-1 text-slate-50">
            Bekleme süresi (saniye)
          </p>
          <input
            type="number"
            min={0}
            value={typeof data.seconds === "number" ? data.seconds : 1}
            onChange={(e) =>
              onChangeData({
                seconds: Number(e.target.value) || 0,
              })
            }
            className="
              w-full bg-slate-950 border border-slate-700
              rounded px-2 py-1 text-sm
              text-slate-100
              focus:outline-none focus:border-sky-500
            "
          />
          <p className="mt-1 text-[11px] text-slate-300">
            Executor bu değeri milisaniyeye çevirip bekletecek. Örn: 3 ⇒ 3
            saniye.
          </p>
        </div>
      )}

      {/* Stop & Error */}
      {(data.type === "stop_error" || data.type === "stop") && (
        <>
          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Hata kodu
            </p>
            <input
              type="text"
              value={data.code ?? "ERR_MANUAL_STOP"}
              onChange={(e) => onChangeData({ code: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100
                focus:outline-none focus:border-sky-500
              "
            />
          </div>

          <div>
            <p className="font-semibold text-xs mb-1 text-slate-50">
              Sebep / Açıklama
            </p>
            <textarea
              rows={3}
              value={data.reason ?? "Bu noktada akış hata ile durduruldu."}
              onChange={(e) => onChangeData({ reason: e.target.value })}
              className="
                w-full bg-slate-950 border border-slate-700
                rounded px-2 py-1 text-sm
                text-slate-100
                resize-none
                focus:outline-none focus:border-sky-500
              "
            />
            <p className="mt-1 text-[11px] text-slate-300">
              Bu metin loglarda ve run durumunda hata sebebi olarak
              saklanacak.
            </p>
          </div>
        </>
      )}

      {/* Alt butonlar */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        className="
          mt-1 w-full rounded
          bg-slate-800 hover:bg-slate-700
          px-2 py-1 text-xs
          text-slate-50
        "
      >
        Bu node&apos;u kopyala
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="
          mt-1 w-full rounded
          bg-red-700 hover:bg-red-600
          px-2 py-1 text-xs
          text-white
        "
      >
        Bu node&apos;u sil
      </button>
    </div>
  );
}

// 🔹 Custom görsel node component (n8n’e yakın, beyaz kart)
const FlowNode = ({ data, selected }: any) => {
  const nodeData: NodeData = data || {};
  const kind = nodeData?.type ?? "generic";

  let leftBar = "bg-slate-500";
  let icon = "⚙️";
  let subtitle = "Node";

  switch (kind) {
    case "start":
      leftBar = "bg-emerald-500";
      icon = "▶";
      subtitle = "Start";
      break;
    case "http_request":
      leftBar = "bg-sky-500";
      icon = "🌐";
      subtitle = nodeData.method ?? "HTTP";
      break;
    case "if":
      leftBar = "bg-orange-500";
      icon = "⚖️";
      subtitle = "IF";
      break;
    case "formatter":
      leftBar = "bg-teal-500";
      icon = "🧩";
      subtitle = "Formatter";
      break;
    case "set_fields":
      leftBar = "bg-lime-500";
      icon = "✏️";
      subtitle = "Set Fields";
      break;
    case "log":
      leftBar = "bg-violet-500";
      icon = "📜";
      subtitle = "Log";
      break;
    case "execution_data":
      leftBar = "bg-cyan-500";
      icon = "🔍";
      subtitle = "Execution";
      break;
    case "wait":
      leftBar = "bg-indigo-500";
      icon = "⏱";
      subtitle = "Wait";
      break;
    case "stop_error":
    case "stop":
      leftBar = "bg-red-500";
      icon = "⛔";
      subtitle = "Stop & Error";
      break;
    default:
      leftBar = "bg-slate-500";
      icon = "⚙️";
      subtitle = kind;
  }

  const title = nodeData.label || "Node";
  const onOpenSettings =
    (nodeData.onOpenSettings as (() => void) | undefined) ?? (() => {});

  let settingsTooltip = "Node ayarlarını aç";
  if (kind === "http_request") {
    settingsTooltip = "HTTP node ayarlarını aç";
  } else if (kind === "if") {
    settingsTooltip = "IF node koşullarını düzenle";
  } else if (kind === "formatter") {
    settingsTooltip = "Formatter node alanlarını düzenle";
  } else if (kind === "set_fields") {
    settingsTooltip = "Set / Edit Fields node'unu düzenle";
  } else if (kind === "log") {
    settingsTooltip = "Log node mesajını düzenle";
  } else if (kind === "execution_data") {
    settingsTooltip = "Execution Data node detaylarını gör";
  } else if (kind === "wait") {
    settingsTooltip = "Wait node bekleme süresini ayarla";
  } else if (kind === "stop_error" || kind === "stop") {
    settingsTooltip = "Stop & Error node hata kodu ve sebebini ayarla";
  }

  const baseCardClasses = `
    relative min-w-[220px] max-w-[260px]
    rounded-lg border
    bg-white text-slate-900
    shadow-[0_4px_10px_rgba(15,23,42,0.12)]
    overflow-visible
  `;

  const selectedClasses = selected
    ? "border-sky-400 ring-2 ring-sky-300"
    : "border-slate-300";

  return (
    <div className={`${baseCardClasses} ${selectedClasses}`}>
      {/* Solda tam yükseklik renk barı */}
      <div className={`absolute left-0 top-0 h-full w-[6px] ${leftBar}`} />

      {/* Handle'lar: tamamen beyaz */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={true}
        className="!bg-white !w-3 !h-3 !border-2 !border-white rounded-full"
        style={{ top: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="!bg-white !w-3 !h-3 !border-2 !border-white rounded-full"
        style={{ top: "50%" }}
      />

      {/* İç gövde */}
      <div className="px-3 py-2 pl-4">
        <div className="flex items-center gap-2">
          {/* Node iconu */}
          <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-xs shrink-0">
            {icon}
          </div>

          {/* Başlık + alt başlık */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {title}
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              {subtitle}
            </span>
          </div>

          {/* Ayar butonu: en sağda */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()} // drag'i engelle
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            title={settingsTooltip}
            className="
              w-6 h-6 rounded-full
              bg-white text-slate-900
              border border-slate-400
              flex items-center justify-center
              text-[11px] shadow
              shrink-0
            "
          >
            ⚙
          </button>
        </div>
      </div>
    </div>
  );
};

// 🔹 React Flow nodeTypes map (default node'u override ediyoruz)
const nodeTypes = {
  default: FlowNode,
};

// 🔹 Zoom seviyesi + Reset butonu
function ZoomPanel() {
  const zoom = useStore((s: any) => s.transform[2]);
  const { fitView, setViewport } = useReactFlow();

  const handleReset = () => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
    fitView({ padding: 0.2, duration: 300 });
  };

  const zoomPercent = Math.round((zoom || 1) * 100);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/90 text-[10px] px-1.5 py-1 rounded border border-slate-600 shadow pointer-events-auto">
      <span className="text-gray-200">{zoomPercent}%</span>
      <button
        onClick={handleReset}
        title="Zoom'u sıfırla"
        className="w-5 h-5 flex items-center justify-center rounded border border-slate-500 hover:bg-slate-800 transition text-xs"
      >
        ↺
      </button>
    </div>
  );
}

// 🔹 Autosave indicator
function AutoSaveIndicator({ autoSaving }: { autoSaving: boolean }) {
  if (!autoSaving) return null;

  return (
    <div className="absolute top-2 right-2 bg-emerald-900/80 text-emerald-300 text-[10px] px-2 py-1 rounded border border-emerald-500 shadow pointer-events-none">
      Otomatik kaydediliyor...
    </div>
  );
}

export default function FlowEditorClient({ flowId }: { flowId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<any>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeSettingsNodeId, setActiveSettingsNodeId] =
    useState<string | null>(null);

  const [flowName, setFlowName] = useState<string>("");
  const [flowDescription, setFlowDescription] = useState<string>("");

  const [runId, setRunId] = useState<string | null>(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState<any>(null);

  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSaved, setMetaSaved] = useState(false);

  // Toast'lar
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Alt panel tab: "history" | "logs"
  const [bottomTab, setBottomTab] = useState<"history" | "logs">("logs");
  // Alt panel açık mı?
  const [bottomPanelOpen, setBottomPanelOpen] = useState<boolean>(false);

  // Run status simgesi: idle | running | success | error
  const [lastRunStatus, setLastRunStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");

  // Sol panel (Flow info + Node araçları) açık mı?
  const [showToolPanel, setShowToolPanel] = useState<boolean>(false);

  // Aktif ayar paneli için node
  const activeNode = useMemo(
    () => nodes.find((n: any) => n.id === activeSettingsNodeId),
    [nodes, activeSettingsNodeId]
  );
  const activeNodeData = (activeNode?.data || null) as NodeData | null;

  // Toast helper
  const showToast = useCallback(
    (message: string, variant: "default" | "success" | "error" = "default") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    },
    []
  );

  // ----------------- FLOW + DIAGRAM LOAD -----------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const flowRes = await fetch(`/api/flows/${flowId}`);
        const flowJson = await flowRes.json();

        setFlowName(flowJson.flow?.name ?? "");
        setFlowDescription(flowJson.flow?.description ?? "");

        const diaRes = await fetch(`/api/flows/${flowId}/diagram`);
        const diaJson = await diaRes.json();

        const initialNodes = diaJson.nodes ?? [];
        const initialEdges = diaJson.edges ?? [];

        setNodes(initialNodes);
        setEdges(initialEdges);

        // Boş flow'ta panel kapalı başla; node varsa açık gelsin
        setShowToolPanel(initialNodes.length > 0);

        console.log("DIAGRAM NODES RAW:", initialNodes);
        console.log("DIAGRAM EDGES RAW:", initialEdges);
      } catch (err: any) {
        setError(err.message ?? "Flow yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, setNodes, setEdges]);

  // ----------------- Bottom panel state persistence -----------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("flowcraft:bottomPanel");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          open?: boolean;
          tab?: "history" | "logs";
        };
        if (typeof parsed.open === "boolean") {
          setBottomPanelOpen(parsed.open);
        }
        if (parsed.tab === "history" || parsed.tab === "logs") {
          setBottomTab(parsed.tab);
        }
      }
    } catch (e) {
      console.warn("bottomPanel localStorage read error:", e);
    }
  }, []);

  useEffect(() => {
    try {
      const payload = JSON.stringify({
        open: bottomPanelOpen,
        tab: bottomTab,
      });
      window.localStorage.setItem("flowcraft:bottomPanel", payload);
    } catch (e) {
      console.warn("bottomPanel localStorage write error:", e);
    }
  }, [bottomPanelOpen, bottomTab]);

  // ----------------- AUTO SAVE (diagram) -----------------
  const handleAutoSave = useCallback(async () => {
    try {
      setAutoSaving(true);

      await fetch(`/api/flows/${flowId}/diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
    } catch (err) {
      console.error("Auto-save hata:", err);
    } finally {
      setAutoSaving(false);
    }
  }, [flowId, nodes, edges]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    const timer = setTimeout(() => {
      handleAutoSave();
    }, 1000);

    setAutoSaveTimer(timer);
  }, [autoSaveTimer, handleAutoSave]);

  // ----------------- FLOW META SAVE -----------------
  const saveFlowMeta = useCallback(async () => {
    try {
      setMetaSaving(true);
      setMetaError(null);

      const res = await fetch(`/api/flows/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: flowName,
          description: flowDescription,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Flow bilgisi güncellenemedi");
      }

      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    } catch (err: any) {
      console.error("Flow meta save error:", err);
      setMetaError(err.message ?? "Flow bilgisi güncellenemedi");
      showToast("Flow bilgisi güncellenemedi", "error");
    } finally {
      setMetaSaving(false);
    }
  }, [flowId, flowName, flowDescription, showToast]);

  const handleFlowNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const handleFlowDescriptionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      (e.currentTarget as HTMLTextAreaElement).blur();
    }
  };

  // ----------------- DIAGRAM HANDLERS -----------------
  const onNodesChange = useCallback(
    (changes: any) => {
      onNodesChangeBase(changes);
      triggerAutoSave();
    },
    [onNodesChangeBase, triggerAutoSave]
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChangeBase(changes);
      triggerAutoSave();
    },
    [onEdgesChangeBase, triggerAutoSave]
  );

  const onConnect = useCallback(
    (params: any) => {
      setEdges((eds: any) => addEdge({ ...params, animated: true }, eds));
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  // Node tıklama → sadece seçimi güncelle (klavye Delete vs. için)
  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  // Boş alana tıklayınca sadece node seçimini kapat
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // ----------------- NODE DATA HELPERS -----------------
  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<NodeData>) => {
      setNodes((nds: any[]) =>
        nds.map((node: any) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node.data || {}),
                  ...patch,
                },
              }
            : node
        )
      );

      triggerAutoSave();
    },
    [setNodes, triggerAutoSave]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      let newId: string | null = null;

      setNodes((nds: any[]) => {
        const original = nds.find((n: any) => n.id === nodeId);
        if (!original) return nds;

        newId = `${original.id}_copy_${Date.now()}`;

        const newNode = {
          ...original,
          id: newId,
          position: {
            x: (original.position?.x ?? 0) + 50,
            y: (original.position?.y ?? 0) + 50,
          },
          data: {
            ...(original.data || {}),
            label: (original.data?.label || "Node") + " (kopya)",
          },
        };

        return [...nds, newNode];
      });

      if (newId) {
        setSelectedNodeId(newId);
      }

      triggerAutoSave();
    },
    [setNodes, triggerAutoSave]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds: any[]) => nds.filter((node: any) => node.id !== nodeId));

      setEdges((eds: any[]) =>
        eds.filter(
          (edge: any) => edge.source !== nodeId && edge.target !== nodeId
        )
      );

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }

      if (activeSettingsNodeId === nodeId) {
        setActiveSettingsNodeId(null);
      }

      triggerAutoSave();
    },
    [setNodes, setEdges, triggerAutoSave, selectedNodeId, activeSettingsNodeId]
  );

  const openSettingsForNode = useCallback((nodeId: string) => {
    setActiveSettingsNodeId(nodeId);
  }, []);

  // ReactFlow'a verilecek node'ları UI fonksiyonları ile zenginleştir
  const enrichedNodes = useMemo(
    () =>
      nodes.map((node: any) => ({
        ...node,
        data: {
          ...(node.data || {}),
          onChangeData: (patch: Partial<NodeData>) =>
            updateNodeData(node.id, patch),
          onDuplicate: () => duplicateNode(node.id),
          onDelete: () => deleteNode(node.id),
          onOpenSettings: () => openSettingsForNode(node.id),
        },
      })),
    [nodes, updateNodeData, duplicateNode, deleteNode, openSettingsForNode]
  );

  // ----------------- NODE ADDERS -----------------
  const addStartNode = () => {
    const newNode = {
      id: `start_${Date.now()}`,
      type: "default",
      position: { x: 100, y: 100 },
      data: { label: "Start", type: "start" },
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addHttpNode = () => {
    const newNode = {
      id: `http_${Date.now()}`,
      type: "default",
      position: { x: 350, y: 100 },
      data: {
        label: "HTTP Request",
        type: "http_request",
        url: "/api/env", // 🔁 BURASI GÜNCEL
        method: "GET",
      },
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addIfNode = () => {
    const newNode = {
      id: `if_${Date.now()}`,
      type: "default",
      position: { x: 600, y: 100 },
      data: {
        label: "IF status == 200",
        type: "if",
        mode: "status_eq",
        expected: 200,
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addFormatterNode = () => {
    const newNode = {
      id: `formatter_${Date.now()}`,
      type: "default",
      position: { x: 600, y: 200 },
      data: {
        label: "Formatter",
        type: "formatter",
        mode: "pick_field",
        fieldPath: "body",
        targetPath: "body",
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addSetNode = () => {
    const newNode = {
      id: `set_${Date.now()}`,
      type: "default",
      position: { x: 650, y: 250 },
      data: {
        label: "Set Fields",
        type: "set_fields",
        assignments: [{ path: "body.example", value: "örnek değer" }],
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addLogNode = () => {
    const newNode = {
      id: `log_${Date.now()}`,
      type: "default",
      position: { x: 850, y: 100 },
      data: {
        label: "Log",
        type: "log",
        message: "Buraya log mesajını yaz...",
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addExecutionDataNode = () => {
    const newNode = {
      id: `exec_${Date.now()}`,
      type: "default",
      position: { x: 900, y: 50 },
      data: {
        label: "Execution Data",
        type: "execution_data",
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addWaitNode = () => {
    const newNode = {
      id: `wait_${Date.now()}`,
      type: "default",
      position: { x: 725, y: 100 },
      data: {
        label: "Wait 1s",
        type: "wait",
        seconds: 1,
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const addStopNode = () => {
    const newNode = {
      id: `stop_${Date.now()}`,
      type: "default",
      position: { x: 950, y: 100 },
      data: {
        label: "Stop & Error",
        type: "stop_error",
        code: "ERR_MANUAL_STOP",
        reason: "Bu noktada akış hata ile durduruldu.",
      } as NodeData,
    };

    setNodes((nds: any[]) => [...nds, newNode]);
    triggerAutoSave();
  };

  const createPingTemplate = () => {
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
        url: "/api/env", // 🔁 BURASI DA GÜNCEL
        method: "GET",
      },
    };

    const edge = {
      id: `e_${startId}_${httpId}`,
      source: startId,
      target: httpId,
      animated: true,
    };

    setSelectedNodeId(null);
    setNodes([startNode, httpNode]);
    setEdges([edge]);

    triggerAutoSave();
  };

  // 🔹 JSONPlaceholder örnek flow template’i
  const createJsonPlaceholderTemplate = () => {
    const base = Date.now();

    const startId = `start_${base}`;
    const httpId = `http_${base + 1}`;
    const formatterId = `formatter_${base + 2}`;
    const ifId = `if_${base + 3}`;
    const logId = `log_${base + 4}`;
    const stopId = `stop_${base + 5}`;

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
        label: "JSONPlaceholder GET",
        type: "http_request",
        url: "https://jsonplaceholder.typicode.com/posts/1",
        method: "GET",
      } as NodeData,
    };

    const formatterNode = {
      id: formatterId,
      type: "default",
      position: { x: 600, y: 150 },
      data: {
        label: "Title → UPPER",
        type: "formatter",
        mode: "to_upper",
        fieldPath: "body.title",
        targetPath: "body.title_upper",
      } as NodeData,
    };

    const ifNode = {
      id: ifId,
      type: "default",
      position: { x: 850, y: 150 },
      data: {
        label: "IF status == 200",
        type: "if",
        mode: "status_eq",
        expected: 200,
      } as NodeData,
    };

    const logNode = {
      id: logId,
      type: "default",
      position: { x: 1100, y: 150 },
      data: {
        label: "JSONPlaceholder Log",
        type: "log",
        message: "JSONPlaceholder sonucu",
      } as NodeData,
    };

    const stopNode = {
      id: stopId,
      type: "default",
      position: { x: 1350, y: 150 },
      data: {
        label: "Stop & Error",
        type: "stop_error",
        code: "ERR_MANUAL_STOP",
        reason: "JSONPlaceholder örnek akış burada bitti.",
      } as NodeData,
    };

    const edges = [
      {
        id: `e_${startId}_${httpId}`,
        source: startId,
        target: httpId,
        animated: true,
      },
      {
        id: `e_${httpId}_${formatterId}`,
        source: httpId,
        target: formatterId,
        animated: true,
      },
      {
        id: `e_${formatterId}_${ifId}`,
        source: formatterId,
        target: ifId,
        animated: true,
      },
      {
        id: `e_${ifId}_${logId}`,
        source: ifId,
        target: logId,
        animated: true,
      },
      {
        id: `e_${logId}_${stopId}`,
        source: logId,
        target: stopId,
        animated: true,
      },
    ];

    setSelectedNodeId(null);
    setNodes([
      startNode,
      httpNode,
      formatterNode,
      ifNode,
      logNode,
      stopNode,
    ]);
    setEdges(edges);

    triggerAutoSave();
  };

  // ----------------- MANUAL SAVE -----------------
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);

      const res = await fetch(`/api/flows/${flowId}/diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Kaydederken hata oluştu");
      }

      showToast("Diagram kaydedildi ✅", "success");
    } catch (err: any) {
      setError(err.message ?? "Kaydederken hata oluştu");
      showToast("Diagram kaydedilirken hata oluştu", "error");
    } finally {
      setSaving(false);
    }
  }, [flowId, nodes, edges, showToast]);

  // ----------------- RUN FLOW -----------------
  const handleRun = useCallback(async () => {
    // 1) Start node var mı?
    const startNodes = nodes.filter(
      (node: any) => node?.data?.type === "start"
    );

    if (startNodes.length === 0) {
      const msg =
        "Bu flow'da Start node yok. Lütfen önce bir Start node ekleyin.";
      setError(msg);
      setLastRunStatus("error");
      showToast(msg, "error");
      return;
    }

    // 2) Herhangi bir Start node'dan çıkan bağlantı var mı?
    const hasConnectedStart = startNodes.some((startNode: any) =>
      edges.some((edge: any) => edge.source === startNode.id)
    );

    if (!hasConnectedStart) {
      const msg =
        "Start node ekli ama hiçbir node'a bağlı değil. Lütfen Start node'u en az bir node'a bağlayın.";
      setError(msg);
      setLastRunStatus("error");
      showToast(msg, "error");
      return;
    }

    try {
      setRunning(true);
      setError(null);
      setLastRunStatus("running");
      showToast("Run başlatıldı 🚀");

      const res = await fetch(`/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow_id: flowId }),
      });

      const json = await res.json();
      console.log("RUN DEBUG:", json);

      if (!res.ok) {
        throw new Error(json.error || "Run API error");
      }

      const newRunId: string | undefined =
        json.run?.id || json.id || json.run_id;

      if (!newRunId) {
        throw new Error("run_id cevaptan alınamadı");
      }

      setRunId(newRunId);
      // Run sonrası otomatik Loglar + panel açık
      setBottomTab("logs");
      setBottomPanelOpen(true);

      const execRes = await fetch(`/api/run/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: newRunId }),
      });

      const execJson = await execRes.json();
      console.log("EXECUTE DEBUG:", execJson);

      if (!execRes.ok) {
        throw new Error(execJson.error || "Execute API error");
      }

      const status =
        execJson.status || execJson.run?.status || execJson.result?.status;

      if (status === "error") {
        setLastRunStatus("error");
        showToast("Run hata ile tamamlandı ❌", "error");
      } else {
        setLastRunStatus("success");
        showToast("Run başarıyla tamamlandı ✅", "success");
      }
    } catch (err: any) {
      setLastRunStatus("error");
      const msg = err.message ?? "Çalıştırırken hata oluştu";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setRunning(false);
    }
  }, [flowId, nodes, edges, showToast]);

  // ----------------- KLAVYE KISAYOLLARI -----------------
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+S veya Cmd+S → Kaydet
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void handleSave();
        return;
      }

      // Ctrl+Enter veya Cmd+Enter → Run
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "Enter" || event.key === "NumpadEnter")
      ) {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName;

        // input/textarea/contenteditable içindeyken çalışmasın
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target?.getAttribute("contenteditable") === "true"
        ) {
          return;
        }

        event.preventDefault();
        void handleRun();
        return;
      }

      // Delete → seçili node'u sil (input/textarea odaktayken karışmasın)
      if (event.key === "Delete") {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName;

        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target?.getAttribute("contenteditable") === "true"
        ) {
          return;
        }

        if (!selectedNodeId) return;

        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave, deleteNode, selectedNodeId, handleRun]);

  // ----------------- RENDER -----------------
  if (loading) {
    return (
      <div className="flex h-screen justify-center items-center text-gray-300 bg-slate-950">
        Yükleniyor...
      </div>
    );
  }

  const flowTitle = flowName || "İsimsiz Flow";

  // Run status pill için label + renkler
  let runStatusLabel = "Hazır";
  let runStatusDotClass = "bg-slate-300";
  let runStatusBorderClass = "border-slate-500 text-slate-100";
  let runStatusBgClass = "bg-slate-800/90";

  if (lastRunStatus === "running") {
    runStatusLabel = "Çalışıyor...";
    runStatusDotClass = "bg-white";
    runStatusBorderClass = "border-sky-200 text-white";
    runStatusBgClass = "bg-sky-600";
  } else if (lastRunStatus === "success") {
    runStatusLabel = "Son run: OK";
    runStatusDotClass = "bg-emerald-900";
    runStatusBorderClass = "border-emerald-200 text-emerald-950";
    runStatusBgClass = "bg-emerald-500";
  } else if (lastRunStatus === "error") {
    runStatusLabel = "Son run: HATA";
    runStatusDotClass = "bg-white";
    runStatusBorderClass = "border-red-200 text-white";
    runStatusBgClass = "bg-red-600";
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* ÜST BAR */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1"
          >
            <span>←</span>
            <span>Flows</span>
          </button>

          <div className="h-5 w-px bg-slate-700" />

          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              FlowCraft
            </span>
            <span className="text-xs font-semibold">{flowTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {metaSaving && (
            <span className="text-[10px] text-emerald-300">
              Flow bilgileri kaydediliyor...
            </span>
          )}
          {metaError && (
            <span className="text-[10px] text-red-400">{metaError}</span>
          )}
          {metaSaved && !metaSaving && !metaError && (
            <span className="text-[10px] text-emerald-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Kaydedildi
            </span>
          )}

          {/* Son run durum pill'i → Kaydet / Run butonlarının yanında */}
          <span
            className={`
              inline-flex items-center gap-2 rounded-full border px-3 py-[3px]
              text-[11px] shadow-lg ${runStatusBgClass} ${runStatusBorderClass}
            `}
          >
            <span
              className={`
                w-2.5 h-2.5 rounded-full ${runStatusDotClass}
                ${lastRunStatus === "running" ? "animate-pulse" : ""}
              `}
            />
            {runStatusLabel}
          </span>

          {/* 🔹 Kaydet butonu: text solda, spinner SAĞDA */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded border border-sky-500/60 bg-sky-600/90 hover:bg-sky-500 px-3 py-1 text-[11px] disabled:opacity-60 flex items-center gap-2 justify-center"
          >
            <span>{saving ? "Kaydediliyor..." : "Kaydet"}</span>
            {saving && (
              <span className="w-3 h-3 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
            )}
          </button>

          {/* 🔹 Run butonu: text solda, spinner SAĞDA */}
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-[11px] font-semibold disabled:opacity-60 flex items-center gap-2 justify-center"
          >
            <span>{running ? "Çalıştırılıyor..." : "Run"}</span>
            {running && (
              <span className="w-3 h-3 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
            )}
          </button>
        </div>
      </header>

      {/* GLOBAL RUN / VALIDATION ERROR BAR */}
      {error && (
        <div className="px-4 py-2 text-[11px] bg-red-950/80 text-red-200 border-b border-red-700/60 flex items-center justify-between gap-2">
          <span>Hata: {error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[10px] px-2 py-0.5 rounded border border-red-500/60 hover:bg-red-800/60"
          >
            Kapat
          </button>
        </div>
      )}

      {/* ANA BÖLÜM */}
      <div className="flex flex-1 min-h-0">
        {/* SOL PANEL → Aç/Kapa */}
        {showToolPanel && (
          <aside className="w-72 bg-slate-950 border-r border-slate-800 p-3 flex flex-col gap-3 overflow-y-auto">
            {/* Panel üst başlık + gizle butonu */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">⚙️</span>
                <p className="text-[11px] font-semibold text-slate-300">
                  Editör Paneli
                </p>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full border border-slate-600 text-slate-400">
                  V2.1
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowToolPanel(false);
                  setSelectedNodeId(null);
                }}
                className="text-[10px] px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-100"
              >
                Paneli Gizle
              </button>
            </div>

            {/* Flow meta */}
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[11px] font-semibold text-slate-300">
                Flow Bilgileri
              </p>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Flow adı
                </label>
                <input
                  type="text"
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  onBlur={saveFlowMeta}
                  onKeyDown={handleFlowNameKeyDown}
                  placeholder="Flow adı"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Açıklama (opsiyonel)
                </label>
                <textarea
                  rows={2}
                  value={flowDescription}
                  onChange={(e) => setFlowDescription(e.target.value)}
                  onBlur={saveFlowMeta}
                  onKeyDown={handleFlowDescriptionKeyDown}
                  placeholder="Bu flow ne yapıyor?"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] resize-none focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Node araçları */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-slate-300 mb-1">
                Node Araçları
              </p>
              <button
                onClick={addStartNode}
                className="w-full bg-green-600/90 hover:bg-green-600 rounded px-3 py-1 text-[11px]"
              >
                Start Node Ekle
              </button>

              <button
                onClick={addHttpNode}
                className="w-full bg-yellow-600/90 hover:bg-yellow-600 rounded px-3 py-1 text-[11px]"
              >
                HTTP Node Ekle
              </button>

              <button
                onClick={addIfNode}
                className="w-full bg-orange-600/90 hover:bg-orange-600 rounded px-3 py-1 text-[11px]"
              >
                IF Node Ekle
              </button>

              <button
                onClick={addFormatterNode}
                className="w-full bg-teal-600/90 hover:bg-teal-600 rounded px-3 py-1 text-[11px]"
              >
                Formatter Node Ekle
              </button>

              <button
                onClick={addSetNode}
                className="w-full bg-lime-600/90 hover:bg-lime-600 rounded px-3 py-1 text-[11px]"
              >
                Set / Fields Node Ekle
              </button>

              <button
                onClick={addLogNode}
                className="w-full bg-violet-600/90 hover:bg-violet-600 rounded px-3 py-1 text-[11px]"
              >
                Log Node Ekle
              </button>

              <button
                onClick={addExecutionDataNode}
                className="w-full bg-sky-700/90 hover:bg-sky-700 rounded px-3 py-1 text-[11px]"
              >
                Execution Data Node Ekle
              </button>

              <button
                onClick={addWaitNode}
                className="w-full bg-indigo-600/90 hover:bg-indigo-600 rounded px-3 py-1 text-[11px]"
              >
                Wait Node Ekle
              </button>

              <button
                onClick={addStopNode}
                className="w-full bg-red-700/90 hover:bg-red-700 rounded px-3 py-1 text-[11px]"
              >
                Stop &amp; Error Node Ekle
              </button>

              <button
                onClick={createPingTemplate}
                className="w-full bg-blue-600/90 hover:bg-blue-600 rounded px-3 py-1 text-[11px]"
              >
                Ping Flow Oluştur
              </button>

              <button
                onClick={createJsonPlaceholderTemplate}
                className="w-full bg-amber-600/90 hover:bg-amber-500 rounded px-3 py-1 text-[11px]"
              >
                JSONPlaceholder Flow Oluştur
              </button>
            </div>
          </aside>
        )}

        {/* ORTA: CANVAS + SAĞ AYAR PANELİ + ALT RUN PANELİ */}
        <main className="flex-1 flex flex-col min-h-0">
          {/* Üst: canvas + sağ ayar paneli */}
          <div className="flex flex-1 min-h-0">
            {/* Canvas */}
            <div className="relative flex-1 min-h-0">
              <ReactFlow
                nodes={enrichedNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                fitView
                panOnScroll
                panOnDrag
                zoomOnScroll
                className="w-full h-full"
                nodeTypes={nodeTypes}
              >
                <Background />
                <MiniMap />
                <Controls position="bottom-left" />
              </ReactFlow>

              {/* Canvas boş state mesajı */}
              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-400">
                  <p>Henüz node yok.</p>
                  <p className="mt-1 text-[11px] text-slate-500 text-center px-2">
                    Soldan Start + HTTP ekleyerek başlayabilir veya
                    &quot;JSONPlaceholder Flow Oluştur&quot; butonunu
                    kullanabilirsin.
                  </p>
                </div>
              )}

              {/* Sol ortada büyük + butonu → paneli aç */}
              {!showToolPanel && (
                <button
                  type="button"
                  onClick={() => setShowToolPanel(true)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white w-20 h-20 flex items-center justify-center text-4xl shadow-2xl border border-emerald-300"
                >
                  +
                </button>
              )}

              <ZoomPanel />
              <AutoSaveIndicator autoSaving={autoSaving} />
            </div>

            {/* Sağdaki node ayar paneli */}
            {activeSettingsNodeId && activeNodeData && (
              <aside className="w-[420px] max-w-[480px] bg-slate-950/95 border-l border-slate-800 shadow-2xl">
                <NodeSettingsPanel
                  nodeId={activeSettingsNodeId}
                  data={activeNodeData}
                  onChangeData={(patch) =>
                    updateNodeData(activeSettingsNodeId, patch)
                  }
                  onDuplicate={() => duplicateNode(activeSettingsNodeId)}
                  onDelete={() => {
                    deleteNode(activeSettingsNodeId);
                    setActiveSettingsNodeId(null);
                  }}
                  onClose={() => setActiveSettingsNodeId(null)}
                />
              </aside>
            )}
          </div>

          {/* Alt panel: Run History / Logs toggle'lı */}
          <section
            className={`border-t border-slate-800 bg-black/95 transition-[height] duration-200 ${
              bottomPanelOpen ? "h-64 min-h-[220px]" : "h-8"
            }`}
          >
            <div className="flex flex-col h-full">
              {/* Tab bar */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-xs">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (bottomPanelOpen && bottomTab === "history") {
                        // Aynı sekmeye tekrar basıldı → kapat
                        setBottomPanelOpen(false);
                      } else {
                        // Farklı sekmeye geç veya kapalıyken aç
                        setBottomTab("history");
                        setBottomPanelOpen(true);
                      }
                    }}
                    className={`px-2 py-0.5 rounded ${
                      bottomTab === "history" && bottomPanelOpen
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    Run Geçmişi
                  </button>
                  <button
                    onClick={() => {
                      if (bottomPanelOpen && bottomTab === "logs") {
                        setBottomPanelOpen(false);
                      } else {
                        setBottomTab("logs");
                        setBottomPanelOpen(true);
                      }
                    }}
                    className={`px-2 py-0.5 rounded ${
                      bottomTab === "logs" && bottomPanelOpen
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    Loglar
                  </button>
                </div>

                <div className="text-[11px] text-slate-400">
                  Son run ID:{" "}
                  <span className="font-mono">{runId ?? "-"}</span>
                </div>
              </div>

              {/* İçerik: sadece panel açıkken */}
              {bottomPanelOpen && (
                <div className="flex-1 overflow-hidden">
                  {bottomTab === "history" ? (
                    <RunHistoryPanel
                      flowId={flowId}
                      selectedRunId={runId}
                      onSelectRun={(id) => setRunId(id)}
                    />
                  ) : (
                    <RunOutputPanel runId={runId} />
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed top-3 right-3 z-50 space-y-2">
          {toasts.map((t) => {
            let variantClass =
              "bg-slate-800/95 border-slate-500 text-slate-50";
            if (t.variant === "success") {
              variantClass =
                "bg-emerald-700/95 border-emerald-400 text-emerald-50";
            } else if (t.variant === "error") {
              variantClass =
                "bg-red-700/95 border-red-400 text-red-50";
            }
            return (
              <div
                key={t.id}
                className={`pointer-events-auto min-w-[200px] max-w-[320px] rounded-md border px-3 py-2 text-[11px] shadow-lg ${variantClass}`}
              >
                {t.message}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
