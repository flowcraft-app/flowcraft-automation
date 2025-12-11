"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Örn: /register?redirect=/flows/xyz
  const redirect = searchParams.get("redirect") || "/flows";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== passwordAgain) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Supabase ayarına göre:
      // - Email confirmation açık ise: session genelde null olur
      // - Kapalı ise: kullanıcı direkt login olur ve session dolu gelir
      if (!data.session) {
        setInfo(
          "Kayıt tamamlandı. Eğer e-posta doğrulama açıksa, lütfen mailini kontrol et."
        );

        // Biraz bekleyip login sayfasına, redirect ile gönderelim
        setTimeout(() => {
          router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        }, 1500);
      } else {
        // Doğrulama kapalıysa direkt giriş yapılmış olur → redirect'e git
        router.push(redirect);
        router.refresh();
      }
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
          {/* Sol taraf: Tanıtım / feature alanı */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-900/20 px-3 py-1 text-[11px] text-sky-200">
              🚀 Yeni kullanıcı · FlowCraft V2
            </div>

            <h1 className="text-2xl md:text-3xl font-bold leading-snug">
              Dakikalar içinde{" "}
              <span className="text-emerald-400">
                kendi otomasyon akışını
              </span>{" "}
              kurmaya başla.
            </h1>

            <p className="text-sm text-slate-300">
              FlowCraft, “node” tabanlı bir otomasyon editörüdür. Start,
              HTTP, IF, Formatter, Log, Wait, Stop&Error gibi adımları
              sürükleyip bırakarak akışını tasarlarsın, Run ile
              çalıştırırsın, alttan loglarını izlersin.
            </p>

            <div className="grid gap-3 text-xs text-slate-200">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="mb-2 font-medium text-[13px]">
                  Kayıt olduktan sonra yapabileceklerin:
                </p>
                <ul className="space-y-1 text-[12px] text-slate-200">
                  <li>• /flows ekranından yeni flow’lar oluştur.</li>
                  <li>
                    • Hazır{" "}
                    <span className="text-emerald-300 font-medium">
                      Ping
                    </span>{" "}
                    ve{" "}
                    <span className="text-emerald-300 font-medium">
                      HTTP Check
                    </span>{" "}
                    şablonlarını dene.
                  </li>
                  <li>
                    • Run geçmişi ve log paneliyle her node’un çıktısını
                    incele.
                  </li>
                  <li>
                    • V3’te Webhook Trigger, Schedule Trigger, Send Email,
                    Respond Webhook gibi node’lar da gelecek.
                  </li>
                </ul>
              </div>

              <p className="text-[11px] text-slate-400">
                FlowCraft, n8n tarzı görsel akış mantığını hafif ve modern bir
                arayüzle sunmayı hedefliyor. Şu an V2 çekirdekteyiz; V3 ile
                çok kullanıcılı workspace & environments geliyor.
              </p>
            </div>
          </div>

          {/* Sağ taraf: Register formu */}
          <div className="md:ml-auto">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl p-6 sm:p-7">
              <h2 className="text-xl font-semibold mb-1 text-center">
                FlowCraft hesabı oluştur
              </h2>
              <p className="text-xs text-slate-400 mb-5 text-center">
                e-posta ve şifrenle hızlıca yeni bir hesap yarat.
              </p>

              {redirect && redirect !== "/flows" && (
                <p className="text-[11px] text-slate-500 mb-3 text-center">
                  Kayıttan sonra yönleneceğin sayfa:{" "}
                  <span className="font-mono text-emerald-400">
                    {redirect}
                  </span>
                </p>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
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
                    placeholder="En az 6 karakter"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">Şifre (tekrar)</label>
                  <input
                    type="password"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    value={passwordAgain}
                    onChange={(e) => setPasswordAgain(e.target.value)}
                    placeholder="Şifreyi tekrar gir"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                {info && (
                  <div className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
                    {info}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Kayıt yapılıyor..." : "Kayıt ol"}
                </button>
              </form>

              <div className="mt-4 text-[11px] text-slate-500 text-center">
                Zaten hesabın var mı?{" "}
                <button
                  type="button"
                  className="text-emerald-300 underline underline-offset-2"
                  onClick={() =>
                    router.push(
                      `/login?redirect=${encodeURIComponent(redirect)}`
                    )
                  }
                >
                  Giriş yap
                </button>
              </div>

              <p className="mt-3 text-[10px] text-slate-500 text-center">
                Şimdilik sadece e-posta & şifre ile kayıt alıyoruz. İleride
                Google / GitHub ile giriş gibi seçenekler eklenebilir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
