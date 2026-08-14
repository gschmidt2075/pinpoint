import { useState } from "react";
import { Icon, Field, SectionCard, KPICard, inp, btn, fmt, fmtSm, DateField, titleCase } from "../../components/shared.jsx";
import { createEquipmentUnit, createEquipmentPart, createEquipmentFluid, createEquipmentTire, EQUIPMENT_PART_KINDS, EQUIPMENT_FLUID_KINDS, TIRE_POSITIONS, FUEL_TYPES } from "../../data/schema.js";
import { today, fmtDate, StatusChip, lifetimeMeter, operatingCost, EQUIPMENT_TYPES } from "./shared.jsx";
import { FEMA_EQUIPMENT_RATES } from "../../data/femaRates.js";
import { PMScheduleEditor, PMBadge, pmStatus, pmDueList, UnitPM } from "./PM.jsx";
import { UnitWorkOrders } from "./WorkOrders.jsx";
import { UnitFuelLog } from "./Fuel.jsx";

// ── The fleet ─────────────────────────────────────────────────────────────────
// The machines themselves — what they are, what they take, what they cost. The
// spec lists (filters, fluids, tires) are lists rather than fixed fields because
// a grader has three hydraulic filters and a pickup has one oil filter.

export function FleetTab({ units, workOrders, dispensing, dispatch, onSelect }) {
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

export function UnitDetail({ unit, workOrders, pmLogs, dispensing, invItems, invBatches, dispatch, onBack, onOpenWO }) {
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
              {EQUIPMENT_TYPES.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
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
          <Field label="Date Acquired"><DateField value={form.dateAcquired} onChange={v => set("dateAcquired", v)} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginTop:14 }}>
          <Field label="Fuel Type">
            <select value={form.fuelType||"diesel"} onChange={e=>set("fuelType",e.target.value)} style={inp}>
              {FUEL_TYPES.map(f=><option key={f.value} value={f.value}>{titleCase(f.label)}</option>)}
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

// ── Closing a work order ──────────────────────────────────────────────────────
//
// It asks for the meter reading, because that is the only moment the shop is
// certainly standing at the machine. Every PM interval is measured against this
// number, and stamping whatever the record last happened to say is only right
// if somebody updated it that day — which is exactly the assumption that lets
// service intervals drift.

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
                    ? <option key={o} value={o}>{titleCase(o)}</option>
                    : <option key={o.value} value={o.value}>{titleCase(o.label)}</option>)}
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
