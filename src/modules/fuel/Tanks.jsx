import { useState, useMemo } from "react";
import { Field, SectionCard, Table, inp, btn, fmtSm, DateField, SearchSelect, titleCase } from "../../components/shared.jsx";
import { today, fmtDate, tankUnitCost, reconciliationStatus } from "./shared.js";
import { CLAIM_CYCLES } from "../FundAccounting.jsx";

// Tanks: what is in them, what went in, what came out, and whether the
// paperwork agrees with the dipstick.

// ── Deliveries waiting on their invoice ───────────────────────────────────────
//
// The claim went on at the bid price when the load arrived. This is where the
// paper catches up — and where the bid gets checked. If the invoice does not
// equal gallons times the price that was bid, either the gallons or the rate is
// wrong, and that is worth knowing before the claim is paid.
function DeliveryInvoices({ tankTx, dispatch }) {
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({ invoicedAmount:"", invoiceNumber:"", date: today() });

  const waiting = (tankTx || [])
    .filter(t => t.type === "delivery" && t.expenditureId && t.invoiceStatus === "expected")
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));

  if (!waiting.length) return null;

  const open = waiting.find(t => t.id === openId);
  const expected = open ? (Number(open.gallons)||0) * (Number(open.unitCost)||0) : 0;
  const actual   = parseFloat(form.invoicedAmount) || 0;
  const diff     = actual ? actual - expected : 0;
  const differs  = actual > 0 && Math.abs(diff) > 0.05;

  return (
    <div style={{ background:"#fff", border:"2px solid #c8d8ec", borderRadius:8, padding:16, marginBottom:18 }}>
      <div style={{ fontSize:14, fontWeight:700, color:"#1a3a5c", marginBottom:3 }}>
        {waiting.length} deliver{waiting.length===1?"y":"ies"} awaiting an invoice
      </div>
      <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
        Each is already on a claim at the bid price. Reconciling confirms it, or corrects it.
      </div>

      <Table
        headers={[{label:"Date"},{label:"Tank"},{label:"Vendor"},{label:"Gallons"},{label:"Bid $/gal"},{label:"On the Claim"},{label:""}]}
        rows={waiting.map(t => [
          <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(t.date)}</span>,
          t.tankName || "—",
          t.vendorName || "—",
          <span style={{ fontFamily:"monospace" }}>{Number(t.gallons||0).toLocaleString()}</span>,
          <span style={{ fontFamily:"monospace" }}>{fmtSm(t.unitCost||0)}</span>,
          <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm((t.gallons||0)*(t.unitCost||0))}</span>,
          <button onClick={()=>{ setOpenId(t.id); setForm({ invoicedAmount:"", invoiceNumber:t.invoiceNumber||"", date: today() }); }}
            style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>Invoice arrived</button>,
        ])}
      />

      {open && (
        <div style={{ marginTop:14, background:"#f7f7f5", border:"1px solid #e4e4e0", borderRadius:6, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>
            {open.tankName} · {Number(open.gallons||0).toLocaleString()} gal at {fmtSm(open.unitCost||0)}/gal
            — bid says <strong>{fmtSm(expected)}</strong>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.2fr auto auto", gap:12, alignItems:"end" }}>
            <Field label="Invoice #">
              <input type="text" value={form.invoiceNumber} onChange={e=>setForm(f=>({...f,invoiceNumber:e.target.value}))}
                style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Invoice date">
              <DateField value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} />
            </Field>
            <Field label="Invoice total" required>
              <input type="number" min="0" step="0.01" value={form.invoicedAmount}
                onChange={e=>setForm(f=>({...f,invoicedAmount:e.target.value}))}
                style={{ ...inp, margin:0, fontFamily:"monospace", borderColor: differs ? "#d97706" : undefined }} />
            </Field>
            <button
              onClick={()=>{ dispatch({ type:"RECONCILE_FUEL_DELIVERY", payload:{
                txId: open.id, invoicedAmount: actual, invoiceNumber: form.invoiceNumber,
                date: form.date, accept: true } }); setOpenId(null); }}
              disabled={!actual}
              style={{ ...btn.primary, background:"#1a6b35", opacity: actual?1:0.45, cursor: actual?"pointer":"not-allowed" }}>
              {differs ? "Accept invoice" : "Confirm"}
            </button>
            <button onClick={()=>setOpenId(null)} style={btn.ghost}>Cancel</button>
          </div>

          {differs && (
            <div style={{ marginTop:10, background:"#fef8e8", border:"1px solid #f0d080", borderRadius:6, padding:"10px 12px", fontSize:12, color:"#7a4f00", lineHeight:1.6 }}>
              <strong>The invoice is {fmtSm(Math.abs(diff))} {diff > 0 ? "more" : "less"} than the bid.</strong>{" "}
              {Number(open.gallons||0).toLocaleString()} gal × {fmtSm(open.unitCost||0)} = {fmtSm(expected)},
              but the invoice says {fmtSm(actual)}. Either the gallons delivered or the price charged is not
              what was agreed. Accepting updates the claim to the invoice; check it first.
              <div style={{ marginTop:8 }}>
                <button
                  onClick={()=>{ dispatch({ type:"RECONCILE_FUEL_DELIVERY", payload:{
                    txId: open.id, invoicedAmount: actual, invoiceNumber: form.invoiceNumber,
                    date: form.date, accept: false } }); setOpenId(null); }}
                  style={{ ...btn.ghost, fontSize:11, padding:"5px 12px", borderColor:"#c0392b", color:"#c0392b" }}>
                  Flag as disputed — leave the claim at the bid price
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TanksTab({ tanks, tankTx, dispensing, vendors = [], fuelGLCode = "302.09", dispatch }) {
  const [showNew, setShowNew] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState(null);
  const [txForm, setTxForm] = useState({ type:"delivery", date: today(), tankId:"", sourceTankId:"",
    gallons:"", vendorId:"", vendorName:"", invoiceNumber:"", unitCost:"", dipReading:"", notes:"",
    deliveryTicket:"", bidReference:"", claimCycleId:"", glCode: fuelGLCode });
  const setTx = (k,v) => setTxForm(f=>({...f,[k]:v}));

  // Everything in and out of every tank. Deliveries, transfers and readings —
  // the movement record behind the levels.
  const exportTankTx = () => {
    const esc = v => { const t = v==null?"":String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
    const rows = [
      ["Date","Type","Tank","Gallons","From Tank","Vendor","Delivery Ticket","Bid Ref",
       "Invoice #","$/gal","Amount","Invoice Status","Invoiced","Dip/Monitor Reads","Variance","Notes"],
      ...[...(tankTx||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(t=>[
        t.date, t.type, t.tankName, t.gallons, t.sourceTankName, t.vendorName,
        t.deliveryTicket, t.bidReference, t.invoiceNumber, t.unitCost, t.deliveryCost,
        t.invoiceStatus, t.invoicedAmount, t.dipReading, t.variance, t.notes,
      ]),
    ];
    const blob = new Blob([rows.map(r=>r.map(esc).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "tank-transactions.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const [showTxForm, setShowTxForm] = useState(false);

  const [newTank, setNewTank] = useState({ name:"", fuelType:"diesel", tankType:"underground", capacityGallons:"", location:"", notes:"" });
  const setNT = (k,v) => setNewTank(f=>({...f,[k]:v}));

  const selectedTank = tanks.find(t=>t.id===selectedTankId);

  const needingReading = useMemo(
    () => tanks.filter(t => t.status !== "out_of_service"
                         && reconciliationStatus(t, tankTx).state !== "ok"),
    [tanks, tankTx]);

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

  // Only cycles from here on — a delivery cannot go on a claim already past.
  const claimCycleOptions = useMemo(() => {
    const t = today();
    return CLAIM_CYCLES.filter(c => c.date >= t).slice(0, 8);
  }, []);
  const deliveryTotal = (parseFloat(txForm.gallons)||0) * (parseFloat(txForm.unitCost)||0);

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
    // A delivery raises its own claim. The price per gallon is known because
    // fuel is bid per load, so the claim is complete rather than a placeholder
    // waiting on the invoice.
    const txId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const isDelivery = txForm.type === "delivery";
    const expenditure = (isDelivery && deliveryCost > 0 && txForm.claimCycleId) ? {
      id: `${txId}-exp`,
      date: txForm.date,
      vendor: txForm.vendorName,
      vendorId: txForm.vendorId || null,
      type: "invoice",
      reference: txForm.invoiceNumber || txForm.deliveryTicket,
      claimCycleId: txForm.claimCycleId,
      claimCycle: txForm.claimCycleId,
      lines: [{
        id: `${txId}-line`,
        code: txForm.glCode,
        description: `${gals.toLocaleString()} gal ${tank?.fuelType||"fuel"} — ${tank?.name||""}`.trim(),
        amount: deliveryCost,
        notes: txForm.bidReference ? `Bid ${txForm.bidReference}` : "",
      }],
      totalAmount: deliveryCost,
      status: "entered",
      notes: `Fuel delivery — ticket ${txForm.deliveryTicket || "—"}`,
      sourceTankTransactionId: txId,
      createdAt: new Date().toISOString(),
    } : null;

    dispatch({ type:"ADD_TANK_TRANSACTION", payload:{
      id: txId,
      type:txForm.type, date:txForm.date, tankId:txForm.tankId, tankName:tank?.name||"",
      gallons: (txForm.type==="dip_reading"||txForm.type==="monitor_reading") ? 0 : gals,
      vendorName:txForm.vendorName, vendorId: txForm.vendorId || null,
      invoiceNumber:txForm.invoiceNumber,
      deliveryTicket: txForm.deliveryTicket, bidReference: txForm.bidReference,
      expenditureId: expenditure?.id || null,
      // An invoice number typed at delivery means the paper came with the
      // truck — there is nothing left to chase. Only a blank one is expected.
      invoiceStatus: isDelivery
        ? (txForm.invoiceNumber.trim() ? "reconciled" : "expected")
        : "",
      invoicedAmount: (isDelivery && txForm.invoiceNumber.trim()) ? deliveryCost : 0,
      reconciledDate: (isDelivery && txForm.invoiceNumber.trim()) ? txForm.date : "",
      expenditure,
      deliveryCost, unitCost:perGal,
      sourceTankId: isFill ? txForm.sourceTankId : null,
      sourceTankName: isFill ? (srcTank?.name||"") : "",
      destinationTankId: isFill ? txForm.tankId : null,
      dipReading:parseFloat(txForm.dipReading)||0,
      variance: (txForm.type==="dip_reading"||txForm.type==="monitor_reading") ? (parseFloat(txForm.dipReading)||0) - ((tank?.currentLevel)||0) : 0,
      notes:txForm.notes, createdAt:new Date().toISOString(),
    }});
    setTxForm({ type:"delivery", date: today(), tankId:"", sourceTankId:"", gallons:"",
      vendorId:"", vendorName:"", invoiceNumber:"", unitCost:"", dipReading:"", notes:"",
      deliveryTicket:"", bidReference:"", claimCycleId:"", glCode: fuelGLCode });
    setShowTxForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Fuel Tanks</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={exportTankTx} style={{ ...btn.secondary, fontSize:12 }}>Export CSV</button>
          <button onClick={()=>setShowTxForm(s=>!s)} style={{ ...btn.secondary, fontSize:12 }}>{showTxForm?"Cancel":"+ Delivery / Reading"}</button>
          <button onClick={()=>setShowNew(s=>!s)} style={btn.primary}>{showNew?"Cancel":"+ Add Tank"}</button>
        </div>
      </div>

      <DeliveryInvoices tankTx={tankTx} dispatch={dispatch} />

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
            <div style={{ background:"#fff", border:"1px solid #e4e4e0", borderRadius:6, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:10 }}>
                The Load, and the Claim It Raises
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Vendor" required>
                  {vendors.length > 0 ? (
                    <SearchSelect
                      items={vendors}
                      value={txForm.vendorId}
                      onChange={id=>{
                        const v = vendors.find(x=>x.id===id);
                        setTx("vendorId", id); setTx("vendorName", v?.name || "");
                      }}
                      placeholder="Type a vendor name…"
                      getLabel={v=>v.name} getSearch={v=>`${v.name} ${v.vendorCode||""}`}
                    />
                  ) : (
                    <input type="text" value={txForm.vendorName} onChange={e=>setTx("vendorName",e.target.value)} style={{ ...inp, margin:0 }} />
                  )}
                </Field>
                <Field label="Delivery Ticket #">
                  <input type="text" value={txForm.deliveryTicket} onChange={e=>setTx("deliveryTicket",e.target.value)}
                    placeholder="From the driver" style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Bid Reference">
                  <input type="text" value={txForm.bidReference} onChange={e=>setTx("bidReference",e.target.value)}
                    placeholder="Which bid" style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Bid Price ($/gal)" required>
                  <input type="number" min="0" step="0.001" value={txForm.unitCost} onChange={e=>setTx("unitCost",e.target.value)}
                    style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Claim Amount">
                  <div style={{ ...inp, margin:0, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:"#1a5a3a" }}>
                    {deliveryTotal ? fmtSm(deliveryTotal) : "—"}
                  </div>
                </Field>
                <Field label="Account Code">
                  <input type="text" value={txForm.glCode} onChange={e=>setTx("glCode",e.target.value)}
                    style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Claim Cycle" required>
                  <select value={txForm.claimCycleId} onChange={e=>setTx("claimCycleId",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Select…</option>
                    {claimCycleOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Invoice #">
                <input type="text" value={txForm.invoiceNumber} onChange={e=>setTx("invoiceNumber",e.target.value)}
                  placeholder="Leave blank if the invoice hasn't come yet"
                  style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                <div style={{ fontSize:11, color:"#888", marginTop:4 }}>
                  {txForm.invoiceNumber.trim()
                    ? "Invoice in hand — this delivery is done, nothing to reconcile later."
                    : "Blank means it will show under deliveries awaiting an invoice."}
                </div>
              </Field>

              {deliveryTotal > 0 && txForm.claimCycleId ? (
                <div style={{ marginTop:10, background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:6, padding:"9px 12px", fontSize:12, color:"#1a5a3a", lineHeight:1.6 }}>
                  Saving this puts <strong>{fmtSm(deliveryTotal)}</strong> on the{" "}
                  <strong>{claimCycleOptions.find(c=>c.id===txForm.claimCycleId)?.label}</strong> claim cycle
                  against <strong>{txForm.glCode}</strong>. No need to key the invoice again in Fund Accounting —
                  when it arrives, reconcile it here and the claim follows.
                </div>
              ) : (
                <div style={{ marginTop:10, background:"#fef8e8", border:"1px solid #f0d080", borderRadius:6, padding:"9px 12px", fontSize:12, color:"#7a4f00" }}>
                  A price per gallon and a claim cycle are needed before this can raise a claim. Without them
                  the fuel is recorded but the money isn't, and someone has to remember to key it separately.
                </div>
              )}
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

      {needingReading.length > 0 && (
        <div style={{ background:"#fef8e8", border:"1px solid #f0d080", borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:"#7a4f00" }}>
          <strong>{needingReading.length} of {tanks.length} tanks need a reading.</strong>{" "}
          Monitored tanks are balanced against the logs daily; the rest are dipped once a year.
          Each is marked on its card below.
        </div>
      )}

      {/* Tank cards — level and reconciliation together, one card per tank */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14, marginBottom:24 }}>
        {tanks.length===0 && <div style={{ gridColumn:"1/-1", padding:48, textAlign:"center", color:"#aaa", border:"1px dashed #ccc", borderRadius:8 }}>No tanks configured yet</div>}
        {tanks.map(t => {
          const pct = t.capacityGallons > 0 ? Math.min(100, Math.round((t.currentLevel||0)/t.capacityGallons*100)) : 0;
          const barColor = pct < 20 ? "#c0392b" : pct < 40 ? "#d97706" : "#1a6b35";
          const isOpen = selectedTankId === t.id;
          const rec = reconciliationStatus(t, tankTx);
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
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{t.location||"—"} · {titleCase(t.fuelType)} · {titleCase(t.tankType)}</div>
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
                <div style={{ fontSize:11, color:"#c0392b", fontWeight:600, marginTop:6 }}>Low — order fuel</div>
              )}

              {/* Reconciliation lives on the tank, not in a separate table
                  listing the same eight tanks over again. */}
              <div style={{ marginTop:10, paddingTop:9, borderTop:"1px solid #f0f0ee",
                            display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:11, color:"#888", lineHeight:1.5 }}>
                  <div>{rec.cadence === "daily" ? "Monitored · read daily" : "Dipped · once a year"}</div>
                  <div style={{ color: rec.state === "overdue" ? "#c0392b" : "#aaa" }}>
                    {rec.last
                      ? <>Last {fmtDate(rec.last.date)}
                          {rec.variance !== null && rec.variance !== 0 &&
                            <span style={{ color:"#c0392b", fontWeight:600 }}>
                              {" "}· {rec.variance > 0 ? "+" : ""}{rec.variance.toFixed(0)} gal out
                            </span>}
                        </>
                      : "Never reconciled"}
                  </div>
                </div>
                {rec.state !== "ok" && (
                  <span style={{
                    background: rec.state === "overdue" ? "#fdecea" : "#f4f4f2",
                    color:      rec.state === "overdue" ? "#8c1b18" : "#888",
                    border:`1px solid ${rec.state === "overdue" ? "#f5c6c6" : "#ddd"}`,
                    borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700, whiteSpace:"nowrap",
                  }}>
                    {rec.state === "overdue" ? "Reading overdue" : "Never read"}
                  </span>
                )}
              </div>
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
            <span style={{fontSize:11,background:"#f0f0ee",padding:"2px 7px",borderRadius:4,fontWeight:600}}>{titleCase(tx.type)}</span>,
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
