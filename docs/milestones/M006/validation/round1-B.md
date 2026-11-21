# Full worker report: val-B.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-remediation

- [medium] scripts/update.py:236: Die Prüfung auf ungesicherte Änderungen läuft nur, wenn `<target>/.git` ein **Verzeichnis** ist (`os.path.isdir(os.path.join(target, ".git"))`). In einem git-Worktree oder Submodul ist `.git` eine Datei, und in einem Unterordner eines Monorepos gibt es gar kein `.git`. In allen drei Fällen fällt die Prüfung still weg, und lokale Patches an foreman-eigenen Dateien werden ohne Abbruch überschrieben. Beleg: In diesem Checkout ist `/home/user/wt-batch-m006/.git` eine 56-Byte-Datei (`ls -la .git` → `-rw-r--r-- … .git`). Erfolgskriterium 6 und das Risiko aus dem Brief („lokale Patches, zum Beispiel auf myweby“) sind damit für Worktree-Setups nicht erfüllt. `scripts/test-update.sh` Teil 5 prüft nur ein normales `git init` (`gitinit`), deshalb bleibt die Lücke grün. Vorschlag: `git -C target rev-parse --is-inside-work-tree` statt `isdir`, dazu ein Testfall mit `git worktree add`.
- [low] scripts/update.py:236: Ohne git-Repo gibt es keine Dirty-Prüfung und auch keinen Hinweis, foreman-Dateien werden einfach ersetzt. Beleg: `scripts/test-update.sh` Teil 1 (Fall „k“) nutzt git, die Teile 4, 6 und 8 nutzen `mkdir` ohne git und schreiben ohne Rückfrage. Eine Ausgabezeile „no git: local changes not checked“ fehlt.
- [low] scripts/update.py:228-229: Gemischte Dateien werden geschrieben, wenn sie fehlen (`action = "create" if not exists`). Die feste Entscheidung im Brief sagt „werden nie geschrieben, nur gemeldet“, `docs/MODULES.md:72` sagt „never changed“. Ein Projekt, das zum Beispiel `CLAUDE.md` oder `.claude/settings.json` bewusst entfernt hat, bekommt sie zurück. Bestehende Inhalte gehen dabei nicht verloren, aber Brief und Code widersprechen sich. Das muss entschieden und dokumentiert werden.
- [low] scripts/update.py:16-17,199-201: Die Gateway-Dateien `tools/gateway/README.md` und `litellm.config.example.yaml` sind fest im Skript als `foreman` eingestuft und stehen nicht in `update-classes.json`. Der Brief legt fest: „Die Klassenliste ist eine Datei im Repo, keine Logik im Skript.“ `scripts/test-update-classes.sh` prüft nur `template/` und erfasst diese Dateien nicht.
- [low] scripts/update.py:160-167 vs install.sh:103-105: Unterschiedliches Rendering. `install.sh` ersetzt mit `sed`, dort steht `&` im Ersatztext für den Treffer und `|` bricht ab. `update.py` ersetzt wörtlich. Bei einem `--name` mit `&` meldet der erste Update-Lauf `update` für `.claude/skills/foreman-delegation/SKILL.md` und `docs/routines/*.md`, in denen `{{PROJECT_NAME}}` vorkommt. Das ist harmlos, denn es korrigiert eher, verletzt aber in diesem Fall „Install → Update = nichts zu tun“. Ungetestet.
- [low] scripts/update.py:69-80,277-279: Neue Dateien bekommen fest 0644 oder 0755, ohne die umask. `install.sh` (`render > dst`, `chmod +x`) hält die umask ein. Bestehende Dateien behalten ihren Modus plus die x-Bits der Quelle (Zeile 277). Das passt.
- [low] scripts/update.py:236-241: `git status` darf `.git/index` auffrischen, auch im `--dry-run`. `tree_hash` lässt `.git` aus, deshalb ist Test 4 grün. Streng genommen ist das trotzdem ein Schreibvorgang. Abhilfe: `GIT_OPTIONAL_LOCKS=0`.
- [low] scripts/update.py:182-201: Dateien, die aus `template/` verschwunden sind, oder Dateien eines abgeschalteten Moduls werden nie entfernt und auch nicht gemeldet. Veraltete foreman-Dateien bleiben im Projekt liegen. Weder der Brief noch `CHANGELOG.md` beschreiben diesen Fall.
- [low] VERSION:1 (`0.2.1`) und plugins/foreman/skills/foreman-update/SKILL.md:16: Solange „Unreleased“ nicht freigegeben ist, bleibt `version` nach dem Update auf `0.2.1`. Der Skill sagt dann bei gleicher Version „up to date“, obwohl die Unreleased-Änderungen fehlen. Bis zum Release ist das so gewollt, sollte aber im Skill oder im UAT-Hinweis stehen.
- [low] STATE.md (Zeile S4): Dort steht als geänderte Datei `scripts/test-plugin.sh`, im Prüfplan „erweitert um Inhaltsprüfung“. Laut Diff ist `scripts/test-plugin.sh` unverändert. Die Inhaltsprüfung liegt in der neuen Datei `scripts/test-update-skill.sh`. Die Plugin-Validierung erfasst `foreman-update` trotzdem, weil `test-plugin.sh:16-24` über alle Skills läuft.
- [low] scripts/test-update-skill.sh: Kriterium 7 verlangt „Durchlauf-Test am Testprojekt“. Der Test prüft nur statisch Textstellen in `SKILL.md`, er führt keinen Lauf an einem Projekt aus.

**Prüfungen**

| Prüfpunkt | Ergebnis | Beleg |
|---|---|---|
| `install.sh` ohne `--update` | unverändert, nur ergänzt | install.sh:25-29 sammelt `given` und ergänzt den `--update`-Zweig. Hilfe 2,17 passt zur neuen Zeile 9. Der Rest verläuft wie vorher. |
| Andere Optionen bei `--update` | werden abgelehnt (Exit 2) | install.sh:48, Test 3 (`--modules`, `--force`, `--project`) |
| Vorbedingungsfehler schreiben nichts | ok | update.py: alle `die()` stehen vor Zeile 274. Planung, Containment, Dirty-Check und der Bump-Text sind fertig, bevor geschrieben wird. |
| Dry-run schreibt nichts | ok (bis auf git-Index, siehe oben) | update.py:274 `if not dry` |
| Pfad-Containment (Symlink, `..`) | ok | `contained()` löst das tiefste existierende Pfadstück auf (auch dangling Symlinks). `rel` stammt aus `os.walk` und kann kein `..` enthalten. Test 4 deckt das ab. |
| Datei-Symlink im Ziel | Ziel im Ordner: `os.replace` ersetzt den Link durch eine Datei. Ziel außerhalb: Abbruch. | update.py:52-60,76 |
| Version zuletzt und als Text | ok | update.py:283-288. Regex `count=1`, danach Kontrolle über `json.loads(...)["foreman"]`. `context` und `mirror` bleiben byte-gleich. |
| Gemischte Dateien | werden nie überschrieben, aber angelegt, wenn sie fehlen | update.py:228-229 |
| Skip-Regeln vs `install.sh skip_file` | inhaltlich gleich | update.py:20-23,31-40 vs install.sh:90-101 |
| Gateway | wie `install.sh`: ungerendert, nur mit Modul `gateway` | update.py:199-201,212 vs install.sh:195-200 |
| Schreibabbruch | Version bleibt, Teilschreibvorgänge möglich, Neustart stellt fertig | update.py:276-282, Test 6 |
| Secrets | Liest nur `.foreman.json`, `.claude/settings.json` (`model`) und Zielpfade aus dem Template, keine Ausgabe von Werten | update.py:145-155 |
| Nebenläufigkeit | keine Sperre, Schreiben atomar je Datei (`mkstemp` + `os.replace`) | update.py:69-80 |
| `test-all.sh` | alle 6 neuen Tests eingetragen | scripts/test-all.sh:16-21 |

**Established**
- Die Dirty-Prüfung hängt an `os.path.isdir(target/.git)` und fällt in Worktrees, Submodulen und Monorepo-Unterordnern still weg (`scripts/update.py:236`, `.git` ist hier eine Datei).
- Im Erfolgsfall wird die Version zuletzt und rein textuell geschrieben, Vorbedingungsfehler schreiben nichts, der Dry-run schreibt keine Projektdateien.
- Die Skip-Regeln stimmen inhaltlich mit `install.sh` überein. Der Installpfad ohne `--update` ist nur ergänzt.
- Gemischte Dateien werden nie überschrieben, aber angelegt, wenn sie fehlen.

**Unclear / not found**
- Ich habe `bash scripts/test-all.sh` und `check-config.sh` nicht ausgeführt, weil beide in temporäre Ordner schreiben und dieser Review nur lesen durfte. Ob sie grün sind, habe ich also nicht selbst geprüft.
- Ob `.foreman.json` aus 0.1.0 immer den Schlüssel `"foreman"` hat, habe ich nicht geprüft. Der 0.2.0-Upgrade-Hinweis geht davon aus, dass er fehlen kann.
- Ob die Fix-Pack-Analysen F2/F3 (Guildora, Kasev) im Repo liegen und in die Klassen eingeflossen sind, habe ich nicht gefunden und nicht geprüft.
