Status: slice · since 2026-11-21T19:55Z · S2 läuft
Target: dev
Batch-branch: batch/m009
Lock: free
Tracker: -
Pretest-round: 0

# M009: docs-notion Spiegel

Start commit: 7f8c84c (Basis dev 7d806f4)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Modul `docs-notion` im Installer (Sperre fällt, Install mit/ohne Modul, MODULES.md, Standardwerte, update-classes) | done | M009 S1 | install.sh, scripts/update.py, scripts/test-install.sh, scripts/test-all.sh, docs/MODULES.md, CHANGELOG.md, template/scripts/docs-notion.mjs (Stub), template/scripts/lib/docs-notion.mjs (Stub), template/scripts/test-docs-notion.mjs (Stub) | update.py ebenfalls gegated (Brief nannte es nicht) |
| S2 | Spiegel-Skript (Markdown→Blöcke, Seitenbaum, idempotent, archivieren, --dry-run, lokaler Notion-Ersatz im Test) | open | | | |
| S3 | Auslöser im Batch-Lauf (generischer Nach-Merge-Schritt, nur mit Modul installiert) | open | | | |
| S4 | Sicherheit und Limits (429, Blockgrenzen, Token-Leck, Pfadgrenzen, Privacy-Scan) | open | | | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | `--modules docs-notion` installiert Skript und Standardwerte; ohne Flag fehlt beides und kein File enthält „notion“ | `bash scripts/test-install.sh`, `bash scripts/test-update-classes.sh` | automatic | n/a |
| S2 | Dry-run listet eine Seite je Datei, Teile unter Übersicht; Ersatz-Server zeigt Struktur, keine Duplikate beim zweiten Lauf, Überschreiben, Archivieren; Tabellen/Code/Listen erhalten | `node template/scripts/test-docs-notion.mjs` | automatic | n/a |
| S3 | `batch-run.md` ruft den Nach-Merge-Schritt; Spiegel-Fehler stoppt nicht; ohne Modul nirgends „notion“ | `bash scripts/test-install.sh`, Test in test-docs-notion oder eigener Test | automatic | n/a |
| S4 | Fake-Token nie in Ausgabe/Datei; 429 pausiert und endet begrenzt; >100 Blöcke und >2000 Zeichen zulässig; Pfade außerhalb ignoriert | `node template/scripts/test-docs-notion.mjs`, `bash scripts/privacy-scan.sh` | automatic | n/a |

## Mandatory questions per slice

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | n/a, kein Mehrbenutzerzugriff | unbekannter Modulname, Install ohne Modul | n/a | Neue Dateien in `update-classes.json`; Standardwerte in `.foreman.json` |
| S2 | Nur Dateien im Docs-Ordner; Token nur aus Umgebung | leere Datei, leerer Ordner, Datei ohne Überschrift | Notion 5xx und Abbruch mitten im Lauf: nächster Lauf heilt | Env `NOTION_API_KEY`, Node 20 |
| S3 | n/a | ohne Modul kein Aufruf | Spiegel-Fehler blockiert Batch-Lauf nicht | Aufruf nach dem Merge, im Bericht gemeldet |
| S4 | Pfade `..` und Symlinks nach außen werden übersprungen | 401, 429 dauerhaft | 429 mit Retry-After, Netzfehler | Limits dokumentiert in MODULES.md |

## Inherited red

None recorded.

## Log

- 2026-11-21T19:20Z · Brief M009-CONTEXT.md und Role Review geschrieben · -
- 2026-11-21T19:55Z · S1 grün: test-install, test-update-classes, test-update, test-changelog, privacy-scan je Exit 0 · see commit M009 S1
- Klarstellung Kriterium 2: dry-run ohne Token listet je Datei `sync`; mit Token und Wurzelseite klassifiziert er nur lesend (neu, aktualisiert, archiviert, unverändert).
