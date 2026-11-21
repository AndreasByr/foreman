// Signals the dispatcher check needs from the tracker: answers to interventions, UAT approvals, release reminder.
// Trackers: itsaplan (REST), linear (GraphQL), none (files docs/answers/<unit>.md and docs/uat/<unit>.md).
import { itsaplanClient } from "./itsaplan-api.mjs";
import { linearClient } from "./linear-api.mjs";
import { answers, } from "./intervention.mjs";
import { trackerApproval, fileApproval, fileAnswer } from "./uat.mjs";
import { showFile, lastCommitTime } from "./git.mjs";
import { localParts } from "./time.mjs";

export function trackerKind(conf) {
  const mods = conf?.modules ?? [];
  if (mods.includes("tracker-itsaplan")) return "itsaplan";
  if (mods.includes("tracker-linear") || mods.includes("linear")) return "linear";
  return "none";
}

const EMPTY = () => ({ answers: {}, approvals: {}, releaseCommentToday: false });

async function viaItsaplan({ conf, units, now, tz, client, stderr, wantRelease }) {
  const out = EMPTY();
  const projectKey = conf?.mirror?.itsaplan?.projectKey;
  const relevant = units.filter((u) => u.tracker && (u.status === "needs-input" || u.status === "uat-ready" || (wantRelease && u.status === "release-ready")));
  if (!relevant.length) return out;
  if (!projectKey) { stderr("Note: mirror.itsaplan.projectKey missing in .foreman.json; tracker signals skipped."); return out; }
  if (!client && (!process.env.ITSAPLAN_URL || !process.env.ITSAPLAN_API_KEY)) {
    stderr("Note: ITSAPLAN_URL or ITSAPLAN_API_KEY missing; tracker signals skipped.");
    return out;
  }
  try {
    const c = client ?? itsaplanClient();
    const issues = await c.issues(projectKey);
    const bot = await c.me();
    for (const u of relevant) {
      const issue = issues.find((i) => i.identifier === u.tracker);
      if (!issue) continue;
      try {
        const feed = await c.comments(issue.id);
        if (u.status === "needs-input") out.answers[u.id] = answers(feed, u.id, u.since, bot);
        if (u.status === "uat-ready") {
          const lists = await c.checklists(issue.id);
          const a = trackerApproval({ comments: feed, checklists: Array.isArray(lists) ? lists : [], unit: u.id, since: u.since, botUserId: bot });
          if (a) out.approvals[u.id] = a;
        }
        if (wantRelease && u.status === "release-ready") {
          const today = localParts(now, tz).date;
          out.releaseCommentToday ||= feed.some((x) => (x.kind ?? "comment") === "comment" &&
            localParts(new Date(x.createdAt), tz).date === today && String(x.body ?? "").trimStart().startsWith("Release day:"));
        }
      } catch (e) { stderr(`Note: itsaplan query for ${u.id} failed: ${e.message}`); }
    }
  } catch (e) { stderr(`Note: itsaplan query failed: ${e.message}`); return EMPTY(); }
  return out;
}

async function viaLinear({ units, now, tz, client, stderr, wantRelease }) {
  const out = EMPTY();
  const relevant = units.filter((u) => u.tracker && (u.status === "needs-input" || u.status === "uat-ready" || (wantRelease && u.status === "release-ready")));
  if (!relevant.length) return out;
  if (!client && !process.env.LINEAR_API_KEY) { stderr("Note: LINEAR_API_KEY missing; tracker signals skipped."); return out; }
  try {
    const c = client ?? linearClient();
    const bot = await c.me();
    for (const u of relevant) {
      try {
        const feed = await c.comments(u.tracker);
        if (u.status === "needs-input") out.answers[u.id] = answers(feed, u.id, u.since, bot);
        if (u.status === "uat-ready") {
          const a = trackerApproval({ comments: feed, checklists: [], unit: u.id, since: u.since, botUserId: bot });
          if (a) out.approvals[u.id] = a;
        }
        if (wantRelease && u.status === "release-ready") {
          const today = localParts(now, tz).date;
          out.releaseCommentToday ||= feed.some((x) => localParts(new Date(x.createdAt), tz).date === today && String(x.body ?? "").trimStart().startsWith("Release day:"));
        }
      } catch (e) { stderr(`Note: Linear query for ${u.id} failed: ${e.message}`); }
    }
  } catch (e) { stderr(`Note: Linear query failed: ${e.message}`); return EMPTY(); }
  return out;
}

function viaFiles({ units, now, tz, git, wantRelease }) {
  const out = EMPTY();
  for (const u of units) {
    const refs = [...new Set([u.ref, "origin/dev"].filter(Boolean))];
    if (u.status === "needs-input") {
      for (const ref of refs) {
        const path = `docs/answers/${u.id}.md`;
        const a = fileAnswer({ text: showFile(git, ref, path), modified: lastCommitTime(git, ref, path), unit: u.id, since: u.since });
        if (a) { out.answers[u.id] = [a]; break; }
      }
    }
    if (u.status === "uat-ready") {
      for (const ref of refs) {
        const path = `docs/uat/${u.id}.md`;
        const a = fileApproval({ text: showFile(git, ref, path), modified: lastCommitTime(git, ref, path), unit: u.id, since: u.since });
        if (a) { out.approvals[u.id] = a; break; }
      }
    }
  }
  if (wantRelease) {
    const day = localParts(now, tz).date;
    out.releaseCommentToday = ["origin/dev", "origin/main"].some((r) => showFile(git, r, `docs/release-reminders/${day}.md`) !== null);
  }
  return out;
}

export async function gatherSignals(ctx) {
  const kind = trackerKind(ctx.conf);
  if (kind === "itsaplan") return viaItsaplan(ctx);
  if (kind === "linear") return viaLinear(ctx);
  return viaFiles(ctx);
}
