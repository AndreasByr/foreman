Status: done · since 2026-11-21T17:35Z · UAT von Andreas freigegeben
Target: dev
Batch-branch: batch/m002
Lock: free
Tracker: -
Pretest-round: 0

# M002: Delegate-Wrapper sicher und sparsam

Start commit: e0d84d2

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Ein Gateway-Name (`FOREMAN_GATEWAY_KEY`, `FOREMAN_GATEWAY_URL`) | done | 35c3810 | docs/CONVENTIONS.md, plugins/foreman/skills/foreman-setup/references/{prerequisites,profiles-and-modules}.md, template/tools/delegate/{run_task.py,test_run_task.py,config.toml}, tools/delegate (Kopie), docs/learnings.md | |
| S2 | Limits: pro Minute/Stunde, Pause bei 429, Sperre nach 3, Obergrenze, Bericht | done | 968b99b | template/tools/delegate/{run_task.py,test_run_task.py,config.toml,README.md}, tools/delegate (Kopie) | |
| S3 | Zeitlimit je Rolle (`timeout`) | done | 2119a35 | template/tools/delegate/{run_task.py,test_run_task.py,config.toml,README.md}, tools/delegate (Kopie) | |
| S4 | Drei Regeln je an einer Stelle (Lint-Test) | done | c8ec48c | template/.claude/skills/foreman-delegation/SKILL.md, .claude/skills (Kopie), plugins/foreman/skills/{foreman-setup,foreman-orchestrator}, scripts/test-rules.py, scripts/test-all.sh, docs/learnings.md | |
| S5 | ChatGPT-Hinweis und Installer ohne `chatgpt/` ohne Zustimmung | done | 55c77f4 | gateway/README.md, gateway/litellm.config.example.yaml, gateway/litellm.chatgpt.example.yaml (neu), install.sh, scripts/test-install.sh, template/tools/delegate/{run_task.py,test_run_task.py,config.toml}, plugins/foreman/skills/foreman-setup/references/prerequisites.md, docs/MODULES.md | |
| R1-rules | Rework: Modell-ID-Regel überall nur einmal, Lint erkennt Wiederholungen mit einem Signaturwort | done | 8651cec | scripts/test-rules.py, plugins/foreman/skills/{foreman-project,foreman-setup}, docs/learnings.md | VALIDATION C H1, A F2 |
| R2-wrapper | Rework: Pause auch für Claude, Timeout geht direkt zum Fallback, Zähler „in Folge“, ChatGPT-Prüfung ohne Umgehung, Fallback nur Claude, Tests ohne Umgebungsabhängigkeit | done | 8651cec | template/tools/delegate/{run_task.py,test_run_task.py}, tools/delegate (Kopie), scripts/test-install.sh | VALIDATION A F1, B M1/M2/L1/L2, C M2-M6 |
| R3-docs | Rework: Stunden-Limit-Text, „one retry“, ChatGPT-Verweise, STATE ehrlich | done | 8651cec | template/tools/delegate/README.md, plugins/foreman/skills/foreman-setup/references/{delegation,prerequisites,profiles-and-modules}.md, docs/milestones/M002/STATE.md | VALIDATION A F5/F6/F8 |
| R4-round2 | Rework Runde 2: Timeout sperrt Anbieter für die Kette ohne falsche Pausenzeile, Claude-Pause auch bei späterem Fallback, Regel-Lint härter | done | 646ad52 | template/tools/delegate/{run_task.py,test_run_task.py}, tools/delegate (Kopie), scripts/test-rules.py, plugins/foreman/skills/{foreman-setup,foreman-orchestrator} | 2. Validierung N1, N2 |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Ein Claude-Worker bekommt weder `FOREMAN_GATEWAY_KEY`/`FOREMAN_GATEWAY_URL` noch `LLM_GATEWAY_KEY`/`LLM_GATEWAY_URL` in seine Umgebung, und kein Dokument nennt `LLM_GATEWAY_*` mehr. | `python3 template/tools/delegate/test_run_task.py` (test_gateway_names_not_in_claude_worker_env), `grep -rn LLM_GATEWAY` leer außer Testdatei/Learnings | automatic | none (no UI) |
| S2 | Bei simuliertem 429 pausiert der Wrapper wachsend (nach oben begrenzt), sperrt den Anbieter nach drei Fehlschlägen in Folge für den Rest des Laufs, fällt zurück, hält bei der Obergrenze für Aufrufe mit Bericht an und schreibt jede Sperre in den Bericht. | `python3 template/tools/delegate/test_run_task.py` (test_limits_*) | automatic | none |
| S3 | Eine Rolle mit eigenem `timeout` bricht nach diesem Wert ab; ohne Wert gilt `[defaults] timeout_seconds`; 0, negativ oder kein Integer wird mit Exit 2 abgelehnt. | `python3 template/tools/delegate/test_run_task.py` (test_timeout_*) | automatic | none |
| S4 | Jede der drei Regeln steht in den Repo-Skills genau einmal und in den Chat-Skills genau einmal; Begründungen stehen in `docs/learnings.md`. | `python3 scripts/test-rules.py` | automatic | none |
| S5 | Ohne `--chatgpt-via-gateway accepted-risk` installiert der Installer keine Datei mit `chatgpt/`-Ziel, und `validate_config` lehnt ein `chatgpt/`-Modell (auch als Fallback) ohne Zustimmung ab; `gateway/README.md` hat den Risikohinweis mit Alternativen. | `bash scripts/test-install.sh`, `python3 template/tools/delegate/test_run_task.py` (test_chatgpt_*) | automatic | none |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Nicht anwendbar, weil kein Mandant; Trennung Key↔Worker ist der Test selbst (Umgebung des Claude-Workers, nicht nur Doku). | Key unter altem und neuem Namen, URL-Variable, Key per `[gateway] api_key_env` auf anderen Namen gesetzt: nie im Worker. | Fehlt der Key, bleibt Fallback-Verhalten wie heute (Exit 3 ohne Fallback). | Neuer Name bricht Installationen mit `LLM_GATEWAY_*`; Hinweis in `docs/learnings.md`; der CHANGELOG-Eintrag entsteht beim Release aus den Berichten (`docs/versioning.md`). Keine Migration, keine neuen Dateien. |
| S2 | Nicht anwendbar, kein Mandant. Gateway-Key bleibt aus Claude-Worker-Umgebung (S1-Test läuft weiter grün). | Limits 0/negativ/unbekannte Schlüssel abgelehnt; Obergrenze 0 abgelehnt; wiederholter Aufruf nach Sperre im selben Lauf. | 429, Timeout, Server-Fehler, Netz weg (Fake-`claude`); Sperre gilt nur für den Lauf, nächster Aufruf startet frei; Obergrenze erreicht endet mit Bericht und Exit 1. | Neue Datei `tools/delegate/tasks/.limits.json` (Aufruf-Protokoll für Minute/Stunde, ignoriert über `tasks/*`); keine Migration; neue Config-Schlüssel optional mit Standardwerten. |
| S3 | Nicht anwendbar, kein Mandant. | `timeout` 0, negativ, Text, `true` je Rolle und global: Exit 2. | Worker hängt (Fake-`claude` schläft): Abbruch nach Rollen-Wert, Bericht nennt den Wert. | Keine neuen Dateien oder Variablen; `config.toml` und README dokumentieren den Schlüssel. |
| S4 | Nicht anwendbar, kein Mandant. | Lint schlägt an bei Regel 0× und bei Regel 2× in einem Skill-Satz. | Nicht anwendbar, weil reine Doku und Lint. | `scripts/test-all.sh` ruft den Lint; Repo-Kopie `.claude/skills` muss der Vorlage entsprechen (Lint prüft das). |
| S5 | Nicht anwendbar, kein Mandant; Zustimmung kommt vom Menschen per Flag. | Falscher Flag-Wert (`yes`, leer) wird abgelehnt; `chatgpt/` als Fallback ohne Zustimmung abgelehnt. | Nicht anwendbar, weil Installer und Config-Prüfung nur lokal arbeiten. | Neue Installer-Option `--chatgpt-via-gateway accepted-risk`; neue Datei `gateway/litellm.chatgpt.example.yaml` wird nur mit Flag kopiert; bestehende Installationen unverändert. |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

Keine. `bash scripts/test-all.sh` auf e0d84d2: Exit 0.

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- 2026-11-21T16:02Z · Split in S1 bis S5 (Reihenfolge wie Roadmap), Basislauf test-all grün · e0d84d2
- 2026-11-21T16:06Z · S1 fertig: Tests rot→grün, test-all Exit 0 · Commit 35c3810
- 2026-11-21T16:14Z · S2 fertig: 13 Tests rot→grün (25 gesamt), test-all Exit 0 · Commit 968b99b
- 2026-11-21T16:18Z · S3 fertig: 4 Tests rot→grün (30 gesamt), test-all Exit 0 · Commit 2119a35
- 2026-11-21T16:22Z · S4 fertig: Lint rot (10 Fehler)→grün, test-all Exit 0 · Commit c8ec48c
- 2026-11-21T16:27Z · S5 fertig: Tests rot→grün, test-all Exit 0 · Commit 55c77f4
- 2026-11-21T16:33Z · Validierung 1: A needs-attention, B needs-attention, C needs-remediation (H1) -> Gesamt needs-remediation; Rework R1-R3 geplant (Uhrzeiten oben aus git log korrigiert) · 55c77f4
- 2026-11-21T16:42Z · Rework R1-R3 fertig: 5 Tests und Lint rot→grün (39 Tests), test-all Exit 0 · Commit 8651cec
- 2026-11-21T16:46Z · Validierung 2: A, B, C je needs-attention (4 mittlere Befunde: falsche Pausenzeile nach Timeout, Timeout sperrt Kette nicht, Claude-Pause bei Fallback, Lint umgehbar) -> Rework R4 · 8651cec
- 2026-11-21T16:51Z · Rework R4 fertig: 2 Tests rot→grün (41 gesamt), Lint gehärtet, test-all Exit 0 · Commit 646ad52
- 2026-11-21T16:56Z · Validierung 3: A, B, C je needs-attention, nur 1 mittlerer Befund (STATE.md formal falsch, von der Sitzung selbst behoben); Rest low · 646ad52
- 2026-11-21T17:00Z · Nachprüfung pass, Endlauf aller Prüfungen Exit 0, VALIDATION.md und Abschlussbericht geschrieben · 610a4ae
- 2026-11-21T17:35Z · UAT M002 approved (Andreas, im Thread: „ja, uat passt“) · Merge a689250
