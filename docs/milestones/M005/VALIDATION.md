# M005 Validierung

## Runde 1 (Startstand 302496a bis 1090506)

Drei unabhängige Prüfer (Anforderungen, Integration, Kriterien/Nachweise), Gesamturteil: needs-remediation.

| Nr | Schwere | Fund | Umgang |
|---|---|---|---|
| 1 | high | Namensprüfung meldete jedes fremde Label und jede fremde Spalte als FAIL (Bug, Canceled, Versions-Labels) | R1: nur unbekannte Labels mit Präfix; Tests k-extra-label, k-extra-prefix-label |
| 2 | medium | Vorlage von Hand statt Export (weicht von requirements ab) | bewusst, im Brief begründet; Entscheidung des Menschen im UAT |
| 3 | medium | Validator fing deutsche Namen und fehlenden Standard-Issue-Typ nicht | R1: `GERMAN_WORDS` im Validator, genau ein Standardtyp, doppelte Positionen |
| 4 | medium | Größengrenze 10800 gegen Warnung 10240 | Brief angepasst: `foreman-setup` war schon vor M005 darüber (10585) |
| 5 | low | Mirror-Test ohne Fix-pack-Pfad | R1: Tests für Einheitenart fixpack |
| 6 | low | String-Alias wird vom Check akzeptiert, vom Mirror nicht | R1: nur Listen |
| 7 | low | Check läuft nur bei `tracker.type`, nicht bei Modul `tracker-itsaplan` | R1: beides |
| 8 | low | Fehlerpfade ohne Test (leeres Projekt, falscher Key, ungültiges JSON) | R1: Tests k-empty-project, k-wrong-project-key, k-invalid-json |
| 9 | low | `template/docs/trackers.md` nennt einen Repo-Pfad | R1: Wortlaut für installierte Projekte |
| 10 | low | Import wird nicht in `workspace.json` vermerkt | offen, nur Zusammenfassungszeile (Schema-Änderung nicht im Umfang) |
| 11 | low | Python-`urllib` statt Node-Client | offen, kein Verhaltensunterschied; `check-config.sh` bleibt ohne Node-Abhängigkeit |
| 12 | low | Vorlage ohne Bug/Feature/Improvement-Labels | offen, Entscheidung im UAT |
