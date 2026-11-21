Status: done · since 2026-11-21T17:38Z · UAT durch Andreas abgenommen, Batch-PR #6 in dev gemergt
Target: dev
Batch-branch: batch/m011
Lock: free
Tracker: -
Pretest-round: 0

# M011: Messung und Eingriffe

Start commit: c6b3149 (dev nach M001)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Eingriffs-Ursache | done | 7a7b658 | template/scripts/lib/intervention.mjs (+ scripts/lib), STATE-Vorlagen, Skills, Tests | |
| S2 | Mess-Skript | done | 9870322 | template/scripts/measure.mjs, lib/measure.mjs (+ scripts/), Tests | |
| S3 | Ausgabe und Doku | done | bdd61dd, d3a3036 | docs/metrics.md-Erzeugung, docs/MODULES.md, docs/learnings.md, Tests | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Open-question-Abschnitt ohne gültige Ursachen-Zeile wird als Lücke gemeldet, mit gültiger nicht; unbekannte Kategorie ist Lücke; Vorlagen und Skills nennen die Zeile | node template/scripts/test-measure.mjs (Teil Ursache) | automatic | n/a, keine UI |
| S2 | Beispieldaten (3 Units, 4 Result-Files) ergeben genau die festgeschriebenen Zahlen; kaputte oder fehlende Eingaben ergeben Lücken, keinen Absturz | node template/scripts/test-measure.mjs | automatic | n/a |
| S3 | docs/metrics.md entsteht am Testprojekt, Zeitraum-Option wirkt, ungültiges Datum Exit 2 ohne Datei, zwei Läufe gleiche Datei, kein Freitext | node template/scripts/test-measure.mjs, bash scripts/test-all.sh | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | n/a, keine Rollen; Ursache ist ein Satz ohne Geheimnisse (Regel in der Vorlage) | Kategorie fehlt, unbekannt, Zeile leer, Zeile außerhalb von Open question | Alte STATE.md ohne Zeile: Lücke, keine Änderung am Status | Vorlagen und Skills ergänzt; bestehende Projekte bekommen es mit dem Update (Hinweis M006) |
| S2 | Nur lesen; Result-Files nur Überschriften; keine Fragetexte, keine Umgebung, kein Netz | Kaputte Log-Zeile, Stempel ohne Sekunden, Zeit rückwärts, Result-File ohne Versuch | Ordner fehlt, Datei unlesbar, Format unbekannt: Lücke | Läuft von Hand; keine Routine |
| S3 | Schreibt nur docs/metrics.md unter --root; Symlinks nur lesen | --since nach --until, ungültiges Datum, leerer Zeitraum | Ausgabeordner fehlt: anlegen oder klarer Fehler | Datei wird je Lauf neu erzeugt; CHANGELOG erst beim Release |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- 2026-11-21T16:56Z · Brief M011-CONTEXT.md und Role-Review-Bericht geschrieben · batch/m011
- 2026-11-21T17:16Z · S1 done: test-measure rot 77d29ed (Exit 1) -> grün; test-all Exit 0 · 7a7b658
- 2026-11-21T17:16Z · S2 done: rot gegen Stub 0096814, grün 32 Tests · 9870322
- 2026-11-21T17:16Z · S3 done: CLI, Doku, 54 Tests grün; dev (M002) eingemergt beea95a · d3a3036
- 2026-11-21T17:16Z · Validierung 1: needs-remediation (1 hoch, 2 mittel) -> R1 · efa3167
- 2026-11-21T17:16Z · Validierung 2: pass (nur low); Abschlusslauf test-all Exit 0, check-config Exit 0 · Abschlussbericht docs/agent-reports/2026-11-21-M011.md, UAT docs/uat/M011.md
- 2026-11-21T17:38Z · UAT approved (Andreas, im Chat: "passt"), niedrige Funde nachgezogen (Wartezeit nur bei Ereignisfeld needs-input, Dateinamen in Lücken bereinigt) · Status done, kein Release nach main
