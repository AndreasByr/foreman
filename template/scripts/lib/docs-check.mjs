// Rule "Stand line" (docs/docs-rules.md): an overview has exactly one Stand line, and that line names exactly one version.
// checkDocs(text) returns { ok, problems }. It never throws; non-string input counts as empty text.

// A Stand line starts (after optional quote or list markers: > - * in any mix) with **Stand:**, **Stand**: or Stand:
const STAND = /^\s*(?:>\s*|[-*]\s+)*(?:\*\*Stand:\*\*|\*\*Stand\*\*:|Stand:)/;

// A version mention: a keyword plus an optional colon and a number, or a lone v/V directly followed by a digit.
// \b keeps "dev" and "Review" out; the flag i makes keywords and v case-insensitive.
// Group 1 holds the whole chain of connected numbers after the first one, e.g. " bis 27" or ", v10, v11".
const VERSION = /(?:\b(?:Versionen|Versions|Version|Fassungen|Fassung)\s*:?\s*|\b[vV](?=\d))\d+(?:\.\d+)*((?:\s*(?:,|-|–|&|\b(?:und|and|bis|to)\b)\s*[vV]?\d+(?:\.\d+)*)*)/gi;

// One connected item: its connector, its optional v/V prefix and its number.
const ITEM = /(?:,|-|–|&|\b(?:und|and|bis|to)\b)\s*([vV]?)\d+(?:\.\d+)*/gi;

// Matches only where no word follows the number (", 12 neue" does not count; ", 21. November" does not either).
// A time such as "14:30" counts as a word too.
const NO_WORD_AFTER = /^(?!\.?\s*[A-Za-zÄÖÜäöüß]|:\d)/;

// Dates in dd.mm.yyyy, d.m.yyyy, dd.mm. (no year), dd.mm.yy or yyyy-mm-dd are not versions.
// dd.mm.yy right after a version keyword stays a version (e.g. "Version 1.2.10").
const DATE = /(?<!\b(?:[Vv]ersion(?:en|s)?|[Ff]assung(?:en)?)\s*:?\s*)\b\d{1,2}\.\d{1,2}\.\d{2}\b|\b\d{1,2}\.\d{1,2}\.(?:\d{4}\b|(?!\d))|\b\d{4}-\d{2}-\d{2}\b/g;

// Backticked text (paths such as `docs/requirements.md`) is not counted.
const CODE = /`[^`]*`/g;

// Counts the version mentions on one Stand line.
function versionsIn(line) {
  const text = line.replace(DATE, " ").replace(CODE, " ");
  let count = 0;
  for (const m of text.matchAll(VERSION)) {
    // The first number counts once. A connected item counts if it has a v prefix, if the keyword is plural,
    // if its connector is bis/to/und/and/&, or if its bare number (after , - –) is not followed by a word.
    count += 1;
    const plural = /^(?:Versionen|Versions|Fassungen)\b/i.test(m[0]);
    const chainStart = m.index + m[0].length - m[1].length;
    for (const item of m[1].matchAll(ITEM)) {
      const rest = text.slice(chainStart + item.index + item[0].length);
      const softConnector = /^[,\-–]/.test(item[0]);
      if (item[1] || plural || !softConnector || NO_WORD_AFTER.test(rest)) count += 1;
    }
  }
  return count;
}

export function checkDocs(text) {
  const source = typeof text === "string" ? text : "";
  const stand = [];
  let fence = false;
  for (const line of source.split(/\r?\n/)) {
    // A line starting (after spaces or >) with ``` or ~~~ toggles a fenced block; lines inside are code.
    // An unclosed fence therefore hides everything after it.
    if (/^[\s>]*(?:```|~~~)/.test(line)) fence = !fence;
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
