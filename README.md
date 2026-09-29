# BauCas Photos

Selbstgehostete Fotoverwaltung für die Synology NAS – Apple-Photos-ähnliche Erfahrung mit lokaler KI, ohne Cloud.

---

## Features

### Mediathek
- Chronologische Timeline mit Zoom-Stufen (Tag / Monat / Jahr) und Cursor-Pagination
- Foto-Viewer mit Filmstreifen, Live-Photo-Loop, 360°-Panorama, Slideshow und AirPlay
- Karten-Ansicht (GPS-Pins aus EXIF)
- Erinnerungen: „Heute vor N Jahren"
- Archiv & Papierkorb (30 Tage Aufbewahrung)
- Foto-Editor: Drehen, Zuschneiden, Helligkeit/Kontrast (nicht-destruktiv, Revert möglich)

### Alben & Sammlungen
- Manuelle Alben mit beliebig tiefer Unteralbum-Hierarchie
- Drag-and-Drop-Sortierung im Web-Albenbaum
- Smart-Alben (regelbasierte Filter)
- Tag-Gruppen & Benutzer-Labels
- Reisen (GPS-basierte Zeiträume)

### iOS-Backup
- Automatisches Hintergrund-Backup (BGProcessingTask) + manueller Start
- Ziel-Album, Monats-Unteralben und Dateiname-Template frei konfigurierbar
- Netzwerk-Präferenz: nur WLAN, nur Mobilfunk oder beides
- Live Photos als verkettetes Paar (Motion-Video + Still)
- Live Activity / Dynamic Island während des Uploads
- Optionales Löschen nach erfolgreichem Upload

### Teilen & Zusammenarbeit
- Geteilte Alben mit Rollen (Betrachter / Editor)
- Öffentliche Freigabe-Links mit optionalem Passwortschutz
- Partner-Bibliothek (andere Person sieht eigene Mediathek read-only)
- Album-Kommentare

### Suche & KI
- Semantische Freitextsuche via CLIP-Embeddings
- Automatische Objekt-Tags via YOLO (yolov8n)
- Gesichtserkennung + Cosinus-Clustering
- Kamera-Facetten (nach Make/Model aus EXIF)
- Duplikat-Erkennung via Perceptual Hash (aHash, Hamming ≤ 6)

### Verwaltung
- Mehrere Konten auf unterschiedlichen Servern (getrennte Keychain-Einträge)
- API-Keys für direktes Einbetten von Bild-URLs
- OAuth 2.0 (Google)
- Push-Benachrichtigungen (APNS)
- Admin-Panel: Nutzer, git-Pull + Container-Neustart, Server-Backups (pg_dump)
- Dawarich-kompatibler GPS-Export-Endpunkt

---

## Architektur

```
ios/                SwiftUI-App, iOS 26+
frontend/           React + Vite + TypeScript
backend/            Node.js / Express / TypeScript / Prisma
backup-worker/      BullMQ-Worker für die ML-Pipeline
ml-service/         Python / FastAPI – CLIP, YOLO, Gesichtserkennung
packages/database/  Gemeinsamer Prisma-Client
packages/shared/    Gemeinsame TS-Utilities
cli/                Bulk-Upload-Skript
```

`STORAGE_ROOT` ist die Wahrheit für Dateien, Postgres für Metadaten. Pfade in `assets` und `albums` sind relativ zu `STORAGE_ROOT`.

---

## Lokale Entwicklung

```bash
npm install
cp backend/.env.example backend/.env   # DATABASE_URL, JWT_SECRET, STORAGE_ROOT setzen

npm run prisma:generate
npm run prisma:migrate:dev

# Backend OHNE watch starten (tsx watch hängt im Synology-Drive-Pfad):
cd backend && ../node_modules/.bin/tsx src/index.ts

npm run dev:frontend    # :5173, proxied /api → :3001
npm run dev:worker      # braucht Redis + laufenden ml-service
```

ML-Service: `cd ml-service && pip install -r requirements.txt && uvicorn app.main:app --reload`

### iOS-App bauen (Simulator)

```bash
cd ios && xcodegen generate

xcodebuild -project Photos.xcodeproj -scheme Photos \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -configuration Debug -derivedDataPath /tmp/photos-build build

SIMULATOR_ID=$(xcrun simctl list devices booted | grep "iPhone 17" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
xcrun simctl terminate "$SIMULATOR_ID" de.baucas.photos 2>/dev/null || true
xcrun simctl uninstall "$SIMULATOR_ID" de.baucas.photos
xcrun simctl install   "$SIMULATOR_ID" /tmp/photos-build/Build/Products/Debug-iphonesimulator/Photos.app
xcrun simctl launch    "$SIMULATOR_ID" de.baucas.photos
```

> `-derivedDataPath /tmp/photos-build` ist Pflicht: Synology Drive erzeugt Konfliktkopien mit eigenem DerivedData-Hash – ohne fixen Pfad würde `xcodebuild` den falschen Build installieren.

---

## Deployment (Synology NAS)

GitHub Actions baut bei jedem Push alle Images und veröffentlicht sie als `ghcr.io/baucas-app/photo-*:latest`.

**Variante A – nur `docker-compose.yml` (empfohlen)**

1. `docker-compose.yml` auf die NAS kopieren, `volumes.photos-library.driver_opts.device` auf den Fotoordner setzen.
2. `docker compose up -d` – zieht fertige Images von GHCR.
3. Updates: `docker compose pull && docker compose up -d`

JWT-Secrets werden beim ersten Start automatisch generiert und im `app-data`-Volume abgelegt.

**Variante B – Git-Clone** (für `POST /api/admin/git-update` im Admin-Panel)

1. Repo klonen, Fotoordner-Pfad anpassen.
2. `docker compose up -d --build`

Web-UI `http://<nas-ip>:8080` · Backend-API `:3001` · Erster registrierter Account wird Admin.

---

## Einschränkungen

| Thema | Hinweis |
|---|---|
| Backup-Delta-Sync | Tracking per `localIdentifier` in UserDefaults – nach App-Neuinstallation landen Re-Uploads als Duplikate (über Duplikate-Seite bereinigbar) |
| Semantische Suche | Brute-Force-Cosinus in Node – skaliert für eine Bibliothek; für viele Nutzer wäre `pgvector` der nächste Schritt |
| Sign In with Apple | Bewusst entfernt – Personal Team unterstützt das Entitlement nicht |
| Google OAuth & APNS | Erfordern `GOOGLE_CLIENT_*` bzw. `APNS_*` in `backend/.env`; ohne diese deaktiviert |
| ML-Service lokal | Läuft nicht dauerhaft – KI-Features nur verfügbar, wenn `ml-service` manuell gestartet ist |
