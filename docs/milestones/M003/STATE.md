Status: in progress · since 2026-11-21T16:10Z · S3 fertig, S4 offen
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
| S4 | Zusammenfassung vor der Empfehlung | open | | scripts/setup-summary.py, scripts/test-setup-summary.py, SKILL.md | |

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

## Open question (when `needs-input`)

One question, options, recommendation.

## Log

- <UTC time> · <step> · <result> · <commit>

- 2026-11-21T16:35Z · S1 fertig, test-all.sh grün (Exit 0) · 9028645
- 2026-11-21T16:55Z · S2 fertig, test-all.sh grün (Exit 0) · 12ec325
- 2026-11-21T17:25Z · S3 fertig, test-all.sh grün (Exit 0) · 12a8289
