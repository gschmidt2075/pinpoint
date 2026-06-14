import { useState, useMemo } from "react";
import { Field, SectionCard, Table, StatusBadge, inp, btn, fmt, fmtSm, pct, ProgressBar } from "../components/shared.jsx";
import { FEMA_EQUIPMENT_RATES } from "./CostAccounting.jsx";

// ── Equipment Types ───────────────────────────────────────────────────────────
const EQUIPMENT_TYPES = [
  "Motor Grader", "Dump Truck", "Side Dump", "Loader", "Excavator / Gradall",
  "Pickup Truck", "Crew Cab Truck", "Flatbed Truck", "Trailer", "Mower / Tractor",
  "Skid Steer", "Dozer", "Roller / Compactor", "Crane", "Paver", "Paint Striper",
  "Crack Sealer", "Water Truck", "Generator", "Sign Truck", "Other",
];

const INTERVAL_TYPES = [
  { value: "hours",    label: "Hours",    icon: "⏱" },
  { value: "miles",    label: "Miles",    icon: "🛣" },
  { value: "calendar", label: "Calendar", icon: "📅" },
];

const PM_TASKS = [
  "Oil & Filter Change", "Air Filter", "Fuel Filter", "Hydraulic Filter",
  "Hydraulic Fluid Change", "Coolant Flush", "Grease / Lubrication",
  "Tire Rotation", "Tire Replacement", "Belt Inspection", "Battery Check",
  "Brake Inspection", "Annual Safety Inspection", "DOT Inspection",
  "Winterization", "Other",
];

const STATUS_OPTIONS = [
  { value: "active",         label: "Active",         color: "#1a6b35" },
  { value: "out_of_service", label: "Out of Service", color: "#c0392b" },
  { value: "in_shop",        label: "In Shop",        color: "#d97706" },
  { value: "disposed",       label: "Disposed",       color: "#888"    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function dueBadge(daysLeft) {
  if (daysLeft < 0)  return { label: `${Math.abs(daysLeft)}d overdue`, bg: "#fdecea", color: "#c0392b" };
  if (daysLeft <= 14) return { label: `Due in ${daysLeft}d`, bg: "#fef3cd", color: "#7a4f00" };
  return { label: `Due in ${daysLeft}d`, bg: "#e6f4ec", color: "#1a6b35" };
}

// ── Equipment Module ──────────────────────────────────────────────────────────
export default function Equipment({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"dashboard", label:"Dashboard" },
          { id:"fleet",     label:"Fleet Register" },
          { id:"addUnit",   label:"Add Unit" },
          { id:"fuel",      label:"Fuel Log" },
          { id:"pm",        label:"PM Schedule" },
          { id:"costs",     label:"Cost Reports" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px",
            fontWeight: view===v.id ? 700 : 400, fontSize:13, cursor:"pointer",
            color: view===v.id ? "#d97706" : "#666",
            borderBottom: view===v.id ? "2px solid #d97706" : "2px solid transparent",
            marginBottom:-1,
          }}>{v.label}</button>
        ))}
      </div>

      {view==="dashboard" && <EquipDashboard db={db} setView={setView} />}
      {view==="fleet"     && <FleetRegister db={db} dispatch={dispatch} />}
      {view==="addUnit"   && <AddUnitForm db={db} dispatch={dispatch} onDone={() => setView("fleet")} />}
      {view==="fuel"      && <FuelLog db={db} dispatch={dispatch} />}
      {view==="pm"        && <PMSchedule db={db} dispatch={dispatch} />}
      {view==="costs"     && <CostReports db={db} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function EquipDashboard({ db, setView }) {
  const units    = db.equipment || [];
  const fuelLogs = db.fuelLogs  || [];
  const pmLogs   = db.pmLogs    || [];

  const active      = units.filter(u => u.status==="active");
  const inShop      = units.filter(u => u.status==="in_shop");
  const outOfSvc    = units.filter(u => u.status==="out_of_service");
  const totalFuelCost = fuelLogs.reduce((s,f) => s+(parseFloat(f.totalCost)||0), 0);
  const totalMaintCost = pmLogs.reduce((s,p) => s+(parseFloat(p.laborCost||0)+parseFloat(p.partsCost||0)), 0);

  // PM alerts — overdue or due within 30 days
  const pmAlerts = [];
  units.forEach(unit => {
    (unit.pmSchedule||[]).forEach(pm => {
      if (!pm.nextDue) return;
      const days = daysUntil(pm.nextDue);
      if (days <= 30) pmAlerts.push({ unit, pm, days });
    });
  });
  pmAlerts.sort((a,b) => a.days - b.days);

  const recentFuel = [...fuelLogs].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,6);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Equipment & Assets</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Fleet register · Fuel tracking · PM scheduling · Cost reporting</div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Active Units",      value:active.length,              sub:"In service",          accent:"#1a6b35" },
          { label:"In Shop",           value:inShop.length,              sub:"Under maintenance",   accent:"#d97706" },
          { label:"Out of Service",    value:outOfSvc.length,            sub:"Down units",          accent:"#c0392b" },
          { label:"Fuel Cost (YTD)",   value:fmt(totalFuelCost),         sub:"All units",           accent:"#1a3a5c" },
          { label:"Maintenance (YTD)", value:fmt(totalMaintCost),        sub:"Labor + parts",       accent:"#5a1a8a" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.accent}` }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888", marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:k.accent }}>{k.value}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* PM Alerts */}
      {pmAlerts.length > 0 && (
        <SectionCard title="PM Alerts" subtitle={`${pmAlerts.filter(a=>a.days<0).length} overdue · ${pmAlerts.filter(a=>a.days>=0&&a.days<=30).length} due within 30 days`}>
          <Table
            headers={[{ label:"Unit" },{ label:"Task" },{ label:"Interval" },{ label:"Next Due" },{ label:"Status" }]}
            rows={pmAlerts.map(({ unit, pm, days }) => {
              const badge = dueBadge(days);
              return [
                <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{unit.unitNumber}</span>,
                <span style={{ fontWeight:600 }}>{unit.year} {unit.make} {unit.model} — {pm.task}</span>,
                <span style={{ fontSize:12, color:"#888" }}>{pm.intervalValue} {pm.intervalType}</span>,
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{pm.nextDue}</span>,
                <span style={{ background:badge.bg, color:badge.color, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>{badge.label}</span>,
              ];
            })}
            emptyMessage="No upcoming PM due"
          />
        </SectionCard>
      )}

      {/* Recent fuel */}
      <SectionCard title="Recent Fuel Entries" subtitle={`${fuelLogs.length} total entries`}>
        <Table
          headers={[{ label:"Date" },{ label:"Unit" },{ label:"Gallons", right:true },{ label:"$/Gal", right:true },{ label:"Total", right:true },{ label:"Reading" }]}
          rows={recentFuel.map(f => {
            const unit = units.find(u=>u.id===f.unitId);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{f.date}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{unit?.unitNumber||"—"} <span style={{ fontWeight:400, color:"#888", fontSize:11 }}>{unit?.make} {unit?.model}</span></span>,
              <span style={{ fontFamily:"monospace" }}>{f.gallons}</span>,
              <span style={{ fontFamily:"monospace" }}>{fmtSm(f.pricePerGallon)}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(f.totalCost)}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{f.reading ? `${f.reading} ${unit?.trackBy==="miles"?"mi":"hrs"}` : "—"}</span>,
            ];
          })}
          emptyMessage="No fuel entries yet — use the Fuel Log tab to add entries"
        />
      </SectionCard>
    </div>
  );
}

// ── Fleet Register ────────────────────────────────────────────────────────────
function FleetRegister({ db, dispatch }) {
  const [search, setSearch]   = useState("");
  const [typeFilter, setType] = useState("all");
  const [statusFilter, setStat] = useState("active");
  const [selected, setSelected] = useState(null);

  const units = db.equipment || [];
  const types = [...new Set(units.map(u=>u.type))].filter(Boolean);

  const filtered = units.filter(u => {
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (typeFilter   !== "all" && u.type   !== typeFilter)   return false;
    if (search && !`${u.unitNumber} ${u.year} ${u.make} ${u.model} ${u.serialNumber||""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selected) {
    return <UnitDetail unit={selected} db={db} dispatch={dispatch} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Fleet Register</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{units.length} units registered</div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search unit #, make, model…" style={{ ...inp, width:220, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all","active","in_shop","out_of_service","disposed"].map(s => (
              <button key={s} onClick={()=>setStat(s)} style={{ padding:"7px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background: statusFilter===s?"#d97706":"#fff", color: statusFilter===s?"#fff":"#555", textTransform:"capitalize" }}>
                {s.replace(/_/g," ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionCard title={`Units (${filtered.length})`}>
        <Table
          headers={[
            { label:"Unit #" },{ label:"Year / Make / Model" },{ label:"Type" },
            { label:"Serial #" },{ label:"FEMA Rate", right:true },
            { label:"Hrs / Miles" },{ label:"Status" },
          ]}
          rows={filtered.map(u => {
            const status = STATUS_OPTIONS.find(s=>s.value===u.status);
            const fuelLogs = (db.fuelLogs||[]).filter(f=>f.unitId===u.id);
            const latestReading = fuelLogs.length>0 ? Math.max(...fuelLogs.map(f=>parseFloat(f.reading)||0)) : null;
            return [
              <button onClick={()=>setSelected(u)} style={{ background:"none", border:"none", padding:0, color:"#d97706", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>{u.unitNumber}</button>,
              <span style={{ fontWeight:600 }}>{u.year} {u.make} {u.model}</span>,
              <span style={{ fontSize:11, background:"#fef3cd", color:"#7a4f00", padding:"2px 7px", borderRadius:4 }}>{u.type}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{u.serialNumber||"—"}</span>,
              u.femaRate ? <span style={{ fontFamily:"monospace", fontWeight:600, color:"#1a3a5c" }}>{fmtSm(u.femaRate)}/hr</span> : "—",
              latestReading ? <span style={{ fontFamily:"monospace", fontSize:12 }}>{latestReading.toLocaleString()} {u.trackBy==="miles"?"mi":"hrs"}</span> : "—",
              <span style={{ background:status?.color+"18", color:status?.color, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>{status?.label||u.status}</span>,
            ];
          })}
          emptyMessage="No units registered — click Add Unit to get started"
        />
      </SectionCard>
    </div>
  );
}

// ── Unit Detail ───────────────────────────────────────────────────────────────
function UnitDetail({ unit, db, dispatch, onBack }) {
  const [tab, setTab] = useState("info");
  const fuelLogs = (db.fuelLogs||[]).filter(f=>f.unitId===unit.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const pmLogs   = (db.pmLogs||[]).filter(p=>p.unitId===unit.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const invItems = (db.inventoryItems||[]).filter(i=>(i.machineRefs||[]).some(r=>r.toLowerCase().includes(unit.unitNumber.toLowerCase())||r.toLowerCase().includes(`${unit.make} ${unit.model}`.toLowerCase())));

  const totalFuel  = fuelLogs.reduce((s,f)=>s+(parseFloat(f.totalCost)||0),0);
  const totalGals  = fuelLogs.reduce((s,f)=>s+(parseFloat(f.gallons)||0),0);
  const totalMaint = pmLogs.reduce((s,p)=>s+(parseFloat(p.laborCost||0)+parseFloat(p.partsCost||0)),0);
  const latestReading = fuelLogs.length>0 ? Math.max(...fuelLogs.map(f=>parseFloat(f.reading)||0)) : null;
  const status = STATUS_OPTIONS.find(s=>s.value===unit.status);

  const updateStatus = (newStatus) => dispatch({ type:"UPDATE_EQUIPMENT_STATUS", payload:{ id:unit.id, status:newStatus } });

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to fleet</button>

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:20, fontWeight:700, color:"#d97706" }}>{unit.unitNumber}</span>
              <span style={{ fontSize:11, background:status?.color+"18", color:status?.color, padding:"2px 8px", borderRadius:4, fontWeight:600 }}>{status?.label}</span>
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a" }}>{unit.year} {unit.make} {unit.model}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:2 }}>{unit.type} · S/N: {unit.serialNumber||"—"} · VIN: {unit.vin||"—"}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Purchased: {unit.purchaseDate||"—"} · Cost: {unit.purchaseCost>0?fmt(unit.purchaseCost):"—"} · FEMA Rate: {unit.femaRate>0?`${fmtSm(unit.femaRate)}/hr`:"—"}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {STATUS_OPTIONS.filter(s=>s.value!==unit.status).map(s => (
              <button key={s.value} onClick={()=>updateStatus(s.value)} style={{ ...btn.small, background:s.color, fontSize:11 }}>→ {s.label}</button>
            ))}
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginTop:18 }}>
          {[
            { label:"Total Fuel Cost",  value:fmt(totalFuel),                   color:"#1a3a5c" },
            { label:"Total Gallons",    value:`${totalGals.toFixed(0)} gal`,     color:"#1a5a3a" },
            { label:"Maint. Cost",      value:fmt(totalMaint),                   color:"#6b3a1a" },
            { label:"Total Cost",       value:fmt(totalFuel+totalMaint),         color:"#1a1a1a" },
            { label:unit.trackBy==="miles"?"Current Miles":"Current Hours",
              value:latestReading?latestReading.toLocaleString():"—",            color:"#d97706" },
          ].map((k,i) => (
            <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"12px 14px", borderTop:`3px solid ${k.color}` }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:16, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"info",    label:"Details" },
          { id:"pm",      label:`PM Schedule (${unit.pmSchedule?.length||0})` },
          { id:"history", label:`Service History (${pmLogs.length})` },
          { id:"fuel",    label:`Fuel Log (${fuelLogs.length})` },
          { id:"parts",   label:`Compatible Parts (${invItems.length})` },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"transparent", border:"none", padding:"7px 14px 9px",
            fontWeight: tab===t.id?700:400, fontSize:12, cursor:"pointer",
            color: tab===t.id?"#d97706":"#666",
            borderBottom: tab===t.id?"2px solid #d97706":"2px solid transparent", marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab==="info"    && <UnitInfo unit={unit} />}
      {tab==="pm"      && <UnitPMSchedule unit={unit} dispatch={dispatch} />}
      {tab==="history" && <ServiceHistory logs={pmLogs} />}
      {tab==="fuel"    && <UnitFuelLog logs={fuelLogs} unit={unit} />}
      {tab==="parts"   && <CompatibleParts items={invItems} />}
    </div>
  );
}

function UnitInfo({ unit }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
        {[
          { label:"Unit Number",     value:unit.unitNumber },
          { label:"Year",            value:unit.year },
          { label:"Make",            value:unit.make },
          { label:"Model",           value:unit.model },
          { label:"Type",            value:unit.type },
          { label:"Serial Number",   value:unit.serialNumber||"—" },
          { label:"VIN",             value:unit.vin||"—" },
          { label:"License Plate",   value:unit.licensePlate||"—" },
          { label:"Track By",        value:unit.trackBy==="miles"?"Miles / Odometer":"Hours / Hour Meter" },
          { label:"Purchase Date",   value:unit.purchaseDate||"—" },
          { label:"Purchase Cost",   value:unit.purchaseCost>0?fmt(unit.purchaseCost):"—" },
          { label:"Useful Life",     value:unit.usefulLife?`${unit.usefulLife} years`:"—" },
          { label:"FEMA Type",       value:unit.femaType||"—" },
          { label:"FEMA Rate",       value:unit.femaRate>0?`${fmtSm(unit.femaRate)}/hr`:"—" },
          { label:"Home Location",   value:unit.homeLocation||"—" },
          { label:"Assigned Operator",value:unit.assignedOperator||"—" },
        ].map((f,i) => (
          <div key={i}>
            <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
            <div style={{ fontSize:13, color:"#1a1a1a", fontFamily: f.label.includes("Number")||f.label.includes("VIN")||f.label.includes("Serial")||f.label.includes("Cost")||f.label.includes("Rate")?"monospace":"inherit" }}>{f.value}</div>
          </div>
        ))}
      </div>
      {unit.notes && <div style={{ marginTop:18, padding:"12px 14px", background:"#f7f7f5", borderRadius:6, fontSize:13, color:"#555" }}>{unit.notes}</div>}
    </div>
  );
}

function UnitPMSchedule({ unit, dispatch }) {
  const empty = { task:"", intervalType:"hours", intervalValue:"", lastDone:"", nextDue:"", notes:"" };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f, [k]:v }));

  const calcNextDue = (lastDone, intervalType, intervalValue) => {
    if (!lastDone || !intervalValue) return "";
    const val = parseInt(intervalValue);
    if (intervalType==="calendar") return addMonths(lastDone, val);
    return ""; // hours/miles — tracked by reading not date
  };

  const handleAdd = () => {
    if (!form.task || !form.intervalValue) return;
    const nextDue = form.intervalType==="calendar" ? calcNextDue(form.lastDone, form.intervalType, form.intervalValue) : form.nextDue;
    dispatch({ type:"ADD_PM_SCHEDULE", payload:{ unitId:unit.id, pm:{ ...form, nextDue, id:Date.now() } } });
    setForm(empty); setAdding(false);
  };

  return (
    <div>
      <SectionCard
        title="PM Schedule"
        subtitle="Scheduled preventive maintenance tasks"
        action={<button onClick={()=>setAdding(!adding)} style={btn.small}>+ Add PM Task</button>}
      >
        {adding && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="PM Task" required>
                <select value={form.task} onChange={e=>set("task",e.target.value)} style={inp}>
                  <option value="">Select task…</option>
                  {PM_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Interval Type">
                <select value={form.intervalType} onChange={e=>set("intervalType",e.target.value)} style={inp}>
                  {INTERVAL_TYPES.map(t=><option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </Field>
              <Field label={form.intervalType==="calendar"?"Every (months)":form.intervalType==="hours"?"Every (hours)":"Every (miles)"}>
                <input type="number" min="1" placeholder="0" value={form.intervalValue} onChange={e=>set("intervalValue",e.target.value)} style={inp} />
              </Field>
              <Field label="Last Done">
                <input type="date" value={form.lastDone} onChange={e=>{ set("lastDone",e.target.value); if(form.intervalType==="calendar") set("nextDue", calcNextDue(e.target.value, form.intervalType, form.intervalValue)); }} style={inp} />
              </Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              {form.intervalType!=="calendar" && (
                <Field label="Next Due Date (optional)">
                  <input type="date" value={form.nextDue} onChange={e=>set("nextDue",e.target.value)} style={inp} />
                </Field>
              )}
              <Field label="Notes">
                <input type="text" placeholder="Specifications, oil type, filter part #…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
              </Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleAdd} style={{ ...btn.small, background:"#d97706" }}>Add PM Task</button>
              <button onClick={()=>setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}
        <Table
          headers={[{ label:"Task" },{ label:"Interval" },{ label:"Last Done" },{ label:"Next Due" },{ label:"Status" },{ label:"Notes" }]}
          rows={(unit.pmSchedule||[]).map(pm => {
            const days   = pm.nextDue ? daysUntil(pm.nextDue) : null;
            const badge  = days!==null ? dueBadge(days) : null;
            return [
              <span style={{ fontWeight:600 }}>{pm.task}</span>,
              <span style={{ fontSize:12 }}>{INTERVAL_TYPES.find(t=>t.value===pm.intervalType)?.icon} Every {pm.intervalValue} {pm.intervalType}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{pm.lastDone||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{pm.nextDue||"—"}</span>,
              badge ? <span style={{ background:badge.bg, color:badge.color, padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{badge.label}</span> : "—",
              <span style={{ fontSize:12, color:"#888" }}>{pm.notes||"—"}</span>,
            ];
          })}
          emptyMessage="No PM tasks scheduled — click + Add PM Task"
        />
      </SectionCard>
    </div>
  );
}

function ServiceHistory({ logs }) {
  return (
    <SectionCard title="Service History" subtitle={`${logs.length} service records`}>
      <Table
        headers={[{ label:"Date" },{ label:"Task" },{ label:"Reading" },{ label:"Technician" },{ label:"Labor Cost", right:true },{ label:"Parts Cost", right:true },{ label:"Total", right:true },{ label:"Notes" }]}
        rows={logs.map(log => [
          <span style={{ fontFamily:"monospace", fontSize:12 }}>{log.date}</span>,
          <span style={{ fontWeight:600 }}>{log.task}</span>,
          <span style={{ fontFamily:"monospace", fontSize:12 }}>{log.reading||"—"}</span>,
          log.technician||"—",
          <span style={{ fontFamily:"monospace" }}>{fmtSm(parseFloat(log.laborCost)||0)}</span>,
          <span style={{ fontFamily:"monospace" }}>{fmtSm(parseFloat(log.partsCost)||0)}</span>,
          <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm((parseFloat(log.laborCost)||0)+(parseFloat(log.partsCost)||0))}</span>,
          <span style={{ fontSize:12, color:"#888" }}>{log.notes||"—"}</span>,
        ])}
        emptyMessage="No service history yet"
      />
    </SectionCard>
  );
}

function UnitFuelLog({ logs, unit }) {
  const totalGals = logs.reduce((s,f)=>s+(parseFloat(f.gallons)||0),0);
  const totalCost = logs.reduce((s,f)=>s+(parseFloat(f.totalCost)||0),0);
  const avgPrice  = totalGals>0 ? totalCost/totalGals : 0;

  return (
    <div>
      {logs.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
          {[
            { label:"Total Gallons",  value:`${totalGals.toFixed(1)} gal`, color:"#1a5a3a" },
            { label:"Total Fuel Cost",value:fmt(totalCost),                color:"#1a3a5c" },
            { label:"Avg Price/Gal",  value:fmtSm(avgPrice),              color:"#6b3a1a" },
          ].map((k,i) => (
            <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"12px 14px", borderTop:`3px solid ${k.color}` }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", color:k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Fuel Log" subtitle={`${logs.length} fill-ups`}>
        <Table
          headers={[{ label:"Date" },{ label:"Gallons", right:true },{ label:"$/Gal", right:true },{ label:"Total", right:true },{ label:unit.trackBy==="miles"?"Odometer":"Hour Meter" },{ label:"Location" },{ label:"Notes" }]}
          rows={logs.map(f => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{f.date}</span>,
            <span style={{ fontFamily:"monospace" }}>{f.gallons}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmtSm(f.pricePerGallon)}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(f.totalCost)}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{f.reading||"—"}</span>,
            f.fuelLocation||"—",
            <span style={{ fontSize:12, color:"#888" }}>{f.notes||"—"}</span>,
          ])}
          emptyMessage="No fuel entries for this unit"
        />
      </SectionCard>
    </div>
  );
}

function CompatibleParts({ items }) {
  return (
    <SectionCard title="Compatible Parts from Inventory" subtitle={`${items.length} parts cross-referenced to this unit`}>
      <Table
        headers={[{ label:"Part Name" },{ label:"Part #" },{ label:"On Hand", right:true },{ label:"Unit" },{ label:"Location" },{ label:"Reorder At", right:true }]}
        rows={items.map(item => {
          const onHand = Object.values(item.locationStock||{}).reduce((s,v)=>s+v,0);
          const isLow  = item.reorderPoint>0 && onHand<=item.reorderPoint;
          return [
            <span style={{ fontWeight:600, color: onHand===0?"#c0392b":isLow?"#d97706":"#1a1a1a" }}>{item.name}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{item.partNumber||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color: onHand===0?"#c0392b":isLow?"#d97706":"#1a6b35" }}>{onHand}</span>,
            item.unit||"—",
            item.shelf ? `Shelf ${item.shelf}` : "—",
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{item.reorderPoint||"—"}</span>,
          ];
        })}
        emptyMessage="No parts cross-referenced to this unit — add machine references in Inventory"
      />
    </SectionCard>
  );
}

// ── Add Unit Form ─────────────────────────────────────────────────────────────
function AddUnitForm({ db, dispatch, onDone }) {
  const empty = {
    unitNumber:"", year:"", make:"", model:"", type:"", serialNumber:"",
    vin:"", licensePlate:"", trackBy:"hours", purchaseDate:"", purchaseCost:"",
    usefulLife:"", femaType:"", femaRate:"", homeLocation:"Main Shop",
    assignedOperator:"", status:"active", notes:"", pmSchedule:[],
  };
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f, [k]:v }));

  const uniqueFemaTypes = [...new Set(FEMA_EQUIPMENT_RATES.map(r=>r.type))];

  const handleFemaType = (type) => {
    set("femaType", type);
    const match = FEMA_EQUIPMENT_RATES.find(r=>r.type===type);
    if (match) set("femaRate", match.rate);
  };

  const handleSubmit = () => {
    if (!form.unitNumber || !form.make || !form.model) return;
    dispatch({ type:"ADD_EQUIPMENT", payload:{ ...form, id:Date.now(), purchaseCost:parseFloat(form.purchaseCost)||0, femaRate:parseFloat(form.femaRate)||0 } });
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  return (
    <div style={{ maxWidth:780 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Add Unit</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Register a new piece of equipment or vehicle</div>
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Unit added — redirecting…</div>}

      {/* Basic info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Unit Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Unit Number" required>
            <input type="text" placeholder="e.g. 241" value={form.unitNumber} onChange={e=>set("unitNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Year" required>
            <input type="number" min="1900" max="2030" placeholder="2024" value={form.year} onChange={e=>set("year",e.target.value)} style={inp} />
          </Field>
          <Field label="Make" required>
            <input type="text" placeholder="CAT, John Deere…" value={form.make} onChange={e=>set("make",e.target.value)} style={inp} />
          </Field>
          <Field label="Model" required>
            <input type="text" placeholder="140M3, 770G…" value={form.model} onChange={e=>set("model",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Equipment Type" required>
            <select value={form.type} onChange={e=>set("type",e.target.value)} style={inp}>
              <option value="">Select type…</option>
              {EQUIPMENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Track By">
            <select value={form.trackBy} onChange={e=>set("trackBy",e.target.value)} style={inp}>
              <option value="hours">Hours (hour meter)</option>
              <option value="miles">Miles (odometer)</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <Field label="Serial Number">
            <input type="text" value={form.serialNumber} onChange={e=>set("serialNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="VIN">
            <input type="text" value={form.vin} onChange={e=>set("vin",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="License Plate">
            <input type="text" value={form.licensePlate} onChange={e=>set("licensePlate",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
      </div>

      {/* Purchase info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Purchase & Assignment</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Purchase Date">
            <input type="date" value={form.purchaseDate} onChange={e=>set("purchaseDate",e.target.value)} style={inp} />
          </Field>
          <Field label="Purchase Cost ($)">
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.purchaseCost} onChange={e=>set("purchaseCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Useful Life (years)">
            <input type="number" min="1" placeholder="10" value={form.usefulLife} onChange={e=>set("usefulLife",e.target.value)} style={inp} />
          </Field>
          <Field label="Home Location">
            <input type="text" placeholder="Main Shop…" value={form.homeLocation} onChange={e=>set("homeLocation",e.target.value)} style={inp} />
          </Field>
        </div>
        <Field label="Assigned Operator">
          <input type="text" placeholder="Primary operator name…" value={form.assignedOperator} onChange={e=>set("assignedOperator",e.target.value)} style={inp} />
        </Field>
      </div>

      {/* FEMA */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>FEMA Equipment Rate</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Used for disaster reimbursement claims — select the closest matching FEMA equipment type</div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
          <Field label="FEMA Equipment Type">
            <select value={form.femaType} onChange={e=>handleFemaType(e.target.value)} style={inp}>
              <option value="">Select FEMA type…</option>
              {uniqueFemaTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="FEMA Rate ($/hr)">
            <input type="number" min="0" step="0.01" value={form.femaRate} onChange={e=>set("femaRate",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        {form.femaRate > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:"#1a3a5c", background:"#e8f0fb", borderRadius:6, padding:"8px 12px" }}>
            FEMA reimbursable rate: <strong>{fmtSm(form.femaRate)}/hr</strong> — this will auto-fill when this unit is used in Cost Accounting FEMA projects
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <Field label="Notes">
          <textarea rows={3} placeholder="Additional details, attachments, special equipment notes…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#d97706" }}>Add Unit</button>
        <button onClick={() => setForm(empty)} style={btn.ghost}>Clear</button>
      </div>
    </div>
  );
}

// ── Fuel Log ──────────────────────────────────────────────────────────────────
function FuelLog({ db, dispatch }) {
  const units = db.equipment || [];
  const fuelLogs = [...(db.fuelLogs||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const [form, setForm] = useState({ unitId:"", date:"", gallons:"", pricePerGallon:"", reading:"", fuelLocation:"Main Shop", notes:"" });
  const [adding, setAdding] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f, [k]:v }));

  const gallons       = parseFloat(form.gallons)||0;
  const pricePerGal   = parseFloat(form.pricePerGallon)||0;
  const totalCost     = gallons * pricePerGal;
  const selectedUnit  = units.find(u=>u.id===parseInt(form.unitId));

  const handleSubmit = () => {
    if (!form.unitId || !form.date || !form.gallons || !form.pricePerGallon) return;
    dispatch({ type:"ADD_FUEL_LOG", payload:{ ...form, id:Date.now(), unitId:parseInt(form.unitId), gallons, pricePerGallon:pricePerGal, totalCost } });
    setForm({ unitId:"", date:"", gallons:"", pricePerGallon:"", reading:"", fuelLocation:"Main Shop", notes:"" });
    setAdding(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Fuel Log</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{fuelLogs.length} entries · All units</div>
        </div>
        <button onClick={()=>setAdding(!adding)} style={{ ...btn.primary, background:"#d97706" }}>+ Add Fuel Entry</button>
      </div>

      {adding && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>New Fuel Entry</div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Unit" required>
              <select value={form.unitId} onChange={e=>set("unitId",e.target.value)} style={inp}>
                <option value="">Select unit…</option>
                {units.filter(u=>u.status!=="disposed").map(u=>(
                  <option key={u.id} value={u.id}>{u.unitNumber} — {u.year} {u.make} {u.model}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" required>
              <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
            </Field>
            <Field label="Fuel Location">
              <input type="text" placeholder="Main Shop, Pauline…" value={form.fuelLocation} onChange={e=>set("fuelLocation",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Gallons" required>
              <input type="number" min="0" step="0.1" placeholder="0.0" value={form.gallons} onChange={e=>set("gallons",e.target.value)} style={inp} />
            </Field>
            <Field label="Price / Gallon ($)" required>
              <input type="number" min="0" step="0.001" placeholder="0.000" value={form.pricePerGallon} onChange={e=>set("pricePerGallon",e.target.value)} style={inp} />
            </Field>
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
              <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>Total Cost</div>
              <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:16, color:"#d97706" }}>{fmtSm(totalCost)}</div>
            </div>
            <Field label={selectedUnit?.trackBy==="miles"?"Odometer Reading":"Hour Meter Reading"}>
              <input type="number" min="0" step="0.1" placeholder="0" value={form.reading} onChange={e=>set("reading",e.target.value)} style={inp} />
            </Field>
            <Field label="Notes">
              <input type="text" placeholder="Notes…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleSubmit} style={{ ...btn.small, background:"#d97706" }}>Save Fuel Entry</button>
            <button onClick={()=>setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
          </div>
        </div>
      )}

      <SectionCard title={`All Fuel Entries (${fuelLogs.length})`}>
        <Table
          headers={[{ label:"Date" },{ label:"Unit" },{ label:"Gallons", right:true },{ label:"$/Gal", right:true },{ label:"Total", right:true },{ label:"Reading" },{ label:"Location" },{ label:"Notes" }]}
          rows={fuelLogs.map(f => {
            const unit = units.find(u=>u.id===f.unitId);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{f.date}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{unit?.unitNumber||"—"} <span style={{ fontWeight:400, color:"#888", fontSize:11 }}>{unit?.make} {unit?.model}</span></span>,
              <span style={{ fontFamily:"monospace" }}>{f.gallons}</span>,
              <span style={{ fontFamily:"monospace" }}>{fmtSm(f.pricePerGallon)}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(f.totalCost)}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{f.reading||"—"}</span>,
              f.fuelLocation||"—",
              <span style={{ fontSize:12, color:"#888" }}>{f.notes||"—"}</span>,
            ];
          })}
          emptyMessage="No fuel entries yet — click + Add Fuel Entry"
        />
      </SectionCard>
    </div>
  );
}

// ── PM Schedule (all units) ───────────────────────────────────────────────────
function PMSchedule({ db, dispatch }) {
  const units    = db.equipment || [];
  const pmLogs   = db.pmLogs    || [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ unitId:"", date:"", task:"", reading:"", laborCost:"", partsCost:"", technician:"", notes:"" });
  const set = (k,v) => setForm(f=>({ ...f, [k]:v }));

  // All PM tasks across all units with due status
  const allPM = [];
  units.forEach(unit => {
    (unit.pmSchedule||[]).forEach(pm => {
      const days = pm.nextDue ? daysUntil(pm.nextDue) : null;
      allPM.push({ unit, pm, days });
    });
  });
  allPM.sort((a,b) => (a.days??999) - (b.days??999));

  const handleLogService = () => {
    if (!form.unitId || !form.date || !form.task) return;
    dispatch({ type:"ADD_PM_LOG", payload:{ ...form, id:Date.now(), unitId:parseInt(form.unitId), laborCost:parseFloat(form.laborCost)||0, partsCost:parseFloat(form.partsCost)||0 } });
    setForm({ unitId:"", date:"", task:"", reading:"", laborCost:"", partsCost:"", technician:"", notes:"" });
    setAdding(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>PM Schedule — All Units</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{allPM.filter(p=>p.days!==null&&p.days<0).length} overdue · {allPM.filter(p=>p.days!==null&&p.days>=0&&p.days<=30).length} due within 30 days</div>
        </div>
        <button onClick={()=>setAdding(!adding)} style={{ ...btn.primary, background:"#d97706" }}>+ Log Service</button>
      </div>

      {adding && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Log Completed Service</div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Unit" required>
              <select value={form.unitId} onChange={e=>set("unitId",e.target.value)} style={inp}>
                <option value="">Select unit…</option>
                {units.map(u=><option key={u.id} value={u.id}>{u.unitNumber} — {u.year} {u.make} {u.model}</option>)}
              </select>
            </Field>
            <Field label="Date" required>
              <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
            </Field>
            <Field label="Reading (hrs/miles)">
              <input type="number" min="0" step="0.1" placeholder="0" value={form.reading} onChange={e=>set("reading",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Task Performed" required>
              <select value={form.task} onChange={e=>set("task",e.target.value)} style={inp}>
                <option value="">Select task…</option>
                {PM_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Technician">
              <input type="text" placeholder="Name…" value={form.technician} onChange={e=>set("technician",e.target.value)} style={inp} />
            </Field>
            <Field label="Labor Cost ($)">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.laborCost} onChange={e=>set("laborCost",e.target.value)} style={inp} />
            </Field>
            <Field label="Parts Cost ($)">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.partsCost} onChange={e=>set("partsCost",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ marginBottom:16 }}>
            <Field label="Notes">
              <input type="text" placeholder="Parts used, observations…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleLogService} style={{ ...btn.small, background:"#d97706" }}>Log Service</button>
            <button onClick={()=>setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
          </div>
        </div>
      )}

      <SectionCard title="All Scheduled PM Tasks">
        <Table
          headers={[{ label:"Unit" },{ label:"Task" },{ label:"Interval" },{ label:"Last Done" },{ label:"Next Due" },{ label:"Status" }]}
          rows={allPM.map(({ unit, pm, days }) => {
            const badge = days!==null ? dueBadge(days) : null;
            return [
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{unit.unitNumber} <span style={{ fontWeight:400, color:"#888", fontSize:11 }}>{unit.make} {unit.model}</span></span>,
              <span style={{ fontWeight:600 }}>{pm.task}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{INTERVAL_TYPES.find(t=>t.value===pm.intervalType)?.icon} {pm.intervalValue} {pm.intervalType}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{pm.lastDone||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{pm.nextDue||"—"}</span>,
              badge ? <span style={{ background:badge.bg, color:badge.color, padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{badge.label}</span> : "—",
            ];
          })}
          emptyMessage="No PM tasks scheduled — open a unit and add PM tasks from the unit detail page"
        />
      </SectionCard>
    </div>
  );
}

// ── Cost Reports ──────────────────────────────────────────────────────────────
function CostReports({ db }) {
  const units    = db.equipment  || [];
  const fuelLogs = db.fuelLogs   || [];
  const pmLogs   = db.pmLogs     || [];
  const [sortBy, setSortBy] = useState("totalCost");

  const unitCosts = units.map(unit => {
    const unitFuel  = fuelLogs.filter(f=>f.unitId===unit.id);
    const unitPM    = pmLogs.filter(p=>p.unitId===unit.id);
    const fuelCost  = unitFuel.reduce((s,f)=>s+(parseFloat(f.totalCost)||0),0);
    const maintCost = unitPM.reduce((s,p)=>s+(parseFloat(p.laborCost||0)+parseFloat(p.partsCost||0)),0);
    const totalCost = fuelCost + maintCost;
    const totalGals = unitFuel.reduce((s,f)=>s+(parseFloat(f.gallons)||0),0);
    const readings  = unitFuel.map(f=>parseFloat(f.reading)||0).filter(r=>r>0);
    const maxReading = readings.length>0 ? Math.max(...readings) : 0;
    const minReading = readings.length>0 ? Math.min(...readings) : 0;
    const span = maxReading - minReading;
    const costPerUnit = span > 0 ? totalCost / span : 0;
    return { unit, fuelCost, maintCost, totalCost, totalGals, maxReading, costPerUnit };
  }).filter(c => c.totalCost > 0);

  unitCosts.sort((a,b) => b[sortBy] - a[sortBy]);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Cost Reports</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Cost per hour / mile · Fuel vs maintenance · Lifetime cost by unit</div>
      </div>

      {/* Fleet totals */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total Fleet Fuel Cost",  value:fmt(fuelLogs.reduce((s,f)=>s+(parseFloat(f.totalCost)||0),0)),   color:"#1a3a5c" },
          { label:"Total Maintenance Cost", value:fmt(pmLogs.reduce((s,p)=>s+(parseFloat(p.laborCost||0)+parseFloat(p.partsCost||0)),0)), color:"#6b3a1a" },
          { label:"Total Fleet Cost",       value:fmt(unitCosts.reduce((s,c)=>s+c.totalCost,0)),                   color:"#1a1a1a" },
          { label:"Units with Activity",    value:unitCosts.length,                                                  color:"#d97706" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888", marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <SectionCard
        title="Cost by Unit"
        action={
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...inp, width:160, margin:0, fontSize:12 }}>
            <option value="totalCost">Sort by Total Cost</option>
            <option value="fuelCost">Sort by Fuel Cost</option>
            <option value="maintCost">Sort by Maint. Cost</option>
            <option value="costPerUnit">Sort by Cost/Hr/Mi</option>
          </select>
        }
      >
        <Table
          headers={[
            { label:"Unit" },{ label:"Year / Make / Model" },{ label:"Fuel Cost", right:true },
            { label:"Maint. Cost", right:true },{ label:"Total Cost", right:true },
            { label:"Gallons", right:true },{ label:"Cost / Hr or Mi", right:true },
          ]}
          rows={unitCosts.map(({ unit, fuelCost, maintCost, totalCost, totalGals, maxReading, costPerUnit }) => [
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#d97706" }}>{unit.unitNumber}</span>,
            <span style={{ fontWeight:600 }}>{unit.year} {unit.make} {unit.model}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmt(fuelCost)}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmt(maintCost)}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmt(totalCost)}</span>,
            <span style={{ fontFamily:"monospace" }}>{totalGals.toFixed(0)}</span>,
            costPerUnit > 0 ? <span style={{ fontFamily:"monospace", color:"#1a3a5c" }}>{fmtSm(costPerUnit)}/{unit.trackBy==="miles"?"mi":"hr"}</span> : "—",
          ])}
          emptyMessage="No cost data yet — add fuel entries and log service to see reports"
        />
      </SectionCard>
    </div>
  );
}
