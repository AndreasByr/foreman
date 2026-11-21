# Milestone M009: docs-notion Spiegel

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** E · Docs · **Parallel to:** M004, M006, M007

## Goal
Das Modul `docs-notion` spiegelt die Repo-Docs eines Projekts in eine Richtung nach Notion: eine Seite pro Datei, die Übersicht ist die Elternseite ihrer Teildateien. Das Repo bleibt die einzige Quelle; in Notion Geändertes wird beim nächsten Lauf überschrieben. Ein Skript schreibt, nie ein Modell. Der Spiegel läuft im Batch-Lauf.

## Starting point
foreman 0.2.1, M008 ist abgenommen: `template/docs/docs-rules.md` legt Übersicht plus gleichnamigen Ordner (Teile) fest, Schwelle 5000 Wörter. `install.sh` kennt die Module `tracker-itsaplan`, `tracker-linear`, `delegate`, `gateway`, `autopilot`, `pretest`; `notion` wird mit „notion was removed in 0.2“ abgelehnt, und `scripts/test-install.sh` prüft die Ablehnung sowie dass ohne Modul kein installiertes File „notion“ enthält. Der Batch-Lauf steht in `template/.claude/skills/foreman-dispatch-run/references/batch-run.md` und merged nach `dev` oder `main`. Skripte für Projekte liegen in `template/scripts/` (Node 20, `.mjs`, ohne Abhängigkeiten) und stehen in `update-classes.json`. Tracker-Mirror (`state-mirror.mjs`) ist das Vorbild: Skript schreibt, Modelle nie.

## Capabilities
1. **Modul:** `install.sh --modules docs-notion` installiert das Modul; ohne das Flag ändert sich an der Installation nichts. Die Sperre für `notion` in `install.sh` und `scripts/test-install.sh` fällt weg; die neuen Prüfungen (Install mit und ohne Modul) ersetzen sie. `docs/MODULES.md` führt das Modul mit „Adds“ und „Needs“.
2. **Spiegel-Skript:** Ein Skript liest die Markdown-Docs des Projekts und legt je Datei eine Notion-Seite unter einer konfigurierten Wurzelseite an oder aktualisiert sie. Eine Übersicht (Datei mit gleichnamigem Ordner nach `docs-rules.md`) ist die Elternseite ihrer Teile. Der Seiteninhalt wird bei jedem Lauf vollständig aus der Datei ersetzt, also überschreibt der Lauf Änderungen in Notion. Gelöschte Dateien archivieren ihre Seite. `--dry-run` listet Seiten und Aktionen (neu, aktualisiert, archiviert, unverändert) und braucht weder Token noch Netz.
3. **Auslöser:** Der Batch-Lauf ruft das Skript nach dem Merge ins Ziel (`dev` oder `main`) auf, wenn das Modul installiert ist. Kein Modell schreibt nach Notion. Ein Fehler des Spiegels blockiert weder Merge noch das Schließen der Einheit; er wird im Bericht gemeldet. Ohne das Modul bleiben `batch-run.md` und alle installierten Dateien ohne Hinweis auf Notion.
4. **Sicherheit und Limits:** Kein Secret in Log, Fehlertext, Argumenten oder Dateien. Die Notion-Grenzen (Anfragerate, Blöcke je Anfrage, Textlänge je Block) werden eingehalten; bei HTTP 429 wartet das Skript nach `Retry-After` und versucht begrenzt erneut.

## Dependencies and order
M008 (abgenommen) ist die Grundlage. M010 (Wiki) baut auf diesem Milestone auf. Slices in der Reihenfolge: Modul, Spiegel-Skript, Auslöser, Sicherheit. Die Tests der Slices 2 bis 4 laufen gegen einen lokalen Notion-Ersatz (Test-HTTP-Server); die API-Adresse ist für Tests überschreibbar.

## Parallel milestones
M004, M006, M007. Geteilte Dateien: `install.sh`, `scripts/test-install.sh`, `scripts/test-all.sh`, `docs/MODULES.md`, `update-classes.json`, `CHANGELOG.md`, `template/.claude/skills/foreman-dispatch-run/`. Nur ergänzen, nie umbauen. Vor dem Merge `dev` einmergen und Konflikte lösen.

## Surface
Keine UI (Skript, Installer, Doku). Die Notion-Struktur prüft der Mensch im UAT.

## Accessibility
Nicht gefordert (foreman hat keine eigene UI).

## Role review findings
Bericht: `docs/role-reviews/M009-briefing.md`. Als Erfolgskriterien übernommen: kein Token in Ausgaben; nur Dateien im Docs-Ordner (kein `..`, keine Symlinks nach außen); 429-Pause; Notion-Grenzen (100 Blöcke je Anfrage, 2000 Zeichen je Text); Tabellen und Codeblöcke verlieren keinen Inhalt; zweiter Lauf ohne Änderung erzeugt keine Duplikate; Abbruch mitten im Lauf heilt beim nächsten Lauf; Spiegel-Fehler blockiert den Batch-Lauf nicht.

## Binding documents
`docs/requirements.md` (Abschnitt „Must-have: Modul `docs-notion`“), `docs/roadmap-0.2.x.md` (Abschnitt M009), `template/docs/docs-rules.md`, `docs/MODULES.md`, `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: Requirements, Design, Roadmap, dieser Brief.

## Fixed decisions
- Einbahn Repo → Notion. Kein Rückweg, kein Merge von Notion-Änderungen.
- Das Skript ist Node 20 ohne Abhängigkeiten (`fetch` des Laufzeit-Systems), liegt in `template/scripts/` und wird nur mit dem Modul installiert.
- Der Token kommt allein aus der Umgebungsvariable `NOTION_API_KEY` (nur der Name steht im Repo). Die Wurzelseite steht in `.foreman.json` unter `docsNotion` (Seiten-ID, Liste der Docs, Ausschlüsse); der Installer legt Standardwerte an. Ohne Token oder Wurzelseite endet das Skript mit klarer Meldung und eigenem Exit-Code, außer bei `--dry-run`.
- Standardmäßig gespiegelt: Markdown unter `docs/` außer Berichte (`agent-reports`), `answers`, `uat`, `wiki` und `STATE.md`. Ein-/Ausschluss ist über `.foreman.json` änderbar.
- Zuordnung Datei → Seite braucht keinen lokalen Zustand: Das Skript findet seine Seiten unter der Wurzelseite wieder (zum Beispiel über einen festen Seitentitel nach Pfad). Ein Lauf ist wiederholbar und idempotent.
- Der Auslöser ist ein Schritt im Batch-Lauf (nach dem Merge). Der Bestandstext von `batch-run.md` bleibt ohne das Wort „notion“; der Hinweis kommt über einen allgemeinen Mechanismus (zum Beispiel ein vorhandenes Nach-Merge-Skript), den nur das Modul installiert. Der Agent wählt die kleinste Lösung und beschreibt sie im Bericht.
- Das Wiki (M010) und der dritte Spiegel im Claude-Projekt gehören nicht hierher.
- Sprache von Skript und Doku: Englisch (CONVENTIONS).

## Data and interfaces
Neue Dateien: Spiegel-Skript mit Bibliothek und Test in `template/scripts/` (Test in `scripts/test-all.sh`), Nach-Merge-Mechanismus, Installer-Anpassung, Eintrag in `update-classes.json`. Geändert: `install.sh`, `scripts/test-install.sh`, `docs/MODULES.md`, `template/.claude/skills/foreman-dispatch-run/references/batch-run.md` (nur der generische Schritt), `CHANGELOG.md`, `docs/learnings.md` (falls etwas Neues). Umgebungsvariable: `NOTION_API_KEY` (Name, kein Wert). Externe Schnittstelle: Notion-API (Seiten, Block-Kinder, Archivieren).

## Out of scope
- Wiki, Zielgruppen, Veröffentlichung nach außen (M010).
- Dritter Spiegel im Claude-Projekt.
- Rückweg Notion → Repo, Notion als Tracker.
- Echter Lauf gegen Notion durch den Agent: kein Token in der Cloud; den echten Lauf macht der Mensch im UAT.
- Änderungen an anderen Projekten (Abnahme nur gegen ein Wegwerf-Testprojekt).

## Success criteria
1. `install.sh --modules docs-notion` listet das Modul in `.foreman.json` und installiert das Skript samt Standardwerten. Ohne das Flag fehlt beides, und kein installiertes File enthält „notion“. Der alte Ablehnungstest ist ersetzt; `bash scripts/test-install.sh` ist grün.
2. `--dry-run` auf einem Beispiel-Docs-Ordner (Übersicht mit Teilen, Einzeldateien) listet je Datei genau eine Seite, die Teile unter der Übersicht, mit der Aktion `sync`; Exit-Code 0, ohne Token und ohne Netz. Mit Token und Wurzelseite klassifiziert `--dry-run` nur lesend in neu, aktualisiert, archiviert, unverändert.
3. Gegen den lokalen Notion-Ersatz erzeugt ein Lauf die Seitenstruktur der Beispiel-Docs; ein zweiter Lauf ohne Änderung erzeugt keine neuen Seiten; eine am Ersatz geänderte Seite ist nach dem nächsten Lauf zurückgesetzt; eine gelöschte Datei archiviert ihre Seite.
4. Tabellen, Codeblöcke, Überschriften und Listen aus einem Beispiel stehen als Notion-Blöcke im Ersatz; unbekannte Syntax steht als Text, kein Inhalt geht verloren.
5. Eine Datei mit mehr als 100 Blöcken und ein Absatz mit mehr als 2000 Zeichen werden in zulässigen Anfragen übertragen.
6. Ein simulierter 429 mit `Retry-After` führt zu einer Pause und danach zum Erfolg; dauerhafter 429 endet nach begrenzten Versuchen mit Fehler, nicht in einer Endlosschleife.
7. Ein Lauf mit erkennbarem Fake-Token (auch bei Fehler, 401 und 429) schreibt den Token in keine Ausgabe und keine Datei. Pfade außerhalb des Docs-Ordners (`..`, Symlink nach außen) werden übersprungen und gemeldet.
8. `batch-run.md` ruft das Skript nach dem Merge auf, wenn das Modul installiert ist; ein Test prüft, dass der Aufruf im Batch-Lauf-Ablauf steht und ohne Modul nirgends in installierten Dateien erscheint. Ein Spiegel-Fehler stoppt den Batch-Lauf nicht.
9. `docs/MODULES.md` führt das Modul; `update-classes.json` führt die neuen Dateien; `bash scripts/test-all.sh` ist grün, Privacy-Scan findet nichts.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/test-install.sh
bash scripts/test-update-classes.sh
bash scripts/test-plugin.sh
bash scripts/privacy-scan.sh
Human only (UAT): Echter Lauf gegen eine Test-Seite in Notion mit eigenem Token; Struktur und Überschreiben prüfen.

## Risks
Markdown-Tabellen und Codeblöcke werden in Notion anders dargestellt; die Umwandlung ist fest definiert und getestet. Die Notion-API ändert sich oder drosselt stärker als erwartet; der lokale Ersatz bildet nur die dokumentierten Grenzen nach, daher die Pflicht zum echten Lauf im UAT. Die Seitenzuordnung ohne lokalen Zustand kann bei umbenannten Dateien eine Seite archivieren und neu anlegen; das ist gewollt und im Bericht zu nennen. Geteilte Dateien erzeugen Merge-Konflikte mit M004, M006 und M007.
