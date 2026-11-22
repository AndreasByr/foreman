Status: validation · since 2026-11-22T01:10Z · R5 fertig, Validierung Runde 6
Target: dev
Batch-branch: batch/m010
Lock: free
Tracker: -
Pretest-round: 0
Wiki: no change (wiki is off in this repo)

# M010: Öffentliches Wiki

Start commit: cd07088 (Basis dev 9950ab9, nach Merge von main)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Konfiguration: Block `wiki`, check-config, Installer-Standardwert | done | M010 S1 | install.sh, scripts/check-config.sh (+Template-Kopie), scripts/test-check-config.sh, scripts/test-install.sh, docs/MODULES.md, CHANGELOG.md | Sprache fällt auf context.language zurück |
| S2 | Wiki-Dateien: Seitenformat, Kopfdaten, Skill `foreman-wiki`, Beispiel-Wiki im Test | done | M010 S2 | template/scripts/lib/docs-wiki.mjs, docs-notion.mjs (--wiki), test-docs-wiki.mjs, template/.claude/skills/foreman-wiki/SKILL.md, install.sh, update.py, test-install.sh, test-all.sh, MODULES.md, CHANGELOG.md | Veröffentlichen folgt in S3 (Exit 1 Platzhalter) |
| S3 | Veröffentlichen: `--wiki`, Wiki-Scan, Ablehnung, Hook ohne Wiki | done | M010 S3 | template/scripts/docs-notion.mjs, lib/docs-wiki-scan.mjs, lib/docs-wiki-publish.mjs, test-docs-wiki.mjs, install.sh, update.py, test-install.sh, MODULES.md, CHANGELOG.md | Seitentitel in Notion sind virtuelle Pfade (Lib nutzt Pfad als Titel); --dry-run meldet Kopffehler nur als Hinweis, scheitert nur an Scan-Treffern |
| S4 | Milestone-Todo: Vorlagen, foreman-brief, Prüfung der Wiki-Zeile in state-mirror | done | M010 S4 | _TEMPLATE (beide), foreman-brief (SKILL, brief-template), foreman-milestone (2 Kopien), state.mjs, state-mirror.mjs (2 Kopien), test-state-mirror.mjs, test-wiki-todo.sh, test-all.sh, MODULES.md, CHANGELOG.md | Wiki-Problem lässt state-mirror in jedem Modus mit Exit 1 enden; Todo-Text in Vorlagen englisch |
| R1 | Rework: Scan (Mehrzahl, Brief, Pfade, Dateinamen, mehr Secrets, Verbotsbegriffe über Zeilen), Titel statt Pfade, gleiche Wurzelseite, Slug-Prüfung, Dry-run Exit 4, `done` ohne Wiki-Zeile erlaubt, Kopfzeilen-Parser, Gate im Batch-Skill | done | M010 R1 | template/scripts/lib/docs-*.mjs, docs-notion.mjs, check-config.sh (2), state.mjs (2), state-mirror.mjs (2), foreman-batch/-milestone/-wiki Skills, Tests, MODULES.md, CHANGELOG.md | Marker-Zeile bleibt sichtbar (Titel statt Pfad); localhost/IPv4 bleiben gesperrt |
| R2 | Rework 2: Titel global eindeutig (Zielgruppen-Seiten inbegriffen), Seiten nur in Zielgruppen-Ordnern, Scan mit Beugung und Markup-Bereinigung, Namen mit Secret nie ausgeben, Wurzel-ID normalisiert, Wiki-Gate nur mit `--unit` (sonst WARN), Update-Test, Doku | done | M010 R2 | template/scripts/lib/docs-wiki*.mjs, docs-notion.mjs, check-config.sh (2), state-mirror.mjs (2), foreman-batch/-milestone/-wiki Skills, Tests, MODULES.md, CHANGELOG.md | Abweichung von Kriterium 7: `state-mirror --check --local` scheitert nur mit `--unit <Mnnn>`; ohne `--unit` nur WARN, damit alte Milestones nichts blockieren |
| R3 | Rework 3: Scan löst Markdown-Escapes und Links auf, Verbotsbegriffe nur als ganze Wörter, `offen`-Muster enger, `.MD`-Seiten, fremde Notion-Seiten werden nie überschrieben, Doku und Batch-Lauf-Hinweis | done | M010 R3 | template/scripts/lib/docs-wiki-scan.mjs, docs-wiki-publish.mjs, docs-notion.mjs (lib), batch-run.md, MODULES.md, CHANGELOG.md, test-docs-wiki.mjs | Abweichung: nur ganze Wörter plus s/n/en/es; Wiki-Hook gibt weiter Argumente durch |
| R4 | Rework 4 (Karte an den Maintainer, Empfehlung R4): Verbotsbegriffe auch in Link-/Bildzielen, Unicode-Trennstriche und Lookalikes, doppelte Dateinamen, leeres Wiki archiviert, Gate mit `--unit` prüft jeden Status außer done, Update-Test positiv | done | M010 R4 | template/scripts/lib/docs-wiki-*.mjs, docs-notion.mjs, state-mirror.mjs (2), Tests, MODULES.md, CHANGELOG.md | Entscheidungskarte war noch offen; `checked:`-Vermerk bleibt eine Behauptung (dokumentiert) |
| R5 | Rework 5 (Karte offen, Empfehlung R5): Text in Link-Klammern, Begriffe über Zeilenumbrüche, Brief-Varianten, Groß/Klein bei docs/Wiki, Skill-/Vorlagentexte, Changelog | done | M010 R5 | template/scripts/lib/docs-wiki-scan.mjs, docs-notion.mjs, Skills, brief-template.md, CHANGELOG.md, Tests | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | check-config meldet fehlerhafte wiki-Felder mit Exit 1, akzeptiert gültige; Install mit Modul legt Block (aus) an, ohne Modul kein „wiki“ | `bash scripts/test-check-config.sh`, `bash scripts/test-install.sh` | automatic | n/a |
| S2 | Skill und Beispiel-Wiki vorhanden; `--wiki --dry-run` listet je Seite eine Aktion, Exit 0 ohne Token und Netz | `node template/scripts/test-docs-wiki.mjs`, `bash scripts/test-update-classes.sh` | automatic | n/a |
| S3 | Struktur Wurzel→Zielgruppe→Seiten gegen Notion-Ersatz, idempotent, Kopfblock entfernt; Scan-Treffer, unbekannte Zielgruppe, fehlender Vermerk: Exit 4, nichts gesendet; Hook ruft `--wiki` nie | `node template/scripts/test-docs-wiki.mjs`, `bash scripts/test-install.sh` | automatic | n/a |
| S4 | Vorlagen und foreman-brief enthalten Todo und `Wiki:`-Zeile; state-mirror --check --local scheitert ohne Zeile bei Wiki an | `node template/scripts/test-state-mirror.mjs`, `bash scripts/test-wiki-todo.sh` | automatic | n/a |

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
- 2026-11-22T00:10Z · S4: Tests vorher rot (Vorlage ohne Todo, test-state-mirror Fehler), Worker execution_simple verify rot, Eskalation `execution` grün. Sitzung: Exit-Code nur bei Wiki-Problemen (nicht bei needs-input) eingeschränkt. `bash scripts/test-all.sh` Exit 0 · M010 S4
- 2026-11-22T00:40Z · Validierung 1 (A/B/C auf bf2a783): alle needs-remediation, 1 hoch (Scan verpasst Mehrzahl), mehrere mittel (Titel/Marker, gleiche Wurzelseite, done-Milestones, Gate nicht verdrahtet, Dry-run, installierter Test). Rework R1 mit Tests zuerst (rot bestätigt), danach grün; `bash scripts/test-all.sh` Exit 0 auf dem R1-Commit · M010 R1
- 2026-11-22T02:10Z · Validierung 2 (A/C needs-attention, B needs-remediation, 1 hoch: Titelkollision Zielgruppe/Seite). R2 Tests zuerst (rot bestätigt), Worker B Exit 1 (nur Skill-Texte offen, von der Sitzung ergänzt); `bash scripts/test-all.sh` Exit 0 · M010 R2
- 2026-11-22T03:10Z · Validierung 3 (A/B/C needs-attention: 2 mittlere in B, 1 in C Doku). R3 Tests zuerst (6 rot bestätigt), danach `bash scripts/test-all.sh` Exit 0 · M010 R3
- 2026-11-22T04:10Z · Validierung 4 (C pass, A needs-attention, B needs-remediation: 1 hoch Verbotsbegriff in Link-Zielen). R4 (4. Nacharbeit, Entscheidungskarte gestellt, parallel auf Empfehlung gearbeitet): Tests zuerst rot, danach `bash scripts/test-all.sh` Exit 0 · M010 R4
- 2026-11-22T06:10Z · Validierung 5 (A pass, C needs-attention Doku und Name, B needs-remediation: Text in Link-Klammern). R5 Tests zuerst rot, danach `bash scripts/test-all.sh` Exit 0 · M010 R5
