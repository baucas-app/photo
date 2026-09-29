# Photos – Arbeitshinweise für Claude

Diese Datei sammelt betriebliche Stolpersteine, die mehrfach unabhängig entdeckt wurden (auch von parallel
laufenden Agenten) - lies sie, bevor du hier arbeitest, um nicht dieselbe Zeit erneut zu verlieren.

## Dokumentation: TODO.md / DONE.md / docs/tests/

- `docs/TODO.md` = offene/in Arbeit befindliche Punkte. `docs/DONE.md` = erledigte Arbeit, chronologisch,
  volle Details. Test-/Verifikationsprotokolle kommen als eigene Datei unter
  `docs/tests/test_JJJJ.MM.TT_HH.MM.SS.md`, nicht inline in TODO/DONE.
- Beide Dateien werden laufend von Claude gepflegt, teils von mehreren parallelen Agenten gleichzeitig - vor
  jedem Edit die Datei frisch einlesen (nicht auf einen älteren Stand aus dem eigenen Kontext verlassen) und nur
  den eigenen Abschnitt gezielt ändern, nicht die ganze Datei neu schreiben.

## Der Projektordner liegt in einem Synology-Drive-Sync-Pfad - Vorsicht bei schnellen Dateiänderungen

Dieses Repo liegt unter `.../SynologyDrive-BauCas/...` und wird von der Synology-Drive-App laufend
synchronisiert. Das verträgt sich schlecht mit Tools, die viele Dateien schnell hintereinander löschen/neu
schreiben - beobachtet bei mehreren völlig unabhängigen Tools am selben Abend:

- **`tsx watch` / `npm run dev:backend` hängt sich auf** (vermutlich Synology-Drive-Sync + FSEvents-Konflikt).
  Für den lokalen Dev-Server stattdessen ohne Watch-Modus starten:
  `cd backend && ../node_modules/.bin/tsx src/index.ts`
- **`pip install` in einer `.venv` innerhalb dieses Ordners** kann Pakete korrumpieren: `OSError: [Errno 70]
  Stale NFS file handle`, dazu von Synology selbst erzeugte Konfliktkopien (Namensmuster `paket-1.2.3
  2.dist-info`). Betrifft auch bereits abgeschlossene, unveränderte Installationen Sekunden später erneut.
  Siehe docs/tests/test_2026.09.27_23.25.00.md für ein konkretes Beispiel (ml-service/pillow-heif).
- **`xcodegen generate` + `xcodebuild`**: dieselbe Korruption trifft auch `ios/Photos.xcodeproj` - Synology
  Drive kann beim Neu-Erzeugen eine veraltete Version zurück-restaurieren oder Konfliktkopien anlegen
  (`Photos 2.xcodeproj`, `Photos 3.xcodeproj`, ...). Siehe docs/tests/test_2026.09.27_23.28.13.md.

**Wichtig:** `ios/Photos.xcodeproj` ist ein reines Build-Artefakt aus `ios/project.yml` (per `xcodegen
generate`) - bei Problemen einfach alle `Photos*.xcodeproj`-Ordner löschen und neu generieren, nichts geht
dabei verloren. Genauso ist eine `.venv` jederzeit aus `requirements.txt` neu aufsetzbar.

**Workarounds, wenn es hakt:**
1. Synology Drive kurz pausieren (Menüleisten-Symbol), dann den Vorgang wiederholen.
2. Nicht wiederholt gegen dasselbe Problem anrennen - jeder fehlgeschlagene Versuch kann eine weitere
   Konfliktkopie erzeugen und den Ordner zusätzlich verunreinigen. Nach 2-3 Fehlversuchen lieber abbrechen,
   sauber aufräumen (alle Konfliktkopien/kaputten Reste löschen) und den Rest dem Nutzer überlassen, statt
   den Ordner weiter zu verschmutzen.
3. Für einen echten, isolierten Test (z.B. eine neue Python-Abhängigkeit ausprobieren) notfalls eine
   Wegwerf-venv außerhalb des Synology-Pfads anlegen (z.B. unter `/tmp`), dort verifizieren, und nur das
   Ergebnis (Code-Änderung, `requirements.txt`-Zeile) ins echte Projekt übernehmen.

## Lokale Dev-Umgebung

- Backend: Postgres+Redis lokal via `brew services`. Start ohne Watch-Modus (siehe oben). Login für die
  Test-Bibliothek: `test@example.com` / `PhotosDev2026!`.
- Migrationen: `prisma migrate dev` verweigert in einer nicht-interaktiven Shell den Dienst ("non-interactive
  environment"). Stattdessen: `prisma migrate diff --from-schema-datasource prisma/schema.prisma
  --to-schema-datamodel prisma/schema.prisma --script` in einen neuen `prisma/migrations/<timestamp>_<name>/
  migration.sql` schreiben, dann `prisma migrate deploy`.
- iOS-Simulator: in dieser Umgebung oft kein steuerbares GUI-Fenster verfügbar (`osascript`/System Events
  findet keinen "Simulator"-Prozess) - Verifikation dann auf `xcodebuild ... build` (BUILD SUCCEEDED) +
  Code-Review beschränken, das klar als Einschränkung dokumentieren statt eine echte Interaktionsprüfung
  vorzutäuschen.
- **iOS-Build immer mit `-derivedDataPath /tmp/photos-build`** aufrufen und anschließend von genau diesem
  Pfad installieren: `APP_PATH="/tmp/photos-build/Build/Products/Debug-iphonesimulator/Photos.app"`.
  Hintergrund: Synology Drive erzeugt Konflikt-Kopien des Projekts, die jeweils einen eigenen
  DerivedData-Hash bekommen. Ein `find ~/Library/Developer/Xcode/DerivedData/Photos-*` trifft dann
  alphabetisch eine alte Version statt die gerade gebaute → falsche Binary im Simulator. Fixierter Pfad
  außerhalb Synology Drive löst das dauerhaft. Vollständiger Build+Install-Befehl:
  ```
  cd ios && xcodebuild -project Photos.xcodeproj -scheme Photos \
    -destination 'platform=iOS Simulator,name=iPhone 17' \
    -configuration Debug -derivedDataPath /tmp/photos-build build
  SIMULATOR_ID=$(xcrun simctl list devices booted | grep "iPhone 17" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
  xcrun simctl terminate "$SIMULATOR_ID" de.baucas.photos 2>/dev/null || true
  xcrun simctl uninstall "$SIMULATOR_ID" de.baucas.photos
  xcrun simctl install "$SIMULATOR_ID" /tmp/photos-build/Build/Products/Debug-iphonesimulator/Photos.app
  xcrun simctl launch "$SIMULATOR_ID" de.baucas.photos
  ```
- ml-service läuft lokal normalerweise nicht dauerhaft (kein laufender Prozess auf Port 8000) - Fixes dort
  nach Möglichkeit mit einer isolierten Test-venv statt der echten `.venv` verifizieren (siehe oben).

## Testdaten

Nach jedem Live-Test (curl-Uploads, Testalben, Testfotos) werden Testdaten wieder gelöscht, damit die
Bibliothek des Nutzers unverändert bleibt. Bei mehreren parallel laufenden Agenten kann die Bibliothek
zwischenzeitlich zusätzliche Testdaten anderer Agenten enthalten - nicht vorschnell löschen, was nicht
nachweislich aus dem eigenen Testlauf stammt.
