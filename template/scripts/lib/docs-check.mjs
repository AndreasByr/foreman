// Rule "Stand line" (docs/docs-rules.md): an overview has exactly one Stand line, and that line names exactly one version.
// checkDocs(text) returns { ok, problems }. It never throws; non-string input counts as empty text.

// A Stand line starts (after optional spaces) with **Stand:** or Stand:
const STAND = /^\s*(?:\*\*Stand:\*\*|Stand:)/;

// A version mention: a keyword plus a number, or a lone v/V directly followed by a digit.
// \b keeps "dev" and "Review" out. Group 1 holds the connected items after the first number,
// e.g. " bis 27" or ", v10, v11"; each one is one more version.
const VERSION = /(?:\b(?:Versionen|Versions|Version|Fassungen|Fassung)\s*|\b[vV](?=\d))\d+(?:\.\d+)*((?:\s*(?:,|-|–|&|\b(?:und|and|bis|to)\b)\s*[vV]?\d+(?:\.\d+)*)*)/g;

// Dates in dd.mm.yyyy, d.m.yyyy or yyyy-mm-dd are not versions.
const DATE = /\b\d{1,2}\.\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;

// Backticked text (paths such as `docs/requirements.md`) is not counted.
const CODE = /`[^`]*`/g;

// Counts the version mentions on one Stand line.
function versionsIn(line) {
  const text = line.replace(DATE, " ").replace(CODE, " ");
  let count = 0;
  for (const m of text.matchAll(VERSION)) {
    // The first number counts once; each number in the connected items counts once more.
    count += 1 + (m[1].match(/\d+(?:\.\d+)*/g) || []).length;
  }
  return count;
}

export function checkDocs(text) {
  const source = typeof text === "string" ? text : "";
  const stand = source.split(/\r?\n/).filter((line) => STAND.test(line));
  const problems = [];

  if (stand.length === 0) {
    problems.push('no Stand line: add "**Stand:** <date>, Version <N> (<last change>)"');
  } else if (stand.length > 1) {
    problems.push(`more than one Stand line (${stand.length}): keep exactly one`);
  } else {
    const line = stand[0].trim();
    const n = versionsIn(line);
    if (n === 0) problems.push(`no version on the Stand line: "${line}"`);
    else if (n > 1) problems.push(`more than one version on the Stand line (${n}): "${line}"`);
  }

  return { ok: problems.length === 0, problems };
}
