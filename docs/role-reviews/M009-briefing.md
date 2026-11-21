# Role review (briefing mode): M009

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, foreman hat keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Blick in `install.sh`, `scripts/test-install.sh`, `docs/MODULES.md`, `template/.claude/skills/foreman-dispatch-run/references/batch-run.md`, `update-classes.json`.
**Barrierefreiheit:** nicht gefordert. Ausgaben sind Text und Notion-Seiten.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **Pentest / Secret:** Der Notion-Token darf nie in Log, Fehlertext, Argumentliste, Testausgabe oder Datei landen. Test: Lauf mit einem erkennbaren Fake-Token, Ausgabe und Fehlerpfade enthalten ihn nicht.
- **Pentest:** Der Spiegel liest nur Dateien unter dem konfigurierten Docs-Ordner. Symlinks, `..` im Pfad und Dateien außerhalb des Repos werden übersprungen und gemeldet.
- **Bug:** Rate-Limit (HTTP 429): Das Skript wartet nach `Retry-After` und versucht es begrenzt oft erneut, es ignoriert das Limit nicht und hängt nicht endlos.
- **Bug:** Notion-Grenzen: höchstens 100 Blöcke pro Anfrage, höchstens 2000 Zeichen pro Textstück. Eine lange Datei und ein langer Absatz brauchen einen Test.
- **Bug:** Markdown-Tabellen, Codeblöcke, verschachtelte Listen und unbekannte Syntax werden nicht still verworfen; unbekanntes erscheint als Text, nicht als fehlender Inhalt.
- **Bug:** Ein zweiter Lauf ohne Änderung erzeugt keine doppelten Seiten. Eine gelöschte Datei im Repo archiviert die Seite; sie bleibt nicht als Waise stehen.
- **Bug:** Abbruch mitten im Lauf (Netz weg, 5xx): Der nächste Lauf stellt den Zustand wieder her; kein halber Stand gilt als fertig.
- **Regel:** Ohne Modul ändert sich an Installation und Work-Runs nichts; kein Wort „notion“ in installierten Dateien ohne das Modul (bestehender Test in `scripts/test-install.sh` bleibt).
- **Regel:** Ein Fehler des Spiegels blockiert nie den Merge oder das Schließen einer Einheit; er wird gemeldet.
- **Betrieb:** Neue Skripte in `template/scripts/` müssen in `update-classes.json` stehen, sonst ist `scripts/test-update-classes.sh` rot. Geteilte Dateien (`install.sh`, `scripts/test-install.sh`, `docs/MODULES.md`, `CHANGELOG.md`) nur ergänzen.
- **Privacy:** Testdaten und Beispiele nur erfunden; Privacy-Scan bleibt grün.
