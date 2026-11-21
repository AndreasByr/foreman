# Milestone M007: Update-Meldung im Dispatcher

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** D · Update · **Parallel to:** M004, M009 (M001 und M006 sind abgenommen und in `dev`)

## Start approval
Blocked by: M001 und M006, UAT von Andreas abgenommen am 21.11.2026 (`docs/milestones/M001/STATE.md`, `docs/milestones/M006/STATE.md`: `done`).

## Goal
Liegt ein Projekt hinter der aktuellen foreman-Version, meldet der Dispatcher das genau einmal pro Projekt und Version: als Ticket in „Action Required“ (itsaplan) und als Webhook-Nachricht. Das Ticket schließt sich, sobald `.foreman.json` des Projekts die neue Version zeigt. Ohne Tracker geht nur der Webhook. Kein Modell ist beteiligt.

## Starting point
`dispatcher/dispatch.mjs` (Node 20+, keine Abhängigkeiten) aktualisiert je Projekt einen Klon, führt das Check-Skript aus und startet Work Runs. Es hat Webhook-Versand für Fehler (`webhookRequest`, `notify`, `webhook_format`), `pass_env` je Projekt und einen Zustand je Projekt unter `<workdir>/state/<project>.json`. Einen Tracker-Client hat es nicht. `scripts/lib/itsaplan-api.mjs` (REST, Header `x-api-key`) und `scripts/lib/itsaplan-mirror.mjs` (Spalten, Aliase) zeigen, wie itsaplan angesprochen wird. M006 liefert `install.sh --update` und `foreman-update`, deren Befehl die Meldung nennt. `.foreman.json` hat `foreman` (Version), `modules`, `mirror.itsaplan.projectKey`, optional `tracker.columnAliases`. `VERSION` und `plugin.json` stehen auf 0.2.1.

## Capabilities
1. Der Dispatcher liest je Projekt die `foreman`-Version aus `.foreman.json` des Klons und kennt die aktuelle foreman-Version, ohne Modell. Ein Projekt dahinter gilt als veraltet, eines auf Stand oder darüber nicht.
2. Bei itsaplan legt der Dispatcher für ein veraltetes Projekt ein Ticket „foreman update available: <old> → <new>“ in „Action Required“ an, einmal pro Projekt und Version, mit Verweis auf die Upgrade-Abschnitte und den Befehl für `foreman-update`. Das Ticket schließt sich, sobald das Projekt auf Stand ist.
3. Der Dispatcher schickt pro Projekt und Version eine Nachricht an den Webhook (Format wie `webhook_format`). Bei Tracker `none` oder `linear` ist das die einzige Meldung. Ein zweiter Lauf schickt nichts.
4. Die Doku (`dispatcher/README.md`, `docs/MODULES.md`, `CHANGELOG.md` Upgrade-Abschnitt, `docs/learnings.md`) beschreibt die Meldung, die neuen Config-Schlüssel und die nötigen Variablennamen.

## Dependencies and order
Kein Rückwärtsverweis außer: Versionsvergleich (1) vor Ticket (2) und Webhook (3). Doku (4) zuletzt.

## Parallel milestones
M004 und M009 laufen auf eigenen Batch-Branches. Geteilte Dateien: `dispatcher/dispatch.mjs`, `dispatcher/README.md`, `dispatcher/tests/test-dispatch.mjs`, `dispatcher/config.example.json`, `CHANGELOG.md`, `docs/MODULES.md`, `docs/learnings.md`, `scripts/test-all.sh`. Regel: nur ergänzen, nie umbauen oder umsortieren. Vor dem Merge nach `dev` wird `dev` in den Batch-Branch gemergt.

## Surface
Keine UI.

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M007-briefing.md`. Als Erfolgskriterien übernommen: genau eine Meldung bei zwei Läufen; Fehler beim Versand merkt sich nichts als „gemeldet“; SemVer-Vergleich inklusive Vorabversionen; ungültige oder fehlende Version erzeugt keine Meldung und stoppt keine anderen Projekte; höchstens ein offenes Update-Ticket je Projekt; `--dry-run` schreibt und sendet nichts; kein Secret in Log, Ticket oder Nachricht; die Version aus `.foreman.json` wird nur übernommen, wenn sie ein gültiges SemVer ist; Quelle nicht erreichbar führt zu einer Logzeile, nicht zu einem Fehler-Webhook je Lauf.

## Binding documents
`docs/requirements.md` (Abschnitt „Update-Meldung durch den Dispatcher“), `docs/roadmap-0.2.x.md` (Abschnitt M007), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `docs/versioning.md`, `CLAUDE.md`, `dispatcher/README.md`. Konfliktreihenfolge: requirements > roadmap > Brief.

## Fixed decisions
- **Aktuelle Version = neuestes GitHub-Release** des foreman-Repos (Config `foreman_repo`, Standard `AndreasByr/foreman`). Grund: Die Meldung soll nur auf veröffentlichte Versionen hinweisen; ein Klon auf dem Server mit unveröffentlichtem `VERSION` würde zu früh melden und braucht regelmäßiges `git pull`. Wer das Repo privat hält oder offline arbeitet, setzt `foreman_version_source: "local"`: dann zählt die `VERSION`-Datei des foreman-Checkouts, in dem `dispatch.mjs` liegt. Das ist die Empfehlung aus der Roadmap; die Entscheidung bleibt bei Andreas (UAT-Punkt).
- Ohne Release und ohne Netz: keine Meldung, eine Logzeile. Der Dispatcher darf deswegen nie Aufträge blockieren.
- Das Ticket legt der Dispatcher selbst an, mit dem Bot-Konto über die `pass_env`-Werte des Projekts (`ITSAPLAN_URL`, `ITSAPLAN_API_KEY` als Namen). Ein Modell legt nie ein Ticket an. Grund: Anforderung und Auftragsregel „Tracker-Status schreibt nur Skript“.
- Der Tracker-Client im Dispatcher ist klein und eigenständig (kein Import aus `scripts/`), weil `dispatcher/` einzeln kopiert werden darf.
- Zustand je Projekt in der bestehenden Zustandsdatei, ohne Ablauf der Version; „gemeldet“ wird erst nach erfolgreichem Versand gespeichert. Bei Ticket und Webhook getrennt, damit ein Ausfall des einen den anderen nicht wiederholt.
- Linear bekommt in diesem Milestone nur den Webhook, kein Ticket. Grund: Anforderung nennt nur itsaplan.
- Der Dispatcher aktualisiert keine Projekte und führt kein `--update` aus. Automatisches Update ohne Bestätigung ist außerhalb des Umfangs (`requirements.md`).
- Jeder Fix bekommt zuerst einen fehlschlagenden Test.

## Data and interfaces
`dispatcher/dispatch.mjs`, `dispatcher/config.example.json` (neu: `foreman_repo`, `foreman_version_source`, optional je Projekt `update_notice: false` zum Abschalten), Zustandsdatei `<workdir>/state/<project>.json`, `.foreman.json` (`foreman`, `modules`, `mirror.itsaplan.projectKey`, `tracker.columnAliases`), itsaplan-REST (Projekt, Issues, Issue anlegen, Issue ändern), GitHub-REST `releases/latest`. Nur Variablennamen: `DISPATCHER_ERROR_WEBHOOK_URL` (oder `webhook_url_env`), `ITSAPLAN_URL`, `ITSAPLAN_API_KEY` (über `pass_env`), optional `ITSAPLAN_WEB_URL`.

## Out of scope
- Update ausführen, Projekte ändern oder `foreman-update` aufrufen (M012 und Mensch).
- Ticket in Linear.
- Dispatcher-Code auf dem Server aktualisieren (Teil von `foreman-update` später).
- Release, Tag, Version `0.2.2` und höher: bleibt bei Andreas. `VERSION` bleibt 0.2.1.
- Änderungen an `scripts/autopilot-check.sh` oder am Verhalten der Work Runs.

## Success criteria
1. Test: Vergleich nach SemVer: `0.2.1` < `0.2.4`, `0.2.9` < `0.2.10`, `0.2.2-rc.1` < `0.2.2`; gleiche Version und neuere Projektversion sind nicht veraltet; ungültige Version (leer, Text, Zeilenumbruch) wird verworfen.
2. Test mit Attrappe (Release-Antwort): veraltetes Projekt erkannt, aktuelles nicht; Quelle liefert Fehler, 404 oder Unsinn: keine Meldung, Logzeile, Exit-Code des Laufs bleibt 0.
3. Test mit `foreman_version_source: "local"`: die `VERSION` des Checkouts zählt, kein Netzaufruf.
4. Test gegen Tracker-Attrappe: genau ein Ticket mit Titel `foreman update available: 0.2.1 → 0.2.4` in „Action Required“; zweiter Lauf legt keines an; bei neuer Version kein zweites offenes Ticket; nach Update der Projektversion ist das Ticket geschlossen und bleibt es.
5. Test: Ticket-Anlage scheitert (HTTP-Fehler): Exit-Code 1, Hinweis im Log, nichts als gemeldet gespeichert, nächster Lauf versucht es erneut; andere Projekte laufen weiter.
6. Test: Webhook-Nachricht einmal pro Projekt und Version im richtigen Format (Discord `content`, Slack `text`); zweiter Lauf schickt nichts; Webhook-Ausfall merkt nichts als gemeldet; Tracker `none` und `linear` erzeugen nur den Webhook.
7. Test: `--dry-run` legt kein Ticket an, sendet nichts, schreibt keinen Zustand und sagt, was es täte.
8. Test: Weder Token, Webhook-URL noch API-Key erscheinen in Log, Ticket oder Nachricht; Titel und Nachricht enthalten nur validierte Versionen und feste Texte.
9. Test: Ticket-Anlage nutzt nur die `pass_env`-Werte des eigenen Projekts; fehlen `ITSAPLAN_URL` oder `ITSAPLAN_API_KEY`: Hinweis im Log, nur Webhook, kein Abbruch.
10. Doku-Test grün: README, MODULES, CHANGELOG (Upgrade-Abschnitt in Unreleased nennt die neuen Config-Schlüssel und den Schritt auf dem Dispatcher-Rechner), learnings.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/check-config.sh
Human only (UAT): echtes Ticket im itsaplan-Testprojekt und echte Nachricht in Discord (Flow A und B der Roadmap), Entscheidung zur Versionsquelle, Lesbarkeit der Meldung.

## Risks
Der Dispatcher legt erstmals selbst ein Ticket an; ein Fehler dort darf keine Work Runs blockieren. Die GitHub-API hat ein Limit für anonyme Aufrufe (60 pro Stunde je IP): ein Aufruf je Lauf, Ergebnis im Lauf zwischengespeichert, bei 403 oder 429 nur eine Logzeile. Ohne veröffentlichtes Release meldet nichts (heute gibt es keines für 0.2.1 im Repo): bis zum Release 0.2.2 ist der Weg nur mit `local` oder Attrappe zu sehen, das gehört in die UAT-Anleitung. `dispatch.mjs` wird auch von M004 und M009 angefasst: nur ergänzen.
