# UAT 2026-11-23-state-gate · since 2026-11-23T10:00Z

Only what needs your judgement or a real project.

- [ ] Block v4 lesen: `plugins/foreman/skills/foreman-project-mode/references/instruction-block.md`, Zeilen mit "STATE.md". Passen Gate (Thread) und Prüfung (Projektchat)? Empfehlung: ja. Danach in diesem Projekt `foreman-project-mode` (Refresh) ausführen, 2 Min, damit v4 gilt.
- [ ] Entscheidung: Der CI-Check überspringt PRs mit Head `main`, `dev`, `sync/*`, `dependabot/*`, `renovate/*`, `foreman-update*`, `agent/foreman-update*`. Passt die Liste? Empfehlung: ja; weitere Präfixe nur bei einem echten Fall ergänzen.
- [ ] Entscheidung: Der Check verlangt eine geänderte `STATE.md` irgendeiner Unit, nicht die "richtige". Reicht das? Empfehlung: ja, ob sie inhaltlich stimmt, prüft der Koordinator beim Fertig-Bericht.
- [ ] Entscheidung: Lesemenge Batch liegt nur noch 2 B unter 0.2.1 (Grenze "nie mehr als 0.2.1"). Weiter so? Empfehlung: ja für 0.2.x; bei 0.3.0 neu festlegen.
- [ ] Praxistest beim nächsten Fix-Paket: PR ohne `STATE.md`-Änderung muss rot werden, mit Änderung grün. Empfehlung: beim nächsten Thread-PR kurz in den Checks nachsehen (`foreman guards`, Schritt "STATE.md changes with the work").

> Approve: tick every point, or add a line that reads exactly `UAT 2026-11-23-state-gate approved` at the start of a line, then commit and push.
