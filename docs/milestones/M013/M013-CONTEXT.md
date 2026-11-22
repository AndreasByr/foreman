# Milestone M013: Update erkennt eigene Lösungen

> **Entwurf zum Ansehen.** Kein freigegebener Brief, kein `STATE.md`, keine Roadmap-Zeile. Nichts startet diesen Milestone. Offene Punkte stehen am Ende.

**Project:** foreman
**Roadmap:** keine (0.3.0 ist noch nicht geplant, siehe Offene Punkte) · **Track:** Update · **Parallel to:** keiner

## Goal
Ein Projekt, das foreman-Dateien angepasst, entfernt oder durch eine eigene Lösung ersetzt hat, verliert diese Arbeit beim `./install.sh <projekt> --update` nicht mehr. Das Update erkennt solche Dateien, lässt sie stehen und sagt im Bericht, was es gefunden hat und was der Mensch tun kann. Alles, was das Projekt nicht angefasst hat, wird weiter automatisch aktualisiert.

## Starting point
`dev` mit Stand 0.2.3. Das Update steckt in `scripts/update.py` und wird über `install.sh --update [--dry-run]` aufgerufen. Jede Vorlagendatei hat eine Klasse in `update-classes.json`: `foreman` (wird ersetzt), `project` (bleibt), `mixed` (bleibt, Diff im Bericht). Vor dem Schreiben bricht das Update ab, wenn eine zu ersetzende Datei **uncommittete** Änderungen hat.

Die Lücke: Eine committete eigene Änderung an einer `foreman`-Datei wird ohne Hinweis überschrieben. Eine `foreman`-Datei, die das Projekt bewusst gelöscht hat, legt das Update neu an. Beides fällt erst auf, wenn etwas anders läuft als vorher. Hintergrund in `docs/learnings.md` (Abschnitt Referenzprojekt, Punkt zu `install.sh`).

## Capabilities
1. **Das Update kennt seinen letzten Stand.** Nach jedem Install und jedem Update ist für jede geschriebene `foreman`-Datei festgehalten, mit welchem Inhalt foreman sie zuletzt geschrieben hat.
2. **Eigene Änderung bleibt.** Weicht eine `foreman`-Datei vom zuletzt geschriebenen Stand ab, überschreibt das Update sie nicht. Der Bericht führt sie als eigene Änderung mit Diff gegen die neue Vorlage, wie heute bei `mixed`.
3. **Bewusst entfernt bleibt entfernt.** Fehlt eine `foreman`-Datei, die foreman früher geschrieben hat, legt das Update sie nicht neu an und nennt sie im Bericht. Dateien, die mit der neuen Version neu dazukommen, werden weiter angelegt.
4. **Eigene Lösung dauerhaft markieren.** Ein Projekt kann Pfade als eigene Lösung eintragen. Diese Pfade fasst das Update nie an, auch nicht neu anlegen. Der Bericht nennt sie in einer Sammelzeile.
5. **Übernahme in einem Schritt.** Der Mensch kann für eine gemeldete Datei sagen „Vorlage übernehmen“. Danach behandelt das Update sie wieder als normale `foreman`-Datei.
6. **Bericht nach Gruppen.** Der Bericht (auch `--dry-run`) zeigt getrennt: wird ersetzt, neu, eigene Änderung, entfernt, eigene Lösung. Am Ende steht eine Zeile, was der Mensch noch entscheiden muss, oder „nichts zu entscheiden“.

## Dependencies and order
1 vor 2 und 3 (beide brauchen den gespeicherten Stand). 4 und 5 bauen auf 2 auf. 6 zuletzt, weil er alle Gruppen kennt.

## Parallel milestones
Keine. Geteilte Dateien: `scripts/update.py`, `install.sh`, `update-classes.json`, `docs/MODULES.md`, `CHANGELOG.md`. Regel: bestehende Klassen und Optionen werden nur erweitert, nie umbenannt.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Kein eigener Bericht: keine Oberfläche, kein Netz, keine Rechte. Risikovorschau, übernommen in die Erfolgskriterien:
- Altprojekte ohne gespeicherten Stand (alle Installationen bis 0.2.3).
- Ein halb abgebrochenes Update darf den gespeicherten Stand nicht vor den Dateien schreiben.
- Pfade in der Markierungsliste dürfen nicht aus dem Projekt herauszeigen.
- Zeilenenden und Dateirechte dürfen nicht als eigene Änderung gelten.

## Binding documents
`docs/requirements.md`, `docs/MODULES.md` (Abschnitt Update-Klassen), `docs/learnings.md`, `docs/rollout/update-order.md`, `docs/versioning.md`, `CLAUDE.md`. Konfliktreihenfolge: requirements > design > roadmap > Brief.

## Fixed decisions
- Im Zweifel behalten. Eine Datei, deren Herkunft das Update nicht sicher kennt, wird nicht überschrieben, sondern gemeldet. Grund: Eine verlorene eigene Änderung kostet mehr als eine verpasste Aktualisierung.
- Der gespeicherte Stand wird zuletzt geschrieben, zusammen mit der Versionsnummer. Grund: gleiche Regel wie bei `.foreman.json` heute, ein abgebrochenes Update wird beim nächsten Lauf fertig.
- Weiter nur Python-Standardbibliothek, kein Netz.
- `mixed`-Dateien bleiben, wie sie sind. Dieser Milestone ändert nur das Verhalten der Klasse `foreman`.
- Keine Änderung an den Referenzprojekten selbst. Abnahme nur gegen ein Wegwerf-Testprojekt (`context.offLimits`).

## Data and interfaces
- Gespeicherter Stand je Datei: Pfad und Prüfsumme, im Projekt abgelegt (Ort: Offene Punkte, Frage 3).
- Markierungsliste: Pfade relativ zur Projektwurzel, in `.foreman.json`.
- „Vorlage übernehmen“: eine neue Option nur zusammen mit `--update`. Heute ist dort nur `--dry-run` erlaubt; die Fehlermeldung für unbekannte Optionen bleibt.
- Keine Umgebungsvariablen.

## Out of scope
- Eigene Lösungen an **anderer** Stelle erkennen (zum Beispiel ein eigener Guard unter anderem Namen). Dafür reicht die Markierungsliste.
- Automatisches Zusammenführen von eigener Änderung und neuer Vorlage.
- Änderungen an `foreman-update` (Chat-Skill) außer einem Verweis auf die neuen Berichtsgruppen.
- Release, Tag, Versionsnummer, `main`.

## Success criteria
1. Nach einem Install auf ein leeres Testprojekt ist für jede `foreman`-Datei ein Stand gespeichert; ein zweiter Lauf direkt danach meldet „nichts zu tun“.
2. Testprojekt mit committeter Änderung an einer `foreman`-Datei: Das Update lässt die Datei bytegleich, meldet sie als eigene Änderung mit Diff, Exit 0.
3. Testprojekt, in dem eine früher geschriebene `foreman`-Datei gelöscht wurde: Das Update legt sie nicht an und meldet sie als entfernt. Eine in der neuen Version neue Datei wird angelegt.
4. Ein Pfad in der Markierungsliste wird weder ersetzt noch angelegt, auch wenn die Datei fehlt. Ein Eintrag mit `..` oder absolutem Pfad bricht das Update mit Exit 2 und Nennung des Eintrags ab, bevor etwas geschrieben wird.
5. „Vorlage übernehmen“ für eine gemeldete Datei ersetzt genau diese Datei und aktualisiert ihren gespeicherten Stand; andere gemeldete Dateien bleiben.
6. Altprojekt ohne gespeicherten Stand: Abweichende `foreman`-Dateien werden behandelt wie in Offene Punkte, Frage 2 entschieden; der Test deckt beide Fälle ab (gleich und abweichend).
7. Abbruch zwischen Dateischreiben und Standschreiben (simuliert): Der nächste Lauf meldet keine falschen eigenen Änderungen und schließt das Update ab.
8. Nur andere Zeilenenden oder geänderte Dateirechte gelten nicht als eigene Änderung.
9. `--dry-run` schreibt nichts, auch keinen Stand; der Bericht zeigt alle Gruppen und die Schlusszeile.

## Verification
Commands that must be green:
`bash scripts/test-update.sh`
`bash scripts/test-update-classes.sh`
`bash scripts/test-update-docs.sh`
`bash scripts/test-install.sh`
`python3 scripts/test-rules.py`
`bash scripts/privacy-scan.sh`
`bash scripts/test-all.sh`

Human only (UAT): Einmal `--update --dry-run` und `--update` gegen eine Kopie eines echten Altprojekts. Prüfen, dass keine eigene Änderung verloren geht und der Bericht ohne Nachfragen verständlich ist.

## Risks
- Die erste Version mit gespeichertem Stand trifft nur auf Altprojekte. Wird Frage 2 falsch entschieden, meldet das Update bei allen Projekten eine lange Liste oder überschreibt doch.
- Gerenderte Vorlagen (Platzhalter wie Projektname) ändern sich mit der Konfiguration. Ein geänderter Projektname darf nicht als eigene Änderung gelten.
- `test-update.sh` ist schon groß; neue Fälle sollen in eigene Testfunktionen, damit ein roter Fall eindeutig ist.

## Offene Punkte (vor Freigabe)
1. **0.3.0 gibt es laut `docs/requirements.md` und Roadmap nicht.** Empfehlung: erst eine Roadmap 0.3.0 mit `foreman-roadmap` anlegen und diesen Milestone dort einordnen. Alternative: als 0.2.x-Patch führen; dann müsste die Roadmap 0.2.x einen M013 bekommen.
2. **Altprojekte ohne gespeicherten Stand.** Empfehlung: abweichende `foreman`-Dateien beim ersten Lauf behalten und melden, gleiche Dateien als Stand übernehmen. Alternative: einmalig überschreiben wie bisher, was genau die heutige Lücke wäre.
3. **Ort des gespeicherten Stands.** Empfehlung: eigene Datei unter `.foreman/`, weil `.foreman.json` von Hand bearbeitet wird und sonst lange Prüfsummenlisten enthält. Alternative: Block in `.foreman.json`.
4. **Eigene Lösungen an anderer Stelle erkennen.** Empfehlung: nicht in diesem Milestone, die Markierungsliste reicht für den Anfang.
