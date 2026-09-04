import { useState } from "react";
import { Icon } from "../../components/shared.jsx";
import { useNavigationGuard } from "../../components/unsaved.jsx";
import { TanksTab } from "./Tanks.jsx";
import { FuelLogTab } from "./Dispensing.jsx";
import { FuelBilling } from "./Billing.jsx";
import { FuelTaxTab } from "./FuelTax.jsx";
import { DailyInventoryTab } from "./DailyInventory.jsx";

// ── Fuel ──────────────────────────────────────────────────────────────────────
//
// Its own module rather than a corner of Equipment, because it is its own
// operation: eight tanks across the county, deliveries from a supplier,
// transfers into the mobile tanks, dispensing out to machines AND to five other
// county departments, readings to reconcile against, and a monthly bill that
// sends money back the other way.
//
// It meets the fleet at exactly one point — a unit number on a fuelling — and
// that per-machine view stays on the machine, in Equipment, where someone
// asking "what has this grader burned" will look for it.
//
// The rule underneath everything here: fuel is never created except by a
// delivery. A transfer moves gallons and carries their cost with them.
export default function Fuel({ db, dispatch }) {
  const go = useNavigationGuard();
  const [tab, setTab] = useState("log");

  const dispensing = db.fuelDispensing    || [];
  const tanks      = db.tanks             || [];
  const tankTx     = db.tankTransactions  || [];
  const units      = db.equipment         || [];
  const vendors    = (db.vendors || []).filter(v => v.active !== false);

  const TABS = [
    { id:"log",     label:"Dispensing Log", icon:"droplet" },
    { id:"tanks",   label:"Tanks",          icon:"building-warehouse" },
    { id:"daily",   label:"Daily Inventory", icon:"clipboard-check" },
    { id:"billing", label:"Department Billing", icon:"file-invoice" },
    { id:"tax",     label:"Fuel Tax",           icon:"receipt-tax" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={() => go(() => setTab(t.id))} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight: tab===t.id?700:400, fontSize:13, cursor:"pointer",
            color: tab===t.id?"#1a5a3a":"#666",
            borderBottom: tab===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={13} color={tab===t.id?"#1a5a3a":"#888"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab==="log" && (
        <FuelLogTab
          dispensing={dispensing} units={units} tanks={tanks} tankTx={tankTx}
          departments={db?.lookups?.fuelDepartments || []}
          employees={db.employees || []}
          invItems={db.inventoryItems || []} invBatches={db.inventoryBatches || []}
          invGroups={db.inventoryGroups || []}
          dispatch={dispatch} />
      )}
      {tab==="tanks"   && (
        <TanksTab tanks={tanks} tankTx={tankTx} dispensing={dispensing}
          vendors={vendors} fuelGLCode={db.countyInfo?.fuelGLCode || "302.09"}
          invItems={db.inventoryItems || []} invBatches={db.inventoryBatches || []}
          invGroups={db.inventoryGroups || []} dispatch={dispatch} />
      )}
      {tab==="daily" && (
        <DailyInventoryTab tanks={tanks} tankTx={tankTx} dispensing={dispensing}
          records={db.dailyInventory || []} dispatch={dispatch} />
      )}
      {tab==="billing" && <FuelBilling dispensing={dispensing} tankTx={tankTx}
          countyInfo={db.countyInfo || {}} dispatch={dispatch} />}
      {tab==="tax" && (
        <FuelTaxTab dispensing={dispensing} rates={db.fuelTaxRates || []}
          units={units} dispatch={dispatch} />
      )}
    </div>
  );
}
