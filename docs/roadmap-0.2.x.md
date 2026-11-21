# foreman: Roadmap 0.2.x

**Stand:** 21.11.2026, Version 1 (erste Fassung aus `docs/requirements.md`)
**Basis:** `docs/requirements.md` (Optimierung ab 0.2.1, Versionen 0.2.x)
**Ziel-Branch:** `dev`, je Milestone ein Sammelbranch `batch/mNNN`; Release nach `main` über `foreman-release`
**Versionen:** Jeder abgenommene Milestone (oder eine Gruppe davon) erscheint als Patch-Version 0.2.2, 0.2.3 … Es gibt keine 0.3.0.
**Agent:** Claude Code; Einrichtung des foreman-Repos über den normalen foreman-Projekt-Weg; Worker nach `tools/delegate/config.toml`
**Testperson (UAT):** Andreas
**Tracker:** none (`STATE.md`, Antworten in `docs/answers/<unit>.md`, UAT in `docs/uat/<unit>.md`)
**Barrierefreiheit:** nicht gefordert (foreman hat keine eigene UI)

Ziel: foreman 0.2.x so vereinfachen und belegen, dass Guildora, Kasev und Office Milestones ohne Eingriff bis zum PR durchlaufen, mit gemessenen Zahlen im Repo und im Portfolio. Neu dazu kommen nur das Modul `docs-notion` und der Skill `foreman-update`.

Konfliktreihenfolge: `docs/requirements.md` > diese Roadmap > Milestone-Brief > Fix-Paket.

Schon erledigt und nicht Teil der Roadmap: Umstellung des Dispatchers auf myweby von `dispatcher.py` auf `dispatch.mjs` (Office-Umzug, 20.11.2026). Projektarbeit in Guildora und Kasev läuft als Fix-Pakete dort (englische Labels, `--no-fetch` in Kasev), nicht hier.

---

## Der Termin

Mehrere Milestones laufen parallel (je Milestone ein Sammelbranch). Die Dauer bestimmt der längste Strang, nicht die Summe. Angaben in Arbeitstagen (AT), Coding + Testing.

| Strang | Milestones (Coding + Testing) | Dauer bis Ende |
|---|---|---|
| **C · Einrichtung** (kritischer Pfad) | M003 (5+3) → M004 (4+3) → M005 (3+3) | 21 AT |
| E · Docs | M008 (2+2) → M009 (4+3) → M010 (4+3) | 18 AT |
| D · Update | M006 (5+3) → M007 (3+2), M007 wartet zusätzlich auf M001 | 13 AT |
| B · Delegate | M002 (4+3) | 7 AT |
| A · Dispatcher | M001 (4+2) | 6 AT |
| F · Messung | M011 (3+2) | 5 AT |
| Abschluss | M012 (4+3), wenn alle Stränge freigegeben sind | +7 AT = 28 AT |

| Größe | Wert |
|---|---|
| Coding gesamt | 45 AT |
| Testing gesamt | 32 AT |
| Kritischer Pfad (Strang C + Abschluss) | 28 AT |
| **+ 15 % Rework-Puffer** | **~32 AT ≈ 6,5 Wochen** |
| Zum Vergleich, rein sequentiell | 77 AT, mit Puffer ~89 AT ≈ 18 Wochen |

Engpass ist der UAT: Andreas nimmt jeden Milestone allein ab. Zum Start liegen bis zu sechs Stränge gleichzeitig an. Realistisch laufen höchstens drei Milestones zur selben Zeit, sonst stauen sich die Abnahmen. Empfohlene Startreihenfolge: M001, M002 und M003 zuerst (sie beheben Sicherheitslücken und den Setup-Fehler), danach M006, M008 und M011.

---

## Grundsätze für alle Milestones

- Keine neuen Funktionen außer `docs-notion` und `foreman-update`. Jede Änderung macht foreman einfacher, sicherer oder messbar.
- Jede Regeländerung steht nur einmal in den Skills; die Begründung kommt nach `docs/learnings.md`.
- `install.sh`, `docs/MODULES.md`, `CHANGELOG.md` und `scripts/test-install.sh` sind geteilte Dateien: parallele Milestones ergänzen sie nur, bauen sie nicht um.
- Tracker-Namen (Spalten, Labels, Ansichten) sind immer Englisch.
- Exakte Modell-IDs für Sitzung und direkte Anbieter, `task-*`-Aliase für Gateway-Rollen.
- Agents lesen nie private Schlüsseldateien aus.
- Alle bestehenden Tests bleiben grün (`scripts/test-all.sh`); jeder Fix bekommt zuerst einen Test, der fehlschlägt.
- Abnahme gegen ein Testprojekt (Wegwerf-Repo mit `install.sh`), nie gegen Guildora, Kasev oder Office direkt. Erst nach dem Release kommen die Projekte über `foreman-update` auf den neuen Stand.

---

## Milestone M001: Dispatcher sicher und eindeutig

**Type:** Foundation
**Strand:** A · Dispatcher
**Goal:** Der Dispatcher gibt Prüfskripten nur die nötige Umgebung, meldet an Discord oder Slack, behandelt `main` nach einer festen Regel und unterstützt lokale Claude-Code-Läufe offiziell.
**Coding:** ~4 Tage (Agent)
**Testing:** ~2 Tage (Mensch)
**Status:** done (UAT von Andreas abgenommen, 2026-11-21; PR #4 in dev)

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M007
- **Parallel to:** M002, M003, M006, M008, M011
- **External risks:** Entscheidung, ob `main` im Merge-Fenster automatisch gemergt wird (Vorschlag: nein, nur auf „Batch PR main“; pro Projekt änderbar über M004)
- **Shared files:** `dispatcher/README.md`, `docs/MODULES.md`, `CHANGELOG.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Umgebung begrenzen | `dispatch.mjs` gibt dem Prüfskript nur `PATH`, `HOME`, `LANG` und `pass_env` mit (Patch von myweby übernehmen) | Test: Fire-Token eines anderen Projekts ist im Prüfskript nicht sichtbar |
| S2 | Webhook-Format | `webhook_format` (`discord`, `slack`, `auto`) in `config.json`, Doku und `dispatcher.env.example` nennen beide | Tests prüfen den Body für Discord und Slack |
| S3 | Regel für `main` | Eine Regel für `batch/main` in `autopilot-check.mjs` und `foreman-fix`, gesteuert über `.foreman.json` (`autopilot.mainAutoMerge`, Standard `false`) | Test: Ohne Freigabe kein Batch für `main` im Fenster; mit `true` schon |
| S4 | `--no-fetch` überall | Vorlage `scripts/autopilot-check.*` akzeptiert `--no-fetch`; `check-config.sh` meldet, wenn ein Projekt es nicht kann | Test mit und ohne Option, gleiche `TASK`-Zeilen |
| S5 | Lokaler Lauf | `fire_command` für Claude Code als offizielle Variante: Startskript-Vorlage (`ssh`, `claude -p`, exakte Model-ID, `claude_login = "inherit"`), Abschnitt in `docs/MODULES.md` | Trockenlauf mit Testprojekt zeigt „would start … via command“, 0 Secret-Treffer im Log |

---

### Human Testing

#### Test goal
Der Dispatcher verrät keine fremden Secrets, meldet in den Kanal der Wahl und mergt `main` nur so, wie das Projekt es festlegt.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Korrektheit, Betrieb auf myweby | nach Coding |

#### Acceptance criteria

- [x] **Umgebung** [agent]: Test beweist, dass das Prüfskript nur `PATH`, `HOME`, `LANG` und `pass_env` sieht.
- [x] **Webhook** [agent]: Tests für Discord- und Slack-Body grün.
- [x] **Webhook echt** [human]: Eine Testmeldung kommt im eigenen Discord-Kanal an.
- [x] **main-Regel** [agent]: Test zeigt: ohne `mainAutoMerge` kein automatischer Batch nach `main`.
- [x] **`--no-fetch`** [agent]: Vorlage akzeptiert die Option, Test grün.
- [x] **Lokaler Lauf** [agent]: Trockenlauf mit `fire_command` am Testprojekt ohne Secret im Log.
- [x] **Alle Tests** [agent]: `scripts/test-all.sh` grün.

Go/no-go: Umgebung begrenzt (Test grün). Ohne das startet M007 nicht.

#### Test flow checklist

**Flow A: Testmeldung**
- [x] Schritt 1: Auf myweby `dispatch.sh --dry-run` mit einem absichtlich kaputten Testprojekt-Eintrag ausführen.
- [x] Schritt 2: Erwartet: genau eine Fehlermeldung im Discord-Kanal, Text nennt das Projekt, kein Token im Text.

**Flow B: main ohne Freigabe**
- [x] Schritt 1: Im Testprojekt ein Fix-Paket mit `Target: main` auf `awaiting-merge` setzen, Uhrzeit im Merge-Fenster.
- [x] Schritt 2: `scripts/autopilot-check.sh --no-fetch` ausführen.
- [x] Schritt 3: Erwartet: kein `TASK|batch|batch:main`.

**Flow C: lokaler Lauf**
- [x] Schritt 1: Testprojekt mit `fire_command` in `config.json`, `dispatch.sh --dry-run`.
- [x] Schritt 2: Erwartet: „would start … via command“, Log ohne Secret-Treffer.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m001`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Der lokale Patch auf myweby weicht vielleicht vom Repo-Stand ab; der Agent übernimmt das Verhalten, nicht den Patch wörtlich.
- `autopilot-check.mjs` wird auch in M004 (Merge-Fenster) angefasst.

---

## Milestone M002: Delegate-Wrapper sicher und sparsam

**Type:** Foundation
**Strand:** B · Delegate
**Goal:** Worker-Aufrufe halten Anbieter-Limits ein, Gateway-Keys erreichen keinen Claude-Worker, und die Regeln zu Modell-IDs und ChatGPT sind eindeutig.
**Coding:** ~4 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M012
- **Parallel to:** M001, M003, M006, M008, M011
- **External risks:** Verhalten der Anbieter bei 429 (Ollama Cloud, LiteLLM, Claude) unterscheidet sich
- **Shared files:** `tools/delegate/config.toml`, `gateway/README.md`, `docs/CONVENTIONS.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Ein Gateway-Name | Ein Name für Key und URL überall (Konventionen, README, `config.toml`, Setup-Referenzen); Sperrliste in `run_task.py` deckt ihn ab | Test: Gateway-Key fehlt in der Umgebung eines Claude-Workers |
| S2 | Limits | Anfragen pro Minute und Stunde je Anbieter, Pause mit wachsendem Abstand bei 429, Sperre nach drei Fehlschlägen, Obergrenze Aufrufe pro Lauf; Sperren im Bericht | Tests mit simuliertem 429: Pause, Sperre, Fallback, Grenze |
| S3 | Zeitlimit je Rolle | `timeout` je Rolle in `config.toml`, globaler Wert als Standard | Test: Rolle mit eigenem Wert bricht nach diesem Wert ab |
| S4 | Regeln in Skills | Modell-ID-Regel (exakt vs. `task-*`), „Worker schreiben nicht unter `.claude/`“, „keine Schlüsseldateien lesen“ in Repo- und Chat-Skills, Begründung in `docs/learnings.md` | Lint-Test findet die Regeln an genau einer Stelle |
| S5 | ChatGPT-Hinweis | Risikohinweis in `gateway/README.md` mit Alternativen; Installer schreibt kein ChatGPT-Ziel ohne `chatgptViaGateway: accepted-risk` | Test: ohne Zustimmung kein `chatgpt/` in den Rollen |

---

### Human Testing

#### Test goal
Ein Lauf mit Fehlversuchen erzeugt keine Anfrage-Schleife, und kein Key landet bei einem Worker, für den er nicht gedacht ist.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Betrieb mit echten Anbietern | nach Coding |

#### Acceptance criteria

- [ ] **Key-Trennung** [agent]: Test grün für den neuen einheitlichen Namen.
- [ ] **Limits** [agent]: Tests für Pause, Sperre, Fallback, Obergrenze grün.
- [ ] **Bericht** [agent]: Simulierter Lauf schreibt jede Sperre in den Bericht.
- [ ] **Echter Lauf** [human]: Ein Testauftrag über Gateway und Ollama läuft durch; im Bericht steht das tatsächliche Modell je Rolle.
- [ ] **Regeln** [agent]: Jede der drei Regeln steht an genau einer Stelle.
- [ ] **ChatGPT** [agent]: Ohne Zustimmung kein `chatgpt/`-Ziel.

Go/no-go: Limits greifen (Tests grün). Ohne das bleibt der Gateway-Betrieb über Nacht riskant.

#### Test flow checklist

**Flow A: echter Testauftrag**
- [ ] Schritt 1: Im Testprojekt `run_task.py` mit Rolle `execution_simple` und einem kleinen Auftrag starten.
- [ ] Schritt 2: Erwartet: Exit 0, Result-File nennt Rolle und Modell.

**Flow B: Anbieter weg**
- [ ] Schritt 1: Gateway-URL in der Testumgebung auf eine nicht erreichbare Adresse setzen, Auftrag starten.
- [ ] Schritt 2: Erwartet: höchstens drei Versuche mit wachsender Pause, dann Fallback auf die Claude-Rolle, Sperre im Bericht.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m002`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- `run_task.py` ist rund 33 KB groß; Änderungen an mehreren Stellen erhöhen das Risiko für Nebeneffekte.
- Der neue Variablenname bricht bestehende Installationen; der Upgrade-Abschnitt in M006 muss ihn nennen.

---

## Milestone M003: Einrichtung fragt statt rät

**Type:** Core Feature
**Strand:** C · Einrichtung
**Goal:** `foreman-setup` erfasst Maschinen, Dienste und KI-Zugänge vollständig, speichert sie als `workspace.json` und erkennt einen laufenden Gateway.
**Coding:** ~5 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** done

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M004
- **Parallel to:** M001, M002, M006, M008, M011
- **External risks:** keine
- **Shared files:** `install.sh`, `plugins/foreman/skills/foreman-setup/`, `docs/MODULES.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Bestandsaufnahme | Fragenkatalog: Maschinen mit Rolle, laufende Dienste, Domain, KI-Zugänge mit Stufe, Routinen, Benachrichtigungskanal, Tracker; Mehrfachauswahl; „unbekannt“ statt Raten | Plugin-Validierung grün; Katalog enthält jede Frage aus den Requirements |
| S2 | `workspace.json` | Format festlegen (ohne Secrets), Setup schreibt es, Beispiel im Repo | Test: Schema-Prüfung, Privacy-Scan findet nichts |
| S3 | Gateway erkennen | Läuft ein Gateway: Installer schreibt Preset (`base_url`, Key-Name, `task-*`) und prüft mit `run_task.py --dry-run`; sonst optionaler Einrichtungsblock mit Risikohinweis | Test: Install mit Gateway-URL erzeugt das Preset |
| S4 | Zusammenfassung | Setup zeigt die Antworten vor der Empfehlung und lässt sie bestätigen | Durchlauf im Chat mit Testantworten zeigt die Zusammenfassung |

---

### Human Testing

#### Test goal
Ein Setup mit dem eigenen Aufbau (myweby, alice, itsaplan, LiteLLM, Claude Max, Ollama Cloud, ChatGPT) endet mit einer `workspace.json`, die stimmt, ohne dass der Agent etwas annimmt.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Vollständigkeit der Fragen | nach Coding |

#### Acceptance criteria

- [ ] **Fragen** [human]: Setup fragt nach beiden Maschinen mit Rolle, nach dem Gateway und nach den Plan-Stufen.
- [ ] **Kein Raten** [human]: Jede Annahme in der Zusammenfassung stammt aus einer Antwort; offene Punkte stehen als „unbekannt“.
- [ ] **`workspace.json`** [agent]: Schema-Test grün, keine Secrets.
- [ ] **Gateway-Preset** [agent]: Install mit Gateway-URL schreibt das Preset, Dry-Run grün.
- [ ] **Alle Tests** [agent]: `scripts/test-all.sh` grün.

Go/no-go: `workspace.json` wird geschrieben und enthält den eigenen Aufbau korrekt.

#### Test flow checklist

**Flow A: eigener Aufbau**
- [ ] Schritt 1: Im Chat `foreman-setup` starten, eigene Infrastruktur angeben.
- [ ] Schritt 2: Erwartet: Fragen zu myweby und alice, Gateway-URL, Plan-Stufen; Zusammenfassung vor der Empfehlung.
- [ ] Schritt 3: Erwartet: `workspace.json` mit beiden Maschinen, Gateway, Abos, ohne Key.

**Flow B: unbekannte Antwort**
- [ ] Schritt 1: Bei „Ollama-Plan“ mit „weiß nicht“ antworten.
- [ ] Schritt 2: Erwartet: `unbekannt` in `workspace.json`, Lücke in der Zusammenfassung genannt.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m003`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Zu viele Fragen machen das Setup lang; Mehrfachauswahl und Vorschläge halten es kurz.
- `install.sh` wird auch in M004, M005, M006 und M009 erweitert.

---

## Milestone M004: Neues Projekt in bestehender Umgebung

**Type:** Core Feature
**Strand:** C · Einrichtung
**Goal:** „Neues Projekt“ führt in `foreman-project`, das nur die Projektschritte macht und Merge-Fenster, Ausführung und `main`-Regel pro Projekt erfragt.
**Coding:** ~4 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M003 (approved)
- **Blocks:** M005
- **Parallel to:** M006, M009, M011
- **External risks:** Ablageort der Chat-Kopie von `workspace.json` (offene Frage; Vorschlag: Doku im Claude-Projekt „foreman“)
- **Shared files:** `install.sh`, `plugins/foreman/skills/foreman-project/`, `autopilot-check.mjs`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Erkennen statt neu einrichten | `foreman-project` liest `workspace.json`; fehlt es, prüft es Hinweise und stellt genau eine Frage; die Regel „not installed → setup“ fällt weg | Durchlauf mit vorhandener `workspace.json` startet kein Setup |
| S2 | Skill-Beschreibungen | Beschreibungen von `foreman-setup` und `foreman-project` grenzen sauber ab | Plugin-Validierung grün; Testfragen „neues Projekt“ landen bei `foreman-project` |
| S3 | Projektfragen | Name, Profil, Module, Cloud oder lokal, Staging, Zeitzone, Fenster-Stunden, Wartezeit, `mainAutoMerge` | Install schreibt `context.timeZone`, `autopilot.batchHours`, Wartezeit und `mainAutoMerge` in `.foreman.json` |
| S4 | Installer-Werte | `install.sh` nimmt diese Werte als Flags an statt fest `UTC` | Test: Install mit `--tz Europe/Berlin --batch-hours …` schreibt die Werte |

---

### Human Testing

#### Test goal
Ein neues Testprojekt ist in unter 60 Minuten eingerichtet, ohne dass Dispatcher, Tracker oder Abos neu abgefragt werden.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Ablauf, Dauer | nach Coding |

#### Acceptance criteria

- [ ] **Kein Setup** [human]: „Neues Projekt“ startet `foreman-project`, nicht `foreman-setup`.
- [ ] **Nur Projektfragen** [human]: Keine Frage zu Maschinen, Gateway oder Abos.
- [ ] **Werte** [agent]: `.foreman.json` enthält Zeitzone, Fenster, Wartezeit, `mainAutoMerge` wie beantwortet.
- [ ] **Dauer** [human]: Einrichtung des Testprojekts bis zum ersten Trockenlauf unter 60 Minuten.
- [ ] **Alle Tests** [agent]: `scripts/test-all.sh` grün.

Go/no-go: „Neues Projekt“ startet kein Setup mehr.

#### Test flow checklist

**Flow A: neues Testprojekt**
- [ ] Schritt 1: Leeres Repo anlegen, im Chat „neues Projekt“ sagen.
- [ ] Schritt 2: Erwartet: `foreman-project` liest `workspace.json`, fragt nur Projektwerte.
- [ ] Schritt 3: Install-Befehl ausführen; erwartet: `.foreman.json` mit den Antworten, `check-config.sh` meldet ok.

**Flow B: ohne `workspace.json`**
- [ ] Schritt 1: Chat ohne Zugriff auf `workspace.json`, „neues Projekt“.
- [ ] Schritt 2: Erwartet: genau die Frage „Ist foreman schon eingerichtet?“; bei „ja“ kein Setup.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m004`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- `autopilot-check.mjs` wurde in M001 geändert; M004 baut auf dem freigegebenen Stand auf.
- Ob das Routing im Chat greift, hängt an der Skill-Beschreibung; das lässt sich nur im echten Chat prüfen.

---

## Milestone M005: itsaplan-Vorlage und englische Namen

**Type:** Integration
**Strand:** C · Einrichtung
**Goal:** Neue itsaplan-Projekte entstehen aus einer Vorlage im Repo mit englischen Spalten und Labels, und `check-config.sh` meldet jeden übersetzten Namen.
**Coding:** ~3 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M004 (approved); extern: Guildora-Labels umbenannt (Fix-Paket `2026-11-20-tracker-labels-en` in Guildora)
- **Blocks:** M012
- **Parallel to:** M007, M010
- **External risks:** itsaplan-API (Export-Format `itsaplan.project-template` Version 1); Export enthält keine Personen
- **Shared files:** `install.sh`, `template/scripts/check-config.sh`, `docs/MODULES.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Vorlage im Repo | Vorlage aus dem umbenannten Guildora-Projekt exportieren, als Datei ins Repo; Issue-Vorlagen für Eingriff, UAT, Update-Meldung ergänzen | Datei validiert gegen das Exportformat; alle Namen Englisch |
| S2 | Import im Setup | `foreman-setup` importiert die Vorlage einmal pro Workspace | Testlauf gegen itsaplan: Vorlage erscheint in `list_project_templates` |
| S3 | Projekt aus Vorlage | `foreman-project` legt das Projekt aus der Vorlage an, nennt den einzigen Handschritt (Bot als Mitglied) | Testprojekt hat alle Spalten, Labels, Ansicht „UAT ready“ |
| S4 | Namensprüfung | `check-config.sh` prüft Spalten und Labels gegen die englischen Namen | Test: deutscher Name ergibt Fehler |

---

### Human Testing

#### Test goal
Ein neues itsaplan-Projekt braucht keine Handarbeit mehr außer dem Bot-Mitglied, und deutsche Namen fallen sofort auf.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | itsaplan-Projekt prüfen | nach Coding |

#### Acceptance criteria

- [ ] **Vorlage** [agent]: Datei im Repo, Format gültig, Namen Englisch.
- [ ] **Projekt** [human]: Testprojekt in itsaplan hat acht Spalten, alle `AP:`-Labels, Ansicht „UAT ready“.
- [ ] **Mirror** [agent]: `state-mirror.mjs --dry-run` am Testprojekt endet mit Exit 0.
- [ ] **Prüfung** [agent]: Test mit deutschem Label schlägt fehl.

Go/no-go: Mirror-Trockenlauf gegen ein Projekt aus der Vorlage endet mit Exit 0.

#### Test flow checklist

**Flow A: Projekt aus Vorlage**
- [ ] Schritt 1: `foreman-project` für ein Testprojekt mit Tracker itsaplan.
- [ ] Schritt 2: Erwartet: Projekt in itsaplan angelegt, Hinweis „Bot als Mitglied hinzufügen“.
- [ ] Schritt 3: Bot hinzufügen, `node scripts/state-mirror.mjs --dry-run`; erwartet: Exit 0.

**Flow B: deutscher Name**
- [ ] Schritt 1: Ein Label im Testprojekt auf „AP: UAT bereit“ umbenennen.
- [ ] Schritt 2: `scripts/check-config.sh`; erwartet: Fehler mit dem Namen und dem englischen Soll.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m005`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Ohne umbenannte Guildora-Labels entsteht die Vorlage mit deutschen Namen; S1 wartet darauf.
- Kasev hat ein älteres Phasen-Modell; die Vorlage folgt dem Modell von foreman 0.2.

---

## Milestone M006: foreman-update

**Type:** Core Feature
**Strand:** D · Update
**Goal:** Ein installiertes Projekt lässt sich auf die aktuelle foreman-Version bringen, ohne projektspezifische Anpassungen zu verlieren.
**Coding:** ~5 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** done (UAT von Andreas abgenommen, 2026-11-21; PR #11 in dev)

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M007, M012
- **Parallel to:** M001, M002, M003, M008, M011
- **External risks:** offene Frage, ob der Skill im Chat (Auftrag an Claude Code) oder als Repo-Skill läuft; Vorschlag: Chat-Skill erzeugt einen Auftrag, Ausführung im Repo
- **Shared files:** `install.sh`, `CHANGELOG.md`, `scripts/test-install.sh`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Dateiklassen | Liste: foreman-eigen, projekt-eigen, gemischt, für jede Datei aus `template/` | Test: jede Datei aus `template/` hat genau eine Klasse |
| S2 | Upgrade-Abschnitte | `CHANGELOG.md` bekommt je Version einen Abschnitt „Upgrade“ (Dateien, Schritte, optional); ab 0.2.1 nachgetragen | Lint-Test: jede Version hat den Abschnitt |
| S3 | `install.sh --update` | Update-Modus mit `--dry-run`, beachtet die Klassen, erhöht `version` in `.foreman.json` erst nach Erfolg | Test: Testprojekt mit angepasster `CLAUDE.md` und `config.toml` bleibt dort unverändert, foreman-eigene Dateien aktuell |
| S4 | Skill | Chat-Skill `foreman-update`: Versionsvergleich, Liste der Änderungen, Checkliste für Schritte außerhalb des Repos, neue Module nur nach Ja | Plugin-Validierung grün; Durchlauf am Testprojekt erzeugt Auftrag und Checkliste |
| S5 | Projektanweisung | `foreman-update` ruft am Ende `foreman-project-mode` im Auffrischen-Modus auf (Versionsvergleich der Markierung `foreman-project-block`); in einem Claude-Projekt steht die Checkliste-Zeile „Projektanweisung aktuell“ | Test: Testprojekt mit Block v0 meldet „veraltet“, mit aktuellem Block „aktuell“ |

---

### Human Testing

#### Test goal
Ein Projekt auf 0.2.1 kommt per `foreman-update` auf den neuen Stand, und alles Projekteigene bleibt, wie es war.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Update am Testprojekt | nach Coding |

#### Acceptance criteria

- [ ] **Klassen** [agent]: Test grün.
- [ ] **Upgrade-Abschnitte** [agent]: jede Version hat einen.
- [ ] **Anpassungen bleiben** [agent]: Test mit angepasster `CLAUDE.md` und `config.toml` grün.
- [ ] **Version erst nach Erfolg** [agent]: abgebrochenes Update lässt `version` unverändert.
- [ ] **Checkliste** [human]: Die Schritte außerhalb des Repos sind nummeriert und mit Minuten versehen.
- [ ] **Projektanweisung** [agent]: veralteter Block wird erkannt, aktueller als „aktuell“ gemeldet.

Go/no-go: Projekteigene Dateien bleiben beim Update unverändert.

#### Test flow checklist

**Flow A: Update am Testprojekt**
- [ ] Schritt 1: Testprojekt mit 0.2.1 installieren, `CLAUDE.md` und `config.toml` ändern.
- [ ] Schritt 2: `install.sh --update --dry-run`; erwartet: Liste der Änderungen, die beiden Dateien als „bleibt“.
- [ ] Schritt 3: `install.sh --update`; erwartet: `version` neu, Anpassungen da, `check-config.sh` ok.

**Flow B: Abbruch**
- [ ] Schritt 1: Update mit einem absichtlich gesperrten Zielordner starten.
- [ ] Schritt 2: Erwartet: Fehler, `version` in `.foreman.json` unverändert.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m006`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Gemischte Dateien (zum Beispiel `CLAUDE.md`) lassen sich nicht automatisch zusammenführen; der Skill zeigt sie nur.
- Guildora und Kasev weichen stärker von 0.2.1 ab (Analysen F2/F3 der Fix-Pakete); ihre Ergebnisse fließen in die Dateiklassen ein.

---

## Milestone M007: Update-Meldung im Dispatcher

**Type:** Integration
**Strand:** D · Update
**Goal:** Liegt ein Projekt hinter der aktuellen foreman-Version, meldet der Dispatcher das genau einmal im Tracker und per Webhook.
**Coding:** ~3 Tage (Agent)
**Testing:** ~2 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M006 (approved), M001 (approved)
- **Blocks:** M012
- **Parallel to:** M005, M010
- **External risks:** offene Frage, ob die aktuelle Version aus dem foreman-Klon oder dem GitHub-Release kommt; Vorschlag: GitHub-Release
- **Shared files:** `dispatcher/dispatch.mjs`, `dispatcher/README.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Versionsvergleich | Dispatcher liest `version` je Projekt und die aktuelle foreman-Version, ohne Modell | Test: veraltetes Projekt erkannt, aktuelles nicht |
| S2 | Ticket | Bei itsaplan ein Ticket „foreman update available: <old> → <new>“ in „Action Required“, einmal pro Projekt und Version, schließt sich nach dem Update | Test gegen Attrappe: genau ein Ticket, Schließen nach Update |
| S3 | Webhook | Eine Nachricht pro Projekt und Version; bei Tracker `none` nur der Webhook | Test: zweiter Lauf schickt nichts |

---

### Human Testing

#### Test goal
Ein veraltetes Projekt erzeugt genau eine Meldung, und sie verschwindet nach dem Update.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Meldung in itsaplan und Discord | nach Coding |

#### Acceptance criteria

- [ ] **Einmal** [agent]: Tests zeigen eine Meldung pro Projekt und Version.
- [ ] **Ticket echt** [human]: Testprojekt mit alter Version bekommt ein Ticket in „Action Required“ mit englischem Titel.
- [ ] **Schließen** [agent]: Nach dem Update ist das Ticket geschlossen.
- [ ] **Ohne Tracker** [agent]: Projekt mit `none` erzeugt nur die Webhook-Meldung.

Go/no-go: keine doppelte Meldung bei zwei Läufen hintereinander.

#### Test flow checklist

**Flow A: veraltetes Testprojekt**
- [ ] Schritt 1: Testprojekt mit `version` 0.2.1 im Dispatcher, Lauf abwarten.
- [ ] Schritt 2: Erwartet: ein Ticket in itsaplan, eine Discord-Nachricht.
- [ ] Schritt 3: Nächster Lauf; erwartet: keine weitere Meldung.

**Flow B: nach Update**
- [ ] Schritt 1: `install.sh --update` im Testprojekt, Lauf abwarten.
- [ ] Schritt 2: Erwartet: Ticket geschlossen.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m007`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Der Dispatcher legt hier erstmals selbst ein Ticket an; das muss über das Bot-Konto laufen, nie über ein Modell.

---

## Milestone M008: Docs-Regeln und Aufteilen

**Type:** Foundation
**Strand:** E · Docs
**Goal:** Eine Regeldatei legt fest, welche Dokumente wo liegen und wann große Dokumente in Übersicht und Teildateien geteilt werden.
**Coding:** ~2 Tage (Agent)
**Testing:** ~2 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M009
- **Parallel to:** M001, M002, M003, M006, M011
- **External risks:** keine
- **Shared files:** `docs/CONVENTIONS.md`, `template/docs/`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Regeldatei | Welche Dokumente, wo, wer schreibt, wann; ergänzt `docs/CONVENTIONS.md` | Datei in `template/docs/`, keine doppelte Regel in `CONVENTIONS.md` |
| S2 | Aufteilen | Muster aus Kasev (Übersicht + Ordner, Tabelle „Datei, Inhalt, Lesen bei“, Konfliktreihenfolge), Schwelle für das Aufteilen, Stand-Zeile nur mit aktueller Version und letzter Änderung | `foreman-roast` und `foreman-roadmap` verweisen darauf |
| S3 | Prüfung | Test meldet eine Stand-Zeile mit mehr als einer Version | Test grün an Beispielen |

---

### Human Testing

#### Test goal
Ein Agent weiß ohne Rückfrage, wo ein Dokument hingehört und wann er es teilt.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Verständlichkeit der Regel | nach Coding |

#### Acceptance criteria

- [ ] **Regeldatei** [agent]: vorhanden, keine Doppelung.
- [ ] **Aufteilen** [human]: Regel passt auf die Kasev-Requirements (Übersicht + zehn Teile).
- [ ] **Stand-Zeile** [agent]: Test grün.

Go/no-go: Regeldatei vorhanden und von Roast und Roadmap referenziert.

#### Test flow checklist

**Flow A: Regel gegen Kasev**
- [ ] Schritt 1: Regel neben `docs/requirements.md` von Kasev legen.
- [ ] Schritt 2: Erwartet: Kasevs Aufbau erfüllt die Regel, nur die Stand-Zeile verstößt.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m008`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Die Schwelle zum Aufteilen ist eine Ermessensfrage; sie wird als Zahl festgelegt (zum Beispiel Wörter pro Datei).

---

## Milestone M009: docs-notion Spiegel

**Type:** Integration
**Strand:** E · Docs
**Goal:** Ein Skript spiegelt die Repo-Docs in eine Richtung nach Notion, eine Seite pro Datei.
**Coding:** ~4 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M008 (approved)
- **Blocks:** M010
- **Parallel to:** M004, M006, M007
- **External risks:** Notion-API (Rate-Limits, Blocklängen); offene Frage, wann der Spiegel läuft; Vorschlag: nach jedem Merge auf `dev`
- **Shared files:** `install.sh`, `scripts/test-install.sh`, `docs/MODULES.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Modul | `docs-notion` im Installer; die Sperre für `notion` in `install.sh` und `test-install.sh` fällt weg | Test: Install mit und ohne Modul |
| S2 | Spiegel-Skript | Repo → Notion, eine Seite pro Datei, Übersicht als Elternseite, `--dry-run`, Notion-Änderungen werden überschrieben | Trockenlauf listet Seiten; echter Lauf gegen eine Test-Seite |
| S3 | Auslöser | Spiegel läuft im festgelegten Moment (Batch-Lauf), nicht durch ein Modell | Test: Batch-Lauf ruft das Skript |
| S4 | Sicherheit | Kein Secret im Log, Limits der Notion-API eingehalten | Privacy-Scan grün; simulierter 429 führt zu Pause |

---

### Human Testing

#### Test goal
Die Docs eines Testprojekts stehen nach einem Merge in Notion, mit derselben Struktur wie im Repo.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Notion-Struktur | nach Coding |

#### Acceptance criteria

- [ ] **Modul** [agent]: Install-Tests grün.
- [ ] **Struktur** [human]: Übersicht ist Elternseite, Teildateien darunter, Inhalt wie im Repo.
- [ ] **Einbahn** [human]: Eine Änderung in Notion ist nach dem nächsten Lauf weg.
- [ ] **Log** [agent]: kein Secret.

Go/no-go: Struktur in Notion entspricht dem Repo.

#### Test flow checklist

**Flow A: Spiegel**
- [ ] Schritt 1: Testprojekt mit `docs-notion`, Docs nach dem Kasev-Muster, Merge auf `dev`.
- [ ] Schritt 2: Erwartet: Seiten in Notion, Übersicht oben, eine Unterseite pro Teildatei.

**Flow B: Änderung in Notion**
- [ ] Schritt 1: Text auf einer gespiegelten Seite in Notion ändern, nächsten Lauf abwarten.
- [ ] Schritt 2: Erwartet: Änderung überschrieben.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m009`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Markdown-Tabellen und Codeblöcke werden in Notion anders dargestellt; das Skript braucht eine klare Umwandlung.
- Der dritte Spiegel im Claude-Projekt ist offen; er gehört nicht zu diesem Milestone.

---

## Milestone M010: Öffentliches Wiki

**Type:** Core Feature
**Strand:** E · Docs
**Goal:** Ein Projekt kann ein öffentliches Wiki in Notion für festgelegte Zielgruppen pflegen, und jeder Milestone prüft, ob es aktualisiert werden muss.
**Coding:** ~4 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M009 (approved)
- **Blocks:** M012
- **Parallel to:** M005, M007
- **External risks:** offene Fragen: Zeitpunkt der Veröffentlichung (Vorschlag: beim Release), Modell für die Wiki-Texte, Notion Sites oder Freigabe-Link
- **Shared files:** `template/docs/milestones/_TEMPLATE/`, `plugins/foreman/skills/foreman-brief/`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Konfiguration | Wiki-Schalter, Sprache, Zielgruppen pro Projekt in `.foreman.json` | `check-config.sh` prüft die Felder |
| S2 | Wiki-Dateien | Seiten unter `docs/wiki/`, geschrieben aus den internen Docs für die Zielgruppen, Text-Skills vor dem Veröffentlichen | Testprojekt hat Wiki-Seiten für eine Zielgruppe |
| S3 | Veröffentlichen | Dasselbe Skript wie M009 veröffentlicht `docs/wiki/`; Privacy-Scan davor; interne Inhalte ausgeschlossen | Test: Seite mit „Roast“ oder Host-Namen wird abgelehnt |
| S4 | Milestone-Todo | Vorlage und `foreman-brief` enthalten „Prüfen, ob das Wiki aktualisiert werden muss“; ohne Zeile in `STATE.md` kein Abschluss | Test: Milestone ohne Wiki-Zeile schließt nicht ab |

---

### Human Testing

#### Test goal
Spieler oder Nutzer lesen ein Wiki, das zu ihnen passt und nichts Internes zeigt.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Inhalt und Ton für die Zielgruppe | nach Coding |

#### Acceptance criteria

- [ ] **Zielgruppe** [human]: Wiki-Seiten des Testprojekts sprechen die eingestellte Zielgruppe an.
- [ ] **Nichts Internes** [agent]: Test mit internen Inhalten wird abgelehnt.
- [ ] **Todo** [agent]: Abschluss ohne Wiki-Zeile scheitert.
- [ ] **Abschaltbar** [agent]: Ohne Wiki-Schalter kein Todo, keine Veröffentlichung.

Go/no-go: Privacy-Scan blockiert interne Inhalte zuverlässig.

#### Test flow checklist

**Flow A: Wiki für Spieler**
- [ ] Schritt 1: Testprojekt mit Zielgruppe „Spieler und Tester“, Wiki an.
- [ ] Schritt 2: Erwartet: Wiki-Seiten in Notion, ohne Roadmap-Details, Hosts oder offene Fragen.

**Flow B: Milestone-Abschluss**
- [ ] Schritt 1: Milestone im Testprojekt ohne Wiki-Zeile abschließen lassen.
- [ ] Schritt 2: Erwartet: Abschluss verweigert, Hinweis auf das fehlende Todo.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m010`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Ein Modell schreibt die Texte; ohne strikte Quelle (nur interne Docs) erfindet es Funktionen.
- Zwei Text-Skills pro Seite kosten Tokens; die offene Frage dazu muss vor S2 entschieden sein.

---

## Milestone M011: Messung und Eingriffe

**Type:** Core Feature
**Strand:** F · Messung
**Goal:** Ein Skript fasst pro Projekt und Zeitraum Laufzeit, Eingriffe mit Ursache, Claude-Fallbacks und Modelle je Rolle zusammen.
**Coding:** ~3 Tage (Agent)
**Testing:** ~2 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** none
- **Blocks:** M012
- **Parallel to:** M001, M002, M003, M006, M008
- **External risks:** offene Frage, wo die Werte landen; Vorschlag: `docs/metrics.md` pro Projekt
- **Shared files:** `template/scripts/`, `STATE.md`-Vorlage

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Eingriffs-Ursache | `STATE.md` bekommt bei jedem Eingriff eine Ursachen-Zeile (Kategorie und Satz) | Test: `needs-input` ohne Ursache wird gemeldet |
| S2 | Mess-Skript | Liest `STATE.md`, Reports, Worker-Result-Files; gibt Laufzeit, Eingriffe, Fallbacks, Modelle aus | Test an Beispieldaten mit erwarteten Zahlen |
| S3 | Ausgabe | Ergebnis in `docs/metrics.md`, Zeitraum als Option | Datei entsteht am Testprojekt |

---

### Human Testing

#### Test goal
Die Zahlen für Guildora, Kasev und Office lassen sich ohne Handarbeit erzeugen.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Plausibilität der Zahlen | nach Coding |

#### Acceptance criteria

- [ ] **Ursache** [agent]: Test grün.
- [ ] **Zahlen** [agent]: Beispieldaten ergeben die erwarteten Werte.
- [ ] **Plausibel** [human]: Ein Lauf am Testprojekt zeigt Werte, die zu den Berichten passen.

Go/no-go: Mess-Skript liefert für Beispieldaten die erwarteten Zahlen.

#### Test flow checklist

**Flow A: Messung**
- [ ] Schritt 1: Mess-Skript am Testprojekt für die letzten 7 Tage.
- [ ] Schritt 2: Erwartet: `docs/metrics.md` mit Läufen, Eingriffen, Fallbacks, Modellen.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m011`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Alte Reports haben kein einheitliches Format; das Skript wertet nur Daten ab diesem Milestone sicher aus.

---

## Milestone M012: Vereinfachen und Abschluss 0.2.x

**Type:** Launch
**Strand:** Abschluss
**Goal:** Doppelte Regeln sind an einer Stelle, ein Work-Run liest nicht mehr als vorher, und README und Learnings zeigen den Stand mit Zahlen.
**Coding:** ~4 Tage (Agent)
**Testing:** ~3 Tage (Mensch)
**Status:** open

---

### Dependencies

- **Blocked by:** M001, M002, M005, M006, M007, M010, M011 (approved)
- **Blocks:** none
- **Parallel to:** -
- **External risks:** Zahlen aus Guildora, Kasev und Office erst nach deren Update über `foreman-update`
- **Shared files:** alle Skills, `README.md`, `docs/learnings.md`

---

### Slices (agent orders)

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | Doppelte Regeln | Regeln, die in Chat-Skills, Repo-Skills und `docs/` mehrfach stehen, an eine Stelle ziehen | Liste der Doppelungen leer; Lint-Test grün |
| S2 | Lesemenge | Messen, was ein Work-Run liest; nicht mehr als vor 0.2.2 | Vorher- und Nachher-Zahl im Bericht |
| S3 | README | Gemessene Zahlen, Verweis auf `docs/learnings.md`, Kombinationen ohne regelmäßigen Test gekennzeichnet | README zeigt Zahlen aus M011 |
| S4 | Rollout | `foreman-update` für Guildora, Kasev, Office als Aufträge vorbereiten | drei Aufträge mit Checklisten |

---

### Human Testing

#### Test goal
foreman ist schlanker als 0.2.1, und die Projekte kommen sauber auf den neuen Stand.

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| Andreas | Abnahme, Rollout | nach Coding |

#### Acceptance criteria

- [ ] **Lesemenge** [agent]: Work-Run liest höchstens so viel wie vor 0.2.2.
- [ ] **Doppelungen** [agent]: Lint-Test grün.
- [ ] **README** [human]: Zahlen und Kennzeichnung stimmen.
- [ ] **Rollout** [human]: Mindestens ein Projekt ist per `foreman-update` auf dem neuen Stand, `check-config.sh` ok.
- [ ] **Alle Tests** [agent]: `scripts/test-all.sh` grün.

Go/no-go: ein echtes Projekt per `foreman-update` aktualisiert, ohne verlorene Anpassungen.

#### Test flow checklist

**Flow A: Rollout Office**
- [ ] Schritt 1: `foreman-update` für Office.
- [ ] Schritt 2: Erwartet: Auftrag und Checkliste; nach Ausführung `version` neu, Anpassungen da, nächster Dispatcher-Lauf ohne Fehler.

#### Feedback-loop protocol

1. Fund dokumentieren: wo, was passiert, was erwartet war.
2. Korrektur-Auftrag als Fix-Paket auf `batch/m012`.
3. Nur den betroffenen Flow erneut testen.
4. Freigabe erst, wenn alle Kriterien erfüllt sind.

#### Known risks in this milestone
- Vereinfachen berührt alle Skills; Konflikte mit späten Fix-Paketen sind wahrscheinlich.

---

## Abhängigkeits-Übersicht

| Milestone | Strang | Coding | Testing | Abhängig von | Blockiert |
|---|---|---|---|---|---|
| M001: Dispatcher sicher und eindeutig | A | 4 T | 2 T | — | M007 |
| M002: Delegate-Wrapper sicher und sparsam | B | 4 T | 3 T | — | M012 |
| M003: Einrichtung fragt statt rät | C | 5 T | 3 T | — | M004 |
| M004: Neues Projekt in bestehender Umgebung | C | 4 T | 3 T | M003 ✅ | M005 |
| M005: itsaplan-Vorlage und englische Namen | C | 3 T | 3 T | M004 ✅, Guildora-Labels | M012 |
| M006: foreman-update | D | 5 T | 3 T | — | M007, M012 |
| M007: Update-Meldung im Dispatcher | D | 3 T | 2 T | M006 ✅, M001 ✅ | M012 |
| M008: Docs-Regeln und Aufteilen | E | 2 T | 2 T | — | M009 |
| M009: docs-notion Spiegel | E | 4 T | 3 T | M008 ✅ | M010 |
| M010: Öffentliches Wiki | E | 4 T | 3 T | M009 ✅ | M012 |
| M011: Messung und Eingriffe | F | 3 T | 2 T | — | M012 |
| M012: Vereinfachen und Abschluss 0.2.x | — | 4 T | 3 T | alle ✅ | — |

✅ = Testing-Freigabe erforderlich, bevor Abhängige starten.

**Parallele Stränge:** M001, M002, M003, M006, M008 und M011 können sofort starten; empfohlen sind höchstens drei gleichzeitig. Nach M003 folgt M004, danach M005. Nach M006 und M001 folgt M007. Nach M008 folgt M009, danach M010. M012 startet, wenn alle freigegeben sind.
**Kritischer Pfad:** M003 → M004 → M005 → M012
**Testing-Flaschenhals:** zum Start, wenn bis zu sechs Milestones gleichzeitig zur Abnahme kommen könnten; am aufwendigsten M003 und M004, weil das Routing im Chat nur von Hand prüfbar ist.

---

## Roadmap-Zusammenfassung

| # | Milestone | Typ | Strang | Coding | Testing | Gesamt | Abhängig von | Version |
|---|---|---|---|---|---|---|---|---|
| M001 | Dispatcher sicher und eindeutig | Foundation | A | 4 T | 2 T | 6 T | — | 0.2.2 |
| M002 | Delegate-Wrapper sicher und sparsam | Foundation | B | 4 T | 3 T | 7 T | — | 0.2.2 |
| M003 | Einrichtung fragt statt rät | Core Feature | C | 5 T | 3 T | 8 T | — | 0.2.3 |
| M004 | Neues Projekt in bestehender Umgebung | Core Feature | C | 4 T | 3 T | 7 T | M003 | 0.2.3 |
| M005 | itsaplan-Vorlage und englische Namen | Integration | C | 3 T | 3 T | 6 T | M004 | 0.2.3 |
| M006 | foreman-update | Core Feature | D | 5 T | 3 T | 8 T | — | 0.2.4 |
| M007 | Update-Meldung im Dispatcher | Integration | D | 3 T | 2 T | 5 T | M006, M001 | 0.2.4 |
| M008 | Docs-Regeln und Aufteilen | Foundation | E | 2 T | 2 T | 4 T | — | 0.2.5 |
| M009 | docs-notion Spiegel | Integration | E | 4 T | 3 T | 7 T | M008 | 0.2.5 |
| M010 | Öffentliches Wiki | Core Feature | E | 4 T | 3 T | 7 T | M009 | 0.2.5 |
| M011 | Messung und Eingriffe | Core Feature | F | 3 T | 2 T | 5 T | — | 0.2.4 |
| M012 | Vereinfachen und Abschluss 0.2.x | Launch | — | 4 T | 3 T | 7 T | alle | 0.2.6 |

Die Spalte „Version“ ist ein Vorschlag. Erscheint ein Milestone früher als die anderen seiner Gruppe, bekommt er die nächste freie Patch-Version.

**Planwert (kritischer Pfad mit 15 % Rework, Milestones parallel):** ~32 AT ≈ 6,5 Wochen
**Zum Vergleich, rein sequentiell:** ~89 AT ≈ 18 Wochen
**Testing-Anteil gesamt:** ~42 %
**Frühestes Ende:** ~32 AT nach Start; realistisch mit einem Tester und höchstens drei parallelen Milestones 10 bis 12 Wochen, also passend zur Erfolgsprüfung Ende Februar 2027.

### Offene Risiken

- UAT-Kapazität: Andreas testet allein; mehr als drei parallele Milestones stauen die Abnahme.
- M005 hängt an den umbenannten Guildora-Labels (Fix-Paket in Guildora).
- `install.sh` wird in M003, M004, M005, M006 und M009 erweitert; Merge-Konflikte sind wahrscheinlich.
- Offene Fragen aus den Requirements blockieren einzelne Slices: `workspace.json`-Ablage (M004), Update-Ausführung und Versionsquelle (M006, M007), Spiegel-Zeitpunkt, Wiki-Modell und Veröffentlichung (M009, M010), Ablage der Messwerte (M011).
- ChatGPT über den Gateway bleibt ein bewusstes Risiko (Sperre des Abos); M002 sorgt für Limits und Hinweis, nicht für eine Garantie.
- Zahlen für die README entstehen erst, wenn Guildora, Kasev und Office auf dem neuen Stand laufen.

### Agent-Coding-Hinweise

- M003 und M004 brauchen den meisten Kontext: Fragenkatalog, Profile, Installer-Flags und Routing der Skills hängen zusammen.
- Halluzinationsrisiko hoch bei der itsaplan-API (nur das Exportformat aus der Doku), bei der Notion-API und bei LiteLLM-Fehlercodes.
- Geteilte Dateien, die parallele Milestones nur ergänzen dürfen: `install.sh`, `docs/MODULES.md`, `CHANGELOG.md`, `scripts/test-install.sh`, `autopilot-check.mjs`.
