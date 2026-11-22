Status: validation · since 2026-11-22T12:30Z · Validierung Runde 3: A pass, B pass, C needs-attention (Evidenz), Nacharbeit R3 erledigt, Prüfer C läuft erneut
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
| S1 | Doppelte Regeln | done | 2834e92 (rot), 39125e1, b798715 | scripts/test-rules.py, Repo-Skills + Rendered-Kopien, docs/PRINCIPLES.md | |
| S2 | Lesemenge | done | 87b0a9a (rot), b798715 | scripts/measure-reads.mjs, scripts/test-measure-reads.mjs, scripts/test-all.sh | |
| S3 | README | done | af3bde6 (rot), bf1c630, 375f439 | README.md, docs/learnings.md | |
| S4 | Rollout-Aufträge | done | bf1c630 (rot), 375f439 | docs/rollout/ | |
| R1 | Nacharbeit nach Validierung Runde 1 | done | ecc32b9, 4c6cc2c, 875daac | Tests, Skills, README, Bericht | |
| R3 | Nacharbeit nach Validierung Runde 3 (Evidenz, Kommentar, Checkbox-Test) | done | 5c72d8c | scripts/test-rules.py, test-rollout.sh, README, Bericht | |
| R2 | Nacharbeit nach Validierung Runde 2 | done | c810de3 | Board- und Cause-Wächter, CI strikt, Zahlen | |

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
- 2026-11-22T09:50Z · S1 done: Lint rot gegen echte Skills (python3 scripts/test-rules.py, Exit 1, 2834e92) -> grün (Exit 0, 39125e1); test-all Exit 0 · 39125e1
- 2026-11-22T10:20Z · S2 done: test-measure-reads rot (Stub, Exit 1, 87b0a9a) -> grün 12 Fälle; measure-reads Exit 0 (Milestone -429 B, Fix-Paket -927 B, Batch -165 B zum Stand 9c51ceb); test-all Exit 0 · b798715
- 2026-11-22T10:30Z · S3 done: test-readme rot (Stub, Exit 1, af3bde6) -> grün; README, learnings, changelog · bf1c630
- 2026-11-22T10:40Z · S4 done: test-rollout rot (Stub, Exit 1, bf1c630) -> grün; docs/rollout/ A, B, C; test-all Exit 0 · 375f439
- 2026-11-22T10:40Z · Wrapper: Worker liefen mit lokaler Config (echte Modell-IDs). Fehlversuch 1 (Worker ohne Bash, S1-Lint) -> Hinweis im Task, zweiter Lauf ok; keine Eskalation, kein Eigencode
- 2026-11-22T11:10Z · Validierung Runde 1: A needs-attention, B needs-attention, C needs-remediation (Bash war den Prüfern gesperrt, Läufe belegt die Session) · 40171cc
- 2026-11-22T11:25Z · R1: CI-Klon voll (fetch-depth 0), README-Zahlen gegen Messung (rot nach Kürzung, Exit 1 -> grün), Cause-Zeilen-Wächter, Szenario-Test, Fix-Paket-Board-Regel eigenständig, Git-rules-Verweis, Obergrenze 2 Batches/Tag zurück, Bericht docs/agent-reports/2026-11-22-M012.md, Red-Beweise gegen 5e090af (Exit 1 je Test) · ecc32b9
- 2026-11-22T12:00Z · Validierung Runde 2 (875daac): A, B, C needs-attention; mittlere Befunde: Board-Regel als zweite Kopie im Fix-Paket-Skill (nicht als bewusst vermerkt, ohne Wächter), falsche Begründung zur Cause-Zeile, Evidenz fehlt im Log
- 2026-11-22T12:10Z · R2 Evidenz auf c810de3: python3 scripts/test-rules.py Exit 0; node scripts/measure-reads.mjs Exit 0 (Milestone -351 B, Fix-Paket -709 B, Batch -44 B); bash scripts/test-all.sh Exit 0; bash scripts/check-config.sh Exit 0; CI=1 bash scripts/test-readme.sh im flachen Klon Exit 1 (Basis fehlt), ohne CI Exit 0
- 2026-11-22T12:10Z · Frühere Läufe: R1 auf 875daac test-all Exit 0, check-config Exit 0 (vor R2); Red-Beweise gegen 5e090af: test-measure-reads Exit 1, test-readme Exit 1, test-rollout Exit 1, test-rules Exit 1
- 2026-11-22T12:20Z · Validierung Runde 3 (62f22d1): A pass, B pass, C needs-attention (N1 mittel: Evidenz nannte nicht den End-Commit; Läufe liefen vor dem Commit im Arbeitsbaum; Rest low)
- 2026-11-22T12:35Z · R3 Evidenz auf 5c72d8c (Code-Stand, danach nur dieser Eintrag und der Bericht): bash scripts/test-all.sh Exit 0; bash scripts/check-config.sh Exit 0; node scripts/measure-reads.mjs Exit 0 (Milestone -351 B, Fix-Paket -709 B, Batch -44 B); CI=1 bash scripts/test-readme.sh im flachen Klon (depth 1) von 5c72d8c Exit 1 mit "baseline commit 9c51ceb missing in CI"
