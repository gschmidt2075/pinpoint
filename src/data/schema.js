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
  meterType:       "hours",      // hours | odometer
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

// PM schedule entry
export const createPMSchedule = (overrides = {}) => ({
  id:              uid(),
  equipmentId:     null,
  service:         "",           // e.g. "Oil Change", "Filter Replacement"
  intervalType:    "hours",      // hours | calendar | both
  intervalHours:   0,
  intervalDays:    0,
  lastServiceDate: "",
  lastServiceHours:0,
  nextServiceDate: "",
  nextServiceHours:0,
  notes:           "",
  ...overrides,
});

// PM log entry
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
  speedLimit:      "",
  sectionTownshipRange: "",      // S/T/R (e.g. "29-8-9")
  latitude:        "",
  longitude:       "",
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
  road:            "",           // road / street name
  features:        "",           // what it crosses (Little Blue, Flat Creek, DITCH, etc.)
  deckWidth:       "",           // feet
  structLength:    "",           // feet
  maxSpanLength:   "",           // feet
  spans:           "",           // number of spans
  yearBuilt:       "",
  // NBIS condition ratings (0-9 scale, entered manually from state report)
  ratingDeck:          null,
  ratingSubstructure:  null,
  ratingSuperstructure:null,
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

export const createStructure = (overrides = {}) => ({
  id:              uid(),
  culvertNumber:   "",           // e.g. "A 1.1", "A 1.2C" (section prefix + space + sequential + suffix)
  designation:     "Structure",  // Structure | Culvert | Bridge (auto-classified by size)
  roadDesignation: "Primary",    // Primary | Secondary
  road:            "",
  township:        "",
  sizeAndType:     "",           // e.g. "2 - 94\" X 50' ROUND CONCRETE"
  featureIntersected: "",        // what it crosses
  drainage:        "",           // DITCH | Big Blue | Tributary | etc.
  route:           "",
  // Condition rating (1-5 scale)
  rating:          null,
  // Physical dimensions
  shape:           "",           // CMP | CBC | CRCX2 | CONCRETE | LWC | T-BEAM | etc.
  diameter:        "",           // inches (or box dimensions)
  length:          "",           // feet
  yearBuilt:       "",
  fasNumber:       "",           // FAS # (state bridge number for larger structures)
  latitude:        "",
  longitude:       "",
  photos:          [],
  project:         "",           // project reference (M- or C1- number)
  status:          "active",     // active | replaced | removed
  notes:           "",
  createdAt:       now(),
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
  supportType:     "",
  supportMaterial: "",
  supportLength:   "",
  stub:            false,
  sheeting:        "",
  // Condition
  signRating:      null,         // 1-5
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
