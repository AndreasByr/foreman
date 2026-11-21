# M001 Validierung

Gesamtergebnis: **pass** (Runde 3 von 3; 2 Nacharbeitsrunden). Letzter Lauf auf Commit `68acb77`: `bash scripts/test-all.sh` Exit 0, `bash scripts/check-config.sh` Exit 0.

Die Prüfer (Rolle `validation`, nur lesend) bekamen die Rohquellen: Brief, Requirements, Roadmap-Abschnitt, Role-Review, Diff seit Startcommit `28eab3e` und die Berichte; keine Bewertung der Session.

| Runde | A Anforderungen | B Integration und Regression | C Kriterien und Nachweise | Gesamt |
|---|---|---|---|---|
| 1 | needs-attention (1 mittel) | needs-attention (2 mittel) | needs-attention (2 mittel) | needs-attention |
| 2 | pass | pass | needs-attention (nur niedrig, fehlende Nachweise) | needs-attention |
| 3 | pass | pass | pass | **pass** |

Rohberichte der Prüfer: `docs/milestones/M001/validation/round1-a.md` bis `round3-c.md`; Wortlaut der Funde und Maßnahmen: `docs/milestones/M001/STATE.md` (Tabelle „Rework“), `docs/agent-reports/2026-11-21-M001-R1.md`.

## Mittlere Funde aus Runde 1, alle behoben
1. Ein offener `main`-PR wurde ohne `mainAutoMerge` nie fortgesetzt (B, C). Jetzt läuft er immer weiter; nur Fenster und Überfälligkeit brauchen die Freigabe. Test zuerst rot gegen die alte Lib (`dd4d933`), grün nach der Änderung.
2. `foreman-setup` kannte den Claude-Code-Weg per `fire_command` nicht (A, C). Je ein Satz in zwei Referenzdateien, Doku-Test.
3. `FOREMAN_TZ` aus `dispatcher.env` erreichte das Prüfskript still nicht mehr (B). `dispatcher.env.example` und Upgrade-Hinweis in `docs/MODULES.md` erklären `.foreman.json` und `pass_env`.

## Offen, niedrig (im Abschlussbericht)
- `check-config.sh` erkennt `--no-fetch` nur als Text im Skript (Warnung, kein Fail).
- `pass_env` lässt Namen wie `NODE_OPTIONS` zu; das ist Betreiber-Konfiguration.
- `fire-claude.example.sh` sperrt nur bekannte Aliase (`opus`, `sonnet`, `haiku`, `opusplan`, `default`, `best`).
- Nach Runde 3 kam noch ein Satz in `batch-run.md` dazu („Die `Units:`-Zeile des Auftrags gilt“, Fund B niedrig). Er ist durch den Doku-Test abgesichert, aber nicht erneut von einem Prüfer gelesen.
- Der rote Lauf für R1-5 (Redirect) wurde erst nach Runde 3 einzeln aufgezeichnet (Exit 1 ohne `redirect: "error"`, 31 Tests grün mit); im R1-Bericht steht er als gemeinsamer Lauf mit R1-4.

## Nicht geprüft von Prüfern oder Session
Echte Discord-Meldung, Lauf auf server-1, Produktentscheidung zum Standardverhalten: Human only (UAT, `docs/uat/M001.md`).
