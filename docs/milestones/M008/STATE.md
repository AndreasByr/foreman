Status: validation · since 2026-11-21T18:40Z · S1 bis S4 done, Validierung offen
Target: dev
Batch-branch: batch/m008
Lock: free
Tracker: -
Pretest-round: 0

# M008: Docs-Regeln und Aufteilen

Start commit: c6b3149 (Baseline: bash scripts/test-all.sh exit 0)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Regeldatei: Dokumentarten, Ort, Schreiber, Zeitpunkt | done | M008 S1+S2 | template/docs/docs-rules.md, docs/docs-rules.md, docs/CONVENTIONS.md, scripts/test-docs-rules.sh | in einem Commit mit S2; Test noch nicht in test-all (S3) |
| S2 | Aufteilen (Übersicht + Ordner, Tabelle, Konfliktreihenfolge, Schwelle) und Stand-Zeile | done | M008 S1+S2 | template/docs/docs-rules.md, scripts/test-docs-rules.sh | |
| S3 | Prüfskript für Stand-Zeile mit Beispielen, in test-all | done | M008 S3 | template/scripts/docs-check.mjs, template/scripts/lib/docs-check.mjs, template/scripts/test-docs-check.mjs, scripts/test-all.sh (Beispiele inline im Test statt Fixture-Ordner) | |
| S4 | Verweise in roast und roadmap, Learnings | done | M008 S4 | plugins/foreman/skills/foreman-roast/, plugins/foreman/skills/foreman-roadmap/, docs/learnings.md | |
| R1 | Korrekturen aus Validierung (Doppelung, docs-check-Lücken, Template-Stand-Zeile) | done | M008 R1 | template/docs/docs-rules.md, docs/docs-rules.md, template/scripts/lib/docs-check.mjs, Tests, beide SKILL.md, requirements-template.md | niedrige Funde im Bericht R1 |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Regeldatei liegt in `template/docs/`, nennt je Dokumentart Ort, Schreiber und Zeitpunkt; keine Überschrift der Regeldatei steht auch in `docs/CONVENTIONS.md` | `bash scripts/test-docs-rules.sh` | automatic | n/a, keine UI |
| S2 | Regel enthält Übersicht + gleichnamigen Ordner, Tabelle „Datei, Inhalt, Lesen bei“, Konfliktreihenfolge, Schwelle als Zahl (5000), Stand-Zeilen-Regel | `bash scripts/test-docs-rules.sh` | automatic | n/a |
| S3 | `docs-check` gibt Exit 1 bei Versionsbereich, Versionsliste, mehreren „Version N“, fehlender und doppelter Stand-Zeile; Exit 0 bei einer Version mit Datum und Ziffern in der Notiz und auf `docs/roadmap-0.2.x.md`; Kasev-Beispiel rot | `node template/scripts/test-docs-check.mjs`, `node template/scripts/docs-check.mjs docs/roadmap-0.2.x.md` | automatic | n/a |
| S4 | `foreman-roast` und `foreman-roadmap` nennen die Regeldatei; beide `SKILL.md` unter 8 KB; Plugin-Validierung grün; Begründung in `docs/learnings.md` | `bash scripts/test-plugin.sh`, `bash scripts/test-all.sh` | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Nicht anwendbar, weil nur Text im Repo, kein Mandant | Überschrift in beiden Dateien doppelt wird vom Test gefunden | Datei fehlt: Test rot mit Meldung | Datei kommt über `install.sh` in `docs/` jedes Projekts; Installer-Test grün |
| S2 | Nicht anwendbar, weil nur Text | Fehlende Schwellen-Zahl oder fehlende Spalte: Test rot | wie S1 | keine |
| S3 | Skript liest nur den übergebenen Pfad, schreibt nichts | leere Datei, keine Stand-Zeile, zwei Stand-Zeilen, Datum und Ziffern in der Notiz, Versionsbereich, Liste | Datei nicht lesbar: Exit 2 mit Meldung, kein Absturz | neues Skript in `template/scripts/`; Installer legt es mit an; `test-install.sh` grün |
| S4 | Nicht anwendbar, weil nur Text | SKILL.md über 8 KB: Plugin-Test rot | Verweis auf nicht vorhandene Datei: Test rot | Plugin-Version unverändert bis Release |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

## Open question (when `needs-input`)

none

## Log

- 2026-11-21T17:05Z · Brief M008-CONTEXT.md und Role-Review-Bericht geschrieben · planning
- 2026-11-21T17:30Z · S1+S2 · test-docs-rules.sh rot (exit 1) vorher, grün (exit 0) nachher, test-all exit 0 · siehe Commit
- 2026-11-21T17:50Z · S3 · test-docs-check.mjs rot (Stub, exit 1) vorher, grün (exit 0, 21 Tests) nachher, test-all exit 0 · siehe Commit
- 2026-11-21T18:05Z · S4 · test-docs-rules.sh rot (exit 1) vorher, grün (exit 0) nachher, test-all exit 0 · siehe Commit
- 2026-11-21T18:40Z · R1 · beide Tests rot (exit 1) vorher, grün (exit 0, 27 Tests) nachher, test-all exit 0 · siehe Commit
