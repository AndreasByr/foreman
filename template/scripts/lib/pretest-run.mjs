// Headless pretest against a non-production target: pages in desktop and mobile width, axe (WCAG 2.2 AA), console
// errors, failed responses, horizontal overflow, read-only API checks per role. Everything project-specific comes from
// .foreman.json "pretest" (targets, login pattern); see docs/test-login.md.
//
// Guards: only the targets `dev` and `staging`, only https (or localhost), never a host listed in pretest.productionHosts,
// only tenants from the allowlist, only GET for API checks, test-login secret of at least 32 characters, never an admin role.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCREENS = [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];
const FORBIDDEN_ROLE = /admin|root|superuser/i;
const MIN_SECRET = 32;

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const isName = (v) => isText(v) && /^[a-zA-Z0-9_-]+$/.test(v);

export function isSafePath(p, blocked = []) {
  if (!isText(p) || !p.startsWith("/") || p.startsWith("//") || /^\/[a-z][a-z\d+.-]*:\/\//i.test(p) || /[\\\s]/.test(p)) return false;
  let candidate = p;
  for (let i = 0; i < 3; i++) {
    if (blocked.some((re) => re.test(candidate))) return false;
    try { const d = decodeURIComponent(candidate); if (d === candidate) break; candidate = d; } catch { break; }
  }
  return true;
}

function blockedRegexes(cfg) {
  return (cfg.blocked ?? []).map((s) => new RegExp(s, "i"));
}

/** Deep merge for the optional local overlay: objects merge key by key, arrays and scalars of the overlay replace. */
export function mergeConfig(base, overlay) {
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (!isObj(base) || !isObj(overlay)) return overlay === undefined ? base : overlay;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) out[k] = k in base ? mergeConfig(base[k], v) : v;
  return out;
}

/** Base URL of a target; refuses production hosts and plain http (except localhost). */
export function baseUrl(cfg, target) {
  if (!["dev", "staging"].includes(target)) throw new Error("target must be dev or staging.");
  const raw = cfg?.targets?.[target];
  if (!isText(raw)) throw new Error(`pretest.targets.${target} is missing in .foreman.json and .foreman.local.json.`);
  const u = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new Error("Only https targets are allowed (localhost excepted).");
  const host = u.hostname.toLowerCase();
  for (const prod of cfg.productionHosts ?? []) {
    if (host === String(prod).toLowerCase()) throw new Error(`Target host ${host} is listed in pretest.productionHosts.`);
  }
  return `${u.origin}`;
}

/** Names of the variables a plan needs (secret of the target, user ids of the roles used). */
export function requiredVariables(cfg, plan) {
  const roles = new Set([...plan.pages, ...plan.api].map((e) => e.role).filter((r) => r !== "anonymous"));
  if (!roles.size) return [];
  const names = [cfg.login?.secretEnv?.[plan.target]];
  for (const r of roles) names.push(cfg.login?.roles?.[r]);
  return names;
}

export function validatePlan(cfg, plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Plan must be an object.");
  for (const f of ["unit", "target", "tenant"]) if (!isText(plan[f])) errors.push(`Field ${f} is missing or invalid.`);
  if (plan.target && !["dev", "staging"].includes(plan.target)) errors.push("target must be dev or staging.");
  if (!Number.isInteger(plan.round) || plan.round < 1) errors.push("round must be an integer from 1.");
  const allowed = new Set(cfg?.tenants?.[plan.target] ?? []);
  const blocked = blockedRegexes(cfg ?? {});
  if (plan.tenant && (blocked.some((re) => re.test(plan.tenant)) || !allowed.has(plan.tenant))) {
    errors.push(`Tenant ${plan.tenant} is not allowed for target ${plan.target} (pretest.tenants / pretest.blocked).`);
  }
  const roles = new Set(["anonymous", ...Object.keys(cfg?.login?.roles ?? {})]);
  for (const [kind, list] of [["Page", plan.pages], ["API", plan.api]]) {
    if (!Array.isArray(list)) { errors.push(`${kind === "Page" ? "pages" : "api"} must be an array.`); continue; }
    list.forEach((e, i) => {
      const at = `${kind} ${i + 1}`;
      if (!e || typeof e !== "object") { errors.push(`${at} must be an object.`); return; }
      if (!isName(e.name)) errors.push(`${at}: name is invalid.`);
      if (!isSafePath(e.path, blocked)) errors.push(`${at}: path must be relative, start with / and not match pretest.blocked.`);
      if (!roles.has(e.role)) errors.push(`${at}: unknown role.`);
      if (isText(e.role) && FORBIDDEN_ROLE.test(e.role)) errors.push(`${at}: admin roles are never used.`);
      if (kind === "API") {
        if (e.method !== undefined && e.method !== "GET") errors.push(`${at}: only GET is allowed.`);
        if (!Number.isInteger(e.expect) || e.expect < 100 || e.expect > 599) errors.push(`${at}: expect must be an HTTP status.`);
      }
    });
  }
  if (errors.length) throw new Error(`Invalid plan: ${errors.join(" ")}`);
  return plan;
}

export function scrub(value, secrets = []) {
  const list = [...new Set(secrets.filter((s) => typeof s === "string" && s.length))].sort((a, b) => b.length - a.length);
  const clean = (v) => {
    if (typeof v === "string") return list.reduce((t, s) => t.split(s).join("***"), v);
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [clean(k), clean(x)]));
    return v;
  };
  return clean(value);
}

export function summary(result) {
  const pages = result.pages ?? [];
  const api = result.api ?? [];
  const widths = (f) => pages.reduce((s, p) => s + (p.widths ?? []).reduce((a, w) => a + f(w), 0), 0);
  const axe = (impact) => widths((w) => (w.axe ?? []).filter((v) => v.impact === impact).length);
  const rows = [
    ["Measure", "Count"],
    ["Pages checked", pages.filter((p) => !p.skipped && !(p.widths ?? []).some((w) => w.error)).length],
    ["Page errors", pages.filter((p) => (p.widths ?? []).some((w) => w.error)).length],
    ["axe violations (critical)", axe("critical")],
    ["axe violations (serious)", axe("serious")],
    ["axe violations (moderate)", axe("moderate")],
    ["axe violations (minor)", axe("minor")],
    ["Console errors", widths((w) => (w.consoleErrors ?? []).length)],
    ["Failed responses", widths((w) => (w.failedResponses ?? []).length)],
    ["Horizontal overflows", widths((w) => (w.overflow ? 1 : 0))],
    ["Skipped pages", pages.filter((p) => p.skipped).length],
    ["Login findings", (result.findings ?? []).filter((f) => f.startsWith("Login ")).length],
    ["API deviations", api.filter((a) => a.ok === false).length],
  ];
  return rows.map((r, i) => (i === 0 ? `| ${r.join(" | ")} |\n|---|---|` : `| ${r.join(" | ")} |`)).join("\n");
}

async function loadPlaywright(deps) {
  if (deps.chromium) return { chromium: deps.chromium, AxeBuilder: deps.axe };
  try {
    const pw = await import("@playwright/test");
    const ax = await import("@axe-core/playwright");
    return { chromium: pw.chromium, AxeBuilder: ax.default ?? ax.AxeBuilder };
  } catch (e) {
    throw Object.assign(new Error(
      `Playwright or axe-core is not installed in this worktree (${e.code ?? e.message}). Run: bash scripts/pretest-prepare.sh`,
    ), { exitCode: 3 });
  }
}

function safeUrl(url) {
  try { const p = new URL(url); return `${p.origin}${p.pathname}`; } catch { return String(url).split("?")[0]; }
}

export async function runPretest(cfg, planInput, options = {}) {
  const plan = validatePlan(cfg, planInput);
  const base = baseUrl(cfg, plan.target);
  const env = options.env ?? process.env;
  for (const name of requiredVariables(cfg, plan)) {
    if (!isText(name) || !isText(env[name])) throw Object.assign(new Error(`Environment variable ${name || "(not configured in pretest.login)"} is missing.`), { exitCode: 2 });
  }
  const secretName = cfg.login?.secretEnv?.[plan.target];
  if (secretName && env[secretName].length < MIN_SECRET) {
    throw Object.assign(new Error(`${secretName} must have at least ${MIN_SECRET} characters (test-login pattern).`), { exitCode: 2 });
  }
  const fields = { secret: "secret", user: "userId", tenant: "tenant", ...(cfg.login?.fields ?? {}) };
  const secrets = Object.entries(env).filter(([k, v]) => typeof v === "string" && v.length >= 8 && /SECRET|TOKEN|TEST_/.test(k)).map(([, v]) => v);
  const { chromium, AxeBuilder } = await loadPlaywright(options);
  const browser = await chromium.launch(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const result = { unit: plan.unit, round: plan.round, target: plan.target, tenant: plan.tenant, started: new Date().toISOString(), pages: [], api: [], findings: [] };
  const out = resolve(options.out ?? "docs/pretest");
  const contexts = new Map(), logins = new Map();
  try {
    for (const role of new Set([...plan.pages, ...plan.api].map((e) => e.role))) {
      const ctx = await browser.newContext();
      contexts.set(role, ctx);
      if (role === "anonymous") { logins.set(role, { ok: true }); continue; }
      const res = await ctx.request.post(`${base}${cfg.login.path}`, {
        data: { [fields.secret]: env[secretName], [fields.user]: env[cfg.login.roles[role]], [fields.tenant]: plan.tenant },
      });
      logins.set(role, { ok: res.status() === 200, status: res.status() });
      if (res.status() !== 200) result.findings.push(`Login ${role} failed (HTTP ${res.status()})`);
    }
    for (const spec of plan.pages) {
      const login = logins.get(spec.role);
      const entry = { name: spec.name, path: spec.path, role: spec.role, widths: [] };
      if (!login.ok) { entry.skipped = true; entry.finding = `Login ${spec.role} failed (HTTP ${login.status})`; result.pages.push(entry); continue; }
      for (const s of SCREENS) {
        const shot = `shots/${spec.name}-${s.name}.jpg`;
        let page;
        try {
          page = await contexts.get(spec.role).newPage();
          const errors = [], failed = [];
          page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
          page.on("pageerror", (e) => errors.push(e.message));
          page.on("response", (r) => { if (r.status() >= 400) failed.push({ status: r.status(), url: safeUrl(r.url()) }); });
          await page.setViewportSize(s.viewport);
          const res = await page.goto(`${base}${spec.path}`, { waitUntil: "networkidle" });
          const info = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          await mkdir(join(out, "shots"), { recursive: true });
          await page.screenshot({ path: join(out, shot), type: "jpeg", quality: 60, fullPage: true });
          entry.widths.push({
            screen: s.name, httpStatus: res?.status() ?? null, finalUrl: safeUrl(page.url()), title: info.title, lang: info.lang,
            consoleErrors: errors, failedResponses: failed, overflow: info.sw > info.cw,
            axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, selectors: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })),
            screenshot: shot,
          });
        } catch (e) {
          entry.widths.push({ screen: s.name, error: String(e?.message ?? e) });
        } finally { await page?.close().catch(() => {}); }
      }
      result.pages.push(entry);
    }
    for (const spec of plan.api) {
      const login = logins.get(spec.role);
      if (!login.ok) { result.api.push({ name: spec.name, role: spec.role, path: spec.path, expect: spec.expect, status: null, ok: false, skipped: true }); continue; }
      const res = await contexts.get(spec.role).request.get(`${base}${spec.path}`);
      result.api.push({ name: spec.name, role: spec.role, path: spec.path, expect: spec.expect, status: res.status(), ok: res.status() === spec.expect });
    }
  } finally {
    await Promise.all([...contexts.values()].map((c) => c.close()));
    await browser.close();
  }
  result.finished = new Date().toISOString();
  result.summary = summary(result);
  const safe = scrub(result, secrets);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "result.json"), `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  return safe;
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!["--plan", "--out"].includes(k) || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw Object.assign(new Error("usage: node scripts/pretest-run.mjs --plan <plan.json> --out <directory>"), { exitCode: 2 });
    }
    o[k.slice(2)] = argv[i + 1];
  }
  if (!o.plan || !o.out) throw Object.assign(new Error("usage: node scripts/pretest-run.mjs --plan <plan.json> --out <directory>"), { exitCode: 2 });
  return o;
}
