# DeltaG TestLab (Next.js)

Bu klasor artik aktif TestLab uygulamasidir.
Eski `deltag-testlab` Vite uygulamasi deprecated durumdadir ve yeni calismalarda kullanilmamalidir.

## Calistirma

```bash
npm install
npm run dev
```

Varsayilan uygulama adresi:

- `http://127.0.0.1:3200`

Repo root'tan da su sekilde acilabilir:

```bash
pnpm run dev:testlab
```

## Docker

Image build:

```bash
docker build -t deltag-testlab-nextjs:latest -f blackthorn_testlab/Dockerfile blackthorn_testlab
```

Container calistirma:

```bash
docker run -d \
  --name deltag-testlab-3200 \
  --restart unless-stopped \
  -p 3200:3200 \
  --add-host host.docker.internal:host-gateway \
  -e API_TARGET=http://host.docker.internal:18080 \
  deltag-testlab-nextjs:latest
```

## API Proxy

Istemci istekleri `/api/*` altindan backend'e yonlendirilir.

- Varsayilan hedef: `http://127.0.0.1:8080`
- Ortam degiskeni ile degistir: `API_TARGET`

Ornek:

```bash
API_TARGET=http://127.0.0.1:9000 npm run dev
```

## Durum

- Aktif TestLab: `blackthorn_testlab`
- Port: `3200`
- Backend proxy: `/api/*`
- Kaynak ekran: `src/components/TestLabApp.tsx`
