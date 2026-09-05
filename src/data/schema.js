// ─────────────────────────────────────────────────────────────────────────────
// Pinpoint — Shared Data Contract (schema.js)
// Single source of truth for every object shape in the application.
// Every module imports factory functions from here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilities ─────────────────────────────────────────────────────────────────
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const today = () => new Date().toISOString().split("T")[0];
export const now   = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// FUND ACCOUNTING
// ─────────────────────────────────────────────────────────────────────────────

// Expenditure line item
export const createExpLine = (overrides = {}) => ({
  id:          uid(),
  code:        "",          // expenditure code (e.g. "302.02")
  description: "",          // auto-filled from code lookup
  amount:      0,
  notes:       "",
  ...overrides,
});

// Expenditure (invoice / PO / credit card / etc.)
export const createExpenditure = (overrides = {}) => ({
  id:          uid(),
  date:        today(),
  vendor:      "",          // vendor name (from vendor list)
  vendorId:    null,        // vendor record id
  type:        "invoice",   // invoice | purchase_order | credit_card | reimbursement | direct_pay
  reference:   "",          // invoice #, PO #, etc.
  claimCycleId: "",         // which claim cycle this belongs to
  lines:       [createExpLine()],
  totalAmount: 0,           // calculated from lines
  status:      "entered",   // entered | submitted | approved
  notes:       "",
  createdAt:   now(),
  createdBy:   "",          // role (office manager, etc.)
  ...overrides,
});

// Revenue entry
//
// Revenue does NOT go through claim cycles — that's the expenditure side. Its
// own lifecycle runs through the Treasurer:
//
//   entered → submitted to Treasurer → receipted   (official)
//                                    ↘ returned → corrected → resubmitted
//
// The Treasurer's receipt is what makes it official, the way Board approval does
// for a claim — but it arrives from a different direction and on its own timing.
export const createRevenue = (overrides = {}) => ({
  id:          uid(),
  date:        today(),
  sourceName:  "",          // who it came from
  code:        "",          // revenue code (e.g. "347.01")
  description: "",
  type:        "miscellaneous", // grant | permit_fee | intergovernmental | bond_proceeds | miscellaneous
  lines:       [],          // { code, fund, amount }
  amount:      0,           // single-line convenience
  totalAmount: 0,
  reference:   "",
  status:      "entered",   // entered | submitted | receipted | returned
  // Treasurer
  submittedDate: "",
  receiptNumber: "",        // the Treasurer's receipt — this is what makes it official
  receiptDate:   "",
  returnedReason:"",        // why it came back for adjustment
  // Corrections after receipting are recorded, not silently applied, because the
  // Treasurer holds a matching record.
  adjustments: [],          // createRevenueAdjustment[]
  notes:       "",
  createdAt:   now(),
  ...overrides,
});

// A change made after the Treasurer has receipted the revenue.
export const createRevenueAdjustment = (overrides = {}) => ({
  id:          uid(),
  date:        today(),
  field:       "",          // what changed
  oldValue:    "",
  newValue:    "",
  reason:      "",
  enteredBy:   "",
  createdAt:   now(),
  ...overrides,
});

// Revenue may be edited freely until the Treasurer has receipted it.
export const revenueIsLocked = (r) => r?.status === "receipted";

export const REVENUE_STATUSES = [
  { id:"entered",   label:"Entered",   description:"Recorded, not yet sent to the Treasurer" },
  { id:"submitted", label:"With Treasurer", description:"Sent, awaiting a receipt" },
  { id:"receipted", label:"Receipted", description:"Officially recorded" },
  { id:"returned",  label:"Returned",  description:"Came back for adjustment" },
];

// Journal entry (post-approval corrections only)
export const createJournalEntry = (overrides = {}) => ({
  id:              uid(),
  date:            today(),
  description:     "",
  debitCode:       "",
  debitAmount:     0,
  creditCode:      "",
  creditAmount:    0,
  claimCycleRef:   "",      // which cycle this corrects
  enteredBy:       "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Claim cycle (generated from 1st & 3rd Tuesday schedule)
export const createClaimCycle = (overrides = {}) => ({
  id:          "",          // e.g. "2027-01-07"
  date:        "",          // YYYY-MM-DD (the Tuesday)
  label:       "",          // e.g. "January 7, 2027"
  fiscalYear:  "",          // e.g. "FY 2027"
  status:      "open",      // open | submitted | board_approved
  submittedAt: null,
  approvedAt:  null,
  notes:       "",
  ...overrides,
});

// Budget amendment
export const createAmendment = (overrides = {}) => ({
  id:          uid(),
  date:        today(),
  code:        "",
  description: "",
  amount:      0,           // positive = increase, negative = decrease
  reason:      "",
  approvedBy:  "",
  createdAt:   now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS & COST ACCOUNTING
// ─────────────────────────────────────────────────────────────────────────────

// Labor entry (one per employee per day per project)
export const createLaborEntry = (overrides = {}) => ({
  id:                uid(),
  date:              today(),
  employeeId:        null,
  employeeName:      "",
  classification:    "",          // from employee record
  straightTimeHours: 0,
  straightTimeRate:  0,           // from employee record
  overtimeHours:     0,
  overtimeRate:      0,           // from employee record
  fringeRate:        0,           // % from employee record, applied to straight-time
  totalCost:         0,           // calculated
  linkedAssets:      [],          // asset IDs from project's linked assets
  notes:             "",
  createdAt:         now(),
  ...overrides,
});

// Equipment entry
export const createEquipmentEntry = (overrides = {}) => ({
  id:             uid(),
  date:           today(),
  equipmentId:    null,
  equipmentName:  "",             // e.g. "2007 Gradall 4100II"
  unitNumber:     "",
  hoursOperated:  0,
  femaRate:       0,              // from equipment record
  totalCost:      0,              // calculated
  operatorLaborId: null,          // references labor entry from same date on this project
  operatorName:   "",             // resolved from labor entry
  linkedAssets:   [],
  notes:          "",
  createdAt:      now(),
  ...overrides,
});

// Material batch line (one per FIFO batch consumed)
export const createMaterialBatchLine = (overrides = {}) => ({
  id:              uid(),
  batchId:         null,          // inventory batch record id
  batchRef:        "",            // human-readable batch reference
  itemId:          null,
  itemName:        "",
  quantity:        0,
  unitOfMeasure:   "",
  unitCost:        0,             // from batch record
  totalCost:       0,             // calculated
  ...overrides,
});

// Material entry (may auto-split into multiple batch lines)
export const createMaterialEntry = (overrides = {}) => ({
  id:           uid(),
  date:         today(),
  itemId:       null,
  itemName:     "",
  quantity:     0,                // requested quantity
  unitOfMeasure: "",
  batchLines:   [],               // auto-generated createMaterialBatchLine[] by FIFO
  totalCost:    0,                // sum of batch lines
  linkedAssets: [],
  notes:        "",
  createdAt:    now(),
  ...overrides,
});

// Contractor / invoice entry
export const createContractorEntry = (overrides = {}) => ({
  id:              uid(),
  date:            today(),
  vendorId:        null,
  vendorName:      "",
  invoiceNumber:   "",
  description:     "",
  amount:          0,
  expenditureCode: "",            // ties to Fund Accounting
  linkedAssets:    [],
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Engineering fee entry
export const createEngineeringEntry = (overrides = {}) => ({
  id:              uid(),
  date:            today(),
  vendorId:        null,
  firmName:        "",            // from vendor list
  invoiceNumber:   "",
  phase:           "",            // design | inspection | survey | other
  amount:          0,
  expenditureCode: "",
  linkedAssets:    [],
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Project
export const createProject = (overrides = {}) => ({
  id:                uid(),
  type:              "capital",   // capital | maintenance | miscellaneous
  projectNumber:     "",          // C1-### | M-YYYY-## | null for misc
  name:              "",          // display name (required for misc)
  projectType:       "",          // e.g. "Bridge Replacement"
  // Status: capital & maintenance use full flow; misc is always active
  // capital/maintenance: planning | pending | active | complete | on_hold
  // miscellaneous: active | complete (auto at calendar year end)
  status:            "planning",
  workDescription:   "",
  fundingSource:     "Roads Fund",
  // FEMA
  isFEMA:            false,
  disasterNumber:    "",
  // NDOT
  isNDOT:            false,
  ndotNumber:        "",
  // Dates & money
  startDate:         "",
  endDate:           "",
  estimatedCost:     0,           // capital projects only
  // Location
  roadName:          "",
  roadSegments:      "",
  gps:               "",
  linkedAssets:      [],          // road/bridge/culvert/structure IDs
  // Capital-only
  isOneSixYear:      false,
  oneSixYear:        "Year 1",
  contractor:        "",
  contractAmount:    0,
  bidDate:           "",
  // Miscellaneous-only
  calendarYear:      new Date().getFullYear(),
  // Cost entries (live inside the project record)
  laborEntries:      [],
  equipmentEntries:  [],
  materialEntries:   [],
  contractorEntries: [],
  engineeringEntries:[],
  // Meta
  completionNotes:   "",
  createdAt:         now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────

// Inventory item (master record)
// A thing the county stocks.
//
// ONE ITEM PER PART NUMBER — even when it sits in five sheds. The old system
// could not hold one item in two places, so it made a row per place and used
// the commodity group to record which shed. That is why the group field ended
// up meaning two different things, and why a filter could not be transferred
// without inventing a second item.
//
// An item has NO location. It is wherever its stock is, and stock lives on the
// FIFO batches, each of which carries its own location. So `CARBIDE BLADE 3'`
// is one item with five batches, and moving six of them to Roseland is a
// transfer rather than a new item.
//
// Four separate ideas, where the old system had one field:
//
//   categoryId     what KIND of thing it is        Filters, Culverts, Grader Blades
//   (batches)      WHERE it is, and how much       Filter racks 18, Kenesaw 14
//   fitsEquipment  which machines it is FOR        compatibility, not location
//   partNumber     the maker's number              carries the size on a culvert
//
// categoryId and the batch locations both point at the SAME list of commodity
// groups — see createInventoryGroup. They start out identical for every item,
// and diverge the first time something is transferred. That divergence is the
// whole improvement over R&B, where moving a filter to Kenesaw meant
// overwriting the fact that it was a filter.
export const createInventoryItem = (overrides = {}) => ({
  id:              uid(),
  // The legacy Inventory # — and on many rows this is where the SIZE lives:
  // "18 X 20 ROUND" against a description of "New Annular Culvert". Kept as its
  // own column rather than mashed into the name, and searchable on its own.
  partNumber:      "",
  legacyNumber:    "",            // same thing, kept for older references
  name:            "",            // the human description
  description:     "",
  categoryId:      "",            // which group — see createInventoryGroup
  commodityGroup:  "",            // the raw legacy group, kept for tracing
  glAccountCode:   "",            // default expenditure code for purchasing
  unitOfMeasure:   "",            // fixed at creation: ton | LF | CY | EA | QUART | etc.
  fitsEquipment:   [],            // unit numbers this part is compatible with
  // Where on the shelf, for the things that need it. Most items do not: a
  // stockpile has no shelf, and neither does a fire extinguisher on a truck.
  // Blank means "not applicable", and every screen hides it rather than showing
  // an empty column — an always-present blank field trains people to skip it.
  //
  // This is the item's USUAL shelf. A batch carries its own `shelf` for the
  // case where the same part sits on different racks in different buildings;
  // the batch wins when it has one, and this is the fallback.
  shelfLocation:   "",
  // ── Fluids that are logged at the machine ────────────────────────────────
  //
  // DEF is bought in jugs, kept on a shelf at every shop, and poured into a
  // machine whole — Greg: "Typically an entire jug is dispensed into a machine
  // and no carryover per jug." So it is an INVENTORY item, not a tank, and it
  // is consumed a container at a time.
  //
  // But the person holding the jug is standing at the machine, not at a
  // computer in the parts room, so it is logged on the fuel screen alongside
  // diesel — Greg's call. `fluidType` is what puts an item on that screen.
  //
  // Not hardcoded to DEF, and not hardcoded to 2.5 gallons: he asked for the
  // size to be changeable and for bulk to be possible if the county ever goes
  // that way or another county already has. A bulk DEF tank is just a tank with
  // fuelType "def" and needs nothing here.
  // "" — an ordinary part, issued at a counter like anything else
  // "def" — jugs on a shelf, moved between shops and poured into machines.
  //         Lives on the DEF tab, which owns receiving, distributing and use.
  // "additive" — goes into a TANK, not a machine. Greg: "The BG products are
  //         fuel additives that go directly into the tanks... there needs to be
  //         a way to cost it out into the fuel." Not every BG product, so it is
  //         a per-item mark rather than a guess from the description.
  fluidType:       "",            // "" | def | additive
  unitGallons:     0,             // gallons in ONE catalog unit — 2.5 for a jug
  // Reorder point. These were being written by the crosswalk and read by the
  // Inventory screen but were never on the factory, so an item added by hand
  // came into the world without them — `item.trackStockLevel` was undefined
  // rather than false, and the low-stock check silently never fired for it.
  trackStockLevel: false,
  minimumQuantity: 0,
  standardCost:    0,             // contract/expected unit price
  primaryVendor:   "",
  receivingMode:   "standard",    // standard | scale_ticket_simple | scale_ticket_complex
  active:          true,
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Pick the batches an issue should come out of, oldest first.
//
// This lived inside Inventory.jsx, where it could not be tested and could not
// be reached by the fuel screen — which needs exactly the same arithmetic to
// take a jug of DEF off a shelf. Moved here, unchanged in behavior.
//
// `location` of "all" draws from anywhere; anything else is a commodity group
// code and confines the draw to that place.
export function buildFIFOLines(itemId, location, qtyNeeded, batches = []) {
  const open = batches
    .filter(b => b.itemId === itemId && b.status === "open" && (location === "all" || b.location === location))
    .sort((a, b) => String(a.receiptDate || "").localeCompare(String(b.receiptDate || "")));

  let remaining = Number(qtyNeeded) || 0;
  const batchLines = [];
  let totalCost = 0;

  for (const batch of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityRemaining || 0);
    if (take <= 0) continue;
    batchLines.push({
      batchId:   batch.id,
      batchRef:  `${batch.receiptDate} — ${batch.vendorName || ""}`,
      itemId:    batch.itemId,
      itemName:  batch.itemName || "",
      quantity:  take,
      unitCost:  batch.unitCost || 0,
      totalCost: take * (batch.unitCost || 0),
    });
    totalCost += take * (batch.unitCost || 0);
    remaining -= take;
  }

  return { batchLines, totalCost, canFulfill: remaining <= 0, short: Math.max(0, remaining) };
}

// Inventory batch (created on each receipt — drives FIFO)
export const createInventoryBatch = (overrides = {}) => ({
  id:              uid(),
  itemId:          null,
  receiptDate:     today(),
  receiptRef:      "",            // invoice # or scale ticket #
  transactionId:   null,          // links to the receiving transaction
  location:        "",            // storage location
  quantityReceived: 0,
  quantityRemaining: 0,           // decrements as issued
  unitCost:        0,             // cost at time of receipt
  totalCost:       0,             // calculated
  vendorId:        null,
  vendorName:      "",
  invoiceStatus:   "final",       // final | pending_reconciliation
  invoiceRef:      "",            // filled in when reconciled
  status:          "open",        // open | depleted
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Standard receiving transaction
export const createReceiveTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "receive",
  date:            today(),
  itemId:          null,
  itemName:        "",
  vendorId:        null,
  vendorName:      "",
  invoiceNumber:   "",
  quantity:        0,
  unitCost:        0,
  totalCost:       0,
  location:        "",
  expenditureRef:  "",            // Fund Accounting expenditure ID
  batchId:         null,          // batch created by this transaction
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Scale ticket transaction (gravel complex, asphalt/cold patch simple)
export const createScaleTicketTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "scale_ticket",
  mode:            "complex",     // complex (gravel) | simple (asphalt, cold patch)
  date:            today(),
  itemId:          null,
  itemName:        "",
  vendorId:        null,
  vendorName:      "",
  ticketNumber:    "",
  quantity:        0,
  unitOfMeasure:   "CY",
  // Complex (gravel) only
  haulType:        "county_pickup", // county_pickup | contractor_delivery
  destinationType: "wanda_stockpile", // wanda_stockpile | adams_central_stockpile | road_segment
  township:        "",            // if road_segment delivery — drives rate lookup
  // Rate (from contract rate schedule)
  contractId:      null,
  unitRate:        0,             // auto-populated from contract + haul type + destination
  totalCost:       0,             // calculated
  // Destination
  destinationLocation: "",        // stockpile name or road segment description
  projectId:       null,          // if going to road segment
  projectName:     "",
  // Invoice reconciliation
  invoiceStatus:   "pending_reconciliation", // pending_reconciliation | reconciled
  invoiceRef:      "",
  // Links
  batchId:         null,          // if going to stockpile — batch created
  projectMaterialEntryId: null,   // if going to project — material entry created
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Issue transaction (stock → project)
export const createIssueTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "issue",
  date:            today(),
  itemId:          null,
  itemName:        "",
  quantity:        0,
  location:        "",            // pulled from this location
  projectId:       null,
  projectName:     "",
  linkedAssets:    [],
  batchLines:      [],            // auto-generated by FIFO — createMaterialBatchLine[]
  totalCost:       0,
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Transfer transaction (stockpile → stockpile)
export const createTransferTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "transfer",
  date:            today(),
  itemId:          null,
  itemName:        "",
  quantity:        0,
  fromLocation:    "",
  toLocation:      "",
  batchId:         null,          // batch moves with the stock
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Adjustment transaction (quantity correction — FIFO order)
export const createAdjustmentTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "adjustment",
  date:            today(),
  itemId:          null,
  itemName:        "",
  location:        "",
  quantityAdjustment: 0,          // positive or negative
  reason:          "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Crosswalk transaction (one-time opening balance)
export const createCrosswalkTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "crosswalk",
  date:            today(),
  itemId:          null,
  itemName:        "",
  location:        "",
  quantity:        0,
  unitCost:        0,             // manually entered known cost
  totalCost:       0,
  batchId:         null,          // opening batch created
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Contract rate schedule entry (for gravel vendors)
export const createContractRate = (overrides = {}) => ({
  id:              uid(),
  contractId:      null,
  haulType:        "county_pickup",  // county_pickup | contractor_delivery
  destinationType: "stockpile_1",    // stockpile_1 | stockpile_2 | road_segment
  township:        "",               // if road_segment — which township
  unitRate:        0,
  unitOfMeasure:   "CY",
  effectiveDate:   today(),
  notes:           "",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// EQUIPMENT
// ─────────────────────────────────────────────────────────────────────────────

export const createEquipmentUnit = (overrides = {}) => ({
  id:              uid(),
  unitNumber:      "",            // e.g. "100", "111"
  year:            "",
  make:            "",
  model:           "",
  description:     "",           // e.g. "2007 Gradall 4100II"
  serialNumber:    "",
  vin:             "",
  licensePlate:    "",
  primaryLocation: "",           // shed name
  // Meters — off-road equipment runs on hours, on-road on miles.
  // Read at every fuelling, service and repair.
  meterType:       "hours",      // hours | miles
  currentMeter:    0,            // what the gauge reads right now
  // When a meter is replaced, the broken one's final reading is banked here so a
  // lifetime total is still knowable: lifetime = meterOffset + currentMeter.
  meterOffset:     0,
  meterHistory:    [],           // createMeterReplacement[]
  // One rate. The internal rate was always set equal to the FEMA published rate
  // in practice, and two fields holding the same number is two things to keep
  // in step and one of them to get wrong.
  femaRate:        0,            // $/hour
  // What the machine burns, so fuelling can be checked against the tank and a
  // gasoline unit is never filled from the diesel tank by accident.
  fuelType:        "diesel",     // diesel | gasoline | def | propane | electric
  // Whether this machine's diesel is taxable.
  //
  // The county buys DYED diesel, which is untaxed at the pump, and owes the
  // motor fuel tax on whatever goes into something that drives on a road. It
  // is remitted quarterly, so the quarter's on-road gallons are a number the
  // program has to be able to produce.
  //
  // Greg: "Yes on the machine, that would take away having to select the
  // difference when you log fuel and would make it easier." A grader is always
  // off-road and a pickup is always on-road; it is a property of the machine,
  // not a choice at the pump, and a choice at the pump is a choice somebody
  // gets wrong at five in the afternoon.
  taxClass:        "off_road",   // off_road | on_road
  // A machine arrives with hours already on it — even a new one. Without this
  // the first service interval is measured from the wrong place.
  startingMeter:   0,
  engineMake:      "",
  engineModel:     "",
  engineSize:      "",           // "6.7L", "C9 ACERT"
  // Serviceable parts and capacities. Lists rather than fixed fields, because a
  // grader has three hydraulic filters and a pickup has one oil filter — any
  // fixed set of columns is wrong for something on day one.
  filters:         [],           // createEquipmentPart[]
  fluids:          [],           // createEquipmentFluid[]
  tires:           [],           // createEquipmentTire[]
  dateAcquired:    "",
  purchasePrice:   0,
  status:          "active",     // active | out_of_service | sold
  salePrice:       0,
  dispositionDate: "",
  dispositionNotes:"",
  pmSchedule:      [],           // PM schedule entries
  hireDate:        "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// PM log entry
// ── What a machine takes ─────────────────────────────────────────────────────
//
// The OEM number is the one stamped on the part. It is recorded even when the
// county buys aftermarket, because it is the number every cross-reference is
// keyed on — you look up the OEM part to find out what fits.
//
// itemId optionally ties the entry to a catalog item, so the shop can see
// whether the filter is on the shelf without leaving the machine's record.
export const createEquipmentPart = (overrides = {}) => ({
  id:              uid(),
  kind:            "oil",        // see EQUIPMENT_PART_KINDS
  position:        "",           // "primary", "secondary", "left bank" — when there is more than one
  oemPartNumber:   "",
  alternatePartNumber: "",       // the aftermarket equivalent actually bought
  quantity:        1,
  itemId:          null,         // catalog item, when it is stocked
  notes:           "",
  ...overrides,
});

// Filters and other regularly-changed parts. Greg listed air, oil and hydraulic;
// the rest are the ones that also get changed on a schedule and are worth having
// a number for when the machine is down and someone is on the phone to a supplier.
export const EQUIPMENT_PART_KINDS = [
  { value:"oil",           label:"Oil Filter" },
  { value:"air_primary",   label:"Air Filter — Primary" },
  { value:"air_secondary", label:"Air Filter — Secondary / Safety" },
  { value:"hydraulic",     label:"Hydraulic Filter" },
  { value:"fuel",          label:"Fuel Filter" },
  { value:"water_separator", label:"Fuel / Water Separator" },
  { value:"transmission",  label:"Transmission Filter" },
  { value:"cabin_air",     label:"Cab Air Filter" },
  { value:"coolant",       label:"Coolant Filter" },
  { value:"def",           label:"DEF Filter" },
  { value:"breather",      label:"Breather / Vent" },
  { value:"belt",          label:"Belt" },
  { value:"battery",       label:"Battery" },
  { value:"wiper",         label:"Wiper Blade" },
  { value:"other",         label:"Other" },
];

// Fluids and how much goes in. Capacity is the point — it is what you need at
// 6am when the machine is down and someone has to know how many gallons to draw.
export const createEquipmentFluid = (overrides = {}) => ({
  id:              uid(),
  kind:            "engine_oil", // see EQUIPMENT_FLUID_KINDS
  specification:   "",           // "15W-40 CJ-4", "TO-4 30wt", "50/50 ELC"
  capacity:        0,
  unitOfMeasure:   "QT",         // QT | GAL | L
  notes:           "",
  ...overrides,
});

export const EQUIPMENT_FLUID_KINDS = [
  { value:"engine_oil",     label:"Engine Oil" },
  { value:"hydraulic",      label:"Hydraulic Oil" },
  { value:"transmission",   label:"Transmission" },
  { value:"coolant",        label:"Coolant" },
  { value:"differential",   label:"Differential" },
  { value:"final_drive",    label:"Final Drive / Planetary" },
  { value:"transfer_case",  label:"Transfer Case" },
  { value:"def",            label:"DEF" },
  { value:"grease",         label:"Grease" },
  { value:"brake",          label:"Brake Fluid" },
  { value:"power_steering", label:"Power Steering" },
  { value:"other",          label:"Other" },
];

// Tyre sizes differ front to back on most of this equipment, so position is
// part of the answer rather than a detail.
export const createEquipmentTire = (overrides = {}) => ({
  id:              uid(),
  position:        "front",      // front | rear | all | inner | outer | spare
  size:            "",           // "14.00R24", "LT265/70R17"
  ply:             "",
  quantity:        0,
  pressure:        "",           // cold PSI
  itemId:          null,
  notes:           "",
  ...overrides,
});

export const TIRE_POSITIONS = ["front", "rear", "all", "inner", "outer", "spare"];

export const FUEL_TYPES = [
  { value:"diesel",   label:"Diesel" },
  { value:"gasoline", label:"Gasoline" },
  { value:"propane",  label:"Propane" },
  { value:"electric", label:"Electric" },
];

// What can be logged on the fuel screen. DEF is here and not in FUEL_TYPES
// because a machine does not RUN on it — nothing should offer DEF as the fuel
// a grader burns — but it is poured in at the same moment by the same person.
export const DISPENSABLE_TYPES = [
  { value:"diesel",   label:"Diesel" },
  { value:"unleaded", label:"Unleaded" },
  { value:"def",      label:"DEF" },
];

// A meter swap. The old gauge's final reading is banked into the unit's
// meterOffset so lifetime totals survive the replacement.
export const createMeterReplacement = (overrides = {}) => ({
  id:              uid(),
  equipmentId:     null,
  date:            today(),
  oldFinalReading: 0,            // what the broken meter last showed
  newStartReading: 0,            // what the replacement starts at, usually 0
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// A recurring service on a unit — "oil every 250 hours", "trans every 40,000 miles".
// Real intervals in use (confirmed 2026-07-27):
//   On/off road trucks  oil 5,000 mi   · trans/hydraulic/fuel 40,000 mi
//   On-road trucks (2)  oil 10,000 mi  · trans/hydraulic/fuel 40,000 mi
//   Off-road equipment  oil 250 hr     · trans/fuel 500 hr · trans/fuel/hyd 1,000 hr
//   Greasing            as needed, several times a day — not scheduled
// A service and how often it comes round.
//
// SET ONCE. Everything below `lastDone` is maintained by the system — closing a
// PM work order stamps the reading and the date, and the clock resets. Nobody
// should ever be editing these by hand after the first setup.
//
// Two thresholds, and whichever arrives first wins:
//
//   · meter — every 250 hours, every 5,000 miles
//   · calendar — every 6 months
//
// Both matter. A machine that sits all winter still needs its oil changed even
// though the hour meter has not moved, and a machine working flat out hits 250
// hours long before six months are up. Either alone gets one of those wrong.
export const createPMSchedule = (overrides = {}) => ({
  id:              uid(),
  equipmentId:     null,
  service:         "",           // "Oil & Filter", "Hydraulic Service", …
  // Meter threshold — leave interval at 0 for a calendar-only service.
  intervalType:    "hours",      // hours | miles
  interval:        0,            // e.g. 250, 5000
  // Calendar threshold — 0 for meter-only.
  intervalMonths:  0,            // e.g. 6, 12
  warnAhead:       0,            // meter units ahead to warn; 0 uses a default
  warnAheadDays:   0,            // days ahead to warn; 0 uses a default
  // ── maintained automatically from here ──
  lastDoneMeter:   null,         // lifetime meter at last service
  lastDoneDate:    "",
  active:          true,
  notes:           "",
  ...overrides,
});

// The intervals actually in use, offered as one-click presets when setting a
// unit up. Confirmed 2026-07-27.
export const PM_PRESETS = {
  on_off_road_truck: [
    { service:"Oil & Filter",              intervalType:"miles", interval:5000 },
    { service:"Transmission Service",      intervalType:"miles", interval:40000 },
    { service:"Hydraulic Service",         intervalType:"miles", interval:40000 },
    { service:"Fuel System Service",       intervalType:"miles", interval:40000 },
  ],
  on_road_truck: [
    { service:"Oil & Filter",              intervalType:"miles", interval:10000 },
    { service:"Transmission Service",      intervalType:"miles", interval:40000 },
    { service:"Hydraulic Service",         intervalType:"miles", interval:40000 },
    { service:"Fuel System Service",       intervalType:"miles", interval:40000 },
  ],
  off_road_equipment: [
    { service:"Oil & Filter",              intervalType:"hours", interval:250 },
    { service:"Transmission Service",      intervalType:"hours", interval:500 },
    { service:"Fuel System Service",       intervalType:"hours", interval:500 },
    { service:"Hydraulic Service",         intervalType:"hours", interval:1000 },
  ],
};

export const PM_PRESET_LABELS = {
  on_off_road_truck:  "On/Off Road Truck — oil 5,000 mi",
  on_road_truck:      "On-Road Truck — oil 10,000 mi",
  off_road_equipment: "Off-Road Equipment — oil 250 hr",
};

export const createPMLog = (overrides = {}) => ({
  id:              uid(),
  equipmentId:     null,
  scheduleId:      null,
  date:            today(),
  service:         "",
  meterReading:    0,
  performedBy:     "",
  cost:            0,
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// EQUIPMENT — WORK ORDERS
// A work order is a repair/maintenance event on a specific equipment unit.
// It replaces the "one long maintenance project per machine" pattern.
// Labor entries reuse createLaborEntry; part entries reuse createMaterialEntry.
// Outside service (shop work, tires, etc.) uses createWorkOrderServiceEntry.
// ─────────────────────────────────────────────────────────────────────────────

export const createWorkOrder = (overrides = {}) => ({
  id:               uid(),
  workOrderNumber:  "",          // e.g. "WO-2026-001" — auto or manual
  unitId:           null,        // equipment unit id
  unitNumber:       "",          // e.g. "105"
  unitDescription:  "",          // e.g. "2007 Gradall 4100II"
  description:      "",          // what is being done (e.g. "Replace hydraulic pump")
  category:         "other",     // engine | hydraulic | electrical | tires | body | preventive | accident | inspection | other
  // A PM is a work order like any other — parts come out of inventory, labor is
  // costed, and it rolls into the unit's operating cost. These two fields link it
  // back to the schedule it satisfies so closing it can reset the interval.
  // Kept as a distinct category so repair analysis can exclude routine service.
  pmScheduleId:     null,
  pmService:        "",          // "Oil & Filter", "Hydraulic Service", …
  priority:         "routine",   // routine | urgent | down (down = machine out of service)
  openedDate:       today(),
  closedDate:       "",
  meterReadingOpen: 0,           // hour/odometer reading when work order opened
  meterReadingClose:0,           // hour/odometer reading when closed
  status:           "open",      // open | closed | void
  reportedBy:       "",          // who reported the problem
  // Cost entries (parallel to project cost entries)
  laborEntries:     [],          // createLaborEntry[] — same as projects
  partEntries:      [],          // createMaterialEntry[] — FIFO from inventory
  serviceEntries:   [],          // createWorkOrderServiceEntry[] — outside work
  // Totals (calculated from entries)
  totalLaborCost:   0,
  totalPartsCost:   0,
  totalServiceCost: 0,
  totalCost:        0,
  notes:            "",
  createdAt:        now(),
  ...overrides,
});

// Outside service entry on a work order (shop work, tires, specialized repair)
// NOTE: If paid through a vendor claim, link via expenditureRef.
// Work order numbers must be unique across the whole fleet, not per machine.
// Generating them from a filtered list gave every unit its own 001, so the same
// number appeared on several machines. This is called from the reducer, which
// is the only place that can see every work order.
export function nextWorkOrderNumber(workOrders = [], date = today()) {
  const year   = String(date).slice(0, 4) || String(new Date().getFullYear());
  const prefix = `WO-${year}-`;
  const highest = workOrders.reduce((max, w) => {
    const n = String(w?.workOrderNumber || "");
    if (!n.startsWith(prefix)) return max;
    return Math.max(max, parseInt(n.slice(prefix.length), 10) || 0);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export const createWorkOrderServiceEntry = (overrides = {}) => ({
  id:             uid(),
  date:           today(),
  vendorId:       null,
  vendorName:     "",
  description:    "",            // what service was performed
  invoiceNumber:  "",
  amount:         0,
  expenditureRef: "",            // Fund Accounting expenditure ID (if paid via claim cycle)
  notes:          "",
  createdAt:      now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// FUEL & TANKS
// ─────────────────────────────────────────────────────────────────────────────

export const createTank = (overrides = {}) => ({
  id:              uid(),
  name:            "",           // e.g. "Main Shop Diesel", "402F"
  location:        "",           // Main Shop | Pauline | Kenesaw | Roseland | Holstein | Portable
  fuelType:        "diesel",     // diesel | unleaded
  tankType:        "above_ground",// underground | above_ground | portable
  capacityGallons: 0,
  currentLevel:    0,            // calculated from transactions
  // Main shop tanks have an electronic monitor, balanced against the paper logs
  // daily. Outlying sheds don't — they're dipped once a year.
  hasMonitor:      false,
  // Outlying sheds are filled by contracted tank wagons owned by other companies,
  // not from our own stock.
  filledByContractor: false,
  // Portable tanks ride on a pickup and are named after it — 402F is on unit 402.
  carriedByUnit:   "",
  // Underground tanks are regulated. Nebraska requires a DAILY inventory record
  // for every UST — see createDailyInventory below. Above-ground tanks are not
  // covered by that rule, so this flag decides whether the obligation applies.
  isUnderground:   false,
  // Registration details the Fire Marshal asks for at the annual inspection.
  facilityId:      "",           // state facility / registration number
  tankRegistrationId: "",
  installedDate:   "",
  status:          "active",     // active | out_of_service
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// The eight real tanks, confirmed 2026-07-27.
// Every tank is filled by a contractor's tank wagon except the two portables,
// which are filled from the shop's own stock. Corrected 2026-08-15 — Greg.
export const DEFAULT_TANKS = [
  // The two shop tanks are the only USTs — they carry the daily inventory
  // obligation. Everything else is above ground and does not.
  { name:"Main Shop Diesel",   location:"Main Shop", fuelType:"diesel",   capacityGallons:8000, hasMonitor:true, filledByContractor:true, tankType:"underground", isUnderground:true },
  { name:"Main Shop Unleaded", location:"Main Shop", fuelType:"unleaded", capacityGallons:8000, hasMonitor:true, filledByContractor:true, tankType:"underground", isUnderground:true },
  { name:"Kenesaw",            location:"Kenesaw",   fuelType:"diesel",   capacityGallons:1500, filledByContractor:true },
  { name:"Holstein",           location:"Holstein",  fuelType:"diesel",   capacityGallons:1000, filledByContractor:true },
  { name:"Roseland",           location:"Roseland",  fuelType:"diesel",   capacityGallons:1000, filledByContractor:true },
  { name:"Pauline",            location:"Pauline",   fuelType:"diesel",   capacityGallons:1000, filledByContractor:true },
  { name:"402F",               location:"Portable",  fuelType:"diesel",   capacityGallons:100, tankType:"portable", carriedByUnit:"402" },
  { name:"430F",               location:"Portable",  fuelType:"diesel",   capacityGallons:100, tankType:"portable", carriedByUnit:"430" },
].map(t => createTank(t));

// Tank transaction (delivery, dispense, portable fill, dip reading)
export const createTankTransaction = (overrides = {}) => ({
  id:              uid(),
  type:            "delivery",   // delivery | dispense | portable_fill | dip_reading
  date:            today(),
  tankId:          null,
  tankName:        "",
  gallons:         0,            // positive = in, negative = out
  // Delivery
  vendorId:        null,
  invoiceNumber:   "",
  deliveryCost:    0,
  unitCost:        0,
  // Dispense (fuel to equipment)
  fuelDispensingId: null,        // links to fuel dispensing entry
  // Additive — a BG product or similar, added to the fuel.
  //
  // Greg: "The fuel additive is added at the same time of delivery... it should
  // probably be under the delivery tab."
  //
  // So it lives ON a delivery, and its cost joins that load's own gallons and
  // rides with them: treat 5,000 gallons at $3.50 with $100 of BG and the layer
  // is 5,000 gallons at $3.52. Fuel already in the tank was not treated and is
  // not charged for it.
  //
  // There is deliberately no way to dose a tank that is already full. It would
  // be a second screen for a thing the county does not do, and a second way to
  // record one event is how two people record it differently.
  additiveItemId:  null,         // the inventory item it came off the shelf as
  additiveItemName: "",
  additiveQty:     0,            // containers issued
  additiveCost:    0,            // what those containers cost, FIFO
  // Portable fill
  sourceTankId:    null,         // fixed tank that was drawn from
  destinationTankId: null,       // portable tank being filled
  // Dip reading (reconciliation)
  dipReading:      0,            // actual measured gallons
  variance:        0,            // dipReading - calculated level
  // ── The money side of a delivery ────────────────────────────────────────
  // A delivery is fuel arriving AND an invoice to pay. Recording it once has to
  // do both, or the office keys the same paperwork twice and one of the two
  // eventually gets missed.
  //
  // Fuel is bid PER DELIVERY, not on a standing contract — the Parts Manager
  // takes bids for each load, so she knows the price per gallon when the truck
  // arrives. That means the claim is complete from the start; the invoice
  // arriving later only confirms it.
  expenditureId:   null,         // the claim line this created
  deliveryTicket:  "",           // what the driver leaves
  // No bid reference. Greg: "There does not need to be a bid reference for a
  // delivery. It is not a necessary note." Fuel is bid per load, so the price
  // on the ticket IS the bid — a separate reference restated it and was never
  // read back.
  invoiceStatus:   "expected",   // expected | reconciled | disputed
  invoicedAmount:  0,            // what the invoice actually said, when it lands
  reconciledDate:  "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// UNDERGROUND STORAGE TANKS — DAILY INVENTORY RECORD
//
// Nebraska requires owners of USTs to conduct and record DAILY product
// inventory control under 40 CFR 280.43(a)(1)-(6), for existing tanks as well
// as new ones. The State Fire Marshal publishes a Daily Inventory Record form
// and inspects every tank at least once a year, with release detection records
// the first thing looked at.
//
// What the rule asks for, and what each field here is:
//
//   · inputs, withdrawals and amount remaining, recorded every operating day
//   · product level sticked to the nearest 1/8 inch
//   · deliveries sticked BEFORE and AFTER the drop
//   · dispensing metered
//   · water level measured monthly, also to 1/8 inch
//   · reconciled monthly — loss or gain must not exceed 1% of throughput
//     plus 130 gallons
//
// The point of the record is the comparison: what the book says should be in
// the tank versus what the stick says is actually in it. A tank that quietly
// disagrees month after month is how a leak announces itself.
export const createDailyInventory = (overrides = {}) => ({
  id:              uid(),
  tankId:          null,
  tankName:        "",
  date:            today(),
  // HOW the level was measured. Adams County reads the electronic monitor daily
  // and sticks once a year — the stick is there to check the monitor, not to
  // replace it. Both are legitimate; the record has to say which was used, or
  // the annual gauge check has nothing to compare against.
  measuredBy:      "monitor",    // monitor | stick
  // Gallons. Openings normally carry over from yesterday's close, but they are
  // measured rather than assumed — that is the whole point.
  openingStick:    0,
  closingStick:    0,
  // Deliveries in and product out. Filled from the tank transactions and the
  // dispensing log so nobody keys the same gallons twice, but editable because
  // the paper log is the record of authority if they disagree.
  deliveries:      0,
  dispensed:       0,
  // Sticked before and after a delivery — the rule asks for both.
  deliveryStickBefore: null,
  deliveryStickAfter:  null,
  // The annual check: stick the tank and compare it against what the monitor
  // says on the same day. This verifies the GAUGE, which is a different
  // question from whether the tank is losing product.
  gaugeCheckStick:   null,       // what the stick read
  gaugeCheckMonitor: null,       // what the monitor read at the same moment
  // Monthly, to the nearest 1/8 inch. Water in the bottom of a tank is both a
  // product-quality problem and a possible sign of a breach.
  waterInches:     null,
  recordedBy:      "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// What the book says should be in the tank at close of day.
export const bookClosing = (r) =>
  (Number(r?.openingStick) || 0) + (Number(r?.deliveries) || 0) - (Number(r?.dispensed) || 0);

// Stick minus book. Negative means less fuel than there should be.
export const dailyVariance = (r) => (Number(r?.closingStick) || 0) - bookClosing(r);

// The monthly reconciliation the rule actually turns on.
//
// Loss or gain across the month must not exceed 1.0% of throughput plus 130
// gallons. Throughput is what went THROUGH the tank — the product dispensed —
// not what was delivered into it.
export const UST_VARIANCE_PERCENT = 0.01;
export const UST_VARIANCE_CONSTANT = 130;

export function ustMonthlyReconciliation(records = []) {
  const rows = records.filter(Boolean);
  if (!rows.length) return null;

  const sorted     = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const throughput = sorted.reduce((s, r) => s + (Number(r.dispensed) || 0), 0);
  const delivered  = sorted.reduce((s, r) => s + (Number(r.deliveries) || 0), 0);

  // Measured across the month end to end, not the sum of daily wobble — a stick
  // read an eighth of an inch high one day and low the next is not a loss.
  const opening = Number(sorted[0].openingStick) || 0;
  const closing = Number(sorted[sorted.length - 1].closingStick) || 0;
  const book    = opening + delivered - throughput;
  const variance = closing - book;

  const threshold = throughput * UST_VARIANCE_PERCENT + UST_VARIANCE_CONSTANT;
  const water = sorted.map(r => r.waterInches).filter(v => v !== null && v !== undefined);

  return {
    days: sorted.length,
    from: sorted[0].date,
    to:   sorted[sorted.length - 1].date,
    opening, closing, delivered, throughput,
    book, variance,
    threshold,
    // Over the threshold is a reportable suspected release, not a rounding note.
    pass: Math.abs(variance) <= threshold,
    // The rule wants water measured at least monthly. No reading is itself a gap.
    waterReadings: water.length,
    maxWater: water.length ? Math.max(...water) : null,
    waterMissing: water.length === 0,
  };
}

// The annual gauge verification — stick against monitor on the same day.
//
// This answers "is the monitor telling the truth", not "is the tank leaking".
// A monitor reading two hundred gallons high will pass every daily
// reconciliation while hiding a real loss, because everything is measured
// against the same wrong number.
export function gaugeCheck(r) {
  const stick   = r?.gaugeCheckStick;
  const monitor = r?.gaugeCheckMonitor;
  if (stick == null || monitor == null) return null;
  const difference = Number(stick) - Number(monitor);
  return {
    stick: Number(stick), monitor: Number(monitor), difference,
    // Manufacturers generally hold ATG to well inside this; a tank disagreeing
    // with its own gauge by more than a stick's read error wants looking at.
    agrees: Math.abs(difference) <= 25,
  };
}

// When was the gauge last verified against a stick?
export function lastGaugeCheck(records = [], tankId) {
  return records
    .filter(r => r.tankId === tankId && r.gaugeCheckStick != null && r.gaugeCheckMonitor != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

// Does the invoice agree with what the bid says it should have cost?
//
// This is the check worth having. The county agreed a price per gallon; if the
// invoice does not equal gallons times that price, either the gallons or the
// rate is wrong, and someone should look before it goes on a claim.
export function fuelInvoiceVariance(tx) {
  if (!tx || tx.type !== "delivery") return null;
  const expected = (Number(tx.gallons) || 0) * (Number(tx.unitCost) || 0);
  const actual   = Number(tx.invoicedAmount) || 0;
  if (!actual) return { state: "awaiting", expected, actual: 0, difference: 0 };
  const difference = actual - expected;
  // A cent or two is rounding on a five-thousand-gallon load, not a dispute.
  const state = Math.abs(difference) <= 0.05 ? "agrees" : "differs";
  return { state, expected, actual, difference };
}

// Fuel dispensing entry (fuel from any tank to equipment)
export const createFuelDispensing = (overrides = {}) => ({
  id:              uid(),
  date:            today(),
  // Who took the fuel. Five other county departments fuel at the shop and are
  // billed monthly at cost.
  consumer:        "county_equipment", // county_equipment | other_department
  // — county equipment —
  equipmentId:     null,
  unitNumber:      "",
  meterReading:    0,            // hour meter OR odometer, read at every fuelling
  meterType:       "hours",      // hours | miles (from the equipment record)
  // — other department —
  departmentName:  "",           // Weed | Sheriff | Assessor | Emergency Management | Maintenance
  outsideVehicle:  "",           // their vehicle, as written on the log
  outsideOdometer: "",           // their mileage, as written on the log
  // Common
  fuelType:        "diesel",
  gallons:         0,
  // Where it came from. A tank is pumped; DEF comes off a shelf a jug at a
  // time. Both end up as one record, because "what has this machine had put
  // into it" is one question.
  sourceType:      "tank",       // tank | inventory
  inventoryItemId: null,         // when sourceType is inventory
  inventoryItemName: "",
  inventoryLocation: "",         // the commodity group code it was taken from
  containers:      0,            // how many jugs — gallons is containers × unitGallons
  pumpedBy:        "",           // who actually pumped it
  taxClass:        "off_road",   // off_road | on_road — tracked for fuel tax
  // Both derived from the tank's FIFO layers and rewritten by
  // recostFuelDispensing whenever a delivery, fill or fuelling changes. Never
  // typed, and never the place a price is decided.
  unitCost:        0,            // $/gal — the blend of the layers this draw took
  totalCost:       0,
  costEstimated:   false,        // true when the tank had no priced fuel to draw
  sourceTankId:    null,
  sourceTankName:  "",
  // Billing — other departments only. Reconciled weekly, billed the 1st monthly.
  billingPeriod:   "",           // "2026-07" — the month being billed
  billedDate:      "",           // when the bill went out
  paidDate:        "",           // revenue is recognised when the check arrives
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Departments that fuel at the shop. Editable in Settings.
export const DEFAULT_FUEL_DEPARTMENTS = [
  "Weed", "Sheriff", "Assessor", "Emergency Management", "Maintenance",
];

// ─────────────────────────────────────────────────────────────────────────────
// FLUIDS ON A SHELF — DEF
//
// Greg, on how DEF actually moves:
//
//   "Jugs at all shops no bulk."
//   "Typically an entire jug is dispensed into a machine and no carryover per
//    jug so I think it would be easy to cost out."
//   "Fuel Screen."
//   "It is usually just logged to the machine that likely used it."
//
// So: an inventory item, held at every shop, consumed a whole container at a
// time, logged where the person already is, and costed onto the machine.
//
// The last quote is about the jugs nobody wrote down. When the count comes up
// short, the missing DEF is not written off — it is logged to the machine that
// probably had it, which is the same screen and the same action as logging it
// on the day. Nothing extra to build, and the entry says it was found at a
// count rather than pretending somebody recorded it at the time.
// ─────────────────────────────────────────────────────────────────────────────

// Catalog items that are logged at the machine rather than issued at a counter.
export const FLUID_TYPES = [
  { value: "",         label: "Ordinary part" },
  { value: "def",      label: "DEF — poured into machines" },
  { value: "additive", label: "Fuel additive — goes into a tank" },
];

export const fluidItems = (items = [], fluidType = "def") =>
  (items || []).filter(i => i && i.active !== false && (i.fluidType || "") === fluidType);

// How much of a fluid is on hand, broken down by where it is.
//
// Containers AND gallons, because the two answer different questions: the
// person driving to Kenesaw wants to know there are three jugs there, and the
// year-end count wants gallons and a value.
export function fluidOnHand(items = [], batches = [], fluidType = "def") {
  const wanted = new Map(fluidItems(items, fluidType).map(i => [i.id, i]));
  const byLocation = new Map();
  let containers = 0, gallons = 0, value = 0;

  for (const b of batches || []) {
    if (!wanted.has(b.itemId) || b.status !== "open") continue;
    const qty  = Number(b.quantityRemaining) || 0;
    if (qty <= 0) continue;
    const item = wanted.get(b.itemId);
    const per  = Number(item.unitGallons) || 0;
    const loc  = b.location || "";
    const cur  = byLocation.get(loc) || { location: loc, containers: 0, gallons: 0, value: 0, items: new Set() };
    cur.containers += qty;
    cur.gallons    += qty * per;
    cur.value      += qty * (Number(b.unitCost) || 0);
    cur.items.add(item.id);
    byLocation.set(loc, cur);
    containers += qty;
    gallons    += qty * per;
    value      += qty * (Number(b.unitCost) || 0);
  }

  return {
    containers, gallons, value,
    byLocation: [...byLocation.values()]
      .map(l => ({ ...l, items: [...l.items] }))
      .sort((a, b) => b.containers - a.containers),
  };
}

// Turn "two jugs of DEF from Kenesaw, into unit 327" into the records it takes.
//
// Returns BOTH the fuel entry and the inventory issue, already costed, or a
// reason it cannot be done. One function so the screen cannot write one without
// the other — a jug poured into a machine and not taken off the shelf is how
// the shelf count stops meaning anything.
export function issueFluidToMachine({
  item, location, containers, batches = [], date = today(),
  equipmentId = null, unitNumber = "", meterReading = 0, meterType = "hours",
  pumpedBy = "", notes = "", id = null,
}) {
  const qty = Number(containers) || 0;
  if (!item)       return { ok: false, reason: "No item chosen." };
  if (qty <= 0)    return { ok: false, reason: "No containers entered." };

  const { batchLines, totalCost, canFulfill, short } =
    buildFIFOLines(item.id, location || "all", qty, batches);

  if (!canFulfill) {
    return {
      ok: false, short,
      reason: `${locationName(location) || "That location"} has ${qty - short} of the ${qty} ` +
              `${qty === 1 ? "container" : "containers"} recorded. Count it, or take it from somewhere else.`,
    };
  }

  const per     = Number(item.unitGallons) || 0;
  const gallons = qty * per;
  const fuelId  = id || uid();

  return {
    ok: true,
    gallons, totalCost,
    unitCost: gallons > 0 ? totalCost / gallons : 0,
    dispensing: createFuelDispensing({
      id: fuelId, date,
      consumer: "county_equipment",
      equipmentId, unitNumber, meterReading, meterType,
      fuelType: item.fluidType || "def",
      gallons,
      sourceType: "inventory",
      inventoryItemId: item.id,
      inventoryItemName: item.name || item.partNumber || "",
      inventoryLocation: location || "",
      containers: qty,
      // DEF is not a motor fuel and carries no road tax.
      taxClass: "not_applicable",
      unitCost: gallons > 0 ? Number((totalCost / gallons).toFixed(4)) : 0,
      totalCost: Number(totalCost.toFixed(2)),
      pumpedBy, notes,
    }),
    transaction: {
      id: uid(),
      type: "issue",
      date,
      itemId: item.id,
      itemName: item.name || "",
      location: location || "",
      quantity: qty,
      totalCost: Number(totalCost.toFixed(2)),
      batchLines,
      issuedTo: unitNumber ? `Unit ${unitNumber}` : "",
      equipmentId,
      reference: fuelId,
      notes: notes || `${item.fluidType === "def" ? "DEF" : "Fluid"} logged on the fuel screen`,
      createdAt: now(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUEL TAX
//
// The county buys DYED diesel, which arrives untaxed, and owes tax on whatever
// goes into something that drives on a road. It is remitted quarterly, so the
// quarter's on-road gallons is a number the program has to be able to produce.
//
// WHICH tax is deliberately not decided here. Greg said federal; dyed fuel is
// exempt from the federal excise and a local government may generally run it
// on-highway for its own use, which points at a state tax instead. That is a
// question for whoever prepares the return, not for this file — so the rate
// table holds ANY NUMBER OF NAMED TAXES and the report totals each one. State,
// federal, both, or something another county pays: all the same shape.
//
// Rates are DATED because they change and old records must keep the old rate.
// A fuelling is taxed at the rate in force on the day it was pumped, not the
// rate in force when the report is run — otherwise re-running last year's
// return produces a different answer than it did last year.
// ─────────────────────────────────────────────────────────────────────────────

export const createFuelTaxRate = (overrides = {}) => ({
  id:            uid(),
  name:          "",          // "State motor fuel", "Federal excise" — the county's words
  fuelType:      "diesel",    // which fuel it applies to
  effectiveDate: today(),
  ratePerGallon: 0,
  notes:         "",
  createdAt:     now(),
  ...overrides,
});

// The rate in force for each named tax on a given date. Latest effective row on
// or before the date wins, per name — the same rule as an employee's pay.
export function fuelTaxRatesOn(rates = [], date, fuelType = "diesel") {
  const best = new Map();
  for (const r of rates || []) {
    if (!r || !r.name) continue;
    if ((r.fuelType || "diesel") !== fuelType) continue;
    if (String(r.effectiveDate || "") > String(date || "")) continue;
    const cur = best.get(r.name);
    if (!cur || String(r.effectiveDate || "") > String(cur.effectiveDate || "")) best.set(r.name, r);
  }
  return [...best.values()];
}

// Calendar quarters. Fuel tax returns are filed on the calendar year wherever
// this is likely to be used, even where the county's own books are not — Nebraska
// runs 1 July to 30 June. Mixing the two is how a quarter gets filed twice.
export const quarterOf = (date) => {
  const [y, m] = String(date || "").split("-");
  if (!y || !m) return "";
  return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
};

export const quarterRange = (q) => {
  const [y, qq] = String(q || "").split("-Q");
  const n = Number(qq);
  if (!y || !n) return null;
  const startM = (n - 1) * 3 + 1;
  const endM   = startM + 2;
  const last   = new Date(Number(y), endM, 0).getDate();
  return { start: `${y}-${String(startM).padStart(2,"0")}-01`, end: `${y}-${String(endM).padStart(2,"0")}-${last}` };
};

export const quarterLabel = (q) => {
  const [y, qq] = String(q || "").split("-Q");
  return y && qq ? `Q${qq} ${y}` : "";
};

// What is owed for a quarter, and the working that supports it.
//
// Every fuelling is priced at the rate in force ON ITS OWN DATE, so a rate that
// changes mid-quarter is handled without anyone having to split the period by
// hand. The per-unit breakdown is there so a machine classified wrongly can be
// found — an off-road grader that has quietly been marked on-road shows up as
// a line nobody recognises rather than as a total that is merely too big.
export function fuelTaxReport(dispensing = [], rates = [], quarter, fuelType = "diesel") {
  const range = quarterRange(quarter);
  if (!range) return null;

  const inQuarter = (dispensing || []).filter(d =>
    (d.fuelType || "diesel") === fuelType &&
    d.date >= range.start && d.date <= range.end);

  const onRoad  = inQuarter.filter(d => d.taxClass === "on_road");
  const offRoad = inQuarter.filter(d => d.taxClass !== "on_road");

  const gal = list => list.reduce((s, d) => s + (Number(d.gallons) || 0), 0);

  // Per named tax, summed a fuelling at a time so dated rates are respected.
  const taxes = new Map();   // name → { name, gallons, amount, rates:Set }
  let untaxed = 0;           // on-road gallons with no rate on file for their date
  for (const d of onRoad) {
    const applicable = fuelTaxRatesOn(rates, d.date, fuelType);
    if (!applicable.length) { untaxed += Number(d.gallons) || 0; continue; }
    for (const r of applicable) {
      const cur = taxes.get(r.name) || { name: r.name, gallons: 0, amount: 0, rates: new Set() };
      cur.gallons += Number(d.gallons) || 0;
      cur.amount  += (Number(d.gallons) || 0) * (Number(r.ratePerGallon) || 0);
      cur.rates.add(Number(r.ratePerGallon) || 0);
      taxes.set(r.name, cur);
    }
  }

  // Which machines, so a wrong classification is findable.
  const byUnit = new Map();
  for (const d of onRoad) {
    const key = d.unitNumber || d.outsideVehicle || "Unassigned";
    const cur = byUnit.get(key) || { unit: key, gallons: 0, fills: 0 };
    cur.gallons += Number(d.gallons) || 0;
    cur.fills   += 1;
    byUnit.set(key, cur);
  }

  const lines = [...taxes.values()].map(t => ({
    ...t,
    rates: [...t.rates].sort((a, b) => a - b),
    amount: Number(t.amount.toFixed(2)),
  })).sort((a, b) => a.name.localeCompare(b.name));

  return {
    quarter, label: quarterLabel(quarter), range, fuelType,
    onRoadGallons:  gal(onRoad),
    offRoadGallons: gal(offRoad),
    totalGallons:   gal(inQuarter),
    fills: onRoad.length,
    lines,
    totalOwed: Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2)),
    // On-road gallons the program could not price. Reported rather than
    // silently dropped: a return that is short because a rate was missing is
    // worse than one that refuses to be produced.
    unratedGallons: untaxed,
    byUnit: [...byUnit.values()].sort((a, b) => b.gallons - a.gallons),
  };
}

// Quarters that actually have fuel in them, newest first.
export const quartersWithFuel = (dispensing = []) =>
  [...new Set((dispensing || []).map(d => quarterOf(d.date)).filter(Boolean))].sort().reverse();

// ─────────────────────────────────────────────────────────────────────────────
// FUEL COSTING — FIFO
//
// Greg: "FIFO but I do not want a other department fill up to straddle two
// prices however we can make that work."
//
// So the tank keeps layers — gallons that arrived together at one price — and a
// withdrawal takes the oldest gallons first. That is FIFO and it is what the
// inventory module already does.
//
// The straddle solves itself in the presentation. A 500-gallon draw that takes
// 300 at $2.98 and 200 at $3.21 is recorded as 500 gallons costing $1,536.00,
// and shown as $3.072 a gallon — one price per unit, and the total exactly
// right rather than approximately. The invoice does the same thing at month
// scale, which is the one-line-per-department bill Greg described.
//
// NOTHING HERE IS STORED. The layers are rebuilt from the transaction history
// every time. That is deliberate, and it is what makes Greg's answer to the
// recosting question possible:
//
//   "If the invoice comes in at a different price than the delivery ticket,
//    should Pinpoint go back and recost the fill-ups already logged?"  — "Yes"
//
// Correct the price on a delivery and every gallon that came out of it after
// that moment reprices itself, with no migration and nothing left holding an
// old number. A stored unit cost would have had to be hunted down and rewritten
// in three places, and the one that got missed would be the one on the bill.
// ─────────────────────────────────────────────────────────────────────────────

// Draw `want` gallons off the front of a layer queue. MUTATES the queue, which
// is the point — the caller is walking history forward and the tank empties as
// it goes. Callers who only want a quote pass a copy.
function drawFIFO(layers, want) {
  const lines = [];
  let need = Number(want) || 0, cost = 0;
  while (need > 1e-9 && layers.length) {
    const l = layers[0];
    const take = Math.min(l.gallons, need);
    lines.push({ gallons: take, unitCost: l.unitCost, cost: take * l.unitCost, date: l.date, ref: l.ref });
    cost += take * l.unitCost;
    l.gallons -= take;
    need      -= take;
    if (l.gallons <= 1e-9) layers.shift();
  }
  return { lines, cost, short: need > 1e-9 ? need : 0 };
}

// Rebuild every tank's layers from history, and cost every withdrawal on the way
// through. One pass over all tanks at once, because a portable fill is a
// withdrawal from one tank and a delivery into another and the two have to
// happen in the same order they happened in real life.
export function costFuel(tankTx = [], dispensing = []) {
  const events = [];

  for (const t of tankTx || []) {
    if (t.type === "delivery" && t.tankId) {
      events.push({ kind:"delivery", tankId:t.tankId, gallons:Math.abs(Number(t.gallons) || 0),
                    unitCost:Number(t.unitCost) || 0, additiveCost:Number(t.additiveCost) || 0,
                    date:t.date, createdAt:t.createdAt, id:t.id, order:0 });
    } else if (t.type === "portable_fill") {
      events.push({ kind:"fill", tankId:t.sourceTankId, destId:t.destinationTankId || t.tankId,
                    gallons:Math.abs(Number(t.gallons) || 0), date:t.date, createdAt:t.createdAt, id:t.id, order:1 });
    }
  }
  for (const d of dispensing || []) {
    events.push({ kind:"dispense", tankId:d.sourceTankId, gallons:Number(d.gallons) || 0,
                  date:d.date, createdAt:d.createdAt, id:d.id, order:1 });
  }

  // Date, then arrivals before withdrawals, then the order they were entered.
  //
  // Arrivals first matters on the day a tank is refilled and drawn down again.
  // It cannot change a price — FIFO takes the oldest gallons regardless — but
  // without it a tank that ran to nearly empty reports a spurious shortfall.
  events.sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")) ||
    (a.order - b.order) ||
    String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
    String(a.id || "").localeCompare(String(b.id || "")));

  const layers = new Map();   // tankId → layer[]  (gallons still in the tank)
  const last   = new Map();   // tankId → the last price it is known to have paid
  const queue  = id => { if (!layers.has(id)) layers.set(id, []); return layers.get(id); };

  const forDispensing = new Map();
  const forFills      = new Map();

  const take = (tankId, gallons) => {
    const g = Number(gallons) || 0;
    const r = drawFIFO(queue(tankId), g);
    // A tank with no recorded history — every tank, the day this goes live —
    // still has to price what came out of it, and so does one drawn past what
    // the book says it held. The last price it paid is the least wrong answer
    // available, and the record says plainly that it was estimated.
    if (r.short > 0) {
      const fallback = last.get(tankId) || 0;
      r.lines.push({ gallons:r.short, unitCost:fallback, cost:r.short * fallback, estimated:true });
      r.cost += r.short * fallback;
    }
    return {
      unitCost:  g > 0 ? r.cost / g : 0,
      totalCost: r.cost,
      lines:     r.lines,
      estimated: r.short > 0,
      shortGallons: r.short,
    };
  };

  const additives = new Map();   // tankTx id → how it was applied

  for (const e of events) {
    if (e.kind === "delivery") {
      // Additive dosed into the load as it lands rides with that load's gallons
      // and nothing else — fuel already in the tank was not treated.
      const treated = e.gallons > 0 && e.additiveCost
        ? e.unitCost + e.additiveCost / e.gallons
        : e.unitCost;
      if (e.gallons > 0) queue(e.tankId).push({ gallons:e.gallons, unitCost:treated, date:e.date, ref:e.id });
      if (treated > 0) last.set(e.tankId, treated);
      if (e.additiveCost) additives.set(e.id, {
        applied: e.gallons > 0, gallons: e.gallons, cost: e.additiveCost,
        perGallon: e.gallons > 0 ? e.additiveCost / e.gallons : 0, onDelivery: true,
      });
    } else if (e.kind === "fill") {
      const r = take(e.tankId, e.gallons);
      forFills.set(e.id, r);
      // Locked, per Greg. The portable carries the price it was filled at and
      // keeps it however the tank it came out of moves afterwards. It follows a
      // CORRECTION to that delivery, because a correction says the fuel never
      // cost what the ticket claimed — which is a different thing from a later
      // load arriving at a different price.
      if (e.destId && e.gallons > 0) {
        queue(e.destId).push({ gallons:e.gallons, unitCost:r.unitCost, date:e.date, ref:e.id });
        last.set(e.destId, r.unitCost);
      }
    } else {
      forDispensing.set(e.id, take(e.tankId, e.gallons));
    }
  }

  return { dispensing:forDispensing, fills:forFills, additives, layers, lastPrice:last };
}

const NO_COST = { unitCost:0, totalCost:0, lines:[], estimated:true, shortGallons:0 };

// What one fuelling cost. Falls back rather than throwing, because a dispensing
// record whose tank was deleted should show a dash, not a white screen.
export const fuelCostOf = (costing, dispensingId) =>
  costing?.dispensing?.get(dispensingId) || NO_COST;

export const fillCostOf = (costing, tankTxId) =>
  costing?.fills?.get(tankTxId) || NO_COST;

// How an additive landed — over how many gallons, and what it added per gallon.
export const additiveEffect = (costing, tankTxId) =>
  costing?.additives?.get(tankTxId) || null;

// The layers still sitting in a tank, oldest first.
export const tankLayers = (costing, tankId) => costing?.layers?.get(tankId) || [];

// What the fuel in a tank is worth, and what it averages a gallon. The average
// is what to show on a screen; it is not a price anything is charged at, since
// the next withdrawal takes the oldest gallons and may well be cheaper.
export function tankFuelValue(costing, tankId) {
  const ls = tankLayers(costing, tankId);
  const gallons = ls.reduce((s, l) => s + l.gallons, 0);
  const value   = ls.reduce((s, l) => s + l.gallons * l.unitCost, 0);
  return { gallons, value, average: gallons > 0 ? value / gallons : (costing?.lastPrice?.get(tankId) || 0) };
}

// What the NEXT withdrawal would cost, without recording it. This is what the
// dispensing form shows while someone is still typing.
export function quoteFuel(costing, tankId, gallons) {
  const g = Number(gallons) || 0;
  const copy = tankLayers(costing, tankId).map(l => ({ ...l }));
  const r = drawFIFO(copy, g);
  const fallback = costing?.lastPrice?.get(tankId) || 0;
  const totalCost = r.cost + r.short * fallback;
  if (r.short > 0) r.lines.push({ gallons:r.short, unitCost:fallback, cost:r.short * fallback, estimated:true });
  return {
    unitCost: g > 0 ? totalCost / g : fallback,
    totalCost, lines:r.lines,
    estimated: r.short > 0, shortGallons: r.short,
  };
}

const to = (n, dp) => Number((Number(n) || 0).toFixed(dp));

// A month of one department's fuel, as the one-line bill Greg described:
// gallons, cost per unit, final cost.
//
// The unit price is the real blend of everything that went out, so the true
// cost is exact. But an invoice showing 450 gallons at $2.9444 and a total of
// $1,325.00 invites a phone call, because 450 × 2.9444 is $1,324.98.
//
// So the invoice is made to tie to ITSELF: the unit price is rounded to four
// places and the amount billed is gallons times that rounded price. The
// difference is never more than a couple of cents on a month, it is reported
// as `rounding` rather than hidden, and it stays in the department fuel
// account — which is where a rounding residual belongs, and is a far smaller
// problem than an invoice whose own arithmetic does not work.
export function departmentFuelBill(costing, entries = []) {
  let gallons = 0, cost = 0, estimated = false;
  for (const e of entries) {
    const c = fuelCostOf(costing, e.id);
    gallons += Number(e.gallons) || 0;
    cost    += c.totalCost;
    if (c.estimated) estimated = true;
  }
  const unitCost   = gallons > 0 ? to(cost / gallons, 4) : 0;
  const billedCost = to(gallons * unitCost, 2);
  return { gallons, cost, unitCost, billedCost, rounding: to(billedCost - cost, 2), estimated, entries };
}

// Refresh the stored cost on every fuelling, from the transaction history.
//
// The costing is derived — see costFuel — but five other screens read
// `unitCost` and `totalCost` straight off the dispensing record, and threading
// a costing object into every one of them is how one of them quietly gets
// missed and keeps showing last month's number. So the derived figures are
// written back onto the records from ONE place, every time anything that could
// move them moves. The history stays the source of truth; the fields on the
// record are a copy of it that is never allowed to be stale.
//
// Returns the SAME array when nothing changed, so an unrelated keystroke does
// not re-render every screen that shows a fuel cost.
export function recostFuelDispensing(tankTransactions = [], fuelDispensing = []) {
  if (!fuelDispensing || !fuelDispensing.length) return fuelDispensing;
  const costing = costFuel(tankTransactions, fuelDispensing);
  let changed = false;
  const next = fuelDispensing.map(f => {
    const c         = fuelCostOf(costing, f.id);
    const unitCost  = to(c.unitCost, 4);
    const totalCost = to(c.totalCost, 2);
    const est       = !!c.estimated;
    if (f.unitCost === unitCost && f.totalCost === totalCost && !!f.costEstimated === est) return f;
    changed = true;
    return { ...f, unitCost, totalCost, costEstimated: est };
  });
  return changed ? next : fuelDispensing;
}

// ─────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE — ROADS
// ─────────────────────────────────────────────────────────────────────────────

export const createRoad = (overrides = {}) => ({
  id:              uid(),
  name:            "",           // primary identifier — full segment name
  authority:       "",           // City | County | NAD | State | etc.
  from:            "",           // from cross street / point
  to:              "",           // to cross street / point
  from911:         "",           // 911 address from
  to911:           "",           // 911 address to
  surfaceType:     "",           // Concrete | Bituminous | Gravel | Dirt
  lengthMiles:     "",           // segment length — feeds mileage-by-surface totals
  speedLimit:      "",
  sectionTownshipRange: "",      // S/T/R (e.g. "29-8-9")
  latitude:        "",
  longitude:       "",
  // Surface work history — "last graveled 14 months ago" drives what gets done next
  lastGraveled:    "",           // YYYY-MM-DD
  lastBladed:      "",
  lastSealed:      "",
  status:          "active",     // active | inactive
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE — BRIDGES
// ─────────────────────────────────────────────────────────────────────────────

export const createBridge = (overrides = {}) => ({
  id:              uid(),
  stateNumber:     "",           // e.g. "C00205"
  countyNumber:    "",           // e.g. "N 36.1" (letter + space + numbers)
  fasNumber:       "",           // FAS # — bridges only
  road:            "",           // road / street name
  features:        "",           // what it crosses (Little Blue, Flat Creek, DITCH, etc.)
  route:           "",           // route designation, where one applies
  deckWidth:       "",           // feet
  structLength:    "",           // feet
  maxSpanLength:   "",           // feet
  spans:           "",           // number of spans
  yearBuilt:       "",
  // NBIS — the STATE DATABASE is the system of record. County staff inspect, but
  // results are read from the state system, not entered here. Only what's needed
  // to decide action is carried: the lowest current rating (action triggers at 3
  // or 4) and when it was last looked at.
  nbisRating:      null,         // 0-9, lowest of deck/substructure/superstructure
  nbisInspected:   "",           // YYYY-MM-DD — date of the inspection this came from
  // Legacy per-component ratings, retained so existing records still render.
  ratingDeck:          null,
  ratingSubstructure:  null,
  ratingSuperstructure:null,
  // Postings and special inspection flags
  loadPosted:      false,
  loadLimit:       "",           // e.g. "20 T" — posted weight limit
  scourCritical:   false,
  fractureCritical:false,
  latitude:        "",
  longitude:       "",
  photos:          [],           // array of photo references
  status:          "active",     // active | replaced | removed | closed
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE — CULVERTS & STRUCTURES
// ─────────────────────────────────────────────────────────────────────────────

// One barrel spec at a structure site.
// A site has ONE number but may hold several barrels of differing size, shape and
// material. `count` groups identical ones:
//   "A 2.2"   → 2 × 72" × 58' CMAP          (one barrel record, count 2)
//   "D 27.3C" → 1 × 18" × 65' CMP
//               1 × 36" × 65' CMP           (two barrel records, count 1 each)
export const createStructureBarrel = (overrides = {}) => ({
  id:     uid(),
  count:  1,      // how many barrels share this exact spec
  size:   "",     // diameter in inches, or box dimensions e.g. "8x6"
  length: "",     // feet
  type:   "",     // CMP | CMAP | RCP | Concrete Box | … (encodes material and shape)
  notes:  "",
  ...overrides,
});

// Render a barrel the way the department writes it: 2 - 72" X 58' CMAP
export const barrelLabel = (b) => {
  if (!b) return "";
  const parts = [`${b.count || 1} -`];
  if (b.size)   parts.push(`${b.size}"`);
  if (b.length) parts.push(`X ${b.length}'`);
  if (b.type)   parts.push(b.type);
  return parts.join(" ").trim();
};

// Whole-site summary, barrels joined with +
export const barrelsSummary = (barrels) =>
  (barrels || []).map(barrelLabel).filter(Boolean).join("  +  ");

export const createStructure = (overrides = {}) => ({
  id:              uid(),
  culvertNumber:   "",           // township code + section + order, e.g. "A 2.2", "D 27.3C"
  designation:     "Structure",  // Culvert (<48") | Structure (48"+) | Bridge (NBIS-reportable)
  roadDesignation: "Primary",    // Primary | Secondary
  road:            "",
  township:        "",           // reference only — the township system was eliminated
  // Condition rating — 0-5. Criteria differ for culverts vs structures, and 0 is an
  // exception state rather than the bottom of the scale (culvert: unassessable,
  // structure: closed). See RATING_CODES in Infrastructure.jsx.
  rating:          null,
  // Barrels — a site may hold several of differing size, shape and material.
  barrels:         [],           // createStructureBarrel[]
  yearBuilt:       "",
  latitude:        "",
  longitude:       "",
  photos:          [],
  project:         "",           // project reference (M- or C1- number)
  notes:           "",
  createdAt:       now(),
  // Legacy single-barrel fields — superseded by `barrels`, retained so existing
  // records still render until they're edited. Do not use for new records.
  sizeAndType:     "",
  shape:           "",
  diameter:        "",
  length:          "",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE — SIGNS
// ─────────────────────────────────────────────────────────────────────────────

export const createSign = (overrides = {}) => ({
  id:              uid(),
  signName:        "",           // identifier
  reason:          "",           // why installed: HSIP | replacement | new | etc.
  signType:        "",           // DOT type code (W1-6, R1-1, etc.)
  description:     "",
  dotNumber:       "",
  onRoad:          "",
  township:        "",
  roadBack:        "",
  roadAhead:       "",
  latitude:        "",
  longitude:       "",
  // Physical
  surface:         "",           // sheeting / surface type
  size:            "",
  height:          "",           // mounting height
  // Support (post). Posts are NOT tracked as separate assets — they're attributes
  // of the sign, and stocked in inventory as yard replacements. Two signs on one
  // post are two records, each recording the same support details.
  supportType:     "",
  supportMaterial: "",
  supportLength:   "",
  stub:            false,
  sheeting:        "",
  // Condition
  signRating:      null,         // scale unconfirmed — see QUESTION-LOG.md
  // Position
  position:        "",
  sideOfRoad:      "",
  travelDirection: "",
  offset:          "",
  // Other
  materialsUsed:   "",
  photos:          [],
  status:          "active",     // active | removed | replaced
  notes:           "",
  // Provenance — mirrors the AppSheet sign report so records can be traced back
  changedBy:       "",           // AppSheet "Editor"
  lastModified:    "",           // AppSheet "Timestamp"
  sourceSystem:    "",           // "appsheet" when imported, blank when entered here
  createdAt:       now(),
  ...overrides,
});

// Sign history entry (replacement, repair, HSIP upgrade, etc.)
export const createSignHistory = (overrides = {}) => ({
  id:              uid(),
  signId:          null,
  date:            today(),
  eventType:       "",           // replacement | repair | HSIP_upgrade | inspection | removal
  description:     "",
  materialsUsed:   "",
  performedBy:     "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDORS
// ─────────────────────────────────────────────────────────────────────────────

// A payee. "Anyone we send money" — suppliers, contractors, engineering firms,
// utilities, and employees receiving reimbursements (mileage, licence renewals).
//
// Whether payroll WAGES also flow through claims is still unknown. An employee
// payee record works either way: it exists for reimbursements today, and could
// carry wages later without restructuring.
export const createVendor = (overrides = {}) => ({
  id:              uid(),
  name:            "",
  type:            "supplier",   // supplier | contractor | engineering_firm | utility | employee | other
  // Set when this payee is an employee, so the two records stay in step rather
  // than drifting apart.
  linkedEmployeeId: null,
  // Assigned by the Clerk's office — recorded here, never generated by Pinpoint.
  vendorCode:      "",
  contactName:     "",           // one contact is enough
  phone:           "",
  email:           "",
  // Main address
  address:         "",
  city:            "",
  state:           "NE",
  zip:             "",
  // Some vendors are paid at a different address than their main one. When
  // false, the claim sheet uses the main address.
  separateRemitTo: false,
  remitAddress:    "",
  remitCity:       "",
  remitState:      "NE",
  remitZip:        "",
  // Contractors must have a certificate on file before working. General liability
  // only. No expiry warnings wanted.
  tracksInsurance: false,
  insurance:       [],           // createInsuranceCert[]
  // Bonding, on larger projects
  bonded:          false,
  bondAmount:      "",
  bondReference:   "",
  // Purchasing
  onStateContract: false,        // state contract or purchasing co-op
  taxExemptSent:   false,        // the county ISSUES exemption certificates on request
  // Contract rates — mostly set by bid
  contractRates:   [],           // createContractRate[]
  // Which catalog items this vendor supplies. Many-to-many: one filter may have
  // several suppliers.
  suppliedItemIds: [],
  // Flagged where a payee is also an employee or elected official
  conflictOfInterest: false,
  active:          true,         // inactive vendors are hidden but kept for history
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

export const VENDOR_TYPES = [
  { value:"supplier",         label:"Supplier" },
  { value:"contractor",       label:"Contractor" },
  { value:"engineering_firm", label:"Engineering Firm" },
  { value:"utility",          label:"Utility" },
  { value:"employee",         label:"Employee (reimbursements)" },
  { value:"other",            label:"Other" },
];

// Insurance certificate
export const createInsuranceCert = (overrides = {}) => ({
  id:              uid(),
  vendorId:        null,
  type:            "",           // general_liability | workers_comp | auto | umbrella
  policyNumber:    "",
  carrier:         "",
  expirationDate:  "",
  certificateOnFile: false,
  notes:           "",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
//
// SCOPE (confirmed 2026-07-27): this is NOT payroll. The Clerk's office runs
// gross-to-net, withholding and direct deposit. Pinpoint holds employees, their
// rates and their benefit loading for one purpose — costing labor to work.
//
// DELIBERATELY NOT STORED: social security number, home address, date of birth.
// Asked for and declined. Don't add them.
// ─────────────────────────────────────────────────────────────────────────────

// One change to a person's pay.
//
// THE RATE LIVES ON THE PERSON, not on the classification. There was a pay
// scale table — classification plus date gives a rate — and it was wrong for
// how the county actually pays. Greg:
//
//   "We need to get rid of the pay scales as we have a step program when
//    people are hired and their pay may go up for a few years but their
//    classification stays the same."
//
// Two Equipment Operators on different steps earn different money, so the
// classification cannot be what sets the rate. Rates are typed in, dated, and
// the one in force on any day is the latest row on or before it.
//
// The REASON is not decoration. It is what lets the program know a six-month
// review is coming, count anniversaries, and write the right row alongside a
// classification change. The list is editable in Settings.
export const createRateChange = (overrides = {}) => ({
  id:             uid(),
  effectiveDate:  today(),
  hourlyRate:     0,
  reason:         "",           // see RATE_CHANGE_REASONS
  note:           "",           // "Board 8/19, effective 7/1", "3% FY2026"
  createdAt:      now(),
  ...overrides,
});

// How pay moves here, in Greg's words:
//
//   "When a person is hired they have a starting wage and then after 6 months
//    they get a review and a raise if the review is good, then at their
//    anniversary they get a pay bump to the next step and then the next 7
//    anniversaries. There is also typically a COLA when a new fiscal year
//    rolls around."
//
// "Certification earned" covers the common case of somebody hired without a
// CDL starting as a Laborer and moving up to Equipment Operator once they have
// it — a promotion triggered by a certificate rather than by a date.
export const RATE_CHANGE_REASONS = [
  "Starting wage",
  "Six-month review",
  "Step increase",
  "COLA",
  "Promotion",
  "Certification earned",
  "Board action",
  "Correction",
  "Other",
];

// Overtime is ALWAYS time and a half. Derived, never typed — one number on the
// record means nobody can enter an overtime rate that disagrees with the
// straight-time one.
export const OVERTIME_MULTIPLIER = 1.5;

// One line of an employee's benefit loading. Fringe varies by person (Q20) —
// insurance elections and years of service — but the components are standard.
export const createFringeComponent = (overrides = {}) => ({
  id:      uid(),
  name:    "",
  percent: 0,      // % of straight-time wage
  flatHourly: 0,   // or a flat $/hour, for things that aren't wage-proportional
  ...overrides,
});

// The components in use, with the rates that are fixed by law (Q22).
export const DEFAULT_FRINGE_COMPONENTS = () => [
  createFringeComponent({ name:"Social Security",  percent:6.20 }),
  createFringeComponent({ name:"Retirement (NPERS)", percent:6.75 }),
  createFringeComponent({ name:"Medicare",         percent:1.45 }),
  createFringeComponent({ name:"Holiday Pay",      percent:0 }),
  createFringeComponent({ name:"Vacation Pay",     percent:0 }),
  createFringeComponent({ name:"Sick Leave",       percent:0 }),
  createFringeComponent({ name:"Health Insurance", flatHourly:0 }),
  createFringeComponent({ name:"Dental",           flatHourly:0 }),
  createFringeComponent({ name:"HRA",              flatHourly:0 }),
  createFringeComponent({ name:"Disability",       flatHourly:0 }),
  createFringeComponent({ name:"FSA",              flatHourly:0 }),
  createFringeComponent({ name:"Wellness",         flatHourly:0 }),
  createFringeComponent({ name:"Workers Comp",     percent:0 }),
];

// A dated fringe profile. Same reasoning as pay scales — old entries keep the
// loading that applied when they were made.
export const createFringeProfile = (overrides = {}) => ({
  id:            uid(),
  effectiveDate: today(),
  components:    DEFAULT_FRINGE_COMPONENTS(),
  notes:         "",
  createdAt:     now(),
  ...overrides,
});

// When an employee held a classification. Promotions create a new assignment
// rather than overwriting, so past entries still resolve correctly.
export const createEmployeeAssignment = (overrides = {}) => ({
  id:             uid(),
  effectiveDate:  today(),
  classification: "",
  notes:          "",
  // No rate here. A classification says what somebody DOES; what they are paid
  // is a separate dated history on the person. The two used to be one field
  // with an override bolted on, which was the model admitting it had the
  // relationship wrong.
  ...overrides,
});

export const createEmployee = (overrides = {}) => ({
  id:                uid(),
  employeeNumber:    "",         // employee number + name is the identifier (Q25)
  firstName:         "",
  lastName:          "",
  name:              "",         // display name, kept in step with first/last
  employmentType:    "full_time",// full_time | part_time | seasonal
  hireDate:          "",
  endDate:           "",         // set when they leave; history is kept, they're
                                 // hidden from dropdowns (Q34)
  phone:             "",
  email:             "",
  // What they DO, dated. No longer what sets their pay.
  assignments:       [],         // createEmployeeAssignment[]
  // What they are PAID, dated. See createRateChange.
  rateHistory:       [],         // createRateChange[]
  // Benefit loading, dated
  fringeProfiles:    [],         // createFringeProfile[]
  // Blade operators are assigned a machine (Q29)
  assignedEquipmentId: null,
  certifications:    [],         // createCertification[] — 90-day warning (Q27)
  emergencyContact:  { name:"", relationship:"", phone:"" },   // (Q31)
  active:            true,
  notes:             "",
  createdAt:         now(),
  ...overrides,
});

// ── Rate resolution ───────────────────────────────────────────────────────────
// The whole point of the dated series. Given an employee and a date, work out
// what they were paid then — never what they're paid now.
// A local date as yyyy-mm-dd. Deliberately NOT toISOString(), which converts to
// UTC first and can hand back yesterday for anyone west of Greenwich — which is
// everybody here.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

const latestOnOrBefore = (list, date, key = "effectiveDate") =>
  (list || [])
    .filter(x => x[key] && x[key] <= date)
    .sort((a,b) => b[key].localeCompare(a[key]))[0] || null;

export function resolveClassification(employee, date) {
  return latestOnOrBefore(employee?.assignments, date);
}

// What somebody earned on a given day.
//
// The latest rate row on or before that date — nothing else. Entries made in
// the past keep the rate that was in force then, which is the whole reason this
// is a dated history rather than one number on the record.
export function resolveHourlyRate(employee, date) {
  const change     = latestOnOrBefore(employee?.rateHistory, date);
  const assignment = resolveClassification(employee, date);
  return {
    rate:           change ? Number(change.hourlyRate) || 0 : 0,
    overtimeRate:   change ? round2((Number(change.hourlyRate) || 0) * OVERTIME_MULTIPLIER) : 0,
    source:         change ? "history" : "none",
    reason:         change?.reason || "",
    effectiveDate:  change?.effectiveDate || null,
    classification: assignment?.classification || "",
  };
}

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

// Time and a half, from whatever they earn that day.
export const overtimeRateFor = (employee, date) =>
  resolveHourlyRate(employee, date).overtimeRate;

// The rate history, newest first, with the step between each row worked out.
export function rateHistory(employee) {
  const rows = [...(employee?.rateHistory || [])]
    .sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  return rows.map((r, i) => {
    const previous = rows[i + 1];
    return {
      ...r,
      change: previous ? round2(Number(r.hourlyRate) - Number(previous.hourlyRate)) : null,
      overtimeRate: round2((Number(r.hourlyRate) || 0) * OVERTIME_MULTIPLIER),
    };
  });
}

// Who is coming up for a review or an anniversary.
//
// The program FLAGS these and raises nobody's pay by itself — Greg's call, and
// the right one: payroll owns the decision, and software that quietly changed a
// wage would be software nobody trusted.
//
// Both are measured from the HIRE DATE, not from the current classification. A
// Laborer who gets their CDL and becomes an Operator at four months still has
// their six-month review when it falls due.
export function payReviewDue(employee, asOf = today(), windowDays = 30) {
  if (!employee?.hireDate || employee.active === false) return null;
  const hire = new Date(employee.hireDate + "T00:00:00");
  const now  = new Date(asOf + "T00:00:00");
  if (Number.isNaN(hire.getTime()) || Number.isNaN(now.getTime())) return null;

  const reasons = new Set((employee.rateHistory || []).map(r => r.reason));
  const days = (a, b) => Math.round((a - b) / 86400000);

  // The six-month review, once, and only until it has been recorded.
  const sixMonth = new Date(hire); sixMonth.setMonth(sixMonth.getMonth() + 6);
  if (!reasons.has("Six-month review")) {
    const away = days(sixMonth, now);
    if (away <= windowDays) return { kind: "Six-month review", date: iso(sixMonth), daysAway: away };
  }

  // Then the anniversary. Eight steps after the review is the pattern, but the
  // program counts nothing and simply keeps flagging the date — a step someone
  // did not take is not the program's business.
  const anniversary = new Date(hire);
  anniversary.setFullYear(now.getFullYear());
  if (anniversary < now) anniversary.setFullYear(now.getFullYear() + 1);
  const away = days(anniversary, now);
  const years = anniversary.getFullYear() - hire.getFullYear();
  if (away <= windowDays)
    return { kind: "Anniversary", date: iso(anniversary), daysAway: away, years };
  return null;
}

// Fringe as dollars per hour at a given wage, plus the effective percentage.
export function resolveFringe(employee, date, hourlyRate) {
  const profile = latestOnOrBefore(employee?.fringeProfiles, date);
  if (!profile) return { perHour: 0, percent: 0, profile: null, lines: [] };
  const lines = (profile.components || []).map(c => ({
    name: c.name,
    amount: (Number(c.percent) || 0) / 100 * (hourlyRate || 0) + (Number(c.flatHourly) || 0),
    percent: Number(c.percent) || 0,
    flatHourly: Number(c.flatHourly) || 0,
  }));
  const perHour = lines.reduce((s,l) => s + l.amount, 0);
  return {
    perHour,
    percent: hourlyRate ? (perHour / hourlyRate) * 100 : 0,
    profile,
    lines,
  };
}

// Everything needed to cost an hour of this person's time on this date.
// Everything an hour of somebody's time costs, on a given date.
export function laborRateFor(employee, date) {
  const { rate, overtimeRate, source, classification, reason, effectiveDate } =
    resolveHourlyRate(employee, date);
  const fringe = resolveFringe(employee, date, rate);
  return {
    classification,
    hourlyRate: rate,
    rateSource: source,
    rateReason: reason,
    rateEffective: effectiveDate,
    overtimeRate,                      // 1.5×, over 40/week Mon–Sun (Q15, Q16)
    fringePerHour: fringe.perHour,
    fringePercent: fringe.percent,
    fringeLines: fringe.lines,
    loadedRate: rate + fringe.perHour, // what an hour actually costs
  };
}

// Call-out and after-hours carry a 2-hour minimum (Q15, Q17).
export const CALLOUT_MINIMUM_HOURS = 2;

// Certification
export const createCertification = (overrides = {}) => ({
  id:              uid(),
  employeeId:      null,
  type:            "",           // CDL | pesticide_applicator | OSHA | first_aid | other
  description:     "",
  issuedDate:      "",
  expirationDate:  "",
  certificateNumber: "",
  notes:           "",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS / LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

// A commodity group.
//
// ONE LIST, USED TWICE. A group is both a KIND of thing and a PLACE things are
// kept, because that is exactly what it is in R&B and Greg wants staff to see
// the list they already know.
//
//   item.categoryId    -> a group. What the thing IS. A transfer never changes it.
//   batch.location     -> a group CODE. Where it is. A transfer does change it.
//
// On day one every item's category and location are the same group, so the
// system looks identical to R&B. From then on they can diverge, and that
// divergence is the entire point:
//
//   R&B:      an oil filter sent to Kenesaw is REASSIGNED from 133 FILTERS to
//             7 KENESAW SHED. It arrives, and stops being a filter.
//   Pinpoint: its category stays 133 FILTERS. Its batch moves to location 7.
//
// The TYPE changes what a group can do, so it is recorded rather than guessed:
//
//   area        part of the main shop — the sign shop, the parts room, the
//               filter racks. There is no "Main Shop" group; the shop is where
//               things are unless a group says otherwise, so its areas cover it.
//   building    a satellite shed, or a floor of the shop. Kenesaw, Pauline, Office.
//   machine     gear that lives on a unit — an extinguisher on 327, tools in the
//               welding trailer. NOT the same as a part FITTING that machine:
//               a filter that fits 327 is compatibility, recorded on the item.
//   stockpile   crushed concrete, crushed asphalt, gravel.
export const createInventoryGroup = (overrides = {}) => ({
  id:              uid(),
  // The legacy commodity group number. Stock is held against this, and items
  // point at the group by id, so both need to stay stable when a name changes.
  code:            "",
  name:            "",
  type:            "area",       // area | building | machine | stockpile
  // Shelves exist in the shop and nowhere else. A group with none never asks.
  shelves:         [],           // ["A1","A2","B1", …]
  equipmentId:     null,         // when type is machine — which unit in the fleet
  unitNumber:      "",
  active:          true,
  notes:           "",
  ...overrides,
});

export const INVENTORY_GROUP_TYPES = [
  ["area",      "Shop area"],
  ["building",  "Building"],
  ["machine",   "Machine"],
  ["stockpile", "Stockpile"],
];

export const groupTypeLabel = (t) =>
  (INVENTORY_GROUP_TYPES.find(([v]) => v === t) || [null, "Shop area"])[1];

// Where an item is, and how much is at each place.
//
// Read from the batches rather than stored on the item, so it cannot disagree
// with the stock it describes.
export function stockByLocation(itemId, batches = []) {
  const m = new Map();
  for (const b of batches) {
    if (b.itemId !== itemId || b.status !== "open") continue;
    const qty = Number(b.quantityRemaining) || 0;
    if (qty <= 0) continue;
    const key = String(b.location ?? "");
    const cur = m.get(key) || { location: key, shelf: b.shelf || "", qty: 0, value: 0 };
    cur.qty   += qty;
    cur.value += qty * (Number(b.unitCost) || 0);
    if (!cur.shelf && b.shelf) cur.shelf = b.shelf;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty);
}

// Everything held at one location, for a count sheet.
//
// By where the stock IS, not by what it is. A count sheet built from categories
// would miss a filter that has been moved to Kenesaw, and nothing would reveal
// the miss. Every batch has a location, so every unit lands on exactly one sheet.
export function stockAtLocation(locationCode, items = [], batches = []) {
  const held = new Map();
  for (const b of batches) {
    if (b.status !== "open" || String(b.location) !== String(locationCode)) continue;
    const qty = Number(b.quantityRemaining) || 0;
    if (qty <= 0) continue;
    const cur = held.get(b.itemId) || { itemId: b.itemId, qty: 0, value: 0, shelf: b.shelf || "" };
    cur.qty   += qty;
    cur.value += qty * (Number(b.unitCost) || 0);
    if (!cur.shelf && b.shelf) cur.shelf = b.shelf;
    held.set(b.itemId, cur);
  }
  return [...held.values()]
    .map(h => ({ ...h, item: items.find(i => i.id === h.itemId) || null }))
    .filter(h => h.item);
}

// Move a quantity of one item from one location to another.
//
// Returns a new batch array. Kept here as a pure function rather than inline in
// the reducer so it can be tested on its own — this is the one piece of the
// inventory model where getting it subtly wrong still looks right in the
// totals, and the county-wide figure is exactly the figure nobody checks.
//
// The rules:
//   · Take from the oldest batches at the source first, so cost stays FIFO.
//   · Land the same quantity at the destination at the same unit cost. A
//     transfer is not a purchase; it must never change what the county paid.
//   · Carry the original receipt date, so transferred stock keeps its place in
//     the FIFO queue instead of jumping to the back.
//   · Move what is there. Asking to move more than exists moves everything
//     available rather than inventing stock — the shortfall is returned so the
//     caller can say so.
export function transferStock(batches, { itemId, fromLocation, toLocation, quantity, toShelf = "", ref = "" }) {
  const src = batches
    .filter(b => b.itemId === itemId
              && String(b.location) === String(fromLocation)
              && b.status === "open"
              && (b.quantityRemaining || 0) > 0)
    .sort((a, b) => String(a.receiptDate).localeCompare(String(b.receiptDate)));

  let toMove = Math.abs(Number(quantity) || 0);
  let next = batches;
  const landed = [];

  for (const b of src) {
    if (toMove <= 0) break;
    const take = Math.min(toMove, b.quantityRemaining || 0);
    if (take <= 0) continue;
    const left = (b.quantityRemaining || 0) - take;
    next = next.map(x => x.id === b.id
      ? { ...x, quantityRemaining: left, status: left <= 0 ? "depleted" : "open" }
      : x);
    landed.push({
      ...b,
      id:                `${b.id}-t${landed.length}-${uid()}`,
      location:          toLocation,
      shelf:             toShelf,
      quantityReceived:  take,
      quantityRemaining: take,
      totalCost:         take * (Number(b.unitCost) || 0),
      status:            "open",
      transferredFrom:   fromLocation,
      transferRef:       ref,
    });
    toMove -= take;
  }

  return { batches: [...next, ...landed], moved: Math.abs(Number(quantity) || 0) - toMove, short: toMove };
}

// A group's display label. Always leads with the code, because staff know the
// numbers — "put it in 134" is a thing people say.
export const groupLabel = (g) =>
  !g ? "" : (g.name ? `${g.code ? g.code + " — " : ""}${g.name}` : `Group ${g.code || "?"}`);

// Find a group by its CODE. Batches store the code, so this is how a batch is
// turned back into something with a name and a type.
export const groupByCode = (code, groups = []) =>
  groups.find(g => String(g.code) === String(code)) || null;

// Find a group by its ID. Items store the id for their category, so renaming a
// group or changing its code never orphans an item.
export const groupById = (id, groups = []) =>
  groups.find(g => g.id === id) || null;

// What an item IS, for display. Falls back to the raw legacy group name, which
// every crosswalked item carries, so a dangling reference shows something
// recognisable rather than a dash.
export const categoryName = (item, groups = []) => {
  if (!item) return "—";
  const g = groupById(item.categoryId, groups);
  return g ? groupLabel(g) : (item.commodityGroup || "—");
};

// Where a batch is, for display.
export const locationName = (code, groups = []) =>
  groupLabel(groupByCode(code, groups)) || (code ? `Group ${code}` : "—");

export const createTownship = (overrides = {}) => ({
  id:              uid(),
  name:            "",
  active:          true,
  ...overrides,
});

export const createFemaRate = (overrides = {}) => ({
  id:              uid(),
  category:        "",           // equipment category description
  ratePerHour:     0,
  effectiveDate:   today(),
  notes:           "",
  ...overrides,
});

// County / department info (singleton in settings)
// How many invoices from one vendor the Clerk's claim form will hold before the
// claim has to be split onto another sheet. Confirmed at 15 for Adams County —
// kept as a setting because there is no reason to think every county's form is
// the same.
export const DEFAULT_INVOICES_PER_CLAIM = 15;

export const createCountyInfo = (overrides = {}) => ({
  countyName:      "",
  departmentName:  "County Highway Department",
  invoicesPerClaim: DEFAULT_INVOICES_PER_CLAIM,
  superintendentName: "",
  address:         "",
  city:            "",
  state:           "NE",
  zip:             "",
  phone:           "",
  email:           "",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLES AND PERMISSIONS
//
// What this is, and what it is not.
//
// There is no login yet. Until the county server and Azure AD arrive, anyone can
// pick any role from the switcher, so this shapes what people SEE rather than
// what they are able to do. That is worth being honest about: it is guard rails
// and tidiness now, and becomes enforcement when identity is real.
//
// Access is per module — can this person open Inventory, and can they change
// it. Blunt, but it is the granularity a four-person department can actually
// keep correct. A permission grid nobody maintains is worse than none.
//
// FOUR THINGS ARE NOT IN THE GRID. They are fixed in code because a wrong tick
// on any of them costs real money or real history, and none of them should ever
// be delegable through a settings screen:
//
//   · seeing pay rates            Superintendent, Office Manager
//   · approving a claim cycle     Superintendent, Office Manager
//   · deleting records            Superintendent
//   · account codes & fiscal year Superintendent, Office Manager
//   · editing this grid           Superintendent, Office Manager
// ─────────────────────────────────────────────────────────────────────────────

export const MODULES = [
  { id:"fund",           label:"Fund Accounting" },
  { id:"cost",           label:"Cost Accounting" },
  { id:"projects",       label:"Projects" },
  { id:"inventory",      label:"Inventory" },
  { id:"equipment",      label:"Equipment" },
  { id:"fuel",           label:"Fuel & Tanks" },
  { id:"infrastructure", label:"Infrastructure" },
  { id:"vendors",        label:"Vendors" },
  { id:"payroll",        label:"Employees" },
  { id:"reporting",      label:"Reporting" },
  { id:"settings",       label:"Settings" },
];

export const ACCESS_LEVELS = [
  { id:"none", label:"—",    description:"Cannot open it" },
  { id:"view", label:"View", description:"Can look, cannot change" },
  { id:"edit", label:"Edit", description:"Can add and change" },
];

// The capabilities that are NOT in the module grid.
//
// Each costs real money or real history if it lands on the wrong person, so
// none can be reached by widening a role's module access. They are held
// separately and granted deliberately.
//
// WHO holds them is a setting, not code. Hardcoding "Superintendent and Office
// Manager" would bake one county's org chart into every county's software —
// some have a Clerk's Deputy, some have one person doing all of it.
//
// Two rules keep that safe:
//
//   · the Superintendent role permanently holds all of them and cannot be
//     reduced, so there is always somebody who can approve a claim
//   · `editPermissions` can NEVER be granted away. If it could, whoever
//     received it could grant themselves the rest — handing over the key
//     cabinet rather than a key.
export const LOCKED_CAPABILITIES = [
  { id:"seeRates",     label:"See pay rates",
    why:"Rates are visible to the Superintendent and whoever costs payroll",
    grantable:true },
  { id:"approveClaims", label:"Approve a claim cycle",
    why:"The moment money is authorised",
    grantable:true },
  { id:"deleteRecords", label:"Delete records",
    why:"Deactivating keeps history; deleting destroys it",
    grantable:true },
  { id:"editChartOfAccounts", label:"Edit account codes and fiscal year",
    why:"Changing these mid-year moves every report",
    grantable:true },
  { id:"editPermissions", label:"Change what everyone is allowed to do",
    why:"Never grantable — otherwise a role could widen itself",
    grantable:false },
  { id:"viewAuditTrail", label:"Read the audit trail",
    why:"Who changed what, and when. An auditor can be given a role that reads this and nothing else",
    grantable:true },
];

// The one role that always exists and always holds everything.
export const ROOT_ROLE_ID = "superintendent";

export const createRole = (overrides = {}) => ({
  id:          uid(),
  label:       "",
  description: "",
  // Only two roles are permanent: Superintendent and Office Manager. They hold
  // the locked capabilities, and a department that deletes them locks itself
  // out of its own software.
  //
  // Everything else is a SUGGESTION. Not every county has a Parts Manager or a
  // Project Accountant — some have a Shop Foreman, or one person doing all of
  // it. Those roles ship as a starting point and can be renamed or deleted.
  system:      false,
  permissions: Object.fromEntries(MODULES.map(m => [m.id, "none"])),
  // Locked capabilities held by this role, granted deliberately by the
  // Superintendent. Never reachable through the module grid.
  capabilities: [],
  ...overrides,
});

const perms = (map) => ({
  ...Object.fromEntries(MODULES.map(m => [m.id, "none"])),
  ...map,
});

// One role ships: the Superintendent.
//
// Everything else — Office Manager, Parts Manager, whatever a county calls the
// person who does the claims — is created by the county, because no two are
// organised the same way. The Superintendent is the floor: it always exists,
// always holds every capability, and cannot be reduced, so a department can
// never lock itself out of its own software.
export const DEFAULT_ROLES = [
  createRole({
    id: ROOT_ROLE_ID, label:"Superintendent", system:true,
    description:"Runs the department. Holds everything, and grants the rest.",
    permissions: Object.fromEntries(MODULES.map(m => [m.id, "edit"])),
    capabilities: LOCKED_CAPABILITIES.map(c => c.id),
  }),
];

// A person who uses the system.
//
// Deliberately separate from the employee record. "Someone we pay" and "someone
// who logs in" are different sets that drift apart in both directions: a
// seasonal laborer never opens the system, and county IT might need to. It also
// keeps whoever administers accounts out of payroll data.
export const createUser = (overrides = {}) => ({
  id:          uid(),
  name:        "",
  employeeId:  null,      // optional link to the employee record
  roleIds:     [],        // people wear several hats; permissions are the sum
  active:      true,
  // Where Azure AD attaches when the county server arrives. Empty until then —
  // it exists now so that sign-in is a mapping rather than a schema change, and
  // so every audit entry written before go-live still points at the right
  // person afterwards.
  azureObjectId: "",
  email:       "",
  notes:       "",
  createdAt:   now(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL
//
// Three jobs, in Greg's order: answering an auditor, tracing what went wrong,
// and getting something back that should not have gone.
//
// WHAT IS RECORDED. Money and consequential changes — claims, revenue, project
// costs, inventory adjustments, fuel deliveries, disposals, pay scales, account
// codes, and every change to roles, capabilities and users.
//
// WHAT IS NOT. Fuel dispensed, parts issued, stock received, transfers, work
// orders, tank readings. Those already leave a permanent record as transactions
// with their own date, quantity and cost. Logging them twice doubles the
// storage and makes the trail unsearchable when it is actually needed.
//
// KEYED TO userId, NEVER TO A NAME. A name in the log goes stale — people
// marry, a second Carlia gets hired, Azure AD hands back a different display
// name. An id does not. The name is resolved for display, so history stays
// correct however the person's record changes.
// ─────────────────────────────────────────────────────────────────────────────

export const createAuditEntry = (overrides = {}) => ({
  id:          uid(),
  at:          now(),      // when it happened, to the second
  userId:      null,       // who — resolved to a name for display
  roleIds:     [],         // what they were acting as at the time
  action:      "",         // created | edited | deleted | approved | …
  entity:      "",         // expenditure | revenue | project | role | …
  entityId:    null,
  label:       "",         // human handle: "CL-0231", "M-2026-04"
  module:      "",         // where it happened, for filtering
  // What actually changed. One row per field so a claim that moved by twenty
  // dollars reads as twenty dollars, not as two versions of a whole record.
  changes:     [],         // [{ field, from, to }]
  // Required once a record is official — after a claim is approved or revenue
  // is receipted. Free editing before that point does not ask.
  reason:      "",
  ...overrides,
});

export const AUDIT_ACTIONS = {
  created:  { label:"Created",  color:"#1a5a3a" },
  edited:   { label:"Edited",   color:"#1a3a5c" },
  deleted:  { label:"Deleted",  color:"#c0392b" },
  approved: { label:"Approved", color:"#5a1a8a" },
  submitted:{ label:"Submitted",color:"#d97706" },
  receipted:{ label:"Receipted",color:"#1a5a3a" },
  returned: { label:"Returned", color:"#c0392b" },
  granted:  { label:"Granted",  color:"#5a1a8a" },
  revoked:  { label:"Revoked",  color:"#c0392b" },
  reset:    { label:"Reset",    color:"#c0392b" },
};

// The actions worth logging, by reducer action type. Anything not named here
// passes through unlogged — that is the line, held in one place rather than
// scattered through the reducer.
export const AUDITED = {
  ADD_EXPENDITURE:        { action:"created",  entity:"expenditure", module:"fund" },
  UPDATE_EXPENDITURE:     { action:"edited",   entity:"expenditure", module:"fund" },
  DELETE_EXPENDITURE:     { action:"deleted",  entity:"expenditure", module:"fund" },
  UPDATE_EXP_STATUS:      { action:"edited",   entity:"expenditure", module:"fund" },
  APPROVE_CLAIM_CYCLE:    { action:"approved", entity:"claim cycle", module:"fund" },
  ADD_REVENUE:            { action:"created",  entity:"revenue",     module:"fund" },
  UPDATE_REVENUE:         { action:"edited",   entity:"revenue",     module:"fund" },
  DELETE_REVENUE:         { action:"deleted",  entity:"revenue",     module:"fund" },
  SUBMIT_REVENUE:         { action:"submitted",entity:"revenue",     module:"fund" },
  RECEIPT_REVENUE:        { action:"receipted",entity:"revenue",     module:"fund" },
  RETURN_REVENUE:         { action:"returned", entity:"revenue",     module:"fund" },
  ADJUST_REVENUE:         { action:"edited",   entity:"revenue",     module:"fund" },
  ADD_PROJECT_ENTRY:      { action:"created",  entity:"project cost",module:"cost" },
  UPDATE_PROJECT_ENTRY:   { action:"edited",   entity:"project cost",module:"cost" },
  DELETE_PROJECT_ENTRY:   { action:"deleted",  entity:"project cost",module:"cost" },
  ADD_PROJECT:            { action:"created",  entity:"project",     module:"projects" },
  UPDATE_PROJECT:         { action:"edited",   entity:"project",     module:"projects" },
  DELETE_PROJECT:         { action:"deleted",  entity:"project",     module:"projects" },
  RECONCILE_FUEL_DELIVERY:{ action:"edited",   entity:"fuel delivery", module:"fuel" },
  UPDATE_EQUIPMENT:       { action:"edited",   entity:"equipment",   module:"equipment" },
  DELETE_EQUIPMENT:       { action:"deleted",  entity:"equipment",   module:"equipment" },
  ADD_PAY_SCALE:          { action:"created",  entity:"pay scale",   module:"payroll" },
  UPDATE_PAY_SCALE:       { action:"edited",   entity:"pay scale",   module:"payroll" },
  UPDATE_ROLE_PERMISSION: { action:"edited",   entity:"role",        module:"settings" },
  SET_ROLE_CAPABILITY:    { action:"granted",  entity:"capability",  module:"settings" },
  ADD_ROLE:               { action:"created",  entity:"role",        module:"settings" },
  UPDATE_ROLE:            { action:"edited",   entity:"role",        module:"settings" },
  DELETE_ROLE:            { action:"deleted",  entity:"role",        module:"settings" },
  ADD_USER:               { action:"created",  entity:"user",        module:"settings" },
  UPDATE_USER:            { action:"edited",   entity:"user",        module:"settings" },
  DELETE_USER:            { action:"deleted",  entity:"user",        module:"settings" },
  UPDATE_COUNTY_INFO:     { action:"edited",   entity:"county settings", module:"settings" },
};

// Field-by-field difference between two versions of a record.
//
// Only the fields that actually moved, and never the noisy ones — a changed
// `updatedAt` is not something anybody audits.
const IGNORED_FIELDS = new Set(["createdAt","updatedAt","id"]);

export function diffRecords(before, after) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  for (const k of keys) {
    if (IGNORED_FIELDS.has(k)) continue;
    const a = before[k], b = after[k];
    // Arrays and objects compare by shape rather than identity, so a re-saved
    // record with the same content does not read as a change.
    const same = (typeof a === "object" || typeof b === "object")
      ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
      : a === b;
    if (!same) out.push({ field: k, from: a ?? null, to: b ?? null });
  }
  return out;
}

// Once a record is official, changing it needs a reason. Before that, editing
// is just correcting your own typing.
export const needsReason = (entity, record) => {
  if (entity === "expenditure") return record?.status === "approved";
  if (entity === "revenue")     return record?.status === "receipted";
  return false;
};

const RANK = { none:0, view:1, edit:2 };

// What a set of roles can do with a module. Several roles combine to the most
// permissive — someone who is both Parts Manager and Project Accountant gets
// what either allows, which is the point of wearing two hats.
export function accessTo(moduleId, roleIds = [], roles = DEFAULT_ROLES) {
  let best = "none";
  for (const rid of roleIds) {
    const level = roles.find(r => r.id === rid)?.permissions?.[moduleId] || "none";
    if (RANK[level] > RANK[best]) best = level;
  }
  return best;
}

export const canView = (moduleId, roleIds, roles) => RANK[accessTo(moduleId, roleIds, roles)] >= 1;
export const canEdit = (moduleId, roleIds, roles) => accessTo(moduleId, roleIds, roles) === "edit";

// Does this set of roles hold a locked capability?
//
// Read from the roles themselves, never from the module grid — so no amount of
// ticking module access can reach one. The Superintendent holds all of them
// unconditionally, which is what guarantees somebody always can.
export function hasCapability(capabilityId, roleIds = [], roles = DEFAULT_ROLES) {
  if (!LOCKED_CAPABILITIES.some(c => c.id === capabilityId)) return false;
  if (roleIds.includes(ROOT_ROLE_ID)) return true;
  return roleIds.some(rid =>
    (roles.find(r => r.id === rid)?.capabilities || []).includes(capabilityId));
}

// Can this capability be given to another role at all?
export const isGrantable = (capabilityId) =>
  LOCKED_CAPABILITIES.find(c => c.id === capabilityId)?.grantable === true;

// Legacy single-role helper, kept so existing calls keep working.
export const canSeeRates = (roleOrRoles, roles) =>
  hasCapability("seeRates", Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles], roles);

// User role
export const createUserRole = (overrides = {}) => ({
  id:              uid(),
  role:            "staff",      // superintendent | staff | read_only
  name:            "",
  permissions:     [],           // array of permission strings
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP LISTS
// Every dropdown that might change belongs here rather than hardcoded in a
// module, so Settings can edit it without a code change. Values are stored on
// records as plain strings.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKUP_DEFS = [
  { key:"structureTypes",  label:"Culvert & Structure Types", module:"Infrastructure",
    hint:"Barrel type — encodes material and shape",
    values:["CMP","CMAP","RCP","CBC","CRCX2","CRCX3","Concrete Box","LWC","T-Beam","Wood","Steel","Other"] },
  { key:"signEventTypes",  label:"Sign Event Types", module:"Infrastructure",
    hint:"What happened to a sign",
    values:["replacement","repair","HSIP_upgrade","inspection","removal"] },
  { key:"equipmentTypes",  label:"Equipment Types", module:"Equipment",
    values:["Motor Grader","Truck","Pickup","Loader","Excavator","Dozer","Scraper","Roller","Trailer","Mower","Other"] },
  { key:"woCategories",    label:"Work Order Categories", module:"Equipment",
    values:["repair","preventive_maintenance","accident","warranty","inspection","other"] },
  { key:"woPriorities",    label:"Work Order Priorities", module:"Equipment",
    values:["low","normal","high","urgent"] },
  { key:"pmTasks",         label:"PM Tasks", module:"Equipment",
    values:["Oil & Filter","Grease","Hydraulic Service","Air Filter","Fuel Filter","Annual Inspection","Tire Rotation","Coolant","Other"] },
  { key:"classifications", label:"Job Classifications", module:"Employees",
    hint:"What somebody does. Pay is separate — it lives on the person",
    values:["Laborer","Operator II","Operator III","Road Foreman","Shop Foreman","Mechanic","Bridge Inspector","Sign Tech","Parts Manager","Office Manager","Accountant"] },
  { key:"rateChangeReasons", label:"Reasons Pay Changes", module:"Employees",
    hint:"Six-month review and Step increase are what let the program flag who is due",
    values:[...RATE_CHANGE_REASONS] },
  { key:"certificationTypes", label:"Certification Types", module:"Employees",
    hint:"Warned 90 days before expiry",
    values:["CDL","DOT Medical Card","Bridge Inspector Licence","Superintendent Licence","Pesticide Applicator","CPR","Flagger","First Aid","Specialised Training"] },
  { key:"miscProjectTypes", label:"Miscellaneous Project Types", module:"Projects",
    hint:"General work — snow, mowing, cemeteries. Every hour still gets charged",
    values:["Snow Removal","Mowing","Grading","Equipment Maintenance","Bridge Inspections","Building Repair","Cemeteries","Culverts — Cut","Culverts — Jack","Culverts — Inspection","Driveway Installations","Gravel Deliveries","Illegal Dumping","Paint Striping","Patching","General Road Maintenance","Seeding","Shouldering","Sign Maintenance","Snow Fence","Weed Spraying","Sylvex Patching","Trees — Cutting","Trees — Stacking","Trees — Burning","Village Work","Shop Time","Training"] },
  { key:"fuelDepartments", label:"Fuel — Other Departments", module:"Equipment",
    hint:"County departments billed for fuel",
    values:["Weed","Sheriff","Assessor","Emergency Management","Maintenance"] },
  { key:"unitsOfMeasure",  label:"Units of Measure", module:"Inventory",
    values:["TON","CY","LF","EA","LB","GAL","QT","SF","BX","CS","RL","SET","PR","KIT","OTH"] },
  { key:"haulTypes",       label:"Haul Types", module:"Inventory",
    hint:"Who hauled the load",
    values:["County Pickup","Contractor Delivery"] },
  { key:"projectTypesCapital",  label:"Capital Project Types", module:"Projects", values:[] },
  { key:"projectTypesMaint",    label:"Maintenance Project Types", module:"Projects", values:[] },
  { key:"fundingSources",  label:"Funding Sources", module:"Projects",
    values:["Local","State Aid","Federal","FEMA","Other"] },
  { key:"engPhases",       label:"Engineering Phases", module:"Cost Accounting",
    values:["design","inspection","survey","construction_mgmt","other"] },
  { key:"adjustReasons",   label:"Inventory Adjustment Reasons", module:"Inventory",
    values:["Annual count correction","Damaged / waste","Returned to vendor","Found — not previously recorded","Other"] },
];

// Seeded into state on first run. Shape: { key: string[] }
export const DEFAULT_LOOKUPS = LOOKUP_DEFS.reduce((acc, d) => {
  acc[d.key] = [...d.values];
  return acc;
}, {});

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LOCATION TYPES
// ─────────────────────────────────────────────────────────────────────────────
// There is deliberately no default list of locations. A county's buildings are
// its own; seeding "Kenesaw Shed" into every install would bake one county's
// yard into everybody's software. Locations arrive from the inventory crosswalk
// on first run, and are edited in Settings from then on.
//
// The TYPE matters because it changes what the location can do: a building has
// shelves, a machine ties to a unit in the fleet, a stockpile is measured by
// volume rather than counted.
// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT TOWNSHIPS
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_TOWNSHIPS = [
  "West Blue", "Blaine", "Pauline", "Kenesaw",
  "Roseland", "Holstein", "Oak Creek", "Pleasant Hill",
].map(name => createTownship({ name }));
