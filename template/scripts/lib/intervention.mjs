// Intervention (status needs-input): the question in STATE.md and the mandatory explanation comment.

const MARK = "**Action Required**";

/** The open question section of STATE.md ("## Open question ..."), unless marked answered. */
export function openQuestion(stateText) {
  const lines = String(stateText ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^## Open question/i.test(l.trim()) && !/\(.*answered.*\)/i.test(l));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) body.push(lines[i]);
  // The template placeholder is not a question.
  const text = body.join("\n").trim();
  if (!text || /^One question, options, recommendation\.?$/i.test(text)) return null;
  const marked = text.match(/\*\*Question(?:\s+\d+)?:\*\*\s*(.*)/i);
  const first = (marked?.[1] ?? text.split(/\r?\n/).find((l) => l.trim()) ?? "").trim();
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
