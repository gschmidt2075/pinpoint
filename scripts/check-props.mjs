// Does every component get the props it actually reads?
//
//     node scripts/check-props.mjs
//
// This catches the bug class that produces a white screen and that nothing else
// here catches: passing a component a prop it does not have.
//
//     <Table columns={[...]} empty="…" />          // but Table reads `headers`
//     function Table({ headers, rows, emptyMessage })
//
// `headers` is undefined, `headers.map` throws, React unmounts the whole tree,
// and the page goes blank. Every name resolved, every file parsed, every test
// passed — because the mistake is in the SHAPE of the call, not in any
// identifier.
//
// It is the same fault as the tanks screen, where a rewritten function returned
// an object missing three keys its caller went on to read. I said at the time
// that no check could catch that. This one would have.
//
// Two rules, with different consequences:
//
//   MISSING — the component destructures it with no default, reads through it,
//             and nothing guards it. This THROWS, and the screen goes blank.
//   UNKNOWN — passed, but never destructured. React drops it silently, so the
//             page still renders and the intent is quietly lost: a style that
//             never applies, a handler that never fires. Not a crash; still a bug.
//
// Elements carrying {...spread} are exempt from rule 1, because the spread may
// supply anything and an unfamiliar name is then not evidence of a mistake.
//
// No dependencies beyond the acorn already in the tree — deliberately, so this
// keeps working on any machine that can run the app.

import { Parser } from "acorn";
import jsx from "acorn-jsx";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const P = Parser.extend(jsx());

// Visit every node in the tree. acorn-walk does not know the JSX node types, so
// walking the object graph directly is both simpler and more complete.
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    walk(node[key], visit);
  }
}

const ROOT = resolve("src");
const files = [];
(function crawl(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules") crawl(p); }
    else if (/\.jsx?$/.test(e)) files.push(resolve(p));
  }
})(ROOT);
const known = new Set(files);
const rel = (p) => p.slice(resolve(".").length + 1).replace(/\\/g, "/");

const parse = (src) => {
  try { return P.parse(src, { ecmaVersion: "latest", sourceType: "module" }); }
  catch { return null; }          // parse-check.mjs is what reports these
};

// ── Pass one: what does each component declare, and what does it dereference? ─
const declared = new Map();       // "file::Name" -> { props, required, hasRest }

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const ast = parse(src);
  if (!ast) continue;

  const record = (name, params, body) => {
    if (!name || !/^[A-Z]/.test(name)) return;          // components are capitalised
    const head = src.slice(body.start, Math.min(body.end, body.start + 4000));
    if (!/<[A-Za-z]/.test(head)) return;                // …and return markup
    const p = params[0];
    if (!p || p.type !== "ObjectPattern") return;

    const props = new Set(), defaulted = new Set();
    let hasRest = false;
    for (const prop of p.properties) {
      if (prop.type === "RestElement") { hasRest = true; continue; }
      const n = prop.key?.name ?? prop.key?.value;
      if (!n) continue;
      props.add(n);
      if (prop.value?.type === "AssignmentPattern") defaulted.add(n);
    }

    // A prop counts as REQUIRED when it has no default, the body reads through
    // it (`rows.length`, `headers.map(…)`), and nothing guards that read. A
    // prop merely rendered ({title}) is harmless as undefined, and one behind
    // `x && …` or `x?.y` is handled — demanding either would be noise.
    const text = src.slice(body.start, body.end);
    const required = new Set();
    for (const n of props) {
      if (defaulted.has(n)) continue;
      if (!new RegExp(`\\b${n}\\s*[.[]`).test(text)) continue;
      const guarded = new RegExp(`(\\b${n}\\s*(\\?\\.|&&|\\|\\||\\?)|!\\s*${n}\\b)`).test(text);
      if (!guarded) required.add(n);
    }

    declared.set(`${file}::${name}`, { props, required, hasRest });
  };

  walk(ast, (n) => {
    if (n.type === "FunctionDeclaration") record(n.id?.name, n.params, n.body);
    if (n.type === "VariableDeclarator" && n.init &&
        (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression"))
      record(n.id?.name, n.init.params, n.init.body);
  });
}

// ── Pass two: every JSX call site ────────────────────────────────────────────
const resolveImport = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [base, base + ".jsx", base + ".js",
                   join(base, "index.jsx"), join(base, "index.js")])
    if (known.has(c)) return c;
  return null;
};

const problems = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const ast = parse(src);
  if (!ast) continue;

  const origin = new Map();
  walk(ast, (n) => {
    if (n.type !== "ImportDeclaration") return;
    const target = resolveImport(file, n.source.value);
    if (!target) return;
    for (const s of n.specifiers) {
      const local = s.local.name;
      if (/^[A-Z]/.test(local)) origin.set(local, `${target}::${s.imported?.name ?? local}`);
    }
  });

  const lineOf = (pos) => src.slice(0, pos).split("\n").length;

  walk(ast, (n) => {
    if (n.type !== "JSXOpeningElement") return;
    const name = n.name?.name;
    if (!name || !/^[A-Z]/.test(name)) return;

    const info = declared.get(origin.get(name) ?? `${file}::${name}`);
    if (!info) return;                       // third-party, or not destructured

    const passed = new Set();
    let spread = false;
    for (const a of n.attributes) {
      if (a.type === "JSXSpreadAttribute") { spread = true; continue; }
      // `key` and `ref` are React's own; they never reach the component.
      if (a.name?.name && a.name.name !== "key" && a.name.name !== "ref")
        passed.add(a.name.name);
    }

    if (!spread && !info.hasRest)
      for (const p of passed)
        if (!info.props.has(p))
          problems.push({ severity: "dropped", file, line: lineOf(n.start), el: name,
                          kind: "does not take", prop: p,
                          hint: `it takes: ${[...info.props].join(", ")}` });

    if (!spread)
      for (const p of info.required)
        if (!passed.has(p))
          problems.push({ severity: "throws", file, line: lineOf(n.start), el: name,
                          kind: "is missing", prop: p,
                          hint: "the component reads through it — undefined here throws, and the screen goes blank" });
  });
}

const throws  = problems.filter(p => p.severity === "throws");
const dropped = problems.filter(p => p.severity === "dropped");

const show = (list, heading) => {
  if (!list.length) return;
  console.log(`\n${heading}`);
  for (const p of list)
    console.log(`  ${rel(p.file)}:${p.line}  <${p.el}> ${p.kind} "${p.prop}"\n      ${p.hint}`);
};
show(throws,  "BLANK SCREEN — a required prop is not being passed");
show(dropped, "SILENTLY DROPPED — passed, but the component does not take it");

console.log(problems.length
  ? `\n${throws.length} would blank the screen, ${dropped.length} silently dropped`
  : `\nEvery component gets the props it reads — ${declared.size} checked ✓`);
// Only a crash fails the build. A dropped prop is worth seeing, not worth
// blocking on — there are legitimate reasons to pass one through in future.
process.exit(throws.length ? 1 : 0);
