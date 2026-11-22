# Validierung M010

Sechs Validierungsrunden mit je drei getrennten Reviewern (A Anforderungen, B Integration und Regression, C Kriterien und Belege), Rolle `validation`, Quellen: Brief, Requirements, Roadmap, Diff seit dem Startcommit, STATE.md. Die Reviewer konnten keine Befehle ausführen; Laufnachweise stehen unten.

| Runde | Stand | A | B | C | Danach |
|---|---|---|---|---|---|
| 1 | bf2a783 | needs-remediation | needs-remediation | needs-remediation | R1 |
| 2 | 6e9adc7 | needs-attention | needs-remediation | needs-attention | R2 |
| 3 | 54dfe5c | needs-attention | needs-attention | needs-attention | R3 |
| 4 | 854e5f3 | needs-attention | needs-remediation | pass | R4 |
| 5 | ba56b4d | pass | needs-remediation | needs-attention | R5 |
| 6 | a6544af | pass | needs-attention | pass | offen |

**Gesamturteil: needs-attention.** Ein mittlerer Fund aus Reviewer B (Runde 6) ist offen.

## Offene Funde

- **[medium] Scan, verschachtelte Klammern im Linktext.** `template/scripts/lib/docs-wiki-scan.mjs`: `LINK` erlaubt im Linktext kein `]`, der Konverter erlaubt eine Ebene. Ein Begriff, der am Ende eines Links mit verschachtelten Klammern geteilt wird, kann am Scan vorbeigehen. Kein versehentliches Leck, sondern eine gezielte Umgehung. Ausweg: UAT als zweite Sperre; Fix klein (Pattern angleichen).
- [low] Gemeldete Zeilennummer verschoben um die Länge des Seitenkopfs (Scan läuft auf dem Text nach dem Kopf).
- [low] Ist `docs/wiki` ein Symlink, archiviert ein echter Lauf das schon veröffentlichte Wiki (leerer Baum). Gewollt bei leerem Wiki, aber bei übersprungener Wurzel überraschend.
- [low] `--unit m010` (klein) endet mit „unknown unit id“; Skills schreiben `<Mnnn>`.
- [low] Das Release-Skill hat keinen Wiki-Schritt; Veröffentlichen hängt am Skill `foreman-wiki`.
- [low] Falsch-Positive des Scans in Fließtext (kein Weg, einen Begriff zu erlauben); `localhost` und IPv4 bleiben gesperrt (Produktfrage, siehe UAT).
- [low] CHANGELOG-Satz „the update never edits that file“ ist ungenau (`update.py` setzt die Versionszeile); MODULES.md nennt `(line N)` auch bei Funden ohne Zeile; das Gate `--local --dry-run --unit` scheitert bei Tracker-Lesefehlern.
- [low] Der Vermerk `checked:` im Seitenkopf ist eine Behauptung, nicht an den Text gebunden (dokumentiert).

## Behobene Funde (Auswahl)

R1: Scan verpasste Mehrzahl und „Brief“; Seitentitel waren Pfade; gleiche Wurzelseite für Spiegel und Wiki; `done`-Milestones lösten das Gate aus. R2: Titelkollision Zielgruppe/Seite (hoch); Seiten außerhalb von Zielgruppen-Ordnern; Markup- und Zero-Width-Umgehung; Namen mit Secret in Meldungen. R3: Markdown-Escapes und Links; Verbotsbegriffe nur als ganze Wörter; fremde Notion-Seiten werden nie überschrieben. R4: Verbotsbegriffe in Link-Zielen (hoch); Unicode-Trennstriche; leeres Wiki archiviert; Gate mit `--unit` für jeden Status außer `done`. R5: Text in Link-Klammern (hoch); Begriffe über Zeilenumbrüche; Person im STATE entfernt.

## Abweichungen vom Brief (alle in STATE.md geloggt)

- Kriterium 1: Ohne Modul fehlen Wiki-Skript, -Lib und -Skill; Vorlagen und `check-config.sh` enthalten das Wort „wiki“.
- Kriterium 7: `state-mirror --check --local` scheitert nur mit `--unit <Mnnn>`; ohne `--unit` nur WARN, damit alte Milestones nichts blockieren.
- Sprache: `wiki.language` fällt auf `context.language` zurück.
- Seitentitel in Notion: erste Überschrift der Seite; Zielgruppen-Seite trägt den Zielgruppennamen. Die Markerzeile „Mirrored from … Edits here are overwritten. sha256:…“ bleibt sichtbar.

## Letzter Lauf

`bash scripts/test-all.sh`: Exit 0 auf a6544af (R5), inklusive `privacy-scan`, `test-install`, `test-update`, `test-docs-wiki`, `test-state-mirror`, `test-wiki-todo`.
