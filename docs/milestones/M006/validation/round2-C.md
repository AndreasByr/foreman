# Full worker report: val-C.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

- [low] scripts/test-changelog.sh:91-94: Prüfung 4c ist bei der heutigen Datei immer wahr. Sie besteht also aus dem falschen Grund. Die Zeile `Files:` in `CHANGELOG.md:8` enthält schon „dispatcher“ (`dispatcher/dispatch.mjs`) und „update“ (`--update`). Wird der Schritt „Update the dispatcher code on the dispatcher machine“ aus `CHANGELOG.md:9` gelöscht, bleibt der Test grün. Damit gilt R1-Punkt 6 („test enforces it“) nicht.
- [low] CHANGELOG.md:8: Laut Text werden `dispatcher/dispatch.mjs` und die übrigen genannten Dateien „(replaced by `--update`)“. `dispatcher/` liegt aber nicht in `template/` (siehe Dateiliste), und `scripts/update.py` liest nur `template/` und `gateway/` (`scripts/update.py:180-196`). Für den Dispatcher stimmt die Aussage also nicht. Die korrekte Anweisung steht erst in Zeile 9.
- [low] scripts/update.py:44-48 und scripts/test-update.sh:236-243: Test 14 prüft nur, dass `0.2.1-rc1` nicht als neuer abgelehnt wird. `vtuple` wirft den Suffix weg, also gilt `0.2.1-rc1 == 0.2.1`, und `bump` bleibt `None` (`update.py:271`). `.foreman.json` behält deshalb dauerhaft „0.2.1-rc1“. Der Skill vergleicht in Schritt 1 die Strings (`SKILL.md:14-16`) und meldet so immer wieder ein Update, das „nothing to do“ ergibt. Der Test prüft die Version nach dem Lauf nicht.
- [low] scripts/update.py:301-303: Ist die Version älter, aber keine Datei muss geschrieben werden, gibt das Skript „nothing to do“ aus. Trotzdem schreibt es danach `.foreman.json` (`update.py:316-321`). Die Liste nennt diese Änderung nicht, und es gibt keinen Test für den Fall.
- [low] scripts/test-update.sh (ganze Datei): Ein Testfall fehlt. STATE.md (Pflichtfragen, S3, Spalte 2) nennt „Zieldatei ist Verzeichnis“ als Negativtest, aber kein Test legt an einem Zielpfad ein Verzeichnis an. Test 6 deckt nur den umgekehrten Fall ab: der Elternordner ist eine Datei. Verhalten laut Code: Bei einer foreman-Datei ergibt `read_bytes` den Wert `None`, die Aktion ist `update`, und `os.replace` schlägt mit Exit 1 fehl. Bei einer gemischten Datei steht nur „keep … (mixed: merge by hand)“ ohne Diff da, weil `cur is None` ist (`update.py:239-240`).
- [low] scripts/test-project-block.sh: Ein Testfall fehlt. STATE.md (S5, Spalte 3) nennt „Referenzdatei nicht lesbar: definierter Fehler“. Der Code dafür existiert (`block-status.py:41-44`), wird aber nicht getestet.
- [low] scripts/test-update.sh:190-207: Die Tests 9 und 10 prüfen Exit 2 und den Dateinamen, aber nicht „ohne Schreiben“. Anders als Test 5 (`:132`, `:136`) fehlt hier der Vergleich per `tree_hash`.
- [low] scripts/test-update.sh:210-216: Test 12 prüft nur, dass `config.toml` existiert und die Zeile „create“ ausgegeben wird. Ob der Inhalt der gerenderten Vorlage entspricht, prüft er nicht.
- [low] scripts/test-update.sh:31-63: Kriterium 3 verlangt „foreman-eigene Dateien entsprechen dem Template“. Verglichen wird aber nur `scripts/lib/state.mjs` (`:60`). Alle anderen foreman-Dateien kommen aus derselben Installation und waren nie anders. Ein Fehler beim Ersetzen anderer Dateien würde der Test daher nicht finden.
- [low] plugins/foreman/skills/foreman-update/SKILL.md:39-46: Unklar, in welchem Ordner der Auftrag beginnt. „On a clean working tree, on a fresh branch“ meint das Projekt. `./install.sh` in Schritt 1 und 2 braucht aber den foreman-Checkout als aktuellen Ordner, und der wird nicht genannt.
- [low] plugins/foreman/skills/foreman-update/SKILL.md:62: Punkt 3 der Checkliste („Check the model IDs in `tools/delegate/config.toml`“) ist ein Schritt im Repo. Abschnitt 6 soll laut Titel aber nur Schritte außerhalb des Repos enthalten.
- [low] plugins/foreman/skills/foreman-project-mode/SKILL.md:56: Die Liste der Ausgaben nennt `error: …` (Exit 2) nicht, obwohl `block-status.py:12` und `:25-27` sie liefern. `foreman-update/SKILL.md:71` behandelt `error:` dagegen.

**Prüfungen**

| Kriterium / R1-Punkt | Test | Ergebnis |
|---|---|---|
| K1 Klassen | `test-update-classes.sh`: eine Regel je Datei, keine Regel ohne Datei, Klassen der Projektdateien fest vorgegeben | ok |
| K2 Upgrade-Abschnitte | `test-changelog.sh` 2, 3, 4 | ok. 4c ist wirkungslos (siehe oben) |
| K3 Anpassungen bleiben, `check-config` grün | `test-update.sh` 1 (`cmp` gegen gesicherte Kopie, `check-config` im Projekt `:73`) | ok, nur 1 foreman-Datei verglichen |
| K4 Dry-Run schreibt nichts, zweiter Lauf | Test 1 (`tree_hash` `:54`, „nothing to do“ `:77`), Test 2 (6 Modulsätze) | ok |
| K5 Fehlerfälle ohne Schreiben, Version unverändert | Test 3 (fehlt, kaputt, kein `foreman`, 99.0.0, Ziel fehlt, fremde Optionen), 4, 6, 13 | ok. Fall „nicht schreibbar“ bewusst offen (akzeptiert) |
| K6 ungesicherte Änderung bricht ab | Test 5, 9, 10. `rev-parse --is-inside-work-tree` in `update.py:251-255` | ok |
| K7 Plugin-Validierung, Durchlauf | `test-plugin.sh` durchläuft alle Skill-Ordner. `test-update-skill.sh` A bis E, D prüft die Markierung in der echten Dry-Run-Ausgabe | ok. D prüft nur, dass Skill-Text und Installer-Ausgabe zusammenpassen |
| K8 Block-Status | `test-project-block.sh` 1 bis 8 (v0, ohne Version, fehlt, leer, neuer, zwei Blöcke, nicht geschlossen) | ok |
| R1.2 `cd` vor `check-config` | SKILL.md:42-44, Test B | ok |
| R1.3 Diff für gemischte Dateien | `update.py:287-296`, Test 11 | ok |
| R1.5 Refresh-Aufruf | SKILL.md:69 | ok |
| R1.7 `GIT_OPTIONAL_LOCKS`, `--no-renames` | `update.py:250`, `:262` | ok |
| Skill-Text gegen Verhalten | Markierung „(mixed: merge by hand)“, Ausgaben und Exit-Codes von `block-status`, Exit 2 bei neuerer Projektversion | stimmt überein, bis auf die oben genannten Lücken |

**Established**
- Alle 8 Erfolgskriterien haben einen Test, der den Kern prüft. R1-Punkte 1 bis 5 und 7 sind im Code und in den Tests umgesetzt (Belege in der Tabelle).
- Vor jedem Schreiben stehen alle Vorbedingungen fest: Prüfung „nicht außerhalb des Zielordners“, Klassen, Prüfung auf ungesicherte Änderungen, ersetzter `foreman`-Wert in `.foreman.json` (`update.py:206-283`). `version` wird als Letztes geschrieben (`:316`).
- Aussagen des Skills zu Ausgaben, Optionen und Exit-Codes passen zu `update.py`, `install.sh:48-53` und `block-status.py`. Ausnahmen: die oben genannten Low-Punkte.
- Der Prüfschritt 4c im CHANGELOG-Test ist bei der heutigen Datei wirkungslos.

**Unclear / not found**
- Die Tests wurden nicht ausgeführt, weil der Auftrag nur Lesen erlaubt. „Grün“ stammt nur aus STATE.md.
- Ob die alte Prüfung auf ungesicherte Änderungen (vor R1) die Tests 9 und 10 wirklich rot hat werden lassen, ist nicht belegt. Git durfte ich nicht nutzen.
- `template/tools/delegate/__pycache__/run_task.cpython-313.pyc` liegt im Arbeitsbaum. Wegen `__pycache__/` in `.gitignore` ist es vermutlich nicht eingecheckt. `install.sh:157` würde es mitkopieren, `update.py` überspringt es. Folgen für echte Projekte habe ich nicht geprüft.
