# FlowCraft Otomasyon Platformu

> n8n benzeri, ama **sıfır maliyetli altyapı** + **güçlü görsel editör** + gelecekte **AI/agent destekli** otomasyon aracı.

Prod (V2 tabanı):  
`https://flowcraft-automation.vercel.app/`

---

## İçindekiler

- [FlowCraft nedir?](#flowcraft-nedir)
- [Mevcut Durum (V2 ve V3)](#mevcut-durum-v2-ve-v3)
- [Genel Mimari](#genel-mimari)
  - [Frontend](#frontend)
  - [Backend / API](#backend--api)
  - [Veritabanı](#veritabanı)
- [Ekranlar ve UX](#ekranlar-ve-ux)
  - [/flows – Flow listesi](#flows--flow-listesi)
  - [/flows/[id] – Flow Editörü](#flowsid--flow-editörü)
- [Veritabanı Şeması (Özet)](#veritabanı-şeması-özet)
- [API Genel Bakış](#api-genel-bakış)
- [Node Tipleri (V2 + V3 çekirdeği)](#node-tipleri-v2--v3-çekirdeği)
- [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
  - [1. Repo’yu klonla ve bağımlılıkları yükle](#1-repoyu-klonla-ve-bağımlılıkları-yükle)
  - [2. Supabase kurulumu](#2-supabase-kurulumu)
  - [3. Ortam değişkenleri](#3-ortam-değişkenleri)
  - [4. Lokal geliştirme](#4-lokal-geliştirme)
- [Flow Çalıştırma](#flow-çalıştırma)
- [V2 Kısıtları](#v2-kısıtları)
- [Yol Haritası (Özet)](#yol-haritası-özet)

---

## FlowCraft nedir?

FlowCraft, **node tabanlı** (düğümler ve oklar/edge’ler) bir otomasyon editörüdür.

Hedefler:

- **Sıfır maliyetli altyapı**
  - Supabase (Postgres + Auth)
  - Ücretsiz hosting (Vercel)
  - Kullanıcı isterse kendi API anahtarlarını (BYOK) kullanabilsin.

- **n8n benzeri ama daha derli toplu bir editör**
  - React Flow ile görsel akış editörü
  - Gelişmiş log ve run geçmişi
  - Gelecekte marketplace, AI/agent, e-ticaret botları vb.

- **Geleceğe dönük AI/agent vizyonu**
  - Yol haritasında FlowBrain (agent katmanı), FlowCommerce (e-ticaret botları),
    Trigger/Output/Error/Retry paketleri ve daha fazlası var.
  - Şu anda V2’de odak nokta: **sağlam çalışan bir çekirdek akış motoru + editör**,
    V3’te ise Trigger / Output / Error & Retry ve multi-user altyapısına giriş.

Kullanılan teknolojiler:

- **Next.js (App Router)**
- **React + React Flow**
- **Supabase** (veritabanı + Auth + JS client)
- **Vercel** (prod deploy)

Prod URL (V2 tabanı):

- `https://flowcraft-automation.vercel.app/`

---

## Mevcut Durum (V2 ve V3)

### V2 – Locked (kilitli, stabil temel)

V2 itibarıyla FlowCraft:

- **Tek kullanıcı odaklı**, multi-user henüz yok.
- **Tek ortam** (environment) var: dev/stage/prod ayrımı ürün içinde yok (deploy tarafında var).
- Manuel tetiklemeyle (Run butonu) çalışan bir otomasyon editörü.

Öne çıkan özellikler:

- Çalışan bir **Flow Editörü**:
  - Node tipleri:
    - `start`
    - `http_request`
    - `if`
    - `formatter`
    - `set_fields`
    - `log`
    - `execution_data`
    - `wait`
    - `stop_error`
  - Zoom paneli, autosave, manuel Kaydet butonu.
  - Flow adı/açıklamasını inline düzenleme (PATCH).
  - Sağda Node Ayar Paneli, solda Node Araç Paneli.

- **Çalışan bir executor (akış motoru)**:
  - `flow_diagrams` tablosundaki node ve edge’leri okur.
  - Start node’u bulur, edge’ler üzerinden sırayla ilerler.
  - Desteklenen node tiplerini yürütür.
  - Her node çalıştığında `flow_run_nodes` tablosuna log yazar.
  - `flow_runs` kaydının durumunu yönetir:
    - `queued → running → completed` veya `error`.

- **Vercel üzerinde canlı (prod) deploy**:
  - Supabase ile konuşur.
  - HTTP node’lar için `BASE_URL` mantığı:
    - `/api/...` gibi relative URL’leri otomatik prod domain ile birleştirir.

### V3 – Devam ediyor (Trigger / Output / Error & Retry + Auth)

V3’te başlayan ve kısmen biten özellikler:

- **Supabase Auth entegrasyonu**
  - `/login` ve `/register` sayfaları.
  - AppHeader üzerinden login/logout.
  - Save & Run aksiyonlarında “giriş yapmadan çalıştırma” engeli.

- **Trigger Paketi v1 – Webhook tarafı**
  - `POST /api/trigger/webhook?flow_id=...&token=...`
    - Flow’u **webhook ile tetikler**.
    - `trigger_type = "webhook"` ve `trigger_payload` Supabase’e kaydedilir.
    - Aynı request içinde `/api/run/execute` çağrılır.
  - `webhook_trigger` node:
    - Akışın giriş noktası olarak davranır.
    - `trigger_payload` (body + query + headers) bilgisini `lastOutput` içine koyar.
  - Executor:
    - `trigger_type`’a göre başlangıç node’u seçer (webhook_trigger / schedule_trigger / start).

- **Output Paketi v1 (çekirdek)**
  - `respond_webhook` node:
    - `statusCode` + `bodyMode` (`lastOutput | static | customJson`).
    - Webhook tetikliyse, run’ı `completed` yapar ve dış dünyaya HTTP cevabı dönmesini sağlar.
  - `send_email` node (backend tarafı hazır):
    - Provider: `resend` (RESEND_API_KEY).
    - `to`, `subject`, `body`, opsiyonel `from`.
    - Retry desteği.

- **Error & Retry v1 (backend)**
  - HTTP node:
    - `retryCount`, `retryDelayMs` ile tekrar deneme.
    - Output içinde `retries` meta bilgisi.
  - Send Email node:
    - Aynı retry mantığı.
  - Stop & Error node:
    - Akışı kontrollü bir şekilde “error” durumuna çekiyor, UI logları görebiliyor.

UI tarafında retry ayarları ve bazı V3 node’larının (json_parse, json_stringify vb.) panelde gösterilmesi devam eden işlerdir.

---

## Genel Mimari

### Frontend

- Konum: `src/app`
- Önemli sayfalar:
  - `/` – Ana sayfa (genelde `/flows`’a yönlendirme).
  - `/flows` – Flow listesini gösterir.
  - `/flows/[id]` – Belirli bir flow için editör ekranı.
  - `/login` – Giriş sayfası.
  - `/register` – Kayıt sayfası.

- Ana bileşenler:
  - **FlowEditorClient**
    - React Flow canvas.
    - Node ekleme/bağlama/silme.
    - Node ayar paneli.
    - Run Geçmişi & Log paneli entegrasyonu.
  - **RunOutputPanel**
    - Seçili run için node bazlı logları gösterir.
    - JSON çıktıları aç/kapa (collapse/expand).
    - “Sadece hata logları” filtresi, log sayacı.
  - **RunHistoryPanel**
    - Flow için geçmiş run’ları listeler (limit/offset, filtreler, “daha fazla yükle”).
  - **AppHeader**
    - Logo / isim.
    - Giriş / Kayıt / Çıkış butonları.
    - İleride workspace/user gösterimi için alan.

### Backend / API

Tüm backend, Next.js **route handler** (App Router) ile yazıldı.

Ana endpoint’ler:

- **Flow yönetimi**
  - `GET /api/flows` – Flow listesini döner.
  - `POST /api/flows` – Yeni flow oluşturur.
  - `GET /api/flows/[id]` – Tek bir flow’un detaylarını getirir.
  - `PATCH /api/flows/[id]` – Flow adını/açıklamasını günceller.
  - `DELETE /api/flows/[id]` – Flow siler.

- **Diagram (node + edge) yönetimi**
  - `GET /api/flows/[id]/diagram` – İlgili flow’un node ve edge’lerini getirir.
  - `POST /api/flows/[id]/diagram` – Node ve edge listesini upsert eder.

- **Run / executor**
  - `POST /api/run`
    - Gövde: `{ "flow_id": "..." }` (veya `payload` ile birlikte).
    - `flow_runs` tablosuna yeni bir run kaydı açar.
  - `POST /api/run/execute`
    - Gövde: `{ "run_id": "..." }`.
    - İlgili run’ı sırayla çalıştırır.
    - Her node için `flow_run_nodes` kaydı oluşturur.
    - Run sonucunu `completed` veya `error` yapar.
  - `GET /api/run/logs?run_id=...`
    - Belirli bir run için:
      - run status,
      - node log listesini döner.
  - `GET /api/run/history?flow_id=...&status=...&from=...&to=...&limit=...&offset=...`
    - Belirli bir flow’un geçmiş run’larını sayfalı olarak döner.

- **Trigger API’leri (V3)**
  - `POST /api/trigger/webhook?flow_id=...&token=...`
    - Dış dünyadan gelen webhook’larla flow tetikler.
    - İlgili run’ı oluşturur, `trigger_type = "webhook"` olarak kaydeder.
    - Aynı request içinde executor’ü çağırır (`/api/run/execute`).

- **Yardımcı**
  - `GET /api/env` – Basit test endpoint’i (Ping flow’lar vs için).

### Veritabanı

Back-end tamamen **Supabase Postgres** üzerinde çalışır.

- Flow yapısı: `flows` + `flow_diagrams`
- Run yapısı: `flow_runs` + `flow_run_nodes`
- V3 sonrasında: `workspace_id` + auth alanları da devreye giriyor.

Detay şema aşağıda.

---

## Ekranlar ve UX

### `/flows` – Flow listesi

- Tüm flow’lar listelenir:
  - İsim, açıklama, oluşturulma tarihi vb.
  - “Düzenle” butonu → Flow editörüne gider.
  - “Sil” butonu → Flow’u siler (V3’te confirm + toast ile güçlendirilecek).

- Üst tarafta hazır şablon butonları:
  - **“Ping Flow Oluştur”**
    - Basit ping testi yapan hazır bir flow oluşturur.
  - **“HTTP Check Flow Oluştur”**
    - Verilen endpoint’in HTTP durumunu kontrol eden flow oluşturur.
  - **“+ Yeni Flow”**
    - Boş bir flow oluşturur.

### `/flows/[id]` – Flow Editörü

Editör ekranı:

- **Üst bar**
  - Flow adı (inline düzenlenebilir).
  - Flow açıklaması (inline düzenlenebilir).
  - Autosave göstergesi.
  - **Kaydet** butonu.
  - **Çalıştır** (Run) butonu.
  - Son run’ın durumunu gösteren küçük rozet (başarılı / hatalı).

- **Sol panel – Node Araçları**
  - `Start Node Ekle`
  - `HTTP Node Ekle`
  - `IF Node Ekle`
  - `Formatter Node Ekle`
  - `Set/Fields Node Ekle`
  - `Log Node Ekle`
  - `Execution Data Node Ekle`
  - `Wait Node Ekle`
  - `Stop & Error Node Ekle`
  - (V3’te) `Webhook Trigger`, `Respond Webhook`, `Send Email` gibi node’lar.
  - Hazır şablonlar:
    - “Ping Flow Oluştur”
    - “HTTP Check Flow Oluştur”

- **Orta alan – Canvas (React Flow)**
  - Node kartları (start, http, if, formatter vb.).
  - Node’lar sürüklenip yer değiştirilebilir.
  - Handle noktalarından edge (bağlantı) çizilir.
  - Zoom in/out ve fitView kontrolü.

- **Sağ panel – Node Ayarları**
  - Seçili node’un ayarlarını gösterir:
    - HTTP node için: label, URL, method, retryCount, retryDelayMs (V3).
    - IF node için: mode, expected, fieldPath.
    - Formatter için: mode, fieldPath, targetPath.
    - Wait için: seconds/ms.
    - Stop & Error için: code, reason.
    - Send Email için: to, subject, body, from, retryCount, retryDelayMs (UI tarafı V3’te).
    - Respond Webhook için: statusCode, bodyMode, bodyText/bodyJson.
  - Node seçili değilse bilgilendirici boş mesaj.

- **Alt panel – Run Geçmişi & Loglar**
  - **Run Geçmişi** sekmesi:
    - Geçmiş run’ların listesi.
    - Duruma göre filtreler (hepsi, başarılı, hatalı).
    - Tarih filtresi (ör: son 24 saat vb.).
    - “Daha fazla yükle” ile sayfalama.
  - **Loglar** sekmesi:
    - Seçili run için node logları.
    - Her log satırında node adı, durum (success/error).
    - JSON detayını aç/kapa.
    - “Sadece hata loglarını göster” filtresi.
    - Gösterilen log sayacı (X/Y).

### Kısayollar (V2/V3)

- `Ctrl + S` → Diyagramı kaydet.
- `Ctrl + Enter` → Flow’u çalıştır (Run).
- `Delete` → Seçili node’u sil.

---

## Veritabanı Şeması (Özet)

> Not: Alan tipleri Supabase’teki gerçek schema’ya göre küçük farklar içerebilir, mantıksal yapı aşağıdaki gibidir.

### `flows`

Flow meta bilgileri:

- `id` – birincil anahtar (text/uuid).
- `name` – flow adı.
- `description` – açıklama (opsiyonel).
- `workspace_id` – (V3 ile birlikte) ilgili workspace.
- `created_at`, `updated_at`.

### `flow_diagrams`

Node ve edge bilgileri:

- `id` – PK.
- `flow_id` – `flows.id` ile ilişkili.
- `workspace_id` – workspace (V3).
- `nodes` – JSON (React Flow node array).
- `edges` – JSON (React Flow edge array).
- `created_at`, `updated_at`.

### `flow_runs`

Her run için bir kayıt:

- `id` – PK.
- `flow_id` – ilgili flow.
- `workspace_id` – workspace (V3).
- `status` – `"queued" | "running" | "completed" | "error"`.
- `trigger_type` – `"manual" | "webhook" | "schedule"` (şu an manual + webhook aktif).
- `trigger_payload` – webhook/schedule için gelen veri (jsonb).
- `payload` – run başlatırken verilen giriş verisi (manual).
- `final_output` – son node’un çıktısı (JSON).
- `error_message` – hata varsa metin.
- `created_at`, `started_at`, `finished_at`, `duration_ms`.

### `flow_run_nodes`

Her node çalıştırması için log satırı:

- `id` – PK.
- `run_id` – `flow_runs.id` ile ilişkili.
- `node_id` – diyagramdaki node’un id’si.
- `workspace_id` – workspace (V3).
- `status` – `"success" | "error"`.
- `output` – JSON (HTTP cevabı, IF sonucu, formatter output’u vb.).
- `created_at`.

---

## API Genel Bakış

### Flow API’leri

```http
GET    /api/flows
POST   /api/flows
GET    /api/flows/[id]
PATCH  /api/flows/[id]
DELETE /api/flows/[id]
