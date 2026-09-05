// Tests for fuel costing.
//
//     node scripts/test-fuel.mjs
//
// Fuel pricing is FIFO on Greg's decision, and the thing worth pinning down is
// that a wrong price here is silent. Gallons are counted by a meter and get
// checked; dollars are calculated and never do. A tank quietly pricing at the
// wrong layer bills five other county departments the wrong amount every month
// and nothing in the paperwork looks unusual.

import { costFuel, fuelCostOf, fillCostOf, quoteFuel, tankLayers,
         tankFuelValue, departmentFuelBill, createFuelTaxRate, fuelTaxRatesOn,
         quarterOf, quarterRange, fuelTaxReport, quartersWithFuel,
         buildFIFOLines, fluidItems, fluidOnHand, issueFluidToMachine,
         createInventoryItem, createInventoryBatch, additiveEffect,
         createTank, fuelValuation } from "../src/data/schema.js";

let passed = 0;
const failures = [];
const ok = (c, m) => c ? (passed++, console.log("  ✓ " + m)) : (failures.push(m), console.log("  ✗ " + m));
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const close = (a, b, m) => ok(Math.abs(a - b) < 0.0005, `${m} — got ${a}, wanted ${b}`);

const del  = (o) => ({ type:"delivery", ...o });
const fill = (o) => ({ type:"portable_fill", ...o });

// ── One delivery, one fuelling ───────────────────────────────────────────────
{
  console.log("\nA tank with one delivery in it");
  const tx = [del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:3000, unitCost:2.98, createdAt:"1" })];
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-05", gallons:100, createdAt:"2" }];
  const c  = costFuel(tx, fd);
  close(fuelCostOf(c, "f1").unitCost,  2.98, "prices at what the load cost");
  close(fuelCostOf(c, "f1").totalCost, 298,  "and multiplies out");
  ok(!fuelCostOf(c, "f1").estimated, "nothing estimated — the fuel is accounted for");
  close(tankFuelValue(c, "T").gallons, 2900, "the tank is drawn down");
  close(tankFuelValue(c, "T").value, 8642, "and worth what is left in it");
}

// ── Greg's case: two deliveries, then a fuelling ─────────────────────────────
//
// He reported the second delivery not changing the price. Under FIFO that is
// the CORRECT answer — the old gallons are still in the tank and they go first.
// It was only wrong under the last-price rule the program used at the time, and
// wrong there for an unrelated reason: two deliveries on one date tied on the
// date sort and the older one won.
{
  console.log("\nTwo deliveries at different prices");
  const tx = [
    del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:3000, unitCost:2.98, createdAt:"1" }),
    del({ id:"d2", tankId:"T", date:"2026-07-20", gallons:4000, unitCost:3.21, createdAt:"2" }),
  ];
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-25", gallons:500, createdAt:"3" }];
  const c  = costFuel(tx, fd);
  close(fuelCostOf(c, "f1").unitCost, 2.98, "the older gallons go out first, at the older price");
  eq(tankLayers(c, "T").length, 2, "both layers are still in the tank");
  close(tankLayers(c, "T")[0].gallons, 2500, "the first one partly drawn");
  close(tankLayers(c, "T")[1].gallons, 4000, "the second untouched");
}

// ── The straddle ─────────────────────────────────────────────────────────────
{
  console.log("\nA fuelling that crosses a layer boundary");
  const tx = [
    del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:300,  unitCost:2.98, createdAt:"1" }),
    del({ id:"d2", tankId:"T", date:"2026-07-20", gallons:4000, unitCost:3.21, createdAt:"2" }),
  ];
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-25", gallons:500, createdAt:"3" }];
  const r  = fuelCostOf(costFuel(tx, fd), "f1");
  close(r.totalCost, 300*2.98 + 200*3.21, "the cost is the two pieces added");
  close(r.unitCost, 3.072, "and shows as ONE price a gallon");
  close(r.unitCost * 500, r.totalCost, "gallons times that price is the total, exactly");
  eq(r.lines.length, 2, "the two layers are still on the record underneath");
}

// ── Recosting when the invoice disagrees with the ticket ─────────────────────
{
  console.log("\nCorrecting a delivery price");
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-25", gallons:500, createdAt:"3" }];
  const before = costFuel([del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:3000, unitCost:2.98, createdAt:"1" })], fd);
  const after  = costFuel([del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:3000, unitCost:3.05, createdAt:"1" })], fd);
  close(fuelCostOf(before, "f1").unitCost, 2.98, "priced at the ticket");
  close(fuelCostOf(after,  "f1").unitCost, 3.05, "and reprices itself when the ticket is corrected");
  close(fuelCostOf(after,  "f1").totalCost, 1525, "with the total following");
}

// ── Portable tanks: the price is locked at the fill ──────────────────────────
{
  console.log("\nFilling a portable off the shop tank");
  const tx = [
    del({  id:"d1", tankId:"T", date:"2026-07-01", gallons:3000, unitCost:2.98, createdAt:"1" }),
    fill({ id:"p1", sourceTankId:"T", destinationTankId:"402F", date:"2026-07-05", gallons:100, createdAt:"2" }),
    del({  id:"d2", tankId:"T", date:"2026-07-10", gallons:4000, unitCost:3.40, createdAt:"3" }),
  ];
  const fd = [{ id:"f1", sourceTankId:"402F", date:"2026-07-15", gallons:40, createdAt:"4" }];
  const c  = costFuel(tx, fd);
  close(fillCostOf(c, "p1").unitCost, 2.98, "the fill draws the oldest gallons in the shop tank");
  close(fuelCostOf(c, "f1").unitCost, 2.98, "and the portable keeps that price after the shop tank moves");
  close(tankFuelValue(c, "402F").gallons, 60, "the portable is drawn down by what came out of it");
}

{
  console.log("\nA portable fill that straddles, then feeds a machine");
  const tx = [
    del({  id:"d1", tankId:"T", date:"2026-07-01", gallons:60,   unitCost:3.00, createdAt:"1" }),
    del({  id:"d2", tankId:"T", date:"2026-07-02", gallons:4000, unitCost:3.50, createdAt:"2" }),
    fill({ id:"p1", sourceTankId:"T", destinationTankId:"402F", date:"2026-07-05", gallons:100, createdAt:"3" }),
  ];
  const fd = [{ id:"f1", sourceTankId:"402F", date:"2026-07-15", gallons:100, createdAt:"4" }];
  const c  = costFuel(tx, fd);
  close(fillCostOf(c, "p1").unitCost, 3.20, "the portable takes one blended price, not two layers");
  eq(tankLayers(c, "402F").length, 0, "the portable holds a single layer, and it is now empty");
  close(fuelCostOf(c, "f1").totalCost, 320, "so the machine is charged the blend");
}

// ── Running dry, and the day this goes live ──────────────────────────────────
{
  console.log("\nWhen the book says the tank is empty");
  const tx = [del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:100, unitCost:3.00, createdAt:"1" })];
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-05", gallons:150, createdAt:"2" }];
  const r  = fuelCostOf(costFuel(tx, fd), "f1");
  ok(r.estimated, "the record says the price was estimated");
  close(r.shortGallons, 50, "and by how many gallons");
  close(r.totalCost, 100*3 + 50*3, "the shortfall prices at the last known cost");

  const none = fuelCostOf(costFuel([], [{ id:"f9", sourceTankId:"T", date:"2026-07-05", gallons:20 }]), "f9");
  ok(none.estimated, "a tank with no history at all prices as estimated");
  close(none.totalCost, 0, "rather than inventing a number");
}

// ── Ordering ─────────────────────────────────────────────────────────────────
{
  console.log("\nA delivery and a fuelling on the same day");
  const tx = [del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:500, unitCost:3.00, createdAt:"9" })];
  const fd = [{ id:"f1", sourceTankId:"T", date:"2026-07-01", gallons:400, createdAt:"1" }];
  const r  = fuelCostOf(costFuel(tx, fd), "f1");
  ok(!r.estimated, "the load counts as arriving first, so the tank is not reported short");
  close(r.unitCost, 3.00, "priced off the load that came in");
}

// ── The department bill ──────────────────────────────────────────────────────
{
  console.log("\nA month of one department's fuel");
  const tx = [
    del({ id:"d1", tankId:"U", date:"2026-07-01", gallons:400,  unitCost:2.90, createdAt:"1" }),
    del({ id:"d2", tankId:"U", date:"2026-07-15", gallons:4000, unitCost:3.30, createdAt:"2" }),
  ];
  const fd = [
    { id:"f1", sourceTankId:"U", date:"2026-07-03", gallons:150, createdAt:"3", consumer:"other_department", departmentName:"Sheriff" },
    { id:"f2", sourceTankId:"U", date:"2026-07-18", gallons:300, createdAt:"4", consumer:"other_department", departmentName:"Sheriff" },
    { id:"f3", sourceTankId:"U", date:"2026-07-20", gallons:120, createdAt:"5", consumer:"other_department", departmentName:"Weed" },
  ];
  const c = costFuel(tx, fd);
  const sheriff = departmentFuelBill(c, fd.filter(f => f.departmentName === "Sheriff"));
  close(sheriff.gallons, 450, "gallons for the month");
  close(sheriff.cost, 150*2.90 + 250*2.90 + 50*3.30, "cost is FIFO across the whole month");
  // The invoice has to tie to itself. 450 gal at $2.9444 is $1,324.98, not the
  // $1,325.00 the layers actually cost — so the bill shows the price times the
  // gallons, and reports the two cents rather than burying them.
  eq(sheriff.unitCost, 2.9444, "the unit price is rounded to four places");
  close(sheriff.billedCost, sheriff.gallons * sheriff.unitCost, "and the amount billed is exactly gallons times it");
  close(sheriff.rounding, -0.02, "with the residual against the true cost reported");
  ok(!sheriff.estimated, "nothing estimated");

  const weed = departmentFuelBill(c, fd.filter(f => f.departmentName === "Weed"));
  close(weed.unitCost, 3.30, "the next department pays what is left in the tank");
  close(sheriff.cost + weed.cost, 150*2.90+250*2.90+50*3.30+120*3.30, "and the two true costs add to the fuel that went out");
  ok(Math.abs((sheriff.billedCost + weed.billedCost) - (sheriff.cost + weed.cost)) < 0.05,
     "what is billed is within a few cents of what it cost");
}

// ── Quoting does not move anything ───────────────────────────────────────────
{
  console.log("\nQuoting a fuelling before it is saved");
  const tx = [
    del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:100,  unitCost:3.00, createdAt:"1" }),
    del({ id:"d2", tankId:"T", date:"2026-07-02", gallons:1000, unitCost:3.60, createdAt:"2" }),
  ];
  const c = costFuel(tx, []);
  const q = quoteFuel(c, "T", 200);
  close(q.unitCost, 3.30, "the quote blends the layers it would take");
  close(tankFuelValue(c, "T").gallons, 1100, "and takes nothing out of the tank");
  close(quoteFuel(c, "T", 200).unitCost, 3.30, "so asking twice gives the same answer");
  close(quoteFuel(c, "T", 0).unitCost, 3.60, "with no gallons yet it shows the price of the newest fuel");
}


// ── Fuel tax ─────────────────────────────────────────────────────────────────
//
// The county buys dyed diesel untaxed and owes tax on the gallons that go into
// something driving on a road, remitted quarterly. The number this produces is
// a number somebody files, so it is worth more care than a screen total.

{
  console.log("\nQuarters");
  eq(quarterOf("2026-01-15"), "2026-Q1", "January is Q1");
  eq(quarterOf("2026-03-31"), "2026-Q1", "and so is the last day of March");
  eq(quarterOf("2026-04-01"), "2026-Q2", "April starts Q2");
  eq(quarterOf("2026-12-31"), "2026-Q4", "December is Q4");
  eq(quarterOf(""), "", "and nothing is nothing rather than a guess");
  eq(quarterRange("2026-Q1").end, "2026-03-31", "Q1 ends on the 31st");
  eq(quarterRange("2026-Q2").end, "2026-06-30", "Q2 on the 30th");
  eq(quarterRange("2024-Q1").end, "2024-03-31", "and a leap year does not shift it");
}

{
  console.log("\nWhich rate is in force");
  const rates = [
    createFuelTaxRate({ name:"State motor fuel", effectiveDate:"2025-07-01", ratePerGallon:0.248 }),
    createFuelTaxRate({ name:"State motor fuel", effectiveDate:"2026-01-01", ratePerGallon:0.291 }),
    createFuelTaxRate({ name:"Federal excise",   effectiveDate:"2025-01-01", ratePerGallon:0.244 }),
    createFuelTaxRate({ name:"Unleaded levy",    effectiveDate:"2025-01-01", ratePerGallon:0.10, fuelType:"unleaded" }),
  ];
  const on = fuelTaxRatesOn(rates, "2026-02-15");
  eq(on.length, 2, "two diesel taxes are in force");
  close(on.find(r=>r.name==="State motor fuel").ratePerGallon, 0.291, "the newer state rate applies");
  const before = fuelTaxRatesOn(rates, "2025-12-31");
  close(before.find(r=>r.name==="State motor fuel").ratePerGallon, 0.248, "and the older one before it took effect");
  eq(fuelTaxRatesOn(rates, "2024-01-01").length, 0, "nothing applies before any rate was entered");
  eq(fuelTaxRatesOn(rates, "2026-02-15", "unleaded").length, 1, "a rate for another fuel does not leak across");
}

{
  console.log("\nA quarter's return");
  const rates = [
    createFuelTaxRate({ name:"State motor fuel", effectiveDate:"2025-07-01", ratePerGallon:0.25 }),
    createFuelTaxRate({ name:"State motor fuel", effectiveDate:"2026-02-01", ratePerGallon:0.30 }),
    createFuelTaxRate({ name:"Federal excise",   effectiveDate:"2025-01-01", ratePerGallon:0.20 }),
  ];
  const fd = [
    { id:"a", date:"2026-01-10", fuelType:"diesel",   gallons:100, taxClass:"on_road",  unitNumber:"512" },
    { id:"b", date:"2026-02-10", fuelType:"diesel",   gallons:200, taxClass:"on_road",  unitNumber:"512" },
    { id:"c", date:"2026-02-11", fuelType:"diesel",   gallons:500, taxClass:"off_road", unitNumber:"327" },
    { id:"d", date:"2026-05-01", fuelType:"diesel",   gallons:900, taxClass:"on_road",  unitNumber:"512" },
    { id:"e", date:"2026-02-12", fuelType:"unleaded", gallons:400, taxClass:"not_applicable" },
  ];
  const r = fuelTaxReport(fd, rates, "2026-Q1");
  close(r.onRoadGallons, 300, "on-road gallons for the quarter");
  close(r.offRoadGallons, 500, "off-road counted separately");
  close(r.totalGallons, 800, "and the two add to the diesel that went out");
  ok(!r.byUnit.some(u => u.unit === "327"), "the off-road grader is not in the on-road working");

  const state = r.lines.find(l => l.name === "State motor fuel");
  // 100 gal in January at $0.25, 200 in February at $0.30 — the rate changed
  // mid-quarter and each fuelling is taxed at the rate on its own day.
  close(state.amount, 100*0.25 + 200*0.30, "a rate change mid-quarter splits itself");
  eq(state.rates.length, 2, "and the report says two rates were involved");
  close(r.lines.find(l => l.name === "Federal excise").amount, 300*0.20, "the second tax totals independently");
  close(r.totalOwed, 85 + 60, "the quarter's total is the taxes added");
  eq(r.unratedGallons, 0, "nothing went unpriced");
  eq(r.fuelType, "diesel", "gasoline is not in this return at all");

  const q2 = fuelTaxReport(fd, rates, "2026-Q2");
  close(q2.onRoadGallons, 900, "the next quarter stands on its own");
  close(q2.totalOwed, 900*0.30 + 900*0.20, "at the rates in force by then");
}

{
  console.log("\nWhen a rate is missing");
  const fd = [{ id:"a", date:"2026-01-10", fuelType:"diesel", gallons:100, taxClass:"on_road", unitNumber:"512" }];
  const r = fuelTaxReport(fd, [], "2026-Q1");
  close(r.onRoadGallons, 100, "the gallons are still counted");
  close(r.unratedGallons, 100, "and reported as unpriced");
  close(r.totalOwed, 0, "rather than quietly totalling to nothing that looks right");
  eq(r.lines.length, 0, "with no tax line invented");
}

{
  console.log("\nQuarters that have fuel in them");
  const fd = [
    { date:"2026-01-10" }, { date:"2026-02-10" }, { date:"2026-05-01" }, { date:"2025-11-02" },
  ];
  const qs = quartersWithFuel(fd);
  eq(qs.length, 3, "one entry per quarter, not per fuelling");
  eq(qs[0], "2026-Q2", "newest first");
  eq(qs[2], "2025-Q4", "oldest last");
}


// ── DEF ──────────────────────────────────────────────────────────────────────
//
// Jugs on a shelf at every shop, poured into a machine whole, logged on the
// fuel screen. The thing that has to hold is that a jug poured into a machine
// always comes off the shelf — a fuel entry without the matching issue makes
// the shelf count meaningless, quietly, over months.

const defItem = createInventoryItem({
  id:"def-jug", partNumber:"DEF-25", name:"DEF 2.5 Gallon Jug",
  fluidType:"def", unitGallons:2.5, unitOfMeasure:"EA",
});
const batch = (o) => createInventoryBatch({ itemId:"def-jug", status:"open", ...o });

{
  console.log("\nWhat is on the shelf");
  const batches = [
    batch({ id:"b1", location:"133", quantityRemaining:10, unitCost:12.00, receiptDate:"2026-01-05" }),
    batch({ id:"b2", location:"133", quantityRemaining:4,  unitCost:13.50, receiptDate:"2026-03-01" }),
    batch({ id:"b3", location:"7",   quantityRemaining:3,  unitCost:13.50, receiptDate:"2026-03-01" }),
    batch({ id:"b4", location:"9",   quantityRemaining:0,  unitCost:13.50, receiptDate:"2026-03-01", status:"depleted" }),
  ];
  const on = fluidOnHand([defItem], batches);
  eq(on.containers, 17, "seventeen jugs across the shops");
  close(on.gallons, 42.5, "which is gallons, for the year-end count");
  close(on.value, 10*12 + 7*13.5, "and a value");
  eq(on.byLocation.length, 2, "an empty shed is not listed as holding DEF");
  eq(on.byLocation[0].location, "133", "biggest holding first");
  eq(on.byLocation[0].containers, 14, "both batches at one place add together");

  eq(fluidItems([defItem, createInventoryItem({ name:"Oil Filter" })]).length, 1,
     "an ordinary part is not a fluid");
}

{
  console.log("\nPouring two jugs into a machine");
  const batches = [
    batch({ id:"b1", location:"133", quantityRemaining:10, unitCost:12.00, receiptDate:"2026-01-05" }),
    batch({ id:"b2", location:"133", quantityRemaining:4,  unitCost:13.50, receiptDate:"2026-03-01" }),
  ];
  const r = issueFluidToMachine({
    item: defItem, location:"133", containers:2, batches,
    date:"2026-04-01", equipmentId:"u1", unitNumber:"327", meterReading:4210, pumpedBy:"Dale",
  });
  ok(r.ok, "it can be done");
  close(r.gallons, 5, "two jugs is five gallons");
  close(r.totalCost, 24, "costed FIFO off the older batch");
  close(r.unitCost, 4.80, "which is a price per gallon, not per jug");

  eq(r.dispensing.fuelType, "def", "the fuel entry says DEF");
  eq(r.dispensing.sourceType, "inventory", "and that it came off a shelf");
  eq(r.dispensing.containers, 2, "recording jugs as well as gallons");
  eq(r.dispensing.taxClass, "not_applicable", "DEF is not a motor fuel and carries no road tax");
  eq(r.dispensing.equipmentId, "u1", "against the machine, so it reaches the machine's cost");
  eq(r.dispensing.meterReading, 4210, "with the meter reading, like any fuelling");

  eq(r.transaction.type, "issue", "and an inventory issue goes with it");
  eq(r.transaction.quantity, 2, "for the jugs, not the gallons");
  eq(r.transaction.location, "133", "off the right shelf");
  eq(r.transaction.reference, r.dispensing.id, "the two records point at each other");
  eq(r.transaction.batchLines.length, 1, "one batch covered it");
  close(r.transaction.batchLines[0].quantity, 2, "taking two from the oldest");
}

{
  console.log("\nA draw that crosses two receipts");
  const batches = [
    batch({ id:"b1", location:"133", quantityRemaining:1, unitCost:12.00, receiptDate:"2026-01-05" }),
    batch({ id:"b2", location:"133", quantityRemaining:9, unitCost:14.00, receiptDate:"2026-03-01" }),
  ];
  const r = issueFluidToMachine({ item:defItem, location:"133", containers:3, batches, unitNumber:"327" });
  ok(r.ok, "it can still be done");
  close(r.totalCost, 12 + 2*14, "oldest jug first, then the newer ones");
  eq(r.transaction.batchLines.length, 2, "and both receipts are on the record");
}

{
  console.log("\nWhen the shed does not have it");
  const batches = [
    batch({ id:"b1", location:"133", quantityRemaining:10, unitCost:12.00, receiptDate:"2026-01-05" }),
    batch({ id:"b3", location:"7",   quantityRemaining:1,  unitCost:13.50, receiptDate:"2026-03-01" }),
  ];
  const r = issueFluidToMachine({ item:defItem, location:"7", containers:3, batches, unitNumber:"327" });
  ok(!r.ok, "it refuses rather than going negative");
  close(r.short, 2, "and says how far short it is");
  ok(/count it/i.test(r.reason), "telling somebody to count rather than to give up");
  ok(!r.dispensing, "no fuel entry is produced");
  ok(!r.transaction, "and nothing comes off the shelf");

  // The stock IS there — at the main shop. Drawing from anywhere works.
  const anywhere = issueFluidToMachine({ item:defItem, location:"all", containers:3, batches, unitNumber:"327" });
  ok(anywhere.ok, "taking it from wherever it is works");
}

{
  console.log("\nNothing is produced from nothing");
  eq(issueFluidToMachine({ item:defItem, containers:0, batches:[] }).ok, false, "no jugs means no record");
  eq(issueFluidToMachine({ item:null, containers:2, batches:[] }).ok, false, "and no item means no record");
}

{
  console.log("\nPicking batches — the shared arithmetic");
  const batches = [
    batch({ id:"b2", location:"133", quantityRemaining:5, unitCost:14, receiptDate:"2026-03-01" }),
    batch({ id:"b1", location:"133", quantityRemaining:5, unitCost:12, receiptDate:"2026-01-05" }),
  ];
  const r = buildFIFOLines("def-jug", "133", 6, batches);
  eq(r.batchLines[0].batchId, "b1", "oldest first, whatever order the batches are held in");
  close(r.totalCost, 5*12 + 1*14, "and the cost follows that order");
  ok(r.canFulfill, "six of ten can be met");
  eq(buildFIFOLines("def-jug", "133", 20, batches).short, 10, "and a shortfall is reported, not rounded away");
}


// ── Fuel additive ────────────────────────────────────────────────────────────
//
// Greg: "The BG products are fuel additives that go directly into the tanks...
// there needs to be a way to cost it out into the fuel."
//
// Cost in, no gallons in. The county does not buy additive for its own sake, it
// buys it to put in the diesel, and the diesel is what gets charged to a
// machine — so the cost has to reach the machine through the fuel.

{
  console.log("\nAdditive dosed into a delivery — the normal case");
  //
  // Greg: "The fuel additive is added at the same time of delivery."
  //
  // So it rides with THAT load's gallons. Fuel already in the tank was not
  // treated and must not be charged for it.
  const tx = [
    del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:1000, unitCost:3.00, createdAt:"1" }),
    del({ id:"d2", tankId:"T", date:"2026-07-10", gallons:5000, unitCost:3.50,
          additiveCost:100, additiveQty:2, createdAt:"2" }),
  ];
  const c = costFuel(tx, []);
  const layers = tankLayers(c, "T");
  close(layers[0].unitCost, 3.00, "the fuel already in the tank is untouched");
  close(layers[1].unitCost, 3.52, "the treated load carries the additive — $100 over 5,000 gallons");

  const eff = additiveEffect(c, "d2");
  ok(eff.onDelivery, "recorded as having gone in with the delivery");
  close(eff.perGallon, 0.02, "two cents a gallon");

  // FIFO still runs: the untreated fuel goes out first, at its own price.
  const c2 = costFuel(tx, [
    { id:"f1", sourceTankId:"T", date:"2026-07-12", gallons:1000, createdAt:"3" },
    { id:"f2", sourceTankId:"T", date:"2026-07-13", gallons:1000, createdAt:"4" },
  ]);
  close(fuelCostOf(c2, "f1").unitCost, 3.00, "the older gallons still go first, untreated");
  close(fuelCostOf(c2, "f2").unitCost, 3.52, "and the treated ones follow at the treated price");

  // The money has to balance.
  const v = tankFuelValue(c2, "T");
  close(v.value + fuelCostOf(c2,"f1").totalCost + fuelCostOf(c2,"f2").totalCost,
        1000*3 + 5000*3.5 + 100,
        "value left plus value issued equals fuel bought plus additive bought");
}

{
  console.log("\nAdditive follows the fuel into a portable");
  const tx = [
    del({ id:"d1", tankId:"T", date:"2026-07-01", gallons:1000, unitCost:3.00,
          additiveCost:100, createdAt:"1" }),
    fill({ id:"p1", sourceTankId:"T", destinationTankId:"402F", date:"2026-07-03", gallons:100, createdAt:"2" }),
  ];
  const c = costFuel(tx, [{ id:"f1", sourceTankId:"402F", date:"2026-07-10", gallons:50, createdAt:"4" }]);
  close(fillCostOf(c, "p1").unitCost, 3.10, "the portable is filled at the treated price");
  close(fuelCostOf(c, "f1").unitCost, 3.10, "and the machine it feeds pays it too");
}


// ── Opening balance, and the year-end value ──────────────────────────────────
//
// Greg: "I would rather just have an opening balance when the tank is created
// and what the opening value is too." And: "I'm assuming there will be a way to
// export the value for the end of year count."

{
  console.log("\nA tank that starts with fuel in it");
  const t = createTank({ id:"T", name:"Main Shop Diesel", fuelType:"diesel",
                         openingDate:"2026-07-01", openingGallons:5000, openingValue:17500 });
  const c = costFuel([], [], [t]);
  close(tankFuelValue(c, "T").gallons, 5000, "the gallons are there from day one");
  close(tankFuelValue(c, "T").value, 17500, "and so is the value");
  close(quoteFuel(c, "T", 100).unitCost, 3.50, "priced at value over gallons");

  // The opening fuel goes out FIRST, before anything delivered later.
  const c2 = costFuel(
    [del({ id:"d1", tankId:"T", date:"2026-08-01", gallons:1000, unitCost:4.00, createdAt:"1" })],
    [{ id:"f1", sourceTankId:"T", date:"2026-08-05", gallons:100, createdAt:"2" }], [t]);
  close(fuelCostOf(c2, "f1").unitCost, 3.50, "and it is drawn before the newer, dearer load");
  ok(!fuelCostOf(c2, "f1").estimated, "nothing is estimated once an opening balance exists");

  // Which is the whole point: without one, the first draw is a guess.
  const bare = costFuel([], [{ id:"f9", sourceTankId:"T", date:"2026-08-05", gallons:100 }], []);
  ok(fuelCostOf(bare, "f9").estimated, "with no opening balance the same draw is only estimated");
}

{
  console.log("\nThe year-end value");
  const tanks = [
    createTank({ id:"A", name:"Main Shop Diesel",   fuelType:"diesel",
                 openingDate:"2025-07-01", openingGallons:5000, openingValue:17500 }),
    createTank({ id:"B", name:"Main Shop Unleaded", fuelType:"unleaded",
                 openingDate:"2025-07-01", openingGallons:1000, openingValue:3000 }),
    createTank({ id:"C", name:"Bought Later",       fuelType:"diesel",
                 openingDate:"2027-01-01", openingGallons:800,  openingValue:3200 }),
  ];
  const tx = [del({ id:"d1", tankId:"A", date:"2026-03-01", gallons:2000, unitCost:4.00, createdAt:"1" }),
              del({ id:"d2", tankId:"A", date:"2026-09-01", gallons:2000, unitCost:5.00, createdAt:"2" })];
  const fd = [{ id:"f1", sourceTankId:"A", date:"2026-04-01", gallons:1000, createdAt:"3" }];

  const v = fuelValuation(tx, fd, tanks, "2026-06-30");
  eq(v.asOf, "2026-06-30", "as at the fiscal year end");
  eq(v.lines.length, 2, "a tank bought after the date is not in it");
  const a = v.lines.find(l => l.tankId === "A");
  close(a.gallons, 6000, "5,000 opening plus 2,000 delivered less 1,000 issued");
  close(a.value, 17500 + 8000 - 3500, "valued FIFO — the 1,000 issued came off the opening layer");
  // The September delivery is AFTER the date and must not appear.
  ok(a.gallons < 8000, "a delivery after the year end is not counted");
  close(v.totalGallons, 7000, "with the unleaded tank included");
  close(v.totalValue, 22000 + 3000, "and the total is the tanks added");
  eq(v.byFuel.length, 2, "broken down by fuel");
  eq(v.unpriced, 0, "nothing unpriced");

  // Run it again for the same date and it must not have moved.
  const again = fuelValuation(tx, fd, tanks, "2026-06-30");
  close(again.totalValue, v.totalValue, "re-running last year's figure gives last year's answer");

  // Today's figure is a different number, and should be.
  const now = fuelValuation(tx, fd, tanks, "2026-12-31");
  ok(now.totalValue > v.totalValue, "by December the September load is in it");
}

{
  console.log("\nA tank nobody gave an opening balance");
  const t = createTank({ id:"T", name:"Kenesaw", fuelType:"diesel" });
  const v = fuelValuation([], [], [t], "2026-06-30");
  eq(v.lines[0].noOpening, true, "the report says so rather than showing a confident zero");
  close(v.totalValue, 0, "and values it at nothing, which is honest");
}

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed\n`
                            : `\nAll ${passed} checks passed ✓\n`);
process.exit(failures.length ? 1 : 0);
