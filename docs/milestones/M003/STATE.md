Status: in progress · since 2026-11-21T16:10Z · Validierung Runde 2: A needs-attention, B pass, C needs-attention; Rework R3 fertig, Validierung Runde 3 (final) offen
Target: dev
Batch-branch: batch/m003
Lock: free
Tracker: -
Pretest-round: 0

# M003: Einrichtung fragt statt rät

Start commit: 2e5bc22

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Bestandsaufnahme: Fragenkatalog | done | 9028645 | plugins/foreman/skills/foreman-setup/SKILL.md, references/question-catalog.md, scripts/test-setup-catalog.py, scripts/test-all.sh | |
| S2 | workspace.json: Schema, Beispiel, Prüfung, infra-Block | done | 12ec325 | docs/workspace.schema.json, docs/workspace.example.json, scripts/check-workspace.py, scripts/test-workspace.py, install.sh (--workspace), references/workspace-format.md | |
| S3 | Gateway erkennen: Preset im Installer, optionaler Einrichtungsblock | done | 12a8289 | install.sh, scripts/test-install.sh, gateway/README.md, references/gateway-block.md | |
| S4 | Zusammenfassung vor der Empfehlung | done | eb25e6b | scripts/setup-summary.py, scripts/test-setup-summary.py, SKILL.md | |
| R1 | Rework Runde 1, Inhalt: ChatGPT-Zustimmung im Katalog (C9), Maschinen-Zwecke, Lücken für unbeantwortete Felder, C8 in der Zusammenfassung, altes Result-Block raus, Variablennamen, Skill-Beschreibung, stärkere Tests | done | 96c5ef7 | plugins/foreman/skills/foreman-setup/**, docs/workspace.schema.json, docs/workspace.example.json, scripts/check-workspace.py, scripts/setup-summary.py, scripts/test-setup-catalog.py, scripts/test-workspace.py, scripts/test-setup-summary.py | |
| R2 | Rework Runde 1, Installer: einheitliche strenge URL-Prüfung, kein Teil-Install, Probe ohne Redirect/Proxy mit 200-Prüfung, infra-Update bei vorhandener .foreman.json, `declined`, ehrliche Dry-Run-Meldung, Tests | done | 08db6aa | install.sh, scripts/gateway-preset.py, scripts/test-install.sh, gateway/README.md, docs/MODULES.md, references/gateway-block.md | |
| R3 | Rework Runde 2 (letzte): fehlende C9-/Zweck-Antworten als Lücke, Quick überspringt Block C ohne Empfehlung, keyEnv fragen und zeigen, Linear ohne falsche Lücke, Hinweis mit `--chatgpt`, Schema-URL-Regel gleich, `--help`, `.foreman.json` vorab prüfen | done | R3c | SKILL.md, question-catalog.md, setup-summary.py, check-workspace/schema, install.sh, prerequisites.md, profiles-and-modules.md, gateway/README.md, drei Tests | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Der Katalog enthält jede Frage aus den Requirements (Maschine+Rolle, Dienste, Domain/HTTPS, KI-Zugänge mit Stufe, Routinen mit API-Trigger, Benachrichtigung, Tracker, Gateway); jede Frage erlaubt Mehrfachauswahl mit 0 Treffern und „weiß nicht“ | `python3 scripts/test-setup-catalog.py`, `bash scripts/test-plugin.sh` | automatic | – (Chat-Text) |
| S2 | Ein Beispiel besteht die Schema-Prüfung; schlüsselartige Werte, unbekannte Felder und fehlende Pflichtfelder werden abgelehnt; Privacy-Scan sauber; Install mit `--workspace` schreibt `infra` | `python3 scripts/test-workspace.py`, `bash scripts/test-install.sh`, `bash scripts/privacy-scan.sh` | automatic | – |
| S3 | Install mit erreichbarer Gateway-URL schreibt das Preset und prüft per `--dry-run`; unerreichbar → Meldung, kein „geprüft“; ohne Zustimmung kein ChatGPT-Ziel (`task-normal`, `task-complex`) | `bash scripts/test-install.sh` (neue Fälle mit lokalem Stub-Server) | automatic | – |
| S4 | Aus Testantworten entsteht eine Zusammenfassung vor der Empfehlung; „weiß nicht“ ergibt `unbekannt` plus genannte Lücke; SKILL.md ordnet Zusammenfassung und Bestätigung vor die Empfehlung | `python3 scripts/test-setup-summary.py`; Chat-Durchlauf mit eigenem Aufbau = human only | automatic + human only | – |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | not applicable, because reiner Text im Skill, keine Rechte | Frage ohne Antwort, 0 Treffer in Mehrfachauswahl, „weiß nicht“ | not applicable, because kein externer Aufruf | not applicable, because keine Migration, keine Variablen; Dateien liegen im Plugin |
| S2 | not applicable, because lokale Datei; sie trägt nur Namen, nie Werte (Prüfung lehnt Schlüssel ab) | Schlüssel im Feld, unbekanntes Feld, fehlendes Pflichtfeld, `--workspace` mit kaputter Datei | Datei fehlt oder ist kein JSON: Installer bricht mit Meldung ab | `install.sh` bekommt `--workspace`; keine neue Umgebungsvariable |
| S3 | Gateway-Key nur als Variablenname (`FOREMAN_GATEWAY_KEY`), nie als Wert; kein ChatGPT ohne Zustimmung | ungültige URL, URL ohne http(s), zweiter Lauf (idempotent) | Gateway nicht erreichbar oder `--dry-run` rot: Meldung, Preset nicht als „geprüft“ | Optionen `--gateway-url`, `--fallback-model`, `--chatgpt-via-gateway`; Variablenname aus CONVENTIONS, Abgleich mit M002 beim Merge |
| S4 | not applicable, because keine Rechte betroffen; keine Secrets in der Zusammenfassung | alle Antworten „weiß nicht“, leere Eingabe | not applicable, because kein externer Aufruf | not applicable, because Skript läuft nur lokal und im Test |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

Keine: `bash scripts/test-all.sh` auf dem Startstand 2e5bc22 lief mit Exit 0.

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- <UTC time> · <step> · <result> · <commit>

- 2026-11-21T16:35Z · S1 fertig, test-all.sh grün (Exit 0) · 9028645
- 2026-11-21T16:55Z · S2 fertig, test-all.sh grün (Exit 0) · 12ec325
- 2026-11-21T17:25Z · S3 fertig, test-all.sh grün (Exit 0) · 12a8289
- 2026-11-21T17:50Z · S4 fertig, test-all.sh grün (Exit 0) · eb25e6b
- 2026-11-21T18:45Z · Validierung Runde 1: A needs-remediation, B needs-attention, C needs-attention; Rework R1, R2 fertig, test-all.sh grün (Exit 0) · 08db6aa
- 2026-11-21T19:10Z · Validierung Runde 2: A needs-attention (3 mittel), B pass, C needs-attention (nur niedrig); Rework R3 (letzte Runde) · 08db6aa
- 2026-11-21T19:35Z · Rework R3 fertig, test-all.sh grün (Exit 0) · R3c
