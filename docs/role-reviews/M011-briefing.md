# Role review (briefing mode): M011

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, keine UI.
**Teil 2 (Bestand):** Blick in `template/scripts/lib/state.mjs`, `intervention.mjs`, `units.mjs`, `tools/delegate/run_task.py` (Result-File-Format), `docs/milestones/M001/STATE.md` (echtes Log).
**Barrierefreiheit:** nicht gefordert; die Ausgabe ist Markdown.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **Bug:** Log-Zeilen sind Freitext. Fehlender oder ungültiger UTC-Stempel, Reihenfolge nicht aufsteigend, Stempel ohne Sekunden (`16:05Z`): kein Absturz, Lücke statt erfundener Zahl. Beobachtet: `M001/STATE.md` hat Log-Zeiten, die nicht zur Statuszeile passen (UAT-Stempel früher als der letzte Lauf). Die Laufzeit darf nie negativ werden.
- **Bug:** Zeitraumgrenzen: Unit läuft über die Grenze, Unit ohne Log-Zeile, `--since` nach `--until`, ungültiges Datum. Regel im Brief festgelegt; Test je Fall.
- **Bug:** Mehrere Eingriffe je Unit und beantwortete Fragen (`## Open question (answered ...)`); `intervention.mjs` überspringt beantwortete Abschnitte für „offen“, das Mess-Skript muss sie mitzählen (eigene Funktion, nicht `openQuestion` umbauen, M004 und der Tracker nutzen sie).
- **Pentest:** Ausgabe enthält nur Zahlen, Unit-IDs und die Ursachen-Zeile. Keine Freitext-Fragen, keine Pfade außerhalb des Projekts, keine Umgebungsvariablen. Result-Files können Worker-Antworten mit Geheimnissen enthalten: das Skript liest nur die Überschriften der Versuche. Kein Netz, kein Schreiben außer `docs/metrics.md`.
- **Bug:** `--root` und `--results` mit Pfad außerhalb oder Symlink: nur lesen; die Ausgabedatei liegt immer in `<root>/docs/`.
- **Risiko:** Result-File-Format ändert sich mit M002. Test mit festem Beispiel; bei Formatwechsel meldet das Skript eine Lücke statt falscher Zahlen.
- **Risiko:** Fallback-Zählung hängt am Text „fallback after provider outage“. Ein Test hält die Verbindung zum Wrapper-Format (liest die Zeichenkette aus `run_task.py` im Test, damit eine Textänderung dort den Test rot macht).
- **Betrieb:** Result-Files nur lokal. Zahlen von anderen Maschinen fehlen; die Datei sagt es ausdrücklich.
