Status: needs-input · since 2026-11-21T21:45Z · Validierung 4 needs-attention nach R3; ein mittlerer Fund offen, vierte Runde oder Annahme als Grenze braucht den Menschen
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
| S2 | Spiegel-Skript (Markdown→Blöcke, Seitenbaum, idempotent, archivieren, --dry-run, lokaler Notion-Ersatz im Test) | done | M009 S2 | template/scripts/docs-notion.mjs, lib/docs-notion.mjs, lib/docs-notion-md.mjs, test-docs-notion.mjs, install.sh, scripts/update.py, scripts/test-install.sh | lib-Datei docs-notion-md.mjs kam dazu (Zeilenlimit), ebenfalls gegated |
| S3 | Auslöser im Batch-Lauf (generischer Nach-Merge-Schritt, nur mit Modul installiert) | done | M009 S3 | batch-run.md (Schritt 3), template/scripts/post-merge.d/docs-notion.sh, install.sh, scripts/update.py, scripts/test-install.sh, docs/MODULES.md | Hook liegt in `scripts/post-merge.d/`; Wrapper-Exit 1 (Worker ließ das Exec-Bit weg), Bit von der Sitzung gesetzt |
| S4 | Sicherheit und Limits (429, Blockgrenzen, Token-Leck, Pfadgrenzen, Privacy-Scan) | done | M009 S4 | template/scripts/test-docs-notion.mjs, CHANGELOG.md, docs/MODULES.md | |
| R1 | Rework: Inhaltsvergleich statt nur Marker, Retry-After-Grenze, Tabellenzellen, Anfragegrenzen | done | M009 R1 | template/scripts/lib/docs-notion*.mjs, test-docs-notion.mjs, foreman-batch SKILL.md | |
| R2 | Rework: fremde Seiten nie archivieren, 429-Gesamtbudget, strenger Notion-Ersatz, Modul in bestehendem Projekt aktivieren, Hook-Text | done | M009 R2 | lib, install.sh, test-install.sh, batch-run.md, MODULES.md | |

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
- 2026-11-21T20:20Z · S2 grün (test-docs-notion, test-install, test-update, test-update-classes, privacy-scan je Exit 0) · M009 S2
- 2026-11-21T20:35Z · S3 grün (test-install, test-update, test-update-classes, test-plugin, test-rules, privacy-scan je Exit 0) · M009 S3
- Abweichung vom Brief: Kriterium 8 nennt `batch-run.md`; der Aufruf dort ist ein genereller Hook-Schritt (`post-merge.d`), ohne das Wort notion.

## Open question (when `needs-input`)

Validierung 3 (A/B/C) auf 8e32c06: needs-attention, kein hoher Fund, drei mittlere Funde, die zwei Rework-Runden sind aufgebraucht.
1. Eine bestehende Seite wird nie unter die richtige Elternseite verschoben (Übersicht kommt später dazu oder fällt weg: Teile landen an der Wurzel oder werden mitarchiviert; heilt erst im nächsten Lauf).
2. Der Hook hat kein Zeitlimit; ein langer Spiegel verzögert das Schließen der Einheiten.
3. docs/MODULES.md widerspricht sich (Zeile zu "never archived" gegen "pages without a file are archived"); dazu: lokaler Checkout kann veraltet sein.
Optionen: A) dritte Rework-Runde (Elternseite abgleichen durch Archivieren und Neuanlegen, Zeitlimit im Hook, Doku und Checkout-Hinweis). B) Funde 1 und 2 als bekannte Grenzen dokumentieren, nur Doku-Fehler beheben, dann Batch-PR. Empfehlung: A.
**Cause:** limit-exceeded · zwei Rework-Runden aufgebraucht, mittlere Funde offen
- 2026-11-21T21:10Z · Validierung 3 needs-attention, test-all Exit 0 auf 8e32c06, Rückfrage an den Menschen wegen R3 · 8e32c06

### Runde 4 (nach R3, Commit 01b49d0)

Validierung 4: needs-attention, kein hoher Fund. Offen, mittel: Fremde Seiten (ohne Marker) unter einer Spiegelseite, die unter eine neue Elternseite verschoben wird, werden von Notion mitarchiviert und nicht gemeldet. Niedrig: Laufzeitgrenze ist weich (prüft nur vor jedem Aufruf), fremde Seite mit gleichem Pfad-Titel wird überschrieben, Fake prüft Verschachtelungstiefe nicht, frisches Projekt meldet Exit 3 bis rootPageId gesetzt ist.
Optionen: A) vierte Runde (Fremd-Prüfung auch bei Verschiebung, Tiefe im Fake). B) mittleren Fund als bekannte Grenze in MODULES.md aufnehmen, Batch-PR, echte Prüfung im UAT. Empfehlung: B.
**Cause:** limit-exceeded
- 2026-11-21T21:45Z · Validierung 4 needs-attention, test-all Exit 0 auf 01b49d0 · 01b49d0
