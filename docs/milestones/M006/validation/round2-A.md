# Full worker report: val-A.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

- [low] scripts/update.py:265: Ein Projekt mit Pre-Release-Version wird nie auf die Release-Nummer gehoben. `vtuple()` (update.py:45-49) wirft das Suffix weg, also gilt `0.2.1-rc1` als gleich `0.2.1` (VERSION ist `0.2.1`). Die Version wird nur bei `if vo < vn:` neu geschrieben, deshalb steht nach einem erfolgreichen Update weiter `"foreman": "0.2.1-rc1"` in `.foreman.json`. Test 14 (scripts/test-update.sh:236-243) prüft nur, dass der Lauf nicht mit „newer“ abbricht und Exit 0 hat, nicht die Version danach.
- [low] scripts/update.py:301-318: Scheitert ein Schreibvorgang mittendrin, endet das Skript mit `sys.exit(1)`, bevor die Liste `out` ausgegeben wird (`print` steht erst in Zeile 316). Der Mensch sieht dann nur die Fehlerzeile und nicht, welche Dateien schon ersetzt sind. `version` bleibt korrekt unverändert.
- [low] STATE.md (Kopfzeile und Log): `Status: in progress · … S1 offen` widerspricht der Slice-Tabelle, in der S1 bis S6 und R1 auf done stehen. Der Log-Eintrag „17:10Z Brief … geschrieben“ steht vor „16:59Z S1 done“, die Zeitstempel passen also nicht zur Reihenfolge.

## Prüfungen

Tests auszuführen wurde mir verweigert. Alles unten ist eine statische Prüfung der Quellen, und „covered“ heißt: Code und Test sind vorhanden, nicht dass sie grün gelaufen sind.

| Punkt | Status | Beleg |
|---|---|---|
| Fähigkeit 1 / S1 / Kriterium 1: Klassen | covered | update-classes.json hat nur foreman/project/mixed. scripts/test-update-classes.sh:92-116 prüft „genau eine Regel je Datei“ und „keine Regel ohne Datei“, :10-14 hält die Klassen der Projektdateien fest. update.py:182-187 liest die Klassen aus der JSON-Datei, sie stehen nicht im Code. |
| Fähigkeit 2 / S2 / Kriterium 2: Upgrade-Abschnitte | covered | CHANGELOG.md: Unreleased, 0.2.1, 0.2.0 und 0.1.0 haben je `### Upgrade`. Unreleased nennt `pass_env`, `webhook_format` und `mainAutoMerge`, passend zu docs/agent-reports/2026-11-21-M001.md, Abschnitt „Was sich … ändert“ (dort auch `GITHUB_TOKEN`, `FOREMAN_*`, Proxy). Test: scripts/test-changelog.sh, Teile 2, 3, 4b und 4c. |
| Fähigkeit 3 / S3: `--update`, `--dry-run`, Version zuletzt | covered | install.sh:45-53 ruft update.py auf und lässt neben `--update` nur `--dry-run` zu. update.py plant zuerst alle Vorbedingungen (bis :268) und schreibt danach; die Version wird zuletzt geschrieben (:308-313). |
| Kriterium 3: angepasste `CLAUDE.md`/`config.toml` byte-gleich, `check-config` grün | covered | test-update.sh:61-73: `cmp` gegen die gesicherten Dateien, `check-config.sh` läuft im Projekt. Dass alle foreman-Dateien der Vorlage entsprechen, ist indirekt bewiesen: Der zweite Lauf meldet „nothing to do“ (:75-77). |
| Kriterium 4: Dry-Run-Hash gleich, zweiter Lauf „nothing to do“ | covered | test-update.sh:52 und :74-77, dazu Test 2 mit 6 Modulsets (:79-93). |
| Kriterium 5: Fehlerfälle ohne Schreiben | covered | Nicht schreibbare Zieldatei: Test 6 (:150-161), Rerun stellt fertig. Kaputte, fehlende und neuere `.foreman.json` sowie fehlendes Ziel: Test 3 (:96-113). Pfad aus dem Ziel heraus: Test 4 (Verzeichnis-Symlink) und Test 13 (`.foreman.json`-Symlink). Ein Literal-Test für „nicht schreibbar“ fehlt, das ist akzeptiert. |
| Kriterium 6: ungesicherte Änderung bricht ab | covered | update.py:236-257 nutzt `rev-parse --is-inside-work-tree`, `GIT_OPTIONAL_LOCKS=0` und `--no-renames`. Tests 5, 9 (Worktree, `.git` ist eine Datei) und 10 (Unterordner). 5b: Eine ungesicherte Projektdatei blockiert nicht. |
| Role Review: keine Schlüsseldateien, `context`/`mirror` unverändert | covered | update.py liest nur die Zielpfade aus der Vorlage und `.claude/settings.json`. Die Version wird per Regex nur im Wert `"foreman"` ersetzt (:263). test-update.sh:67-72 vergleicht `.foreman.json` ohne `foreman`; install.sh:175-176 legt `context` und `mirror` an. |
| Fähigkeit 4 / S4 / Kriterium 7: Skill | covered | SKILL.md §1 vergleicht Versionen (inklusive „Projekt neuer“: Stopp), §2 listet die Änderungen aus `### Upgrade`, §4 schreibt den Auftrag (`cd <project path>` vor `check-config.sh`), §5 nimmt Module nur nach Ja auf, §6 ist die nummerierte Checkliste mit Minuten. scripts/test-plugin.sh validiert alle Skills generisch. test-update-skill.sh, Teil D: Durchlauf an einem Testprojekt mit dem Marker `(mixed: merge by hand)`. |
| Fähigkeit 5 / S5 / Kriterium 8: Projektanweisung | covered | block-status.py meldet missing/current/outdated/newer. test-project-block.sh: v0 und Block ohne Version ergeben „outdated“, kein Marker „missing“, aktueller Block „current“. SKILL.md §7 ruft `foreman-project-mode` im Refresh-Modus auf und enthält die Zeile „Project instructions up to date“. |
| Festlegung: gemischte Dateien nie überschreiben, Diff, fehlende anlegen | eingehalten | update.py:221-228 und :285-295 (Diff, maximal 60 Zeilen). Test 11 prüft den Diff, Test 12 das Anlegen. |
| Festlegung: keine Module hinzufügen | eingehalten | update.py nutzt nur `modules` aus `.foreman.json`. Test 7 (:164-174). |
| Festlegung: Update im Repo, Chat führt nicht aus | eingehalten | SKILL.md: Abschnitt Rules und §4 („run nothing yourself“). |
| Out of scope | eingehalten | Der Diff fasst weder `dispatcher/` noch VERSION oder plugin.json an. Downgrade bricht ab (update.py:144-145). Es gibt kein automatisches Zusammenführen. |
| Geteilte Dateien nur ergänzt | weitgehend | install.sh: neue Zeilen; geändert sind nur der Help-Bereich `2,16p` → `2,17p` und die Meldung in der Zeile `-*)`. MODULES.md und CHANGELOG.md sind nur ergänzt. test-install.sh ist unberührt. |
| R1-Punkte 1 bis 7 | bestätigt | wie oben belegt |

## Established
- Alle 5 Fähigkeiten, alle 8 Erfolgskriterien und S1 bis S5 haben Code und einen Test, der sie direkt oder indirekt abdeckt.
- Die Festlegungen und die Out-of-scope-Grenzen sind eingehalten.
- Die R1-Änderungen sind im Code vorhanden.
- Offen sind nur niedrige Punkte: Pre-Release wird nicht auf die Release-Nummer gehoben, die Liste fehlt beim Abbruch, die STATE.md-Kopfzeile ist veraltet.

## Unclear / not found
- Ob `bash scripts/test-all.sh` und `check-config.sh` grün sind: Ich durfte sie nicht ausführen.
- Ob `/plugin update` (SKILL.md §6, Punkt 1) ein echter Claude-Code-Befehl ist: Das konnte ich im Repo nicht belegen.
