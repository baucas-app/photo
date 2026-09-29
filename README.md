# BauCas Photos

Selbstgehostetes Fotoverwaltungssystem für die Synology NAS – Apple-Photos-ähnliche Erfahrung mit lokaler KI (semantische CLIP-Suche, YOLO-Tagging, Gesichtserkennung), ohne Cloud-Abhängigkeit.

## Features

**Mediathek & Ansicht**
- Chronologische Timeline mit Cursor-Pagination und Zoom-Stufen (Tag / Monat / Jahr)
- Foto-Viewer mit Filmstreifen, Live-Photo-Loop, AirPlay, 360°-Panorama, Slideshow
- Karten-Ansicht (GPS-Pins aus EXIF)
- Erinnerungen: „Heute vor N Jahren"-Rückblick
- Archiv & Papierkorb (30 Tage automatische Bereinigung)
- Foto-Editor: Drehen, Zuschneiden, Helligkeit/Kontrast (nicht-destruktiv, Revert möglich)

**Alben & Sammlungen**
- Manuelle Alben mit Unteralben (beliebig tief), Drag-and-Drop-Sortierung im Web
- Smart-Alben (regelbasierte Filterung)
- Tag-Gruppen & Benutzer-Labels für eigene Klassifikationen
- Reisen: GPS-basierte Zeiträume als eigene Sammlung

**Backup (iOS → Server)**
- Manuell und automatisch im Hintergrund (BGProcessingTask)
- Konfigurierbar: Ziel-Album, Monats-Unteralben, Dateiname-Template, Netzwerk-Präferenz (WLAN / Mobilfunk)
- Live Activity / Dynamic Island während des Uploads
- Live Photos als verkettetes Paar (Motion-Video + Still)
- Optionales Löschen nach erfolgreichem Upload

**Teilen & Zusammenarbeit**
- Geteilte Alben mit Rollen (Betrachter / Editor)
- Öffentliche Freigabe-Links (mit optionalem Passwortschutz)
- Partner-Bibliothek: eine andere Person sieht die eigene Mediathek read-only
- Album-Kommentare

**Suche & KI**
- Semantische CLIP-Suche (Freitext über Bildinhalt)
- Objekt-Tags via YOLO (automatisch bei Upload)
- Gesichtserkennung + Clustering (Cosinus-Ähnlichkeit)
- Kamera-Facetten (nach Make/Model aus EXIF filtern)
- Duplikat-Erkennung via Perceptual Hash (aHash, Hamming-Distanz ≤ 6)

**Verwaltung**
- Mehrere Konten auf unterschiedlichen Servern (iOS: per Account-ID getrennte Keychain-Einträge)
- API-Keys für direktes Einbetten von Bild-URLs (`?apiKey=...` oder `X-Api-Key`-Header)
- OAuth 2.0 (Google)
- Admin-Panel: Nutzer anlegen, git-Pull + Container-Neustart, Server-Backups (pg_dump)
- Push-Benachrichtigungen (APNS)
- Dawarich-kompatibler Endpunkt für GPS-Export

---

## Architektur

```
ios/                iOS-App (SwiftUI, iOS 26+, xcodegen)
frontend/           Web-UI (React + Vite + TypeScript)
backend/            REST-API (Node.js/Express + TypeScript, Prisma)
backup-worker/      BullMQ-Worker: führt die ML-Pipeline pro Foto aus
ml-service/         Python/FastAPI: CLIP-Embeddings, YOLO-Tagging, Gesichtserkennung
packages/database/  Gemeinsamer Prisma-Client (backend + backup-worker)
packages/shared/    Gemeinsame TS-Utilities (Vektor-Mathe, ml-service-Client, Job-Typen)
cli/                Node-Skript für Bulk-Uploads von der Kommandozeile
```

Das Dateisystem unter `STORAGE_ROOT` (`/photos` im Container) ist die Wahrheit für Dateien;
Postgres ist die Wahrheit für Metadaten. Jeder `assets.path`/`albums.path` ist relativ zu
`STORAGE_ROOT`, z.B. `2024/Urlaub/Barcelona/photo1.jpg`.

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js 22+, npm 10+
- Docker + Docker Compose
- Xcode 16+ und [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) für die iOS-App
- PostgreSQL + Redis lokal (oder via Docker)

### Setup

```bash
npm install                           # alle Workspaces (backend, frontend, backup-worker, packages/*)
cp backend/.env.example backend/.env  # DATABASE_URL, JWT-Secrets, STORAGE_ROOT anpassen

npm run prisma:generate    # Prisma-Client generieren
npm run prisma:migrate:dev # Schema migrieren

# Backend ohne Watch-Modus starten (tsx watch hängt sich in Synology-Drive-Pfaden auf):
cd backend && ../node_modules/.bin/tsx src/index.ts

npm run dev:frontend       # Web-UI auf :5173 (proxied /api → :3001)
npm run dev:worker         # ML-Worker (braucht Redis + laufenden ml-service)
```

ML-Service lokal: `cd ml-service && pip install -r requirements.txt && uvicorn app.main:app --reload`

> **Synology-Drive-Hinweis:** `tsx watch` / `npm run dev:backend` hängt im Sync-Pfad – immer ohne Watch starten. `pip install` in einer `.venv` innerhalb des Sync-Ordners kann Pakete korrumpieren; notfalls `.venv` unter `/tmp` anlegen und nur das Ergebnis ins Projekt übernehmen.

### iOS-App (Simulator)

```bash
cd ios
xcodegen generate    # erzeugt Photos.xcodeproj aus project.yml
```

Build + Install auf dem Simulator (fixierter DerivedData-Pfad vermeidet Synology-Drive-Konfliktkopien):

```bash
xcodebuild -project Photos.xcodeproj -scheme Photos \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -configuration Debug -derivedDataPath /tmp/photos-build build

SIMULATOR_ID=$(xcrun simctl list devices booted | grep "iPhone 17" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
xcrun simctl terminate "$SIMULATOR_ID" de.baucas.photos 2>/dev/null || true
xcrun simctl uninstall "$SIMULATOR_ID" de.baucas.photos
xcrun simctl install  "$SIMULATOR_ID" /tmp/photos-build/Build/Products/Debug-iphonesimulator/Photos.app
xcrun simctl launch   "$SIMULATOR_ID" de.baucas.photos
```

Beim ersten Start fragt die App nach der Server-Adresse (z.B. `http://192.168.178.61:3001`). Danach Login oder Registrierung; der erste registrierte Account wird automatisch Admin.

---

## Deployment auf der Synology NAS

Jeder Push auf `main` baut via GitHub Actions alle vier Images und veröffentlicht sie unter
`ghcr.io/baucas-app/photo-*:latest`.

### Variante A: Nur docker-compose.yml (empfohlen)

Kein Git-Clone nötig – `docker-compose.yml` auf die NAS kopieren, dann:

1. `volumes.photos-library.driver_opts.device` auf den echten Fotoordner setzen (z.B. `/volume1/photos`).
2. `docker compose up -d` – Docker zieht die fertigen Images von GHCR.
3. Updates: `docker compose pull && docker compose up -d`.

JWT-Secrets werden beim ersten Start automatisch generiert und im `app-data`-Volume abgelegt.

### Variante B: Git-Clone (für den Update-Button im Admin-Panel)

1. Repo klonen: `git clone https://github.com/baucas-app/photo.git`
2. Fotoordner-Pfad anpassen; `backend/.env` ist optional.
3. `docker compose up -d --build`
4. Das Admin-Panel kann per Knopfdruck `git pull` + Container-Neustart auslösen (`POST /api/admin/git-update`) – dafür ist der Docker-Socket in den Backend-Container gemountet.

Web-UI: `http://<nas-ip>:8080` · Backend-API: `:3001`

---

## ML-Pipeline

Bei jedem Upload wird ein Job in die `ml-pipeline`-Queue (Redis/BullMQ) eingereiht. `backup-worker` verarbeitet ihn:

1. **CLIP** → 512-d-Embedding für semantische Freitextsuche (`GET /api/search?q=...`)
2. **YOLO** (yolov8n) → Objekt-Tags in `tags` (Quelle `yolo`)
3. **face_recognition** → Gesichts-Boxen + 128-d-Embeddings; Cosinus-Clustering gegen bestehende `faces` des Users
4. **Perceptual Hash** (aHash, im Backend) → Duplikat-Erkennung

Modelle laden lazy und werden gecacht (`functools.lru_cache`) – relevant für den begrenzten RAM der DS1621+.

---

## Bekannte Einschränkungen

- **Backup-Delta-Sync:** `BackupEngine` trackt bereits hochgeladene Assets per `localIdentifier` in UserDefaults. Bei App-Neuinstallation landen Re-Uploads als Duplikate – über die Duplikate-Seite bereinigbar.
- **Semantische Suche:** Brute-Force-Cosinus-Vergleich in Node – skaliert für eine Bibliothek, nicht für viele parallele Nutzer mit riesigen Bibliotheken. Für Letzteres wäre `pgvector` der nächste Schritt.
- **Sign In with Apple** wurde bewusst entfernt (Personal-Team-Provisioning unterstützt das Entitlement nicht).
- **Google OAuth** und **Push-Benachrichtigungen (APNS)** erfordern eigene Credentials in `backend/.env` (`GOOGLE_CLIENT_*`, `APNS_*`) – ohne diese sind die Features deaktiviert.
- **ML-Service** läuft nicht dauerhaft lokal (nur auf der NAS im Docker-Stack) – KI-Features stehen in der lokalen Entwicklung nur zur Verfügung, wenn `ml-service` manuell gestartet wird.
