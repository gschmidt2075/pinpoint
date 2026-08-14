import { useState } from "react";
import { Icon, Field, Table, KPICard, inp, btn, fmtSm, SearchSelect, DateField, titleCase } from "../../components/shared.jsx";
import { createWorkOrder, laborRateFor } from "../../data/schema.js";
import { today, fmtDate, StatusChip, STATUS_META, onHandFor, buildFIFO,
         WO_CATEGORIES, WO_PRIORITIES } from "./shared.jsx";
import { PMBadge } from "./PM.jsx";

// ── Work orders ───────────────────────────────────────────────────────────────
// A job on a machine: opened, labor and parts added, closed. Closing captures
// the meter — the only moment someone is certainly standing at the machine —
// and resets the PM schedule the job was raised against, if any.

export function UnitWorkOrders({ unit, workOrders, dispatch, onOpen }) {
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
            <DateField value={form.openedDate} onChange={v => set("openedDate", v)} />
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
              {WO_CATEGORIES.map(c=><option key={c.value} value={c.value}>{titleCase(c.label)}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={e=>set("priority",e.target.value)} style={inp}>
              {WO_PRIORITIES.map(p=><option key={p.value} value={p.value}>{titleCase(p.label)}</option>)}
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

export function WorkOrderDetail({ wo, unit, invItems, invBatches, db, dispatch, onBack }) {
  const [closing, setClosing] = useState(false);
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
            <button onClick={()=>setClosing(true)} style={{ ...btn.small, background:"#1a6b35", fontSize:11 }}>Close WO</button>
          )}
        </div>
      </div>

      {closing && (
        <CloseWorkOrder wo={wo} unit={unit} dispatch={dispatch} onDone={()=>setClosing(false)} />
      )}

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
              <DateField value={form.date} onChange={v => set("date", v)} />
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
            <Field label="Date"><DateField value={form.date} onChange={v => set("date", v)} /></Field>
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
            <Field label="Date"><DateField value={form.date} onChange={v => set("date", v)} /></Field>
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

export function WorkOrdersTab({ workOrders, units, dispatch, onOpen }) {
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

function CloseWorkOrder({ wo, unit, dispatch, onDone }) {
  const u = unit?.meterType === "miles" ? "miles" : "hours";
  const [meter, setMeter] = useState(
    wo.meterReadingClose || unit?.currentMeter || "");
  const [date, setDate]   = useState(today());

  const reading = parseFloat(meter) || 0;
  const known   = Number(unit?.currentMeter) || 0;
  const backwards = reading > 0 && reading < known;
  const sched   = (unit?.pmSchedule || []).find(sc => sc.id === wo.pmScheduleId);

  return (
    <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:8, padding:18, marginBottom:20 }}>
      <div style={{ fontWeight:700, fontSize:14, color:"#1a5a3a", marginBottom:4 }}>Close this work order</div>
      <div style={{ fontSize:12, color:"#4a7a5a", marginBottom:14, lineHeight:1.6 }}>
        Read the {u} off the machine now. This is what the next service is measured from
        {sched ? <> — it resets <strong>{sched.service}</strong></> : null}.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr auto auto", gap:12, alignItems:"end" }}>
        <Field label="Date closed">
          <DateField value={date} onChange={setDate} />
        </Field>
        <Field label={`Meter reading (${u})`} required>
          <input type="number" min="0" step="any" value={meter}
            onChange={e=>setMeter(e.target.value)}
            style={{ ...inp, margin:0, fontFamily:"monospace",
                     borderColor: backwards ? "#c0392b" : undefined }} />
        </Field>
        <button
          onClick={()=>{
            dispatch({ type:"CLOSE_WORK_ORDER",
              payload:{ id:wo.id, closedDate:date, meterReadingClose:reading } });
            onDone();
          }}
          disabled={!reading}
          style={{ ...btn.primary, background:"#1a6b35", opacity: reading?1:0.45,
                   cursor: reading?"pointer":"not-allowed" }}>
          Close Work Order
        </button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>

      {backwards && (
        <div style={{ marginTop:10, fontSize:12, color:"#8c1b18" }}>
          That is below the {known.toLocaleString()} {u} already recorded. Meters only go forward, so
          this will be kept at {known.toLocaleString()} — check the reading before closing.
        </div>
      )}
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
