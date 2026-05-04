# BLACKTHORN

Solana işlemlerini zincire göndermeden önce simüle eden, analiz eden ve politika tabanlı **güvenli / riskli** kararı üreten güvenlik altyapısı.

---

## Ne yapar?

Kullanıcı bir işlemi imzalamadan önce BLACKTHORN devreye girer:

1. İşlemi RPC üzerinde simüle eder — gerçek sonuçları önceden görür
2. Risk dedektörlerini çalıştırır: fund drain, wallet drainer, CPI derinliği, program reputation, token approval
3. DSL tabanlı policy motorundan `safe: boolean` + `reasons` döner
4. Sonuç kullanıcıya gösterilir; tehlikeli işlem bloklanır

---

## Monorepo Yapısı

```
apps/
├── server/       # Fastify API — transaction analiz motoru
├── showcase/     # 5 sahte site — kullanıcı perspektifli demo
├── web/          # React/Vite frontend (DeltaG UI)
└── dashboard/    # Next.js yönetim paneli
packages/
├── wallet-adapter/    # Wallet entegrasyon paketi
└── browser-extension/ # Tarayıcı eklentisi
```

---

## Showcase — Canlı Demo

`apps/showcase` — 5 bağımsız "sahte site", her biri gerçek bir Solana senaryosunu canlandırıyor. Swig Wallet entegrasyonu ile extension olmadan bağlan, işlem yap, BLACKTHORN'un tehdidi nasıl yakaladığını gör.

| Site | Senaryo | BLACKTHORN Tespiti |
|------|---------|---------------------|
| **SolSwap** | Token swap | Fund drain · Unknown program |
| **PixelDrop** | NFT mint | Wallet drainer · Token authority theft |
| **SolYield** | Liquid staking | Unverified pool · No unstake path |
| **ClaimHub** | Airdrop claim | Phishing · Unlimited token approval |
| **LaunchPad** | Token launch | Rug pull · Mint authority · No LP lock |

```bash
pnpm dev:showcase   # → http://localhost:5174
```

Her site: kendi renk/logo kimliği, Swig Wallet bağlantısı, "danger mode" toggle'ı, Blackthorn analiz overlay'i.

---

## Hızlı Başlangıç

```bash
git clone https://github.com/Aeztrest/BLACKTHORN.git
cd BLACKTHORN
pnpm install
cp apps/server/.env.example apps/server/.env
# .env içinde RPC_* ve DELTAG_API_KEYS ayarla

pnpm dev            # API → :8080
pnpm dev:showcase   # Showcase → :5174
pnpm dev:web        # DeltaG UI → :5173
```

---

## Docker

```bash
docker compose up --build -d
```

| Servis | Port |
|--------|------|
| API | 18080 |
| Web UI | 5173 |

---

## API

```
POST /v1/analyze
{
  "cluster": "mainnet-beta" | "devnet" | "testnet",
  "transactionBase64": "<base64 VersionedTransaction>",
  "policy": { ... },       // opsiyonel
  "userWallet": "<pubkey>" // opsiyonel
}
```

Yanıt: `safe`, `reasons`, `riskFindings`, `estimatedChanges`, `simulationWarnings`

Tam şema: [apps/server/openapi.yaml](apps/server/openapi.yaml)

---

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `pnpm dev` | API sunucusu |
| `pnpm dev:showcase` | Showcase demo sitesi |
| `pnpm dev:web` | DeltaG UI |
| `pnpm dev:dashboard` | Dashboard |
| `pnpm dev:all` | API + Web + Dashboard paralel |
| `pnpm build` | API production build |
| `pnpm build:showcase` | Showcase production build |
| `pnpm test` | Sunucu unit testleri |
| `pnpm docker:up` | Docker stack |

---

## Ortam Değişkenleri

Örnek ve açıklamalar: [apps/server/.env.example](apps/server/.env.example)

Kritikler: `RPC_MAINNET_BETA`, `DELTAG_API_KEYS`, `X402_ENABLED`, `X402_PAY_TO`

---

## x402 Entegrasyonu

`POST /v1/analyze` isteğe bağlı olarak x402 payment wall ile korunabilir. PayAI facilitator (`https://facilitator.payai.network`) üzerinden per-request SOL ödemesi.

`X402_ENABLED=true` + `X402_PAY_TO=<solana_adresi>` ile aktif edilir.

---

## Simülasyon Sınırları

Bkz. [LIMITATIONS.md](LIMITATIONS.md) — simülasyon gerçek yürütmeyi garanti etmez.

---

## Lisans

MIT — [LICENSE](LICENSE)
