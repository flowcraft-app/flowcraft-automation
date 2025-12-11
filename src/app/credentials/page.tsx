"use client";

import React, { useEffect, useState } from "react";

type Credential = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at?: string;
  hasConfig: boolean;
};

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("api_key");
  const [configText, setConfigText] = useState('{\n  "apiKey": ""\n}');

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  async function loadCredentials() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/credentials");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Credential listesi alınamadı.");
      }

      const json = await res.json();
      setCredentials(json.credentials ?? []);
    } catch (err: any) {
      setError(err?.message || "Credential listesi alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCredentials();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      if (!name.trim()) {
        throw new Error("Lütfen bir isim gir.");
      }

      if (!type.trim()) {
        throw new Error("Lütfen bir type gir.");
      }

      let parsedConfig: any;
      try {
        parsedConfig = JSON.parse(configText);
      } catch (err) {
        throw new Error("Config geçerli bir JSON olmalı.");
      }

      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim(),
          config: parsedConfig,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Credential kaydedilemedi.");
      }

      setSubmitSuccess("Credential başarıyla kaydedildi.");
      setName("");
      setConfigText('{\n  "apiKey": ""\n}');

      // Listeyi yenile
      await loadCredentials();
    } catch (err: any) {
      setSubmitError(err?.message || "Credential kaydedilirken hata oluştu.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Credentials</h1>
        <p className="text-sm text-gray-400">
          API anahtarlarını ve diğer hassas bilgileri burada saklayıp
          node&apos;larda kullanacaksın.
        </p>
      </div>

      {/* Yeni credential formu */}
      <div className="border border-zinc-700 rounded-xl p-4 md:p-5 bg-zinc-900/50 space-y-4">
        <h2 className="text-lg font-medium">Yeni Credential Ekle</h2>

        {submitError && (
          <div className="text-sm text-red-400">{submitError}</div>
        )}
        {submitSuccess && (
          <div className="text-sm text-emerald-400">{submitSuccess}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">İsim</label>
              <input
                type="text"
                className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Örn: Main API Key"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Tür</label>
              <select
                className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="api_key">API Key</option>
                <option value="http_bearer">HTTP Bearer Token</option>
                <option value="basic">HTTP Basic Auth</option>
                <option value="smtp">SMTP / Email</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Config (JSON){" "}
              <span className="text-xs text-gray-400">
                Örn: API key, header name, username/password...
              </span>
            </label>
            <textarea
              className="w-full min-h-[140px] rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitLoading}
            className="inline-flex items-center px-4 py-2 rounded-md bg-emerald-600 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitLoading ? "Kaydediliyor..." : "Credential Kaydet"}
          </button>
        </form>
      </div>

      {/* Credential listesi */}
      <div className="border border-zinc-700 rounded-xl p-4 md:p-5 bg-zinc-900/30 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Kayıtlı Credentials</h2>
          <button
            type="button"
            onClick={loadCredentials}
            disabled={loading}
            className="text-xs px-3 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60"
          >
            Yenile
          </button>
        </div>

        {loading && (
          <div className="text-sm text-gray-400">
            Liste yükleniyor...
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400">
            Liste alınırken hata: {error}
          </div>
        )}

        {!loading && !error && credentials.length === 0 && (
          <div className="text-sm text-gray-400">
            Henüz hiç credential eklenmemiş.
          </div>
        )}

        {!loading && !error && credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{cred.name}</div>
                  <div className="text-xs text-gray-400">
                    {cred.type} •{" "}
                    {cred.hasConfig ? "Config var" : "Config yok"}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(cred.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
