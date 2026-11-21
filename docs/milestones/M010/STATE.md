Status: slice · since 2026-11-21T21:50Z · S1 läuft
Target: dev
Batch-branch: batch/m010
Lock: free
Tracker: -
Pretest-round: 0

# M010: Öffentliches Wiki

Start commit: cd07088 (Basis dev 9950ab9, nach Merge von main)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Konfiguration: Block `wiki`, check-config, Installer-Standardwert | in progress | | | |
| S2 | Wiki-Dateien: Seitenformat, Kopfdaten, Skill `foreman-wiki`, Beispiel-Wiki im Test | open | | | |
| S3 | Veröffentlichen: `--wiki`, Wiki-Scan, Ablehnung, Hook ohne Wiki | open | | | |
| S4 | Milestone-Todo: Vorlagen, foreman-brief, Prüfung der Wiki-Zeile in state-mirror | open | | | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | check-config meldet fehlerhafte wiki-Felder mit Exit 1, akzeptiert gültige; Install mit Modul legt Block (aus) an, ohne Modul kein „wiki“ | `bash scripts/test-check-config.sh`, `bash scripts/test-install.sh` | automatic | n/a |
| S2 | Skill und Beispiel-Wiki vorhanden; `--wiki --dry-run` listet je Seite eine Aktion, Exit 0 ohne Token und Netz | `node template/scripts/test-docs-notion.mjs` (Wiki-Teil), `bash scripts/test-update-classes.sh` | automatic | n/a |
| S3 | Struktur Wurzel→Zielgruppe→Seiten gegen Notion-Ersatz, idempotent, Kopfblock entfernt; Scan-Treffer, unbekannte Zielgruppe, fehlender Vermerk: Exit 4, nichts gesendet; Hook ruft `--wiki` nie | `node template/scripts/test-docs-notion.mjs`, `bash scripts/test-install.sh` | automatic | n/a |
| S4 | Vorlagen und foreman-brief enthalten Todo und `Wiki:`-Zeile; state-mirror --check --local scheitert ohne Zeile bei Wiki an | `node template/scripts/test-state-mirror.mjs`, `bash scripts/test-plugin.sh` | automatic | n/a |

## Mandatory questions per slice

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | n/a, keine Mehrbenutzerrechte | Wiki an ohne Sprache, Zielgruppe ohne Namen, Schalter als String, Wiki aus ohne Felder | n/a | Neuer Block in `.foreman.json`; Installer nur mit Modul; update-classes |
| S2 | Nur `docs/wiki/` wird gelesen | Seite ohne Kopfdaten, leere Seite | n/a | Neuer Skill nur mit Modul installiert, in update-classes |
| S3 | Pfade `..` und Symlinks nach außen übersprungen; Token nie in Ausgabe; Spiegel und Wiki trennen sich | Scan-Treffer (je Muster), unbekannte Zielgruppe, fehlender Vermerk, leeres Wiki | Notion 5xx, 429 wie M009 (Lib wiederverwendet); Abbruch heilt beim nächsten Lauf | `--wiki` nur auf Aufruf; Hook und Batch-Lauf rufen es nie; Wiki-Wurzelseite in Config |
| S4 | n/a | Wiki an ohne Zeile scheitert; Zeile leer scheitert; Wiki aus ohne Zeile besteht | n/a | `state-mirror.mjs` in Repo- und Template-Kopie identisch; Vorlagen in update-classes (schon `docs/milestones/_TEMPLATE/`) |

## Inherited red

None recorded.

## Log

- 2026-11-21T21:45Z · Brief M010-CONTEXT.md und Role Review geschrieben, main in dev gemergt (9950ab9) · cd07088
