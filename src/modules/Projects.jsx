import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, StatusBadge, inp, btn, fmt, fmtSm, pct, ProgressBar, DateField, titleCase, MoneyField } from "../components/shared.jsx";
import { useUnsavedForm, useNavigationGuard } from "../components/unsaved.jsx";
import { createProject } from "../data/schema.js";
import { FISCAL_YEAR } from "../data/accountCodes.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const PROJECT_TYPES_CAPITAL = [
  "Bridge Replacement","Bridge Repair","Bridge Deck Overlay",
  "Culvert Replacement","Culvert Repair","Culvert Extension",
  "Road Resurfacing / Overlay","Road Reconstruction","Road Widening",
  "Drainage Improvement","Ditch / Waterway","Grading",
  "Sign Installation","Traffic Safety","Guardrail",
  "Structure Replacement","Structure Repair","Other Capital",
];
const PROJECT_TYPES_MAINT = [
  "Culvert Replacement","Culvert Repair","Culvert Cleaning",
  "Bridge Repair","Gravel Road — Grading / Shaping","Ditching / Drainage",
  "Crack Sealing","Chip Seal","Patching / Pothole Repair",
  "Mowing / Vegetation Control","Snow Removal","Shoulder Work",
  "Sign Installation","Sign Replacement","Guardrail Repair",
  "Structure Repair","Other Maintenance",
];
const FUNDING_SOURCES = [
  "Roads Fund","NDOT / STP","NDOT / STBG","FEMA PA","FEMA BRIC",
  "CDBG","Local Match","Bridge Program","County Bond","Other",
];
const ONE_SIX_YEARS = ["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6"];

const STATUS_META = {
  planning: { label:"Planning",  color:"#888",    bg:"#f0f0ee" },
  pending:  { label:"Pending",   color:"#d97706", bg:"#fef3cd" },
  active:   { label:"Active",    color:"#1a6b35", bg:"#e6f4ec" },
  complete: { label:"Complete",  color:"#1a3a5c", bg:"#e8f0f8" },
  on_hold:  { label:"On Hold",   color:"#c0392b", bg:"#fdecea" },
};
function Chip({ status }) {
  const m = STATUS_META[status] || { label: status, color:"#888", bg:"#f0f0f0" };
  return <span style={{ background:m.bg, color:m.color, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700 }}>{m.label}</span>;
}

// ── Cost totals helper ────────────────────────────────────────────────────────
function projectTotals(p) {
  const labor       = (p.laborEntries      ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const equipment   = (p.equipmentEntries  ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const materials   = (p.materialEntries   ||[]).reduce((s,e)=>s+(e.totalCost||0),0);
  const contractor  = (p.contractorEntries ||[]).reduce((s,e)=>s+(e.totalAmount||0),0);
  const engineering = (p.engineeringEntries||[]).reduce((s,e)=>s+(e.amount||0),0);
  const total = labor + equipment + materials + contractor + engineering;
  return { labor, equipment, materials, contractor, engineering, total };
}

function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

function nextMaintNumber(projects) {
  const year = new Date().getFullYear();
  const prefix = `M-${year}-`;
  const existing = projects
    .filter(p => p.projectNumber && p.projectNumber.startsWith(prefix))
    .map(p => parseInt(p.projectNumber.replace(prefix,"")) || 0);
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}${String(max + 1).padStart(2,"0")}`;
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Projects({ db, dispatch }) {
  const [view, setView]             = useState("dashboard");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatus]   = useState("active");
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew]       = useState(false);
  const [newType, setNewType]       = useState("capital");

  const projects = db.projects || [];

  const filtered = useMemo(() => projects.filter(p => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  }), [projects, typeFilter, statusFilter]);

  const selected = projects.find(p => p.id === selectedId);

  if (showNew) {
    return (
      <ProjectForm
        type={newType}
        projects={projects}
        assets={db.infrastructureAssets || []}
        equipment={db.equipment || []}
        onSave={payload => {
          dispatch({ type:"ADD_PROJECT", payload });
          setSelectedId(payload.id);
          setShowNew(false);
          setView("detail");
        }}
        onCancel={() => setShowNew(false)}
      />
    );
  }

  if (view === "detail" && selected) {
    return (
      <ProjectDetail
        project={selected}
        db={db}
        dispatch={dispatch}
        onBack={() => { setView("list"); setSelectedId(null); }}
        onEdit={updated => dispatch({ type:"UPDATE_PROJECT", payload: updated })}
      />
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Projects</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{FISCAL_YEAR.label} · Capital · Maintenance · Miscellaneous</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[["capital","Capital","#1a3a5c"],["maintenance","Maintenance","#1a5a3a"],["miscellaneous","Miscellaneous","#5a1a8a"]].map(([t,l,c])=>(
            <button key={t} onClick={()=>{ setNewType(t); setShowNew(true); }}
              style={{ ...btn.small, background:c, fontSize:11 }}>+ {l}</button>
          ))}
        </div>
      </div>

      <ProjectDashboard projects={projects} />

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All Types"],["capital","Capital"],["maintenance","Maintenance"],["miscellaneous","Misc"]].map(([v,l])=>(
            <button key={v} onClick={()=>setTypeFilter(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:typeFilter===v?"#1a3a5c":"#fff", color:typeFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All"],["planning","Planning"],["pending","Pending"],["active","Active"],["complete","Complete"],["on_hold","On Hold"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStatus(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:statusFilter===v?"#1a6b35":"#fff", color:statusFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize:12, color:"#888" }}>{filtered.length} project{filtered.length!==1?"s":""}</span>
      </div>

      {filtered.length === 0
        ? <div style={{ background:"#f9f9f7", border:"1px dashed #ccc", borderRadius:8, padding:48, textAlign:"center", color:"#aaa", fontSize:14 }}>
            No projects match this filter.
          </div>
        : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:14 }}>
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onClick={()=>{ setSelectedId(p.id); setView("detail"); }} />
            ))}
          </div>
      }
    </div>
  );
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
function ProjectDashboard({ projects }) {
  const capital     = projects.filter(p=>p.type==="capital"&&p.status==="active");
  const maintenance = projects.filter(p=>p.type==="maintenance"&&p.status==="active");
  const misc        = projects.filter(p=>p.type==="miscellaneous"&&p.status==="active");
  const totalSpent  = projects.reduce((s,p)=>s+projectTotals(p).total,0);
  const totalBudget = projects.filter(p=>p.type==="capital").reduce((s,p)=>s+(p.estimatedCost||0),0);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
      <KPICard label="Active Capital"     value={capital.length}     sub="Projects"       accent="#1a3a5c" icon="building-bridge" />
      <KPICard label="Active Maintenance" value={maintenance.length} sub="Projects"       accent="#1a5a3a" icon="tool" />
      <KPICard label="Active Misc"        value={misc.length}        sub="Projects"       accent="#5a1a8a" icon="clipboard-list" />
      <KPICard label="Total Expended"     value={fmtSm(totalSpent)}  sub="All projects"  accent="#1a1a1a" icon="coin" />
      <KPICard label="Capital Budget"     value={fmt(totalBudget)}   sub="Est. cost"     accent="#888"    icon="chart-bar" />
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project: p, onClick }) {
  const totals    = projectTotals(p);
  const typeColor = p.type==="capital"?"#1a3a5c":p.type==="maintenance"?"#1a5a3a":"#5a1a8a";
  const typeLabel = p.type==="capital"?"CAPITAL":p.type==="maintenance"?"MAINTENANCE":"MISC";
  const budget    = p.estimatedCost || 0;

  return (
    <div onClick={onClick} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:18, cursor:"pointer", display:"flex", flexDirection:"column", gap:10 }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.1)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:typeColor, marginBottom:3 }}>{typeLabel}</div>
          {p.projectNumber && <div style={{ fontSize:11, fontFamily:"monospace", color:"#888", marginBottom:3 }}>{p.projectNumber}</div>}
          <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", lineHeight:1.3 }}>{p.name || p.workDescription || "—"}</div>
        </div>
        <Chip status={p.status} />
      </div>

      {p.roadName && (
        <div style={{ fontSize:12, color:"#666" }}>
          <Icon name="road" size={11} color="#aaa" /> {p.roadName}
          {p.roadSegments && <span style={{ color:"#aaa" }}> · {p.roadSegments}</span>}
        </div>
      )}

      <div style={{ display:"flex", gap:14, fontSize:12, color:"#888" }}>
        {p.startDate && <span><Icon name="calendar" size={11} color="#aaa" /> {fmtDate(p.startDate)}</span>}
        {(p.isFEMA||p.isNDOT) && <span style={{ fontWeight:600, color:"#d97706" }}>{p.isFEMA?"FEMA":"NDOT"}</span>}
      </div>

      <div style={{ borderTop:"1px solid #f0f0ee", paddingTop:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
          <span style={{ color:"#888" }}>Expended</span>
          <div style={{ display:"flex", gap:12 }}>
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(totals.total)}</span>
            {budget > 0 && <span style={{ color:"#aaa" }}>of {fmt(budget)}</span>}
          </div>
        </div>
        {budget > 0 && <ProgressBar value={pct(totals.total, budget)} />}
        {budget === 0 && totals.total === 0 && <div style={{ fontSize:11, color:"#bbb", textAlign:"center" }}>No cost entries yet</div>}
      </div>

      {totals.total > 0 && (
        <div style={{ display:"flex", gap:10, fontSize:11 }}>
          {[["L",totals.labor,"#1a6b35"],["E",totals.equipment,"#1a3a5c"],["M",totals.materials,"#5a1a8a"],["C",totals.contractor,"#d97706"]].map(([abbr,val,color])=>
            val > 0 ? <span key={abbr} style={{ color }}>{abbr}: {fmtSm(val)}</span> : null
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Detail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, db, dispatch, onBack, onEdit }) {
  const go = useNavigationGuard();
  const [tab, setTab]       = useState("overview");
  const [editing, setEditing] = useState(false);
  const totals = projectTotals(project);

  if (editing) {
    return (
      <ProjectForm
        project={project}
        projects={db.projects||[]}
        assets={db.infrastructureAssets||[]}
        equipment={db.equipment||[]}
        onSave={updated => { onEdit(updated); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const typeColor = project.type==="capital"?"#1a3a5c":project.type==="maintenance"?"#1a5a3a":"#5a1a8a";
  const typeLabel = project.type==="capital"?"CAPITAL":project.type==="maintenance"?"MAINTENANCE":"MISCELLANEOUS";

  const TABS = [
    { id:"overview",    label:"Overview",     icon:"info-circle" },
    { id:"labor",       label:"Labor",        icon:"user-check" },
    { id:"equipment",   label:"Equipment",    icon:"tractor" },
    { id:"materials",   label:"Materials",    icon:"package" },
    { id:"contractor",  label:"Contractor",   icon:"building-factory-2" },
    { id:"engineering", label:"Engineering",  icon:"ruler-2" },
    { id:"summary",     label:"Cost Summary", icon:"chart-pie" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px", marginBottom:14 }}>← All Projects</button>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:16 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:typeColor, marginBottom:3 }}>{typeLabel}</div>
          {project.projectNumber && <div style={{ fontSize:12, fontFamily:"monospace", color:"#888", marginBottom:4 }}>{project.projectNumber}</div>}
          <div style={{ fontSize:20, fontWeight:700 }}>{project.name || project.workDescription || "Untitled"}</div>
          {project.roadName && <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{project.roadName}{project.roadSegments?` · ${project.roadSegments}`:""}</div>}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <Chip status={project.status} />
          <StatusAdvanceButton project={project} dispatch={dispatch} />
          <button onClick={()=>setEditing(true)} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
        <KPICard label="Labor"      value={fmtSm(totals.labor)}      sub="" accent="#1a6b35" icon="user-check" />
        <KPICard label="Equipment"  value={fmtSm(totals.equipment)}  sub="" accent="#1a3a5c" icon="tractor" />
        <KPICard label="Materials"  value={fmtSm(totals.materials)}  sub="" accent="#5a1a8a" icon="package" />
        <KPICard label="Contractor" value={fmtSm(totals.contractor)} sub="" accent="#d97706" icon="building-factory-2" />
        <KPICard label="Total"      value={fmtSm(totals.total)}      sub={project.estimatedCost?`of ${fmt(project.estimatedCost)} est.`:""} accent="#1a1a1a" icon="coin" />
      </div>

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:24, overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => go(() => setTab(t.id))} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight:tab===t.id?700:400, fontSize:13, cursor:"pointer",
            color:tab===t.id?"#1a5a3a":"#666",
            borderBottom:tab===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={12} color={tab===t.id?"#1a5a3a":"#888"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab==="overview"   && <ProjectOverview project={project} totals={totals} />}
      {tab==="labor"      && <LaborTab       project={project} db={db} dispatch={dispatch} />}
      {tab==="equipment"  && <EquipmentTab   project={project} db={db} dispatch={dispatch} />}
      {tab==="materials"  && <MaterialsTab   project={project} db={db} dispatch={dispatch} />}
      {tab==="contractor" && <ContractorTab  project={project} dispatch={dispatch} />}
      {tab==="engineering"&& <EngineeringTab project={project} dispatch={dispatch} />}
      {tab==="summary"    && <CostSummaryTab project={project} totals={totals} />}
    </div>
  );
}

function StatusAdvanceButton({ project, dispatch }) {
  const NEXT = { planning:"pending", pending:"active", active:"complete" };
  const next = NEXT[project.status];
  if (!next) return null;
  const labels = { pending:"→ Pending", active:"→ Active", complete:"→ Complete" };
  const colors = { pending:"#d97706", active:"#1a6b35", complete:"#1a3a5c" };
  return (
    <button onClick={()=>dispatch({ type:"UPDATE_PROJECT", payload:{ ...project, status:next, endDate:next==="complete"?new Date().toISOString().split("T")[0]:project.endDate } })}
      style={{ ...btn.small, background:colors[next], fontSize:11 }}>
      {labels[next]}
    </button>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function ProjectOverview({ project: p, totals }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      <SectionCard title="Project Details">
        <div style={{ padding:"0 2px" }}>
          {[
            ["Type",       p.type.charAt(0).toUpperCase()+p.type.slice(1)],
            ["Project #",  p.projectNumber||"—"],
            ["Work Type",  p.projectType||"—"],
            ["Funding",    p.fundingSource||"—"],
            ["Start",      fmtDate(p.startDate)],
            ["End",        fmtDate(p.endDate)],
            ...(p.type==="capital"?[
              ["Est. Cost",   fmt(p.estimatedCost||0)],
              ["Contractor",  p.contractor||"—"],
              ["Contract $",  p.contractAmount?fmt(p.contractAmount):"—"],
              ["Bid Date",    fmtDate(p.bidDate)],
              ["1–6 Year",    p.isOneSixYear?p.oneSixYear:"No"],
            ]:[]),
            ...(p.type==="miscellaneous"?[["Calendar Year",String(p.calendarYear)]]:[]),
          ].map(([label,val])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
              <span style={{ color:"#666" }}>{label}</span>
              <span style={{ fontWeight:600 }}>{val}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <SectionCard title="Location">
          <div style={{ padding:"10px 2px", fontSize:13 }}>
            {p.roadName    && <div style={{ marginBottom:5 }}><strong>Road:</strong> {p.roadName}</div>}
            {p.roadSegments&& <div style={{ marginBottom:5 }}><strong>Segment:</strong> {p.roadSegments}</div>}
            {p.gps         && <div><strong>GPS:</strong> <span style={{ fontFamily:"monospace", fontSize:12 }}>{p.gps}</span></div>}
            {!p.roadName&&!p.roadSegments&&!p.gps && <span style={{ color:"#aaa" }}>No location set</span>}
          </div>
        </SectionCard>

        {(p.isFEMA||p.isNDOT) && (
          <SectionCard title="Federal / State">
            <div style={{ padding:"10px 2px", fontSize:13 }}>
              {p.isFEMA && <div style={{ marginBottom:5 }}><strong>FEMA Disaster #:</strong> {p.disasterNumber||"—"}</div>}
              {p.isNDOT && <div style={{ marginBottom:5 }}><strong>NDOT Project #:</strong> {p.ndotNumber||"—"}</div>}
              <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:5, padding:"8px 12px", fontSize:12, color:"#7a4f00", marginTop:8 }}>
                Force account documentation required — see Cost Summary tab.
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Work Description">
          <div style={{ padding:"10px 2px", fontSize:13, color:p.workDescription?"#1a1a1a":"#aaa", lineHeight:1.6 }}>
            {p.workDescription || "No description entered."}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Labor tab ─────────────────────────────────────────────────────────────────
function LaborTab({ project, db, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const entries    = project.laborEntries || [];
  const totalHours = entries.reduce((s,e)=>s+(e.hoursWorked||0),0);
  const totalCost  = entries.reduce((s,e)=>s+(e.totalCost||0),0);
  const femaTotal  = entries.reduce((s,e)=>s+(e.femaTotal||0),0);

  if (showForm||editEntry) {
    return <LaborEntryForm entry={editEntry} onSave={entry=>{ dispatch({ type:editEntry?"UPDATE_PROJECT_ENTRY":"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"laborEntries", entry } }); setShowForm(false); setEditEntry(null); }} onCancel={()=>{ setShowForm(false); setEditEntry(null); }} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", gap:20, fontSize:13 }}>
          <span>Hours: <strong>{totalHours.toFixed(1)}</strong></span>
          <span>Labor cost: <strong style={{ color:"#1a6b35" }}>{fmtSm(totalCost)}</strong></span>
          {femaTotal>0 && <span>FEMA total: <strong style={{ color:"#d97706" }}>{fmtSm(femaTotal)}</strong></span>}
        </div>
        <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Labor Entry</button>
      </div>
      <Table
        headers={[{label:"Date"},{label:"Employee"},{label:"Hours"},{label:"Rate"},{label:"Labor Cost"},{label:"FEMA Rate"},{label:"FEMA Total"},{label:"Segment"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.employeeName||"—",
          <span style={{fontFamily:"monospace"}}>{e.hoursWorked}</span>,
          <span style={{fontFamily:"monospace"}}>{fmtSm(e.hourlyRate||0)}</span>,
          <span style={{fontFamily:"monospace",fontWeight:600}}>{fmtSm(e.totalCost||0)}</span>,
          <span style={{fontFamily:"monospace",color:"#d97706"}}>{e.femaRate?fmtSm(e.femaRate):"/hr —"}</span>,
          <span style={{fontFamily:"monospace",color:"#d97706"}}>{e.femaTotal?fmtSm(e.femaTotal):"—"}</span>,
          <span style={{fontSize:11,color:"#888"}}>{(e.linkedAssets||[]).join(", ")||"—"}</span>,
          <button onClick={()=>setEditEntry(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"4px 10px"}}>Edit</button>,
        ])}
        emptyMessage="No labor entries yet"
      />
    </div>
  );
}

function LaborEntryForm({ entry, onSave, onCancel }) {
  const FEMA_OVH = 1.157;
  const [form, setForm] = useState({
    id:           entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    date:         entry?.date || "",
    employeeName: entry?.employeeName || "",
    hoursWorked:  entry?.hoursWorked ?? "",
    hourlyRate:   entry?.hourlyRate ?? "",
    femaRate:     entry?.femaRate ?? "",
    linkedAssets: entry?.linkedAssets || [],
    notes:        entry?.notes || "",
    createdAt:    entry?.createdAt || new Date().toISOString(),
  });
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const laborCost = (parseFloat(form.hoursWorked)||0) * (parseFloat(form.hourlyRate)||0);
  const femaTotal = (parseFloat(form.hoursWorked)||0) * (parseFloat(form.femaRate)||0) * FEMA_OVH;

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{entry?"Edit":"Add"} Labor Entry</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>
          <Field label="Employee" required><input type="text" value={form.employeeName} onChange={e=>set("employeeName",e.target.value)} style={inp} /></Field>
          <Field label="Hours" required><input type="number" min="0" step="0.25" value={form.hoursWorked} onChange={e=>set("hoursWorked",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Hourly Rate ($)" required><MoneyField value={form.hourlyRate} onChange={v=>set("hourlyRate",v)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Labor Cost"><div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:"#1a6b35" }}>{fmtSm(laborCost)}</div></Field>
          <Field label="FEMA ST Rate ($/hr)"><MoneyField value={form.femaRate} onChange={v=>set("femaRate",v)} placeholder="Schedule rate…" style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="FEMA Total (15.7% OVH)"><div style={{ ...inp, background:"#fef3cd", fontFamily:"monospace", fontWeight:700, color:"#d97706" }}>{parseFloat(form.femaRate)>0?fmtSm(femaTotal):"—"}</div></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14 }}>
          <Field label="Road Segment / Asset"><input type="text" value={(form.linkedAssets||[]).join(", ")} onChange={e=>set("linkedAssets",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inp} placeholder="Road 14 — MP 2.1 to 3.4…" /></Field>
          <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave({ ...form, hoursWorked:parseFloat(form.hoursWorked)||0, hourlyRate:parseFloat(form.hourlyRate)||0, femaRate:parseFloat(form.femaRate)||0, totalCost:laborCost, femaTotal:parseFloat(form.femaRate)>0?femaTotal:0 })} style={btn.primary}>{entry?"Save":"Add Entry"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Equipment tab ─────────────────────────────────────────────────────────────
function EquipmentTab({ project, db, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const entries  = project.equipmentEntries || [];
  const units    = db.equipment || [];
  const totalCost= entries.reduce((s,e)=>s+(e.totalCost||0),0);

  if (showForm||editEntry) {
    return <EquipmentEntryForm entry={editEntry} units={units} onSave={entry=>{ dispatch({ type:editEntry?"UPDATE_PROJECT_ENTRY":"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"equipmentEntries", entry } }); setShowForm(false); setEditEntry(null); }} onCancel={()=>{ setShowForm(false); setEditEntry(null); }} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13 }}>Total equipment cost: <strong style={{ color:"#1a3a5c" }}>{fmtSm(totalCost)}</strong></div>
        <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Equipment Entry</button>
      </div>
      <Table
        headers={[{label:"Date"},{label:"Unit"},{label:"Hours"},{label:"FEMA Rate"},{label:"Total"},{label:"Operator"},{label:"Segment"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.equipmentName||"—",
          <span style={{fontFamily:"monospace"}}>{e.hoursOperated}</span>,
          <span style={{fontFamily:"monospace",color:"#d97706"}}>{e.femaRate?`${fmtSm(e.femaRate)}/hr`:"—"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:600}}>{fmtSm(e.totalCost||0)}</span>,
          e.operatorName||"—",
          <span style={{fontSize:11,color:"#888"}}>{(e.linkedAssets||[]).join(", ")||"—"}</span>,
          <button onClick={()=>setEditEntry(e)} style={{...btn.small,background:"#1a3a5c",fontSize:10,padding:"4px 10px"}}>Edit</button>,
        ])}
        emptyMessage="No equipment entries yet"
      />
    </div>
  );
}

function EquipmentEntryForm({ entry, units, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:            entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    date:          entry?.date || "",
    equipmentId:   entry?.equipmentId || "",
    equipmentName: entry?.equipmentName || "",
    unitNumber:    entry?.unitNumber || "",
    hoursOperated: entry?.hoursOperated ?? "",
    femaRate:      entry?.femaRate ?? "",
    operatorName:  entry?.operatorName || "",
    linkedAssets:  entry?.linkedAssets || [],
    notes:         entry?.notes || "",
    createdAt:     entry?.createdAt || new Date().toISOString(),
  });
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const totalCost = (parseFloat(form.hoursOperated)||0) * (parseFloat(form.femaRate)||0);

  const handleUnitSelect = uid => {
    const u = units.find(u=>u.id===uid);
    if (u) { set("equipmentId",u.id); set("equipmentName",`${u.year||""} ${u.make||""} ${u.model||""}`.trim()||u.unitNumber); set("unitNumber",u.unitNumber||""); set("femaRate",u.femaRate||""); }
    else { set("equipmentId",uid); }
  };

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{entry?"Edit":"Add"} Equipment Entry</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:14, marginBottom:14 }}>
          <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>
          <Field label="Equipment Unit" required>
            <select value={form.equipmentId} onChange={e=>handleUnitSelect(e.target.value)} style={inp}>
              <option value="">Select unit…</option>
              {units.map(u=><option key={u.id} value={u.id}>{u.unitNumber?`${u.unitNumber} — `:""}{u.year||""} {u.make||""} {u.model||""}</option>)}
              <option value="__manual__">Other / Manual entry</option>
            </select>
          </Field>
        </div>
        {form.equipmentId==="__manual__" && (
          <div style={{ marginBottom:14 }}>
            <Field label="Description"><input type="text" value={form.equipmentName} onChange={e=>set("equipmentName",e.target.value)} style={inp} placeholder="Year Make Model…" /></Field>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Hours" required><input type="number" min="0" step="0.25" value={form.hoursOperated} onChange={e=>set("hoursOperated",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="FEMA Rate ($/hr)"><MoneyField value={form.femaRate} onChange={v=>set("femaRate",v)} style={{ ...inp, fontFamily:"monospace", color:"#d97706" }} /></Field>
          <Field label="Total Cost"><div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(totalCost)}</div></Field>
          <Field label="Operator"><input type="text" value={form.operatorName} onChange={e=>set("operatorName",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14 }}>
          <Field label="Segment / Asset"><input type="text" value={(form.linkedAssets||[]).join(", ")} onChange={e=>set("linkedAssets",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inp} placeholder="Road 14 — MP 2.1 to 3.4" /></Field>
          <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave({ ...form, hoursOperated:parseFloat(form.hoursOperated)||0, femaRate:parseFloat(form.femaRate)||0, totalCost })} style={btn.primary}>{entry?"Save":"Add Entry"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Materials tab ─────────────────────────────────────────────────────────────
function MaterialsTab({ project, db, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const entries   = project.materialEntries || [];
  const totalCost = entries.reduce((s,e)=>s+(e.totalCost||0),0);
  const invItems  = (db.inventoryItems||[]).filter(i=>i.active!==false);

  if (showForm||editEntry) {
    return <MaterialEntryForm entry={editEntry} invItems={invItems} onSave={entry=>{ dispatch({ type:editEntry?"UPDATE_PROJECT_ENTRY":"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"materialEntries", entry } }); setShowForm(false); setEditEntry(null); }} onCancel={()=>{ setShowForm(false); setEditEntry(null); }} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13 }}>Total materials: <strong style={{ color:"#5a1a8a" }}>{fmtSm(totalCost)}</strong></div>
        <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Material Entry</button>
      </div>
      <Table
        headers={[{label:"Date"},{label:"Item"},{label:"Qty"},{label:"Cost"},{label:"Segment"},{label:"Source"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.itemName||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.quantity} {e.unitOfMeasure||""}</span>,
          <span style={{fontFamily:"monospace",fontWeight:600,color:"#5a1a8a"}}>{fmtSm(e.totalCost||0)}</span>,
          <span style={{fontSize:11,color:"#888"}}>{(e.linkedAssets||[]).join(", ")||"—"}</span>,
          <span style={{fontSize:11,color:"#aaa"}}>{(e.batchLines||[]).length>0?`FIFO (${e.batchLines.length})`:"Manual"}</span>,
          <button onClick={()=>setEditEntry(e)} style={{...btn.small,background:"#5a1a8a",fontSize:10,padding:"4px 10px"}}>Edit</button>,
        ])}
        emptyMessage="No material entries — issue from Inventory to populate automatically, or add manually"
      />
    </div>
  );
}

function MaterialEntryForm({ entry, invItems, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:           entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    date:         entry?.date || "",
    itemId:       entry?.itemId || "",
    itemName:     entry?.itemName || "",
    quantity:     entry?.quantity ?? "",
    unitOfMeasure:entry?.unitOfMeasure || "",
    batchLines:   entry?.batchLines || [],
    totalCost:    entry?.totalCost ?? "",
    linkedAssets: entry?.linkedAssets || [],
    notes:        entry?.notes || "",
    createdAt:    entry?.createdAt || new Date().toISOString(),
  });
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleItemSelect = id => {
    const item = invItems.find(i=>i.id===id);
    set("itemId",id); set("itemName",item?.name||""); set("unitOfMeasure",item?.unitOfMeasure||"");
  };

  return (
    <div style={{ maxWidth:640 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{entry?"Edit":"Add"} Material Entry</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:12, color:"#888", background:"#f7f7f5", borderRadius:5, padding:"8px 12px", marginBottom:14 }}>
          💡 Materials issued from Inventory appear here automatically with FIFO cost. Use this form for contractor-supplied or other materials.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:14, marginBottom:14 }}>
          <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>
          <Field label="Item (from catalog — optional)">
            <select value={form.itemId} onChange={e=>handleItemSelect(e.target.value)} style={inp}>
              <option value="">Manual / not in catalog</option>
              {invItems.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
        </div>
        {!form.itemId && (
          <div style={{ marginBottom:14 }}>
            <Field label="Material Description" required><input type="text" value={form.itemName} onChange={e=>set("itemName",e.target.value)} style={inp} /></Field>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Quantity" required><input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Unit"><input type="text" value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="TON, CY, LF…" /></Field>
          <Field label="Total Cost ($)" required><MoneyField value={form.totalCost} onChange={v=>set("totalCost",v)} disabled={form.batchLines.length>0} style={{ ...inp, fontFamily:"monospace", background:form.batchLines.length>0?"#f7f7f5":"" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14 }}>
          <Field label="Segment / Asset"><input type="text" value={(form.linkedAssets||[]).join(", ")} onChange={e=>set("linkedAssets",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inp} placeholder="Road 14 — MP 2.1 to 3.4" /></Field>
          <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave({ ...form, quantity:parseFloat(form.quantity)||0, totalCost:parseFloat(form.totalCost)||0 })} style={btn.primary}>{entry?"Save":"Add Entry"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Contractor tab ────────────────────────────────────────────────────────────
function ContractorTab({ project, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const entries   = project.contractorEntries || [];
  const totalCost = entries.reduce((s,e)=>s+(e.totalAmount||0),0);

  if (showForm||editEntry) {
    return <ContractorEntryForm entry={editEntry} onSave={entry=>{ dispatch({ type:editEntry?"UPDATE_PROJECT_ENTRY":"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"contractorEntries", entry } }); setShowForm(false); setEditEntry(null); }} onCancel={()=>{ setShowForm(false); setEditEntry(null); }} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13 }}>Total contractor: <strong style={{ color:"#d97706" }}>{fmtSm(totalCost)}</strong></div>
        <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Contractor Invoice</button>
      </div>
      <Table
        headers={[{label:"Date"},{label:"Contractor"},{label:"Description"},{label:"Invoice #"},{label:"Amount"},{label:"Status"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.contractorName||"—",
          <span style={{fontSize:12}}>{e.description||"—"}</span>,
          <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:600}}>{fmtSm(e.totalAmount||0)}</span>,
          <span style={{fontSize:11,fontWeight:600,color:e.paymentStatus==="paid"?"#1a6b35":"#d97706"}}>{e.paymentStatus==="paid"?"Paid":"Unpaid"}</span>,
          <button onClick={()=>setEditEntry(e)} style={{...btn.small,background:"#d97706",fontSize:10,padding:"4px 10px"}}>Edit</button>,
        ])}
        emptyMessage="No contractor invoices yet"
      />
    </div>
  );
}

function ContractorEntryForm({ entry, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:             entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    date:           entry?.date || "",
    contractorName: entry?.contractorName || "",
    description:    entry?.description || "",
    invoiceNumber:  entry?.invoiceNumber || "",
    totalAmount:    entry?.totalAmount ?? "",
    retentionPct:   entry?.retentionPct ?? 0,
    paymentStatus:  entry?.paymentStatus || "unpaid",
    paymentDate:    entry?.paymentDate || "",
    changeOrder:    entry?.changeOrder || false,
    changeOrderRef: entry?.changeOrderRef || "",
    linkedAssets:   entry?.linkedAssets || [],
    notes:          entry?.notes || "",
    createdAt:      entry?.createdAt || new Date().toISOString(),
  });
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const retention = (parseFloat(form.totalAmount)||0) * (parseFloat(form.retentionPct)||0) / 100;
  const net       = (parseFloat(form.totalAmount)||0) - retention;

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{entry?"Edit":"Add"} Contractor Invoice</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>
          <Field label="Contractor" required><input type="text" value={form.contractorName} onChange={e=>set("contractorName",e.target.value)} style={inp} /></Field>
          <Field label="Invoice #"><input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ marginBottom:14 }}>
          <Field label="Description"><input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Invoice Amount ($)" required><MoneyField value={form.totalAmount} onChange={v=>set("totalAmount",v)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Retention (%)"><input type="number" min="0" max="100" step="0.5" value={form.retentionPct} onChange={e=>set("retentionPct",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Net Payable"><div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(net)}</div></Field>
          <Field label="Payment Status">
            <select value={form.paymentStatus} onChange={e=>set("paymentStatus",e.target.value)} style={inp}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="disputed">Disputed</option>
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:14, marginBottom:14 }}>
          {form.paymentStatus==="paid" && <Field label="Payment Date"><DateField value={form.paymentDate} onChange={v => set("paymentDate", v)} /></Field>}
          <Field label="Change Order">
            <div style={{ display:"flex", gap:8, alignItems:"center", paddingTop:8 }}>
              <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:13, cursor:"pointer" }}>
                <input type="checkbox" checked={form.changeOrder} onChange={e=>set("changeOrder",e.target.checked)} /> CO
              </label>
              {form.changeOrder && <input type="text" value={form.changeOrderRef} onChange={e=>set("changeOrderRef",e.target.value)} style={{ ...inp, margin:0, fontSize:12 }} placeholder="CO #…" />}
            </div>
          </Field>
          <Field label="Segment / Asset"><input type="text" value={(form.linkedAssets||[]).join(", ")} onChange={e=>set("linkedAssets",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} style={inp} /></Field>
        </div>
        <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave({ ...form, totalAmount:parseFloat(form.totalAmount)||0, retentionPct:parseFloat(form.retentionPct)||0 })} style={btn.primary}>{entry?"Save":"Add Invoice"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Engineering tab ───────────────────────────────────────────────────────────
function EngineeringTab({ project, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const entries   = project.engineeringEntries || [];
  const totalCost = entries.reduce((s,e)=>s+(e.amount||0),0);

  if (showForm||editEntry) {
    return <EngineeringEntryForm entry={editEntry} onSave={entry=>{ dispatch({ type:editEntry?"UPDATE_PROJECT_ENTRY":"ADD_PROJECT_ENTRY", payload:{ projectId:project.id, entryType:"engineeringEntries", entry } }); setShowForm(false); setEditEntry(null); }} onCancel={()=>{ setShowForm(false); setEditEntry(null); }} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:13 }}>Total engineering: <strong>{fmtSm(totalCost)}</strong></div>
        <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Engineering Invoice</button>
      </div>
      <Table
        headers={[{label:"Date"},{label:"Firm"},{label:"Service"},{label:"Invoice #"},{label:"Amount"},{label:"Phase"},{label:""}]}
        rows={entries.map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          e.firmName||"—",
          <span style={{fontSize:12}}>{e.serviceType||"—"}</span>,
          <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.invoiceNumber||"—"}</span>,
          <span style={{fontFamily:"monospace",fontWeight:600}}>{fmtSm(e.amount||0)}</span>,
          <span style={{fontSize:11,color:"#888"}}>{e.phase||"—"}</span>,
          <button onClick={()=>setEditEntry(e)} style={{...btn.small,background:"#888",fontSize:10,padding:"4px 10px"}}>Edit</button>,
        ])}
        emptyMessage="No engineering invoices yet"
      />
    </div>
  );
}

function EngineeringEntryForm({ entry, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:           entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    date:         entry?.date || "",
    firmName:     entry?.firmName || "",
    serviceType:  entry?.serviceType || "Design",
    invoiceNumber:entry?.invoiceNumber || "",
    amount:       entry?.amount ?? "",
    phase:        entry?.phase || "",
    notes:        entry?.notes || "",
    createdAt:    entry?.createdAt || new Date().toISOString(),
  });
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  return (
    <div style={{ maxWidth:620 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{entry?"Edit":"Add"} Engineering Invoice</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Date" required><DateField value={form.date} onChange={v => set("date", v)} /></Field>
          <Field label="Engineering Firm" required><input type="text" value={form.firmName} onChange={e=>set("firmName",e.target.value)} style={inp} /></Field>
          <Field label="Invoice #"><input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14 }}>
          <Field label="Service Type">
            <select value={form.serviceType} onChange={e=>set("serviceType",e.target.value)} style={inp}>
              {["Design","Survey","Inspection","Geotechnical","Environmental","Construction Mgmt","Other"].map(s=><option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
          <Field label="Phase"><input type="text" value={form.phase} onChange={e=>set("phase",e.target.value)} style={inp} placeholder="Preliminary, Final…" /></Field>
          <Field label="Amount ($)" required><MoneyField value={form.amount} onChange={v=>set("amount",v)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave({ ...form, amount:parseFloat(form.amount)||0 })} style={btn.primary}>{entry?"Save":"Add Invoice"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Cost Summary ──────────────────────────────────────────────────────────────
function CostSummaryTab({ project, totals }) {
  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        <div style={{ background:"#f7f7f5", padding:"12px 18px", fontWeight:700, fontSize:13, borderBottom:"1px solid #eee" }}>
          Cost Summary — {project.name || project.projectNumber || "Project"}
        </div>
        <div style={{ padding:"0 18px" }}>
          {[
            ["Force Account — Labor",     totals.labor,       "#1a6b35"],
            ["Force Account — Equipment", totals.equipment,   "#1a3a5c"],
            ["Force Account — Materials", totals.materials,   "#5a1a8a"],
            ["Contractor / Subcont.",     totals.contractor,  "#d97706"],
            ["Engineering Fees",          totals.engineering, "#888"],
          ].map(([label,val,color])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid #f0f0ee", fontSize:14 }}>
              <span style={{ color:"#555" }}>{label}</span>
              <span style={{ fontFamily:"monospace", fontWeight:700, color }}>{fmtSm(val)}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 0", fontSize:15, fontWeight:700 }}>
            <span>Total Project Cost</span>
            <span style={{ fontFamily:"monospace", fontSize:17 }}>{fmtSm(totals.total)}</span>
          </div>
          {project.estimatedCost > 0 && (
            <div style={{ paddingBottom:14 }}>
              <div style={{ fontSize:13, color:"#888", marginBottom:6 }}>{pct(totals.total, project.estimatedCost)}% of {fmt(project.estimatedCost)} estimated</div>
              <ProgressBar value={pct(totals.total, project.estimatedCost)} />
            </div>
          )}
        </div>
      </div>

      {(project.isFEMA||project.isNDOT) && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:18 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:"#7a4f00" }}>
            Force Account Documentation — {project.isFEMA?"FEMA PA":"NDOT"}
          </div>
          <div style={{ fontSize:12, color:"#7a4f00", lineHeight:1.7, marginBottom:10 }}>
            {project.isFEMA && <>FEMA Disaster #: <strong>{project.disasterNumber||"—"}</strong>. </>}
            {project.isNDOT && <>NDOT Project #: <strong>{project.ndotNumber||"—"}</strong>. </>}
            All labor, equipment, and material costs above are eligible for force account documentation.
          </div>
          <button style={{ ...btn.small, background:"#d97706" }}>Export Force Account Report ↓</button>
        </div>
      )}
    </div>
  );
}

// ── Project Form ──────────────────────────────────────────────────────────────
function ProjectForm({ type: initialType, project, projects, assets, equipment, onSave, onCancel }) {
  const isEdit = !!project;
  const [form, setForm] = useState(() => {
    if (project) return { ...project };
    const t = initialType || "capital";
    const base = createProject({ type: t });
    if (t === "maintenance") base.projectNumber = nextMaintNumber(projects);
    if (t === "miscellaneous") { base.status = "active"; base.projectNumber = ""; }
    return base;
  });
  useUnsavedForm(form, "this project");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const isCapital = form.type==="capital";
  const isMaint   = form.type==="maintenance";
  const isMisc    = form.type==="miscellaneous";
  const typeColor = isCapital?"#1a3a5c":isMaint?"#1a5a3a":"#5a1a8a";
  const typeLabel = isCapital?"CAPITAL":isMaint?"MAINTENANCE":"MISCELLANEOUS";
  const statusOptions = isMisc
    ? [["active","Active"],["complete","Complete"]]
    : [["planning","Planning"],["pending","Pending"],["active","Active"],["complete","Complete"],["on_hold","On Hold"]];

  return (
    <div style={{ maxWidth:780 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div>
          <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:typeColor, marginRight:10 }}>{typeLabel}</span>
          <span style={{ fontSize:18, fontWeight:700 }}>{isEdit?"Edit Project":"New Project"}</span>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Basic Info</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:16, marginBottom:16 }}>
          {(isCapital||isMaint) && (
            <Field label={isCapital?"Project # (C1-###)":"Project # (M-YYYY-##)"}>
              <input type="text" value={form.projectNumber||""} onChange={e=>set("projectNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder={isCapital?"C1-5##":"M-2026-01"} />
            </Field>
          )}
          <Field label="Name / Short Description" required>
            <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} placeholder={isMisc?"e.g. 2026 Mowing":"e.g. Road 14 Bridge Replacement"} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              {statusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Work Type">
            <select value={form.projectType} onChange={e=>set("projectType",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {(isCapital?PROJECT_TYPES_CAPITAL:isMaint?PROJECT_TYPES_MAINT:[]).map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </Field>
          <Field label="Start Date"><DateField value={form.startDate} onChange={v => set("startDate", v)} /></Field>
          <Field label="End / Target Date"><DateField value={form.endDate} onChange={v => set("endDate", v)} /></Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Work Description">
            <textarea rows={3} value={form.workDescription} onChange={e=>set("workDescription",e.target.value)} style={{ ...inp, resize:"vertical", lineHeight:1.6 }} placeholder="Scope of work…" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Funding Source">
            <select value={form.fundingSource} onChange={e=>set("fundingSource",e.target.value)} style={inp}>
              {FUNDING_SOURCES.map(f=><option key={f} value={f}>{titleCase(f)}</option>)}
            </select>
          </Field>
          {isMisc && <Field label="Calendar Year"><input type="number" value={form.calendarYear} onChange={e=>set("calendarYear",parseInt(e.target.value)||new Date().getFullYear())} style={{ ...inp, fontFamily:"monospace" }} /></Field>}
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Location</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <Field label="Road Name"><input type="text" value={form.roadName} onChange={e=>set("roadName",e.target.value)} style={inp} placeholder="Road 14, County Rd G" /></Field>
          <Field label="Mile Posts / Segment"><input type="text" value={form.roadSegments} onChange={e=>set("roadSegments",e.target.value)} style={inp} placeholder="MP 2.1 to MP 3.4" /></Field>
          <Field label="GPS"><input type="text" value={form.gps} onChange={e=>set("gps",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="40.6501, -98.1234" /></Field>
        </div>
      </div>

      {isCapital && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Capital Details</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:14 }}>
            <Field label="Estimated Cost ($)"><input type="number" min="0" step="1000" value={form.estimatedCost||""} onChange={e=>set("estimatedCost",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            <Field label="Contractor"><input type="text" value={form.contractor||""} onChange={e=>set("contractor",e.target.value)} style={inp} /></Field>
            <Field label="Contract Amount ($)"><input type="number" min="0" step="1000" value={form.contractAmount||""} onChange={e=>set("contractAmount",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            <Field label="Bid Date"><DateField value={form.bidDate||""} onChange={v => set("bidDate", v)} /></Field>
          </div>
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={!!form.isOneSixYear} onChange={e=>set("isOneSixYear",e.target.checked)} />
              On 1–6 Year Plan
            </label>
            {form.isOneSixYear && (
              <select value={form.oneSixYear||"Year 1"} onChange={e=>set("oneSixYear",e.target.value)} style={{ ...inp, margin:0, width:120 }}>
                {ONE_SIX_YEARS.map(y=><option key={y} value={y}>{titleCase(y)}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:14 }}>Federal / State</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div>
            <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, cursor:"pointer", marginBottom:10 }}>
              <input type="checkbox" checked={!!form.isFEMA} onChange={e=>set("isFEMA",e.target.checked)} />
              FEMA Public Assistance project
            </label>
            {form.isFEMA && <Field label="FEMA Disaster #"><input type="text" value={form.disasterNumber||""} onChange={e=>set("disasterNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="DR-####-NE" /></Field>}
          </div>
          <div>
            <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, cursor:"pointer", marginBottom:10 }}>
              <input type="checkbox" checked={!!form.isNDOT} onChange={e=>set("isNDOT",e.target.checked)} />
              NDOT project
            </label>
            {form.isNDOT && <Field label="NDOT Project #"><input type="text" value={form.ndotNumber||""} onChange={e=>set("ndotNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="C1-5##" /></Field>}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{isEdit?"Save Changes":"Create Project"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
