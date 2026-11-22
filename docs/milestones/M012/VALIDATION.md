# M012 Validierung

**Gesamturteil: pass** (Runde 4, nur niedrige Funde offen). Rolle `validation`, drei getrennte Prüfer (A Anforderungen, B Integration und Regression, C Kriterien und Evidenz), jeweils mit Brief, Diff und Evidenzangaben der Session. Die Prüfer konnten selbst nichts ausführen (Bash gesperrt); die Läufe stehen im Abschlussbericht `docs/agent-reports/2026-11-22-M012.md`.

## Runde 1 (A needs-attention, B needs-attention, C needs-remediation)
| # | Schwere | Fund | Ergebnis |
|---|---|---|---|
| 1 | mittel | Messung der Lesemenge lief in CI nie (flacher Klon) | behoben: `fetch-depth: 0`, in CI ohne Basis-Commit Exit 1 |
| 2 | mittel | Fix-Paket-Skill verwies auf den Milestone-Skill, den ein Fix-Paket-Lauf nicht lädt | behoben: Board-Regel im Fix-Paket-Skill als geschützte Kopie |
| 3 | mittel | Kein Bericht, keine Inventurliste | behoben: `docs/agent-reports/2026-11-22-M012.md` |
| 4 | mittel | Verweis in `foreman-delegation` ohne Gegenstück in den Git rules; Obergrenze "2 Batches je Tag" verloren | behoben |
| 5 | mittel | README-Zahlen nicht gegen die Messung geprüft | behoben: `scripts/test-readme.sh` vergleicht, mit Mutationsprobe |
| 6 | niedrig | Rollout-Aufträge ohne Verweis auf Upgrade-Punkte, Schrittverweis in `uat-approval.md`, Einzel-Szenario-Test, PRINCIPLES-Regex | behoben |

## Runde 2 (3 x needs-attention)
Mittel: Board-Regel in zwei Skills ohne Vermerk und ohne Wächter; falsche Begründung zur Cause-Zeile (der M011-Test verlangt nur `**Cause:**`); keine Evidenz für den End-Commit. Behoben (R2): Wächter für Board-Kopien und Cause-Zeile, fehlende Dateien sind Fehler, Texte korrigiert, Evidenz im Bericht und in `STATE.md`.

## Runde 3 (A pass, B pass, C needs-attention)
C mittel: Evidenz nannte nicht den End-Commit, die Läufe liefen vor dem Commit im Arbeitsbaum. Behoben (R3): Läufe auf dem committeten Stand 5c72d8c, Kommentar, Checkbox-Test und README-Wortlaut korrigiert.

## Runde 4 (C erneut: pass)
N1 behoben. Offen, niedrig: Zeitstempel im `STATE.md`-Log vor R3 sind geschätzt, maßgeblich sind die Commit-Zeiten; kleine Unstimmigkeiten in der Reihenfolge der Tabelle.

## Offen, niedrig, bewusst
- Board-Regel: zwei geschützte Kopien (Milestone, Fix-Paket) plus Verweiszeile in `foreman-dispatch-run`; der Wächter prüft nur Kernaussagen.
- Chat-Skills nicht angefasst (der Chat liest keine Repo-Docs).
- Die Board-Regel kennt keinen Rückfall auf `docs/design.md` (schon vor M012 so).
- Der Batch-Lauf liegt nur 44 B unter dem Stand 0.2.1; jede Ergänzung an Delegation, Batch, Deploy oder Dispatch-Run muss im selben Zug kürzen.
- Drei Nacharbeitsrunden wurden genutzt (vorab erlaubt).
