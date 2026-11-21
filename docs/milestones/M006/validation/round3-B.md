# Full worker report: val-B.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

- [low] scripts/update.py:255: Der Dirty-Check verwechselt ein kaputtes Repo noch mit "kein Repo". Wenn `.git` existiert, git es aber nicht lesen kann (z. B. eine `.git`-Datei, deren Haupt-Repo verschoben oder gelöscht wurde), endet git mit 128 und meldet `fatal: not a git repository: <gitdir>`. Laut Quelltext von git ist das genau dieser Text, ausprobiert habe ich es nicht. Das Skript nimmt dann `in_tree = False`, zeigt nur `note: not a git repository, local changes not checked` (Z. 287–288) und überschreibt foreman-eigene Dateien ohne Prüfung. Der OSError-Zweig (Z. 246–249) bricht bei vorhandenem `.git` dagegen ab. Dieselbe Prüfung im 128-Zweig fehlt. Das ist ein Rest des R2-Befunds und betrifft nur kaputte Repos.
- [low] scripts/update.py:317–319: Die Meldung "nothing to do" erscheint auch dann, wenn danach noch `version` gesetzt wird. `writes` zählt nur Dateiaktionen, `.foreman.json` wird aber trotzdem neu geschrieben (Z. 330–335). Test 14 ist genau dieser Fall: frische Installation, `0.2.1-rc1` → `0.2.1`, alle Dateien gleich. Er gibt "nothing to do" plus "done" aus und ändert die Version. Der Dry-Run meldet dasselbe, obwohl der echte Lauf eine Datei schreibt. Die Zeile mit der Version steht nur oben im Kopf (`0.2.1-rc1 -> 0.2.1`).
- [low] scripts/update.py:296–305: Für gemischte Dateien gibt das Skript bis zu 60 Diff-Zeilen aus, auch für `.claude/settings.json`. Steht dort ein `env`-Block mit Schlüsselwerten, landen sie im Klartext im Protokoll bzw. Transkript der Claude-Code-Session, die der Skill den Lauf ausführen lässt. Werte werden nicht maskiert. Eine `settings.json` im Repo sollte keine Schlüssel enthalten, das Risiko ist also gering. Mit dem Brief ("liest keine Schlüsseldateien") ist es aber nicht abgesichert.
- [low] scripts/update.py:268: Der Dirty-Check fragt `git status` ohne `--ignored` ab. Liegt eine foreman-eigene Datei im Projekt in `.gitignore` und ist lokal geändert, wird sie ohne Abbruch überschrieben. Das ist ein Randfall und durch keinen Test belegt.

Ergebnisse der Prüfpunkte:

| Prüfpunkt | Ergebnis | Beleg |
|---|---|---|
| R2: Git-Fehler ≠ kein Repo | erledigt, bis auf den Rest oben | update.py:251–259; test-update.sh Test 15 erwartet Exit 2 und "cannot check local changes" |
| R2: Pre-Release-Version wird angehoben | erledigt | `vtuple` (Z. 45) ignoriert den Suffix, `old != new` → bump (Z. 275); Test 14; VERSION = 0.2.1 |
| R2: Files-Zeile im CHANGELOG | erledigt | Unreleased sagt jetzt: "`dispatcher/dispatch.mjs` is not in the project; it is updated on the dispatcher machine" |
| R2: Auftragsblock sagt, wo was läuft | erledigt | foreman-update/SKILL.md, Auftragsblock: "Steps 1-2 run in the foreman checkout …, the rest after cd <project path>" |
| install.sh ohne `--update` | unverändert | `given` wird nur im Update-Zweig ausgewertet (install.sh:48–53); Hilfe `2,17p` deckt die neue Zeile 9 ab |
| Skip-Regeln update.py gegen install.sh | gleich | update.py:21–41 gegen install.sh:91–102 (scope docs, autopilot, pretest, AGENTS.md). Nur update.py überspringt `__pycache__`/`.pyc`, das ist harmlos |
| Rendering | gleich | dieselben 6 Platzhalter (install.sh:104–107, update.py:162–172); `SESSION_MODEL` kommt aus der `settings.json` des Projekts |
| Gateway-Dateien | gleich | installiert per `cp` ohne Rendering (install.sh:196–201), im Update erzwungen `foreman` und ungerendert (update.py:195–197) |
| Pfade bleiben im Zielordner | in Ordnung | `contained()` löst die tiefste vorhandene Pfadstelle per `realpath` auf und prüft jede Zieldatei sowie `.foreman.json` und `settings.json`; Tests 4 und 13 |
| Kein Schreiben bei Vorbedingungsfehler | in Ordnung | alle `die()`-Aufrufe vor Z. 320; Test 3 vergleicht den Hash des ganzen Baums |
| Dry-Run schreibt nichts | in Ordnung | Schreiben nur unter `if not dry` (Z. 320); Test 1 vergleicht den Hash |
| Version als letzter Schritt, nur Textersatz | in Ordnung | `re.subn` mit `count=1` und Gegenprüfung per JSON-Parse (Z. 276–283), geschrieben nach allen Dateien (Z. 330) |
| Gemischte Dateien | werden nie überschrieben | nur `create` oder `keep` (Z. 230–231), `keep` kommt nicht in `writes` |
| Ausführungsrechte | in Ordnung | vorhandene Rechte bleiben, das x-Bit der Vorlage kommt dazu (Z. 325), entzogen wird keins |
| Teilschreiben | bekannt und akzeptiert | Dateien atomar einzeln, Abbruch mit Exit 1, Version bleibt; Test 6 |

**Established**
- Die drei R2-Punkte sind im Code und in den Tests umgesetzt. Belege stehen in der Tabelle.
- Der Normalbetrieb von install.sh ist strukturell unverändert. Skip-Regeln und Rendering sind gleich wie bei der Installation.
- Gemischte und projekt-eigene Dateien schreibt das Update nur, wenn sie fehlen.

**Unclear / not found**
- Ich habe keine Tests ausgeführt. Sie legen Temp-Dateien an, und der Auftrag war nur lesen. Ein eigener Bash-Aufruf (git-Version, `ls gateway`) wurde zudem abgelehnt. Ob `test-all.sh` und `test-plugin.sh` grün sind, habe ich also nicht selbst geprüft.
- Test 15 braucht ein git, das `GIT_TEST_ASSUME_DIFFERENT_OWNER` kennt (ab etwa 2.35.2). Die git-Version in der Umgebung konnte ich nicht feststellen.
- Den genauen git-Text für eine kaputte `.git`-Datei habe ich aus dem Quelltext von git abgeleitet und nicht ausprobiert.
