import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm } from "../components/shared.jsx";
import { createLaborEntry, createEquipmentEntry, createMaterialEntry, createContractorEntry, createEngineeringEntry, uid, today } from "../data/schema.js";
import { FEMA_EQUIPMENT_RATES } from "./Equipment.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────
const FEMA_OVH = 1.157; // 15.7% overhead multiplier (labor force account)

const ENG_PHASES = ["design","inspection","survey","construction_mgmt","other"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// Calculate labor entry total (standard)
function laborTotal(e) {
  const base = (e.straightTimeHours||0)*(e.straightTimeRate||0) + (e.overtimeHours||0)*(e.overtimeRate||0);
  const fringe = (e.straightTimeHours||0)*(e.straightTimeRate||0)*(e.fringeRate||0)/100;
  return base + fringe;
}

// Calculate labor FEMA total (overhead replaces fringe)
function laborFEMA(e) {
  const base = (e.straightTimeHours||0)*(e.straightTimeRate||0) + (e.overtimeHours||0)*(e.overtimeRate||0);
  return base * FEMA_OVH;
}

// FIFO batch lookup for material entries
function buildFIFO(itemId, qty, batches) {
  const open = [...batches]
    .filter(b => b.itemId === itemId && b.status === "open")
    .sort((a,b) => a.receiptDate.localeCompare(b.receiptDate));
  let remaining = qty;
  const lines = [];
  let totalCost = 0;
  for (const b of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.quantityRemaining||0);
    if (take <= 0) continue;
    lines.push({
      id: uid(), batchId: b.id,
      batchRef: `${b.receiptDate} — ${b.vendorName||""}`,
      itemId: b.itemId, itemName: b.itemName||"",
      quantity: take, unitOfMeasure: b.unitOfMeasure||"",
      unitCost: b.unitCost||0, totalCost: take*(b.unitCost||0),
    });
    totalCost += take*(b.unitCost||0);
    remaining -= take;
  }
  return { lines, totalCost, canFulfill: remaining<=0, shortfall: Math.max(0,remaining) };
}

// Get project cost totals
function projectTotals(p) {
  const sum = arr => (arr||[]).reduce((s,e)=>s+(e.totalCost||e.amount||0),0);
  const labor    = sum(p.laborEntries);
  const equip    = sum(p.equipmentEntries);
  const material = sum(p.materialEntries);
  const contract = (p.contractorEntries||[]).reduce((s,e)=>s+(e.amount||0),0);
  const eng      = (p.engineeringEntries||[]).reduce((s,e)=>s+(e.amount||0),0);
  return { labor, equip, material, contract, eng, total: labor+equip+material+contract+eng };
}

// Status chip
function StatusChip({ status }) {
  const cfg = {
    active:    { color:"#1a6b35", bg:"#e6f4ec" },
    pending:   { color:"#d97706", bg:"#fef3cd" },
    planning:  { color:"#888",    bg:"#f0f0ee" },
    complete:  { color:"#1a3a5c", bg:"#e6edf5" },
    on_hold:   { color:"#c0392b", bg:"#fdecea" },
  };
  const c = cfg[status]||{ color:"#888", bg:"#f0f0ee" };
  return <span style={{ background:c.bg, color:c.color, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{status?.replace("_"," ")||"—"}</span>;
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function CostAccounting({ db, dispatch }) {
  const [tab, setTab] = useState("enter");

  const TABS = [
    { id:"enter",   label:"Enter Costs",   icon:"circle-plus" },
    { id:"project", label:"By Project",    icon:"folder" },
    { id:"asset",   label:"By Asset",      icon:"building-arch" },
    { id:"fema",    label:"FEMA Rates",    icon:"table" },
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

      {tab==="enter"   && <EnterCostsTab   db={db} dispatch={dispatch} />}
      {tab==="project" && <ByProjectTab    db={db} />}
      {tab==="asset"   && <ByAssetTab      db={db} />}
      {tab==="fema"    && <FEMARatesTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTER COSTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Cost targets ──────────────────────────────────────────────────────────────
// Costs can land on a project OR a work order. A work order stays a work order —
// project numbers (C1-###, M-YYYY-##) mean something to the Board and the state
// and shouldn't be diluted by several hundred oil changes a year.
//
// The five entry components below were written against a project parent. Rather
// than rewrite them, a work order is presented through a small adapter: the
// record exposes project-shaped field names, and dispatches are translated on the
// way out. Work orders name the same things differently —
//   materialEntries → partEntries · contractorEntries → serviceEntries
function targetRecord(kind, record) {
  if (kind !== "workorder") return record;
  return {
    ...record,
    materialEntries:   record.partEntries    || [],
    contractorEntries: record.serviceEntries || [],
  };
}

function targetDispatch(realDispatch, kind, id) {
  if (kind !== "workorder") return realDispatch;
  const rename = { materialEntries:"partEntries", contractorEntries:"serviceEntries", engineeringEntries:"serviceEntries" };
  return (action) => {
    if (action.type === "ADD_PROJECT_ENTRY" || action.type === "UPDATE_PROJECT_ENTRY") {
      return realDispatch({
        type: action.type === "ADD_PROJECT_ENTRY" ? "ADD_WORK_ORDER_ENTRY" : "UPDATE_WORK_ORDER_ENTRY",
        payload: {
          workOrderId: id,
          entryType: rename[action.payload.entryType] || action.payload.entryType,
          entry: action.payload.entry,
        },
      });
    }
    return realDispatch(action);
  };
}

function EnterCostsTab({ db, dispatch }) {
  const [targetKey, setTargetKey] = useState("");   // "project:<id>" | "workorder:<id>"
  const [entryTab, setEntryTab]   = useState("labor");

  const projects  = db.projects  || [];
  const employees = db.employees || [];
  const equipment = db.equipment || [];
  const invItems  = db.inventoryItems  || [];
  const invBatches= db.inventoryBatches|| [];
  const vendors   = db.vendors   || [];

  // Projects available for cost entry (active or pending), plus open work orders
  const eligible  = projects.filter(p=>["active","pending"].includes(p.status));
  const openWOs   = (db.workOrders||[]).filter(w=>w.status==="open");

  const [targetKind, targetId] = targetKey ? targetKey.split(":") : ["",""];
  const rawTarget = targetKind === "workorder"
    ? openWOs.find(w=>w.id===targetId)
    : projects.find(p=>p.id===targetId);

  const isWO    = targetKind === "workorder" && !!rawTarget;
  const project = rawTarget ? targetRecord(targetKind, rawTarget) : undefined;
  const entryDispatch = targetDispatch(dispatch, targetKind, targetId);
  const unit    = isWO ? (db.equipment||[]).find(u=>u.id===rawTarget.unitId) : null;

  // A work order is about a machine, so there's no equipment line to add, and
  // engineering doesn't apply. Outside shop work is the "contractor" entry.
  const ENTRY_TABS = isWO ? [
    { id:"labor",      label:"Labor",           icon:"user-check" },
    { id:"materials",  label:"Parts",           icon:"package" },
    { id:"contractor", label:"Outside Service", icon:"building-factory-2" },
  ] : [
    { id:"labor",      label:"Labor",           icon:"user-check" },
    { id:"equipment",  label:"Equipment",       icon:"truck" },
    { id:"materials",  label:"Materials",       icon:"package" },
    { id:"contractor", label:"Contractor",      icon:"building-factory-2" },
    { id:"engineering",label:"Engineering",     icon:"compass" },
  ];

  // Keep the tab valid when switching between a project and a work order
  const activeEntryTab = ENTRY_TABS.some(t=>t.id===entryTab) ? entryTab : "labor";

  return (
    <div>
      {/* Project selector */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:16, flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 260px" }}>
            <Field label="Charge costs to">
              <select value={targetKey} onChange={e=>setTargetKey(e.target.value)} style={{ ...inp, fontSize:13 }}>
                <option value="">— Choose a project or work order —</option>
                {["capital","maintenance","miscellaneous"].map(type => {
                  const group = eligible.filter(p=>p.type===type);
                  if (!group.length) return null;
                  return (
                    <optgroup key={type} label={type.charAt(0).toUpperCase()+type.slice(1)}>
                      {group.map(p=><option key={p.id} value={`project:${p.id}`}>{p.projectNumber?`${p.projectNumber} — `:""}{p.name}</option>)}
                    </optgroup>
                  );
                })}
                {openWOs.length > 0 && (
                  <optgroup label="Open Work Orders">
                    {openWOs.map(w=>(
                      <option key={w.id} value={`workorder:${w.id}`}>
                        {w.workOrderNumber||"WO"} — Unit {w.unitNumber} · {w.description}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
          </div>
          {isWO && (
            <div style={{ display:"flex", gap:20, fontSize:13, paddingBottom:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ background:"#f3ecfa", color:"#5a1a8a", border:"1px solid #d9c6ee", borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700 }}>WORK ORDER</span>
              <div><span style={{ color:"#888" }}>Unit: </span><strong style={{ fontFamily:"monospace" }}>{rawTarget.unitNumber}</strong>{unit && <span style={{ color:"#888" }}> · {[unit.year,unit.make,unit.model].filter(Boolean).join(" ")}</span>}</div>
              <div><span style={{ color:"#888" }}>Opened: </span><strong>{fmtDate(rawTarget.openedDate)}</strong></div>
              {rawTarget.category==="preventive" && <span style={{ background:"#e6f4ec", color:"#1a5a3a", borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700 }}>PM</span>}
              {rawTarget.priority==="down" && <span style={{ background:"#fdecea", color:"#8c1b18", borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700 }}>UNIT DOWN</span>}
            </div>
          )}
          {project && !isWO && (
            <div style={{ display:"flex", gap:20, fontSize:13, paddingBottom:8, flexWrap:"wrap" }}>
              <div><span style={{ color:"#888" }}>Type: </span><strong style={{ textTransform:"capitalize" }}>{project.type}</strong></div>
              <div><span style={{ color:"#888" }}>Status: </span><StatusChip status={project.status} /></div>
              {project.isFEMA && <div style={{ background:"#fef3cd", color:"#d97706", padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700 }}>FEMA · {project.disasterNumber||"—"}</div>}
              {project.isNDOT && <div style={{ background:"#e6edf5", color:"#1a3a5c", padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700 }}>NDOT · {project.ndotNumber||""}</div>}
              {project.estimatedCost>0 && <div><span style={{ color:"#888" }}>Est. Cost: </span><strong>{fmtSm(project.estimatedCost)}</strong></div>}
            </div>
          )}
        </div>
      </div>

      {!project && (
        <div style={{ padding:48, textAlign:"center", color:"#aaa", border:"1px dashed #ccc", borderRadius:8, fontSize:13 }}>
          Select an active or pending project above to enter cost data.
        </div>
      )}

      {project && (
        <>
          {/* Cost summary bar */}
          <CostSummaryBar project={project} isFEMA={project.isFEMA} />

          {/* Entry type tabs */}
          <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
            {ENTRY_TABS.map(t=>(
              <button key={t.id} onClick={()=>setEntryTab(t.id)} style={{
                background:"transparent", border:"none", padding:"8px 14px 10px",
                fontWeight:activeEntryTab===t.id?700:400, fontSize:13, cursor:"pointer",
                color:activeEntryTab===t.id?"#1a5a3a":"#666",
                borderBottom:activeEntryTab===t.id?"2px solid #1a5a3a":"2px solid transparent",
                marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
              }}>
                <Icon name={t.icon} size={12} color={activeEntryTab===t.id?"#1a5a3a":"#888"} />
                {t.label}
                <EntryCount project={project} type={t.id} />
              </button>
            ))}
          </div>

          {activeEntryTab==="labor"       && <LaborEntries      project={project} employees={employees} dispatch={entryDispatch} />}
          {activeEntryTab==="equipment"   && <EquipmentEntries  project={project} equipment={equipment} dispatch={entryDispatch} />}
          {activeEntryTab==="materials"   && <MaterialEntries   project={project} invItems={invItems} invBatches={invBatches} dispatch={entryDispatch} />}
          {activeEntryTab==="contractor"  && <ContractorEntries project={project} vendors={vendors} dispatch={entryDispatch} />}
          {activeEntryTab==="engineering" && <EngineeringEntries project={project} vendors={vendors} dispatch={entryDispatch} />}
        </>
      )}
    </div>
  );
}

function EntryCount({ project, type }) {
  const map = { labor:"laborEntries", equipment:"equipmentEntries", materials:"materialEntries", contractor:"contractorEntries", engineering:"engineeringEntries" };
  const count = (project[map[type]]||[]).length;
  if (!count) return null;
  return <span style={{ background:"#1a3a5c", color:"#fff", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:99, marginLeft:2 }}>{count}</span>;
}

function CostSummaryBar({ project, isFEMA }) {
  const t = projectTotals(project);
  const sections = [
    { label:"Labor",       value:t.labor,    color:"#1a6b35" },
    { label:"Equipment",   value:t.equip,    color:"#1a3a5c" },
    { label:"Materials",   value:t.material, color:"#d97706" },
    { label:"Contractor",  value:t.contract, color:"#5a1a8a" },
    { label:"Engineering", value:t.eng,      color:"#888"    },
  ];
  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 18px", marginBottom:16, display:"flex", gap:24, flexWrap:"wrap", alignItems:"center" }}>
      {sections.map(s=>(
        <div key={s.label} style={{ textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>{s.label}</div>
          <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:s.color }}>{fmtSm(s.value)}</div>
        </div>
      ))}
      <div style={{ borderLeft:"1px solid #eee", paddingLeft:24 }}>
        <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>Total</div>
        <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:16 }}>{fmtSm(t.total)}</div>
      </div>
      {isFEMA && (
        <div style={{ borderLeft:"1px solid #eee", paddingLeft:24 }}>
          <div style={{ fontSize:11, color:"#d97706", marginBottom:2, fontWeight:700 }}>FEMA Labor Total</div>
          <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:"#d97706" }}>
            {fmtSm((project.laborEntries||[]).reduce((s,e)=>s+laborFEMA(e),0))}
          </div>
          <div style={{ fontSize:10, color:"#aaa" }}>×1.157 overhead</div>
        </div>
      )}
      {project.estimatedCost>0 && (
        <div style={{ borderLeft:"1px solid #eee", paddingLeft:24 }}>
          <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>Estimated</div>
          <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:"#888" }}>{fmtSm(project.estimatedCost)}</div>
          <div style={{ fontSize:10, color: t.total>project.estimatedCost?"#c0392b":"#1a6b35", fontWeight:700 }}>
            {t.total>project.estimatedCost?"OVER":"UNDER"} by {fmtSm(Math.abs(t.total-project.estimatedCost))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Labor Entries ─────────────────────────────────────────────────────────────
function LaborEntries({ project, employees, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const entries = project.laborEntries||[];

  const blankForm = () => ({ date:today(), employeeId:"", employeeName:"", classification:"", straightTimeHours:0, straightTimeRate:0, overtimeHours:0, overtimeRate:0, fringeRate:0, notes:"" });
  const [form, setForm] = useState(blankForm());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const fillEmployee = id => {
    const emp = employees.find(e=>e.id===id);
    if (!emp) { set("employeeId",id); return; }
    setForm(f=>({ ...f, employeeId:id, employeeName:emp.name, classification:emp.classification, straightTimeRate:emp.straightTimeRate||0, overtimeRate:emp.overtimeRate||0, fringeRate:emp.fringeRate||0 }));
  };

  const cost = laborTotal(form);
  const fema = laborFEMA(form);

  const handleSave = () => {
    if (!form.date||!form.employeeName) return;
    const entry = { ...createLaborEntry(), ...form, id: editId||uid(), totalCost: cost, createdAt: new Date().toISOString() };
    if (editId) {
      dispatch({ type:"UPDATE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"laborEntries", entry } });
      setEditId(null);
    } else {
      dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"laborEntries", entry } });
    }
    setForm(blankForm()); setShowForm(false);
  };

  const handleEdit = e => { setForm({ ...e }); setEditId(e.id); setShowForm(true); };
  const handleDelete = id => dispatch({ type:"DELETE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"laborEntries", entryId:id } });

  const totalST   = entries.reduce((s,e)=>s+(e.straightTimeHours||0),0);
  const totalOT   = entries.reduce((s,e)=>s+(e.overtimeHours||0),0);
  const totalCost = entries.reduce((s,e)=>s+(e.totalCost||0),0);
  const totalFEMA = entries.reduce((s,e)=>s+laborFEMA(e),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>
          {entries.length} entries · <strong>{totalST.toFixed(2)} ST hrs</strong> · {totalOT.toFixed(2)} OT hrs · Total: <strong style={{ color:"#1a6b35" }}>{fmtSm(totalCost)}</strong>
          {project.isFEMA && <span style={{ color:"#d97706", fontWeight:700 }}> · FEMA: {fmtSm(totalFEMA)}</span>}
        </div>
        <button onClick={()=>{ setShowForm(v=>!v); setEditId(null); setForm(blankForm()); }} style={btn.primary}>{showForm&&!editId?"Cancel":"+ Add Labor"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:12, marginBottom:12 }}>{editId?"Edit Labor Entry":"New Labor Entry"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Employee">
              {employees.length>0
                ? <select value={form.employeeId} onChange={e=>fillEmployee(e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Manual entry…</option>
                    {employees.filter(e=>e.active).map(e=><option key={e.id} value={e.id}>{e.name}{e.classification?` — ${e.classification}`:""}</option>)}
                  </select>
                : <input type="text" value={form.employeeName} onChange={e=>set("employeeName",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Employee name…" />
              }
            </Field>
            <Field label="Classification"><input type="text" value={form.classification} onChange={e=>set("classification",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="ST Hours"><input type="number" min="0" step="0.25" value={form.straightTimeHours} onChange={e=>set("straightTimeHours",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="ST Rate ($/hr)"><input type="number" min="0" step="0.01" value={form.straightTimeRate} onChange={e=>set("straightTimeRate",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="OT Hours"><input type="number" min="0" step="0.25" value={form.overtimeHours} onChange={e=>set("overtimeHours",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="OT Rate ($/hr)"><input type="number" min="0" step="0.01" value={form.overtimeRate} onChange={e=>set("overtimeRate",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Fringe Rate (%)"><input type="number" min="0" step="0.1" value={form.fringeRate} onChange={e=>set("fringeRate",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Cost"><div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color:"#1a6b35", fontSize:13 }}>{fmtSm(cost)}</div></Field>
          </div>
          {project.isFEMA && (
            <div style={{ background:"#fef3cd", border:"1px solid #f5c842", borderRadius:6, padding:"8px 14px", marginBottom:12, fontSize:12, display:"flex", gap:20, alignItems:"center" }}>
              <span style={{ fontWeight:700, color:"#d97706" }}>FEMA Force Account:</span>
              <span>Base = {fmtSm((form.straightTimeHours||0)*(form.straightTimeRate||0)+(form.overtimeHours||0)*(form.overtimeRate||0))} × 1.157 = <strong>{fmtSm(fema)}</strong></span>
              <span style={{ color:"#888", fontSize:11 }}>(overhead replaces fringe for FEMA)</span>
            </div>
          )}
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleSave} style={{ ...btn.primary, marginTop:20 }}>{editId?"Save":"Add"}</button>
            {editId && <button onClick={()=>{ setEditId(null); setShowForm(false); setForm(blankForm()); }} style={{ ...btn.ghost, marginTop:20 }}>Cancel</button>}
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Employee"},{label:"Classification"},{label:"ST Hrs"},{label:"ST Rate"},{label:"OT Hrs"},{label:"OT Rate"},{label:"Fringe %"},{label:"Total"},{label:"FEMA Total"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.employeeName||"—"}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.classification||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.straightTimeHours}</span>,
          <span style={{fontFamily:"monospace"}}>{fmtSm(e.straightTimeRate||0)}</span>,
          <span style={{fontFamily:"monospace"}}>{e.overtimeHours||0}</span>,
          <span style={{fontFamily:"monospace"}}>{e.overtimeRate?fmtSm(e.overtimeRate):"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.fringeRate||0}%</span>,
          <span style={{fontFamily:"monospace",fontWeight:700,color:"#1a6b35"}}>{fmtSm(e.totalCost||0)}</span>,
          project.isFEMA?<span style={{fontFamily:"monospace",fontWeight:700,color:"#d97706"}}>{fmtSm(laborFEMA(e))}</span>:<span style={{color:"#ccc"}}>—</span>,
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>handleEdit(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"3px 8px"}}>Edit</button>
            <button onClick={()=>handleDelete(e.id)} style={{...btn.small,background:"#c0392b",fontSize:10,padding:"3px 8px"}}>Del</button>
          </div>,
        ])}
        emptyMessage="No labor entries — click Add Labor above"
      />
    </div>
  );
}

// ── Equipment Entries ─────────────────────────────────────────────────────────
function EquipmentEntries({ project, equipment, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const entries = project.equipmentEntries||[];

  const blankForm = () => ({ date:today(), equipmentId:"", equipmentName:"", unitNumber:"", hoursOperated:0, femaRate:0, operatorName:"", notes:"" });
  const [form, setForm] = useState(blankForm());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const fillUnit = id => {
    const u = equipment.find(e=>e.id===id);
    if (!u) { set("equipmentId",id); return; }
    setForm(f=>({ ...f, equipmentId:id, equipmentName:`${u.year||""} ${u.make||""} ${u.model||""}`.trim()||u.description||"", unitNumber:u.unitNumber||"", femaRate:u.femaRate||0 }));
  };

  const cost = (form.hoursOperated||0)*(form.femaRate||0);

  const handleSave = () => {
    if (!form.date||!form.hoursOperated) return;
    const entry = { ...createEquipmentEntry(), ...form, id:editId||uid(), totalCost:cost, createdAt:new Date().toISOString() };
    if (editId) {
      dispatch({ type:"UPDATE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"equipmentEntries", entry } });
      setEditId(null);
    } else {
      dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"equipmentEntries", entry } });
    }
    setForm(blankForm()); setShowForm(false);
  };

  const handleEdit = e => { setForm({ ...e }); setEditId(e.id); setShowForm(true); };
  const handleDelete = id => dispatch({ type:"DELETE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"equipmentEntries", entryId:id } });

  const totalHours = entries.reduce((s,e)=>s+(e.hoursOperated||0),0);
  const totalCost  = entries.reduce((s,e)=>s+(e.totalCost||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>
          {entries.length} entries · <strong>{totalHours.toFixed(1)} hrs</strong> · Total: <strong style={{ color:"#1a3a5c" }}>{fmtSm(totalCost)}</strong>
        </div>
        <button onClick={()=>{ setShowForm(v=>!v); setEditId(null); setForm(blankForm()); }} style={btn.primary}>{showForm&&!editId?"Cancel":"+ Add Equipment"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Equipment Unit">
              <select value={form.equipmentId} onChange={e=>fillUnit(e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Select unit…</option>
                {equipment.filter(u=>u.status!=="sold").map(u=><option key={u.id} value={u.id}>{u.unitNumber?`${u.unitNumber} — `:""}{u.year} {u.make} {u.model}</option>)}
              </select>
            </Field>
            <Field label="Hours Operated"><input type="number" min="0" step="0.25" value={form.hoursOperated} onChange={e=>set("hoursOperated",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="FEMA Rate ($/hr)"><input type="number" min="0" step="0.01" value={form.femaRate} onChange={e=>set("femaRate",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Total Cost"><div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(cost)}</div></Field>
            <Field label="Operator"><input type="text" value={form.operatorName} onChange={e=>set("operatorName",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleSave} style={{ ...btn.primary, marginTop:20 }}>{editId?"Save":"Add"}</button>
            {editId && <button onClick={()=>{ setEditId(null); setShowForm(false); setForm(blankForm()); }} style={{ ...btn.ghost, marginTop:20 }}>Cancel</button>}
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Unit"},{label:"Hours"},{label:"FEMA Rate"},{label:"Total"},{label:"Operator"},{label:"Notes"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.unitNumber?`#${e.unitNumber} `:""}{e.equipmentName||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.hoursOperated}</span>,
          <span style={{fontFamily:"monospace"}}>{fmtSm(e.femaRate||0)}/hr</span>,
          <span style={{fontFamily:"monospace",fontWeight:700,color:"#1a3a5c"}}>{fmtSm(e.totalCost||0)}</span>,
          e.operatorName||"—",
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>handleEdit(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"3px 8px"}}>Edit</button>
            <button onClick={()=>handleDelete(e.id)} style={{...btn.small,background:"#c0392b",fontSize:10,padding:"3px 8px"}}>Del</button>
          </div>,
        ])}
        emptyMessage="No equipment entries"
      />
    </div>
  );
}

// ── Material Entries ──────────────────────────────────────────────────────────
function MaterialEntries({ project, invItems, invBatches, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const entries = project.materialEntries||[];

  const blankForm = () => ({ date:today(), itemId:"", itemName:"", quantity:0, unitOfMeasure:"", unitCost:0, notes:"" });
  const [form, setForm] = useState(blankForm());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const selectedItem = invItems.find(i=>i.id===form.itemId);
  const fifo = form.itemId && form.quantity>0 ? buildFIFO(form.itemId, form.quantity, invBatches) : null;
  const cost = fifo ? fifo.totalCost : (form.quantity||0)*(form.unitCost||0);

  const fillItem = id => {
    const item = invItems.find(i=>i.id===id);
    setForm(f=>({ ...f, itemId:id, itemName:item?.name||"", unitOfMeasure:item?.unitOfMeasure||"", unitCost:item?.standardCost||0 }));
  };

  const handleSave = () => {
    if (!form.date||(!form.itemId&&!form.itemName)||!form.quantity) return;
    const batchLines = fifo?.lines||[];
    const entry = {
      ...createMaterialEntry(), ...form, id:editId||uid(),
      itemName: form.itemId ? (selectedItem?.name||form.itemName) : form.itemName,
      batchLines, totalCost:cost, createdAt:new Date().toISOString(),
    };
    if (editId) {
      dispatch({ type:"UPDATE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"materialEntries", entry } });
      setEditId(null);
    } else {
      dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"materialEntries", entry } });
      // Decrement inventory batches if from catalog
      if (form.itemId && batchLines.length>0) {
        dispatch({ type:"ADD_INVENTORY_TRANSACTION", payload:{
          id:uid(), type:"issue", date:form.date,
          itemId:form.itemId, itemName:entry.itemName,
          quantity:form.quantity, location:"all",
          projectId:project.id, projectName:project.name||project.projectNumber||"",
          linkedAssets:[], batchLines, totalCost:cost,
          notes:`Cost Accounting — ${project.projectNumber||project.name}`,
          createdAt:new Date().toISOString(),
        }});
      }
    }
    setForm(blankForm()); setShowForm(false);
  };

  const handleEdit = e => { setForm({ ...e, itemId:e.itemId||"" }); setEditId(e.id); setShowForm(true); };
  const handleDelete = id => dispatch({ type:"DELETE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"materialEntries", entryId:id } });

  const totalCost = entries.reduce((s,e)=>s+(e.totalCost||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>{entries.length} entries · Total: <strong style={{ color:"#d97706" }}>{fmtSm(totalCost)}</strong></div>
        <button onClick={()=>{ setShowForm(v=>!v); setEditId(null); setForm(blankForm()); }} style={btn.primary}>{showForm&&!editId?"Cancel":"+ Add Materials"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Item (catalog or manual)">
              <select value={form.itemId} onChange={e=>fillItem(e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Manual entry…</option>
                {invItems.filter(i=>i.active!==false).map(i=><option key={i.id} value={i.id}>{i.name}{i.unitOfMeasure?` (${i.unitOfMeasure})`:""}</option>)}
              </select>
            </Field>
            <Field label="Quantity"><input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Unit">
              {form.itemId
                ? <div style={{ ...inp, margin:0, background:"#fff", color:"#888" }}>{form.unitOfMeasure||"—"}</div>
                : <input type="text" value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={{ ...inp, margin:0 }} placeholder="ton, LF, CY…" />
              }
            </Field>
            <Field label="Total Cost"><div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", fontWeight:700, color:"#d97706" }}>{fmtSm(cost)}</div></Field>
          </div>
          {!form.itemId && (
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Item Description"><input type="text" value={form.itemName} onChange={e=>set("itemName",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Description of material…" /></Field>
              <Field label="Unit Cost (manual)"><input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>set("unitCost",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            </div>
          )}
          {fifo && (
            <div style={{ background:fifo.canFulfill?"#e6f4ec":"#fdecea", border:`1px solid ${fifo.canFulfill?"#c3e6cb":"#f5c6cb"}`, borderRadius:6, padding:"8px 14px", marginBottom:12, fontSize:12 }}>
              {fifo.canFulfill
                ? <><strong>FIFO:</strong> {fifo.lines.length} batch line{fifo.lines.length!==1?"s":""} · {fifo.lines.map(l=>`${l.quantity} ${l.unitOfMeasure||""} @ ${fmtSm(l.unitCost)}`).join(", ")}</>
                : <><strong style={{color:"#c0392b"}}>⚠ Stock shortage:</strong> {fifo.shortfall} {form.unitOfMeasure||"units"} unavailable in inventory</>
              }
            </div>
          )}
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleSave} style={{ ...btn.primary, marginTop:20 }}>{editId?"Save":"Add"}</button>
            {editId && <button onClick={()=>{ setEditId(null); setShowForm(false); setForm(blankForm()); }} style={{ ...btn.ghost, marginTop:20 }}>Cancel</button>}
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Item"},{label:"Qty"},{label:"Unit"},{label:"FIFO Batches"},{label:"Total"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.itemName||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.quantity}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.unitOfMeasure||"—"}</span>,
          <span style={{fontSize:11,color:"#888"}}>{e.batchLines?.length?`${e.batchLines.length} batch line${e.batchLines.length!==1?"s":""}`:e.itemId?"catalog":"manual"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700,color:"#d97706"}}>{fmtSm(e.totalCost||0)}</span>,
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>handleEdit(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"3px 8px"}}>Edit</button>
            <button onClick={()=>handleDelete(e.id)} style={{...btn.small,background:"#c0392b",fontSize:10,padding:"3px 8px"}}>Del</button>
          </div>,
        ])}
        emptyMessage="No material entries"
      />
    </div>
  );
}

// ── Contractor Entries ────────────────────────────────────────────────────────
function ContractorEntries({ project, vendors, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const entries = project.contractorEntries||[];

  const blankForm = () => ({ date:today(), vendorId:"", vendorName:"", invoiceNumber:"", description:"", amount:0, expenditureCode:"", notes:"" });
  const [form, setForm] = useState(blankForm());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const fillVendor = id => {
    const v = vendors.find(v=>v.id===id);
    setForm(f=>({ ...f, vendorId:id, vendorName:v?.name||"" }));
  };

  const handleSave = () => {
    if (!form.date||!form.description||!form.amount) return;
    const entry = { ...createContractorEntry(), ...form, id:editId||uid(), createdAt:new Date().toISOString() };
    if (editId) {
      dispatch({ type:"UPDATE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"contractorEntries", entry } });
      setEditId(null);
    } else {
      dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"contractorEntries", entry } });
    }
    setForm(blankForm()); setShowForm(false);
  };

  const handleEdit = e => { setForm({ ...e }); setEditId(e.id); setShowForm(true); };
  const handleDelete = id => dispatch({ type:"DELETE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"contractorEntries", entryId:id } });

  const totalAmt = entries.reduce((s,e)=>s+(e.amount||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>{entries.length} invoices · Total: <strong style={{ color:"#5a1a8a" }}>{fmtSm(totalAmt)}</strong></div>
        <button onClick={()=>{ setShowForm(v=>!v); setEditId(null); setForm(blankForm()); }} style={btn.primary}>{showForm&&!editId?"Cancel":"+ Add Contractor Invoice"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Contractor">
              {vendors.filter(v=>v.type==="contractor").length>0
                ? <select value={form.vendorId} onChange={e=>fillVendor(e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Select contractor…</option>
                    {vendors.filter(v=>v.active!==false&&v.type==="contractor").map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                : <input type="text" value={form.vendorName} onChange={e=>set("vendorName",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Contractor name…" />
              }
            </Field>
            <Field label="Invoice #"><input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Work Description"><input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Amount ($)"><input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set("amount",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Expenditure Code"><input type="text" value={form.expenditureCode} onChange={e=>set("expenditureCode",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleSave} style={{ ...btn.primary, marginTop:20 }}>{editId?"Save":"Add"}</button>
            {editId && <button onClick={()=>{ setEditId(null); setShowForm(false); setForm(blankForm()); }} style={{ ...btn.ghost, marginTop:20 }}>Cancel</button>}
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Contractor"},{label:"Invoice #"},{label:"Description"},{label:"Amount"},{label:"Exp. Code"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.vendorName||"—",
          <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
          <span style={{fontWeight:600,fontSize:12}}>{e.description||"—"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700,color:"#5a1a8a"}}>{fmtSm(e.amount||0)}</span>,
          <span style={{fontFamily:"monospace",fontSize:11,color:"#888"}}>{e.expenditureCode||"—"}</span>,
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>handleEdit(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"3px 8px"}}>Edit</button>
            <button onClick={()=>handleDelete(e.id)} style={{...btn.small,background:"#c0392b",fontSize:10,padding:"3px 8px"}}>Del</button>
          </div>,
        ])}
        emptyMessage="No contractor invoices"
      />
    </div>
  );
}

// ── Engineering Entries ───────────────────────────────────────────────────────
function EngineeringEntries({ project, vendors, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const entries = project.engineeringEntries||[];

  const blankForm = () => ({ date:today(), vendorId:"", firmName:"", invoiceNumber:"", phase:"design", amount:0, expenditureCode:"", notes:"" });
  const [form, setForm] = useState(blankForm());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const fillFirm = id => {
    const v = vendors.find(v=>v.id===id);
    setForm(f=>({ ...f, vendorId:id, firmName:v?.name||"" }));
  };

  const handleSave = () => {
    if (!form.date||!form.amount) return;
    const entry = { ...createEngineeringEntry(), ...form, id:editId||uid(), createdAt:new Date().toISOString() };
    if (editId) {
      dispatch({ type:"UPDATE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"engineeringEntries", entry } });
      setEditId(null);
    } else {
      dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"engineeringEntries", entry } });
    }
    setForm(blankForm()); setShowForm(false);
  };

  const handleEdit = e => { setForm({ ...e }); setEditId(e.id); setShowForm(true); };
  const handleDelete = id => dispatch({ type:"DELETE_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"engineeringEntries", entryId:id } });

  const totalAmt = entries.reduce((s,e)=>s+(e.amount||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>{entries.length} invoices · Total: <strong style={{ color:"#888" }}>{fmtSm(totalAmt)}</strong></div>
        <button onClick={()=>{ setShowForm(v=>!v); setEditId(null); setForm(blankForm()); }} style={btn.primary}>{showForm&&!editId?"Cancel":"+ Add Engineering"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Engineering Firm">
              {vendors.filter(v=>v.type==="engineering_firm").length>0
                ? <select value={form.vendorId} onChange={e=>fillFirm(e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Select firm…</option>
                    {vendors.filter(v=>v.active!==false&&v.type==="engineering_firm").map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                : <input type="text" value={form.firmName} onChange={e=>set("firmName",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Firm name…" />
              }
            </Field>
            <Field label="Invoice #"><input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Phase">
              <select value={form.phase} onChange={e=>set("phase",e.target.value)} style={{ ...inp, margin:0 }}>
                {ENG_PHASES.map(p=><option key={p} value={p}>{p.replace("_"," ")}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Amount ($)"><input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set("amount",parseFloat(e.target.value)||0)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Expenditure Code"><input type="text" value={form.expenditureCode} onChange={e=>set("expenditureCode",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:12 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={handleSave} style={{ ...btn.primary, marginTop:20 }}>{editId?"Save":"Add"}</button>
            {editId && <button onClick={()=>{ setEditId(null); setShowForm(false); setForm(blankForm()); }} style={{ ...btn.ghost, marginTop:20 }}>Cancel</button>}
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Date"},{label:"Firm"},{label:"Invoice #"},{label:"Phase"},{label:"Amount"},{label:"Exp. Code"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.firmName||"—",
          <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
          <span style={{fontSize:12,textTransform:"capitalize"}}>{(e.phase||"—").replace("_"," ")}</span>,
          <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.amount||0)}</span>,
          <span style={{fontFamily:"monospace",fontSize:11,color:"#888"}}>{e.expenditureCode||"—"}</span>,
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>handleEdit(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"3px 8px"}}>Edit</button>
            <button onClick={()=>handleDelete(e.id)} style={{...btn.small,background:"#c0392b",fontSize:10,padding:"3px 8px"}}>Del</button>
          </div>,
        ])}
        emptyMessage="No engineering entries"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BY PROJECT
// ═══════════════════════════════════════════════════════════════════════════════

function ByProjectTab({ db }) {
  const [detail, setDetail] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const projects = db.projects||[];
  const project = detail ? projects.find(p=>p.id===detail) : null;

  if (project) {
    return <ProjectCostDetail project={project} onBack={()=>setDetail(null)} />;
  }

  const filtered = projects.filter(p=>{
    if (typeFilter!=="all"   && p.type!==typeFilter)     return false;
    if (statusFilter!=="all" && p.status!==statusFilter) return false;
    return true;
  });

  const grandTotal = filtered.reduce((s,p)=>s+projectTotals(p).total,0);

  // KPIs
  const activeTotal  = projects.filter(p=>p.status==="active").reduce((s,p)=>s+projectTotals(p).total,0);
  const laborTotal2  = projects.reduce((s,p)=>s+projectTotals(p).labor,0);
  const equipTotal   = projects.reduce((s,p)=>s+projectTotals(p).equip,0);
  const matTotal     = projects.reduce((s,p)=>s+projectTotals(p).material,0);

  // Work orders are cost targets too. Shown separately rather than mixed in, so
  // project numbers keep their meaning and several hundred oil changes a year
  // don't swamp the project list.
  const workOrders = db.workOrders || [];
  const woTotal    = workOrders.reduce((s,w)=>s+(w.totalCost||0),0);
  const woPM       = workOrders.filter(w=>w.category==="preventive");
  const woRepair   = workOrders.filter(w=>w.category!=="preventive");
  const woPMCost   = woPM.reduce((s,w)=>s+(w.totalCost||0),0);
  const woRepCost  = woRepair.reduce((s,w)=>s+(w.totalCost||0),0);

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>Cost Summary by Project</div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Active Project Spend" value={fmtSm(activeTotal)} sub="Cumulative" accent="#1a6b35" icon="folder-open" />
        <KPICard label="Labor"                value={fmtSm(laborTotal2)} sub="All projects" accent="#1a5a3a" icon="user-check" />
        <KPICard label="Equipment"            value={fmtSm(equipTotal)}  sub="All projects" accent="#1a3a5c" icon="truck" />
        <KPICard label="Materials"            value={fmtSm(matTotal)}    sub="All projects" accent="#d97706" icon="package" />
      </div>

      {workOrders.length > 0 && (
        <SectionCard
          title="Work Orders"
          subtitle="Equipment maintenance — a separate cost target from projects"
          style={{ marginBottom:20 }}
        >
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, padding:16 }}>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>All Work Orders</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#5a1a8a", marginTop:3 }}>{fmtSm(woTotal)}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{workOrders.length} orders</div>
            </div>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Repairs</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#c0392b", marginTop:3 }}>{fmtSm(woRepCost)}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{woRepair.length} orders</div>
            </div>
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:13 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>Preventive</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#1a5a3a", marginTop:3 }}>{fmtSm(woPMCost)}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{woPM.length} orders</div>
            </div>
          </div>
          <div style={{ fontSize:11, color:"#888", padding:"0 16px 16px", lineHeight:1.6 }}>
            Separating repairs from routine service is what makes "what is this machine costing me in
            breakdowns" answerable. Per-unit detail is on each unit's Overview in Equipment.
          </div>
        </SectionCard>
      )}

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All Types"],["capital","Capital"],["maintenance","Maintenance"],["miscellaneous","Misc"]].map(([v,l])=>(
            <button key={v} onClick={()=>setTypeFilter(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:typeFilter===v?"#1a3a5c":"#fff", color:typeFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All Status"],["active","Active"],["pending","Pending"],["planning","Planning"],["complete","Complete"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStatusFilter(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:statusFilter===v?"#1a3a5c":"#fff", color:statusFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize:13, color:"#888", marginLeft:"auto" }}>
          {filtered.length} project{filtered.length!==1?"s":""} · <strong>{fmtSm(grandTotal)}</strong> total
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Project","Type","Status","Labor","Equipment","Materials","Contractor","Engineering","Total","vs. Est.",""].map(h=>(
                <th key={h} style={{ padding:"9px 12px", textAlign:["Labor","Equipment","Materials","Contractor","Engineering","Total","vs. Est."].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={11} style={{ padding:32, textAlign:"center", color:"#aaa" }}>No projects match filter.</td></tr>
            )}
            {filtered.map((p,i)=>{
              const t = projectTotals(p);
              const over = p.estimatedCost>0 ? t.total - p.estimatedCost : null;
              return (
                <tr key={p.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                  onClick={()=>setDetail(p.id)}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                  <td style={{ padding:"9px 12px", fontWeight:700 }}>{p.name||p.projectNumber||"—"}</td>
                  <td style={{ padding:"9px 12px", fontSize:12, textTransform:"capitalize" }}>{p.type}</td>
                  <td style={{ padding:"9px 12px" }}><StatusChip status={p.status} /></td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{t.labor?fmtSm(t.labor):"—"}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{t.equip?fmtSm(t.equip):"—"}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{t.material?fmtSm(t.material):"—"}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{t.contract?fmtSm(t.contract):"—"}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{t.eng?fmtSm(t.eng):"—"}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(t.total)}</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontSize:11, fontWeight:700, color:over>0?"#c0392b":over<0?"#1a6b35":"#888" }}>
                    {over!==null?(over>0?`+${fmtSm(over)}`:fmtSm(over)):"—"}
                  </td>
                  <td style={{ padding:"9px 12px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
                </tr>
              );
            })}
            {filtered.length>0 && (
              <tr style={{ background:"#f7f7f5", borderTop:"2px solid #ddd" }}>
                <td colSpan={3} style={{ padding:"9px 12px", fontWeight:700, fontSize:12, color:"#888" }}>TOTALS</td>
                {["labor","equip","material","contract","eng"].map(k=>(
                  <td key={k} style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(filtered.reduce((s,p)=>s+projectTotals(p)[k],0))}</td>
                ))}
                <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14 }}>{fmtSm(grandTotal)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectCostDetail({ project: p, onBack }) {
  const [tab, setTab] = useState("labor");
  const t = projectTotals(p);
  const TABS = [
    ["labor","Labor","user-check"],["equipment","Equipment","truck"],["materials","Materials","package"],
    ["contractor","Contractor","building-factory-2"],["engineering","Engineering","compass"],
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Projects</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:"#888", textTransform:"capitalize" }}>{p.type}{p.projectNumber?` · ${p.projectNumber}`:""}</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{p.name||p.projectNumber||"Project"}</div>
        </div>
        <StatusChip status={p.status} />
        {p.isFEMA && <span style={{ background:"#fef3cd", color:"#d97706", padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:700 }}>FEMA</span>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:20 }}>
        <KPICard label="Labor"       value={fmtSm(t.labor)}    sub="" accent="#1a6b35" icon="user-check" />
        <KPICard label="Equipment"   value={fmtSm(t.equip)}    sub="" accent="#1a3a5c" icon="truck" />
        <KPICard label="Materials"   value={fmtSm(t.material)} sub="" accent="#d97706" icon="package" />
        <KPICard label="Contractor"  value={fmtSm(t.contract)} sub="" accent="#5a1a8a" icon="building-factory-2" />
        <KPICard label="Engineering" value={fmtSm(t.eng)}      sub="" accent="#888"    icon="compass" />
        <KPICard label="Total"       value={fmtSm(t.total)}    sub="" accent="#1a1a1a" icon="coin" />
      </div>

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
        {TABS.map(([id,label,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ background:"transparent", border:"none", padding:"8px 14px 10px", fontWeight:tab===id?700:400, fontSize:13, cursor:"pointer", color:tab===id?"#1a5a3a":"#666", borderBottom:tab===id?"2px solid #1a5a3a":"2px solid transparent", marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6 }}>
            <Icon name={icon} size={12} color={tab===id?"#1a5a3a":"#888"} />{label}
          </button>
        ))}
      </div>

      {tab==="labor" && (
        <Table
          headers={[{label:"Date"},{label:"Employee"},{label:"ST Hrs"},{label:"ST Rate"},{label:"OT Hrs"},{label:"OT Rate"},{label:"Fringe %"},{label:"Total"},{label:"FEMA Total"}]}
          rows={(p.laborEntries||[]).map(e=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
            <span style={{fontWeight:600}}>{e.employeeName}{e.classification?` — ${e.classification}`:""}</span>,
            <span style={{fontFamily:"monospace"}}>{e.straightTimeHours}</span>,
            <span style={{fontFamily:"monospace"}}>{fmtSm(e.straightTimeRate||0)}</span>,
            <span style={{fontFamily:"monospace"}}>{e.overtimeHours||0}</span>,
            <span style={{fontFamily:"monospace"}}>{e.overtimeRate?fmtSm(e.overtimeRate):"—"}</span>,
            <span style={{fontFamily:"monospace"}}>{e.fringeRate||0}%</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.totalCost||0)}</span>,
            p.isFEMA?<span style={{fontFamily:"monospace",color:"#d97706",fontWeight:700}}>{fmtSm(laborFEMA(e))}</span>:<span style={{color:"#ccc"}}>—</span>,
          ])}
          emptyMessage="No labor entries"
        />
      )}
      {tab==="equipment" && (
        <Table
          headers={[{label:"Date"},{label:"Unit"},{label:"Hours"},{label:"FEMA Rate"},{label:"Total"},{label:"Operator"}]}
          rows={(p.equipmentEntries||[]).map(e=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
            <span style={{fontWeight:600}}>{e.unitNumber?`#${e.unitNumber} `:""}{e.equipmentName||"—"}</span>,
            <span style={{fontFamily:"monospace"}}>{e.hoursOperated}</span>,
            <span style={{fontFamily:"monospace"}}>{fmtSm(e.femaRate||0)}/hr</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.totalCost||0)}</span>,
            e.operatorName||"—",
          ])}
          emptyMessage="No equipment entries"
        />
      )}
      {tab==="materials" && (
        <Table
          headers={[{label:"Date"},{label:"Item"},{label:"Qty"},{label:"Unit"},{label:"FIFO Batches"},{label:"Total"}]}
          rows={(p.materialEntries||[]).map(e=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
            <span style={{fontWeight:600}}>{e.itemName||"—"}</span>,
            <span style={{fontFamily:"monospace"}}>{e.quantity}</span>,
            <span style={{fontSize:12,color:"#888"}}>{e.unitOfMeasure||"—"}</span>,
            <span style={{fontSize:11,color:"#888"}}>{e.batchLines?.length?`${e.batchLines.length} batch line${e.batchLines.length!==1?"s":""}`:e.itemId?"catalog":"manual"}</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.totalCost||0)}</span>,
          ])}
          emptyMessage="No material entries"
        />
      )}
      {tab==="contractor" && (
        <Table
          headers={[{label:"Date"},{label:"Contractor"},{label:"Invoice #"},{label:"Description"},{label:"Amount"},{label:"Exp. Code"}]}
          rows={(p.contractorEntries||[]).map(e=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
            e.vendorName||"—",
            <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
            <span style={{fontWeight:600}}>{e.description||"—"}</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.amount||0)}</span>,
            <span style={{fontFamily:"monospace",fontSize:11}}>{e.expenditureCode||"—"}</span>,
          ])}
          emptyMessage="No contractor entries"
        />
      )}
      {tab==="engineering" && (
        <Table
          headers={[{label:"Date"},{label:"Firm"},{label:"Invoice #"},{label:"Phase"},{label:"Amount"},{label:"Exp. Code"}]}
          rows={(p.engineeringEntries||[]).map(e=>[
            <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
            e.firmName||"—",
            <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
            <span style={{fontSize:12,textTransform:"capitalize"}}>{(e.phase||"—").replace("_"," ")}</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(e.amount||0)}</span>,
            <span style={{fontFamily:"monospace",fontSize:11}}>{e.expenditureCode||"—"}</span>,
          ])}
          emptyMessage="No engineering entries"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BY ASSET
// ═══════════════════════════════════════════════════════════════════════════════

function ByAssetTab({ db }) {
  const [assetType, setAssetType] = useState("road");
  const [assetId, setAssetId]     = useState("");

  const projects   = db.projects   || [];
  const roads      = db.roads      || [];
  const bridges    = db.bridges    || [];
  const structures = db.structures || [];
  const signs      = db.signs      || [];
  const equipment  = db.equipment  || [];

  const TYPES = [
    { id:"road",      label:"Roads",      list:roads.filter(r=>r.status!=="inactive"),      key:"name" },
    { id:"bridge",    label:"Bridges",    list:bridges.filter(b=>b.status==="active"),       key:null },
    { id:"structure", label:"Structures", list:structures.filter(s=>s.status==="active"),    key:"road" },
    { id:"sign",      label:"Signs",      list:signs.filter(s=>s.status==="active"),         key:"signName" },
    { id:"equipment", label:"Equipment",  list:equipment.filter(u=>u.status!=="sold"),       key:null },
  ];

  const typeInfo  = TYPES.find(t=>t.id===assetType);
  const assetList = typeInfo?.list||[];

  function assetLabel(a, type) {
    if (type==="bridge")    return `${a.stateNumber||""} ${a.countyNumber||""} — ${a.road||a.features||"Bridge"}`.trim();
    if (type==="structure") return `${a.culvertNumber||""} — ${a.road||""} ${a.township||""}`.trim();
    if (type==="sign")      return `${a.signName||""} — ${a.onRoad||""} ${a.township||""}`.trim();
    if (type==="equipment") return `${a.unitNumber?`#${a.unitNumber} `:""}${a.year||""} ${a.make||""} ${a.model||""}`.trim();
    return a[typeInfo?.key]||a.name||a.id;
  }

  // Find all projects / entries linked to this assetId
  const linkedProjects = assetId ? projects.filter(p =>
    (p.linkedAssets||[]).includes(assetId) ||
    [...(p.laborEntries||[]), ...(p.equipmentEntries||[]), ...(p.materialEntries||[]),
     ...(p.contractorEntries||[]), ...(p.engineeringEntries||[])].some(e=>(e.linkedAssets||[]).includes(assetId))
  ) : [];

  const grandTotal = linkedProjects.reduce((s,p)=>s+projectTotals(p).total,0);

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap", alignItems:"flex-end" }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:6 }}>Asset Type</div>
          <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
            {TYPES.map(t=>(
              <button key={t.id} onClick={()=>{ setAssetType(t.id); setAssetId(""); }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:assetType===t.id?"#1a3a5c":"#fff", color:assetType===t.id?"#fff":"#555" }}>{t.label}</button>
            ))}
          </div>
        </div>
        <Field label="Select Asset" style={{ minWidth:320 }}>
          <select value={assetId} onChange={e=>setAssetId(e.target.value)} style={{ ...inp, margin:0, fontSize:13 }}>
            <option value="">— Select —</option>
            {assetList.map(a=><option key={a.id} value={a.id}>{assetLabel(a,assetType)}</option>)}
          </select>
        </Field>
      </div>

      {!assetId && (
        <div style={{ padding:48, textAlign:"center", color:"#aaa", border:"1px dashed #ccc", borderRadius:8, fontSize:13 }}>
          Select an asset above to see its complete cost history across all projects.
        </div>
      )}

      {assetId && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>
              {assetLabel(assetList.find(a=>a.id===assetId)||{},assetType)}
            </div>
            <div style={{ fontSize:13, color:"#888" }}>
              {linkedProjects.length} project{linkedProjects.length!==1?"s":" "} · <strong>{fmtSm(grandTotal)}</strong> total
            </div>
          </div>

          {linkedProjects.length===0 && (
            <div style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13, background:"#fafaf8", borderRadius:8, border:"1px solid #eee" }}>
              No projects have this asset in their linked assets or cost entry asset lists yet.
            </div>
          )}

          {linkedProjects.length>0 && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:18 }}>
                {["labor","equip","material","contract","eng"].map((k,i)=>{
                  const labels=["Labor","Equipment","Materials","Contractor","Engineering"];
                  const colors=["#1a6b35","#1a3a5c","#d97706","#5a1a8a","#888"];
                  return <KPICard key={k} label={labels[i]} value={fmtSm(linkedProjects.reduce((s,p)=>s+projectTotals(p)[k],0))} sub="" accent={colors[i]} icon="coin" />;
                })}
              </div>
              <Table
                headers={[{label:"Project"},{label:"Type"},{label:"Status"},{label:"Labor"},{label:"Equipment"},{label:"Materials"},{label:"Contractor"},{label:"Engineering"},{label:"Total"}]}
                rows={linkedProjects.map(p=>{
                  const t=projectTotals(p);
                  return [
                    <span style={{fontWeight:700}}>{p.name||p.projectNumber||"—"}</span>,
                    <span style={{fontSize:12,textTransform:"capitalize"}}>{p.type}</span>,
                    <StatusChip status={p.status} />,
                    <span style={{fontFamily:"monospace",fontSize:12}}>{t.labor?fmtSm(t.labor):"—"}</span>,
                    <span style={{fontFamily:"monospace",fontSize:12}}>{t.equip?fmtSm(t.equip):"—"}</span>,
                    <span style={{fontFamily:"monospace",fontSize:12}}>{t.material?fmtSm(t.material):"—"}</span>,
                    <span style={{fontFamily:"monospace",fontSize:12}}>{t.contract?fmtSm(t.contract):"—"}</span>,
                    <span style={{fontFamily:"monospace",fontSize:12}}>{t.eng?fmtSm(t.eng):"—"}</span>,
                    <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(t.total)}</span>,
                  ];
                })}
                emptyMessage=""
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEMA RATES REFERENCE
// ═══════════════════════════════════════════════════════════════════════════════

function FEMARatesTab() {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>FEMA Equipment Rate Schedule</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Used for force account equipment cost documentation. Labor overhead multiplier: ×1.157 (15.7%)</div>
        </div>
      </div>

      <div style={{ background:"#fef3cd", border:"1px solid #f5c842", borderRadius:8, padding:"12px 18px", marginBottom:18, fontSize:13, display:"flex", gap:24, flexWrap:"wrap" }}>
        <div><span style={{ fontWeight:700, color:"#d97706" }}>Labor formula (FEMA):</span> (ST hrs × ST rate + OT hrs × OT rate) × <strong>1.157</strong></div>
        <div><span style={{ fontWeight:700, color:"#d97706" }}>Equipment formula:</span> hours × FEMA rate (no markup)</div>
        <div><span style={{ fontWeight:700, color:"#d97706" }}>Materials:</span> actual invoice cost (no markup)</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Equipment Type","Size / Class","Rate ($/hr)"].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:h==="Rate ($/hr)"?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEMA_EQUIPMENT_RATES.map((r,i)=>(
              <tr key={i} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={{ padding:"9px 14px", fontWeight:600 }}>{r.type}</td>
                <td style={{ padding:"9px 14px", fontSize:12, color:"#666" }}>{r.size}</td>
                <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#d97706" }}>${r.rate.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
