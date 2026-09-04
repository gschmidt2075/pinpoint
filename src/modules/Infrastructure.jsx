import { useState } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm, DateField, titleCase } from "../components/shared.jsx";
import { useUnsavedForm, useNavigationGuard } from "../components/unsaved.jsx";
import { createRoad, createBridge, createStructure, createStructureBarrel, createSign, createSignHistory, barrelLabel, barrelsSummary } from "../data/schema.js";


// Most entries are for today, so date fields open on it rather than blank. A
// blank date input is a small tax paid on every single row.
const today = () => new Date().toISOString().split("T")[0];
// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// NBIS condition rating (0–9 bridge scale)
function NBISRating({ value, size = "md" }) {
  if (value === null || value === undefined || value === "") return <span style={{ color:"#bbb", fontSize:12 }}>N/A</span>;
  const n = Number(value);
  const color = n >= 7 ? "#1a6b35" : n >= 5 ? "#d97706" : n >= 3 ? "#c0392b" : "#7b0000";
  const bg    = n >= 7 ? "#e6f4ec" : n >= 5 ? "#fef3cd" : n >= 3 ? "#fdecea" : "#f9d7d7";
  const px    = size === "lg" ? "8px 18px" : "3px 9px";
  const fs    = size === "lg" ? 20 : 13;
  return (
    <span style={{ background:bg, color, padding:px, borderRadius:99, fontWeight:700, fontSize:fs, fontFamily:"monospace" }}>{n}</span>
  );
}

// ── Culvert & structure condition ratings ────────────────────────────────────
// Source: "Culvert and Structure Rating Codes" (department standard).
//   Culvert  = CMP/CMAP of any size, or other material, UNDER 48"
//   Structure = anything 48" or greater, any material
// 5 is best and 1 is critical. 0 is NOT worse than 1 — it's an exception state
// that means something different for each asset type, and both demand attention.
export const RATING_CODES = {
  culvert: {
    5: { label:"Excellent", desc:"New or like new condition, structurally sound and functionally adequate." },
    4: { label:"Good",      desc:"Some deterioration — minor rust, minor damage — but structurally sound and functionally adequate." },
    3: { label:"Fair",      desc:"Advanced deterioration — rust with minor pinholes, major damage to ends, waterway issues starting to develop. Too short or low." },
    2: { label:"Poor",      desc:"Significant deterioration — major rust with large holes, smashed ends affecting performance, significant waterway issues." },
    1: { label:"Critical",  desc:"Very poor condition indicating possible failure. Needs assessment for closing and possible immediate action." },
    0: { label:"Unassessable", desc:"All or part of the culvert is inaccessible for assessment, or a rating cannot be assigned." },
  },
  structure: {
    5: { label:"Excellent", desc:"New or like new condition, structurally sound and functionally adequate." },
    4: { label:"Good",      desc:"Some deterioration — minor rust, minor damage, weathered planks or piling, minor cracking in concrete — but structurally sound and functionally adequate." },
    3: { label:"Fair",      desc:"Advanced deterioration — rust with minor pinholes, major damage to ends, deck plank or piling issues, minor cracking with spalling, waterway issues starting to develop." },
    2: { label:"Poor",      desc:"Significant deterioration — major rust with large holes, deformation in pipe shape due to rust, major plank or pile damage, severe cracking and spalling that may affect structural performance. Significant waterway issues." },
    1: { label:"Critical",  desc:"Very poor condition indicating possible failure. Needs assessment for closing and possible immediate action." },
    0: { label:"Closed",    desc:"Structure is closed." },
  },
  // Signs run 5 down to 1 with no exception state — confirmed 2026-07-26.
  // Retroreflectivity is managed by inspection rather than a replacement schedule.
  sign: {
    5: { label:"Excellent", desc:"" },
    4: { label:"Good",      desc:"" },
    3: { label:"Fair",      desc:"" },
    2: { label:"Poor",      desc:"" },
    1: { label:"Critical",  desc:"" },
  },
};

// Signs have no 0. Culverts and structures do, and it means different things.
export const ratingLevelsFor = (kind) => kind === "sign" ? [5,4,3,2,1] : [5,4,3,2,1,0];

// Which rating vocabulary applies, based on the asset's designation.
export const ratingKindFor = (designation) =>
  String(designation || "").toLowerCase() === "culvert" ? "culvert" : "structure";

// A 0 is an exception, not the bottom of the scale — render it distinctly so it
// doesn't read as "slightly worse than critical". Both 0 and 1 need action.
function ratingStyle(n) {
  if (n === 0) return { color:"#4a2d7a", bg:"#f0eaf8", border:"#c9b6e8" };
  if (n >= 4)  return { color:"#1a6b35", bg:"#e6f4ec", border:"#a8d5b5" };
  if (n === 3) return { color:"#d97706", bg:"#fef3cd", border:"#f0d080" };
  return         { color:"#c0392b", bg:"#fdecea", border:"#f5c6c6" };
}

function CondRating({ value, size = "sm", kind = "structure" }) {
  if (value === null || value === undefined || value === "") return <span style={{ color:"#bbb", fontSize:12 }}>—</span>;
  const n = Number(value);
  const entry = RATING_CODES[kind]?.[n];
  const { color, bg, border } = ratingStyle(n);
  return (
    <span
      title={entry?.desc || ""}
      style={{
        background:bg, color, border:`1px solid ${border}`,
        padding:size==="lg"?"8px 18px":"2px 9px", borderRadius:99,
        fontWeight:700, fontSize:size==="lg"?18:12, fontFamily:"monospace",
        whiteSpace:"nowrap",
      }}
    >
      {n} — {entry?.label || ""}
    </span>
  );
}

// Dropdown that shows the full criteria for the relevant asset type.
function RatingSelect({ value, onChange, kind = "structure", style }) {
  const codes = RATING_CODES[kind];
  return (
    <div>
      <select value={value ?? ""} onChange={e=>onChange(e.target.value === "" ? "" : Number(e.target.value))} style={style}>
        <option value="">Not rated…</option>
        {ratingLevelsFor(kind).map(n => (
          <option key={n} value={n}>{n} — {codes[n].label}</option>
        ))}
      </select>
      {value !== "" && value !== null && value !== undefined && codes[Number(value)] && (
        <div style={{ fontSize:11, color:"#777", marginTop:5, lineHeight:1.45 }}>
          {codes[Number(value)].desc}
        </div>
      )}
    </div>
  );
}

// ── Barrel editor ─────────────────────────────────────────────────────────────
// A site has one number but may hold several barrels of differing size, shape and
// material. Identical barrels are grouped by count:
//   A 2.2   → 2 - 72" X 58' CMAP
//   D 27.3C → 1 - 18" X 65' CMP  +  1 - 36" X 65' CMP
function BarrelEditor({ barrels, typeOptions, onChange }) {
  const add = () => onChange([...barrels, createStructureBarrel()]);
  const remove = (id) => onChange(barrels.filter(b => b.id !== id));
  const setField = (id, k, v) => onChange(barrels.map(b => b.id === id ? { ...b, [k]: v } : b));

  const totalBarrels = barrels.reduce((s, b) => s + (Number(b.count) || 0), 0);

  return (
    <div style={{ border:"1px solid #ddd", borderRadius:8, padding:16, marginBottom:14, background:"#fafaf8" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a" }}>Barrels</div>
        {totalBarrels > 0 && (
          <div style={{ fontSize:11, color:"#888" }}>
            {totalBarrels} barrel{totalBarrels !== 1 ? "s" : ""} across {barrels.length} spec{barrels.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
      <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
        One row per size/shape/material. Use the count for identical barrels — 2 of the same pipe is one row with count 2.
      </div>

      {barrels.length === 0 && (
        <div style={{ padding:"14px 0", textAlign:"center", color:"#aaa", fontSize:12 }}>
          No barrels recorded yet.
        </div>
      )}

      {barrels.map((b, i) => (
        <div key={b.id} style={{ display:"grid", gridTemplateColumns:"70px 100px 100px 1fr 1fr 36px", gap:8, alignItems:"end", marginBottom:8 }}>
          <Field label={i === 0 ? "Count" : ""}>
            <input type="number" min="1" step="1" value={b.count}
              onChange={e=>setField(b.id,"count",e.target.value === "" ? "" : Number(e.target.value))}
              style={{ ...inp, fontFamily:"monospace", margin:0 }} />
          </Field>
          <Field label={i === 0 ? "Size (in)" : ""}>
            <input type="text" value={b.size} onChange={e=>setField(b.id,"size",e.target.value)}
              style={{ ...inp, fontFamily:"monospace", margin:0 }} placeholder="72" />
          </Field>
          <Field label={i === 0 ? "Length (ft)" : ""}>
            <input type="text" value={b.length} onChange={e=>setField(b.id,"length",e.target.value)}
              style={{ ...inp, fontFamily:"monospace", margin:0 }} placeholder="58" />
          </Field>
          <Field label={i === 0 ? "Type" : ""}>
            <select value={b.type} onChange={e=>setField(b.id,"type",e.target.value)} style={{ ...inp, margin:0 }}>
              <option value="">Select…</option>
              {typeOptions.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </Field>
          <Field label={i === 0 ? "Notes" : ""}>
            <input type="text" value={b.notes} onChange={e=>setField(b.id,"notes",e.target.value)}
              style={{ ...inp, margin:0 }} placeholder="Optional…" />
          </Field>
          <button onClick={()=>remove(b.id)} title="Remove barrel"
            style={{ ...btn.danger, padding:"7px 0", fontSize:15, lineHeight:1, height:34 }}>×</button>
        </div>
      ))}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
        <button onClick={add} style={{ ...btn.secondary, fontSize:12, padding:"6px 14px" }}>+ Add Barrel</button>
        {barrels.length > 0 && (
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#1a5a3a", fontWeight:600 }}>
            {barrelsSummary(barrels)}
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsible reference so crews can check the criteria without leaving the page.
function RatingReference() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:16 }}>
      <button
        onClick={()=>setOpen(o=>!o)}
        style={{ background:"transparent", border:"none", color:"#1a3a5c", fontSize:12, fontWeight:600, cursor:"pointer", padding:0, display:"inline-flex", alignItems:"center", gap:6 }}
      >
        <Icon name={open?"chevron-down":"chevron-right"} size={13} color="#1a3a5c" />
        Rating criteria (0–5)
      </button>
      {open && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:10 }}>
          <div style={{ fontSize:11, color:"#888", marginBottom:12, lineHeight:1.5 }}>
            <strong>Culvert</strong> — CMP, CMAP or other material <strong>under 48"</strong>.{" "}
            <strong>Structure</strong> — anything <strong>48" or greater</strong>, any material.{" "}
            Anything NBIS-reportable is a bridge.
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["Code","Culvert","Structure"].map(h=>(
                  <th key={h} style={{ padding:"7px 10px", textAlign:"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee", width:h==="Code"?70:undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5,4,3,2,1,0].map((n,i)=>(
                <tr key={n} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
                    <CondRating value={n} kind="culvert" />
                  </td>
                  <td style={{ padding:"8px 10px", verticalAlign:"top", color:"#555", lineHeight:1.5 }}>{RATING_CODES.culvert[n].desc}</td>
                  <td style={{ padding:"8px 10px", verticalAlign:"top", color:"#555", lineHeight:1.5 }}>{RATING_CODES.structure[n].desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize:11, color:"#4a2d7a", background:"#f0eaf8", border:"1px solid #c9b6e8", borderRadius:5, padding:"8px 11px", marginTop:12 }}>
            <strong>A 0 is not worse than a 1 — it's a different thing.</strong> For a culvert it means
            nobody could assess it; for a structure it means it's closed. Either way it needs attention,
            which is why 0 is shown in purple rather than on the red-to-green scale.
          </div>
        </div>
      )}
    </div>
  );
}

// Detail sub-tab nav
function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
      {tabs.map(([id,label,icon])=>(
        <button key={id} onClick={()=>onChange(id)} style={{ background:"transparent", border:"none", padding:"8px 14px 10px", fontWeight:active===id?700:400, fontSize:13, cursor:"pointer", color:active===id?"#1a5a3a":"#666", borderBottom:active===id?"2px solid #1a5a3a":"2px solid transparent", marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6 }}>
          <Icon name={icon} size={12} color={active===id?"#1a5a3a":"#888"} />{label}
        </button>
      ))}
    </div>
  );
}

// Cost history for an asset — scans all projects for this assetId in linkedAssets
function AssetCostHistory({ assetId, projects }) {
  const linked = projects.filter(p =>
    (p.linkedAssets||[]).includes(assetId) ||
    [...(p.laborEntries||[]), ...(p.equipmentEntries||[]), ...(p.materialEntries||[]),
     ...(p.contractorEntries||[]), ...(p.engineeringEntries||[])].some(e => (e.linkedAssets||[]).includes(assetId))
  );

  if (linked.length === 0) {
    return <div style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>No projects or cost entries linked to this asset yet.</div>;
  }

  const calcTotal = p => {
    const sum = arr => (arr||[]).reduce((s,e) => s + (e.totalCost||e.amount||0), 0);
    return sum(p.laborEntries) + sum(p.equipmentEntries) + sum(p.materialEntries) + sum(p.contractorEntries) + sum(p.engineeringEntries);
  };

  return (
    <div>
      <div style={{ fontSize:13, color:"#888", marginBottom:12 }}>
        {linked.length} project{linked.length!==1?"s":""} linked — total: <strong style={{color:"#1a3a5c"}}>{fmtSm(linked.reduce((s,p)=>s+calcTotal(p),0))}</strong>
      </div>
      <Table
        headers={[{label:"Project"},{label:"Type"},{label:"Status"},{label:"Labor"},{label:"Equipment"},{label:"Materials"},{label:"Contractor"},{label:"Total"}]}
        rows={linked.map(p => {
          const labor = (p.laborEntries||[]).reduce((s,e)=>s+(e.totalCost||0),0);
          const equip = (p.equipmentEntries||[]).reduce((s,e)=>s+(e.totalCost||0),0);
          const mat   = (p.materialEntries||[]).reduce((s,e)=>s+(e.totalCost||0),0);
          const cont  = (p.contractorEntries||[]).reduce((s,e)=>s+(e.amount||e.totalCost||0),0);
          return [
            <span style={{fontWeight:700,fontSize:13}}>{p.name||p.projectNumber||"—"}</span>,
            <span style={{fontSize:12,textTransform:"capitalize"}}>{p.type}</span>,
            <span style={{fontSize:11,fontWeight:700,color:p.status==="active"?"#1a6b35":p.status==="complete"?"#888":"#d97706"}}>{(p.status||"").toUpperCase()}</span>,
            <span style={{fontFamily:"monospace",fontSize:12}}>{labor?fmtSm(labor):"—"}</span>,
            <span style={{fontFamily:"monospace",fontSize:12}}>{equip?fmtSm(equip):"—"}</span>,
            <span style={{fontFamily:"monospace",fontSize:12}}>{mat?fmtSm(mat):"—"}</span>,
            <span style={{fontFamily:"monospace",fontSize:12}}>{cont?fmtSm(cont):"—"}</span>,
            <span style={{fontFamily:"monospace",fontWeight:700}}>{fmtSm(labor+equip+mat+cont)}</span>,
          ];
        })}
        emptyMessage=""
      />
    </div>
  );
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Infrastructure({ db, dispatch }) {
  const go = useNavigationGuard();
  const [tab, setTab] = useState("roads");

  const TABS = [
    { id:"roads",      label:"Roads",                icon:"road" },
    { id:"bridges",    label:"Bridges",              icon:"building-bridge-2" },
    { id:"structures", label:"Culverts & Structures",icon:"archway" },
    { id:"signs",      label:"Signs",                icon:"sign-right" },
  ];

  const roads      = db.roads      || [];
  const bridges    = db.bridges    || [];
  const structures = db.structures || [];
  const signs      = db.signs      || [];
  const signHistory= db.signHistory|| [];
  const projects   = db.projects   || [];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={() => go(() => setTab(t.id))} style={{
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

      {tab==="roads"      && <RoadsTab      roads={roads}           projects={projects} dispatch={dispatch} />}
      {tab==="bridges"    && <BridgesTab    bridges={bridges}       projects={projects} dispatch={dispatch} />}
      {tab==="structures" && <StructuresTab structures={structures} projects={projects} db={db} dispatch={dispatch} />}
      {tab==="signs"      && <SignsTab      signs={signs} signHistory={signHistory} projects={projects} dispatch={dispatch} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROADS
// ═══════════════════════════════════════════════════════════════════════════════

// "2 yr 3 mo ago" reads better than a bare date when the question is
// "when did we last gravel this?"
function sinceLabel(dateStr) {
  if (!dateStr) return "—";
  const then = new Date(dateStr);
  if (isNaN(then)) return dateStr;
  const months = Math.max(0, Math.round((Date.now() - then.getTime()) / (1000*60*60*24*30.44)));
  if (months < 1)  return "this month";
  if (months < 12) return `${months} mo ago`;
  const y = Math.floor(months/12), m = months % 12;
  return m ? `${y} yr ${m} mo ago` : `${y} yr ago`;
}

function RoadsTab({ roads, projects, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState("");
  const [surfFilter, setSurfFilter] = useState("all");

  const selectedRoad = roads.find(r=>r.id===selected);

  // Mileage by surface type — not required for state reporting, but useful
  const activeRoads = roads.filter(r => r.status !== "inactive");
  const sumMiles = (list) =>
    list.reduce((s, r) => s + (parseFloat(r.lengthMiles) || 0), 0);
  const fmtMiles = (n) => n > 0 ? `${n.toFixed(1)} mi` : "—";
  const totalMiles = sumMiles(activeRoads) > 0 ? sumMiles(activeRoads).toFixed(1) : null;
  const milesFor = (...types) =>
    fmtMiles(sumMiles(activeRoads.filter(r => types.includes(r.surfaceType))));

  if (showForm || editing) {
    const road = editing ? roads.find(r=>r.id===editing) : null;
    return (
      <RoadForm
        road={road}
        onSave={payload => { dispatch({ type: road?"UPDATE_ROAD":"ADD_ROAD", payload }); setShowForm(false); setEditing(null); }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected && selectedRoad) {
    return (
      <RoadDetail
        road={selectedRoad}
        projects={projects}
        onBack={() => setSelected(null)}
        onEdit={() => { setSelected(null); setEditing(selectedRoad.id); }}
        dispatch={dispatch}
      />
    );
  }

  const SURFACES = ["all","Concrete","Bituminous","Gravel","Dirt"];
  const filtered = roads.filter(r => {
    if (r.status === "inactive") return false;
    if (surfFilter !== "all" && r.surfaceType !== surfFilter) return false;
    if (search && !`${r.name} ${r.from} ${r.to}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const byType = t => roads.filter(r=>r.surfaceType===t&&r.status!=="inactive").length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Road Segments</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, from, to…" style={{ ...inp, width:220, margin:0 }} />
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Road</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Total Segments" value={activeRoads.length}                                sub={totalMiles ? `${totalMiles} mi` : "Add lengths for mileage"} accent="#1a3a5c" icon="road" />
        <KPICard label="Paved"          value={byType("Concrete")+byType("Bituminous")}            sub={milesFor("Concrete","Bituminous")} accent="#1a6b35" icon="layers-subtract" />
        <KPICard label="Gravel"         value={byType("Gravel")}                                   sub={milesFor("Gravel")}               accent="#d97706" icon="circle-dots" />
        <KPICard label="Dirt"           value={byType("Dirt")}                                     sub={milesFor("Dirt")}                 accent="#888"    icon="wave-square" />
      </div>

      <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden", marginBottom:16, width:"fit-content" }}>
        {SURFACES.map(s=>(
          <button key={s} onClick={()=>setSurfFilter(s)} style={{ padding:"6px 13px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:surfFilter===s?"#1a3a5c":"#fff", color:surfFilter===s?"#fff":"#555" }}>
            {s==="all"?"All":s}
          </button>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Road Name","From","To","Surface","Miles","Last Graveled","Last Bladed",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"#aaa" }}>
                {roads.length===0?"No road segments yet — click Add Road.":"No roads match filter."}
              </td></tr>
            )}
            {filtered.map((r,i)=>(
              <tr key={r.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                onClick={()=>setSelected(r.id)}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                <td style={{ padding:"10px 14px", fontWeight:700 }}>{r.name||"—"}</td>
                <td style={{ padding:"10px 14px", fontSize:12, color:"#666" }}>{r.from||"—"}</td>
                <td style={{ padding:"10px 14px", fontSize:12, color:"#666" }}>{r.to||"—"}</td>
                <td style={{ padding:"10px 14px" }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99,
                    background:r.surfaceType==="Concrete"?"#e6edf5":r.surfaceType==="Bituminous"?"#2a2a2a":r.surfaceType==="Gravel"?"#f5ede0":"#f0ede8",
                    color:r.surfaceType==="Concrete"?"#1a3a5c":r.surfaceType==="Bituminous"?"#fff":r.surfaceType==="Gravel"?"#8a5a2a":"#555",
                  }}>{r.surfaceType||"—"}</span>
                </td>
                <td style={{ padding:"10px 14px", fontSize:12, fontFamily:"monospace" }}>{r.lengthMiles||"—"}</td>
                <td style={{ padding:"10px 14px", fontSize:12, fontFamily:"monospace", color:"#888" }}>{sinceLabel(r.lastGraveled)}</td>
                <td style={{ padding:"10px 14px", fontSize:12, fontFamily:"monospace", color:"#888" }}>{sinceLabel(r.lastBladed)}</td>
                <td style={{ padding:"10px 14px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoadDetail({ road: r, projects, onBack, onEdit, dispatch }) {
  const [tab, setTab] = useState("details");
  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Roads</button>
        <div style={{ fontSize:18, fontWeight:700, flex:1 }}>{r.name||"Road Segment"}</div>
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
        {r.status==="active" && (
          <button onClick={()=>{ dispatch({ type:"DELETE_ROAD", payload:r.id }); onBack(); }} style={{ ...btn.small, background:"#c0392b" }}>Deactivate</button>
        )}
      </div>
      <SubTabs tabs={[["details","Details","info-circle"],["cost","Cost History","coin"]]} active={tab} onChange={setTab} />
      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <SectionCard title="Location">
            {[["Road Name",r.name],["Authority",r.authority||"—"],["From",r.from||"—"],["To",r.to||"—"],["911 From",r.from911||"—"],["911 To",r.to911||"—"],["S/T/R",r.sectionTownshipRange||"—"],["GPS",r.latitude&&r.longitude?`${r.latitude}, ${r.longitude}`:"—"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Characteristics">
            {[["Surface Type",r.surfaceType||"—"],["Speed Limit",r.speedLimit?`${r.speedLimit} mph`:"—"],["Status",r.status||"active"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            {r.notes && <div style={{ padding:"10px 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{r.notes}</div>}
          </SectionCard>
        </div>
      )}
      {tab==="cost" && <AssetCostHistory assetId={r.id} projects={projects} />}
    </div>
  );
}

function RoadForm({ road, onSave, onCancel }) {
  const [form, setForm] = useState(road ? { ...road } : createRoad());
  useUnsavedForm(form, "this road");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{road?"Edit Road Segment":"Add Road Segment"}</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Road Name" required><input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} /></Field>
          <Field label="Authority"><input type="text" value={form.authority} onChange={e=>set("authority",e.target.value)} style={inp} placeholder="County, City, NAD…" /></Field>
          <Field label="Surface Type">
            <select value={form.surfaceType} onChange={e=>set("surfaceType",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {["Concrete","Bituminous","Gravel","Dirt"].map(s=><option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="From"><input type="text" value={form.from} onChange={e=>set("from",e.target.value)} style={inp} /></Field>
          <Field label="To"><input type="text" value={form.to} onChange={e=>set("to",e.target.value)} style={inp} /></Field>
          <Field label="Speed Limit"><input type="text" value={form.speedLimit} onChange={e=>set("speedLimit",e.target.value)} style={inp} placeholder="55" /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="911 From"><input type="text" value={form.from911} onChange={e=>set("from911",e.target.value)} style={inp} /></Field>
          <Field label="911 To"><input type="text" value={form.to911} onChange={e=>set("to911",e.target.value)} style={inp} /></Field>
          <Field label="Section / Township / Range"><input type="text" value={form.sectionTownshipRange} onChange={e=>set("sectionTownshipRange",e.target.value)} style={inp} placeholder="29-8-9" /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Length (miles)"><input type="text" value={form.lengthMiles} onChange={e=>set("lengthMiles",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="1.0" /></Field>
          <Field label="Latitude"><input type="text" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Longitude"><input type="text" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>

        {/* Surface work history — "last graveled 14 months ago" is what drives the next decision */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:3 }}>Surface Work History</div>
          <div style={{ fontSize:11, color:"#888", marginBottom:11 }}>Leave blank if it's never been done or isn't known.</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
            <Field label="Last Graveled"><DateField value={form.lastGraveled} onChange={v => set("lastGraveled", v)} /></Field>
            <Field label="Last Bladed"><DateField value={form.lastBladed} onChange={v => set("lastBladed", v)} /></Field>
            <Field label="Last Sealed"><DateField value={form.lastSealed} onChange={v => set("lastSealed", v)} /></Field>
          </div>
        </div>

        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{road?"Save Changes":"Add Road"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRIDGES
// ═══════════════════════════════════════════════════════════════════════════════

function BridgesTab({ bridges, projects, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState("");
  const [condFilter, setCondFilter] = useState("all");

  const selectedBridge = bridges.find(b=>b.id===selected);

  if (showForm || editing) {
    const bridge = editing ? bridges.find(b=>b.id===editing) : null;
    return (
      <BridgeForm
        bridge={bridge}
        onSave={payload => { dispatch({ type: bridge?"UPDATE_BRIDGE":"ADD_BRIDGE", payload }); setShowForm(false); setEditing(null); }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected && selectedBridge) {
    return (
      <BridgeDetail
        bridge={selectedBridge}
        projects={projects}
        onBack={() => setSelected(null)}
        onEdit={() => { setSelected(null); setEditing(selectedBridge.id); }}
      />
    );
  }

  // The state database is the system of record. New records carry one current
  // rating; older ones may still hold the three component ratings.
  function minRating(b) {
    if (b.nbisRating !== null && b.nbisRating !== undefined && b.nbisRating !== "") return Number(b.nbisRating);
    const vals = [b.ratingDeck, b.ratingSubstructure, b.ratingSuperstructure].filter(v=>v!==null&&v!==undefined&&v!=="");
    return vals.length ? Math.min(...vals.map(Number)) : null;
  }

  const filtered = bridges.filter(b => {
    if (b.status !== "active") return false;
    if (search && !`${b.stateNumber} ${b.countyNumber} ${b.road} ${b.features}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (condFilter !== "all") {
      const min = minRating(b);
      if (condFilter==="good" && (min===null||min<7)) return false;
      if (condFilter==="fair" && (min===null||min<5||min>=7)) return false;
      if (condFilter==="poor" && (min===null||min>=5)) return false;
    }
    return true;
  });

  const active  = bridges.filter(b=>b.status==="active");
  const poor    = active.filter(b=>{ const m=minRating(b); return m!==null&&m<5; }).length;
  const fair    = active.filter(b=>{ const m=minRating(b); return m!==null&&m>=5&&m<7; }).length;
  const good    = active.filter(b=>{ const m=minRating(b); return m!==null&&m>=7; }).length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Bridges</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="State #, county #, road, feature…" style={{ ...inp, width:240, margin:0 }} />
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Bridge</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Total Bridges" value={active.length} sub=""          accent="#1a3a5c" icon="building-bridge-2" />
        <KPICard label="Good (7–9)"    value={good}          sub="NBIS ≥ 7"  accent="#1a6b35" icon="check-circle" />
        <KPICard label="Fair (5–6)"    value={fair}          sub="NBIS 5–6"  accent="#d97706" icon="alert-triangle" />
        <KPICard label="Poor (≤ 4)"    value={poor}          sub="NBIS ≤ 4"  accent="#c0392b" icon="alert-circle" />
      </div>

      <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden", marginBottom:16, width:"fit-content" }}>
        {[["all","All"],["good","Good (7–9)"],["fair","Fair (5–6)"],["poor","Poor (≤ 4)"]].map(([v,l])=>(
          <button key={v} onClick={()=>setCondFilter(v)} style={{ padding:"6px 13px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:condFilter===v?"#1a3a5c":"#fff", color:condFilter===v?"#fff":"#555" }}>{l}</button>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["State #","County #","Road","Feature","Deck W","Length","Year","NBIS","Flags",""].map(h=>(
                <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={11} style={{ padding:32, textAlign:"center", color:"#aaa" }}>
                {bridges.length===0?"No bridges yet.":"No bridges match filter."}
              </td></tr>
            )}
            {filtered.map((b,i)=>(
              <tr key={b.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                onClick={()=>setSelected(b.id)}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                <td style={{ padding:"9px 12px", fontFamily:"monospace", fontWeight:700, fontSize:12 }}>{b.stateNumber||"—"}</td>
                <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:12 }}>{b.countyNumber||"—"}</td>
                <td style={{ padding:"9px 12px", fontWeight:600 }}>{b.road||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, color:"#666" }}>{b.features||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, fontFamily:"monospace" }}>{b.deckWidth?`${b.deckWidth}'`:"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, fontFamily:"monospace" }}>{b.structLength?`${b.structLength}'`:"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12 }}>{b.yearBuilt||"—"}</td>
                <td style={{ padding:"9px 12px" }}><NBISRating value={minRating(b)} /></td>
                <td style={{ padding:"9px 12px", fontSize:11 }}>
                  {b.loadPosted && <span title={b.loadLimit?`Posted ${b.loadLimit}`:"Load posted"} style={{ background:"#fef3cd", color:"#7a4f00", border:"1px solid #f0d080", borderRadius:4, padding:"1px 6px", marginRight:4, fontWeight:700 }}>{b.loadLimit||"POSTED"}</span>}
                  {b.scourCritical && <span title="Scour critical" style={{ background:"#fdecea", color:"#8c1b18", border:"1px solid #f5c6c6", borderRadius:4, padding:"1px 6px", marginRight:4, fontWeight:700 }}>SC</span>}
                  {b.fractureCritical && <span title="Fracture critical" style={{ background:"#fdecea", color:"#8c1b18", border:"1px solid #f5c6c6", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>FC</span>}
                </td>
                <td style={{ padding:"9px 12px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BridgeDetail({ bridge: b, projects, onBack, onEdit }) {
  const [tab, setTab] = useState("details");
  const legacy = [b.ratingDeck, b.ratingSubstructure, b.ratingSuperstructure].filter(v=>v!==null&&v!==undefined&&v!=="");
  const minRating = (b.nbisRating !== null && b.nbisRating !== undefined && b.nbisRating !== "")
    ? Number(b.nbisRating)
    : (legacy.length ? Math.min(...legacy.map(Number)) : null);
  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Bridges</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontFamily:"monospace", color:"#888" }}>{b.stateNumber} · {b.countyNumber}</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{b.road||"Bridge"}</div>
          <div style={{ fontSize:13, color:"#666" }}>{b.features||""}</div>
        </div>
        {minRating!==null && <NBISRating value={minRating} size="lg" />}
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
      </div>
      <SubTabs tabs={[["details","Details","info-circle"],["cost","Cost History","coin"]]} active={tab} onChange={setTab} />
      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
          <SectionCard title="Identification">
            {[["State #",b.stateNumber||"—"],["County #",b.countyNumber||"—"],["Road",b.road||"—"],["Feature Crossed",b.features||"—"],["Year Built",b.yearBuilt||"—"],["Status",b.status||"active"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600, fontFamily:"monospace" }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Dimensions">
            {[["Deck Width",b.deckWidth?`${b.deckWidth} ft`:"—"],["Structure Length",b.structLength?`${b.structLength} ft`:"—"],["Max Span",b.maxSpanLength?`${b.maxSpanLength} ft`:"—"],["# Spans",b.spans||"—"],["GPS",b.latitude&&b.longitude?`${b.latitude}, ${b.longitude}`:"—"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="NBIS Condition & Postings">
            <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:5, padding:"8px 11px", fontSize:11, color:"#1a3a5c", marginBottom:14, lineHeight:1.5 }}>
              Inspections are performed by county staff and recorded in the <strong>state database</strong>,
              which remains the system of record. The rating held here is a reference copy — action is
              triggered at 3 or 4.
            </div>
            <div style={{ fontSize:11, color:"#888", marginBottom:10 }}>0 = Failed · 4 = Poor · 6 = Satisfactory · 9 = Excellent</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0f0ee" }}>
              <span style={{ fontSize:14, fontWeight:600 }}>Current Rating</span>
              <NBISRating value={minRating} size="lg" />
            </div>
            {b.nbisInspected && (
              <div style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>Last Inspected</span><span style={{ fontWeight:600 }}>{fmtDate(b.nbisInspected)}</span>
              </div>
            )}
            {[["Load Posted", b.loadPosted ? (b.loadLimit || "Yes") : "No"],
              ["Scour Critical", b.scourCritical ? "Yes" : "No"],
              ["Fracture Critical", b.fractureCritical ? "Yes" : "No"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span>
                <span style={{ fontWeight:600, color:(v!=="No")?"#c0392b":"#1a1a1a" }}>{v}</span>
              </div>
            ))}
            {legacy.length > 0 && (
              <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #eee" }}>
                <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"#aaa", marginBottom:7 }}>Legacy component ratings</div>
                {[["Deck",b.ratingDeck],["Substructure",b.ratingSubstructure],["Superstructure",b.ratingSuperstructure]]
                  .filter(([,v])=>v!==null&&v!==undefined&&v!=="")
                  .map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", fontSize:12 }}>
                    <span style={{ color:"#888" }}>{k}</span><NBISRating value={v} />
                  </div>
                ))}
              </div>
            )}
            {b.notes && <div style={{ padding:"10px 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{b.notes}</div>}
          </SectionCard>
        </div>
      )}
      {tab==="cost" && <AssetCostHistory assetId={b.id} projects={projects} />}
    </div>
  );
}

function BridgeForm({ bridge, onSave, onCancel }) {
  const [form, setForm] = useState(bridge ? { ...bridge } : createBridge());
  useUnsavedForm(form, "this bridge");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ maxWidth:720 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{bridge?"Edit Bridge":"Add Bridge"}</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:12 }}>Identification</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="State Number"><input type="text" value={form.stateNumber} onChange={e=>set("stateNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="C00205" /></Field>
          <Field label="County Number"><input type="text" value={form.countyNumber} onChange={e=>set("countyNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="N 36.1" /></Field>
          <Field label="FAS Number"><input type="text" value={form.fasNumber} onChange={e=>set("fasNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Road / Street"><input type="text" value={form.road} onChange={e=>set("road",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Feature Crossed"><input type="text" value={form.features} onChange={e=>set("features",e.target.value)} style={inp} placeholder="Little Blue, Flat Creek, DITCH…" /></Field>
          <Field label="Route"><input type="text" value={form.route} onChange={e=>set("route",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Deck Width (ft)"><input type="text" value={form.deckWidth} onChange={e=>set("deckWidth",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Structure Length (ft)"><input type="text" value={form.structLength} onChange={e=>set("structLength",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Max Span (ft)"><input type="text" value={form.maxSpanLength} onChange={e=>set("maxSpanLength",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="# Spans"><input type="text" value={form.spans} onChange={e=>set("spans",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Year Built"><input type="text" value={form.yearBuilt} onChange={e=>set("yearBuilt",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="1967" /></Field>
        </div>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:6, marginTop:8 }}>NBIS — reference from state database</div>
        <div style={{ fontSize:11, color:"#888", marginBottom:12, lineHeight:1.5 }}>
          Inspections live in the state system. Copy the current rating across so action items surface here — 3 or 4 triggers action.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Current NBIS Rating (0–9)">
            <select value={form.nbisRating??""} onChange={e=>set("nbisRating",e.target.value===""?null:Number(e.target.value))} style={inp}>
              <option value="">Not rated</option>
              {[9,8,7,6,5,4,3,2,1,0].map(n=><option key={n} value={n}>{n} — {n>=7?"Good":n>=5?"Fair":n>=3?"Poor":"Critical/Failed"}</option>)}
            </select>
          </Field>
          <Field label="Last Inspected">
            <DateField value={form.nbisInspected} onChange={v => set("nbisInspected", v)} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14, alignItems:"end" }}>
          <Field label="Load Posted">
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", height:34 }}>
              <input type="checkbox" checked={!!form.loadPosted} onChange={e=>set("loadPosted",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
              <span style={{ fontSize:13 }}>Posted</span>
            </label>
          </Field>
          <Field label="Load Limit">
            <input type="text" value={form.loadLimit} onChange={e=>set("loadLimit",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="20 T" disabled={!form.loadPosted} />
          </Field>
          <Field label="Scour Critical">
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", height:34 }}>
              <input type="checkbox" checked={!!form.scourCritical} onChange={e=>set("scourCritical",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
              <span style={{ fontSize:13 }}>Yes</span>
            </label>
          </Field>
          <Field label="Fracture Critical">
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", height:34 }}>
              <input type="checkbox" checked={!!form.fractureCritical} onChange={e=>set("fractureCritical",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
              <span style={{ fontSize:13 }}>Yes</span>
            </label>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Latitude"><input type="text" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Longitude"><input type="text" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              {["active","replaced","removed","closed"].map(s=><option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{bridge?"Save Changes":"Add Bridge"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CULVERTS & STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

const TOWNSHIPS_NE = ["West Blue","Blaine","Pauline","Kenesaw","Roseland","Holstein","Oak Creek","Pleasant Hill"];

function StructuresTab({ structures, projects, db, dispatch }) {
  // Editable lists live in the database — see Settings → Lists
  const structureTypes = db?.lookups?.structureTypes || [];
  const townshipList   = (db?.townships || []).map(t => t.name || t);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState("");
  const [desigFilter, setDesigFilter] = useState("all");
  const [townFilter, setTownFilter]   = useState("all");

  const selectedStruct = structures.find(s=>s.id===selected);

  if (showForm || editing) {
    const str = editing ? structures.find(s=>s.id===editing) : null;
    return (
      <StructureForm
        structureTypes={structureTypes}
        townshipList={townshipList}
        structure={str}
        onSave={payload => { dispatch({ type: str?"UPDATE_STRUCTURE":"ADD_STRUCTURE", payload }); setShowForm(false); setEditing(null); }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected && selectedStruct) {
    return (
      <StructureDetail
        structure={selectedStruct}
        projects={projects}
        onBack={() => setSelected(null)}
        onEdit={() => { setSelected(null); setEditing(selectedStruct.id); }}
      />
    );
  }

  const active = structures;
  const towns  = [...new Set(active.filter(s=>s.township).map(s=>s.township))].sort();
  const filtered = active.filter(s => {
    if (desigFilter !== "all" && s.designation !== desigFilter) return false;
    if (townFilter  !== "all" && s.township    !== townFilter)  return false;
    if (search && !`${s.culvertNumber} ${s.road} ${s.township} ${barrelsSummary(s.barrels)}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Culverts &amp; Structures</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Number, road, feature…" style={{ ...inp, width:220, margin:0 }} />
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Structure</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Total"           value={active.length} sub="Structures"    accent="#1a3a5c" icon="archway" />
        <KPICard label="Structures"      value={active.filter(s=>s.designation==="Structure").length} sub="Primary" accent="#1a5a3a" icon="building-arch" />
        <KPICard label="Culverts"        value={active.filter(s=>s.designation==="Culvert").length} sub="" accent="#d97706" icon="ripple" />
        <KPICard
          label="Needs Attention"
          value={active.filter(s => {
            if (s.rating === null || s.rating === undefined || s.rating === "") return false;
            const n = Number(s.rating);
            // 1–2 are failing. 0 is an exception state — unassessable culvert or
            // closed structure — and takes priority either way.
            return n === 0 || n <= 2;
          }).length}
          sub="Rating 0, 1 or 2"
          accent="#c0392b"
          icon="alert-circle"
        />
      </div>

      <RatingReference />

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
          {[["all","All"],["Structure","Structure"],["Culvert","Culvert"],["Bridge","Bridge (small)"]].map(([v,l])=>(
            <button key={v} onClick={()=>setDesigFilter(v)} style={{ padding:"6px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:desigFilter===v?"#1a3a5c":"#fff", color:desigFilter===v?"#fff":"#555" }}>{l}</button>
          ))}
        </div>
        <select value={townFilter} onChange={e=>setTownFilter(e.target.value)} style={{ ...inp, margin:0, fontSize:12, minWidth:140 }}>
          <option value="all">All Townships</option>
          {towns.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
        </select>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Culvert #","Designation","Road","Township","Barrels","Rating",""].map(h=>(
                <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:"#aaa" }}>
                {structures.length===0?"No structures yet.":"No structures match filter."}
              </td></tr>
            )}
            {filtered.map((s,i)=>(
              <tr key={s.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                onClick={()=>setSelected(s.id)}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                <td style={{ padding:"9px 12px", fontFamily:"monospace", fontWeight:700 }}>{s.culvertNumber||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12 }}>{s.designation||"—"}</td>
                <td style={{ padding:"9px 12px", fontWeight:600 }}>{s.road||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12 }}>{s.township||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, fontFamily:"monospace", maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {barrelsSummary(s.barrels) || s.sizeAndType || "—"}
                </td>
                <td style={{ padding:"9px 12px" }}><CondRating value={s.rating} kind={ratingKindFor(s.designation)} /></td>
                <td style={{ padding:"9px 12px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructureDetail({ structure: s, projects, onBack, onEdit }) {
  const [tab, setTab] = useState("details");
  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Structures</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontFamily:"monospace", color:"#888" }}>{s.culvertNumber} · {s.designation}</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{s.road||"Structure"}</div>
          <div style={{ fontSize:13, color:"#666" }}>{s.township||""}</div>
        </div>
        <CondRating value={s.rating} size="lg" kind={ratingKindFor(s.designation)} />
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
      </div>
      <SubTabs tabs={[["details","Details","info-circle"],["cost","Cost History","coin"]]} active={tab} onChange={setTab} />
      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <SectionCard title="Location & Classification">
            {[
              ["Culvert Number",s.culvertNumber||"—"],["Designation",s.designation||"—"],["Road Designation",s.roadDesignation||"—"],
              ["Road",s.road||"—"],["Township",s.township||"—"],
              ["Project Ref",s.project||"—"],
              ["GPS",s.latitude&&s.longitude?`${s.latitude}, ${s.longitude}`:"—"],
            ].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Physical / Condition">
            {[
              ["Barrels",barrelsSummary(s.barrels) || s.sizeAndType || "—"],
              ["Total Barrels",(s.barrels||[]).reduce((n,b)=>n+(Number(b.count)||0),0) || "—"],
              ["Year Built",s.yearBuilt||"—"],
            ].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #f0f0ee" }}>
              <span style={{ fontSize:14, fontWeight:600 }}>Condition Rating</span>
              <CondRating value={s.rating} size="lg" kind={ratingKindFor(s.designation)} />
            </div>
            {s.notes && <div style={{ padding:"10px 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{s.notes}</div>}
          </SectionCard>
        </div>
      )}
      {tab==="cost" && <AssetCostHistory assetId={s.id} projects={projects} />}
    </div>
  );
}

function StructureForm({ structure, structureTypes = [], townshipList = [], onSave, onCancel }) {
  // Older records held a single barrel across shape/diameter/length. Lift that into
  // the barrels list on first edit so nothing is lost.
  const [form, setForm] = useState(() => {
    if (!structure) return createStructure();
    const f = { ...structure };
    if (!Array.isArray(f.barrels)) f.barrels = [];
    if (f.barrels.length === 0 && (f.shape || f.diameter || f.length)) {
      f.barrels = [createStructureBarrel({
        count:  1,
        size:   f.diameter || "",
        length: f.length   || "",
        type:   f.shape    || "",
        notes:  f.sizeAndType ? `Migrated from: ${f.sizeAndType}` : "",
      })];
    }
    return f;
  });
  useUnsavedForm(form, "this structure");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ maxWidth:720 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{structure?"Edit Structure":"Add Structure / Culvert"}</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Culvert Number"><input type="text" value={form.culvertNumber} onChange={e=>set("culvertNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="A 1.1" /></Field>
          <Field label="Designation">
            <select value={form.designation} onChange={e=>set("designation",e.target.value)} style={inp}>
              {["Structure","Culvert","Bridge"].map(d=><option key={d} value={d}>{titleCase(d)}</option>)}
            </select>
          </Field>
          <Field label="Road Designation">
            <select value={form.roadDesignation} onChange={e=>set("roadDesignation",e.target.value)} style={inp}>
              {["Primary","Secondary"].map(d=><option key={d} value={d}>{titleCase(d)}</option>)}
            </select>
          </Field>
          <Field label="Year Built"><input type="text" value={form.yearBuilt} onChange={e=>set("yearBuilt",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Road"><input type="text" value={form.road} onChange={e=>set("road",e.target.value)} style={inp} /></Field>
          <Field label="Township">
            <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {townshipList.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </Field>
        </div>

        {/* Barrels — a site may hold several of differing size, shape and material */}
        <BarrelEditor
          barrels={form.barrels || []}
          typeOptions={structureTypes}
          onChange={list => set("barrels", list)}
        />

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Project Ref"><input type="text" value={form.project} onChange={e=>set("project",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="M-2024-01…" /></Field>
          <Field label="Latitude"><input type="text" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="40.5853" /></Field>
          <Field label="Longitude"><input type="text" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="-98.3889" /></Field>
        </div>
        <div style={{ marginBottom:14, maxWidth:520 }}>
          <Field label={`Condition Rating (0–5) — ${ratingKindFor(form.designation)==="culvert"?"culvert":"structure"} criteria`}>
            <RatingSelect
              value={form.rating ?? ""}
              onChange={v=>set("rating", v === "" ? null : v)}
              kind={ratingKindFor(form.designation)}
              style={inp}
            />
          </Field>
        </div>
        <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} /></Field>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{structure?"Save Changes":"Add Structure"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNS
// ═══════════════════════════════════════════════════════════════════════════════

const SIGN_REASONS     = ["New","Replacement","HSIP","Damage","Vandalism","Other"];
const SIGN_EVENT_TYPES = ["replacement","repair","HSIP_upgrade","inspection","removal"];

function SignsTab({ signs, signHistory, projects, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState("");
  const [townFilter, setTownFilter] = useState("all");

  const selectedSign = signs.find(s=>s.id===selected);

  if (showForm || editing) {
    const sign = editing ? signs.find(s=>s.id===editing) : null;
    return (
      <SignForm
        sign={sign}
        onSave={payload => { dispatch({ type: sign?"UPDATE_SIGN":"ADD_SIGN", payload }); setShowForm(false); setEditing(null); }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected && selectedSign) {
    return (
      <SignDetail
        sign={selectedSign}
        history={signHistory.filter(h=>h.signId===selectedSign.id)}
        projects={projects}
        onBack={() => setSelected(null)}
        onEdit={() => { setSelected(null); setEditing(selectedSign.id); }}
        dispatch={dispatch}
      />
    );
  }

  const active = signs.filter(s=>s.status==="active");
  const towns  = [...new Set(active.filter(s=>s.township).map(s=>s.township))].sort();
  const filtered = active.filter(s => {
    if (townFilter !== "all" && s.township !== townFilter) return false;
    if (search && !`${s.signName} ${s.signType} ${s.onRoad} ${s.township} ${s.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Signs</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Sign type, road, name…" style={{ ...inp, width:200, margin:0 }} />
          <select value={townFilter} onChange={e=>setTownFilter(e.target.value)} style={{ ...inp, margin:0, fontSize:12, minWidth:130 }}>
            <option value="all">All Townships</option>
            {towns.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ Add Sign</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Active Signs"   value={active.length} sub=""                     accent="#1a3a5c" icon="sign-right" />
        <KPICard label="HSIP Signs"     value={active.filter(s=>s.reason==="HSIP").length} sub=""        accent="#1a5a3a" icon="shield-check" />
        <KPICard label="Need Attention" value={active.filter(s=>s.signRating!==null&&s.signRating!==undefined&&Number(s.signRating)<=2).length} sub="Rating ≤ 2" accent="#c0392b" icon="alert-triangle" />
        <KPICard label="Unrated"        value={active.filter(s=>s.signRating===null||s.signRating===undefined||s.signRating==="").length} sub="Signs" accent="#888" icon="question-mark" />
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Sign Name","DOT Type","Road","Township","Side","Direction","Reason","Rating",""].map(h=>(
                <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:"#aaa" }}>
                {signs.length===0?"No signs yet.":"No signs match filter."}
              </td></tr>
            )}
            {filtered.map((s,i)=>(
              <tr key={s.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                onClick={()=>setSelected(s.id)}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                <td style={{ padding:"9px 12px", fontWeight:700 }}>{s.signName||"—"}</td>
                <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:12 }}>{s.signType||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12 }}>{s.onRoad||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12 }}>{s.township||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, color:"#888" }}>{s.sideOfRoad||"—"}</td>
                <td style={{ padding:"9px 12px", fontSize:12, color:"#888" }}>{s.travelDirection||"—"}</td>
                <td style={{ padding:"9px 12px" }}>
                  {s.reason && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:s.reason==="HSIP"?"#e6edf5":"#f0f0ee", color:s.reason==="HSIP"?"#1a3a5c":"#555" }}>{s.reason}</span>}
                </td>
                <td style={{ padding:"9px 12px" }}><CondRating value={s.signRating} kind="sign" /></td>
                <td style={{ padding:"9px 12px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignDetail({ sign: s, history, projects, onBack, onEdit, dispatch }) {
  const [tab, setTab]   = useState("details");
  const [showHist, setShowHist] = useState(false);
  const [hForm, setHForm] = useState({ date: today(), eventType:"replacement", description:"", materialsUsed:"", performedBy:"", notes:"" });
  const setH = (k,v) => setHForm(f=>({...f,[k]:v}));

  const saveHistory = () => {
    if (!hForm.date||!hForm.eventType) return;
    dispatch({ type:"ADD_SIGN_HISTORY", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      signId:s.id, ...hForm, createdAt:new Date().toISOString(),
    }});
    setHForm({ date: today(), eventType:"replacement", description:"", materialsUsed:"", performedBy:"", notes:"" });
    setShowHist(false);
  };

  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Signs</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontFamily:"monospace", color:"#888" }}>{s.signType}{s.dotNumber?` · ${s.dotNumber}`:""}</div>
          <div style={{ fontSize:18, fontWeight:700 }}>{s.signName||"Sign"}</div>
          <div style={{ fontSize:13, color:"#666" }}>{s.onRoad||""}{s.township?` · ${s.township}`:""}</div>
        </div>
        {(s.signRating!==null&&s.signRating!==undefined&&s.signRating!=="") && <CondRating value={s.signRating} size="lg" kind="sign" />}
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
      </div>
      <SubTabs tabs={[["details","Details","info-circle"],["history","Service History","history"],["cost","Cost History","coin"]]} active={tab} onChange={setTab} />

      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
          <SectionCard title="Location">
            {[["On Road",s.onRoad||"—"],["Township",s.township||"—"],["Side of Road",s.sideOfRoad||"—"],["Travel Direction",s.travelDirection||"—"],["Offset",s.offset||"—"],["Road Back",s.roadBack||"—"],["Road Ahead",s.roadAhead||"—"],["GPS",s.latitude&&s.longitude?`${s.latitude}, ${s.longitude}`:"—"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Sign Information">
            {[["Sign Name",s.signName||"—"],["DOT Type Code",s.signType||"—"],["Description",s.description||"—"],["DOT Number",s.dotNumber||"—"],["Reason",s.reason||"—"],["Status",s.status||"active"],["Position",s.position||"—"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Physical / Condition">
            {[["Surface / Sheeting",s.surface||"—"],["Sheeting Type",s.sheeting||"—"],["Size",s.size||"—"],["Support Type",s.supportType||"—"],["Support Material",s.supportMaterial||"—"],["Support Length",s.supportLength||"—"],["Stub",s.stub?"Yes":"No"],["Materials Used",s.materialsUsed||"—"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0" }}>
              <span style={{ fontSize:14, fontWeight:600 }}>Condition Rating</span>
              <CondRating value={s.signRating} size="lg" kind="sign" />
            </div>
            {s.notes && <div style={{ padding:"8px 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{s.notes}</div>}
          </SectionCard>
        </div>
      )}

      {tab==="history" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ fontSize:13 }}>{history.length} service event{history.length!==1?"s":""}</div>
            <button onClick={()=>setShowHist(v=>!v)} style={btn.primary}>{showHist?"Cancel":"+ Log Event"}</button>
          </div>
          {showHist && (
            <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Date"><DateField value={hForm.date} onChange={v => setH("date", v)} /></Field>
                <Field label="Event Type">
                  <select value={hForm.eventType} onChange={e=>setH("eventType",e.target.value)} style={{ ...inp, margin:0 }}>
                    {SIGN_EVENT_TYPES.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
                  </select>
                </Field>
                <Field label="Description"><input type="text" value={hForm.description} onChange={e=>setH("description",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                <Field label="Performed By"><input type="text" value={hForm.performedBy} onChange={e=>setH("performedBy",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Materials Used"><input type="text" value={hForm.materialsUsed} onChange={e=>setH("materialsUsed",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                <Field label="Notes"><input type="text" value={hForm.notes} onChange={e=>setH("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
              </div>
              <button onClick={saveHistory} style={{ ...btn.primary, marginTop:14 }}>Log Event</button>
            </div>
          )}
          <Table
            headers={[{label:"Date"},{label:"Event"},{label:"Description"},{label:"Materials"},{label:"Performed By"},{label:"Notes"}]}
            rows={[...history].sort((a,b)=>b.date.localeCompare(a.date)).map(h=>[
              <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(h.date)}</span>,
              <span style={{fontSize:11,fontWeight:700,background:"#f0f0ee",padding:"2px 7px",borderRadius:4}}>{(h.eventType||"").replace(/_/g," ")}</span>,
              h.description||"—", h.materialsUsed||"—", h.performedBy||"—",
              <span style={{fontSize:12,color:"#888"}}>{h.notes||"—"}</span>,
            ])}
            emptyMessage="No service history yet"
          />
        </div>
      )}

      {tab==="cost" && <AssetCostHistory assetId={s.id} projects={projects} />}
    </div>
  );
}

function SignForm({ sign, onSave, onCancel }) {
  const [form, setForm] = useState(sign ? { ...sign } : createSign());
  useUnsavedForm(form, "this sign");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Cancel</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{sign?"Edit Sign":"Add Sign"}</div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:12 }}>Location</div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="On Road"><input type="text" value={form.onRoad} onChange={e=>set("onRoad",e.target.value)} style={inp} /></Field>
          <Field label="Township">
            <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {TOWNSHIPS_NE.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </Field>
          <Field label="Side of Road">
            <select value={form.sideOfRoad} onChange={e=>set("sideOfRoad",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {["N","S","E","W","NE","NW","SE","SW"].map(s=><option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
          <Field label="Travel Direction">
            <select value={form.travelDirection} onChange={e=>set("travelDirection",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {["N","S","E","W"].map(d=><option key={d} value={d}>{titleCase(d)}</option>)}
            </select>
          </Field>
          <Field label="Offset"><input type="text" value={form.offset} onChange={e=>set("offset",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Road Back"><input type="text" value={form.roadBack} onChange={e=>set("roadBack",e.target.value)} style={inp} /></Field>
          <Field label="Road Ahead"><input type="text" value={form.roadAhead} onChange={e=>set("roadAhead",e.target.value)} style={inp} /></Field>
          <Field label="Latitude"><input type="text" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Longitude"><input type="text" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:12, marginTop:8 }}>Sign Info</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Sign Name"><input type="text" value={form.signName} onChange={e=>set("signName",e.target.value)} style={inp} /></Field>
          <Field label="DOT Type Code"><input type="text" value={form.signType} onChange={e=>set("signType",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="W1-6, R1-1…" /></Field>
          <Field label="DOT Number"><input type="text" value={form.dotNumber} onChange={e=>set("dotNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Reason">
            <select value={form.reason} onChange={e=>set("reason",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {SIGN_REASONS.map(r=><option key={r} value={r}>{titleCase(r)}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set("status",e.target.value)} style={inp}>
              {["active","removed","replaced"].map(s=><option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom:14 }}>
          <Field label="Description"><input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:12, marginTop:8 }}>Physical</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr", gap:14, marginBottom:14 }}>
          <Field label="Surface"><input type="text" value={form.surface} onChange={e=>set("surface",e.target.value)} style={inp} /></Field>
          <Field label="Sheeting"><input type="text" value={form.sheeting} onChange={e=>set("sheeting",e.target.value)} style={inp} /></Field>
          <Field label="Size"><input type="text" value={form.size} onChange={e=>set("size",e.target.value)} style={inp} /></Field>
          <Field label="Support Type"><input type="text" value={form.supportType} onChange={e=>set("supportType",e.target.value)} style={inp} /></Field>
          <Field label="Support Material"><input type="text" value={form.supportMaterial} onChange={e=>set("supportMaterial",e.target.value)} style={inp} /></Field>
          <Field label="Support Length"><input type="text" value={form.supportLength} onChange={e=>set("supportLength",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
          <Field label="Position"><input type="text" value={form.position} onChange={e=>set("position",e.target.value)} style={inp} /></Field>
          <Field label="Materials Used"><input type="text" value={form.materialsUsed} onChange={e=>set("materialsUsed",e.target.value)} style={inp} /></Field>
          <Field label="Condition Rating">
            <RatingSelect
              value={form.signRating ?? ""}
              onChange={v=>set("signRating", v === "" ? null : v)}
              kind="sign"
              style={inp}
            />
          </Field>
        </div>
        <div style={{ marginTop:14 }}>
          <Field label="Notes"><textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{sign?"Save Changes":"Add Sign"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
