Status: batch-pr · since 2026-11-21T18:25Z · Slices S1-S6, R1, R2 done, Validierung pass (Runde 3), dev eingemergt, UAT-Liste liegt vor
Target: dev
Batch-branch: batch/m006
Lock: free
Tracker: -
Pretest-round: 0

# M006: foreman-update

Start commit: c6b3149 (dev, Baseline: bash scripts/test-all.sh exit 0)

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Dateiklassen | done | 5f0deb7 | update-classes.json, scripts/test-update-classes.sh | |
| S2 | Upgrade-Abschnitte | done | ec101eb | CHANGELOG.md, scripts/test-changelog.sh | |
| S3 | `install.sh --update` | done | 740ee69 | install.sh, scripts/update.py, scripts/test-update.sh | |
| S4 | Skill foreman-update | done | 45134b6 | plugins/foreman/skills/foreman-update/, scripts/test-update-skill.sh | |
| S5 | Projektanweisung | done | 0a50add | plugins/foreman/skills/foreman-project-mode/ (Skript + Doku), foreman-update, scripts/test-project-block.sh | |
| S6 | Doku und Learnings | done | 86eea2b | docs/MODULES.md, README.md, docs/learnings.md | |
| R1 | Rework Runde 1 (Validierung): Git-Worktree und Unterordner, Diff für gemischte Dateien, `check-config` im Projekt, Skill-Test mit Durchlauf, CHANGELOG-Struktur | done | b0c4d16 | scripts/update.py, install.sh, SKILL.md, CHANGELOG.md, docs/MODULES.md, Tests | |
| R2 | Rework Runde 2 (Validierung): Git-Fehler brechen ab statt still zu schreiben, Version aus Pre-Release heben, schärfere Tests, Texte | done | 98c0435 | scripts/update.py, Tests, CHANGELOG.md, Skills | |

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | Jede Datei aus `template/` passt auf genau eine Regel in `update-classes.json`; keine Regel ohne Datei; Klassen nur `foreman`, `project`, `mixed` | `bash scripts/test-update-classes.sh` | automatic | n/a, keine UI |
| S2 | Jede Version in `CHANGELOG.md` hat „### Upgrade“; Unreleased nennt `pass_env`, `webhook_format`, `mainAutoMerge` | `bash scripts/test-changelog.sh` | automatic | n/a |
| S3 | Siehe Brief 3 bis 6: Anpassungen bleiben, Dry-Run schreibt nichts, zweiter Lauf „nichts zu tun“, Version erst nach Erfolg, Fehlerfälle ohne Schreiben, ungesicherte Änderungen brechen ab | `bash scripts/test-update.sh`, `bash scripts/test-install.sh` | automatic | n/a |
| S4 | Plugin-Validierung grün mit dem neuen Skill; Skill beschreibt Versionsvergleich, Änderungsliste, nummerierte Checkliste mit Minuten, Auftrag, Module nur nach Ja | `bash scripts/test-update-skill.sh`, `bash scripts/test-plugin.sh` | automatic | n/a |
| S5 | Block `v0` meldet „outdated“, aktueller Block „current“, ohne Markierung „missing“; Checklistenzeile im Skill | `bash scripts/test-project-block.sh` | automatic | n/a |
| S6 | `docs/MODULES.md`, `README.md` nennen `--update`; Begründungen in `docs/learnings.md`; Skills nur Regel | `bash scripts/test-update-docs.sh`, `bash scripts/test-all.sh` | automatic | n/a |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | Kein Mandanten-Konzept. Falsche Klasse `foreman` würde Projektdateien überschreiben: Test fixiert die Klassen der Projektdateien (config.toml, learnings.md, release-path.md) | Datei ohne Regel, Regel ohne Datei, zwei Regeln auf eine Datei, unbekannte Klasse | `update-classes.json` fehlt oder ist kaputt: Test rot | Neue Template-Dateien paralleler Milestones brauchen eine Klasse (Brief, Risks) |
| S2 | Not applicable, because reiner Text | Version ohne Abschnitt; Abschnitt leer | Not applicable, because kein Laufzeitverhalten | CHANGELOG ist geteilte Datei: nur ergänzen |
| S3 | Schreiben nur im Zielordner (Symlink, `..`); keine Schlüsseldateien; `context`/`mirror` unverändert | Kaputte oder fehlende `.foreman.json`, neuere Projektversion, Modul aus, Zieldatei ist Verzeichnis, unbekannte Option | Abbruch beim Schreiben: `version` unverändert, erneuter Lauf stellt fertig | Bestehende Projekte (Guildora, Kasev, Office) nur nach Release über den Skill; Dry-Run zuerst |
| S4 | Der Skill schreibt nie in Zielrepos und kennt keine Schlüssel; Checkliste nennt nur Variablennamen | Gleiche Version: „aktuell“; Projekt neuer als foreman: Abbruch mit Hinweis | Repo nicht erreichbar: Skill nennt den Auftrag als Text für Claude Code | Plugin-Version und `VERSION` müssen zusammenpassen (Test besteht) |
| S5 | Block ändert keine Rechte; Skript liest nur Text | Leerer Text, nur Marker ohne Version, Version höher als bekannt, zwei Blöcke | Referenzdatei nicht lesbar: definierter Fehler | Neuer Block-Stand: Version in beiden Markerzeilen erhöhen (Hinweis steht schon) |
| S6 | Not applicable, because Doku | Doku nennt `--update` nicht: Test rot | Not applicable, because kein Laufzeitverhalten | Geteilte Dateien: nur ergänzen |

## Inherited red

Keine bekannt. Baseline: `bash scripts/test-all.sh` auf `c6b3149`, Exit 0.

## Open question (when `needs-input`)

Keine.

## Log

- 2026-11-21T17:10Z · Brief, Role Review und STATE.md geschrieben · batch/m006
- 2026-11-21T16:59Z · S1 done · green · 5f0deb7
- 2026-11-21T17:01Z · S2 done · green · ec101eb
- 2026-11-21T17:06Z · S3 done · green · 740ee69
- 2026-11-21T17:08Z · S4 done · green · 45134b6
- 2026-11-21T17:10Z · S5 done · green · 0a50add
- 2026-11-21T17:13Z · S6 done · green · 86eea2b
- 2026-11-21T17:21Z · R1 done · green · b0c4d16
- 2026-11-21T17:29Z · R2 done · green · 98c0435
- 2026-11-21T18:25Z · Validierung Runde 3 pass, dev (M002/M003/M011) eingemergt, Abschlusslauf test-all Exit 0 · a2ef578
