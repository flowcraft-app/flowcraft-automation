"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

// V3'te TS sıkılaştıracağız, şimdilik gevşek tip
type SimpleUser = any;

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<SimpleUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (error) {
          console.warn("Supabase getUser hatası:", error.message);
          setUser(null);
        } else {
          setUser(data?.user ?? null);
        }
      } catch (err) {
        console.error("getUser beklenmeyen hata:", err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
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

  async function handleLogout() {
    try {
      setSigningOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("signOut hatası:", error.message);
        alert("Çıkış yapılırken bir hata oluştu.");
      }
    } catch (err) {
      console.error("signOut beklenmeyen hata:", err);
    } finally {
      setSigningOut(false);
      router.push("/login");
    }
  }

  // Login / Register sayfalarında auth butonlarını sakla
  const onAuthPage =
    pathname?.startsWith("/login") || pathname?.startsWith("/register");

  // Login/Register'a giderken redirect param ekle (örn: /flows/[id])
  const redirectParam =
    pathname && !onAuthPage
      ? `?redirect=${encodeURIComponent(pathname)}`
      : "";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  return (
    <header className="h-12 flex items-center border-b border-slate-800 bg-slate-950/90 backdrop-blur px-4 z-20">
      {/* SOL: Logo + nav */}
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={() => router.push("/flows")}
          className="flex items-center gap-2"
        >
          <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-[11px] text-slate-950">
            FC
          </div>
          <div className="flex flex-col items-start">
            <span className="font-semibold text-xs leading-tight">
              FlowCraft
            </span>
            <span className="text-[10px] text-slate-400 leading-tight">
              Otomasyon Editörü · V3 Preview
            </span>
          </div>
        </button>

        <nav className="flex items-center gap-2 text-[11px] text-slate-400">
          <Link
            href="/flows"
            className={`px-2 py-1 rounded ${
              isActive("/flows")
                ? "bg-slate-800 text-slate-50"
                : "hover:bg-slate-900 hover:text-slate-100"
            }`}
          >
            Flows
          </Link>
          {/* İlerde /templates, /docs vs. buraya eklenebilir */}
        </nav>
      </div>

      {/* SAĞ: Auth alanı */}
      <div className="flex items-center gap-2 justify-end flex-1 text-[11px]">
        {loading ? (
          <span className="text-slate-400 text-[11px]">Kullanıcı yükleniyor...</span>
        ) : user ? (
          <>
            {/* Kullanıcı badge */}
            <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded border border-slate-700 bg-slate-900/80 max-w-[220px]">
              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-slate-950">
                {(user.email?.[0] ?? "U").toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] text-slate-100 truncate">
                  {user.email ?? "Kullanıcı"}
                </span>
                <span className="text-[10px] text-emerald-300">
                  V3 Preview
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push("/flows")}
              className="px-3 py-1 rounded-md border border-slate-700 text-[11px] hover:border-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Flow’larım
            </button>

            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="px-3 py-1 rounded-md bg-red-500 text-[11px] font-medium text-slate-950 hover:bg-red-400 transition-colors disabled:opacity-60"
            >
              {signingOut ? "Çıkış yapılıyor..." : "Çıkış"}
            </button>
          </>
        ) : onAuthPage ? null : (
          <>
            <button
              onClick={() => router.push(`/login${redirectParam}`)}
              className="px-3 py-1 rounded-md border border-slate-700 text-[11px] hover:border-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Giriş
            </button>
            <button
              onClick={() => router.push(`/register${redirectParam}`)}
              className="px-3 py-1 rounded-md bg-emerald-500 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              Kayıt ol
            </button>
          </>
        )}
      </div>
    </header>
  );
}
