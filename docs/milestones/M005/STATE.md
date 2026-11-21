Status: slice · since 2026-11-21T19:45Z · S1, S4 fertig, S2 als nächstes
Target: dev
Batch-branch: batch/m005
Lock: free
Tracker: -
Pretest-round: 0

# M005: itsaplan-Vorlage und englische Namen

Start commit: 302496a

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Vorlage im Repo (acht Spalten, zehn Labels, Ansicht „UAT ready“, drei Issue-Vorlagen) plus Validierungsskript und Test | done | f80b2a4 | plugins/foreman/skills/foreman-setup/references/itsaplan-project-template.json, scripts/lib/itsaplan-template.mjs, scripts/check-itsaplan-template.mjs, scripts/test-itsaplan-template.mjs, scripts/test-all.sh | |
| S4 | Namensprüfung in `check-config.sh` (beide Kopien), Stub-API-Tests | done | S4COMMIT | scripts/check-config.sh, template/scripts/check-config.sh, scripts/test-check-config.sh | |
| S2 | Import im Setup (`foreman-setup`) | open | | | |
| S3 | Projekt aus Vorlage (`foreman-project`), Doku, CHANGELOG | open | | | |

Reihenfolge: S1, S4, S2, S3.

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Vorlage besteht das Validierungsskript, hat 8 Spalten, 10 Labels, Ansicht, 3 Issue-Vorlagen, keine deutschen Namen; der Mirror plant jeden Status gegen ein Projekt aus der Vorlage; kaputte Kopien scheitern | neuer Test (Node) für Validierung und Mirror, in `scripts/test-all.sh` | automatic; echter Import human only | – |
| S4 | Deutsches Label oder fehlende Spalte: Exit 1 mit Fund und Soll; alles englisch: Exit 0; ohne Variablen Exit 0; API-Fehler: Warnung ohne Schlüssel | `bash scripts/test-check-config.sh` (Stub-API), Template-Kopie identisch | automatic; echte API human only | – |
| S2 | `foreman-setup` beschreibt einmaligen Import mit `list_project_templates` zuerst; Überspringen nur bei „quick prototype“ oder Tracker ≠ itsaplan | `python3 scripts/test-setup-catalog.py`, `bash scripts/test-plugin.sh` | automatic + human only | – |
| S3 | `foreman-project` Schritt 6 legt das Projekt aus der Vorlage an, nennt nur den Handschritt Bot-Mitglied; Docs nennen Vorlage und Prüfung | `bash scripts/test-plugin.sh`, `python3 scripts/test-project-routing.py`, `bash scripts/test-update-classes.sh` | automatic + human only | – |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Vorlage ohne Personen, Zugangsdaten, URLs; kein Zugriff auf Projekte des Menschen im Tracker | deutsches Label, fehlende Spalte, doppelter Name, unbekannter Schlüssel, falsche Version | not applicable, because Datei und Skript ohne externen Aufruf | neue Datei im Plugin; Hinweis im Upgrade-Abschnitt |
| S4 | nur lesende Aufrufe; Schlüssel nie in der Ausgabe | übersetztes `AP:`-Label, fehlende Spalte, Alias gültig | 401, nicht erreichbar, leeres Projekt, falscher `projectKey` | läuft nur mit Variablen; CI überspringt |
| S2 | nur Import in den Workspace des Menschen; keine fremden Projekte | Vorlage schon vorhanden: kein zweiter Import | Import-Tool fehlt oder Rechte fehlen: Hinweis statt Raten | Skill-Text; keine Migration |
| S3 | Bot wird nie vom Agenten hinzugefügt | Vorlage nicht importiert: zuerst `foreman-setup`-Schritt nennen | Projektanlage schlägt fehl: Fehler zeigen, nichts raten | Doku in trackers, MODULES, README, CHANGELOG |

## Inherited red

Keine: `bash scripts/test-all.sh` auf dem Startstand 302496a (dev) lief mit Exit 0.

## Open question (when `needs-input`)

## Log

- 2026-11-21T19:20Z · Brief und STATE geschrieben; Vorlage aus Format und trackers.md statt Export aus einem Bestandsprojekt (Entscheidung im Brief, der Mensch im UAT)
- 2026-11-21T19:30Z · S1 rot vor der Änderung: `node scripts/test-itsaplan-template.mjs` Exit 1 (Vorlage fehlt) auf d782beb; grün danach: Exit 0 (12 Tests), `bash scripts/test-all.sh` Exit 0 · f80b2a4
- 2026-11-21T19:45Z · S4 rot vor der Änderung: `bash scripts/test-check-config.sh` Exit 1 (k-label-typo) auf 8dda099; grün danach: Exit 0, `bash scripts/test-all.sh` Exit 0 · S4COMMIT
- 2026-11-21T19:45Z · Repo ist öffentlich: keine echten Projekt- oder Personennamen in neuen Dateien (Brief und STATE bereinigt)
