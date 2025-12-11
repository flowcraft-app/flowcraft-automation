import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";

type NodeType =
  | "start"
  | "webhook_trigger"
  | "schedule_trigger"
  | "respond_webhook"
  | "http_request"
  | "http"
  | "send_email"
  | "email"
  | "if"
  | "log"
  | "execution_data"
  | "wait"
  | "delay"
  | "stop_error"
  | "stop"
  | "formatter"
  | "json_formatter"
  | "text_formatter"
  | "json_parse"
  | "json_stringify"
  | "number_formatter"
  | "set_fields"
  | "set"
  | string;

type AnyNode = {
  id: string;
  type?: string;
  data?: any;
};

type AnyEdge = {
  id: string;
  source: string;
  target: string;
};

// 🌐 Ortama göre BASE_URL (dev: localhost, prod: Vercel domain)
const BASE_URL =
  process.env.NEXT_PUBLIC_FLOWCRAFT_BASE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

// 🔹 Varsayılan workspace ID (şu an tek workspace olduğu için sabit)
const DEFAULT_WORKSPACE_ID =
  process.env.FLOWCRAFT_DEFAULT_WORKSPACE_ID ??
  "abc3566e-d898-439c-9f5a-d78f6540ea42";

if (!DEFAULT_WORKSPACE_ID) {
  console.error(
    "FLOWCRAFT_DEFAULT_WORKSPACE_ID env değişkeni tanımlı değil. Lütfen .env.local dosyasına ekleyin."
  );
}

// 🔹 Küçük sleep helper (Wait node + retry için)
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 🔹 lastOutput içinden "body.status" gibi alanları okumak için küçük helper
function getByPath(obj: any, path?: string): any {
  if (!path) return obj;
  if (!obj) return undefined;

  return path
    .split(".")
    .reduce(
      (acc: any, key: string) => (acc == null ? undefined : acc[key]),
      obj
    );
}

// 🔹 lastOutput içine "body.formatted" gibi alan yazmak için helper
function setByPath(obj: any, path?: string, value?: any): any {
  if (!path) {
    // path yoksa komple objeyi value yap
    return value;
  }

  if (obj == null || typeof obj !== "object") {
    obj = {};
  }

  const parts = path.split(".");
  let current: any = obj;

  parts.forEach((key, idx) => {
    const isLast = idx === parts.length - 1;
    if (isLast) {
      current[key] = value;
    } else {
      if (current[key] == null || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }
  });

  return obj;
}

/**
 * Asıl executor fonksiyonu
 */
export async function executeRun(runId: string) {
  let run_id: string | null = runId;

  try {
    // 1. RUN KAYDINI ÇEK
    const { data: runRecord, error: runErr } = await supabase
      .from("flow_runs")
      .select("*")
      .eq("id", run_id)
      .single();

    if (runErr || !runRecord) {
      return NextResponse.json(
        { error: "Run kaydı bulunamadı" },
        { status: 404 }
      );
    }

    const flow_id = runRecord.flow_id;
    const workspaceId =
      (runRecord as any).workspace_id ?? DEFAULT_WORKSPACE_ID ?? null;

    // 🆕 Trigger bilgileri (manual / webhook / schedule ...)
    const triggerType: string = (runRecord as any).trigger_type || "manual";
    const triggerPayload: any =
      (runRecord as any).trigger_payload ??
      (runRecord as any).payload ??
      null;
    const initialPayload: any = (runRecord as any).payload ?? null;

    // 🆕 ErrorMode (fail_fast | continue)
    const errorModeRaw =
      (runRecord as any).error_mode ??
      (triggerPayload &&
      typeof triggerPayload === "object" &&
      "errorMode" in triggerPayload
        ? (triggerPayload as any).errorMode
        : undefined) ??
      (initialPayload &&
      typeof initialPayload === "object" &&
      "errorMode" in initialPayload
        ? (initialPayload as any).errorMode
        : undefined);

    let errorMode: "fail_fast" | "continue" = "fail_fast";
    if (typeof errorModeRaw === "string") {
      const normalized = errorModeRaw.toLowerCase();
      if (normalized === "continue") errorMode = "continue";
      else if (normalized === "fail_fast") errorMode = "fail_fast";
    }

    const isWebhookTrigger = triggerType === "webhook";

    // respond_webhook için HTTP cevabını saklayacağımız state
    let respondWebhookResult:
      | null
      | {
          statusCode: number;
          bodySent: any;
          bodyMode: "static" | "lastOutput" | "customJson";
        } = null;

    if (!workspaceId) {
      console.error(
        "[executeRun] workspace_id bulunamadı (run kaydında ve env'de yok)"
      );
      return NextResponse.json(
        { error: "workspace_id bulunamadı" },
        { status: 500 }
      );
    }

    // 2. DIAGRAM ÇEK (aynı workspace içinde)
    const { data: diagram, error: diagramErr } = await supabase
      .from("flow_diagrams")
      .select("nodes, edges")
      .eq("flow_id", flow_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (diagramErr || !diagram) {
      // hata durumunda run'ı error'a çek
      await supabase
        .from("flow_runs")
        .update({ status: "error" })
        .eq("id", run_id);

      return NextResponse.json(
        { error: "Flow diagramı bulunamadı" },
        { status: 404 }
      );
    }

    const nodes: AnyNode[] = diagram.nodes || [];
    const edges: AnyEdge[] = diagram.edges || [];

    if (!nodes.length) {
      await supabase
        .from("flow_runs")
        .update({ status: "error" })
        .eq("id", run_id);

      return NextResponse.json(
        { error: "Flow diagramında node yok" },
        { status: 400 }
      );
    }

    const findNodeById = (id: string) => nodes.find((n) => n.id === id);
    const findNextOf = (id: string) => {
      const edge = edges.find((e) => e.source === id);
      return edge ? findNodeById(edge.target) : undefined;
    };

    // 🆕 Start / Webhook / Schedule giriş node helper'ları
    const findStartNode = () =>
      nodes.find(
        (n: AnyNode) =>
          n.data?.type === "start" ||
          n.data?.nodeType === "start" ||
          n.type === "start"
      );

    const findWebhookTriggerNode = () =>
      nodes.find(
        (n: AnyNode) =>
          n.data?.type === "webhook_trigger" ||
          n.data?.nodeType === "webhook_trigger" ||
          n.type === "webhook_trigger"
      );

    const findScheduleTriggerNode = () =>
      nodes.find(
        (n: AnyNode) =>
          n.data?.type === "schedule_trigger" ||
          n.data?.nodeType === "schedule_trigger" ||
          n.type === "schedule_trigger"
      );

    // 3. GİRİŞ NODE'U SEÇ
    let currentNode: AnyNode | undefined;

    if (triggerType === "webhook") {
      currentNode =
        findWebhookTriggerNode() || findStartNode() || nodes[0];
    } else if (triggerType === "schedule") {
      currentNode =
        findScheduleTriggerNode() || findStartNode() || nodes[0];
    } else {
      // manual / bilinmeyen → Start node, yoksa ilk node
      currentNode = findStartNode() || nodes[0];
    }

    const executed: any[] = [];
    const visited = new Set<string>();

    // 🔹 Herhangi bir node hata aldı mı?
    let hasError = false;

    // 🔹 Bir önceki node'un output'u (IF / formatter / log vs. için)
    let lastOutput: any = null;

    // 🆕 Webhook / schedule run'larında başlangıç payload'u
    if (triggerType === "webhook") {
      const tp = triggerPayload || {};
      const body =
        (tp && tp.body !== undefined ? tp.body : initialPayload) ?? null;
      const query = tp?.query ?? null;
      const headers = tp?.headers ?? null;

      lastOutput = {
        trigger: triggerType,
        triggerType,
        triggerPayload: tp,
        payload: initialPayload ?? body,
        body,
        query,
        headers,
      };
    } else if (triggerType === "schedule") {
      lastOutput = {
        trigger: triggerType,
        triggerType,
        triggerPayload,
        payload: initialPayload,
      };
    } else if (initialPayload != null) {
      // manual gibi diğer durumlar
      lastOutput = {
        trigger: triggerType,
        triggerType,
        payload: initialPayload,
        body: initialPayload,
      };
    }

    // 🔹 Run başlıyor → status: running
    await supabase
      .from("flow_runs")
      .update({ status: "running" })
      .eq("id", run_id);

    // ---- EXECUTION LOOP ----
    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);

      let output: any = null;
      let nodeError: string | null = null;
      // IF node için koşul sonucu
      let passed = true;

      const nodeType: NodeType =
        (currentNode.data?.type as NodeType) ||
        (currentNode.data?.nodeType as NodeType) ||
        (currentNode.type as NodeType) ||
        "unknown";

      const isStopNode = nodeType === "stop_error" || nodeType === "stop";
      const isRespondNode = nodeType === "respond_webhook";

      // 🆕 Node Disable / Skip
      const isDisabled = !!(
        currentNode.data?.disabled || currentNode.data?.isDisabled
      );

      // 🔹 Sonraki adım için kullanılacak lastOutput
      let nextLastOutput = lastOutput;

      // 🆕 Eğer node devre dışı ise, çalıştırmadan SKIP et
      if (isDisabled) {
        output = {
          info: "Node devre dışı bırakıldığı için atlandı.",
          disabled: true,
          nodeType,
        };

        const { error: skippedLogErr } = await supabase
          .from("flow_run_nodes")
          .insert({
            run_id,
            node_id: currentNode.id,
            status: "skipped",
            output,
            workspace_id: workspaceId,
          });

        if (skippedLogErr) {
          console.error(
            "flow_run_nodes insert error (skipped):",
            skippedLogErr
          );
        }

        executed.push({
          node_id: currentNode.id,
          type: nodeType,
          status: "skipped",
          output,
          error: null,
        });

        // lastOutput aynen korunur
        const next = findNextOf(currentNode.id);
        if (!next) break;
        currentNode = next;
        continue;
      }

      try {
        // START NODE → mevcut lastOutput ile merge
        if (nodeType === "start") {
          if (lastOutput && typeof lastOutput === "object") {
            output = {
              ...lastOutput,
              info: "Start node çalıştı",
            };
          } else {
            output = { info: "Start node çalıştı" };
          }
          nextLastOutput = output;
        }

        // 🆕 WEBHOOK TRIGGER NODE
        else if (nodeType === "webhook_trigger") {
          output = {
            info: "Webhook Trigger node çalıştı",
            triggerType,
            triggerPayload,
            payload: initialPayload,
            lastOutput,
          };
          // lastOutput içinde zaten trigger + payload var, bozma
          nextLastOutput = lastOutput;
        }

        // 🆕 SCHEDULE TRIGGER NODE
        else if (nodeType === "schedule_trigger") {
          const cron = currentNode.data?.cron;
          const timezone = currentNode.data?.timezone;
          output = {
            info: "Schedule Trigger node çalıştı",
            triggerType,
            cron,
            timezone,
            triggerPayload,
            payload: initialPayload,
            now: new Date().toISOString(),
            lastOutput,
          };
          // lastOutput içinde trigger + payload var, bozma
          nextLastOutput = lastOutput;
        }

        // 🔹 RESPOND WEBHOOK NODE
        else if (nodeType === "respond_webhook") {
          const data = currentNode.data || {};

          const statusCodeRaw =
            data.statusCode ?? data.status ?? 200;
          const statusCode = Number(statusCodeRaw) || 200;

          const bodyMode: "static" | "lastOutput" | "customJson" =
            (data.bodyMode as any) || "lastOutput"; // "lastOutput" | "static" | "customJson"
          const staticBody: any =
            data.bodyText ?? data.body ?? data.payload ?? "";
          const bodyJson: string | undefined = data.bodyJson;

          let responseBody: any = null;
          let parseError: string | null = null;
          let rawInput: string | null = null;

          if (bodyMode === "static") {
            rawInput = typeof staticBody === "string" ? staticBody : null;

            if (typeof staticBody === "string") {
              const trimmed = staticBody.trim();
              if (
                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"))
              ) {
                try {
                  responseBody = JSON.parse(trimmed);
                } catch (e: any) {
                  parseError = e?.message || "JSON parse error";
                  responseBody = staticBody;
                }
              } else {
                responseBody = staticBody;
              }
            } else {
              responseBody = staticBody;
            }
          } else if (bodyMode === "customJson") {
            rawInput = bodyJson ?? null;
            if (bodyJson && typeof bodyJson === "string") {
              const trimmed = bodyJson.trim();
              try {
                responseBody = JSON.parse(trimmed);
              } catch (e: any) {
                parseError = e?.message || "JSON parse error";
                responseBody = {
                  error: "Invalid JSON in respond_webhook.bodyJson",
                  raw: bodyJson,
                };
              }
            } else {
              responseBody = null;
            }
          } else {
            // bodyMode === "lastOutput" (default)
            responseBody = lastOutput;
          }

          output = {
            info: "Respond Webhook node çalıştı",
            statusCode,
            bodyMode,
            parseError,
            rawInput,
            responseBody,
          };

          // Sonraki adımlar / final_output için lastOutput'u respond_webhook gövdesiyle güncelle
          nextLastOutput = responseBody;

          // HTTP cevabı için sakla
          respondWebhookResult = {
            statusCode,
            bodySent: responseBody,
            bodyMode,
          };
        }

        // HTTP NODE (Retry + Credential Vault + custom headers + body)
        else if (nodeType === "http_request" || nodeType === "http") {
          const data = currentNode.data || {};

          const rawUrl =
            data.url || data.endpoint || data.urlTemplate;
          const method = (data.method || "GET").toUpperCase();

          // 🔁 Retry ayarları (node data'dan okunur)
          const retryCountRaw = data.retryCount ?? data.retries ?? 0;
          const retryDelayRaw = data.retryDelayMs ?? data.retryDelay ?? 0;

          let retryCount = Number(retryCountRaw);
          if (Number.isNaN(retryCount) || retryCount < 0) retryCount = 0;

          let retryDelayMs = Number(retryDelayRaw);
          if (Number.isNaN(retryDelayMs) || retryDelayMs < 0) retryDelayMs = 0;

          // 🎫 Credential Vault desteği
          const credentialId: string | undefined =
            data.credentialId ||
            data.credential_id ||
            (data.credential &&
            typeof data.credential === "object" &&
            data.credential.id
              ? String(data.credential.id)
              : undefined);

          let credentialHeaders: Record<string, string> = {};
          let credentialInfo: { id: string; type?: string } | null = null;

          if (credentialId) {
            const {
              data: credRow,
              error: credErr,
            } = await supabase
              .from("credentials")
              .select("id, type, config, workspace_id")
              .eq("id", credentialId)
              .eq("workspace_id", workspaceId)
              .maybeSingle();

            if (credErr) {
              throw new Error(
                `HTTP node: credential okunamadı (id=${credentialId}): ${credErr.message}`
              );
            }

            if (!credRow) {
              throw new Error(
                `HTTP node: credential bulunamadı (id=${credentialId})`
              );
            }

            const credType = (credRow as any).type
              ? String((credRow as any).type).toLowerCase()
              : "";
            const cfg: any = (credRow as any).config ?? {};

            credentialInfo = {
              id: (credRow as any).id,
              type: (credRow as any).type,
            };

            if (credType === "api_key") {
              const apiKey = cfg.apiKey || cfg.key;
              if (!apiKey || typeof apiKey !== "string") {
                throw new Error(
                  `HTTP node: api_key credential için config.apiKey zorunludur (id=${credentialId})`
                );
              }

              const headerName =
                cfg.headerName ||
                cfg.header_name ||
                cfg.header ||
                "x-api-key";
              const prefix =
                cfg.prefix && typeof cfg.prefix === "string"
                  ? cfg.prefix
                  : "";

              credentialHeaders[headerName] = prefix
                ? `${prefix} ${apiKey}`
                : apiKey;
            } else if (
              credType === "http_bearer" ||
              credType === "bearer" ||
              credType === "bearer_token"
            ) {
              const token =
                cfg.token || cfg.accessToken || cfg.bearerToken;
              if (!token || typeof token !== "string") {
                throw new Error(
                  `HTTP node: http_bearer credential için token zorunludur (id=${credentialId})`
                );
              }

              credentialHeaders["Authorization"] = `Bearer ${token}`;
            } else if (
              credType === "basic" ||
              credType === "http_basic"
            ) {
              const username = cfg.username || cfg.user;
              const password = cfg.password || cfg.pass;

              if (
                !username ||
                typeof username !== "string" ||
                !password ||
                typeof password !== "string"
              ) {
                throw new Error(
                  `HTTP node: basic credential için username/password zorunludur (id=${credentialId})`
                );
              }

              const token = Buffer.from(
                `${username}:${password}`,
                "utf8"
              ).toString("base64");
              credentialHeaders["Authorization"] = `Basic ${token}`;
            } else if (credType === "custom") {
              // config.headers içindeki header'ları ekle
              if (
                cfg.headers &&
                typeof cfg.headers === "object" &&
                !Array.isArray(cfg.headers)
              ) {
                for (const [key, value] of Object.entries(cfg.headers)) {
                  if (typeof value === "string") {
                    credentialHeaders[key] = value;
                  }
                }
              }
            } else if (credType) {
              // Bilinmeyen type → hata verme, sadece bilgi amaçlı
              credentialInfo.type = (credRow as any).type;
            }
          }

          if (!rawUrl || typeof rawUrl !== "string") {
            output = { error: "HTTP node için URL tanımlı değil" };
          } else {
            // 🔹 URL tam mı (http/https ile mi başlıyor) yoksa relative mi (/api/flows gibi)?
            let finalUrl = rawUrl;
            const isAbsolute = /^https?:\/\//i.test(rawUrl);

            if (!isAbsolute) {
              // /api/flows şeklindeyse BASE_URL + path
              const needsSlash = !rawUrl.startsWith("/");
              finalUrl = `${BASE_URL}${needsSlash ? "/" : ""}${rawUrl}`;
            }

            // 🔹 Node içindeki header'ları oku (opsiyonel)
            const nodeHeadersRaw = data.headers;
            let headers: Record<string, string> = {};

            if (nodeHeadersRaw && typeof nodeHeadersRaw === "object") {
              if (Array.isArray(nodeHeadersRaw)) {
                // [{ key: "...", value: "..." }] formatı
                for (const item of nodeHeadersRaw) {
                  if (
                    item &&
                    typeof item.key === "string" &&
                    item.key.trim() &&
                    typeof item.value === "string"
                  ) {
                    headers[item.key.trim()] = item.value;
                  }
                }
              } else {
                // { "X-Test": "123" } formatı
                for (const [k, v] of Object.entries(nodeHeadersRaw)) {
                  if (typeof v === "string") {
                    headers[k] = v;
                  }
                }
              }
            }

            // 🔹 Credential header'larını ekle (node header'ları üstüne bindiriyoruz)
            headers = { ...headers, ...credentialHeaders };

            // 🔹 Body desteği (opsiyonel)
            let bodyToSend: string | undefined;

            if (
              data.body !== undefined &&
              method !== "GET" &&
              method !== "HEAD"
            ) {
              const bodyRaw = data.body;

              if (typeof bodyRaw === "string") {
                bodyToSend = bodyRaw;

                // Content-Type yoksa text/plain ver
                const hasContentType = Object.keys(headers).some(
                  (h) => h.toLowerCase() === "content-type"
                );
                if (!hasContentType) {
                  headers["Content-Type"] =
                    "text/plain; charset=utf-8";
                }
              } else {
                // JSON body
                bodyToSend = JSON.stringify(bodyRaw);

                const hasContentType = Object.keys(headers).some(
                  (h) => h.toLowerCase() === "content-type"
                );
                if (!hasContentType) {
                  headers["Content-Type"] = "application/json";
                }
              }
            }

            let attempts = 0;
            let lastError: any = null;
            let lastResponse: Response | null = null;
            let lastParsedBody: any = null;

            // Toplam deneme sayısı = 1 (ilk deneme) + retryCount
            const maxAttempts = Math.max(1, 1 + retryCount);

            while (attempts < maxAttempts) {
              attempts++;

              try {
                const fetchOptions: RequestInit = {
                  method,
                };

                if (Object.keys(headers).length > 0) {
                  fetchOptions.headers = headers;
                }

                if (bodyToSend !== undefined) {
                  fetchOptions.body = bodyToSend;
                }

                const res = await fetch(finalUrl, fetchOptions);

                const raw = await res.text();
                let parsed: any = null;
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  parsed = null;
                }

                lastResponse = res;
                lastParsedBody = parsed ?? raw;

                // 2xx ise veya zaten son denemedeysek çık
                if (res.ok || attempts >= maxAttempts) {
                  break;
                }
              } catch (err: any) {
                lastError = err;
              }

              // Son deneme değilse ve delay > 0 ise bekle
              if (attempts < maxAttempts && retryDelayMs > 0) {
                await sleep(retryDelayMs);
              }
            }

            if (lastResponse) {
              output = {
                status: lastResponse.status,
                ok: lastResponse.ok,
                headers: Object.fromEntries(
                  lastResponse.headers.entries() as any
                ),
                body: lastParsedBody,
                url: finalUrl, // log'a gerçek istek atılan URL'yi yazıyoruz
                method,
                credential: credentialInfo ?? undefined,
                retries: {
                  attempts, // toplam deneme (ilk + retry'ler)
                  retryCount, // node'da ayarlanan retry sayısı
                  retryDelayMs, // iki deneme arası bekleme
                  lastStatus: lastResponse.status,
                  lastOk: lastResponse.ok,
                  lastError:
                    lastError?.message ||
                    (lastError ? String(lastError) : undefined),
                },
              };
            } else {
              const errMessage =
                lastError?.message ||
                "HTTP isteği sırasında beklenmeyen bir hata oluştu";

              output = {
                error: errMessage,
                url: rawUrl,
                resolvedUrl: !/^https?:\/\//i.test(rawUrl)
                  ? `${BASE_URL}${
                      rawUrl.startsWith("/") ? "" : "/"
                    }${rawUrl}`
                  : rawUrl,
                method,
                credential: credentialInfo ?? undefined,
                retries: {
                  attempts,
                  retryCount,
                  retryDelayMs,
                  lastError: errMessage,
                },
              };
            }
          }

          // Hata da olsa, o node'un output'unu lastOutput'a yazıyoruz
          nextLastOutput = output;
        }

        // 🔹 SEND EMAIL NODE (Output Paketi v1)
        else if (nodeType === "send_email" || nodeType === "email") {
          const data = currentNode.data || {};

          const toRaw = data.to;
          const subject: string =
            data.subject || data.title || "FlowCraft email";
          const bodyText: string =
            data.body || data.text || "";

          // Birden fazla alıcı destekle (virgül ayırma veya array)
          let to: string[] = [];
          if (Array.isArray(toRaw)) {
            to = toRaw.filter(
              (item: any) =>
                typeof item === "string" && item.trim().length > 0
            );
          } else if (typeof toRaw === "string") {
            to = toRaw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
          }

          const fromDefault =
            process.env.FLOWCRAFT_EMAIL_FROM ||
            "FlowCraft <no-reply@example.com>";

          const from: string =
            data.fromEmail || data.from || fromDefault;

          // Retry ayarları (HTTP node ile uyumlu)
          const retryCountRaw = data.retryCount ?? data.retries ?? 0;
          const retryDelayRaw = data.retryDelayMs ?? data.retryDelay ?? 0;

          let retryCount = Number(retryCountRaw);
          if (Number.isNaN(retryCount) || retryCount < 0) retryCount = 0;

          let retryDelayMs = Number(retryDelayRaw);
          if (Number.isNaN(retryDelayMs) || retryDelayMs < 0) retryDelayMs = 0;

          const provider =
            process.env.FLOWCRAFT_EMAIL_PROVIDER || "resend";
          const resendApiKey = process.env.RESEND_API_KEY;

          if (!to.length) {
            output = {
              ok: false,
              error: "Send Email node: 'to' alanı zorunludur.",
              provider,
              to,
              subject,
            };
          } else if (provider === "resend" && resendApiKey) {
            let attempts = 0;
            let lastError: any = null;
            let lastResponse: Response | null = null;
            let lastBody: any = null;

            const maxAttempts = Math.max(1, 1 + retryCount);

            while (attempts < maxAttempts) {
              attempts++;

              try {
                const res = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${resendApiKey}`,
                  },
                  body: JSON.stringify({
                    from,
                    to,
                    subject,
                    text: bodyText,
                  }),
                });

                const raw = await res.text();
                let parsed: any = null;
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  parsed = raw;
                }

                lastResponse = res;
                lastBody = parsed;

                if (res.ok || attempts >= maxAttempts) {
                  break;
                }
              } catch (err: any) {
                lastError = err;
              }

              if (attempts < maxAttempts && retryDelayMs > 0) {
                await sleep(retryDelayMs);
              }
            }

            if (lastResponse) {
              const success = lastResponse.ok;
              output = {
                ok: success,
                provider: "resend",
                status: lastResponse.status,
                to,
                subject,
                from,
                bodyPreview:
                  bodyText && bodyText.length > 200
                    ? `${bodyText.slice(0, 200)}…`
                    : bodyText,
                response: lastBody,
                retries: {
                  attempts,
                  retryCount,
                  retryDelayMs,
                  lastStatus: lastResponse.status,
                  lastOk: lastResponse.ok,
                  lastError:
                    lastError?.message ||
                    (lastError ? String(lastError) : undefined),
                },
              };
            } else {
              const errMessage =
                lastError?.message ||
                "Send Email node: provider isteği başarısız oldu.";

              output = {
                ok: false,
                provider: "resend",
                error: errMessage,
                to,
                subject,
                from,
                retries: {
                  attempts,
                  retryCount,
                  retryDelayMs,
                  lastError: errMessage,
                },
              };
            }
          } else {
            // Provider ayarlı değil → sadece log amaçlı output
            output = {
              ok: false,
              provider,
              error:
                "Email provider yapılandırılmamış. RESEND_API_KEY ve FLOWCRAFT_EMAIL_FROM env değişkenlerini tanımlayın.",
              to,
              subject,
              from,
              bodyPreview:
                bodyText && bodyText.length > 200
                  ? `${bodyText.slice(0, 200)}…`
                  : bodyText,
            };
          }

          nextLastOutput = output;
        }

        // 🔹 IF NODE (basit koşul: son status ya da son ok alanına bakar)
        else if (nodeType === "if") {
          const mode = currentNode.data?.mode || "status_eq"; // status_eq | ok_true
          const expectedRaw = currentNode.data?.expected ?? 200;

          if (!lastOutput) {
            // IF'ten önce hiç node çalışmamış
            passed = false;
            output = {
              error: "IF node: önceki node output'u bulunamadı",
              lastOutput: null,
            };
          } else if (mode === "status_eq") {
            const expected = Number(expectedRaw);
            const status = (lastOutput as any)?.status;

            passed = status === expected;

            output = {
              info: `IF: last status ${status} == ${expected}?`,
              status,
              expected,
              passed,
            };
          } else if (mode === "ok_true") {
            const ok = !!(lastOutput as any)?.ok;

            passed = ok;

            output = {
              info: "IF: last ok === true?",
              ok,
              passed,
            };
          } else {
            passed = false;
            output = {
              error: `Bilinmeyen IF modu: ${mode}`,
              mode,
              lastOutput,
            };
          }

          nextLastOutput = output;
        }

        // 🔹 LOG NODE (sadece log atar, lastOutput'u BOZMADAN devam eder)
        else if (nodeType === "log") {
          const rawMessage =
            currentNode.data?.message ||
            currentNode.data?.label ||
            "Log node çalıştı";

          const message =
            typeof rawMessage === "string" ? rawMessage.trim() : rawMessage;

          output = {
            message,
            lastOutput, // önceki node'un çıktısını da JSON içinde göster
          };

          // Dikkat: nextLastOutput = lastOutput → zincirdeki IF vb. halen önceki node output'unu görsün
          nextLastOutput = lastOutput;
        }

        // 🔹 EXECUTION DATA NODE (runId, flowId ve lastOutput snapshot)
        else if (nodeType === "execution_data") {
          output = {
            info: "Execution data snapshot",
            runId: run_id,
            flowId: flow_id,
            lastOutput,
          };

          // Execution Data sadece gözlemci → lastOutput'u BOZMADAN devam
          nextLastOutput = lastOutput;
        }

        // 🔹 WAIT / DELAY NODE (akışı X süre bekletir, lastOutput'u BOZMADAN devam eder)
        else if (nodeType === "wait" || nodeType === "delay") {
          const msRaw = currentNode.data?.ms;
          const secondsRaw =
            currentNode.data?.seconds ?? currentNode.data?.delay ?? 1;

          let ms: number;

          if (typeof msRaw === "number" && !Number.isNaN(msRaw) && msRaw > 0) {
            ms = msRaw;
          } else {
            const sec = Number(secondsRaw);
            ms = Number.isNaN(sec) ? 0 : sec * 1000;
          }

          if (ms < 0) ms = 0;

          // Gerçek bekleme
          await sleep(ms);

          output = {
            info: "Wait node çalıştı",
            waitedMs: ms,
            waitedSeconds: ms / 1000,
          };

          // Wait node data'ya dokunmaz → lastOutput aynı kalır
          nextLastOutput = lastOutput;
        }

        // 🔹 STOP & ERROR NODE (flow'u hata ile sonlandırır)
        else if (nodeType === "stop_error" || nodeType === "stop") {
          const rawCode =
            currentNode.data?.code ||
            currentNode.data?.errorCode ||
            "manual_stop";

          const rawReason =
            currentNode.data?.reason ||
            currentNode.data?.message ||
            "Stop&Error node akışı durdurdu.";

          const code =
            typeof rawCode === "string" ? rawCode.trim() : rawCode;
          const reason =
            typeof rawReason === "string" ? rawReason.trim() : rawReason;

          output = {
            code,
            reason,
            lastOutput,
          };

          // lastOutput'u değiştirmiyoruz; önceki node'un output'u aynen kalsın
          nextLastOutput = lastOutput;
        }

        // 🔹 FORMATTER / TEXT FORMATTER NODE (JSON/Text)
        else if (
          nodeType === "formatter" ||
          nodeType === "json_formatter" ||
          nodeType === "text_formatter"
        ) {
          const mode =
            currentNode.data?.mode ||
            "pick_field"; // pick_field | to_upper | to_lower | trim | replace | slice
          const fieldPath: string =
            currentNode.data?.fieldPath ||
            currentNode.data?.path ||
            "body"; // default: body
          const targetPath: string =
            currentNode.data?.targetPath ||
            currentNode.data?.outputPath ||
            fieldPath; // default: aynı yere yaz

          const replaceFrom: string | undefined =
            currentNode.data?.replaceFrom ||
            currentNode.data?.from ||
            undefined;
          const replaceTo: string | undefined =
            currentNode.data?.replaceTo ||
            currentNode.data?.to ||
            "";

          const startIndexRaw = currentNode.data?.startIndex;
          const endIndexRaw = currentNode.data?.endIndex;

          if (!lastOutput) {
            output = {
              error: "Formatter node: lastOutput bulunamadı",
              lastOutput: null,
            };
            // lastOutput değişmiyor
            nextLastOutput = lastOutput;
          } else {
            // lastOutput içinden alan çek
            const rawValue = getByPath(lastOutput, fieldPath);

            let newValue: any = rawValue;

            if (mode === "pick_field") {
              // sadece alanı al, aynen yaz
              newValue = rawValue;
            } else {
              // string işlemleri
              let str = "";

              if (rawValue == null) {
                str = "";
              } else if (typeof rawValue === "string") {
                str = rawValue;
              } else {
                // JSON olmayan bir şeyse stringify et
                try {
                  str = JSON.stringify(rawValue);
                } catch {
                  str = String(rawValue);
                }
              }

              if (mode === "to_upper") {
                str = str.toUpperCase();
              } else if (mode === "to_lower") {
                str = str.toLowerCase();
              } else if (mode === "trim") {
                str = str.trim();
              } else if (mode === "replace") {
                if (typeof replaceFrom === "string" && replaceFrom.length > 0) {
                  const replacement =
                    typeof replaceTo === "string" ? replaceTo : "";
                  str = str.split(replaceFrom).join(replacement);
                }
              } else if (mode === "slice") {
                const startIndexNum = Number(startIndexRaw);
                const endIndexNum = Number(endIndexRaw);

                const hasStart =
                  !Number.isNaN(startIndexNum) && startIndexRaw != null;
                const hasEnd =
                  !Number.isNaN(endIndexNum) && endIndexRaw != null;

                if (hasStart && hasEnd) {
                  str = str.slice(startIndexNum, endIndexNum);
                } else if (hasStart) {
                  str = str.slice(startIndexNum);
                } else if (hasEnd) {
                  // sadece end varsa, 0'dan end'e kadar olsun
                  str = str.slice(0, endIndexNum);
                } // ikisi de yoksa str aynı kalır
              }

              newValue = str;
            }

            // ✅ lastOutput'u EZME, sadece targetPath alanını güncelle
            const updatedLastOutput = setByPath(
              lastOutput,
              targetPath,
              newValue
            );

            output = {
              mode,
              fieldPath,
              targetPath,
              value: newValue,
            };

            nextLastOutput = updatedLastOutput;
          }
        }

        // 🆕 JSON PARSE NODE
        else if (nodeType === "json_parse") {
          const rawTextPath: string =
            currentNode.data?.rawTextPath ||
            currentNode.data?.fieldPath ||
            currentNode.data?.path ||
            "body";
          const targetPath: string =
            currentNode.data?.targetPath ||
            currentNode.data?.outputPath ||
            rawTextPath;

          if (!lastOutput) {
            output = {
              error: "json_parse node: lastOutput bulunamadı",
              rawTextPath,
              targetPath,
            };
            nextLastOutput = lastOutput;
          } else {
            const rawValue = getByPath(lastOutput, rawTextPath);

            let text: string;
            if (typeof rawValue === "string") {
              text = rawValue;
            } else if (rawValue != null) {
              // Objeyse stringify edip parse etmeyi deneyelim (idempotent)
              try {
                text = JSON.stringify(rawValue);
              } catch {
                text = String(rawValue);
              }
            } else {
              text = "";
            }

            try {
              const parsed = JSON.parse(text);

              const updated = setByPath(
                lastOutput ?? {},
                targetPath,
                parsed
              );

              output = {
                info: "json_parse node çalıştı",
                rawTextPath,
                targetPath,
                success: true,
              };

              nextLastOutput = updated;
            } catch (e: any) {
              output = {
                error: "json_parse: JSON.parse sırasında hata oluştu",
                rawTextPath,
                targetPath,
                rawValue,
                message: e?.message || String(e),
              };

              // lastOutput'u değiştirme
              nextLastOutput = lastOutput;
            }
          }
        }

        // 🆕 JSON STRINGIFY NODE
        else if (nodeType === "json_stringify") {
          const sourcePath: string =
            currentNode.data?.sourcePath ||
            currentNode.data?.fieldPath ||
            currentNode.data?.path ||
            "body";
          const targetPath: string =
            currentNode.data?.targetPath ||
            currentNode.data?.outputPath ||
            sourcePath;

          if (!lastOutput) {
            output = {
              error: "json_stringify node: lastOutput bulunamadı",
              sourcePath,
              targetPath,
            };
            nextLastOutput = lastOutput;
          } else {
            const value = getByPath(lastOutput, sourcePath);

            let str: string;
            try {
              str = JSON.stringify(value);
            } catch {
              str = String(value);
            }

            const updated = setByPath(lastOutput ?? {}, targetPath, str);

            output = {
              info: "json_stringify node çalıştı",
              sourcePath,
              targetPath,
              length: str.length,
            };

            nextLastOutput = updated;
          }
        }

        // 🆕 NUMBER FORMATTER NODE
        else if (nodeType === "number_formatter") {
          const mode =
            currentNode.data?.mode ||
            "round"; // round | ceil | floor | percent
          const fieldPath: string =
            currentNode.data?.fieldPath ||
            currentNode.data?.path ||
            "body";
          const targetPath: string =
            currentNode.data?.targetPath ||
            currentNode.data?.outputPath ||
            fieldPath;
          const decimalsRaw = currentNode.data?.decimals;

          const decimalsNum = Number(decimalsRaw);
          const hasDecimals =
            !Number.isNaN(decimalsNum) && decimalsRaw != null && decimalsNum >= 0;

          if (!lastOutput) {
            output = {
              error: "number_formatter node: lastOutput bulunamadı",
              fieldPath,
              targetPath,
            };
            nextLastOutput = lastOutput;
          } else {
            const rawValue = getByPath(lastOutput, fieldPath);
            const num = Number(rawValue);

            if (Number.isNaN(num)) {
              output = {
                error:
                  "number_formatter: fieldPath altındaki değer sayıya çevrilemedi",
                fieldPath,
                targetPath,
                rawValue,
              };
              nextLastOutput = lastOutput;
            } else {
              let result = num;

              if (mode === "round") {
                if (hasDecimals) {
                  const factor = Math.pow(10, decimalsNum);
                  result = Math.round(num * factor) / factor;
                } else {
                  result = Math.round(num);
                }
              } else if (mode === "ceil") {
                result = Math.ceil(num);
              } else if (mode === "floor") {
                result = Math.floor(num);
              } else if (mode === "percent") {
                const multiplied = num * 100;
                if (hasDecimals) {
                  const factor = Math.pow(10, decimalsNum);
                  result = Math.round(multiplied * factor) / factor;
                } else {
                  result = multiplied;
                }
              } else {
                // bilinmeyen mod → hata
                output = {
                  error: `number_formatter: bilinmeyen mode: ${mode}`,
                  fieldPath,
                  targetPath,
                  rawValue,
                };
                nextLastOutput = lastOutput;

                // nodeError set etmiyoruz, domain hatası olarak loglansın
                nodeError = null;
              }

              if (!output) {
                const updated = setByPath(
                  lastOutput ?? {},
                  targetPath,
                  result
                );

                output = {
                  info: "number_formatter node çalıştı",
                  mode,
                  fieldPath,
                  targetPath,
                  value: result,
                  decimals: hasDecimals ? decimalsNum : undefined,
                };

                nextLastOutput = updated;
              }
            }
          }
        }

        // 🔹 SET / EDIT FIELDS NODE
        else if (nodeType === "set_fields" || nodeType === "set") {
          const assignments = currentNode.data?.assignments;

          if (
            !assignments ||
            !Array.isArray(assignments) ||
            assignments.length === 0
          ) {
            output = {
              info: "Set node: assignments boş, değişiklik yapılmadı",
            };
            // lastOutput aynı kalsın
            nextLastOutput = lastOutput;
          } else {
            // lastOutput yoksa boş obje ile başla
            let updated: any = lastOutput ?? {};
            const applied: any[] = [];

            for (const item of assignments) {
              if (!item || !item.path) continue;

              let val: any = item.value;

              // Basit type parse (opsiyonel – şimdilik hafif):
              if (typeof val === "string") {
                const trimmed = val.trim();

                if (trimmed === "true") {
                  val = true;
                } else if (trimmed === "false") {
                  val = false;
                } else if (!Number.isNaN(Number(trimmed)) && trimmed !== "") {
                  // "123" → 123
                  val = Number(trimmed);
                } else {
                  // JSON gibi görünüyorsa parse dene
                  if (
                    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                    (trimmed.startsWith("[") && trimmed.endsWith("]"))
                  ) {
                    try {
                      val = JSON.parse(trimmed);
                    } catch {
                      // parse hatası olursa string kalsın
                      val = trimmed;
                    }
                  }
                }
              }

              updated = setByPath(updated, item.path, val);
              applied.push({ path: item.path, value: val });
            }

            output = {
              info: "Set fields node çalıştı",
              applied,
            };

            nextLastOutput = updated;
          }
        }

        // DİĞER NODE TİPLERİ
        else {
          // Burada lastOutput'u bozmuyoruz; sadece bilgi amaçlı log yazıyoruz
          output = {
            info: `Desteklenmeyen node tipi: ${nodeType}`,
            note:
              "Bu node tipi executor tarafında henüz desteklenmiyor, lastOutput değiştirilmedi.",
            lastOutput,
          };
          nextLastOutput = lastOutput;
        }
      } catch (err: any) {
        nodeError = err?.message || "Node çalışırken hata oluştu";
      }

      // HATA VARSA ama output yoksa, output'a da yaz
      if (nodeError && !output) {
        output = { error: nodeError };
      }

      // 🔹 Node status: hata varsa 'error', yoksa 'success'
      let nodeStatus: "success" | "error" = nodeError ? "error" : "success";
      if (isStopNode) {
        // Stop&Error node mantıksal olarak hata durumudur
        nodeStatus = "error";
      }
      if (nodeStatus === "error") {
        hasError = true;
      }

      // 🔹 Son output'u güncelle
      lastOutput = nextLastOutput;

      // ✅ NODE LOG KAYDET (status zorunlu + workspace_id)
      const { error: logErr } = await supabase.from("flow_run_nodes").insert({
        run_id,
        node_id: currentNode.id,
        status: nodeStatus,
        output,
        workspace_id: workspaceId,
      });

      if (logErr) {
        console.error("flow_run_nodes insert error:", logErr);
      }

      executed.push({
        node_id: currentNode.id,
        type: nodeType,
        status: nodeStatus,
        output,
        error: nodeError,
      });

      // Respond Webhook node'u akışın doğal sonu kabul edilir
      if (isRespondNode) {
        break;
      }

      // 🔹 Stop&Error node ise → run'ı error'a çek ve 200 ile dön (UI logları gösterebilsin)
      if (isStopNode) {
        await supabase
          .from("flow_runs")
          .update({ status: "error" })
          .eq("id", run_id);

        return NextResponse.json(
          {
            status: "error",
            run_id,
            executed,
            reason:
              (output as any)?.reason ||
              "Stop&Error node tarafından akış durduruldu.",
            code: (output as any)?.code || "manual_stop",
            errorMode,
          },
          { status: 200 }
        );
      }

      // Eğer node içinde teknik hata oluştuysa:
      if (nodeError) {
        if (errorMode === "fail_fast") {
          // fail_fast → hemen run'ı error'a çek ve bitir
          await supabase
            .from("flow_runs")
            .update({ status: "error" })
            .eq("id", run_id);

          return NextResponse.json(
            {
              status: "error",
              run_id,
              node: currentNode.id,
              executed,
              errorMode,
            },
            { status: 500 }
          );
        }
        // errorMode === "continue" → hata loglandı ama akış devam ediyor
      }

      // IF node koşulu FALSE ise → flow'u normal completed olarak bitir
      if (nodeType === "if" && !passed) {
        await supabase
          .from("flow_runs")
          .update({ status: "completed" })
          .eq("id", run_id);

        return NextResponse.json(
          {
            status: "completed",
            run_id,
            executed,
            reason: "if_condition_false",
            errorMode,
          },
          { status: 200 }
        );
      }

      // ➡ SIRADAKİ NODE'U BUL
      const next = findNextOf(currentNode.id);
      if (!next) break;
      currentNode = next;
    }

    // Flow finished (Stop/Error/IF gibi erken dönüşler olmadıysa buraya gelir)
    const finalStatus: "completed" | "error" = hasError ? "error" : "completed";

    const finalOutput =
      respondWebhookResult?.bodySent !== undefined
        ? respondWebhookResult.bodySent
        : lastOutput;

    await supabase
      .from("flow_runs")
      .update({
        status: finalStatus,
        final_output: finalOutput ?? null,
      })
      .eq("id", run_id);

    // Webhook tetikliyse ve respond_webhook çalıştıysa → kendi body/status'üyle dön
    if (isWebhookTrigger && respondWebhookResult) {
      const { statusCode, bodySent } = respondWebhookResult;

      if (
        bodySent !== null &&
        typeof bodySent === "object" &&
        !(bodySent instanceof String)
      ) {
        return NextResponse.json(bodySent, { status: statusCode });
      }

      const text =
        bodySent === null || typeof bodySent === "undefined"
          ? ""
          : String(bodySent);

      return new NextResponse(text, {
        status: statusCode,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Diğer tetikleyiciler (manual / schedule) için klasik envelope
    return NextResponse.json(
      { status: finalStatus, run_id, executed, lastOutput, errorMode },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Executor fatal error:", err);

    if (run_id) {
      try {
        await supabase
          .from("flow_runs")
          .update({ status: "error" })
          .eq("id", run_id);
      } catch (e) {
        console.error("Run status update error:", e);
      }
    }

    return NextResponse.json(
      { error: err?.message || "Executor error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/run/execute
 * Body:
 * {
 *   "run_id": "uuid"
 * }
 * ya da
 * {
 *   "runId": "uuid"
 * }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as any));
  const runId = body.run_id || body.runId;

  if (!runId) {
    return NextResponse.json(
      { error: "run_id zorunludur" },
      { status: 400 }
    );
  }

  return executeRun(runId);
}
