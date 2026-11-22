# Milestone M006: foreman-update

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** D · Update · **Parallel to:** M002, M003, M008, M011 (M001 ist fertig und in `dev`)

## Goal
Ein installiertes Projekt lässt sich auf die aktuelle foreman-Version bringen, ohne projektspezifische Anpassungen zu verlieren. Der Weg besteht aus einem Update-Modus im Installer, einer Liste, welche Datei wem gehört, Upgrade-Hinweisen je Version und einem Chat-Skill, der den Ablauf führt. Am Ende frischt er die Projektanweisung auf.

## Starting point
foreman 0.2.1 (Unreleased darüber). `install.sh` kopiert `template/` in ein Zielrepo und überschreibt ohne `--force` nichts. `CHANGELOG.md` hat keinen Upgrade-Teil. `foreman-project-mode` kennt den Block `foreman-project-block v2` und beschreibt einen Refresh, hat aber keinen Versionsvergleich als Skript. M001 ist in `dev` und hat Verhaltensänderungen, die bestehende Projekte betreffen (Berichte `docs/agent-reports/2026-11-21-M001*.md`).

## Capabilities
1. Jede Datei aus `template/` hat genau eine Klasse: foreman-eigen, projekt-eigen oder gemischt.
2. `CHANGELOG.md` hat je Version einen Abschnitt „Upgrade“ (Dateien, Schritte, optional), ab 0.2.1 nachgetragen, plus den Stand „Unreleased“.
3. `install.sh --update` bringt ein Projekt auf den Stand des Repos: foreman-eigene Dateien werden aktuell, projekt-eigene bleiben, gemischte werden nur gezeigt. `--dry-run` listet alles, schreibt nichts. `version` in `.foreman.json` steigt erst nach Erfolg.
4. Der Chat-Skill `foreman-update` vergleicht Versionen, listet die Änderungen, schreibt eine nummerierte Checkliste mit Minuten für Schritte außerhalb des Repos und erzeugt den Auftrag für die Ausführung im Repo. Neue Module nur nach Ja.
5. Am Ende ruft `foreman-update` `foreman-project-mode` im Auffrischen-Modus auf. Ein Skript vergleicht die Version der Markierung `foreman-project-block`; die Checkliste hat die Zeile „Projektanweisung aktuell“ (oder „veraltet“ mit dem Schritt zum Auffrischen).

## Dependencies and order
Keine feste Reihenfolge zwischen den Fähigkeiten, außer: Klassen (1) vor Update-Modus (3), Update-Modus (3) vor Skill (4), Skill (4) vor Projektanweisung (5). M006 blockiert M007 und M012.

## Parallel milestones
M002, M003, M008, M011 laufen auf eigenen Batch-Branches. Geteilte Dateien: `install.sh`, `CHANGELOG.md`, `scripts/test-install.sh`, `docs/MODULES.md`. Regel: nur ergänzen, nie umbauen oder umsortieren. Vor dem Merge nach `dev` wird `dev` in den Batch-Branch gemergt.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M006-briefing.md`. Als Erfolgskriterien übernommen: `--dry-run` schreibt nichts; zweiter Lauf ändert nichts; fehlende oder ungültige `.foreman.json` und neuere Projektversion geben einen definierten Fehler ohne Schreiben; kein Schreiben außerhalb des Zielordners; ungesicherte lokale Änderungen an foreman-eigenen Dateien brechen ab; das Update liest keine Schlüsseldateien und lässt `context` und `mirror` unverändert. Der Upgrade-Hinweis nennt die Verhaltensänderungen aus M001.

## Binding documents
`docs/requirements.md`, `docs/roadmap-0.2.x.md` (Abschnitt M006), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `docs/versioning.md`, `CLAUDE.md`, Skill `foreman-project-mode` (Referenz `instruction-block.md`). Konfliktreihenfolge: requirements > roadmap > Brief.

## Fixed decisions
- Das Update läuft im Repo (`install.sh --update`). Der Chat-Skill führt es nicht selbst aus, er erzeugt den Auftrag und die Checkliste. Grund: Chat hat keinen sicheren Zugriff auf das Zielrepo, und das Repo-Skript ist testbar.
- Die Klassenliste ist eine Datei im Repo (`update-classes.json`), keine Logik im Skript. Grund: ein Test kann sie gegen `template/` prüfen.
- Gemischte Dateien (`CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `tools/delegate/config.toml`) werden nie überschrieben, nur gemeldet, mit Diff gegen die gerenderte Vorlage; fehlt eine, wird sie angelegt. Grund: sie lassen sich nicht automatisch zusammenführen.
- `version` in `.foreman.json` ist der letzte Schritt. Ein Fehler davor lässt sie unverändert.
- Ein Update fügt keine Module hinzu, auch nicht still. Neue Module nennt der Skill und übernimmt sie nur nach Ja.
- Jeder Fix bekommt zuerst einen fehlschlagenden Test.

## Data and interfaces
`install.sh` (`--update`, `--dry-run`), `update-classes.json`, `.foreman.json` (`foreman`, `modules`, `scope`, `agent`, `project`, `name`), `CHANGELOG.md`, `plugins/foreman/skills/foreman-update/`, `plugins/foreman/skills/foreman-project-mode/` (Versionsvergleich). Nur Variablennamen, keine Werte.

## Out of scope
- Update-Meldung im Dispatcher (M007).
- Automatisches Zusammenführen gemischter Dateien.
- Änderungen an die Referenzprojekte; deren Abweichungen fließen nur in die Klassen ein (Analysen F2/F3 der Fix-Pakete, soweit im Repo vorhanden).
- Downgrade auf eine ältere Version.
- Ein Release (Tag, Version `0.2.2`): bleibt bei Maintainer.

## Success criteria
1. Test: Jede Datei aus `template/` passt auf genau eine Regel in `update-classes.json`, keine Regel ist ohne Datei.
2. Test: Jede Version in `CHANGELOG.md` (Unreleased, 0.2.1 und älter, soweit vorhanden) hat den Abschnitt „Upgrade“; der Unreleased-Abschnitt nennt `pass_env`, `webhook_format` und `mainAutoMerge`.
3. Test: Testprojekt mit angepasster `CLAUDE.md` und `config.toml`: nach `install.sh --update` sind beide Dateien byte-gleich, foreman-eigene Dateien entsprechen dem Template, `check-config.sh` ist grün.
4. Test: `--dry-run` liefert die Liste und schreibt nichts (Hash gleich); zweiter Update-Lauf meldet „nichts zu tun“.
5. Test: Abgebrochenes Update (Zieldatei nicht schreibbar) lässt `version` unverändert; ungültige oder fehlende `.foreman.json`, neuere Projektversion und Pfad aus dem Zielordner heraus geben Fehler, nichts wird geschrieben.
6. Test: Ungesicherte lokale Änderung an einer foreman-eigenen Datei bricht ab, mit Liste, ohne Schreiben.
7. Plugin-Validierung grün mit `foreman-update`; ein Durchlauf-Test am Testprojekt prüft, dass der Skill Auftrag und nummerierte Checkliste mit Minuten beschreibt.
8. Test: Ein Block `foreman-project-block v0` (oder ohne Markierung) meldet „veraltet“ bzw. „fehlt“, der aktuelle Block „aktuell“.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/check-config.sh
Human only (UAT): Update an einem Wegwerf-Testprojekt (Flow A und B der Roadmap), Lesbarkeit der Checkliste, Anwendung des Projektanweisungs-Blocks im Claude-Projekt.

## Risks
`install.sh` und `scripts/test-install.sh` werden auch von M002, M003, M008 und M011 angefasst: nur ergänzen. Foreman-eigene Dateien mit lokalen Patches (zum Beispiel auf Host 1) werden überschrieben; dagegen helfen Dry-Run und die Prüfung auf ungesicherte Änderungen. Neue Template-Dateien aus parallelen Milestones brauchen eine Klasse, sonst fällt Test 1 rot: wer eine Datei in `template/` ergänzt, ergänzt auch `update-classes.json`.
