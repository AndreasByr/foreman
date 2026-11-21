// docs-wiki scan: blocks internal wording, hosts, secrets and forbidden terms, and checks the page head.
// Pure functions, no dependencies. A finding never holds the matched text (secrets must not be echoed).
import { pageTitles } from "./docs-wiki.mjs";

// Internal terms, case-insensitive, with plural and inflected endings. \p{L} lookarounds because \b is ASCII-only.
const L = "a-zäöüß";
const INTERNAL = new RegExp(
  `(?<![\\p{L}])(roast|roadmap|fix[ -]?pack|fix[ -]?paket|agent[ -]?report|offene[nrms]?[ -]?frage[nr]?|open[ -]question|logik[ -]?l(ü|ue)cke|logic[ -]gap|needs[ -]?input|milestone[ -]brief)[${L}]*` +
    "|(?<![\\p{L}])(STATE|CONTEXT)\\.md(?![\\p{L}])" +
    "|docs/(agent-reports|fixpacks|answers|role-reviews|milestones|uat)(?![\\p{L}-])",
  "iu",
);
const BRIEF = /(?<![\p{L}])Brief(e|s)?(?![\p{L}-])/u; // capitalized, case-sensitive: "brief", "Briefing" and "Brief-Format" stay allowed
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

// Cleaning. Zero-width characters are removed and NBSP counts as a space; markdown backslash escapes are resolved.
const ZERO = /[​-‏⁠﻿]/g;
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|~<>])/g;
const LINK = /!?\[([^\]]*)\]\(\s*<?([^)\s>]*)>?[^)]*\)/g;
const plain = (s) => String(s).replace(ZERO, "").replace(/ /g, " ");
const unescape = (s) => plain(s).replace(ESCAPED, "$1");
// Cleaned copy: links become their text, brackets and markup marks go. urls holds the link targets for a separate scan.
function cleaned(s) {
  const urls = [];
  const text = unescape(s)
    .replace(LINK, (_, t, u) => (urls.push(u), t))
    .replace(/[[\]*_`~]/g, "");
  return { text, urls };
}
// Forbidden terms: lowercase, runs of whitespace, hyphens and NBSP become one space. A zero-width character is a gap or nothing.
const norm = (s) => s.toLowerCase().replace(/[\s‐-―−-]+/g, " ").trim();
const variants = (s) => [norm(cleaned(String(s).replace(ZERO, "")).text), norm(cleaned(String(s).replace(ZERO, " ")).text)];
const termRe = (t) => new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|n|en|es)?(?![\\p{L}\\p{N}])`, "u");

const hostSecret = (texts) => ({
  host: texts.some((t) => HOST.some((r) => r.test(t))),
  secret: texts.some((t) => SECRET.some((r) => r.test(t))),
});

// True when the text holds a secret shape. Used to mask names in messages: a secret is never printed.
export const hasSecret = (text) => hostSecret([plain(text), unescape(text), cleaned(text).text]).secret;

// Returns [{line, rule}] for the rules internal-term, host, secret, forbidden. Lines count from 1; a forbidden hit that only
// the whole text finds (a term split over lines or by emphasis) has line 0. The raw line and the cleaned copy are both scanned.
export function scanText(text, forbidden = []) {
  const found = [];
  const terms = forbidden.map((t) => norm(cleaned(t).text)).filter(Boolean).map(termRe);
  let lineHit = false;
  String(text).split(/\r?\n/).forEach((line, i) => {
    const hit = (rule) => found.push({ line: i + 1, rule });
    const c = cleaned(line);
    const parts = [c.text, ...c.urls];
    if (parts.some((p) => INTERNAL.test(p)) || BRIEF.test(c.text)) hit("internal-term");
    const hs = hostSecret([plain(line), unescape(line), ...parts]);
    if (hs.host) hit("host");
    if (hs.secret) hit("secret");
    if (variants(line).some((v) => terms.some((r) => r.test(v)))) {
      hit("forbidden");
      lineHit = true;
    }
  });
  if (!lineHit && variants(text).some((v) => terms.some((r) => r.test(v)))) found.push({ line: 0, rule: "forbidden" });
  return found;
}

// Checks head, place and title of every page against the wiki config. Returns [{path, problem}], first problem per page.
export function validatePages(wiki, pages) {
  const problems = [];
  for (const p of pages) {
    const problem = pageProblem(wiki, p);
    if (problem) problems.push({ path: p.path, problem });
  }
  // Titles are unique over the whole wiki (case-insensitive), audience page titles included.
  const bad = new Set(problems.map((x) => x.path));
  const ok = pages.filter((p) => !bad.has(p.path));
  const titles = pageTitles(ok);
  const first = new Map();
  for (const a of new Set(ok.map((p) => p.head.audience))) first.set(a.toLowerCase(), `audience ${a}`);
  for (const p of ok) {
    const key = titles.get(p.path).toLowerCase();
    if (first.has(key)) problems.push({ path: p.path, problem: `duplicate title "${titles.get(p.path)}" (also ${first.get(key)})` });
    else first.set(key, p.path);
  }
  return problems;
}

function pageProblem(wiki, p) {
  if (!p.head) return "no head";
  const aud = wiki.audiences.find((a) => a.name === p.head.audience);
  if (!p.head.audience || !aud) return "unknown audience";
  if (p.dir === "") return "page not in an audience folder";
  if (p.dir.split("/")[0] !== aud.slug) return "folder does not match audience";
  if (!p.head.source.length) return "no source";
  if (!p.head.checked.includes("no-ai-slop") || !p.head.checked.includes("humanizer")) return "text check missing (no-ai-slop, humanizer)";
  return null;
}
