# Full worker report: val-C.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-attention

- [medium] scripts/update.py:236: Die Prüfung auf ungesicherte Änderungen läuft nur, wenn `<target>/.git` ein **Verzeichnis** ist. In einem git-Worktree oder Submodul ist `.git` eine Datei, auch in diesem Checkout (`ls -la .git` zeigt `-rw-r--r-- … .git`). Liegt das Ziel in einem Unterordner eines Repos, gibt es gar kein `.git`. In beiden Fällen entfällt die Prüfung still, und lokale Änderungen an foreman-eigenen Dateien werden überschrieben. Erfolgskriterium 6 ist damit nur für normale Repos erfüllt. `scripts/test-update.sh` Abschnitt 5 nutzt nur `git init` (`gitinit`), deckt diesen Fall also nicht ab.
- [medium] plugins/foreman/skills/foreman-update/SKILL.md:38-41: Der Auftrag ruft `./install.sh <project path>` auf, das Arbeitsverzeichnis ist also der foreman-Checkout. Schritt 3 `bash scripts/check-config.sh` läuft dann im foreman-Repo und nicht im Projekt. Belege: `scripts/check-config.sh:4` macht `cd "$(git rev-parse --show-toplevel || pwd)"`, und `scripts/check-config.sh` ist byte-gleich mit `template/scripts/check-config.sh` (`cmp` ohne Ausgabe). Die Prüfung ist dadurch grün, ohne dass das Projekt geprüft wurde. Der Test macht es richtig: `test-update.sh` Abschnitt 1 läuft mit `(cd "$d" && bash scripts/check-config.sh)`. Schritt 5 „Commit“ nennt das Repo ebenfalls nicht.
- [medium] scripts/test-update-skill.sh:43-65: Kriterium 7 verlangt „ein Durchlauf-Test am Testprojekt“. Den gibt es nicht, nur statische Textsuche. `^\d+\. ` ≥ 4 wird schon durch den nummerierten Code-Block des Auftrags (SKILL.md:38-43) erfüllt, auch ohne Checkliste. `\d+ min` ≥ 4 und „never“ irgendwo im Text sind ebenfalls immer erfüllbar. Ob die Checkliste aus den Upgrade-Abschnitten gebaut wird oder ob gleiche oder neuere Version richtig behandelt werden (STATE S4, Negativtests), prüft kein Test.
- [medium] scripts/update.py:232: `docs/requirements.md:68` verlangt für gemischte Dateien: „der Skill zeigt die Änderung und lässt den Menschen entscheiden“. Update und Skill melden nur den Dateinamen `keep X (mixed: merge by hand)`, ohne Diff und ohne gerenderte Template-Fassung. Die Template-Dateien enthalten aber `{{PROJECT}}` und weitere Platzhalter (`install.sh:103-106`). Der Mensch kann also nicht direkt zusammenführen. Bei Konflikt gelten die requirements vor dem Brief.
- [low] plugins/foreman/skills/foreman-update/SKILL.md:63-70: Fähigkeit 5 und Roadmap S5 sagen „ruft am Ende `foreman-project-mode` im Auffrischen-Modus auf“. Der Skill schreibt nur eine Checklistenzeile, aufgerufen wird nichts. Die Ausgaben `newer` (Exit 0) und `error:` (Exit 2) von `block-status.py` haben im Skill keine Zuordnung.
- [low] CHANGELOG.md:7-13: Unreleased → Upgrade hat anders als 0.2.1 und 0.2.0 keine Aufteilung in Files/Steps/Optional, obwohl der Skill in Schritt 2 danach gliedert. Es fehlt der Schritt „Dispatcher-Code auf dem Server aktualisieren“, obwohl alle drei M001-Änderungen in `dispatcher/dispatch.mjs` liegen (`docs/agent-reports/2026-11-21-M001.md:25-28`). Gefordert ist dieser Schritt in `docs/requirements.md:67`. Die Skill-Checkliste (SKILL.md:59) sagt nur „reload the config“. `test-changelog.sh` prüft nur, dass der Abschnitt nicht leer ist.
- [low] scripts/test-update.sh: Negativfälle aus der Tabelle „Mandatory questions“ (S3) fehlen: „Zieldatei ist Verzeichnis“ (Abschnitt 6 testet nur den umgekehrten Fall, Datei statt Verzeichnis), echte unbekannte Option (getestet sind nur `--modules`, `--force` und `--project`), `.foreman.json` als Symlink nach außen, „keine Schlüsseldateien gelesen“. Für Kriterium 3 („foreman-eigene Dateien entsprechen dem Template“) wird nur `scripts/lib/state.mjs` verglichen, nicht alle Dateien der Klasse.
- [low] scripts/update.py:242: Bei `git status --porcelain -z` steht bei einer Umbenennung der alte Pfad als eigener Eintrag ohne `XY `-Präfix. `e[3:]` schneidet dort drei Zeichen vom Pfadnamen ab. Betroffen ist nur die Meldung, der Abbruch passiert trotzdem.
- [low] docs/milestones/M006/STATE.md: Bei S4 steht `scripts/test-plugin.sh` unter Files, und die Prüfung heißt „erweitert um Inhaltsprüfung“. `scripts/test-plugin.sh` ist im Diff aber nicht geändert. Die Inhaltsprüfung steht in `scripts/test-update-skill.sh`.
- [low] VERSION (0.2.1) / scripts/update.py:141 und Bump-Logik: Solange `VERSION` 0.2.1 ist, ist ein 0.2.1-Projekt „gleich“. Das hat zwei Folgen. Erstens meldet der Skill (SKILL.md Schritt 1) „up to date“ und überspringt das Update, obwohl sich im Abschnitt Unreleased foreman-Dateien geändert haben. Zweitens kann UAT Flow A Schritt 3 („`version` neu“) vor dem Release nicht grün werden. Die Tests umgehen das mit `as_old` 0.1.9.
- [low] update-classes.json: Die Analysen F2/F3 zu Referenzprojekt 1 und Referenzprojekt 2, die laut Brief in die Klassen einfließen sollen, sind im Repo nicht zu finden (Grep nach Referenzprojekt 1/Referenzprojekt 2 in `docs/` findet keine Fix-Paket-Analyse). `scripts/autopilot-check.*` ist als foreman-eigen eingestuft, obwohl Referenzprojekt 2 ein abweichendes Prüfskript hat (`docs/requirements.md:50`). Ein committetes, angepasstes Prüfskript wird beim Update ohne Warnung ersetzt.

**Prüfungen**

| Kriterium | Test | Bewertung |
|---|---|---|
| 1 Klassen | test-update-classes.sh | Beweist es: genau eine Regel je Datei, keine Regel ohne Datei, Klassen der Projektdateien festgelegt. Vorher rot, weil die Datei fehlte. |
| 2 Upgrade-Abschnitte | test-changelog.sh | Beweist das Kriterium in der Form „nicht leer“ und prüft die drei Pflichtwörter. Die Struktur Files/Steps/Optional wird nicht geprüft. |
| 3 Anpassungen bleiben | test-update.sh §1 | `CLAUDE.md`, `config.toml` und `learnings.md` werden byte-gleich verglichen, `check-config.sh` läuft im Projekt. Bei den foreman-eigenen Dateien nur Stichprobe (`state.mjs`). |
| 4 Dry-Run / zweiter Lauf | §1, §2 | Hash über den ganzen Baum, „nothing to do“ bei 6 Modul-Kombinationen. |
| 5 Fehlerfälle | §3, §4, §6 | Fehlende oder kaputte `.foreman.json`, fehlendes `foreman`-Feld, 99.0.0, Symlink nach außen, Schreibfehler lässt `version` unverändert, erneuter Lauf stellt fertig. Exit 1 oder 2 wird beides akzeptiert. |
| 6 Ungesicherte Änderungen | §5 | Nur mit normalem `.git`-Verzeichnis. Worktree und Unterordner sind nicht abgedeckt (siehe medium). |
| 7 Skill | test-update-skill.sh, test-plugin.sh (generisch) | Plugin-Validierung grün. Kein Durchlauf-Test, die Asserts sind schwach (siehe medium). |
| 8 Block-Status | test-project-block.sh | Gut: v0, ohne Version, missing, leer, newer, zwei Blöcke, nicht geschlossen, fehlende Datei, anderes cwd. Exit-Codes und Texte passen zu SKILL.md:56 von foreman-project-mode. |
| Skill-Texte gegen Implementierung | SKILL.md ↔ update.py | Die Ausgabewörter `keep … (mixed: merge by hand)` und `--update --dry-run` stimmen überein. Der Aufruf von `check-config.sh` zeigt aufs falsche Repo. |
| M001-Verhaltensänderungen im Upgrade-Teil | CHANGELOG.md:9-13 | `pass_env`, `webhook_format`, `mainAutoMerge` und `--no-fetch` sind genannt. Der Schritt, den Dispatcher-Code zu aktualisieren, fehlt. |

---

**Established**
- `.git` ist in Worktrees eine Datei (hier belegt), und `update.py:236` prüft mit `isdir`. Die Prüfung auf ungesicherte Änderungen entfällt dort.
- Root- und Template-`check-config.sh` sind identisch und prüfen jeweils ihr eigenes Repo-Root. Der Auftrag im Skill führt sie im foreman-Checkout aus.
- `test-update-skill.sh` prüft nur Text, nichts wird ausgeführt.
- Update und Skill zeigen für gemischte Dateien keine Änderung, nur den Namen. Das widerspricht `docs/requirements.md:68`.
- `test-plugin.sh` ist unverändert und generisch. Die Angabe in STATE.md zu S4 stimmt nicht.
- `block-status.py`, die Doku in foreman-project-mode und `test-project-block.sh` stimmen überein.

**Unclear / not found**
- Ich habe keine Tests ausgeführt; ob `bash scripts/test-all.sh` grün ist, habe ich nicht geprüft. Grund: Die Tests legen temporäre Dateien an, und der Auftrag erlaubte nur Lesen.
- Die Analysen F2/F3 zu Referenzprojekt 1 und Referenzprojekt 2 habe ich im Repo nicht gefunden. Ob Referenzprojekt 2 oder Referenzprojekt 1 committete lokale Patches an foreman-eigenen Dateien haben, lässt sich hier nicht feststellen.
- Ob mit „gemischte werden nur gezeigt“ im Brief bewusst nur der Dateiname gemeint ist, also eine Lockerung der requirements, entscheidet Maintainer.
