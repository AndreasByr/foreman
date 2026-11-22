# Full worker report: m001-val-a.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-attention

Fast alles aus dem Brief ist abgedeckt, im Code und in Tests. Eine Teilanforderung aus `docs/requirements.md:26` ist nicht umgesetzt (Finding 1). Deshalb kein pass.

**Findings**

| # | Severity | file:line | Was falsch ist | Beleg |
|---|---|---|---|---|
| 1 | medium | `plugins/foreman/skills/foreman-setup/references/prerequisites.md:13`, `:85`; `profiles-and-modules.md:43` | `docs/requirements.md:26` verlangt: „`foreman-setup` und `docs/MODULES.md` führen ihn als Variante für Claude Code ohne Cloud-Routine“. Nur `docs/MODULES.md` wurde ergänzt. `foreman-setup` nennt `fire_command` weiter nur für „Other agents“ bzw. OpenCode. | Der Diff (`tools/delegate/tasks/m001.diff`) enthält keine Datei unter `plugins/foreman/skills/foreman-setup/`. Die Roadmap ordnet den Punkt weder M001 (S5, `roadmap-0.2.x.md:88`) noch M003 zu. Laut Konfliktregel requirements > roadmap > Brief ist er damit offen. |
| 2 | low | `scripts/check-config.sh:33-36` (gleich in `template/scripts/check-config.sh:33-36`) | Die Prüfung „Projekt kann `--no-fetch` nicht“ sucht nur den Text `--no-fetch` in `scripts/autopilot-check.*`. Ein Skript, das die Option nur im Kommentar nennt und sie trotzdem ablehnt, bekommt keine Warnung. | `grep -qs -- '--no-fetch' "${ap[@]}"`. `scripts/test-check-config.sh` testet nur Fälle, in denen der Text vorkommt (b, d) oder ganz fehlt (c). |
| 3 | low | `dispatcher/dispatch.mjs:132` | Auch `git` im `updateRepo` bekommt jetzt nur noch `PATH`/`HOME`/`LANG`. Verlangt war die Begrenzung nur für Prüfskript und Befehl. Wer ohne `deploy_key_env` mit ssh-agent klont, verliert `SSH_AUTH_SOCK`. Ein Test dafür fehlt, ein Upgrade-Hinweis auch. | `const e = { ...safeEnv(env, {}), GIT_TERMINAL_PROMPT: "0" };`. `docs/MODULES.md` (Upgrade note, Diff-Zeile 702) nennt nur Prüfskript und `main`. |
| 4 | low | `dispatcher/tests/test-dispatch.mjs:244`, `:263` | Erfolgskriterium 1 sagt „in keiner Ausgabe“. In den echten Läufen (kein Dry-Run) wird das Dispatcher-Log verworfen (`log: () => {}`) und nicht auf den fremden Token geprüft. Geprüft werden nur Umgebung, Dry-Run-Log und Webhook-Body. Der „zweite Projekt“-Token ist nur eine Variable in `env` und kein zweiter Eintrag in der Konfiguration. | Testcode an Diff-Zeile 379 und 405. Praktisch ist ein Leck unwahrscheinlich, weil die Kindprozesse den Token nicht bekommen. |
| 5 | low | `docs/milestones/M001/STATE.md:18-19`, `:32` vs. `:63` | STATE nennt Dateien, die nicht geändert wurden oder nicht existieren, und widerspricht sich beim CHANGELOG. | S3 nennt „template .foreman.json“, eine solche Datei gibt es nicht (Glob `template/.foreman*.json`: keine Treffer). S4 nennt `template/scripts/autopilot-check.mjs`, die Datei ist nicht im Diff (`--no-fetch` stand dort schon vorher, `:92`). Der Prüfplan S6 sagt „CHANGELOG ergänzt“, das Log sagt „CHANGELOG bewusst nicht angefasst“. |

**Abdeckung je Anforderung**

| Anforderung | Status | Code | Test |
|---|---|---|---|
| Brief F1 / Req `:43`: Prüfskript sieht nur PATH, HOME, LANG und `pass_env` | covered | `dispatch.mjs:49-58`, `:151`; `fire_command` `:114` | `test-dispatch.mjs:218-242`, `:244`, `:263` |
| Rolle: `pass_env` überschreibt keine Pflichtvariable, leerer Name wird ignoriert | covered | `dispatch.mjs:54` (Check auf SAFE_BASE_VARS und ENV_NAME) | `test-dispatch.mjs:228` |
| Brief F2 / Req `:25`: Discord/Slack über `webhook_format`, Doku und env.example nennen beide | covered | `dispatch.mjs:172-196`; `config.example.json:5`; `dispatcher.env.example` (Diff 208-209) | `test-dispatch.mjs:357`, `:387` |
| SC2: `auto` wählt nach Host; unbekannter Host oder ungültige URL gibt definierten Fehler ohne Absturz | covered | `dispatch.mjs:176`, `:195`, `:202` (notify fängt den Fehler) | `test-dispatch.mjs:370`, `:408` |
| Brief F3 / Req `:48` / SC3: `mainAutoMerge`, Standard false; null und Text gelten als false | covered | `lib/autopilot-check.mjs:30`, `:136-140`; `foreman-fix/SKILL.md:73`; `batch-run.md:10` | `test-autopilot-check.mjs:121`, `:129`, `:143`, `:154`, `:163`, `:175` |
| Brief F4 / Req `:50` / SC4: Vorlage kann `--no-fetch`, gleiche TASK-Zeilen, kein Fetch; `check-config` meldet fehlende Unterstützung | covered (Heuristik, siehe Finding 2) | `template/scripts/autopilot-check.mjs:92` (schon vorher da); `scripts/check-config.sh:33-36` | `test-autopilot-check.mjs:358`; `scripts/test-check-config.sh` Fälle a–d |
| Brief F5 / Req `:26`: Startskript-Vorlage mit `ssh`, `claude -p`, exakter Model-ID, `claude_login = "inherit"` | covered | `fire-claude.example.sh` (Diff 219-275: Alias-Sperre, `unset ANTHROPIC_API_KEY`, `claude -p --model`); `README.md:20-34`; `template/tools/delegate/config.toml:20` | `dispatcher/tests/test-fire-claude.sh` a–f |
| Req `:26`: `foreman-setup` führt die Variante | **missing** | – | – (Finding 1) |
| SC5: Dry-Run zeigt „would start … via command“, 0 Secrets im Log | covered (automatisch; der Lauf auf Host 1 ist UAT) | `dispatch.mjs:236` | `test-dispatch.mjs:416` |
| SC6: MODULES und README nennen die 4 Begriffe; Begründungen in `learnings.md`; Skills enthalten nur die Regel | covered | `docs/MODULES.md:18-25`; `README.md:10`, `:18`, `:20`, `:73`; `docs/learnings.md:7-10` | `scripts/test-dispatcher-docs.sh` (inkl. `forbid outward-facing` im Skill) |
| Fixed: Verhalten des Host 1-Patches übernehmen, nicht den Patch selbst | nicht prüfbar | – | – |
| Fixed: zuerst ein roter Test | belegt nur durch die Berichte | `agent-reports/…-S1…S6.md:8` (jeweils „Rot vorher“, Exit 1); S4 vermerkt, dass `--no-fetch` schon vorher ging | – |
| Fixed: Dispatcher bleibt modellfrei | covered | `dispatch.mjs` ruft kein Modell auf; `claude -p` läuft nur im kopierten Startskript | – |
| Out of scope: keine Überwachung von `fire_command`, keine Merge-Fenster-Fragen (M004), keine Update-Meldung (M007), keine Änderungen an Project A/B/C | eingehalten | Der Diff enthält dafür nichts; `README.md:33` sagt ausdrücklich „does not watch the run“ | – |

---

**Established**
- Die Umgebungsbegrenzung gilt für Prüfskript, `fire_command` und git (`dispatch.mjs:114`, `:132`, `:151`) und ist mit env-Dumps getestet.
- Das Webhook-Format ist mit exakten Bodies und Fehlerfällen getestet. Die URL erscheint nicht im Log (`dispatch.mjs:202`, `:206`).
- Für `mainAutoMerge` zählt nur das boolesche `true`. Der Catch-up läuft für `main` weiter und nennt nur die Catch-up-Einheiten (`lib/autopilot-check.mjs:136-140`).
- `--no-fetch` gab es in der Vorlage schon vor M001. Neu sind der Test, der die TASK-Zeilen vergleicht, und die Warnung in `check-config.sh`.
- `test-all.sh` ruft jetzt `test-fire-claude.sh`, `test-check-config.sh` und `test-dispatcher-docs.sh` auf (Diff 765-768).
- `foreman-setup` wurde in M001 nicht angefasst.

**Unclear / not found**
- Ob das Verhalten des lokalen Patches auf Host 1 genau übernommen wurde: Der Patch liegt nicht im Repo.
- Ob die roten Läufe wirklich stattgefunden haben: Dafür gibt es nur die Berichte. Ich habe keine Tests ausgeführt, weil Bash hier nur eingeschränkt verfügbar war, also ist auch nicht bestätigt, dass `test-all.sh` grün ist.
- Ob der `foreman-setup`-Teil aus `requirements.md:26` bewusst in einen späteren Milestone verschoben wurde: Die Roadmap sagt dazu nichts.
- Ob ein Projekt ohne `deploy_key_env` mit ssh-agent klont und deshalb von Finding 3 betroffen ist: Die Konfigurationen auf Host 1 habe ich nicht gesehen.
