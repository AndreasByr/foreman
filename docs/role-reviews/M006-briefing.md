# Role review (briefing mode): M006

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, foreman hat keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Stattdessen Blick in den Code: `install.sh`, `scripts/test-install.sh`, `template/`, `plugins/foreman/skills/foreman-project-mode/`.
**Barrierefreiheit:** nicht gefordert. Ausgabetexte der Skills sind Chat-Text; Checklisten nummeriert, mit Minuten.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **UX-Kritiker:** Das Update zeigt zuerst, was passiert (`--dry-run`), mit einer Zeile je Datei und einem Wort: `neu`, `aktualisiert`, `bleibt`, `prüfen`. Schritte außerhalb des Repos stehen nummeriert und mit Minuten in der Checkliste.
- **UI-Defekt-Jäger:** Keine UI. Ausgabe auf der Konsole bleibt zeilenweise und ohne Sonderzeichen-Tabellen.
- **Bug-Jäger:**
  - Zweiter Lauf direkt nach einem Update ändert nichts (idempotent).
  - `--dry-run` schreibt nichts: Hash des Zielordners vorher und nachher gleich.
  - `.foreman.json` fehlt, ist kein gültiges JSON oder hat keine `foreman`-Version: definierter Fehler, nichts geschrieben.
  - Projekt hat eine neuere Version als das Repo: Abbruch, kein Downgrade.
  - Ein Fehler beim Schreiben lässt `version` unverändert; ein erneuter Lauf macht den Rest.
  - Modul aus (`.foreman.json`): zugehörige Dateien werden nicht neu angelegt; neue Module nur über ausdrückliches Ja (kein Flag macht es still).
  - Foreman-eigene Dateien mit lokalen, nicht committeten Änderungen: Abbruch mit Liste, kein stilles Überschreiben.
- **Penetrationstester:**
  - Kein Schreiben außerhalb des Zielordners (Symlink im Ziel, `..` im Pfad).
  - Das Update liest und schreibt keine Schlüsseldateien (`.env`, `*.pem`); `context` und `mirror` in `.foreman.json` bleiben unverändert.
  - Die Checkliste enthält Namen von Variablen, nie Werte.
- **Barrierefreiheits-Prüfer:** nicht gefordert.

## Funde im Bestand, die in M006 gehören
- `template/` enthält Dateien, die Projekte ändern (`CLAUDE.md`, `tools/delegate/config.toml`, `.claude/settings.json`). `install.sh` überschreibt ohne `--force` nichts, kennt aber keine Update-Regel. Das ist der Kern von M006.
- Die Verhaltensänderungen aus M001 (`pass_env`, `webhook_format`, `mainAutoMerge`) brauchen einen Upgrade-Hinweis (Berichte M001-S1 bis S6).
