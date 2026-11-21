# M004 Validierung

Drei getrennte Reviewer (Rolle `validation`, nur lesen), Rohquellen: Brief, Requirements-Auszug, Diff seit Startstand c3fb926, Evidenz der Session. Kein Reviewer hat eine Shell; Teststände und SHAs stammen aus den Läufen der Session.

## Verlauf
| Runde | A Requirements | B Integration | C Kriterien und Evidenz | Folge |
|---|---|---|---|---|
| 1 (nach S3, 1f8ea67) | needs-attention (6 mittel) | needs-attention (mittel) | needs-attention (4 mittel) | Rework R1 (1e32242) |
| 2 (nach R1) | needs-attention (4 mittel) | needs-attention (4 mittel) | needs-remediation (3 mittel) | Rework R2 (3da9544) |
| 3 (nach R2) | needs-attention (1 mittel) | pass | needs-attention (1 mittel, derselbe Fund) | Fund behoben in R3 (Antrag), siehe unten |

Gesamtergebnis nach Runde 3: **needs-attention**. Offen war genau ein mittlerer Fund: die Zuordnungstabelle in `project-questions.md` nannte für P1 `context.name` statt `--project`/`name`, und die Flags für P2, P3, P5 fehlten. Behoben in 4a54a00 (Test rot vorher: 11 FAIL; grün danach: `bash scripts/test-all.sh` Exit 0). Das ist eine dritte Reworkrunde; die Regel erlaubt zwei. Deshalb steht die Entscheidung bei Andreas (siehe STATE.md, Status needs-input), und es gibt bis dahin keinen Batch-PR.

## Behobene Funde (Auswahl)
- Hinweise ersetzen die Pflichtfrage nicht mehr; ungültige, leere oder unlesbare `workspace.json` führt zur selben einen Frage.
- Zeitzone wird pro Projekt gefragt (Repo und Autopilot), Vorschlag aus dem neuen optionalen Feld `timeZone` in `workspace.json`; ohne Wert wird ohne Vorschlag gefragt.
- Leere Zeitzone ließ den Autopilot-Check abstürzen: `settingsFrom` ignoriert leere und nicht-textuelle Werte; `check-config` akzeptiert `""` als „nicht gesetzt“.
- Installer: vorhandene `.foreman.json` mit falschem Typ für `context`/`autopilot` bricht vor dem Schreiben mit Exit 2 ab; veraltetes `autopilot.timezone` wird mitgesetzt; ein vorhandenes Backup wird nicht überschrieben.
- `foreman-setup` erklärt das Merge-Fenster und nennt die Pflege der Chat-Kopie von `workspace.json`.
- Routing-Test prüft jede Testfrage einzeln; Durchlauf-Test mit dem Beispiel-Fixture; Tracker-Frage in P3.

## Letzter Lauf
`bash scripts/test-all.sh` auf 4a54a00: Exit 0.

## Offene Funde (niedrig, im Bericht)
- `FOREMAN_WAIT_SECONDS=""` ergibt Wartezeit 0 (war schon vor M004 so).
- `check-config.sh` prüft das ältere `autopilot.timezone` nicht; `--tz` setzt es aber mit.
- `install.sh --tz` braucht Python mit `zoneinfo` und Zeitzonen-Datenbank; ohne wird auch `UTC` abgelehnt (der Check lässt `UTC` zu).
- `--dry-run` meldet bei vorhandener `.foreman.json` kein „would update“ für die neuen Optionen.
- Der Skill-Text nennt Ziel, Repo und Release-Tag zusätzlich zu P1 bis P9 (bewusst).
- Kriterium 7 ist eine statische Simulation; der echte Chat-Durchlauf bleibt UAT.

## Grenzen
Routing im echten Chat und ein Durchlauf mit echter `workspace.json`-Kopie prüft nur Andreas. Kein Reviewer ersetzt UAT.
