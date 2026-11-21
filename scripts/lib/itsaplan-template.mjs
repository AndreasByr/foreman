// itsaplan project template: validation and conversion to the `project` shape that plan() takes.
// STUB: the real implementation comes later. Tests: scripts/test-itsaplan-template.mjs.

/**
 * Checks a parsed itsaplan.project-template (format "itsaplan.project-template", version 1).
 * Returns an array of error strings; an empty array means valid.
 */
export function validateTemplate(template) {
  throw new Error("not implemented");
}

/**
 * Builds the `project` argument of plan(): { columns: [{id, name}], labels: [{id, name}], assignees: [] }.
 */
export function projectFromTemplate(template) {
  throw new Error("not implemented");
}
