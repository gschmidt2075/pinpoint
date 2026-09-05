// Does every identifier a file uses actually exist WHERE IT IS USED?
//
//     node scripts/check-scope.cjs
//
// The gap this fills: `npm run check` proves every file PARSES and every
// IMPORT resolves, but not that a name used inside a function was declared in
// a scope that function can see. A bulk edit that deletes a `const` and leaves
// a use behind passes every other check and produces a blank screen with a
// ReferenceError in the console. That has now happened three times.
//
// The first version of this compared against every name declared ANYWHERE in
// the file, which is not good enough: `defItems` deleted from one component was
// still a prop of a sibling component, so the file looked fine. It has to
// follow scopes.
//
// Function scopes only, not block scopes. A `const` inside an `if` is treated
// as visible throughout its function — slightly permissive, but this is looking
// for names that do not exist at all, not for temporal-dead-zone subtleties,
// and permissive means no false alarms to learn to ignore.

const fs = require("fs");
const path = require("path");
const { Parser } = require("acorn");
const jsx = require("acorn-jsx");
const JSXParser = Parser.extend(jsx());

const GLOBALS = new Set([
  "window","document","console","Math","JSON","Object","Array","String","Number","Boolean",
  "Date","Set","Map","WeakSet","WeakMap","Symbol","Promise","RegExp","Error","TypeError",
  "parseInt","parseFloat","isNaN","isFinite","setTimeout","clearTimeout","setInterval",
  "clearInterval","localStorage","sessionStorage","navigator","location","alert","confirm",
  "prompt","fetch","Blob","URL","URLSearchParams","FileReader","File","Intl","BigInt",
  "undefined","NaN","Infinity","globalThis","structuredClone","crypto","performance",
  "requestAnimationFrame","cancelAnimationFrame","React","process","arguments","module",
  "require","exports","__dirname","__filename","TextEncoder","TextDecoder","AbortController",
  "Event","CustomEvent","Image","HTMLElement","Node","MutationObserver","ResizeObserver",
]);

const files = [];
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(p);
  }
})("src");

const isFn = (n) => n && (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" ||
                          n.type === "ArrowFunctionExpression");

let problems = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = JSXParser.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (err) {
    console.log(`\n  ${file}  DOES NOT PARSE — ${err.message}`);
    problems++;
    continue;
  }

  const found = [];

  const declare = (scope, node) => {
    if (!node) return;
    switch (node.type) {
      case "Identifier": scope.add(node.name); break;
      case "ObjectPattern":
        for (const p of node.properties)
          declare(scope, p.type === "RestElement" ? p.argument : p.value);
        break;
      case "ArrayPattern":  node.elements.forEach(el => declare(scope, el)); break;
      case "AssignmentPattern": declare(scope, node.left); break;
      case "RestElement":   declare(scope, node.argument); break;
    }
  };

  // Everything declared in this function body, not descending into nested
  // functions — those get their own scope.
  const collectDecls = (node, scope) => {
    const visit = (n) => {
      if (!n || typeof n.type !== "string") return;
      if (n.type === "VariableDeclaration") n.declarations.forEach(d => declare(scope, d.id));
      else if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") {
        if (n.id) scope.add(n.id.name);
        return;                                   // do not walk its body
      }
      else if (n.type === "CatchClause") declare(scope, n.param);
      else if (n.type === "ImportDeclaration") n.specifiers.forEach(s => scope.add(s.local.name));
      if (isFn(n) && n !== node) return;           // nested function — stop
      for (const k of Object.keys(n)) {
        if (k === "loc" || k === "start" || k === "end") continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === "object" && typeof v.type === "string") visit(v);
      }
    };
    if (node.type === "Program") node.body.forEach(visit);
    else if (node.body) visit(node.body);
  };

  const walkScope = (node, chain) => {
    const visit = (n, chain) => {
      if (!n || typeof n.type !== "string") return;

      if (isFn(n)) {
        const scope = new Set();
        (n.params || []).forEach(p => declare(scope, p));
        if (n.id) scope.add(n.id.name);
        collectDecls(n, scope);
        const next = [...chain, scope];
        // Default values in the parameter list can reference earlier params.
        (n.params || []).forEach(p => {
          if (p.type === "AssignmentPattern") visit(p.right, next);
        });
        if (n.body) visit(n.body, next);
        return;
      }

      // Names that are not references to anything in this file.
      if (n.type === "MemberExpression") {
        visit(n.object, chain);
        if (n.computed) visit(n.property, chain);
        return;
      }
      if (n.type === "Property" && !n.computed) {
        if (n.computed) visit(n.key, chain);
        visit(n.value, chain);
        return;
      }
      if (n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration") return;
      if (n.type === "ExportNamedDeclaration" && n.source) return;
      if (n.type === "JSXAttribute") { visit(n.value, chain); return; }
      if (n.type === "JSXMemberExpression") { visit(n.object, chain); return; }
      if (n.type === "LabeledStatement") { visit(n.body, chain); return; }
      if (n.type === "VariableDeclarator") { visit(n.init, chain); return; }

      const check = (name, line) => {
        if (GLOBALS.has(name)) return;
        for (const s of chain) if (s.has(name)) return;
        found.push({ name, line });
      };

      if (n.type === "Identifier") { check(n.name, n.loc.start.line); return; }
      // A COMPONENT used in JSX is a real use — <DEFTab /> with no import is a
      // blank screen, and JSX tag names are their own node type so the plain
      // Identifier walk never sees them. Lowercase tags are html.
      if (n.type === "JSXIdentifier") {
        if (/^[A-Z]/.test(n.name)) check(n.name, n.loc.start.line);
        return;
      }

      for (const k of Object.keys(n)) {
        if (k === "loc" || k === "start" || k === "end") continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(c => visit(c, chain));
        else if (v && typeof v === "object" && typeof v.type === "string") visit(v, chain);
      }
    };

    const top = new Set();
    collectDecls(node, top);
    node.body.forEach(b => visit(b, [top]));
  };

  walkScope(ast, []);

  if (found.length) {
    const seen = new Set();
    console.log(`\n  ${file}`);
    for (const f of found) {
      const key = `${f.name}:${f.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    line ${String(f.line).padStart(4)}  "${f.name}" is not declared in any scope that reaches here`);
      problems++;
    }
  }
}

console.log(problems
  ? `\n${problems} name${problems === 1 ? "" : "s"} used that do not exist where they are used — this is what a blank screen looks like\n`
  : `\nEvery name resolves in the scope that uses it, across ${files.length} files ✓\n`);
process.exit(problems ? 1 : 0);
