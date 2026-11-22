Status: planning · since 2026-11-22T09:20Z · Brief und Slice-Plan geschrieben
Target: dev
Batch-branch: batch/m012
Lock: free
Tracker: -
Pretest-round: 0
Wiki: no change

# M012: Vereinfachen und Abschluss 0.2.x

Start commit: 5e090af (dev nach M010)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Doppelte Regeln | open | | scripts/test-rules.py, Repo-Skills + Rendered-Kopien, docs/PRINCIPLES.md | |
| S2 | Lesemenge | open | | scripts/measure-reads.mjs, scripts/test-measure-reads.mjs, scripts/test-all.sh | |
| S3 | README | open | | README.md, docs/learnings.md | |
| S4 | Rollout-Aufträge | open | | docs/rollout/ | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Jede Besitzerregel steht genau einmal in den Repo-Skills; künstliches Duplikat lässt den Lint fehlschlagen; PRINCIPLES nennt zwei Runden | python3 scripts/test-rules.py | automatic | n/a, keine UI |
| S2 | Größerer Stand als Referenz gibt Exit 1, gleicher oder kleinerer Exit 0; echtes Repo liest je Szenario nicht mehr als 9c51ceb | node scripts/test-measure-reads.mjs; node scripts/measure-reads.mjs | automatic | n/a |
| S3 | README nennt Lesemenge und Messwerte, verweist auf docs/learnings.md, kennzeichnet ungetestete Kombinationen | bash scripts/test-readme.sh (Zahlen stimmen mit Messskript überein) | automatic (Inhalt: human only) | n/a |
| S4 | Drei Aufträge A, B, C mit Checkliste, keine echten Namen | bash scripts/privacy-scan.sh; bash scripts/test-rollout.sh | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | n/a, nur Texte; Regeln "kein Prod, keine Mandanten" bleiben inhaltlich erhalten (Lint prüft Besitzer-Vorkommen) | Zweites Vorkommen, fehlender Besitzer, Rendered-Kopie weicht ab | Kürzung bricht Install- oder Update-Test: sichtbar im test-all | Rendered-Kopien bytegleich; Größenlimits der Update-Skills halten |
| S2 | Nur lesen (git show, Dateien); kein Netz, keine Schreibzugriffe | Ref fehlt, Datei im Referenzstand nicht vorhanden, leeres Repo | Unbekannter Git-Ref: klare Meldung, Exit 2, keine erfundene Zahl | Läuft von Hand und in test-all; keine neue Abhängigkeit |
| S3 | n/a, Doku; keine Namen, keine Hosts (privacy-scan) | Zahl im README weicht vom Messskript ab: Test rot | Keine Messdaten (metrics.md leer): README sagt "keine Daten", nicht null | Keine |
| S4 | Aufträge enthalten keine Schlüsselwerte, nur Variablennamen; Platzhalter statt Projektnamen | Auftrag ohne Checkliste oder mit Klarnamen: Test rot | Update-Dry-Run meldet Konflikte: Checkliste nennt den Weg (Diff von Hand mergen) | Auftrag nennt Versionen, Dispatcher-Update, check-config |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

## Open question (when `needs-input`)

One question, options, recommendation.
**Cause:** <category> · <one sentence>
Categories: missing-requirement, open-decision, missing-infra, merge-conflict, ui-deviation, limit-exceeded, security, other. One section per intervention; keep the section after it is answered.

## Log

- 2026-11-22T09:20Z · Brief M012-CONTEXT.md, Inventur der Doppelungen (Research-Worker), STATE geschrieben · batch/m012
