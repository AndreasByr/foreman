# M011 Validierung

**Gesamturteil: pass** (Runde 2, nur niedrige Funde offen). Rolle `validation`, Prüfung des Diffs gegen Brief und Role-Review nach grünen mechanischen Prüfungen.

## Runde 1: needs-remediation
| # | Schwere | Fund | Ergebnis |
|---|---|---|---|
| 1 | hoch | Milestone-Skill nur im Arbeitsexemplar geändert, `test-rules.py` rot | behoben (R1), Vorlage ergänzt, Test erweitert |
| 2 | mittel | Gefälschte Versuchs-Überschrift im Result-File landet in `metrics.md` | behoben: Form von Rolle und Modell geprüft, Lücke gemeldet |
| 3 | mittel | Nicht aufsteigende Log-Zeiten ohne Lücke | behoben: Lücke je Unit |
| 4-12 | niedrig | Textsuche `needs-input`, Zeitraum nach neuester Zeit, Dateiname in Lücke, Symlink, Test im installierten Projekt, Doku, Learning-Abschnitt | Symlink, Test, Doku, Learning behoben; Rest dokumentiert |

## Runde 2: pass
Alle drei Funde behoben und getestet. Offen (niedrig, bewusst): Eine Zeile mit gültiger Form im Worker-Text zählt als Versuch (nur der Worker selbst kann das erzeugen; Zahlen sind Orientierung, kein Beweis). Wartezeit-Erkennung per Textsuche `needs-input`. Units ohne gültige Log-Zeit sind immer eine Lücke (`--strict`).
Die Prüfung konnte selbst nichts ausführen (Bash gesperrt); die Läufe stehen im Abschlussbericht.
