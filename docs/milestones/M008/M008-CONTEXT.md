# Milestone M008: Docs-Regeln und Aufteilen

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** E · Docs · **Parallel to:** M001, M002, M003, M006, M011

## Goal
Eine Regeldatei legt fest, welche Dokumente ein Projekt hat, wo sie liegen, wer sie schreibt und wann große Dokumente in Übersicht und Teildateien geteilt werden. Ein Agent weiß das ohne Rückfrage. Ein Test erkennt eine Stand-Zeile mit mehr als einer Version.

## Starting point
foreman 0.2.1. `docs/CONVENTIONS.md` regelt Sprache, Namen, Branches, Status und Größenlimits für Skills, aber nicht, welche Projekt-Dokumente es gibt und wann sie geteilt werden. `template/docs/` enthält `learnings.md`, `release-path.md`, `trackers.md`, `versioning.md`, `test-login.md`, `fixpacks/`, `milestones/`, `routines/`. `foreman-roast` und `foreman-roadmap` schreiben `docs/requirements.md` und `docs/roadmap-<version>.md`, kennen aber keine Regel zum Aufteilen. In Projekt B trägt die Stand-Zeile der Roadmap den Verlauf der Versionen 9 bis 27 in einem Absatz; jeder Lauf liest ihn mit. M009 (Notion-Spiegel) baut auf dieser Regel auf.

## Capabilities
1. **Regeldatei:** Eine Datei in `template/docs/` nennt, welche Dokumente ein Projekt hat (Requirements, Roadmap, Design, Milestone-Briefs, Fix-Packs, Learnings, Berichte), wo jedes liegt, wer es schreibt und wann es aktualisiert wird. Sie ergänzt `docs/CONVENTIONS.md`; keine Regel steht an beiden Stellen.
2. **Aufteilen:** Die Regel beschreibt das Projekt B-Muster: eine Übersicht (`docs/requirements.md`, `docs/roadmap-<version>.md`) plus Teildateien in einem gleichnamigen Ordner (`docs/requirements/01-….md`, `docs/roadmap-<version>/M001-….md`). Die Übersicht trägt Version und Änderungsverlauf, eine Tabelle „Datei | Inhalt | Lesen bei“ und die Konfliktreihenfolge. Die Regel nennt die Schwelle für das Aufteilen als Zahl.
3. **Stand-Zeile:** Die Regel legt fest: Die Stand-Zeile nennt nur die aktuelle Version und die letzte Änderung. Der Verlauf steht darunter oder im Git-Log.
4. **Prüfung:** Ein Skript meldet eine Stand-Zeile mit mehr als einer Version und eine fehlende oder doppelte Stand-Zeile in einer Übersicht. Beispiele für gültig und ungültig liegen im Repo und im Test.
5. **Verweise:** `foreman-roast` und `foreman-roadmap` verweisen auf die Regel, ohne sie zu wiederholen. Die Skills bleiben unter ihrem Größenlimit.

## Dependencies and order
Keine. M008 blockiert M009 (Freigabe nach UAT). Reihenfolge der Slices: Regeldatei, Aufteilen und Stand-Zeile, Prüfung, Verweise.

## Parallel milestones
M001, M002, M003, M006, M011. Geteilte Dateien: `docs/CONVENTIONS.md`, `template/docs/`, `scripts/test-all.sh`, `CHANGELOG.md`. M003 und M006 ändern `plugins/foreman/skills/` und `docs/MODULES.md`; hier nur ergänzen, nie umbauen. Vor dem Merge `dev` einmergen und Konflikte lösen.

## Surface
Keine UI (Regeldatei, Skript, Chat-Skills).

## Accessibility
Nicht gefordert (foreman hat keine eigene UI).

## Role review findings
Bericht: `docs/role-reviews/M008-briefing.md`. Als Erfolgskriterien übernommen: Datum, Zahl und andere Ziffern in der Stand-Zeile zählen nicht als Version; eine Stand-Zeile mit Versionsbereich („Version 9 bis 27“) oder Liste („v9, v10“) gilt als mehrere Versionen; Beispiele und Testdaten enthalten nur erfundene Projektdaten, der Privacy-Scan bleibt grün.

## Binding documents
`docs/requirements.md` (Abschnitt „Must-have: Modul `docs-notion`“, Punkte Docs-Regeln und Aufteilen, und Roast-Notiz zur Stand-Zeile), `docs/roadmap-0.2.x.md` (Abschnitt M008), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: Requirements, Design, Roadmap, dieser Brief.

## Fixed decisions
- Die Regel steht in einer Datei unter `template/docs/` (Projekte bekommen sie bei der Installation). `docs/CONVENTIONS.md` verweist nur darauf.
- Die Schwelle zum Aufteilen ist eine Zahl: mehr als 5000 Wörter pro Datei. Maintainer prüft sie im UAT gegen die Projekt B-Requirements; Änderung der Zahl ist ein Korrektur-Auftrag.
- Eine Stand-Zeile hat genau eine Version. Das Prüfskript ist rein lesend und verändert keine Dokumente.
- Das Aufteilen der eigenen foreman-Dokumente (`docs/requirements.md`, `docs/roadmap-0.2.x.md`) gehört nicht zu diesem Milestone.
- Die Regel erklärt nicht, warum sie existiert; Begründung nach `docs/learnings.md`.
- Sprache der Regeldatei und der Skripte: Englisch (CONVENTIONS), Beispiele dürfen deutsche Stand-Zeilen enthalten.

## Data and interfaces
Neue Dateien: Regeldatei in `template/docs/`, Prüfskript mit Test und Beispieldaten. Geändert: `docs/CONVENTIONS.md`, `plugins/foreman/skills/foreman-roast/`, `plugins/foreman/skills/foreman-roadmap/`, `scripts/test-all.sh`, `docs/learnings.md`, `docs/MODULES.md` (nur falls eine Zeile nötig ist). Keine Umgebungsvariablen, keine Secrets.

## Out of scope
- Notion-Spiegel und Wiki (M009, M010), auch das Todo „Wiki prüfen“ in der Milestone-Vorlage.
- Aufteilen der eigenen Roadmap und Requirements von foreman.
- Automatisches Reparieren oder Umschreiben von Dokumenten.
- Änderungen an Projekt A, B und C.
- Neue Chat-Skills.

## Success criteria
1. Die Regeldatei liegt in `template/docs/` und beantwortet je Dokumentart: wo, wer schreibt, wann aktualisiert. Ein Test oder `grep` zeigt, dass keine Überschrift oder Tabellenzeile doppelt in `docs/CONVENTIONS.md` steht.
2. Die Regel enthält Übersicht plus gleichnamigen Ordner, die Tabelle „Datei | Inhalt | Lesen bei“, die Konfliktreihenfolge und die Schwelle als Zahl.
3. Das Prüfskript meldet Exit-Code 1 für: Stand-Zeile mit zwei oder mehr Versionen (Bereich, Liste, mehrere „Version N“), Übersicht ohne Stand-Zeile, Übersicht mit zwei Stand-Zeilen. Exit-Code 0 für: eine Version mit Datum und letzter Änderung, auch wenn Ziffern im Datum oder in der Änderung stehen.
4. Das Prüfskript läuft auf `docs/roadmap-0.2.x.md` von foreman grün und auf einem Beispiel mit dem Projekt B-Verlauf (erfunden, gekürzt) rot.
5. `foreman-roast` und `foreman-roadmap` nennen die Regeldatei je mit einem Verweis; beide `SKILL.md` bleiben unter 8 KB; Plugin-Validierung grün.
6. Die neue Prüfung steht in `scripts/test-all.sh`; `bash scripts/test-all.sh` ist grün, Privacy-Scan findet nichts.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/test-plugin.sh
bash scripts/privacy-scan.sh
Human only (UAT): Die Regeldatei neben die echte `docs/requirements.md` von Projekt B legen. Erwartet: Aufbau (Übersicht plus zehn Teile) erfüllt die Regel, nur die Stand-Zeile verstößt.

## Risks
Die Schwelle ist Ermessenssache; sie steht als Zahl und lässt sich ändern. Die Erkennung „mehr als eine Version“ kann Fehlalarme (Datum, Versionsnummer in der Änderungsnotiz) oder Lücken (freie Formulierung) haben; Beispiele in beide Richtungen sind Pflicht. `docs/CONVENTIONS.md`, `scripts/test-all.sh` und `CHANGELOG.md` werden von mehreren Milestones angefasst (Merge-Konflikte).
