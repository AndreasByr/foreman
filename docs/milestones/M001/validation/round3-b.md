# Full worker report: m001-val-b.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

**Findings**

| Schwere | file:line | Was falsch ist | Beleg |
|---|---|---|---|
| low | `template/.claude/skills/foreman-dispatch-run/SKILL.md:18`, `template/.claude/skills/foreman-dispatch-run/references/batch-run.md:18` | Der Code hält `main` ohne Freigabe zurück. Der Text, den der Work-Run ausführt, übernimmt diese Ausnahme aber nur in der Liste „When“, nicht beim Einstieg und nicht in den Schritten. `SKILL.md:18` sagt weiter pauschal „`awaiting-merge` in a merge window … batch run“. `batch-run.md:18` sagt „Run the batch PR flow … for all `awaiting-merge` units together“. Szenario: `mainAutoMerge` ist false, kein offener PR. Einheit C hat der Mensch schon nach `main` gemergt (Catch-up), Einheit W wartet, und es ist Fensterstunde. Der Task trägt korrekt nur `Units: C`. Ein Work-Run, der Schritt 2 wörtlich nimmt, könnte W trotzdem in einen `main`-PR nehmen und mergen. Der Code macht seinen Teil richtig, das Risiko hängt am Lesen des Modells, deshalb nur low. | `lib/autopilot-check.mjs:141` (`held`) und `:146` (`units: held ? late : …`). Nur `batch-run.md:10` nennt die `main`-Ausnahme, und zwar unter „When“. `SKILL.md` ist nicht im Diff. |

**Selbst im Code geprüft, ohne Fund**
- **Prüfskript und `fire_command`:**
  - Beide bekommen nur `safeEnv` (`dispatch.mjs:160`, `:114`).
  - `FOREMAN_*` wird nach dem Spread gesetzt, `pass_env` kann es also nicht überschreiben. `PATH`, `HOME`, `LANG`, leere und ungültige Namen werden ignoriert (`:55`).
  - `dispatch.sh:7` exportiert `dispatcher.env` komplett. Der Test mit `process.env` deckt genau diesen Fall ab (Diff:433-435).
- **Logs:**
  - Alles läuft über `say`, also über `redact` mit dem eigenen Token, dem Deploy-Key und den `pass_env`-Werten (`:232-233`).
  - Der Dry-Run gibt nur kind, unit, info und den Fire-Weg aus (`:247`).
  - Die Webhook-URL steht in keiner Fehlermeldung (`:185`, `:199`, `:204`). Bei Fetch-Fehlern wird sie redigiert (`:217`).
  - Ein 4xx/5xx wird nur mit dem Status geloggt (`:216`).
- **`gitEnv`:** git bekommt die volle Dispatcher-Umgebung plus `GIT_TERMINAL_PROMPT=0`. `GIT_SSH_COMMAND` kommt nur dazu, wenn ein Key gesetzt ist (`:127-131`, `:142`). Der Test prüft die Umgebung über einen git-Wrapper, `FOREMAN_TEST_MARKER` wird jetzt wirklich abgefragt (Diff:641-643).
- **Redirect:** `redirect: "error"` ist gesetzt (`:215`) und getestet (Diff:655).
- **`mainAutoMerge`:** Wird nur als `a.mainAutoMerge === true` gelesen (`lib:30`). Es gibt keinen Env-Override (Grep im Repo).
- **Regression `dev`:** Die alte Bedingung (`!open && !late && (!waiting || (!window && !overdue))`) ist für `dev` und für `main` mit `true` logisch gleich der neuen (`lib:137-139`). `mainBusy` und `lockedWaiting` sind unverändert (`:125-130`). Der `oldest`-Zweig (`:145`) ist nur erreichbar, wenn `overdue` gilt.
- **Regel für offene PRs:** `trigger = open || …` (`:138`). `held` greift nur ohne offenen PR (`:141`). Das passt zu `batch-run.md:9`.
- **`fire-claude.example.sh`:**
  - Der Auftrag kommt nur über stdin und `printf '%s\n'`, es gibt kein `eval`.
  - Der Dry-Modus gibt den Auftrag nicht aus.
  - API-Keys werden mit `unset` entfernt.
  - Der Log-Dateiname aus der Unit wird bereinigt (`dispatch.mjs:109`).
- **Doku gegen Code:** `dispatcher/README.md`, `docs/MODULES.md` (Upgrade-Hinweis mit `FOREMAN_TZ`, Proxy und `GITHUB_TOKEN`), `dispatcher.env.example` und `config.example.json:17-21` (`GITHUB_TOKEN` in `pass_env`) stimmen mit dem Code überein.

**Frühere Funde (medium/high, Runde 1)**
- B1/C1, offener `main`-PR wurde ohne Flag nie fortgesetzt: **resolved**. Beleg: `lib:138`, `:141`; Test `test-autopilot-check.mjs` „an open PR is continued with default settings“ (Diff:1183-1195); Nachtrag in `S3.md`.
- A1/C2, `foreman-setup` kannte den Claude-Code-Weg nicht: **resolved**. Beleg: `prerequisites.md:13`, `:85`; `profiles-and-modules.md:46`; `test-dispatcher-docs.sh:63-64`.
- B2, `FOREMAN_TZ` aus `dispatcher.env` wirkte still nicht mehr: **resolved**. Beleg: `dispatcher.env.example` (Hinweis auf `pass_env`, keine Zeile `# FOREMAN_TZ=` mehr); `MODULES.md` Upgrade-Hinweis; Test (Diff:1056-1060).

**Frühere Funde (low, Runde 2, nicht als bewusst offen geführt)**
- Webhook-Status wurde nicht geloggt: **resolved** (`:216`, Test Diff:671-681).
- Test der git-Umgebung zu schwach: **resolved** (Diff:640-643).
- Log echter Läufe nicht geprüft (A4/C5): **resolved**. Das Log des Prüfskript-Laufs wird geprüft (Diff:413), dazu das `fire_command`-Log und die Logdateien (Diff:442-450).
- Veraltete Testkommentare: **resolved**. Grep auf „not implemented“ und „must fail“ findet nichts.
- S1- und S3-Bericht veraltet: **resolved** (Nachtrag R1 in beiden).
- SHAs fehlten: **resolved** (`STATE.md`, Spalte „Commit“).
- `GITHUB_TOKEN`-Hinweis fehlte: **resolved** (`MODULES.md`).
- Quoting von `FOREMAN_CLAUDE_FLAGS`: **resolved** (Kommentar in `fire-claude.example.sh`, Test in `test-dispatcher-docs.sh:77`).

---

**Established**
- Fremde Projekt-Secrets erreichen weder das Prüfskript noch `fire_command`. Log, Webhook-Body und Dry-Run-Ausgabe werden redigiert.
- git bekommt absichtlich die volle Umgebung (R1-4).
- `mainAutoMerge` zählt nur als Boolean `true`.
- Die Batch-Logik für `dev` verhält sich wie vorher.
- Ein offener `main`-PR läuft immer weiter. Ein zurückgehaltener Catch-up nennt nur die Catch-up-Units.
- Alle früheren Funde mit medium sind im Code oder in der Doku erledigt.

**Unclear / not found**
- Testläufe habe ich nicht selbst ausgeführt. Die Rot-grün-Nachweise kenne ich nur aus `M001-R1.md` und den Slice-Berichten, und dort sind sie stimmig. Ein Bash-Aufruf für `git diff`/`git log` wurde abgelehnt. Ob `m001.diff` exakt `HEAD` entspricht, habe ich deshalb nur stichprobenartig am aktuellen `dispatch.mjs` und `lib/autopilot-check.mjs` geprüft. Dort deckt er sich.
- Ob ein Work-Run im Catch-up-Szenario W tatsächlich mitnimmt, hängt davon ab, wie das Modell die Anweisungen liest. Das lässt sich statisch nicht belegen (siehe Finding).
- `requirements.md:26` sagt, dass `pass_env` beim Lauf über ssh Variablen durchreicht. Umgesetzt und dokumentiert ist das Gegenteil: Die Werte stehen im Startskript. Ob das als erfüllt gilt, ist eine Produktfrage und nicht meine.
- Ob auf myweby bisher eine Webhook-URL läuft, die weder auf Discord noch auf Slack zeigt, weiß ich nicht. Mit `auto` würde sie jetzt nur noch „webhook not used“ loggen. Das Verhalten ist dokumentiert.
