// docs-wiki scan: blocks internal wording, hosts, secrets and forbidden terms, and checks the page head.
// Pure functions, no dependencies. A finding never holds the matched text (secrets must not be echoed).

const INTERNAL = /\b(roast|roadmap|fix[ -]?pack|fix[ -]?paket|agent[ -]report|offene frage|open question|logikl(ü|ue)cke|logic gap|needs-input|milestone brief)\b|\b(STATE|CONTEXT)\.md\b/i;
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
  /\bBearer [A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bNOTION_API_KEY\s*[=:]\s*\S+/,
];

// Returns [{line, rule}] for the rules internal-term, host, secret, forbidden. Lines count from 1.
export function scanText(text, forbidden = []) {
  const found = [];
  const terms = forbidden.map((t) => t.trim().toLowerCase()).filter(Boolean);
  String(text).split(/\r?\n/).forEach((line, i) => {
    const hit = (rule) => found.push({ line: i + 1, rule });
    if (INTERNAL.test(line)) hit("internal-term");
    if (HOST.some((r) => r.test(line))) hit("host");
    if (SECRET.some((r) => r.test(line))) hit("secret");
    const low = line.toLowerCase();
    if (terms.some((t) => low.includes(t))) hit("forbidden");
  });
  return found;
}

// Checks head and place of every page against the wiki config. Returns [{path, problem}], first problem per page.
export function validatePages(wiki, pages) {
  const problems = [];
  for (const p of pages) {
    const problem = pageProblem(wiki, p);
    if (problem) problems.push({ path: p.path, problem });
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
