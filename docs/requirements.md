# foreman: Requirements (Optimierung ab 0.2.1, Versionen 0.2.x)

## Project goal
foreman 0.2.1 so weit vereinfachen und belegen, dass Referenzprojekt 1 und Referenzprojekt 2, die bereits auf foreman laufen, Milestones ohne Eingriff bis zum PR durchlaufen, mit messbaren Zahlen, die im Repo und im Portfolio stehen. Neu kommen nur zwei Dinge dazu: das Modul `docs-notion` (Docs-Regeln, Notion-Spiegel, optionales Wiki) und der Skill `foreman-update`, der installierte Projekte auf den aktuellen Stand bringt.

## Target group
- Primär: Maintainer selbst, als täglicher Workflow über mehrere Nebenprojekte auf dem Server Host 2.
- Sekundär: Portfolio-Leser (Auftraggeber, Arbeitgeber), die sehen sollen, dass er KI-Workflows selbst entwirft und betreibt.
- Tertiär: andere Entwickler mit Claude Code, die foreman über den Marketplace installieren.

## Core hypothesis
Ein modellfreier Dispatcher, günstige Worker und mechanische Checks bringen Milestones ohne menschlichen Eingriff bis zum PR, und zwar zu Abo-Kosten statt API-Kosten. Referenzprojekt 1 und Referenzprojekt 2 laufen auf 0.2, aber bisher ist dort noch kein Milestone ohne Eingriff durchgelaufen.

## Functional requirements (v1)

### Must-have
- Eingriffe erfassen: Bisher gab es in Referenzprojekt 1 und Referenzprojekt 2 keinen Eingriff („Action Required“), weil die Infrastruktur noch im Umbau war (Stand 21.11.2026). Ab jetzt wird jeder Eingriff (Action Required, manueller Neustart, Abbruch) mit Ursache erfasst; die häufigsten Ursachen fließen in spätere Fix-Pakete ein. Die übrigen Must-haves warten nicht darauf.
- Optimierungen gehen zuerst in Referenzprojekt 1 und Referenzprojekt 2 und werden dort gemessen.
- Messung pro Unit, maschinell aus vorhandenen Dateien (`STATE.md`, Reports, Worker-Result-Files): Laufzeit, Anzahl Eingriffe (Action Required), Anzahl Fallbacks auf Claude, Worker-Modell pro Rolle. Ein Skript fasst das pro Projekt und Zeitraum zusammen.
- Vereinfachen ohne Funktionsverlust: Doppelte Regeln zwischen Chat-Skills, Repo-Skills und `docs/` an eine Stelle ziehen; was in jedem Work-Run gelesen wird, wird kürzer oder bleibt gleich lang, aber nicht länger.
- Erstinstallation des eigenen Wegs (Claude Code + itsaplan + LiteLLM) auf einem neuen Projekt ist in höchstens 60 Minuten machbar, gemessen am nächsten neuen Projekt.
- README zeigt die gemessenen Zahlen und verlinkt `docs/learnings.md` als Beleg aus echtem Einsatz.
- Alle bestehenden Tests (`scripts/test-all.sh`, Dispatcher-Tests, Delegate-Tests, Plugin-Validierung, Privacy-Scan) bleiben grün.
- Ein Dispatcher für alle: erledigt beim Server-Umzug am 20.11.2026; auf Host 1 läuft `dispatch.mjs` aus foreman, Alt-Dispatcher (Python) ist stillgelegt. Künftig pflegt `foreman-update` den Dispatcher-Code.
- Webhook für Discord und Slack: `config.json` legt das Format fest (`webhook_format`: `discord`, `slack` oder `auto` nach Host der URL). Doku und `dispatcher.env.example` nennen beide. Tests prüfen den Body für beide Formate.
- Lokaler Lauf auf eigenem Server als unterstützter Weg, mit Referenzprojekt 3 als Referenz: `fire_command` startet Claude Code auf Host 2 (Auftrag per stdin über `ssh`, dort ein Startskript mit `claude -p` und exakter Model-ID), `pass_env` reicht projekteigene Variablen durch (zum Beispiel einen eigenen itsaplan-Key). Der Weg gilt heute nur als „andere Agents“; `foreman-setup` und `docs/MODULES.md` führen ihn als Variante für Claude Code ohne Cloud-Routine. Ein Startskript liegt als Vorlage bei.
- `foreman-setup` fragt Infrastruktur und KI-Abos vollständig ab, statt zu raten. Heute fragt Block C nur „Agent und Plan“ und „eine Maschine, die immer an ist“; Tracker, Worker-Zugang, Docker und Benachrichtigung kommen erst in Runde 2 und nur bei Autopilot oder Deploy. Künftig:
  - Eine Bestandsaufnahme mit Mehrfachauswahl für alle Profile außer Quick: jede Maschine mit Namen und Rolle (Dispatcher-Host, Ausführung lokaler Läufe, App-Hosting, Tracker-Host; zum Beispiel Host 1 und Host 2), was darauf schon läuft (Docker, Coolify oder ähnlich, itsaplan, LiteLLM, Dispatcher), Domain und HTTPS.
  - KI-Zugänge mit Stufe: Claude-Plan (Pro, Max oder Team/Enterprise, API), ob Claude-Code-Routinen mit API-Trigger verfügbar sind, Ollama-Cloud-Plan, ChatGPT-Plan (für den Gateway), weitere Anbieter.
  - Benachrichtigungskanal (Discord, Slack, Mail, keiner) und Tracker (itsaplan mit URL, Linear, keiner).
  - Unbekanntes wird als „unbekannt“ gespeichert und als Lücke genannt, nie erschlossen. Die Antworten landen in `.foreman.json` (Block `infra`, nur Namen und Rollen, keine Secrets) und stehen in der Zusammenfassung, die der Mensch vor der Empfehlung bestätigt. `foreman-project` und `foreman-update` lesen diesen Block, statt neu zu fragen.
- Einrichtung und neues Projekt sind getrennt. Heute sagt `foreman-project`: „If foreman is not installed in the repo yet, run `foreman-setup` first“. Ein neues Repo ist immer leer, also startet bei jedem neuen Projekt die komplette Einrichtung, obwohl Dispatcher, Tracker, Gateway und Abos längst laufen. Künftig:
  - `foreman-setup` richtet einmal pro Arbeitsumgebung ein (Maschinen, Tracker, Dispatcher, Gateway, Abos, itsaplan-Vorlage) und speichert das Ergebnis als Arbeitsumgebungs-Profil (`workspace.json`, gleicher Inhalt wie der Block `infra`, keine Secrets). Das Profil liegt neben der Dispatcher-Konfiguration auf dem Server und als Kopie dort, wo der Chat es lesen kann (Claude-Projekt-Doku oder privates Repo).
  - `foreman-project` liest zuerst das Profil. Fehlt es, prüft der Skill Hinweise auf eine bestehende Einrichtung (itsaplan erreichbar mit Projekten im foreman-Schema, andere Repos mit `.foreman.json`, Dispatcher-Konfiguration) und stellt genau eine Frage: „Ist foreman schon eingerichtet?“. Erst bei „nein“ startet `foreman-setup`.
  - Für ein Projekt in einer bestehenden Umgebung macht `foreman-project` nur noch die Projekt-Schritte: Install-Befehl mit Profil und Modulen aus `workspace.json`, Tracker-Projekt aus der Vorlage, Dispatcher-Eintrag, Routine oder `fire_command`, erster Milestone. Er fragt nur, was projektspezifisch ist (Name, Profil, Module, Ausführung in der Cloud oder auf Host 2, Staging).
  - Die Beschreibungen beider Skills sagen klar, wann welcher greift: `foreman-setup` nur, wenn foreman noch nie eingerichtet wurde oder sich die Umgebung ändert; „neues Projekt“ immer `foreman-project`.
- Regel zu Modell-IDs eindeutig: Heute verlangen `foreman-project` (Schritt 4) und `foreman-setup` „exakte Model-IDs“ in `tools/delegate/config.toml`, während das Gateway-Preset dieselben Rollen bewusst über Aliase anspricht (`gateway/task-simple`, `task-research`, `task-normal` …). Agents bleiben an diesem Widerspruch hängen. Künftig: Exakte IDs gelten für das Sitzungsmodell und für Rollen, die direkt einen Anbieter ansprechen (`claude/…`, `ollama/…`). Rollen über den Gateway nutzen die `task-*`-Aliase; welche Modelle dahinterliegen, steht nur in der LiteLLM-Konfiguration des Gateways.
- Gateway (LiteLLM) wird eingerichtet statt nur beschrieben: Heute ist das Modul `gateway` „documented only“; der Installer kopiert README und Beispiel-Konfiguration nach `tools/gateway/`, und die Checkliste sagt „read the README“. Das ChatGPT-Abo ist aber nur über den Gateway nutzbar (`run_task.py` kennt nur `claude`, `ollama`, `gateway`). Künftig fragt `foreman-setup` in der Bestandsaufnahme, ob ein Gateway läuft (URL). Läuft einer, schreibt der Installer das Gateway-Preset in `tools/delegate/config.toml` (`base_url`, Name der Key-Variable, Rollen auf `task-*`) und prüft mit `run_task.py --dry-run`. Läuft keiner und ein ChatGPT-Abo ist vorhanden, führt `foreman-setup` als eigener Block Schritt für Schritt durch die Einrichtung (etwa 45 Minuten), mit dem Hinweis zu den Nutzungsbedingungen.
- Anbieter-Limits einhalten, für jeden Worker-Anbieter (Gateway, Ollama, Claude): ein Höchstwert an Anfragen pro Minute und pro Stunde je Anbieter in `config.toml`; bei 429 oder einer Limit-Meldung Pause mit wachsendem Abstand und kein sofortiger Neuversuch; nach drei Fehlschlägen in Folge wird der Anbieter für den Rest des Laufs gesperrt und die Rolle geht an den Fallback; eine Obergrenze an Worker-Aufrufen pro Lauf, damit keine Schleife aus Fehlversuchen entsteht. Jede Sperre steht im Lauf-Bericht. Ziel ist, Limits zu respektieren, nicht automatische Nutzung zu verschleiern.
- ChatGPT-Abo über den Gateway als bewusste Entscheidung des Nutzers: OpenAI bietet die Anmeldung mit dem ChatGPT-Konto für die eigenen Codex-Clients (CLI, IDE, App) an und empfiehlt für Automatisierung in gemeinsamen Umgebungen wie CI einen API-Key. Der Weg über den LiteLLM-Provider `chatgpt/` ist kein offizieller Codex-Client; automatische Nutzung darüber kann zur Sperre des Abos führen. foreman blockiert diesen Weg nicht, zeigt aber in `foreman-setup`, im Gateway-Block und in `gateway/README.md` einen klaren Risikohinweis mit den Alternativen (offizieller Codex-CLI als Worker, API-Key mit eigenem Budget, nur Ollama und Claude). Der Nutzer entscheidet ausdrücklich; die Entscheidung steht in `workspace.json` (`chatgptViaGateway: accepted-risk`) und wird nicht bei jedem Projekt erneut gefragt. Ohne diese Zustimmung schreibt der Installer kein ChatGPT-Ziel in die Gateway-Rollen.
- Ein Name pro Gateway-Variable: Heute heißt der Key in `docs/CONVENTIONS.md`, `gateway/README.md`, `config.toml` und `work-run.md` `FOREMAN_GATEWAY_KEY`, in den Setup-Referenzen `LLM_GATEWAY_KEY` und `LLM_GATEWAY_URL`. `run_task.py` hält nur `LLM_GATEWAY_KEY` von Claude-Workern fern; ein Key unter dem konventionellen Namen `FOREMAN_GATEWAY_KEY` landet also im Claude-Worker. Künftig ein Name überall, die Sperrliste deckt ihn ab, ein Test prüft beides.
- Erkenntnisse aus dem Server-Umzug (Bericht vom 20.11.2026) kommen in foreman:
  - Der Dispatcher gibt dem Prüfskript eines Projekts nur `PATH`, `HOME`, `LANG` und die Variablen aus `pass_env` mit, nicht die ganze Umgebung mit den Fire-Tokens anderer Projekte. Der lokale Patch auf Host 1 wird Teil von `dispatch.mjs`, mit Test.
  - Agents lesen nie private Schlüsseldateien aus (Deploy-Keys, `*.env`, Dispatcher-Konfiguration); sie prüfen nur, ob sie existieren und welche Rechte sie haben. Die Regel steht in den Repo-Skills und `docs/learnings.md`.
  - Die Board-Regel blockiert nicht, wenn ein Projekt keinen Ordner `docs/design-reference/` hat: Dann gilt `docs/design.md` als Vorgabe. Die Regel nennt beide Fälle.
  - Worker dürfen nicht unter `.claude/` schreiben; Aufgaben dort macht die Sitzung selbst. Die Delegations-Regeln sagen das, damit kein Worker-Lauf daran scheitert.
  - Das Zeitlimit der Worker ist je Rolle einstellbar, nicht nur global.
  - Merge nach `main` eindeutig: `foreman-fix` sagt, `batch/main` wartet auf das „Batch PR main“ des Menschen; `autopilot-check.mjs` startet den Batch für `main` aber genauso im Merge-Fenster wie für `dev`. Eine Stelle wird angepasst, je nachdem, was gelten soll; ein Test prüft es.
  - Merge-Fenster pro Projekt erfragen statt setzen: Heute schreibt der Installer `context.timeZone: "UTC"` fest und keine `autopilot.batchHours`; der Fragenkatalog fragt Zeitzone und Testzeiten nur einmal im Setup, und das Ergebnis landet in keinem Projekt. Künftig fragt `foreman-project` bei jedem Projekt mit Autopilot: Zeitzone (Vorschlag aus `workspace.json`), Fenster-Stunden (Vorschlag 3, 7, 11, 15, 19, 23 oder eigene), Wartezeit bis zum Merge außerhalb des Fensters (Vorschlag 4 Stunden) und ob `main` im Fenster automatisch gemergt wird oder nur auf „Batch PR main“. Die Antworten stehen in `.foreman.json` (`context.timeZone`, `autopilot.batchHours`, Wartezeit) und in der Zusammenfassung vor der Installation. README und `foreman-setup` erklären die Regel.
  - Das Prüfskript akzeptiert `--no-fetch` in allen Projekten (Referenzprojekt 2 lehnt es heute ab und bleibt deshalb im Dispatcher aus).
- itsaplan-Projektvorlage: foreman liefert eine Vorlage im Exportformat von itsaplan (`itsaplan.project-template`, Version 1) mit im Repo: alle Status-Spalten mit `stateType`, das Label `AP: UAT ready`, die Ansicht „UAT ready“ und Issue-Vorlagen für Eingriff, UAT und Update-Meldung. Die Vorlage entsteht einmal aus dem laufenden Referenzprojekt 1 (`export_project_template`). `foreman-setup` importiert sie einmal pro Workspace, `foreman-project` legt jedes neue Projekt daraus an. Von Hand bleibt nur, das Bot-Konto als Mitglied hinzuzufügen, weil der Export keine Personen enthält. Ändert sich die Vorlage, nennt der Upgrade-Abschnitt die nötigen Änderungen an bestehenden Projekten, denn eine Vorlage ändert angelegte Projekte nicht nachträglich.
- Labels und Status sind immer Englisch, unabhängig von `context.language`: Spalten, Labels, Label-Gruppen, Ansichten und die Titel der Issue-Vorlagen, in itsaplan wie in Linear. Skripte erkennen sie am festen englischen Namen. Die Vorlage und `check-config.sh` prüfen das; ein übersetzter Name ist ein Fehler. Referenzprojekt 1 wird vor dem Export der Vorlage umbenannt (Umbenennen behält Label-IDs und Zuordnungen), zusammen mit der Umstellung seiner Skripte auf die englischen Namen, damit der Mirror nicht zwischendurch bricht. Zuordnung nach `template/scripts/lib/itsaplan-mirror.mjs`: Art → Type, Fix-Paket → Fix pack, Autopilot-Phase → Autopilot phase, AP: Eingriff nötig → AP: Action Required, AP: Fix-Runde → AP: Fix round, AP: Pretest läuft → AP: Pretest running, AP: Pretest wartet → AP: Pretest waiting, AP: Release Freitag → AP: Release ready, AP: UAT bereit → AP: UAT ready, AP: Wartet auf Merge → AP: Waiting for merge. Coding, Milestone, Bug, Feature, Improvement und die Versions-Labels bleiben.

### Must-have: Modul `docs-notion`
- Docs-Regeln: Eine Regeldatei legt fest, welche Dokumente es im Repo gibt, wo sie liegen, wer sie schreibt und wann sie aktualisiert werden. Sie ergänzt `docs/CONVENTIONS.md`, statt sie zu wiederholen.
- Aufteilen großer Dokumente nach dem Muster aus Referenzprojekt 2: eine Übersicht (`docs/requirements.md`, `docs/roadmap-<version>.md`) und Teildateien in einem gleichnamigen Ordner (`docs/requirements/01-….md`, `docs/roadmap-<version>/M001-….md`). Version und Änderungsverlauf stehen nur in der Übersicht. Die Übersicht hat eine Tabelle „Datei | Inhalt | Lesen bei“ und die Konfliktreihenfolge. Die Regel nennt, ab welcher Größe aufgeteilt wird.
- Spiegel: Ein Skript spiegelt die Repo-Docs nach Notion, nur in eine Richtung (Repo → Notion). Eine Notion-Seite pro Datei, die Übersicht ist die Elternseite der Teildateien. Das Repo bleibt die einzige Quelle; in Notion geänderte Seiten werden beim nächsten Lauf überschrieben. Modelle schreiben nie direkt nach Notion, wie beim Tracker-Mirror. Der Spiegel ersetzt die heutige Regel „wer ändert, gleicht in derselben Sitzung ab“.
- Wiki (optional, per Schalter): ein öffentliches Wiki in Notion für festgelegte Zielgruppen, in der gewählten Sprache (`context.language` oder eigene Einstellung). Die Zielgruppen stehen pro Projekt in der Konfiguration, zum Beispiel Referenzprojekt 2: Spieler und Tester; Referenzprojekt 1: Nutzer, Moderatoren und Admins; Selfhost-Projekte wie Funke: Leute, die es selbst hosten und eventuell erweitern. Das Wiki ist kein Spiegel der internen Docs: Es wird aus ihnen für die Zielgruppen geschrieben, und die Texte laufen vor dem Veröffentlichen durch `/no-ai-slop` und `/humanizer`. Die Wiki-Seiten liegen als Dateien im Repo (`docs/wiki/`) und werden vom selben Skript veröffentlicht; auch hier schreibt kein Modell direkt nach Notion.
- Das Wiki enthält nie interne Inhalte: Roast-Notizen, offene Fragen, Logiklücken, Briefs, Fix-Pakete, Agent-Reports, Zugangsdaten, interne Hosts. Vor jeder Veröffentlichung läuft der Privacy-Scan über die Wiki-Seiten.
- Wiki-Prüfung in jedem Milestone: Die Milestone-Vorlage (`docs/milestones/_TEMPLATE/`) und `foreman-brief` enthalten ein festes Todo „Prüfen, ob das Wiki aktualisiert werden muss“. Das Ergebnis steht im Milestone-`STATE.md`: welche Wiki-Seiten betroffen sind, oder „Wiki: keine Änderung“. Ohne diese Zeile schließt der Milestone nicht ab. Bei abgeschaltetem Wiki entfällt das Todo.
- Das Modul ist optional; ohne `docs-notion` ändert sich an Installation und Work-Runs nichts.
- Tests: Spiegel mit `--dry-run`, kein Secret im Log, Installer akzeptiert das Modul und lässt es ohne Flag weg. Die bisherige Sperre für `notion` in `install.sh` und `scripts/test-install.sh` wird durch diese Prüfungen ersetzt.

### Must-have: Skill `foreman-update`
- Problem heute: Das Plugin aktualisiert sich über den Marketplace, die installierten Projekte nicht. `install.sh` legt nur fehlende Dateien an oder überschreibt mit `--force` alles, auch projektspezifische Anpassungen (`CLAUDE.md`, `tools/delegate/config.toml`, `.foreman.json`). Änderungen am Dispatcher oder neue Module wie `docs-notion` kommen so nur mit `--force` in Referenzprojekt 1 und Referenzprojekt 2 an, und dann gehen die Anpassungen verloren.
- `foreman-update` vergleicht die Version in `.foreman.json` eines Projekts mit der aktuellen foreman-Version und listet, was dazwischen kam.
- Jede Version im `CHANGELOG.md` bekommt einen festen Abschnitt „Upgrade“: welche Dateien sich ändern, welche Schritte nötig sind (Dispatcher auf dem Server aktualisieren, neue Umgebungsvariablen, Tracker-Spalten, Routine-Prompt ändern) und ob ein Schritt optional ist. Der Skill liest nur diesen Abschnitt, keine Vermutungen aus Diffs.
- Dateien sind in drei Klassen eingeteilt: foreman-eigen (wird ersetzt), projekt-eigen (bleibt unangetastet), gemischt (der Skill zeigt die Änderung und lässt den Menschen entscheiden). Die Klasse steht in einer Liste im foreman-Repo.
- Der Installer bekommt einen Update-Modus (`install.sh --update`), der genau diese Klassen beachtet und die Version in `.foreman.json` erst nach Erfolg erhöht. `--dry-run` zeigt vorher alle Änderungen.
- Schritte außerhalb des Repos (Server, Routinen, Tracker, Umgebungsvariablen) gibt der Skill als nummerierte Checkliste mit Minuten aus, wie `foreman-setup`. Er führt sie nicht selbst aus.
- Neue Module bietet der Skill an, installiert sie aber nur nach einem Ja.
- Update-Meldung durch den Dispatcher, ohne Modell: Er vergleicht `version` in `.foreman.json` jedes Projekts mit der aktuellen foreman-Version. Liegt ein Projekt zurück, legt er im itsaplan-Projekt ein Ticket in „Action Required“ an (Titel immer Englisch: „foreman update available: <old> → <new>“, mit Verweis auf die Upgrade-Abschnitte und den Befehl für `foreman-update`) und schickt einmal eine Nachricht an den Webhook (`DISPATCHER_ERROR_WEBHOOK_URL` oder eine eigene Variable). Pro Projekt und Version nur einmal; das Ticket schließt sich, sobald `.foreman.json` die neue Version zeigt. Ohne Tracker (`none`) geht nur der Webhook.
- Tests: Update von 0.2.1 auf die neue Version an einem Testprojekt mit angepasster `CLAUDE.md` und `config.toml`; beide bleiben unverändert, foreman-eigene Dateien sind aktuell.

### Nice-to-have (v1, if time allows)
- Wöchentlicher End-to-End-Smoke-Test an einem Beispiel-Repo: Dispatcher, Work-Run, Batch-PR, Pretest. Bricht eine Plattformänderung (Routinen, Ollama-Modelle, LiteLLM) den Weg, fällt das innerhalb einer Woche auf.
- README kennzeichnet Kombinationen, die Maintainer nicht selbst fährt (Linear, OpenCode, `none`), als „nicht regelmäßig getestet“.
- `tools/delegate/run_task.py` (rund 33 KB) in kleinere Module teilen, wenn das beim Vereinfachen ohnehin anfällt.

## Out of scope (v1)
- Weitere neue Module (außer `docs-notion`), Tracker, Agents oder Chat-Skills (außer `foreman-update`).
- Automatisches Update ohne Bestätigung.
- Rückweg Notion → Repo und Notion als Tracker.
- Dashboard oder eigene UI.
- Entfernen bestehender Module (Linear, OpenCode, `none`); sie bleiben, werden aber nicht erweitert.
- Barrierefreiheits-Pflicht für foreman selbst.

## Non-functional requirements
- Performance: Dispatcher-Check ohne Modell, alle 10 Minuten; ein Check über alle Projekte dauert unter 1 Minute.
- Platform: Claude-Plugin (Chat und Claude Code), CLI-Installer, Dispatcher als systemd-Timer oder Cron unter Linux.
- Stack: Bash, Node 20+ (`.mjs`), Python 3 (Delegate-Wrapper), Claude Code Routinen mit API-Trigger, itsaplan (self-hosted, Docker), LiteLLM-Proxy, Notion-API (nur Modul `docs-notion`).
- Language / localization: Skill-Dateien und Repo-Doku auf Englisch; Ausgaben folgen `.foreman.json` `context.language`. Ausnahme: Labels und Status im Tracker sind immer Englisch.
- Legal: MIT-Lizenz. Keine Secrets in Repo, Chat oder Logs (Privacy-Scan bleibt Pflicht). ChatGPT-Abo über LiteLLM nur nach ausdrücklicher Zustimmung zum Risikohinweis; die Doku empfiehlt es nicht als Standard.
- Accessibility: not required, reason: foreman hat keine eigene UI. Projekte, die foreman baut, legen WCAG in ihrer eigenen `docs/requirements.md` fest; der a11y-Reviewer und axe im Pretest bleiben unverändert.
  - Required pages: none
  - Language level: standard
  - Editing: no CMS

## Constraints
- Time: kein fester Termin; Nebenprojekt. Erfolgsprüfung nach 3 Monaten (Ende Februar 2027).
- Team: Maintainer allein, mit Claude Code und Workern.
- Versionen: foreman bleibt bei 0.2.x. Jede abgenommene Stufe erscheint als Patch-Version (0.2.2, 0.2.3 …), keine 0.3.0.
- Arbeitsweise am foreman-Repo: Einrichtung über den normalen foreman-Projekt-Weg, Tracker `none` (nur `STATE.md` und Dateien). Bis zur Freigabe der Roadmap wird nichts umgesetzt.
- Budget: nur Abos (Claude, Ollama Cloud, ChatGPT), keine API-Abrechnung.
- House rules: `docs/PRINCIPLES.md` und `docs/CONVENTIONS.md` gelten. Kein neues Feature ohne Messwert, der es begründet. Jede Regeländerung bekommt ihre Begründung in `docs/learnings.md`, die Skills behalten nur die Regel.

## Success definition
Ende Februar 2027:
- Mindestens 3 Milestones in Referenzprojekt 1 und Referenzprojekt 2 sind ohne Eingriff vom Dispatcher bis zum Batch-PR durchgelaufen.
- Das Mess-Skript liefert für beide Projekte Eingriffe pro Milestone und Claude-Fallback-Quote; die README zeigt diese Werte.
- Tests sind durchgehend grün.

## Open questions
- ChatGPT: Maintainer nutzt das Abo vorerst weiter über den Gateway (bewusst, Stand 20.11.2026). Später entscheiden: bleibt es dabei, oder wechselt foreman auf den offiziellen Codex-CLI als Worker beziehungsweise auf einen API-Key?
- Bleiben Linear, OpenCode und `none` als „unterstützt“ in der README, oder werden sie als „nicht regelmäßig getestet“ markiert?
- Wo landen die Messwerte: eigene Datei pro Projekt (`docs/metrics.md`) oder als Abschnitt in den Reports?
- Passt der Browser-Pretest auf Referenzprojekt 2, oder braucht Referenzprojekt 2 einen anderen Prüfweg?
- `docs-notion`: Wann läuft der Spiegel (nach jedem Merge auf `dev`, im Batch-Fenster, beim Release), und wann wird das Wiki aktualisiert (nur beim Release, damit Spieler keinen unfertigen Stand sehen)?
- `docs-notion`: Welche Rolle und welches Modell schreibt die Wiki-Texte, und braucht es beide Text-Skills oder reicht einer?
- `docs-notion`: Bleibt der dritte Spiegel im Claude-Projekt (Referenzprojekt 2: `claude/roadmap-0.1.0/…`), oder fällt er weg, weil er sich nicht per Skript pflegen lässt?
- `docs-notion`: Wird das Wiki über Notion Sites veröffentlicht oder nur per Freigabe-Link?
- `foreman-update`: Läuft der Skill im Chat und übergibt einen Auftrag an Claude Code (wie `foreman-fix`), oder als Repo-Skill direkt in einer Claude-Code-Sitzung im Projekt?
- `workspace.json`: Wo liegt die Kopie, die der Chat liest: als Doku im Claude-Projekt „foreman“ oder in einem privaten Repo? Und wer hält sie aktuell, wenn sich auf dem Server etwas ändert?
- `foreman-update`: Woher kennt der Dispatcher die aktuelle Version: aus seinem eigenen foreman-Klon auf dem Server (braucht regelmäßiges `git pull`) oder aus dem neuesten GitHub-Release?

## Roast notes
- Die Regeln sind im echten Einsatz an Referenzprojekt 1 entstanden (`docs/learnings.md`). Referenzprojekt 1 und Referenzprojekt 2 laufen auf 0.2, aber noch kein Milestone lief ohne Eingriff durch. Optimiert wird an den erfassten Eingriffen, nicht an Vermutungen.
- Die Kombinationsmatrix (3 Profile, 3 Tracker-Varianten, 3 Agents, Gateway) ist größer, als eine Person testen kann. Getestet wird der eigene Weg; der Rest geht still kaputt, wenn sich Plattformen ändern.
- „Spart Tokens“ und „Abo-Kosten statt API“ sind ohne Messung nur Behauptungen. Die Zahlen sind auch das stärkste Portfolio-Argument.
- Das Kostenmodell hängt am ChatGPT-Abo im Gateway. Fällt das weg, steigt der Claude-Verbrauch.
- `docs-notion` holt ein Modul zurück, das in 0.2.0 entfernt wurde: Die erste Fassung entsprach nicht des Maintainers Vorstellung, und der Flow sollte schnell laufen. Ein Umbau in Referenzprojekt 1 hätte die Session überladen; hier ist es jetzt sauber definiert. Ein Wiki, das ein Modell schreibt, weicht vom Repo ab, wenn es nicht strikt in eine Richtung gespiegelt wird. Zwei Text-Skills pro Seite kosten bei jedem Lauf Tokens.
- In Referenzprojekt 2 hält heute die Sitzung drei Fassungen von Hand gleich (Repo, Claude-Projekt, Notion). Das kostet in jeder Sitzung Tokens und geht bei vergessenem Abgleich still auseinander. Die Stand-Zeile der Referenzprojekt 2-Roadmap trägt den Änderungsverlauf von Version 9 bis 27 in einem Absatz; jeder Lauf liest ihn mit. Die Docs-Regel legt fest: Stand-Zeile nur mit aktueller Version und letzter Änderung, der Verlauf steht darunter oder im Git-Log.
- Der Dispatcher auf Host 1 (Alt-Dispatcher (Python)) ist vom Repo abgewichen: Ihm fehlen `fire_command` und `pass_env`, die `dispatch.mjs` in foreman seit 0.2.0 hat und testet. Für Referenzprojekt 3 sollte er gerade nachgebaut werden. Das ist dasselbe Update-Problem wie bei den Projekten, nur auf dem Server.
- Der lokale Lauf per `fire_command` wird nicht überwacht: Der Dispatcher startet den Befehl und schaut nicht nach. Ein abgestürzter Lauf auf Host 2 fällt erst über den 3-Stunden-Lock in `STATE.md` auf.
- Referenzprojekt 1 nutzt deutsche Labels („AP: Eingriff nötig“, „AP: UAT bereit“, „Fix-Paket“), der Mirror von foreman 0.2 erwartet englische („AP: Action Required“, „AP: UAT ready“, „Fix pack“) und bricht bei fehlenden Labels ab. Referenzprojekt 1 läuft also nicht auf dem Label-Stand von 0.2. „AP: Release Freitag“ bindet außerdem den Wochentag in den Namen, obwohl der Release-Tag einstellbar ist.
- `foreman-setup` rät heute bei Infrastruktur und Abos: Der Fragenkatalog kennt nur „eine Maschine“, obwohl der eigene Aufbau zwei hat (Host 1 für Dispatcher und Tracker, Host 2 für lokale Läufe), und er fragt keine Plan-Stufen ab. Eine falsche Annahme dort ergibt einen falschen Installer-Befehl und eine falsche Checkliste.
- „Neues Projekt“ führt heute in die komplette Einrichtung, weil `foreman-project` „nicht installiert“ am leeren Repo festmacht. Ohne gespeichertes Arbeitsumgebungs-Profil weiß kein Skill, dass Dispatcher, Tracker und Abos schon da sind, und der Agent fragt alles neu oder rät.
- Beim Server-Umzug landeten private Zugangsdaten im Klartext in einer Sitzungsausgabe. Sie müssen widerrufen und ersetzt werden; die Ursache ist eine fehlende Regel, nicht ein Einzelfehler.
- Im itsaplan-Workspace gibt es noch keine Projektvorlage (Stand 20.11.2026). Jedes neue Projekt braucht heute Handarbeit für acht Spalten, Label und Ansicht, und jede vergessene oder falsch benannte Spalte ist eine Fehlerquelle für den Tracker-Mirror.
- Ohne Update-Weg läuft jedes Projekt auf dem foreman-Stand seiner Installation weiter. Bei drei Releases in drei Tagen liegen Referenzprojekt 1 und Referenzprojekt 2 schnell mehrere Versionen zurück, und Fixes wie 0.2.1 kommen dort nicht an.
- Der Chat-Orchestrator delegiert erst über einer hohen Schwelle (etwa 80k Tokens Overhead pro Subagent); sein Nutzen ist ungemessen.
