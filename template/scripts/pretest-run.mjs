#!/usr/bin/env node
// CLI of the headless pretest runner. Config: .foreman.json "pretest"; test-login pattern: docs/test-login.md.
//   node scripts/pretest-run.mjs --plan <plan.json> --out docs/pretest/<unit>-round-<N>
// Example plan: scripts/pretest/plan-example.json. Exit codes: 0 done, 1 error, 2 call/config error, 3 dependencies missing.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, runPretest, scrub } from "./lib/pretest-run.mjs";

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env ?? process.env;
  const secrets = Object.entries(env).filter(([k, v]) => /SECRET|TOKEN|TEST_/.test(k) && v).map(([, v]) => v);
  const err = deps.stderr ?? ((m) => console.error(m));
  const out = deps.stdout ?? ((m) => console.log(m));
  let o, plan, cfg;
  try {
    o = parseArgs(argv);
    plan = JSON.parse(readFileSync(o.plan, "utf8"));
    const conf = deps.conf ?? (existsSync(".foreman.json") ? JSON.parse(readFileSync(".foreman.json", "utf8")) : {});
    cfg = conf.pretest;
    if (!cfg) throw Object.assign(new Error('"pretest" is missing in .foreman.json (see docs/test-login.md).'), { exitCode: 2 });
  } catch (e) { err(scrub(e.message, secrets)); return e.exitCode ?? 2; }
  try {
    await runPretest(cfg, plan, { out: o.out, env, chromium: deps.chromium, axe: deps.axe });
    out(`Pretest done: ${o.out}/result.json`);
    return 0;
  } catch (e) { err(scrub(e.message, secrets)); return e.exitCode ?? 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((c) => { process.exitCode = c; });
}
