# Full worker report: m001-val-a.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

**Findings** (neu in Runde 2, alle niedrig)

| # | Severity | file:line | Was falsch ist | Beleg |
|---|---|---|---|---|
| 1 | low | `dispatcher/tests/test-dispatch.mjs:251`, `:277` | Round-1-Fund A4 ist weder behoben noch als „bewusst offen“ eingetragen. Erfolgskriterium 1 verlangt „taucht in keiner Ausgabe auf“. Bei echten Läufen verwirft der Test das Dispatcher-Log (`log: () => {}`). Die `fire_command`-Logdatei in `<workdir>/logs/` (`dispatch.mjs:109`) wird nie auf den fremden Token durchsucht. | Die Rework-Tabelle `STATE.md:51-57` nennt A4 weder bei R1-6 („A5, C3, C4, C6, C7, B3“) noch in der Zeile „offen“ („A2, B6, B4, C5“). |
| 2 | low | `dispatcher/dispatch.mjs:215` | `notify` wertet die Webhook-Antwort nicht aus. Antwortet der Webhook mit 4xx/5xx, entsteht keine Log-Zeile. Der STATE-Plan S2 verlangt aber: „Webhook antwortet nicht oder mit Fehler: Log-Zeile“ (`STATE.md:41`). | `await fetchImpl(req.url, {...})`, danach keine Prüfung von `res.ok`. Geloggt wird nur eine Exception (`:216`). Das alte Verhalten war gleich (`m001.diff:202`). |
| 3 | low | `dispatcher/tests/test-dispatch.mjs:453-461` | Der Test heißt „clones … with the dispatcher environment“, prüft aber die Umgebung nicht. `FOREMAN_TEST_MARKER` wird gesetzt und nie gelesen. Würde `updateRepo` wieder `safeEnv` statt `gitEnv` nutzen, bliebe der Test grün, weil der lokale Origin weder SSH noch Proxy braucht. Abgesichert ist R1-4 damit nur auf Unit-Ebene (`:437-451`). | `dispatch.mjs:142` nutzt `gitEnv`. Am Lauf selbst prüft das keine Assertion. |
| 4 | low | `dispatcher/tests/test-dispatch.mjs:319`, `:436` | Zwei veraltete Kommentare: „webhookRequest is not implemented yet, so these tests must fail“ und „gitEnv is not implemented yet, so the first test must fail“. Beide Funktionen existieren (`dispatch.mjs:127`, `:194`). | Der Kommentartext widerspricht dem aktuellen Code. |

**Round-1-Funde medium/high**

| Fund | Status | Beleg |
|---|---|---|
| B1 / C1 (medium): offener `main`-PR ohne `mainAutoMerge` wurde nie fortgesetzt | resolved | `lib/autopilot-check.mjs:137-138`: `trigger = open \|\| (auto && …)`. `held` nur ohne offenen PR (`:141`). Test `test-autopilot-check.mjs:143-155` (mit und ohne wartende Einheit). `batch-run.md:9-10` stimmt jetzt mit dem Code überein. |
| A1 / C2 (medium): `foreman-setup` kannte den Claude-Code-Weg per `fire_command` nicht (Req `:26`) | resolved | `foreman-setup/references/prerequisites.md:13`, `:85`; `profiles-and-modules.md:46`. Test `scripts/test-dispatcher-docs.sh:53-54`. |
| B2 (medium): `FOREMAN_TZ` in `dispatcher.env` wirkte still nicht mehr | resolved | `dispatcher.env.example:22-24` (kein `# FOREMAN_TZ=` mehr, Hinweis auf `pass_env` und `.foreman.json`). Upgrade-Hinweis in `docs/MODULES.md:25`. Test `test-dispatcher-docs.sh:46-50`, `:61`. |

Low-Funde aus Runde 1, kurz geprüft:
- A3/B3 (git-Umgebung): behoben über `dispatch.mjs:127-131`, `:142`. Der SSH-Hinweis für `fire_command` steht in `README.md:31`.
- B5 (Weiterleitungen): behoben über `redirect: "error"` in `:215`, Test `:463-473`.
- C6 (Begründungen in Skills): `batch-run.md` wird jetzt geprüft (`test-dispatcher-docs.sh:65-66`).
- C7 (`claude_login` nicht geprüft): jetzt geprüft (`test-dispatcher-docs.sh:57`).
- A5/C3/C4 (STATE-Angaben): korrigiert (`STATE.md:18-19`, `:32`, `:45`).
- A2/B6/B4/C5: bewusst offen laut `STATE.md:57`, hier nicht wiederholt.

**Abdeckung je Anforderung**

| Anforderung | Status | Code | Test |
|---|---|---|---|
| F1 / Req `:43`: Prüfskript sieht nur PATH, HOME, LANG und `pass_env` | covered | `dispatch.mjs:49-59`, `:160-161`; `fire_command` `:114` | `test-dispatch.mjs:218-242`, `:244-261`, `:263-296` |
| Rolle: `pass_env` überschreibt keine Pflichtvariable | covered | `dispatch.mjs:55` | `test-dispatch.mjs:228-232` |
| F2 / Req `:25`: `webhook_format` discord/slack/auto, Doku und env.example nennen beide | covered | `dispatch.mjs:178-207`; `config.example.json:5`; `dispatcher.env.example:16-17` | `test-dispatch.mjs:357-368`, `:387-406`; Doku `test-dispatcher-docs.sh:43` |
| SC2: unbekannter Host oder ungültige URL gibt definierten Fehler, kein Absturz | covered | `dispatch.mjs:185`, `:199`, `:204`, `:211` | `test-dispatch.mjs:370-378`, `:408-414`, `:475-485` |
| F3 / Req `:48` / SC3: `mainAutoMerge`, Standard false, `null` und Text gelten als false; `foreman-fix` nennt die Regel | covered | `lib/autopilot-check.mjs:30`, `:135-146`; `foreman-fix/SKILL.md:72`; `batch-run.md:10` | `test-autopilot-check.mjs:121-190`; `test-dispatcher-docs.sh:39` |
| F4 / Req `:50` / SC4: `--no-fetch`, gleiche TASK-Zeilen, kein Fetch; `check-config` meldet fehlende Unterstützung | covered (Text-Heuristik, akzeptiert) | `template/scripts/autopilot-check.mjs:92`; `scripts/check-config.sh:33-36`, identisch in `template/scripts/check-config.sh:33-36` | `test-autopilot-check.mjs:367-402`; `scripts/test-check-config.sh` a–d (testet nur die Kopie unter `scripts/`) |
| F5 / Req `:26`: Startskript-Vorlage (ssh, `claude -p`, exakte Model-ID, `claude_login = "inherit"`), MODULES und foreman-setup | covered | `fire-claude.example.sh:8`, `:28`, `:37-42`, `:57`; `README.md:18-33`; `template/tools/delegate/config.toml:20`; `MODULES.md:22` | `dispatcher/tests/test-fire-claude.sh` a–f; `test-dispatcher-docs.sh:24-31`, `:53-58` |
| SC1: fremder Token in keiner Ausgabe | partial | Umgebung, Dry-Run-Log und Webhook-Body sind geprüft | `test-dispatch.mjs:298-317`; echte Läufe ohne Log-Prüfung (Finding 1) |
| SC5: Dry-Run „would start … via command“, 0 Secrets im Log | covered (automatisch; der Lauf auf myweby ist UAT) | `dispatch.mjs:246` | `test-dispatch.mjs:416-434` |
| SC6: MODULES und README nennen die 4 Begriffe, Begründungen in learnings, Skills nur die Regel | covered | `MODULES.md:18-25`; `README.md:10`, `:15-16`, `:18-33`, `:76`; `learnings.md:7-10` | `test-dispatcher-docs.sh` (ganz) |
| Fest: Dispatcher bleibt modellfrei | covered | `dispatch.mjs` hat keinen Modellaufruf; `claude -p` läuft nur im kopierten Startskript | – |
| Fest: Verhalten des myweby-Patches übernehmen | nicht prüfbar | der Patch liegt nicht im Repo | – |
| Fest: zuerst ein roter Test | nur indirekt belegt | Kommentare `test-dispatch.mjs:319`, `:436` und die Slice-Berichte | – |
| Verifikation: `test-all.sh` enthält die neuen Tests | covered | `scripts/test-all.sh:8`, `:11-15` | – |
| Out of scope: keine Überwachung von `fire_command`, keine Merge-Fenster-Fragen (M004), keine Update-Meldung (M007), nichts an Guildora/Kasev/Office | eingehalten | Die Dateiliste des Diffs (`m001.diff`, 19 Dateien) enthält nichts davon; `README.md:32` sagt „does not watch the run“ | – |

---

**Established**
- Alle drei Round-1-Funde der Stufe medium sind im Code und in den Doku-Tests behoben (siehe Tabelle oben).
- Prüfskript und `fire_command` bekommen nur `safeEnv`. git bekommt bewusst die volle Dispatcher-Umgebung (`dispatch.mjs:142`), was die Anforderung, die nur das Prüfskript betrifft, nicht verletzt.
- Für `mainAutoMerge` zählt nur das boolesche `true`. Ein offener PR und der Catch-up laufen immer, `dev` bleibt unverändert.
- Out-of-scope-Punkte wurden nicht gebaut.
- Neu, aber nur niedrig: A4 wurde ohne Eintrag in STATE stillschweigend fallengelassen. Nicht-2xx-Antworten des Webhooks werden nicht geloggt. Test `:453` prüft nicht, was sein Name verspricht. Zwei Testkommentare sind veraltet.

**Unclear / not found**
- Ob die Tests grün sind: nicht selbst ausgeführt, Bash war gesperrt. Das Grün stammt nur aus `STATE.md:70-77`.
- Ob die roten Läufe vor jedem Fix stattgefunden haben: nur durch Berichte und Testkommentare belegt.
- Ob der myweby-Patch genau so übernommen wurde: Der Patch liegt nicht im Repo.
- Ob `template/scripts/check-config.sh` byte-gleich mit `scripts/check-config.sh` ist: Ich habe nur Zeile 2, 34 und 35 per Grep verglichen. Der Test prüft nur die Kopie unter `scripts/`.
