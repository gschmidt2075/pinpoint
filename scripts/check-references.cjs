// scripts/check-references.cjs — run with:  node scripts/check-references.cjs
//
// Real scope analysis: every identifier that is READ but never bound anywhere
// in its scope chain and not imported. This is what my regex check could not do,
// and it is the class of bug that builds fine and then renders a blank page.
//
// Written after splitting Equipment.jsx: the build passed, every import
// resolved, and the Equipment tab was blank — because Fleet.jsx CALLED
// pmDueList without importing it. Vite does not care; it only fails on a
// missing MODULE, not a missing name. The browser cares, at render time.
//
// This is not a substitute for npm run build or for opening the app. It catches
// one specific thing that neither of those catches early.
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const fs = require("fs"), path = require("path");

const GLOBALS = new Set(["console","window","document","Math","JSON","Object","Array","String",
 "Number","Boolean","Date","Set","Map","Promise","parseFloat","parseInt","isNaN","isFinite",
 "setTimeout","clearTimeout","setInterval","clearInterval","URL","Blob","Intl","RegExp","Error",
 "undefined","NaN","Infinity","React","globalThis","structuredClone","alert","confirm","localStorage","requestAnimationFrame"]);

const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const f = path.join(d,e.name);
  if (e.isDirectory()) walk(f); else if (/\.jsx?$/.test(e.name)) files.push(f);
}})("src");

let problems = 0;
for (const f of files) {
  const code = fs.readFileSync(f,"utf8");
  let ast; try { ast = parser.parse(code,{sourceType:"module",plugins:["jsx"]}); }
  catch(e){ console.log(`PARSE FAIL ${f}: ${e.message}`); problems++; continue; }
  traverse(ast, {
    Program(p) {
      const seen = new Set();
      p.traverse({
        ReferencedIdentifier(id) {
          const name = id.node.name;
          if (GLOBALS.has(name) || seen.has(name)) return;
          if (id.scope.hasBinding(name, true)) return;
          seen.add(name);
          console.log(`  ${f}  →  ${name}  (line ${id.node.loc.start.line})`);
          problems++;
        },
      });
    },
  });
}
// ── Do imports resolve to real exports? ───────────────────────────────────────
//
// The check above finds names used but never bound INSIDE a file. This one
// finds the other half: a file importing something its neighbour does not
// actually export. Vite catches this, but only at build time, and I have no
// build here — so it has to be checked directly or it reaches Greg.
//
// It reached him once: FuelBilling was extracted into its own file without the
// export keyword, and the first thing he saw was a failed build.
function exportsOf(file) {
  const code = fs.readFileSync(file, "utf8");
  let ast; try { ast = parser.parse(code, { sourceType:"module", plugins:["jsx"] }); }
  catch { return { names:new Set(), hasDefault:false }; }
  const names = new Set(); let hasDefault = false;
  for (const node of ast.program.body) {
    if (node.type === "ExportDefaultDeclaration") hasDefault = true;
    else if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        const d = node.declaration;
        if (d.id?.name) names.add(d.id.name);
        for (const decl of d.declarations || []) if (decl.id?.name) names.add(decl.id.name);
      }
      for (const sp of node.specifiers || []) names.add(sp.exported?.name || sp.local?.name);
    } else if (node.type === "ExportAllDeclaration") names.add("*");
  }
  return { names, hasDefault };
}

const resolve = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".js", base + ".jsx",
                   path.join(base, "index.js"), path.join(base, "index.jsx")])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};

let importProblems = 0;
for (const f of files) {
  let ast; try { ast = parser.parse(fs.readFileSync(f,"utf8"), { sourceType:"module", plugins:["jsx"] }); }
  catch { continue; }
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration") continue;
    const spec = node.source.value;
    if (!spec.startsWith(".")) continue;
    const target = resolve(f, spec);
    if (!target) {
      console.log(`  ${f}  →  cannot resolve "${spec}" (line ${node.loc.start.line})`);
      importProblems++; continue;
    }
    const { names, hasDefault } = exportsOf(target);
    if (names.has("*")) continue;
    for (const sp of node.specifiers) {
      if (sp.type === "ImportDefaultSpecifier") {
        if (!hasDefault) {
          console.log(`  ${f}  →  ${path.basename(target)} has no default export (line ${node.loc.start.line})`);
          importProblems++;
        }
      } else if (sp.type === "ImportSpecifier") {
        const want = sp.imported.name;
        if (!names.has(want)) {
          console.log(`  ${f}  →  ${want} is not exported by ${path.basename(target)} (line ${node.loc.start.line})`);
          importProblems++;
        }
      }
    }
  }
}

const total = problems + importProblems;
console.log(total
  ? `\n${problems} unresolved identifier(s), ${importProblems} bad import(s)`
  : `\nClean across ${files.length} files — no unresolved names, every import resolves to a real export ✓`);
process.exit(total ? 1 : 0);
