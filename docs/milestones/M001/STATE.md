Status: slice · since 2026-11-21T16:05Z · alle Slices fertig, Validierung Runde 2
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
| S1 | Umgebung begrenzen | done | 3b75d6c | dispatcher/dispatch.mjs, dispatcher/tests/test-dispatch.mjs | |
| S2 | Webhook-Format | done | efdf364 | dispatcher/dispatch.mjs, config.example.json, dispatcher.env.example, tests | |
| S3 | Regel für `main` | done | 1b6a104 | template/scripts/lib/autopilot-check.mjs, test-autopilot-check.mjs, foreman-fix skill, batch-run.md | |
| S4 | `--no-fetch` überall | done | 35d40fe | check-config.sh (scripts/ und template/scripts/), test-check-config.sh, test-autopilot-check.mjs (Vorlage konnte `--no-fetch` schon) | |
| S5 | Lokaler Lauf | done | 2d9e127 | dispatcher/ (Startskript-Vorlage), docs/MODULES.md, tests | |
| S6 | Doku und Learnings | done | dd4d933 | dispatcher/README.md, docs/MODULES.md, docs/learnings.md, scripts/test-dispatcher-docs.sh | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Prüfskript und `fire_command` sehen nur `PATH`, `HOME`, `LANG` (+ `FOREMAN_*` bei `fire_command`) und `pass_env`; Fire-Token eines zweiten Projekts taucht in Umgebung, Log, Webhook und Dry-Run nicht auf | `node dispatcher/tests/test-dispatch.mjs` (neue Tests) | automatic | n/a, keine UI |
| S2 | `discord`/`slack` erzeugen je den richtigen Body; `auto` wählt nach Host; unbekannter Host oder ungültige URL gibt definierten Fehler im Log, kein Absturz | `node dispatcher/tests/test-dispatch.mjs` | automatic | n/a |
| S3 | Ohne `autopilot.mainAutoMerge === true` (fehlt, `null`, Text, `"true"`) kein `TASK|batch|batch:main` im Fenster; mit `true` schon; `dev` unverändert; offener PR und Catch-up für `main` bleiben | `node template/scripts/test-autopilot-check.mjs` | automatic | n/a |
| S4 | `autopilot-check` mit und ohne `--no-fetch` gibt dieselben `TASK`-Zeilen; mit der Option kein `git fetch`; `check-config.sh` meldet ein Prüfskript ohne Unterstützung | `node template/scripts/test-autopilot-check.mjs`, `bash scripts/test-check-config.sh` | automatic | n/a |
| S5 | Dry-Run mit `fire_command` meldet „would start … via command“; 0 Secret-Treffer im Log; Startskript-Vorlage mit `claude -p`, exakter Model-ID, `claude_login = "inherit"` liegt vor und ist syntaktisch gültig | `node dispatcher/tests/test-dispatch.mjs`, `bash -n` auf die Vorlage | automatic | n/a |
| S6 | `docs/MODULES.md`, `dispatcher/README.md` nennen `webhook_format`, `pass_env`, `fire_command`, `mainAutoMerge`; Begründungen in `docs/learnings.md`; CHANGELOG bleibt bis zum Release unberührt (Änderungspunkte im Abschlussbericht) | `bash scripts/test-dispatcher-docs.sh`, `bash scripts/test-all.sh` | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Kein Mandanten-Konzept; Projekte teilen einen Prozess, also: Token von Projekt B nie in Umgebung von Projekt A. `pass_env` darf `PATH`/`HOME`/`LANG` nicht überschreiben, leerer Name ignoriert | Leeres `pass_env`; `pass_env` mit `PATH`; leerer Name; fehlende Quell-Variable | Prüfskript endet mit Fehler: nichts wird gestartet (besteht schon), Token im Fehlertext redigiert | Keine Migration. Bestehende Projekte, die sich auf geerbte Variablen verlassen, brauchen `pass_env` (Upgrade-Hinweis M006) |
| S2 | n/a, kein Zugriffskonzept; Webhook-URL ist ein Secret und darf nie im Log stehen | `auto` mit unbekanntem Host; ungültige URL; leere URL; `webhook_format` mit Fantasiewert | Webhook antwortet nicht oder mit Fehler: Log-Zeile, kein Absturz, Exit-Code bleibt 1 | Neue Config-Option `webhook_format`, Standard `auto` (Body wie bisher für unbekannt nicht mehr: definierter Fehler); `dispatcher.env.example` aktualisiert |
| S3 | n/a, keine Rollen; offener `main`-PR (Befehl des Menschen) läuft weiter, Fenster und Überfälligkeit nur mit `true`; Standard `false`, weil Merge nach `main` nach außen wirkt | Wert fehlt, `null`, `"true"`, `0`, `1` | Kaputtes `.foreman.json`: wie bisher Fehler des Skripts (Exit 2) | `.foreman.json` Schlüssel `autopilot.mainAutoMerge`; Verhaltensänderung für bestehende Projekte (Upgrade-Hinweis M006) |
| S4 | n/a | `--no-fetch` mit veraltetem lokalem Stand; ohne Option; Option fehlt im Skript | Fetch schlägt fehl ohne Option: Warnung wie bisher | `check-config.sh` bekommt neue Meldung (Warnung, kein Fail) |
| S5 | `fire_command` bekommt nur sichere Umgebung (siehe S1), kein fremder Token | Leeres `fire_command`; Dry-Run schreibt keinen Zustand | Befehl existiert nicht: Fehler im Log und Webhook, Dispatcher weiter | Neue Datei `dispatcher/fire-claude.example.sh`; Dispatcher importiert sie nicht, Vorlage wird kopiert |
| S6 | n/a | n/a, nur Doku | n/a | keine; CHANGELOG erst beim Release |

## Rework (nach Validierung Runde 1: 3x needs-attention)

| # | Fund (Reviewer) | Maßnahme | Status |
|---|---|---|---|
| R1-1 | mittel: offener `main`-PR wurde ohne `mainAutoMerge` nie fortgesetzt (B1, C1) | Offener PR löst den Batch immer aus; Fenster und Überfälligkeit nur mit `true`; Test zuerst rot | done |
| R1-2 | mittel: `foreman-setup` kannte den Claude-Code-Weg nicht (A1, C2) | je ein Satz in `prerequisites.md` und `profiles-and-modules.md` | done |
| R1-3 | mittel: `FOREMAN_TZ` in `dispatcher.env` wirkt nicht mehr (B2) | `dispatcher.env.example`, `docs/MODULES.md` Upgrade-Hinweis | done |
| R1-4 | niedrig: git bekam unnötig nur die Basis-Umgebung (A3, B3) | zurück auf Dispatcher-Umgebung (`gitEnv`), Test | done |
| R1-5 | niedrig: Webhook folgte Weiterleitungen (B5) | `redirect: "error"`, Test | done |
| R2 | niedrig (Runde 2, C): fehlende Nachweise, schwache Tests, Webhook-Antwort nicht geloggt (A1-A4, B1, B2, B5, C1-C6) | Webhook-Status geloggt, Tests für git-Umgebung und Logdateien, Bericht `M001-R1.md` mit rot/grün, SHAs, `GITHUB_TOKEN`-Hinweis | done |
| R1-6 | niedrig: STATE-Angaben, `claude_login`-Test, ssh-Hinweis (A5, C3, C4, C6, C7, B3) | korrigiert / ergänzt | done |
| offen | niedrig: `check-config` prüft nur den Text `--no-fetch` (A2, B6); `pass_env` lässt gefährliche Namen wie `NODE_OPTIONS` zu (B4, Betreiber-Konfig); `$S1`-Bericht: Dry-Run-Test wäre auch vorher grün gewesen (C5) | bewusst offen, im Abschlussbericht | open (low) |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- 2026-11-21T16:05Z · Plan · 6 Slices, Baseline test-all.sh grün (exit 0, 28eab3e) · -
- 2026-11-21T16:20Z · S1 done · node dispatcher/tests/test-dispatch.mjs exit 0 (19 Tests), bash scripts/test-all.sh exit 0 · committed as M001 S1
- 2026-11-21T16:30Z · S2 done · test-dispatch exit 0 (25 Tests), test-all exit 0 · committed as M001 S2
- 2026-11-21T16:45Z · S3 done · test-autopilot-check exit 0 (26 Tests), test-all exit 0 · committed as M001 S3
- 2026-11-21T16:55Z · S4 done · test-check-config exit 0, test-autopilot-check exit 0 (27), test-all exit 0 · committed as M001 S4
- 2026-11-21T17:10Z · S5 done · test-fire-claude exit 0, test-dispatch exit 0 (26), test-all exit 0 · committed as M001 S5
- 2026-11-21T17:25Z · S6 done · test-dispatcher-docs exit 0, test-all exit 0 (CHANGELOG bewusst nicht angefasst) · committed as M001 S6
- 2026-11-21T17:50Z · Validierung Runde 1 · A, B, C: needs-attention (Funde R1-1 bis R1-6) · -
- 2026-11-21T18:10Z · Nacharbeit R1 · test-all exit 0 · committed as M001 R1
- 2026-11-21T18:40Z · Validierung Runde 2 · A pass, B pass, C needs-attention (niedrig) · -
- 2026-11-21T19:00Z · Nacharbeit R2 · test-all exit 0 (dispatch 31, autopilot 28) · committed as M001 R2
