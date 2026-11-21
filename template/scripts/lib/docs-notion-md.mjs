// Markdown to Notion blocks for docs-notion. No dependencies. Nothing is dropped: unknown syntax stays paragraph text.
const MAX_TEXT = 2000;

const LANGS = new Set([
  ...("abap arduino bash basic c clojure coffeescript c++ c# css dart diff docker elixir elm erlang flow fortran f# gherkin glsl go " +
    "graphql groovy haskell html java javascript json julia kotlin latex less lisp livescript lua makefile markdown markup matlab " +
    "mermaid nix objective-c ocaml pascal perl php powershell prolog protobuf python r reason ruby rust sass scala scheme scss " +
    "shell sql swift typescript vb.net verilog vhdl webassembly xml yaml").split(" "),
  "plain text", "visual basic",
]);
const ALIASES = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript", py: "python",
  sh: "shell", zsh: "shell", yml: "yaml", md: "markdown", cpp: "c++", cs: "c#", csharp: "c#", rb: "ruby", rs: "rust", golang: "go",
  ps1: "powershell", dockerfile: "docker", jsonc: "json", htm: "html", svg: "xml", text: "plain text", txt: "plain text",
};

export function langOf(info) {
  const key = String(info || "").trim().toLowerCase().split(/\s+/)[0] || "";
  const name = ALIASES[key] ?? key;
  return LANGS.has(name) ? name : "plain text";
}

// ---------------------------------------------------------------- inline

function closeStar(s, from) {
  for (let j = s.indexOf("*", from); j !== -1; j = s.indexOf("*", j + 1)) {
    if (s[j + 1] === "*") { j++; continue; } // skip a ** pair inside
    if (s[j - 1] !== "\\" && !/\s/.test(s[j - 1])) return j;
  }
  return -1;
}

function inline(s, ann = {}, link = null, out = []) {
  let buf = "";
  const flush = () => {
    if (buf) out.push({ c: buf, a: ann, l: link });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    let m;
    if (ch === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|~<>]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
    } else if (ch === "`" && s.indexOf("`", i + 1) > i + 1) {
      const j = s.indexOf("`", i + 1);
      flush();
      out.push({ c: s.slice(i + 1, j), a: { ...ann, code: true }, l: link });
      i = j + 1;
    } else if ((rest.startsWith("**") || rest.startsWith("~~")) && s.indexOf(rest.slice(0, 2), i + 2) > i + 2) {
      const j = s.indexOf(rest.slice(0, 2), i + 2);
      flush();
      inline(s.slice(i + 2, j), { ...ann, [ch === "~" ? "strikethrough" : "bold"]: true }, link, out);
      i = j + 2;
    } else if (ch === "*" && !/\s/.test(s[i + 1] ?? " ") && closeStar(s, i + 1) > i + 1) {
      const j = closeStar(s, i + 1);
      flush();
      inline(s.slice(i + 1, j), { ...ann, italic: true }, link, out);
      i = j + 1;
    } else if ((m = rest.match(/^!\[[^\]]*\]\([^)]*\)/))) {
      buf += m[0]; // images stay literal text
      i += m[0].length;
    } else if ((m = rest.match(/^\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/))) {
      if (/^(https?:\/\/|mailto:)/i.test(m[2]) && m[2].length <= MAX_TEXT) {
        flush();
        inline(m[1], ann, m[2], out);
      } else buf += m[0]; // relative or odd link: keep the source text
      i += m[0].length;
    } else {
      buf += ch;
      i++;
    }
  }
  flush();
  return out;
}

export function toRich(s) {
  const merged = [];
  for (const p of inline(String(s))) {
    const prev = merged.at(-1);
    if (prev && JSON.stringify(prev.a) === JSON.stringify(p.a) && prev.l === p.l) prev.c += p.c;
    else merged.push({ ...p });
  }
  return merged.flatMap((p) => splitText(p.c).map((c) => seg(c, p.a, p.l)));
}

function splitText(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += MAX_TEXT) parts.push(text.slice(i, i + MAX_TEXT));
  return parts;
}

function seg(content, ann = {}, link = null) {
  const t = { type: "text", text: { content } };
  if (link) t.text.link = { url: link };
  const a = Object.fromEntries(Object.entries(ann).filter(([, v]) => v));
  if (Object.keys(a).length) t.annotations = a;
  return t;
}

// ---------------------------------------------------------------- blocks

const FENCE = /^\s*(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const ITEM = /^([ \t]*)([-*+]|\d+[.)])\s+(.*)$/;
const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const width = (s) => s.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const isTableStart = (line, next) =>
  line.includes("|") && next !== undefined && next.includes("|") && SEP.test(next) && splitRow(line).length === splitRow(next).length;

const startsBlock = (line, next) =>
  FENCE.test(line) || HEADING.test(line) || HR.test(line) || /^\s{0,3}>/.test(line) || ITEM.test(line) || isTableStart(line, next);

const block = (type, text, extra = {}) => ({ object: "block", type, [type]: { rich_text: toRich(text), ...extra } });

function buildItem(n) {
  const kids = n.kids.map(buildItem);
  const m = n.raw.match(/^\[( |x|X)\]\s+([\s\S]*)$/);
  const type = m ? "to_do" : /^\d/.test(n.marker) ? "numbered_list_item" : "bulleted_list_item";
  const b = block(type, m ? m[2] : n.raw, m ? { checked: m[1] !== " " } : {});
  if (kids.length) b[type].children = kids;
  return b;
}

// Notion takes two nesting levels per request and 100 children: hoist deeper or excess children to siblings.
function limit(blocks, d = 0) {
  const out = [];
  for (const b of blocks) {
    const inner = b.type === "table" ? null : b[b.type];
    const kids = inner?.children;
    if (!kids?.length) { out.push(b); continue; }
    if (d >= 2) {
      delete inner.children;
      out.push(b, ...limit(kids, d));
    } else {
      inner.children = limit(kids.slice(0, 100), d + 1);
      out.push(b, ...limit(kids.slice(100), d));
    }
  }
  return out;
}

export function markdownToBlocks(src) {
  const lines = String(src).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let stack = []; // open list items, innermost last
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(FENCE))) {
      stack = [];
      const body = [];
      for (i++; i < lines.length; i++) {
        const c = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (c && c[1][0] === m[1][0] && c[1].length >= m[1].length) { i++; break; }
        body.push(lines[i]);
      }
      const text = body.join("\n");
      out.push({ object: "block", type: "code", code: { language: langOf(m[2]), rich_text: splitText(text).map((c) => seg(c)) } });
    } else if ((m = line.match(HEADING))) {
      stack = [];
      out.push(block(`heading_${Math.min(3, m[1].length)}`, m[2].trim()));
      i++;
    } else if (HR.test(line)) {
      stack = [];
      out.push({ object: "block", type: "divider", divider: {} });
      i++;
    } else if (isTableStart(line, next)) {
      stack = [];
      const head = splitRow(line);
      const rows = [head];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes("|"); i++) rows.push(splitRow(lines[i]));
      const cell = (r, k) => toRich(r[k] ?? "");
      out.push({
        object: "block", type: "table",
        table: {
          table_width: head.length, has_column_header: true, has_row_header: false,
          children: rows.map((r) => ({ object: "block", type: "table_row", table_row: { cells: head.map((_, k) => cell(r, k)) } })),
        },
      });
    } else if (/^\s{0,3}>/.test(line)) {
      stack = [];
      const q = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
      out.push(block("quote", q.join("\n")));
    } else if ((m = line.match(ITEM))) {
      const indent = width(m[1]);
      while (stack.length && stack.at(-1).indent >= indent) stack.pop();
      const node = { indent, marker: m[2], raw: m[3], kids: [] };
      if (stack.length) stack.at(-1).kids.push(node);
      else out.push(node);
      stack.push(node);
      i++;
    } else if (stack.length && width(line) > stack.at(-1).indent) {
      stack.at(-1).raw += `\n${line.trim()}`; // continuation line of a list item
      i++;
    } else {
      stack = [];
      const p = [line];
      for (i++; i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1]); i++) p.push(lines[i]);
      out.push(block("paragraph", p.join("\n").trim()));
    }
  }
  return limit(out.map((b) => (b.kids ? buildItem(b) : b)));
}
