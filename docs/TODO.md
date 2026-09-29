# Photos – TODO (offen)

Laufende Liste offener bzw. in Arbeit befindlicher Aufgaben. Erledigte Punkte inkl. voller Historie stehen in
`docs/DONE.md`, Test-/Verifikationsprotokolle unter `docs/tests/test_JJJJ.MM.TT_HH.MM.SS.md`.

**Leitprinzip (Louis, 2026-09-28):** Maximale Kompatibilität und Qualität auf allen Ebenen – App und Server sollen sehr gut und rund laufen. Alle neuen Features immer für Backend + Web + iOS vollständig umsetzen, nicht nur auf einer Plattform.

## Stapel, Live Photos, RAW/360°, Diashow+AirPlay

Louis-Wunsch: die letzten vier Punkte aus "Medienverwaltung & Ansicht" des Feature-Vergleichs-Artefakts
(https://claude.ai/artifact/34qiWiXsVptVoUeSep6AXy) umsetzen. Backend, Web-UI und iOS-UI sind jetzt alle drei
fertig (siehe docs/DONE.md Teil 7) - offen sind nur noch die unten gelisteten Nachprüfungen mit echtem
Bild-/Kameramaterial und ein kleiner Backend-Fund.

- [x] **Stapel**: Backend (`POST/DELETE /assets/:id/stack`, `GET /assets/:id/stack`), iOS (Mehrfachauswahl →
      "Stapeln", `StackDetailView`) und Web (Mehrfachauswahl in Mediathek/Album → "Stapeln", `StackModal` mit
      "Auflösen"/"Herauslösen") fertig - siehe docs/DONE.md Teil 7. Web live mit Playwright verifiziert (Test-Log
      docs/tests/test_2026.09.27_23.41.50.md).
- [x] **Live Photos / Motion Photos**: Backend-Upload-Flow, iOS (Auto-Upload erkennt Live Photos, lädt Paar
      hoch, "Drücken und halten" im Viewer) und Web (Viewer: LIVE-Badge, Hover/Tap-und-halten spielt das
      gekoppelte Video ab) fertig - siehe docs/DONE.md Teil 7. Web live verifiziert (Hover zeigt/versteckt das
      `<video>` nachweislich korrekt, Test-Log wie oben).
- [x] **RAW-Unterstützung**: Backend-Pipeline (`dcraw`), iOS- und Web-Badge (Grid + Viewer) fertig - siehe
      docs/DONE.md Teil 7. **Auf allen drei Ebenen (Backend/iOS/Web) weiterhin nicht mit einer echten
      Kamera-RAW-Datei getestet** (keine zur Hand) - nur mit einer JPEG-Datei mit RAW-Dateiendung geprüft, um
      Mimetype-Erkennung und Badge zu verifizieren. Bitte bei Gelegenheit mit einer echten `.cr2`/`.nef`/... Datei
      gegenprüfen.
- [x] **360°/Panorama-Ansicht**: Backend-Erkennung (`Asset.is360`), iOS (SceneKit-Kugel) und Web
      (`photo-sphere-viewer`/three.js, `PanoramaViewer`-Komponente, per `React.lazy` code-gesplittet) fertig -
      siehe docs/DONE.md Teil 7. **Kein echtes natürliches 360°-Foto in der Bibliothek verfügbar** - beide
      Plattformen bisher nur gegen dasselbe synthetische 4000×2000-Testbild geprüft (Web: WebGL-Canvas +
      sichtbare equirectangular-Verzerrung bestätigt, iOS: nur Erkennung geprüft, Optik/Pan-Gefühl noch nicht
      visuell). Bitte mit einem echten Panoramafoto gegenprüfen, sobald eines vorliegt.
- [x] **Diashow** (Chromecast bewusst ausgelassen, braucht externes Google-Cast-SDK + eigene App-ID): iOS
      (Vollbild, Play/Pause/Intervall, natives AirPlay-Icon) und Web (Vollbild, Tempo-Auswahl, Play/Pause/
      Vor/Zurück, Tastatursteuerung, aus Mediathek oder Album startbar) fertig - siehe docs/DONE.md Teil 7. Web
      live verifiziert (Test-Log wie oben). AirPlay ist iOS-exklusiv (kein Web-Äquivalent, Browser haben keine
      vergleichbare native API).

## Album-Kontextmenü: erledigt (2026-09-28)

Umbenennen, Duplizieren, Anheften und Sortierung vollständig implementiert auf Backend + Web + iOS.
Siehe docs/DONE.md „2026-09-28 – Phase 2". Offene Zusatzideen (QR-Code, Export/Download als ZIP)
wurden bewusst nicht gebaut – bitte mit Louis abstimmen, wenn gewünscht.

## Feature-Roadmap (Apple Fotos / Immich im Vergleich)

Vollständiger Funktionsvergleich mit Belegen gegen den echten Code: https://claude.ai/artifact/34qiWiXsVptVoUeSep6AXy
(Stand 27.09.2026). Diese Liste ist der lebende Rückstand daraus, unabhängig vom Tagesdatum - Status wird hier
gepflegt, nicht im Artefakt. Tier 1 ist komplett erledigt, siehe docs/DONE.md.

### Tier 2 – wertvoll, mehr Umfang/Architektur
- [x] Partner-/Familien-Freigabe (2026-09-28, diese Session) – Backend (`GET/POST/DELETE /partner`, `GET /partner/assets`), Web (PartnerPage + Timeline-Toggle) und iOS (PartnerView in Einstellungen + Timeline-Toggle) fertig. Zusätzlich: Metadaten-Fallback (iOS übergibt `clientTakenAt`/`clientLatitude`/`clientLongitude` als Formfelder, Backend nutzt sie wenn EXIF fehlt) und "Nach Upload löschen"-Setting (BackupSettingsView + BackupEngine). Nur per Code-Review + BUILD SUCCEEDED verifiziert.
- [x] Geschütztes/verstecktes Album (2026-09-28, Phase 3b) – `isLocked`/`lockPasswordHash` im Modell; iOS: Face-ID/PIN via LocalAuthentication; Web: Passwort-Dialog + POST /albums/:id/unlock. Nur per Code-Review verifiziert (kein steuerbares Simulator-Fenster).
- [x] Texterkennung in Fotos (OCR, durchsuchbar) – war bereits vollständig implementiert (ml-service `/ocr`-Endpoint, mlPipeline schreibt `ocrText`, Suche kombiniert CLIP+OCR, iOS-Viewer zeigt Text-Karte, Smart-Album-Filter `ocrContains`). Ergänzt: Web-Viewer zeigt `ocrText` jetzt als aufklappbare Details-Sektion (2026-09-28, diese Session). Hinweis: `pytesseract` muss noch manuell in der lokalen `.venv` installiert werden (siehe "Bekannte kleinere Punkte").
- [x] Hierarchische Tags (2026-09-28, diese Session) – `UserLabel`-Modell (selbstreferentiell, `parentId`, `color`), `AssetLabel`-Junction, Migration `20260928000005_add_user_labels`. Backend: `/user-labels` CRUD + `/assets/:id/labels` Assign/Remove/List. Web: `UserLabelsPage` (Baum mit Umbenennen/Löschen/Erstellen), `UserLabelDetailPage` (Fotos eines Labels), Viewer: Label-Chips + Picker. iOS: `UserLabel`-Modell, `UserLabelsView` (hierarchischer Tree + CreateSheet), `PhotoInfoView`: Labels-Karte + Zuweisung/Entfernen. Neuer Tab "Labels" in MainTabView. Alles live verifiziert (curl: CREATE/LIST/DELETE Label + Kind-Label ✓, BUILD SUCCEEDED iOS ✓).
- [x] OAuth-Login (2026-09-28, diese Session) – Google (Authorization Code Flow + HMAC-State) und Apple Sign In (Identity Token, iOS-nativ). Backend: `oauth.service.ts` + neue Endpoints (`/auth/oauth/google`, `/auth/oauth/google/callback`, `/auth/oauth/apple/token`, `/auth/oauth/providers`), `OAuthAccount`-Modell, Migration. Web: Google-Button auf LoginPage, `OAuthCallbackPage`. iOS: Sign-in-with-Apple + Google via `ASWebAuthenticationSession`, `photosapp://` Custom-URL-Scheme, Entitlement. Env-Vars erforderlich: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`.
- [x] Kommentare / Aktivität auf geteilten Alben (2026-09-28, diese Session) – `AlbumComment`-Modell, Migration und Backend-Routen (`GET/POST/DELETE /albums/:id/comments`) bereits fertig; Web (`AlbumDetailPage`: Kommentarliste + Eingabefeld) und iOS (`AlbumCommentsSheet` + Toolbar-Button in `AlbumDetailView`) ebenfalls fertig. Nur per Code-Review verifiziert.
- [x] E-Mail-Benachrichtigungen bei neuen Fotos in einem geteilten Album (2026-09-28, diese Session) – `email.service.ts` mit nodemailer; Benachrichtigung beim Hinzufügen von Fotos (`POST /:id/assets`) und beim Kommentieren (`POST /:id/comments`), fire-and-forget. `notifyUserEmail` für Partner-Einladung und Album-Freigabe war bereits genutzt – neu gebündelt. Env-Vars: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`. Kein SMTP konfiguriert → stille No-op.
- [x] `SharedMember` tatsächlich wirksam machen (aktuell laut Backend-Review folgenlos, siehe „Backend – nur
      berichtet, nicht behoben" unten)

### Tier 3 – eher später (Power-User/Infra oder Nische)
- [ ] Externe Bibliotheken (bestehende Ordner read-only einbinden statt hochladen)
- [ ] XMP-Sidecar-Dateien (Metadaten-Sync)
- [x] Datenbank-Backups automatisieren (2026-09-28) – `backup.service.ts`: `pg_dump | gzip`, täglich 03:00 Uhr, max. 7 Backups (BACKUP_KEEP_COUNT). Admin-Routen: `GET/POST/DELETE /admin/backups`, Download. Env: `BACKUP_DIR`, `BACKUP_KEEP_COUNT`.
- [ ] Hardware-beschleunigtes Video-Transcoding
- [x] CLI-Upload-Tool (2026-09-28) – `cli/upload.mjs` (reines Node.js). Rekursiver Scan, parallele Uploads (--threads), Progress-Bar, --dry-run. `node cli/upload.mjs --server http://... --email ... --password ... --dir /fotos`
- [x] Prometheus-Monitoring/Healthchecks (2026-09-28) – `prom-client`: users/assets/storage/albums als Gauges, HTTP-Requests/Duration als Counter+Histogram. `GET /metrics` (ohne Auth, per Firewall absichern).
- [x] Trips / automatische Reise-Cluster (2026-09-28, diese Session) – Haversine-Clustering (8h/200km-Schwellen), Backend (`trip.service.ts`, `/trips`-Routen inkl. Dawarich-Track-Proxy), Web (`TripsPage`, `TripDetailPage` mit OSM-Karte), iOS (`TripsView`, `TripDetailView`, `Trip.swift`). Dawarich-Integration: Photos implementiert Immich-kompatible Endpunkte (`dawarich-compat.routes.ts`) → Dawarich kann Photos als Foto-Quelle konfigurieren.
- [ ] Featured-Photos-Kuratierung, Visual-Look-Up-artige Objekt-Identifikation per Tap

## Bekannte offene Bugs / Funde (aus den Bug-Sweeps vom 2026-09-27)

### ml-service / backup-worker
- [x] `ml-service/app/config.py:14` `.lstrip("./")` → `.removeprefix("./")` behoben (2026-09-28, Phase 1a).
- [ ] Verwaiste Face-Cluster nach Rescan (bewusst nicht auto-gelöscht wegen möglicher `personName`).

### Frontend (Web)
- [x] `AlbumDetailPage` ignorierte `nextCursor` (Deckel bei 60 Fotos) – cursor-basiertes Infinite Scroll implementiert (2026-09-28, Phase 1b). Tag-/Kamera-Filter noch ohne Infinite Scroll.
      jeder Web-Login erzeugt einen neuen API-Key „Web-Browser“, Logout löscht ihn nur lokal (Server-seitig
      bleibt er gültig – Aufräum-/Sicherheitsthema); fehlgeschlagene Uploads (z.B. leerer MIME-Typ bei manchem
      HEIC) werden still übersprungen; diverse unbehandelte Promise-Rejections ohne Nutzer-Feedback
      (Admin/Duplikate/Settings/Face-Detail/Viewer) – unschön, aber nicht absturzrelevant.

### Backend – nur berichtet, nicht behoben
- [x] **`SharedMember` wirksam gemacht** (2026-09-28, Phase 3a) – `GET /:id` erlaubt jetzt Owner+Editor+Viewer;
      `GET /` gibt auch freigegebene Alben zurück; `POST/DELETE /:id/assets` erlaubt Editor; Owner-only-Ops
      bleiben geschützt. Kein zweiter Testaccount vorhanden – nur per Code-Review verifiziert.

### Dateiformat-Unterstützung – offen / bewusst nicht gemacht
- [ ] **Docker-Image hat kein ffmpeg** → Video-Thumbnails dort nur als Platzhalter. Lösung: `ffmpeg` in die
      apt-Zeile von `backend/Dockerfile` (~+100 MB Image). Lokal (Homebrew-ffmpeg) funktioniert es.
- [ ] Kein Video-Transcoding: HEVC-`.mov` spielt nur in Safari/Chrome mit HW-HEVC, nicht in Firefox (Immich
      transkodiert dafür mit ffmpeg nach H.264 – großer Umbau, Job-Queue nötig).
- [ ] HEIC-Dekodierung per WASM blockiert den Event-Loop ~0,4 s pro Bild (nur bei Erst-Erzeugung). Bei großen
      Massen-Uploads besser in den Worker/Queue verlagern oder ein Docker-Image mit libde265-fähigem libvips bauen.
- [ ] iOS (nur geprüft, nicht geändert): sollte beim Upload den echten MIME-Typ senden (`UTType` der Datei);
      Altbestands-Zeilen mit `application/octet-stream` bleiben in der DB → iOS `Asset.isVideo` ist dort falsch
      (einmaliges Backfill-Skript per Dateiendung wäre sinnvoll). Viewer lädt per `AsyncImage` das volle Original –
      `/preview` wäre schneller. HEIC-/WebP-Decoding selbst ist in iOS unkritisch.

## Bekannte kleinere Punkte (nicht dringend)
- [ ] **Für Louis, bitte einmal selbst ausführen**: `cd ml-service && .venv/bin/pip install -r requirements.txt`
      - `pillow-heif` steht jetzt in requirements.txt (macht ml-service HEIC-fähig, siehe docs/DONE.md Teil 8),
      die lokale venv wurde aber bewusst ohne installiert gelassen, weil `pip install` in diesem
      Synology-Drive-synchronisierten Ordner wiederholt Dateien korrumpiert hat (siehe
      docs/tests/test_2026.09.27_23.25.00.md) - hilft evtl., Synology Drive kurz zu pausieren, falls es beim
      ersten Versuch hakt.
- [x] **`ios/Photos.xcodeproj` wurde erfolgreich neu generiert** (`rm -rf Photos*.xcodeproj && xcodegen generate && xcodebuild ... build` → BUILD SUCCEEDED in einem Durchlauf). Kein manueller Eingriff nötig.
- [ ] `AlbumsViewModel.firstDescendantCover`: lädt Cover-Vorschau sequenziell (bis zu ~20 Requests bei tief
      verschachtelten, leeren Alben-Ordnern) statt parallel. Nur spürbar bei ungewöhnlicher Ordnerstruktur.
- [ ] Neuer iOS-Drag&Drop-Typ `de.baucas.photos.album-reference` funktioniert app-intern, ist aber (noch) nicht als
      `UTExportedTypeDeclarations` in project.yml/Info.plist eingetragen – kann zu einer Log-Warnung führen.
- [ ] Bitte einmal von Hand im Simulator/Gerät testen: Konten hinzufügen/wechseln, Alben-Drag&Drop, Pinch-to-Zoom-
      Gefühl in der Mediathek, Filmstreifen-Scrubbing im Viewer, Auto-Upload-Einstellungen (echter Upload-Testlauf),
      Album-Kontextmenü (Cover ändern/Freigeben/Löschen inkl. aller drei Lösch-Varianten), Höhen-Fix
      Raster/Listen-Umschalter vs. "+"-Button (siehe docs/DONE.md, Teil 2), neues Viewer-UI (Datum-Pille,
      "..."-Menü, Wisch-nach-oben-Info-Panel, siehe docs/DONE.md Teil 5), Alben-Umbenennen (Titel muss sofort
      aktuell sein) und die neuen "Sammlungen"-Kacheln im Alben-Tab (siehe docs/DONE.md Teil 6) – in dieser
      Umgebung ist kein steuerbares Simulator-Fenster für Taps verfügbar, siehe die Test-Logs ab
      docs/tests/test_2026.09.27_16.55.00.md.
- [ ] Ebenfalls nur per Code-Review geprüft, nicht angetippt (siehe docs/DONE.md Teil 7 „iOS-Oberfläche",
      docs/tests/test_2026.09.27_23.28.13.md): Mehrfachauswahl+Stapeln im Mediathek-Raster, Live-Photo
      "Drücken-und-halten"-Geste (Timing-Gefühl der 0,35s-Schwelle), 360°-Kugel-Ansicht (Spiegelung/Pan-Gefühl),
      Diashow (Play/Pause/Intervall), AirPlay-Button-Platzierung, RAW-Badge mit einer echten Kamera-RAW-Datei.

---

_Legende: [ ] offen · [~] in Arbeit_
