// Heartbeat files: one JSON file per module in FOREMAN_STATUS_DIR, written atomically. Never throws.
// Format: {"module","last_run" (ISO, ms, Z),"result" ("ok"|"error"),"note" (first line, max 300),"max_age_min" (number|null)}
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODULE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function beatDir(env = process.env) {
  try {
    const dir = env?.FOREMAN_STATUS_DIR;
    if (typeof dir === "string" && dir !== "") return dir;
    const home = env?.HOME;
    if (typeof home === "string" && home !== "") {
      const def = join(home, ".local/share/foreman-dispatcher/status");
      if (existsSync(def)) return def;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeBeat(dir, module, { result = "ok", note = "", maxAgeMin = null, now = Date.now() } = {}) {
  let tmp = null;
  try {
    if (typeof dir !== "string" || dir === "" || typeof module !== "string" || !MODULE_RE.test(module)) return false;
    const file = `${module.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
    const body = {
      module,
      last_run: new Date(now).toISOString(),
      result: result === "error" ? "error" : "ok",
      note: String(note ?? "").split("\n")[0].slice(0, 300),
      max_age_min: typeof maxAgeMin === "number" && Number.isFinite(maxAgeMin) ? maxAgeMin : null,
    };
    mkdirSync(dir, { recursive: true });
    tmp = join(dir, `.${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n");
    renameSync(tmp, join(dir, file));
    tmp = null;
    return true;
  } catch {
    if (tmp) { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } }
    return false;
  }
}
