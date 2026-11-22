# Milestone M011: Messung und Eingriffe

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** F · Messung · **Parallel to:** M002, M003, M006, M008 (M001 ist in `dev`)

## Goal
Ein Skript fasst pro Projekt und Zeitraum Laufzeit, Eingriffe mit Ursache, Claude-Fallbacks und Modelle je Rolle zusammen und schreibt das Ergebnis nach `docs/metrics.md`.

## Starting point
foreman 0.2.1 plus M001 in `dev`. Die Daten liegen schon vor, aber verstreut: `STATE.md` je Unit (Statuszeile, Log-Zeilen mit UTC-Zeit, Abschnitt „Open question“), `docs/agent-reports/*.md`, und die Worker-Result-Files des Wrappers (`tools/delegate/tasks/*.result.md`, git-ignoriert, nur lokal). Eine Ursache für einen Eingriff steht nirgends als Feld; ein Eingriff lässt sich nur als Freitext in der Frage finden. Bibliotheken für Zustand und Eingriffe: `template/scripts/lib/state.mjs`, `intervention.mjs`, `units.mjs` (identisch unter `scripts/lib/`).

## Capabilities
1. **Ursache je Eingriff.** Jeder Eingriff (`needs-input`) trägt in `STATE.md` eine Ursachen-Zeile: Kategorie und ein Satz. Fehlt sie, wird der Eingriff als Lücke gemeldet.
2. **Mess-Skript.** Liest `STATE.md` (Meilensteine und Fix-Pakete), Agent-Berichte und Worker-Result-Files und liefert pro Projekt und Zeitraum: Laufzeit je Unit, Anzahl Eingriffe je Ursache, Anzahl Fallbacks auf Claude, Worker-Modell je Rolle.
3. **Ausgabe.** Das Ergebnis steht in `docs/metrics.md`; der Zeitraum ist eine Option (Standard: letzte 7 Tage). Nicht messbare Teile (zum Beispiel fehlende Result-Files) stehen als Lücke in der Datei, nicht als Null.

## Dependencies and order
S1 vor S2 (das Skript liest die Ursachen-Zeile), S2 vor S3.

## Parallel milestones
M002, M003, M006, M008 laufen auf eigenen Batch-Branches. Geteilte Dateien: `template/scripts/`, `STATE.md`-Vorlagen, `docs/MODULES.md`, `docs/learnings.md`, `scripts/test-all.sh`, `scripts/test-install.sh`, `CHANGELOG.md`. Regel: nur ergänzen, nie umbauen oder umsortieren. `run_task.py` und das Format der Result-Files bleiben unberührt (M002 baut dort um); das Skript liest das Format, wie es heute ist.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M011-briefing.md`. Als Erfolgskriterien übernommen: Skript liest nur, schreibt nur `docs/metrics.md`, kein Netz; keine Geheimnisse und keine Freitext-Fragen in der Ausgabe außer der Ursachen-Zeile; fehlende oder kaputte Eingabedateien ergeben eine Lücke, keinen Absturz und keine erfundene Zahl; Zeiträume am Rand (Unit läuft über die Grenze) sind festgelegt.

## Binding documents
`docs/requirements.md` (Abschnitt Messung), `docs/roadmap-0.2.x.md` (Abschnitt M011), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: requirements > roadmap > Brief.

## Fixed decisions
- Messwerte landen in `docs/metrics.md` pro Projekt (Vorschlag der Roadmap; die offene Frage der Requirements ist damit entschieden). Die Datei wird bei jedem Lauf vollständig neu erzeugt und trägt oben Zeitraum und Erzeugungszeit.
- Kategorien der Ursache (fest): `missing-requirement`, `open-decision`, `missing-infra`, `merge-conflict`, `ui-deviation`, `limit-exceeded`, `security`, `other`. Format: `**Cause:** <Kategorie> · <ein Satz>` im Abschnitt „Open question“. Eine unbekannte Kategorie zählt als Lücke.
- Ein Eingriff ist ein Abschnitt „Open question …“ in `STATE.md` (offen oder als beantwortet markiert). Mehrere Eingriffe je Unit sind erlaubt.
- Das Skript ist modellfrei (kein Token-Verbrauch), Node ohne neue Abhängigkeiten, Quelle in `template/scripts/` und gleich unter `scripts/` (wie die übrigen Skripte).
- Ein Fallback auf Claude ist ein Versuch, dessen Überschrift im Result-File „fallback after provider outage“ trägt. Das Modell je Rolle steht in der Versuchs-Überschrift (`Attempt N: <rolle> (<anbieter/modell>)`).
- Laufzeit je Unit = Zeit von der ersten bis zur letzten Log-Zeile mit gültigem UTC-Stempel, abzüglich der Zeit, in der die Unit laut Log auf `needs-input` stand, sofern bestimmbar; sonst Gesamtzeit und Hinweis. Eine Unit gehört zum Zeitraum, wenn ihre letzte Log-Zeile darin liegt.
- Nur Mengen und Zeiten, keine Kosten- oder Tokenzahlen (es gibt dafür keine Quelle).

## Data and interfaces
Eingabe: `docs/milestones/*/STATE.md`, `docs/fixpacks/*/STATE.md`, `docs/agent-reports/*.md`, `tools/delegate/tasks/*.result.md`. Ausgabe: `docs/metrics.md`. Aufruf: `node scripts/measure.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--root <Projektordner>] [--results <Ordner>] [--strict]`. Mit `--strict` endet das Skript mit Exit 1, wenn Lücken gemeldet sind. Keine Umgebungsvariablen, keine Geheimnisse.

## Out of scope
- Kosten, Tokens, Abo-Verbrauch (keine Datenquelle).
- Vergleich zwischen Projekten und das Gesamtbild für M012 (kommt dort).
- Änderungen an `run_task.py`, am Format der Result-Files oder am Dispatcher.
- Automatisches Ausführen des Skripts (Routine, Dispatcher).
- Tracker-Daten (Tracker ist `none`; die Zahlen kommen aus Dateien).
- Änderungen an die Referenzprojekte (Abnahme nur gegen ein Wegwerf-Testprojekt).

## Success criteria
1. Test: Ein `STATE.md` mit „Open question“-Abschnitt ohne Ursachen-Zeile wird als Lücke gemeldet; mit gültiger Zeile nicht; mit unbekannter Kategorie als Lücke; `--strict` gibt dann Exit 1.
2. Test: Beispieldaten (3 Units, davon eine mit 2 Eingriffen und eine mit 1 Eingriff ohne Ursache; 4 Result-Files, davon eines mit Fallback) ergeben genau die im Test festgeschriebenen Zahlen für Laufzeit je Unit, Eingriffe je Ursache, Fallbacks und Modelle je Rolle.
3. Test: Zeitraum-Option: Eine Unit mit letzter Log-Zeile außerhalb des Zeitraums fehlt, eine innerhalb steht drin; Standard sind die letzten 7 Tage; ungültiges Datum gibt eine klare Fehlermeldung (Exit 2), keine Datei wird geschrieben.
4. Test: Fehlt der Result-Ordner oder ist eine Datei kaputt, steht eine Lücke in `docs/metrics.md`, das Skript stürzt nicht ab und erfindet keine Zahl.
5. Test: Zwei Läufe mit gleichen Daten und gleichem Zeitraum erzeugen bis auf die Zeile „Erzeugt“ dieselbe Datei; die Datei enthält keinen Freitext aus Fragen und keine Pfade außerhalb des Projekts.
6. Lauf an einem Testprojekt (Kopie dieses Repos mit Beispieldaten) erzeugt `docs/metrics.md` mit Läufen, Eingriffen, Fallbacks und Modellen.
7. Die `STATE.md`-Vorlagen (`docs/milestones/_TEMPLATE`, `docs/fixpacks/_TEMPLATE` und die Vorlagen unter `template/docs/`) und die Skills nennen die Ursachen-Zeile; die Begründung steht in `docs/learnings.md`, die Skills nur die Regel.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/check-config.sh
Human only (UAT): Ein Lauf am Wegwerf-Testprojekt für die letzten 7 Tage; `docs/metrics.md` zeigt Läufe, Eingriffe, Fallbacks, Modelle; Zahlen passen zu den Berichten.

## Risks
`STATE.md`-Log-Zeilen sind Freitext mit Konvention; ältere oder handgeschriebene Zeilen können vom Format abweichen (Lücke statt Raten). Result-Files sind git-ignoriert und liegen nur auf der Maschine, die den Worker lief: Zahlen von einer anderen Maschine fehlen (als Lücke ausgewiesen). Das Format der Result-Files kann sich mit M002 ändern; der Test nutzt ein festes Beispiel und macht eine Formatänderung sichtbar.
