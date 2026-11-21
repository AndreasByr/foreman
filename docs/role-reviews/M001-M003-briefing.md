# Role review (briefing mode): M001, M002, M003

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, foreman hat keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Stattdessen Blick in den Code: `dispatcher/dispatch.mjs`, `tools/delegate/run_task.py`, `plugins/foreman/skills/foreman-setup/`.
**Barrierefreiheit:** nicht gefordert. Ausgabetexte der Skills sind Chat-Text.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

### M001 Dispatcher
- **Pentest:** Fire-Token eines anderen Projekts darf in Umgebung, Log, Webhook-Text und `--dry-run`-Ausgabe nie auftauchen. Test mit Dummy-Token, Suche in allen Ausgaben.
- **Pentest:** `pass_env` darf nur Namen aus der Projektkonfiguration durchreichen; ein Name wie `PATH` oder ein leerer Name darf nichts überschreiben.
- **Bug:** `webhook_format: auto` mit unbekanntem Host und mit ungültiger URL: definierter Fehler, kein Absturz.
- **Bug:** `mainAutoMerge` fehlt, ist `null` oder ein String: gilt als `false`.
- **Bug:** `--no-fetch` mit veraltetem lokalen Stand: gleiche `TASK`-Zeilen, kein stiller Fetch.
- **Betrieb:** `fire_command` ohne Überwachung (Requirements, Roast-Notiz). Nur dokumentieren, nicht lösen; M011 misst es.

### M002 Delegate
- **Pentest:** Gateway-Key unter beiden alten Namen (`FOREMAN_GATEWAY_KEY`, `LLM_GATEWAY_KEY`) und dem neuen Namen fehlt in der Umgebung jedes Claude-Workers.
- **Bug:** 429 in Folge: Pause wächst, ist nach oben begrenzt; Sperre gilt nur für den Rest des Laufs, nicht dauerhaft.
- **Bug:** Obergrenze Aufrufe pro Lauf erreicht: sauberer Exit mit Bericht, kein halber Task.
- **Bug:** Rolle ohne eigenes `timeout` erbt den globalen Wert; negativer oder 0-Wert wird abgelehnt.
- **Regel:** ChatGPT-Ziel nur mit `chatgptViaGateway: accepted-risk`; fehlt der Schlüssel, kein `chatgpt/` in keiner Rolle, auch nicht per Fallback.
- **Risiko:** `run_task.py` ist groß (~33 KB); Tests zuerst, kleine Änderungen.

### M003 Setup
- **Bug:** „unbekannt“ wird nie zu einem geratenen Wert; Mehrfachauswahl mit 0 Treffern erlaubt.
- **Pentest:** `workspace.json` und `.foreman.json` (`infra`) enthalten nur Namen und Rollen. Privacy-Scan und Schema-Test lehnen Werte ab, die wie Schlüssel, Tokens oder Passwörter aussehen.
- **Bug:** Gateway-URL nicht erreichbar: Setup meldet es und schreibt das Preset trotzdem nicht als „geprüft“.
- **Risiko:** Katalog wird zu lang; Vorschläge und Mehrfachauswahl halten ihn kurz.

## Übergreifend
- Geteilte Dateien (`install.sh`, `docs/MODULES.md`, `CHANGELOG.md`, `scripts/test-install.sh`): M001, M002, M003 laufen parallel und ergänzen sie nur. M003 und M002 berühren beide `config.toml` und `gateway/README.md`: Konflikt-Risiko beim Merge, M003 liest den Gateway-Namen aus M002.
- Reihenfolge-Empfehlung: M002 legt den Gateway-Namen fest, M003 S3 (Preset) nutzt ihn. Läuft M003 S3 zuerst, nutzt es den Namen aus den Konventionen und wird beim Merge angeglichen.
