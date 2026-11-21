# Milestone M005: itsaplan-Vorlage und englische Namen

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** C · Einrichtung · **Parallel to:** M007, M009

## Goal
Ein neues itsaplan-Projekt entsteht aus einer Vorlage im Repo mit englischen Spalten, Labels und der Ansicht „UAT ready“. Von Hand bleibt nur das Bot-Konto als Mitglied. `check-config.sh` meldet jeden Spalten- oder Label-Namen, der nicht dem englischen Soll entspricht.

## Starting point
foreman 0.2.1 plus M001 bis M004, M006, M008, M011 in `dev`. Der Mirror (`scripts/lib/itsaplan-mirror.mjs`) erwartet bereits englische Namen: Spalten `Backlog`, `Todo`, `In Progress`, `Action Required` (Alias „Intervention needed“), `Wait for Merge`, `Testing`, `In Review`, `Done`; Labels `Milestone`, `Fix pack` und `AP: <Phase>`. Heute legt der Mensch Spalten und Labels von Hand an (`docs/trackers.md`, `foreman-project/references/tracker-and-dispatcher.md`, Schritt 6). `foreman-setup` und `foreman-project` kennen keine Vorlage. `check-config.sh` prüft `.foreman.json`, aber keine Tracker-Namen. `docs/workspace.schema.json` hat einen Block `tracker`. Die itsaplan-Tools `import_project_template`, `list_project_templates` und `create_project` gibt es; das Exportformat ist `itsaplan.project-template`, Version 1 (Quelle: itsaplan `apps/api/src/modules/project-templates`, `SharedProjectTemplate`).

## Capabilities
1. **Vorlage im Repo:** Eine Datei im Format `itsaplan.project-template` Version 1 mit den acht Spalten (mit `stateType`), allen englischen Labels (`Milestone`, `Fix pack`, `AP: Coding`, `AP: Fix round`, `AP: Action Required`, `AP: Waiting for merge`, `AP: Pretest waiting`, `AP: Pretest running`, `AP: UAT ready`, `AP: Release ready`), der Ansicht „UAT ready“ (gefiltert auf das Label `AP: UAT ready`) und Issue-Vorlagen für Eingriff, UAT und Update-Meldung. Alle Namen und Texte Englisch.
2. **Vorlage prüfen:** Ein Skript validiert die Vorlage offline gegen das Exportformat (nur bekannte Schlüssel, eindeutige Namen und Positionen, gültige Verweise, ein Standard-Issue-Typ) und gegen den Mirror: Für jeden Einheitenstatus findet der Mirror Spalte und Label in einem Projekt, das aus der Vorlage käme.
3. **Import im Setup:** `foreman-setup` importiert die Vorlage einmal pro Workspace (nur wenn der Tracker itsaplan ist und eine Vorlage fehlt, sonst überspringen) und hält fest, dass sie importiert ist.
4. **Projekt aus Vorlage:** `foreman-project` legt das itsaplan-Projekt aus der Vorlage an und nennt den einzigen Handschritt: das Bot-Konto als Mitglied hinzufügen. Schritt 6 beschreibt keine manuelle Anlage von Spalten und Labels mehr.
5. **Namensprüfung:** `check-config.sh` (Repo-Kopie und Vorlagen-Kopie) prüft bei Tracker itsaplan mit gesetzten Variablen die Spalten und Labels des Projekts. Fehlt ein englischer Soll-Name oder steht ein unbekanntes `AP:`-Label im Projekt (zum Beispiel ein übersetztes), endet der Check mit Exit 1 und nennt gefundenen Namen und englisches Soll. Ohne Variablen oder bei anderem Tracker überspringt er die Prüfung ohne Fehler.
6. **Dokumentiert:** `docs/trackers.md`, `docs/MODULES.md`, `README.md`, `CHANGELOG.md` und der Upgrade-Hinweis (eine Vorlage ändert angelegte Projekte nicht nachträglich) nennen die Vorlage, den Handschritt und die Prüfung.

## Dependencies and order
M004 (abgenommen, in `dev`). Blockiert M012. Reihenfolge: S1 (Vorlage) und S4 (Namensprüfung) unabhängig; S2 und S3 setzen S1 voraus. Vorschlag: S1, S4, S2, S3.

## Parallel milestones
M007 und M009. Geteilte Dateien: `install.sh`, `template/scripts/check-config.sh`, `docs/MODULES.md`. Nur ergänzen, nie umbauen; bei Merge-Konflikten beide Seiten behalten. M007 und M012 hängen an `update-classes.json`: neue Dateien in `template/` dort einordnen.

## Surface
Keine UI im Repo (Skill-Text, Skript, JSON-Datei). Die Ansicht „UAT ready“ entsteht in itsaplan aus der Vorlage; sie hat nur Name und Filter, kein eigenes Layout. Kein Board nötig.

## Accessibility
Nicht gefordert.

## Role review findings
Briefing-Modus ohne UI, nur Risikovorschau. Daraus Erfolgskriterien 4, 6 und 8: kein Zugriff auf echte Tenants, kein Secret in Ausgaben, Fehlerpfade der Namensprüfung (API nicht erreichbar, falsche Schlüssel, leeres Projekt).

## Binding documents
`docs/requirements.md` (Abschnitt itsaplan-Projektvorlage), `docs/roadmap-0.2.x.md` (M005), `docs/trackers.md`, `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `docs/MODULES.md`, `CLAUDE.md`. Konflikt: requirements, design, roadmap, dieser Brief.

## Fixed decisions
- **Quelle der Vorlage:** Sie wird aus dem Exportformat und den Namen in `docs/trackers.md` von Hand geschrieben, nicht aus Guildora exportiert. Grund: Guildora, Kasev und Office sind für foreman tabu, und die Umbenennung der Guildora-Labels (Fix-Paket in Guildora) ist nicht nötig. Das weicht von der Roadmap ab; Andreas entscheidet im UAT, ob später ein Export aus einem Projekt nachgezogen wird.
- Kein Live-Zugriff auf itsaplan im Lauf. Weder Import noch Projektanlage noch Namensprüfung laufen gegen die echte Instanz; Tests nutzen Dateien und eine Stub-Antwort der API. Der echte Lauf ist die Abnahme von Andreas gegen ein Wegwerf-Projekt.
- Die Vorlage enthält keine Personen, keine Zugangsdaten, keine URLs. `foreman-project` fügt den Bot nie hinzu.
- Die Spalten haben die `stateType` `backlog` (Backlog), `unstarted` (Todo), `completed` (Done), alle anderen `started`.
- Vorlagenname in itsaplan: `foreman`. Ist eine Vorlage dieses Namens schon importiert, wird sie nicht doppelt importiert.
- `foreman-setup` darf den Tracker-Teil (Block C) nur bei der eigenen Aussage „quick prototype“ überspringen; abgeleitet wird das nie.
- Phasen-Präfix bleibt `AP: `; `tracker.columnAliases` und der Alias „Intervention needed“ bleiben gültig.
- Die Namensprüfung ist nur lesend (GET), nutzt den vorhandenen Client in `scripts/lib/itsaplan-api.mjs` und gibt nie den Schlüssel aus.

## Data and interfaces
Vorlagen-Datei (Ablage im Plugin, so dass die Chat-Skills sie lesen; nicht in `template/`, damit sie nicht in jedes Projekt kopiert wird), Validierungsskript, Skills `foreman-setup` und `foreman-project`, `check-config.sh`, itsaplan-REST (`GET` Projekt, Spalten, Labels), Variablen `ITSAPLAN_URL`, `ITSAPLAN_API_KEY`, `mirror.itsaplan.projectKey` in `.foreman.json`. Nur Namen von Variablen.

## Out of scope
- Export aus Guildora, Kasev oder Office; jede Änderung dort.
- Echter Import oder echtes Projekt in itsaplan durch den Agenten.
- Nachträgliches Umbauen schon angelegter Projekte (nur Hinweis im Upgrade-Abschnitt).
- Linear-Vorlage; Dashboard-Vorlagen.
- Bot-Konto anlegen oder hinzufügen.

## Success criteria
1. Die Vorlagen-Datei besteht das Validierungsskript: Format `itsaplan.project-template`, Version 1, nur Schlüssel des Exportformats, eindeutige Namen und Positionen, alle Verweise gültig.
2. Sie enthält genau die acht Spalten mit den festgelegten `stateType`, die zehn Labels, die Ansicht „UAT ready“ mit Filter auf `AP: UAT ready` und drei Issue-Vorlagen (Intervention, UAT, Update notice); kein Name enthält deutsche Wörter (Test gegen eine Wortliste).
3. Test: Für jeden Status aus `TARGETS` plant der Mirror (`plan`) gegen ein aus der Vorlage gebautes Projekt ohne Fehler.
4. Test: Eine Kopie der Vorlage mit einem deutschen Label, einer fehlenden Spalte oder einem doppelten Namen lässt das Validierungsskript scheitern (rot vor, grün nach der Änderung).
5. `foreman-setup` beschreibt den einmaligen Import (Aufruf `list_project_templates` zuerst, Import nur bei fehlender Vorlage, Überspringen nur bei „quick prototype“ oder Tracker ≠ itsaplan); `foreman-project` Schritt 6 beschreibt Anlage aus der Vorlage und den einen Handschritt; `bash scripts/test-plugin.sh` und `python3 scripts/test-setup-catalog.py` grün, Skill-Dateien unter der Größenwarnung.
6. Test (Stub-API): Ein Projekt mit Label „AP: UAT bereit“ lässt `check-config.sh` mit Exit 1 enden; die Ausgabe nennt „AP: UAT bereit“ und das englische Soll. Ein Projekt mit allen Namen endet mit Exit 0. Ohne Variablen Exit 0 mit Hinweis. API-Fehler (401, nicht erreichbar) ergibt eine Warnung ohne Schlüssel in der Ausgabe.
7. `scripts/test-update-classes.sh` bleibt grün (neue Dateien in `template/` sind eingeordnet).
8. `bash scripts/test-all.sh` grün.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/test-check-config.sh
bash scripts/test-plugin.sh
bash scripts/test-update-classes.sh

## Risks
- Das Exportformat kann sich in itsaplan ändern; geprüft ist nur Version 1 laut Quellstand. Der echte Import ist erst im UAT bewiesen (Human only).
- Filter-Format der Ansicht ist ein Blob der itsaplan-Oberfläche; Schlüssel (`conditions`, `field: labels`, `values`) folgen der Quelle, die Abnahme zeigt, ob die Ansicht filtert.
- Die Namensprüfung braucht Netz und Schlüssel; in CI läuft sie nicht, nur lokal oder im Dispatcher-Lauf.
- `install.sh` und `check-config.sh` sind geteilt mit M007 und M009: Konfliktgefahr.
- Kasev hat ein älteres Phasen-Modell; die Vorlage folgt dem Modell von foreman 0.2.
