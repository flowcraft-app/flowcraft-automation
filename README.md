# FlowCraft Otomasyon Platformu

> n8n benzeri, ama sıfır maliyetli altyapı + güçlü görsel editör + gelecekte AI/agent destekli otomasyon aracı.

---

## İçindekiler

- [FlowCraft nedir?](#flowcraft-nedir)
- [Mevcut Durum (V2)](#mevcut-durum-v2)
- [Genel Mimari](#genel-mimari)
  - [Frontend](#frontend)
  - [Backend / API](#backend--api)
  - [Veritabanı](#veritabanı)
- [Ekranlar ve UX](#ekranlar-ve-ux)
  - [/flows – Flow listesi](#flows--flow-listesi)
  - [/flows/[id] – Flow Editörü](#flowsid--flow-editörü)
- [Veritabanı Şeması (Özet)](#veritabanı-şeması-özet)
- [API Genel Bakış](#api-genel-bakış)
- [Node Tipleri (V2)](#node-tipleri-v2)
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
  - Şu anda V2’de odak nokta: **sağlam çalışan bir çekirdek akış motoru + editör**.

Teknolojiler:

- **Next.js (App Router)**
- **React 19 + React Flow**
- **Supabase** (veritabanı + JS client)
- **Vercel** (prod deploy)

Prod URL (V2):

- `https://flowcraft-automation.vercel.app/`

---

## Mevcut Durum (V2)

V2 itibarıyla FlowCraft:

- **Tek kullanıcı odaklı**, multi-user henüz yok.  
- **Tek ortam** (environment) var: dev/stage/prod ayrımı yok.  
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
  - Zoom panelleri, autosave, manuel Kaydet butonu.
  - Flow adı/açıklamasını inline düzenleme.
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
  - HTTP node’lar için `BASE_URL` mantığı vardır:
    - `/api/...` gibi relative URL’leri otomatik domain ile birleştirir.

---

## Genel Mimari

### Frontend

- Konum: `src/app`
- Önemli sayfalar:
  - `/` – Ana sayfa veya `/flows`’a yönlendirme.
  - `/flows` – Flow listesini gösterir.
  - `/flows/[id]` – Belirli bir flow için editör ekranı.

- Ana bileşenler:
  - **FlowEditorClient**
    - React Flow canvas
    - Node ekleme/bağlama
    - Node ayar paneli
    - Run Geçmişi & Log paneli entegrasyonu
  - **RunOutputPanel**
    - Seçili run için node bazlı logları gösterir.
    - JSON çıktıları aç/kapa (collapse/expand).
  - **RunHistoryPanel**
    - Flow için geçmiş run’ları listeler (limit/offset, filtreler, “daha fazla yükle”).

### Backend / API

Tüm backend Next.js route handler’larıyla yazıldı (App Router).

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
    - Gövde: `{ "flow_id": "..." }`
    - `flow_runs` tablosuna yeni bir run kaydı açar.
  - `POST /api/run/execute`
    - İlgili run’ı sırasıyla çalıştırır.
    - Her node için `flow_run_nodes` kaydı oluşturur.
    - Run sonucunu `completed` veya `error` yapar.
  - `GET /api/run/logs?run_id=...`
    - Belirli bir run için:
      - run status,
      - node log listesini döner.
  - `GET /api/run/history?flow_id=...&status=...&from=...&to=...&limit=...&offset=...`
    - Belirli bir flow’un geçmiş run’larını sayfalı olarak döner.

- **Yardımcı**
  - `GET /api/env` – Basit test endpoint’i (Ping flow’lar vs için).

### Veritabanı

Back-end tamamen **Supabase Postgres** üzerinde çalışır.

- Flow yapısı: `flows` + `flow_diagrams`
- Run yapısı: `flow_runs` + `flow_run_nodes`

Detay şema aşağıda.

---

## Ekranlar ve UX

### `/flows` – Flow listesi

- Tüm flow’lar listelenir:
  - İsim, açıklama, oluşturulma tarihi vb.
  - “Düzenle” butonu → Flow editörüne gider.
  - “Sil” butonu → Flow’u siler (V2’de onay zayıf, V3’te confirm + toast eklenecek).

- Üst tarafta hazır şablon butonları:
  - **“Ping Flow Oluştur”**
    - Basit ping testi yapan hazır bir flow oluşturur.
  - **“HTTP Check Flow Oluştur”**
    - Verilen endpoint’in HTTP durumunu kontrol eden flow oluşturur.
  - **“+ Yeni Flow”**
    - Boş bir flow oluşturur.

### `/flows/[id]` – Flow Editörü

Editör ekranının bölümleri:

- **Üst bar**
  - Flow adı (inline düzenlenebilir).
  - Flow açıklaması (inline düzenlenebilir).
  - Autosave göstergesi.
  - **Kaydet** butonu.
  - **Çalıştır** butonu.
  - Son run’ın durumunu gösteren küçük rozet:
    - Başarılı / Hatalı gibi.

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
  - Hazır şablonlar:
    - “Ping Flow Oluştur”
    - “HTTP Check Flow Oluştur”

- **Orta alan – Canvas (React Flow)**
  - Node kartları (start, http, if, formatter vb.)
  - Node’lar sürüklenip yer değiştirilebilir.
  - Küçük daire (handle) noktalarından edge (bağlantı) çizilir.
  - Zoom in/out ve fitView kontrolü.

- **Sağ panel – Node Ayarları**
  - Seçili node’un ayarlarını gösterir:
    - HTTP node için: label, URL, method, vs.
    - IF node için: mode, expected, fieldPath.
    - Formatter için: mode, fieldPath, targetPath.
    - Wait için: seconds.
    - Stop & Error için: code, reason.
  - Node seçili değilse boş mesaj.

- **Alt panel – Run Geçmişi & Loglar**
  - **Run Geçmişi** sekmesi:
    - Geçmiş run’ların listesi.
    - Duruma göre filtreler (hepsi, başarılı, hatalı).
    - Tarih filtresi (örneğin son 24 saat vb. – V2’de temel hali var).
    - “Daha fazla yükle” ile sayfalama.
  - **Loglar** sekmesi:
    - Seçili run için node logları.
    - Her log satırında node adı, durum (success/error).
    - JSON detayını aç/kapa.
    - “Sadece hata loglarını göster” filtresi.
    - Gösterilen log sayacı (X/Y).

### Kısayollar (V2)

- `Ctrl + S` → Diyagramı kaydet.
- `Ctrl + Enter` → Flow’u çalıştır (Run).
- `Delete` → Seçili node’u sil.

---

## Veritabanı Şeması (Özet)

> Not: Alan tipleri Supabase’teki gerçek schema’ya göre küçük farklar içerebilir, mantıksal yapı aşağıdaki gibidir.

### `flows`

Flow meta bilgileri:

- `id` – birincil anahtar (text/UUID).
- `name` – flow adı.
- `description` – açıklama (opsiyonel).
- `created_at`, `updated_at`.

### `flow_diagrams`

Node ve edge bilgileri:

- `id` – PK.
- `flow_id` – `flows.id` ile ilişkili.
- `nodes` – JSON (React Flow node array).
- `edges` – JSON (React Flow edge array).
- `created_at`, `updated_at`.

### `flow_runs`

Her run için bir kayıt:

- `id` – PK.
- `flow_id` – ilgili flow.
- `status` – `"queued" | "running" | "completed" | "error"`.
- `trigger_type` – `"manual"` (V2’de sadece bu).
- `payload` – run başlatırken verilen giriş verisi (opsiyonel).
- `final_output` – son node’un çıktısı (JSON).
- `error_message` – hata varsa metin.
- `created_at`, `started_at`, `finished_at`, `duration_ms`.

### `flow_run_nodes`

Her node çalıştırması için bir log satırı:

- `id` – PK.
- `run_id` – `flow_runs.id` ile ilişkili.
- `node_id` – diyagramdaki node’un id’si.
- `status` – `"success" | "error"`.
- `output` – JSON (node’un çıktısı, HTTP cevabı, IF sonucu vb.).
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
