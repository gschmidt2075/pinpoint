// Are React's hooks called only where they are allowed?
//
//     node scripts/check-hooks.mjs
//
// A hook called from a plain helper — not a component, not another hook — is a
// runtime crash, and none of the other checks here can see it. `check-props`
// looks at call shapes, `parse-check` at syntax; both were perfectly happy with
// a `useNavigationGuard()` sitting inside `certAlerts()`, which is an ordinary
// function called from ordinary code.
//
// eslint-plugin-react-hooks was already in the project and already configured.
// It just was not being run. This runs the one rule that turns a mistake into a
// white screen, and ignores the style rules that would drown it in noise.
import { ESLint } from "eslint";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    files: ["**/*.{js,jsx}"],
    plugins: { "react-hooks": (await import("eslint-plugin-react-hooks")).default },
    languageOptions: { ecmaVersion: "latest", sourceType: "module",
                       parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
});

const results = await eslint.lintFiles(["src"]);
const problems = results.flatMap(r =>
  r.messages.map(m => ({ file: r.filePath.replace(process.cwd() + "/", ""), ...m })));

for (const p of problems)
  console.log(`  ${p.file}:${p.line}  ${p.message}`);

console.log(problems.length
  ? `\n${problems.length} hook(s) called somewhere React will not allow`
  : `\nEvery hook is called from a component or another hook ✓`);
process.exit(problems.length ? 1 : 0);
