# Role review (briefing mode): M007

**Datum:** 21.11.2026 · **Modus:** Briefing, ohne UI, ohne laufendes Produkt
**Teil 1 (Boards):** entfällt, keine UI.
**Teil 2 (Bestand auf Staging):** entfällt, kein Staging. Stattdessen Blick in den Code: `dispatcher/dispatch.mjs`, `dispatcher/tests/test-dispatch.mjs`, `dispatcher/README.md`, `scripts/lib/itsaplan-api.mjs`, `scripts/lib/itsaplan-mirror.mjs`.
**Barrierefreiheit:** nicht gefordert. Ticket- und Webhook-Texte sind kurz, englisch im Titel, ohne Sonderzeichen-Tabellen.

## Teil 3: Risiko-Vorschau (wird zu Erfolgskriterien)

- **UX-Kritiker:** Die Meldung nennt alte und neue Version, den Befehl für `foreman-update` und den Verweis auf die Upgrade-Abschnitte, ohne dass jemand suchen muss. Titel immer Englisch: `foreman update available: <old> → <new>`. Die Webhook-Nachricht nennt den Projektnamen.
- **UI-Defekt-Jäger:** Keine UI. Webhook-Body folgt `webhook_format` (Discord `content`, Slack `text`).
- **Bug-Jäger:**
  - Zwei Läufe hintereinander erzeugen genau eine Meldung je Projekt und Version (Ticket und Webhook).
  - Ein Fehler beim Ticket oder Webhook merkt sich nichts als „gemeldet“; der nächste Lauf versucht es erneut.
  - Versionsvergleich nach SemVer, nicht als Text (`0.2.10` neuer als `0.2.9`); Vorabversionen (`0.2.2-rc.1`) älter als `0.2.2`.
  - Projektversion gleich oder neuer als die aktuelle: keine Meldung. Fehlende oder kaputte `.foreman.json`, fehlende oder ungültige `version`: Hinweis im Log, keine Meldung, kein Abbruch der anderen Projekte.
  - Neue foreman-Version, während ein Ticket zur alten offen ist: altes Ticket schließt sich oder wird ersetzt, nie zwei offene Update-Tickets je Projekt.
  - Ticket schließt sich, sobald `.foreman.json` die neue Version zeigt; ein manuell geschlossenes Ticket wird nicht neu geöffnet und nicht doppelt angelegt.
  - Quelle der aktuellen Version nicht erreichbar (kein Netz, Rate-Limit, kein Release): Hinweis im Log, keine Meldung, kein Fehler-Webhook-Sturm (höchstens einmal je Lauf eine Zeile im Log).
  - `--dry-run` schreibt keinen Zustand, legt kein Ticket an, schickt nichts.
  - Tracker `none` oder Linear: nur Webhook.
- **Penetrationstester:**
  - Das Ticket legt der Dispatcher mit dem Bot-Konto an (`ITSAPLAN_*` aus `pass_env` des Projekts), nie ein Modell. Ein Projekt sieht nur seine eigenen Tracker-Werte.
  - Keine Tokens, keine Webhook-URL und keine Tracker-Werte in Logs, Ticket oder Nachricht (Redact wie bisher).
  - Titel und Text bestehen nur aus Versionsnummern und festen Sätzen; eine manipulierte `.foreman.json` (`version` mit Zeilenumbruch, Markdown, überlang) wird als ungültig verworfen, nie in Ticket oder Webhook übernommen.
  - Webhook-Regeln aus M001 gelten unverändert (https, bekannter Host oder `webhook_format`, `redirect: "error"`).
- **Barrierefreiheits-Prüfer:** nicht gefordert.

## Funde im Bestand, die in M007 gehören
- `notify()` schluckt Fehler und meldet nicht zurück, ob die Nachricht ankam. Für „einmal pro Version“ braucht die Update-Meldung ein Ergebnis, sonst geht sie bei einem Webhook-Ausfall für immer verloren oder wird doppelt geschickt.
- `dispatcher/dispatch.mjs` hat keinen Tracker-Client. Der Dispatcher legt hier erstmals selbst ein Ticket an; der Client bleibt klein und ohne Abhängigkeiten, weil `dispatcher/` einzeln kopiert werden darf.
- Offene Frage aus den Requirements (Versionsquelle): Der Brief entscheidet mit Empfehlung GitHub-Release, siehe „Fixed decisions“.
