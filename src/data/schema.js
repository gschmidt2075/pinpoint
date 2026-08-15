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
export const createInventoryItem = (overrides = {}) => ({
  id:              uid(),
  legacyNumber:    "",            // from existing system (crosswalk reference)
  name:            "",
  description:     "",
  commodityGroup:  "",            // PARTS | FILTERS | CULVERTS | SHOP TOOLS | etc.
  glAccountCode:   "",            // default expenditure code for purchasing
  unitOfMeasure:   "",            // fixed at creation: ton | LF | CY | EA | QUART | etc.
  location:        "",            // shed name or equipment unit number
  shelfLocation:   "",            // A1, B2, etc. (for parts room items)
  fitsEquipment:   [],            // unit numbers this part is compatible with
  standardCost:    0,             // contract/expected unit price
  primaryVendor:   "",
  receivingMode:   "standard",    // standard | scale_ticket_simple | scale_ticket_complex
  active:          true,
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

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
  bidReference:    "",           // the bid this load was priced from
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
  // Sticked, in gallons. Openings normally carry over from yesterday's close,
  // but they are measured rather than assumed — that is the whole point.
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
  pumpedBy:        "",           // who actually pumped it
  taxClass:        "off_road",   // off_road | on_road — tracked for fuel tax
  unitCost:        0,            // $/gal at time of dispensing, from the tank
  totalCost:       0,
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

// A pay scale — the rate for a classification, from a date.
// Rates come from the classification, not the individual (Q24). Rates change on
// anniversary and by Board approval (Q18), and entries keep the rate in force
// when they were made (Q19) — hence a dated series rather than a single number.
export const createPayScale = (overrides = {}) => ({
  id:             uid(),
  classification: "",
  effectiveDate:  today(),
  hourlyRate:     0,
  approvedBy:     "",           // "Board 2026-07-01", "anniversary", …
  notes:          "",
  createdAt:      now(),
  ...overrides,
});

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
  rateOverride:   null,   // null = use the classification's pay scale
  notes:          "",
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
  // Classification history — drives which pay scale applies on a given date
  assignments:       [],         // createEmployeeAssignment[]
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
const latestOnOrBefore = (list, date, key = "effectiveDate") =>
  (list || [])
    .filter(x => x[key] && x[key] <= date)
    .sort((a,b) => b[key].localeCompare(a[key]))[0] || null;

export function resolveClassification(employee, date) {
  return latestOnOrBefore(employee?.assignments, date);
}

export function resolveHourlyRate(employee, date, payScales) {
  const assignment = resolveClassification(employee, date);
  if (!assignment) return { rate: 0, source: "none", classification: "" };
  if (assignment.rateOverride !== null && assignment.rateOverride !== undefined && assignment.rateOverride !== "") {
    return { rate: Number(assignment.rateOverride), source: "override", classification: assignment.classification };
  }
  const scale = latestOnOrBefore(
    (payScales || []).filter(s => s.classification === assignment.classification),
    date
  );
  return {
    rate: scale ? Number(scale.hourlyRate) : 0,
    source: scale ? "scale" : "none",
    classification: assignment.classification,
    scaleDate: scale?.effectiveDate || null,
  };
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
export function laborRateFor(employee, date, payScales) {
  const { rate, source, classification, scaleDate } = resolveHourlyRate(employee, date, payScales);
  const fringe = resolveFringe(employee, date, rate);
  return {
    classification,
    hourlyRate: rate,
    rateSource: source,
    scaleDate,
    overtimeRate: rate * 1.5,          // 1.5x, over 40/week Mon–Sun (Q15, Q16)
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

export const createStorageLocation = (overrides = {}) => ({
  id:              uid(),
  // The legacy code the inventory export uses. Stock is held against this, so
  // it is the identity — the name is a label people can change freely.
  code:            "",
  name:            "",           // Main Shop | Pauline | Kenesaw | Roseland | Holstein | Wanda Stockpile | etc.
  // True when the name was guessed from what is stored there rather than told
  // to us, so the screen can ask someone to confirm it.
  nameInferred:    false,
  type:            "shed",       // shed | stockpile | portable_tank
  itemCount:       0,            // at crosswalk — indicative, not live
  active:          true,
  notes:           "",
  ...overrides,
});

// A location's display label: its name if it has one, otherwise the bare code
// so it is still selectable rather than showing as blank.
export const locationLabel = (loc) =>
  !loc ? "" : (loc.name ? `${loc.code ? loc.code + " — " : ""}${loc.name}` : `Location ${loc.code || "?"}`);

// Find the location record for a code, so an item's stored code can be shown
// with whatever name the county has since given it.
export const locationFor = (code, locations = []) =>
  locations.find(l => String(l.code) === String(code)) || null;

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
    hint:"Each has a pay scale",
    values:["Laborer","Operator II","Operator III","Road Foreman","Shop Foreman","Mechanic","Bridge Inspector","Sign Tech","Parts Manager","Office Manager","Accountant"] },
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
// DEFAULT STORAGE LOCATIONS (loaded into settings on first run)
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_STORAGE_LOCATIONS = [
  { name: "Main Shop",        type: "shed" },
  { name: "Pauline Shed",     type: "shed" },
  { name: "Kenesaw Shed",     type: "shed" },
  { name: "Roseland Shed",    type: "shed" },
  { name: "Holstein Shed",    type: "shed" },
  { name: "Wanda Stockpile",         type: "stockpile" },
  { name: "Adams Central Stockpile", type: "stockpile" },
  { name: "Portable Tank 1",  type: "portable_tank" },
  { name: "Portable Tank 2",  type: "portable_tank" },
  { name: "Portable Tank 3",  type: "portable_tank" },
].map(l => createStorageLocation(l));

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT TOWNSHIPS
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_TOWNSHIPS = [
  "West Blue", "Blaine", "Pauline", "Kenesaw",
  "Roseland", "Holstein", "Oak Creek", "Pleasant Hill",
].map(name => createTownship({ name }));
