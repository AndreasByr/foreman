# Full worker report: val-A.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

- [low] scripts/update.py: Ob ein Ziel „kein Git-Repo“ ist, wird am englischen Text in der Fehlerausgabe von git erkannt. Die Sprache von git wird dabei nicht auf Englisch festgesetzt. Nutzt git auf dem Rechner eine deutsche Sprachausgabe, meldet es „Kein Git-Repository …“. Dann bricht ein Update auf einem Ziel ohne Git mit Exit 2 ab („cannot check local changes with git: …“), statt mit Hinweis weiterzulaufen. Belege: `scripts/update.py:242` setzt nur `GIT_OPTIONAL_LOCKS`, kein `LC_ALL=C`; `scripts/update.py:255` prüft `"not a git repository" in err`. Es wird nichts geschrieben, aber ein Projekt ohne Git lässt sich so auf deutschsprachigen Systemen nicht aktualisieren. Kein Test deckt das ab, denn die Tests 4, 6, 7, 8 und 12 laufen mit der Sprache der Testumgebung. Abhilfe: `LC_ALL=C` in die Umgebung für git setzen (`env`). Diesen Befund nicht als bewiesen behandeln: Er ist aus dem Code abgeleitet, ich habe nichts ausgeführt (siehe unten).

## Prüfung R2 (die geänderten Punkte)

| Punkt | Ergebnis | Beleg |
|---|---|---|
| Nur Exit 128 mit „not a git repository“ zählt als kein Repo | umgesetzt | `scripts/update.py:251-259`. Jeder andere Rückgabewert von git führt zu `die(2, …)`. Das passiert vor jedem Schreiben, das erst ab `:309` kommt. |
| Fremder Besitzer (dubious ownership) bricht ab, schreibt nichts | umgesetzt, Test vorhanden | Test 15 in `scripts/test-update.sh` mit `GIT_TEST_ASSUME_DIFFERENT_OWNER=1`. Er prüft Exit 2, den Text „cannot check local changes“ und einen unveränderten Hash. `state.mjs` ist absichtlich veraltet, damit die Liste `to_update` nicht leer ist und die Git-Prüfung überhaupt läuft. |
| Pre-Release wird auf die Release-Version gehoben | umgesetzt | `vtuple` liest nur die Ziffern `x.y.z` (`update.py`, Funktion `vtuple`). `0.2.1-rc1` und `VERSION` 0.2.1 gelten als gleich, und weil `old != new` gilt, wird die Version gehoben (`:275`). Test 14 prüft Exit 0, dass kein „newer“ erscheint, und die neue Version. |
| Die „Files“-Zeile im CHANGELOG behauptet nicht mehr, `--update` ersetze den Dispatcher | umgesetzt | Laut `CHANGELOG.md` (Unreleased, Upgrade) ist `dispatcher/dispatch.mjs` nicht im Projekt und wird auf dem Dispatcher-Rechner aktualisiert. Alle genannten Dateien gibt es in `template/` (`scripts/autopilot-check.sh/.mjs`, `scripts/check-config.sh`, `.claude/skills/foreman-dispatch-run/references/batch-run.md`, `.claude/skills/foreman-batch/`). |
| Der Auftragsblock im Skill sagt, wo jeder Befehl läuft | umgesetzt | In `plugins/foreman/skills/foreman-update/SKILL.md`, Abschnitt 4, laufen die Schritte 1–2 im foreman-Checkout. Schritt 3 ist `cd <project path>`, Schritt 4 `check-config.sh`. Test B in `scripts/test-update-skill.sh` prüft die Reihenfolge. |

## Anforderungen (Brief und Roadmap)

| Punkt | Status | Beleg |
|---|---|---|
| Fähigkeit 1 / S1 / Kriterium 1: Klassen | covered | `update-classes.json`. `scripts/test-update-classes.sh` prüft: genau eine Regel pro Datei, keine veralteten Regeln, Klassen der Projektdateien festgeschrieben. |
| Fähigkeit 2 / S2 / Kriterium 2: Upgrade-Abschnitte | covered | `CHANGELOG.md` hat `### Upgrade` für Unreleased, 0.2.1, 0.2.0 und 0.1.0. `scripts/test-changelog.sh` prüft die Pflichtwörter `pass_env`, `webhook_format`, `mainAutoMerge` sowie Files, Steps und Optional. |
| Verhaltensänderungen aus M001 im Upgrade-Hinweis | covered | Der Unreleased-Upgrade-Teil nennt `pass_env`, `webhook_format` und `mainAutoMerge`. |
| Fähigkeit 3 / S3 / Kriterien 3–6: `--update` | covered | `install.sh` mit `--update` ruft `scripts/update.py` auf. Test 1: Klassen bleiben erhalten, `check-config.sh` ist grün, Dry-Run lässt den Hash gleich, zweiter Lauf meldet „nothing to do“. Tests 3 und 13: Fehlerfälle. Test 4: Symlink aus dem Zielordner heraus. Test 5: ungesicherte Änderungen. Test 6: Schreibfehler lässt die Version gleich. Test 7: Module bleiben aus. |
| `version` wird zuletzt geschrieben | covered | Bei einem Schreibfehler endet `update.py` mit Exit 1, bevor `bump` geschrieben wird (`:309-321`). |
| `context`/`mirror` bleiben unverändert | covered | Ersetzt wird nur der erste Treffer für `"foreman"`. Zur Sicherheit prüft das Skript per `json.loads(...).get("foreman") == new` (`:276-281`), sonst Abbruch vor dem Schreiben. Test 1 vergleicht alle übrigen Felder. |
| Keine Schlüsseldateien lesen | covered | Gelesen werden nur Zieldateien, die einem Template-Pfad entsprechen, dazu `.foreman.json` und `.claude/settings.json` (`update.py`, Planungsschleife). |
| Fähigkeit 4 / S4 / Kriterium 7: Skill | covered | `foreman-update/SKILL.md`. `scripts/test-plugin.sh:16-26` geht alle Skills durch, also auch diesen. Test D in `test-update-skill.sh` macht einen Durchlauf am Testprojekt. |
| Fähigkeit 5 / S5 / Kriterium 8: Projektanweisung | covered | `foreman-project-mode/scripts/block-status.py` und `scripts/test-project-block.sh` (v0, ohne Version, fehlt, aktuell, neuer). Die Checklistenzeile steht in SKILL.md, Abschnitt 7. |
| Fixed decisions | eingehalten | Der Skill führt nichts selbst aus. Die Klassen stehen in einer JSON-Datei. Gemischte Dateien werden nur mit Diff gemeldet und angelegt, wenn sie fehlen (Test 12). Es werden keine Module hinzugefügt (Test 7). |
| Out of scope | eingehalten | Keine Änderung unter `dispatcher/`. `VERSION` bleibt 0.2.1 (`VERSION:1`), es gibt kein Release. |

## Ergebnis

**Established**
- Alle fünf Punkte aus R2 stehen im Code und haben Tests (Tests 14 und 15 sowie Test B im Skill-Test).
- Die 5 Fähigkeiten, die 8 Erfolgskriterien und S1–S5 sind abgedeckt. Die bekannten und akzeptierten Lücken laut Auftrag habe ich nicht erneut gemeldet.
- Keine neuen Befunde der Stufe medium oder höher.

**Unclear / not found**
- Ich habe keine Tests ausgeführt. Ob `test-all.sh` und `check-config.sh` grün sind, ist nicht von mir bestätigt.
- Dass Git `GIT_TEST_ASSUME_DIFFERENT_OWNER` beachtet (das gilt ab Git 2.35.2), habe ich nicht geprüft: der Aufruf von `git --version` wurde nicht erlaubt.
- Dass Git auf Deutsch tatsächlich „Kein Git-Repository“ ausgibt, habe ich nicht ausprobiert. Das kommt aus den Git-Übersetzungen, nicht aus einem Lauf.
