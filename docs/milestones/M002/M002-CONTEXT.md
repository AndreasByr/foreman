# Milestone M002: Delegate-Wrapper sicher und sparsam

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** B · Delegate · **Parallel to:** M001, M003, M006, M008, M011

## Goal
Worker-Aufrufe halten Anbieter-Limits ein und erzeugen keine Schleife aus Fehlversuchen. Gateway-Keys erreichen keinen Claude-Worker. Die Regeln zu Modell-IDs, Schlüsseldateien, `.claude/` und ChatGPT sind eindeutig und stehen je an einer Stelle.

## Starting point
foreman 0.2.1. `tools/delegate/run_task.py` (~33 KB) mit Tests in `tools/delegate/test_run_task.py`, Rollen und Modelle in `tools/delegate/config.toml`, Gateway-Doku in `gateway/README.md`. Der Gateway-Key heißt heute uneinheitlich `FOREMAN_GATEWAY_KEY` (Konventionen, README, `config.toml`, `work-run.md`) und `LLM_GATEWAY_KEY`/`LLM_GATEWAY_URL` (Setup-Referenzen). Die Sperrliste in `run_task.py` kennt nur `LLM_GATEWAY_KEY`.

## Capabilities
1. Ein einziger Name für Gateway-Key und -URL überall; kein Claude-Worker bekommt ihn.
2. Anbieter-Limits: Anfragen pro Minute und pro Stunde je Anbieter, wachsende Pause bei 429, Sperre nach drei Fehlschlägen in Folge für den Rest des Laufs, Fallback, Obergrenze für Aufrufe pro Lauf; jede Sperre steht im Lauf-Bericht.
3. Zeitlimit je Rolle (`timeout`), globaler Wert als Standard.
4. Drei Regeln stehen in Repo- und Chat-Skills je genau einmal: Modell-IDs (exakt für Sitzung und Direktanbieter, `task-*` für Gateway-Rollen), „Worker schreiben nicht unter `.claude/`“, „keine Schlüsseldateien lesen (nur Existenz und Rechte)“.
5. ChatGPT-Risikohinweis in `gateway/README.md` mit Alternativen; ohne `chatgptViaGateway: accepted-risk` schreibt der Installer kein `chatgpt/`-Ziel.

## Dependencies and order
Keine feste Reihenfolge. M002 blockiert M012.

## Parallel milestones
M001, M003, M006, M008, M011. Geteilte Dateien: `tools/delegate/config.toml`, `gateway/README.md`, `docs/CONVENTIONS.md`, `install.sh`, `docs/MODULES.md`, `CHANGELOG.md`. Nur ergänzen, nie umbauen. M003 baut ein Gateway-Preset auf den Namen aus diesem Milestone; der Name steht zuerst in `docs/CONVENTIONS.md`.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M001-M003-briefing.md`. Als Erfolgskriterien übernommen: Key unter altem und neuem Namen fehlt in der Umgebung jedes Claude-Workers; Pause hat eine Obergrenze; Sperre gilt nur für den Lauf; erreichte Aufrufgrenze endet sauber mit Bericht; `timeout` 0 oder negativ wird abgelehnt; ohne Zustimmung kein `chatgpt/`-Ziel, auch nicht als Fallback.

## Binding documents
`docs/requirements.md`, `docs/roadmap-0.2.x.md` (Abschnitt M002), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`, `.claude/skills/foreman-delegation/SKILL.md`.

## Fixed decisions
- Ziel ist, Limits zu respektieren, nicht automatische Nutzung zu verschleiern.
- foreman blockiert den ChatGPT-Weg nicht, die Entscheidung trifft der Mensch und steht in `workspace.json` bzw. der Konfiguration.
- Der neue Variablenname wird in der Konvention festgelegt; die Wahl (welcher der bestehenden Namen gewinnt) trifft der Agent und begründet sie in `docs/learnings.md`, bevorzugt `FOREMAN_GATEWAY_KEY` (Konventionsname). Weicht er davon ab: `needs-input`.
- Jeder Fix bekommt zuerst einen fehlschlagenden Test; `run_task.py` wird in kleinen Schritten geändert.

## Data and interfaces
`tools/delegate/config.toml` (Limits je Anbieter, `timeout` je Rolle), Lauf-Bericht und Result-File der Worker, Umgebungsvariablen für Gateway-Key und -URL (nur Namen), `install.sh` (ChatGPT-Ziel).

## Out of scope
- Gateway-Einrichtung und Preset-Erzeugung (M003).
- Offizieller Codex-CLI als Worker, API-Key-Weg (offene Frage in den Requirements).
- Messung der Fallbacks (M011).
- Änderungen an die Referenzprojekte.

## Success criteria
1. Test: Gateway-Key unter altem und neuem Namen fehlt in der Umgebung eines Claude-Workers.
2. Tests mit simuliertem 429: wachsende Pause (nach oben begrenzt), Sperre nach drei Fehlschlägen in Folge, Fallback auf die nächste Rolle, Halt bei Obergrenze mit Bericht.
3. Test: Rolle mit eigenem `timeout` bricht nach diesem Wert ab; ohne Wert gilt der globale; 0 oder negativ wird abgelehnt.
4. Lint-Test findet jede der drei Regeln an genau einer Stelle; Begründungen stehen in `docs/learnings.md`.
5. Test: Ohne `chatgptViaGateway: accepted-risk` enthält keine Rolle ein `chatgpt/`-Ziel.
6. Simulierter Lauf schreibt jede Sperre in den Bericht.

## Verification
Commands that must be green:
bash scripts/test-all.sh
python3 tools/delegate/test_run_task.py
Human only (UAT): Ein Testauftrag über Gateway und Ollama läuft durch, im Bericht steht das tatsächliche Modell je Rolle; Gateway-URL auf eine nicht erreichbare Adresse gesetzt ergibt höchstens drei Versuche, dann Fallback auf die Claude-Rolle und Sperre im Bericht.

## Risks
Anbieter verhalten sich bei 429 unterschiedlich (Ollama Cloud, LiteLLM, Claude). Der neue Variablenname bricht bestehende Installationen; der Upgrade-Hinweis in M006 muss ihn nennen. Änderungen an mehreren Stellen von `run_task.py` erhöhen das Risiko für Nebeneffekte.
