// Regenerate src/data/inventoryData.js from an R&B export.
//
//     node scripts/gen_inventory.mjs path/to/Inventory.csv
//
// The rules live in src/data/crosswalk.js, which is the SAME module the in-app
// import in Settings runs. This file only reads a file and writes one; it holds
// no crosswalk logic of its own, so the command line and the browser cannot
// disagree.
//
// This replaces scripts/gen_inventory.py. Two implementations of the same rules
// was one too many — nothing proved they agreed, and the Python could only be
// run by someone with a checkout.
import { readFileSync, writeFileSync } from "node:fs";
import { parseCSV, crosswalkInventory } from "../src/data/crosswalk.js";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/gen_inventory.mjs path/to/Inventory.csv");
  process.exit(1);
}

const { records } = parseCSV(readFileSync(src, "utf8"));
console.log(`Read ${records.length} rows from ${src}`);

const out = crosswalkInventory(records);
if (!out.ok) { console.error(out.error); process.exit(1); }

// Readable output, so a diff is reviewable.
const js = (rows, name) => {
  const lines = [`export const ${name} = [`];
  for (const r of rows) {
    lines.push("  {");
    const entries = Object.entries(r);
    entries.forEach(([k, v], i) =>
      lines.push(`    ${k}: ${JSON.stringify(v)}${i < entries.length - 1 ? "," : ""}`));
    lines.push("  },");
  }
  lines.push("];");
  return lines.join("\n");
};

const header =
  "// AUTO-GENERATED — do not edit by hand.\n" +
  "// Re-run: node scripts/gen_inventory.mjs path/to/Inventory.csv\n" +
  `// Source: ${src.split(/[\\/]/).pop()}\n` +
  "//\n" +
  "// The rules live in src/data/crosswalk.js — the same module Settings uses for\n" +
  "// the in-app import, so this file and a county's own import cannot disagree.\n" +
  "//\n" +
  "// ONE LIST of commodity groups, used twice: an item's categoryId points at a\n" +
  "// group (what it IS), a batch's location holds a group code (where it is).\n\n";

writeFileSync("src/data/inventoryData.js",
  header +
  js(out.items,        "INITIAL_INVENTORY_ITEMS") + "\n\n" +
  js(out.batches,      "INITIAL_INVENTORY_BATCHES") + "\n\n" +
  js(out.transactions, "INITIAL_INVENTORY_TRANSACTIONS") + "\n\n" +
  js(out.groups,       "INITIAL_INVENTORY_GROUPS") + "\n\n" +
  js(out.exceptions,   "INVENTORY_EXCEPTIONS") + "\n",
  "utf8");

const s = out.summary;
console.log(`\nWrote ${s.items} items (from ${s.rows} rows), ${s.batches} opening batches`);
console.log(`  ${s.groups} groups — ` +
  Object.entries(s.typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", "));
console.log(`  opening value: $${s.openingValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`\n${s.exceptions} exceptions flagged for review:`);
for (const [kind, n] of Object.entries(s.exceptionKinds)) console.log(`  ${String(n).padStart(4)}  ${kind}`);
