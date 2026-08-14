import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmtSm, DateField, titleCase } from "../../components/shared.jsx";
import { today, fmtDate } from "./shared.jsx";

// ── Fuel and tanks ────────────────────────────────────────────────────────────
// Its own operation, and barely about equipment at all: deliveries into tanks,
// transfers between them, dispensing out, dip and monitor readings, and monthly
// billing to the five other county departments that fuel at the shop. It meets
// the fleet only where a unit number appears on a fuelling.
//
// The one rule that governs all of it: fuel is never created except by a
// delivery. A transfer moves gallons and carries their cost across; it does not
// conjure them.

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

export function FuelLogTab({ dispensing, units, tanks, tankTx, departments, dispatch }) {
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
                <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>

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
                        {departments.map(d=><option key={d} value={d}>{titleCase(d)}</option>)}
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

export function TanksTab({ tanks, tankTx, dispensing, dispatch }) {
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
            <Field label="Date"><DateField value={txForm.date} onChange={v => setTx("date", v)} /></Field>
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

export function UnitFuelLog({ dispensing }) {
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
