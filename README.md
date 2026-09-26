# Photos

Eigenständiges, selbstgehostetes Fotoverwaltungssystem für die Synology NAS (DS1621+) - Apple-Photos-ähnliche Erfahrung mit lokaler KI (CLIP-Suche, YOLO-Tagging, Gesichtserkennung), ohne Cloud-Abhängigkeit.

## Architektur

```
ios/                iOS-App (SwiftUI, iOS 26+, Xcode-Projekt via xcodegen)
frontend/           Web-UI (React + Vite + TypeScript)
backend/            REST-API (Node.js/Express + TypeScript, Prisma)
backup-worker/      Background-Worker (BullMQ): führt die ML-Pipeline pro Foto aus
ml-service/         Python/FastAPI: CLIP-Embeddings, YOLO-Tagging, Gesichtserkennung
packages/database/  Gemeinsamer Prisma-Client (von backend + backup-worker genutzt)
packages/shared/    Gemeinsame TS-Utilities (Vektor-Mathe, ml-service-HTTP-Client, Job-Typen)
docker-compose.yml  Alle Services für den NAS-Betrieb
```

Das Dateisystem unter `STORAGE_ROOT` (`/photos` im Container) ist die Wahrheit für Dateien;
Postgres ist die Wahrheit für Metadaten. Jeder `assets.path`/`albums.path` ist relativ zu
`STORAGE_ROOT`, z.B. `/2024/Urlaub/Barcelona/photo1.jpg`.

## Voraussetzungen

- Node.js 22+, npm 10+
- Docker + Docker Compose (auf der NAS bzw. zum lokalen Testen)
- Xcode 16+ und [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) für die iOS-App
- Eine Synology NAS (oder beliebiger Docker-Host) mit einem Fotoordner, z.B. `/volume1/photos`

## Lokale Entwicklung

```bash
npm install                 # installiert alle Workspaces (backend, frontend, backup-worker, packages/*)
cp backend/.env.example backend/.env   # anpassen: DATABASE_URL, JWT-Secrets, STORAGE_ROOT

npm run prisma:generate     # Prisma-Client generieren
npm run prisma:migrate:dev  # Schema in eine lokale Postgres-DB migrieren

npm run dev:backend         # Backend auf :3001
npm run dev:frontend        # Web-UI auf :5173 (proxied /api zu :3001)
npm run dev:worker          # ML-Pipeline-Worker (braucht Redis + laufenden ml-service)
```

Für den ML-Service lokal: `cd ml-service && pip install -r requirements.txt && uvicorn app.main:app --reload`

## iOS-App

```bash
cd ios
xcodegen generate     # erzeugt Photos.xcodeproj aus project.yml
open Photos.xcodeproj
```

Beim ersten Start fragt die App nach der Server-Adresse (z.B. `https://photos.meinnas.de` oder
`http://192.168.1.10:8080`) - es gibt keine fest einprogrammierte Backend-URL, da der Server
selbstgehostet ist. Danach Login/Registrierung wie gewohnt.

Die App nutzt [Liquid Glass](https://developer.apple.com/design/human-interface-guidelines/materials)
(iOS 26) gezielt für schwebende Steuerelemente (Viewer-Overlay, Floating-Action-Buttons); Tab-Bar,
Navigation und Toolbars bekommen den Look automatisch vom System, da gegen das iOS-26-SDK gebaut wird.

## Deployment auf der Synology NAS

Jeder Push auf `main` baut über GitHub Actions (`.github/workflows/docker-images.yml`) alle vier
Images (`backend`, `frontend`, `backup-worker`, `ml-service`) und veröffentlicht sie unter
`ghcr.io/baucas-app/photo-*:latest`. Dadurch gibt es zwei Wege, das Ganze auf die NAS zu bekommen:

### Variante A: Nur docker-compose.yml (empfohlen für den schnellen Test)

Kein Git-Clone, keine `.env`-Datei nötig - nur `docker-compose.yml` auf die NAS kopieren
(z.B. in Container Manager direkt einfügen), dann:

1. `docker-compose.yml` → `volumes.photos-library.driver_opts.device` auf den echten Fotoordner
   der NAS anpassen (Default-Platzhalter: `/volume1/photos`) - das ist der einzige Pflicht-Edit.
2. `docker compose up -d` (**ohne** `--build`) - Docker zieht die fertigen Images von GHCR statt
   lokal zu bauen.
3. Updates später: `docker compose pull && docker compose up -d`.

JWT-Secrets werden beim ersten Start automatisch generiert und im `app-data`-Volume abgelegt -
kein manuelles Anlegen nötig (siehe `backend/src/config/secrets.ts`).

Einschränkung: Der "Update laden"-Button im Admin-Panel (git pull im Container) funktioniert hier
nicht, da kein `.git`-Ordner gemountet ist - siehe Variante B, falls der gebraucht wird.

### Variante B: Vollständiger Git-Clone (für den Update-Button im Admin-Panel)

1. Repo auf die NAS klonen, z.B. `git clone https://github.com/baucas-app/photo.git`.
2. Fotoordner-Pfad wie in Variante A anpassen. `backend/.env` ist optional (nur nötig, falls du
   eigene, stabile JWT-Secrets statt der Auto-Generierung willst).
3. `docker compose up -d --build` (baut lokal aus dem Quellcode statt die GHCR-Images zu ziehen).
4. Das Admin-Panel kann danach per Knopfdruck `git pull` + Container-Neustart auslösen
   (`POST /api/admin/git-update`) - dafür ist der Docker-Socket in den Backend-Container gemountet.

Beide Varianten: Web-UI unter `http://<nas-ip>:8080`, Backend-API unter `:3001`, erster
registrierter Account wird automatisch Admin.

## Authentifizierung & API-Keys

- Normale API-Aufrufe laufen über kurzlebige JWT-Access-Tokens (mit Refresh-Flow).
- Für direkt einbettbare Bild-URLs (`<img src>`, iOS `AsyncImage`, externe Tools) gibt es zusätzlich
  **API-Keys** (`POST /api/auth/api-keys`), die als `?apiKey=...` Query-Parameter oder `X-Api-Key`-Header
  funktionieren. Web-UI und iOS-App legen sich beim Login automatisch einen an; Verwaltung/Widerruf
  über die Einstellungen-Seite.

## ML-Pipeline

Bei Upload/Backup wird pro Foto ein Job in die `ml-pipeline`-Queue (Redis/BullMQ) eingereiht.
`backup-worker` verarbeitet ihn:

1. **CLIP** (`ml-service`) → Embedding wird in `asset_embeddings` gecacht (für `/api/search`)
2. **YOLO** → Objekt-Tags in `tags` (Quelle `yolo`)
3. **face_recognition** → Gesichts-Boxen + 128-d-Embeddings; Clustering per Cosinus-Ähnlichkeit
   gegen bestehende `faces`-Einträge des Users (Schwellwert in `mlPipeline.service.ts`)
4. Perceptual Hash (aHash, in `backend`, nicht im ML-Service) für Duplikat-Erkennung

Alle Modelle laden lazy und werden gecacht (`functools.lru_cache`) - relevant für die 4GB RAM der
DS1621+. `yolov8n` (nano) ist als Default-Modell bewusst klein gewählt.

## Statistiken & Suche

`GET /api/stats/cameras` gruppiert die eigene Bibliothek nach Kamera-Make/Model (aus EXIF) - z.B.
"142 Fotos mit iPhone 12 Pro". Wird als Facette auf der Such-Seite (Web + iOS) angezeigt und lässt
sich anklicken, um direkt danach zu filtern (`GET /api/assets?cameraModel=...`).
`GET /api/stats/overview` liefert Gesamtzahlen (Assets, Favoriten, Videos, pro Jahr).

## Duplikate

`GET /api/assets/duplicates` gruppiert die eigene Bibliothek per Perceptual-Hash-Vergleich
(Hamming-Distanz ≤ 6 auf dem 64-bit aHash) in Near-Duplicate-Cluster - erkennt auch unterschiedlich
komprimierte/skalierte Kopien desselben Fotos, nicht nur byteidentische Dateien. UI in Web
(`/duplicates`) und iOS (Menü in der Mediathek-Toolbar) zeigt die Cluster nebeneinander mit
Lösch-Button pro Foto.

## Bekannte Lücken / nächste Schritte

- Web-UI: kein Drag&Drop-Upload, keine EXIF-Detailansicht im Viewer
- iOS: `BackupEngine` läuft synchron über alle Assets (kein Delta-Sync via Server-Query, nur
  lokale UserDefaults-Liste bereits hochgeladener `localIdentifier`s); Live-Activity/Dynamic-Island
  für den Backup-Fortschritt ist noch nicht implementiert
- Ein Album per Drag&Drop in ein anderes verschieben (Parent ändern) gibt es noch nicht - nur
  Umbenennen (verschiebt den echten Ordner inkl. aller Unterordner/Assets automatisch mit)
- Semantische Suche ist Brute-Force-Cosinus-Vergleich in Node (skaliert für eine Bibliothek,
  nicht für viele parallele Nutzer mit riesigen Bibliotheken - dafür später `pgvector` erwägen)
