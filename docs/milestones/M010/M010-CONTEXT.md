# Milestone M010: Öffentliches Wiki

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** E · Docs · **Parallel to:** M005, M007

## Goal
Ein Projekt mit dem Modul `docs-notion` kann ein öffentliches Wiki pflegen: Seiten liegen als Dateien unter `docs/wiki/`, sind für eine konfigurierte Zielgruppe in einer konfigurierten Sprache geschrieben, laufen durch einen strengen Privacy-Scan und werden vom selben Skript wie der Spiegel nach Notion veröffentlicht. Jeder Milestone prüft per festem Todo, ob das Wiki angepasst werden muss.

## Starting point
foreman 0.2.1, M009 ist in `dev` (UAT steht aus): Modul `docs-notion`, Skript `template/scripts/docs-notion.mjs` mit `lib/docs-notion.mjs` und `lib/docs-notion-md.mjs`, Seitenbaum nach `docs-rules.md`, Hook `scripts/post-merge.d/docs-notion.sh`, Konfiguration `docsNotion` in `.foreman.json` (der Spiegel schließt `docs/wiki/**` bereits aus). `scripts/check-config.sh` prüft `.foreman.json`. Milestone-Vorlagen: `docs/milestones/_TEMPLATE/` (Repo) und `template/docs/milestones/_TEMPLATE/` (Projekte). Der Skill `plugins/foreman/skills/foreman-brief/` schreibt Briefs.

## Capabilities
1. **Konfiguration:** `.foreman.json` hat einen Block `wiki`: Schalter, Sprache, Zielgruppen (Name plus Kurzbeschreibung) und die Wurzelseite des Wikis. `check-config.sh` prüft die Felder. Der Installer legt den Block mit Modul `docs-notion` an, standardmäßig aus.
2. **Wiki-Dateien:** Seiten unter `docs/wiki/<zielgruppe>/`, jede mit Kopfdaten (Zielgruppe, Quelldateien, Text-Check). Ein Skill erklärt, wie sie aus den internen Docs für die Zielgruppe geschrieben werden, und verlangt `/no-ai-slop` und `/humanizer` vor dem Veröffentlichen. Ein Beispiel-Wiki für das Testprojekt liegt im Test.
3. **Veröffentlichen:** `node scripts/docs-notion.mjs --wiki` veröffentlicht `docs/wiki/` unter der Wiki-Wurzelseite (Zielgruppe als Elternseite, darunter die Seiten), mit denselben Eigenschaften wie der Spiegel (idempotent, Limits, Token-Schutz). Vorher läuft der Wiki-Scan über alle Seiten; ein Treffer bricht die ganze Veröffentlichung ab. `--dry-run` zeigt Seiten und Scan-Ergebnis ohne Token und Netz.
4. **Milestone-Todo:** Beide Milestone-Vorlagen und `foreman-brief` enthalten das feste Todo „Prüfen, ob das Wiki aktualisiert werden muss“. Das Ergebnis steht als Zeile `Wiki:` in `STATE.md` (betroffene Seiten oder „Wiki: keine Änderung“). Fehlt die Zeile bei eingeschaltetem Wiki, schließt der Milestone nicht ab (maschinelle Prüfung). Bei ausgeschaltetem Wiki entfällt das Todo.

## Dependencies and order
M009 ist die Grundlage (Skript und Bibliothek). M012 baut auf M010 auf. Slices in der Reihenfolge: Konfiguration, Wiki-Dateien, Veröffentlichen, Milestone-Todo. S3 nutzt die Bibliothek aus M009 und baut sie nur um, wo nötig.

## Parallel milestones
M005, M007. Geteilte Dateien: `install.sh`, `scripts/test-install.sh`, `scripts/test-all.sh`, `scripts/check-config.sh`, `docs/MODULES.md`, `update-classes.json`, `CHANGELOG.md`, `docs/milestones/_TEMPLATE/`, `plugins/foreman/skills/foreman-brief/`. Nur ergänzen, nie umbauen.

## Surface
Keine UI (Skript, Skill, Vorlagen). Die Seiten in Notion prüft der Mensch im UAT.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M010-briefing.md`. Übernommen: Scan im Skript statt nur im Skilltext; Treffer stoppt die gesamte Veröffentlichung; nur `docs/wiki/`, keine Symlinks oder `..`; Zielgruppe Pflicht; Quelldateien im Seitenkopf; keine automatische Veröffentlichung nach Merges; Wiki aus heißt kein Todo und keine Veröffentlichung.

## Binding documents
`docs/requirements.md` (Abschnitt Wiki unter „Must-have: Modul `docs-notion`“), `docs/roadmap-0.2.x.md` (Abschnitt M010), `template/docs/docs-rules.md`, `docs/MODULES.md`, `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`. Konfliktreihenfolge: Requirements, Design, Roadmap, dieser Brief.

## Fixed decisions
Die drei offenen Fragen aus den Requirements sind hier mit Vorschlägen entschieden; der Maintainer bestätigt oder ändert sie im UAT:
- **Zeitpunkt:** Das Wiki wird nur auf ausdrücklichen Aufruf veröffentlicht (`--wiki`, vorgesehen beim Release). Der Hook `post-merge.d` und der Batch-Lauf veröffentlichen es nie.
- **Texte:** Die Seitentexte schreibt ein Modell mit starker Rolle (`execution`) nur aus den im Seitenkopf genannten Quelldateien. Beide Text-Skills laufen nur für neue oder geänderte Seiten; der Seitenkopf trägt den Vermerk. Das Veröffentlichungsskript lehnt Seiten ohne Vermerk ab. Kein Modell schreibt je nach Notion.
- **Öffentlich machen:** Das Skript legt nur Seiten an. „Notion Sites“ oder Freigabe-Link aktiviert der Mensch in Notion von Hand (die API kann das nicht); die Doku sagt es.
- Dateiformat: `docs/wiki/<zielgruppe-slug>/<seite>.md`, Kopfdaten als einfacher Block am Dateianfang (`audience`, `source`, `checked`), vor dem Hochladen entfernt. Sprache der Seite: `wiki.language`, sonst `context.language`.
- Der Scan kennt eine feste Liste interner Begriffe (deutsch und englisch: Roast, Roadmap, Brief, Fix-Paket, Agent-Report, STATE.md, offene Frage, Logiklücke, needs-input), Muster für Hosts (IPv4, `localhost`, interne Domain-Endungen, `server-<n>`), Secret-Muster und eigene Begriffe aus `wiki.forbidden`. Exit-Code 4 bei Treffer.
- Einbahn Repo → Notion; Skript Node 20 ohne Abhängigkeiten, Sprache von Skript und Doku: Englisch.

## Data and interfaces
Neu: Wiki-Lib und Test in `template/scripts/`, Skill `foreman-wiki` (nur mit Modul), Wiki-Zeile in beiden `STATE.md`-Vorlagen, Prüfung der Wiki-Zeile in `state-mirror.mjs` (Repo- und Template-Kopie). Geändert: `install.sh`, `scripts/update.py`, `scripts/check-config.sh`, `scripts/test-*.sh`, `docs/MODULES.md`, `update-classes.json`, `CHANGELOG.md`, beide `_TEMPLATE/CONTEXT.md`, `plugins/foreman/skills/foreman-brief/`. Keine neuen Env-Variablen (`NOTION_API_KEY` bleibt).

## Out of scope
- Automatische Veröffentlichung, Wiki-Übersetzungen, mehrere Sprachen je Projekt.
- Notion-Sites-Aktivierung per API.
- Echter Lauf gegen Notion durch den Agent (kein Token in der Cloud; der Mensch macht ihn im UAT).
- Änderungen an anderen Projekten.

## Success criteria
1. `check-config.sh` akzeptiert einen gültigen `wiki`-Block und meldet je Fehler (Schalter kein Boolean, Zielgruppe ohne Namen, Sprache leer bei Wiki an, Wurzelseite fehlt bei Wiki an) mit Exit 1; bei Wiki aus werden die Felder nicht verlangt. `install.sh --modules docs-notion` legt den Block (aus) an; ohne Modul fehlt er, und Wiki-Skript, Wiki-Bibliothek und Skill `foreman-wiki` werden nicht installiert (die Vorlagen und `check-config.sh` dürfen das Wort enthalten).
2. Ein Testprojekt mit Zielgruppe „Spieler und Tester“ hat Wiki-Seiten unter `docs/wiki/`; `--wiki --dry-run` listet je Seite eine Aktion, ohne Token und Netz, Exit 0. Der Skill `foreman-wiki` nennt Quelle-nur-aus-Docs, beide Text-Skills und das Seitenformat.
3. Gegen den lokalen Notion-Ersatz erzeugt `--wiki` die Struktur Wurzel → Zielgruppe → Seiten; ein zweiter Lauf erzeugt keine Duplikate; der Kopfblock steht nicht im Seiteninhalt; der interne Spiegel veröffentlicht nie `docs/wiki/`, der Wiki-Lauf nie interne Docs.
4. Eine Wiki-Seite mit „Roast“, „offene Frage“, „STATE.md“, einer IPv4-Adresse, `server-1`, einem Secret-Muster oder einem Begriff aus `wiki.forbidden` wird abgelehnt: Exit 4, nichts wird gesendet (auch die sauberen Seiten nicht), die Meldung nennt Datei und Treffer, aber nicht den Secret-Wert.
5. Seiten mit unbekannter oder fehlender Zielgruppe oder ohne Text-Check-Vermerk werden abgelehnt (Exit 4). Symlinks und `..` aus `docs/wiki/` hinaus werden übersprungen und gemeldet. Fake-Token steht in keiner Ausgabe.
6. Der Hook `post-merge.d/docs-notion.sh` und `batch-run.md` rufen `--wiki` nie auf (Test).
7. Beide `_TEMPLATE/`-Vorlagen und `foreman-brief` enthalten das Todo „Prüfen, ob das Wiki aktualisiert werden muss“ und die Zeile `Wiki:`. `state-mirror.mjs --check --local` scheitert bei Wiki an und Milestone in einem Abschlussstatus ohne `Wiki:`-Zeile, besteht mit der Zeile und bei Wiki aus ohne Zeile.
8. Neue Dateien stehen in `update-classes.json` und werden ohne Modul nicht installiert; `docs/MODULES.md` beschreibt das Wiki; `bash scripts/test-all.sh` ist grün, Privacy-Scan findet nichts.

## Verification
bash scripts/test-all.sh
bash scripts/test-install.sh
bash scripts/test-check-config.sh
bash scripts/test-update-classes.sh
bash scripts/test-plugin.sh
bash scripts/privacy-scan.sh
Human only (UAT): echter Lauf gegen eine Test-Seite in Notion; Ton und Inhalt der Seiten für die Zielgruppe; Notion Sites oder Freigabe-Link von Hand.

## Risks
Ein Modell erfindet Funktionen; abgefedert durch Quelldateien im Kopf und Mensch im UAT. Der Scan ist eine Denylist und kann nicht alles Interne erkennen; deshalb bleibt der Mensch im UAT die zweite Sperre. Zwei Text-Skills kosten Tokens (nur für geänderte Seiten). Geteilte Dateien erzeugen Konflikte mit M005 und M007.
