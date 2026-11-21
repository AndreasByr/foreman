# M006 Validierung

Gesamtergebnis: **pass** (Runde 3 von 3; 2 Nacharbeitsrunden). Letzter Lauf auf Commit `a2ef578` (Merge von `dev` in `batch/m006`): `bash scripts/test-all.sh` Exit 0, `bash scripts/check-config.sh` Exit 0.

Die Prüfer (Rolle `validation`, nur lesend, stärkstes Modell) bekamen die Rohquellen: Brief, Roadmap-Abschnitt, STATE.md und den Diff seit Startcommit `c6b3149`; keine Bewertung der Session. Ab Runde 2 zusätzlich die Liste der Funde der Vorrunde zum Nachprüfen.

| Runde | A Anforderungen | B Integration und Regression | C Kriterien und Nachweise | Gesamt |
|---|---|---|---|---|
| 1 | needs-remediation (4 mittel) | needs-remediation (1 mittel) | needs-attention (4 mittel) | needs-remediation |
| 2 | pass | needs-remediation (1 mittel) | pass | needs-remediation |
| 3 | pass | pass | pass | **pass** |

Rohberichte: `docs/milestones/M006/validation/round1-A.md` bis `round3-C.md`.

## Mittlere Funde, alle behoben
1. Prüfung auf ungesicherte Änderungen entfiel in Git-Worktrees, Submodulen und Unterordnern (alle drei Prüfer). R1: `git rev-parse --is-inside-work-tree`; Tests 9 und 10.
2. Der Auftrag im Skill ließ `check-config.sh` im foreman-Checkout laufen statt im Projekt (C). R1: `cd <project path>` vor dem Aufruf; Test.
3. Gemischte Dateien wurden nur beim Namen genannt, `docs/requirements.md` verlangt die Änderung zu zeigen (A, C). R1: Diff gegen die gerenderte Vorlage; Test 11.
4. Der Skill-Test prüfte nur Text (A, C). R1: Abschnitt-6-Prüfung, Durchlauf am Testprojekt, Reihenfolge im Auftrag.
5. Der Skill rief `foreman-project-mode` nicht auf (A). R1: Aufruf im Auffrischen-Modus nach `block-status.py`.
6. Jeder Git-Fehler zählte als „kein Repo“ und das Update schrieb weiter (B, Runde 2). R2: nur Exit 128 mit „not a git repository“ zählt so; alle anderen Git-Fehler brechen mit Exit 2 ab, nichts geschrieben; Test 15 rot vorher (Exit 0), grün nachher.

## Offen, niedrig (im Abschlussbericht)
- `nothing to do` erscheint auch, wenn nur die Version neu geschrieben wird.
- Der Diff gemischter Dateien zeigt bis zu 60 Zeilen im Klartext, auch bei `.claude/settings.json` (ein `env`-Block mit Werten würde im Transkript landen; die Vorlage hat keinen).
- Dateien, die aus `template/` verschwunden sind, werden im Projekt nicht gelöscht und nicht gemeldet.
- Ein beschädigtes Repo (`.git`-Datei zeigt ins Leere) zählt als „kein Repo“ und bekommt nur den Hinweis.
- Eine foreman-eigene Datei in `.gitignore` wird bei lokaler Änderung ohne Abbruch ersetzt.
- Kein Test für eine Zieldatei, die literal nicht schreibbar ist (Root ignoriert Rechte); der Schreibfehler wird über eine Datei statt Verzeichnis bewiesen.
- Alte Modulnamen (`ollama`, `linear`) werden im Update nicht umbenannt; nur sichtbar als Diff in `CLAUDE.md`.
- Analysen F2/F3 (Projekt A, Projekt B) liegen nicht im Repo; `scripts/autopilot-check.*` ist foreman-eigen, ein committeter Patch darin wird ersetzt (Dry-Run zeigt es).
