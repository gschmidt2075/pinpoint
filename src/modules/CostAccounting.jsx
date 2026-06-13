import { useState, useMemo } from "react";
import { Field, SectionCard, Table, StatusBadge, inp, btn, fmt, fmtSm, ProgressBar, pct } from "../components/shared.jsx";
import { EXPENDITURE_CODES, FUNDS } from "../data/accountCodes.js";

// ── FEMA Equipment Rates (partial — most common public works equipment) ───────
const FEMA_EQUIPMENT_RATES = [
  { type: "Motor Grader",           size: "100-149 HP",  rate: 112.00 },
  { type: "Motor Grader",           size: "150-199 HP",  rate: 130.00 },
  { type: "Dozer",                  size: "100-149 HP",  rate: 98.00  },
  { type: "Backhoe / Excavator",    size: "1.0-1.5 CY",  rate: 89.00  },
  { type: "Backhoe / Excavator",    size: "1.5-2.0 CY",  rate: 108.00 },
  { type: "Dump Truck",             size: "10-14 CY",    rate: 52.00  },
  { type: "Dump Truck",             size: "15-20 CY",    rate: 68.00  },
  { type: "Tandem Dump Truck",      size: "14-18 CY",    rate: 65.00  },
  { type: "Side Dump Trailer",      size: "20+ CY",      rate: 48.00  },
  { type: "Pickup Truck",           size: "1/2 - 1 ton", rate: 28.00  },
  { type: "Loader",                 size: "2.0-2.5 CY",  rate: 95.00  },
  { type: "Loader",                 size: "2.5-3.5 CY",  rate: 115.00 },
  { type: "Skid Steer",             size: "< 1 CY",      rate: 42.00  },
  { type: "Tractor",                size: "50-99 HP",    rate: 38.00  },
  { type: "Mower (Rotary)",         size: "Tractor mtd", rate: 32.00  },
  { type: "Crack Sealer",           size: "Trailer",     rate: 45.00  },
  { type: "Roller / Compactor",     size: "10-12 ton",   rate: 58.00  },
  { type: "Water Truck",            size: "2000+ gal",   rate: 48.00  },
  { type: "Chip Spreader",          size: "Self prop",   rate: 88.00  },
  { type: "Paver",                  size: "Asphalt",     rate: 125.00 },
  { type: "Sign Truck / Bucket",    size: "1 ton",       rate: 55.00  },
  { type: "Generator",              size: "< 25 KW",     rate: 14.00  },
  { type: "Trailer (Flatbed)",      size: "< 20 ton",    rate: 18.00  },
];

const PROJECT_TYPES_OWN = [
  "Culvert Replacement","Culvert Repair","Bridge Repair",
  "Grading / Gravel Road","Ditching / Drainage","Crack Sealing",
  "Mowing / Vegetation","Sign Installation","Sign Replacement",
  "Patching / Pothole Repair","Snow Removal","Other",
];

const PROJECT_TYPES_CONTRACT = [
  "Overlay / Resurfacing","Bridge Replacement","Concrete Work","Other Contracted",
];

const FUNDING_SOURCES = [
  "Roads Fund","Capital Fund","FEMA / Disaster","NDOT Buyback — Street",
  "NDOT Buyback — Bridge","NDOT Grant","Federal Aid","Special Assessment","Other",
];

const STATUS_OPTIONS = ["planned","active","on_hold","complete"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];

function nextMaintenanceNumber(jobs) {
  const year = new Date().getFullYear();
  const nums = jobs
    .filter(j => j.projectNumber?.startsWith(`M-${year}-`))
    .map(j => parseInt(j.projectNumber.split("-")[2]) || 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `M-${year}-${String(next).padStart(2,"0")}`;
}

// ── Cost Accounting Module ────────────────────────────────────────────────────
export default function CostAccounting({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"dashboard",    label:"Dashboard" },
          { id:"projects",     label:"Capital Projects" },
          { id:"newProject",   label:"New Project" },
          { id:"maintenance",  label:"Maintenance Jobs" },
          { id:"newMaint",     label:"New Maintenance Job" },
          { id:"fema",         label:"FEMA Records" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px",
            fontWeight: view===v.id ? 700 : 400, fontSize:13, cursor:"pointer",
            color: view===v.id ? "#6b3a1a" : "#666",
            borderBottom: view===v.id ? "2px solid #6b3a1a" : "2px solid transparent",
            marginBottom:-1,
          }}>{v.label}</button>
        ))}
      </div>

      {view==="dashboard"   && <CADashboard db={db} setView={setView} />}
      {view==="projects"    && <ProjectList db={db} dispatch={dispatch} type="capital" setView={setView} />}
      {view==="newProject"  && <ProjectForm db={db} dispatch={dispatch} type="capital" onDone={() => setView("projects")} />}
      {view==="maintenance" && <ProjectList db={db} dispatch={dispatch} type="maintenance" setView={setView} />}
      {view==="newMaint"    && <ProjectForm db={db} dispatch={dispatch} type="maintenance" onDone={() => setView("maintenance")} />}
      {view==="fema"        && <FEMARecords db={db} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function CADashboard({ db, setView }) {
  const allProjects = db.projects || [];
  const capital     = allProjects.filter(p => p.type === "capital");
  const maintenance = allProjects.filter(p => p.type === "maintenance");
  const active      = allProjects.filter(p => p.status === "active");
  const femaProjects = allProjects.filter(p => p.isFEMA);

  const totalBudget  = allProjects.reduce((s,p) => s + (parseFloat(p.estimatedCost)||0), 0);
  const totalActual  = allProjects.reduce((s,p) => s + projectTotal(p), 0);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Cost Accounting</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Capital Projects · Maintenance Jobs · FEMA Force Account Records</div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Active Projects",     value: active.length,      sub:"Currently underway",        accent:"#6b3a1a" },
          { label:"Capital Projects",    value: capital.length,     sub:"C1- numbered",              accent:"#1a3a5c" },
          { label:"Maintenance Jobs",    value: maintenance.length, sub:"M-Year-# numbered",         accent:"#1a6b35" },
          { label:"Total Budget",        value: fmt(totalBudget),   sub:"All projects estimated",    accent:"#d97706" },
          { label:"FEMA Projects",       value: femaProjects.length,sub:"Disaster reimbursement",    accent:"#c0392b" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.accent}` }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888", marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:"#1a1a1a" }}>{k.value}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Active projects */}
      <SectionCard title="Active Projects & Jobs" subtitle={`${active.length} currently underway`}>
        {active.length === 0 ? (
          <div style={{ padding:"32px", textAlign:"center", color:"#aaa", fontSize:13 }}>
            No active projects — click New Project or New Maintenance Job to get started
          </div>
        ) : (
          <Table
            headers={[
              { label:"Project #" },{ label:"Name" },{ label:"Type" },{ label:"Location" },
              { label:"Funding" },{ label:"Budget", right:true },{ label:"Actual", right:true },
              { label:"% Used", right:true },{ label:"FEMA" },
            ]}
            rows={active.map(p => {
              const actual = projectTotal(p);
              const budget = parseFloat(p.estimatedCost)||0;
              const used   = pct(actual, budget);
              return [
                <span style={{ fontFamily:"monospace", fontSize:12, color:"#6b3a1a", fontWeight:600 }}>{p.projectNumber}</span>,
                <span style={{ fontWeight:600, color:"#1a1a1a" }}>{p.name}</span>,
                <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 7px", borderRadius:4 }}>{p.projectType}</span>,
                <span style={{ fontSize:12, color:"#555" }}>{p.location}</span>,
                <span style={{ fontSize:11, color:"#888" }}>{p.fundingSource}</span>,
                <span style={{ fontFamily:"monospace" }}>{budget > 0 ? fmt(budget) : "—"}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:600 }}>{fmt(actual)}</span>,
                budget > 0 ? (
                  <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                    <div style={{ width:50 }}><ProgressBar value={used} /></div>
                    <span style={{ fontSize:11, fontWeight:600, color: used>=90?"#c0392b":used>=75?"#d97706":"#555" }}>{used}%</span>
                  </div>
                ) : "—",
                p.isFEMA ? <span style={{ fontSize:10, background:"#fdecea", color:"#c0392b", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>FEMA</span> : "—",
              ];
            })}
          />
        )}
      </SectionCard>
    </div>
  );
}

// ── Project cost total helper ─────────────────────────────────────────────────
function projectTotal(p) {
  const labor      = (p.laborEntries||[]).reduce((s,e) => s + (e.totalCost||0), 0);
  const equipment  = (p.equipmentEntries||[]).reduce((s,e) => s + (e.totalCost||0), 0);
  const materials  = (p.materialEntries||[]).reduce((s,e) => s + (e.totalCost||0), 0);
  const contracted = (p.contractedEntries||[]).reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  return labor + equipment + materials + contracted;
}

// ── Project List ──────────────────────────────────────────────────────────────
function ProjectList({ db, dispatch, type, setView }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch]     = useState("");
  const [statusF, setStatusF]   = useState("all");

  const projects = (db.projects||[]).filter(p => p.type === type);
  const filtered = projects.filter(p => {
    if (statusF !== "all" && p.status !== statusF) return false;
    if (search && !`${p.projectNumber} ${p.name} ${p.location}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selected) {
    return <ProjectDetail project={selected} db={db} dispatch={dispatch} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{type==="capital" ? "Capital Projects" : "Maintenance Jobs"}</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            {type==="capital" ? "C1- numbered · One and Six Year Plan" : "M-Year-# numbered · Own forces"}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, width:180, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all","planned","active","on_hold","complete"].map(s => (
              <button key={s} onClick={() => setStatusF(s)} style={{ padding:"7px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background: statusF===s?"#6b3a1a":"#fff", color: statusF===s?"#fff":"#555", textTransform:"capitalize" }}>
                {s.replace("_"," ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionCard title={`${type==="capital"?"Projects":"Jobs"} (${filtered.length})`}>
        <Table
          headers={[
            { label:"#" },{ label:"Name" },{ label:"Type" },{ label:"Location" },
            { label:"Funding" },{ label:"Budget", right:true },{ label:"Actual", right:true },
            { label:"Status" },{ label:"FEMA" },
          ]}
          rows={filtered.map(p => {
            const actual = projectTotal(p);
            const budget = parseFloat(p.estimatedCost)||0;
            return [
              <button onClick={() => setSelected(p)} style={{ background:"none", border:"none", padding:0, color:"#6b3a1a", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>{p.projectNumber}</button>,
              <button onClick={() => setSelected(p)} style={{ background:"none", border:"none", padding:0, color:"#1a3a5c", fontWeight:600, fontSize:13, cursor:"pointer" }}>{p.name}</button>,
              <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 6px", borderRadius:4 }}>{p.projectType}</span>,
              <span style={{ fontSize:12, color:"#555" }}>{p.location}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{p.fundingSource}</span>,
              <span style={{ fontFamily:"monospace" }}>{budget > 0 ? fmt(budget) : "—"}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600, color: actual>budget&&budget>0?"#c0392b":"#1a1a1a" }}>{fmt(actual)}</span>,
              <StatusBadge status={p.status} />,
              p.isFEMA ? <span style={{ fontSize:10, background:"#fdecea", color:"#c0392b", padding:"2px 6px", borderRadius:4, fontWeight:600 }}>FEMA</span> : "—",
            ];
          })}
          emptyMessage={`No ${type==="capital"?"projects":"maintenance jobs"} yet — click New ${type==="capital"?"Project":"Maintenance Job"} to add one`}
        />
      </SectionCard>
    </div>
  );
}

// ── Project Form ──────────────────────────────────────────────────────────────
function ProjectForm({ db, dispatch, type, onDone }) {
  const isCapital = type === "capital";
  const jobs = (db.projects||[]).filter(p => p.type==="maintenance");

  const [form, setForm] = useState({
    name:"", projectNumber: isCapital ? "C1-" : nextMaintenanceNumber(jobs),
    projectType:"", location:"", roadName:"", roadNumber:"", mileStart:"", mileEnd:"",
    fundingSource:"Roads Fund", estimatedCost:"", startDate:"", endDate:"",
    status:"planned", isFEMA:false, disasterNumber:"", ndotProjectNumber:"",
    isOneSixYear:false, boardResolution:"", notes:"", ownForces: !isCapital,
  });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const projectTypes = isCapital ? PROJECT_TYPES_CONTRACT : PROJECT_TYPES_OWN;

  const handleSubmit = () => {
    if (!form.name || !form.projectNumber || !form.projectType) return;
    dispatch({
      type:"ADD_PROJECT",
      payload:{
        ...form, id:Date.now(), type,
        estimatedCost: parseFloat(form.estimatedCost)||0,
        laborEntries:[], equipmentEntries:[], materialEntries:[], contractedEntries:[],
      },
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>
          {isCapital ? "New Capital Project" : "New Maintenance Job"}
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          {isCapital ? "C1- numbered · One and Six Year Plan projects" : `Auto-numbered: ${form.projectNumber}`}
        </div>
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ {isCapital?"Project":"Job"} created — redirecting…</div>}

      {/* Basic info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Project Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div style={{ gridColumn:"span 2" }}>
            <Field label="Project / Job Name" required>
              <input type="text" placeholder={isCapital ? "e.g. CR14 Bridge Replacement" : "e.g. CR8 Annual Grading Run"} value={form.name} onChange={e => set("name",e.target.value)} style={inp} />
            </Field>
          </div>
          <Field label={isCapital ? "C1 Number" : "Job Number"} required>
            <input type="text" value={form.projectNumber} onChange={e => set("projectNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Project Type" required>
            <select value={form.projectType} onChange={e => set("projectType",e.target.value)} style={inp}>
              <option value="">Select type…</option>
              {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e => set("status",e.target.value)} style={inp}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
            </select>
          </Field>
          <Field label="Funding Source">
            <select value={form.fundingSource} onChange={e => set("fundingSource",e.target.value)} style={inp}>
              {FUNDING_SOURCES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <Field label="Estimated Cost ($)">
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.estimatedCost} onChange={e => set("estimatedCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Start Date">
            <input type="date" value={form.startDate} onChange={e => set("startDate",e.target.value)} style={inp} />
          </Field>
          <Field label="End Date">
            <input type="date" value={form.endDate} onChange={e => set("endDate",e.target.value)} style={inp} />
          </Field>
        </div>
      </div>

      {/* Location */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Location</div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Road Name">
            <input type="text" placeholder="e.g. County Road 14" value={form.roadName} onChange={e => set("roadName",e.target.value)} style={inp} />
          </Field>
          <Field label="Road Number">
            <input type="text" placeholder="e.g. CR14" value={form.roadNumber} onChange={e => set("roadNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Mile Start">
            <input type="number" step="0.1" placeholder="0.0" value={form.mileStart} onChange={e => set("mileStart",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Mile End">
            <input type="number" step="0.1" placeholder="0.0" value={form.mileEnd} onChange={e => set("mileEnd",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <Field label="Location Description">
          <input type="text" placeholder="e.g. From intersection of CR8 north 2.3 miles to…" value={form.location} onChange={e => set("location",e.target.value)} style={inp} />
        </Field>
      </div>

      {/* Nebraska / NDOT */}
      {isCapital && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Nebraska / NDOT</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="NDOT Project Number">
              <input type="text" placeholder="NDOT assigned number…" value={form.ndotProjectNumber} onChange={e => set("ndotProjectNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <Field label="Board Resolution #">
              <input type="text" placeholder="Resolution number…" value={form.boardResolution} onChange={e => set("boardResolution",e.target.value)} style={inp} />
            </Field>
            <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:22 }}>
              <input type="checkbox" id="oneSix" checked={form.isOneSixYear} onChange={e => set("isOneSixYear",e.target.checked)} style={{ width:16, height:16 }} />
              <label htmlFor="oneSix" style={{ fontSize:13, fontWeight:600, color:"#444", cursor:"pointer" }}>On One and Six Year Plan</label>
            </div>
          </div>
        </div>
      )}

      {/* FEMA */}
      <div style={{ background: form.isFEMA ? "#fef8f5" : "#fff", border:`1px solid ${form.isFEMA?"#e8c4a8":"#ddd"}`, borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom: form.isFEMA ? 16 : 0 }}>
          <input type="checkbox" id="fema" checked={form.isFEMA} onChange={e => set("isFEMA",e.target.checked)} style={{ width:16, height:16 }} />
          <label htmlFor="fema" style={{ fontSize:13, fontWeight:700, color: form.isFEMA?"#c0392b":"#444", cursor:"pointer" }}>
            FEMA Disaster Project — activate force account record tracking
          </label>
        </div>
        {form.isFEMA && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="FEMA Disaster Declaration Number">
              <input type="text" placeholder="e.g. DR-4567-NE" value={form.disasterNumber} onChange={e => set("disasterNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <div style={{ background:"#fdecea", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#8c1b18" }}>
              ⚠️ FEMA mode active — all labor, equipment, and material entries will be formatted as force account records for PA reimbursement
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <Field label="Notes / Scope of Work">
          <textarea rows={3} placeholder="Description of work, special conditions, specifications…" value={form.notes} onChange={e => set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#6b3a1a" }}>Create {isCapital?"Project":"Job"}</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Project Detail — cost entry and summary ───────────────────────────────────
function ProjectDetail({ project, db, dispatch, onBack }) {
  const [costTab, setCostTab] = useState("summary");
  const [p, setP] = useState(project);

  // Keep local state in sync with db
  const current = (db.projects||[]).find(x => x.id === project.id) || project;

  const labor      = current.laborEntries      || [];
  const equipment  = current.equipmentEntries  || [];
  const materials  = current.materialEntries   || [];
  const contracted = current.contractedEntries || [];

  const laborTotal      = labor.reduce((s,e) => s+(e.totalCost||0), 0);
  const equipmentTotal  = equipment.reduce((s,e) => s+(e.totalCost||0), 0);
  const materialsTotal  = materials.reduce((s,e) => s+(e.totalCost||0), 0);
  const contractedTotal = contracted.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
  const grandTotal      = laborTotal + equipmentTotal + materialsTotal + contractedTotal;
  const budget          = parseFloat(current.estimatedCost)||0;

  const addEntry = (entryType, entry) => {
    dispatch({ type:"ADD_PROJECT_ENTRY", payload:{ projectId:current.id, entryType, entry:{ ...entry, id:Date.now() } } });
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back</button>

      {/* Project header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontFamily:"monospace", fontSize:14, fontWeight:700, color:"#6b3a1a" }}>{current.projectNumber}</span>
              {current.isFEMA && <span style={{ fontSize:11, background:"#fdecea", color:"#c0392b", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>FEMA {current.disasterNumber}</span>}
              {current.isOneSixYear && <span style={{ fontSize:11, background:"#e8f0fb", color:"#1a4a8a", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>1&6 Year Plan</span>}
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a", margin:"6px 0 2px" }}>{current.name}</div>
            <div style={{ fontSize:13, color:"#555" }}>{current.projectType} · {current.location || `${current.roadName} ${current.roadNumber}`}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{current.fundingSource} · {current.startDate||"—"} to {current.endDate||"—"}</div>
          </div>
          <StatusBadge status={current.status} />
        </div>

        {/* Cost summary bars */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginTop:18 }}>
          {[
            { label:"Labor",      value:laborTotal,      color:"#1a3a5c" },
            { label:"Equipment",  value:equipmentTotal,  color:"#6b3a1a" },
            { label:"Materials",  value:materialsTotal,  color:"#1a6b35" },
            { label:"Contracted", value:contractedTotal, color:"#5a1a8a" },
            { label:"Total",      value:grandTotal,      color: grandTotal>budget&&budget>0?"#c0392b":"#1a1a1a" },
          ].map((k,i) => (
            <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"12px 14px", borderTop:`3px solid ${k.color}` }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:k.color }}>{fmtSm(k.value)}</div>
            </div>
          ))}
        </div>
        {budget > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginBottom:4 }}>
              <span>Budget utilization</span>
              <span>{fmt(grandTotal)} of {fmt(budget)} ({pct(grandTotal,budget)}%)</span>
            </div>
            <ProgressBar value={pct(grandTotal,budget)} />
          </div>
        )}
      </div>

      {/* Cost entry tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:16, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"summary",    label:`Summary` },
          { id:"labor",      label:`Labor (${labor.length})` },
          { id:"equipment",  label:`Equipment (${equipment.length})` },
          { id:"materials",  label:`Materials (${materials.length})` },
          { id:"contracted", label:`Contracted (${contracted.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setCostTab(t.id)} style={{
            background:"transparent", border:"none", padding:"7px 14px 9px",
            fontWeight: costTab===t.id ? 700 : 400, fontSize:12, cursor:"pointer",
            color: costTab===t.id ? "#6b3a1a" : "#666",
            borderBottom: costTab===t.id ? "2px solid #6b3a1a" : "2px solid transparent",
            marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {costTab==="summary"    && <CostSummary current={current} labor={labor} equipment={equipment} materials={materials} contracted={contracted} />}
      {costTab==="labor"      && <LaborEntries entries={labor} onAdd={e => addEntry("laborEntries",e)} isFEMA={current.isFEMA} />}
      {costTab==="equipment"  && <EquipmentEntries entries={equipment} onAdd={e => addEntry("equipmentEntries",e)} isFEMA={current.isFEMA} />}
      {costTab==="materials"  && <MaterialEntries entries={materials} onAdd={e => addEntry("materialEntries",e)} isFEMA={current.isFEMA} />}
      {costTab==="contracted" && <ContractedEntries entries={contracted} onAdd={e => addEntry("contractedEntries",e)} />}
    </div>
  );
}

// ── Cost Summary ──────────────────────────────────────────────────────────────
function CostSummary({ current, labor, equipment, materials, contracted }) {
  const laborTotal      = labor.reduce((s,e) => s+(e.totalCost||0), 0);
  const equipmentTotal  = equipment.reduce((s,e) => s+(e.totalCost||0), 0);
  const materialsTotal  = materials.reduce((s,e) => s+(e.totalCost||0), 0);
  const contractedTotal = contracted.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
  const grandTotal      = laborTotal + equipmentTotal + materialsTotal + contractedTotal;

  return (
    <div>
      <SectionCard title="Project Cost Summary" subtitle={current.isFEMA ? `FEMA Disaster ${current.disasterNumber} — Force Account Summary` : "All cost categories"}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Cost Category","Entries","Total Cost","% of Project"].map(h => (
                <th key={h} style={{ padding:"9px 14px", textAlign: h==="Entries"||h==="% of Project"||h==="Total Cost"?"right":"left", fontWeight:600, fontSize:11, letterSpacing:"0.05em", textTransform:"uppercase", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label:"Labor",                  count:labor.length,      total:laborTotal,      color:"#1a3a5c" },
              { label:"Equipment",              count:equipment.length,  total:equipmentTotal,  color:"#6b3a1a" },
              { label:"Materials & Supplies",   count:materials.length,  total:materialsTotal,  color:"#1a6b35" },
              { label:"Contracted Work",        count:contracted.length, total:contractedTotal, color:"#5a1a8a" },
            ].map((row,i) => (
              <tr key={i} style={{ borderTop:"1px solid #eee" }}>
                <td style={{ padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:row.color }}></div>
                    <span style={{ fontWeight:600 }}>{row.label}</span>
                  </div>
                </td>
                <td style={{ padding:"12px 14px", textAlign:"right", color:"#888" }}>{row.count}</td>
                <td style={{ padding:"12px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:row.color }}>{fmtSm(row.total)}</td>
                <td style={{ padding:"12px 14px", textAlign:"right", color:"#888" }}>{grandTotal>0?pct(row.total,grandTotal):0}%</td>
              </tr>
            ))}
            <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
              <td style={{ padding:"12px 14px", fontWeight:700, fontSize:14 }}>Grand Total</td>
              <td style={{ padding:"12px 14px", textAlign:"right", color:"#888" }}>{labor.length+equipment.length+materials.length+contracted.length}</td>
              <td style={{ padding:"12px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:16, color:"#1a1a1a" }}>{fmtSm(grandTotal)}</td>
              <td style={{ padding:"12px 14px", textAlign:"right", fontWeight:700 }}>100%</td>
            </tr>
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ── Labor Entries ─────────────────────────────────────────────────────────────
function LaborEntries({ entries, onAdd, isFEMA }) {
  const empty = { date:"", employee:"", title:"", regularHours:"", otHours:"", hourlyRate:"", fringeRate:"", notes:"" };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const regHours   = parseFloat(form.regularHours)||0;
  const otHours    = parseFloat(form.otHours)||0;
  const rate       = parseFloat(form.hourlyRate)||0;
  const fringeRate = parseFloat(form.fringeRate)||0;
  const totalCost  = (regHours * rate) + (otHours * rate * 1.5) + ((regHours + otHours) * rate * (fringeRate/100));

  const handleAdd = () => {
    if (!form.date || !form.employee || !form.hourlyRate) return;
    onAdd({ ...form, regularHours:regHours, otHours, hourlyRate:rate, fringeRate, totalCost });
    setForm(empty); setAdding(false);
  };

  return (
    <div>
      <SectionCard
        title={isFEMA ? "Force Account Labor Record" : "Labor Entries"}
        subtitle={isFEMA ? "FEMA PA — daily labor log" : `${entries.length} entries · Total: ${fmtSm(entries.reduce((s,e)=>s+(e.totalCost||0),0))}`}
        action={<button onClick={() => setAdding(!adding)} style={{ ...btn.small }}>+ Add Entry</button>}
      >
        {adding && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Employee Name" required><input type="text" placeholder="Full name…" value={form.employee} onChange={e=>set("employee",e.target.value)} style={inp} /></Field>
              </div>
              <Field label="Title / Classification"><input type="text" placeholder="e.g. Equipment Operator" value={form.title} onChange={e=>set("title",e.target.value)} style={inp} /></Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Regular Hours"><input type="number" min="0" step="0.5" placeholder="0" value={form.regularHours} onChange={e=>set("regularHours",e.target.value)} style={inp} /></Field>
              <Field label="OT Hours"><input type="number" min="0" step="0.5" placeholder="0" value={form.otHours} onChange={e=>set("otHours",e.target.value)} style={inp} /></Field>
              <Field label="Hourly Rate ($)" required><input type="number" min="0" step="0.01" placeholder="0.00" value={form.hourlyRate} onChange={e=>set("hourlyRate",e.target.value)} style={inp} /></Field>
              <Field label="Fringe Rate (%)"><input type="number" min="0" step="0.1" placeholder="0.0" value={form.fringeRate} onChange={e=>set("fringeRate",e.target.value)} style={inp} /></Field>
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>Total Cost</div>
                <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:16, color:"#1a3a5c" }}>{fmtSm(totalCost)}</div>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Notes"><input type="text" placeholder="Work performed…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleAdd} style={{ ...btn.small, background:"#6b3a1a" }}>Add Labor Entry</button>
              <button onClick={() => setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}
        <Table
          headers={[{ label:"Date" },{ label:"Employee" },{ label:"Title" },{ label:"Reg Hrs", right:true },{ label:"OT Hrs", right:true },{ label:"Rate", right:true },{ label:"Fringe %", right:true },{ label:"Total", right:true }]}
          rows={entries.map(e => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.date}</span>,
            <span style={{ fontWeight:600 }}>{e.employee}</span>,
            e.title||"—",
            <span style={{ fontFamily:"monospace" }}>{e.regularHours}</span>,
            <span style={{ fontFamily:"monospace" }}>{e.otHours||0}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmtSm(e.hourlyRate)}</span>,
            <span style={{ fontFamily:"monospace" }}>{e.fringeRate||0}%</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(e.totalCost||0)}</span>,
          ])}
          emptyMessage="No labor entries yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Equipment Entries ─────────────────────────────────────────────────────────
function EquipmentEntries({ entries, onAdd, isFEMA }) {
  const empty = { date:"", equipmentType:"", size:"", assetTag:"", operator:"", hours:"", femaRate:"", notes:"" };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  // Auto-fill FEMA rate when equipment type/size selected
  const handleTypeChange = (type) => {
    set("equipmentType", type);
    const match = FEMA_EQUIPMENT_RATES.find(r => r.type === type);
    if (match) { set("femaRate", match.rate); set("size", match.size); }
  };

  const hours     = parseFloat(form.hours)||0;
  const rate      = parseFloat(form.femaRate)||0;
  const totalCost = hours * rate;

  const handleAdd = () => {
    if (!form.date || !form.equipmentType || !form.hours) return;
    onAdd({ ...form, hours, femaRate:rate, totalCost });
    setForm(empty); setAdding(false);
  };

  const uniqueTypes = [...new Set(FEMA_EQUIPMENT_RATES.map(r => r.type))];

  return (
    <div>
      <SectionCard
        title={isFEMA ? "Force Account Equipment Record" : "Equipment Entries"}
        subtitle={isFEMA ? "FEMA Schedule of Equipment Rates" : `${entries.length} entries · Total: ${fmtSm(entries.reduce((s,e)=>s+(e.totalCost||0),0))}`}
        action={<button onClick={() => setAdding(!adding)} style={btn.small}>+ Add Entry</button>}
      >
        {adding && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Equipment Type" required>
                  <select value={form.equipmentType} onChange={e=>handleTypeChange(e.target.value)} style={inp}>
                    <option value="">Select equipment…</option>
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Size / Class">
                <select value={form.size} onChange={e => {
                  set("size",e.target.value);
                  const match = FEMA_EQUIPMENT_RATES.find(r => r.type===form.equipmentType && r.size===e.target.value);
                  if (match) set("femaRate", match.rate);
                }} style={inp}>
                  <option value="">Select size…</option>
                  {FEMA_EQUIPMENT_RATES.filter(r=>r.type===form.equipmentType).map(r=>(
                    <option key={r.size} value={r.size}>{r.size}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Asset Tag / Unit #"><input type="text" placeholder="Unit #…" value={form.assetTag} onChange={e=>set("assetTag",e.target.value)} style={inp} /></Field>
              <Field label="Operator"><input type="text" placeholder="Operator name…" value={form.operator} onChange={e=>set("operator",e.target.value)} style={inp} /></Field>
              <Field label="Hours Used" required><input type="number" min="0" step="0.5" placeholder="0" value={form.hours} onChange={e=>set("hours",e.target.value)} style={inp} /></Field>
              <Field label="FEMA Rate ($/hr)">
                <input type="number" min="0" step="0.01" value={form.femaRate} onChange={e=>set("femaRate",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>Total Cost</div>
                <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:16, color:"#6b3a1a" }}>{fmtSm(totalCost)}</div>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Notes"><input type="text" placeholder="Work performed, location…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleAdd} style={{ ...btn.small, background:"#6b3a1a" }}>Add Equipment Entry</button>
              <button onClick={() => setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}
        <Table
          headers={[{ label:"Date" },{ label:"Equipment" },{ label:"Size" },{ label:"Asset #" },{ label:"Operator" },{ label:"Hours", right:true },{ label:"FEMA Rate", right:true },{ label:"Total", right:true }]}
          rows={entries.map(e => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.date}</span>,
            <span style={{ fontWeight:600 }}>{e.equipmentType}</span>,
            e.size||"—",
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.assetTag||"—"}</span>,
            e.operator||"—",
            <span style={{ fontFamily:"monospace" }}>{e.hours}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmtSm(e.femaRate)}/hr</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#6b3a1a" }}>{fmtSm(e.totalCost||0)}</span>,
          ])}
          emptyMessage="No equipment entries yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Material Entries ──────────────────────────────────────────────────────────
function MaterialEntries({ entries, onAdd, isFEMA }) {
  const empty = { date:"", accountCode:"", description:"", unit:"", quantity:"", unitCost:"", fromInventory:false, notes:"" };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [catFilter, setCatFilter] = useState("materials");
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const qty       = parseFloat(form.quantity)||0;
  const unitCost  = parseFloat(form.unitCost)||0;
  const totalCost = qty * unitCost;

  const matCodes = EXPENDITURE_CODES.filter(c => catFilter==="all" || c.category===catFilter);

  const handleAdd = () => {
    if (!form.date || !form.description || !form.quantity || !form.unitCost) return;
    onAdd({ ...form, quantity:qty, unitCost, totalCost });
    setForm(empty); setAdding(false);
  };

  return (
    <div>
      <SectionCard
        title={isFEMA ? "Force Account Materials Record" : "Material Entries"}
        subtitle={`${entries.length} entries · Total: ${fmtSm(entries.reduce((s,e)=>s+(e.totalCost||0),0))}`}
        action={<button onClick={() => setAdding(!adding)} style={btn.small}>+ Add Entry</button>}
      >
        {adding && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Description" required><input type="text" placeholder="e.g. 36 inch concrete culvert…" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} /></Field>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Account Code">
                <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                  {["all","materials","contracts","capital"].map(cat => (
                    <button key={cat} onClick={()=>setCatFilter(cat)} style={{ padding:"2px 8px", fontSize:11, fontWeight:600, border:"1px solid", borderRadius:4, cursor:"pointer", background: catFilter===cat?"#1a3a5c":"#fff", color: catFilter===cat?"#fff":"#555", borderColor: catFilter===cat?"#1a3a5c":"#ccc", textTransform:"capitalize" }}>{cat}</button>
                  ))}
                </div>
                <select value={form.accountCode} onChange={e=>set("accountCode",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
                  <option value="">Select account code…</option>
                  {matCodes.map(c=><option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Unit"><input type="text" placeholder="CY, LF, EA…" value={form.unit} onChange={e=>set("unit",e.target.value)} style={inp} /></Field>
              <Field label="Quantity" required><input type="number" min="0" step="0.01" placeholder="0" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={inp} /></Field>
              <Field label="Unit Cost ($)" required><input type="number" min="0" step="0.01" placeholder="0.00" value={form.unitCost} onChange={e=>set("unitCost",e.target.value)} style={inp} /></Field>
              <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:20 }}>
                <input type="checkbox" id="inv" checked={form.fromInventory} onChange={e=>set("fromInventory",e.target.checked)} style={{ width:14, height:14 }} />
                <label htmlFor="inv" style={{ fontSize:12, fontWeight:600, color:"#444", cursor:"pointer" }}>From Inventory</label>
              </div>
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>Total Cost</div>
                <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:16, color:"#1a6b35" }}>{fmtSm(totalCost)}</div>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Notes / Vendor"><input type="text" placeholder="Supplier, delivery details…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleAdd} style={{ ...btn.small, background:"#6b3a1a" }}>Add Material Entry</button>
              <button onClick={() => setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}
        <Table
          headers={[{ label:"Date" },{ label:"Code" },{ label:"Description" },{ label:"Unit" },{ label:"Qty", right:true },{ label:"Unit Cost", right:true },{ label:"Source" },{ label:"Total", right:true }]}
          rows={entries.map(e => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.date}</span>,
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#1a3a5c", fontWeight:600 }}>{e.accountCode||"—"}</span>,
            e.description,
            e.unit||"—",
            <span style={{ fontFamily:"monospace" }}>{e.quantity}</span>,
            <span style={{ fontFamily:"monospace" }}>{fmtSm(e.unitCost)}</span>,
            e.fromInventory ? <span style={{ fontSize:10, background:"#e6f4ec", color:"#1a6b35", padding:"2px 6px", borderRadius:4, fontWeight:600 }}>Inventory</span> : "Purchase",
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a6b35" }}>{fmtSm(e.totalCost||0)}</span>,
          ])}
          emptyMessage="No material entries yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Contracted Work ───────────────────────────────────────────────────────────
function ContractedEntries({ entries, onAdd }) {
  const empty = { date:"", vendor:"", invoiceNumber:"", description:"", amount:"", accountCode:"", notes:"" };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const handleAdd = () => {
    if (!form.date || !form.vendor || !form.amount) return;
    onAdd({ ...form, amount:parseFloat(form.amount)||0 });
    setForm(empty); setAdding(false);
  };

  const contractCodes = EXPENDITURE_CODES.filter(c => c.category==="contracts");

  return (
    <div>
      <SectionCard
        title="Contracted Work"
        subtitle={`${entries.length} entries · Total: ${fmtSm(entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0))}`}
        action={<button onClick={() => setAdding(!adding)} style={btn.small}>+ Add Entry</button>}
      >
        {adding && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>
              <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Vendor / Contractor" required><input type="text" placeholder="Contractor name…" value={form.vendor} onChange={e=>set("vendor",e.target.value)} style={inp} /></Field>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Invoice Number"><input type="text" placeholder="Invoice #…" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Description" required><input type="text" placeholder="Work performed…" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} /></Field>
              </div>
              <Field label="Amount ($)" required><input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e=>set("amount",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Account Code">
                <select value={form.accountCode} onChange={e=>set("accountCode",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
                  <option value="">Select code…</option>
                  {contractCodes.map(c=><option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleAdd} style={{ ...btn.small, background:"#6b3a1a" }}>Add Entry</button>
              <button onClick={() => setAdding(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}
        <Table
          headers={[{ label:"Date" },{ label:"Vendor" },{ label:"Invoice #" },{ label:"Description" },{ label:"Code" },{ label:"Amount", right:true }]}
          rows={entries.map(e => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.date}</span>,
            <span style={{ fontWeight:600 }}>{e.vendor}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{e.invoiceNumber||"—"}</span>,
            e.description,
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#1a3a5c" }}>{e.accountCode||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color:"#5a1a8a" }}>{fmtSm(parseFloat(e.amount)||0)}</span>,
          ])}
          emptyMessage="No contracted work entries yet"
        />
      </SectionCard>
    </div>
  );
}

// ── FEMA Records ──────────────────────────────────────────────────────────────
function FEMARecords({ db }) {
  const femaProjects = (db.projects||[]).filter(p => p.isFEMA);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>FEMA Force Account Records</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Public Assistance — Nebraska Emergency Management (NEMA) · Force account documentation</div>
      </div>

      {femaProjects.length === 0 ? (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🚨</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#555", marginBottom:8 }}>No FEMA Projects</div>
          <div style={{ fontSize:13, color:"#aaa", maxWidth:360, margin:"0 auto" }}>
            To activate FEMA force account tracking, create a project and check "FEMA Disaster Project" with a disaster declaration number.
          </div>
        </div>
      ) : (
        femaProjects.map(p => {
          const labor      = p.laborEntries||[];
          const equipment  = p.equipmentEntries||[];
          const materials  = p.materialEntries||[];
          const contracted = p.contractedEntries||[];
          const laborTotal      = labor.reduce((s,e)=>s+(e.totalCost||0),0);
          const equipmentTotal  = equipment.reduce((s,e)=>s+(e.totalCost||0),0);
          const materialsTotal  = materials.reduce((s,e)=>s+(e.totalCost||0),0);
          const contractedTotal = contracted.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
          const grandTotal      = laborTotal+equipmentTotal+materialsTotal+contractedTotal;

          return (
            <div key={p.id} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, marginBottom:16, overflow:"hidden" }}>
              <div style={{ padding:"14px 18px", background:"#fdecea", borderBottom:"1px solid #f5c6c6", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#8c1b18" }}>{p.projectNumber} — {p.name}</div>
                  <div style={{ fontSize:12, color:"#c0392b", marginTop:2 }}>Disaster: {p.disasterNumber||"—"} · {p.location}</div>
                </div>
                <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:18, color:"#8c1b18" }}>{fmtSm(grandTotal)}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0 }}>
                {[
                  { label:"Force Account Labor",     value:laborTotal,      count:labor.length,      color:"#1a3a5c" },
                  { label:"Force Account Equipment", value:equipmentTotal,  count:equipment.length,  color:"#6b3a1a" },
                  { label:"Force Account Materials", value:materialsTotal,  count:materials.length,  color:"#1a6b35" },
                  { label:"Contract Work",           value:contractedTotal, count:contracted.length, color:"#5a1a8a" },
                ].map((k,i) => (
                  <div key={i} style={{ padding:"14px 18px", borderRight: i<3 ? "1px solid #eee" : "none" }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"#888", marginBottom:4 }}>{k.label}</div>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", color:k.color }}>{fmtSm(k.value)}</div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{k.count} entr{k.count===1?"y":"ies"}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding:"10px 18px", borderTop:"1px solid #eee", display:"flex", gap:10 }}>
                <button style={{ ...btn.small, background:"#c0392b", fontSize:11 }} onClick={() => alert("FEMA force account export coming in Reporting module — will generate PA-compliant documentation")}>
                  Export Force Account Records
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
