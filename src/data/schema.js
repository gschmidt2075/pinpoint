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
export const createRevenue = (overrides = {}) => ({
  id:          uid(),
  date:        today(),
  code:        "",          // revenue code (e.g. "347.01")
  description: "",
  type:        "miscellaneous", // grant | permit_fee | intergovernmental | bond_proceeds | miscellaneous
  amount:      0,
  reference:   "",
  claimCycleId: "",
  status:      "entered",   // entered | submitted | approved
  notes:       "",
  createdAt:   now(),
  ...overrides,
});

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
  femaRate:        0,            // $/hour
  internalRate:    0,            // $/hour
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
export const createPMSchedule = (overrides = {}) => ({
  id:              uid(),
  equipmentId:     null,
  service:         "",           // "Oil & Filter", "Hydraulic Service", …
  intervalType:    "hours",      // hours | miles | months
  interval:        0,            // e.g. 250, 5000, 12
  warnAhead:       0,            // warn this far out; 0 uses a sensible default
  lastDoneMeter:   null,         // meter reading at last service
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
  name:            "",           // e.g. "Main Shop Diesel", "Portable Tank 1"
  location:        "",           // Main Shop | Pauline | Kenesaw | Roseland | Holstein | Portable
  fuelType:        "diesel",     // diesel | unleaded
  tankType:        "underground",// underground | above_ground | portable
  capacityGallons: 0,
  currentLevel:    0,            // calculated from transactions
  status:          "active",     // active | out_of_service
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

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
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

// Fuel dispensing entry (fuel from any tank to equipment)
export const createFuelDispensing = (overrides = {}) => ({
  id:              uid(),
  date:            today(),
  equipmentId:     null,
  unitNumber:      "",
  fuelType:        "diesel",
  gallons:         0,
  meterReading:    0,            // hour meter OR odometer reading
  meterType:       "hours",      // hours | odometer (from equipment record)
  sourceTankId:    null,
  sourceTankName:  "",
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

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

export const createVendor = (overrides = {}) => ({
  id:              uid(),
  name:            "",
  type:            "supplier",   // contractor | supplier | engineering_firm | utility | other
  contactName:     "",
  phone:           "",
  email:           "",
  address:         "",
  city:            "",
  state:           "NE",
  zip:             "",
  // Insurance (optional — for contractors)
  tracksInsurance: false,
  insurance:       [],           // array of createInsuranceCert()
  // Contract rates (for gravel vendors)
  contractRates:   [],           // array of createContractRate()
  active:          true,
  notes:           "",
  createdAt:       now(),
  ...overrides,
});

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

export const createEmployee = (overrides = {}) => ({
  id:                uid(),
  name:              "",
  employeeId:        "",
  jobTitle:          "",
  classification:    "",
  hireDate:          "",
  phone:             "",
  address:           "",
  // Rates (drive labor entry calculations)
  straightTimeRate:  0,          // $/hour
  overtimeRate:      0,          // $/hour
  fringeRate:        0,          // % applied to straight-time (FEMA standard)
  // Certifications
  certifications:    [],         // array of createCertification()
  active:            true,
  notes:             "",
  createdAt:         now(),
  ...overrides,
});

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
  name:            "",           // Main Shop | Pauline | Kenesaw | Roseland | Holstein | Wanda Stockpile | etc.
  type:            "shed",       // shed | stockpile | portable_tank
  active:          true,
  notes:           "",
  ...overrides,
});

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
export const createCountyInfo = (overrides = {}) => ({
  countyName:      "",
  departmentName:  "County Highway Department",
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
