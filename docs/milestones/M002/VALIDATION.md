# M002 Validierung

Start commit `e0d84d2`. Geprüft wurde jeweils der Diff seit dem Start. Die Prüfer (Rolle `validation`, Opus-Modell) bekamen die Rohquellen: Brief, Anforderungen, Diff, Slice-Berichte. Sie konnten keine Befehle ausführen (Bash gesperrt); ihre Befunde sind Lesebefunde. Die Sitzung hat jeden Befund gegen Code und Testlauf geprüft.

| Runde | Stand | A Anforderungen | B Integration | C Kriterien und Belege | Gesamt |
|---|---|---|---|---|---|
| 1 | 55c77f4 | needs-attention | needs-attention | needs-remediation (1 high) | needs-remediation |
| 2 | 8651cec | needs-attention | needs-attention | needs-attention | needs-attention |
| 3 | 646ad52 | needs-attention | needs-attention | needs-attention | needs-attention (1 medium) |
| Nachprüfung | 610a4ae | – | – | – | **pass** (keine medium oder höher) |

Rohberichte (nicht im Repo, in `tools/delegate/tasks/`): `20261121-val-{a,b,c}`, `-val2-…`, `-val3-…`, `-val4`.

## Verlauf
- Runde 1: ein hoher Befund (Modell-ID-Regel stand noch in vier Chat-Skills), sechs mittlere (keine Pause für Claude, Timeout teuer, ChatGPT-Prüfung umgehbar, Kriterium 6 nur teilweise geprüft, Tests hingen an Umgebungsvariablen, wachsende Pause nicht echt getestet). Rework R1 bis R3, Bericht `docs/agent-reports/2026-11-21-M002-R1-R3.md`.
- Runde 2: vier mittlere Befunde (Pausenzeile nach Timeout nie geschlafen, Timeout sperrt die Kette nicht, Claude-Pause bei späterem Fallback, Lint umgehbar). Rework R4, Bericht `2026-11-21-M002-R4.md`. Das war die zweite und letzte Rework-Runde.
- Runde 3: ein mittlerer Befund, `STATE.md` formal falsch (meine Zeilen in den falschen Tabellen, leere Commit-Spalten, fehlende Log-Einträge). Das ist ein Dokumentfehler der Sitzung, kein Code. Ich habe ihn korrigiert (Commit 610a4ae), dazu den README-Text zu Versuchen und Timeout.
- Nachprüfung durch einen vierten, getrennten Prüfer (nur diese beiden Punkte, plus Abgleich README gegen Code): kein Befund ab mittel, Verdict pass. Die drei Prüfer A, B, C liefen nach der Korrektur nicht erneut komplett; das ist eine Abkürzung, die ich hier offenlege.

## Offene Befunde (low, begründet)
- Mit Zustimmung gilt ein `chatgpt/`-Fallback als gültig, wird aber als Claude-Modell gestartet. Kein dokumentierter Weg; Zustimmungsspeicherung kommt mit M003.
- Das breite Fehlermuster (`INFRA_ERROR`) zählt auch bei Claude; Folge: höchstens Pause und nach drei Fehlern Claude-Sperre.
- Der Pfad „letzter Claude-Versuch scheitert ohne Sperre“ (`drop_last_pause`) hat keinen eigenen Test; das Verhalten ist indirekt durch die Timeout-Tests abgedeckt.
- Das Ledger zählt Wrapper-Aufrufe, keine HTTP-Anfragen, und ist bei parallelen Läufen nicht abgesichert.
- `[env]`/MCP-Variablen können einen Schlüssel an einen Claude-Worker tragen (gab es vor M002).
- „Never `opusplan`“ steht mehrfach in den Chat-Skills; das ist eine eigene Regel, nicht eine der drei.
- Die Key-Datei-Regel nennt `/etc/dispatcher/` nicht, das `requirements.md` als Beispiel anführt.

## Letzter Lauf aller Prüfungen
Auf Commit 610a4ae, saubere Arbeitskopie:

| Befehl | Exit |
|---|---|
| `bash scripts/test-all.sh` | 0 |
| `python3 template/tools/delegate/test_run_task.py` (41 Tests) | 0 |
| `python3 tools/delegate/test_run_task.py` (Spiegelkopie) | 0 |
| `python3 scripts/test-rules.py` | 0 |
| `bash scripts/test-install.sh` | 0 |
| Testdatei mit gesetztem `FOREMAN_GATEWAY_URL` und `ANTHROPIC_BASE_URL` | 0 |

Gesamt: **pass**, mit den oben genannten low-Befunden und den Punkten, die nur der Mensch prüfen kann.
