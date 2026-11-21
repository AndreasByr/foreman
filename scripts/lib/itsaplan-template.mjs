// itsaplan project template: validation and conversion to the `project` shape that plan() takes.
// Tests: scripts/test-itsaplan-template.mjs.

export const FORMAT = "itsaplan.project-template";
export const VERSION = 1;

const TOP_KEYS = ["format", "version", "name", "description", "snapshot"];
const SNAPSHOT_KEYS = [
  "flags", "columns", "issueTypes", "labelGroups", "labels", "customFields",
  "issueTemplates", "views", "dashboards", "actions", "settings",
];
const ROW_KEYS = {
  columns: ["id", "name", "stateType", "color", "position", "wipLimit", "wipMode"],
  issueTypes: ["id", "name", "icon", "color", "isDefault", "position"],
  labelGroups: ["id", "name", "color"],
  labels: ["id", "groupId", "name", "color"],
  customFields: ["id", "issueTypeId", "name", "fieldType", "memberScope", "showInBody", "position", "options"],
  issueTemplates: ["name", "description", "titleTemplate", "descriptionTemplate", "typeId", "columnId", "priority", "labelIds"],
  views: ["name", "icon", "filters", "display", "position"],
  dashboards: ["name", "icon", "layout", "position"],
  actions: ["name", "icon", "condition", "effect", "position"],
  settings: ["key", "value"],
};
const OPTION_KEYS = ["id", "value", "color", "position"];
const STATE_TYPES = ["backlog", "unstarted", "started", "completed", "canceled"];
const WIP_MODES = ["soft", "hard"];
const SETTING_KEYS = ["auto_archive", "subtask_automation"];

// German words that must not appear as a whole word in names or text fields (the template is English).
// Lowercase only; matched case-insensitively. Words that are also English words or abbreviations
// (such as "die", "den", "mit") are not listed, so English text with them stays valid.
export const GERMAN_WORDS = new Set([
  "der", "das", "dem", "des", "ein", "eine", "einen", "einem", "einer",
  "und", "oder", "nicht", "ist", "sind", "wird", "werden", "auf", "aus", "bei", "nach", "vor",
  "ohne", "zum", "zur", "auch", "noch", "schon", "dann", "wenn", "aber", "weil", "bitte", "ja", "nein",
  "ich", "wir", "ihr", "sie", "fuer", "ueber", "hallo", "fehler", "frage", "fragen", "antwort", "antworten",
  "aufgabe", "aufgaben", "projekt", "projekte", "benutzer", "mensch", "bereit", "freigabe", "empfehlung",
  "bericht", "hinweis", "schritt", "schritte", "bearbeitung", "abschluss", "ergebnis", "vorlage",
  "beschreibung", "bezeichnung", "titel", "liste", "datei", "meilenstein", "ansicht", "eintrag",
  "ausgabe", "hilfe", "pruefung", "prüfung",
  "paket", "freitag", "wartet", "eingriff", "runde", "abgebrochen",
]);

// Returns why a text field is not acceptable (German word or äöüß), or null.
function germanProblem(text) {
  if (/[äöüßÄÖÜ]/.test(text)) return "contains an umlaut or ß";
  for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) {
    if (GERMAN_WORDS.has(word)) return `contains the German word "${word}"`;
  }
  return null;
}

const TEXT_FIELDS = new Set(["name", "description", "titleTemplate", "descriptionTemplate"]);

// Walks the whole template and checks every name or text field at any depth.
function checkTextFields(node, path, errors, seen = new Set()) {
  if (node === null || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((n, i) => checkTextFields(n, `${path}[${i}]`, errors, seen));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    const where = `${path}.${k}`;
    if (TEXT_FIELDS.has(k) && typeof v === "string") {
      const problem = germanProblem(v);
      if (problem) errors.push(`${where} ${problem}: ${show(v)}`);
    }
    checkTextFields(v, where, errors, seen);
  }
}

// Names the foreman workflow depends on (see plan() in itsaplan-mirror.mjs).
const FOREMAN_COLUMNS = [
  "Backlog", "Todo", "In Progress", "Action Required", "Wait for Merge", "Testing", "In Review", "Done",
];
const FOREMAN_LABELS = [
  "Milestone", "Fix pack", "AP: Coding", "AP: Fix round", "AP: Action Required", "AP: Waiting for merge",
  "AP: Pretest waiting", "AP: Pretest running", "AP: UAT ready", "AP: Release ready",
];

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isStructured = (x) => x !== null && typeof x === "object";
const isId = (x) => Number.isInteger(x) && x > 0;
const isHex = (x) => typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x);
const isText = (x) => typeof x === "string" && x.trim() !== "";
const isIcon = (x) => x === null || typeof x === "string";
const show = (x) => JSON.stringify(x) ?? String(x);

function duplicates(values) {
  const seen = new Set();
  const dup = new Set();
  for (const v of values) {
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  }
  return [...dup];
}

// Unknown keys and missing keys in a closed object.
function closed(obj, keys, where, errors) {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) errors.push(`${where}: unknown key "${k}"`);
  for (const k of keys) if (!(k in obj)) errors.push(`${where}: missing key "${k}"`);
}

// Reads snapshot[kind] as a list of objects. Checks each row's keys, then calls rowFn for its values.
// Returns every object row, so later reference checks still see rows with bad values.
function rowsOf(snapshot, kind, errors, rowFn) {
  const list = snapshot[kind];
  if (!Array.isArray(list)) {
    errors.push(`snapshot.${kind} must be a list`);
    return [];
  }
  const objects = [];
  list.forEach((row, i) => {
    const base = `snapshot.${kind}[${i}]`;
    if (!isObj(row)) {
      errors.push(`${base} must be an object`);
      return;
    }
    objects.push(row);
    const tag = typeof row.name === "string" ? ` "${row.name}"` : typeof row.key === "string" ? ` "${row.key}"` : "";
    const where = base + tag;
    closed(row, ROW_KEYS[kind], where, errors);
    rowFn?.(row, where);
  });
  return objects;
}

function checkIdsUnique(rows, kind, errors) {
  for (const id of duplicates(rows.map((r) => r.id).filter(isId))) errors.push(`duplicate ${kind} id ${id}`);
}

function checkPositionsUnique(rows, kind, errors) {
  for (const p of duplicates(rows.map((r) => r.position).filter(Number.isInteger))) {
    errors.push(`duplicate ${kind} position ${p}`);
  }
}

function checkNamesUnique(rows, kind, errors) {
  for (const name of duplicates(rows.map((r) => r.name).filter(isText))) errors.push(`duplicate ${kind} name "${name}"`);
}

// Walks a view filter tree. Every `labels` condition must point at existing label ids,
// every `status` condition at existing column ids.
function checkFilterRefs(node, where, refs, errors) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => checkFilterRefs(n, `${where}[${i}]`, refs, errors));
    return;
  }
  if (!isObj(node)) return;
  if (node.field === "labels" || node.field === "status") {
    const values = [];
    if ("value" in node) values.push(node.value);
    if ("values" in node) values.push(...(Array.isArray(node.values) ? node.values : [node.values]));
    if (values.length === 0) errors.push(`${where}: ${node.field} condition has no value`);
    for (const v of values) {
      if (!refs[node.field].has(v)) errors.push(`${where}: ${node.field} value ${show(v)} does not exist`);
    }
  }
  for (const [k, v] of Object.entries(node)) checkFilterRefs(v, `${where}.${k}`, refs, errors);
}

function checkSnapshot(s, errors) {
  closed(s, SNAPSHOT_KEYS, "snapshot", errors);
  if (!isObj(s.flags) || Object.values(s.flags).some((v) => typeof v !== "boolean")) {
    errors.push("snapshot.flags must be an object with true/false values");
  }

  const columns = rowsOf(s, "columns", errors, (c, w) => {
    if (!isId(c.id)) errors.push(`${w}: id must be a positive whole number, got ${show(c.id)}`);
    if (!isText(c.name)) errors.push(`${w}: name must be a non-empty text, got ${show(c.name)}`);
    if (!STATE_TYPES.includes(c.stateType)) {
      errors.push(`${w}: stateType must be one of ${STATE_TYPES.join(", ")}, got ${show(c.stateType)}`);
    }
    if (!isHex(c.color)) errors.push(`${w}: color must be a hex color like #1F2937, got ${show(c.color)}`);
    if (!Number.isInteger(c.position)) errors.push(`${w}: position must be a whole number, got ${show(c.position)}`);
    if (!(c.wipLimit === null || (Number.isInteger(c.wipLimit) && c.wipLimit > 0))) {
      errors.push(`${w}: wipLimit must be null or a positive whole number, got ${show(c.wipLimit)}`);
    }
    if (!WIP_MODES.includes(c.wipMode)) errors.push(`${w}: wipMode must be soft or hard, got ${show(c.wipMode)}`);
  });
  checkIdsUnique(columns, "column", errors);
  checkNamesUnique(columns, "column", errors);
  for (const p of duplicates(columns.map((c) => c.position))) errors.push(`duplicate column position ${p}`);
  for (const n of FOREMAN_COLUMNS) {
    if (!columns.some((c) => c.name === n)) errors.push(`missing foreman column "${n}"`);
  }
  const columnIds = new Set(columns.map((c) => c.id));

  const issueTypes = rowsOf(s, "issueTypes", errors, (t, w) => {
    if (!isId(t.id)) errors.push(`${w}: id must be a positive whole number, got ${show(t.id)}`);
    if (!isText(t.name)) errors.push(`${w}: name must be a non-empty text, got ${show(t.name)}`);
    if (!isIcon(t.icon)) errors.push(`${w}: icon must be text or null, got ${show(t.icon)}`);
    if (!isHex(t.color)) errors.push(`${w}: color must be a hex color like #1F2937, got ${show(t.color)}`);
    if (typeof t.isDefault !== "boolean") errors.push(`${w}: isDefault must be true or false`);
    if (!Number.isInteger(t.position)) errors.push(`${w}: position must be a whole number, got ${show(t.position)}`);
  });
  checkIdsUnique(issueTypes, "issue type", errors);
  checkNamesUnique(issueTypes, "issue type", errors);
  checkPositionsUnique(issueTypes, "issue type", errors);
  const defaults = issueTypes.filter((t) => t.isDefault === true);
  if (defaults.length === 0) errors.push("no default issue type: exactly one issue type must have isDefault true");
  if (defaults.length > 1) {
    errors.push(`more than one default issue type: ${defaults.map((t) => `"${t.name}"`).join(", ")}`);
  }
  const typeIds = new Set(issueTypes.map((t) => t.id));

  const labelGroups = rowsOf(s, "labelGroups", errors, (g, w) => {
    if (!isId(g.id)) errors.push(`${w}: id must be a positive whole number, got ${show(g.id)}`);
    if (!isText(g.name)) errors.push(`${w}: name must be a non-empty text, got ${show(g.name)}`);
    if (!isHex(g.color)) errors.push(`${w}: color must be a hex color like #1F2937, got ${show(g.color)}`);
  });
  checkIdsUnique(labelGroups, "label group", errors);
  checkNamesUnique(labelGroups, "label group", errors);
  const groupIds = new Set(labelGroups.map((g) => g.id));

  const labels = rowsOf(s, "labels", errors, (l, w) => {
    if (!isId(l.id)) errors.push(`${w}: id must be a positive whole number, got ${show(l.id)}`);
    if (!(l.groupId === null || groupIds.has(l.groupId))) {
      errors.push(`${w}: groupId ${show(l.groupId)} does not exist in labelGroups`);
    }
    if (!isText(l.name)) errors.push(`${w}: name must be a non-empty text, got ${show(l.name)}`);
    if (!isHex(l.color)) errors.push(`${w}: color must be a hex color like #1F2937, got ${show(l.color)}`);
  });
  checkIdsUnique(labels, "label", errors);
  checkNamesUnique(labels, "label", errors);
  for (const l of labels) {
    if (typeof l.name === "string" && l.name.startsWith("AP:") && !FOREMAN_LABELS.includes(l.name)) {
      errors.push(`unknown label "${l.name}": AP: labels must use the foreman English names`);
    }
  }
  for (const n of FOREMAN_LABELS) {
    if (!labels.some((l) => l.name === n)) errors.push(`missing foreman label "${n}"`);
  }
  const labelIds = new Set(labels.map((l) => l.id));

  const customFields = rowsOf(s, "customFields", errors, (f, w) => {
    if (!isId(f.id)) errors.push(`${w}: id must be a positive whole number, got ${show(f.id)}`);
    if (!(f.issueTypeId === null || typeIds.has(f.issueTypeId))) {
      errors.push(`${w}: issueTypeId ${show(f.issueTypeId)} does not exist in issueTypes`);
    }
    if (!isText(f.name)) errors.push(`${w}: name must be a non-empty text, got ${show(f.name)}`);
    if (!isText(f.fieldType)) errors.push(`${w}: fieldType must be a non-empty text, got ${show(f.fieldType)}`);
    if (!isText(f.memberScope)) errors.push(`${w}: memberScope must be a non-empty text, got ${show(f.memberScope)}`);
    if (typeof f.showInBody !== "boolean") errors.push(`${w}: showInBody must be true or false`);
    if (!Number.isInteger(f.position)) errors.push(`${w}: position must be a whole number, got ${show(f.position)}`);
    if (!Array.isArray(f.options)) errors.push(`${w}: options must be a list`);
  });
  checkIdsUnique(customFields, "custom field", errors);
  checkNamesUnique(customFields, "custom field", errors);
  const options = [];
  for (const f of customFields) {
    if (!Array.isArray(f.options)) continue;
    f.options.forEach((o, i) => {
      const w = `snapshot.customFields "${f.name}" options[${i}]`;
      if (!isObj(o)) {
        errors.push(`${w} must be an object`);
        return;
      }
      closed(o, OPTION_KEYS, w, errors);
      options.push(o);
      if (!isId(o.id)) errors.push(`${w}: id must be a positive whole number, got ${show(o.id)}`);
      if (!isText(o.value)) errors.push(`${w}: value must be a non-empty text, got ${show(o.value)}`);
      if (!(o.color === null || isHex(o.color))) errors.push(`${w}: color must be a hex color or null, got ${show(o.color)}`);
      if (!Number.isInteger(o.position)) errors.push(`${w}: position must be a whole number, got ${show(o.position)}`);
    });
  }
  checkIdsUnique(options, "option", errors);

  const issueTemplates = rowsOf(s, "issueTemplates", errors, (t, w) => {
    if (!isText(t.name)) errors.push(`${w}: name must be a non-empty text, got ${show(t.name)}`);
    for (const k of ["description", "titleTemplate", "descriptionTemplate"]) {
      if (typeof t[k] !== "string") errors.push(`${w}: ${k} must be text, got ${show(t[k])}`);
    }
    if (!typeIds.has(t.typeId)) errors.push(`${w}: typeId ${show(t.typeId)} does not exist in issueTypes`);
    if (!(t.columnId === null || columnIds.has(t.columnId))) {
      errors.push(`${w}: columnId ${show(t.columnId)} does not exist in columns`);
    }
    if (!(t.priority === null || typeof t.priority === "string")) {
      errors.push(`${w}: priority must be text or null, got ${show(t.priority)}`);
    }
    if (!Array.isArray(t.labelIds)) {
      errors.push(`${w}: labelIds must be a list`);
    } else {
      for (const id of t.labelIds) {
        if (!labelIds.has(id)) errors.push(`${w}: labelIds contains ${show(id)}, which is not a label id`);
      }
    }
  });
  checkNamesUnique(issueTemplates, "issue template", errors);

  const refs = { labels: labelIds, status: columnIds };
  const views = rowsOf(s, "views", errors, (v, w) => {
    if (!isText(v.name)) errors.push(`${w}: name must be a non-empty text, got ${show(v.name)}`);
    if (!isIcon(v.icon)) errors.push(`${w}: icon must be text or null, got ${show(v.icon)}`);
    if (!isObj(v.filters)) errors.push(`${w}: filters must be an object`);
    else checkFilterRefs(v.filters, `${w} filters`, refs, errors);
    if (!isObj(v.display)) errors.push(`${w}: display must be an object`);
    if (!Number.isInteger(v.position)) errors.push(`${w}: position must be a whole number, got ${show(v.position)}`);
  });
  checkPositionsUnique(views, "view", errors);

  rowsOf(s, "dashboards", errors, (d, w) => {
    if (!isText(d.name)) errors.push(`${w}: name must be a non-empty text, got ${show(d.name)}`);
    if (!isIcon(d.icon)) errors.push(`${w}: icon must be text or null, got ${show(d.icon)}`);
    if (!isStructured(d.layout)) errors.push(`${w}: layout must be an object or a list`);
    if (!Number.isInteger(d.position)) errors.push(`${w}: position must be a whole number, got ${show(d.position)}`);
  });

  rowsOf(s, "actions", errors, (a, w) => {
    if (!isText(a.name)) errors.push(`${w}: name must be a non-empty text, got ${show(a.name)}`);
    if (!isIcon(a.icon)) errors.push(`${w}: icon must be text or null, got ${show(a.icon)}`);
    if (!isStructured(a.condition)) errors.push(`${w}: condition must be an object or a list`);
    if (!isStructured(a.effect)) errors.push(`${w}: effect must be an object or a list`);
    if (!Number.isInteger(a.position)) errors.push(`${w}: position must be a whole number, got ${show(a.position)}`);
  });

  const settings = rowsOf(s, "settings", errors, (st, w) => {
    if (!SETTING_KEYS.includes(st.key)) {
      errors.push(`${w}: key must be one of ${SETTING_KEYS.join(", ")}, got ${show(st.key)}`);
    }
  });
  for (const k of duplicates(settings.map((st) => st.key))) errors.push(`duplicate setting key "${k}"`);
}

/**
 * Checks a parsed itsaplan.project-template (format "itsaplan.project-template", version 1).
 * Returns an array of error strings; an empty array means valid. Never throws.
 */
export function validateTemplate(template) {
  const errors = [];
  try {
    if (!isObj(template)) return ["template must be a JSON object"];
    checkTextFields(template, "template", errors);
    closed(template, TOP_KEYS, "template", errors);
    if (template.format !== FORMAT) errors.push(`format must be "${FORMAT}", got ${show(template.format)}`);
    if (template.version !== VERSION) errors.push(`version must be ${VERSION}, got ${show(template.version)}`);
    if (!isText(template.name)) errors.push(`name must be a non-empty text, got ${show(template.name)}`);
    if (typeof template.description !== "string") errors.push("description must be text");
    if (!isObj(template.snapshot)) errors.push("snapshot must be an object");
    else checkSnapshot(template.snapshot, errors);
  } catch (err) {
    errors.push(`template could not be checked: ${err?.message ?? err}`);
  }
  return errors;
}

/**
 * Builds the `project` argument of plan(): { columns: [{id, name}], labels: [{id, name}], assignees: [] }.
 */
export function projectFromTemplate(template) {
  const s = template?.snapshot ?? {};
  const columns = Array.isArray(s.columns) ? [...s.columns] : [];
  const labels = Array.isArray(s.labels) ? s.labels : [];
  return {
    columns: columns.sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name })),
    labels: labels.map((l) => ({ id: l.id, name: l.name })),
    assignees: [],
  };
}
