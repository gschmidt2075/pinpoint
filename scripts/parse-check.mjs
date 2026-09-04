// Parse every source file with a real JSX parser.
//
// `npm run build` needs platform-native binaries, so it cannot run everywhere
// this project is worked on. This can: acorn + acorn-jsx is pure JavaScript and
// catches the whole class of mistakes that produce a white screen — an unclosed
// tag, a stray brace, a duplicated import — without needing a toolchain.
//
// It also flags the comma operator used as a call argument — `f((a, b))` — which
// parses perfectly and silently passes the wrong thing.
//
// It does NOT type-check or resolve imports. scripts/check-references.cjs does
// that, and check-props.mjs checks component props. Run all of them.
import { Parser } from "acorn";
import jsx from "acorn-jsx";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const P = Parser.extend(jsx());
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules") walk(p); }
    else if (/\.(jsx?|mjs)$/.test(e)) files.push(p);
  }
})("src");

// Visit every node. Small enough not to need acorn-walk.
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === "string") visit(node);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
    walk(node[k], visit);
  }
}

let bad = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let ast;
  try {
    ast = P.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    bad++;
    console.log(`  ${f}:${src.slice(0, err.pos).split("\n").length}  ${err.message}`);
    continue;
  }

  // A comma operator as a call argument — `f((a, b))` instead of `f(a, b)`.
  //
  // This is valid JavaScript and parses fine, which is exactly the problem:
  // `(a, b)` evaluates `a`, throws it away, and passes `b`. One stray pair of
  // brackets silently changes which argument the function receives.
  //
  // It came from a careless find-and-replace turning `label(lookup(code, list))`
  // into `name((code, list))`. Seven call sites then passed the whole list where
  // a code belonged, and the screen filled with "[object Object],[object Object]".
  // Nobody writes this on purpose.
  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    for (const arg of n.arguments) {
      if (arg.type !== "SequenceExpression") continue;
      bad++;
      const line = src.slice(0, arg.start).split("\n").length;
      const fn = src.slice(n.callee.start, n.callee.end);
      console.log(`  ${f}:${line}  ${fn}((a, b)) — comma operator in an argument.`);
      console.log(`      This passes only the last value. Did you mean ${fn}(a, b)?`);
    }
  });
}
console.log(bad
  ? `\n${bad} problem(s) found`
  : `\nAll ${files.length} files parse cleanly ✓`);
process.exit(bad ? 1 : 0);
