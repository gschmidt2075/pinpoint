import { useReducer, useState, useEffect } from "react";
import FundAccounting from "./modules/FundAccounting.jsx";
import CostAccounting from "./modules/CostAccounting.jsx";
import Inventory from "./modules/Inventory.jsx";
import Equipment from "./modules/equipment/index.jsx";
import Fuel from "./modules/fuel/index.jsx";
import Infrastructure from "./modules/Infrastructure.jsx";
import Projects from "./modules/Projects.jsx";
import Settings from "./modules/Settings.jsx";
import Vendors from "./modules/Vendors.jsx";
import Employees from "./modules/Employees.jsx";
import Reporting from "./modules/Reporting.jsx";
import { FISCAL_YEAR } from "./data/accountCodes.js";
import { DEFAULT_TOWNSHIPS, DEFAULT_LOOKUPS, DEFAULT_TANKS, nextWorkOrderNumber,
         createTank, createInventoryGroup, createInventoryItem, createEquipmentUnit,
         createWorkOrder, createVendor, createEmployee,
         DEFAULT_ROLES, createRole, createUser, MODULES, ROOT_ROLE_ID,
         accessTo, canView, canEdit, hasCapability,
         createAuditEntry, AUDITED, diffRecords, transferStock,
         resolveHourlyRate, recostFuelDispensing } from "./data/schema.js";
import { INITIAL_INVENTORY_ITEMS, INITIAL_INVENTORY_BATCHES, INITIAL_INVENTORY_TRANSACTIONS,
         INITIAL_INVENTORY_GROUPS, INVENTORY_EXCEPTIONS } from "./data/inventoryData.js";
import { Icon } from "./components/shared.jsx";
import { UnsavedWorkProvider, useNavigationGuard } from "./components/unsaved.jsx";

// ── Roles ─────────────────────────────────────────────────────────────────────
// Defined in schema.js alongside the permission rules, so the roles and what
// they may do live in one place rather than drifting apart.
//
// There is no login yet — the switcher lets anyone pick any role. Until Azure AD
// arrives on the county server this shapes what people SEE, not what they are
// able to do, and it is worth not pretending otherwise.
export { DEFAULT_ROLES as ROLES, canSeeRates } from "./data/schema.js";

// The role currently selected in the switcher, as a list — permissions are
// written against a set of roles because people wear several hats, and one
// selected role is just a set of one.
const asRoles = (role) => (Array.isArray(role) ? role : [role]).filter(Boolean);

// ── Global State ──────────────────────────────────────────────────────────────
const initialState = {
  // ── Fund Accounting ──────────────────────────────────────────────────────
  expenditures:       [],   // createExpenditure[]
  revenue:            [],   // createRevenue[]
  amendments:         [],   // createAmendment[]
  journalEntries:     [],   // createJournalEntry[]

  // ── Inventory ────────────────────────────────────────────────────────────
  inventoryItems:         INITIAL_INVENTORY_ITEMS,        // createInventoryItem[]
  inventoryBatches:       INITIAL_INVENTORY_BATCHES,       // createInventoryBatch[] — FIFO cost records
  inventoryTransactions:  INITIAL_INVENTORY_TRANSACTIONS,  // all transaction types (receive, issue, transfer, etc.)

  // ── Projects & Cost Accounting ───────────────────────────────────────────
  // Cost entries (labor, equipment, materials, contractor, engineering)
  // live INSIDE each project record — not in a separate array
  projects:           [],   // createProject[]

  // ── Equipment ────────────────────────────────────────────────────────────
  equipment:          [],   // createEquipmentUnit[]
  pmLogs:             [],   // createPMLog[]
  workOrders:         [],   // createWorkOrder[] — repair/maintenance events per unit

  // ── Fuel & Tanks ─────────────────────────────────────────────────────────
  tanks:              DEFAULT_TANKS,   // createTank[] — the 8 real tanks
  tankTransactions:   [],   // createTankTransaction[]
  // Daily product inventory for underground tanks — required by Nebraska under
  // 40 CFR 280.43(a). Every operating day, per tank.
  dailyInventory:     [],   // createDailyInventory[]
  fuelDispensing:     [],   // createFuelDispensing[]

  // ── Infrastructure ───────────────────────────────────────────────────────
  roads:              [],   // createRoad[]
  bridges:            [],   // createBridge[]
  structures:         [],   // createStructure[] (culverts, structures, small bridges)
  signs:              [],   // createSign[]
  signHistory:        [],   // createSignHistory[]

  // ── People & Vendors ─────────────────────────────────────────────────────
  vendors:            [],   // createVendor[]
  employees:          [],   // createEmployee[]

  // ── Settings / Lookups ───────────────────────────────────────────────────
  // Backward-compat aliases — removed when old modules are rebuilt
  fuelLogs:           [],   // alias for fuelDispensing (Equipment.jsx old)

  // Which generation of the seeded lists this data came from. See SEED_VERSION.
  seedVersion:        2,

  countyInfo:         {},
  fiscalYear:         null,
  // ONE list of commodity groups, used twice: an item's categoryId names a group
  // (what it IS) and a batch's location holds a group code (where it is). Day
  // one they are identical for every item, so staff see the list they know from
  // R&B; they diverge the first time something is transferred.
  inventoryGroups:    INITIAL_INVENTORY_GROUPS,
  // Everything the crosswalk could not carry over cleanly, with the CSV row and
  // a reason. Surfaced in the Inventory module rather than buried in a log.
  inventoryExceptions: INVENTORY_EXCEPTIONS,
  townships:          DEFAULT_TOWNSHIPS,
  // Editable dropdown lists — managed in Settings, never hardcoded in modules
  lookups:            DEFAULT_LOOKUPS,
  // Roles are editable; the locked capabilities in schema.js are not.
  roles:              DEFAULT_ROLES,
  users:              [],   // createUser[] — separate from employees, on purpose
  auditTrail:         [],   // createAuditEntry[] — newest last
  customFunds:        [],
  customAccountCodes: {},
  femaRates:          [],
  // Named fuel taxes with dated rates — state, federal, or whatever a county
  // actually remits. Empty by default: nobody's rate is another county's rate.
  fuelTaxRates:       [],   // createFuelTaxRate[]
  userRoles:          [],
};

// ── Reducer ───────────────────────────────────────────────────────────────────
function baseReducer(state, action) {
  switch (action.type) {

    // ── Fund Accounting ────────────────────────────────────────────────────
    case "ADD_EXPENDITURE":
      return { ...state, expenditures: [...state.expenditures, action.payload] };
    case "UPDATE_EXPENDITURE":
      return { ...state, expenditures: state.expenditures.map(e => e.id === action.payload.id ? action.payload : e) };
    case "UPDATE_EXP_STATUS":
      return { ...state, expenditures: state.expenditures.map(e => e.id === action.payload.id ? { ...e, status: action.payload.status } : e) };
    case "DELETE_EXPENDITURE":
      return { ...state, expenditures: state.expenditures.filter(e => e.id !== action.payload) };

    // ── Revenue ────────────────────────────────────────────────────────────
    // Revenue runs through the Treasurer, not the claim cycle. It's freely
    // editable until receipted; after that, changes are recorded as adjustments
    // because the Treasurer holds a matching record.
    case "ADD_REVENUE":
      return { ...state, revenue: [...state.revenue, action.payload] };
    case "UPDATE_REVENUE":
      return { ...state, revenue: state.revenue.map(r => r.id === action.payload.id ? action.payload : r) };
    case "DELETE_REVENUE":
      return { ...state, revenue: state.revenue.filter(r => r.id !== action.payload) };

    // Sent to the Treasurer
    case "SUBMIT_REVENUE":
      return { ...state, revenue: state.revenue.map(r =>
        r.id !== action.payload.id ? r
          : { ...r, status:"submitted", submittedDate: action.payload.date, returnedReason:"" }) };

    // The Treasurer's receipt — this is what makes it official
    case "RECEIPT_REVENUE":
      return { ...state, revenue: state.revenue.map(r =>
        r.id !== action.payload.id ? r
          : { ...r, status:"receipted", receiptNumber: action.payload.receiptNumber,
              receiptDate: action.payload.receiptDate, returnedReason:"" }) };

    // Came back for correction
    case "RETURN_REVENUE":
      return { ...state, revenue: state.revenue.map(r =>
        r.id !== action.payload.id ? r
          : { ...r, status:"returned", returnedReason: action.payload.reason }) };

    // A change after receipting — recorded rather than silently applied
    case "ADJUST_REVENUE":
      return { ...state, revenue: state.revenue.map(r =>
        r.id !== action.payload.id ? r
          : { ...r, ...action.payload.changes,
              adjustments: [...(r.adjustments||[]), action.payload.adjustment] }) };

    case "ADD_AMENDMENT":
      return { ...state, amendments: [...state.amendments, action.payload] };

    case "ADD_JOURNAL_ENTRY":
      return { ...state, journalEntries: [...state.journalEntries, action.payload] };

    // Approve all expenditures + revenue in a claim cycle (board approval)
    case "APPROVE_CLAIM_CYCLE": {
      const cycleId = action.payload;
      return {
        ...state,
        expenditures: state.expenditures.map(e =>
          e.claimCycleId === cycleId && e.status !== "approved" ? { ...e, status: "approved" } : e
        ),
      };
    }
    // Submit all expenditures + revenue in a claim cycle
    case "SUBMIT_CLAIM_CYCLE": {
      const cycleId = action.payload;
      return {
        ...state,
        expenditures: state.expenditures.map(e =>
          e.claimCycleId === cycleId && e.status === "entered" ? { ...e, status: "submitted" } : e
        ),
      };
    }

    // ── Projects & Cost Accounting ─────────────────────────────────────────
    case "ADD_PROJECT":
      return { ...state, projects: [...state.projects, action.payload] };
    case "UPDATE_PROJECT":
      return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
    case "DELETE_PROJECT":
      return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };

    // Add a cost entry to a project (entryType = laborEntries | equipmentEntries | materialEntries | contractorEntries | engineeringEntries)
    case "ADD_PROJECT_ENTRY": {
      const { projectId, entryType, entry } = action.payload;
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id !== projectId ? p : { ...p, [entryType]: [...(p[entryType] || []), entry] }
        ),
      };
    }
    // A reconciled invoice changed the rate on a batch this entry consumed.
    // Accept the new cost, or keep the original and clear the flag.
    case "RESOLVE_COST_REVIEW": {
      const { projectId, entryId, accept } = action.payload;
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id !== projectId ? p : {
            ...p,
            materialEntries: (p.materialEntries || []).map(e => {
              if (e.id !== entryId || !e.costReview) return e;
              const { proposedTotal, newUnitCost, batchId } = e.costReview;
              const { costReview, ...rest } = e;
              if (!accept) return rest;
              return {
                ...rest,
                totalCost: proposedTotal,
                batchLines: (e.batchLines || []).map(l =>
                  l.batchId === batchId
                    ? { ...l, unitCost: newUnitCost, totalCost: (l.quantity || 0) * newUnitCost }
                    : l
                ),
              };
            }),
          }
        ),
      };
    }

    // ── Lookup lists (editable dropdowns) ──────────────────────────────────
    case "ADD_LOOKUP_VALUE": {
      const { key, value } = action.payload;
      const list = state.lookups?.[key] || [];
      if (!value || list.includes(value)) return state;
      return { ...state, lookups: { ...state.lookups, [key]: [...list, value] } };
    }
    // Renaming updates the list only. Records store the string, so existing rows
    // keep the old value until edited — see Settings Q3, still unanswered.
    case "RENAME_LOOKUP_VALUE": {
      const { key, oldValue, newValue } = action.payload;
      const list = state.lookups?.[key] || [];
      if (!newValue || oldValue === newValue) return state;
      return {
        ...state,
        lookups: { ...state.lookups, [key]: list.map(v => v === oldValue ? newValue : v) },
      };
    }
    case "DELETE_LOOKUP_VALUE": {
      const { key, value } = action.payload;
      const list = state.lookups?.[key] || [];
      return { ...state, lookups: { ...state.lookups, [key]: list.filter(v => v !== value) } };
    }
    case "REORDER_LOOKUP_VALUE": {
      const { key, value, direction } = action.payload;
      const list = [...(state.lookups?.[key] || [])];
      const i = list.indexOf(value);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return state;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...state, lookups: { ...state.lookups, [key]: list } };
    }
    case "RESET_LOOKUP": {
      const { key, values } = action.payload;
      return { ...state, lookups: { ...state.lookups, [key]: [...values] } };
    }

    // Update a cost entry within a project
    case "UPDATE_PROJECT_ENTRY": {
      const { projectId, entryType, entry } = action.payload;
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id !== projectId ? p : {
            ...p,
            [entryType]: (p[entryType] || []).map(e => e.id === entry.id ? entry : e),
          }
        ),
      };
    }
    // Delete a cost entry from a project
    case "DELETE_PROJECT_ENTRY": {
      const { projectId, entryType, entryId } = action.payload;
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id !== projectId ? p : {
            ...p,
            [entryType]: (p[entryType] || []).filter(e => e.id !== entryId),
          }
        ),
      };
    }

    // ── Inventory ──────────────────────────────────────────────────────────
    case "ADD_INVENTORY_ITEM":
      return { ...state, inventoryItems: [...state.inventoryItems, action.payload] };
    case "UPDATE_INVENTORY_ITEM":
      return { ...state, inventoryItems: state.inventoryItems.map(i => i.id === action.payload.id ? action.payload : i) };
    case "DELETE_INVENTORY_ITEM":
      return { ...state, inventoryItems: state.inventoryItems.map(i => i.id === action.payload ? { ...i, active: false } : i) };

    case "ADD_INVENTORY_BATCH":
      return { ...state, inventoryBatches: [...state.inventoryBatches, action.payload] };
    case "UPDATE_INVENTORY_BATCH":
      return { ...state, inventoryBatches: state.inventoryBatches.map(b => b.id === action.payload.id ? action.payload : b) };

    // Add a transaction and update batch(es) accordingly
    case "ADD_INVENTORY_TRANSACTION": {
      const tx = action.payload;
      let batches = [...state.inventoryBatches];

      if (tx.type === "receive" || tx.type === "scale_ticket" || tx.type === "crosswalk") {
        // Batch is already created and passed in tx.batch — just add it
        if (tx.batch) batches = [...batches, tx.batch];
      }

      if (tx.type === "issue") {
        // Decrement batches in FIFO order using batchLines from the transaction
        (tx.batchLines || []).forEach(line => {
          batches = batches.map(b =>
            b.id === line.batchId
              ? { ...b, quantityRemaining: Math.max(0, b.quantityRemaining - line.quantity), status: b.quantityRemaining - line.quantity <= 0 ? "depleted" : "open" }
              : b
          );
        });
      }

      if (tx.type === "transfer") {
        // A transfer moves a QUANTITY, not a batch.
        //
        // This used to reassign the whole batch to the destination: move 5 of
        // the 14 blades at Kenesaw and all 14 followed, leaving Kenesaw showing
        // nothing and Holstein showing fourteen. Nobody caught it because the
        // county-wide total stayed right — only the per-shed figures were wrong,
        // and the old system had no per-shed figures to compare against.
        //
        // The arithmetic lives in schema.js so it can be tested directly.
        batches = transferStock(batches, {
          itemId:       tx.itemId,
          fromLocation: tx.fromLocation,
          toLocation:   tx.toLocation,
          quantity:     tx.quantity,
          toShelf:      tx.toShelf || "",
          ref:          tx.id,
        }).batches;
      }

      if (tx.type === "adjustment") {
        // Apply to oldest open batch first (FIFO order)
        const itemBatches = batches
          .filter(b => b.itemId === tx.itemId && b.location === tx.location && b.status === "open")
          .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));
        let remaining = Math.abs(tx.quantityAdjustment);
        const isNegative = tx.quantityAdjustment < 0;
        batches = batches.map(b => {
          if (!itemBatches.find(ib => ib.id === b.id) || remaining <= 0) return b;
          const change = Math.min(remaining, b.quantityRemaining);
          remaining -= change;
          const newQty = isNegative
            ? Math.max(0, b.quantityRemaining - change)
            : b.quantityRemaining + change;
          return { ...b, quantityRemaining: newQty, status: newQty <= 0 ? "depleted" : "open" };
        });
      }

      let projects = state.projects;

      if (tx.type === "reconcile") {
        // Invoice reconciliation — lock the unit cost on the batch.
        if (tx.batchId && tx.newUnitCost !== undefined) {
          const oldBatch = batches.find(b => b.id === tx.batchId);
          const oldUnitCost = oldBatch?.unitCost ?? 0;
          const rateChanged = Math.abs(oldUnitCost - tx.newUnitCost) > 0.0001;

          batches = batches.map(b =>
            b.id === tx.batchId
              ? { ...b, unitCost: tx.newUnitCost, totalCost: tx.newUnitCost * b.quantityReceived, invoiceStatus: "final", invoiceRef: tx.invoiceRef || b.invoiceRef }
              : b
          );

          // If the invoice rate differs from what was estimated, any project that
          // already consumed this batch now carries a stale cost. Flag those
          // entries for review rather than changing project costs silently —
          // someone may have already reported on that project.
          if (rateChanged) {
            projects = projects.map(p => {
              const entries = p.materialEntries || [];
              let touched = false;
              const updated = entries.map(e => {
                const lines = e.batchLines || [];
                const hit = lines.find(l => l.batchId === tx.batchId);
                if (!hit) return e;
                touched = true;
                // Recompute what this entry would cost at the invoiced rate.
                const proposedTotal = lines.reduce((s, l) =>
                  s + (l.batchId === tx.batchId
                    ? (l.quantity || 0) * tx.newUnitCost
                    : (l.totalCost || 0)), 0);
                return {
                  ...e,
                  costReview: {
                    batchId:     tx.batchId,
                    invoiceRef:  tx.invoiceRef || "",
                    oldUnitCost,
                    newUnitCost: tx.newUnitCost,
                    currentTotal: e.totalCost || 0,
                    proposedTotal,
                    flaggedAt:   new Date().toISOString(),
                  },
                };
              });
              return touched ? { ...p, materialEntries: updated } : p;
            });
          }
        }
      }

      return {
        ...state,
        projects,
        inventoryBatches: batches,
        inventoryTransactions: [...state.inventoryTransactions, tx],
      };
    }

    // ── Equipment ──────────────────────────────────────────────────────────
    case "ADD_EQUIPMENT":
      return { ...state, equipment: [...state.equipment, action.payload] };
    case "UPDATE_EQUIPMENT":
      return { ...state, equipment: state.equipment.map(u => u.id === action.payload.id ? action.payload : u) };
    case "UPDATE_EQUIPMENT_STATUS":
      return { ...state, equipment: state.equipment.map(u => u.id === action.payload.id ? { ...u, status: action.payload.status } : u) };

    case "ADD_PM_SCHEDULE":
      return {
        ...state,
        equipment: state.equipment.map(u =>
          u.id !== action.payload.unitId ? u : { ...u, pmSchedule: [...(u.pmSchedule || []), action.payload.pm] }
        ),
      };
    case "UPDATE_PM_SCHEDULE":
      return {
        ...state,
        equipment: state.equipment.map(u =>
          u.id !== action.payload.unitId ? u : {
            ...u,
            pmSchedule: (u.pmSchedule || []).map(s => s.id === action.payload.pm.id ? action.payload.pm : s),
          }
        ),
      };
    case "ADD_PM_LOG":
      return { ...state, pmLogs: [...state.pmLogs, action.payload] };

    // ── Work Orders ────────────────────────────────────────────────────────
    // The number is assigned here rather than in the form. A form only ever sees
    // the machine it's looking at, so numbering from there restarted at 001 for
    // every unit and put the same number on several machines. The reducer is the
    // only place that can see them all. A number typed by hand is respected —
    // unless it's already taken, in which case it's replaced rather than
    // duplicated.
    case "ADD_WORK_ORDER": {
      const wanted = String(action.payload.workOrderNumber || "").trim();
      const taken  = state.workOrders.some(w => w.workOrderNumber === wanted);
      const number = (!wanted || taken)
        ? nextWorkOrderNumber(state.workOrders, action.payload.openedDate)
        : wanted;
      return { ...state, workOrders: [...state.workOrders, { ...action.payload, workOrderNumber: number }] };
    }
    case "UPDATE_WORK_ORDER":
      return { ...state, workOrders: state.workOrders.map(w => w.id === action.payload.id ? action.payload : w) };
    // Closing a work order. If it satisfies a PM schedule, stamp the schedule so
    // the interval resets — otherwise the due warnings would keep firing for work
    // that's already been done.
    case "CLOSE_WORK_ORDER": {
      const closedDate = action.payload.closedDate || new Date().toISOString().split("T")[0];
      const wo = state.workOrders.find(w => w.id === action.payload.id);
      const meterAtClose = action.payload.meterReadingClose ?? wo?.meterReadingClose ?? 0;

      const workOrders = state.workOrders.map(w =>
        w.id !== action.payload.id ? w
          : { ...w, status:"closed", closedDate,
              meterReadingClose: meterAtClose || w.meterReadingClose });

      // Any work at all carries the meter forward — the shop reads it whenever
      // it touches a machine, even to add a quart of oil, and that reading is
      // what every PM interval is measured against.
      let equipment = state.equipment;
      if (wo?.unitId && meterAtClose) {
        equipment = state.equipment.map(u => {
          if (u.id !== wo.unitId) return u;
          // Forward only. A mistyped low reading must not wind a machine back.
          const current = Math.max(Number(u.currentMeter)||0, Number(meterAtClose)||0);
          // Lifetime, so a replaced gauge doesn't reset the clock.
          const lifetime = (Number(u.meterOffset)||0) + current;
          return {
            ...u,
            currentMeter: current,
            // Only the schedule this work order was raised against is stamped.
            // Closing a hydraulic job does not reset the oil change.
            pmSchedule: (u.pmSchedule||[]).map(sc =>
              (wo.pmScheduleId && sc.id === wo.pmScheduleId)
                ? { ...sc, lastDoneMeter: lifetime, lastDoneDate: closedDate }
                : sc),
          };
        });
      }
      return { ...state, workOrders, equipment };
    }
    case "VOID_WORK_ORDER":
      return { ...state, workOrders: state.workOrders.map(w => w.id === action.payload ? { ...w, status: "void" } : w) };

    // Add a cost entry to a work order (entryType = laborEntries | partEntries | serviceEntries)
    case "ADD_WORK_ORDER_ENTRY": {
      const { workOrderId, entryType, entry } = action.payload;
      return {
        ...state,
        workOrders: state.workOrders.map(w => {
          if (w.id !== workOrderId) return w;
          const updated = { ...w, [entryType]: [...(w[entryType] || []), entry] };
          // Recalculate totals
          updated.totalLaborCost   = (updated.laborEntries   || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalPartsCost   = (updated.partEntries    || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalServiceCost = (updated.serviceEntries || []).reduce((s,e) => s + (e.amount||0),    0);
          updated.totalCost = updated.totalLaborCost + updated.totalPartsCost + updated.totalServiceCost;
          return updated;
        }),
      };
    }
    case "UPDATE_WORK_ORDER_ENTRY": {
      const { workOrderId, entryType, entry } = action.payload;
      return {
        ...state,
        workOrders: state.workOrders.map(w => {
          if (w.id !== workOrderId) return w;
          const updated = { ...w, [entryType]: (w[entryType] || []).map(e => e.id === entry.id ? entry : e) };
          updated.totalLaborCost   = (updated.laborEntries   || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalPartsCost   = (updated.partEntries    || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalServiceCost = (updated.serviceEntries || []).reduce((s,e) => s + (e.amount||0),    0);
          updated.totalCost = updated.totalLaborCost + updated.totalPartsCost + updated.totalServiceCost;
          return updated;
        }),
      };
    }
    case "DELETE_WORK_ORDER_ENTRY": {
      const { workOrderId, entryType, entryId } = action.payload;
      return {
        ...state,
        workOrders: state.workOrders.map(w => {
          if (w.id !== workOrderId) return w;
          const updated = { ...w, [entryType]: (w[entryType] || []).filter(e => e.id !== entryId) };
          updated.totalLaborCost   = (updated.laborEntries   || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalPartsCost   = (updated.partEntries    || []).reduce((s,e) => s + (e.totalCost||0), 0);
          updated.totalServiceCost = (updated.serviceEntries || []).reduce((s,e) => s + (e.amount||0),    0);
          updated.totalCost = updated.totalLaborCost + updated.totalPartsCost + updated.totalServiceCost;
          return updated;
        }),
      };
    }

    // ── Fuel & Tanks ───────────────────────────────────────────────────────
    case "ADD_TANK":
      return { ...state, tanks: [...state.tanks, action.payload] };
    case "UPDATE_TANK":
      return { ...state, tanks: state.tanks.map(t => t.id === action.payload.id ? action.payload : t) };

    // The invoice for a fuel delivery, once it lands. The claim was already
    // raised from the bid price; this records what the paper actually said and
    // corrects the claim if it differs.
    case "RECONCILE_FUEL_DELIVERY": {
      const { txId, invoicedAmount, invoiceNumber, date, accept } = action.payload;
      const tx = state.tankTransactions.find(t => t.id === txId);
      if (!tx) return state;

      const tankTransactions = state.tankTransactions.map(t =>
        t.id !== txId ? t : {
          ...t,
          invoicedAmount, invoiceNumber: invoiceNumber || t.invoiceNumber,
          reconciledDate: date, invoiceStatus: accept ? "reconciled" : "disputed",
        });

      // Only an accepted invoice moves the money. A disputed one leaves the
      // claim at the bid price and flags it, because the county's position is
      // that the bid is what was agreed.
      const expenditures = (accept && tx.expenditureId)
        ? state.expenditures.map(e => e.id !== tx.expenditureId ? e : {
            ...e,
            reference: invoiceNumber || e.reference,
            totalAmount: invoicedAmount,
            lines: (e.lines || []).map((l, i) =>
              i === 0 ? { ...l, amount: invoicedAmount } : l),
          })
        : state.expenditures;

      return { ...state, tankTransactions, expenditures };
    }

    // ── Roles & users ──────────────────────────────────────────────────────
    // Granting a locked capability. The root role always holds everything and
    // cannot be reduced; editPermissions can never be handed to anyone else,
    // because whoever received it could then grant themselves the rest.
    case "SET_ROLE_CAPABILITY": {
      const { roleId, capabilityId, granted } = action.payload;
      if (roleId === ROOT_ROLE_ID) return state;
      if (capabilityId === "editPermissions") return state;
      return { ...state, roles: state.roles.map(r => {
        if (r.id !== roleId) return r;
        const held = new Set(r.capabilities || []);
        granted ? held.add(capabilityId) : held.delete(capabilityId);
        return { ...r, capabilities: [...held] };
      }) };
    }

    case "UPDATE_ROLE_PERMISSION":
      if (action.payload.roleId === ROOT_ROLE_ID) return state;
      return { ...state, roles: state.roles.map(r =>
        r.id !== action.payload.roleId ? r
          : { ...r, permissions: { ...r.permissions, [action.payload.moduleId]: action.payload.level } }) };
    case "ADD_ROLE":
      return { ...state, roles: [...state.roles, action.payload] };
    case "UPDATE_ROLE":
      return { ...state, roles: state.roles.map(r => r.id === action.payload.id ? action.payload : r) };
    // System roles cannot be deleted — something has to hold the locked
    // capabilities, and a department that deletes its Superintendent role locks
    // itself out of its own software.
    case "DELETE_ROLE":
      return { ...state, roles: state.roles.filter(r => r.id !== action.payload || r.system) };
    case "ADD_USER":
      return { ...state, users: [...(state.users||[]), action.payload] };
    case "UPDATE_USER":
      return { ...state, users: (state.users||[]).map(u => u.id === action.payload.id ? action.payload : u) };
    case "DELETE_USER":
      return { ...state, users: (state.users||[]).filter(u => u.id !== action.payload) };

    case "ADD_DAILY_INVENTORY":
      return { ...state, dailyInventory: [...(state.dailyInventory||[]), action.payload] };
    case "UPDATE_DAILY_INVENTORY":
      return { ...state, dailyInventory: (state.dailyInventory||[]).map(r =>
        r.id === action.payload.id ? action.payload : r) };
    case "DELETE_DAILY_INVENTORY":
      return { ...state, dailyInventory: (state.dailyInventory||[]).filter(r => r.id !== action.payload) };

    case "ADD_TANK_TRANSACTION": {
      const tx = action.payload;
      // Update running tank level
      const tanks = state.tanks.map(t => {
        if (t.id !== tx.tankId) return t;
        return { ...t, currentLevel: t.currentLevel + tx.gallons };
      });
      // If portable fill — also decrement source tank
      let tanksAfter = tanks;
      if (tx.type === "portable_fill" && tx.sourceTankId) {
        tanksAfter = tanks.map(t =>
          t.id !== tx.sourceTankId ? t : { ...t, currentLevel: Math.max(0, t.currentLevel - Math.abs(tx.gallons)) }
        );
      }
      // A delivery is fuel arriving AND an invoice to pay. Recording it once
      // does both — otherwise the same paperwork gets keyed twice, in two
      // places, and eventually one of them is missed.
      //
      // The claim is complete from the start because fuel is bid per load and
      // the price per gallon is known when the truck arrives.
      let expenditures = state.expenditures;
      if (tx.type === "delivery" && tx.expenditure) {
        expenditures = [...state.expenditures, tx.expenditure];
      }
      const stored = { ...tx };
      delete stored.expenditure;   // the claim lives in expenditures, not on the tank record

      // A delivery can carry an ADDITIVE, which comes off the shelf. Same rule
      // as DEF into a machine: the issue travels with the transaction, so a jug
      // of BG cannot go into a tank without leaving inventory.
      //
      // Keyed on the transaction being PRESENT rather than on the tank
      // transaction's type — the additive now rides on a delivery, and a check
      // for type "additive" silently stopped taking it off the shelf the moment
      // it moved. Nothing about that failure would have been visible.
      let inventoryBatches      = state.inventoryBatches;
      let inventoryTransactions = state.inventoryTransactions;
      if (action.transaction) {
        const it = action.transaction;
        (it.batchLines || []).forEach(line => {
          inventoryBatches = inventoryBatches.map(b => {
            if (b.id !== line.batchId) return b;
            const left = Math.max(0, (b.quantityRemaining || 0) - line.quantity);
            return { ...b, quantityRemaining: left, status: left <= 0 ? "depleted" : "open" };
          });
        });
        inventoryTransactions = [...inventoryTransactions, it];
      }

      return {
        ...state,
        tanks: tanksAfter,
        tankTransactions: [...state.tankTransactions, stored],
        expenditures, inventoryBatches, inventoryTransactions,
      };
    }

    case "ADD_FUEL_DISPENSING": {
      const fd = action.payload;
      // Decrement the source tank level. A fluid taken off a shelf has no tank,
      // so this finds nothing and changes nothing.
      const tanks = state.tanks.map(t =>
        t.id !== fd.sourceTankId ? t : { ...t, currentLevel: Math.max(0, t.currentLevel - fd.gallons) }
      );

      // DEF comes out of inventory, not a tank. The issue travels WITH the fuel
      // entry rather than as a second dispatch, so a jug cannot be poured into a
      // machine without coming off the shelf — the two either both happen or
      // neither does, and there is one audit event rather than two that have to
      // be read together.
      let inventoryBatches      = state.inventoryBatches;
      let inventoryTransactions = state.inventoryTransactions;
      if (fd.sourceType === "inventory" && action.transaction) {
        const tx = action.transaction;
        (tx.batchLines || []).forEach(line => {
          inventoryBatches = inventoryBatches.map(b => {
            if (b.id !== line.batchId) return b;
            const left = Math.max(0, (b.quantityRemaining || 0) - line.quantity);
            return { ...b, quantityRemaining: left, status: left <= 0 ? "depleted" : "open" };
          });
        });
        inventoryTransactions = [...inventoryTransactions, tx];
      }

      // Meters are read at every fuelling — carry the reading onto the unit so PM
      // due dates stay current without anyone entering it twice. Only move it
      // forward; a lower number means a typo or a meter that's since been swapped.
      const equipment = fd.equipmentId && fd.meterReading > 0
        ? state.equipment.map(u =>
            u.id !== fd.equipmentId ? u
              : (fd.meterReading > (u.currentMeter || 0) ? { ...u, currentMeter: fd.meterReading } : u))
        : state.equipment;
      return { ...state, tanks, equipment, inventoryBatches, inventoryTransactions,
               fuelDispensing: [...state.fuelDispensing, fd] };
    }
    case "UPDATE_FUEL_DISPENSING":
      return { ...state, fuelDispensing: state.fuelDispensing.map(f => f.id === action.payload.id ? action.payload : f) };

    // ── Infrastructure ─────────────────────────────────────────────────────
    case "ADD_ROAD":        return { ...state, roads:      [...state.roads,      action.payload] };
    case "UPDATE_ROAD":     return { ...state, roads:      state.roads.map(r      => r.id === action.payload.id ? action.payload : r) };
    case "DELETE_ROAD":     return { ...state, roads:      state.roads.map(r      => r.id === action.payload ? { ...r, status: "inactive" } : r) };

    case "ADD_BRIDGE":      return { ...state, bridges:    [...state.bridges,    action.payload] };
    case "UPDATE_BRIDGE":   return { ...state, bridges:    state.bridges.map(b    => b.id === action.payload.id ? action.payload : b) };

    case "ADD_STRUCTURE":   return { ...state, structures: [...state.structures, action.payload] };
    case "UPDATE_STRUCTURE":return { ...state, structures: state.structures.map(s => s.id === action.payload.id ? action.payload : s) };

    case "ADD_SIGN":        return { ...state, signs:      [...state.signs,      action.payload] };
    case "UPDATE_SIGN":     return { ...state, signs:      state.signs.map(s      => s.id === action.payload.id ? action.payload : s) };
    case "ADD_SIGN_HISTORY":return { ...state, signHistory:[...state.signHistory, action.payload] };

    // ── Employees ──────────────────────────────────────────────────────────
    // There is no pay scale table. Rates live on the person as a dated history
    // — see createRateChange. The old table said the CLASSIFICATION set the
    // pay, which is wrong wherever there is a step program.
    case "ADD_EMPLOYEE":    return { ...state, employees: [...state.employees, action.payload] };
    case "UPDATE_EMPLOYEE": return { ...state, employees: state.employees.map(e => e.id === action.payload.id ? action.payload : e) };

    // A rate change, and the labor entries it moves.
    //
    // Backdating is the point: the Board approves in September, effective July.
    // Every labor entry on or after that date is recosted so the record matches
    // what people were actually paid.
    //
    // This is safe here in a way it would not be in fund accounting, because
    // cost accounting is not money leaving. Greg: "The cost accounting on
    // projects isn't claimed through the fund accounting. It is just a
    // reflection of what work has been done and how it costed out."
    case "SAVE_RATE_CHANGE": {
      const { employeeId, change, assignment } = action.payload;
      const employees = state.employees.map(e => {
        if (e.id !== employeeId) return e;
        const history = [...(e.rateHistory || []).filter(r => r.id !== change.id), change]
          .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
        // A promotion is one event on one form, written as two records so the
        // histories stay separate.
        const assignments = assignment
          ? [...(e.assignments || []).filter(a => a.id !== assignment.id), assignment]
              .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)))
          : e.assignments;
        return { ...e, rateHistory: history, assignments };
      });

      const employee = employees.find(e => e.id === employeeId);
      const projects = (state.projects || []).map(p => {
        const labor = (p.laborEntries || []).map(l => {
          if (l.employeeId !== employeeId || String(l.date) < String(change.effectiveDate)) return l;
          const r = resolveHourlyRate(employee, l.date);
          const st = (Number(l.straightTimeHours) || 0) * r.rate;
          const ot = (Number(l.overtimeHours) || 0) * r.overtimeRate;
          const fringe = st * ((Number(l.fringeRate) || 0) / 100);
          return { ...l, straightTimeRate: r.rate, overtimeRate: r.overtimeRate,
                   classification: r.classification || l.classification,
                   totalCost: Number((st + ot + fringe).toFixed(2)) };
        });
        return labor === p.laborEntries ? p : { ...p, laborEntries: labor };
      });
      return { ...state, employees, projects };
    }

    case "DELETE_RATE_CHANGE":
      return { ...state, employees: state.employees.map(e => e.id !== action.payload.employeeId ? e
        : { ...e, rateHistory: (e.rateHistory || []).filter(r => r.id !== action.payload.id) }) };

    case "ADD_VENDOR":      return { ...state, vendors: [...state.vendors, action.payload] };
    case "UPDATE_VENDOR":   return { ...state, vendors: state.vendors.map(v => v.id === action.payload.id ? action.payload : v) };
    case "DELETE_VENDOR":   return { ...state, vendors: state.vendors.map(v => v.id === action.payload ? { ...v, active: false } : v) };

    // ADD_EMPLOYEE and UPDATE_EMPLOYEE were declared a second time here, below
    // the ones that already handle them. A duplicate `case` is dead — the first
    // wins — so this pair did nothing, silently, and would have kept doing
    // nothing if somebody had "fixed" a bug by editing it. Found by eslint,
    // which was configured in this project and had never been run.
    case "DELETE_EMPLOYEE": return { ...state, employees: state.employees.map(e => e.id === action.payload ? { ...e, active: false } : e) };

    // ── Settings ───────────────────────────────────────────────────────────
    case "UPDATE_COUNTY_INFO":    return { ...state, countyInfo: action.payload };
    case "SET_FISCAL_YEAR":       return { ...state, fiscalYear: action.payload };
    case "UPDATE_ACCOUNT_CODE":   return { ...state, customAccountCodes: { ...state.customAccountCodes, [action.payload.code]: action.payload } };

    // ── Townships & commodity groups ───────────────────────────────────────
    // Both are lists of objects, not strings. Settings previously pushed raw
    // strings into the township list and edited a `locations` alias nothing read,
    // which is why editing them appeared to do nothing.
    case "ADD_TOWNSHIP":
      return { ...state, townships: [...(state.townships || []), action.payload] };
    case "UPDATE_TOWNSHIP":
      return { ...state, townships: (state.townships || []).map(t => t.id === action.payload.id ? action.payload : t) };
    case "REMOVE_TOWNSHIP":
      return { ...state, townships: (state.townships || []).filter(t => t.id !== action.payload) };

    // Commodity groups. Greg: "we will need to be able to add/remove/edit codes."
    case "ADD_INVENTORY_GROUP":
      return { ...state, inventoryGroups: [...(state.inventoryGroups || []), action.payload] };
    case "UPDATE_INVENTORY_GROUP": {
      // Changing a group's CODE has to bring its stock with it. Batches store
      // the code, so an edit that touched only the group would strand every
      // batch at a code nothing answers to — stock present in the total,
      // missing from every count sheet.
      const prev = (state.inventoryGroups || []).find(g => g.id === action.payload.id);
      const recoded = prev && String(prev.code) !== String(action.payload.code);
      return {
        ...state,
        inventoryGroups: (state.inventoryGroups || []).map(g => g.id === action.payload.id ? action.payload : g),
        inventoryBatches: recoded
          ? (state.inventoryBatches || []).map(b =>
              String(b.location) === String(prev.code) ? { ...b, location: action.payload.code } : b)
          : state.inventoryBatches,
        inventoryTransactions: recoded
          ? (state.inventoryTransactions || []).map(t => ({
              ...t,
              location:     String(t.location)     === String(prev.code) ? action.payload.code : t.location,
              fromLocation: String(t.fromLocation) === String(prev.code) ? action.payload.code : t.fromLocation,
              toLocation:   String(t.toLocation)   === String(prev.code) ? action.payload.code : t.toLocation,
            }))
          : state.inventoryTransactions,
      };
    }
    case "REMOVE_INVENTORY_GROUP":
      // The screen blocks this when the group still holds stock or is some
      // item's category; this is the last line of defence, not the first.
      return { ...state, inventoryGroups: (state.inventoryGroups || []).filter(g => g.id !== action.payload) };

    // Loading a county's own inventory, from Settings.
    //
    // This REPLACES the catalog, the groups, the opening batches and the
    // exception list, and leaves everything else — claims, work orders, fuel,
    // revenue — alone. That is the whole point: at go-live the real crosswalk
    // lands on top of whatever was used for testing, without throwing away the
    // work people did while testing.
    //
    // It is destructive to inventory by design, so the screen makes you read
    // what it will do and type a confirmation before dispatching.
    case "IMPORT_INVENTORY":
      return {
        ...state,
        inventoryItems:        action.payload.items,
        inventoryBatches:      action.payload.batches,
        inventoryTransactions: action.payload.transactions,
        inventoryGroups:       action.payload.groups,
        inventoryExceptions:   action.payload.exceptions,
        // Stamp the current seed generation so the built-in data does not
        // reload over the top of a county's own import on the next deploy.
        seedVersion:           SEED_VERSION,
      };

    case "RESOLVE_INVENTORY_EXCEPTION":
      return { ...state, inventoryExceptions: (state.inventoryExceptions || []).map(e =>
        e.id === action.payload.id ? { ...e, resolved: action.payload.resolved } : e) };

    case "REMOVE_TANK":
      return { ...state, tanks: (state.tanks || []).filter(t => t.id !== action.payload) };

    case "ADD_CUSTOM_FUND":    return { ...state, customFunds: [...state.customFunds, action.payload] };
    case "REMOVE_CUSTOM_FUND": return { ...state, customFunds: state.customFunds.filter(f => f !== action.payload) };

    case "ADD_FUEL_TAX_RATE":    return { ...state, fuelTaxRates: [...(state.fuelTaxRates||[]), action.payload] };
    case "UPDATE_FUEL_TAX_RATE": return { ...state, fuelTaxRates: (state.fuelTaxRates||[]).map(r => r.id === action.payload.id ? action.payload : r) };
    case "DELETE_FUEL_TAX_RATE": return { ...state, fuelTaxRates: (state.fuelTaxRates||[]).filter(r => r.id !== action.payload) };

    case "ADD_FEMA_RATE":    return { ...state, femaRates: [...state.femaRates, action.payload] };
    case "UPDATE_FEMA_RATE": return { ...state, femaRates: state.femaRates.map(r => r.id === action.payload.id ? action.payload : r) };
    case "DELETE_FEMA_RATE": return { ...state, femaRates: state.femaRates.filter(r => r.id !== action.payload) };

    default: return state;
  }
}

// Anything that can move a fuel price.
//
// Fuel cost is FIFO, computed from the tank's history rather than typed, so a
// corrected delivery price has to reach every gallon that came out of that
// delivery afterwards — Greg asked for exactly that. Doing it here, once,
// means no screen has to remember to ask for it, and no screen can forget.
const RECOSTS_FUEL = new Set([
  "ADD_TANK_TRANSACTION", "UPDATE_TANK_TRANSACTION", "DELETE_TANK_TRANSACTION",
  "ADD_FUEL_DISPENSING",  "UPDATE_FUEL_DISPENSING",  "DELETE_FUEL_DISPENSING",
  "IMPORT_INVENTORY", "RESET_DATA",
]);

function reducer(state, action) {
  const next = baseReducer(state, action);
  if (!RECOSTS_FUEL.has(action.type)) return next;
  const fuelDispensing = recostFuelDispensing(next.tankTransactions, next.fuelDispensing);
  return fuelDispensing === next.fuelDispensing ? next : { ...next, fuelDispensing };
}

// ── Navigation config ─────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Finance",
    items: [
      { id:"fund",           label:"Fund Accounting",   icon:"ti-building-bank" },
      { id:"cost",           label:"Cost Accounting",   icon:"ti-calculator" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id:"inventory",      label:"Inventory",         icon:"ti-package" },
      { id:"equipment",      label:"Equipment",         icon:"ti-tractor" },
      { id:"fuel",           label:"Fuel & Tanks",      icon:"ti-gas-station" },
      { id:"infrastructure", label:"Infrastructure",    icon:"ti-road" },
      { id:"projects",       label:"Projects",          icon:"ti-clipboard-list" },
      { id:"payroll",        label:"Employees",         icon:"ti-users" },
      { id:"vendors",        label:"Vendors",           icon:"ti-file-invoice" },
    ],
  },
  {
    label: "Admin",
    items: [
      { id:"permitting",     label:"Permitting",        icon:"ti-license",      soon:true },
      { id:"reporting",      label:"Reporting",         icon:"ti-chart-bar" },
      { id:"settings",       label:"Settings",          icon:"ti-settings",     adminOnly:true },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap(g => g.items);

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoon({ tab }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:400, color:"#aaa" }}>
      <Icon name={(tab?.icon||"").replace("ti-","")} size={48} color="#ddd" style={{ display:"block", marginBottom:16 }} />
      <div style={{ fontSize:20, fontWeight:700, color:"#555", marginBottom:8 }}>{tab?.label}</div>
      <div style={{ fontSize:14, color:"#aaa", maxWidth:320, textAlign:"center" }}>This module is coming next.</div>
    </div>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────────
//
// The trail is written by WRAPPING the reducer, not by scattering log calls
// through it. Every state change passes through one place, so an entry cannot
// drift out of step with what actually happened — and adding a new action later
// cannot quietly go unrecorded, because the decision to log lives in one table.
//
// What is captured is the difference between the state before and the state
// after, which is why edits read as "amount 1,240 → 1,420" rather than as two
// copies of a claim.

// Pull a human handle out of a record, so the log says CL-0231 rather than an id.
const labelOf = (rec) =>
  rec?.claimNumber || rec?.projectNumber || rec?.workOrderNumber || rec?.receiptNumber ||
  rec?.reference || rec?.label || rec?.name || rec?.vendor || rec?.itemName || "";

// Find the record an action touched, before and after, so we can diff it.
function findPair(rule, action, before, after) {
  const list = {
    expenditure:"expenditures", revenue:"revenue", project:"projects",
    equipment:"equipment", role:"roles", user:"users", employee:"employees",
  }[rule.entity];
  if (!list) return [null, null];
  const id = action.payload?.id || action.payload?.roleId || action.payload || null;
  const pick = (state) => (state[list] || []).find(r => r?.id === id) || null;
  return [pick(before), pick(after)];
}

function withAudit(baseReducer) {
  return (state, action) => {
    const after = baseReducer(state, action);
    const rule  = AUDITED[action.type];
    if (!rule || after === state) return after;

    const [was, now_] = findPair(rule, action, state, after);
    const record = now_ || was;

    // A "deleted" entry keeps enough of the record to say what was lost —
    // otherwise the trail records that something vanished without saying what.
    const changes = rule.action === "deleted"
      ? Object.entries(was || {})
          .filter(([k,v]) => v !== null && v !== "" && typeof v !== "object")
          .slice(0, 8)
          .map(([field, from]) => ({ field, from, to: null }))
      : diffRecords(was, now_);

    const entry = createAuditEntry({
      userId:   action.meta?.userId ?? null,
      roleIds:  action.meta?.roleIds ?? [],
      action:   rule.action,
      entity:   rule.entity,
      entityId: record?.id ?? null,
      label:    labelOf(record) || action.payload?.label || "",
      module:   rule.module,
      changes,
      reason:   action.meta?.reason || "",
    });
    return { ...after, auditTrail: [...(after.auditTrail || []), entry] };
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────
// Saves state to the browser so work survives a refresh. This is a stopgap for
// testing — replaced by a real database later.
const STORAGE_KEY = "pinpoint.db.v1";
const USER_KEY    = "pinpoint.currentUser";

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Merge saved state onto the defaults.
//
// A shallow spread is not enough. `lookups` and `countyInfo` are objects whose
// KEYS grow as the app grows, and a shallow merge replaces the whole object —
// so anyone who had already used the app never saw a setting added afterwards.
// That is not a small bug: it silently hides new configuration from exactly the
// people testing, and it looks like the feature is broken rather than absent.
//
// Objects merge key by key, with saved values winning. Arrays do NOT merge —
// saved wins outright, because an empty list is a real answer (someone deleted
// every value) and resurrecting defaults would fight the user.
function mergeSaved(defaults, saved) {
  if (!isPlainObject(saved)) return saved === undefined ? defaults : saved;
  const out = { ...defaults };
  for (const key of Object.keys(saved)) {
    const d = defaults?.[key], s = saved[key];
    out[key] = isPlainObject(d) && isPlainObject(s) ? mergeSaved(d, s) : s;
  }
  return out;
}

// Saved RECORDS also go stale, not just saved settings.
//
// mergeSaved fills in keys an object is missing, but arrays are replaced whole —
// a saved tank keeps exactly the fields it had when it was written. Add a field
// to the schema afterwards and every existing record lacks it, so code that
// reads it gets undefined. `tank.tankType.replace(...)` on a tank saved before
// tankType existed throws, and the screen renders nothing at all.
//
// Running each saved record back through its factory gives it defaults for
// anything new while keeping every value it already had. Cheap, and it means
// adding a field can never break somebody's existing data again.
const REHYDRATE = {
  tanks:            createTank,
  roles:            createRole,
  users:            createUser,
  inventoryGroups:     createInventoryGroup,
  inventoryItems:      createInventoryItem,
  equipment:        createEquipmentUnit,
  workOrders:       createWorkOrder,
  vendors:          createVendor,
  employees:        createEmployee,
};

function rehydrate(state) {
  const out = { ...state };
  for (const [key, factory] of Object.entries(REHYDRATE)) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key].map(record =>
      record && typeof record === "object" ? factory(record) : record);
  }
  return out;
}

const auditedReducer = withAudit(reducer);

// Seeded data that has been RESHAPED, not just added to.
//
// mergeSaved fills in missing keys, and rehydrate gives saved records defaults
// for new fields. Neither can help when the shape of the seed itself changes:
// the saved array wins wholesale, so somebody testing since before the
// inventory rebuild would keep 2,375 one-row-per-shed items forever and never
// see the new model at all.
//
// Bumping this replaces those specific seeded lists with the current ones, and
// leaves everything the person actually entered — claims, work orders, fuel —
// untouched. Bump it whenever a seeded list is regenerated in a new shape, and
// say so here.
//
//   1  inventory rebuilt: one item per part number, stock per location  (2026-08-23)
//   2  the commodity group became the single source of truth for both what a
//      thing is and where it is; Inventory Usual Location dropped  (2026-08-26)
// v3: fuel routed out of the inventory catalog to the tanks, and DEF merged
// from five shed rows onto one item. Without a bump, anyone already testing
// keeps the old catalog in localStorage — five DEF items and $55,637.89 of
// diesel counted twice — and would have no idea why the screens disagree with
// what the program now does.
const SEED_VERSION = 3;
const RESEED = ["inventoryItems", "inventoryBatches", "inventoryTransactions",
                "inventoryGroups", "inventoryExceptions",
                // Removed by the v2 rebuild — delete so they cannot linger.
                "storageLocations", "inventoryCategories"];

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw);

    if ((saved.seedVersion || 0) < SEED_VERSION) {
      for (const key of RESEED) delete saved[key];
      console.info(
        `Inventory seed data was rebuilt — reloading it and keeping your other work. ` +
        `(seed v${saved.seedVersion || 0} → v${SEED_VERSION})`);
    }

    const state = rehydrate(mergeSaved(initialState, { ...saved, seedVersion: SEED_VERSION }));
    // Recost the fuel that was saved before this ran. Data written under the
    // old rule — one price per tank, the newest one — is priced wrongly, and
    // this is the only moment that fixes it without anyone being asked to.
    return { ...state, fuelDispensing: recostFuelDispensing(state.tankTransactions, state.fuelDispensing) };
  } catch (err) {
    console.warn("Could not load saved data — starting fresh.", err);
    return initialState;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
// A thin wrapper, so the shell below can USE the unsaved-work guard that this
// provides. A component cannot consume its own context.
export default function App() {
  return (
    <UnsavedWorkProvider>
      <AppShell />
    </UnsavedWorkProvider>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  // Routes a navigation click through the unsaved-work check: runs straight
  // away when nothing is half-typed, asks first when something is.
  const go = useNavigationGuard();
  const [activeTab, setActiveTab] = useState("fund");
  const [role, setRole] = useState("superintendent"); // superintendent | staff
  const [db, rawDispatch] = useReducer(auditedReducer, undefined, loadPersisted);

  // Who is at the keyboard. Remembered per computer, so the parts room machine
  // stays set to whoever normally uses it. Azure AD replaces how this is
  // ANSWERED, not what it is — the user record underneath is unchanged.
  const [currentUserId, setCurrentUserId] = useState(
    () => { try { return localStorage.getItem(USER_KEY) || ""; } catch { return ""; } });
  useEffect(() => {
    try { currentUserId ? localStorage.setItem(USER_KEY, currentUserId) : localStorage.removeItem(USER_KEY); }
    catch {}
  }, [currentUserId]);

  const currentUser = (db.users || []).find(u => u.id === currentUserId) || null;

  // Every dispatch carries who did it, so the reducer wrapper never has to
  // reach outside itself to find out.
  const dispatch = (action) => rawDispatch({
    ...action,
    meta: { userId: currentUserId || null, roleIds: asRoles(role), ...(action.meta || {}) },
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Persist on every change (debounced so large states don't thrash)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch (err) {
        console.warn("Could not save — storage may be full.", err);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [db]);

  const currentTab = ALL_TABS.find(t => t.id === activeTab);

  // Permissions are written against a SET of roles, because people wear several
  // hats. The switcher picks one, so today the set has one member.
  const myRoles = asRoles(role);
  // Passed to every module so it can dim what cannot be changed, rather than
  // each module working it out from the role name.
  const access = {
    roles:   myRoles,
    can:     (m) => accessTo(m, myRoles, db.roles),
    canView: (m) => canView(m, myRoles, db.roles),
    canEdit: (m) => canEdit(m, myRoles, db.roles),
    has:     (cap) => hasCapability(cap, myRoles, db.roles),
  };

  // Landing on a tab you cannot see — after a permission change, or a stale
  // link — should not show an empty screen with no explanation.
  const allowedTab = !currentTab || currentTab.soon || access.canView(activeTab);

  return (
    <div style={{ minHeight:"100vh", background:"#f5f4f0", fontFamily:"'Segoe UI', system-ui, sans-serif", display:"flex", flexDirection:"column" }}>

      {/* Top header */}
      <div style={{ background:"#1a3a5c", color:"#fff", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:18, padding:"4px 6px", borderRadius:4 }}>
            <Icon name="menu-2" size={18} color="rgba(255,255,255,0.7)" />
          </button>
          <div style={{ width:30, height:30, background:"#2d6a9f", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📍</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, lineHeight:1.2 }}>Pinpoint</div>
            <div style={{ fontSize:10, opacity:0.55, letterSpacing:"0.04em" }}>PUBLIC WORKS MANAGEMENT · {FISCAL_YEAR.label}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:12, opacity:0.5 }}>Roads Fund · {FISCAL_YEAR.start} – {FISCAL_YEAR.end}</div>
            <div style={{ display:"flex", background:"rgba(255,255,255,0.1)", borderRadius:6, padding:2 }}>
              {(db.roles || DEFAULT_ROLES).map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} title={r.description} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, border:"none", borderRadius:4, cursor:"pointer", background:role===r.id?"#fff":"transparent", color:role===r.id?"#1a3a5c":"rgba(255,255,255,0.6)", whiteSpace:"nowrap" }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {/* Who is at the keyboard. Remembered per computer, so the parts
              room machine stays set to whoever normally uses it. Azure AD
              replaces how this is answered, not what sits underneath it. */}
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <i className="ti ti-user" style={{ fontSize:14, color:"rgba(255,255,255,0.5)" }} />
            {(db.users || []).filter(u => u.active !== false).length > 0 ? (
              <select
                value={currentUserId}
                onChange={e => setCurrentUserId(e.target.value)}
                title="Who is using this computer — your name goes on what you enter"
                style={{ background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)",
                         borderRadius:5, padding:"4px 8px", fontSize:11, cursor:"pointer", maxWidth:150 }}>
                <option value="" style={{ color:"#333" }}>Not signed in</option>
                {(db.users || []).filter(u => u.active !== false).map(u => (
                  <option key={u.id} value={u.id} style={{ color:"#333" }}>{u.name}</option>
                ))}
              </select>
            ) : (
              <span title="Add people under Settings → Users so their name appears on what they enter"
                style={{ fontSize:11, color:"rgba(255,255,255,0.45)" }}>No users yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ width:190, background:"#fff", borderRight:"1px solid #e8e8e5", flexShrink:0, overflowY:"auto", paddingTop:8 }}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#aaa", padding:"8px 16px 4px" }}>{group.label}</div>
                {group.items.filter(item => item.soon || canView(item.id, myRoles, db.roles)).map(item => (
                  <button key={item.id} onClick={() => !item.soon && go(() => setActiveTab(item.id))} style={{
                    display:"flex", alignItems:"center", gap:10, width:"100%",
                    padding:"9px 16px", background: activeTab===item.id ? "#eef2f8" : "transparent",
                    border:"none", cursor: item.soon ? "default" : "pointer", textAlign:"left",
                    color: activeTab===item.id ? "#1a3a5c" : item.soon ? "#ccc" : "#444",
                    fontWeight: activeTab===item.id ? 700 : 400, fontSize:13,
                    borderLeft: activeTab===item.id ? "3px solid #1a3a5c" : "3px solid transparent",
                    opacity: item.soon ? 0.5 : 1,
                  }}>
                    <Icon name={item.icon.replace("ti-","")} size={16} color={activeTab===item.id ? "#1a3a5c" : "#888"} />
                    <span style={{ flex:1 }}>{item.label}</span>
                    {item.soon && <span style={{ fontSize:9, background:"#f0f0ee", color:"#aaa", padding:"1px 5px", borderRadius:3 }}>SOON</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
          {!allowedTab && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:360, textAlign:"center" }}>
              <Icon name="lock" size={40} color="#ddd" style={{ marginBottom:14 }} />
              <div style={{ fontSize:16, fontWeight:700, color:"#555", marginBottom:6 }}>
                {currentTab?.label} is not open to this role
              </div>
              <div style={{ fontSize:13, color:"#999", maxWidth:340, lineHeight:1.6 }}>
                Access is set in Settings → Roles & Permissions by the Superintendent
                or Office Manager.
              </div>
            </div>
          )}
          {allowedTab && activeTab==="fund"           && <FundAccounting  db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="cost"           && <CostAccounting  db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="inventory"      && <Inventory       db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="equipment"      && <Equipment       db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="fuel"           && <Fuel            db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="infrastructure" && <Infrastructure  db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="projects"       && <Projects        db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="vendors"        && <Vendors         db={db} dispatch={dispatch} access={access} />}
          {allowedTab && activeTab==="payroll"        && <Employees        db={db} dispatch={dispatch} role={role} access={access} />}
          {allowedTab && activeTab==="reporting"      && <Reporting        db={db} dispatch={dispatch} role={role} access={access} />}
          {allowedTab && activeTab==="settings"       && <Settings         db={db} dispatch={dispatch} access={access} />}
          {/* Whether a module exists is already recorded on the nav item as
              `soon`. This used to be a hardcoded list of built tabs, which went
              stale the moment Fuel was added — the module rendered AND the
              "coming next" placeholder rendered underneath it. */}
          {currentTab?.soon && <ComingSoon tab={currentTab} />}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:"10px 24px", borderTop:"1px solid #ddd", background:"#fff", fontSize:11, color:"#aaa", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
        <span>Pinpoint · County Public Works Management · {FISCAL_YEAR.label}</span>
        <span>In-memory session · connect to SQL Server for persistence</span>
      </div>
    </div>
  );
}
