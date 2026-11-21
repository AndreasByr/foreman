# Full worker report: m001-val-c.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-attention

Ich finde keine Abweichung im Code von den Erfolgskriterien 1–6. Es fehlen aber Nachweise: Für die Nacharbeit R1 gibt es keinen roten Lauf mit Befehl und Exit-Code, und zwei Slice-Berichte widersprechen dem heutigen Code.

**Findings**

| # | Severity | file:line | Was falsch ist | Beleg |
|---|---|---|---|---|
| 1 | low | `docs/milestones/M001/STATE.md:51,77` | Die Rework-Tabelle behauptet für R1-1 „Test zuerst rot“. Im Log steht für R1 aber nur `test-all exit 0`. Es gibt weder einen roten Lauf (Befehl, Exit-Code) noch einen Bericht. Das betrifft auch R1-4 und R1-5, deren Tests laut Kommentar zuerst fehlschlagen sollten. | `docs/agent-reports/` enthält nur S1–S6 (Glob), keinen R1-Bericht. Die Testkommentare `dispatcher/tests/test-dispatch.mjs:436` („must fail“) sind die einzige Spur. Nach Logik wäre der Test `template/scripts/test-autopilot-check.mjs:143` gegen den Stand von Runde 1 rot gewesen, denn dort brauchte `open` noch `auto`. Ein Lauf dazu ist aber nirgends festgehalten. |
| 2 | low | `docs/agent-reports/2026-11-21-M001-S3.md:3` | Der Bericht sagt, dass ohne Freigabe auch „wegen eines offenen PR“ kein Batch für `main` startet. Das gilt seit R1-1 nicht mehr. | `template/scripts/lib/autopilot-check.mjs:135-138`: `trigger = open \|\| …`. Der Test `test-autopilot-check.mjs:143-155` fordert einen Task für einen offenen `main`-PR mit Standard-Einstellungen. |
| 3 | low | `docs/agent-reports/2026-11-21-M001-S1.md:3` | Der Bericht sagt, dass auch die git-Aufrufe nur `PATH`, `HOME`, `LANG` und `pass_env` bekommen. Das gilt seit R1-4 nicht mehr. | `dispatcher/dispatch.mjs:127-131,142`: `gitEnv` übernimmt die ganze Dispatcher-Umgebung. |
| 4 | low | `dispatcher/tests/test-dispatch.mjs:453-461` | Der Test heißt „…with the dispatcher environment“, prüft das aber nicht. `FOREMAN_TEST_MARKER` wird gesetzt und nie gelesen. Ein Klon aus einem lokalen Pfad gelingt auch mit der Basis-Umgebung, also wäre der Test auch auf dem Stand von Runde 1 grün gewesen. Dass `updateRepo` wirklich `gitEnv` nutzt (R1-4), ist ungetestet. Getestet ist nur die Funktion allein (`:437-451`). | `dispatch.mjs:142` wird von keinem Test auf die Umgebung geprüft. |
| 5 | low | `dispatcher/tests/test-dispatch.mjs:251,277` | Kriterium 1 verlangt, dass der fremde Token in keiner Ausgabe auftaucht. In den echten Läufen (kein Dry-Run) wird das Log verworfen (`log: () => {}`). Die Logdatei von `fire_command` unter `<workdir>/logs/` wird nicht durchsucht. Das ist Fund A4 / C5 (erster Teil) aus Runde 1. Er ist weder behoben noch in der Rework-Tabelle als bewusst offen geführt. Die Zeile „offen“ (`STATE.md:57`) nennt zu C5 nur den Dry-Run-Aspekt. | Siehe die Zeilen. Praktisch ist ein Leck unwahrscheinlich, weil `safeEnv` den Token gar nicht an die Kindprozesse gibt. |
| 6 | low | `docs/milestones/M001/STATE.md:16-21,70-77`; alle Berichte | Kein Bericht und keine Log-Zeile nennt eine SHA, nur „committed as M001 Sx“. Einzige Ausnahme ist S1 mit `305ceff` für den roten Lauf. | Die Commits gibt es, laut `.git/logs/HEAD:6-12`: S1 `3b75d6c`, S2 `efdf364`, S3 `1b6a104`, S4 `35d40fe`, S5 `2d9e127`, S6 `dd4d933`, R1 `ec00abf`. In STATE und den Berichten fehlen sie. |

**Runde-1-Funde (medium/high)**

Behoben:
- **R1-1 (B1, C1), offener `main`-PR:** `lib/autopilot-check.mjs:137-141`. Ein offener PR löst den Batch immer aus, `held` greift nur ohne offenen PR. Der Test `test-autopilot-check.mjs:143-155` deckt den Fall mit und ohne wartende Einheit ab. `batch-run.md` Punkt 1 und 2 (`m001.diff:1043-1045`) und `dispatcher/README.md` (`m001.diff:45`) sind jetzt stimmig. Der Nachweis für „zuerst rot“ fehlt (Finding 1).
- **R1-2 (A1, C2), `foreman-setup`:** `prerequisites.md` (`m001.diff:820,829`) und `profiles-and-modules.md` (`m001.diff:841`) nennen `fire-claude.example.sh`. Geprüft wird das in `scripts/test-dispatcher-docs.sh` (`m001.diff:1020-1021`).
- **R1-3 (B2), `FOREMAN_TZ`:** `dispatcher/dispatcher.env.example:22-24` zeigt kein globales `# FOREMAN_TZ=` mehr. Den Upgrade-Hinweis gibt es in `docs/MODULES.md` (`m001.diff:778`). Geprüft wird das in `test-dispatcher-docs.sh:45-50,61`.

Nicht behoben: kein medium- oder high-Fund offen.

Niedrige Funde aus Runde 1, mit Blick auf die Nachweise geprüft:
- **C3 (Files-Spalte):** korrigiert, `STATE.md:18-19`.
- **C4 (CHANGELOG im Prüfplan):** korrigiert, `STATE.md:32,45`.
- **C6 (forbid nur ein Wort):** erweitert, `test-dispatcher-docs.sh:65-66` prüft auch `batch-run.md`.
- **C7 (`claude_login`):** jetzt geprüft, `:57`.
- **C5 (Dry-Run-Test wäre vorher grün gewesen):** im S1-Bericht vermerkt (`S1.md:17-18`).

**Kriterien 1–6: Test rot vorher, grün nachher, prüft er das Kriterium?**
1. **Fremder Token:** Die Tests `test-dispatch.mjs:244-261` und `:263-296` machen echte Umgebungs-Dumps mit einer Whitelist von Variablennamen. In `:273` steht der Token in `process.env`. Gegen 28eab3e wären beide rot gewesen. Dort bekam das Prüfskript `{...env}` und `fire_command` die ganze `process.env`, so steht es in Runde-1-Bericht C. Der Rotlauf ist belegt (`S1.md:8`). Die Lücke in der Log-Ausgabe beschreibt Finding 5.
2. **Webhook:** `:357-414` prüft die exakten Bodies, die Wahl von `auto` nach Host, den definierten Fehler ohne URL und den echten Lauf mit Exit 1 ohne POST. Der Rotlauf ist belegt (`S2.md:8`). Eine ungültige URL wird nur auf Einheitenebene geprüft (`:374-376`), dieselbe Fehlerbehandlung gilt aber über `notify` (`dispatch.mjs:211`).
3. **`mainAutoMerge`:** `test-autopilot-check.mjs:121-141,157-190` prüft `null`, `"true"`, `1`, `0`, `{}` und `[]`, jeweils mit Fenster und Überfälligkeit. Der Rotlauf ist belegt (`S3.md:8`). Die Prüfung läuft auf Ebene von `tasks()`, nicht über die Textzeile `TASK|batch|batch:main`.
4. **`--no-fetch`:** `:367-402` war schon vorher grün, das steht offen in `S4.md:10`. Für `check-config` war Fall c rot (`S4.md:8`, `m001.diff:933-943`).
5. **Trockenlauf mit `fire_command`:** `test-dispatch.mjs:416-434` war schon vorher grün (`S5.md:12`). `test-fire-claude.sh` war rot, weil das Skript fehlte (`S5.md:8`).
6. **Doku und Learnings:** `test-dispatcher-docs.sh` war rot (`S6.md:8`). Es ist in `test-all.sh` eingebunden (`m001.diff:876-879`).

**Nur für Menschen**

Alle bleiben offen: Roadmap `:107,118-128`. In `docs/milestones/M001/` gibt es kein `[x]` (Grep). `S2.md:16` und `S5.md:18` führen den echten Lauf als UAT.

---

**Established**
- Der Code entspricht den Kriterien 1–6. Belege: `dispatch.mjs:51-59,114,142,161,194-216,246`; `lib/autopilot-check.mjs:30,137-146`; `scripts/check-config.sh:33-36`.
- Die drei medium-Funde aus Runde 1 (R1-1, R1-2, R1-3) sind im Code beziehungsweise in der Doku behoben und mit Tests oder Doku-Checks abgesichert.
- Die Testzahlen heute: `test-dispatch.mjs` hat 30 Tests, `test-autopilot-check.mjs` hat 28. Laut Log waren es bei S5 26 und bei S4 27. Die Differenz passt zu den neuen R1-Tests (`:437,453,463,475` und `:143`).
- Die Commits S1–S6 und R1 gibt es in `.git/logs/HEAD:6-12`.
- Die Punkte, die nur Menschen prüfen können, sind nicht abgehakt.

**Unclear / not found**
- Ob die roten Läufe und `test-all.sh` wirklich gelaufen sind. Ich konnte nur lesen, Bash wurde abgelehnt. Grün habe ich nicht selbst geprüft.
- Ob der R1-1-Test gegen `dd4d933` tatsächlich rot war. Logisch ja, aufgezeichnet ist es nicht.
- Ob der tatsächliche myweby-Patch dem übernommenen Verhalten entspricht. Der Patch liegt nicht im Repo.
