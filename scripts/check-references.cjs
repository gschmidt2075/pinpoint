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
console.log(problems ? `\n${problems} unresolved identifier(s)` : `\nNo unresolved identifiers across ${files.length} files ✓`);
