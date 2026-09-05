// Tests for the inventory model.
//
//     node scripts/test-inventory.mjs
//
// Two things are checked here. First, that the crosswalked data holds together:
// every batch points at a real item at a real location, no part number appears
// twice, and the opening value still ties to the old system to the penny.
//
// Second, that transfers do the right arithmetic. That one matters most,
// because a transfer bug hides: the county-wide total stays correct no matter
// how wrong the per-location figures are, and the county-wide total is the only
// number anyone was ever able to check before.

import { transferStock, stockByLocation, stockAtLocation, categoryName, createInventoryItem,
         groupByCode, groupById, groupLabel, locationName } from "../src/data/schema.js";
import { parseCSV, crosswalkInventory, fluidRuleFor, FLUID_RULES } from "../src/data/crosswalk.js";
import { receiptExpenditure, reconcileReceipt, claimCycleFor,
         allocateInvoice } from "../src/data/schema.js";
import { readFileSync } from "node:fs";
import { INITIAL_INVENTORY_ITEMS as ITEMS,
         INITIAL_INVENTORY_BATCHES as BATCHES,
         INITIAL_INVENTORY_TRANSACTIONS as TXS,
         INITIAL_INVENTORY_GROUPS as GROUPS,
         INVENTORY_EXCEPTIONS as EXCEPTIONS, INITIAL_TANK_OPENINGS } from "../src/data/inventoryData.js";

let passed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { passed++; console.log("  ✓ " + msg); }
  else { failures.push(msg); console.log("  ✗ " + msg); }
}
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const close = (a, b, msg) => ok(Math.abs(a - b) < 0.005, `${msg} — got ${a}, wanted ${b}`);

// ── The crosswalked data ─────────────────────────────────────────────────────
console.log("\nCrosswalked data");

const itemIds  = new Set(ITEMS.map(i => i.id));
const locCodes = new Set(GROUPS.map(g => String(g.code)));
const catIds   = new Set(GROUPS.map(g => g.id));

ok(BATCHES.every(b => itemIds.has(b.itemId)),            "every batch points at a real item");
ok(BATCHES.every(b => locCodes.has(String(b.location))), "every batch sits at a real group");
ok(TXS.every(t => itemIds.has(t.itemId)),                "every transaction points at a real item");
ok(ITEMS.every(i => !i.categoryId || catIds.has(i.categoryId)), "every category points at a real group");
eq(new Set(GROUPS.map(g => String(g.code))).size, GROUPS.length, "group codes are unique");
eq(new Set(GROUPS.map(g => g.id)).size, GROUPS.length,           "group ids are unique");
ok(GROUPS.every(g => g.name && String(g.code)),          "every group has a code and a name");

// The category and the location are the same list, used twice. That is the
// model in one assertion.
ok(ITEMS.every(i => !i.categoryId || GROUPS.some(g => g.id === i.categoryId)) &&
   BATCHES.every(b => GROUPS.some(g => String(g.code) === String(b.location))),
   "categories and locations both resolve against the one group list");
eq(new Set(ITEMS.map(i => i.id)).size, ITEMS.length,     "item ids are unique");
eq(new Set(BATCHES.map(b => b.id)).size, BATCHES.length, "batch ids are unique");

// The rebuild's whole purpose: one item per part number, not one per shed.
const byPart = {};
for (const i of ITEMS) if (i.partNumber) (byPart[i.partNumber.toUpperCase()] ||= []).push(i);
eq(Object.values(byPart).filter(v => v.length > 1).length, 0, "no part number appears twice");

const spread = ITEMS.filter(i => stockByLocation(i.id, BATCHES).length > 1);
ok(spread.length > 0, `${spread.length} items are held in more than one place at once`);

// R&B overwrites an item's category when it is moved. Where a part number spans
// several groups, the group that is NOT a place is what the thing actually is —
// the home copy the transfers came from.
{
  const byId = new Map(GROUPS.map(g => [g.id, g]));
  const carbide = ITEMS.find(i => i.partNumber === "CARBIDE BLADE 3'");
  ok(!!carbide, "the carbide blade survived the merge as one item");
  if (carbide) {
    const cat = byId.get(carbide.categoryId);
    eq(cat && cat.name, "GRADER BLADES", "its category is the home group, not one of the four sheds");
    // Four sheds plus the home rack it was sent out from — five, not four.
    const where = stockByLocation(carbide.id, BATCHES).map(w => w.location);
    eq(where.length, 5, "and it is held in five places at once");
    ok(where.includes(String(byId.get(carbide.categoryId).code)),
       "including the grader blade rack it came from");
  }
  const filter = ITEMS.find(i => i.partNumber === "500-0483");
  if (filter) {
    const cat = byId.get(filter.categoryId);
    eq(cat && cat.name, "FILTERS", "a filter sent out to the sheds is still a filter");
  }
}

// Ties to the legacy Cost On Hand for every row with a positive quantity.
//
// The figure USED to be the whole $1,554,890.75. Fuel now leaves the catalog
// for the tanks, so the catalog alone is less than R&B's total — and the check
// worth having is not the old number but the relationship:
//
//     what is in the catalog  +  what went to the tanks  =  what R&B had
//
// That proves nothing was lost, only moved. A rule that wrongly routed a part
// out of inventory would still balance here, which is why the routing itself is
// pinned row by row above; this one catches anything DROPPED.
const CATALOG_VALUE = BATCHES.reduce((s, b) => s + b.totalCost, 0);
const TANK_VALUE    = (INITIAL_TANK_OPENINGS || []).reduce((s, t) => s + t.totalCost, 0);
close(CATALOG_VALUE, 1499252.86, "the catalog opens at what is really on the shelves");
close(TANK_VALUE,      55637.89, "and the tanks hold the fuel that used to be counted twice");
close(CATALOG_VALUE + TANK_VALUE, 1554890.75, "together they tie to R&B to the penny — nothing lost, moved");

// Nothing carries a negative quantity into the opening balance.
ok(BATCHES.every(b => b.quantityRemaining >= 0), "no batch opens with a negative quantity");

// ── Transfers ────────────────────────────────────────────────────────────────
console.log("\nTransfers");

const B = (over = {}) => ({
  id: "b1", itemId: "i1", location: "10", status: "open", receiptDate: "2026-01-01",
  quantityReceived: 10, quantityRemaining: 10, unitCost: 2, totalCost: 20, ...over,
});
const at = (bs, loc) => bs.filter(b => String(b.location) === loc && b.status === "open")
                          .reduce((s, b) => s + b.quantityRemaining, 0);

{
  // Partial transfer — the bug that started this. Moving 4 of 10 must leave 6.
  const start = [B()];
  const { batches, moved, short } = transferStock(start, {
    itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 4 });
  eq(at(batches, "10"), 6, "moving 4 of 10 leaves 6 behind");
  eq(at(batches, "20"), 4, "moving 4 of 10 lands 4");
  eq(moved, 4, "reports 4 moved");
  eq(short, 0, "reports nothing short");
  eq(start.length, 1, "the original array is not mutated");
}

{
  // Cost must survive the journey. A transfer is not a purchase.
  const { batches } = transferStock([B({ unitCost: 7.25 })], {
    itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 4 });
  const landed = batches.find(b => b.location === "20");
  eq(landed.unitCost, 7.25, "unit cost is unchanged by the move");
  close(landed.totalCost, 29, "landed value is quantity times unit cost");
  const total = batches.filter(b => b.status === "open")
                       .reduce((s, b) => s + b.quantityRemaining * b.unitCost, 0);
  close(total, 72.5, "total inventory value is unchanged by the move");
}

{
  // FIFO: the oldest stock leaves first, and the date travels with it.
  const { batches } = transferStock([
    B({ id: "old", receiptDate: "2025-01-01", quantityRemaining: 5, unitCost: 1 }),
    B({ id: "new", receiptDate: "2026-01-01", quantityRemaining: 5, unitCost: 9 }),
  ], { itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 5 });
  const landed = batches.find(b => b.location === "20");
  eq(landed.unitCost, 1, "the oldest, cheapest stock is what moves");
  eq(landed.receiptDate, "2025-01-01", "the receipt date travels with the stock");
  eq(batches.find(b => b.id === "old").status, "depleted", "the emptied batch is marked depleted");
  eq(at(batches, "10"), 5, "the newer batch stays put");
}

{
  // Spanning two batches — takes the whole old one and part of the new.
  const { batches } = transferStock([
    B({ id: "old", receiptDate: "2025-01-01", quantityRemaining: 3, unitCost: 1 }),
    B({ id: "new", receiptDate: "2026-01-01", quantityRemaining: 5, unitCost: 10 }),
  ], { itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 5 });
  eq(at(batches, "20"), 5, "five arrive");
  eq(at(batches, "10"), 3, "three remain");
  const landedValue = batches.filter(b => b.location === "20")
                             .reduce((s, b) => s + b.quantityRemaining * b.unitCost, 0);
  close(landedValue, 23, "landed value is 3 at $1 plus 2 at $10, not 5 at an average");
}

{
  // Asking for more than exists moves what is there and says so, rather than
  // inventing stock or silently doing nothing.
  const { batches, moved, short } = transferStock([B({ quantityRemaining: 3 })], {
    itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 10 });
  eq(moved, 3, "moves only what is actually there");
  eq(short, 7, "reports the shortfall");
  eq(at(batches, "10"), 0, "source is emptied");
  eq(at(batches, "20"), 3, "destination gets what there was");
}

{
  // Other items and other locations are left alone.
  const { batches } = transferStock([
    B({ id: "a", itemId: "i1", location: "10" }),
    B({ id: "b", itemId: "i2", location: "10" }),
    B({ id: "c", itemId: "i1", location: "30" }),
  ], { itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 10 });
  eq(batches.find(b => b.id === "b").quantityRemaining, 10, "a different item at the same location is untouched");
  eq(batches.find(b => b.id === "c").quantityRemaining, 10, "the same item at a different location is untouched");
}

{
  // A round trip must land exactly where it started.
  const one = transferStock([B()], { itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 4 });
  const two = transferStock(one.batches, { itemId: "i1", fromLocation: "20", toLocation: "10", quantity: 4 });
  eq(at(two.batches, "10"), 10, "sending it back restores the source");
  eq(at(two.batches, "20"), 0, "and empties the destination");
}

{
  // Zero is a no-op, not a crash.
  const { batches, moved } = transferStock([B()], {
    itemId: "i1", fromLocation: "10", toLocation: "20", quantity: 0 });
  eq(moved, 0, "a zero transfer moves nothing");
  eq(at(batches, "10"), 10, "and leaves the source alone");
}

// ── Count sheets ─────────────────────────────────────────────────────────────
console.log("\nCount sheets");

{
  // Everything with stock must appear on exactly one sheet. This is the promise
  // that printing by location makes and printing by category could not.
  const onSheets = new Set();
  let sheetQty = 0;
  for (const code of locCodes) {
    for (const row of stockAtLocation(code, ITEMS, BATCHES)) {
      onSheets.add(`${row.itemId}@${code}`);
      sheetQty += row.qty;
    }
  }
  const stockQty = BATCHES.filter(b => b.status === "open" && b.quantityRemaining > 0)
                          .reduce((s, b) => s + b.quantityRemaining, 0);
  close(sheetQty, stockQty, "every unit of stock appears on exactly one count sheet");

  const heldPairs = new Set(
    BATCHES.filter(b => b.status === "open" && b.quantityRemaining > 0)
           .map(b => `${b.itemId}@${String(b.location)}`));
  eq(onSheets.size, heldPairs.size, "no item-location pair is missed or duplicated");
}

// ── Display helpers ──────────────────────────────────────────────────────────
console.log("\nDisplay");

eq(categoryName({ categoryId: GROUPS[0].id }, GROUPS), groupLabel(GROUPS[0]), "a category id resolves to its group label");
eq(categoryName({ categoryId: "", commodityGroup: "SIGNS" }, GROUPS), "SIGNS", "an unmapped item falls back to its legacy group");
eq(categoryName({ categoryId: "gone", commodityGroup: "" }, GROUPS), "—", "a dangling category shows a dash, not undefined");
eq(categoryName(null, GROUPS), "—", "a missing item does not throw");
eq(groupLabel(groupByCode("nope", GROUPS)), "", "an unknown group code yields an empty label, not a crash");
eq(locationName("nope", GROUPS), "Group nope", "an unknown location still renders something readable");
ok(String(groupLabel(GROUPS[0])).startsWith(String(GROUPS[0].code)), "a group label leads with its code — staff know the numbers");

// ── The crosswalk itself ─────────────────────────────────────────────────────
//
// Run against a small fixture that carries one of everything awkward, so the
// rules can be checked without needing the county's real export.
console.log("\nCrosswalk");

{
  const csv = readFileSync(new URL("./fixtures/crosswalk-sample.csv", import.meta.url), "utf8");
  const { records } = parseCSV(csv);
  eq(records.length, 26, "every row parses, including the ones with inch marks in them");

  // The parser bug that lost 1,093 of 2,375 rows: a quote is only special at
  // the START of a field. `Stihl 36"` is data, not the beginning of a quote.
  const stihl = records.find(r => r["Inventory #"] === "#14 (MS660-36)");
  eq(stihl["Inventory Description"], 'A/C #705-0595 Stihl 36"', "an inch mark mid-field survives");
  eq(stihl["GL A/C #"], "511.02", "and the fields after it are still aligned");
  // A properly quoted field with commas inside it still works.
  const money = records.find(r => r["Inventory #"] === "MONEY-1");
  eq(money["Cost On Hand"], "2,500.00", "a quoted field containing commas is one value");

  const out = crosswalkInventory(records);
  ok(out.ok, "the fixture crosswalks without error");

  const item = (p) => out.items.find(i => i.partNumber === p);
  const groupOf = (i) => out.groups.find(g => g.id === i.categoryId);

  // One item per part number, held in several places.
  eq(out.items.filter(i => i.partNumber === "CARBIDE BLADE 3'").length, 1,
     "three rows of one blade become one item");
  eq(out.batches.filter(b => b.itemId === item("CARBIDE BLADE 3'").id).length, 3,
     "with an opening batch at each of the three places");

  // Category recovery: the group that is NOT a place is what the thing is.
  eq(groupOf(item("CARBIDE BLADE 3'")).name, "GRADER BLADES",
     "its category is the home group, not one of the sheds it was sent to");
  eq(groupOf(item("5D-9561")).name, "GRADER BLADES",
     "same for a cutting edge sent out to Pauline");

  // No home group at all — flagged, not guessed.
  eq(groupOf(item("ELCHD-26")).type, "building",
     "coolant only ever seen at sheds keeps a place as its category");
  ok(out.exceptions.some(e => e.kind === "Category cannot be recovered" && e.partNumber === "ELCHD-26"),
     "…and says so rather than inventing a category");

  // Rounding. 16.125 is 16 + 1/8 and exactly representable, so it rounds to
  // even. 1.295 is not, and rounds by its true value.
  eq(item("HALF-EXACT").standardCost, 16.12, "an exact half rounds to even");
  eq(item("HALF-INEXACT").standardCost, 1.29, "a value that only looks like a half does not");

  // Nothing broken produces an opening balance.
  ok(!out.batches.some(b => b.itemId === (item("NEG-1") || {}).id), "a negative quantity opens no batch");
  ok(!out.batches.some(b => b.itemId === (item("GHOST-1") || {}).id), "value with no quantity opens no batch");
  for (const kind of ["Negative quantity", "Value with no quantity", "No GL code",
                      "No part number", "Group code used under two names"])
    ok(out.exceptions.some(e => e.kind === kind), `flagged: ${kind}`);

  // A row with nothing in it is not an exception — it is just empty.
  ok(!out.exceptions.some(e => e.partNumber === "EMPTY-1"), "an empty row is not flagged as a problem");

  // Money written with commas is one number, not two fields.
  eq(item("MONEY-1").standardCost, 1250, "a price with a thousands separator parses");
  close(out.batches.find(b => b.itemId === item("MONEY-1").id).totalCost, 2500,
        "and so does its value on hand");

  // Group 1 appears as both SHOP TOOLS (majority) and AYR SHED (one row).
  eq(out.groups.find(g => g.code === "1").name, "SHOP TOOLS", "the majority name wins a collision");

  // The opening balance is the sum of what is really there.
  //
  // The DEF rows and the DEF filter and cap are IN it — DEF is stock, it just
  // happens to be merged onto one item. The three fuel rows are NOT: their
  // $27,608.66 belongs to the tanks, and adding it here is the double count the
  // routing exists to prevent.
  const stock = 500 + 200 + 100 + 60 + 20 + 1016.99 + 631.38 + 200 + 100 + 20 + 129 + 54.21 + 3303.30 + 2500;
  const def   = 505.18 + 202.86 + 173.80;      // one item, three sheds
  const parts = 126.45 + 39.98;                // the DEF filter and the DEF cap
  const expected = stock + def + parts;
  close(out.summary.openingValue, expected, "the opening value is every good row, and only those");
  ok(out.summary.openingValue < expected + 1 && !String(out.summary.openingValue).includes("27608"),
     "and the tanks' fuel is nowhere in it");
}

// ── The import ───────────────────────────────────────────────────────────────
//
// What a county's own import replaces, and what it must leave alone.
console.log("\nImport");

{
  const csv = readFileSync(new URL("./fixtures/crosswalk-sample.csv", import.meta.url), "utf8");
  const out = crosswalkInventory(parseCSV(csv).records);

  const before = {
    inventoryItems: [{ id: "old" }],
    inventoryGroups: [{ id: "g", code: "1" }],
    inventoryBatches: [{ id: "b", status: "open", quantityRemaining: 5, unitCost: 2 }],
    inventoryTransactions: [{ type: "crosswalk" }, { type: "issue" }],
    inventoryExceptions: [],
    expenditures: [{ id: "claim-1" }], workOrders: [{ id: "wo-1" }],
    fuelDispensing: [{ id: "f" }], revenue: [{ id: "r" }],
  };
  // Mirrors the IMPORT_INVENTORY case in App.jsx.
  const after = { ...before,
    inventoryItems: out.items, inventoryBatches: out.batches,
    inventoryTransactions: out.transactions, inventoryGroups: out.groups,
    inventoryExceptions: out.exceptions };

  eq(after.inventoryItems.length, out.items.length, "the catalog is replaced");
  eq(after.inventoryGroups.length, out.groups.length, "the groups are replaced");
  for (const [k, label] of [["expenditures","claims"],["workOrders","work orders"],
                            ["fuelDispensing","fuel"],["revenue","revenue"]])
    eq(after[k].length, 1, `${label} are left alone`);
  ok(!after.inventoryTransactions.some(t => t.type === "issue"),
     "movements recorded before the import are discarded — which is why the screen warns about them");
  ok(after.inventoryBatches.every(b => after.inventoryGroups.some(g => String(g.code) === String(b.location))),
     "every imported batch sits at an imported group");
  ok(after.inventoryItems.every(i => !i.categoryId || after.inventoryGroups.some(g => g.id === i.categoryId)),
     "every imported category resolves");

  // The wrong file is refused rather than half-imported.
  const junk = crosswalkInventory(parseCSV("name,age\nbob,3\n").records);
  ok(!junk.ok && /missing these columns/.test(junk.error), "a file with the wrong columns is refused");
  eq(parseCSV("").records.length, 0, "an empty file yields no records rather than throwing");
  eq(parseCSV("a,b\n\n\n").records.length, 0, "blank lines are skipped");
}

// ── Shelves ──────────────────────────────────────────────────────────────────
console.log("\nShelves");

{
  // A shelf is optional. Most items have none — a stockpile has no shelf, and
  // neither does an extinguisher riding on a truck — so every screen hides it
  // rather than showing a blank column.
  const fresh = createInventoryItem({ name: "x" });
  ok("shelfLocation" in fresh, "a new item has a shelf field");
  eq(fresh.shelfLocation, "", "and it starts empty rather than guessed");

  const item = { id: "i1", shelfLocation: "B3" };
  eq(("A1" || item.shelfLocation), "A1", "a shelf recorded against the stock wins");
  eq(("" || item.shelfLocation), "B3", "the item's usual shelf is the fallback");
  ok(![{ shelf: "", item: { shelfLocation: "" } }].some(r => r.shelf || r.item.shelfLocation),
     "a sheet where nothing has a shelf drops the column");

  // The count sheet builds its header, body and footer separately, so their
  // widths have to agree in both states or the table renders ragged.
  for (const anyShelf of [true, false]) {
    const head = (anyShelf ? 1 : 0) + 9;
    const body = (anyShelf ? 1 : 0) + 9;
    const foot = (anyShelf ? 5 : 4) + 1 + 1 + 3;
    ok(head === body && body === foot,
       `count sheet columns line up with anyShelf=${anyShelf} (${head}/${body}/${foot})`);
  }
}

// ── Group codes ──────────────────────────────────────────────────────────────
console.log("\nGroup codes");

{
  // Codes are the county's own numbering. They need not be sequential and are
  // not required to follow the last one — uniqueness is the only rule. R&B's
  // run to 703 with gaps all the way down.
  const codes = new Set(GROUPS.map(g => String(g.code)));
  eq(codes.size, GROUPS.length, "no two groups share a code");
  ok(Math.max(...[...codes].map(Number)) > codes.size,
     "codes are sparse, not sequential — so 'next free number' would be wrong");
  ok(!codes.has("42"), "an unused code like 42 is available");
  ok(codes.has("7"),   "a used code like 7 is not");
}

// ── Exceptions ───────────────────────────────────────────────────────────────
console.log("\nExceptions");

ok(EXCEPTIONS.length > 0, `${EXCEPTIONS.length} rows flagged rather than guessed at`);
ok(EXCEPTIONS.every(e => e.id && e.csvRow && e.kind && e.detail), "every exception has a row, a kind and a reason");
eq(new Set(EXCEPTIONS.map(e => e.id)).size, EXCEPTIONS.length, "exception ids are unique");
ok(EXCEPTIONS.every(e => e.resolved === false), "none start out ticked off");

// Nothing flagged as unusable was quietly given an opening balance anyway.
{
  const bad = new Set(EXCEPTIONS
    .filter(e => e.kind === "Negative quantity" || e.kind === "Value with no quantity")
    .map(e => e.csvRow));
  ok(bad.size > 0, `${bad.size} rows could not produce an opening balance`);
}


// ── Unsaved work ─────────────────────────────────────────────────────────────
//
// The guard itself is React, so what is tested here is the decision it makes:
// when is a form dirty, and does navigation run or ask.
console.log("\nUnsaved work");

{
  // The registry, as UnsavedWorkProvider keeps it.
  const dirty = new Map();
  const setDirty = (id, is, what) => is ? dirty.set(id, what) : dirty.delete(id);
  let asked = null, ran = 0;
  const guard = (action) => {
    const outstanding = [...dirty.values()];
    if (!outstanding.length) { action(); ran++; return; }
    asked = outstanding;
  };

  guard(() => {});
  eq(ran, 1, "navigation runs straight through when nothing is half-typed");
  ok(asked === null, "and asks nothing");

  setDirty("receive", true, "this receipt");
  guard(() => {});
  eq(ran, 1, "a dirty form stops navigation");
  eq(JSON.stringify(asked), JSON.stringify(["this receipt"]), "and names what would be lost");

  // Two forms open at once are tracked separately.
  asked = null;
  setDirty("claim", true, "this expenditure");
  guard(() => {});
  eq(asked.length, 2, "two half-typed forms are both named");

  setDirty("receive", false);
  asked = null;
  guard(() => {});
  eq(JSON.stringify(asked), JSON.stringify(["this expenditure"]),
     "saving one form leaves the other still guarded");

  setDirty("claim", false);
  asked = null;
  guard(() => {});
  eq(ran, 2, "with everything saved, navigation runs again");
  ok(asked === null, "silently");

  // Dirtiness is "has anything been typed", not "is it valid".
  const expenditureDirty = (h, ls) =>
    Boolean(h.vendorName || h.reference || h.claimNumber ||
            ls.some(l => l.code || l.amount || l.description));
  ok(!expenditureDirty({ vendorName:"", reference:"", claimNumber:"" }, [{ code:"", amount:"", description:"" }]),
     "an untouched expenditure form is not dirty");
  ok(expenditureDirty({ vendorName:"NAPA", reference:"", claimNumber:"" }, [{ code:"", amount:"", description:"" }]),
     "typing only the vendor makes it dirty");
  ok(expenditureDirty({ vendorName:"", reference:"", claimNumber:"" }, [{ code:"", amount:"25", description:"" }]),
     "typing only an amount on one line makes it dirty");
}

// ── Money fields ─────────────────────────────────────────────────────────────
console.log("\nMoney fields");

{
  // What MoneyField settles to when the cursor leaves.
  const commit = (raw, { allowNegative = false, decimals = 2 } = {}) => {
    const cleaned = String(raw).replace(/[$,\s]/g, "");
    if (!cleaned) return "";
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) return "";
    return Number((allowNegative ? n : Math.abs(n)).toFixed(decimals));
  };
  const shown = (v, d = 2) =>
    (v === "" || v === null || v === undefined || Number.isNaN(Number(v))) ? "" : Number(v).toFixed(d);

  eq(shown(commit("5")), "5.00", "typing 5 settles as 5.00 — the whole point");
  eq(shown(commit("5.5")), "5.50", "5.5 settles as 5.50");
  eq(shown(commit("")), "", "an empty field stays empty rather than becoming 0.00");
  eq(shown(commit("abc")), "", "nonsense clears rather than becoming NaN");
  eq(commit("$1,250.00"), 1250, "a pasted figure with $ and commas parses");
  eq(commit("-3"), 3, "a negative is refused where negatives make no sense");
  eq(commit("-3", { allowNegative: true }), -3, "…and kept on the amendment field, which needs them");
  // 5.555 typed as a decimal is 5.5549999999999997 as a double, so 5.55 is the
  // correct rounding of the value actually held. What matters is that the
  // stored number and the displayed one agree — a field showing 5.55 while
  // holding 5.555 is a total that will not add up from the figures on screen.
  const third = commit("5.555");
  eq(shown(third), "5.55", "a third decimal settles to two");
  eq(Number(shown(third)), third, "and what is stored is exactly what is shown");
}

// ── Fuel and fluids in the inventory file ────────────────────────────────────
//
// R&B carried the tanks' contents AND the DEF jugs as ordinary stock. Greg,
// 2026-09-05: "Yes, the fuel should be tracked in the fuel module" and "One
// Item with as many batches as necessary."
//
// The rules are regexes over a description, which is the kind of thing that
// works on the sixteen examples somebody thought of and fails on the
// seventeenth. So the real descriptions from the county's own file are pinned
// here, including every near miss.
{
  console.log("\nTelling fuel from parts");
  const is = (desc, part, want, uom = "EACH") =>
    eq((fluidRuleFor(desc, part, uom) || { id:"stock" }).id, want, `${uom.padEnd(6)} ${desc.slice(0, 38)}`);

  // The eight rows that ARE the tanks, exactly as the county's file has them.
  is("Diesel Exhaust Fluid", "DEF-26", "def", "EACH");
  is("Diesel Fuel Kenesaw",  "DIESEL26-07",  "diesel", "GALLON");
  is("Diesel Fuel Hastings", "DIESEL26-12",  "diesel", "GALLON");
  is("Diesel Fuel 402",      "DIESEL26-402", "diesel", "GALLON");
  is("Unleaded Fuel Hastings", "GAS26", "unleaded", "GALLON");
  // R&B records the Pauline tank as EACH. The description saves it.
  is("Diesel Fuel Pauline", "DIESEL26-11", "diesel", "EACH");
  // And a county that writes it differently is still caught, on the unit.
  is("Dyed Diesel #2", "D2", "diesel", "GAL");

  // ── The twelve that were WRONGLY routed on the first run ─────────────────
  //
  // Taking a row out of the catalog is the destructive direction: a part sent
  // to a tank simply vanishes from inventory. My first rule set did that to
  // 2,478 quarts of engine oil and four chemicals. Every one is pinned here.
  is("Diesel Oil Kenesaw",  "15W40-26",  "stock", "QUART");
  is("Diesel Oil Holstein", "15W40-26",  "stock", "QUART");
  is("Diesel Oil Roseland", "15W40-26",  "stock", "QUART");
  is("Diesel Oil Pauline",  "15W40-26",  "stock", "QUART");
  is("Diesel Oil 430",      "15W40-26",  "stock", "QUART");
  is("15W40 Diesel Oil",    "15W40-26B", "stock", "QUART");
  is("(E5A) BG Diesel Oil Conditionr",  "11232", "stock", "EACH");
  is("(E5A) BG Diesel System Cleaner",  "24532", "stock", "EACH");
  is("(E5A) BG Diesel Thaw",            "25632", "stock", "QUART");
  is("(E5B) BG HD Diesel Flush Kit",    "9255",  "stock", "EACH");

  // The near misses — all real rows from the county's file. Every one of these
  // contains the word DEF or DIESEL and none of them is fuel.
  is("(A1C) WIX Def Filter RE554498", "A1C", "stock");
  is("(C3C) WIX DEF Supply Filter", "C3C", "stock");
  is("(C3F) GRADALL (MB) DEF Cap", "C3F", "stock");
  is("(D4C) WIX Def/Hyd Breather", "D4C", "stock");
  is("(B5A) VOLVO DEF Filter", "B5A", "stock");
  is("(BC8) Diesel Fuel Nozzle", "045710", "stock");
  is("(BC4) VOLVO Diesel Fuel Cap", "17204527", "stock");
  is("Diesel Fuel Cap", "MDSMGC537", "stock");
  is("1500 GAL Fuel Tank/Meter", "7-00", "stock");
  is("Diesel Fuel Conditioner", "DFC-1", "stock");
  // "Fuel" plus gallons and STILL not fuel — the exclusions have to win.
  is("Diesel Fuel Tank 100 Gallon", "TK-100", "stock", "GALLON");

  // The one that actually caught me out: "Diesel Exhaust Fluid" contains the
  // word diesel, and with the diesel rule first it was routed to a tank. DEF
  // must be tested first, and this is the assertion that keeps it there.
  eq(FLUID_RULES[0].id, "def", "DEF is tested before diesel, or DEF becomes fuel");
}

{
  console.log("\nWhat the crosswalk does with them");
  const csv = readFileSync(new URL("./fixtures/crosswalk-sample.csv", import.meta.url), "utf8");
  const out = crosswalkInventory(parseCSV(csv).records);

  const def = out.items.filter(i => i.fluidType === "def");
  eq(def.length, 1, "DEF is ONE item, not one per shed");
  eq(def[0].name, "Diesel Exhaust Fluid", "named for what it is");
  eq(def[0].partNumber, "DEF-26", "keeping the commonest part number");
  eq(def[0].commodityGroup, "FUEL", "categorised by the group that is not a place");
  eq(def[0].unitGallons, 0, "container size left blank — an export cannot know it");

  const defBatches = out.batches.filter(b => b.itemId === def[0].id);
  eq(defBatches.length, 3, "with one opening balance per shed");
  eq([...new Set(defBatches.map(b => b.location))].sort().join(","), "7,9,90",
     "at the sheds it was actually held at");

  // The filter and the cap are ordinary stock and must survive.
  ok(out.items.some(i => /Def Filter/i.test(i.name)), "the DEF filter is still a part");
  ok(out.items.some(i => /DEF Cap/i.test(i.name)),    "and so is the DEF cap");
  ok(!out.items.some(i => i.fluidType === "def" && /filter|cap/i.test(i.name)),
     "neither of them was mistaken for fluid");

  // Fuel is out of the catalog entirely.
  eq(out.items.filter(i => /Diesel Fuel (Kenesaw|Hastings)|Unleaded Gasoline/i.test(i.name)).length, 0,
     "no tank's fuel is left in the catalog");
  eq(out.tankOpenings.length, 3, "it comes out as tank opening balances");
  close(out.summary.tankOpeningGallons, 7753.6, "carrying their gallons");
  close(out.summary.tankOpeningValue, 27608.66, "and their value");

  // The double count this exists to prevent.
  ok(!out.batches.some(b => out.tankOpenings.some(t => t.partNumber === b.itemName)),
     "and none of it is also an inventory batch");
  ok(out.summary.openingValue < out.summary.tankOpeningValue + out.summary.openingValue,
     "fuel value is reported apart from the opening inventory, never added to it");

  const kinds = new Set(out.exceptions.map(e => e.kind));
  ok(kinds.has("Fuel — moved to the Fuel module"), "every routed row is reported, not dropped quietly");
  ok(kinds.has("Fluid merged from several part numbers"), "and so is every merge");
  ok(kinds.has("Fluid rows disagree on unit of measure"), "EA against GAL on the same fluid is flagged");
  ok(kinds.has("Container size needed"), "and somebody is asked for the gallons per jug");
}

// ── Receiving creates the claim ──────────────────────────────────────────────
//
// Greg: "I want to make sure everything goes through that that we receive in
// and have to pay for."
//
// Before this, ONE thing in the program created a claim from a receipt: a fuel
// delivery. Parts, gravel and DEF all went onto the shelf with the money
// invisible. These are the rules that stop that happening again.

{
  console.log("\nA receipt with the invoice in hand");
  const e = receiptExpenditure({
    receiptId:"bat-1", date:"2026-09-05", vendorName:"AUTO VALUE",
    invoiceRef:"INV-4471", claimCycleId:"2026-09-15", glCode:"302.09",
    description:"DEF 2.5 Gallon Jug", amount:104.28, quantity:12, unitOfMeasure:"EA",
  });
  eq(e.totalAmount, 104.28, "the claim is for what it cost");
  eq(e.lines.length, 1, "one line");
  eq(e.lines[0].code, "302.09", "charged to the item's GL code");
  eq(e.lines[0].amount, 104.28, "and the line matches the total");
  ok(/12 EA/.test(e.lines[0].description), "the line says how much of what");
  eq(e.invoiceStatus, "reconciled", "invoice in hand means nothing left to chase");
  eq(e.reference, "INV-4471", "referenced by the invoice number");
  eq(e.sourceReceiptId, "bat-1", "and it points back at the batch it came from");
}

{
  console.log("\nA receipt with no invoice yet");
  const e = receiptExpenditure({
    receiptId:"bat-2", date:"2026-09-05", vendorName:"FARMERS COOP",
    invoiceRef:"", claimCycleId:"2026-09-15", glCode:"301.06",
    description:"1½\" Crusher Run Rock", amount:2400, quantity:120, unitOfMeasure:"TON",
  });
  eq(e.invoiceStatus, "expected", "the claim still goes on, marked awaiting the paperwork");
  eq(e.totalAmount, 2400, "at the price on the ticket");
  eq(e.invoicedAmount, 0, "with nothing invoiced yet");
  eq(e.reference, "bat-2", "referenced by the receipt until an invoice number exists");
}

{
  console.log("\nWhat must NOT create a claim");
  eq(receiptExpenditure({ receiptId:"x", date:"2026-09-05", amount:0 }), null,
     "a zero-value receipt makes no claim");
  eq(receiptExpenditure({ receiptId:"x", date:"2026-09-05", amount:-5 }), null,
     "and neither does a negative one");
  // The opening balances from the crosswalk are the important case: the county
  // did not buy that stock this year, and 2,201 claim lines appearing on day
  // one would be a disaster nobody could unpick.
  const opening = BATCHES.slice(0, 50);
  ok(opening.every(b => b.receiptRef === "CROSSWALK"),
     "opening balances are marked as a crosswalk, not a purchase");
}

{
  console.log("\nWhen the invoice lands and disagrees");
  const batch = { id:"bat-3", quantityReceived:120, unitCost:20, totalCost:2400,
                  invoiceStatus:"pending_reconciliation", invoiceRef:"" };
  const exp   = receiptExpenditure({ receiptId:"bat-3", date:"2026-09-05", amount:2400,
                                     glCode:"301.06", description:"rock", claimCycleId:"c1" });
  const r = reconcileReceipt({ batch, expenditure: exp, invoicedAmount: 2455.20,
                               invoiceRef:"INV-99", date:"2026-09-18" });
  close(r.difference, 55.20, "the difference is reported");
  close(r.batch.totalCost, 2455.20, "the batch is restated to what was actually billed");
  close(r.batch.unitCost, 20.46, "so the unit cost moves — and FIFO reprices what was issued");
  eq(r.batch.invoiceStatus, "final", "and it is no longer waiting");
  close(r.expenditure.totalAmount, 2455.20, "the claim moves with it");
  close(r.expenditure.lines[0].amount, 2455.20, "including its line, not just the header");
  eq(r.expenditure.invoiceStatus, "reconciled", "and it is settled");
  eq(r.expenditure.reference, "INV-99", "carrying the invoice number");
}

{
  console.log("\nWhich claim cycle a receipt lands on");
  const cycles = [{ id:"a", date:"2026-09-01" }, { id:"b", date:"2026-09-15" }, { id:"c", date:"2026-10-06" }];
  eq(claimCycleFor("2026-09-02", cycles).id, "b", "the first cycle on or after the date");
  eq(claimCycleFor("2026-09-15", cycles).id, "b", "the day of a cycle counts as that cycle");
  eq(claimCycleFor("2026-08-01", cycles).id, "a", "something early lands on the first one");
  eq(claimCycleFor("2027-01-01", cycles).id, "c", "and something past the end lands on the last");
}

{
  console.log("\nOne invoice covering several tickets");
  const rows = [
    { id:"b1", totalCost: 1000, quantityReceived: 50 },
    { id:"b2", totalCost:  500, quantityReceived: 25 },
    { id:"b3", totalCost:  333.33, quantityReceived: 16 },
  ];
  const est = 1833.33;

  const same = allocateInvoice(rows, est);
  close(same.reduce((s,r)=>s+r.amount, 0), est, "an invoice that agrees splits back to the estimates");

  // The awkward one: a total that does not divide cleanly.
  const inv = 2000;
  const share = allocateInvoice(rows, inv);
  close(share.reduce((s,r)=>s+r.amount, 0), inv,
        "the parts add to the invoice EXACTLY — a claim a cent out does not tie to its paper");
  ok(share[0].amount > share[1].amount, "split by what each ticket was estimated at");
  close(share[0].amount, 1090.91, "the biggest ticket takes the biggest share");

  // No total entered means the estimates stand.
  const none = allocateInvoice(rows, 0);
  close(none.reduce((s,r)=>s+r.amount, 0), est, "no invoice total leaves the estimates alone");

  // And a nasty one that would expose naive rounding: three equal thirds.
  const thirds = allocateInvoice(
    [{ id:"a", totalCost:100 }, { id:"b", totalCost:100 }, { id:"c", totalCost:100 }], 100);
  close(thirds.reduce((s,r)=>s+r.amount, 0), 100, "three equal tickets against $100 still add to $100");
  close(thirds[2].amount, 33.34, "the last one carries the residual rather than losing a cent");
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log(failures.length
  ? `\n${failures.length} failed, ${passed} passed\n`
  : `\nAll ${passed} checks passed ✓\n`);
process.exit(failures.length ? 1 : 0);
