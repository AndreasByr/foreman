# Role review (briefing mode): M010

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, foreman hat keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Blick in `template/scripts/docs-notion.mjs`, `template/scripts/lib/docs-notion*.mjs`, `scripts/check-config.sh`, `scripts/state-mirror.mjs`, `docs/milestones/_TEMPLATE/`, `plugins/foreman/skills/foreman-brief/`.
**Barrierefreiheit:** nicht gefordert. Ausgaben sind Text und Notion-Seiten.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **Pentest / Leck:** Interne Inhalte (Roast-Notizen, offene Fragen, Briefs, Fix-Pakete, Agent-Reports, Hosts, Zugangsdaten) dürfen nie im Wiki landen. Die Prüfung läuft im Veröffentlichungsskript selbst, nicht nur als Regel für das Modell; ein Treffer verhindert die gesamte Veröffentlichung, nicht nur die eine Seite.
- **Pentest:** Das Skript liest fürs Wiki nur Dateien unter `docs/wiki/`. Symlinks, `..` und Dateien außerhalb werden übersprungen und gemeldet (wie beim Spiegel). Der interne Spiegel schließt `docs/wiki/**` aus und umgekehrt.
- **Pentest / Secret:** Token nie in Ausgabe, Fehlertext oder Datei (gleiche Tests wie M009 auch für den Wiki-Lauf).
- **Bug:** Ein Modell erfindet Funktionen. Gegenmaßnahme: jede Seite nennt ihre Quelldateien im Kopf (`source`), und die Regeln verlangen, nur daraus zu schreiben.
- **Bug:** Zielgruppe fehlt oder ist unbekannt: Seite wird abgelehnt, nicht still unter einer Standardgruppe veröffentlicht.
- **Bug:** Wiki aus: kein Todo, keine Veröffentlichung, kein Wort „wiki“ nötig in `STATE.md`. Wiki an, aber Konfiguration kaputt: `check-config.sh` meldet es.
- **Regel:** Der Abschluss ohne Wiki-Zeile scheitert maschinell (nicht nur per Skilltext).
- **Regel:** Veröffentlichung nie automatisch nach jedem Merge. Sonst sähen Spieler unfertige Stände.
- **Betrieb:** Neue Skripte, Skills und Dateien in `update-classes.json`; nur mit Modul `docs-notion` installiert; ohne Modul kein Wort „wiki“ oder „notion“ in installierten Dateien (Test in `scripts/test-install.sh`). Geteilte Dateien nur ergänzen.
- **Privacy:** Beispiele und Testdaten erfunden; Privacy-Scan bleibt grün.
