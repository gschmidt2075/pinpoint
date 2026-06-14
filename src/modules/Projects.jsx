import { useState, useMemo } from "react";
import { Field, SectionCard, Table, StatusBadge, Icon, AlertBar, inp, btn, fmt, fmtSm, pct, ProgressBar } from "../components/shared.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────
const PROJECT_TYPES_CAPITAL = [
  "Bridge Replacement","Bridge Repair","Culvert Replacement","Culvert Repair",
  "Road Resurfacing / Overlay","Road Reconstruction","Road Grading",
  "Drainage Improvement","Sign Installation","Traffic Safety",
  "Structure Replacement","Structure Repair","Other Capital",
];

const PROJECT_TYPES_MAINT = [
  "Culvert Replacement","Culvert Repair","Culvert Cleaning",
  "Bridge Repair","Grading / Gravel Road","Ditching / Drainage",
  "Crack Sealing","Mowing / Vegetation","Sign Installation",
  "Sign Replacement","Patching / Pothole Repair","Snow Removal",
  "Shoulder Work","Guardrail Repair","Other Maintenance",
];

const DEFAULT_FUND = "Roads Fund";

const ONE_SIX_YEARS = ["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6"];

const STATUS_FLOW = [
  { value:"planned",  label:"Planned",   color:"#888" },
  { value:"active",   label:"Active",    color:"#1a6b35" },
  { value:"complete", label:"Complete",  color:"#1a4a8a" },
  { value:"on_hold",  label:"On Hold",   color:"#d97706" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextMaintNumber(projects) {
  const year = new Date().getFullYear();
  const nums = (projects||[])
    .filter(p => p.type==="maintenance" && p.projectNumber?.startsWith(`M-${year}-`))
    .map(p => parseInt(p.projectNumber.split("-")[2])||0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `M-${year}-${String(next).padStart(2,"0")}`;
}

function projectCostTotal(p, costEntries=[]) {
  return costEntries
    .filter(e => e.projectNumber===p.projectNumber)
    .reduce((s,e) => s+(e.totalCost||0), 0);
}

function StatusChip({ status }) {
  const s = STATUS_FLOW.find(x=>x.value===status)||STATUS_FLOW[0];
  return <span style={{ background:s.color+"18", color:s.color, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>{s.label}</span>;
}

// ── Projects Module ───────────────────────────────────────────────────────────
export default function Projects({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  const capital  = (db.projects||[]).filter(p=>p.type==="capital");
  const maint    = (db.projects||[]).filter(p=>p.type==="maintenance");

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd", overflowX:"auto" }}>
        {[
          { id:"dashboard",  label:"Dashboard",        icon:"layout-dashboard" },
          { id:"capital",    label:`Capital Projects (${capital.length})`, icon:"building-skyscraper" },
          { id:"newCapital", label:"New Capital Project", icon:"plus" },
          { id:"maintenance",label:`Maintenance Jobs (${maint.length})`, icon:"tools" },
          { id:"newMaint",   label:"New Maintenance Job", icon:"plus" },
        ].map(t => (
          <button key={t.id} onClick={()=>setView(t.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px", whiteSpace:"nowrap",
            fontWeight: view===t.id?700:400, fontSize:13, cursor:"pointer",
            color: view===t.id?"#5a1a8a":"#666",
            borderBottom: view===t.id?"2px solid #5a1a8a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>{t.icon && <Icon name={t.icon} size={14} color={view===t.id?"#5a1a8a":"#888"} />}{t.label}</button>
        ))}
      </div>

      {view==="dashboard"  && <ProjectDashboard db={db} setView={setView} />}
      {view==="capital"    && <ProjectList db={db} dispatch={dispatch} type="capital" setView={setView} />}
      {view==="newCapital" && <ProjectForm db={db} dispatch={dispatch} type="capital" onDone={()=>setView("capital")} />}
      {view==="maintenance"&& <ProjectList db={db} dispatch={dispatch} type="maintenance" setView={setView} />}
      {view==="newMaint"   && <ProjectForm db={db} dispatch={dispatch} type="maintenance" onDone={()=>setView("maintenance")} />}

    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function ProjectDashboard({ db, setView }) {
  const all       = db.projects || [];
  const capital   = all.filter(p=>p.type==="capital");
  const maint     = all.filter(p=>p.type==="maintenance");
  const active    = all.filter(p=>p.status==="active");
  const planned   = all.filter(p=>p.status==="planned");
  const complete  = all.filter(p=>p.status==="complete");
  const fema      = all.filter(p=>p.isFEMA);

  const totalBudget = capital.reduce((s,p)=>s+(parseFloat(p.estimatedCost)||0),0);

  // Recent projects
  const recent = [...all].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,6);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Projects</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Capital Projects (C1-) · Maintenance Jobs (M-Year-#) · FEMA</div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Active",          value:active.length,     sub:"Currently underway",     accent:"#1a6b35",  id:"capital",      icon:"player-play" },
          { label:"Planned",         value:planned.length,    sub:"Not yet started",        accent:"#888",     id:"capital",      icon:"calendar-event" },
          { label:"Capital Projects",value:capital.length,    sub:"C1- numbered",           accent:"#5a1a8a",  id:"capital",      icon:"building-skyscraper" },
          { label:"Maintenance Jobs",value:maint.length,      sub:"M-Year-# numbered",      accent:"#6b3a1a",  id:"maintenance",  icon:"tools" },
          { label:"FEMA Projects",   value:fema.length,       sub:"Disaster reimbursement", accent:"#c0392b",  id:"capital",      icon:"alert-octagon" },
        ].map((k,i)=>(
          <button key={i} onClick={()=>setView(k.id)} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.accent}`, textAlign:"left", cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888" }}>{k.label}</div>
              {k.icon && <Icon name={k.icon} size={20} color={k.accent} style={{ opacity:0.35 }} />}
            </div>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"monospace", color:k.accent }}>{k.value}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Status breakdown */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>

        {/* Active projects */}
        <SectionCard title="Active Projects & Jobs" subtitle={`${active.length} underway`} icon="player-play">
          {active.length===0 ? (
            <div style={{ padding:"24px", textAlign:"center", color:"#aaa", fontSize:13 }}>No active projects</div>
          ) : (
            <Table
              headers={[{ label:"#" },{ label:"Name" },{ label:"Type" },{ label:"Assets" },{ label:"Status" }]}
              rows={active.map(p=>[
                <span style={{ fontFamily:"monospace", fontWeight:700, color:"#5a1a8a", fontSize:12 }}>{p.projectNumber}</span>,
                <span style={{ fontWeight:600, fontSize:13 }}>{p.projectType}</span>,
                <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 6px", borderRadius:4 }}>{p.projectType}</span>,
                <span style={{ fontSize:11, color:"#1a5a3a", fontFamily:"monospace" }}>{(p.linkedAssets||[]).slice(0,2).join(", ")}{(p.linkedAssets||[]).length>2?`+${(p.linkedAssets||[]).length-2}`:""}</span>,
                <StatusChip status={p.status} />,
              ])}
              emptyMessage="No active projects"
            />
          )}
        </SectionCard>

        {/* Planned projects */}
        <SectionCard title="Planned Projects & Jobs" subtitle={`${planned.length} upcoming`} icon="calendar-event">
          {planned.length===0 ? (
            <div style={{ padding:"24px", textAlign:"center", color:"#aaa", fontSize:13 }}>No planned projects</div>
          ) : (
            <Table
              headers={[{ label:"#" },{ label:"Name" },{ label:"Fund" },{ label:"Budget", right:true }]}
              rows={planned.map(p=>[
                <span style={{ fontFamily:"monospace", fontWeight:700, color:"#5a1a8a", fontSize:12 }}>{p.projectNumber}</span>,
                <span style={{ fontWeight:600, fontSize:13 }}>{p.projectType}</span>,
                <span style={{ fontSize:11, color:"#888" }}>{p.fundingSource||"Roads Fund"}</span>,
                p.estimatedCost>0 ? <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmt(p.estimatedCost)}</span> : "—",
              ])}
              emptyMessage="No planned projects"
            />
          )}
        </SectionCard>
      </div>

      {/* Recent */}
      <SectionCard title="Recently Added" subtitle={`${all.length} total projects and jobs`} icon="clock">
        <Table
          headers={[{ label:"Project #" },{ label:"Name" },{ label:"Type" },{ label:"Status" },{ label:"Start" },{ label:"End" }]}
          rows={recent.map(p=>[
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#5a1a8a", fontSize:12 }}>{p.projectNumber}</span>,
            <span style={{ fontWeight:600 }}>{p.name}</span>,
            <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 6px", borderRadius:4 }}>{p.projectType}</span>,
            <StatusChip status={p.status} />,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{p.startDate||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{p.endDate||"—"}</span>,
          ])}
          emptyMessage="No projects yet — click New Capital Project or New Maintenance Job to get started"
        />
      </SectionCard>
    </div>
  );
}

// ── Project List ──────────────────────────────────────────────────────────────
function ProjectList({ db, dispatch, type, setView }) {
  const [selected,   setSelected]  = useState(null);
  const [search,     setSearch]    = useState("");
  const [statusFilter, setStatus]  = useState("all");

  const projects = (db.projects||[]).filter(p=>p.type===type);
  const filtered = projects.filter(p => {
    if (statusFilter!=="all" && p.status!==statusFilter) return false;
    if (search && !`${p.projectNumber} ${p.projectType} ${p.workDescription||""} ${(p.linkedAssets||[]).join(" ")}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const label = type==="capital" ? "Capital Project" : "Maintenance Job";

  if (selected) return <ProjectDetail project={selected} db={db} dispatch={dispatch} onBack={()=>setSelected(null)} />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{type==="capital"?"Capital Projects":"Maintenance Jobs"}</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            {type==="capital" ? "C1- numbered · One and Six Year Plan" : "M-Year-# numbered · Own forces"}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, width:200, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all","planned","active","on_hold","complete"].map(s=>(
              <button key={s} onClick={()=>setStatus(s)} style={{ padding:"7px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:statusFilter===s?"#5a1a8a":"#fff", color:statusFilter===s?"#fff":"#555", textTransform:"capitalize" }}>
                {s.replace("_"," ")}
              </button>
            ))}
          </div>
          <button onClick={()=>setView(type==="capital"?"newCapital":"newMaint")} style={{ ...btn.primary, background:"#5a1a8a" }}>
            + New {label}
          </button>
        </div>
      </div>

      <SectionCard title={`${label}s (${filtered.length})`}>
        <Table
          headers={[
            { label:"Project #" },{ label:"Name" },{ label:"Type" },
            { label:"Location / Assets" },
            ...(type==="capital" ? [{ label:"Budget", right:true },{ label:"Fund" }] : []),
            { label:"Start" },{ label:"End" },{ label:"Status" },
            ...(type==="capital" ? [{ label:"FEMA" }] : []),
          ]}
          rows={filtered.map(p=>[
            <button onClick={()=>setSelected(p)} style={{ background:"none", border:"none", padding:0, color:"#5a1a8a", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>{p.projectNumber}</button>,
            <button onClick={()=>setSelected(p)} style={{ background:"none", border:"none", padding:0, color:"#1a3a5c", fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>{p.projectType}</button>,
            <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 6px", borderRadius:4 }}>{p.projectType}</span>,
            <div>
              {p.roadName && <div style={{ fontSize:12, color:"#555" }}>{p.roadName}</div>}
              {(p.linkedAssets||[]).length>0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:2 }}>
                  {(p.linkedAssets||[]).slice(0,3).map((a,i)=>(
                    <span key={i} style={{ fontFamily:"monospace", fontSize:10, background:"#e6f4ec", color:"#1a5a3a", padding:"1px 5px", borderRadius:3, fontWeight:600 }}>{a}</span>
                  ))}
                  {(p.linkedAssets||[]).length>3 && <span style={{ fontSize:10, color:"#888" }}>+{(p.linkedAssets||[]).length-3}</span>}
                </div>
              )}
            </div>,
            ...(type==="capital" ? [
              p.estimatedCost>0 ? <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmt(p.estimatedCost)}</span> : "—",
              <span style={{ fontSize:11, color:"#888" }}>{p.fundingSource||"Roads Fund"}</span>,
            ] : []),
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{p.startDate||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{p.endDate||"—"}</span>,
            <StatusChip status={p.status} />,
            ...(type==="capital" ? [
              p.isFEMA ? <span style={{ fontSize:10, background:"#fdecea", color:"#c0392b", padding:"2px 6px", borderRadius:4, fontWeight:600 }}>FEMA</span> : "—",
            ] : []),
          ])}
          emptyMessage={`No ${label.toLowerCase()}s yet`}
        />
      </SectionCard>
    </div>
  );
}

// ── Project Detail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, db, dispatch, onBack }) {
  const [editing,     setEditing]    = useState(false);
  const [statusForm,  setStatusForm] = useState({ status:project.status, completionNotes:"" });

  const current = (db.projects||[]).find(p=>p.id===project.id)||project;
  const label   = current.type==="capital" ? "Capital Project" : "Maintenance Job";

  // Pull cost entries from cost accounting that reference this project
  const costEntries = (db.projects||[]).find(p=>p.id===current.id);
  const laborTotal      = (current.laborEntries     ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const equipmentTotal  = (current.equipmentEntries ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const materialsTotal  = (current.materialEntries  ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const contractedTotal = (current.contractedEntries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const grandTotal      = laborTotal+equipmentTotal+materialsTotal+contractedTotal;
  const budget          = parseFloat(current.estimatedCost)||0;

  // Linked infrastructure assets
  const linkedRoads      = (db.roads      ||[]).filter(r=>(current.linkedAssets||[]).some(a=>a===r.name||a===r.altName));
  const linkedBridges    = (db.bridges    ||[]).filter(b=>(current.linkedAssets||[]).includes(b.countyNumber));
  const linkedStructures = (db.structures ||[]).filter(s=>(current.linkedAssets||[]).includes(s.assetId));

  const updateStatus = () => {
    dispatch({ type:"UPDATE_PROJECT", payload:{ ...current, status:statusForm.status, completionNotes: statusForm.completionNotes||current.completionNotes } });
    setEditing(false);
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to {label.toLowerCase()}s</button>

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:"#5a1a8a" }}>{current.projectNumber}</span>
              <StatusChip status={current.status} />
              {current.isFEMA && <span style={{ fontSize:11, background:"#fdecea", color:"#c0392b", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>FEMA {current.disasterNumber}</span>}
              {current.isOneSixYear && <span style={{ fontSize:11, background:"#e8f0fb", color:"#1a4a8a", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>1&6 Year Plan · {current.oneSixYear}</span>}
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a" }}>{current.projectType}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:2 }}>{current.projectType}</div>
            {current.workDescription && <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{current.workDescription}</div>}
          </div>
          <button onClick={()=>setEditing(!editing)} style={{ ...btn.primary, background:"#5a1a8a", fontSize:12 }}>Update Status</button>
        </div>

        {editing && (
          <div style={{ background:"#f3e8ff", border:"1px solid #c8a0e8", borderRadius:8, padding:16, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>Update Project Status</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12, marginBottom:12 }}>
              <Field label="Status">
                <select value={statusForm.status} onChange={e=>setStatusForm(s=>({...s,status:e.target.value}))} style={inp}>
                  {STATUS_FLOW.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              {statusForm.status==="complete" && (
                <Field label="Completion Notes">
                  <input type="text" placeholder="As-built notes, final quantities, warranty info…" value={statusForm.completionNotes} onChange={e=>setStatusForm(s=>({...s,completionNotes:e.target.value}))} style={inp} />
                </Field>
              )}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={updateStatus} style={{ ...btn.small, background:"#5a1a8a" }}>Save</button>
              <button onClick={()=>setEditing(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Cost summary — capital projects only */}
        {current.type==="capital" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginTop:16 }}>
            {[
              { label:"Budget",      value:budget>0?fmt(budget):"—",  color:"#5a1a8a" },
              { label:"Labor",       value:fmtSm(laborTotal),          color:"#1a3a5c" },
              { label:"Equipment",   value:fmtSm(equipmentTotal),      color:"#6b3a1a" },
              { label:"Materials",   value:fmtSm(materialsTotal),      color:"#1a6b35" },
              { label:"Contracted",  value:fmtSm(contractedTotal),     color:"#1a5a8a" },
            ].map((k,i)=>(
              <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"10px 14px", borderTop:`3px solid ${k.color}` }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
        {budget>0 && grandTotal>0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginBottom:4 }}>
              <span>Budget utilization</span>
              <span>{fmt(grandTotal)} of {fmt(budget)} ({pct(grandTotal,budget)}%)</span>
            </div>
            <ProgressBar value={pct(grandTotal,budget)} />
          </div>
        )}

        {/* Project details */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginTop:18 }}>
          {[
            { label:"Project Number",    value:current.projectNumber },
            { label:"Project Type",      value:current.projectType },
            { label:"Start Date",        value:current.startDate||"—" },
            { label:"End Date",          value:current.endDate||"—" },
            { label:"Funding Source",    value:current.fundingSource||"Roads Fund" },
            ...(current.type==="capital"?[
              { label:"NDOT Project #",  value:current.ndotNumber||"—" },
              { label:"Contractor",      value:current.contractor||"—" },
              { label:"Contract Amount", value:current.contractAmount>0?fmt(current.contractAmount):"—" },
              { label:"Bid Date",        value:current.bidDate||"—" },
            ]:[]),
            { label:"Road Name",         value:current.roadName||"—" },
            { label:"Road Segment(s)",    value:current.roadSegments||"—" },
            { label:"GPS",                value:current.gps||"—" },
          ].map((f,i)=>(
            <div key={i}>
              <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a", fontFamily: f.label.includes("#")||f.label.includes("Amount")||f.label.includes("GPS")?"monospace":"inherit" }}>{f.value}</div>
            </div>
          ))}
        </div>

        {current.completionNotes && (
          <div style={{ marginTop:14, padding:"10px 14px", background:"#e8f0fb", borderRadius:6, fontSize:13, color:"#1a4a8a" }}>
            <strong>Completion Notes:</strong> {current.completionNotes}
          </div>
        )}
      </div>

      {/* Linked assets */}
      {(current.linkedAssets||[]).length>0 && (
        <SectionCard title="Linked Infrastructure Assets" subtitle={`${(current.linkedAssets||[]).length} assets`} icon="link">
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"12px 18px" }}>
            {(current.linkedAssets||[]).map((a,i)=>{
              const bridge = (db.bridges||[]).find(b=>b.countyNumber===a);
              const struct = (db.structures||[]).find(s=>s.assetId===a);
              const road   = (db.roads||[]).find(r=>r.name===a||r.altName===a);
              const assetType = bridge?"Bridge":struct?struct.assetClass==="structure"?"Structure":"Culvert":road?"Road":"Asset";
              const assetColor = bridge?"#6b3a1a":struct?"#1a5a3a":road?"#1a3a5c":"#888";
              return (
                <div key={i} style={{ background:assetColor+"12", border:`1px solid ${assetColor}30`, borderRadius:8, padding:"8px 14px", minWidth:120 }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:assetColor, marginBottom:3 }}>{assetType}</div>
                  <div style={{ fontFamily:"monospace", fontWeight:700, color:assetColor, fontSize:14 }}>{a}</div>
                  {bridge && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{bridge.road}</div>}
                  {struct && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{struct.road}</div>}
                  {road   && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{road.surfType}</div>}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Completion notes if done */}
      {current.status==="complete" && current.completionNotes && (
        <SectionCard title="As-Built / Completion Notes">
          <div style={{ padding:"12px 18px", fontSize:13, color:"#555" }}>{current.completionNotes}</div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Project Form ──────────────────────────────────────────────────────────────
function ProjectForm({ db, dispatch, type, onDone, existing }) {
  const isCapital = type==="capital";
  const label     = isCapital ? "Capital Project" : "Maintenance Job";
  const funds     = [DEFAULT_FUND, ...(db.customFunds||[])];

  const empty = {
    projectType:"", workDescription:"",
    projectNumber: isCapital ? "C1-" : nextMaintNumber(db.projects),
    status:"planned", fundingSource:"Roads Fund",
    startDate:"", endDate:"",
    gps:"", linkedAssets:[], roadName:"", roadSegments:"",
    isFEMA:false, disasterNumber:"",
    // Capital only
    estimatedCost:"", ndotNumber:"", isOneSixYear:false, oneSixYear:"Year 1",
    contractor:"", contractAmount:"", bidDate:"",
    completionNotes:"",
  };

  const [form,         setForm]        = useState(existing||empty);
  const [assetInput,   setAssetInput]  = useState("");
  const [saved,        setSaved]       = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const addAsset = () => {
    if (!assetInput.trim()) return;
    set("linkedAssets", [...(form.linkedAssets||[]), assetInput.trim()]);
    setAssetInput("");
  };

  const removeAsset = (a) => set("linkedAssets", form.linkedAssets.filter(x=>x!==a));

  // Asset suggestions from db
  const allAssetIds = [
    ...(db.bridges||[]).map(b=>({ id:b.countyNumber, label:`Bridge · ${b.countyNumber} · ${b.road}` })),
    ...(db.structures||[]).map(s=>({ id:s.assetId, label:`${s.assetClass==="structure"?"Structure":"Culvert"} · ${s.assetId} · ${s.road||""}` })),
    ...(db.roads||[]).map(r=>({ id:r.name, label:`Road · ${r.name}` })),
  ].filter(a=>!form.linkedAssets?.includes(a.id)&&a.id.toLowerCase().includes(assetInput.toLowerCase()));

  const projectTypes = isCapital ? PROJECT_TYPES_CAPITAL : PROJECT_TYPES_MAINT;

  const handleSubmit = () => {
    if (!form.projectNumber || !form.projectType) return;
    dispatch({
      type: existing?"UPDATE_PROJECT":"ADD_PROJECT",
      payload:{
        ...form, id:existing?.id||Date.now(),
        type,
        estimatedCost: parseFloat(form.estimatedCost)||0,
        contractAmount: parseFloat(form.contractAmount)||0,
        createdAt: existing?.createdAt||new Date().toISOString(),
        laborEntries:     existing?.laborEntries     ||[],
        equipmentEntries: existing?.equipmentEntries ||[],
        materialEntries:  existing?.materialEntries  ||[],
        contractedEntries:existing?.contractedEntries||[],
      },
    });
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1500);
  };

  return (
    <div style={{ maxWidth:800 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{existing?`Edit ${label}`:`New ${label}`}</div>
          {!isCapital && <div style={{ fontSize:13, color:"#888", marginTop:2 }}>Auto-numbered: {form.projectNumber}</div>}
        </div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ {label} saved — redirecting…</div>}

      {/* Basic info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><Icon name={isCapital?"building-skyscraper":"tools"} size={16} color="#5a1a8a" />Project Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label={isCapital ? "C1 Number" : "Job Number"} required>
            <input type="text" value={form.projectNumber} onChange={e=>set("projectNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace", background:isCapital?"#fff":"#f7f7f5" }} readOnly={!isCapital} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              {STATUS_FLOW.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Project Type" required>
            <select value={form.projectType} onChange={e=>set("projectType",e.target.value)} style={inp}>
              <option value="">Select type…</option>
              {projectTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Funding Source">
            <select value={form.fundingSource} onChange={e=>set("fundingSource",e.target.value)} style={inp}>
              {funds.map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Work Description">
            <textarea rows={2} placeholder="Describe the scope of work — what specifically is being done…" value={form.workDescription} onChange={e=>set("workDescription",e.target.value)} style={{ ...inp, resize:"vertical" }} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <Field label="Start Date"><input type="date" value={form.startDate} onChange={e=>set("startDate",e.target.value)} style={inp} /></Field>
          <Field label="End Date"><input type="date" value={form.endDate} onChange={e=>set("endDate",e.target.value)} style={inp} /></Field>
          <Field label="GPS Coordinates"><input type="text" placeholder="40.350352, -98.614899" value={form.gps} onChange={e=>set("gps",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
      </div>

      {/* Capital-only fields */}
      {isCapital && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><Icon name="file-dollar" size={16} color="#5a1a8a" />Capital Project Details</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Estimated Budget ($)">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.estimatedCost} onChange={e=>set("estimatedCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <Field label="NDOT Project Number">
              <input type="text" placeholder="NDOT assigned #…" value={form.ndotNumber} onChange={e=>set("ndotNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end", paddingBottom:2 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <input type="checkbox" id="oneSix" checked={form.isOneSixYear} onChange={e=>set("isOneSixYear",e.target.checked)} style={{ width:14,height:14 }} />
                <label htmlFor="oneSix" style={{ fontSize:13, fontWeight:600, color:"#444", cursor:"pointer" }}>On One and Six Year Plan</label>
              </div>
              {form.isOneSixYear && (
                <select value={form.oneSixYear} onChange={e=>set("oneSixYear",e.target.value)} style={inp}>
                  {ONE_SIX_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
            <Field label="Contractor">
              <input type="text" placeholder="Contractor name…" value={form.contractor} onChange={e=>set("contractor",e.target.value)} style={inp} />
            </Field>
            <Field label="Contract Amount ($)">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.contractAmount} onChange={e=>set("contractAmount",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <Field label="Bid Date">
              <input type="date" value={form.bidDate} onChange={e=>set("bidDate",e.target.value)} style={inp} />
            </Field>
          </div>
        </div>
      )}

      {/* Infrastructure asset links */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}><Icon name="link" size={16} color="#1a5a3a" />Linked Infrastructure Assets</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Link this project to specific roads, bridges, structures, or culverts by their asset ID</div>
        <div style={{ position:"relative", marginBottom:12 }}>
          <div style={{ display:"flex", gap:10 }}>
            <input
              type="text"
              placeholder="Type asset ID or name… (e.g. N 36.1, A 1.2, County Road 14)"
              value={assetInput}
              onChange={e=>setAssetInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addAsset()}
              style={{ ...inp, flex:1 }}
            />
            <button onClick={addAsset} style={{ ...btn.small, background:"#5a1a8a", padding:"9px 16px" }}>+ Add</button>
          </div>
          {/* Suggestions dropdown */}
          {assetInput.length>0 && allAssetIds.length>0 && (
            <div style={{ position:"absolute", top:"100%", left:0, right:60, background:"#fff", border:"1px solid #ddd", borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", zIndex:100, maxHeight:200, overflowY:"auto" }}>
              {allAssetIds.slice(0,8).map((a,i)=>(
                <button key={i} onClick={()=>{ set("linkedAssets",[...(form.linkedAssets||[]),a.id]); setAssetInput(""); }} style={{ display:"block", width:"100%", padding:"9px 14px", background:"none", border:"none", textAlign:"left", cursor:"pointer", fontSize:12, borderBottom:"1px solid #f0f0ee" }}>
                  <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a5a3a" }}>{a.id}</span>
                  <span style={{ color:"#888", marginLeft:8 }}>{a.label.split("·").slice(1).join("·")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {(form.linkedAssets||[]).length>0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {form.linkedAssets.map((a,i)=>(
              <span key={i} style={{ background:"#e6f4ec", color:"#1a5a3a", padding:"5px 12px", borderRadius:16, fontSize:12, fontWeight:600, fontFamily:"monospace", display:"flex", alignItems:"center", gap:6 }}>
                {a}
                <button onClick={()=>removeAsset(a)} style={{ background:"none", border:"none", color:"#1a5a3a", cursor:"pointer", padding:0, fontSize:14, lineHeight:1 }}>×</button>
              </span>
            ))}
          </div>
        )}
        {(form.linkedAssets||[]).length===0 && (
          <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>No assets linked yet — type an ID above or leave blank for general projects</div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:14 }}>
          <Field label="Primary Road Name">
            <input type="text" placeholder="e.g. County Road 14, 100 E. 26th Street…" value={form.roadName} onChange={e=>set("roadName",e.target.value)} style={inp} />
          </Field>
          <Field label="Road Segment(s)">
            <input type="text" placeholder="e.g. Mile 0.0 to 2.3, CR14 Section 3…" value={form.roadSegments||""} onChange={e=>set("roadSegments",e.target.value)} style={inp} />
          </Field>
        </div>
      </div>

      {/* FEMA */}
      <div style={{ background: form.isFEMA?"#fef8f5":"#fff", border:`1px solid ${form.isFEMA?"#e8c4a8":"#ddd"}`, borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:form.isFEMA?14:0 }}>
          <input type="checkbox" id="fema" checked={form.isFEMA} onChange={e=>set("isFEMA",e.target.checked)} style={{ width:16,height:16 }} />
          <label htmlFor="fema" style={{ fontSize:13, fontWeight:700, color:form.isFEMA?"#c0392b":"#444", cursor:"pointer" }}>
  <Icon name="alert-octagon" size={14} color={form.isFEMA?"#c0392b":"#444"} /> FEMA Disaster Project — activate force account record tracking
          </label>
        </div>
        {form.isFEMA && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="FEMA Disaster Declaration Number">
              <input type="text" placeholder="e.g. DR-4567-NE" value={form.disasterNumber} onChange={e=>set("disasterNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <div style={{ background:"#fdecea", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#8c1b18" }}>
              ⚠️ FEMA mode — all labor, equipment, and material entries will be formatted as force account records
            </div>
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#5a1a8a" }}>Save {label}</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Manage Funds ──────────────────────────────────────────────────────────────
function ManageFunds({ db, dispatch }) {
  const [newFund, setNewFund] = useState("");
  const customFunds = db.customFunds || [];

  const addFund = () => {
    if (!newFund.trim()) return;
    dispatch({ type:"ADD_CUSTOM_FUND", payload:newFund.trim() });
    setNewFund("");
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Manage Funds</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Add custom fund names that appear across Fund Accounting and Projects</div>
      </div>

      {/* Default funds */}
      <SectionCard title="Default Funds" subtitle="Built-in fund options">
        <div style={{ padding:"12px 18px" }}>
          {DEFAULT_FUNDS.map((f,i)=>(
            <div key={i} style={{ padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, color:"#555", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:"#1a3a5c", display:"inline-block", flexShrink:0 }}></span>
              {f}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Add custom fund */}
      <SectionCard title="Custom Funds" subtitle={`${customFunds.length} added`}>
        <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
          <div style={{ display:"flex", gap:10 }}>
            <input
              type="text"
              placeholder="e.g. NDOT Enhancement Grant 2027, RAISE Grant, Centennial Rd Fund…"
              value={newFund}
              onChange={e=>setNewFund(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addFund()}
              style={{ ...inp, flex:1 }}
            />
            <button onClick={addFund} style={{ ...btn.primary, background:"#5a1a8a" }}>Add Fund</button>
          </div>
        </div>
        {customFunds.length===0 ? (
          <div style={{ padding:"24px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>No custom funds yet — type a name above and click Add Fund</div>
        ) : (
          <div style={{ padding:"12px 18px" }}>
            {customFunds.map((f,i)=>(
              <div key={i} style={{ padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, color:"#1a1a1a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:"#5a1a8a", display:"inline-block", flexShrink:0 }}></span>
                  {f}
                </div>
                <button onClick={()=>dispatch({ type:"REMOVE_CUSTOM_FUND", payload:f })} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 8px" }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
