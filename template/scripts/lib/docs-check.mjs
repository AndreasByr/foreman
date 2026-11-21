// Rule "Stand line" (docs/docs-rules.md): an overview has exactly one Stand line, and that line names exactly one version.
// checkDocs(text) returns { ok, problems }. It never throws; non-string input counts as empty text.

// A Stand line starts (after optional quote or list markers: > - * in any mix) with **Stand:**, **Stand**: or Stand:
const STAND = /^\s*(?:>\s*|[-*]\s+)*(?:\*\*Stand:\*\*|\*\*Stand\*\*:|Stand:)/;

// A version mention: a keyword plus an optional colon and a number, or a lone v/V directly followed by a digit.
// \b keeps "dev" and "Review" out. Group 1 holds the connected items after the first number,
// e.g. " bis 27" or ", v10, v11"; ITEM decides which of them count.
const VERSION = /(?:\b(?:Versionen|Versions|Version|Fassungen|Fassung)\s*:?\s*|\b[vV](?=\d))\d+(?:\.\d+)*((?:\s*(?:,|-|–|&|\b(?:und|and|bis|to)\b)\s*[vV]?\d+(?:\.\d+)*)*)/g;

// One connected item: its connector and its optional v/V prefix.
const ITEM = /(,|-|–|&|\b(?:und|and|bis|to)\b)\s*([vV]?)\d+(?:\.\d+)*/g;
const RANGE = /^(?:-|–|bis|to)$/;
const PLURAL = /^(?:Versionen|Versions|Fassungen)/;

// Dates in dd.mm.yyyy, d.m.yyyy, dd.mm. (no year) or yyyy-mm-dd are not versions.
const DATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}\b|(?!\d))|\b\d{4}-\d{2}-\d{2}\b/g;

// Backticked text (paths such as `docs/requirements.md`) is not counted.
const CODE = /`[^`]*`/g;

// Counts the version mentions on one Stand line.
function versionsIn(line) {
  const text = line.replace(DATE, " ").replace(CODE, " ");
  let count = 0;
  for (const m of text.matchAll(VERSION)) {
    // The first number counts once. A connected item counts if it is a range,
    // the keyword is plural, or the number has a v prefix.
    const plural = PLURAL.test(m[0]);
    count += 1;
    for (const item of m[1].matchAll(ITEM)) {
      if (RANGE.test(item[1]) || plural || item[2]) count += 1;
    }
  }
  return count;
}

export function checkDocs(text) {
  const source = typeof text === "string" ? text : "";
  const stand = [];
  let fence = false;
  for (const line of source.split(/\r?\n/)) {
    // Lines inside ``` fences are code, not the overview.
    if (/^\s*```/.test(line)) fence = !fence;
    else if (!fence && STAND.test(line)) stand.push(line);
  }
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
