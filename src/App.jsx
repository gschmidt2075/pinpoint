import { useReducer, useState, useEffect } from "react";
import FundAccounting from "./modules/FundAccounting.jsx";
import CostAccounting from "./modules/CostAccounting.jsx";
import Inventory from "./modules/Inventory.jsx";
import Equipment from "./modules/Equipment.jsx";
import Infrastructure from "./modules/Infrastructure.jsx";
import Projects from "./modules/Projects.jsx";
import Settings from "./modules/Settings.jsx";
import Vendors from "./modules/Vendors.jsx";
import Employees from "./modules/Employees.jsx";
import Reporting from "./modules/Reporting.jsx";
import { FISCAL_YEAR } from "./data/accountCodes.js";
import { DEFAULT_TOWNSHIPS, DEFAULT_LOOKUPS, DEFAULT_TANKS,
         nextWorkOrderNumber } from "./data/schema.js";
import { INITIAL_INVENTORY_ITEMS, INITIAL_INVENTORY_BATCHES, INITIAL_INVENTORY_TRANSACTIONS,
         INITIAL_STORAGE_LOCATIONS } from "./data/inventoryData.js";
import { Icon } from "./components/shared.jsx";

// ── Roles ─────────────────────────────────────────────────────────────────────
// Pay rates are visible to the Superintendent and the Office Manager (Payroll
// Q33). Staff see everything else but no money.
export const ROLES = [
  { id:"superintendent", label:"Superintendent", description:"Full access" },
  { id:"office_manager", label:"Office Manager", description:"Enters claims and payroll costing — sees pay rates" },
  { id:"staff",          label:"Staff",          description:"Day-to-day entry — pay rates hidden" },
];

// Who may see pay rates and loaded labor cost.
export const canSeeRates = (role) => role === "superintendent" || role === "office_manager";

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
  payScales:          [],   // createPayScale[] — rate per classification, dated

  // ── Settings / Lookups ───────────────────────────────────────────────────
  // Backward-compat aliases — removed when old modules are rebuilt
  fuelLogs:           [],   // alias for fuelDispensing (Equipment.jsx old)
  locations:          [],   // alias for storageLocations (Settings.jsx old)

  countyInfo:         {},
  fiscalYear:         null,
  // Seeded from the inventory export, so every location holding stock exists as
  // a record from the start. Most names were inferred from what is stored
  // there; twelve are blank and need someone who knows the buildings.
  storageLocations:   INITIAL_STORAGE_LOCATIONS,
  townships:          DEFAULT_TOWNSHIPS,
  // Editable dropdown lists — managed in Settings, never hardcoded in modules
  lookups:            DEFAULT_LOOKUPS,
  customFunds:        [],
  customAccountCodes: {},
  femaRates:          [],
  userRoles:          [],
};

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
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
        // Move batch to new location
        if (tx.batchId) {
          batches = batches.map(b => b.id === tx.batchId ? { ...b, location: tx.toLocation } : b);
        }
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

      let equipment = state.equipment;
      if (wo?.pmScheduleId && wo.unitId) {
        equipment = state.equipment.map(u => {
          if (u.id !== wo.unitId) return u;
          // Lifetime meter, so a replaced gauge doesn't reset the clock
          const lifetime = (Number(u.meterOffset)||0) + (meterAtClose || Number(u.currentMeter)||0);
          return {
            ...u,
            currentMeter: Math.max(Number(u.currentMeter)||0, meterAtClose||0),
            pmSchedule: (u.pmSchedule||[]).map(sc =>
              sc.id !== wo.pmScheduleId ? sc
                : { ...sc, lastDoneMeter: lifetime, lastDoneDate: closedDate }),
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
      return { ...state, tanks: tanksAfter, tankTransactions: [...state.tankTransactions, tx] };
    }

    case "ADD_FUEL_DISPENSING": {
      const fd = action.payload;
      // Decrement the source tank level
      const tanks = state.tanks.map(t =>
        t.id !== fd.sourceTankId ? t : { ...t, currentLevel: Math.max(0, t.currentLevel - fd.gallons) }
      );
      // Meters are read at every fuelling — carry the reading onto the unit so PM
      // due dates stay current without anyone entering it twice. Only move it
      // forward; a lower number means a typo or a meter that's since been swapped.
      const equipment = fd.equipmentId && fd.meterReading > 0
        ? state.equipment.map(u =>
            u.id !== fd.equipmentId ? u
              : (fd.meterReading > (u.currentMeter || 0) ? { ...u, currentMeter: fd.meterReading } : u))
        : state.equipment;
      return { ...state, tanks, equipment, fuelDispensing: [...state.fuelDispensing, fd] };
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

    // ── Vendors ────────────────────────────────────────────────────────────
    // ── Employees & pay scales ─────────────────────────────────────────────
    case "ADD_EMPLOYEE":    return { ...state, employees: [...state.employees, action.payload] };
    case "UPDATE_EMPLOYEE": return { ...state, employees: state.employees.map(e => e.id === action.payload.id ? action.payload : e) };
    case "ADD_PAY_SCALE":   return { ...state, payScales: [...(state.payScales||[]), action.payload] };
    case "UPDATE_PAY_SCALE":return { ...state, payScales: (state.payScales||[]).map(s => s.id === action.payload.id ? action.payload : s) };
    case "DELETE_PAY_SCALE":return { ...state, payScales: (state.payScales||[]).filter(s => s.id !== action.payload) };

    case "ADD_VENDOR":      return { ...state, vendors: [...state.vendors, action.payload] };
    case "UPDATE_VENDOR":   return { ...state, vendors: state.vendors.map(v => v.id === action.payload.id ? action.payload : v) };
    case "DELETE_VENDOR":   return { ...state, vendors: state.vendors.map(v => v.id === action.payload ? { ...v, active: false } : v) };

    // ── Employees ──────────────────────────────────────────────────────────
    case "ADD_EMPLOYEE":    return { ...state, employees: [...state.employees, action.payload] };
    case "UPDATE_EMPLOYEE": return { ...state, employees: state.employees.map(e => e.id === action.payload.id ? action.payload : e) };
    case "DELETE_EMPLOYEE": return { ...state, employees: state.employees.map(e => e.id === action.payload ? { ...e, active: false } : e) };

    // ── Settings ───────────────────────────────────────────────────────────
    case "UPDATE_COUNTY_INFO":    return { ...state, countyInfo: action.payload };
    case "SET_FISCAL_YEAR":       return { ...state, fiscalYear: action.payload };
    case "UPDATE_ACCOUNT_CODE":   return { ...state, customAccountCodes: { ...state.customAccountCodes, [action.payload.code]: action.payload } };

    case "ADD_STORAGE_LOCATION":    return { ...state, storageLocations: [...state.storageLocations, action.payload] };
    case "UPDATE_STORAGE_LOCATION": return { ...state, storageLocations: state.storageLocations.map(l => l.id === action.payload.id ? action.payload : l) };
    case "REMOVE_STORAGE_LOCATION": return { ...state, storageLocations: state.storageLocations.filter(l => l.id !== action.payload) };

    // ── Townships & storage locations ──────────────────────────────────────
    // Both are lists of objects, not strings. Settings previously pushed raw
    // strings into the township list and edited a `locations` alias nothing read,
    // which is why editing them appeared to do nothing.
    case "ADD_TOWNSHIP":
      return { ...state, townships: [...(state.townships || []), action.payload] };
    case "UPDATE_TOWNSHIP":
      return { ...state, townships: (state.townships || []).map(t => t.id === action.payload.id ? action.payload : t) };
    case "REMOVE_TOWNSHIP":
      return { ...state, townships: (state.townships || []).filter(t => t.id !== action.payload) };

    case "ADD_STORAGE_LOCATION":
      return { ...state, storageLocations: [...(state.storageLocations || []), action.payload] };
    case "UPDATE_STORAGE_LOCATION":
      return { ...state, storageLocations: (state.storageLocations || []).map(l => l.id === action.payload.id ? action.payload : l) };
    case "REMOVE_STORAGE_LOCATION":
      return { ...state, storageLocations: (state.storageLocations || []).filter(l => l.id !== action.payload) };

    case "REMOVE_TANK":
      return { ...state, tanks: (state.tanks || []).filter(t => t.id !== action.payload) };

    case "ADD_CUSTOM_FUND":    return { ...state, customFunds: [...state.customFunds, action.payload] };
    case "REMOVE_CUSTOM_FUND": return { ...state, customFunds: state.customFunds.filter(f => f !== action.payload) };

    case "ADD_FEMA_RATE":    return { ...state, femaRates: [...state.femaRates, action.payload] };
    case "UPDATE_FEMA_RATE": return { ...state, femaRates: state.femaRates.map(r => r.id === action.payload.id ? action.payload : r) };
    case "DELETE_FEMA_RATE": return { ...state, femaRates: state.femaRates.filter(r => r.id !== action.payload) };

    default: return state;
  }
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

// ── Persistence ───────────────────────────────────────────────────────────────
// Saves state to the browser so work survives a refresh. This is a stopgap for
// testing — replaced by a real database later.
const STORAGE_KEY = "pinpoint.db.v1";

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

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return mergeSaved(initialState, JSON.parse(raw));
  } catch (err) {
    console.warn("Could not load saved data — starting fresh.", err);
    return initialState;
  }
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("fund");
  const [role, setRole] = useState("superintendent"); // superintendent | staff
  const [db, dispatch]  = useReducer(reducer, undefined, loadPersisted);
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
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} title={r.description} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, border:"none", borderRadius:4, cursor:"pointer", background:role===r.id?"#fff":"transparent", color:role===r.id?"#1a3a5c":"rgba(255,255,255,0.6)", whiteSpace:"nowrap" }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {role === "superintendent" && (
            <button
              onClick={() => {
                if (window.confirm("Reset all data back to the starting inventory?\n\nThis erases everything entered since — work orders, projects, receipts, all of it. Cannot be undone.")) {
                  localStorage.removeItem(STORAGE_KEY);
                  window.location.reload();
                }
              }}
              title="Clear test data and reload the starting inventory"
              style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.75)", borderRadius:5, padding:"5px 11px", fontSize:11, cursor:"pointer" }}
            >
              Reset Data
            </button>
          )}
          <div style={{ width:30, height:30, background:"rgba(255,255,255,0.15)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className="ti ti-user" style={{ fontSize:15, color:"#fff" }} />
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
                {group.items.filter(item => !item.adminOnly || role === "superintendent").map(item => (
                  <button key={item.id} onClick={() => !item.soon && setActiveTab(item.id)} style={{
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
          {activeTab==="fund"           && <FundAccounting  db={db} dispatch={dispatch} />}
          {activeTab==="cost"           && <CostAccounting  db={db} dispatch={dispatch} />}
          {activeTab==="inventory"      && <Inventory        db={db} dispatch={dispatch} />}
          {activeTab==="equipment"      && <Equipment        db={db} dispatch={dispatch} />}
          {activeTab==="infrastructure" && <Infrastructure   db={db} dispatch={dispatch} />}
          {activeTab==="projects"       && <Projects         db={db} dispatch={dispatch} />}
          {activeTab==="vendors"        && <Vendors          db={db} dispatch={dispatch} />}
          {activeTab==="payroll"        && <Employees        db={db} dispatch={dispatch} role={role} />}
          {activeTab==="reporting"      && <Reporting        db={db} dispatch={dispatch} role={role} />}
          {activeTab==="settings"       && <Settings         db={db} dispatch={dispatch} />}
          {!["fund","cost","inventory","equipment","infrastructure","projects","vendors","payroll","reporting","settings"].includes(activeTab) && <ComingSoon tab={currentTab} />}
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
