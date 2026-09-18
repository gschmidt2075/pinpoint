// Build the sample data set that ships with Pinpoint.
//
// Greg, 2026-09-17: "The test data import would be very helpful as it is
// difficult to get things to work after massive rebuilds. I still need to get
// the agreement with the County done so I would like to get all of this re-build
// done so when the staff can look at it again, they can enter data and see if it
// works how they think it should work."
//
// So this exists for one moment: a rebuild lands, somebody opens Pinpoint to try
// it, and every screen is empty. An empty screen cannot be judged. They cannot
// tell a dashboard that is wrong from a dashboard with nothing to show, and the
// feedback that comes back is "it didn't do anything" rather than "the fuel
// total is off." One button fills it in.
//
// Three rules it follows:
//
//   1. NOT ADAMS COUNTY. Greg: "Please don't hardcode Adams County into this
//      program as I would like to keep a clean version that may be used by
//      other counties." Example County, and names nobody will mistake for a
//      real employee. It also means nobody looks at a screen of sample data and
//      thinks it is their own.
//
//   2. NO INVENTORY. The catalog is seeded from the crosswalk and is real. If
//      this file carried an `inventoryItems` key the restore would replace 2,375
//      items with whatever is written here — so it carries none, and the merge
//      leaves the real catalog exactly where it is.
//
//   3. FIXED DATES AND FIXED IDS, so re-running produces a byte-identical file
//      and a regeneration shows up in git as a real change rather than noise.
//
// Re-run with:  node scripts/make-sample-data.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmployee, createRateChange, createEmployeeAssignment,
  createVendor, createEquipmentUnit, createWorkOrder,
  createLaborEntry, createMaterialEntry, createEquipmentEntry,
  createProject, createExpenditure, createExpLine, createRevenue,
  createTank, createTankTransaction, createFuelDispensing,
  createRoad, createBridge, createStructure, createStructureBarrel, createSign,
} from "../src/data/schema.js";
import { buildBackup } from "../src/data/backup.js";
import { SEED_VERSION } from "../src/data/seedVersion.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT  = join(HERE, "..", "public", "sample-data.json");

// ── Determinism ───────────────────────────────────────────────────────────────
// The factories call uid() and now(), which are random and clock-dependent. Every
// record here overrides both, so the file is reproducible.
let n = 0;
const id = (prefix) => `${prefix}-${String(++n).padStart(4, "0")}`;
const AT = "2026-07-01T12:00:00.000Z";
const stamp = (rec) => ({ ...rec, createdAt: AT });

// A tiny deterministic generator, so "varied" does not mean "different every run".
let seed = 20260701;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (lo, hi, dp = 0) => {
  const v = lo + rnd() * (hi - lo);
  return dp === 0 ? Math.round(v) : Math.round(v * 10 ** dp) / 10 ** dp;
};

// Dates across one fiscal year, 1 July 2026 – 30 June 2027, so both halves of a
// fiscal year and two calendar years are represented — which is the case Greg
// keeps having to explain: "A M-2026-54 may have been started on June 1, 2026
// and finished on July 5, 2026."
const day = (offsetFromJul1) => {
  const d = new Date(Date.UTC(2026, 6, 1));
  d.setUTCDate(d.getUTCDate() + offsetFromJul1);
  return d.toISOString().slice(0, 10);
};

// ── County ────────────────────────────────────────────────────────────────────
const countyInfo = {
  countyName: "Example County",
  deptName:   "Roads Department",
  state:      "NE",
  address:    "100 County Road A",
  city:       "Example",
  zip:        "00000",
  phone:      "(000) 555-0100",
  superintendent: "Sample Superintendent",
};

// ── People ────────────────────────────────────────────────────────────────────
// Six, covering the shapes that matter: a long-serving operator with a real rate
// history, a recent hire still on a starting wage, a mechanic, an office manager,
// a seasonal, and somebody who has left.
const CLASSIFICATIONS = ["Equipment Operator", "Motor Grader Operator", "Mechanic",
                         "Laborer", "Office Manager", "Sign Technician"];

const employee = (first, last, num, cls, hired, rates, extra = {}) => stamp(createEmployee({
  id: id("emp"),
  employeeNumber: num,
  firstName: first, lastName: last, name: `${first} ${last}`,
  hireDate: hired,
  assignments: [stamp(createEmployeeAssignment({
    id: id("asg"), effectiveDate: hired, classification: cls,
  }))],
  rateHistory: rates.map(([date, rate, reason]) => stamp(createRateChange({
    id: id("rate"), effectiveDate: date, hourlyRate: rate, reason,
  }))),
  ...extra,
}));

const employees = [
  employee("Dale", "Ackerman", "101", "Motor Grader Operator", "2014-03-17", [
    ["2014-03-17", 18.40, "Starting wage"],
    ["2014-09-17", 19.10, "Six-month review"],
    ["2024-07-01", 26.85, "COLA"],
    ["2026-07-01", 28.20, "COLA"],
  ]),
  employee("Rita", "Vollmer", "102", "Equipment Operator", "2019-06-03", [
    ["2019-06-03", 20.00, "Starting wage"],
    ["2024-07-01", 25.40, "COLA"],
    ["2026-07-01", 26.70, "COLA"],
  ]),
  employee("Marcus", "Teale", "103", "Mechanic", "2021-01-11", [
    ["2021-01-11", 23.50, "Starting wage"],
    ["2026-07-01", 29.95, "COLA"],
  ]),
  employee("Jo", "Brandt", "104", "Office Manager", "2016-08-22", [
    ["2016-08-22", 19.75, "Starting wage"],
    ["2026-07-01", 27.40, "COLA"],
  ]),
  employee("Tobias", "Lund", "105", "Laborer", "2026-05-04", [
    ["2026-05-04", 19.25, "Starting wage"],
  ], { employmentType: "seasonal" }),
  employee("Karin", "Dopp", "106", "Sign Technician", "2012-04-02", [
    ["2012-04-02", 17.90, "Starting wage"],
    ["2024-07-01", 26.10, "COLA"],
  ], { active: false, endDate: "2026-08-29" }),
];

// ── Vendors ───────────────────────────────────────────────────────────────────
const vendor = (name, type, code, extra = {}) => stamp(createVendor({
  id: id("ven"), name, type, vendorCode: code,
  city: "Example", state: "NE", zip: "00000",
  ...extra,
}));

const vendors = [
  vendor("Prairie Fuel & Oil", "supplier", "V-1001", { phone:"(000) 555-0110" }),
  vendor("Midland Parts Supply", "supplier", "V-1002"),
  vendor("Cornerstone Aggregate", "supplier", "V-1003"),
  vendor("Redline Equipment Repair", "contractor", "V-1004", { tracksInsurance: true }),
  vendor("Hartwell Bridge Company", "contractor", "V-1005", { tracksInsurance: true, bonded: true, bondAmount: "500000" }),
  vendor("Kestrel Engineering", "engineering_firm", "V-1006"),
  vendor("Valley Electric Co-op", "utility", "V-1007"),
  vendor("Sightline Sign & Safety", "supplier", "V-1008"),
];
const vendorBy = (name) => vendors.find(v => v.name === name);

// ── Equipment ─────────────────────────────────────────────────────────────────
const unit = (number, year, make, model, opts = {}) => stamp(createEquipmentUnit({
  id: id("unit"), unitNumber: number, year: String(year), make, model,
  description: `${year} ${make} ${model}`,
  serialNumber: `SN${number}${year}`,
  primaryLocation: opts.location || "Main Shop",
  meterType: opts.meterType || "hours",
  currentMeter: opts.meter ?? between(1200, 9500),
  startingMeter: 0,
  femaRate: opts.rate ?? 0,
  fuelType: opts.fuelType || "diesel",
  taxClass: opts.taxClass || "off_road",
  status: opts.status || "active",
}));

const equipment = [
  unit("101", 2018, "John Deere", "770G Motor Grader", { rate: 92.50, meter: 7420 }),
  unit("102", 2021, "Caterpillar", "140 Motor Grader",  { rate: 98.75, meter: 3980 }),
  unit("103", 2015, "John Deere", "672G Motor Grader",  { rate: 88.00, meter: 11250 }),
  unit("210", 2019, "Caterpillar", "938M Loader",       { rate: 76.40, meter: 5310, location:"North Shop" }),
  unit("305", 2020, "Komatsu", "PC210 Excavator",       { rate: 84.15, meter: 4120 }),
  unit("402", 2017, "Peterbilt", "348 Dump Truck",      { rate: 61.30, meterType:"miles", meter: 84210, taxClass:"on_road" }),
  unit("403", 2022, "Mack", "Granite Dump Truck",       { rate: 66.80, meterType:"miles", meter: 41600, taxClass:"on_road" }),
  unit("510", 2023, "Ford", "F-250 Pickup",             { rate: 28.90, meterType:"miles", meter: 29800, fuelType:"gasoline", taxClass:"on_road" }),
  unit("511", 2019, "Chevrolet", "Silverado 2500",      { rate: 27.40, meterType:"miles", meter: 71400, fuelType:"gasoline", taxClass:"on_road", location:"South Shop" }),
  unit("620", 2016, "Bomag", "BW211 Roller",            { rate: 54.20, meter: 2870, status:"active" }),
];
const unitBy = (num) => equipment.find(u => u.unitNumber === num);

// ── Work orders ───────────────────────────────────────────────────────────────
const labor = (emp, date, hours, rate, extra = {}) => stamp(createLaborEntry({
  id: id("lab"), employeeId: emp.id,
  employeeName: emp.name, date, hours, straightTimeRate: rate,
  totalCost: Math.round(hours * rate * 100) / 100,
  ...extra,
}));

const workOrder = (num, unitNumber, description, category, opened, opts = {}) => {
  const u = unitBy(unitNumber);
  const mechanic = employees[2];
  const laborEntries = (opts.labor || []).map(([date, hours]) =>
    labor(mechanic, date, hours, 29.95));
  const totalLaborCost = laborEntries.reduce((s, e) => s + e.totalCost, 0);
  const totalPartsCost = opts.parts || 0;
  return stamp(createWorkOrder({
    id: id("wo"), workOrderNumber: num,
    unitId: u.id, unitNumber, unitDescription: u.description,
    description, category,
    priority: opts.priority || "routine",
    openedDate: opened,
    closedDate: opts.closed || "",
    status: opts.closed ? "closed" : "open",
    meterReadingOpen: opts.meterOpen || u.currentMeter,
    reportedBy: opts.reportedBy || "",
    laborEntries,
    totalLaborCost: Math.round(totalLaborCost * 100) / 100,
    totalPartsCost,
    totalCost: Math.round((totalLaborCost + totalPartsCost) * 100) / 100,
  }));
};

const workOrders = [
  workOrder("WO-2026-001", "101", "250-hour service — oil, filters, grease", "preventive",
            day(8),  { labor:[[day(8), 3.5]], parts: 218.44, closed: day(8) }),
  workOrder("WO-2026-002", "305", "Replace hydraulic pump", "hydraulic",
            day(21), { labor:[[day(21), 6], [day(22), 4.5]], parts: 2140.00, priority:"down", closed: day(23) }),
  workOrder("WO-2026-003", "402", "Brake chambers, both rear axles", "other",
            day(46), { labor:[[day(46), 5]], parts: 612.80, closed: day(47) }),
  workOrder("WO-2026-004", "102", "Circle drive noise — inspect and adjust", "hydraulic",
            day(74), { labor:[[day(74), 2]], parts: 0, closed: day(74) }),
  workOrder("WO-2026-005", "510", "Annual inspection", "inspection",
            day(103), { labor:[[day(103), 1.5]], parts: 45.00, closed: day(103) }),
  workOrder("WO-2026-006", "620", "Drum vibration fault", "other",
            day(160), { labor:[[day(160), 4]], parts: 0, priority:"urgent" }),
];

// ── Projects ──────────────────────────────────────────────────────────────────
const equipEntry = (u, date, hours, extra = {}) => stamp(createEquipmentEntry({
  id: id("eq"), equipmentId: u.id, unitNumber: u.unitNumber,
  date, hours, rate: u.femaRate,
  totalCost: Math.round(hours * u.femaRate * 100) / 100,
  ...extra,
}));

const materialEntry = (description, date, amount, extra = {}) => stamp(createMaterialEntry({
  id: id("mat"), description, date, totalCost: amount, ...extra,
}));

const project = (fields, entries = {}) => {
  const laborEntries      = entries.labor      || [];
  const equipmentEntries  = entries.equipment  || [];
  const materialEntries   = entries.materials  || [];
  return stamp(createProject({
    id: id("prj"), laborEntries, equipmentEntries, materialEntries, ...fields,
  }));
};

const projects = [
  // A maintenance job that STRADDLES the fiscal year — the exact case Greg
  // raised: one calendar-year number, two fiscal years. Worth being in the
  // sample so anybody testing a report meets it straight away.
  project({
    type:"maintenance", projectNumber:"M-2026-41", name:"Road 12 culvert replacement",
    projectType:"Culvert Replacement", status:"complete",
    workDescription:"Replace failed 36\" CMP at Road 12 / Avenue F",
    startDate:"2026-06-08", endDate:"2026-07-09", roadName:"Road 12",
  }, {
    labor: [labor(employees[0], "2026-06-09", 9, 28.20), labor(employees[1], "2026-06-09", 9, 26.70),
            labor(employees[0], "2026-07-07", 8, 28.20)],
    equipment: [equipEntry(unitBy("305"), "2026-06-09", 7), equipEntry(unitBy("402"), "2026-06-09", 6)],
    materials: [materialEntry("36\" RCP, 60 ft", "2026-06-08", 3180.00)],
  }),
  project({
    type:"maintenance", projectNumber:"M-2027-03", name:"Avenue K blading — north half",
    projectType:"Gravel Road — Grading / Shaping", status:"active",
    workDescription:"Routine shaping, Avenue K from Road 4 to Road 11",
    startDate: day(70), roadName:"Avenue K",
  }, {
    labor: [labor(employees[0], day(70), 10, 28.20), labor(employees[0], day(71), 10, 28.20)],
    equipment: [equipEntry(unitBy("101"), day(70), 9.5), equipEntry(unitBy("101"), day(71), 9.5)],
  }),
  project({
    type:"capital", projectNumber:"C1-512", name:"Road 7 bridge replacement",
    projectType:"Bridge Replacement", status:"active",
    workDescription:"Replace structurally deficient bridge over Willow Creek",
    fundingSource:"NDOT / STBG", isNDOT:true, ndotNumber:"BRO-C000(00)",
    startDate: day(30), endDate: day(300), estimatedCost: 1_240_000,
    roadName:"Road 7", isOneSixYear:true, oneSixYear:"Year 1",
    contractor:"Hartwell Bridge Company", contractAmount: 1_115_000, bidDate: day(12),
  }),
  project({
    type:"capital", projectNumber:"C1-513", name:"Avenue D resurfacing",
    projectType:"Road Resurfacing / Overlay", status:"planning",
    workDescription:"2 inch overlay, Avenue D from Road 2 to Road 6",
    fundingSource:"Local Match",
    estimatedCost: 385_000, roadName:"Avenue D",
    isOneSixYear:true, oneSixYear:"Year 2",
  }),
  project({
    type:"miscellaneous", name:"2026 Mowing", status:"active",
    workDescription:"Right-of-way mowing, whole county", calendarYear: 2026,
  }, {
    labor: [labor(employees[1], day(25), 8, 26.70), labor(employees[4], day(25), 8, 19.25),
            labor(employees[1], day(52), 8, 26.70)],
  }),
];

// ── Fund accounting ───────────────────────────────────────────────────────────
const expenditure = (date, vendorName, reference, lines, opts = {}) => {
  const v = vendorBy(vendorName);
  const expLines = lines.map(([code, description, amount]) =>
    createExpLine({ id: id("line"), code, description, amount }));
  return stamp(createExpenditure({
    id: id("exp"), date, vendor: v.name, vendorId: v.id,
    reference, lines: expLines,
    totalAmount: Math.round(expLines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    status: opts.status || "approved",
  }));
};

const expenditures = [
  expenditure(day(4),  "Prairie Fuel & Oil",      "88214", [["302.09","Machinery and Equipment Fuel", 14_812.50]]),
  expenditure(day(6),  "Midland Parts Supply",    "MP-4417", [["301.06","Shop Supplies", 218.44], ["201.0","Postal Service", 18.90]]),
  expenditure(day(19), "Cornerstone Aggregate",   "CA-9930", [["302.02","Gravel & Rock", 8_440.00]]),
  expenditure(day(23), "Redline Equipment Repair","R-2201",  [["214.0","Road Equipment Repair", 2_140.00]]),
  expenditure(day(33), "Prairie Fuel & Oil",      "88377",   [["302.09","Machinery and Equipment Fuel", 11_204.75]]),
  expenditure(day(41), "Sightline Sign & Safety", "SS-1188", [["302.05","Signs & Posts", 1_962.30]]),
  expenditure(day(47), "Midland Parts Supply",    "MP-4502", [["301.06","Shop Supplies", 612.80]]),
  expenditure(day(60), "Cornerstone Aggregate",   "CA-0104", [["302.02","Gravel & Rock", 12_905.60]]),
  expenditure(day(66), "Kestrel Engineering",     "KE-771",  [["501.0","Engineering Services", 18_500.00]]),
  expenditure(day(78), "Valley Electric Co-op",   "Aug",     [["202.0","Utilities", 486.12]]),
  expenditure(day(92), "Prairie Fuel & Oil",      "88601",   [["302.09","Machinery and Equipment Fuel", 13_077.20]]),
  expenditure(day(104),"Hartwell Bridge Company", "HB-3",    [["512.0","Capital Outlay Contracts", 223_000.00]], { status:"submitted" }),
];

const revenue = [
  stamp(createRevenue({ id:id("rev"), date:day(12), sourceName:"Example County Treasurer",
    code:"311.0", description:"Property tax apportionment", type:"intergovernmental",
    amount: 412_880.14, totalAmount: 412_880.14, status:"receipted",
    receiptNumber:"R-4412", receiptDate: day(14) })),
  stamp(createRevenue({ id:id("rev"), date:day(31), sourceName:"State of Nebraska",
    code:"334.0", description:"Highway allocation", type:"intergovernmental",
    amount: 186_402.00, totalAmount: 186_402.00, status:"receipted",
    receiptNumber:"R-4468", receiptDate: day(33) })),
  stamp(createRevenue({ id:id("rev"), date:day(58), sourceName:"Sheriff's Office",
    code:"347.01", description:"Fuel billed to other departments — August", type:"miscellaneous",
    amount: 1_284.66, totalAmount: 1_284.66, status:"receipted",
    receiptNumber:"R-4530", receiptDate: day(61) })),
  stamp(createRevenue({ id:id("rev"), date:day(88), sourceName:"Private landowner",
    code:"346.0", description:"Approach permit", type:"permit_fee",
    amount: 250.00, totalAmount: 250.00, status:"submitted", submittedDate: day(89) })),
  stamp(createRevenue({ id:id("rev"), date:day(112), sourceName:"Scrap metal buyer",
    code:"365.0", description:"Scrap iron", type:"miscellaneous",
    amount: 1_940.00, totalAmount: 1_940.00, status:"entered" })),
];

// ── Fuel ──────────────────────────────────────────────────────────────────────
// Tanks are carried in the sample with their own ids, because the deliveries and
// the fuel log point at them. Generic locations — a county restoring this should
// not find another county's shops in its tank list.
const tankDefs = [
  ["Main Shop Diesel",   "Main Shop",  "diesel",   8000, { tankType:"underground", isUnderground:true, hasMonitor:true, filledByContractor:true, openingGallons: 4200, openingValue: 13_650.00 }],
  ["Main Shop Unleaded", "Main Shop",  "unleaded", 8000, { tankType:"underground", isUnderground:true, hasMonitor:true, filledByContractor:true, openingGallons: 2600, openingValue: 7_566.00 }],
  ["North Shop",         "North Shop", "diesel",   1500, { filledByContractor:true, openingGallons: 700,  openingValue: 2_275.00 }],
  ["South Shop",         "South Shop", "diesel",   1000, { filledByContractor:true, openingGallons: 420,  openingValue: 1_365.00 }],
  ["Portable 402",       "Portable",   "diesel",    100, { tankType:"portable", carriedByUnit:"402" }],
];
const tanks = tankDefs.map(([name, location, fuelType, capacityGallons, extra]) =>
  stamp(createTank({
    id: id("tank"), name, location, fuelType, capacityGallons,
    openingDate: "2026-07-01", ...extra,
  })));
const tankBy = (name) => tanks.find(t => t.name === name);

const delivery = (tankName, date, gallons, unitCost, invoice) => {
  const t = tankBy(tankName);
  return stamp(createTankTransaction({
    id: id("tx"), type:"delivery", date, tankId: t.id, tankName: t.name,
    gallons, unitCost, deliveryCost: Math.round(gallons * unitCost * 100) / 100,
    vendorId: vendorBy("Prairie Fuel & Oil").id, invoiceNumber: invoice,
  }));
};

const tankTransactions = [
  delivery("Main Shop Diesel",   day(3),   4_500, 3.285, "88214"),
  delivery("Main Shop Unleaded", day(3),   2_000, 2.940, "88215"),
  delivery("North Shop",         day(17),    900, 3.310, "88290"),
  delivery("Main Shop Diesel",   day(32),  4_200, 3.402, "88377"),
  delivery("South Shop",         day(44),    600, 3.415, "88440"),
  delivery("Main Shop Diesel",   day(91),  4_800, 3.198, "88601"),
  delivery("Main Shop Unleaded", day(91),  1_800, 2.875, "88602"),
];

// One fuelling roughly every other day across the first four months, spread over
// the fleet — enough that a dashboard has a shape and a fuel tax quarter has
// something in it.
const fuelDispensing = [];
for (let i = 0; i < 70; i++) {
  const u = pick(equipment);
  const date = day(2 + i * 2);
  const diesel = u.fuelType === "diesel";
  const t = tankBy(diesel ? pick(["Main Shop Diesel","Main Shop Diesel","North Shop","South Shop"])
                          : "Main Shop Unleaded");
  const gallons = diesel ? between(28, 118, 1) : between(11, 26, 1);
  fuelDispensing.push(stamp(createFuelDispensing({
    id: id("fuel"), date, consumer:"county_equipment",
    equipmentId: u.id, unitNumber: u.unitNumber,
    meterType: u.meterType,
    meterReading: u.currentMeter - between(40, 900),
    fuelType: diesel ? "diesel" : "unleaded",
    gallons, sourceType:"tank", sourceTankId: t.id, sourceTankName: t.name,
    taxClass: u.taxClass,
    pumpedBy: pick(employees.filter(e => e.active)).name,
  })));
}
// Other departments, billed monthly at cost — always unleaded, never taxed.
for (const [dept, vehicle, offset, gallons] of [
  ["Sheriff",   "Patrol 4",  9,  18.4], ["Sheriff", "Patrol 2", 23, 16.1],
  ["Weed",      "Spray 1",  15,  22.8], ["Assessor", "Car 1",   38, 12.6],
  ["Emergency Management", "Command", 51, 24.9], ["Sheriff", "Patrol 4", 57, 17.7],
]) {
  fuelDispensing.push(stamp(createFuelDispensing({
    id: id("fuel"), date: day(offset), consumer:"other_department",
    departmentName: dept, outsideVehicle: vehicle,
    fuelType:"unleaded", gallons,
    sourceType:"tank",
    sourceTankId: tankBy("Main Shop Unleaded").id,
    sourceTankName: "Main Shop Unleaded",
    billingPeriod: day(offset).slice(0, 7),
  })));
}

// ── Infrastructure ────────────────────────────────────────────────────────────
const roads = [
  ["Road 7",    "County", "Avenue A", "Avenue F", "Gravel",     5.0],
  ["Road 12",   "County", "Avenue C", "Avenue K", "Gravel",     8.0],
  ["Avenue D",  "County", "Road 2",   "Road 6",   "Bituminous", 4.0],
  ["Avenue K",  "County", "Road 4",   "Road 11",  "Gravel",     7.0],
  ["Road 3",    "County", "State 00", "Avenue B", "Concrete",   1.5],
].map(([name, authority, from, to, surfaceType, lengthMiles], i) => stamp(createRoad({
  id: id("road"), name, authority, from, to, surfaceType,
  lengthMiles: String(lengthMiles), speedLimit: surfaceType === "Gravel" ? "50" : "55",
  latitude: (40.55 + i * 0.012).toFixed(6), longitude: (-98.40 - i * 0.015).toFixed(6),
  lastGraveled: surfaceType === "Gravel" ? day(-120 + i * 30) : "",
})));

const bridges = [
  ["C00101", "N 7.2",  "Road 7",   "Willow Creek", 1962, 4],
  ["C00118", "S 12.6", "Road 12",  "Dry Branch",   1978, 6],
  ["C00142", "E 3.1",  "Road 3",   "Willow Creek", 1994, 7],
].map(([stateNumber, countyNumber, road, features, yearBuilt, nbisRating], i) => stamp(createBridge({
  id: id("brg"), stateNumber, countyNumber, road, features,
  yearBuilt: String(yearBuilt), nbisRating, nbisInspected: day(-200 + i * 40),
  deckWidth:"24", structLength: String(40 + i * 15), spans: String(1 + (i % 2)),
  loadPosted: nbisRating <= 4, loadLimit: nbisRating <= 4 ? "20 T" : "",
  latitude: (40.56 + i * 0.02).toFixed(6), longitude: (-98.42 - i * 0.02).toFixed(6),
})));

const structures = [
  ["A 2.2",  "Structure", "Road 7",  4, [[2, "72", "58", "CMAP"]]],
  ["D 27.3", "Culvert",   "Road 12", 2, [[1, "18", "65", "CMP"], [1, "36", "65", "CMP"]]],
  ["B 14.1", "Structure", "Avenue K",5, [[1, "60", "44", "RCP"]]],
  ["C 9.4",  "Culvert",   "Avenue D",3, [[1, "24", "50", "CMP"]]],
].map(([culvertNumber, designation, road, rating, barrels], i) => stamp(createStructure({
  id: id("str"), culvertNumber, designation, road, rating,
  barrels: barrels.map(([count, size, length, type]) =>
    createStructureBarrel({ id: id("bar"), count, size, length, type })),
  yearBuilt: String(1985 + i * 6),
  latitude: (40.54 + i * 0.015).toFixed(6), longitude: (-98.38 - i * 0.017).toFixed(6),
})));

const signs = [
  ["1001", "W1-6", "Large Arrow",       "Road 7",   "Avenue B", 4],
  ["1002", "R1-1", "Stop",              "Road 12",  "Avenue C", 5],
  ["1003", "W2-1", "Cross Road",        "Avenue D", "Road 4",   3],
  ["1004", "R2-1", "Speed Limit 50",    "Avenue K", "Road 6",   4],
  ["1005", "W14-1","Dead End",          "Road 3",   "Avenue A", 2],
  ["1006", "R1-2", "Yield",             "Road 7",   "Avenue E", 5],
].map(([signName, signType, description, onRoad, roadBack, signRating], i) => stamp(createSign({
  id: id("sign"), signName, signType, description, onRoad, roadBack,
  reason: i % 3 === 0 ? "replacement" : "new",
  size: "30x30", height: "7", sheeting: "High Intensity Prismatic",
  supportType: "U-Channel", supportMaterial: "Steel", supportLength: "12",
  sideOfRoad: i % 2 ? "Right" : "Left", travelDirection: i % 2 ? "North" : "East",
  signRating,
  latitude: (40.55 + i * 0.008).toFixed(6), longitude: (-98.41 - i * 0.009).toFixed(6),
})));

// ── Assemble ──────────────────────────────────────────────────────────────────
//
// Note what is NOT here: inventoryItems, inventoryBatches, inventoryTransactions,
// inventoryGroups. Leaving them out is how the real crosswalked catalog survives
// a restore — an empty array would replace it, an absent key leaves it alone.
const data = {
  seedVersion: SEED_VERSION,
  countyInfo,
  employees,
  vendors,
  equipment,
  workOrders,
  projects,
  expenditures,
  revenue,
  tanks,
  tankTransactions,
  fuelDispensing,
  roads,
  bridges,
  structures,
  signs,
  // Merged key by key onto the shipped lookups, so this adds the classifications
  // the sample employees use without flattening anybody's other lists.
  lookups: { classifications: CLASSIFICATIONS },
};

const backup = buildBackup(data, {
  note: "Sample data for testing — Example County. Not real records.",
});
// buildBackup stamps the moment it ran; this file must not change when nothing
// in it changed, so the timestamp is pinned too.
backup.createdAt = AT;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(backup, null, 2) + "\n");

const rows = Object.entries(backup.counts)
  .map(([k, v]) => `  ${k.padEnd(22)} ${String(v).padStart(5)}`).join("\n");
console.log(`Wrote ${OUT}\n${rows}\n  ${"—".repeat(28)}\n  ${"total".padEnd(22)} ` +
            `${String(Object.values(backup.counts).reduce((a, b) => a + b, 0)).padStart(5)}`);
