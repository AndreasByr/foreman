# M008: Validierung

Start commit c6b3149. Reviewer sind Wrapper-Läufe mit Rolle `validation`; die Session gab nur Quellen mit.

## Runde 1 (Commit 1a3d777)
| Reviewer | Verdict | Mittlere Funde |
|---|---|---|
| A Anforderungen | needs-attention | Orte in Regel und CONVENTIONS doppelt, Test prüft nur Überschriften |
| B Integration | needs-attention | Stand-Zeile fehlt in `requirements-template.md`; `docs-check` Fehlalarm bei „Version 3, 12 Milestones“; Schreibweisen `> **Stand:**`, `**Stand**:`; Doppelung; Skill-Verweise wiederholen die Regel |
| C Kriterien und Belege | needs-attention | Kriterium 1 nur für Überschriften getestet |

## Rework R1 (Commit 9c5d1ac)
Alle mittleren Funde behoben (`docs/agent-reports/2026-11-21-M008-R1.md`).

## Runde 2 (Review nach R1)
Verdict needs-attention. Mittel: Listen („Version 9, 10, 11“, „Version 2 und 3“) liefen durch; Fences, Listenpunkte und `Version: 3` ohne Test.

## Rework R2
Behoben mit Tests (44 grün), `docs/agent-reports/2026-11-21-M008-R2.md`.

## Runde 3 (Review nach R2)
Verdict **needs-attention**. Ein mittlerer Fund bleibt: Bereich oder Liste mit einem Wort hinter der letzten Zahl („Versionen 9 bis 27 zusammengefasst“, „Version 2, 3 und 4 im Verlauf“, „Versions 1 to 3 merged“) wird als eine Version akzeptiert, weil die Regel „Zahl nicht vor einem Wort“ für alle Bindewörter gilt. Vorschlag des Reviewers: `bis`, `to`, `und`, `&` und Folgezahlen nach Plural-Stichwort immer zählen, die Wort-Regel nur für `,` und `-`/`–`; drei Tests dazu. Niedrige Funde stehen im Bericht R2.

## Rework R3 (von Andreas erlaubt)
Behoben mit Tests (51 grün), `docs/agent-reports/2026-11-21-M008-R3.md`.

## Runde 4 (Review nach R3)
Verdict **pass**. Nur niedrige Funde (Semver mit zweistelligem Patch-Teil in Listen, Singular-Stichwort mit weichem Bindewort, Großschreibung im Lookbehind), alle im Bericht R3 als offen vermerkt.

## Final run
`bash scripts/test-all.sh` Exit 0 auf dem Stand nach R3 (docs-check 51 Tests, Plugin-Validierung, Privacy-Scan, rules lint).

## Gesamturteil
**pass** (Runde 4, nach drei Rework-Runden; die dritte hat Andreas ausdrücklich erlaubt).
