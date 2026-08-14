import { useState } from "react";
import { Icon, inp, btn } from "../../components/shared.jsx";
import { FleetTab } from "./Fleet.jsx";
import { WorkOrdersTab, WorkOrderDetail } from "./WorkOrders.jsx";
import { PMDueTab } from "./PM.jsx";
import { FuelLogTab, TanksTab } from "./Fuel.jsx";
import { UnitDetail } from "./Fleet.jsx";

// ── Equipment ─────────────────────────────────────────────────────────────────
// The shell only: which tab is showing, which unit or work order is selected.
// Everything else lives in its own file —
//
//   Fleet.jsx        the machines, their specs and their costs
//   WorkOrders.jsx   jobs on a machine
//   PM.jsx           the rules that raise those jobs
//   Fuel.jsx         tanks, dispensing and departmental billing
//   shared.jsx       helpers more than one of them needs
//
// This was one 2,828-line file. Splitting it changed no behaviour; it just
// means a fault in the PM screen no longer requires reading past the fuel
// billing to find it.

export default function Equipment({ db, dispatch }) {
  const [tab, setTab]           = useState("fleet");
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedWOId, setSelectedWOId]     = useState(null);

  const units      = db.equipment     || [];
  const workOrders = db.workOrders    || [];
  const pmLogs     = db.pmLogs        || [];
  const dispensing = db.fuelDispensing|| [];
  const tanks      = db.tanks         || [];
  const tankTx     = db.tankTransactions || [];
  const invItems   = db.inventoryItems|| [];
  const invBatches = db.inventoryBatches || [];

  const selectedUnit = units.find(u => u.id === selectedUnitId);
  const selectedWO   = workOrders.find(w => w.id === selectedWOId);

  // Work order detail view
  if (selectedWOId && selectedWO) {
    return (
      <WorkOrderDetail
        wo={selectedWO}
        unit={units.find(u=>u.id===selectedWO.unitId)}
        invItems={invItems}
        invBatches={invBatches}
        db={db}
        dispatch={dispatch}
        onBack={() => setSelectedWOId(null)}
      />
    );
  }

  // Unit detail view
  if (selectedUnitId && selectedUnit) {
    return (
      <UnitDetail
        unit={selectedUnit}
        workOrders={workOrders.filter(w=>w.unitId===selectedUnit.id)}
        pmLogs={pmLogs.filter(p=>p.equipmentId===selectedUnit.id)}
        dispensing={dispensing.filter(f=>f.equipmentId===selectedUnit.id)}
        invItems={invItems}
        invBatches={invBatches}
        dispatch={dispatch}
        onBack={() => setSelectedUnitId(null)}
        onOpenWO={woId => setSelectedWOId(woId)}
      />
    );
  }

  const TABS = [
    { id:"fleet",       label:"Fleet",         icon:"truck" },
    { id:"pmdue",       label:"PM Due",        icon:"alarm" },
    { id:"workorders",  label:"Work Orders",   icon:"clipboard-check" },
    { id:"fuel",        label:"Fuel Log",      icon:"droplet" },
    { id:"tanks",       label:"Tanks",         icon:"building-warehouse" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight:tab===t.id?700:400, fontSize:13, cursor:"pointer",
            color:tab===t.id?"#1a5a3a":"#666",
            borderBottom:tab===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={13} color={tab===t.id?"#1a5a3a":"#888"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab==="fleet"      && <FleetTab      units={units} workOrders={workOrders} dispensing={dispensing} dispatch={dispatch} onSelect={id=>setSelectedUnitId(id)} />}
      {tab==="pmdue"      && <PMDueTab      units={units} dispatch={dispatch} onOpen={id=>setSelectedWOId(id)} />}
      {tab==="workorders" && <WorkOrdersTab workOrders={workOrders} units={units} dispatch={dispatch} onOpen={id=>setSelectedWOId(id)} />}
      {tab==="fuel"       && <FuelLogTab    dispensing={dispensing} units={units} tanks={tanks} tankTx={tankTx} departments={db?.lookups?.fuelDepartments || []} dispatch={dispatch} />}
      {tab==="tanks"      && <TanksTab      tanks={tanks} tankTx={tankTx} dispensing={dispensing} dispatch={dispatch} />}
    </div>
  );
}

// ── Fleet Tab ─────────────────────────────────────────────────────────────────
