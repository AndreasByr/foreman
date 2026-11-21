# M003 Validierung

Drei getrennte Reviewer (Rolle `validation`, nur lesen), Rohquellen: Brief, Requirements, Diff seit Startstand 2e5bc22, Slice-Berichte. Der Reviewer kann kein git (Befehle verweigert) und keine Tests laufen lassen; Teststand und SHAs stammen aus den Läufen der Session.

## Verlauf
| Runde | A Requirements | B Integration | C Kriterien und Evidenz | Folge |
|---|---|---|---|---|
| 1 (nach S4, 9028645) | needs-remediation (1 hoch, 8 mittel) | needs-attention (7 mittel) | needs-attention (1 hoch, 6 mittel) | Rework R1, R2 |
| 2 (nach R2, 08db6aa) | needs-attention (3 mittel) | pass | needs-attention (nur niedrig) | Rework R3 |
| 3 (nach R3, e3364ec) | pass | pass | pass | fertig |

Gesamtergebnis: **pass** (keine mittleren oder hohen Funde offen). Zwei Reworkrunden genutzt, kein Sicherheitsfund offen.

## Nachtrag: Zusammenführung mit dev
Nach Runde 3 kam `origin/dev` (M002) mit derselben Option `--chatgpt-via-gateway` in `install.sh`; die Auflösung (eine Option, ein Ablauf) prüfte ein vierter Reviewer (Rolle `validation`): needs-attention, nur niedrige Funde (Hilfetext, Exit 1 statt 2 bei fehlendem Optionswert, Testlücken). Behoben und mit Tests belegt; Rest niedrig: ChatGPT-Beispieldatei bleibt nach `declined` liegen, Preset und `chatgpt_via_gateway` (M002) nicht verknüpft.

## Letzter Lauf
`bash scripts/test-all.sh` auf 58b1916 (Inhalt wie e3364ec plus nur STATE und Berichte): Exit 0. Katalog-Test 9 Fragen, Workspace-Test 40 Fälle, Summary-Test 112 Prüfungen, Installer-Tests, Privacy-Scan sauber, Plugin-Validierung grün.

## Offene Funde (alle niedrig, im Bericht)
- Der echte `run_task.py --dry-run` auf der installierten `config.toml` ist erst grün, wenn exakte Modell-IDs eingetragen sind; der Installer prüft auf einer Kopie und sagt es. Ebenso der Hinweis `run_task.py --dry-run --role execution` in `install.sh` ohne Aufgabendatei (vorher schon so).
- Schema-URL-Regel ist lockerer als die des Installers (Installer lehnt vor dem Schreiben ab, schlägt sicher fehl).
- Gespeicherte ChatGPT-Zustimmung wird nur bei laufendem Gateway aus `workspace.json` gelesen; im Gateway-Block muss das Flag gesetzt werden. `not-asked` bei vorhandenem ChatGPT-Plan ergibt keine Lücke.
- Abo-Stufe des Agents (C8) und Erreichbarkeit des Trackers (C6) werden gefragt, haben aber kein Schemafeld.
- Katalog sagt in Block B noch „decides the profile“, SKILL.md hat die strengere Quick-Regel.
- `.foreman.json` kein Objekt (z. B. `[]`) ergibt Teil-Install; Backup `.before-foreman` wird bei jedem Lauf überschrieben; `modules` in vorhandener `.foreman.json` bleibt alt.
- Kurze Schlüssel ohne Präfix werden nicht erkannt; 401/403-Zweig der Probe und Dry-Run nur für `execution_simple` ohne Test; Installer-Fälle aus R3 (a bis c) nicht vorher rot gezeigt.
- Meldung „Preset geschrieben“ und manuelle Befehle zitieren Pfade ohne Anführungszeichen.

## Grenzen
UAT bleibt bei Andreas: echter Chat-Durchlauf, echtes LiteLLM, echte Modell-IDs. Kein Reviewer und keine Session hat das als bestanden markiert.
