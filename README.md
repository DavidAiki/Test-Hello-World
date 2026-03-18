# KAN-6 — Sichere Hello-World Website

## Stack
- nginx:alpine (Docker)
- Plain HTML + CSS (kein JS, kein eval())
- HTTPS mit SSL
- OWASP Security Headers

## Lokal starten

### 1. Self-signed Zertifikat generieren
```bash
mkdir certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/CN=hello-world.local"
```

### 2. Hosts-Eintrag setzen
```bash
echo "127.0.0.1 hello-world.local" >> /etc/hosts
```

### 3. Docker starten
```bash
docker-compose up -d
```

### 4. Im Browser öffnen
```
https://hello-world.local
```

## Security Headers prüfen
```bash
curl -I https://hello-world.local --insecure
```

## Akzeptanzkriterien
- [x] "Hello" blau (#0000FF)
- [x] "World" grün (#00AA00)
- [x] HTTPS konfiguriert
- [x] CSP Header gesetzt
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] Responsive Design (clamp() für Font-Size)
- [x] Kein JavaScript / kein eval()
