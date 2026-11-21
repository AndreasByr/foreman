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

## Runde 2 (bis 6c27c0d)

A needs-attention, B pass, C needs-attention. Offene Funde: 1 medium (requirements:52 verlangt: übersetzter Name ist ein Fehler; Check meldete nur fehlende Namen und Labels mit Präfix), mehrere low.

| Nr | Schwere | Fund | Umgang |
|---|---|---|---|
| 13 | medium | Übersetzte Zusatznamen (Fix-Paket, Abgebrochen) gingen durch | R2: deutsch aussehende Spalten- und Labelnamen sind FAIL mit englischem Soll; Bug, Canceled, Versions-Labels bleiben erlaubt. Label-Gruppen und Ansichten prüft nur die Vorlagen-Validierung, der Projekt-Check liest sie nicht (Abweichung von requirements, im UAT zu bestätigen) |
| 14 | low | Doppelter Satz in trackers.md; Vorlagenname `foreman` statt Dateiname in README/MODULES/CHANGELOG | R2 behoben |
| 15 | low | urllib nutzt Proxy-Variablen | R2: ProxyHandler({}), Test k-proxy-ignored |
| 16 | low | Kopie in template/ nicht gegen Abweichung gesichert | R2: Test k-copy-identical |
| 17 | low | Validierungs-CLI ohne Test, Stacktrace bei fehlender Datei | R2: CLI-Tests, klare Meldung |
| 18 | low | Wortliste: `die`, `den`, `mit` sind auch englisch; es fehlten paket, freitag, wartet, eingriff, runde | R2 angepasst |
| 19 | low | Mirror-Test nutzt scripts/lib statt template/scripts/lib | offen (beide Kopien identisch) |

## Runde 3 (bis 540c1c5)

A needs-attention (low), B needs-attention (1 medium), C needs-attention (gleicher medium-Fund). Fixes aus Runde 1 und 2 halten im Code.

| Nr | Schwere | Fund | Umgang |
|---|---|---|---|
| 20 | medium | Wortliste in `check-config.sh` enthält `art` und `mit`; „Concept art“ oder „MIT“ ergibt FAIL, „Art“ meldet „Type“ | offen: dritte Runde nur mit Freigabe von Andreas |
| 21 | low | Doppelte Wortlisten (Validator, Check), Heuristik; „Erledigt“ unerkannt | offen, im UAT erwähnt |
| 22 | low | Ansichten: Namen nicht auf Eindeutigkeit geprüft | offen |
| 23 | low | Proxy-Variablen ignoriert: hinter Pflicht-Proxy nur WARN; in Doku nicht genannt | offen |
| 24 | low | `labelPrefix: ""` macht jedes Label zum FAIL | offen |
| 25 | low | README ohne Namensprüfung, CHANGELOG ohne Handschritt | offen |
