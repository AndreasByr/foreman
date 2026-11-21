# Milestone M004: Neues Projekt in bestehender Umgebung

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** C · Einrichtung · **Parallel to:** M006, M008, M011

## Goal
„Neues Projekt“ führt in `foreman-project`, nicht in `foreman-setup`. `foreman-project` erkennt die bestehende Arbeitsumgebung (`workspace.json`), fragt nur Projektwerte (Name, Profil, Module, Ausführung, Staging, Zeitzone, Merge-Fenster, Wartezeit, `main`-Regel) und der Installer schreibt diese Werte in `.foreman.json`.

## Starting point
foreman 0.2.1 plus M001 bis M003 und M011 in `dev`. `foreman-project` sagt in Abschnitt 2 noch „If foreman is not installed in the repo yet, run `foreman-setup` first“; ein leeres Repo löst damit immer das volle Setup aus. `install.sh` schreibt `context.timeZone: "UTC"` fest und keinen Block `autopilot`; die Wartezeit lässt sich nur über `FOREMAN_WAIT_SECONDS` setzen. `workspace.json` (Schema, Beispiel, `--workspace`, `infra`-Block) kommt aus M003. Die Beschreibung von `foreman-setup` grenzt `foreman-project` bereits ab (M003); `foreman-project-mode` (PR #3) hängt als letzter Schritt 9 an `foreman-project`.

## Capabilities
1. **Erkennen statt neu einrichten:** `foreman-project` liest `workspace.json` (Chat-Kopie in der Projekt-Doku, oder `infra` in einer vorhandenen `.foreman.json`). Ohne Datei prüft es Hinweise (Projekt-Doku, Repo, Chatverlauf) und stellt genau eine Frage: „Ist foreman schon eingerichtet?“. Bei „ja“ startet kein Setup, bei „nein“ führt es in `foreman-setup`. Die Regel „nicht installiert → Setup“ entfällt.
2. **Abgrenzung der Skills:** Die Beschreibungen von `foreman-setup` und `foreman-project` trennen sauber: Setup nur bei erster Einrichtung oder geänderter Umgebung, „neues Projekt“ immer `foreman-project`. Testfragen („neues Projekt“, „Projekt starten“, „foreman einrichten“, „neuer Server“) sind festgehalten und per Test gegen die Beschreibungen geprüft.
3. **Nur Projektfragen:** Name, Profil (Quick / Repo / Autopilot), Module, Ausführung in der Cloud oder lokal, Staging ja/nein, Zeitzone (Vorschlag aus `workspace.json`), Fenster-Stunden (Vorschlag 3, 7, 11, 15, 19, 23 oder eigene), Wartezeit bis zum Merge außerhalb des Fensters (Vorschlag 4 Stunden), `mainAutoMerge` (Vorschlag: nein, nur auf „Batch PR main“). Keine Frage zu Maschinen, Gateway, Abos, Tracker-Server oder Benachrichtigung; was in `workspace.json` steht, wird übernommen und gezeigt. Fenster, Wartezeit und `mainAutoMerge` nur bei Autopilot.
4. **Zusammenfassung vor dem Install:** Die Antworten stehen vor dem Install-Befehl als Liste und werden bestätigt; der Befehl enthält nur Werte aus Antworten oder `workspace.json`.
5. **Installer nimmt die Werte an:** `install.sh` bekommt Flags für Zeitzone, Fenster-Stunden, Wartezeit und `mainAutoMerge`. Ohne Flags bleibt das Verhalten wie heute (`UTC`, kein `autopilot`-Block). Die Werte landen in `.foreman.json` (`context.timeZone`, `autopilot.batchHours`, `autopilot.waitHours`, `autopilot.mainAutoMerge`) und der Check liest die Wartezeit aus `autopilot.waitHours`.
6. **Regel erklärt:** `docs/MODULES.md`, `README.md`, `docs/CONVENTIONS.md` und `foreman-setup`/`foreman-project` erklären Fenster, Wartezeit und `main`-Regel in einem Absatz.

## Dependencies and order
M003 (abgenommen, in `dev`). Blockiert M005. Reihenfolge: S1 vor S2 (gleiche Datei), S4 vor S3 (Flags vor Fragen), S3 baut auf S4 auf.

## Parallel milestones
M006, M008, M011. Geteilte Dateien: `install.sh`, `plugins/foreman/skills/foreman-project/`, `plugins/foreman/skills/foreman-setup/` (nur Beschreibung), `template/scripts/lib/autopilot-check.mjs`, `docs/MODULES.md`, `scripts/test-install.sh`. Nur ergänzen, nie umbauen. M006 und M009 erweitern `install.sh` ebenfalls; Konflikte beim Merge nach `dev` beide behalten.

## Surface
Keine UI (Chat-Skill, nur Text).

## Accessibility
Nicht gefordert.

## Binding documents
`docs/requirements.md` (Abschnitt zu Einrichtung und neues Projekt, Merge-Fenster pro Projekt), `docs/roadmap-0.2.x.md` (M004), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `docs/MODULES.md`, `CLAUDE.md`. Konflikt: requirements, design, roadmap, dieser Brief.

## Fixed decisions
- Nichts wird erschlossen: Fehlt `workspace.json`, wird genau einmal gefragt, nie geraten. Ausgelassene Antworten bleiben leer oder Default, nicht erfunden.
- `workspace.json` und `.foreman.json` enthalten nie Secrets.
- Ablageort der Chat-Kopie von `workspace.json`: Doku im Claude-Projekt „foreman“ (Vorschlag der Roadmap, Entscheidung Andreas); `foreman-project` liest dort und fällt auf `infra` der `.foreman.json` zurück. Wer die Kopie aktuell hält: `foreman-setup` bei jeder Änderung der Umgebung (Hinweis im Skill).
- Wartezeit: neuer Schlüssel `autopilot.waitHours` (Stunden, Zahl > 0); `FOREMAN_WAIT_SECONDS` bleibt und schlägt die Datei.
- `mainAutoMerge` ist nur der boolesche Wert `true`; Default `false`. `main` wird nie ohne Go gemergt, wenn die Antwort „nein“ ist.
- Zeitzone muss ein gültiger IANA-Name sein, Stunden 0 bis 23; ungültig → Installer bricht ab, nichts wird geschrieben.
- Der Installer schreibt den Block `autopilot` nur, wenn Modul `autopilot` aktiv ist oder ein Flag gesetzt wurde; sonst bleibt `.foreman.json` wie heute.

## Data and interfaces
`install.sh` (Flags `--tz`, `--batch-hours`, `--wait-hours`, `--main-auto-merge yes|no`), `.foreman.json` (`context.timeZone`, `autopilot.*`), `template/scripts/lib/autopilot-check.mjs` (`settingsFrom`), `scripts/check-config.sh` (prüft die Werte), Skills `foreman-project`, `foreman-setup`. Nur Namen von Variablen.

## Out of scope
- itsaplan-Vorlage und englische Namen (M005).
- Dispatcher-Eintrag selbst und Routine anlegen (bleibt im Skill-Schritt 7, nur Hinweise).
- Echter Chat-Lauf; Routing im Chat prüft Andreas im UAT.
- Änderungen an Guildora, Kasev, Office.

## Success criteria
1. `foreman-project` enthält keine Regel „nicht installiert → Setup“ mehr, beschreibt Erkennung über `workspace.json` und die eine Rückfrage; `bash scripts/test-plugin.sh` grün.
2. Ein Skill-Test (`scripts/test-project-routing.py`) prüft: Beschreibungen beider Skills enthalten die Abgrenzung; Testfragen für „neues Projekt“ treffen nur auf `foreman-project`, Fragen für erste Einrichtung nur auf `foreman-setup` (Schlüsselwort-Abgleich); rot vor, grün nach der Änderung.
3. Test: `install.sh … --tz Europe/Berlin --batch-hours 3,7,11,15,19,23 --wait-hours 4 --main-auto-merge no` schreibt die Werte in `.foreman.json`; ohne Flags bleibt der alte Zustand unverändert.
4. Test: ungültige Zeitzone, Stunde 24, Wartezeit 0 oder `abc`, `--main-auto-merge maybe` brechen mit Exit 2 ab und schreiben nichts.
5. Test: `settingsFrom` liest `autopilot.waitHours`; die Umgebungsvariable schlägt die Datei.
6. `check-config.sh` meldet ungültige `autopilot`-Werte und akzeptiert gültige.
7. Ein Durchlauf-Test mit vorhandener `workspace.json` ergibt die Fragenliste von `foreman-project`: keine Frage zu Maschinen, Gateway, Abos, Tracker-Server; genau die Projektfragen aus Capability 3.
8. `bash scripts/test-all.sh` grün.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/test-install.sh
bash scripts/test-plugin.sh

## Risks
- Ob das Routing im Chat greift, hängt an der Skill-Beschreibung; nur im echten Chat prüfbar (Human only).
- `install.sh` ist mit M006 und M009 geteilt: Konfliktgefahr; Ergänzungen als eigener Abschnitt.
- `autopilot-check.mjs` kam in M001 durch die Abnahme; M004 ergänzt nur `waitHours`.
- Kein Zugriff auf echte Tenants oder Dispatcher; alles gegen Wegwerf-Verzeichnisse.
