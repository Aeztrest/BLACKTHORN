# DeltaGuard — demo arayüzü

Vite + React. İstekler **proxy** ile `apps/server`’a gider; tarayıcıda CORS gerekmez.

## Sayfalar

| Sekme | Amaç |
|--------|------|
| **Ana sayfa** | Protokol özeti (jüri / yatırımcı) |
| **Mimari** | Mermaid diyagramları (dağıtım, istek sırası, analiz boru hattı) + bileşen sözlüğü |
| **Güvenlik taraması** | Son kullanıcıya yakın akış: API anahtarı, örnek tx, büyük güvenli/riskli kartı |
| **Jüri laboratuvarı** | Tek tık senaryolar: `/health`, `/health/ready`, 400, anahtarsız (401 veya **402 x402**), tam analiz |
| **Geliştirici** | Eski ham form + JSON konsolu |

**x402 canlı 402:** Sunucuda `X402_ENABLED=true`, uygun `X402_PAY_TO`, ve `DELTAG_AUTH_MODE=x402` (veya anahtarsız erişim) gerekir; aksi halde “anahtarsız” senaryosu **401** döner (normal).

## Çalıştırma

1. Backend (ayrı terminal, repo kökü):

   ```bash
   pnpm dev
   ```

   Varsayılan API: `http://127.0.0.1:8080` (`.env` ile `PORT` değişebilir).

2. Frontend:

   ```bash
   pnpm dev:web
   ```

   Yerelde: `http://127.0.0.1:5173`  
   Uzak sunucuda: `http://SUNUCU_IP:5173` (Vite `host: true` ile dinler.)

İkisini birden: `pnpm dev:all` (paralel).

### Uzak sunucuda sayfa açılmıyorsa

1. **Güvenlik duvarı / bulut security group:** `5173` (ve `pnpm dev` için `8080`) gelen trafiğe açık mı? Örnek: `sudo ufw allow 5173/tcp && sudo ufw allow 8080/tcp && sudo ufw reload`
2. **Docker kullanıyorsan:** `docker compose ps` ile `web` ve `api` çalışıyor mu; sunucuda `curl -sI http://127.0.0.1:5173` ilk satır `HTTP/1.1 200` olmalı.
3. **Yanlış URL:** Tarayıcıda `http://` kullan (sertifika yoksa `https://` çalışmaz).
4. **SSH tünel (port açmak istemezsen):** `ssh -L 5173:127.0.0.1:5173 kullanici@SUNUCU` sonra yerelde `http://127.0.0.1:5173` aç.

## Backend adresi farklıysa

```bash
VITE_API_TARGET=http://127.0.0.1:9000 pnpm --filter @deltag/web dev
```

## x402

Sunucuda `X402_ENABLED=true` iken tarayıcıdan tam ödeme akışı bu demo ile yapılmaz; API key + `DELTAG_AUTH_MODE` ile test edin veya x402 için ayrı istemci kullanın.
