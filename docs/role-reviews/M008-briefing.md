# Role review (briefing mode): M008

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, foreman hat keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Blick in `docs/CONVENTIONS.md`, `template/docs/`, `plugins/foreman/skills/foreman-roast/`, `plugins/foreman/skills/foreman-roadmap/`.
**Barrierefreiheit:** nicht gefordert. Ausgaben sind Text.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **Bug:** Datum, Jahr oder Zahlen in der Änderungsnotiz zählen als Version (Fehlalarm). Test: `**Stand:** 21.11.2026, Version 1 (erste Fassung aus Requirements 0.2.1)` ist grün.
- **Bug:** Versionsbereich („Version 9 bis 27“) oder Liste („v9, v10, v11“) wird übersehen. Test: beides rot.
- **Bug:** Übersicht ohne Stand-Zeile oder mit zwei Stand-Zeilen: definierter Fehler, kein Absturz bei leerer Datei.
- **Regel:** Doppelte Regeln zwischen neuer Regeldatei und `docs/CONVENTIONS.md`. Eine Stelle gewinnt, die andere verweist.
- **Risiko:** SKILL.md-Limit (8 KB). `foreman-roadmap` liegt bei etwa 7,2 KB; nur ein Verweis, Details in `references/`.
- **Privacy:** Projekt B-Beispiel nur erfunden und gekürzt; Privacy-Scan bleibt grün.
- **Pentest:** nicht anwendbar, kein Netz, keine Secrets, Skript liest nur Dateien aus dem übergebenen Pfad.
