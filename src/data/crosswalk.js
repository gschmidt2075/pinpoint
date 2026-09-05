// Turning an R&B IMS inventory export into Pinpoint's model.
//
// This is the ONE implementation. The Settings import runs it in the browser and
// `scripts/gen_inventory.mjs` runs it from the command line; there is no second
// copy to drift out of step with the first. It was Python once, which meant two
// versions of the same rules and no way to prove they agreed.
//
// Pure functions, no DOM and no filesystem: give it text, get back records.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE THING R&B CANNOT SAY
//
// R&B has one field where there should be two. `Comm Grp Alpha` answers both
// "what kind of thing is this" and "where is it", and it can only answer one at
// a time.
//
// So when an oil filter goes out to Kenesaw, the only move available is to
// REASSIGN its commodity group from `133 FILTERS` to `7 KENESAW SHED`. The
// filter arrives, and stops being a filter. That is why the Kenesaw list holds
// CAT fuel filters and carbide grader blades alongside its own air compressor.
//
// Pinpoint keeps the same group list and uses it twice:
//
//     item.categoryId   -> a group.      What it IS.  A transfer never changes it.
//     batch.location    -> a group CODE. Where it is. A transfer does change it.
//
// Day one they are identical for every item, so staff see the list they know.
//
// ─────────────────────────────────────────────────────────────────────────────
// COLUMNS
//
//   Inventory #        The part number — and often the SIZE. "18 X 20 ROUND"
//                      against a description of "New Annular Culvert". Kept as
//                      its own searchable field; nine culverts are otherwise
//                      identical.
//   Commodity Group    The group number, and a group's identity.
//   Comm Grp Alpha     Its name.
//
//   Inventory Usual    NOT USED. A copy of the group code on 74% of rows; where
//   Location           it differs it points at bare numbers that appear nowhere
//                      else and have no name. Greg's call, and the data agrees.
//
// Anything that cannot be carried over cleanly is FLAGGED, never guessed at.

const SEED_DATE = "2026-07-01";
const SEED_ISO  = "2026-07-01T00:00:00.000Z";

// ── CSV ──────────────────────────────────────────────────────────────────────
// Written out rather than pulled from a library because the rules are small and
// a dependency here would have to work in the browser and in node. Handles
// quoted fields, escaped quotes, and commas or newlines inside quotes — all of
// which appear in real exports.
//
// A double quote is only special at the START of a field. This matters: the R&B
// descriptions are full of inch marks — `A/C #705-0595 Stihl 36"`, `42" Fan` —
// and a parser that treats every quote as an opener swallows everything up to
// the next one. That silently merged rows and lost 1,093 of 2,375 records, with
// no error anywhere; the file simply came out shorter. Python's csv module has
// this rule, which is why the original crosswalk never hit it.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false, fieldStart = true;
  const s = String(text).replace(/^﻿/, "");   // strip a BOM if Excel added one

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }   // "" is one literal quote
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && fieldStart) { quoted = true; fieldStart = false; continue; }
    if (ch === ",")  { row.push(field); field = ""; fieldStart = true; continue; }
    if (ch === "\r") { continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; fieldStart = true; continue; }
    field += ch;
    fieldStart = false;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1)
    .filter(r => r.some(c => c.trim() !== ""))        // skip blank lines
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, records };
}

// ── Field cleaning ───────────────────────────────────────────────────────────
export const clean = (v) =>
  String(v ?? "")
    .replace(/ /g, " ")                       // non-breaking spaces
    // The class below is written with ESCAPES, not the characters themselves.
    // It used to hold a real NUL and a real DEL byte, which works but makes
    // the file binary to grep, to diffs and to anything that trims stray
    // control bytes on save. Same range, same behaviour, readable.
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")   // control characters
    .replace(/\s+/g, " ")
    .trim();

// Money and quantities. Accountants write negatives in brackets.
export function num(v) {
  let s = clean(v).replace(/\$/g, "").replace(/,/g, "");
  if (!s || s === "-" || s === ".") return 0;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

// The export writes EACH/QUART/GALLON; the app offered TON/CY/LF/EA. Nothing
// matched, so every dropdown fell back to its first option and the whole catalog
// displayed as TON. One vocabulary.
const UOM_ALIASES = {
  EACH:"EA", EA:"EA",
  QUART:"QT", QUARTS:"QT", QT:"QT",
  GALLON:"GAL", GALLONS:"GAL", GAL:"GAL",
  POUND:"LB", POUNDS:"LB", LB:"LB", LBS:"LB",
  OUNCE:"OZ", OUNCES:"OZ", OZ:"OZ",
  FOOT:"FT", FEET:"FT", FT:"FT",
  YARD:"YD", YARDS:"YD", YD:"YD",
  PAIR:"PR", PR:"PR",
  BAG:"BAG", "50LB BAG":"BAG",
  BLOCK:"BLOCK", SET:"SET", CY:"CY", TON:"TON", LF:"LF",
};
export const uomOf = (v) => {
  const c = clean(v).toUpperCase();
  return UOM_ALIASES[c] ?? c;
};

// ── Is a group a PLACE, or a KIND of thing? ──────────────────────────────────
// Used to pick a starting type, and to decide which group wins when a part
// number spans several. Every result is editable in Settings afterwards, which
// is the point of making it data rather than code.
const BUILDING_WORDS  = ["SHED", "FLOOR", "OFFICE"];
const STOCKPILE_WORDS = ["STOCKPILE", "CRUSHED", "RUN ROCK"];
const MACHINE_WORDS   = ["CAT ", "JOHN DEERE", "FREIGHTLINER", "FREIGHLINER", "CHEVY", "DODGE",
  "GMC", "KOMATSU", "WESTERN STAR", "GRADALL", "CASE", "LINK-BELT", "F150", "F250",
  "F350", "F450", "F550", "F650", "TRAILER", "SPORT TRAC", "RAM ", "NH ", "CIMLINE",
  "LOAD KING", "LOAD TRAIL", "DOOLITTLE", "STRIPER", "SIGN TRU", "INTERNATIONAL",
  "BOBCAT", "VOLVO", "MACK", "PETERBILT", "KENWORTH", "VERMEER", "BOMAG", "TYMCO"];

export function classifyGroup(name) {
  const u = String(name || "").toUpperCase();
  if (STOCKPILE_WORDS.some(w => u.includes(w))) return "stockpile";
  if (BUILDING_WORDS.some(w => u.includes(w)))  return "building";
  if (/^(19|20)\d\d\b/.test(name))              return "machine";
  if (MACHINE_WORDS.some(w => u.includes(w)))   return "machine";
  return "area";
}

const isPlace = (kind) => kind !== "area";

// ── Bulk fuel and shelf fluids ───────────────────────────────────────────────
//
// R&B carried three things in the inventory file that do not belong there as
// ordinary stock, and Greg settled both cases on 2026-09-05:
//
//   "Yes, the fuel should be tracked in the fuel module."
//   "One Item with as many batches as necessary."
//
// BULK FUEL. Every tank's contents were also inventory rows — $35,815 of diesel
// across eight rows matching the eight tanks. Left alone that is a double
// count: the Fuel module tracks the same gallons, and a gallon pumped draws the
// tank down while the inventory row sits still forever. These rows are routed
// OUT of the catalog and reported as tank opening balances instead.
//
// SHELF FLUIDS. DEF came across as five separate catalog items, one per shed,
// because R&B put the shed in the part number — DEF-26, DEF26-07, DEF26-08.
// That is the duplication the commodity-group model exists to remove: one item,
// a batch per place. So fluid rows are keyed by WHAT THEY ARE rather than by
// part number, and merge.
//
// These rules are vocabulary, not Adams County. No shed names, no part numbers,
// no unit numbers — a county whose file says "GASOLENE" or "UREA" gets the same
// treatment. Nothing is dropped silently: every routed row is counted in the
// summary and listed in the exceptions, so a rule that misfires is visible
// rather than a quietly missing item.
// ORDER MATTERS, and it caught me out: "Diesel Exhaust Fluid" contains the word
// diesel, so with diesel first it was routed to a tank instead of the shelf.
// DEF is therefore tested FIRST, and the diesel rule also excludes EXHAUST —
// two defences, because this is the kind of mistake that ends up as $500 of DEF
// silently added to a fuel tank's opening balance.
// Everything that has a fuel word in it and is NOT the fuel.
//
// The first version of this had only the obvious ones and it took twelve rows
// out of the county's catalog that had no business leaving it: 2,478 quarts of
// "Diesel Oil" — engine oil — and four BG chemicals, one of them at $216 a
// unit. Every entry below is a real row from the file.
const TANK_EXCLUDE =
  /\b(EXHAUST|OIL|LUBE|LUBRICANT|GREASE|CONDITION\w*|CLEANER|THAW|FLUSH|KIT|ADDITIVE|TREATMENT|STABILIZER|ANTI-?GEL|FILTER|CAP|NOZZLE|HOSE|GASKET|BREATHER|SEAL|SENDER|GAUGE|PUMP|TANK|METER|LINE|ELEMENT)\b/i;

// A gallon-ish unit of measure. Bulk fuel is bought and held by the gallon;
// oil is bought by the quart. Not proof on its own — one of the county's real
// fuel rows is recorded as EACH — but decisive alongside the description.
const GALLON_UOM = /^(GAL|GALLON|GALLONS|GA)$/i;

export const FLUID_RULES = [
  {
    id: "def", label: "DEF", disposition: "fluid", fluidType: "def",
    match:   /\bDEF\b|DIESEL\s+EXHAUST\s+FLUID|\bUREA\b/i,
    exclude: /\b(FILTER|CAP|HOSE|BREATHER|SUPPLY|GASKET|SEAL|SENDER|GAUGE|PUMP|HEATER|INJECTOR|SENSOR|LINE)\b/i,
  },
  {
    id: "diesel", label: "Diesel", disposition: "tank",
    match:   /\bDIESEL\b|\bDYED\s*(FUEL|DIESEL)\b/i,
    exclude: TANK_EXCLUDE,
  },
  {
    id: "unleaded", label: "Unleaded", disposition: "tank",
    match:   /\b(UNLEADED|GASOLINE|GASOLENE|PETROL)\b/i,
    exclude: TANK_EXCLUDE,
  },
];

// Which rule, if any, a row is. Exclusions win — "WIX DEF Filter" is a filter,
// and a filter is ordinary stock however the description reads.
export function fluidRuleFor(description, partNumber = "", unitOfMeasure = "", rules = FLUID_RULES) {
  const text = `${description || ""} ${partNumber || ""}`;
  const uom  = clean(unitOfMeasure);
  for (const r of rules) {
    if (r.exclude && r.exclude.test(text)) continue;
    if (!r.match.test(text)) continue;
    // Taking a row OUT of the catalog is the destructive direction — a part
    // wrongly routed to a tank simply vanishes from inventory. So a tank rule
    // has to clear a second bar: the row must say FUEL, or be measured in
    // gallons. "Diesel Oil Kenesaw", 420 QUART, satisfies neither.
    if (r.disposition === "tank" && !/\bFUEL\b/i.test(text) && !GALLON_UOM.test(uom)) continue;
    return r;
  }
  return null;
}

// Match Python's string ordering, so the CLI and the browser agree on ids.
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const commonest = (values) => {
  const c = new Map();
  for (const v of values) if (v) c.set(v, (c.get(v) || 0) + 1);
  let best = "", n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }   // first wins a tie
  return best;
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CROSSWALK
//
// Give it the records from parseCSV. Row numbers in exceptions are CSV line
// numbers — header is line 1 — so anything flagged can be found in R&B.
export function crosswalkInventory(records) {
  const exceptions = [];
  const stats = {};
  const flag = (csvRow, kind, detail, partNumber = "", description = "") => {
    exceptions.push({ csvRow, kind, detail, partNumber, description, resolved: false });
    stats[kind] = (stats[kind] || 0) + 1;
  };

  const missing = ["Inventory #", "Commodity Group", "Comm Grp Alpha", "Quan On Hand"]
    .filter(h => !records.length || !(h in records[0]));
  if (missing.length) {
    return { ok: false, error: `The file is missing these columns: ${missing.join(", ")}.`,
             items: [], batches: [], transactions: [], groups: [], exceptions: [], summary: null };
  }

  // ── Groups ─────────────────────────────────────────────────────────────────
  // A code can appear under two names. Take the majority; flag the rest.
  const namesFor = new Map();
  for (const r of records) {
    const code = clean(r["Commodity Group"]);
    if (!code) continue;
    if (!namesFor.has(code)) namesFor.set(code, new Map());
    const n = clean(r["Comm Grp Alpha"]);
    const m = namesFor.get(code);
    m.set(n, (m.get(n) || 0) + 1);
  }

  const groupName = new Map(), groupKind = new Map();
  for (const [code, names] of namesFor) {
    let major = "", best = 0;
    for (const [n, k] of names) if (k > best) { major = n; best = k; }
    groupName.set(code, major);
    groupKind.set(code, classifyGroup(major));
  }

  records.forEach((r, i) => {
    const code = clean(r["Commodity Group"]), name = clean(r["Comm Grp Alpha"]);
    if (code && name && name !== groupName.get(code))
      flag(i + 2, "Group code used under two names",
        `Row says '${name}' but group ${code} is '${groupName.get(code)}' on ` +
        `${namesFor.get(code).get(groupName.get(code))} other rows. Kept the majority.`,
        clean(r["Inventory #"]), clean(r["Inventory Description"]));
  });

  const groups = [], groupId = new Map();
  const codes = [...groupName.keys()].sort((a, b) => {
    const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
    if (na && nb) return Number(a) - Number(b);
    if (na) return -1;
    if (nb) return 1;
    return byString(a, b);
  });
  for (const code of codes) {
    const id = `grp-${code}`;
    groupId.set(code, id);
    const kind = groupKind.get(code);
    groups.push({
      id, code, name: groupName.get(code), type: kind, shelves: [],
      equipmentId: null, unitNumber: kind === "machine" ? groupName.get(code) : "",
      active: true, notes: "",
    });
  }

  // ── Items: ONE per part number, except for fuel and fluids ────────────────
  //
  // Bulk fuel leaves the catalog entirely and becomes a tank opening balance.
  // Fluids merge on WHAT THEY ARE rather than on part number, so DEF's five
  // shed rows become one item with five batches instead of five items.
  const byPart = new Map(), linesOf = new Map();
  const tankOpenings = [];
  const fluidKey = new Map();   // item key → the rule that made it

  records.forEach((r, i) => {
    const part = clean(r["Inventory #"]);
    const desc = clean(r["Inventory Description"]);
    if (!part) {
      flag(i + 2, "No part number",
        "Row has no Inventory #, so it cannot be merged or looked up. Skipped.",
        "", desc);
      return;
    }

    const rule = fluidRuleFor(desc, part, r["Unit Of Measure"]);

    // Bulk fuel — out of the catalog, into the Fuel module.
    if (rule && rule.disposition === "tank") {
      const qty = num(r["Quan On Hand"]);
      const val = num(r["Cost On Hand"]);
      const loc = clean(r["Commodity Group"]);
      tankOpenings.push({
        csvRow: i + 2, partNumber: part, description: desc,
        fuel: rule.id, location: loc, locationName: groupName.get(loc) || loc,
        gallons: qty, totalCost: round(val, 2),
        unitCost: qty > 0 ? round(val / qty, 4) : 0,
      });
      flag(i + 2, "Fuel — moved to the Fuel module",
        `${fmtNum(qty)} gallons of ${rule.label.toLowerCase()} carrying ${fmtMoney(val)} at ` +
        `${groupName.get(loc) || loc}. Kept OUT of inventory so the same gallons are not ` +
        `counted twice — set it as the tank's opening balance instead.`, part, desc);
      return;
    }

    const key = (rule && rule.disposition === "fluid") ? `FLUID:${rule.id}` : part.toUpperCase();
    if (rule && rule.disposition === "fluid") fluidKey.set(key, rule);
    if (!byPart.has(key)) { byPart.set(key, []); linesOf.set(key, []); }
    byPart.get(key).push(r);
    linesOf.get(key).push(i + 2);
  });

  const items = [], batches = [], transactions = [];
  const keys = [...byPart.keys()].sort(byString);

  keys.forEach((key, idx) => {
    const group = byPart.get(key), lines = linesOf.get(key), first = group[0];
    const rule = fluidKey.get(key) || null;
    // A merged fluid has several part numbers — R&B put the shed in them. Take
    // the commonest, which is the shop's, and keep the rest on the record.
    const part = rule ? (commonest(group.map(r => clean(r["Inventory #"]))) || clean(first["Inventory #"]))
                      : clean(first["Inventory #"]);
    const pick = (field) => commonest(group.map(r => clean(r[field])));

    const name   = pick("Inventory Description") || part;
    const gl     = pick("GL A/C #");
    const uom    = uomOf(pick("Unit Of Measure"));
    const vendor = pick("Vendor");

    // ── The category ─────────────────────────────────────────────────────────
    // Where a part number spans several groups, the one that is NOT a place is
    // what the thing actually is — the home copy the transfers came from.
    //
    //   CARBIDE BLADE 3'  Kenesaw · Holstein · Roseland · Pauline · GRADER BLADES
    //                     └─ transfers that already happened ──┘   └── home ──┘
    const codeCounts = new Map();
    for (const r of group) {
      const c = clean(r["Commodity Group"]);
      if (c) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
    }
    const homes = [...codeCounts.keys()].filter(c => !isPlace(groupKind.get(c) || "area"));
    let catCode = "";
    if (homes.length) {
      catCode = homes.reduce((a, b) => (codeCounts.get(b) > codeCounts.get(a) ? b : a));
      if (codeCounts.size > 1) stats["category recovered from a home group"] =
        (stats["category recovered from a home group"] || 0) + 1;
    } else if (codeCounts.size) {
      catCode = [...codeCounts.keys()].reduce((a, b) => (codeCounts.get(b) > codeCounts.get(a) ? b : a));
      if (codeCounts.size > 1)
        // Every group it has ever been in is a place, so R&B has lost what it is.
        flag(lines[0], "Category cannot be recovered",
          `Only ever seen in place groups (${[...codeCounts.keys()].map(c => groupName.get(c)).join(", ")}). ` +
          `Using ${groupName.get(catCode)}.`, part, name);
    } else {
      flag(lines[0], "No commodity group", "Row has no group at all.", part, name);
    }

    if (group.length > 1) {
      stats["part numbers held in several places"] = (stats["part numbers held in several places"] || 0) + 1;
      for (const [field, label] of [["Inventory Description", "description"], ["GL A/C #", "GL code"]]) {
        const vals = [...new Set(group.map(r => clean(r[field])).filter(Boolean))];
        if (vals.length > 1)
          flag(lines[0], `Rows disagree on ${label}`,
            `${list(vals.sort(byString))} — kept ${quote(pick(field))}.`, part, name);
      }
    }

    const itemId = `inv-${String(idx + 1).padStart(4, "0")}`;
    items.push({
      id: itemId, partNumber: part, legacyNumber: part, name,
      description: clean(first["Desc"]),
      categoryId: groupId.get(catCode) || "",
      commodityGroup: groupName.get(catCode) || "",
      glAccountCode: gl, unitOfMeasure: uom,
      fitsEquipment: [], shelfLocation: "",
      // Set by a fluid rule: this item is logged at the machine on the fuel
      // screen rather than issued at a counter. The container size cannot be
      // read from an R&B export, so it is flagged for somebody to enter.
      fluidType: rule ? (rule.fluidType || "") : "",
      unitGallons: 0,
      standardCost: round(num(pick("Standard Cost")), 2),
      primaryVendor: vendor, receivingMode: "standard",
      trackStockLevel: false, minimumQuantity: 0, active: true,
      notes: clean(first["Memo Inventory"]), createdAt: SEED_ISO,
    });
    if (!gl)  flag(lines[0], "No GL code", "Nothing to charge a purchase to.", part, name);
    if (!uom) flag(lines[0], "No unit of measure", "Quantities have no unit.", part, name);

    if (rule) {
      const parts = [...new Set(group.map(r => clean(r["Inventory #"])).filter(Boolean))].sort(byString);
      const uoms  = [...new Set(group.map(r => uomOf(r["Unit Of Measure"])).filter(Boolean))].sort(byString);
      stats["fluids merged onto one item"] = (stats["fluids merged onto one item"] || 0) + 1;
      if (parts.length > 1)
        flag(lines[0], "Fluid merged from several part numbers",
          `${list(parts)} are all ${quote(name)} at different places. Merged into one item with ` +
          `${group.length} opening balances — one per shed — and kept ${quote(part)} as the number.`,
          part, name);
      if (uoms.length > 1)
        flag(lines[0], "Fluid rows disagree on unit of measure",
          `${list(uoms)} across the same fluid, at similar prices, so at least one is wrong. ` +
          `Kept ${quote(uom)}.`, part, name);
      flag(lines[0], "Container size needed",
        `${quote(name)} is logged on the fuel screen a container at a time. Open the item and ` +
        `enter how many gallons ONE container holds, or its cost per gallon will be wrong.`,
        part, name);
    }

    // ── One opening batch per row — that is one per LOCATION ──────────────────
    group.forEach((r, j) => {
      const n = lines[j];
      const qty = num(r["Quan On Hand"]);
      const onHand = num(r["Cost On Hand"]);
      const loc = clean(r["Commodity Group"]);
      const where = groupName.get(loc) || loc;

      if (qty < 0) {
        flag(n, "Negative quantity",
          `${fmtNum(qty)} on hand carrying ${fmtMoney(onHand)} at ${where}. No opening balance created.`,
          part, name);
        return;
      }
      if (qty === 0) {
        if (onHand)
          flag(n, "Value with no quantity",
            `${fmtMoney(onHand)} of value against zero quantity at ${where}. No opening balance created.`,
            part, name);
        return;
      }

      const unitCost = onHand ? onHand / qty
        : (num(r["Avg Hist Cost Per Unit"]) || num(r["Standard Cost"]));
      const b = batches.length + 1;
      const batchId = `bat-${String(b).padStart(4, "0")}`;
      // The legacy figure verbatim, so the opening value ties to R&B exactly
      // rather than drifting a cent per line.
      const total = round(onHand ? onHand : qty * unitCost, 2);

      batches.push({
        id: batchId, itemId, itemName: name,
        receiptDate: SEED_DATE, receiptRef: "CROSSWALK",
        location: loc, shelf: "",
        quantityReceived: qty, quantityRemaining: qty,
        unitCost: round(unitCost, 4), totalCost: total,
        vendorName: clean(r["Vendor"]),
        invoiceStatus: "final", invoiceRef: "", status: "open",
        notes: "Opening balance crosswalk", createdAt: SEED_ISO,
      });
      transactions.push({
        id: `tx-${String(b).padStart(4, "0")}`, type: "crosswalk", date: SEED_DATE,
        itemId, itemName: name, vendorName: clean(r["Vendor"]),
        quantity: qty, unitOfMeasure: uom, unitCost: round(unitCost, 4),
        totalCost: total, location: loc, batchId,
        notes: "Opening balance crosswalk", createdAt: SEED_ISO,
      });
    });
  });

  exceptions.sort((a, b) => byString(a.kind, b.kind) || a.csvRow - b.csvRow);
  exceptions.forEach((e, i) => { e.id = `exc-${String(i + 1).padStart(4, "0")}`; });

  const typeCounts = {};
  for (const g of groups) typeCounts[g.type] = (typeCounts[g.type] || 0) + 1;

  return {
    ok: true, error: "", items, batches, transactions, groups, exceptions, tankOpenings,
    summary: {
      rows: records.length,
      items: items.length,
      merged: records.length - items.length,
      batches: batches.length,
      groups: groups.length,
      typeCounts,
      openingValue: round(batches.reduce((s, b) => s + b.totalCost, 0), 2),
      // Reported separately and NOT added to openingValue — it is the same
      // money the Fuel module will be holding, and adding it here is the double
      // count this routing exists to prevent.
      tankOpenings: tankOpenings.length,
      tankOpeningGallons: round(tankOpenings.reduce((s, t) => s + t.gallons, 0), 1),
      tankOpeningValue: round(tankOpenings.reduce((s, t) => s + t.totalCost, 0), 2),
      exceptions: exceptions.length,
      exceptionKinds: countBy(exceptions.map(e => e.kind)),
      stats,
    },
  };
}

// Rounding, the way a person reading the number would do it.
//
// `Math.round(v * 100) / 100` is the obvious version and it is wrong on the
// halfway cases: 1.295 is not really 1.295 in binary, it is 1.29499999999…, and
// multiplying by 100 first turns that into 129.49999999999997, which then
// rounds UP to 1.30. `toFixed` rounds the decimal value the double actually
// holds, and lands on 1.29.
//
// This is not pedantry. Eight of the 2,209 opening batches sit exactly on a
// halfway case, and getting them wrong meant this port disagreed with the
// crosswalk it was replacing — which is exactly the kind of quiet difference
// that makes two systems impossible to reconcile later.
function round(v, places) {
  const n = Number(v) || 0;
  const neg = n < 0;
  const text = String(Math.abs(n));
  const dot = text.indexOf(".");
  const decimals = dot < 0 ? 0 : text.length - dot - 1;

  // A TRUE half — one digit past the target, ending in 5, and exactly
  // representable in binary — rounds to the nearest even digit. 16.125 is
  // 16 + 1/8, so it is exact, and the original crosswalk gave 16.12.
  //
  // 6.77625 looks identical but is NOT exact: the double actually holds
  // 6.7762500000000001…, which is above the half and rounds up to 6.7763.
  // Testing by multiplying by 10^places would manufacture a half that was
  // never there — that is precisely the mistake this guards against.
  //
  // A decimal with p places is exact in binary only when its digits divide by
  // 5^p, which is cheap to check with integers.
  if (decimals === places + 1 && text.endsWith("5") && !text.includes("e")) {
    const digits = BigInt(text.replace(".", ""));
    if (digits % (5n ** BigInt(decimals)) === 0n) {
      const f = 10 ** places;
      const down = Math.floor(Math.abs(n) * f);
      const out = (down % 2 === 0 ? down : down + 1) / f;
      return neg ? -out : out;
    }
  }
  return Number(n.toFixed(places));
}

const quote = (v) => {
  const s = String(v);
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
};
const list  = (vs) => `[${vs.map(quote).join(", ")}]`;

const fmtNum = (n) =>
  Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(12)));

const fmtMoney = (n) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function countBy(list) {
  const m = {};
  for (const v of list) m[v] = (m[v] || 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}
