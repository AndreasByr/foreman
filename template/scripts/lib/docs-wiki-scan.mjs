// docs-wiki scan: blocks internal wording, hosts, secrets and forbidden terms, and checks the page head.
// Pure functions, no dependencies. A finding never holds the matched text (secrets must not be echoed).
import { pageTitles } from "./docs-wiki.mjs";

// Internal terms, case-insensitive, with plural and inflected endings. \p{L} lookarounds because \b is ASCII-only.
const L = "a-zäöüß";
const INTERNAL = new RegExp(
  `(?<![\\p{L}])(roast|roadmap|fix[ -]?pack|fix[ -]?paket|agent[ -]?report|offene[ -]frage|open[ -]question|logikl(ü|ue)cke|logic[ -]gap|needs[ -]input|milestone[ -]brief)[${L}]*` +
    "|(?<![\\p{L}])(STATE|CONTEXT)\\.md(?![\\p{L}])" +
    "|docs/(agent-reports|fixpacks|answers|role-reviews|milestones|uat)(?![\\p{L}-])",
  "iu",
);
const BRIEF = /(?<![\p{L}])Briefs?(?![\p{L}-])/u; // capitalized, case-sensitive: "Briefing" and "Brief-Format" stay allowed
const HOST = [
  /\b\d{1,3}(\.\d{1,3}){3}\b/,
  /\blocalhost\b/i,
  /\b[\w-]+\.(internal|local|lan|corp|intranet|home)\b/i,
  /\bserver-\d+\b/i,
  /\bssh:\/\//i,
];
const SECRET = [
  /\bsecret_[A-Za-z0-9]{16,}/,
  /\bntn_[A-Za-z0-9]{20,}/,
  /\bsk-[A-Za-z0-9]{20,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bAIza[A-Za-z0-9_-]{35}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b(password|passwd|api[_-]?key)\s*[=:]\s*\S{6,}/i,
  /\bBearer [A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bNOTION_API_KEY\s*[=:]\s*\S+/,
];

// Forbidden terms match on normalized text: no emphasis marks or backticks, whitespace (NBSP too) and hyphens as one space.
const normalize = (s) => String(s).replace(/[*_`]/g, "").replace(/[\s‐-―-]+/g, " ").trim().toLowerCase();

// Returns [{line, rule}] for the rules internal-term, host, secret, forbidden. Lines count from 1; a forbidden hit that only
// the normalized whole text finds (a term split over lines or by emphasis) has line 0.
export function scanText(text, forbidden = []) {
  const found = [];
  const terms = forbidden.map(normalize).filter(Boolean);
  const lines = String(text).split(/\r?\n/);
  let lineHit = false;
  lines.forEach((line, i) => {
    const hit = (rule) => found.push({ line: i + 1, rule });
    if (INTERNAL.test(line) || BRIEF.test(line)) hit("internal-term");
    if (HOST.some((r) => r.test(line))) hit("host");
    if (SECRET.some((r) => r.test(line))) hit("secret");
    const low = normalize(line);
    if (terms.some((t) => low.includes(t))) {
      hit("forbidden");
      lineHit = true;
    }
  });
  if (!lineHit) {
    const all = normalize(text);
    if (terms.some((t) => all.includes(t))) found.push({ line: 0, rule: "forbidden" });
  }
  return found;
}

// Checks head, place and title of every page against the wiki config. Returns [{path, problem}], first problem per page.
export function validatePages(wiki, pages) {
  const problems = [];
  for (const p of pages) {
    const problem = pageProblem(wiki, p);
    if (problem) problems.push({ path: p.path, problem });
  }
  // Two pages of one audience with the same title would collide in Notion.
  const bad = new Set(problems.map((x) => x.path));
  const ok = pages.filter((p) => !bad.has(p.path));
  const titles = pageTitles(ok);
  const first = new Map();
  for (const p of ok) {
    const key = `${p.head.audience}\n${titles.get(p.path)}`;
    if (first.has(key)) problems.push({ path: p.path, problem: `duplicate title "${titles.get(p.path)}" (also ${first.get(key)})` });
    else first.set(key, p.path);
  }
  return problems;
}

function pageProblem(wiki, p) {
  if (!p.head) return "no head";
  const aud = wiki.audiences.find((a) => a.name === p.head.audience);
  if (!p.head.audience || !aud) return "unknown audience";
  if (p.dir !== "" && p.dir.split("/")[0] !== aud.slug) return "folder does not match audience";
  if (!p.head.source.length) return "no source";
  if (!p.head.checked.includes("no-ai-slop") || !p.head.checked.includes("humanizer")) return "text check missing (no-ai-slop, humanizer)";
  return null;
}
