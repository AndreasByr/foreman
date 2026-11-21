Status: done · since 2026-11-21T19:05Z · UAT von Andreas abgenommen, PR #12 in dev (2f6c075)
Target: dev
Batch-branch: batch/m004
Lock: free
Tracker: -
Pretest-round: 0

# M004: Neues Projekt in bestehender Umgebung

Start commit: c3fb926

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Erkennen statt neu einrichten (foreman-project liest workspace.json, eine Rückfrage, Regel „not installed → setup“ fällt weg) | done | 4f684ed | plugins/foreman/skills/foreman-project/SKILL.md | |
| S2 | Skill-Beschreibungen abgrenzen, Routing-Test | done | 4f684ed | plugins/foreman/skills/foreman-project/SKILL.md, foreman-setup/SKILL.md (nur Beschreibung), scripts/test-project-routing.py, scripts/test-all.sh | |
| S4 | Installer-Werte (Flags, autopilot.waitHours im Check, check-config) | done | c836f77 | install.sh, template/scripts/lib/autopilot-check.mjs, template/scripts/check-config.sh, scripts/check-config.sh, Tests | |
| S3 | Projektfragen und Zusammenfassung (nach S4) | done | 1f8ea67 | plugins/foreman/skills/foreman-project/SKILL.md, references/project-questions.md, scripts/test-project-routing.py, docs/MODULES.md, README.md, docs/CONVENTIONS.md | |

Reihenfolge: S1, S2, S4, S3.

## Check plan per slice

| Slice | Success criterion (testable sentence) | Check (test file or command) | Kind (automatic / browser / human only) | Board |
|---|---|---|---|---|
| S1 | `foreman-project` hat keine Regel „nicht installiert → Setup“; beschreibt `workspace.json`-Lesen und die eine Rückfrage „Ist foreman schon eingerichtet?“ | `python3 scripts/test-project-routing.py` (Abschnitt Erkennung), `bash scripts/test-plugin.sh` | automatic | – (Chat-Text) |
| S2 | Beschreibungen grenzen ab; Testfragen „neues Projekt“ treffen nur `foreman-project`, Fragen zur ersten Einrichtung nur `foreman-setup` | `python3 scripts/test-project-routing.py`; echtes Routing im Chat = human only | automatic + human only | – |
| S4 | Install mit den Flags schreibt `context.timeZone`, `autopilot.batchHours`, `autopilot.waitHours`, `autopilot.mainAutoMerge`; ohne Flags unverändert; ungültige Werte Exit 2; `settingsFrom` liest `waitHours` | `bash scripts/test-install.sh`, `node template/scripts/test-autopilot-check.mjs`, `bash scripts/test-check-config.sh` | automatic | – |
| S3 | Fragenliste von `foreman-project` mit vorhandener `workspace.json`: nur Projektfragen, keine zu Maschinen, Gateway, Abos; Zusammenfassung vor dem Install-Befehl | `python3 scripts/test-project-routing.py` (Abschnitt Fragen) | automatic + human only | – |

## Mandatory questions per slice

("not applicable, because ..." is allowed; blank is not)

| Slice | 1 Permissions and tenant isolation | 2 Negative tests | 3 Failure cases | 4 Operations |
|---|---|---|---|---|
| S1 | not applicable, because reiner Skill-Text; keine Secrets, `workspace.json` trägt nur Namen | `workspace.json` fehlt, ungültig oder leer: genau eine Rückfrage | `workspace.json` nicht lesbar (Chat ohne Zugriff): Rückfrage statt Raten | Dateien liegen im Plugin; keine Migration |
| S2 | not applicable, because Beschreibungen; keine Rechte | Frage trifft keinen oder beide Skills = Test rot | not applicable, because kein externer Aufruf | Plugin-Validierung grün |
| S4 | `mainAutoMerge` nur boolesches `true` startet `main` von selbst; Default `false`; kein Secret-Wert | Zeitzone ungültig, Stunde 24, Wartezeit 0/`abc`/negativ, `--main-auto-merge maybe`, Flag ohne Wert | ungültig: Exit 2, nichts geschrieben; vorhandene `.foreman.json` bleibt | neue Flags, neuer Schlüssel `autopilot.waitHours`, keine neue Umgebungsvariable |
| S3 | not applicable, because Fragen im Chat; keine Secrets in Antworten oder Zusammenfassung | alle Antworten leer, „weiß nicht“, Quick ohne Autopilot-Fragen | not applicable, because kein externer Aufruf | Doku in MODULES, README, CONVENTIONS |

| R1 | Rework Runde 1 (Validierung 1): Hinweise/Frage, Zeitzone, Installer-Update, check-config, foreman-setup-Doku | done | 1e32242 | siehe VALIDATION.md | |
| R2 | Rework Runde 2: leere Zeitzone im Check, `timeZone` in workspace.json, Tracker-Frage | done | 3da9544 | siehe VALIDATION.md | |
| R3 | Antrag (dritte Runde): Zuordnungstabelle P1 bis P5 | done (freigegeben) | 4a54a00 | project-questions.md, test-project-routing.py | |

## Inherited red

Failures that existed before this milestone, each with the run on the start commit (command, exit code, SHA).

Keine: `bash scripts/test-all.sh` auf dem Startstand c377703 (Brief-Commit, gleicher Inhalt wie dev c3fb926 plus Brief) lief mit Exit 0.

## Open question (when `needs-input`)

Die Validierung Runde 3 fand einen mittleren Fund (P1-Zuordnung falsch, P2/P3/P5 fehlen). Er ist in 4a54a00 behoben und mit Test belegt, aber das wäre die dritte Reworkrunde (erlaubt: zwei). Frage an Andreas: dritte Runde zulassen (ein Prüfer, nur dieser Fund), danach Batch-PR? Empfehlung: ja, rein Doku und Test.

## Log

- 2026-11-21T17:50Z · Brief und STATE geschrieben · (Commit folgt)
- 2026-11-21T17:50Z · Rot vor der Änderung: `python3 scripts/test-project-routing.py` Exit 1 (9 FAIL) auf c377703 + Test
- 2026-11-21T17:58Z · S1+S2 fertig: test-project-routing.py Exit 0, test-all.sh Exit 0 · 4f684ed
- 2026-11-21T18:10Z · S4 rot vor der Änderung: test-autopilot-check.mjs, test-check-config.sh, test-install.sh je Exit 1 auf 4f684ed + neue Tests; grün danach: test-all.sh Exit 0 · c836f77
- 2026-11-21T18:15Z · S3 rot vor der Änderung: test-project-routing.py Exit 1 (16 FAIL) auf 9a28d30 + Test; grün danach: test-all.sh Exit 0 · 1f8ea67
- 2026-11-21T18:30Z · R1 1e32242, R2 3da9544, R3 4a54a00 (Antrag); Validierung Runde 3: A/C needs-attention (1 mittel), B pass; test-all.sh Exit 0 auf 4a54a00; Status needs-input
- 2026-11-21T18:55Z · Andreas gab die dritte Runde frei; R3b 148cd1d; test-all.sh Exit 0; Status batch-pr
- 2026-11-21T19:02Z · Batch-PR #12 gemergt nach dev (2f6c075), Checks test und guards grün · UAT offen
- 2026-11-21T19:05Z · UAT M004 approved (Andreas) · Status done
