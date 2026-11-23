# UAT 2026-11-23-post-merge-step · since 2026-11-23T10:20Z

Nur was dein Urteil oder ein echtes Projekt braucht.

- [ ] Regel lesen: `.claude/skills/foreman-delegation/SKILL.md`, Zeile "After-merge step". Passt sie für einen manuellen Thread, der auf dein "Go" mergt (Status in `STATE.md`, Mirror, `--check`, erst dann Thread zu)? Empfehlung: ja.
- [ ] Block v5 lesen (`plugins/foreman/skills/foreman-project-mode/references/instruction-block.md`, Punkt 5). Danach in diesem Projekt `foreman-project-mode` (Refresh) ausführen, 2 Min, damit v5 gilt. Empfehlung: ja.
- [ ] Entscheidung: `--check` meldet bei fehlenden Tracker-Zugangsdaten nur `SKIP` und endet mit 0. Die Regel verlangt "kein `SKIP`", hat aber keinen Ausweg, wenn die Session keine Zugangsdaten hat. Empfehlung: so lassen; die Session schreibt dann in den Bericht, dass der Mirror nicht lief. Ändern erst bei einem echten Fall.
- [ ] Entscheidung: Die Update-Warnung listet jedes unbekannte `.mjs`/`.sh`/`.py` in `scripts/` und `scripts/lib/` (außer `*.local.*`), auch eigene Projektskripte, max. 10 Zeilen. Zu laut? Empfehlung: so lassen, sie löscht nichts und die Meldung sagt, dass es Projektdateien sein können.
- [ ] Praxistest im Nutzerprojekt: `./install.sh <projekt> --update --dry-run` aus diesem Stand. Die alte Spiegel-Datei und `docs/fixpakete/` müssen in der Warnung stehen. Empfehlung: einmal laufen lassen, bevor du dort aufräumst.
- [ ] Praxistest im Nutzerprojekt: nach dem Update `node scripts/state-mirror.mjs --dry-run`. Passt der Client nicht, kommt jetzt sofort "tracker client lacks: ..." statt "is not a function". Empfehlung: ja, ein Lauf.

> Approve: tick every point, or add a line that reads exactly `UAT 2026-11-23-post-merge-step approved` at the start of a line, then commit and push.
