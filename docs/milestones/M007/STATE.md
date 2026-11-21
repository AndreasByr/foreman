Status: slice · since 2026-11-21T19:35Z · S1 bis S3 done, S4 (Doku) als Nächstes
Target: dev
Batch-branch: batch/m007
Lock: free
Tracker: -
Pretest-round: 0

# M007: Update-Meldung im Dispatcher

Start commit: 7f8c84c (dev, Baseline: bash scripts/test-all.sh exit 0)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Versionsvergleich und Quelle | done | e9dc13c | dispatcher/dispatch.mjs, dispatcher/tests/test-dispatch.mjs | |
| S2 | Ticket (itsaplan) | done | 28d045a | dispatcher/dispatch.mjs, dispatcher/tests/test-dispatch.mjs | |
| S3 | Webhook | done | 28d045a | dispatcher/dispatch.mjs, dispatcher/tests/test-dispatch.mjs | |
| S4 | Doku und Learnings | open | | dispatcher/README.md, dispatcher/config.example.json, docs/MODULES.md, CHANGELOG.md, docs/learnings.md, scripts/test-dispatcher-docs.sh | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | SemVer-Vergleich inkl. Vorabversion; ungültige Version verworfen; veraltetes Projekt erkannt, aktuelles nicht; Quelle `release` mit Attrappe, `local` ohne Netz; Fehler der Quelle: Logzeile, kein Abbruch | `node dispatcher/tests/test-dispatch.mjs` | automatic | n/a, keine UI |
| S2 | Genau ein Ticket mit Titel `foreman update available: <old> → <new>` in „Action Required“; zweiter Lauf keines; neue Version ersetzt statt zu verdoppeln; Schließen nach Update; Fehler: Exit 1, nichts gespeichert; fehlende `ITSAPLAN_*`: nur Webhook | `node dispatcher/tests/test-dispatch.mjs` | automatic | n/a |
| S3 | Eine Webhook-Nachricht je Projekt und Version, richtiges Format, zweiter Lauf nichts; Ausfall merkt nichts; `none`/`linear` nur Webhook; `--dry-run` schreibt und sendet nichts; keine Secrets | `node dispatcher/tests/test-dispatch.mjs` | automatic | n/a |
| S4 | README, MODULES, CHANGELOG-Upgrade, learnings nennen `foreman_version_source`, `foreman_repo`, `update_notice` | `bash scripts/test-dispatcher-docs.sh`, `bash scripts/test-changelog.sh`, `bash scripts/test-all.sh` | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Version aus `.foreman.json` ist nicht vertrauenswürdig: nur gültiges SemVer wird übernommen. Kein Mandanten-Konzept | Version leer, Text, Zeilenumbruch, überlang; Projekt neuer; Vorabversion; fehlende `.foreman.json` | Release-API Fehler, 404, 403/429, kaputtes JSON, Timeout: Logzeile, keine Meldung, Läufe laufen weiter | Neue Config-Schlüssel haben Standardwerte; bestehende `config.json` läuft unverändert |
| S2 | Nur `pass_env`-Werte des eigenen Projekts; Bot-Konto, nie ein Modell; kein Secret in Ticket oder Log | Ticket existiert schon, Ticket manuell geschlossen, zwei Projekte mit gleicher Version, Spalte fehlt (Alias aus `tracker.columnAliases`) | Tracker down, 401, Spalte fehlt: Exit 1, Hinweis, nichts gespeichert, Work Runs starten trotzdem | `ITSAPLAN_URL` und `ITSAPLAN_API_KEY` müssen im `pass_env` des Projekts stehen (Upgrade-Hinweis) |
| S3 | Webhook-URL ist Secret: nie im Log; Regeln aus M001 (https, Host, `redirect: "error"`) | Unbekannter Host, kein URL gesetzt, falsches Format | Webhook 500 oder Timeout: nichts gespeichert, nächster Lauf wiederholt | `webhook_url_env` und `webhook_format` bleiben wie bisher |
| S4 | Not applicable, because Doku | Doku nennt Schlüssel nicht: Test rot | Not applicable, because kein Laufzeitverhalten | Geteilte Dateien: nur ergänzen |

## Inherited red

Keine bekannt. Baseline: `bash scripts/test-all.sh` auf `7f8c84c`, Exit 0.

## Open question (when `needs-input`)

Keine.

## Log

- 2026-11-21T19:10Z · Brief, Role Review und STATE.md geschrieben · batch/m007
- 2026-11-21T19:20Z · S1 rot vor Änderung: `node dispatcher/tests/test-dispatch.mjs` Exit 1 (TypeError cmp is not a function) auf 7f8c84c; grün danach: Exit 0, 47 Tests; `bash scripts/test-all.sh` Exit 0 · e9dc13c
- 2026-11-21T19:35Z · S2+S3 (ein Commit, gemeinsamer Zustandscode): rot vor Änderung `node dispatcher/tests/test-dispatch.mjs` Exit 1 (14 neue Tests) auf e9dc13c+Tests; grün danach Exit 0, 61 Tests; `bash scripts/test-all.sh` Exit 0 · 28d045a
