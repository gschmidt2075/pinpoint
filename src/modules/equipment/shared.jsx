import {  } from "react";


// ── Equipment — shared helpers ────────────────────────────────────────────────
// Small things used by more than one of fleet / work orders / PM / fuel. Kept
// here rather than passed around, because a helper that three screens need is
// not a detail of any one of them.

export const STATUS_META = {
  active:         { label:"Active",         color:"#1a6b35", bg:"#e6f4ec" },
  out_of_service: { label:"Out of Service", color:"#c0392b", bg:"#fdecea" },
  in_shop:        { label:"In Shop",        color:"#d97706", bg:"#fef3cd" },
  sold:           { label:"Sold",           color:"#888",    bg:"#f0f0ee" },
};

export function StatusChip({ status }) {
  const m = STATUS_META[status] || { label:status, color:"#888", bg:"#f0f0f0" };
  return <span style={{ background:m.bg, color:m.color, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700 }}>{m.label}</span>;
}

// Today, as the app writes dates. Most entries are for today, so forms open on
// it rather than blank — a blank date input is a small tax paid on every row.

export const today = () => new Date().toISOString().split("T")[0];

export function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// Work order numbers are assigned by the reducer on save — see ADD_WORK_ORDER.
// A form only ever holds the work orders of the machine it is looking at, so
// numbering from here gave every unit its own 001.

// ── Module Shell ──────────────────────────────────────────────────────────────

export function lifetimeMeter(unit) {
  return (Number(unit?.meterOffset) || 0) + (Number(unit?.currentMeter) || 0);
}

// Default warning windows — roughly 10% of the interval, which lands about where
// you'd want to start scheduling.

export function operatingCost(unit, workOrders, dispensing) {
  const wos  = (workOrders || []).filter(w => w.unitId === unit.id);
  const fuel = (dispensing || []).filter(f => f.equipmentId === unit.id);

  const parts   = wos.reduce((s,w) => s + (w.totalPartsCost   || 0), 0);
  const labor   = wos.reduce((s,w) => s + (w.totalLaborCost   || 0), 0);
  const outside = wos.reduce((s,w) => s + (w.totalServiceCost || 0), 0);
  const fuelCost    = fuel.reduce((s,f) => s + (f.totalCost || 0), 0);
  const fuelGallons = fuel.reduce((s,f) => s + (f.gallons   || 0), 0);
  const total = parts + labor + outside + fuelCost;

  // Metered span we have evidence for
  const readings = fuel.map(f => f.meterReading).filter(v => v > 0);
  const lifetime = lifetimeMeter(unit);
  const earliest = readings.length ? Math.min(...readings) : null;
  const span     = earliest !== null && lifetime > earliest ? lifetime - earliest : null;

  return {
    parts, labor, outside, fuelCost, fuelGallons, total,
    span,
    unitLabel: unit.meterType === "miles" ? "mi" : "hr",
    perUnit:   span ? total / span : null,
    fuelPerUnit: span ? fuelCost / span : null,
    workOrderCount: wos.length,
  };
}

// ── PM due calculation ────────────────────────────────────────────────────────
// Meter readings drive the schedule. Becky reads them at every fuelling, service
// and repair, then flags what's due — this does the arithmetic for her.
// Lifetime meter = meterOffset + currentMeter, so a replaced gauge doesn't reset
// the clock.

export function onHandFor(itemId, batches) {
  return (batches || [])
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
}

export function buildFIFO(itemId, qty, batches) {
  const open = (batches || [])
    .filter(b => b.itemId === itemId && b.status === "open")
    .sort((a, b) => (a.receiptDate || "").localeCompare(b.receiptDate || ""));
  let remaining = qty;
  const lines = [];
  let totalCost = 0;
  for (const b of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.quantityRemaining || 0);
    if (take <= 0) continue;
    lines.push({
      batchId:   b.id,
      batchRef:  `${b.receiptDate || ""} — ${b.vendorName || b.receiptRef || "batch"}`,
      itemId:    b.itemId,
      itemName:  b.itemName || "",
      quantity:  take,
      unitCost:  b.unitCost || 0,
      totalCost: take * (b.unitCost || 0),
    });
    totalCost += take * (b.unitCost || 0);
    remaining -= take;
  }
  return { lines, totalCost, canFulfill: remaining <= 0, shortfall: Math.max(0, remaining) };
}

// ── WO Parts tab ──────────────────────────────────────────────────────────────
// Parts on a work order come OUT OF INVENTORY, same as anything else. Nothing is
// entered by hand — if it isn't in the catalog it can't be used. Cost is FIFO,
// not standard cost, and issuing decrements the batches.

export const EQUIPMENT_TYPES = [
  "Motor Grader","Dump Truck","Side Dump","Loader","Excavator / Gradall",
  "Pickup Truck","Crew Cab Truck","Flatbed Truck","Trailer","Mower / Tractor",
  "Skid Steer","Dozer","Roller / Compactor","Crane","Paver","Paint Striper",
  "Crack Sealer","Water Truck","Generator","Sign Truck","Other",
];

export const WO_CATEGORIES = [
  { value:"engine",      label:"Engine / Drivetrain" },
  { value:"hydraulic",   label:"Hydraulic System" },
  { value:"electrical",  label:"Electrical" },
  { value:"tires",       label:"Tires / Wheels" },
  { value:"body",        label:"Body / Frame" },
  { value:"preventive",  label:"Preventive Maintenance" },
  { value:"accident",    label:"Accident / Damage" },
  { value:"inspection",  label:"Inspection / DOT" },
  { value:"other",       label:"Other" },
];

export const WO_PRIORITIES = [
  { value:"routine", label:"Routine", color:"#1a6b35" },
  { value:"urgent",  label:"Urgent",  color:"#d97706" },
  { value:"down",    label:"Down",    color:"#c0392b" },
];

export const PM_TASKS = [
  "Oil & Filter Change","Air Filter","Fuel Filter","Hydraulic Filter",
  "Hydraulic Fluid Change","Coolant Flush","Grease / Lubrication",
  "Tire Rotation","Tire Replacement","Belt Inspection","Battery Check",
  "Brake Inspection","Annual Safety Inspection","DOT Inspection",
  "Winterization","Other",
];

// FEMA equipment rates — also exported for CostAccounting
