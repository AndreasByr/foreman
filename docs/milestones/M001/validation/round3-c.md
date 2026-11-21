# Full worker report: m001-val-c.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

**Findings** (neu in Runde 3, alle niedrig)

| # | Severity | file:line | Was falsch ist | Beleg |
|---|---|---|---|---|
| 1 | low | `docs/agent-reports/2026-11-21-M001-R1.md:16` | Laut Tabelle belegt ein einziger roter Lauf R1-4 und R1-5 zusammen („`gitEnv is not a function`“). Die Tests laufen aber nacheinander und brechen beim ersten Fehler ab: `test-dispatch.mjs:525` `await fn()` ohne try. Der `gitEnv`-Test (`:449`) steht vor dem Redirect-Test (`:488`). Der Redirect-Test ist im roten Lauf also nie gelaufen. Rot ist für R1-5 damit nur logisch gezeigt, ein Lauf fehlt. | Reihenfolge der Tests `:449`, `:465`, `:488`. Im Stand `dd4d933` fehlte `redirect` im Fetch. Rot wäre der Test also gewesen, aufgezeichnet ist es nicht. |
| 2 | low | `docs/milestones/M001/STATE.md:1`, `:77` | Der Kopf sagt noch „Validierung Runde 2“, obwohl das Log schon R2 abgeschlossen hat (`:77`). Für den Commit R2 steht keine SHA in STATE. Er existiert als `a2dac01` (`.git/logs/HEAD:13`). | Grep nach `a2dac01` in `docs/` findet nichts. `ec00abf` steht nur in `M001-R1.md:20`. |
| 3 | low | `docs/agent-reports/2026-11-21-M001-R1.md:20`; `STATE.md:76-77` | Der Brief verlangt in der Verifikation `bash scripts/check-config.sh` grün (`M001-CONTEXT.md`, „Verification“). Nach R1 und R2 ist nur `test-all.sh` mit Exit 0 festgehalten. `check-config.sh` ist zuletzt bei S4 belegt (`S4.md:11`). Es ist nicht in `test-all.sh` eingebunden: `scripts/test-all.sh` ruft nur `test-check-config.sh` auf (`:14`). | Kein Eintrag mit `check-config.sh` nach `STATE.md:62`. |
| 4 | low | `STATE.md:57` gegenüber `M001-R1.md:22-25` | Die beiden Listen „bewusst offen“ stimmen nicht ganz überein. STATE nennt C5 (Dry-Run-Test wäre vorher grün gewesen), der R1-Bericht nicht. Der R1-Bericht nennt die Alias-Sperre in `fire-claude.example.sh`, STATE nicht. Inhaltlich ist beides abgedeckt, C5 steht in `S1.md:19-20`. | Zeilen wie angegeben. |

**Erfolgskriterien 1–6: rot vorher, grün jetzt, prüft der Test das Kriterium?**
1. **Fremder Token:** Erfüllt. `test-dispatch.mjs:244-263` (Prüfskript) und `:265-308` (`fire_command`) schreiben echte Umgebungs-Dumps und vergleichen die Variablennamen mit einer Whitelist.
   - Bei `fire_command` steht der Token in `process.env` (`:275`), wie es das Kriterium verlangt („im Dispatcher-Prozess“).
   - Dispatcher-Log (`:254`, `:283`) und `fire_command`-Logdateien (`:284-291`) werden jetzt durchsucht. Dry-Run und Webhook-Body prüft `:310-329`.
   - Rot ist belegt (`S1.md:10`). Dass Dry-Run und Webhook vorher schon grün waren, sagt der Bericht offen (`S1.md:19-20`).
   - Im Code: `dispatch.mjs:114` und `:160-161` nutzen `safeEnv`, `:51-59` lässt `PATH`/`HOME`/`LANG` nicht überschreiben.
2. **Webhook:** Erfüllt.
   - Exakte Bodies: `:369-380`.
   - `auto` nach Host, auch Subdomains: `:375-378`.
   - Definierter Fehler ohne URL für unbekannten Host, ungültige URL, http und unbekanntes Format: `:382-390`.
   - Lauf mit Exit 1, ohne POST und ohne URL im Log: `:420-426`.
   - Rot ist belegt (`S2.md:8`). Im Code: `dispatch.mjs:194-218`.
3. **`mainAutoMerge`:** Erfüllt.
   - Alle Nicht-Boolean-Werte zählen als `false`: `test-autopilot-check.mjs:121-127`.
   - Fenster und Überfälligkeit nur mit `true`, auch `"true"` als Text zählt nicht: `:129-141`, `:157-162`.
   - Offener PR läuft weiter (R1-1): `:143-155`. Catch-up und held: `:164-182`. `dev` unverändert: `:184-190`.
   - Rot ist belegt für S3 (`S3.md:10-11`) und R1-1 (`R1.md:15`). Die Fehlermeldung im R1-Bericht stimmt wörtlich mit `:148` überein.
   - Im Code: `lib/autopilot-check.mjs:30`, `:137-146`.
4. **`--no-fetch`:** Erfüllt.
   - Gleiche `TASK`-Zeilen, kein Fetch mit der Option, genau ein Fetch ohne: `test-autopilot-check.mjs:367-402`. Dieser Test war vorher schon grün, das sagt der Bericht ehrlich (`S4.md:10`).
   - `check-config` meldet ein Projekt ohne Unterstützung: Fall c (`test-check-config.sh:46-56`), rot belegt (`S4.md:8`). Code: `scripts/check-config.sh:33-36`.
5. **Trockenlauf mit `fire_command`:** Erfüllt.
   - „would start … via command“, kein Secret im Log, kein Zustand geschrieben: `test-dispatch.mjs:428-446`. Vorher schon grün, offen gesagt (`S5.md:12`).
   - Die Vorlage ist rot belegt, weil das Skript fehlte (`S5.md:8`).
   - Die Vorlage startet `claude -p --model`, lehnt Aliase ab und entfernt API-Keys (`fire-claude.example.sh:34-58`). Getestet in `test-fire-claude.sh:49-112`.
   - `claude_login` wird im Doku-Test geprüft (`test-dispatcher-docs.sh:57`).
6. **Doku:** Erfüllt.
   - `test-dispatcher-docs.sh:24-72` prüft README, MODULES, learnings, die Setup-Referenzen und dass die Skills nur die Regel tragen. Eingebunden in `test-all.sh:15`.
   - Skill-Texte nur mit der Regel: `foreman-fix/SKILL.md:72`, `batch-run.md:10`. Die Begründung steht in `docs/learnings.md:9`.

**Angaben in Berichten und STATE**
- Testzahlen: Heute 31 Tests in `test-dispatch.mjs` und 28 in `test-autopilot-check.mjs` (jeweils `^t(` gezählt). Das passt zu `STATE.md:77` und `R1.md:16-17`.
- SHAs: Die Slice-SHAs in `STATE.md:16-21` stimmen mit `.git/logs/HEAD:6-11` überein (`3b75d6c`, `efdf364`, `1b6a104`, `35d40fe`, `2d9e127`, `dd4d933`). R1 ist `ec00abf`, das passt zu `HEAD:12`.
- Veraltete Aussagen in den Slice-Berichten tragen jetzt einen Nachtrag: `S1.md:5`, `S3.md:5`.
- Nur-Mensch-Punkte sind alle offen: Roadmap `:107` und `:118-128` stehen auf `[ ]`. Es gibt kein `[x]` in `docs/milestones/M001/` oder in den M001-Berichten. UAT ist ausgewiesen in `S2.md:16` und `S5.md:18`.

**Frühere medium/high-Funde**

| Fund | Status | Beleg |
|---|---|---|
| R1 B1/C1: offener `main`-PR wurde nicht fortgesetzt | resolved | `lib/autopilot-check.mjs:138`, `:141`; Test `test-autopilot-check.mjs:143-155`; rot `R1.md:15` |
| R1 A1/C2: `foreman-setup` ohne Claude-Code-Weg | resolved | `prerequisites.md:13`, `:85`; `profiles-and-modules.md:46`; Test `test-dispatcher-docs.sh:53-54` |
| R1 B2: `FOREMAN_TZ` in `dispatcher.env` | resolved | `dispatcher.env.example:23-24`; Test `test-dispatcher-docs.sh:46-50`, `:61` |
| Runde 2 (nur low, C1–C6, A1–A3, B1–B2) | resolved | Rot-Nachweis R1 (`R1.md:13-20`); Nachträge in S1 und S3; git-Wrapper-Test `test-dispatch.mjs:465-486` liest jetzt `FOREMAN_TEST_MARKER` und `SSH_AUTH_SOCK`; Logdateien `:284-291`; Webhook-Status `dispatch.mjs:216` mit Test `:512-522`; `GITHUB_TOKEN` (`test-dispatcher-docs.sh:64`); SHAs in STATE |

---

**Established**
- Zu jedem der Kriterien 1–6 gibt es einen Test, der es inhaltlich prüft. Mindestens ein roter Lauf pro Kriterium steht mit Befehl und Exit-Code in den Berichten.
- Tests, die schon vorher grün waren (Teile von 1, 4 und 5), sind in den Berichten offen so ausgewiesen.
- Alle drei medium-Funde aus Runde 1 und die low-Funde aus Runde 2 sind im Code oder in der Doku behoben und mit Tests abgesichert.
- Testzahlen und SHAs in STATE und R1 stimmen mit den Dateien und mit `.git/logs/HEAD` überein. Ausnahme: die fehlende SHA für R2 (Finding 2).
- Nur-Mensch-Punkte sind nicht abgehakt.

**Unclear / not found**
- Ob die roten und grünen Läufe wirklich gelaufen sind, konnte ich nicht prüfen. Bash war gesperrt, ich habe nur auf Stimmigkeit geprüft.
- Ob `bash scripts/check-config.sh` auf dem heutigen Stand grün ist. Nach S4 gibt es keinen Nachweis.
- Ob der R1-5-Redirect-Test gegen `dd4d933` tatsächlich gelaufen ist. Logisch wäre er rot gewesen, belegt ist es nicht (Finding 1).
- Ob die lokalen Dateien unter `tools/delegate/tasks/` (`m001.diff`, round1/2) committed sind. `.gitignore:7` schließt sie aus, `git ls-files` konnte ich nicht ausführen. Sonst würde `check-config.sh:30-31` fehlschlagen.
