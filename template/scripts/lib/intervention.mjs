// Intervention (status needs-input): the question in STATE.md and the mandatory explanation comment.

const MARK = "**Action Required**";

/** The open question section of STATE.md ("## Open question ..."), unless marked answered. */
export function openQuestion(stateText) {
  const lines = String(stateText ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^## Open question/i.test(l.trim()) && !/\(.*answered.*\)/i.test(l));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) body.push(lines[i]);
  // Template placeholders are not a question.
  const real = body.map((l) => l.trim()).filter((l) => l && !isPlaceholder(l));
  if (!real.length) return null;
  const text = body.join("\n").trim();
  const marked = text.match(/\*\*Question(?:\s+\d+)?:\*\*\s*(.*)/i);
  // The question comes first; a cause line is used only when the section has nothing else.
  const questions = real.filter((l) => !/^\*\*Cause:\*\*/.test(l));
  const first = (marked?.[1] ?? (questions[0] ?? real[0])).trim();
  const sentence = first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first;
  return { short: sentence.replace(/\*\*/g, "").trim().slice(0, 160).trim(), text };
}

/** Text of the explanation comment: question, options with consequences, recommendation, report link, answer route. */
export function explanationText({ unit, question, link }) {
  return [
    `${MARK} · ${unit}`,
    "",
    question.text,
    "",
    `Status and report: ${link}`,
    "",
    `How to answer: comment on this ticket (or send the chat message) starting with "Answer ${unit}:", for example "Answer ${unit}: option A".`,
  ].join("\n");
}

/** True when a comment explains the intervention (newer than the question, when `since` is valid). */
export function hasExplanation(comments, unit, since) {
  const from = since ? Date.parse(/Z$/.test(since) ? since : `${since}Z`) : NaN;
  return (comments ?? []).some((c) =>
    (c.kind ?? "comment") === "comment" &&
    (!Number.isFinite(from) || Date.parse(c.createdAt) >= from) &&
    String(c.body ?? "").trim().startsWith(MARK) &&
    String(c.body ?? "").includes(`Answer ${unit}:`));
}

/** Answers: comments of someone else than the bot, newer than the question, starting with "Answer <unit>:". */
export function answers(comments, unit, since, botUserId) {
  const from = since ? Date.parse(/Z$/.test(since) ? since : `${since}Z`) : NaN;
  if (!botUserId) return []; // without the bot's own id a bot comment could pass as an answer
  return (comments ?? [])
    .filter((c) =>
      (c.kind ?? "comment") === "comment" && Number.isFinite(from) && Date.parse(c.createdAt) > from &&
      c.actorUserId !== botUserId && String(c.body ?? "").trim().startsWith(`Answer ${unit}:`))
    .map(({ id, createdAt, body }) => ({ id, createdAt, body }));
}

/** Allowed causes of an intervention (STATE.md line `**Cause:** <category> · <one sentence>`). */
export const CAUSES = ["missing-requirement", "open-decision", "missing-infra", "merge-conflict", "ui-deviation", "limit-exceeded", "security", "other"];

const CATEGORIES_LINE = `Categories: ${CAUSES.join(", ")}. One section per intervention; keep the section after it is answered.`;

/** Template lines (STATE.md templates): the example question, the cause hint with angle brackets, the category list. */
function isPlaceholder(line) {
  const l = line.trim();
  return /^One question, options, recommendation\.?$/i.test(l) || l === CATEGORIES_LINE || /^\*\*Cause:\*\*\s*<[^>]*>/.test(l);
}

/** Every "## Open question" section of STATE.md (answered ones too) with its cause. Template placeholder sections are skipped. */
export function interventions(stateText) {
  if (typeof stateText !== "string") return [];
  const lines = stateText.split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].trim();
    if (!/^## Open question/i.test(heading)) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length && !/^#{1,6}\s/.test(lines[j]); j++) body.push(lines[j]);
    i = j - 1;
    const content = body.map((l) => l.trim()).filter(Boolean);
    const real = content.filter((l) => !isPlaceholder(l));
    if (content.length && !real.length) continue; // template placeholder, not an intervention
    const answered = /\(.*answered.*\)/i.test(heading);
    const line = real.find((l) => /^\*\*Cause:\*\*/.test(l));
    if (!line) { result.push({ heading, answered, cause: null, problem: "missing" }); continue; }
    const rest = line.replace(/^\*\*Cause:\*\*\s*/, "");
    const dot = rest.indexOf("·");
    if (dot < 0) {
      // Without the middle dot the line is not a cause line (a plain "-" or ":" separator is not accepted).
      if (CAUSES.includes(rest)) result.push({ heading, answered, cause: { category: rest, text: "" }, problem: "empty-text" });
      else result.push({ heading, answered, cause: null, problem: "missing" });
      continue;
    }
    const category = rest.slice(0, dot).trim();
    const text = rest.slice(dot + 1).trim();
    const cause = { category, text };
    let problem = null;
    if (!CAUSES.includes(category)) problem = "unknown-category";
    else if (!text) problem = "empty-text";
    result.push({ heading, answered, cause, problem });
  }
  return result;
}
