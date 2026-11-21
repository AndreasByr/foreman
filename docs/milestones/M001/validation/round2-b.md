# Full worker report: m001-val-b.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

**Findings (neu, Runde 2)**

| # | Severity | file:line | Was falsch ist | Beleg |
|---|---|---|---|---|
| 1 | low | `dispatcher/dispatch.mjs:215` | `notify` prüft die HTTP-Antwort des Webhooks nicht. Ein gelöschter oder widerrufener Discord-/Slack-Webhook (404) und ein abgelehnter Body (400) bleiben still: keine Log-Zeile. Die Zeile „webhook failed“ kommt nur, wenn `fetch` eine Exception wirft. Das war vorher schon so, ist aber genau die Lücke, die laut `docs/learnings.md` (Diff:792, „hid wrong URLs“) geschlossen werden sollte. | `await fetchImpl(req.url, {...})` ohne Auswertung von `res.ok` oder `res.status`. In `fireHttp` (`:101`) wird `res.ok` dagegen geprüft. |
| 2 | low | `template/scripts/autopilot-check.mjs:51` mit `template/scripts/lib/autopilot-check.mjs:137-141` | Die Rework-Regel R1-1 („offener PR läuft immer“) wirkt nur, wenn `GITHUB_TOKEN` per `pass_env` im Prüfskript ankommt. Früher wurde ein globaler `GITHUB_TOKEN` aus `dispatcher.env` vererbt. Fehlt er jetzt, ist `openPrs.main` immer `null`. Ein vom Menschen geöffneter `main`-PR mit langer CI wird dann bei `mainAutoMerge: false` nie fortgesetzt. Vor M001 startete das Fenster ihn wenigstens. Es gibt nur eine stderr-Notiz („check note“). | `if (!slug \|\| !process.env.GITHUB_TOKEN) { stderr(...); return prs; }`. `held = target === "main" && !s.mainAutoMerge && !open`. Der Upgrade-Hinweis in `docs/MODULES.md:25` sagt nur allgemein „variables must be listed in pass_env“ und nennt `GITHUB_TOKEN` nicht. `config.example.json:20` zeigt ihn immerhin. |
| 3 | low | `dispatcher/fire-claude.example.sh:40` | Die Alias-Sperre ist eine feste Liste. Andere Aliase wie `opus[1m]` oder `sonnet[1m]` und beliebige Fantasie-IDs gehen durch. Brief und Requirement verlangen eine „exakte Model-ID“. | `case`: nur `"<exact-model-id>"\|opus\|sonnet\|haiku\|opusplan\|default\|best`. |
| 4 | low | `dispatcher/fire-claude.example.sh:57` | `$FOREMAN_CLAUDE_FLAGS` ist absichtlich ohne Anführungszeichen, damit es in Wörter zerfällt. Dabei laufen aber auch Glob-Expansion im Projektverzeichnis und fehlendes Quoting mit: `--allowedTools "Bash(npm test)"` kommt mit wörtlichen Anführungszeichen in zwei Teilen an. Der Kommentar `:29` nennt nur die Worttrennung. Eine Injection ist das nicht, der Wert kommt vom Betreiber. | `claude -p --model "$FOREMAN_CLAUDE_MODEL" $FOREMAN_CLAUDE_FLAGS`, kein `set -f`. |
| 5 | low | `dispatcher/tests/test-dispatch.mjs:457` | Der Test „clones … with the dispatcher environment“ belegt nicht, dass `updateRepo` `gitEnv` benutzt. `FOREMAN_TEST_MARKER` wird gesetzt, aber nie geprüft. Ein lokaler Pfad-Clone klappt auch mit `safeEnv`. Fiele `updateRepo` auf die Basis-Umgebung zurück, bliebe der Test grün. Nur der Unit-Test von `gitEnv` (`:437ff`) hält R1-4. | Diff:606-614. Es gibt nur die Asserts `code === 0` und „clone exists“. |

**Geprüft ohne Fund**
- **Fremde Secrets an Kindprozesse:**
  - Das Prüfskript (`dispatch.mjs:160-161`) und `fire_command` (`:114`) bekommen nur `safeEnv`.
  - `FOREMAN_PROJECT/KIND/UNIT` werden nach dem Spread gesetzt. `pass_env` kann sie also nicht überschreiben, und auch PATH, HOME und LANG nicht (`:55`).
  - Nur git und ssh bekommen die volle Umgebung (`:128`). Das ist die bewusste Entscheidung R1-4. Der geklonte Repo-Inhalt kann darüber keinen Code ausführen, denn Hooks und Config werden nicht mitgeklont.
- **Log, Webhook-Text, Dry-Run:**
  - Alle Meldungen laufen über `say`, also über `redact` mit dem Token dieses Projekts, dem Deploy-Key und den `pass_env`-Werten (`:231-232`).
  - Die Webhook-URL steht nie im Fehlertext (`:185`, `:199`, `:204`) und wird bei Fetch-Fehlern redigiert (`:216`).
  - Die Dry-Run-Zeile (`:246`) enthält nur Kind, Unit, Info und den Fire-Weg.
- **`mainAutoMerge`:** Nur `a.mainAutoMerge === true` schaltet es ein (`lib:30`). Es gibt keinen Env-Override. Getestet sind `null`, `"true"`, `"yes"`, `1`, `0`, `{}` und `[]` (Diff:1112-1118).
- **dev-Batch und Regression gegenüber dem alten Code:**
  - Die alte Bedingung (Diff:1087) war: weiter, wenn `!open && !late && (!waiting \|\| (!window && !overdue))`.
  - Die neue (`lib:137-139`) ist für `dev` und für `main` mit `true` logisch gleich, weil dort `auto=true` gilt.
  - `mainBusy` und `lockedWaiting` sind unverändert (`:125-130`).
  - Ein Zweig mit `oldest` undefiniert ist nicht erreichbar, weil `trigger` dort `overdue` voraussetzt.
- **Webhook:**
  - `notify` fängt alles ab, es gibt keinen Absturz.
  - `redirect: "error"` ist gesetzt (`:215`) und getestet.
  - Unbekannter Host, Nicht-https und unbekanntes Format führen zu „webhook not used“, und der Exit-Code bleibt 1.
- **fire-claude.example.sh, Injection:**
  - Der Auftrag kommt nur über stdin (`"$(cat)"`, `printf '%s\n' "$ORDER"`), ohne `eval`.
  - Die Unit landet nur in einer Env-Variable. Der Log-Dateiname ist bereinigt (`dispatch.mjs:109`).
  - Der Dry-Modus gibt den Auftrag nicht aus.
- **Doku gegen Code:** `README.md:10`, `:17`, `:33`, `:45`, `MODULES.md:771-778`, `batch-run.md:9-10` und `foreman-fix/SKILL.md` passen zum aktuellen Code. Das gilt auch für die Open-PR-Regel.

**Round-1-Funde medium/high**

| Fund | Status | Beleg |
|---|---|---|
| B1 / C1 (medium): offener `main`-PR wurde ohne Flag nie fortgesetzt | **erledigt** (Einschränkung siehe Finding 2) | `lib/autopilot-check.mjs:137-138`: `trigger = open \|\| (auto && …)`. `held` gilt nur bei `!open` (`:141`). Test „an open PR is continued with default settings“ (Diff:1134-1146). Der alte Test „only with mainAutoMerge true“ ist weg. Passt zu `batch-run.md:9` und `STATE.md:29`. |
| A1 / C2 (medium): `foreman-setup` kannte den Claude-Code-Weg nicht | **erledigt** | `prerequisites.md:13`, `:85`; `profiles-and-modules.md:46`; abgesichert durch `test-dispatcher-docs.sh` (Diff:1020-1021) |
| B2 (medium): `FOREMAN_TZ` in `dispatcher.env` wirkt nicht mehr | **erledigt** (Doku) | `dispatcher.env.example:22-24` mit dem `pass_env`-Beispiel; `docs/MODULES.md:25` mit Upgrade-Hinweis; Test gegen `# FOREMAN_TZ=` (Diff:1012-1017) |

Round-1-low, kurz:
- A3 / B3 (git-Umgebung) ist mit `gitEnv` erledigt (`dispatch.mjs:127-131`). Der Integrationstest ist schwach, siehe Finding 5.
- B5 (Redirects) ist erledigt (`:215`).
- A2 / B6 / B4 / C5 stehen in STATE als bewusst offen.
- A4 ist weiter offen und nicht als akzeptiert aufgeführt: Das Log echter Läufe wird verworfen (`test-dispatch.mjs:251`, `:277`, `log: () => {}`). Es bleibt low.

---

**Established**
- Das Prüfskript und `fire_command` können keine fremden Projekt-Secrets sehen. Log, Webhook und Dry-Run werden mit den Secrets des eigenen Projekts redigiert (`dispatch.mjs:51-59`, `:114`, `:160`, `:231-232`).
- Die Batch-Logik für `dev` und für `main` mit `true` ist gleich dem alten Code. Ohne Flag läuft `main` nur noch bei offenem PR oder Catch-up an, und im Catch-up-Fall nennt der Auftrag nur die Catch-up-Units (`lib:137-146`).
- `gitEnv` gibt git die volle Dispatcher-Umgebung, mit `GIT_TERMINAL_PROMPT=0` und `GIT_SSH_COMMAND` nur bei gesetztem Key. Die Eingabe-Umgebung wird nicht verändert.
- Der Webhook folgt keinen Redirects und stürzt nicht ab. Ob die HTTP-Antwort ein Fehler war, prüft er nicht (Finding 1).
- Alle drei Round-1-Funde mit medium sind im Code oder in der Doku umgesetzt.

**Unclear / not found**
- Ich habe keine Tests ausgeführt. Die grünen Läufe kenne ich nur aus `STATE.md:70-77`.
- Ob die echten Projekte auf myweby `GITHUB_TOKEN` in `pass_env` haben, weiß ich nicht. Davon hängt ab, ob Finding 2 im Betrieb zuschlägt. Die Server-Konfiguration liegt nicht im Repo.
- Laut `requirements.md:26` soll `pass_env` beim lokalen Lauf über `ssh` projekteigene Variablen durchreichen. Umgesetzt und dokumentiert ist, dass das über ssh nicht geht; die Werte stehen stattdessen im Startskript (`learnings.md`, Diff:794; `README.md:32`). Ob das als erfüllt gilt, ist eine Produktfrage.
- Ob Node `fetch` mit `redirect: "error"` eine Fehlermeldung ohne URL liefert, habe ich nur durch Lesen geprüft. Der Test simuliert die Exception selbst (`test-dispatch.mjs`, Diff:628-638).
