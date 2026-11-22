# Milestone M003: Einrichtung fragt statt rät

**Project:** foreman
**Roadmap:** docs/roadmap-0.2.x.md · **Track:** C · Einrichtung · **Parallel to:** M001, M002, M006, M008, M011

## Goal
`foreman-setup` erfasst Maschinen, Dienste und KI-Zugänge vollständig, rät nichts, speichert das Ergebnis als `workspace.json` (ohne Secrets) und erkennt einen laufenden Gateway. Der Mensch bestätigt eine Zusammenfassung, bevor eine Empfehlung kommt.

## Starting point
foreman 0.2.1. `plugins/foreman/skills/foreman-setup/` fragt in Block C nur „Agent und Plan“ und „eine Maschine“; Tracker, Worker-Zugang, Docker und Benachrichtigung kommen erst in Runde 2 und nur bei Autopilot oder Deploy. `install.sh` schreibt kein Gateway-Preset. Das Gateway-Modul ist „documented only“.

## Capabilities
1. Bestandsaufnahme mit Mehrfachauswahl für alle Profile außer Quick: jede Maschine mit Name und Rolle, was darauf läuft (Docker, Coolify oder ähnlich, itsaplan, LiteLLM, Dispatcher), Domain und HTTPS, KI-Zugänge mit Stufe (Claude-Plan, Routinen mit API-Trigger, Ollama-Cloud-Plan, ChatGPT-Plan, weitere), Benachrichtigungskanal, Tracker (itsaplan mit URL, Linear, keiner). Unbekanntes heißt „unbekannt“ und wird als Lücke genannt.
2. Die Antworten stehen in `workspace.json` (Format festgelegt, Beispiel im Repo, keine Secrets) und im Block `infra` der `.foreman.json`.
3. Läuft ein Gateway, schreibt der Installer das Preset (`base_url`, Name der Key-Variable, Rollen auf `task-*`) und prüft mit `run_task.py --dry-run`. Läuft keiner und ein ChatGPT-Abo ist vorhanden, führt ein eigener optionaler Block (etwa 45 Minuten) durch die Einrichtung, mit Risikohinweis.
4. Das Setup zeigt die Antworten vor der Empfehlung und lässt sie bestätigen.

## Dependencies and order
Keine fest. M003 blockiert M004. Für das Gateway-Preset gilt der Variablenname aus M002; steht er dort noch nicht, nutzt M003 den Namen aus `docs/CONVENTIONS.md` und gleicht beim Merge an.

## Parallel milestones
M001, M002, M006, M008, M011. Geteilte Dateien: `install.sh`, `plugins/foreman/skills/foreman-setup/`, `docs/MODULES.md`, `tools/delegate/config.toml`, `gateway/README.md`, `CHANGELOG.md`. Nur ergänzen, nie umbauen. M004, M005, M006 und M009 erweitern `install.sh` später ebenfalls.

## Surface
Keine UI (Chat-Skill, nur Text).

## Accessibility
Nicht gefordert.

## Role review findings
Bericht: `docs/role-reviews/M001-M003-briefing.md`. Als Erfolgskriterien übernommen: „unbekannt“ wird nie geraten; Mehrfachauswahl erlaubt 0 Treffer; `workspace.json` und `infra` enthalten nur Namen und Rollen, Schema-Test und Privacy-Scan lehnen schlüsselartige Werte ab; nicht erreichbarer Gateway wird gemeldet und das Preset nicht als „geprüft“ geschrieben.

## Binding documents
`docs/requirements.md` (Abschnitt „Must-have“, Punkte zu Setup, Gateway, ChatGPT), `docs/roadmap-0.2.x.md` (Abschnitt M003), `docs/PRINCIPLES.md`, `docs/CONVENTIONS.md`, `CLAUDE.md`.

## Fixed decisions
- Nichts wird erschlossen: jede Annahme in der Zusammenfassung stammt aus einer Antwort.
- Die ChatGPT-Entscheidung steht als `chatgptViaGateway: accepted-risk` in `workspace.json` und wird nicht bei jedem Projekt neu gefragt; ohne Zustimmung schreibt der Installer kein ChatGPT-Ziel.
- `foreman-setup` greift nur bei erster Einrichtung oder geänderter Umgebung; „neues Projekt“ gehört `foreman-project` (M004).
- Keine Secrets in `workspace.json`, Privacy-Scan bleibt grün.

## Data and interfaces
`workspace.json` (neu, Schema und Beispiel im Repo), `.foreman.json` Block `infra`, `install.sh` (Gateway-URL-Option, Preset), `tools/delegate/config.toml`, `run_task.py --dry-run`. Nur Namen von Variablen.

## Out of scope
- `foreman-project` liest das Profil (M004).
- itsaplan-Projektvorlage (M005).
- Wo die Kopie für den Chat liegt (offene Frage in den Requirements, Entscheidung bei Maintainer).
- Änderungen an die Referenzprojekte.

## Success criteria
1. Der Fragenkatalog enthält jede Frage aus den Requirements (Maschinen mit Rolle, Dienste, Domain, KI-Zugänge mit Stufe, Routinen, Benachrichtigung, Tracker, Gateway); Plugin-Validierung grün.
2. Schema-Test für `workspace.json` grün; Privacy-Scan findet nichts; ein Beispiel liegt im Repo.
3. Install mit Gateway-URL erzeugt das Preset; `run_task.py --dry-run` grün; bei nicht erreichbarer URL kommt eine Meldung und kein „geprüft“.
4. Ein Durchlauf mit Testantworten zeigt die Zusammenfassung vor der Empfehlung; „weiß nicht“ ergibt `unbekannt` und eine genannte Lücke.
5. Ohne Gateway und ohne Zustimmung entsteht kein ChatGPT-Ziel.

## Verification
Commands that must be green:
bash scripts/test-all.sh
bash scripts/test-install.sh
Human only (UAT): `foreman-setup` im Chat mit dem eigenen Aufbau (Host 1, Host 2, itsaplan, LiteLLM, Claude Max, Ollama Cloud, ChatGPT): beide Maschinen mit Rolle, Gateway und Plan-Stufen werden gefragt, `workspace.json` stimmt und enthält keinen Key.

## Risks
Zu viele Fragen machen das Setup lang; Mehrfachauswahl und Vorschläge halten es kurz. `install.sh` wird von mehreren Milestones erweitert (Merge-Konflikte). Der Gateway-Name hängt an M002.
