# BauCas Photos

> Selbstgehostete Fotoverwaltung für die Synology NAS – Apple-Photos-ähnliche Erfahrung mit lokaler KI, ohne Cloud.

![Build](https://github.com/baucas-app/photo/actions/workflows/docker-images.yml/badge.svg)

**Stack:** Node.js · Express · Prisma · PostgreSQL · Redis · React · Python · FastAPI · SwiftUI

---

## Features

### Mediathek & Viewer
- Chronologische Timeline mit Zoom-Stufen (Tag / Monat / Jahr) und Cursor-Pagination
- Vollbild-Viewer mit Filmstreifen, Live-Photo-Loop, 360°-Panorama, Slideshow und AirPlay
- Karten-Ansicht aller Fotos mit GPS-Koordinaten aus EXIF
- Erinnerungen: „Heute vor N Jahren"-Rückblick
- Archiv & Papierkorb mit 30-Tage-Aufbewahrung
- Nicht-destruktiver Foto-Editor: Drehen, Zuschneiden, Helligkeit, Kontrast (Revert jederzeit möglich)
- Stacks: mehrere Fotos zu einer Kachel zusammenfassen

### Alben & Sammlungen
- Manuelle Alben mit beliebig tiefer Unteralbum-Hierarchie
- Drag-and-Drop-Sortierung im Web-Albenbaum
- Smart-Alben (regelbasierte Filter)
- Tag-Gruppen & Benutzer-Labels für eigene Klassifikationen
- Reisen (GPS-basierte Zeiträume als eigene Sammlung)

### iOS-Backup
- Automatisches Hintergrund-Backup via `BGProcessingTask` + manueller Start
- Konfigurierbar: Ziel-Album, Monats-Unteralben, Dateiname-Template, Netzwerk-Präferenz
- Live Photos als verkettetes Paar hochladen (Motion-Video + Still)
- Live Activity / Dynamic Island zeigt Upload-Fortschritt auf dem Sperrbildschirm
- Optionales Löschen nach erfolgreichem Upload

### Teilen & Zusammenarbeit
- Geteilte Alben mit Rollen (Betrachter / Editor) und Album-Kommentaren
- Öffentliche Freigabe-Links mit optionalem Passwortschutz
- Partner-Bibliothek: eine andere Person sieht deine Mediathek read-only

### KI & Suche
- **Semantische Freitextsuche** via CLIP-Embeddings (z. B. „Sonnenuntergang am Meer")
- **Automatische Tags** via YOLO (yolov8n), ausgelöst bei jedem Upload
- **Gesichtserkennung** + Cosinus-Clustering zu Personen-Alben
- Kamera-Facetten: Bibliothek nach Make/Model aus EXIF filtern
- Duplikat-Erkennung via Perceptual Hash (aHash, Hamming-Distanz ≤ 6)

### Administration
- Mehrere Konten auf unterschiedlichen Servern, getrennte Keychain-Einträge
- API-Keys für direktes Einbetten von Bild-URLs (`?apiKey=...` oder `X-Api-Key`-Header)
- OAuth 2.0 (Google), Push-Benachrichtigungen (APNS)
- Admin-Panel: Nutzer anlegen, git-Pull + Container-Neustart, automatische Server-Backups (pg_dump)
- Dawarich-kompatibler GPS-Export-Endpunkt

---

## Architektur

```
backend/            REST-API  –  Node.js / Express / TypeScript / Prisma
frontend/           Web-UI    –  React + Vite + TypeScript
backup-worker/      ML-Worker –  BullMQ-Jobs pro Foto
ml-service/         KI        –  Python / FastAPI (CLIP, YOLO, Gesichtserkennung)
packages/database/  Gemeinsamer Prisma-Client (backend + backup-worker)
packages/shared/    Gemeinsame TS-Utilities (Vektor-Mathe, ml-Client, Job-Typen)
cli/                Bulk-Upload-Skript für die Kommandozeile
```

`STORAGE_ROOT` ist die Quelle der Wahrheit für Dateipfade, Postgres für Metadaten.
Alle `assets.path`/`albums.path`-Werte sind relativ zu `STORAGE_ROOT`.

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js 22+, npm 10+
- PostgreSQL + Redis lokal oder via Docker
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) für die iOS-App

### Setup

```bash
npm install
cp backend/.env.example backend/.env   # DATABASE_URL, JWT_SECRET, STORAGE_ROOT setzen

npm run prisma:generate
npm run prisma:migrate:dev
```

```bash
# Backend ohne Watch-Modus starten (tsx watch hängt im Synology-Drive-Sync-Pfad):
cd backend && ../node_modules/.bin/tsx src/index.ts

npm run dev:frontend    # Web-UI  →  http://localhost:5173
npm run dev:worker      # ML-Worker (braucht Redis + laufenden ml-service)
```

```bash
# ML-Service (optional, nur für KI-Features):
cd ml-service && pip install -r requirements.txt && uvicorn app.main:app --reload
```

---

## Deployment (Synology NAS)

Jeder Push auf `main` baut alle Images via GitHub Actions und veröffentlicht sie als `ghcr.io/baucas-app/photo-*:latest`.

### Variante A – Nur `docker-compose.yml` _(empfohlen)_

```bash
# 1. docker-compose.yml auf die NAS kopieren
# 2. Fotoordner setzen:
#    volumes → photos-library → driver_opts → device: /volume1/photos
# 3. Starten:
docker compose up -d

# Updates:
docker compose pull && docker compose up -d
```

JWT-Secrets werden beim ersten Start automatisch generiert und im `app-data`-Volume abgelegt – kein manuelles Setup nötig.

### Variante B – Git-Clone _(für Admin-Panel-Update-Button)_

```bash
git clone https://github.com/baucas-app/photo.git
# Fotoordner-Pfad anpassen, dann:
docker compose up -d --build
```

Der Admin-Panel-Button löst `POST /api/admin/git-update` aus (git pull + Container-Neustart); dafür ist der Docker-Socket in den Backend-Container gemountet.

| Endpunkt | URL |
|---|---|
| Web-UI | `http://<nas-ip>:8080` |
| Backend-API | `http://<nas-ip>:3001` |

> Der erste registrierte Account wird automatisch Admin.

---

## Bekannte Einschränkungen

| Thema | Details |
|---|---|
| **Backup-Delta-Sync** | Tracking per `localIdentifier` in UserDefaults – nach App-Neuinstallation entstehen Re-Upload-Duplikate (über die Duplikate-Seite bereinigbar) |
| **Semantische Suche** | Brute-Force-Cosinus in Node.js – skaliert für eine Bibliothek; für viele gleichzeitige Nutzer wäre `pgvector` der nächste Schritt |
| **Google OAuth & APNS** | Erfordern `GOOGLE_CLIENT_*` bzw. `APNS_*` in `backend/.env`; ohne diese deaktiviert |
| **ML-Service lokal** | Läuft nicht dauerhaft – KI-Features nur verfügbar, wenn `ml-service` manuell gestartet ist |
