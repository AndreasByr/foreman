# Milestone M001: Dispatcher sicher und eindeutig

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** A · Dispatcher · **Parallel to:** M002, M003, M006, M008, M011

## Goal
Der Dispatcher gibt Prüfskripten nur die nötige Umgebung, meldet wahlweise an Discord oder Slack, behandelt `main` nach einer festen, einstellbaren Regel und unterstützt lokale Claude-Code-Läufe offiziell.

## Starting point
foreman 0.2.1. Dispatcher in `dispatcher/` (`dispatch.mjs`, `dispatch.sh`, Tests in `dispatcher/tests`), Prüfskript `scripts/autopilot-check.*`. Auf Host 1 läuft `dispatch.mjs` aus diesem Repo; dort gibt es einen lokalen Patch zur Umgebungsbegrenzung, der noch nicht im Repo steht.

## Capabilities
1. Ein Prüfskript sieht nur `PATH`, `HOME`, `LANG` und die Variablen aus `pass_env`.
2. Fehlermeldungen gehen an Discord oder Slack, je nach `webhook_format` (`discord`, `slack`, `auto`).
3. Ein Batch für `main` startet im Merge-Fenster nur, wenn das Projekt es erlaubt (`autopilot.mainAutoMerge`, Standard `false`).
4. Die Prüfskript-Vorlage akzeptiert `--no-fetch`; `check-config.sh` meldet, wenn ein Projekt es nicht kann.
5. Ein lokaler Lauf per `fire_command` ist ein dokumentierter Weg für Claude Code (Startskript-Vorlage, exakte Model-ID, `claude_login = "inherit"`).

## Dependencies and order
Keine feste Reihenfolge zwischen den Fähigkeiten. M001 blockiert M007.

## Parallel milestones
M002, M003, M006, M008, M011 laufen auf eigenen Batch-Branches. Geteilte Dateien: `dispatcher/README.md`, `docs/MODULES.md`, `CHANGELOG.md`, `scripts/test-install.sh`. Regel: nur ergänzen, nie umbauen oder umsortieren.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M001-M003-briefing.md`. Als Erfolgskriterien übernommen: kein fremder Fire-Token in Umgebung, Log, Webhook-Text oder Dry-Run-Ausgabe; `pass_env` überschreibt keine Pflichtvariablen; ungültige oder unbekannte Webhook-URL gibt einen definierten Fehler; `mainAutoMerge` mit fehlendem, `null` oder Text-Wert gilt als `false`; `--no-fetch` startet keinen stillen Fetch.

## Binding documents
`docs/requirements.md`, `docs/roadmap-0.2.x.md` (Abschnitt M001), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: requirements > roadmap > Brief.

## Fixed decisions
- Das Verhalten des lokalen Patches auf Host 1 wird übernommen, nicht der Patch wörtlich (er weicht vielleicht vom Repo-Stand ab).
- `mainAutoMerge` ist standardmäßig `false`: Ein Merge nach `main` ist eine nach außen wirkende Handlung; Standard ist, auf „Batch PR main“ des Menschen zu warten.
- Jeder Fix bekommt zuerst einen fehlschlagenden Test.
- Der Dispatcher bleibt modellfrei (keine Tokens).

## Data and interfaces
`dispatcher/config.example.json` (`webhook_format`, `pass_env`, `fire_command`), `dispatcher/dispatcher.env.example`, `.foreman.json` (`autopilot.mainAutoMerge`), Ausgabe `TASK|batch|batch:main` von `autopilot-check`. Nur Variablennamen, keine Werte.

## Out of scope
- Überwachung von `fire_command`-Läufen (kommt über Messung in M011).
- Merge-Fenster-Fragen pro Projekt (M004).
- Update-Meldung im Dispatcher (M007).
- Änderungen an die Referenzprojekte.

## Success criteria
1. Test: Mit Dummy-Fire-Token eines zweiten Projekts im Dispatcher-Prozess ist dieser im Prüfskript nicht sichtbar und taucht in keiner Ausgabe auf.
2. Tests: Für `discord` und `slack` entsteht je der richtige Body; `auto` wählt nach Host; unbekannter Host oder ungültige URL gibt einen definierten Fehler ohne Absturz.
3. Test: Ohne `mainAutoMerge` kein `TASK|batch|batch:main` im Merge-Fenster; mit `true` schon; `null` und Text zählen als `false`.
4. Test: `autopilot-check` mit und ohne `--no-fetch` liefert dieselben `TASK`-Zeilen; `check-config.sh` meldet ein Projekt ohne Unterstützung.
5. Trockenlauf mit `fire_command` am Testprojekt zeigt „would start … via command“; 0 Secret-Treffer im Log.
6. `docs/MODULES.md` und `dispatcher/README.md` beschreiben `webhook_format`, `pass_env`, `fire_command` und `mainAutoMerge`; Begründungen stehen in `docs/learnings.md`, die Skills nur die Regel.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/check-config.sh
Human only (UAT): Testmeldung kommt im eigenen Discord-Kanal an; Dry-Run auf Host 1 mit Testprojekt.

## Risks
Der lokale Patch auf Host 1 weicht vom Repo ab. `autopilot-check.mjs` wird auch in M004 angefasst. Fehlt `mainAutoMerge` in bestehenden Projekten, ändert sich ihr Verhalten (vorher startete `main` im Fenster); das gehört in den Upgrade-Hinweis für M006.
