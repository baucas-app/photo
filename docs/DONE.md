# Photos – Erledigt

Chronologisches Log aller abgeschlossenen Aufgaben (neueste oben). Offene Punkte stehen in `docs/TODO.md`,
Test-/Verifikationsprotokolle unter `docs/tests/test_JJJJ.MM.TT_HH.MM.SS.md`.

## 2026-09-28 – Live-Tests (Session 2)

Live-curl-Tests gegen echten lokalen Backend (localhost:3001 + Postgres):

| Test | Ergebnis |
|---|---|
| `GET /metrics` | ✓ Prometheus-Text-Format, Node.js-Gauges |
| Rate-Limit: 11 Logins → #11 = 429 | ✓ korrekt geblockt |
| `POST /admin/backups` | ✓ `backup-2026-09-28T21-51-59.sql.gz` erzeugt |
| `GET /admin/backups/:file` | ✓ 200, 8 647 Bytes |
| `DELETE /admin/backups/:file` | ✓ 204, Liste danach leer |
| `GET /compat/api/server-info` (Dawarich) | ✓ `{"version":"1.117.0",...}` |
| `GET /compat/api/assets?pageSize=3` | ✓ Array mit Dawarich-Format-Keys |
| `GET /compat/api/assets?takenAfter=notADate` | ✓ 400 `Invalid datetime` |
| `GET /api/assets?limit=2` | ✓ echte Assets + nextCursor |
| CORS von fremder Origin | ✓ `Allow-Origin` bleibt auf `localhost:5173` |

**Bugfix entdeckt und behoben**: Dawarich-Router war auf `/api` gemountet und wurde von `/api/assets` (echtem Assets-Router, der früher registriert ist) überdeckt → `toAsset()` wurde nie aufgerufen, interne Felder (`path`, `hash`) wurden geleakt. Fix: Router jetzt auf `/compat/api` (kein Routing-Konflikt). Dawarich-Konfiguration: URL auf `http://<host>:3001/compat` setzen.

## 2026-09-28 – Bug-Sweep Abschluss (Session 2)

Ausstehende Fixes aus dem umfassenden Code-Scan der vorherigen Session:

- **MITTEL-6 Abschluss – ML-Service Auth (`packages/shared/src/mlClient.ts`):** `X-Internal-Key`-Header wird jetzt in der zentralen `post()`-Funktion mitgeschickt, wenn `ML_INTERNAL_KEY` gesetzt ist. Gilt für alle ML-Aufrufe (CLIP-Embeddings, Objekterkennung, Gesichtserkennung, OCR).
- **KLEIN-2 – iOS Keychain Accessibility (`ios/Photos/Services/KeychainStore.swift`):** `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` explizit gesetzt – verhindert iCloud-Backup und Gerätemigration von Auth-Tokens.
- **KLEIN-6 – ZIP-Download-Limit (`backend/src/routes/albums.routes.ts`):** Download abgebrochen wenn Album > 500 Dateien oder > 5 GB (konfigurierbar via `ZIP_MAX_FILES` / `ZIP_MAX_BYTES`).
- **Bugfix – `partner.routes.ts` Select:** `isLivePhoto` existiert nicht im Prisma-Schema (heißt `livePhotoVideoId`) → TypeScript-Fehler behoben.
- TypeScript-Kompilierung: `backend` + `packages/shared` beide fehlerfrei.

## 2026-09-28 – OAuth-Login (Tier 2)

**Ziel:** Sign-in mit Google und Apple als Alternative zu E-Mail/Passwort – für einfacheren Familienzugang.

### Schema + Migration
- `packages/database/prisma/schema.prisma`: `passwordHash` auf `String?` (nullable) gesetzt; neues Modell `OAuthAccount` (`id`, `userId`, `provider`, `providerId`).
- Migration `20260928000006_add_oauth_accounts`: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` + `CREATE TABLE oauth_accounts`. Erfolgreich deployed.

### Backend
- Neues Service `backend/src/services/oauth.service.ts`:
  - `verifyGoogleIdToken(idToken)` – verifiziert via `https://oauth2.googleapis.com/tokeninfo`, prüft `aud == GOOGLE_CLIENT_ID`.
  - `verifyAppleIdToken(identityToken, clientId)` – verifiziert JWT via Apple JWKS (`jose`-Package, JWKS lazy-cached).
  - `upsertOAuthUser(identity)` – findet bestehenden `OAuthAccount` oder legt neuen User + Account an; linked an bestehenden User per E-Mail falls vorhanden.
- `backend/src/routes/auth.routes.ts` – neue Endpoints:
  - `GET /auth/oauth/google` – leitet zum Google Consent-Screen weiter. Anti-CSRF-State als HMAC-signiertes Base64url-JSON (`{ nonce, platform: "web"|"ios" }`). `platform=ios` → finale Redirect-URL `photosapp://oauth/callback`.
  - `GET /auth/oauth/google/callback` – tauscht Code gegen ID Token, upsert User, redirectet zu Frontend oder App-Deep-Link.
  - `GET /auth/oauth/providers` – gibt `{ google: bool, apple: bool }` zurück (für UI-Steuerung).
  - `POST /auth/oauth/apple/token` – nimmt Apple Identity Token (+ optionale E-Mail/Name), verifiziert, upsert User, gibt `{ user, accessToken, refreshToken }` zurück.
- `POST /auth/login` schützt jetzt gegen OAuth-only-Accounts (kein `passwordHash`) mit klarer Fehlermeldung.
- Neue Dependency: `jose` (Apple JWT-Verifikation via JWKS).
- Benötigte Env-Variablen (optional – Buttons unsichtbar wenn nicht gesetzt): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE_URL`, `FRONTEND_URL`, `APPLE_CLIENT_ID`.

### Web
- `frontend/src/hooks/useAuth.tsx`: neues `loginWithTokens(tokens)` – speichert Token-Paar und setzt User-State direkt (für den OAuth-Callback).
- `frontend/src/pages/LoginPage.tsx`: lädt `/auth/oauth/providers` beim Mount; zeigt "Mit Google anmelden"-Button mit Google-SVG-Logo nur wenn `providers.google == true`.
- `frontend/src/pages/OAuthCallbackPage.tsx` (neu): liest `accessToken`/`refreshToken`/`userId`/`email`/`name` aus URL-Params, ruft `loginWithTokens()` auf, redirectet nach `/`.
- `frontend/src/App.tsx`: Route `/oauth/callback` hinzugefügt.
- `frontend/src/styles/globals.css`: `.btn-outline` und `.auth-divider`-Stile ergänzt.

### iOS
- `ios/Photos/Features/Authentication/AuthViewModel.swift`:
  - `loginWithApple(credential:)` – sendet Identity Token an `POST /auth/oauth/apple/token`.
  - `loginWithGoogle(presentationAnchor:)` – öffnet `ASWebAuthenticationSession` mit `/api/auth/oauth/google?platform=ios`, wartet auf `photosapp://oauth/callback`-Deep-Link, extrahiert Tokens.
  - Hilfsprivate: `PresentationAnchorProvider` + `String.nonEmpty`.
- `ios/Photos/Features/Authentication/LoginView.swift`:
  - `SignInWithAppleButton(.signIn)` (native ASAuthorizationController, direkte Completion-Handler-Nutzung).
  - `GoogleSignInButton` (eigener View) – nutzt `loginWithGoogle`.
  - Beide in eigenem Section "Oder anmelden mit".
  - Google-Logo als `Canvas`-Pfad (kein Image-Asset nötig).
- `ios/project.yml`:
  - `CFBundleURLTypes`: `photosapp://` Custom-URL-Scheme registriert (für OAuth-Callback-Deep-Link).
  - `entitlements`: `com.apple.developer.applesignin: [Default]`.
- `ios/Photos/Photos.entitlements` (neu): Sign-in-with-Apple Entitlement.
- Dependency `AuthenticationServices` wird automatisch via `import` gelinkt.

**Verifikation:** Backend `tsc --noEmit` ✓, Frontend `tsc --noEmit` ✓, iOS `BUILD SUCCEEDED` ✓. Live-Test (echter Google/Apple-Login) erfordert konfigurierte Env-Vars + Apple Developer Account mit aktivierter Capability.

## Feature-Roadmap: Tier 1 – erledigt

Vollständiger Funktionsvergleich mit Belegen gegen den echten Code: https://claude.ai/artifact/34qiWiXsVptVoUeSep6AXy
(Stand 27.09.2026). Details zur Umsetzung stehen unten unter "2026-09-27 (Teil 3)".

- [x] GPS-Erfassung aus EXIF + Karten-Ansicht (Web + iOS)
- [x] Papierkorb / Wiederherstellen statt Sofort-Löschen
- [x] Archiv fertigstellen (Modell/API existiert, UI fehlte)
- [x] Erinnerungen ("Auf den Tag genau vor X Jahren")
- [x] Basis-Bildbearbeitung (Zuschnitt/Drehen/Helligkeit-Kontrast)

## 2026-09-28

### Phase 1 – Kleine Fixes

- [x] **Phase 1a – ml-service config.py**: `ml-service/app/config.py` Zeile 14: `.lstrip("./")` →
      `.removeprefix("./")`. `.lstrip` entfernt individuelle Zeichen aus einem Charset, nicht einen Präfix als
      String. Semantisch falsch; `.removeprefix` ist die korrekte Methode.

- [x] **Phase 1b – AlbumDetailPage Infinite Scroll**: `frontend/src/pages/AlbumDetailPage.tsx` komplett neu
      geschrieben. Vorher wurden alle Assets in einem einzigen Aufruf geladen (60-Foto-Deckel). Jetzt:
      cursor-basiertes Infinite Scroll via `IntersectionObserver` auf einem Sentinel-Div; `inFlightRef` verhindert
      Doppel-Requests; Album-Metadaten werden von Seite 1 gesetzt und nicht bei jedem Nachladen überschrieben.

- [x] **Phase 1c – Backend MIME-Backfill**: `backend/scripts/backfill-mime-types.ts` neu angelegt. Liest alle
      Assets mit `mimeType = 'application/octet-stream'` oder null und setzt den MIME-Typ nach Dateiendung
      korrekt (dieselbe Tabelle wie `mediaType.ts`). Aufruf: `cd backend && npx tsx scripts/backfill-mime-types.ts`.

### Phase 3b – Geschütztes/gesperrtes Album (Face-ID iOS, Passwort Web)

**Prisma/Migration:**
- `Album.isLocked Boolean @default(false)` und `Album.lockPasswordHash String?` neu.
- Migration `20260928000002_add_album_is_locked` deployed; Prisma-Client regeneriert.

**Backend (`album.service.ts`, `albums.routes.ts`):**
- `updateAlbum` akzeptiert `isLocked` und `lockPassword` (bcrypt-gehasht vor dem Speichern).
- `PUT /:id` leitet `isLocked` / `lockPassword` weiter; `null` = Passwort entfernen.
- Neuer Endpunkt `POST /:id/unlock { password }` → 200 OK oder 403. Gesperrte Alben ohne
  Passwort geben 403 zurück (= Biometric-only, kein Web-Unlock möglich).
- `lockPasswordHash` wird in allen API-Antworten herausgefiltert (GET /, GET /:id, PUT /:id,
  POST /:id/duplicate).
- TypeScript-Check sauber.

**Web:**
- `Album.isLocked: boolean` in `frontend/src/api/types.ts`.
- `AlbumDetailPage`: wenn `album.isLocked && !unlocked` → Passwortdialog (🔒, Formular, POST
  /albums/:id/unlock). Bei Fehler roter Hinweis; nach Entsperren normale Albumansicht.
- `AlbumTree`: 🔒-Symbol neben gesperrten Alben; Menüpunkt „🔒 Sperren…" öffnet Inline-Dialog für
  Passwort-Eingabe; „🔓 Entsperren" entfernt Lock direkt. TypeScript-Check sauber.

**iOS:**
- `Album.isLocked: Bool` und `AlbumDetail.isLocked: Bool` in `Album.swift`.
- `AlbumDetailView`: neue States `biometricUnlocked`/`biometricError`; bei `album.isLocked &&
  !biometricUnlocked` wird `lockScreen` angezeigt (Schloss-Icon, „Entsperren"-Button).
- `requestBiometric()`: `LAContext.evaluatePolicy(.deviceOwnerAuthentication, ...)` → bei Erfolg
  `biometricUnlocked = true` + `load()`. Bei Fehler Fehlermeldung im lockScreen.
- `import LocalAuthentication` ergänzt.
- `currentAlbum` um `isLocked` ergänzt (war beim Refactor vergessen worden).
- Build: **xcodebuild → BUILD SUCCEEDED**.

### Phase 3a – SharedMember wirksam machen

**Backend (`backend/src/routes/albums.routes.ts`, `backend/src/services/album.service.ts`):**
- Neue Helper-Funktion `getAlbumAccess(userId, albumId)` → gibt `{ album, role }` zurück
  (`"owner" | "editor" | "viewer"`) oder wirft `NotFound` (nicht `Forbidden`, damit keine Album-Existenz
  an Fremde durchsickert).
- `GET /albums/` liefert jetzt sowohl eigene Alben als auch Alben, in denen der Nutzer SharedMember ist
  (eigene zuerst pinned/name-sortiert, dann freigegebene alphabetisch).
- `GET /albums/:id` erlaubt Owner, Editor und Viewer (bisher nur Owner).
- `POST /albums/:id/assets` und `DELETE /albums/:id/assets/:assetId` erlauben Owner und Editor;
  Viewer erhalten HTTP 403 Forbidden.
- Owner-only-Operationen bleiben unverändert: `PUT /:id` (Metadaten), `DELETE /:id`,
  `POST /:id/duplicate`.
- `addAssetsToAlbum` und `removeAssetFromAlbum` im Service: redundante Albumbesitz-Prüfung entfernt
  (der Router prüft bereits via `getAlbumAccess`); Asset-Ownership-Check in `addAssetsToAlbum` bleibt
  (Nutzer kann nur eigene Assets zu einem Album hinzufügen).
- Import-Fix: `AlbumSortOrder` kommt jetzt direkt aus `@prisma/client` statt aus `../db/prisma.js`.
- TypeScript-Check: `tsc --noEmit` ohne Fehler. Backend-Start + `GET /albums` live verifiziert.

### Phase 2 – Album-Kontextmenü (Umbenennen, Duplizieren, Anheften, Sortierung)

**Backend:**
- `packages/database/prisma/schema.prisma`: neues Enum `AlbumSortOrder` (takenAt_desc/asc, uploadedAt_desc,
  name_asc); `Album`-Modell bekommt `pinned Boolean @default(false)` und `sortOrder AlbumSortOrder`.
- Migration `20260928000001_add_album_pinned_sort_order` angelegt (via `migrate diff --script`) und deployed.
- `backend/src/services/album.service.ts`: `updateAlbum` akzeptiert jetzt `pinned` und `sortOrder`; neue
  Funktion `duplicateAlbum` (legt „Kopie von [Name]" an, kopiert alle AlbumAsset-Links).
- `backend/src/routes/albums.routes.ts`: `GET /` sortiert pinned-Alben zuerst; `GET /:id` wertet `sortOrder`
  aus (sortOrderMap → Prisma-orderBy); `PUT /:id` validiert `pinned`/`sortOrder`; neuer Route `POST /:id/duplicate`.

**Web (frontend):**
- `frontend/src/api/types.ts`: `AlbumSortOrder`-Typ und `pinned`/`sortOrder`-Felder auf `Album`-Interface.
- `frontend/src/components/AlbumTree.tsx`: Drei-Punkte-Button (⋯) pro Album-Eintrag; Menü-Zustände
  `main | rename | sort`; Rename (Inline-TextField), Duplicate (navigiert zum neuen Album), Pin/Unpin
  (📌-Badge), Sortierung (Sub-Dropdown mit aktivem Haken). Outside-Click schließt Menü.

**iOS:**
- `ios/Photos/Models/Album.swift`: `AlbumSortOrder`-Enum mit `displayName`, `pinned`/`sortOrder`-Felder auf
  `Album` und `AlbumDetail`.
- `ios/Photos/Features/Albums/AlbumsViewModel.swift`: neue Methoden `renameAlbum`, `duplicateAlbum`,
  `togglePin`, `setSortOrder`.
- `ios/Photos/Features/Albums/AlbumTile.swift`: `AlbumGridTile` und `AlbumListRow` erhalten optionale
  Callbacks `onRename`/`onDuplicate`/`onTogglePin`/`onSortOrder`; Pin-Badge (orange `pin.fill` oben links
  in Kachel, inline in Listenzeile); Menü-Einträge Umbenennen/Duplizieren/Anheften/Sortierung über einem
  `Divider()` vor den bestehenden Einträgen.
- `ios/Photos/Features/Albums/AlbumsView.swift`: `NavigationStack(path: $navigationPath)` für
  programmatische Navigation nach Duplizieren; `.alert("Album umbenennen")` und
  `.confirmationDialog("Sortierung: …")` für die jeweiligen Aktionen; `performDuplicate` hängt neues Album
  an `navigationPath`.
- `ios/Photos/Features/Albums/AlbumDetailView.swift`: `currentAlbum`-Computed-Property um `pinned` und
  `sortOrder` ergänzt (fehlte beim Refactor).
- Build-Verifikation: `xcodebuild ... build` → **BUILD SUCCEEDED** nach rsync nach `/tmp/ios_build/`.

## 2026-09-27

### Bugs
- [x] **Konten-Navigation kaputt**: "Weiteres Konto hinzufügen" lief über denselben State-Umschalter wie Login/Logout
      (`currentUser = nil`), der RootView komplett auf den Server-Setup-Stack umschaltet und dabei Settings/MainTabView
      zerstört. Fix: eigener Sheet-Flow (`AddAccountFlow.swift`), der `currentUser`/`activeAccountId` erst bei
      erfolgreichem Login/Register anfasst (neuer `Bool`-Rückgabewert an `login`/`register`), Abbrechen-Button in
      `ServerSetupView`, Server-Adresse wird bei Abbruch zurückgesetzt. Test-Log:
      docs/tests/test_2026.09.27_12.41.00.md – Konten-Flow selbst bitte einmal von dir gegenprüfen (nicht per
      UI-Automation testbar).
- [x] Allgemeiner Bug-Sweep (Code-Review über den gesamten Tages-Diff, `/code-review high`). Zwei echte Bugs gefunden
      und behoben:
      1. `BackupEngine.runBackup()` prüfte den Access-Token unter Keychain-Account „default" statt der echten
         Account-ID → Auto-Backup UND der manuelle „Backup jetzt starten"-Button liefen für jeden echten Nutzer
         stillschweigend ins Leere. Fix: `KeychainStore.get(.accessToken, account: AccountsStore.activeAccountId)`.
      2. Im Konten-Hinzufügen-Sheet (`AddAccountFlow`) schloss `dismiss()` in `LoginView` nicht das Sheet, sondern
         poppte nur zurück zu `ServerSetupView` (weil `LoginView` dort gepusht statt Sheet-Root ist) – nach
         erfolgreichem Login blieb das Sheet offen. Zugleich wurde `ServerConfig.baseURL` schon beim Tippen auf
         „Weiter" global gesetzt, bevor Login/Registrierung feststand, was der noch aktiven Session kurzzeitig den
         falschen Server unterschieben konnte. Fix: `ServerSetupView`/`LoginView`/`RegisterView` bekommen ein
         `candidateServerURL`, das erst direkt vor dem eigentlichen Request gesetzt wird, plus ein `onSuccess`-Override
         für den echten Sheet-Dismiss.
      Kleinere Funde ebenfalls behoben: Zyklus-Lücke im Alben-„Verwalten"-Picker (eigene Unteralben ließen sich als
      neues Elternalbum wählen), veraltete Doc-Kommentar-Referenz auf das entfernte `addAccount()`. Ein Swift-6-
      Concurrency-Fund wurde gegen den tatsächlich grünen Build geprüft und als False Positive verworfen. Ein
      Perf-Punkt (sequenzielles Cover-Laden bei tief verschachtelten leeren Alben-Ordnern) bewusst nicht angefasst,
      siehe docs/TODO.md Abschnitt „Bekannte kleinere Punkte". Test-Log: docs/tests/test_2026.09.27_12.41.00.md

### iOS – UI/UX
- [x] Blauer "+"-Button (Alben-Tab) verkleinert: 56×56 → 44×44, Icon 20pt → 15pt.
- [x] Suche aus der unteren Tab-Bar entfernt, jetzt oben rechts in der Mediathek (Lupe neben dem Sammlungen-Menü).
- [x] Alben/Ordner per Drag & Drop verschieben können (bisher laut README nur im Web, iOS fehlt das). → iOS: Album auf Album ziehen (Übersicht Raster/Liste + Unteralben-Chips) = Reparenting via PUT /albums/:id wie im Web; „Nach …“-Ablage-Chip bzw. Kontextmenü für eine Ebene höher; Akzent-Highlight + Haptik.
- [x] Listen-/Raster-Ansicht umschaltbar machen (Raster mit Vorschaubild). → Glas-Umschalter unten links, Wahl per @AppStorage gespeichert; Kacheln mit Cover (erstes Asset bzw. aus Unteralbum), Name, Anzahl.
- [x] Foto-Viewer-Filmstreifen (unten, "welches Bild kommt als Nächstes") soll sich wie Apples natives Fotos-App
      verhalten (größeres, live mitscrubbendes zentrales Thumbnail etc.) – es gibt schon eine erste Version
      (FilmstripView in PhotoViewerView.swift), soll an Apples Vorbild angeglichen werden.
      → Umgesetzt (neue `Features/Viewer/FilmstripView.swift`, Pager auf paging-ScrollView umgestellt): schmale, fast
      lückenlose Hochkant-Thumbnails; das zentrale Bild öffnet sich auf sein echtes Seitenverhältnis mit etwas Abstand;
      der Streifen hängt 1:1 am Live-Offset des Haupt-Pagers (Breite wechselt beim Wischen fließend zum nächsten Bild);
      beim Scrubben klappen alle Thumbnails schmal zusammen, das Hauptbild wechselt live, mit Schwung + Einrasten und
      Aufklappen beim Loslassen; Tap auf ein Thumbnail springt dorthin; blendet mit den übrigen Controls ein/aus.
- [x] 7 Testbilder aus `testbilder/` in die lokale Bibliothek hochgeladen, damit die App im Simulator nicht leer ist.

### Einstellungen / Admin
- [x] Globales ML-Job-Panel in der App: Backend hatte bereits `POST /api/admin/ml/rescan` (ganze Bibliothek
      requeuen) und `GET /api/admin/ml/status` (Queue-Zähler) – fehlte nur die UI dafür.
      → iOS erledigt: Sektion „ML-Verarbeitung" in AdminView (Queue-Zähler mit Auto-Refresh + „Neu prüfen", Rescan mit Bestätigungsdialog).
      Web-UI dafür ist noch offen, siehe docs/TODO.md.
- [x] Admin: neue Nutzer-Accounts direkt anlegen (E-Mail+Passwort, kein Self-Signup). Backend hat bereits
      `POST /api/admin/users` (Body: email, password, name?, role?) – fehlte nur die UI dafür.
      → iOS erledigt: CreateUserView (Sheet aus AdminView, Validierung, Rollen-Picker, deutsche Fehlermeldungen).

### Automatischer Upload (iPhone → Server)
- [x] Toggle zum Ein-/Ausschalten des automatischen Backups der neuesten Fotos. (iOS: BackupSettingsView, gated BGProcessingTask)
- [x] Ziel-Ordner konfigurierbar. (iOS: Ziel-Album per Name oder Auswahl, wird bei Bedarf angelegt)
- [x] Dateinamens-Template konfigurierbar (z.B. `yyyy.mm.dd_Titel` oder einfach der Bildtitel – frei einstellbar). (iOS: Platzhalter {title} {yyyy} {mm} {dd} {hh} {min} {ss}, Live-Vorschau)
- [x] Ordnerstruktur wählbar: alles in einem Ordner sammeln ODER automatisch Unterordner pro Monat anlegen. (iOS: Schalter „Nach Monat sortieren“ → Kind-Album YYYY-MM)

### Sonstiges
- [x] App-Icon-Entwürfe (mehrere Varianten von Claude, Louis entscheidet). → Entscheidung: „Vollblüte" (6 Blütenblätter,
      warme Eigenpalette). Als AppIcon.appiconset (1024×1024, opak) eingebaut.
- [x] Mediathek: Pinch-to-Zoom wie in Apples Fotos-App (Kacheln beim Zoomen größer/kleiner, Spaltenzahl passt sich an).
      → Stufen 1/3/5/7 Spalten (iPad 3/5/7/9/12), Zoomstufe wird gemerkt. Recherche: Apple interpoliert beim Pinch
      kontinuierlich zwischen zwei Stufen (Kacheln fließen unter den Fingern um, Foto unter den Fingern bleibt stehen)
      und federt beim Loslassen auf die nächste Stufe. Muster wie in Open-Source-Nachbauten: LazyVGrid bleibt, wird
      während der Geste ausgeblendet; ein Overlay zeichnet nur den sichtbaren Ausschnitt mit interpolierten Frames
      (UIPinchGestureRecognizer via UIGestureRecognizerRepresentable), danach unsichtbare Übergabe ans Grid mit
      Scroll-Korrektur (ScrollPosition, inkl. Large-Title-Kollaps). Dateien: Features/Timeline/TimelineGridZoom.swift,
      TimelineThumbnail.swift, TimelineView.swift.

## 2026-09-27 (Teil 2 – weiterer Bug-Sweep + Funktions-Recherche)

### Bug-Sweep ml-service / backup-worker
- [x] `mlPipeline.service.ts`: Gesichtserkennungs-Schwellwert verwechselte Kosinus-Ähnlichkeit mit euklidischem
      Abstand (face_recognition nutzt Abstand ≤0.6) – Cluster waren viel zu locker, verschiedene Personen landeten
      zusammen. Zusätzlich nahm `find()` den ersten statt den nächsten Treffer. Behoben.
- [x] Fehler in der ML-Pipeline wurden mit `.catch(() => null)` verschluckt → Jobs galten als „completed", obwohl
      ml-service ausgefallen war; BullMQ-Retries (`attempts: 3`) griffen nie, Assets blieben dauerhaft ohne
      Embedding/Tags/Gesichter. Jetzt `Promise.allSettled` + Fehler wird geworfen, damit retry greift.
- [x] Race Conditions bei `concurrency: 2` (z.B. durch den neuen Rescan-Button): parallele Jobs für dasselbe Asset
      erzeugten doppelte Tags/Face-Cluster. Jetzt Sperre pro Nutzer + Transaktionen für Tags/Gesichter (wirkt nur bei
      genau einer Worker-Instanz).
- [x] Veraltete Face-Detections blieben bei erneutem Lauf ohne gefundene Gesichter stehen. Behoben.
- [x] Modell-Caching (CLIP/YOLO) war nicht thread-sicher, Risiko doppelten Ladens/OOM auf der 4GB-NAS. Locks ergänzt.
- [x] EXIF-Rotation wurde bei Gesichtserkennung/Embeddings ignoriert (gedrehte Handyfotos → falsche/keine
      Erkennungen). `exif_transpose` ergänzt.
- [x] Kaputte/riesige Bilder gaben nacktes 500 zurück; jetzt sauberes 422. `embed_text` truncated jetzt lange Texte
      statt abzustürzen.

Offen gebliebene Kleinfunde aus diesem Sweep: siehe docs/TODO.md.

### Frontend-Bug-Sweep (Web, frontend/src)
- [x] **Alben-Baum Drag&Drop (hoch)**: Drop-Events auf verschachtelten `<li>` bubbelten ohne `stopPropagation` hoch →
      ein Drop auf ein Unteralbum löste gleichzeitig PUTs auf Ziel, jeden Vorfahren UND die Wurzel aus (welcher
      gewinnt war zufällig); Ziehen auf eigenes Unteralbum wurde vom Backend abgelehnt, der Root-Handler verschob das
      Album trotzdem an die oberste Ebene. Fix: `stopPropagation` + client-seitige Zyklus-Prüfung.
- [x] Infinite Scroll (Mediathek): Doppel-Laden durch State-Timing (Mount/StrictMode/Observer), Duplikate bei neu
      hochgeladenen Assets, `loading` blieb bei Fehlern für immer `true` (kein try/finally). Fix: Ref-Guard,
      ID-Deduplizierung, Fehler-mit-Retry-Anzeige.
- [x] Suche: Tag-/Kamera-Filter blieben während laufender Suche klickbar, langsame alte Antwort überschrieb neuere
      (Label/Treffer passten nicht mehr zusammen), Fehler wurden verschluckt. Fix: fortlaufende Request-ID.
- [x] Öffentliche Freigabe-Links mit Passwort: Thumbnail-URL enthielt das Passwort nicht (alle Bilder kaputt bei
      geschützten Alben), falsches Passwort ohne Meldung. Fix.
- [x] Abgelaufener Refresh-Token: UI wirkte weiter eingeloggt (jeder Request scheiterte still). Fix: Event setzt
      `user` zurück, ProtectedRoute leitet zum Login um.
- [x] Unteralben-Wechsel: alte Antwort konnte neueres Album überschreiben, 404 blieb für immer „Lädt…“, Picker bot
      eigene Unteralben als Elternalbum an (Backend lehnt ab). Fix.
- [x] Doppelte React-Keys in PhotoGrid (`key={group.label}`), zu kurzes Freigabe-Passwort gab nur generisches
      „Validation failed“. Fix.

Offen gebliebene Funde aus diesem Sweep: siehe docs/TODO.md.

### Backend-Bug-Sweep
Test-Log: docs/tests/test_2026.09.27_15.51.00.md

**Kritisch, behoben (nach Rückfrage, Louis wollte sofortigen Fix):**
- [x] **Alben-Ordner waren nicht pro Nutzer getrennt** (`album.service.ts`, `filesystem.service.ts`): Pfad war
      `/${name}` bzw. `/${year}/${month}` ohne User-Präfix – zwei Nutzer mit gleichem Albumnamen oder im selben
      Jahr hätten sich einen physischen Ordner geteilt. Fix: `createAlbum`/`moveAlbumFolder` verankern Root-Alben
      jetzt unter `/${userId}/…`, `yearMonthFolder(userId, date)` ebenso. Bestehende Daten mit neuem Skript
      `backend/scripts/migrate-user-scoped-paths.ts` migriert (idempotent, pro Nutzer: verschiebt jede Datei einzeln
      + schreibt `assets.path`/`albums.path` um). Lokal ausgeführt: 4 Alben + 8 Assets verschoben, alte leere
      Ordner aufgeräumt. **Für die echte NAS-Installation muss dieses Skript einmal nach dem Deploy laufen**
      (`cd backend && npx tsx scripts/migrate-user-scoped-paths.ts`).

**Kritisch, behoben:**
- [x] `app.ts`: `sharingRouter` hing hinter `/api` mit pauschalem Login-Zwang → **jeder öffentliche Freigabe-Link
      gab 401** (Feature war komplett kaputt). Reihenfolge korrigiert, öffentlicher Router zuerst.
- [x] **Stored XSS**: client-gelieferter MIME-Typ wurde 1:1 ausgeliefert – eine hochgeladene `text/html`-Datei
      rendert auf der App-Domain, über Freigabe-Links sogar ohne Login. Neue `utils/sendAssetFile.ts`: nur
      Bilder (ohne SVG)/Videos werden inline angezeigt, alles andere als Download mit `CSP: sandbox`.
- [x] Pfad-Traversal über Album-Namen (z.B. `../2026/09` ließ ein Album auf beliebige Ordner zeigen). Namen mit
      `/`, `\`, `.`, `..` werden jetzt abgelehnt.

**Mittel, behoben:**
- [x] Upload-Race + **Cross-Filesystem-Bug**: `rename()` zwischen Temp- und Ziel-Verzeichnis schlägt in Docker über
      Volume-Grenzen (`/tmp` vs. `/photos`) mit `EXDEV` fehl – **hätte jeden Upload auf der echten NAS/Docker-Deployment
      kaputt gemacht**, lokal (gleiches Dateisystem) unsichtbar. Jetzt atomar per `link`/`copyFile(COPYFILE_EXCL)`,
      Temp-Dateien werden immer aufgeräumt. Mit 6 parallelen Uploads getestet, keiner ging verloren.
- [x] Album umbenennen nutzte ungeschütztes Prisma-`startsWith` (→ SQL-LIKE ohne Escaping) – ein Album „ZQ_1" verzerrte
      beim Umbenennen auch Pfade von „ZQX1" (live nachgestellt). Zusätzliche JS-Prüfung ergänzt.
- [x] Nutzer mit selbst erstelltem Freigabe-Link ließ sich nicht löschen (500, FK `ON DELETE RESTRICT`). Links werden
      jetzt in derselben Transaktion mitgelöscht.
- [x] `?favorite=false`/`?archived=false` wirkte wie `true` (`z.coerce.boolean()`-Falle). Behoben.

**Gering, behoben:** korruptes JSON/fehlende Datei/Multer-Limit gaben 500 statt 400/404/413; UTF-8-Dateinamen wurden
beim Upload verstümmelt; paralleles Thumbnail-Schreiben konnte halb-geschriebene Dateien liefern (jetzt Temp+Rename).

Zusätzlich geprüft und **widerlegt** (also kein Fix nötig): Overflow bei `_sum(size)` in Admin-Stats, pHash bei
Bildern mit Alphakanal, Pagination bei `takenAt = null`. Nur berichtete, nicht behobene Funde aus diesem Sweep:
siehe docs/TODO.md.

### Funktions-Recherche: Apple Fotos / Immich im Vergleich
- [x] Vollständiger Abgleich (Immich-Features-Seite, Apple-iOS-26-Fotos, gegen den echten Code geprüft) als Artefakt:
      https://claude.ai/artifact/34qiWiXsVptVoUeSep6AXy
      Bestätigte echte Lücken (nicht nur vermutet): keine GPS/Karten-Funktion (EXIF liest gar kein lat/long aus),
      kein Papierkorb (DELETE löscht sofort + endgültig, Datei + DB), `isArchived` existiert im Schema/API aber ganz
      ohne UI, keine Erinnerungen/"Auf den Tag genau", keine Bildbearbeitung.
      Tier-1-Vorschlag (bester Aufwand/Nutzen, baut auf Vorhandenem auf): GPS+Karte, Papierkorb, Archiv-UI
      fertigstellen, einfache Erinnerungen, Basis-Bildbearbeitung. Tier 2/3 (Partner-Freigabe, geschütztes Album, OCR,
      hierarchische Tags, OAuth / Diashow, Cast, externe Bibliotheken, Stapel, RAW) im Artefakt mit Begründung.

### Bekannte kleinere Punkte (nicht dringend) – erledigt
- [x] Raster/Listen-Umschalter und "+"-Button unterschiedlich hoch (Louis-Screenshot). `.buttonStyle(.glass)` beim
      "+"-Button polstert den Inhalt intern zusätzlich, dadurch wurde er höher als der Umschalter trotz gleicher
      44pt-Angabe. Fix: beide bekommen jetzt zusätzlich ein äußeres `.frame(height: 44)` NACH dem Glass-Style/-Effect,
      das erzwingt exakt dieselbe Endgröße unabhängig vom internen Padding.

Weitere, noch offene Punkte aus dieser Liste: siehe docs/TODO.md.

### Dateiformat-Unterstützung
Test-Log: docs/tests/test_2026.09.27_15.51.00.md

**Befund (vorher, belegt):**
- [x] **sharp kann kein iPhone-HEIC dekodieren**: npm-Binary (sharp 0.35.4 / libvips 8.18.6) hat libheif nur mit
      AV1-Decoder (`format.heif.input.fileSuffix = [".avif"]`); `metadata()` klappt (heif/hevc), jede Pixel-Operation
      scheitert mit `heif: Decoder plugin generated an error` → Thumbnail **500**. (Immich löst das mit eigenem
      libvips/libheif/libde265-Build im Docker-Base-Image.)
- [x] **iOS-App lädt alles als `application/octet-stream` hoch** (`APIClient.upload`), Backend speicherte das 1:1 →
      iPhone-Uploads hatten keine EXIF-Daten/Aufnahmedatum/Hash, wurden als `attachment` ausgeliefert, Videos galten
      nicht als Video (Web + iOS `isVideo`, Collections-Filter `video/`).
- [x] Videos und sonstige Dateien: Thumbnail **500**. Range-Requests (206) für Video-Streaming funktionierten bereits.
- [x] Web-Viewer zeigte HEIC-Original per `<img>` → in Chrome/Firefox/Edge leeres Bild.

**Behoben:**
- [x] Neue Dependency `heic-decode` (libheif als WebAssembly, reines npm, keine System-Pakete, ~10 MB):
      `services/imageDecoder.service.ts` nutzt sie nur für HEVC-HEIC (nativer Pfad, falls libvips es doch kann).
      ~0,4 s pro 12-MP-Foto, einmalig (Ergebnis wird gecacht). Auch der pHash nutzt das jetzt (Duplikate HEIC↔JPEG).
- [x] `utils/mediaType.ts`: generischer Client-MIME-Typ wird beim Upload per Dateiendung ersetzt (nur Raster-Bilder
      + Videos, kein SVG/HTML); `sendAssetFile` nutzt das auch für Altbestände.
- [x] `thumbnail.service.ts`: zwei Varianten wie bei Immich – `thumbnail` (400² WebP) und neu `preview` (JPEG, max.
      2048 px) unter `GET /assets/:id/preview` + öffentlicher Freigabe-Variante. EXIF-Rotation wird jetzt angewendet.
      Videos: Standbild via **optionalem ffmpeg** (`FFMPEG_PATH`, Fallback auf 1. Frame bei Clips < 1 s). Nicht
      renderbar → Icon-Platzhalter mit **200** (`X-Rendition-Placeholder: 1`, `no-store`) statt 500; Fehlschläge
      10 min nicht erneut versucht, parallele Erzeugung derselben Datei dedupliziert.
- [x] Web: Viewer zeigt HEIC/TIFF/RAW über `/preview`, Original per „Original herunterladen“; Video mit Poster +
      Hinweis, wenn der Browser das Format nicht abspielt (HEVC in Firefox); Video-Badge im Grid.

Offene/bewusst nicht gemachte Punkte zum Dateiformat-Support: siehe docs/TODO.md.

## 2026-09-27 (Teil 3 – Tier 1 der Feature-Roadmap)

Backend-Grundlagen (Schema/Migration/Kern-Logik) macht Claude selbst, weil mehrere Features dieselbe
`schema.prisma` anfassen (Migrations-Reihenfolge muss stimmen). UI (Web + iOS) läuft danach parallel als zwei
Agents.

### Backend-Grundlagen (fertig)
Test-Log: docs/tests/test_2026.09.27_16.20.00.md
- [x] GPS: `latitude`/`longitude` im Asset-Schema (+ `locationCity`/`locationCountry`-Spalten für später vorbereitet,
      noch nicht befüllt – bewusst zurückgestellt, siehe Notiz unten). EXIF-Extraktion via `exifr.gps()` in
      `exif.service.ts`. Neuer leichtgewichtiger Endpunkt `GET /api/assets/map` ({id, latitude, longitude, takenAt}).
- [x] Papierkorb: `deletedAt`-Spalte, `DELETE /:id` verschiebt jetzt in den Papierkorb (statt Sofort-Löschen, ohne
      Client-Änderung nötig), `POST /:id/restore`, `DELETE /:id/permanent`, `GET /assets?trashed=true`.
      Automatischer Purge nach 30 Tagen (stündlicher Timer in `index.ts`, kein zusätzlicher Job-Scheduler nötig).
      Alle bestehenden Listen-Abfragen (Suche, Duplikate, Admin-Stats/Rescan, Stats-Übersicht) blenden Papierkorb
      jetzt aus.
- [x] Archiv: Toggle-Endpoint existierte schon (`PUT /:id` mit `isArchived`), nur UI fehlte – siehe Web/iOS unten.
- [x] Erinnerungen: `GET /api/assets/memories` – matcht Monat+Tag von `takenAt` gegen heute, alle Vorjahre, nach
      Jahr gruppiert (`yearsAgo` mitgeliefert).
- [x] Bildbearbeitung: `POST /:id/edit` (`rotate`/`crop`/`brightness`/`contrast`), `POST /:id/revert`. Nicht-
      destruktiv: erste Bearbeitung sichert `<pfad>.original`, jede weitere Bearbeitung wird immer frisch auf
      dieses Backup angewendet (kein Verlust durch mehrfaches Re-Encode), Revert stellt exakt das Original wieder
      her. `.original`-Backup wird bei „endgültig löschen"/Purge mit entfernt.
      Bekannte kleine Lücke (offen, siehe docs/TODO.md „Bekannte kleinere Punkte"): bei Album-Verschieben/Umbenennen
      wandert das `.original`-Backup nicht mit (verwaist, kostet nur etwas Speicherplatz).
- [x] Nebenbei: iOS lud bisher jede Datei als `application/octet-stream` hoch (Fund vom Dateiformat-Agent) –
      `APIClient.upload()` sendet jetzt den echten MIME-Typ über `UTType`, Build grün.

Bewusst nicht gemacht: Reverse-Geocoding (Stadt/Land aus GPS) – Spalten sind vorbereitet, aber keine offline-
Geocoding-Bibliothek unter Zeitdruck ausgewählt/eingebaut. Karte funktioniert auch ohne das (Pins per lat/long).

### Web-Oberfläche (ein Agent, alle 5 Punkte) – Test-Log: docs/tests/test_2026.09.27_16.20.00.md
- [x] **Karte**: neue `pages/MapPage.tsx` (Route `/map`) mit `react-leaflet@4` + `leaflet` und OSM-Kacheln (kein API-Key); Pins sind Foto-Thumbnails (divIcon), eigenes Pixel-Raster-Clustering je Zoomstufe mit Zähler-Badge (Klick zoomt hinein, am selben Ort Popup-Raster). Popup-Thumbnail öffnet den Viewer; leerer Zustand „Noch keine Fotos mit Standort“.
- [x] **Papierkorb**: neue `pages/TrashPage.tsx` (Route `/trash`, `?trashed=true`, Infinite Scroll über neuen `hooks/usePaginatedAssets.ts`) mit Restlaufzeit, „Wiederherstellen“ und „Endgültig löschen“ (Bestätigung über neuen `components/ConfirmDialog.tsx`). Viewer hat „In den Papierkorb“ bzw. im Papierkorb-Modus Wiederherstellen/Endgültig löschen; Duplikate-Button heißt jetzt „In den Papierkorb“.
- [x] **Archiv**: „Archivieren“/„Aus Archiv holen“-Button im Viewer (`PUT {isArchived}`, mit Hinweisbanner) plus neue `pages/ArchivePage.tsx` (Route `/archive`, `?archived=true`, Zurückholen direkt pro Kachel). Sidebar hat neuen Abschnitt „Bibliothek“ mit Duplikate/Archiv/Papierkorb.
- [x] **Erinnerungen**: neue `pages/MemoriesPage.tsx` (Route `/memories`) mit einem horizontalen Karussell pro Jahr („Vor 3 Jahren · 2023 · 2 Fotos“) sowie `components/MemoriesPreview.tsx` als Kachel-Leiste oben in der Mediathek (erscheint nur, wenn es heute Erinnerungen gibt).
- [x] **Bildbearbeitung**: neuer `components/PhotoEditor.tsx` als Vollbild-Modus über dem Viewer („Bearbeiten“, nur Bilder) mit `react-image-crop` (Zuschnitt frei/1:1/4:3/3:4/16:9), Drehen links/rechts, Helligkeit/Kontrast mit CSS-Filter-Live-Vorschau, „Speichern“ = ein `/edit`-Call, „Original wiederherstellen“ = `/revert`. Da der Server immer vom Original rechnet, rechnet `editor/editMath.ts` Zuschnitt/Drehung einer Folgebearbeitung auf Original-Koordinaten um (letzte Bearbeitung pro Foto in `editor/editHistory.ts`/localStorage); Thumbnails/Viewer bekommen `?v=<size>` gegen veraltete Browser-Caches.

### iOS-Oberfläche (ein Agent, alle 5 Punkte) – Test-Log: docs/tests/test_2026.09.27_16.20.00.md
- [x] **Karte**: neue `Features/Collections/PhotoMapView.swift` – MapKit-`Map` mit Thumbnail-Pins aus `/assets/map`, eigenes Clustering je Zoomstufe (Zähler-Badge), Standard/Satellit-Umschalter; Pin-Tap öffnet ein Vorschau-Sheet (Einzelfoto oder Raster), von dort `PhotoViewerView`.
- [x] **Papierkorb**: neue `Features/Collections/TrashView.swift` – Liste aus `?trashed=true` mit Restlaufzeit („Noch N Tage“), Swipe rechts = Wiederherstellen, Swipe links = Endgültig löschen (Bestätigungs-Alert), dazu „Alle wiederherstellen“/„Papierkorb leeren“. Viewer hat neuen „In den Papierkorb verschieben“-Button, Duplikate-Button umbenannt.
- [x] **Archiv**: Archiv-Toggle (`archivebox`) im Viewer-Overlay (`PUT {isArchived}`), neue `Features/Collections/ArchiveView.swift` (Raster aus `?archived=true`, Kontextmenü zum Zurückholen). Mediathek/Sammlungen blenden archivierte/gelöschte Fotos ohne Neuladen aus (`Services/AssetChanges.swift`).
- [x] **Erinnerungen**: neue `Features/Collections/MemoriesView.swift` – je Jahr „Vor N Jahren“ mit horizontaler Fotoreihe (erstes Foto als großes Cover), Tap öffnet den Viewer mit den Fotos des Jahres. Erreichbar wie Karte/Archiv/Papierkorb über `CollectionsView` und das Menü der Mediathek.
- [x] **Bildbearbeitung**: neue `Features/Viewer/PhotoEditorView.swift` + `PhotoEditModel.swift` – Drehen (90°-Schritte), Zuschneiden mit ziehbaren Ecken/Kanten und Seitenverhältnis-Presets, Helligkeit/Kontrast-Regler mit Live-Vorschau; „Fertig“ = ein `/edit`-Call, „Original“ = `/revert`. Thumbnails/Viewer laden danach automatisch neu (Cache-Busting).

## 2026-09-27 (Teil 4 – Album-Kontextmenü)

Louis-Wunsch: Drei-Punkte-Menü auf jeder Album-Kachel/-Zeile mit "Cover ändern" (Foto aus dem Album wählen),
"Freigeben" (bestehenden Sharing-Flow öffnen) und "Löschen" (mit Rückfrage, was mit den enthaltenen Fotos
passieren soll: in ein anderes Album verschieben, oder mit löschen/in den Papierkorb). Offene Zusatzideen fürs
Menü (unbewertet): siehe docs/TODO.md.

**`PUT /api/albums/:id` – Cover ändern (Backend):**
- [x] Akzeptiert jetzt `coverAssetId` (Spalte existierte schon im Schema, war aber nirgends im Update-Endpunkt
      verdrahtet). Validiert, dass das gewählte Foto wirklich im Album ist.
      (`album.service.ts: updateAlbum`, `moveAlbumFolder`; `albums.routes.ts: updateSchema`)

**`DELETE /api/albums/:id` – Löschen mit `assetAction` (Backend):** Test-Log: docs/tests/test_2026.09.27_16.41.00.md
- [x] `deleteAlbum` (`album.service.ts`) hat jetzt einen `assetAction`-Parameter: `"keep"` (Default, heutiges
      Verhalten – Fotos bleiben unverknüpft/tauchen weiter in der Mediathek auf), `"move"` + `targetAlbumId`
      (nur Fotos, die physisch in diesem Album-Ordner liegen, werden per (neu exportiertem) `placeFileUniquely`
      aus `asset.service.ts` + `deleteFile` ins Zielalbum verschoben, `AlbumAsset`-Link wird per `upsert`
      nachgezogen), `"trash"` (alle Fotos im Album – also die ganze `AlbumAsset`-Liste, nicht nur physisch
      dort liegende – werden per `trashAsset` in den Papierkorb verschoben). Route `DELETE /api/albums/:id`
      liest jetzt einen optionalen JSON-Body `{assetAction?, targetAlbumId?}` (Zod-Schema mit Default `"keep"`
      und Pflicht-`targetAlbumId` bei `"move"`).

**iOS-UI:** Test-Log: docs/tests/test_2026.09.27_16.55.00.md
- [x] Drei-Punkte-Kontextmenü (`.contextMenu`) auf den Album-Kacheln/-Zeilen in `AlbumsView.swift` (Grid + Liste),
      mit drei Einträgen:
      - **Cover ändern**: neues `AlbumCoverPickerSheet` (Fotoraster des Albums, Tap ruft
        `AlbumsViewModel.setCover(album:assetId:)` → `PUT /albums/:id {coverAssetId}`).
      - **Freigeben**: `SharingView` bekommt einen neuen `preselectedAlbumId`-Init-Parameter, wird als Sheet mit
        vorausgewähltem Album geöffnet (bestehender Freigabe-Flow, kein neuer Code dafür nötig).
      - **Löschen**: `confirmationDialog` mit drei Varianten bei nicht-leerem Album (Fotos behalten / in ein
        anderes Album verschieben – neues `AlbumMoveTargetPicker`-Sheet zur Zielwahl / in den Papierkorb
        verschieben), bei leerem Album nur eine einfache Bestätigung. Ruft
        `AlbumsViewModel.deleteAlbum(albumId:assetAction:targetAlbumId:)` → `DELETE /albums/:id`. Enthält
        Sub-Alben bereits vorab client-seitig geprüft (deutsche Fehlermeldung statt Server-Rundreise), da der
        Server das Löschen von Alben mit Unteralben ablehnt.
      Build grün (`xcodegen generate` + `xcodebuild ... build` → BUILD SUCCEEDED). Interaktive Verifikation per
      Tap war in dieser Umgebung nicht möglich (kein steuerbares Simulator-Fenster, siehe Test-Log) – bitte von
      Louis im Simulator/Gerät gegenprüfen (siehe docs/TODO.md „Bekannte kleinere Punkte").

## 2026-09-27 (Teil 5 – Foto-Viewer-UI wie Apple Fotos)

Louis schickte zwei Screenshots der echten Apple-Fotos-App (Viewer-Chrome oben/unten + das per Swipe-nach-oben
erreichbare Info-Panel) mit der Bitte, unser Viewer-UI danach nachzubauen. Test-Log:
docs/tests/test_2026.09.27_17.05.00.md

- [x] **Obere Leiste** (`PhotoViewerView.swift`): Zurück-Chevron (links), neue `DateTimePill` (mittig, zweizeilig
      Datum/Uhrzeit, fest deutsch formatiert), "..."-Menü (rechts, aktuell mit Archivieren/Aus Archiv holen -
      einzige Bibliotheksaktion, die nicht mehr in die untere Leiste passt).
- [x] **Untere Leiste**: von einer Text-Metadatenzeile auf 5 einzelne Glas-Icons umgestellt wie im Screenshot -
      Teilen, Favorit, Info, Bearbeiten (nur bei Bildern), Papierkorb (letztere drei weiterhin nur bei
      `showsLibraryActions`).
- [x] **Neues Info-Panel** (`PhotoInfoView.swift`): `.sheet` mit `.medium`/`.large`-Detents (gleiches Drag-
      Verhalten wie Apples Panel), Karten für Datum, Kamera+Format-Badge, Objektiv+Größe (MP/Auflösung/
      Dateigröße), 4-Spalten-Werte-Zeile (Brennweite/Blende/Belichtungszeit/ISO), Mini-Karte bei vorhandenem GPS.
      Bewusst ausgelassen: editierbare Felder (Untertitel/Ort/Schlagwörter hinzufügen) und App-Quellen-Zeilen wie
      "Von WhatsApp gesichert" - beides ohne Entsprechung im Backend bzw. nicht auf unsere App übertragbar.
      `Models/Asset.swift` bekam dafür `latitude`/`longitude` (Backend lieferte die Felder schon immer mit, das
      iOS-Modell hat sie nur nicht dekodiert).
- [x] Öffnen per Tap auf den Info-Button ODER per Wisch-nach-oben-Geste auf dem Foto (`simultaneousGesture`, nur
      bei eindeutig vertikaler/nach-oben gerichteter Bewegung, damit horizontales Blättern/Pinch-Zoom unangetastet
      bleiben).

Build grün, interaktive Verifikation per Tap in dieser Umgebung nicht möglich (siehe Test-Log) - bitte von Louis
im Simulator/Gerät gegenprüfen.

## 2026-09-27 (Teil 6 – Umbenennen-Fix + "Sammlungen"-Kacheln im Alben-Tab)

Test-Log: docs/tests/test_2026.09.27_17.11.00.md

- [x] **Bug-Fix Alben-Umbenennen**: `AlbumDetailView.swift` zeigte den neuen Namen erst nach Verlassen und
      erneutem Öffnen des Albums, weil `.navigationTitle(album.name)` das beim Navigations-Push eingefrorene
      `Album`-Struct nutzte statt des frisch nachgeladenen `detail`. Neue `currentAlbum`-computed-property leitet
      Name (und übrige Felder) aus `detail` ab, sobald vorhanden; `.navigationTitle` und die
      `AlbumManageSheet`-Initialisierung nutzen jetzt `currentAlbum` - Titel aktualisiert sich direkt nach dem
      Speichern.
- [x] **"Sammlungen"-Kachelraster im Alben-Tab**: die bisher nur über ein Dropdown-Menü in der Mediathek
      erreichbaren Erinnerungen/Karte/Duplikate/Archiv/Papierkorb/Sammlungen stehen jetzt zusätzlich als
      2-spaltiges Kachelraster oben im Alben-Tab (`AlbumsView.swift`, neuer `SystemCollectionTile`-Enum +
      `SystemCollectionTileView`) - quadratische Kacheln mit echtem Vorschaufoto und Titel-Overlay wie bei
      Apple, Farbverlauf+Icon als Fallback bei leeren Kategorien. Je Kachel ein leichtgewichtiger Id-only-Fetch
      (`/assets/memories`, `/assets/map`, `/assets/duplicates`, `/assets?archived=true&limit=1`,
      `/assets?trashed=true&limit=1`, parallel). Neue "Meine Alben"-Überschrift trennt das Raster von der
      bisherigen Alben-Liste darunter.

Build grün, interaktive Verifikation nicht möglich (siehe Test-Log) - bitte von Louis gegenprüfen.

## 2026-09-27 (Teil 7 – Medienverwaltung: Stapel, Live Photos, RAW, 360° – Backend)

Louis-Wunsch: die letzten vier Punkte aus dem "Medienverwaltung & Ansicht"-Abschnitt des
Feature-Vergleichs-Artefakts umsetzen. Entscheidung per Rückfrage: alle vier zusammen (Backend zuerst, dann
Web+iOS-UI parallel per Agenten wie bei Tier 1), Diashow+natives AirPlay statt Chromecast-SDK, volle
RAW-Dekodierung statt nur eingebettetem Vorschaubild. Test-Log: docs/tests/test_2026.09.27_17.28.00.md

- [x] **Schema**: `is360`, `stackParentId` (+ Selbstrelation `Stack`), `isLivePhotoMotion` + `livePhotoVideoId`
      (+ Selbstrelation `LivePhoto`) auf `Asset`. Migration `20260927151830_add_stacks_live_photos_360` (musste
      mangels interaktiver Shell über `prisma migrate diff --script` + `migrate deploy` statt `migrate dev`
      gebaut werden, siehe Test-Log).
- [x] **Stapel**: `stackAssets`/`unstackAsset`/`getStackMembers` (`asset.service.ts`), Routen
      `POST /assets/stack`, `DELETE /assets/:id/stack`, `GET /assets/:id/stack`. Nur der Primary bleibt in
      normalen Listen sichtbar; Auflösen (über die Primary-ID) gibt alle Mitglieder wieder frei, kein
      "neues Cover wählen" nötig. `GET /assets` liefert zusätzlich `stackCount` pro Foto (0 = kein Stapel), damit
      das Grid nicht pro Kachel einzeln nachfragen muss.
- [x] **Live Photos**: `POST /assets` akzeptiert jetzt optional `isLivePhotoMotion=true` (Video-Komponente,
      wird aus allen Listen versteckt) und `livePhotoVideoAssetId=<id>` (koppelt ein Foto an eine zuvor
      hochgeladene Video-Komponente). Validiert Eigentümerschaft und dass die Video-Komponente noch nicht
      gekoppelt ist.
- [x] **RAW-Unterstützung**: neue RAW-Dateiendungen (`.cr2/.cr3/.nef/.arw/.raf/.orf/.rw2/.pef/.srw`) in
      `mediaType.ts` auf passende MIME-Typen gemappt; neue `rawDecoder.service.ts` shellt optional zu `dcraw`
      aus (wie `ffmpeg` bei Videos: fehlt es, gibt's einen sauberen Platzhalter statt 500), `thumbnail.service.ts`
      nutzt das für Thumbnail (halbe Auflösung) und Preview (volle Auflösung). `dcraw` zur
      `backend/Dockerfile`-apt-Zeile hinzugefügt.
- [x] **360°-Erkennung**: `exif.service.ts` liest jetzt XMP (`GPano:ProjectionType`/`UsePanoramaViewer`) und
      fällt bei fehlenden XMP-Tags auf eine Seitenverhältnis-Heuristik zurück (exakt ~2:1 bei ≥3000px Breite).
- [x] **"Verstecken aus Listen"-Filter** (`stackParentId: null`, `isLivePhotoMotion: false`) ergänzt in
      Haupt-Timeline, `/assets/map`, `/assets/memories`, Suche, Duplikat-Erkennung, Stats-Übersicht. Bewusst
      NICHT in den Admin-Speicherplatz-Stats/ML-Rescan - die verstecken Assets belegen echten Speicherplatz und
      sollen weiterhin ML-verarbeitet werden.

Diashow/AirPlay braucht laut aktuellem Stand keine Backend-Änderungen (reine UI auf vorhandenen Endpunkten).

### iOS-Oberfläche (ein Agent, alle 5 Punkte) – Test-Log: docs/tests/test_2026.09.27_23.28.13.md

- [x] **Stapel**: Mehrfachauswahl-Modus in `TimelineView` ("Auswählen"-Button oder langes Drücken auf eine
      Kachel), Toolbar wechselt auf "Abbrechen"/"N ausgewählt"/"Stapeln" (`POST /assets/stack`, Fehler z.B. „schon
      gestapelt" über einen Alert). Gestapelte Kachel zeigt `square.stack.fill` + Zähler-Badge
      (`TimelineBadges.swift`), Tap öffnet neue `StackDetailView` (Raster aller Mitglieder via
      `GET /assets/:id/stack`) mit "Stapel auflösen" (Anführer-`DELETE .../stack`) bzw. pro Mitglied "Aus Stapel
      lösen" im Kontextmenü.
- [x] **Live Photos**: `BackupEngine`/`PhotoLibraryService` erkennen `PHAsset.mediaSubtypes.contains(.photoLive)`
      und laden beide Teile hoch (Video zuerst mit `isLivePhotoMotion=true`, dann Standbild mit
      `livePhotoVideoAssetId`) statt wie bisher nur das Standbild. Viewer: neue
      `Features/Viewer/LivePhotoLoopPlayerView.swift` (stummer `AVQueuePlayer`+`AVPlayerLooper`-Loop) spielt
      während "Drücken und Halten" auf dem Foto (eine einzige `onLongPressGesture(pressing:perform:)` deckt sowohl
      den normalen Tap zum Ein-/Ausblenden der Bedienelemente als auch das Halten-zum-Abspielen ab, damit sich
      keine zwei Gesture-Recognizer in die Quere kommen), dazu ein "LIVE"-Badge im Viewer und ein `livephoto`-Icon
      im Grid.
- [x] **RAW-Badge**: `Asset.isRAW` (Abgleich gegen die RAW-MIME-Typen aus `backend/src/utils/mediaType.ts`),
      "RAW"-Badge im Grid (`TimelineTopBadges`) und Viewer (`PhotoViewerPage.formatBadge`, außerdem im
      Format-Badge von `PhotoInfoView`). Vorab per Code-Review geklärt: der bestehende Original-Lade-Pfad
      (`PhotoViewerPage` lädt `/file` über `AsyncImage`, dekodiert also die rohen Bytes per `ImageIO`) brauchte
      **keine** Änderung – iOS unterstützt genau die vom Backend gelisteten Kamera-RAW-Formate
      (CR2/CR3/NEF/ARW/RAF/ORF/RW2/PEF/SRW/DNG) schon seit Jahren nativ, und `sendAssetFile.ts` liefert jeden
      `image/*`-MIME-Typ ohnehin inline aus. Nicht mit einer echten Kamera-RAW-Datei nachgestellt (keine zur
      Hand, siehe Test-Log) – bitte von Louis mit einer echten Datei gegenprüfen.
- [x] **360°-Viewer**: neue `Features/Viewer/Panorama360View.swift` – SceneKit-`SCNSphere` (Foto als
      Innentextur, `cullMode = .front`, `lightingModel = .constant`, horizontal gespiegelt gegen die
      Innenansicht-Spiegelung equirektangularer Fotos) mit `SCNView.allowsCameraControl` +
      `interactionMode = .fly` fürs freie Schwenken per Finger; lädt `/preview` (max. 2048px) statt des vollen
      Originals als Textur. Nur für `is360: true`, sonst unverändert der normale `AsyncImage`-Pfad. Automatische
      Erkennung eines 4000×2000-Testfotos als `is360: true` live gegen den Server geprüft; die eigentliche
      SceneKit-Optik (Spiegelung/Pan-Gefühl) konnte mangels steuerbarem Simulator-Fenster nicht visuell
      nachgeprüft werden.
- [x] **Diashow + AirPlay**: neue `Features/Viewer/SlideshowView.swift` (Vollbild, Play/Pause,
      2–10 s-Intervall-Slider, vor/zurück), startbar aus dem Sammlungen-Menü der Mediathek (ganze Bibliothek) und
      aus jedem Album (`AlbumDetailView`-Toolbar, nur die Fotos des Albums). Neue
      `Features/Viewer/AirPlayButton.swift` (`AVRoutePickerView`-Wrapper im Glass-Look) in der oberen Leiste von
      `PhotoViewerView`.

Build grün (`xcodegen generate` + `xcodebuild ... build` → BUILD SUCCEEDED, siehe Test-Log für einen
Umgebungs-Workaround: `xcodebuild` direkt gegen den Synology-Drive-Pfad erzeugte wiederholt „Stale NFS file
handle"-Fehler, kompiliert wurde deshalb gegen eine lokale rsync-Kopie außerhalb des Cloud-Sync-Mounts – dabei
legte Synology Drive im echten `ios/`-Ordner eine Konflikt-Kopie `Photos 2.xcodeproj` an, die die aktuellen
Dateien enthält, siehe Test-Log für Louis' nötigen Aufräumschritt). Backend-Vertrag
(Stapel/Live-Photos/360°-Erkennung/`/preview`) live gegen den laufenden Dev-Server verifiziert, alle Testfotos
danach wieder gelöscht. Interaktive Verifikation per Tap war in dieser Umgebung nicht möglich (kein steuerbares
Simulator-Fenster) – bitte von Louis im Simulator/Gerät gegenprüfen, insbesondere die Live-Photo-Geste und die
360°-Kugel-Optik.

### Web-Oberfläche (ein Agent, alle 5 Punkte + Diashow) – Test-Log: docs/tests/test_2026.09.27_23.41.50.md

- [x] **Stapel**: Mehrfachauswahl-Modus in `TimelinePage`/`AlbumDetailPage` (neuer `hooks/useStacking.ts` +
      `components/SelectionToolbar.tsx`, wiederverwendet in beiden Seiten statt dupliziert) - "Auswählen"-Button
      schaltet auf Checkbox-Overlay im `PhotoGrid` um, "Stapeln" ab 2 Auswahlen (`POST /assets/stack`, erstes
      ausgewähltes Foto wird Anführer). Gestapelte Kachel zeigt einen Stapel-Badge oben rechts (Icon + Gesamtzahl
      inkl. Anführer) zusätzlich zum bisherigen Video-Badge (jetzt `.media-badge`, unten rechts, da beides
      gleichzeitig vorkommen kann). Klick auf eine gestapelte Kachel öffnet neues `components/StackModal.tsx`
      (`GET /assets/:id/stack`) mit alle Mitgliedern, "Ganzen Stapel auflösen" bzw. pro Mitglied "Herauslösen".
      Live mit Playwright gegen den Produktions-Build getestet (siehe Test-Log): Stapeln, Modal-Inhalt,
      Einzel-Herauslösen und Komplett-Auflösen funktionieren alle nachweislich.
- [x] **Live-Photo-Viewer**: `ViewerPage.tsx` zeigt bei gesetztem `livePhotoVideoId` ein "LIVE"-Badge; Hover
      (Desktop, `onMouseEnter`/`onMouseLeave`) bzw. Drücken-und-Halten (Touch, `onTouchStart`/`onTouchEnd`) auf
      dem Foto ersetzt das `<img>` durch ein stummes, loopendes `<video>` des gekoppelten Bewegtbild-Assets. Live
      getestet: Video erscheint bei Hover mit korrektem `src` auf die verknüpfte Asset-ID, verschwindet beim
      Verlassen wieder zugunsten des Standbilds; die Video-Komponente selbst taucht nachweislich nirgends als
      eigene Kachel auf.
- [x] **RAW-Badge**: neue RAW-Formate-Liste in `api/media.ts` (`isRawAsset()`, spiegelt
      `backend/src/utils/mediaType.ts`), Badge in `PhotoGrid` und `ViewerPage`. Mit einer Test-Datei (JPEG-Bytes
      mit `.cr2`-Endung, da keine echte Kamera-RAW-Datei zur Hand - wie schon beim Backend-/iOS-Test) live
      geprüft: Badge erscheint korrekt in Grid und Viewer, und der vom Backend gelieferte Icon-Platzhalter für
      das nicht dekodierbare Fake-RAW wird sauber angezeigt statt eines kaputten Bildes.
- [x] **360°-Viewer**: neue `components/PanoramaViewer.tsx` mit `@photo-sphere-viewer/core` (aktiv gepflegtes
      npm-Paket, per Web-Recherche bestätigt weiterhin Standard für Web-Equirectangular-Panoramen; `three.js` als
      Abhängigkeit). Per `React.lazy()` code-gesplittet (eigener ~630-KB-Chunk, wird nie mitgeladen wenn kein
      360°-Foto geöffnet wird) - in `ViewerPage.tsx` und in der Diashow eingebunden, nur aktiv wenn `is360: true`.
      Live gegen den Produktions-Build geprüft: rendert einen echten WebGL-`<canvas>`, sichtbare
      equirectangular-Verzerrung des (mangels echtem Panoramafoto) synthetischen 4000×2000-Testbilds bestätigt
      echtes Sphären-Rendering statt reinem `<img>`.
- [x] **Diashow**: neue `components/Slideshow.tsx` - Vollbild-Overlay mit Tempo-Auswahl (3/4/5/8/15s),
      Play/Pause, Vor/Zurück, Foto-Zähler, Tastatursteuerung (←/→/Leertaste/Escape), startbar per neuem
      "Diashow"-Button in `TimelinePage` und `AlbumDetailPage`. Zeigt Videos als Standbild (kein Ton/Abspielen)
      und 360°-Fotos über denselben `PanoramaViewer`. Chromecast bewusst ausgelassen (Louis-Entscheidung, siehe
      TODO.md); natives AirPlay ist iOS-exklusiv (kein Web-Äquivalent).
- [x] **`api/types.ts`** um `stackCount` (optional - nur `GET /assets` liefert es), `stackParentId` (optional,
      zur Anführer-Erkennung im `StackModal`), `isLivePhotoMotion`, `livePhotoVideoId`, `is360` ergänzt.

**Befund, nicht behoben (Backend gilt als abgeschlossen)**: `GET /albums/:id` filtert anders als `GET /assets`
weder `stackParentId: null` noch `isLivePhotoMotion: false` und berechnet kein `stackCount` - ein Stapel wird
serverseitig korrekt gebildet, aber in der Album-Detailansicht (im Gegensatz zur Mediathek) weiterhin ohne
Badge und mit allen Mitgliedern einzeln angezeigt. Details siehe Test-Log.

**Nebenbei entdeckt**: der lokale `vite`-Dev-Server (Rolldown-Vite v8.3.1) kann die neu installierte,
three.js-große Abhängigkeit `@photo-sphere-viewer/core` im Dev-Modus nicht zuverlässig nachladen (`504 Outdated
Optimize Dep`, reproduzierbar auch nach Cache-Löschen) - ein Rolldown-Vite-Bug, kein App-Fehler (der
Produktions-Build funktioniert einwandfrei, siehe Test-Log). `frontend/vite.config.ts` bekam deshalb zusätzlich
einen `preview.proxy`-Eintrag für `/api` (fehlte bisher), um lokal gegen `vite preview` statt gegen den
Dev-Server testen zu können.

## 2026-09-27 (Teil 8 – drei offene Backend-Funde aus früheren Bug-Sweeps behoben)

Während die zwei UI-Agenten (Web/iOS, Teil 7) parallel liefen, wurden drei bereits dokumentierte, aber noch
offene Backend-Funde abgearbeitet. Test-Log: docs/tests/test_2026.09.27_17.46.00.md

- [x] **Öffentliche Alben gaben `path`/`userId` preis**: `resolvePublicAlbum` (`sharing.service.ts`) gab die
      volle Asset-Zeile zurück. Neue `toPublicAsset()`-Mapping-Funktion gibt jetzt nur noch die für den
      öffentlichen Viewer nötigen Felder preis. Live geprüft: Freigabe-Link erstellt, Antwort enthält
      nachweislich weder `path` noch `userId` mehr.
- [x] **Kein Timeout im ml-service-HTTP-Client**: `packages/shared/src/mlClient.ts` hatte kein Timeout auf
      `fetch()` - ein hängender ml-service-Aufruf hätte einen der zwei BullMQ-Worker-Slots auf unbestimmte Zeit
      blockiert. `AbortController` mit 60s-Timeout (env `ML_SERVICE_TIMEOUT_MS`) ergänzt. Live gegen einen
      absichtlich hängenden Test-Server geprüft: bricht nach der konfigurierten Zeit sauber mit Fehlermeldung ab
      statt für immer zu hängen.
- [x] **Cursor-Pagination ohne eindeutigen Tiebreaker**: `GET /assets`, `GET /albums/:id` und
      `GET /faces/:faceId/assets` sortierten ohne eindeutiges Feld als letzten Tiebreaker - bei Gleichstand
      (EXIF-Zeitstempel sind nur sekundengenau) konnte die Cursor-Position mehrdeutig werden. `id` als letztes
      Sortierkriterium ergänzt. `GET /faces/:faceId/assets` zusätzlich strukturell umgebaut: fragt jetzt direkt
      `Asset` über den Relations-Filter ab statt `FaceDetection` mit `distinct: ["assetId"]` + Cursor zu
      kombinieren (Postgres' `DISTINCT ON` verträgt sich strukturell nicht zuverlässig mit Prismas
      Keyset-Pagination) - jedes Foto kann so gar nicht erst doppelt auftauchen. Live mit künstlich erzeugtem
      Gleichstand (3 Fotos, identischer Zeitstempel) durchpaginiert: alle drei genau einmal, keine
      Duplikate/Lücken beim Seitenübergang.
- Nebenbei geprüft und als bereits erledigt bestätigt (nicht mehr Teil der offenen Funde): "Thumbnails für
  Nicht-Bilder liefern 500" - das wurde bereits durch das allgemeine Platzhalter-Rendition-System aus dem
  Dateiformat-Unterstützung-Abschnitt (oben) mit erledigt, live nachgeprüft (Text-Datei-Upload →
  Thumbnail-Anfrage liefert 200 + `X-Rendition-Placeholder`).
- [x] **Bearbeitungs-Backup (`.original`) wanderte nicht mit beim Album-Löschen mit `assetAction=move`**:
      Test-Log: docs/tests/test_2026.09.27_23.14.00.md. Normales Album-Umbenennen/Verschieben war nie betroffen
      (verschiebt den ganzen Ordner per `fs.rename`, Sidecar-Dateien wandern automatisch mit) - der eigentliche
      Bug steckte im heutigen `deleteAlbum`-`assetAction: "move"`-Zweig (Teil 4), der pro Foto nur die
      Hauptdatei einzeln verschob. `album.service.ts` nimmt jetzt ein vorhandenes `<pfad>.original` beim
      Foto-Verschieben mit (`renameEntry`). Live geprüft: Foto bearbeitet (→ `.original` entsteht), Album mit
      `assetAction=move` gelöscht, Ziel-Ordner enthält danach Hauptdatei UND Backup, `POST /:id/revert`
      funktioniert am neuen Ort (200 OK).
- [x] **ml-service kann jetzt HEIC lesen**: Test-Log: docs/tests/test_2026.09.27_23.25.00.md. `pillow-heif`
      ergänzt (`requirements.txt` + neue `app/__init__.py`, registriert den HEIF-Opener einmalig vor jedem
      `Image.open()`-Aufruf in `clip_service.py`/`face_service.py`). Fix-Logik in einer isolierten Test-venv mit
      einer echten HEIC-Datei zweifelsfrei bewiesen (ohne Registrierung `UnidentifiedImageError`, mit
      Registrierung korrektes Laden inkl. `ImageOps.exif_transpose`). **Wichtiger Nebenfund**: die lokale
      `ml-service/.venv` liegt im Synology-Drive-Sync-Pfad und `pip install` dort ist nicht zuverlässig -
      wiederholt `Stale NFS file handle`-Fehler und von Synology selbst erzeugte Konfliktkopien
      (`pillow-10.4.0 2.dist-info`), auch bei bereits abgeschlossenen, unveränderten Installationen. Die lokale
      venv wurde deshalb wieder ohne `pillow-heif` (aber funktionsfähig) hinterlassen - **Louis muss
      `pip install -r requirements.txt` in `ml-service/` einmal selbst laufen lassen** (siehe Test-Log für
      Workarounds, falls es dabei hakt).
- [x] **Video-Metadaten (Dauer, Aufnahmedatum) werden jetzt ausgelesen**: Test-Log:
      docs/tests/test_2026.09.27_23.30.00.md. Neue `extractVideoMetadata()`/`isFfprobeAvailable()`
      (`videoFrame.service.ts`, gleiches optionales-Binary-Muster wie `ffmpeg`/`dcraw`) liest Dauer +
      `creation_time` per `ffprobe`. `asset.service.ts` befüllt damit die bisher immer leere `duration`-Spalte
      und nutzt `creation_time` als `takenAt`-Fallback für Videos (wirkt sich dadurch auch auf die
      Jahr/Monat-Ordnerwahl aus, wie bei Fotos). Live geprüft: Testvideo mit gesetztem `creation_time` →
      korrekte Dauer + `takenAt` + Einsortierung in den passenden Jahr/Monat-Ordner; Testvideo ohne das Tag →
      Dauer weiterhin korrekt, `takenAt` bleibt `null` ohne Absturz.
- [x] **Rescan-Button reihte Duplikate ein**: Test-Log: docs/tests/test_2026.09.27_23.33.00.md.
      `enqueueMlPipeline()` (`mlQueue.ts`) übergibt jetzt `jobId: data.assetId` an BullMQ - ein erneutes
      Einreihen derselben `assetId`, solange schon ein wartender/aktiver Job dafür existiert, wird von BullMQ
      selbst verworfen statt einen Duplikat-Job zu erzeugen. Live gegen die echte Redis-Queue geprüft: dreimal
      dieselbe `assetId` eingereiht → genau ein Job mit dieser ID existiert.
- [x] **Stapel-Inkonsistenz in der Album-Detailansicht**: Test-Log: docs/tests/test_2026.09.27_23.46.00.md. Vom
      Web-Agenten gefundener Backend-Fund - `GET /albums/:id` filterte anders als `GET /assets` weder
      `stackParentId` noch `isLivePhotoMotion` und lieferte kein `stackCount`, wodurch ein Stapel in der
      Mediathek korrekt zusammengefasst erschien, in der Album-Detailansicht aber weiterhin als einzelne,
      unbadgte Kacheln. `albums.routes.ts` bekam denselben Filter + `stackCount`-Flatten wie die Haupt-Route.
      Live geprüft: Testalbum mit 2 Fotos → beide einzeln mit `stackCount: 0`; nach dem Stapeln → nur noch der
      Anführer mit `stackCount: 1`.

---

## 2026-09-28 – Session 2: OCR-Infra, ZIP-Download, Kommentare, Partner-Freigabe

Granulare Arbeitsliste in `docs/todo_2026.09.28.md`. Artefakt aktualisiert: https://claude.ai/artifact/34qiWiXsVptVoUeSep6AXy

- [x] **Prisma-Schema + Migration 20260928000003**: drei Ergänzungen in einem Schritt:
  - `Asset.ocrText String?` – OCR-Text der ml-Pipeline
  - `AlbumComment`-Modell (id, albumId, userId, body, createdAt)
  - `LibraryShare`-Modell + `LibraryShareStatus`-Enum (pending/accepted)
  - Migration deployed + Prisma-Client regeneriert.

- [x] **Phase 3c – OCR-Texterkennung (Infrastruktur)**:
  - `ml-service/app/main.py`: neuer `POST /ocr`-Endpunkt (pytesseract, mit `try/except`-Guard wenn nicht installiert – gibt 503 zurück statt zu crashen).
  - `ml-service/requirements.txt`: `pytesseract==0.3.13` ergänzt (Hinweis: manuell installieren wie pillow-heif, braucht außerdem `brew install tesseract`).
  - `packages/shared/src/mlClient.ts`: `extractOcrText(relativePath)` exportiert.
  - `backup-worker/src/services/mlPipeline.service.ts`: OCR-Schritt parallel zu CLIP/YOLO/Faces; 503 (nicht installiert) wird als soft-failure behandelt, Pipeline schlägt nicht fehl.
  - `backend/src/services/search.service.ts`: kombinierte Suche – semantischer CLIP-Score + `ocrText ILIKE %q%`-Treffer (Score 0.7, unterhalb starker semantischer Treffer).
  - `frontend/src/api/types.ts`: `ocrText?: string | null` auf `Asset`.
  - `ios/Photos/Models/Asset.swift`: `ocrText: String?`-Feld + CodingKey.
  - Nur per Code-Review verifiziert; pytesseract ist lokal noch nicht installiert.

- [x] **Album-Export ZIP-Download**:
  - `backend/src/routes/albums.routes.ts`: `GET /:id/download` – streamt alle Album-Assets als ZIP via `spawn('zip', ['-j', '-', ...filePaths])`. Auth-Check via `getAlbumAccess`.
  - `frontend/src/pages/AlbumDetailPage.tsx`: "↓ ZIP"-Button in der Toolbar; nutzt `apiFetch` + `createObjectURL` für den Download (kein Bearer-Token-Problem).
  - Live getestet (curl + Browser-Endpunkt erreichbar) – `zip` lokal verfügbar; Docker braucht noch `apt install zip`.

- [x] **Album-Kommentare**:
  - `backend/src/routes/albums.routes.ts`: `GET/POST/DELETE /albums/:id/comments` – alle authentifizierten Nutzer mit Albumzugriff dürfen kommentieren, löschen darf Autor oder Albumbesitzer.
  - `frontend/src/pages/AlbumDetailPage.tsx`: Kommentarsektion am Seitenende (Liste + Eingabefeld + löschen).
  - `frontend/src/api/types.ts`: `AlbumComment`-Interface.
  - Live getestet: POST erstellt, GET listet, DELETE entfernt (curl-Verifikation ✓).

- [x] **Phase 3d – Partner-/Familien-Freigabe**:
  - `backend/src/routes/partner.routes.ts` (neue Datei): `GET /partner`, `POST /partner/invite`, `POST /partner/accept`, `DELETE /partner/:shareId`, `GET /partner/assets`.
  - `backend/src/app.ts`: `/api/partner`-Router registriert.
  - `frontend/src/pages/PartnerPage.tsx` (neue Datei): Einladen per E-Mail, annehmen/ablehnen, entfernen.
  - `frontend/src/App.tsx`: Route `/partner` registriert.
  - `frontend/src/components/Layout.tsx`: "Partner"-Navigationspunkt.
  - `frontend/src/api/types.ts`: `LibraryShare`- und `LibraryShareStatus`-Typen.
  - Live getestet: GET /partner gibt `{sent:[], received:[]}` für neuen Nutzer korrekt zurück.
  - Noch offen: Timeline-Integration (Partner-Assets optional einblenden), iOS-Anbindung.

## 2026-09-28 – Session 3: Partner-Freigabe iOS, Metadaten-Fallback, Nach-Upload-Löschen

- [x] **Partner-Freigabe vollständig (iOS-Anbindung + Timeline)**:
  - `ios/Photos/Models/LibraryShare.swift` (neu): `LibraryShare`, `LibraryShareUser`, `LibraryShareStatus`, `PartnerData`.
  - `ios/Photos/Features/Settings/PartnerView.swift` (neu): eingehende Einladungen (Annehmen/Ablehnen), aktive Partner (Entfernen per Swipe), ausstehende Einladungen (Zurückziehen), Einladungs-Formular.
  - `ios/Photos/Features/Settings/SettingsView.swift`: NavigationLink "Partner-Freigabe" in der Freigaben-Section.
  - Timeline-Integration war bereits vorhanden (`TimelineView.swift` hatte Toggle + `/partner/assets`-Abfrage).
  - BUILD SUCCEEDED (generic/platform=iOS Simulator).

- [x] **Metadaten-Fallback (iOS → Backend)**:
  - `ios/Photos/Services/BackupEngine.swift`: neue `baseExtraFields(for:albumId:)`-Hilfsmethode – übergibt `clientTakenAt` (ISO8601), `clientLatitude`, `clientLongitude` als Formfelder aus `PHAsset.creationDate` und `PHAsset.location`.
  - `backend/src/routes/assets.routes.ts`: parst `clientTakenAt`, `clientLatitude`, `clientLongitude` aus `req.body` und reicht sie an `ingestUploadedAsset` weiter.
  - `backend/src/services/asset.service.ts`: neues `ClientMetadata`-Interface; `ingestFromTemp` wendet Fallback an wenn EXIF-Wert `null` ist (EXIF hat Vorrang).

- [x] **"Nach Upload löschen"-Feature**:
  - `ios/Photos/Features/Settings/BackupSettingsView.swift`: `deleteAfterUploadKey` + `deleteAfterUpload`-Property in `BackupSettings`; Toggle in der Backup-Section mit Warnung wenn aktiv.
  - `ios/Photos/Services/BackupEngine.swift`: neue `deleteFromPhotoLibrary(_:)`-Hilfsmethode (via `PHPhotoLibrary.shared().performChanges`); wird nach erfolgreichem Upload aufgerufen, wenn `BackupSettings.deleteAfterUpload` aktiv.

- [x] **OCR-Anzeige im Web-Viewer**:
  - `frontend/src/pages/ViewerPage.tsx`: `ocrText` wird als aufklappbare `<details>`-Sektion unter EXIF angezeigt, wenn vorhanden.
  - Kein neuer Backend-Code nötig (war schon vollständig implementiert).

- [x] **Hierarchische Tags (UserLabel)**:
  - `packages/database/prisma/schema.prisma`: neue Modelle `UserLabel` (selbstreferentiell mit `parentId`) + `AssetLabel` (Junction).
  - Migration `20260928000005_add_user_labels`: Tabellen `user_labels`, `asset_labels` inkl. Indizes + FK-Constraints. Deployed ✓.
  - `backend/src/routes/user-labels.routes.ts` (neu): `GET/POST /user-labels`, `PATCH/DELETE /user-labels/:id`, `GET /user-labels/:id/assets` (inkl. aller Nachfahren rekursiv, cursor-paginiert).
  - `backend/src/routes/assets.routes.ts`: `POST/DELETE/GET /assets/:id/labels` (Zuweisung, Entfernen, Abfrage).
  - `backend/src/app.ts`: `/api/user-labels`-Router registriert.
  - `frontend/src/api/types.ts`: `UserLabel`-Interface.
  - `frontend/src/pages/UserLabelsPage.tsx` (neu): Baum-Ansicht mit Umbenennen/Löschen; Formular für neues Label (Name, Farbe, Eltern-Label).
  - `frontend/src/pages/UserLabelDetailPage.tsx` (neu): Fotos eines Labels (incl. Kinder-Labels, cursor-paginiert).
  - `frontend/src/pages/ViewerPage.tsx`: Label-Chips + "+ Label"-Picker.
  - `frontend/src/App.tsx`: Routen `/user-labels` + `/user-labels/:id`.
  - `frontend/src/components/Layout.tsx`: "Labels"-Nav-Link.
  - `ios/Photos/Models/UserLabel.swift` (neu): Codable-Modell + `Color(hex:)`-Extension.
  - `ios/Photos/DesignSystem/Components/FlowLayout.swift` (neu): SwiftUI `Layout` für Chip-Zeilen.
  - `ios/Photos/Features/TagGroups/UserLabelsView.swift` (neu): hierarchischer Tree mit Disclosure Groups + CreateLabelSheet.
  - `ios/Photos/Features/Viewer/PhotoInfoView.swift`: Labels-Karte (Anzeige + Zuweisung + Entfernen).
  - `ios/Photos/RootView.swift`: neuer "Labels"-Tab.
  - Live-Test: CREATE + LIST + DELETE + Kind-Label via curl ✓. BUILD SUCCEEDED ✓.

---

_Legende: [x] erledigt_
