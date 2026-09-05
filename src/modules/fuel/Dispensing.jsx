import { useState, useMemo } from "react";
import { Field, Table, KPICard, inp, btn, fmtSm, DateField, titleCase } from "../../components/shared.jsx";
import { useUnsavedForm } from "../../components/unsaved.jsx";
import { today, fmtDate } from "./shared.js";
import { costFuel, quoteFuel } from "../../data/schema.js";

// The pump log. Every fuelling: which machine or which department, how much,
// from which tank, and the meter reading — which is the record every PM
// interval in the system is measured against.

export function FuelLogTab({ dispensing, units, tanks, tankTx, departments, employees = [], dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const EMPTY = {
    date: today(), consumer:"county_equipment",
    equipmentId:"", meterReading:"",
    departmentName:"", outsideVehicle:"", outsideOdometer:"",
    fuelType:"diesel", gallons:"", pumpedBy:"", taxClass:"",
    sourceTankId:"", notes:"",
  };
  const [form, setForm] = useState(EMPTY);
  useUnsavedForm(form, "this fuel log");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Every fuelling, as a spreadsheet. Wanted for tank monitoring, and for any
  // department that queries what it has been billed.
  const exportLog = () => {
    const esc = v => { const t = v==null?"":String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
    const rows = [
      ["Date","Consumer","Unit / Vehicle","Department","Meter","Fuel","Gallons","Tank",
       "Tax Class","$/gal","Total","Pumped By","Billed","Paid","Notes"],
      ...[...dispensing].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(e=>[
        e.date, e.consumer, e.unitNumber || e.outsideVehicle, e.departmentName,
        e.meterReading || e.outsideOdometer, e.fuelType, e.gallons, e.sourceTankName,
        e.taxClass, e.unitCost, e.totalCost, e.pumpedBy, e.billedDate, e.paidDate, e.notes,
      ]),
    ];
    const blob = new Blob([rows.map(r=>r.map(esc).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "fuel-dispensing-log.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // DEF used to be logged on this screen. It is not any more — Greg: "They are
  // usually not used when they fuel their machines so I don't want it under the
  // Log Fuel option." It has its own tab, which also covers receiving jugs and
  // carrying them out to a shed, which is the step that had no home before.
  const isOutside     = form.consumer === "other_department";
  const selectedUnit  = units.find(u=>u.id===form.equipmentId);

  // Road use is a property of the MACHINE, not a choice at the pump. Greg:
  // "Yes on the machine, that would take away having to select the difference
  // when you log fuel and would make it easier."
  //
  // The field on the form is an override for the odd case. Left alone — which
  // is what happens at five in the afternoon — it follows the unit.
  const unitTaxClass = selectedUnit?.taxClass || "off_road";
  const taxClass     = form.taxClass || unitTaxClass;
  const taxOverridden = !!form.taxClass && form.taxClass !== unitTaxClass;
  const selectedTank  = tanks.find(t=>t.id===form.sourceTankId);

  // Only tanks that hold the fuel being pumped. Offering the diesel tank when
  // somebody has said unleaded is how the wrong tank gets drawn down and the
  // department gets billed at the wrong price.
  const usableTanks = tanks
    .filter(t => t.status !== "out_of_service")
    .filter(t => !form.fuelType || (t.fuelType || "diesel") === form.fuelType);

  // Switching fuel type clears a tank that no longer holds it, rather than
  // leaving a stale selection that looks deliberate.
  const setFuelType = (v) => {
    setForm(f => {
      const tank = tanks.find(t => t.id === f.sourceTankId);
      const keep = tank && (tank.fuelType || "diesel") === v;
      return { ...f, fuelType: v, sourceTankId: keep ? f.sourceTankId : "" };
    });
  };

  // Who is at the pump. A typed name spells itself differently every time and
  // cannot be counted; the list is the people already on the payroll.
  const crew = [...employees]
    .filter(e => e.active !== false)
    .sort((a, b) => (a.lastName || a.name || "").localeCompare(b.lastName || b.name || ""));

  // Fuel is FIFO. What this fuelling costs is what the OLDEST gallons in the
  // tank cost, which is not the price of the last load and can be a blend of
  // two. The quote is what it would cost if it were saved now; nothing is taken
  // out of the tank until it is.
  const costing   = useMemo(() => costFuel(tankTx, dispensing, tanks), [tankTx, dispensing, tanks]);
  const gallons   = parseFloat(form.gallons) || 0;
  const quote     = form.sourceTankId ? quoteFuel(costing, form.sourceTankId, gallons)
                                      : { unitCost:0, totalCost:0, lines:[], estimated:false };
  const unitCost  = quote.unitCost;
  const totalCost = quote.totalCost;

  const canSave = Boolean(form.date && gallons > 0 &&
    (isOutside ? form.departmentName : form.equipmentId));

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
      // Gasoline is bought taxed at the pump, so the dyed/clear question does
      // not arise for it and recording an answer would only be a wrong number
      // somebody could total.
      taxClass: isDiesel ? taxClass : "not_applicable",
      unitCost, totalCost, costEstimated: quote.estimated,
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
  // Gasoline is always on-road; the exemption is a dyed-diesel matter.
  const isDiesel = (tanks.find(t => t.id === form.sourceTankId)?.fuelType || form.fuelType) === "diesel";

  // Dyed diesel only. On-road gallons are what the quarterly fuel tax is
  // calculated on, so this is a number that has to be right rather than
  // indicative — gasoline in it would inflate the return.
  const dieselOnly = dispensing.filter(f => f.fuelType === "diesel");
  const offRoadGal = dieselOnly.filter(f=>f.taxClass==="off_road").reduce((s,f)=>s+(f.gallons||0),0);
  const onRoadGal  = dieselOnly.filter(f=>f.taxClass==="on_road").reduce((s,f)=>s+(f.gallons||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Dispensing Log</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
            Every fuelling — county machines and other departments alike. The meter reading
            taken here is what every PM interval is measured against.
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={exportLog} style={btn.secondary}>Export CSV</button>
          <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Log Fuel"}</button>
        </div>
      </div>

      {(
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
                    <select value={form.fuelType} onChange={e=>setFuelType(e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="diesel">Diesel</option>
                      <option value="unleaded">Unleaded</option>
                    </select>
                  )}
                </Field>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                {isOutside && (
                  <Field label="Fuel Type">
                    <select value={form.fuelType} onChange={e=>setFuelType(e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="unleaded">Unleaded</option>
                      <option value="diesel">Diesel</option>
                    </select>
                  </Field>
                )}
                <Field label="Gallons" required><input type="number" min="0" step="0.1" value={form.gallons} onChange={e=>set("gallons",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
                <Field label="Tank">
                  <select value={form.sourceTankId} onChange={e=>set("sourceTankId",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Not specified</option>
                    {usableTanks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {usableTanks.length === 0 && (
                    <div style={{ fontSize:11, color:"#c0392b", marginTop:4 }}>
                      No tank holds {form.fuelType}.
                    </div>
                  )}
                </Field>
                <Field label="Pumped By">
                  {crew.length > 0 ? (
                    <select value={form.pumpedBy} onChange={e=>set("pumpedBy",e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="">Who pumped it?…</option>
                      {crew.map(e=>{
                        const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || e.name;
                        return <option key={e.id} value={name}>{name}</option>;
                      })}
                    </select>
                  ) : (
                    <input type="text" value={form.pumpedBy} onChange={e=>set("pumpedBy",e.target.value)}
                           style={{ ...inp, margin:0 }} placeholder="Add employees to get a list" />
                  )}
                </Field>
                {/* Only diesel carries the dyed/clear distinction that road tax
                    turns on. Asking it for gasoline is noise on every entry. */}
                {isDiesel ? (
                  <Field label="Road Use">
                    <select value={taxClass} onChange={e=>set("taxClass",e.target.value)} style={{ ...inp, margin:0 }}>
                      <option value="off_road">Off-road — no tax</option>
                      <option value="on_road">On-road — tax owed</option>
                    </select>
                    <div style={{ fontSize:10.5, marginTop:3, color: taxOverridden ? "#a05a00" : "#aaa" }}>
                      {!selectedUnit ? "Set on the machine"
                        : taxOverridden ? `Overriding ${selectedUnit.unitNumber} — normally ${unitTaxClass === "on_road" ? "on-road" : "off-road"}`
                        : `From unit ${selectedUnit.unitNumber}`}
                    </div>
                  </Field>
                ) : (
                  <Field label="Road Use">
                    <div style={{ ...inp, margin:0, background:"#f7f7f5", color:"#888" }}>Taxed at purchase</div>
                  </Field>
                )}
                <Field label="Cost">
                  <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color: totalCost ? "#1a3a5c" : "#bbb" }}>
                    {totalCost ? fmtSm(totalCost) : "—"}
                  </div>
                  {unitCost > 0 && (
                    <div style={{ fontSize:10.5, color:"#888", marginTop:3, fontFamily:"monospace" }}>
                      ${unitCost.toFixed(4)}/gal
                      {quote.lines.length > 1 && " · blended"}
                    </div>
                  )}
                </Field>
              </div>

              {form.sourceTankId && !unitCost && (
                <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:5, padding:"8px 11px", marginBottom:12, fontSize:11, color:"#7a4f00" }}>
                  No delivery cost recorded for {selectedTank?.name} yet — log a delivery on the Tanks tab so fuel can be costed and billed.
                </div>
              )}

              {form.sourceTankId && unitCost > 0 && quote.estimated && (
                <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:5, padding:"8px 11px", marginBottom:12, fontSize:11, color:"#7a4f00" }}>
                  This takes {quote.shortGallons.toLocaleString(undefined,{maximumFractionDigits:0})} gallons
                  more than {selectedTank?.name} is recorded as holding, so part of the cost is
                  estimated at the last price paid. It will still save — the record says it was estimated.
                </div>
              )}

              {quote.lines.length > 1 && !quote.estimated && (
                <div style={{ background:"#f4f7fa", border:"1px solid #dbe4ec", borderRadius:5, padding:"8px 11px", marginBottom:12, fontSize:11, color:"#40607d" }}>
                  This draws from {quote.lines.length} deliveries —{" "}
                  {quote.lines.map((l,i) => (
                    <span key={i}>{i ? " and " : ""}{l.gallons.toLocaleString(undefined,{maximumFractionDigits:1})} gal at ${l.unitCost.toFixed(4)}</span>
                  ))}. It is charged as one price a gallon.
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
