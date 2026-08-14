import { useState, useMemo } from "react";
import { Field, SectionCard, Table, inp, btn, fmtSm, DateField } from "../../components/shared.jsx";
import { today, fmtDate, tankUnitCost, reconciliationStatus } from "./shared.js";

// Tanks: what is in them, what went in, what came out, and whether the
// paperwork agrees with the dipstick.

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

export function TanksTab({ tanks, tankTx, dispensing, dispatch }) {
  const [showNew, setShowNew] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState(null);
  const [txForm, setTxForm] = useState({ type:"delivery", date: today(), tankId:"", sourceTankId:"", gallons:"", vendorName:"", invoiceNumber:"", unitCost:"", dipReading:"", notes:"" });
  const setTx = (k,v) => setTxForm(f=>({...f,[k]:v}));

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
  const fillCost = isFill ? tankUnitCost(txForm.sourceTankId, tankTx) : 0;
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
