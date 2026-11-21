Status: slice · since 2026-11-21T22:10Z · S4 läuft
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
| S1 | Konfiguration: Block `wiki`, check-config, Installer-Standardwert | done | M010 S1 | install.sh, scripts/check-config.sh (+Template-Kopie), scripts/test-check-config.sh, scripts/test-install.sh, docs/MODULES.md, CHANGELOG.md | Sprache fällt auf context.language zurück |
| S2 | Wiki-Dateien: Seitenformat, Kopfdaten, Skill `foreman-wiki`, Beispiel-Wiki im Test | done | M010 S2 | template/scripts/lib/docs-wiki.mjs, docs-notion.mjs (--wiki), test-docs-wiki.mjs, template/.claude/skills/foreman-wiki/SKILL.md, install.sh, update.py, test-install.sh, test-all.sh, MODULES.md, CHANGELOG.md | Veröffentlichen folgt in S3 (Exit 1 Platzhalter) |
| S3 | Veröffentlichen: `--wiki`, Wiki-Scan, Ablehnung, Hook ohne Wiki | done | M010 S3 | template/scripts/docs-notion.mjs, lib/docs-wiki-scan.mjs, lib/docs-wiki-publish.mjs, test-docs-wiki.mjs, install.sh, update.py, test-install.sh, MODULES.md, CHANGELOG.md | Seitentitel in Notion sind virtuelle Pfade (Lib nutzt Pfad als Titel); --dry-run meldet Kopffehler nur als Hinweis, scheitert nur an Scan-Treffern |
| S4 | Milestone-Todo: Vorlagen, foreman-brief, Prüfung der Wiki-Zeile in state-mirror | in progress | | | |

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
- 2026-11-21T22:10Z · S1: Tests vor Umsetzung rot (test-check-config Exit 1 bei l-enabled-string, test-install Exit 1); danach grün: test-check-config, test-install, test-update-classes, test-update, privacy-scan je Exit 0 · M010 S1
- Korrektur Kriterium 1 im Brief: „kein installiertes File enthält wiki“ ist nicht haltbar (check-config.sh und die Milestone-Vorlagen sind immer installiert). Geprüft wird stattdessen: ohne Modul keine Wiki-Skript-, Lib- und Skill-Dateien.
- 2026-11-21T22:45Z · S2: Test vorher rot (Lib fehlte, Import schlägt fehl), danach grün: test-docs-wiki, test-docs-notion, test-install, test-update-classes, test-update, test-plugin, test-update-skill, test-docs-rules, privacy-scan je Exit 0 · M010 S2
- 2026-11-21T23:20Z · S3: Tests vorher rot (scanText not implemented), Worker `execution` Exit 1 (verify rot wegen Fehler im Test: `plainText` undefiniert); Sitzung hat den Testfehler behoben (1 Zeile), Rest war grün. Danach `bash scripts/test-all.sh` Exit 0 (inkl. privacy-scan; Secret-Beispiele im Test zur Laufzeit zusammengesetzt) · M010 S3
