Status: slice · since 2026-11-21T16:05Z · S1 fertig, S2 offen
Target: dev
Batch-branch: batch/m001
Lock: free
Tracker: -
Pretest-round: 0

# M001: Dispatcher sicher und eindeutig

Start commit: 28eab3e (Baseline: bash scripts/test-all.sh exit 0)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Umgebung begrenzen | done | see Log | dispatcher/dispatch.mjs, dispatcher/tests/test-dispatch.mjs | |
| S2 | Webhook-Format | open | | dispatcher/dispatch.mjs, config.example.json, dispatcher.env.example, tests | |
| S3 | Regel für `main` | open | | template/scripts/lib/autopilot-check.mjs, autopilot-check.mjs, test-autopilot-check.mjs, foreman-fix skill, template .foreman.json | |
| S4 | `--no-fetch` überall | open | | template/scripts/autopilot-check.mjs, check-config.sh (scripts/ und template/scripts/), tests | |
| S5 | Lokaler Lauf | open | | dispatcher/ (Startskript-Vorlage), docs/MODULES.md, tests | |
| S6 | Doku und Learnings | open | | dispatcher/README.md, docs/MODULES.md, docs/learnings.md, CHANGELOG.md | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Prüfskript und `fire_command` sehen nur `PATH`, `HOME`, `LANG` (+ `FOREMAN_*` bei `fire_command`) und `pass_env`; Fire-Token eines zweiten Projekts taucht in Umgebung, Log, Webhook und Dry-Run nicht auf | `node dispatcher/tests/test-dispatch.mjs` (neue Tests) | automatic | n/a, keine UI |
| S2 | `discord`/`slack` erzeugen je den richtigen Body; `auto` wählt nach Host; unbekannter Host oder ungültige URL gibt definierten Fehler im Log, kein Absturz | `node dispatcher/tests/test-dispatch.mjs` | automatic | n/a |
| S3 | Ohne `autopilot.mainAutoMerge === true` (fehlt, `null`, Text, `"true"`) kein `TASK|batch|batch:main` im Fenster; mit `true` schon; `dev` unverändert; offener PR und Catch-up für `main` bleiben | `node template/scripts/test-autopilot-check.mjs` | automatic | n/a |
| S4 | `autopilot-check` mit und ohne `--no-fetch` gibt dieselben `TASK`-Zeilen; mit der Option kein `git fetch`; `check-config.sh` meldet ein Prüfskript ohne Unterstützung | `node template/scripts/test-autopilot-check.mjs`, `bash scripts/test-check-config.sh` | automatic | n/a |
| S5 | Dry-Run mit `fire_command` meldet „would start … via command“; 0 Secret-Treffer im Log; Startskript-Vorlage mit `claude -p`, exakter Model-ID, `claude_login = "inherit"` liegt vor und ist syntaktisch gültig | `node dispatcher/tests/test-dispatch.mjs`, `bash -n` auf die Vorlage | automatic | n/a |
| S6 | `docs/MODULES.md`, `dispatcher/README.md` nennen `webhook_format`, `pass_env`, `fire_command`, `mainAutoMerge`; Begründungen in `docs/learnings.md`; CHANGELOG ergänzt | `bash scripts/test-all.sh`, `bash scripts/privacy-scan.sh` | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Kein Mandanten-Konzept; Projekte teilen einen Prozess, also: Token von Projekt B nie in Umgebung von Projekt A. `pass_env` darf `PATH`/`HOME`/`LANG` nicht überschreiben, leerer Name ignoriert | Leeres `pass_env`; `pass_env` mit `PATH`; leerer Name; fehlende Quell-Variable | Prüfskript endet mit Fehler: nichts wird gestartet (besteht schon), Token im Fehlertext redigiert | Keine Migration. Bestehende Projekte, die sich auf geerbte Variablen verlassen, brauchen `pass_env` (Upgrade-Hinweis M006) |
| S2 | n/a, kein Zugriffskonzept; Webhook-URL ist ein Secret und darf nie im Log stehen | `auto` mit unbekanntem Host; ungültige URL; leere URL; `webhook_format` mit Fantasiewert | Webhook antwortet nicht oder mit Fehler: Log-Zeile, kein Absturz, Exit-Code bleibt 1 | Neue Config-Option `webhook_format`, Standard `auto` (Body wie bisher für unbekannt nicht mehr: definierter Fehler); `dispatcher.env.example` aktualisiert |
| S3 | n/a, keine Rollen; Standard `false`, weil Merge nach `main` nach außen wirkt | Wert fehlt, `null`, `"true"`, `0`, `1` | Kaputtes `.foreman.json`: wie bisher Fehler des Skripts (Exit 2) | `.foreman.json` Schlüssel `autopilot.mainAutoMerge`; Verhaltensänderung für bestehende Projekte (Upgrade-Hinweis M006) |
| S4 | n/a | `--no-fetch` mit veraltetem lokalem Stand; ohne Option; Option fehlt im Skript | Fetch schlägt fehl ohne Option: Warnung wie bisher | `check-config.sh` bekommt neue Meldung (Warnung, kein Fail) |
| S5 | `fire_command` bekommt nur sichere Umgebung (siehe S1), kein fremder Token | Leeres `fire_command`; Dry-Run schreibt keinen Zustand | Befehl existiert nicht: Fehler im Log und Webhook, Dispatcher weiter | Neue Datei `dispatcher/fire-claude.example.sh`; Dispatcher importiert sie nicht, Vorlage wird kopiert |
| S6 | n/a | n/a, nur Doku | n/a | CHANGELOG-Eintrag unter Unreleased, keine Versionsnummer |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- 2026-11-21T16:05Z · Plan · 6 Slices, Baseline test-all.sh grün (exit 0, 28eab3e) · -
- 2026-11-21T16:20Z · S1 done · node dispatcher/tests/test-dispatch.mjs exit 0 (19 Tests), bash scripts/test-all.sh exit 0 · committed as M001 S1
