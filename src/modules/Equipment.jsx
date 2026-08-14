import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm, SearchSelect } from "../components/shared.jsx";
import { createEquipmentUnit, createWorkOrder, createPMLog, createPMSchedule,
         createEquipmentPart, createEquipmentFluid, createEquipmentTire,
         EQUIPMENT_PART_KINDS, EQUIPMENT_FLUID_KINDS, TIRE_POSITIONS, FUEL_TYPES,
         PM_PRESETS, PM_PRESET_LABELS, laborRateFor } from "../data/schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const EQUIPMENT_TYPES = [
  "Motor Grader","Dump Truck","Side Dump","Loader","Excavator / Gradall",
  "Pickup Truck","Crew Cab Truck","Flatbed Truck","Trailer","Mower / Tractor",
  "Skid Steer","Dozer","Roller / Compactor","Crane","Paver","Paint Striper",
  "Crack Sealer","Water Truck","Generator","Sign Truck","Other",
];

const WO_CATEGORIES = [
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
const WO_PRIORITIES = [
  { value:"routine", label:"Routine", color:"#1a6b35" },
  { value:"urgent",  label:"Urgent",  color:"#d97706" },
  { value:"down",    label:"Down",    color:"#c0392b" },
];

const PM_TASKS = [
  "Oil & Filter Change","Air Filter","Fuel Filter","Hydraulic Filter",
  "Hydraulic Fluid Change","Coolant Flush","Grease / Lubrication",
  "Tire Rotation","Tire Replacement","Belt Inspection","Battery Check",
  "Brake Inspection","Annual Safety Inspection","DOT Inspection",
  "Winterization","Other",
];

// FEMA equipment rates — also exported for CostAccounting
export const FEMA_EQUIPMENT_RATES = [
  { type:"Motor Grader",        size:"100-149 HP",  rate:112.00 },
  { type:"Motor Grader",        size:"150-199 HP",  rate:130.00 },
  { type:"Dozer",               size:"100-149 HP",  rate:98.00  },
  { type:"Backhoe / Excavator", size:"1.0-1.5 CY",  rate:89.00  },
  { type:"Backhoe / Excavator", size:"1.5-2.0 CY",  rate:108.00 },
  { type:"Dump Truck",          size:"10-14 CY",    rate:52.00  },
  { type:"Dump Truck",          size:"15-20 CY",    rate:68.00  },
  { type:"Tandem Dump Truck",   size:"14-18 CY",    rate:65.00  },
  { type:"Side Dump Trailer",   size:"20+ CY",      rate:48.00  },
  { type:"Pickup Truck",        size:"1/2 - 1 ton", rate:28.00  },
  { type:"Loader",              size:"2.0-2.5 CY",  rate:95.00  },
  { type:"Loader",              size:"2.5-3.5 CY",  rate:115.00 },
  { type:"Skid Steer",          size:"< 1 CY",      rate:42.00  },
  { type:"Tractor",             size:"50-99 HP",    rate:38.00  },
  { type:"Mower (Rotary)",      size:"Tractor mtd", rate:32.00  },
  { type:"Crack Sealer",        size:"Trailer",     rate:45.00  },
  { type:"Roller / Compactor",  size:"10-12 ton",   rate:58.00  },
  { type:"Water Truck",         size:"2000+ gal",   rate:48.00  },
  { type:"Chip Spreader",       size:"Self prop",   rate:88.00  },
  { type:"Paver",               size:"Asphalt",     rate:125.00 },
  { type:"Sign Truck / Bucket", size:"1 ton",       rate:55.00  },
  { type:"Generator",           size:"< 25 KW",     rate:14.00  },
  { type:"Trailer (Flatbed)",   size:"< 20 ton",    rate:18.00  },
];

const STATUS_META = {
  active:         { label:"Active",         color:"#1a6b35", bg:"#e6f4ec" },
  out_of_service: { label:"Out of Service", color:"#c0392b", bg:"#fdecea" },
  in_shop:        { label:"In Shop",        color:"#d97706", bg:"#fef3cd" },
  sold:           { label:"Sold",           color:"#888",    bg:"#f0f0ee" },
};

function StatusChip({ status }) {
  const m = STATUS_META[status] || { label:status, color:"#888", bg:"#f0f0f0" };
  return <span style={{ background:m.bg, color:m.color, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700 }}>{m.label}</span>;
}

// Today, as the app writes dates. Most entries are for today, so forms open on
// it rather than blank — a blank date input is a small tax paid on every row.
const today = () => new Date().toISOString().split("T")[0];

function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// Work order numbers are assigned by the reducer on save — see ADD_WORK_ORDER.
// A form only ever holds the work orders of the machine it is looking at, so
// numbering from here gave every unit its own 001.

// ── Module Shell ──────────────────────────────────────────────────────────────
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
function FleetTab({ units, workOrders, dispensing, dispatch, onSelect }) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");

  const active   = units.filter(u=>u.status==="active").length;
  const inShop   = units.filter(u=>u.status==="in_shop").length;
  const oos      = units.filter(u=>u.status==="out_of_service").length;
  const openWOs  = workOrders.filter(w=>w.status==="open").length;

  const pmDue        = pmDueList(units);
  const overdueCount = pmDue.filter(p => p.status.state === "overdue").length;

  const filtered = units.filter(u => {
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (search && !`${u.unitNumber} ${u.year} ${u.make} ${u.model} ${u.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (showForm) {
    return (
      <UnitForm
        onSave={payload => { dispatch({ type:"ADD_EQUIPMENT", payload }); setShowForm(false); }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Fleet</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search unit #, make, model…" style={{ ...inp, width:200, margin:0 }} />
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Unit</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Active"         value={active}  sub="Units"      accent="#1a6b35" icon="check-circle" />
        <KPICard label="In Shop"        value={inShop}  sub="Units"      accent="#d97706" icon="tool" />
        <KPICard label="Out of Service" value={oos}     sub="Units"      accent="#c0392b" icon="alert-circle" />
        <KPICard label="Open Work Orders" value={openWOs} sub="WOs"      accent="#1a3a5c" icon="clipboard-check" />
        <KPICard label="PM Due"         value={pmDue.length}
          sub={overdueCount ? `${overdueCount} overdue` : "Upcoming"}
          accent={overdueCount ? "#c0392b" : pmDue.length ? "#d97706" : "#888"} icon="alarm" />
      </div>

      {/* What needs servicing — meter readings drive this */}
      {pmDue.length > 0 && (
        <div style={{ background:"#fff", border:`2px solid ${overdueCount ? "#f5c6c6" : "#f0d080"}`, borderRadius:8, padding:16, marginBottom:18 }}>
          <div style={{ fontSize:14, fontWeight:700, color: overdueCount ? "#8c1b18" : "#7a4f00", marginBottom:3 }}>
            {overdueCount > 0 ? `⚠ ${overdueCount} service${overdueCount!==1?"s":""} overdue` : `◷ ${pmDue.length} service${pmDue.length!==1?"s":""} coming due`}
          </div>
          <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
            Based on the latest meter readings. Update a unit's meter to refresh this.
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["Unit","Equipment","Service","Interval","Meter","Status"].map(h=>(
                  <th key={h} style={{ padding:"7px 10px", textAlign:h==="Meter"?"right":"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pmDue.slice(0, 12).map(({ unit, sched, status }, i) => (
                <tr key={`${unit.id}-${sched.id}`}
                  onClick={()=>onSelect(unit.id)}
                  style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{unit.unitNumber||"—"}</td>
                  <td style={{ padding:"8px 10px" }}>{[unit.year,unit.make,unit.model].filter(Boolean).join(" ")||"—"}</td>
                  <td style={{ padding:"8px 10px", fontWeight:600 }}>{sched.service||"—"}</td>
                  <td style={{ padding:"8px 10px", color:"#888" }}>
                    every {Number(sched.interval).toLocaleString()} {sched.intervalType==="miles"?"mi":sched.intervalType==="hours"?"hr":"mo"}
                  </td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace" }}>{lifetimeMeter(unit).toLocaleString()}</td>
                  <td style={{ padding:"8px 10px" }}><PMBadge status={status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pmDue.length > 12 && (
            <div style={{ fontSize:11, color:"#888", marginTop:9 }}>…and {pmDue.length - 12} more</div>
          )}
        </div>
      )}

      <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden", marginBottom:16, width:"fit-content" }}>
        {[["all","All"],["active","Active"],["in_shop","In Shop"],["out_of_service","OOS"],["sold","Sold"]].map(([v,l])=>(
          <button key={v} onClick={()=>setStatusFilter(v)} style={{ padding:"6px 13px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:statusFilter===v?"#1a3a5c":"#fff", color:statusFilter===v?"#fff":"#555" }}>{l}</button>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Unit #","Year","Make / Model","Type","FEMA Rate","Meter","Status","Open WOs",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["FEMA Rate","Open WOs"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {units.length===0?"No equipment units yet — click Add Unit to get started.":"No units match filter."}
              </td></tr>
            )}
            {filtered.map((u,i) => {
              const uWOs = workOrders.filter(w=>w.unitId===u.id&&w.status==="open").length;
              return (
                <tr key={u.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                  onClick={()=>onSelect(u.id)}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{u.unitNumber||"—"}</td>
                  <td style={{ padding:"10px 14px" }}>{u.year||"—"}</td>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>{[u.make,u.model].filter(Boolean).join(" ")||u.description||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#666" }}>{u.equipmentType||"—"}</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", color:"#d97706" }}>{u.femaRate?`${fmtSm(u.femaRate)}/hr`:"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#888", textTransform:"capitalize" }}>{u.meterType||"hours"}</td>
                  <td style={{ padding:"10px 14px" }}><StatusChip status={u.status} /></td>
                  <td style={{ padding:"10px 14px", textAlign:"right" }}>
                    {uWOs>0 ? <span style={{ background:"#fdecea", color:"#c0392b", padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:700 }}>{uWOs}</span> : <span style={{ color:"#ccc", fontSize:12 }}>—</span>}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <Icon name="chevron-right" size={14} color="#ccc" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Unit Detail ───────────────────────────────────────────────────────────────
function UnitDetail({ unit, workOrders, pmLogs, dispensing, invItems, invBatches, dispatch, onBack, onOpenWO }) {
  const [tab, setTab]     = useState("overview");
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <UnitForm
        unit={unit}
        onSave={payload => { dispatch({ type:"UPDATE_EQUIPMENT", payload }); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const openWOs    = workOrders.filter(w=>w.status==="open");
  const totalWOCost= workOrders.reduce((s,w)=>s+(w.totalCost||0),0);

  // Inventory items tagged as fitting this unit
  const fitParts = (invItems||[]).filter(i => (i.fitsEquipment||[]).includes(unit.id));

  const TABS = [
    { id:"overview",  label:"Overview",    icon:"info-circle" },
    { id:"workorders",label:"Work Orders", icon:"clipboard-check" },
    { id:"pm",        label:"PM",          icon:"tool" },
    { id:"parts",     label:`Parts${fitParts.length?` (${fitParts.length})`:""}`, icon:"package" },
    { id:"fuel",      label:"Fuel Log",    icon:"droplet" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px", marginBottom:14 }}>← Fleet</button>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:28, fontWeight:800, fontFamily:"monospace", color:"#1a3a5c", lineHeight:1.1 }}>
            {unit.unitNumber||"—"}
          </div>
          <div style={{ fontSize:14, color:"#555", marginTop:2 }}>{[unit.year,unit.make,unit.model].filter(Boolean).join(" ")}</div>
          {unit.serialNumber && <div style={{ fontSize:12, color:"#888", fontFamily:"monospace", marginTop:3 }}>S/N: {unit.serialNumber}</div>}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <StatusChip status={unit.status} />
          {unit.status==="active" && (
            <button onClick={()=>dispatch({ type:"UPDATE_EQUIPMENT_STATUS", payload:{ id:unit.id, status:"in_shop" } })} style={{ ...btn.small, background:"#d97706", fontSize:11 }}>→ In Shop</button>
          )}
          {unit.status==="in_shop" && (
            <button onClick={()=>dispatch({ type:"UPDATE_EQUIPMENT_STATUS", payload:{ id:unit.id, status:"active" } })} style={{ ...btn.small, background:"#1a6b35", fontSize:11 }}>→ Active</button>
          )}
          <button onClick={()=>setEditing(true)} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        <KPICard label="FEMA Rate"       value={unit.femaRate?`${fmtSm(unit.femaRate)}/hr`:"—"} sub="" accent="#d97706" icon="coin" />
        <KPICard label="Open Work Orders"value={openWOs.length}  sub="WOs"    accent="#c0392b" icon="clipboard-check" />
        <KPICard label="Total WO Cost"   value={fmtSm(totalWOCost)} sub="All time" accent="#1a3a5c" icon="tool" />
        <KPICard label="Fuel Logs"       value={dispensing.length} sub="Entries" accent="#1a5a3a" icon="droplet" />
      </div>

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:24 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight:tab===t.id?700:400, fontSize:13, cursor:"pointer",
            color:tab===t.id?"#1a5a3a":"#666",
            borderBottom:tab===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={12} color={tab===t.id?"#1a5a3a":"#888"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab==="overview"   && <UnitOverview unit={unit} workOrders={workOrders} dispensing={dispensing} />}
      {tab==="workorders" && <UnitWorkOrders unit={unit} workOrders={workOrders} dispatch={dispatch} onOpen={onOpenWO} />}
      {tab==="pm"         && <UnitPM unit={unit} pmLogs={pmLogs} dispatch={dispatch} />}
      {tab==="parts"      && <UnitParts parts={fitParts} batches={invBatches} />}
      {tab==="fuel"       && <UnitFuelLog dispensing={dispensing} />}
    </div>
  );
}

// ── Parts that fit this unit ──────────────────────────────────────────────────
function UnitParts({ parts, batches }) {
  const onHandFor = (itemId) => (batches||[])
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s,b) => s + (b.quantityRemaining||0), 0);

  const valueFor = (itemId) => (batches||[])
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s,b) => s + (b.quantityRemaining||0)*(b.unitCost||0), 0);

  if (!parts.length) {
    return (
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:36, textAlign:"center" }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#555", marginBottom:6 }}>No parts tagged to this unit yet</div>
        <div style={{ fontSize:12, color:"#888" }}>
          In the Inventory module, edit a part and check this unit under <strong>Fits Equipment</strong>. It will show up here with live stock levels.
        </div>
      </div>
    );
  }

  const inStock  = parts.filter(p => onHandFor(p.id) > 0);
  const outStock = parts.filter(p => onHandFor(p.id) === 0);

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        <KPICard label="Parts Tagged"  value={parts.length}   sub="Fit this unit"  accent="#1a3a5c" icon="package" />
        <KPICard label="In Stock"      value={inStock.length}  sub="Available now"  accent="#1a6b35" icon="check" />
        <KPICard label="Out of Stock"  value={outStock.length} sub="Need to order"  accent={outStock.length?"#c0392b":"#888"} icon="alert-triangle" />
      </div>

      <SectionCard title="Parts for This Unit" subtitle="Live stock from inventory">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Part #","Item","Group","Unit","On Hand","Value"].map(h=>(
                <th key={h} style={{ padding:"8px 14px", textAlign:["On Hand","Value"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map((p,i) => {
              const oh  = onHandFor(p.id);
              const val = valueFor(p.id);
              const min = p.trackStockLevel ? (parseFloat(p.minimumQuantity)||0) : 0;
              const low = min > 0 && oh < min;
              return (
                <tr key={p.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, background:"#f0f4ff", color:"#1a3a5c", padding:"2px 7px", borderRadius:4 }}>{p.legacyNumber||"—"}</span>
                  </td>
                  <td style={{ padding:"9px 14px", fontWeight:600 }}>{p.name}</td>
                  <td style={{ padding:"9px 14px", fontSize:12, color:"#555" }}>
                    {p.commodityGroupCode ? `${p.commodityGroupCode} — ${p.commodityGroup}` : (p.commodityGroup||"—")}
                  </td>
                  <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{p.unitOfMeasure||"—"}</td>
                  <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:oh===0?"#c0392b":low?"#d97706":"#1a6b35" }}>
                    {oh === 0 ? "OUT" : oh}
                    {low && oh>0 && <div style={{ fontSize:10, color:"#d97706", fontWeight:600 }}>⚠ min {min}</div>}
                  </td>
                  <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace" }}>{val>0?fmtSm(val):"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function UnitOverview({ unit: u, workOrders, dispensing }) {
  const cost = operatingCost(u, workOrders, dispensing);
  return (
    <div>
      {/* What it costs to run — feeds replacement decisions */}
      <SectionCard title="Operating Cost" subtitle="Fuel, parts, labor and outside repairs. Excludes depreciation." style={{ marginBottom:20 }}>
        <div style={{ padding:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Cost per {cost.unitLabel}</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color: cost.perUnit ? "#1a3a5c" : "#ccc", marginTop:3 }}>
                {cost.perUnit ? fmtSm(cost.perUnit) : "—"}
              </div>
              <div style={{ fontSize:10, color:"#aaa" }}>
                {cost.span ? `over ${cost.span.toLocaleString()} ${cost.unitLabel}` : "needs meter history"}
              </div>
            </div>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Lifetime Meter</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:"#1a1a1a", marginTop:3 }}>{lifetimeMeter(u).toLocaleString()}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>
                {u.meterOffset ? `incl. ${Number(u.meterOffset).toLocaleString()} on prior meter` : cost.unitLabel}
              </div>
            </div>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Total Spent</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:"#5a1a8a", marginTop:3 }}>{fmtSm(cost.total)}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{cost.workOrderCount} work order{cost.workOrderCount!==1?"s":""}</div>
            </div>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Fuel Used</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:"#1a5a3a", marginTop:3 }}>{cost.fuelGallons.toFixed(1)}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>gal · {fmtSm(cost.fuelCost)}</div>
            </div>
          </div>

          {/* Where the money went */}
          {cost.total > 0 && (
            <>
              <div style={{ display:"flex", height:9, borderRadius:99, overflow:"hidden", marginBottom:9 }}>
                {[["Fuel",cost.fuelCost,"#1a5a3a"],["Parts",cost.parts,"#5a1a8a"],["Labor",cost.labor,"#1a3a5c"],["Outside",cost.outside,"#d97706"]]
                  .filter(([,v])=>v>0)
                  .map(([k,v,c])=>(
                    <div key={k} title={`${k} — ${fmtSm(v)}`} style={{ width:`${(v/cost.total)*100}%`, background:c }} />
                  ))}
              </div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap", fontSize:11 }}>
                {[["Fuel",cost.fuelCost,"#1a5a3a"],["Parts",cost.parts,"#5a1a8a"],["Labor",cost.labor,"#1a3a5c"],["Outside Repairs",cost.outside,"#d97706"]].map(([k,v,c])=>(
                  <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:5, color:"#666" }}>
                    <span style={{ width:9, height:9, borderRadius:2, background:c, display:"inline-block" }} />
                    {k} <strong style={{ fontFamily:"monospace", color:"#1a1a1a" }}>{fmtSm(v)}</strong>
                  </span>
                ))}
              </div>
            </>
          )}

          {!cost.span && cost.total > 0 && (
            <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:5, padding:"8px 11px", marginTop:12, fontSize:11, color:"#7a4f00" }}>
              Cost per {cost.unitLabel} needs at least two meter readings from fuelling. Log fuel with the meter and it will fill in.
            </div>
          )}
        </div>
      </SectionCard>

    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      <SectionCard title="Specifications">
        <div style={{ padding:"0 2px" }}>
          {[
            ["Unit #",         u.unitNumber||"—"],
            ["Year",           u.year||"—"],
            ["Make",           u.make||"—"],
            ["Model",          u.model||"—"],
            ["Type",           u.equipmentType||"—"],
            ["Serial #",       u.serialNumber||"—"],
            ["VIN",            u.vin||"—"],
            ["License Plate",  u.licensePlate||"—"],
            ["Meter Type",     u.meterType||"hours"],
            ["Location",       u.primaryLocation||"—"],
            ["Date Acquired",  fmtDate(u.dateAcquired)],
            ["Purchase Price", u.purchasePrice?fmt(u.purchasePrice):"—"],
          ].map(([label,val])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
              <span style={{ color:"#666" }}>{label}</span>
              <span style={{ fontWeight:600, fontFamily:["Serial #","VIN","License Plate"].includes(label)?"monospace":"" }}>{val}</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Cost Accounting">
        <div style={{ padding:"0 2px" }}>
          {[
            ["Hourly Rate",   u.femaRate?`${fmtSm(u.femaRate)}/hr`:"Not set"],
            ["Purchase Price", u.purchasePrice?fmt(u.purchasePrice):"Not recorded"],
            ["Hours Since Acquired", (u.startingMeter || u.startingMeter === 0) && u.currentMeter
              ? `${Math.max(0, (Number(u.currentMeter)||0) - (Number(u.startingMeter)||0)).toLocaleString()} ${u.meterType==="miles"?"mi":"hr"}`
              : "—"],
          ].map(([label,val])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
              <span style={{ color:"#666" }}>{label}</span>
              <span style={{ fontWeight:600, fontFamily:"monospace" }}>{val}</span>
            </div>
          ))}
          {u.notes && (
            <div style={{ padding:"12px 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{u.notes}</div>
          )}
        </div>
      </SectionCard>
    </div>
    </div>
  );
}

// ── Unit Work Orders ──────────────────────────────────────────────────────────
function UnitWorkOrders({ unit, workOrders, dispatch, onOpen }) {
  const [showNew, setShowNew] = useState(false);

  if (showNew) {
    return (
      <WOForm
        unit={unit}
        onSave={payload => { dispatch({ type:"ADD_WORK_ORDER", payload }); setShowNew(false); }}
        onCancel={() => setShowNew(false)}
      />
    );
  }

  const open   = workOrders.filter(w=>w.status==="open");
  const closed = workOrders.filter(w=>w.status==="closed");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13 }}>
          {open.length} open · {closed.length} closed · Total cost: <strong>{fmtSm(workOrders.reduce((s,w)=>s+(w.totalCost||0),0))}</strong>
        </div>
        <button onClick={()=>setShowNew(true)} style={btn.primary}>+ New Work Order</button>
      </div>
      <Table
        headers={[{label:"WO #"},{label:"Opened"},{label:"Category"},{label:"Description"},{label:"Priority"},{label:"Labor"},{label:"Parts"},{label:"Service"},{label:"Total"},{label:"Status"},{label:""}]}
        rows={workOrders.sort((a,b)=>b.openedDate.localeCompare(a.openedDate)).map(w=>[
          <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#1a3a5c"}}>{w.workOrderNumber||"—"}</span>,
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(w.openedDate)}</span>,
          <span style={{fontSize:12}}>{WO_CATEGORIES.find(c=>c.value===w.category)?.label||w.category}</span>,
          <span style={{fontWeight:600,fontSize:12}}>{w.description||"—"}</span>,
          <span style={{fontSize:11,fontWeight:700,color:WO_PRIORITIES.find(p=>p.value===w.priority)?.color||"#888"}}>{(w.priority||"").toUpperCase()}</span>,
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtSm(w.totalLaborCost||0)}</span>,
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtSm(w.totalPartsCost||0)}</span>,
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtSm(w.totalServiceCost||0)}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(w.totalCost||0)}</span>,
          <span style={{fontSize:11,fontWeight:700,color:w.status==="open"?"#1a6b35":w.status==="void"?"#c0392b":"#888"}}>{w.status?.toUpperCase()}</span>,
          <button onClick={e=>{e.stopPropagation();onOpen(w.id);}} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"4px 10px"}}>Open</button>,
        ])}
        emptyMessage="No work orders yet"
      />
    </div>
  );
}

// ── Work Order Form ───────────────────────────────────────────────────────────
function WOForm({ unit, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    ...createWorkOrder({
      unitId:          unit?.id||null,
      unitNumber:      unit?.unitNumber||"",
      unitDescription: unit?`${unit.year||""} ${unit.make||""} ${unit.model||""}`.trim():"",
      workOrderNumber: "",   // assigned on save, across the whole fleet
    }),
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>New Work Order</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="WO Number">
            <input type="text" value={form.workOrderNumber} onChange={e=>set("workOrderNumber",e.target.value)}
              placeholder="Assigned on save" style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Opened Date" required>
            <input type="date" value={form.openedDate} onChange={e=>set("openedDate",e.target.value)} style={inp} />
          </Field>
          <Field label="Reported By">
            <input type="text" value={form.reportedBy} onChange={e=>set("reportedBy",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ marginBottom:14 }}>
          <Field label="Description of Problem / Work Required" required>
            <input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} placeholder="e.g. Replace hydraulic pump — losing pressure on blade circuit" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Category">
            <select value={form.category} onChange={e=>set("category",e.target.value)} style={inp}>
              {WO_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={e=>set("priority",e.target.value)} style={inp}>
              {WO_PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Meter Reading (open)">
            <input type="number" min="0" step="any" value={form.meterReadingOpen} onChange={e=>set("meterReadingOpen",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>Open Work Order</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Work Order Detail ─────────────────────────────────────────────────────────
function WorkOrderDetail({ wo, unit, invItems, invBatches, db, dispatch, onBack }) {
  const [tab, setTab] = useState("labor");
  const priorityMeta = WO_PRIORITIES.find(p=>p.value===wo.priority)||{ color:"#888" };

  const TABS = [
    { id:"labor",   label:"Labor",          icon:"user-check" },
    { id:"parts",   label:"Parts",          icon:"package" },
    { id:"service", label:"Outside Service",icon:"building-factory-2" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px", marginBottom:14 }}>← Back</button>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:24, fontWeight:800, fontFamily:"monospace", color:"#1a3a5c", lineHeight:1.15 }}>
            {wo.workOrderNumber||"—"}
          </div>
          <div style={{ fontSize:13, color:"#555", marginTop:2 }}>
            {unit ? <strong style={{ fontFamily:"monospace", color:"#1a3a5c" }}>Unit {unit.unitNumber}</strong> : null}
            {unit && wo.description ? " · " : ""}
            <span style={{ color:"#777" }}>{wo.description||"Work Order"}</span>
          </div>
          <div style={{ fontSize:11, color:"#999", marginTop:3 }}>
            {unit ? [unit.year,unit.make,unit.model].filter(Boolean).join(" ") : wo.unitDescription}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ background:priorityMeta.color, color:"#fff", padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:700 }}>{(wo.priority||"").toUpperCase()}</span>
          <span style={{ fontSize:11, fontWeight:700, color:wo.status==="open"?"#1a6b35":"#888" }}>{wo.status?.toUpperCase()}</span>
          {wo.status==="open" && (
            <button onClick={()=>dispatch({ type:"CLOSE_WORK_ORDER", payload:{ id:wo.id, closedDate:new Date().toISOString().split("T")[0] } })} style={{ ...btn.small, background:"#1a6b35", fontSize:11 }}>Close WO</button>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        <KPICard label="Labor"   value={fmtSm(wo.totalLaborCost||0)}   sub="" accent="#1a6b35" icon="user-check" />
        <KPICard label="Parts"   value={fmtSm(wo.totalPartsCost||0)}   sub="" accent="#5a1a8a" icon="package" />
        <KPICard label="Service" value={fmtSm(wo.totalServiceCost||0)} sub="" accent="#d97706" icon="building-factory-2" />
        <KPICard label="Total"   value={fmtSm(wo.totalCost||0)}        sub="" accent="#1a1a1a" icon="coin" />
      </div>

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight:tab===t.id?700:400, fontSize:13, cursor:"pointer",
            color:tab===t.id?"#1a5a3a":"#666",
            borderBottom:tab===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={12} color={tab===t.id?"#1a5a3a":"#888"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab==="labor"   && <WOLaborTab   wo={wo} db={db} dispatch={dispatch} />}
      {tab==="parts"   && <WOPartsTab   wo={wo} unit={unit} invItems={invItems} invBatches={invBatches} dispatch={dispatch} />}
      {tab==="service" && <WOServiceTab wo={wo} dispatch={dispatch} />}
    </div>
  );
}

// ── WO Labor tab ──────────────────────────────────────────────────────────────
// Labor on a work order is the same labor as anywhere else: a real employee,
// their classification on that date, and the rate in force then. This used to
// take a typed name and a typed rate — it never received the employee list at
// all, so the shop was retyping what the system already knew and could get
// wrong in a way nothing would catch.
function WOLaborTab({ wo, db = {}, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [justAdded, setJustAdded] = useState(0);
  const entries = wo.laborEntries || [];

  const employees = (db.employees || []).filter(e => e.active !== false);
  const payScales = db.payScales || [];

  const EMPTY = { date: today(), employeeId:"", hoursWorked:"", overtimeHours:"", notes:"" };
  const [form, setForm] = useState(EMPTY);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const employee = employees.find(e => e.id === form.employeeId);
  // Resolved for the entry's OWN date, so a repair logged after a raise still
  // costs what it cost on the day.
  const resolved = employee ? laborRateFor(employee, form.date || today(), payScales) : null;

  const st   = parseFloat(form.hoursWorked)   || 0;
  const ot   = parseFloat(form.overtimeHours) || 0;
  const cost = resolved ? st * resolved.loadedRate + ot * (resolved.overtimeRate + resolved.fringePerHour) : 0;

  const canSave = form.date && form.employeeId && (st > 0 || ot > 0);

  const handleSave = ({ keepOpen } = {}) => {
    if (!canSave) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      date: form.date,
      employeeId:     employee.id,
      employeeName:   employee.name || [employee.firstName, employee.lastName].filter(Boolean).join(" "),
      classification: resolved?.classification || "",
      hoursWorked:    st,
      overtimeHours:  ot,
      hourlyRate:     resolved?.hourlyRate  || 0,
      fringePerHour:  resolved?.fringePerHour || 0,
      loadedRate:     resolved?.loadedRate  || 0,
      rateSource:     resolved?.rateSource  || "",
      totalCost:      cost,
      notes:          form.notes,
      createdAt:      new Date().toISOString(),
    };
    dispatch({ type:"ADD_WORK_ORDER_ENTRY", payload:{ workOrderId:wo.id, entryType:"laborEntries", entry } });
    // Keep the date so a run of entries for one day doesn't mean retyping it.
    setForm(f => ({ ...EMPTY, date: f.date }));
    setJustAdded(n => n + 1);
    if (!keepOpen) setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>Total labor: <strong style={{ color:"#1a6b35" }}>{fmtSm(wo.totalLaborCost||0)}</strong></div>
        <button onClick={()=>{ setShowForm(s=>!s); setJustAdded(0); }} style={btn.primary}>{showForm?"Done":"+ Add Labor"}</button>
      </div>

      {showForm && employees.length === 0 && (
        <div style={{ background:"#fef8e8", border:"1px solid #f0d080", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#7a4f00" }}>
          No employees on file yet. Add them under <strong>Employees</strong> and their classification and rate
          will fill in here automatically.
        </div>
      )}

      {showForm && employees.length > 0 && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          {justAdded > 0 && (
            <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"7px 12px", marginBottom:12, fontSize:12, color:"#1a6b35", fontWeight:600 }}>
              ✓ {justAdded} {justAdded===1?"entry":"entries"} added — the form stays open, keep going
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1.4fr", gap:12, marginBottom:12 }}>
            <Field label="Date" required>
              <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
            <Field label="Employee" required>
              <SearchSelect
                items={employees}
                value={form.employeeId}
                onChange={id=>set("employeeId",id)}
                placeholder="Type a name…"
                getLabel={e=>e.name || [e.firstName,e.lastName].filter(Boolean).join(" ")}
                getSearch={e=>`${e.name||""} ${e.firstName||""} ${e.lastName||""} ${e.employeeNumber||""}`}
                renderRow={e=>(
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                    <span>{e.name || [e.firstName,e.lastName].filter(Boolean).join(" ")}</span>
                    <span style={{ fontFamily:"monospace", color:"#888", fontSize:11 }}>{e.employeeNumber||""}</span>
                  </div>
                )}
              />
            </Field>
            <Field label="Classification">
              <div style={{ ...inp, margin:0, background:"#fff", color: resolved?.classification ? "#1a1a1a" : "#bbb" }}>
                {resolved?.classification || "—"}
              </div>
            </Field>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Straight Hours">
              <input type="number" min="0" step="0.25" value={form.hoursWorked} onChange={e=>set("hoursWorked",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Overtime Hours">
              <input type="number" min="0" step="0.25" value={form.overtimeHours} onChange={e=>set("overtimeHours",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Loaded Rate">
              <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", color: resolved ? "#1a1a1a" : "#bbb" }}>
                {resolved ? `${fmtSm(resolved.loadedRate)}/hr` : "—"}
              </div>
            </Field>
            <Field label="Cost">
              <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color:"#1a6b35" }}>{fmtSm(cost)}</div>
            </Field>
          </div>

          {resolved && (
            <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
              {fmtSm(resolved.hourlyRate)}/hr base + {fmtSm(resolved.fringePerHour)}/hr fringe
              {resolved.scaleDate ? ` · scale effective ${fmtDate(resolved.scaleDate)}` : ""}
              {resolved.rateSource === "employee" ? " · rate set on the employee record" : ""}
            </div>
          )}

          <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
            <Field label="Notes" style={{ flex:1 }}>
              <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
            <button onClick={()=>handleSave({ keepOpen:true })} disabled={!canSave}
              style={{ ...btn.primary, opacity: canSave?1:0.45, cursor: canSave?"pointer":"not-allowed" }}>
              Add &amp; keep going
            </button>
            <button onClick={()=>handleSave()} disabled={!canSave}
              style={{ ...btn.ghost, opacity: canSave?1:0.45, cursor: canSave?"pointer":"not-allowed" }}>
              Add &amp; close
            </button>
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Employee"},{label:"Classification"},{label:"Hours"},{label:"OT"},{label:"Rate"},{label:"Cost"},{label:"Notes"}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.employeeName,
          <span style={{fontSize:12,color:"#666"}}>{e.classification||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.hoursWorked}</span>,
          <span style={{fontFamily:"monospace",color:e.overtimeHours?"#d97706":"#ccc"}}>{e.overtimeHours||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{fmtSm(e.loadedRate||e.hourlyRate||0)}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.totalCost||0)}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
        ])}
        emptyMessage="No labor entries"
      />
    </div>
  );
}

// ── Tank reconciliation status ────────────────────────────────────────────────
// Main shop tanks have an electronic monitor and are balanced against the paper
// logs daily. The outlying sheds and portables have no monitor — they're dipped
// once a year. Different cadence, so different overdue thresholds.
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 864e5);
}

export function reconciliationStatus(tank, tankTx) {
  const kind   = tank.hasMonitor ? "monitor_reading" : "dip_reading";
  const cadence = tank.hasMonitor ? "daily" : "annual";
  const limit   = tank.hasMonitor ? 1 : 365;

  const last = (tankTx || [])
    .filter(t => t.tankId === tank.id && t.type === kind)
    .sort((a,b) => (b.date||"").localeCompare(a.date||""))[0];

  const age = last ? daysSince(last.date) : null;
  const state = age === null ? "never" : age > limit ? "overdue" : "ok";
  return { cadence, kind, last, age, state, limit, variance: last?.variance ?? null };
}

function ReconciliationPanel({ tanks, tankTx }) {
  const rows = tanks
    .filter(t => t.status !== "out_of_service")
    .map(t => ({ tank: t, rec: reconciliationStatus(t, tankTx) }))
    .sort((a,b) => {
      const rank = s => s === "overdue" ? 0 : s === "never" ? 1 : 2;
      return rank(a.rec.state) - rank(b.rec.state);
    });

  const needing = rows.filter(r => r.rec.state !== "ok");
  if (!needing.length) return null;

  return (
    <div style={{ background:"#fff", border:"2px solid #f0d080", borderRadius:8, padding:16, marginBottom:18 }}>
      <div style={{ fontSize:14, fontWeight:700, color:"#7a4f00", marginBottom:3 }}>
        ◷ {needing.length} tank{needing.length!==1?"s":""} need reconciling
      </div>
      <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
        Monitored tanks are balanced against the logs daily. The rest are dipped once a year.
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr style={{ background:"#f7f7f5" }}>
            {["Tank","Method","Last Done","Last Variance","Status"].map(h=>(
              <th key={h} style={{ padding:"7px 10px", textAlign:h==="Last Variance"?"right":"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {needing.map(({ tank, rec }, i) => (
            <tr key={tank.id} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
              <td style={{ padding:"8px 10px", fontWeight:600 }}>
                {tank.name}
                {tank.filledByContractor && <span style={{ fontSize:10, color:"#888", marginLeft:6 }}>(contractor filled)</span>}
              </td>
              <td style={{ padding:"8px 10px", color:"#888" }}>{rec.cadence === "daily" ? "Monitor · daily" : "Dip · annual"}</td>
              <td style={{ padding:"8px 10px", fontFamily:"monospace", color:"#888" }}>
                {rec.last ? `${fmtDate(rec.last.date)} (${rec.age}d ago)` : "never"}
              </td>
              <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", color: Math.abs(rec.variance||0) > 0 ? "#c0392b" : "#888" }}>
                {rec.variance === null ? "—" : `${rec.variance > 0 ? "+" : ""}${rec.variance.toFixed(0)} gal`}
              </td>
              <td style={{ padding:"8px 10px" }}>
                <span style={{
                  background: rec.state==="overdue" ? "#fdecea" : "#f4f4f2",
                  color:      rec.state==="overdue" ? "#8c1b18" : "#888",
                  border:`1px solid ${rec.state==="overdue" ? "#f5c6c6" : "#ddd"}`,
                  borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700,
                }}>
                  {rec.state === "overdue" ? "Overdue" : "Never done"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Operating cost ────────────────────────────────────────────────────────────
// What it costs to run a machine: fuel, parts, oils, shop supplies, all repairs,
// in-house and outside labor. Deliberately excludes depreciation (confirmed
// 2026-07-27) — this is cash out the door, not book value.
//
// Meters only ever move forward, so cost per hour/mile is measured across the
// metered life we can actually see: from the earliest reading on record to the
// unit's current lifetime meter.
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
export function lifetimeMeter(unit) {
  return (Number(unit?.meterOffset) || 0) + (Number(unit?.currentMeter) || 0);
}

// Default warning windows — roughly 10% of the interval, which lands about where
// you'd want to start scheduling.
const DEFAULT_WARN = { hours: 25, miles: 500, months: 1 };

export function pmStatus(unit, sched) {
  if (!sched || sched.active === false || !sched.interval) return null;
  const warn = Number(sched.warnAhead) || DEFAULT_WARN[sched.intervalType] || 0;

  if (sched.intervalType === "months") {
    if (!sched.lastDoneDate) return { state:"unknown", label:"Never done", remaining:null };
    const due = new Date(sched.lastDoneDate);
    due.setMonth(due.getMonth() + Number(sched.interval));
    const days = Math.round((due - Date.now()) / 864e5);
    if (days < 0)          return { state:"overdue", label:`${Math.abs(days)} days overdue`, remaining:days };
    if (days <= warn * 30) return { state:"due",     label:`Due in ${days} days`,            remaining:days };
    return { state:"ok", label:`Due in ${days} days`, remaining:days };
  }

  const current = lifetimeMeter(unit);
  if (sched.lastDoneMeter === null || sched.lastDoneMeter === undefined) {
    return { state:"unknown", label:"No baseline reading", remaining:null };
  }
  const dueAt     = Number(sched.lastDoneMeter) + Number(sched.interval);
  const remaining = dueAt - current;
  const u = sched.intervalType === "miles" ? "mi" : "hr";
  if (remaining < 0)     return { state:"overdue", label:`${Math.abs(remaining).toLocaleString()} ${u} overdue`, remaining, dueAt };
  if (remaining <= warn) return { state:"due",     label:`${remaining.toLocaleString()} ${u} to go`,             remaining, dueAt };
  return { state:"ok", label:`${remaining.toLocaleString()} ${u} to go`, remaining, dueAt };
}

// Every schedule across the fleet that wants attention, worst first.
export function pmDueList(equipment) {
  const out = [];
  (equipment || []).forEach(unit => {
    if (unit.status === "sold") return;
    (unit.pmSchedule || []).forEach(sched => {
      const st = pmStatus(unit, sched);
      if (st && (st.state === "overdue" || st.state === "due")) out.push({ unit, sched, status: st });
    });
  });
  return out.sort((a, b) => {
    if (a.status.state !== b.status.state) return a.status.state === "overdue" ? -1 : 1;
    return (a.status.remaining ?? 0) - (b.status.remaining ?? 0);
  });
}

const PM_TONE = {
  overdue: { color:"#c0392b", bg:"#fdecea", border:"#f5c6c6", icon:"⚠" },
  due:     { color:"#d97706", bg:"#fef3cd", border:"#f0d080", icon:"◷" },
  ok:      { color:"#1a6b35", bg:"#e6f4ec", border:"#a8d5b5", icon:"✓" },
  unknown: { color:"#888",    bg:"#f4f4f2", border:"#ddd",    icon:"–" },
};

function PMBadge({ status }) {
  if (!status) return null;
  const t = PM_TONE[status.state] || PM_TONE.unknown;
  return (
    <span style={{ background:t.bg, color:t.color, border:`1px solid ${t.border}`, borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {t.icon} {status.label}
    </span>
  );
}

// ── FIFO helpers ──────────────────────────────────────────────────────────────
// Same rules as the Inventory module: oldest batch by receipt date depletes first.
function onHandFor(itemId, batches) {
  return (batches || [])
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
}

function buildFIFO(itemId, qty, batches) {
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
function WOPartsTab({ wo, unit, invItems, invBatches, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [justAdded, setJustAdded] = useState(0);
  const [form, setForm]         = useState({ date: today(), itemId:"", quantity:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const entries = wo.partEntries || [];
  const active  = invItems.filter(i => i.active !== false);

  // Parts tagged as fitting this unit float to the top — that's what the
  // fitsEquipment tagging is for.
  const fitting = unit ? active.filter(i => (i.fitsEquipment || []).includes(unit.id)) : [];
  const fittingIds = new Set(fitting.map(i => i.id));
  const others  = active.filter(i => !fittingIds.has(i.id));

  // Parts tagged for this unit sort to the top of the picker, so an unfiltered
  // list opens on the ones most likely to be wanted.
  const ordered = [...fitting, ...others];

  const selectedItem = active.find(i => i.id === form.itemId);
  const qty      = parseFloat(form.quantity) || 0;
  const onHand   = form.itemId ? onHandFor(form.itemId, invBatches) : 0;
  const preview  = form.itemId && qty > 0 ? buildFIFO(form.itemId, qty, invBatches) : null;
  const canSave  = form.date && form.itemId && qty > 0 && preview?.canFulfill;

  const handleSave = ({ keepOpen } = {}) => {
    if (!canSave) return;
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const entry = {
      id: entryId,
      date: form.date,
      itemId: form.itemId,
      itemName: selectedItem?.name || "",
      legacyNumber: selectedItem?.legacyNumber || "",
      quantity: qty,
      unitCost: qty > 0 ? preview.totalCost / qty : 0,   // weighted across batches
      totalCost: preview.totalCost,
      batchLines: preview.lines,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type:"ADD_WORK_ORDER_ENTRY", payload:{ workOrderId:wo.id, entryType:"partEntries", entry } });

    // Take it out of stock — a part used on a repair is issued, same as any other issue
    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:        "issue",
        date:        form.date,
        itemId:      form.itemId,
        itemName:    selectedItem?.name || "",
        quantity:    qty,
        location:    "all",
        workOrderId: wo.id,
        equipmentId: unit?.id || null,
        batchLines:  preview.lines,
        totalCost:   preview.totalCost,
        notes:       [`WO ${wo.workOrderNumber || wo.id}`, unit ? `Unit ${unit.unitNumber}` : "", form.notes].filter(Boolean).join(" · "),
        createdAt:   new Date().toISOString(),
      },
    });

    // Keep the date — a run of parts on one job shouldn't mean retyping it.
    setForm(f => ({ date: f.date, itemId:"", quantity:"", notes:"" }));
    setJustAdded(n => n + 1);
    if (!keepOpen) setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>Total parts: <strong style={{ color:"#5a1a8a" }}>{fmtSm(wo.totalPartsCost||0)}</strong></div>
        <button onClick={()=>{ setShowForm(s=>!s); setJustAdded(0); }} style={btn.primary}>{showForm?"Done":"+ Add Part"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
            Parts are issued from inventory at FIFO cost. If it isn't in the catalog, add it in Inventory first.
          </div>
          {justAdded > 0 && (
            <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"7px 12px", marginBottom:12, fontSize:12, color:"#1a6b35", fontWeight:600 }}>
              ✓ {justAdded} {justAdded===1?"part":"parts"} issued — the form stays open, keep going
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Part" required>
              <SearchSelect
                items={ordered}
                value={form.itemId}
                onChange={id=>set("itemId",id)}
                placeholder="Type a part number or name…"
                emptyMessage="No catalog item matches — add it in Inventory first"
                getLabel={i=>`${i.legacyNumber?`[${i.legacyNumber}] `:""}${i.name}`}
                getSearch={i=>`${i.legacyNumber} ${i.name} ${i.commodityGroupCode} ${i.commodityGroup}`}
                isDisabled={i=>onHandFor(i.id, invBatches) <= 0}
                renderRow={(i,off)=>{
                  const oh = onHandFor(i.id, invBatches);
                  return (
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                      <span>
                        {fittingIds.has(i.id) && (
                          <span style={{ background:"#e6f4ec", color:"#1a5a3a", borderRadius:3, padding:"1px 5px", fontSize:10, fontWeight:700, marginRight:6 }}>FITS</span>
                        )}
                        {i.legacyNumber && <strong style={{ fontFamily:"monospace", color: off?"#bbb":"#1a3a5c" }}>{i.legacyNumber}</strong>}
                        {i.legacyNumber ? "  " : ""}{i.name}
                      </span>
                      <span style={{ fontFamily:"monospace", whiteSpace:"nowrap", color: off?"#ccc":"#1a5a3a" }}>
                        {oh > 0 ? `${oh} on hand` : "out of stock"}
                      </span>
                    </div>
                  );
                }}
              />
            </Field>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:12, marginBottom:12 }}>
            <Field label={`Qty${selectedItem ? ` (${onHand} on hand)` : ""}`} required>
              <input type="number" min="0" step="any" value={form.quantity}
                onChange={e=>set("quantity",e.target.value)}
                style={{ ...inp, margin:0, fontFamily:"monospace", borderColor: qty > onHand ? "#c0392b" : "" }} />
            </Field>
            <Field label="FIFO Cost">
              <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color:"#5a1a8a" }}>
                {preview ? fmtSm(preview.totalCost) : "—"}
              </div>
            </Field>
            <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>

          {preview && !preview.canFulfill && (
            <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:5, padding:"9px 12px", marginBottom:12, fontSize:12, color:"#8c1b18", fontWeight:600 }}>
              ⚠ Only {onHand} on hand — short by {preview.shortfall}. Receive stock before issuing.
            </div>
          )}

          {preview && preview.canFulfill && preview.lines.length > 1 && (
            <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:5, padding:"9px 12px", marginBottom:12, fontSize:11, color:"#1a5a3a" }}>
              Drawn from {preview.lines.length} batches: {preview.lines.map(l=>`${l.quantity} @ ${fmtSm(l.unitCost)}`).join(" · ")}
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>handleSave({ keepOpen:true })} disabled={!canSave}
              style={{ ...btn.primary, opacity: canSave ? 1 : 0.4, cursor: canSave?"pointer":"not-allowed" }}>
              Issue &amp; keep going
            </button>
            <button onClick={()=>handleSave()} disabled={!canSave}
              style={{ ...btn.ghost, opacity: canSave ? 1 : 0.4, cursor: canSave?"pointer":"not-allowed" }}>
              Issue &amp; close
            </button>
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Part #"},{label:"Part"},{label:"Qty"},{label:"Unit Cost"},{label:"Total"},{label:"Notes"}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:"#1a3a5c"}}>{e.legacyNumber||"—"}</span>,
          <span style={{fontWeight:600}}>{e.itemName||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.quantity}</span>,
          <span style={{fontFamily:"monospace"}}>{fmtSm(e.unitCost||0)}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.totalCost||0)}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
        ])}
        emptyMessage="No parts issued to this work order"
      />
    </div>
  );
}

// ── WO Service tab ────────────────────────────────────────────────────────────
function WOServiceTab({ wo, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const entries = wo.serviceEntries || [];
  const [form, setForm] = useState({ date: today(), vendorName:"", description:"", invoiceNumber:"", amount:"", expenditureRef:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = () => {
    if (!form.date||!form.description||!form.amount) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      date: form.date, vendorName: form.vendorName, description: form.description,
      invoiceNumber: form.invoiceNumber, amount: parseFloat(form.amount)||0,
      expenditureRef: form.expenditureRef, notes: form.notes, createdAt: new Date().toISOString(),
    };
    dispatch({ type:"ADD_WORK_ORDER_ENTRY", payload:{ workOrderId:wo.id, entryType:"serviceEntries", entry } });
    setForm({ date: today(), vendorName:"", description:"", invoiceNumber:"", amount:"", expenditureRef:"", notes:"" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>Total service: <strong style={{ color:"#d97706" }}>{fmtSm(wo.totalServiceCost||0)}</strong></div>
        <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Add Service Entry"}</button>
      </div>
      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Vendor / Shop"><input type="text" value={form.vendorName} onChange={e=>set("vendorName",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Invoice #"><input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Service Description"><input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={{ ...inp, margin:0 }} placeholder="What was done…" /></Field>
            <Field label="Amount ($)"><input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set("amount",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>
            <Field label="Fund Accounting Ref (if paid via claim)"><input type="text" value={form.expenditureRef} onChange={e=>set("expenditureRef",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} placeholder="Expenditure ID…" /></Field>
            <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <button onClick={handleSave} style={{ ...btn.primary, marginTop:14 }}>Add Service Entry</button>
        </div>
      )}
      <Table
        headers={[{label:"Date"},{label:"Vendor"},{label:"Description"},{label:"Invoice #"},{label:"Amount"},{label:"FA Ref"}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.vendorName||"—", <span style={{fontWeight:600}}>{e.description||"—"}</span>,
          <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.amount||0)}</span>,
          <span style={{fontSize:11,color:"#888"}}>{e.expenditureRef||"—"}</span>,
        ])}
        emptyMessage="No outside service entries"
      />
    </div>
  );
}

// ── Unit PM ───────────────────────────────────────────────────────────────────
function UnitPM({ unit, pmLogs, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: today(), service:"", meterReading:"", performedBy:"", cost:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = () => {
    if (!form.date||!form.service) return;
    dispatch({ type:"ADD_PM_LOG", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      equipmentId:unit.id, scheduleId:null, date:form.date, service:form.service,
      meterReading:parseFloat(form.meterReading)||0, performedBy:form.performedBy,
      cost:parseFloat(form.cost)||0, notes:form.notes, createdAt:new Date().toISOString(),
    }});
    setForm({ date: today(), service:"", meterReading:"", performedBy:"", cost:"", notes:"" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>{pmLogs.length} PM log entries</div>
        <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Log PM Service"}</button>
      </div>
      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Service Performed">
              <select value={form.service} onChange={e=>set("service",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Select…</option>
                {PM_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={`Meter (${unit.meterType||"hours"})`}><input type="number" min="0" step="any" value={form.meterReading} onChange={e=>set("meterReading",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Cost ($)"><input type="number" min="0" step="0.01" value={form.cost} onChange={e=>set("cost",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>
            <Field label="Performed By"><input type="text" value={form.performedBy} onChange={e=>set("performedBy",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <button onClick={handleSave} style={{ ...btn.primary, marginTop:14 }}>Save PM Log</button>
        </div>
      )}
      <Table
        headers={[{label:"Date"},{label:"Service"},{label:"Meter Reading"},{label:"Performed By"},{label:"Cost"},{label:"Notes"}]}
        rows={[...pmLogs].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.service||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.meterReading||"—"}</span>,
          e.performedBy||"—",
          <span style={{fontFamily:"monospace"}}>{e.cost?fmtSm(e.cost):"—"}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
        ])}
        emptyMessage="No PM logs"
      />
    </div>
  );
}

// ── Unit Fuel Log ─────────────────────────────────────────────────────────────
function UnitFuelLog({ dispensing }) {
  const sorted = [...dispensing].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div>
      <div style={{ fontSize:13, color:"#888", marginBottom:14 }}>
        {sorted.length} fuel entries — use the Fuel Log tab to add new dispensing records.
      </div>
      <Table
        headers={[{label:"Date"},{label:"Gallons"},{label:"Fuel Type"},{label:"Meter Reading"},{label:"Tank"},{label:"Notes"}]}
        rows={sorted.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{e.gallons}</span>,
          <span style={{fontSize:12,textTransform:"capitalize"}}>{e.fuelType||"diesel"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.meterReading||"—"}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.sourceTankName||"—"}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
        ])}
        emptyMessage="No fuel entries for this unit"
      />
    </div>
  );
}

// ── Work Orders Tab (all units) ───────────────────────────────────────────────
function WorkOrdersTab({ workOrders, units, dispatch, onOpen }) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [unitFilter, setUnitFilter]     = useState("all");

  const filtered = workOrders.filter(w => {
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    if (unitFilter !== "all" && w.unitId !== unitFilter) return false;
    return true;
  });

  const openCount   = workOrders.filter(w=>w.status==="open").length;
  const urgentCount = workOrders.filter(w=>w.status==="open"&&w.priority==="urgent").length;
  const downCount   = workOrders.filter(w=>w.status==="open"&&w.priority==="down").length;
  const totalCost   = workOrders.filter(w=>w.status==="closed").reduce((s,w)=>s+(w.totalCost||0),0);

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>All Work Orders</div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Open"    value={openCount}   sub="Work orders"   accent="#1a6b35" icon="clipboard-check" />
        <KPICard label="Urgent"  value={urgentCount} sub="Need attention" accent="#d97706" icon="alert-triangle" />
        <KPICard label="Down"    value={downCount}   sub="Units out"      accent="#c0392b" icon="alert-circle" />
        <KPICard label="Closed WO Cost" value={fmtSm(totalCost)} sub="All closed" accent="#1a3a5c" icon="coin" />
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All"],["open","Open"],["closed","Closed"],["void","Void"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStatusFilter(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:statusFilter===v?"#1a3a5c":"#fff", color:statusFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <select value={unitFilter} onChange={e=>setUnitFilter(e.target.value)} style={{ ...inp, margin:0, fontSize:12, minWidth:160 }}>
          <option value="all">All Units</option>
          {units.map(u=><option key={u.id} value={u.id}>{u.unitNumber?`${u.unitNumber} — `:""}{u.year} {u.make} {u.model}</option>)}
        </select>
      </div>

      <Table
        headers={[{label:"WO #"},{label:"Unit"},{label:"Opened"},{label:"Category"},{label:"Description"},{label:"Priority"},{label:"Total"},{label:"Status"},{label:""}]}
        rows={filtered.sort((a,b)=>b.openedDate.localeCompare(a.openedDate)).map(w=>{
          const unit = units.find(u=>u.id===w.unitId);
          const pMeta = WO_PRIORITIES.find(p=>p.value===w.priority);
          return [
            <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#1a3a5c"}}>{w.workOrderNumber||"—"}</span>,
            <span style={{fontSize:12}}>{unit?`${unit.unitNumber} — ${unit.make} ${unit.model}`:w.unitDescription||"—"}</span>,
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(w.openedDate)}</span>,
            <span style={{fontSize:12}}>{WO_CATEGORIES.find(c=>c.value===w.category)?.label||w.category}</span>,
            <span style={{fontWeight:600,fontSize:12,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.description||"—"}</span>,
            <span style={{fontSize:11,fontWeight:700,color:pMeta?.color||"#888"}}>{(w.priority||"").toUpperCase()}</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(w.totalCost||0)}</span>,
            <span style={{fontSize:11,fontWeight:700,color:w.status==="open"?"#1a6b35":w.status==="void"?"#c0392b":"#888"}}>{w.status?.toUpperCase()}</span>,
            <button onClick={()=>onOpen(w.id)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"4px 10px"}}>Open</button>,
          ];
        })}
        emptyMessage="No work orders match this filter"
      />
    </div>
  );
}

// ── Fuel Log Tab ──────────────────────────────────────────────────────────────
function FuelLogTab({ dispensing, units, tanks, tankTx, departments, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [view, setView]         = useState("log");   // log | billing
  const EMPTY = {
    date: today(), consumer:"county_equipment",
    equipmentId:"", meterReading:"",
    departmentName:"", outsideVehicle:"", outsideOdometer:"",
    fuelType:"diesel", gallons:"", pumpedBy:"", taxClass:"off_road",
    sourceTankId:"", notes:"",
  };
  const [form, setForm] = useState(EMPTY);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const isOutside     = form.consumer === "other_department";
  const selectedUnit  = units.find(u=>u.id===form.equipmentId);
  const selectedTank  = tanks.find(t=>t.id===form.sourceTankId);

  // Fuel is billed at cost — the rate comes from the most recent fuel to ENTER
  // the tank. For a fixed tank that is a delivery; for a mobile tank it is the
  // transfer that filled it, which carries the source tank's price across.
  //
  // Looking only at deliveries left every mobile tank at zero, so anything
  // dispensed from one was billed at nothing.
  const tankUnitCost = (tankId) => {
    const priced = (tankTx||[])
      .filter(t => t.tankId === tankId && t.unitCost > 0
                && (t.type === "delivery" || t.type === "portable_fill"))
      .sort((a,b) => (b.date||"").localeCompare(a.date||""));
    return priced[0]?.unitCost || 0;
  };
  const unitCost  = form.sourceTankId ? tankUnitCost(form.sourceTankId) : 0;
  const gallons   = parseFloat(form.gallons) || 0;
  const totalCost = unitCost * gallons;

  const canSave = form.date && gallons > 0 &&
    (isOutside ? form.departmentName : form.equipmentId);

  const handleSave = () => {
    if (!canSave) return;
    dispatch({ type:"ADD_FUEL_DISPENSING", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      date: form.date,
      consumer: form.consumer,
      equipmentId:    isOutside ? null : form.equipmentId,
      unitNumber:     isOutside ? "" : (selectedUnit?.unitNumber||""),
      meterReading:   isOutside ? 0 : (parseFloat(form.meterReading)||0),
      meterType:      selectedUnit?.meterType||"hours",
      departmentName: isOutside ? form.departmentName : "",
      outsideVehicle: isOutside ? form.outsideVehicle : "",
      outsideOdometer:isOutside ? form.outsideOdometer : "",
      fuelType: form.fuelType,
      gallons,
      pumpedBy: form.pumpedBy,
      taxClass: form.taxClass,
      unitCost, totalCost,
      sourceTankId: form.sourceTankId||null,
      sourceTankName: selectedTank?.name||"",
      billingPeriod: isOutside && form.date ? form.date.slice(0,7) : "",
      billedDate:"", paidDate:"",
      notes: form.notes, createdAt:new Date().toISOString(),
    }});
    setForm(EMPTY);
    setShowForm(false);
  };

  const sorted = [...dispensing].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const totalGallons = dispensing.reduce((s,f)=>s+(f.gallons||0),0);
  const outsideGallons = dispensing.filter(f=>f.consumer==="other_department").reduce((s,f)=>s+(f.gallons||0),0);
  const offRoadGal = dispensing.filter(f=>f.taxClass==="off_road").reduce((s,f)=>s+(f.gallons||0),0);
  const onRoadGal  = dispensing.filter(f=>f.taxClass==="on_road").reduce((s,f)=>s+(f.gallons||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
          {[["log","Fuel Log"],["billing","Department Billing"]].map(([id,label])=>(
            <button key={id} onClick={()=>setView(id)} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:view===id?"#1a5a3a":"#fff", color:view===id?"#fff":"#555" }}>{label}</button>
          ))}
        </div>
        {view==="log" && <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Log Fuel"}</button>}
      </div>

      {view==="billing" && <FuelBilling dispensing={dispensing} dispatch={dispatch} />}

      {view==="log" && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            <KPICard label="Total Dispensed"  value={`${totalGallons.toFixed(1)} gal`} sub={`${dispensing.length} entries`} accent="#1a3a5c" icon="droplet" />
            <KPICard label="Off-Road"         value={`${offRoadGal.toFixed(1)} gal`}   sub="Tax exempt"                     accent="#1a5a3a" icon="tractor" />
            <KPICard label="On-Road"          value={`${onRoadGal.toFixed(1)} gal`}    sub="Taxable"                        accent="#d97706" icon="truck" />
            <KPICard label="Other Departments" value={`${outsideGallons.toFixed(1)} gal`} sub="Billable"                    accent="#5a1a8a" icon="building-community" />
          </div>

          {showForm && (
            <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
              {/* Who took it */}
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {[["county_equipment","County Equipment"],["other_department","Other Department"]].map(([v,l])=>(
                  <button key={v} onClick={()=>set("consumer",v)} style={{
                    ...btn.small, fontSize:12, padding:"7px 14px",
                    background: form.consumer===v ? "#1a5a3a" : "#eee",
                    color:      form.consumer===v ? "#fff"    : "#555",
                  }}>{l}</button>
                ))}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>

                {!isOutside ? (
                  <>
                    <Field label="Unit" required>
                      <select value={form.equipmentId} onChange={e=>set("equipmentId",e.target.value)} style={{ ...inp, margin:0 }}>
                        <option value="">Select…</option>
                        {units.filter(u=>u.status!=="sold").map(u=><option key={u.id} value={u.id}>{u.unitNumber?`${u.unitNumber} — `:""}{u.year} {u.make} {u.model}</option>)}
                      </select>
                    </Field>
                    <Field label={`Meter (${selectedUnit?.meterType==="miles"?"miles":"hours"})`}>
                      <input type="number" min="0" step="any" value={form.meterReading} onChange={e=>set("meterReading",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Department" required>
                      <select value={form.departmentName} onChange={e=>set("departmentName",e.target.value)} style={{ ...inp, margin:0 }}>
                        <option value="">Select…</option>
                        {departments.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </Field>
                    <Field label="Their Vehicle">
                      <input type="text" value={form.outsideVehicle} onChange={e=>set("outsideVehicle",e.target.value)} style={{ ...inp, margin:0 }} placeholder="As written on the log" />
                    </Field>
                  </>
                )}

                <Field label={isOutside ? "Their Mileage" : "Fuel Type"}>
                  {isOutside ? (
                    <input type="text" value={form.outsideOdometer} onChange={e=>set("outsideOdometer",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                  ) : (
                    <select value={form.fuelType} onChange={e=>set("fuelType",e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="diesel">Diesel</option>
                      <option value="unleaded">Unleaded</option>
                    </select>
                  )}
                </Field>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                {isOutside && (
                  <Field label="Fuel Type">
                    <select value={form.fuelType} onChange={e=>set("fuelType",e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="diesel">Diesel</option>
                      <option value="unleaded">Unleaded</option>
                    </select>
                  </Field>
                )}
                <Field label="Gallons" required><input type="number" min="0" step="0.1" value={form.gallons} onChange={e=>set("gallons",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
                <Field label="Tank">
                  <select value={form.sourceTankId} onChange={e=>set("sourceTankId",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Not specified</option>
                    {tanks.filter(t=>t.status!=="out_of_service").map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Pumped By"><input type="text" value={form.pumpedBy} onChange={e=>set("pumpedBy",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                <Field label="Tax Class">
                  <select value={form.taxClass} onChange={e=>set("taxClass",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="off_road">Off-Road (exempt)</option>
                    <option value="on_road">On-Road (taxable)</option>
                  </select>
                </Field>
                <Field label="Cost">
                  <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color: totalCost ? "#1a3a5c" : "#bbb" }}>
                    {totalCost ? fmtSm(totalCost) : "—"}
                  </div>
                </Field>
              </div>

              {form.sourceTankId && !unitCost && (
                <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:5, padding:"8px 11px", marginBottom:12, fontSize:11, color:"#7a4f00" }}>
                  No delivery cost recorded for {selectedTank?.name} yet — log a delivery on the Tanks tab so fuel can be costed and billed.
                </div>
              )}

              <div style={{ display:"flex", gap:10 }}>
                <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                <button onClick={handleSave} disabled={!canSave} style={{ ...btn.primary, marginTop:20, opacity: canSave?1:0.4 }}>Log</button>
              </div>
            </div>
          )}

          <Table
            headers={[{label:"Date"},{label:"Who"},{label:"Vehicle / Unit"},{label:"Fuel"},{label:"Gallons"},{label:"Meter"},{label:"Tax"},{label:"Cost"},{label:"Pumped By"}]}
            rows={sorted.map(e=>{
              const u = units.find(u=>u.id===e.equipmentId);
              const outside = e.consumer === "other_department";
              return [
                <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
                outside
                  ? <span style={{ background:"#f3ecfa", color:"#5a1a8a", border:"1px solid #d9c6ee", borderRadius:4, padding:"1px 7px", fontSize:11, fontWeight:700 }}>{e.departmentName||"Dept"}</span>
                  : <span style={{ fontSize:11, color:"#888" }}>County</span>,
                <span style={{fontSize:12}}>
                  {outside ? (e.outsideVehicle||"—") : (u?`${u.unitNumber||""} ${u.make||""} ${u.model||""}`.trim():e.unitNumber||"—")}
                </span>,
                <span style={{fontSize:12,textTransform:"capitalize"}}>{e.fuelType||"diesel"}</span>,
                <span style={{fontFamily:"monospace",fontWeight:700}}>{e.gallons}</span>,
                <span style={{fontFamily:"monospace",color:"#888"}}>{outside ? (e.outsideOdometer||"—") : (e.meterReading||"—")}</span>,
                <span style={{fontSize:10,fontWeight:700,color:e.taxClass==="on_road"?"#d97706":"#1a6b35"}}>{e.taxClass==="on_road"?"ON":"OFF"}</span>,
                <span style={{fontFamily:"monospace"}}>{e.totalCost?fmtSm(e.totalCost):"—"}</span>,
                <span style={{fontSize:12,color:"#888"}}>{e.pumpedBy||"—"}</span>,
              ];
            })}
            emptyMessage="No fuel records yet"
          />
        </>
      )}
    </div>
  );
}

// ── Department fuel billing ───────────────────────────────────────────────────
// Five county departments fuel at the shop. Logs are reconciled weekly and billed
// on the 1st of the month, at cost. The bill is a ledger of date, who, and amount
// — but the per-vehicle detail is kept so a challenge can be answered.
function FuelBilling({ dispensing, dispatch }) {
  const outside = dispensing.filter(f => f.consumer === "other_department");

  const periods = [...new Set(outside.map(f => f.billingPeriod || (f.date||"").slice(0,7)).filter(Boolean))]
    .sort().reverse();
  const [period, setPeriod] = useState(periods[0] || "");
  const [expanded, setExpanded] = useState(null);

  const inPeriod = outside.filter(f => (f.billingPeriod || (f.date||"").slice(0,7)) === period);

  const byDept = {};
  inPeriod.forEach(f => {
    const d = f.departmentName || "Unassigned";
    if (!byDept[d]) byDept[d] = { gallons:0, cost:0, entries:[], billed:0 };
    byDept[d].gallons += f.gallons || 0;
    byDept[d].cost    += f.totalCost || 0;
    if (f.billedDate) byDept[d].billed++;
    byDept[d].entries.push(f);
  });
  const rows = Object.entries(byDept).sort((a,b)=>b[1].cost-a[1].cost);
  const grandGal  = rows.reduce((s,[,d])=>s+d.gallons,0);
  const grandCost = rows.reduce((s,[,d])=>s+d.cost,0);

  const markBilled = (dept) => {
    const today = new Date().toISOString().split("T")[0];
    byDept[dept].entries.filter(e=>!e.billedDate).forEach(e =>
      dispatch({ type:"UPDATE_FUEL_DISPENSING", payload:{ ...e, billedDate: today } }));
  };
  const markPaid = (dept) => {
    const today = new Date().toISOString().split("T")[0];
    byDept[dept].entries.filter(e=>!e.paidDate).forEach(e =>
      dispatch({ type:"UPDATE_FUEL_DISPENSING", payload:{ ...e, paidDate: today } }));
  };

  const fmtPeriod = (p) => {
    if (!p) return "—";
    const [y,m] = p.split("-");
    return new Date(Number(y), Number(m)-1, 1).toLocaleDateString(undefined,{ month:"long", year:"numeric" });
  };

  if (!outside.length) {
    return (
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:36, textAlign:"center" }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#555", marginBottom:6 }}>No department fuel logged yet</div>
        <div style={{ fontSize:12, color:"#888" }}>
          Log fuel with "Other Department" selected and it will appear here for monthly billing.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700 }}>Department Fuel Billing</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Billed at cost on the 1st. Click a department to see the vehicle detail.</div>
        </div>
        <Field label="Billing Period">
          <select value={period} onChange={e=>{setPeriod(e.target.value); setExpanded(null);}} style={{ ...inp, margin:0, minWidth:180 }}>
            {periods.map(p=><option key={p} value={p}>{fmtPeriod(p)}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Department","Fill-ups","Gallons","Amount","Status",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["Gallons","Amount","Fill-ups"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([dept, d], i) => {
              const allBilled = d.entries.every(e=>e.billedDate);
              const allPaid   = d.entries.every(e=>e.paidDate);
              const isOpen    = expanded === dept;
              return (
                <>
                  <tr key={dept} onClick={()=>setExpanded(isOpen?null:dept)}
                    style={{ borderTop:"1px solid #eee", background:isOpen?"#f0f8f4":i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                    <td style={{ padding:"10px 14px", fontWeight:700 }}>
                      <Icon name={isOpen?"chevron-down":"chevron-right"} size={12} color="#888" /> {dept}
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{d.entries.length}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{d.gallons.toFixed(1)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(d.cost)}</td>
                    <td style={{ padding:"10px 14px" }}>
                      {allPaid
                        ? <span style={{ background:"#e6f4ec", color:"#1a6b35", border:"1px solid #a8d5b5", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Paid</span>
                        : allBilled
                        ? <span style={{ background:"#fef3cd", color:"#7a4f00", border:"1px solid #f0d080", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Billed</span>
                        : <span style={{ background:"#f4f4f2", color:"#888", border:"1px solid #ddd", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Unbilled</span>}
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right" }} onClick={e=>e.stopPropagation()}>
                      {!allBilled && <button onClick={()=>markBilled(dept)} style={{ ...btn.small, fontSize:10, padding:"4px 10px" }}>Mark Billed</button>}
                      {allBilled && !allPaid && <button onClick={()=>markPaid(dept)} style={{ ...btn.small, background:"#1a6b35", fontSize:10, padding:"4px 10px" }}>Mark Paid</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${dept}-detail`}>
                      <td colSpan={6} style={{ padding:"0 14px 14px", background:"#f0f8f4" }}>
                        <div style={{ fontSize:11, color:"#1a5a3a", padding:"8px 0 6px", fontWeight:600 }}>
                          Vehicle detail — kept in case the numbers are challenged
                        </div>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, background:"#fff", borderRadius:6, overflow:"hidden" }}>
                          <thead>
                            <tr style={{ background:"#e6f4ec" }}>
                              {["Date","Vehicle","Mileage","Fuel","Gallons","Rate","Amount","Pumped By"].map(h=>(
                                <th key={h} style={{ padding:"6px 10px", textAlign:["Gallons","Rate","Amount"].includes(h)?"right":"left", fontWeight:600, fontSize:10, color:"#1a5a3a" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.entries.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(e=>(
                              <tr key={e.id} style={{ borderTop:"1px solid #e6f4ec" }}>
                                <td style={{ padding:"6px 10px", fontFamily:"monospace" }}>{fmtDate(e.date)}</td>
                                <td style={{ padding:"6px 10px" }}>{e.outsideVehicle||"—"}</td>
                                <td style={{ padding:"6px 10px", fontFamily:"monospace", color:"#888" }}>{e.outsideOdometer||"—"}</td>
                                <td style={{ padding:"6px 10px", textTransform:"capitalize" }}>{e.fuelType}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace" }}>{e.gallons}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{e.unitCost?fmtSm(e.unitCost):"—"}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{e.totalCost?fmtSm(e.totalCost):"—"}</td>
                                <td style={{ padding:"6px 10px", color:"#888" }}>{e.pumpedBy||"—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
              <td colSpan={2} style={{ padding:"10px 14px", fontWeight:700, textAlign:"right" }}>{fmtPeriod(period)} total</td>
              <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{grandGal.toFixed(1)}</td>
              <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14 }}>{fmtSm(grandCost)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize:11, color:"#888", marginTop:10, lineHeight:1.6 }}>
        Marking a department <strong>Paid</strong> is when the money is actually earned — revenue is
        recognised on receipt of the check, not when the bill goes out.
      </div>
    </div>
  );
}

// ── Tanks Tab ─────────────────────────────────────────────────────────────────
function TanksTab({ tanks, tankTx, dispensing, dispatch }) {
  const [showNew, setShowNew] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState(null);
  const [txForm, setTxForm] = useState({ type:"delivery", date: today(), tankId:"", sourceTankId:"", gallons:"", vendorName:"", invoiceNumber:"", unitCost:"", dipReading:"", notes:"" });
  const setTx = (k,v) => setTxForm(f=>({...f,[k]:v}));

  // What a tank's fuel cost per gallon, taken from its most recent delivery.
  // Fuel moved between tanks has to carry this with it — otherwise a mobile
  // tank fills up with gallons that came from nowhere and cost nothing, and
  // everything dispensed from it afterwards is billed at zero.
  const tankUnitCost = (tankId) => {
    const priced = (tankTx||[])
      .filter(t => t.tankId === tankId && t.unitCost > 0
                && (t.type === "delivery" || t.type === "portable_fill"))
      .sort((a,b) => (b.date||"").localeCompare(a.date||""));
    return priced[0]?.unitCost || 0;
  };
  const [showTxForm, setShowTxForm] = useState(false);

  const [newTank, setNewTank] = useState({ name:"", fuelType:"diesel", tankType:"underground", capacityGallons:"", location:"", notes:"" });
  const setNT = (k,v) => setNewTank(f=>({...f,[k]:v}));

  const selectedTank = tanks.find(t=>t.id===selectedTankId);

  // A portable fill touches two tanks — it leaves one and enters the other — so
  // it belongs in both histories, not just the destination's.
  const shownTx = useMemo(() => {
    const all = [...(tankTx||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if (!selectedTankId) return all;
    return all.filter(t => t.tankId === selectedTankId || t.sourceTankId === selectedTankId);
  }, [tankTx, selectedTankId]);

  const handleAddTank = () => {
    if (!newTank.name) return;
    dispatch({ type:"ADD_TANK", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      ...newTank, capacityGallons:parseFloat(newTank.capacityGallons)||0, currentLevel:0, status:"active",
      createdAt:new Date().toISOString(),
    }});
    setNewTank({ name:"", fuelType:"diesel", tankType:"underground", capacityGallons:"", location:"", notes:"" });
    setShowNew(false);
  };

  const isFill  = txForm.type === "portable_fill";
  const srcTank = tanks.find(t=>t.id===txForm.sourceTankId);
  const fillCost = isFill ? tankUnitCost(txForm.sourceTankId) : 0;
  const fillShort = isFill && srcTank && (parseFloat(txForm.gallons)||0) > (srcTank.currentLevel||0);

  const handleTxSave = () => {
    if (!txForm.date||!txForm.tankId||!txForm.gallons) return;
    if (isFill && (!txForm.sourceTankId || fillShort)) return;
    const tank = tanks.find(t=>t.id===txForm.tankId);
    const gals = parseFloat(txForm.gallons)||0;
    // A transfer inherits the source tank's cost; a delivery sets its own.
    const perGal = isFill ? fillCost : (parseFloat(txForm.unitCost)||0);
    const deliveryCost = perGal*gals;
    dispatch({ type:"ADD_TANK_TRANSACTION", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      type:txForm.type, date:txForm.date, tankId:txForm.tankId, tankName:tank?.name||"",
      gallons: (txForm.type==="dip_reading"||txForm.type==="monitor_reading") ? 0 : gals,
      vendorName:txForm.vendorName, invoiceNumber:txForm.invoiceNumber,
      deliveryCost, unitCost:perGal,
      sourceTankId: isFill ? txForm.sourceTankId : null,
      sourceTankName: isFill ? (srcTank?.name||"") : "",
      destinationTankId: isFill ? txForm.tankId : null,
      dipReading:parseFloat(txForm.dipReading)||0,
      variance: (txForm.type==="dip_reading"||txForm.type==="monitor_reading") ? (parseFloat(txForm.dipReading)||0) - ((tank?.currentLevel)||0) : 0,
      notes:txForm.notes, createdAt:new Date().toISOString(),
    }});
    setTxForm({ type:"delivery", date: today(), tankId:"", sourceTankId:"", gallons:"", vendorName:"", invoiceNumber:"", unitCost:"", dipReading:"", notes:"" });
    setShowTxForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Fuel Tanks</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowTxForm(s=>!s)} style={{ ...btn.secondary, fontSize:12 }}>{showTxForm?"Cancel":"+ Delivery / Reading"}</button>
          <button onClick={()=>setShowNew(s=>!s)} style={btn.primary}>{showNew?"Cancel":"+ Add Tank"}</button>
        </div>
      </div>

      <ReconciliationPanel tanks={tanks} tankTx={tankTx} />

      {showNew && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>New Tank</div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Tank Name"><input type="text" value={newTank.name} onChange={e=>setNT("name",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Main Shop Diesel…" /></Field>
            <Field label="Fuel Type">
              <select value={newTank.fuelType} onChange={e=>setNT("fuelType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="diesel">Diesel</option>
                <option value="unleaded">Unleaded</option>
              </select>
            </Field>
            <Field label="Tank Type">
              <select value={newTank.tankType} onChange={e=>setNT("tankType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="underground">Underground</option>
                <option value="above_ground">Above Ground</option>
                <option value="portable">Portable</option>
              </select>
            </Field>
            <Field label="Capacity (gal)"><input type="number" min="0" step="100" value={newTank.capacityGallons} onChange={e=>setNT("capacityGallons",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Location"><input type="text" value={newTank.location} onChange={e=>setNT("location",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <button onClick={handleAddTank} style={btn.primary}>Add Tank</button>
        </div>
      )}

      {showTxForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>Tank Transaction</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Type">
              <select value={txForm.type} onChange={e=>setTx("type",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="delivery">Fuel Delivery</option>
                <option value="monitor_reading">Monitor Balance (daily)</option>
                <option value="dip_reading">Dip Reading (annual)</option>
                <option value="portable_fill">Fill Portable Tank</option>
              </select>
            </Field>
            <Field label="Date"><input type="date" value={txForm.date} onChange={e=>setTx("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label={isFill ? "Tank being filled" : "Tank"}>
              <select value={txForm.tankId} onChange={e=>setTx("tankId",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Select…</option>
                {tanks.filter(t=>t.id!==txForm.sourceTankId).map(t=><option key={t.id} value={t.id}>{t.name} ({t.currentLevel?.toFixed(0)||0} gal)</option>)}
              </select>
            </Field>
            {(txForm.type==="dip_reading"||txForm.type==="monitor_reading")
              ? <Field label={txForm.type==="monitor_reading"?"Monitor Reads (gal)":"Dip Reads (gal)"}><input type="number" min="0" step="1" value={txForm.dipReading} onChange={e=>setTx("dipReading",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
              : <Field label="Gallons"><input type="number" min="0" step="1" value={txForm.gallons} onChange={e=>setTx("gallons",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            }
          </div>
          {isFill && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12 }}>
                <Field label="Fill from" required>
                  <select value={txForm.sourceTankId} onChange={e=>setTx("sourceTankId",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Select the tank it comes out of…</option>
                    {tanks.filter(t=>t.id!==txForm.tankId).map(t=>(
                      <option key={t.id} value={t.id}>{t.name} ({t.currentLevel?.toFixed(0)||0} gal on hand)</option>
                    ))}
                  </select>
                </Field>
                <Field label="Cost carried ($/gal)">
                  <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color: fillCost?"#1a5a3a":"#c0392b" }}>
                    {txForm.sourceTankId ? (fillCost ? fmtSm(fillCost) : "none") : "—"}
                  </div>
                </Field>
                <Field label="Value moved">
                  <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700 }}>
                    {fillCost && txForm.gallons ? fmtSm(fillCost*(parseFloat(txForm.gallons)||0)) : "—"}
                  </div>
                </Field>
              </div>
              {txForm.sourceTankId && !fillCost && (
                <div style={{ marginTop:8, background:"#fef8e8", border:"1px solid #f0d080", borderRadius:6, padding:"9px 12px", fontSize:12, color:"#7a4f00" }}>
                  <strong>{srcTank?.name}</strong> has no delivery on record, so there is no price per gallon to
                  carry across. Log its delivery first, or fuel dispensed from the mobile tank will cost nothing
                  and the departments you bill will be undercharged.
                </div>
              )}
              {fillShort && (
                <div style={{ marginTop:8, background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:6, padding:"9px 12px", fontSize:12, color:"#8c1b18" }}>
                  <strong>{srcTank?.name}</strong> only holds {srcTank?.currentLevel?.toFixed(0)||0} gallons.
                  You cannot move {parseFloat(txForm.gallons)||0} out of it.
                </div>
              )}
            </div>
          )}
          {txForm.type==="delivery" && (
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Vendor"><input type="text" value={txForm.vendorName} onChange={e=>setTx("vendorName",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
              <Field label="Invoice #"><input type="text" value={txForm.invoiceNumber} onChange={e=>setTx("invoiceNumber",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
              <Field label="Unit Cost ($/gal)"><input type="number" min="0" step="0.001" value={txForm.unitCost} onChange={e=>setTx("unitCost",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            </div>
          )}
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={txForm.notes} onChange={e=>setTx("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleTxSave}
              disabled={isFill && (!txForm.sourceTankId || fillShort)}
              style={{ ...btn.primary, marginTop:20,
                       opacity: (isFill && (!txForm.sourceTankId || fillShort)) ? 0.45 : 1,
                       cursor:  (isFill && (!txForm.sourceTankId || fillShort)) ? "not-allowed" : "pointer" }}>Save</button>
          </div>
        </div>
      )}

      {/* Tank cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14, marginBottom:24 }}>
        {tanks.length===0 && <div style={{ gridColumn:"1/-1", padding:48, textAlign:"center", color:"#aaa", border:"1px dashed #ccc", borderRadius:8 }}>No tanks configured yet</div>}
        {tanks.map(t => {
          const pct = t.capacityGallons > 0 ? Math.min(100, Math.round((t.currentLevel||0)/t.capacityGallons*100)) : 0;
          const barColor = pct < 20 ? "#c0392b" : pct < 40 ? "#d97706" : "#1a6b35";
          const isOpen = selectedTankId === t.id;
          return (
            <div key={t.id}
              onClick={()=>setSelectedTankId(isOpen ? null : t.id)}
              title="Click to see this tank's transactions"
              style={{ background:"#fff", border:`1px solid ${isOpen?"#1a5a3a":"#ddd"}`,
                       borderRadius:8, padding:18, cursor:"pointer",
                       boxShadow: isOpen ? "0 0 0 2px #1a5a3a22" : "none" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{t.location||"—"} · {t.fuelType} · {t.tankType.replace("_"," ")}</div>
                </div>
                <span style={{ background:t.status==="active"?"#e6f4ec":"#fdecea", color:t.status==="active"?"#1a6b35":"#c0392b", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>{t.status}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:8 }}>
                <span style={{ color:"#888" }}>Level</span>
                <span style={{ fontFamily:"monospace", fontWeight:700 }}>
                  {(t.currentLevel||0).toFixed(0)} gal
                  {t.capacityGallons > 0 && <span style={{ color:"#aaa", fontWeight:400 }}> / {t.capacityGallons} gal</span>}
                </span>
              </div>
              {t.capacityGallons > 0 && (
                <div style={{ height:8, background:"#f0f0ee", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:barColor, borderRadius:4, transition:"width 0.3s" }} />
                </div>
              )}
              {pct < 20 && t.capacityGallons > 0 && (
                <div style={{ fontSize:11, color:"#c0392b", fontWeight:600, marginTop:6 }}>⚠️ Low — order fuel</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tank transaction history — all tanks, or just the one clicked */}
      <SectionCard
        title={selectedTank ? `${selectedTank.name} — Transactions` : "Tank Transaction History"}
        subtitle={selectedTank
          ? `${shownTx.length} entries · ${selectedTank.currentLevel?.toFixed(0)||0} of ${selectedTank.capacityGallons||0} gal on hand`
          : `${tankTx.length} entries · click a tank above to see just that one`}
        action={selectedTank && (
          <button onClick={()=>setSelectedTankId(null)} style={{ ...btn.ghost, fontSize:11, padding:"5px 10px" }}>
            Show all tanks
          </button>
        )}
      >
        <Table
          headers={[{label:"Date"},{label:"Type"},{label:"Tank"},{label:"Gallons"},{label:"Vendor / Note"},{label:"Cost"}]}
          rows={shownTx.slice(0,50).map(tx=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(tx.date)}</span>,
            <span style={{fontSize:11,background:"#f0f0ee",padding:"2px 7px",borderRadius:4,fontWeight:600}}>{tx.type.replace("_"," ")}</span>,
            tx.tankName||"—",
            (() => {
              // The same fill is fuel leaving one tank and entering another.
              // Viewed from the source it must read negative, or the tank looks
              // like it gained what it actually gave away.
              const out = selectedTankId && tx.sourceTankId === selectedTankId && tx.tankId !== selectedTankId;
              const g = out ? -Math.abs(tx.gallons) : tx.gallons;
              return <span style={{fontFamily:"monospace",fontWeight:700,color:g<0?"#c0392b":"#1a6b35"}}>{g>0?"+":""}{g}</span>;
            })(),
            <span style={{fontSize:12,color:"#888"}}>
              {tx.sourceTankName ? `from ${tx.sourceTankName}` : (tx.vendorName||tx.notes||"—")}
            </span>,
            <span style={{fontFamily:"monospace"}}>{tx.deliveryCost?fmtSm(tx.deliveryCost):"—"}</span>,
          ])}
          emptyMessage={selectedTank ? `Nothing recorded against ${selectedTank.name} yet` : "No tank transactions yet"}
        />
      </SectionCard>
    </div>
  );
}

// ── Unit Form ─────────────────────────────────────────────────────────────────
function UnitForm({ unit, onSave, onCancel }) {
  const [form, setForm] = useState(unit ? { ...unit } : {
    ...createEquipmentUnit(),
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  return (
    <div style={{ maxWidth:740 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700 }}>{unit?"Edit Equipment Unit":"Add Equipment Unit"}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Unit Info</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Unit Number"><input type="text" value={form.unitNumber} onChange={e=>set("unitNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="100, 111…" /></Field>
          <Field label="Year"><input type="text" value={form.year} onChange={e=>set("year",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="2007" /></Field>
          <Field label="Make"><input type="text" value={form.make} onChange={e=>set("make",e.target.value)} style={inp} placeholder="Caterpillar, John Deere…" /></Field>
          <Field label="Model"><input type="text" value={form.model} onChange={e=>set("model",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Equipment Type">
            <select value={form.equipmentType||""} onChange={e=>set("equipmentType",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {EQUIPMENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              <option value="active">Active</option>
              <option value="in_shop">In Shop</option>
              <option value="out_of_service">Out of Service</option>
              <option value="sold">Sold</option>
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Serial Number"><input type="text" value={form.serialNumber} onChange={e=>set("serialNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="VIN"><input type="text" value={form.vin} onChange={e=>set("vin",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="License Plate"><input type="text" value={form.licensePlate} onChange={e=>set("licensePlate",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
          <Field label="Primary Location"><input type="text" value={form.primaryLocation} onChange={e=>set("primaryLocation",e.target.value)} style={inp} placeholder="Main Shop, Kenesaw…" /></Field>
          <Field label="Meter Type">
            <select value={form.meterType} onChange={e=>set("meterType",e.target.value)} style={inp}>
              <option value="hours">Hours</option>
              <option value="odometer">Odometer (miles)</option>
            </select>
          </Field>
          <Field label="Date Acquired"><input type="date" value={form.dateAcquired} onChange={e=>set("dateAcquired",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginTop:14 }}>
          <Field label="Fuel Type">
            <select value={form.fuelType||"diesel"} onChange={e=>set("fuelType",e.target.value)} style={inp}>
              {FUEL_TYPES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label={`Starting Meter (${form.meterType==="miles"?"miles":"hours"})`}>
            <input type="number" min="0" step="any" value={form.startingMeter||0}
              onChange={e=>set("startingMeter",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
            <div style={{ fontSize:11, color:"#888", marginTop:4 }}>What it read when the county got it.</div>
          </Field>
          <Field label="Engine Make"><input type="text" value={form.engineMake||""} onChange={e=>set("engineMake",e.target.value)} style={inp} placeholder="Cat, Cummins…" /></Field>
          <Field label="Engine Model / Size"><input type="text" value={form.engineModel||""} onChange={e=>set("engineModel",e.target.value)} style={inp} placeholder="C9 ACERT, 6.7L…" /></Field>
        </div>
      </div>

      <SpecLists form={form} set={set} />
      <PMScheduleEditor form={form} set={set} />

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Cost Accounting</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <Field label="Hourly Rate ($/hr)">
            <input type="number" min="0" step="0.01" value={form.femaRate} onChange={e=>set("femaRate",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
            <div style={{ fontSize:11, color:"#888", marginTop:4 }}>
              The published FEMA rate, used for internal costing too — they were always the same number.
            </div>
          </Field>
          <Field label="Purchase Price ($)">
            <input type="number" min="0" step="100" value={form.purchasePrice} onChange={e=>set("purchasePrice",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:12, color:"#888", marginBottom:6, fontWeight:600 }}>FEMA Rate Reference</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {FEMA_EQUIPMENT_RATES.slice(0,6).map(r=>(
              <button key={`${r.type}-${r.size}`} onClick={()=>set("femaRate",r.rate)} style={{ ...btn.small, background:"#f0f0ee", color:"#555", fontSize:10, padding:"4px 10px" }}>
                {r.type} ({r.size}): ${r.rate}/hr
              </button>
            ))}
            <span style={{ fontSize:11, color:"#aaa", alignSelf:"center" }}>…see full table in Cost Accounting</span>
          </div>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{unit?"Save Changes":"Add Unit"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Specification lists ───────────────────────────────────────────────────────
//
// Filters, fluids and tires, as repeatable rows rather than fixed fields. A
// motor grader has three hydraulic filters and a pickup has one oil filter, so
// any fixed set of columns is wrong for something the day it ships.
//
// The OEM number earns its place here: the county often buys aftermarket, but
// every cross-reference is keyed on the OEM part, so it is the number you need
// when you are on the phone to a supplier with the machine down.
function SpecRows({ title, hint, rows, columns, onAdd, onChange, onRemove, addLabel }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:12 }}>{title}</div>
          {hint && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{hint}</div>}
        </div>
        <button type="button" onClick={onAdd} style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>{addLabel}</button>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize:12, color:"#bbb", padding:"10px 0", borderTop:"1px solid #f0f0ee" }}>None recorded</div>
      ) : rows.map((row, i) => (
        <div key={row.id} style={{ display:"grid", gridTemplateColumns:`${columns.map(c=>c.width||"1fr").join(" ")} 28px`, gap:8, alignItems:"end", marginBottom:6 }}>
          {columns.map(c => (
            <div key={c.key}>
              {i === 0 && <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"#aaa", marginBottom:3 }}>{c.label}</div>}
              {c.options ? (
                <select value={row[c.key] ?? ""} onChange={e=>onChange(row.id, c.key, e.target.value)} style={{ ...inp, margin:0, fontSize:12 }}>
                  {c.options.map(o => typeof o === "string"
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={c.type || "text"}
                  value={row[c.key] ?? ""}
                  min={c.type === "number" ? 0 : undefined}
                  step={c.type === "number" ? "any" : undefined}
                  placeholder={c.placeholder || ""}
                  onChange={e=>onChange(row.id, c.key, c.type === "number" ? (parseFloat(e.target.value)||0) : e.target.value)}
                  style={{ ...inp, margin:0, fontSize:12, fontFamily: c.mono ? "monospace" : undefined }} />
              )}
            </div>
          ))}
          <button type="button" onClick={()=>onRemove(row.id)} title="Remove"
            style={{ ...btn.ghost, padding:"7px 0", fontSize:13, color:"#c0392b", borderColor:"#f0d0d0" }}>×</button>
        </div>
      ))}
    </div>
  );
}

function SpecLists({ form, set }) {
  const listOps = (key, factory) => ({
    onAdd:    () => set(key, [...(form[key] || []), factory()]),
    onChange: (id, field, value) => set(key, (form[key] || []).map(r => r.id === id ? { ...r, [field]: value } : r)),
    onRemove: (id) => set(key, (form[key] || []).filter(r => r.id !== id)),
  });

  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
      <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>
        What This Machine Takes
      </div>

      <SpecRows
        title="Filters & serviceable parts"
        hint="OEM number is what cross-references are keyed on, even when you buy aftermarket."
        rows={form.filters || []} addLabel="+ Filter"
        {...listOps("filters", createEquipmentPart)}
        columns={[
          { key:"kind",     label:"Type",     options:EQUIPMENT_PART_KINDS, width:"1.4fr" },
          { key:"position", label:"Position", placeholder:"primary, left…", width:"1fr" },
          { key:"oemPartNumber",       label:"OEM Part #",   mono:true, width:"1.2fr" },
          { key:"alternatePartNumber", label:"Aftermarket #", mono:true, width:"1.2fr" },
          { key:"quantity", label:"Qty",      type:"number", mono:true, width:"0.5fr" },
        ]}
      />

      <SpecRows
        title="Fluids & capacities"
        hint="Capacity is the point — how much to draw when the machine is down."
        rows={form.fluids || []} addLabel="+ Fluid"
        {...listOps("fluids", createEquipmentFluid)}
        columns={[
          { key:"kind",          label:"Fluid", options:EQUIPMENT_FLUID_KINDS, width:"1.3fr" },
          { key:"specification", label:"Spec",  placeholder:"15W-40, TO-4 30wt…", width:"1.4fr" },
          { key:"capacity",      label:"Capacity", type:"number", mono:true, width:"0.7fr" },
          { key:"unitOfMeasure", label:"Unit",  options:["QT","GAL","L"], width:"0.6fr" },
        ]}
      />

      <SpecRows
        title="Tires"
        hint="Front and rear usually differ on this equipment, so position is part of the answer."
        rows={form.tires || []} addLabel="+ Tire"
        {...listOps("tires", createEquipmentTire)}
        columns={[
          { key:"position", label:"Position", options:TIRE_POSITIONS, width:"0.8fr" },
          { key:"size",     label:"Size",     placeholder:"14.00R24", mono:true, width:"1.2fr" },
          { key:"ply",      label:"Ply",      width:"0.5fr" },
          { key:"quantity", label:"Qty",      type:"number", mono:true, width:"0.5fr" },
          { key:"pressure", label:"PSI cold", mono:true, width:"0.7fr" },
        ]}
      />
    </div>
  );
}

// ── PM schedule editor ────────────────────────────────────────────────────────
//
// Until now schedules were read but never editable, so nothing tied a meter
// reading to a service and the PM Due list could only ever be empty.
//
// A machine has SEVERAL schedules at once — a grader is serviced at 250, 500
// and 1000 hours, each a different job — so this is a list, and each row keeps
// its own last-done reading. Closing a work order stamps the row it satisfied.
function PMScheduleEditor({ form, set }) {
  const rows = form.pmSchedule || [];
  const unitWord = form.meterType === "miles" ? "miles" : "hours";

  const add    = (preset) => set("pmSchedule", [...rows, createPMSchedule({ equipmentId: form.id, ...preset })]);
  const change = (id, field, value) => set("pmSchedule", rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  const remove = (id) => set("pmSchedule", rows.filter(r => r.id !== id));

  const applyPreset = (key) => {
    const preset = PM_PRESETS[key] || [];
    set("pmSchedule", [
      ...rows,
      ...preset
        .filter(p => !rows.some(r => r.service === p.service))
        .map(p => createPMSchedule({ equipmentId: form.id, ...p })),
    ]);
  };

  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>
            Preventive Maintenance Intervals
          </div>
          <div style={{ fontSize:11, color:"#888", marginTop:3 }}>
            What drives the PM Due list. A machine can have several — 250, 500 and 1000 {unitWord} are different jobs.
          </div>
        </div>
        <button type="button" onClick={()=>add({ intervalType: form.meterType || "hours" })}
          style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>+ Interval</button>
      </div>

      {rows.length === 0 && (
        <div style={{ background:"#f7f7f5", border:"1px dashed #ccc", borderRadius:6, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#666", marginBottom:8 }}>
            No intervals set, so this machine will never appear on the PM Due list. Start from a standard set:
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.keys(PM_PRESETS).map(k=>(
              <button key={k} type="button" onClick={()=>applyPreset(k)}
                style={{ ...btn.small, background:"#f0f0ee", color:"#555", fontSize:11 }}>
                {PM_PRESET_LABELS?.[k] || k.replace(/_/g," ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.map((r,i) => (
        <div key={r.id} style={{ display:"grid", gridTemplateColumns:"1.6fr 0.8fr 0.9fr 0.9fr 1fr 28px", gap:8, alignItems:"end", marginBottom:6 }}>
          {["Service","Every","Measured in","Warn ahead","Last done"].map((h,n)=>(
            i === 0 ? <div key={h} style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"#aaa", marginBottom:3, gridColumn:n+1 }}>{h}</div> : null
          ))}
          <input type="text" value={r.service||""} onChange={e=>change(r.id,"service",e.target.value)}
            placeholder="Oil & Filter" style={{ ...inp, margin:0, fontSize:12 }} />
          <input type="number" min="0" step="any" value={r.interval||0}
            onChange={e=>change(r.id,"interval",parseFloat(e.target.value)||0)}
            style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace" }} />
          <select value={r.intervalType||"hours"} onChange={e=>change(r.id,"intervalType",e.target.value)}
            style={{ ...inp, margin:0, fontSize:12 }}>
            <option value="hours">hours</option>
            <option value="miles">miles</option>
            <option value="months">months</option>
          </select>
          <input type="number" min="0" step="any" value={r.warnAhead||0}
            onChange={e=>change(r.id,"warnAhead",parseFloat(e.target.value)||0)}
            placeholder="auto" style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace" }} />
          <input type="number" min="0" step="any" value={r.lastDoneMeter ?? ""}
            onChange={e=>change(r.id,"lastDoneMeter", e.target.value === "" ? null : (parseFloat(e.target.value)||0))}
            placeholder="never" style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace" }} />
          <button type="button" onClick={()=>remove(r.id)} title="Remove"
            style={{ ...btn.ghost, padding:"7px 0", fontSize:13, color:"#c0392b", borderColor:"#f0d0d0" }}>×</button>
        </div>
      ))}

      {rows.length > 0 && (
        <div style={{ fontSize:11, color:"#888", marginTop:8, lineHeight:1.6 }}>
          Leave <strong>warn ahead</strong> at 0 for a sensible default. <strong>Last done</strong> is the lifetime
          meter reading at the last service — closing a PM work order fills it in from then on.
        </div>
      )}
    </div>
  );
}

// ── PM Due — batch work order creation ────────────────────────────────────────
// A PM is a work order like any other: parts come out of inventory, labor is
// costed, and it rolls into the unit's operating cost. What makes the volume
// workable is that entry is batched — the shop does six oil changes on a Tuesday
// and that's one screen, not six forms.
function PMDueTab({ units, dispatch, onOpen }) {
  const due = pmDueList(units);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], reportedBy:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const overdue = due.filter(d => d.status.state === "overdue");
  const key = (d) => `${d.unit.id}::${d.sched.id}`;
  const toggle = (d) => setSelected(s => s.includes(key(d)) ? s.filter(x=>x!==key(d)) : [...s, key(d)]);
  const chosen = due.filter(d => selected.includes(key(d)));

  const createBatch = () => {
    if (!chosen.length) return;
    const ids = [];
    chosen.forEach((d, i) => {
      const wo = createWorkOrder({
        workOrderNumber: "",   // assigned on save, one series across the fleet
        unitId:          d.unit.id,
        unitNumber:      d.unit.unitNumber || "",
        unitDescription: [d.unit.year, d.unit.make, d.unit.model].filter(Boolean).join(" "),
        description:     d.sched.service,
        category:        "preventive",
        priority:        d.status.state === "overdue" ? "urgent" : "routine",
        openedDate:      form.date,
        meterReadingOpen: lifetimeMeter(d.unit),
        pmScheduleId:    d.sched.id,
        pmService:       d.sched.service,
        reportedBy:      form.reportedBy,
        notes:           form.notes,
      });
      ids.push(wo.id);
      dispatch({ type:"ADD_WORK_ORDER", payload: wo });
    });
    setSelected([]);
    setForm(f => ({ ...f, notes:"" }));
    // One selected? Go straight into it so parts can be added.
    if (ids.length === 1) onOpen(ids[0]);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Preventive Maintenance Due</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            Driven by meter readings. Tick what's been done and raise the work orders in one go.
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Coming Due" value={due.length - overdue.length} sub="Within the warning window" accent="#d97706" icon="clock" />
        <KPICard label="Overdue"    value={overdue.length}             sub="Past the interval"         accent={overdue.length?"#c0392b":"#888"} icon="alert-triangle" />
        <KPICard label="Selected"   value={chosen.length}              sub="Ready to raise"            accent={chosen.length?"#1a5a3a":"#888"} icon="clipboard-check" />
      </div>

      {due.length === 0 && (
        <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:8, padding:28, textAlign:"center", color:"#1a5a3a", fontSize:13 }}>
          ✓ Nothing due. Warnings appear as meter readings come in — logging fuel updates them automatically.
        </div>
      )}

      {due.length > 0 && (
        <>
          {/* Batch entry */}
          <div style={{ background: chosen.length ? "#f0f8f4" : "#f7f7f5", border:`1px solid ${chosen.length?"#a8d5b5":"#ddd"}`, borderRadius:8, padding:16, marginBottom:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr 2fr auto", gap:12, alignItems:"end" }}>
              <Field label="Date performed">
                <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <Field label="Performed by">
                <input type="text" value={form.reportedBy} onChange={e=>set("reportedBy",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <Field label="Notes (applied to all)">
                <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <button onClick={createBatch} disabled={!chosen.length}
                style={{ ...btn.primary, opacity: chosen.length?1:0.4, whiteSpace:"nowrap" }}>
                Raise {chosen.length || ""} Work Order{chosen.length===1?"":"s"}
              </button>
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:10 }}>
              Each becomes its own work order against its machine, so parts and labor cost to the right unit.
              Add parts on the work order — they come out of inventory at FIFO cost. Closing it stamps the meter and resets the interval.
            </div>
          </div>

          <div style={{ display:"flex", gap:10, marginBottom:12 }}>
            <button onClick={()=>setSelected(due.map(key))} style={{ ...btn.small, fontSize:11 }}>Select All</button>
            <button onClick={()=>setSelected(overdue.map(key))} style={{ ...btn.small, background:"#c0392b", fontSize:11 }}>Select Overdue</button>
            <button onClick={()=>setSelected([])} style={{ ...btn.small, background:"#aaa", fontSize:11 }}>Clear</button>
          </div>

          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["","Unit","Equipment","Service","Interval","Meter","Status"].map(h=>(
                    <th key={h} style={{ padding:"9px 12px", textAlign:h==="Meter"?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {due.map((d,i)=>{
                  const checked = selected.includes(key(d));
                  return (
                    <tr key={key(d)} onClick={()=>toggle(d)}
                      style={{ borderTop:"1px solid #eee", background: checked ? "#f0f8f4" : i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                      <td style={{ padding:"9px 12px 9px 16px" }}>
                        <input type="checkbox" checked={checked} onChange={()=>toggle(d)} onClick={e=>e.stopPropagation()} />
                      </td>
                      <td style={{ padding:"9px 12px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{d.unit.unitNumber||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>{[d.unit.year,d.unit.make,d.unit.model].filter(Boolean).join(" ")||"—"}</td>
                      <td style={{ padding:"9px 12px", fontWeight:600 }}>{d.sched.service||"—"}</td>
                      <td style={{ padding:"9px 12px", color:"#888", fontSize:12 }}>
                        every {Number(d.sched.interval).toLocaleString()} {d.sched.intervalType==="miles"?"mi":d.sched.intervalType==="hours"?"hr":"mo"}
                      </td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{lifetimeMeter(d.unit).toLocaleString()}</td>
                      <td style={{ padding:"9px 12px" }}><PMBadge status={d.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
