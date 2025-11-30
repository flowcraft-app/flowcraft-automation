import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";

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
async function executeRun(runId: string) {
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

    // 2. DIAGRAM ÇEK
    const { data: diagram, error: diagramErr } = await supabase
      .from("flow_diagrams")
      .select("nodes, edges")
      .eq("flow_id", flow_id)
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

    // 3. START NODE BUL (type: "start" hem node.type hem data.type hem nodeType içinde olabilir)
    let currentNode: AnyNode | undefined =
      nodes.find(
        (n: AnyNode) =>
          n.data?.type === "start" ||
          n.data?.nodeType === "start" ||
          n.type === "start"
      ) || nodes[0];

    const executed: any[] = [];
    const visited = new Set<string>();

    // 🔹 Bir önceki node'un output'u (IF / formatter / log vs. için)
    let lastOutput: any = null;

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

      const nodeType =
        currentNode.data?.type ||
        currentNode.data?.nodeType ||
        currentNode.type ||
        "unknown";

      const isStopNode = nodeType === "stop_error" || nodeType === "stop";

      // 🔹 Sonraki adım için kullanılacak lastOutput
      let nextLastOutput = lastOutput;

      try {
        // START NODE → sadece bilgi logu
        if (nodeType === "start") {
          output = { info: "Start node çalıştı" };
          nextLastOutput = output;
        }

        // HTTP NODE
        else if (nodeType === "http_request" || nodeType === "http") {
          const rawUrl =
            currentNode.data?.url ||
            currentNode.data?.endpoint ||
            currentNode.data?.urlTemplate;
          const method = (currentNode.data?.method || "GET").toUpperCase();

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

            try {
              const res = await fetch(finalUrl, { method });

              const raw = await res.text();
              let parsed: any = null;
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = null;
              }

              output = {
                status: res.status,
                ok: res.ok,
                headers: Object.fromEntries(res.headers.entries() as any),
                body: parsed ?? raw,
                url: finalUrl, // log'a gerçek istek atılan URL'yi yazıyoruz
                method,
              };
            } catch (err: any) {
              console.error("HTTP node error:", err);
              output = {
                error:
                  err?.message ||
                  "HTTP isteği sırasında beklenmeyen bir hata oluştu",
                url: rawUrl,
                resolvedUrl: !/^https?:\/\//i.test(rawUrl)
                  ? `${BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`
                  : rawUrl,
                method,
              };
            }
          }

          // Hata da olsa, o node'un output'unu lastOutput'a yazıyoruz
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
          const message =
            currentNode.data?.message ||
            currentNode.data?.label ||
            "Log node çalıştı";

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
          await new Promise((resolve) => setTimeout(resolve, ms));

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
          const code =
            currentNode.data?.code ||
            currentNode.data?.errorCode ||
            "manual_stop";

          const reason =
            currentNode.data?.reason ||
            currentNode.data?.message ||
            "Stop&Error node akışı durdurdu.";

          output = {
            code,
            reason,
            lastOutput,
          };

          // lastOutput'u değiştirmiyoruz; önceki node'un output'u aynen kalsın
          nextLastOutput = lastOutput;
        }

        // 🔹 FORMATTER NODE (JSON/Text Formatter)
        else if (nodeType === "formatter" || nodeType === "json_formatter") {
          const mode = currentNode.data?.mode || "pick_field"; // pick_field | to_upper | to_lower | trim
          const fieldPath: string =
            currentNode.data?.fieldPath ||
            currentNode.data?.path ||
            "body"; // default: body
          const targetPath: string =
            currentNode.data?.targetPath ||
            currentNode.data?.outputPath ||
            fieldPath; // default: aynı yere yaz

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
          output = { info: `Desteklenmeyen node tipi: ${nodeType}` };
          nextLastOutput = output;
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

      // 🔹 Son output'u güncelle
      lastOutput = nextLastOutput;

      // ✅ NODE LOG KAYDET (status zorunlu)
      const { error: logErr } = await supabase.from("flow_run_nodes").insert({
        run_id,
        node_id: currentNode.id,
        status: nodeStatus,
        output,
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
          },
          { status: 200 }
        );
      }

      // Eğer node içinde teknik hata oluştuysa run'ı error'a çek ve bitir
      if (nodeError) {
        await supabase
          .from("flow_runs")
          .update({ status: "error" })
          .eq("id", run_id);

        return NextResponse.json(
          { status: "error", run_id, node: currentNode.id },
          { status: 500 }
        );
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
          },
          { status: 200 }
        );
      }

      // ➡ SIRADAKİ NODE'U BUL
      const next = findNextOf(currentNode.id);
      if (!next) break;
      currentNode = next;
    }

    // Flow finished
    await supabase
      .from("flow_runs")
      .update({ status: "completed" })
      .eq("id", run_id);

    return NextResponse.json(
      { status: "completed", run_id, executed },
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
