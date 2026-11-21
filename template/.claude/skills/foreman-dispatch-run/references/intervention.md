# Intervention

When a unit cannot go on without the human: a missing board, a product decision, a broken test login, a pretest verdict `intervention`, an exhausted review round limit.

1. **Question in `STATE.md`.** Fill the section `## Open question` (remove "(answered)" from its heading if it was used before). Exactly one question per blocker; several blockers get numbered questions (`**Question 1:**`, ...). Each question has:
   - the question in one sentence, bold, as `**Question:** ...`;
   - options A, B, C, each with its consequence (effort, risk, what stays open);
   - your recommendation and why;
   - the link to the report or pretest document on the batch branch.
   - Every `needs-input` writes the `**Cause:** <category> · <one sentence>` line in its Open question section; a missing cause is reported as a gap by `scripts/measure.mjs`.
2. **Status.** `Status: needs-input since <UTC now> · <short reason>`. Set a new `since` every time a new question is asked, even when the status was already `needs-input`, so old answers never count again. Release the lock, commit, push.
3. **Mirror.** `node scripts/state-mirror.mjs`. It moves the ticket to Action Required and, in the same run, writes the explanation comment from the section: question, options with consequences, recommendation, report link and the way to answer ("Answer <unit>: ...").
4. **Check.** `node scripts/state-mirror.mjs --check` must exit 0. Without the explanation comment the step is not finished. Tracker none: the check passes when the question section has content; the human answers in `docs/answers/<unit>.md` with a line `Answer <unit>: ...` or in chat.
5. **Notify** the human (push notification tool if available): "Action required: <unit>, <question in one sentence>".

Other units keep running. A blocked point of a fix pack goes to `needs-input` on its own and does not stop the others.
