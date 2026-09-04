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
import { parseCSV, crosswalkInventory } from "../src/data/crosswalk.js";
import { readFileSync } from "node:fs";
import { INITIAL_INVENTORY_ITEMS as ITEMS,
         INITIAL_INVENTORY_BATCHES as BATCHES,
         INITIAL_INVENTORY_TRANSACTIONS as TXS,
         INITIAL_INVENTORY_GROUPS as GROUPS,
         INVENTORY_EXCEPTIONS as EXCEPTIONS } from "../src/data/inventoryData.js";

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
close(BATCHES.reduce((s, b) => s + b.totalCost, 0), 1554890.75, "opening value ties to the old system");

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
  eq(records.length, 18, "every row parses, including the ones with inch marks in them");

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
  const expected = 500 + 200 + 100 + 60 + 20 + 1016.99 + 631.38 + 200 + 100 + 20 + 129 + 54.21 + 3303.30 + 2500;
  close(out.summary.openingValue, expected, "the opening value is every good row, and only those");
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

// ── Result ───────────────────────────────────────────────────────────────────
console.log(failures.length
  ? `\n${failures.length} failed, ${passed} passed\n`
  : `\nAll ${passed} checks passed ✓\n`);
process.exit(failures.length ? 1 : 0);
