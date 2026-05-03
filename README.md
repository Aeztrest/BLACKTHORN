# DeltaGuard (DeltaG)

Solana **VersionedTransaction** için simülasyon + politika tabanlı **güvenli / riskli** kararı üreten HTTP API; isteğe bağlı **x402** ödemesi ve **React demo arayüzü** içerir.

---

## 30 saniyede

| Soru | Cevap |
|------|--------|
| **Ne yapar?** | İşlemi zincire göndermeden önce RPC’de simüle eder, kurallara göre `safe` ve `reasons` döner. |
| **Nasıl çalıştırırım?** | `pnpm install` → `pnpm dev` (API) + ayrı terminalde `pnpm dev:web` (arayüz). |
| **Docker?** | Repo kökünde `docker compose up --build -d` → arayüz genelde **5173**, API doğrudan **18080** (8080 çakışmalarına karşı). |

---

## Biraz daha detay: ne işe yarar?

1. **Entegratör / cüzdan** base64 işlem ve isteğe bağlı `policy` gönderir (`POST /v1/analyze`).
2. Sunucu **hesap ön-fetch** + **`simulateTransaction`** çalıştırır; SOL/SPL tahmini, risk sinyalleri üretir.
3. **Policy motoru** aynı girdide her zaman aynı çıktıyı verecek şekilde **`safe: boolean`** ve **`reasons`** üretir.

Simülasyon gerçek yürütmeyi garanti etmez; sınırlar için [LIMITATIONS.md](LIMITATIONS.md).

---

## Gereksinimler

- **Node.js** ≥ 20  
- **pnpm** 9.x (`packageManager` alanına uy)  
- **Docker** + Docker Compose (isteğe bağlı, tam stack için)

---

## Hızlı başlangıç (kaynak)

```bash
git clone https://github.com/Aeztrest/Delta_G.git
cd Delta_G
pnpm install
cp apps/server/.env.example apps/server/.env
# .env içinde RPC URL'leri ve DELTAG_API_KEYS düzenle

pnpm dev              # API → varsayılan :8080
pnpm dev:web          # Arayüz → :5173 (başka terminal)
```

İkisini birden: `pnpm dev:all`

**Demo arayüz sekmeleri:** Ana sayfa, Mimari (diyagramlar), Güvenlik taraması, Jüri laboratuvarı, Geliştirici konsolu.

---

## Docker ile çalıştırma

```bash
docker compose up --build -d
```

| Servis | Varsayılan erişim |
|--------|-------------------|
| Web (Nginx + statik UI) | `http://<sunucu>:5173` |
| API (doğrudan) | `http://<sunucu>:18080` |

Varsayılan API anahtarı (compose): `docker-demo-key` — üretimde mutlaka değiştir.

Host **8080** sık sık başka servislerde (ör. Coolify) kullanıldığı için API dış portu **18080**’dir; `DELTAG_HOST_API_PORT` ile değiştirilebilir.

---

## Proje yapısı (parça parça)

```
Delta_G/
├── apps/
│   ├── server/          # Fastify API (TypeScript)
│   │   ├── src/         # routes, policy, risk, x402, RPC
│   │   └── Dockerfile
│   └── web/             # Vite + React demo
│       └── src/         # sayfalar, Mermaid mimari, jüri lab
├── docker-compose.yml   # api + web
├── pnpm-workspace.yaml
├── LIMITATIONS.md       # simülasyon, x402, rate limit sınırları
└── apps/server/openapi.yaml
```

- **`apps/server`**: `POST /v1/analyze`, `/health`, `/health/ready`; Zod doğrulama; `@solana/web3.js`; isteğe bağlı `@x402/core`.  
- **`apps/web`**: Backend’e göreli `/v1` ve `/health` ile konuşur (Vite proxy veya Docker Nginx).

---

## API özeti

| Endpoint | Açıklama |
|----------|-----------|
| `GET /health` | Canlılık |
| `GET /health/ready` | RPC (+ x402 açıksa facilitator) hazırlığı |
| `POST /v1/analyze` | Gövde: `cluster`, `transactionBase64`, isteğe bağlı `policy`, `userWallet`, … |

Ayrıntılı şema: [apps/server/openapi.yaml](apps/server/openapi.yaml)

---

## Ortam değişkenleri

Örnek ve açıklamalar: [apps/server/.env.example](apps/server/.env.example)

Önemliler: `RPC_*`, `DELTAG_API_KEYS`, `X402_*`, `DELTAG_AUTH_MODE`, `DELTAG_TRUST_PROXY` (reverse proxy arkasında).

---

## Komutlar (özet)

| Komut | Ne yapar |
|--------|-----------|
| `pnpm dev` | API geliştirme sunucusu |
| `pnpm dev:web` | Demo arayüz |
| `pnpm dev:all` | İkisi paralel |
| `pnpm build` | Sunucu derlemesi |
| `pnpm build:web` | Arayüz production build |
| `pnpm test` | Sunucu birim testleri |
| `pnpm docker:up` | `docker compose up --build -d` |

---

## Lisans

MIT — bakınız [LICENSE](LICENSE).

---

## Depo

Kaynak: [github.com/Aeztrest/Delta_G](https://github.com/Aeztrest/Delta_G)
