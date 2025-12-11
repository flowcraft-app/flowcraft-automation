"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // /login?redirect=/flows/123 gibi gelirse, oraya geri gönderelim
  const redirect = searchParams.get("redirect") || "/flows";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Giriş başarılı → redirect paramına ya da /flows'a gönder
      router.push(redirect);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError("Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="w-full max-w-5xl mx-auto px-4 py-10">
        <div className="grid gap-10 md:grid-cols-2 items-center">
          {/* Sol taraf: Tanıtım / görsel alan */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-900/20 px-3 py-1 text-[11px] text-emerald-200">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold">
                FC
              </span>
              FlowCraft · Otomasyon Editörü (V2 çekirdek)
            </div>

            <h1 className="text-2xl md:text-3xl font-bold leading-snug">
              FlowCraft hesabınla{" "}
              <span className="text-emerald-400">
                akışlarını yönet, test et ve gözlemle.
              </span>
            </h1>

            <p className="text-sm text-slate-300">
              FlowCraft, API isteklerini, kontrolleri (IF), logları ve bekleme
              adımlarını görsel olarak bağlayabileceğin bir otomasyon
              editörüdür. Tek ekrandan hem akış tasarla hem de run loglarını
              incele.
            </p>

            <div className="grid gap-3 text-xs text-slate-200">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[13px]">
                    Örnek akış: Ping HTTP Flow
                  </span>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 text-[10px]">
                    Start → HTTP → Log
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5">
                    🚀 Start node ile tetikle
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5">
                    🌐 HTTP node ile API'yi çağır
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5">
                    📜 RunOutputPanel'de logları izle
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Giriş yaptıktan sonra{" "}
                <span className="text-emerald-300 font-medium">
                  /flows
                </span>{" "}
                sayfasından hazır Ping & HTTP Check şablonlarını deneyebilirsin.
              </p>
            </div>
          </div>

          {/* Sağ taraf: Login formu */}
          <div className="md:ml-auto">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl p-6 sm:p-7">
              <h2 className="text-xl font-semibold mb-1 text-center">
                FlowCraft’e giriş yap
              </h2>
              <p className="text-xs text-slate-400 mb-5 text-center">
                hesabınla oturum aç ve akışlarını yönetmeye devam et.
              </p>

              {redirect && redirect !== "/flows" && (
                <p className="text-[11px] text-slate-500 mb-3 text-center">
                  Girişten sonra yönleneceğin sayfa:{" "}
                  <span className="font-mono text-emerald-400">
                    {redirect}
                  </span>
                </p>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">E-posta</label>
                  <input
                    type="email"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@mail.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">Şifre</label>
                  <input
                    type="password"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Giriş yapılıyor..." : "Giriş yap"}
                </button>
              </form>

              <div className="mt-4 text-[11px] text-slate-500 text-center">
                Henüz hesabın yok mu?{" "}
                <button
                  type="button"
                  className="text-emerald-300 underline underline-offset-2"
                  onClick={() =>
                    router.push(
                      `/register?redirect=${encodeURIComponent(redirect)}`
                    )
                  }
                >
                  Kayıt ol
                </button>
              </div>

              <p className="mt-3 text-[10px] text-slate-500 text-center">
                Giriş yaparak FlowCraft V2 çekirdek deneyimini kabul etmiş
                olursun. V3’te workspace & RBAC gibi gelişmiş özellikler
                eklenecek.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
