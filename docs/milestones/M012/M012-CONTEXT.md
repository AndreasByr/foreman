# Milestone M012: Vereinfachen und Abschluss 0.2.x

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** Abschluss · **Parallel to:** keiner (alle anderen Milestones sind in `dev`)

## Goal
Doppelte Regeln stehen an einer Stelle, ein Work-Run liest nicht mehr als vor 0.2.2, und README und Learnings zeigen den Stand mit Zahlen. Die Projekte A, B und C bekommen vorbereitete Update-Aufträge.

## Starting point
`dev` mit M001 bis M011, VERSION 0.2.1. Referenzstand für "vor 0.2.2": Commit `9c51ceb` (Release 0.2.1). Seitdem sind Skills, Referenzen und Docs gewachsen (Batch, Delegation, Milestone, Fixpack, batch-run, intervention, neues Wiki-Skill). Ein Lint für drei Regeln gibt es schon (`scripts/test-rules.py`: Model-ID, Claude-Dir, Key-File). Messskript für Läufe: `scripts/measure.mjs` (M011).

## Capabilities
1. **Eine Stelle je Regel.** Regeln, die in Repo-Skills, Chat-Skills und `docs/` mehrfach stehen, bekommen einen Eigentümer. Die anderen Stellen behalten höchstens einen Verweis. Bekannte Widersprüche werden mit bereinigt (Review-Runden in `docs/PRINCIPLES.md`, Merge-Methode, Schrittverweis in `batch-run.md`).
2. **Lesemenge messbar.** Ein Skript zählt, was ein Work-Run an festen Dateien liest (CLAUDE.md, Skills, Referenzen je Einheitstyp), für einen Git-Stand, und vergleicht mit dem Referenzstand. Ein Test schlägt fehl, wenn der aktuelle Stand mehr liest.
3. **README mit Zahlen.** Zahlen aus `scripts/measure.mjs` (M011) und aus der Lesemengen-Messung, Verweis auf `docs/learnings.md`; Modul- und Anbieter-Kombinationen ohne regelmäßigen Test sind gekennzeichnet.
4. **Rollout-Aufträge.** Für Projekt A, B und C je ein Auftrag mit Checkliste für `foreman-update`, mit Platzhaltern statt echter Namen.

## Dependencies and order
S1 vor S2 (S2 misst nach der Bereinigung), S2 vor S3 (S3 nennt die Zahlen). S4 unabhängig, läuft zuletzt (kennt die Version und die Upgrade-Hinweise).

## Parallel milestones
Keine. Geteilte Dateien: alle Skills, `README.md`, `docs/learnings.md`, `CHANGELOG.md`. Regel: Rendered-Kopien unter `.claude/skills/` bleiben bytegleich zur Vorlage (`test-rules.py` prüft das).

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Kein eigener Bericht; der Umfang ist Dokumente und Skripte, keine Oberfläche, kein Netz, keine Rechte. Mehr-Dateien-Edits an Skills: Rendered-Kopie, Install-Tests (`scripts/test-install.sh`), Größenlimits (`scripts/test-update-skill.sh`, `scripts/check-config.sh`) bleiben grün.

## Binding documents
`docs/requirements.md`, `docs/roadmap-0.2.x.md` (Abschnitt M012), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: requirements > roadmap > Brief.

## Fixed decisions
- Chat-Skills (`plugins/foreman/skills/`) bleiben je für sich lesbar, weil der Chat keine Repo-Docs liest. Dort wird nur gekürzt, was innerhalb der Chat-Skills doppelt steht; Regeln, die ein Chat-Skill in das Projekt schreibt (Projektblock), bleiben vollständig.
- Besitzer: Review-Gate, Rework-Runden, "Nichts weiterreichen", Beweisregel, Rot-dann-Grün: `foreman-delegation`. Board-Check: `foreman-milestone`. Versionsnummer und Changelog-Regeln: `docs/versioning.md`. Eingriff (Erklärkommentar): `foreman-dispatch-run/references/intervention.md`. Push-Ziele und Prod-Verbot: `CLAUDE.md` plus `foreman-delegation` Git rules.
- Vorher-Wert der Lesemenge ist der Stand `9c51ceb`; gemessen in Bytes (Tokens ≈ Bytes/4 nur als Hinweis). Szenarien: Work-Run Milestone, Work-Run Fix-Paket, Batch-Run; Wiki-Skill zählt nur mit Wiki-Modul und steht getrennt.
- Das Mess-Skript ändert nichts, liest nur per `git show`/Dateisystem, kein Netz, keine Abhängigkeit.
- Die Zahlen aus Projekt A, B, C gibt es erst nach deren Update; die README nennt sie nicht als gemessen, sondern kennzeichnet die Lücke.
- VERSION bleibt 0.2.1. Kein Tag, kein Release, kein Änderungsdatei-Eintrag außer "Unreleased"-Punkten.

## Data and interfaces
- `node scripts/measure-reads.mjs [--ref <git-ref>] [--baseline <git-ref>] [--json]` → Tabelle je Szenario und Datei, Summe, Differenz; Exit 1, wenn eine Summe über dem Referenzstand liegt (ohne Wiki-Szenario).
- Neue Lint-Regeln in `scripts/test-rules.py`: je Besitzerregel genau ein Vorkommen im Besitzer, kein Wiederholungstext in den übrigen Repo-Skills.

## Out of scope
- Änderungen an Projekt A, B, C selbst (nur Aufträge).
- Release, Tag, Version, `main`.
- Neue Funktionen.
- Messung von Tokens oder Kosten.

## Success criteria
1. Lint: Für jede Besitzerregel (Review-Gate/Rework-Runden, Nichts-weiterreichen, Board-Check, Beweisregel, Versions-/Changelog-Regel, Eingriffskommentar) steht der Regeltext genau einmal in den Repo-Skills; ein künstliches Duplikat lässt `scripts/test-rules.py` fehlschlagen (Selbsttest).
2. `docs/PRINCIPLES.md` nennt zwei Rework-Runden wie die Skills; die Widersprüche aus der Inventur sind behoben oder als bewusst vermerkt.
3. `scripts/measure-reads.mjs`: Test mit synthetischem Git-Repo (kleiner Stand, größerer Stand, gleicher Stand); größerer Stand → Exit 1, gleicher/kleinerer → Exit 0; Wiki-Szenario zählt nicht gegen die Grenze.
4. Lesemenge am echten Repo: Summe je Szenario ≤ Referenzstand `9c51ceb`; Vorher- und Nachher-Zahl stehen im Bericht und in `docs/learnings.md`.
5. README nennt die Zahlen (Lesemenge, Läufe/Eingriffe aus `docs/metrics.md` soweit vorhanden, Lücken gekennzeichnet), verweist auf `docs/learnings.md` und kennzeichnet Kombinationen ohne regelmäßigen Test.
6. Drei Rollout-Aufträge (A, B, C) mit Checkliste, ohne echte Namen oder Hosts (`privacy-scan` grün).
7. `bash scripts/test-all.sh` und `bash scripts/check-config.sh` grün auf dem End-Commit.

## Verification
bash scripts/test-all.sh
bash scripts/check-config.sh
node scripts/measure-reads.mjs
Human only (UAT): README lesen (stimmen Zahlen und Kennzeichnung?); mindestens ein echtes Projekt per `foreman-update` aktualisieren, `check-config.sh` ok, Anpassungen erhalten.

## Risks
Skill-Kürzungen berühren Tests, die Sätze oder Größen prüfen (Install-, Update-, Docs-Regel-Tests). Chat-Skills dürfen nicht auf Repo-Docs verweisen, die der Chat nicht lesen kann. Spätere Fix-Pakete auf denselben Dateien erzeugen Konflikte. Echte Rollout-Zahlen fehlen bis zum Update der Projekte.
