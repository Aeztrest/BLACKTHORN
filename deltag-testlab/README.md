# DeltaG TestLab

Deprecated: Bu Vite tabanli eski TestLab'dir. Aktif uygulama artik `/home/ubuntu/DeltaProtokol/blackthorn_testlab` altindaki Next.js surumudur.

DeltaG protokolunu teknik olmayan kullanicinin bile anlayabilecegi sekilde, ama tum kritik modulleriyle test etmek icin hazirlanan ayri bir test portali.

## Neleri test eder?

- `GET /health` ve `GET /health/ready`
- `POST /v1/analyze`
- `POST /v1/analyze/batch`
- `POST /v1/analyze/stream` (SSE)
- `POST /v1/replay`
- `GET /v1/audit/recent` + `GET /v1/audit/aggregate`
- `GET /mcp/tools` + `POST /mcp/call`
- x402 davranisi (anahtarsiz probe ile 401/402 dogrulama)

## Neden ayri?

Bu uygulama `apps/web`'den bagimsizdir ve kendi portunda calisir:

- TestLab: `3200`
- API hedefi varsayilan: `http://127.0.0.1:8080` (Vite proxy ile `/api` uzerinden)

## Calistirma

1) Backend'i ac:

```bash
cd /home/ubuntu/DeltaProtokol/apps/server
npm run dev
```

2) TestLab'i ac:

```bash
cd /home/ubuntu/DeltaProtokol/deltag-testlab
npm install
npm run dev
```

3) Tarayici:

- Yerel: `http://127.0.0.1:3200`
- Sunucu: `http://SUNUCU_IP:3200`

## API adresi farkliysa

```bash
VITE_API_TARGET=http://127.0.0.1:9000 npm run dev
```

## Gercekci devnet test akisi (onerilen)

1. Health + Ready ile altyapiyi dogrula.
2. Devnet signature ile gercek tx cekip analyze calistir.
3. Ayni tx'i batch + stream ile tekrar et (tutarlilik ve event akisi).
4. Replay ile slot bazli farklara bak.
5. Audit ekraninda gecmis/aggregate trendleri dogrula.
6. MCP arayuzuyle ayni mantigi agent tarafindan tetikle.
7. x402 probe ile odeme kapisi davranisini kontrol et.
