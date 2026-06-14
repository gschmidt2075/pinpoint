import { useState, useMemo } from "react";
import { Field, SectionCard, Table, Icon, inp, btn, fmt, fmtSm } from "../components/shared.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const SURFACE_TYPES = ["Gravel","Bituminous","Concrete","Dirt","Other"];
const AUTHORITIES   = ["County","City","State","Township","NAD","Private"];
const TOWNSHIPS     = ["West Blue","Highland","Verona","Kenesaw","Wanda","Juniata","Denver","Blaine","Hanover","Ayr","Roseland","Cottonwood","Logan","Silverlake","Zero","Little Blue"];
const ROAD_DESIGS   = ["Primary","Secondary","Minimum Maintenance"];
const SHAPE_TYPES   = ["CMP","CMAP","CMPX2","CMAPX2","CBC","CRCX2","LWC","T-BEAM","CONCRETE","CMP FES","Other"];
const DRAIN_TYPES   = ["DITCH","Tributary","Big Blue","Little Blue","Flat Creek","Sand Creek","32 Mile Creek","Other"];
const SIGN_TYPES    = ["W1-1L","W1-6","W1-7","W2-4","W3-1","W10-1","W13-1","W14-2","W14-3","W40-11","R1-1","R1-2","R12-5","R15-1","D1-2A","I-2","Other"];
const SIGN_RATINGS  = ["Excellent","Good","Fair","Poor","Failed"];
const SUPPORT_TYPES = ["Single","Double","Triple","Overhead"];
const SUPPORT_MATS  = ["Steel","Wood","Aluminum","Other"];
const SHEETING      = ["Diamond","Hi-Priz","Eng","HI","Other"];
const ROAD_POSITIONS= ["Right","Left","Ahead","Overhead"];
const BRIDGE_DESIGS = ["N","B","C","D","E","F","G","H","J","K","L","M","O","P","Q","R","S","T"];

const NBIS_LABELS = {
  9:"Excellent",8:"Very Good",7:"Good",6:"Satisfactory",
  5:"Fair",4:"Poor",3:"Serious",2:"Critical",1:"Imminent Failure",0:"Failed / Out of Service"
};

const CONDITION_LABELS = {
  5:"Excellent",4:"Good",3:"Fair",2:"Poor",1:"Critical"
};

function conditionColor(rating, isBridge=false) {
  if (isBridge) {
    if (rating >= 7) return "#1a6b35";
    if (rating >= 5) return "#d97706";
    if (rating >= 3) return "#c0392b";
    return "#8c1b18";
  }
  if (rating >= 4) return "#1a6b35";
  if (rating === 3) return "#d97706";
  return "#c0392b";
}

function RatingBadge({ rating, isBridge=false }) {
  if (!rating && rating !== 0) return <span style={{ color:"#ccc" }}>—</span>;
  const color = conditionColor(rating, isBridge);
  const label = isBridge ? NBIS_LABELS[rating] : CONDITION_LABELS[rating];
  return (
    <span style={{ background:color+"18", color, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>
      {rating} — {label}
    </span>
  );
}

// ── Infrastructure Module ─────────────────────────────────────────────────────
export default function Infrastructure({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  const tabs = [
    { id:"dashboard",   label:"Dashboard",                                                                               icon:"layout-dashboard" },
    { id:"roads",       label:`Roads (${(db.roads||[]).length})`,                                                  icon:"road" },
    { id:"bridges",     label:`Bridges (${(db.bridges||[]).length})`,                                             icon:"bridge" },
    { id:"structures",  label:`Structures (${(db.structures||[]).filter(s=>s.assetClass==="structure").length})`, icon:"circle-dashed" },
    { id:"culverts",    label:`Culverts (${(db.structures||[]).filter(s=>s.assetClass==="culvert").length})`,     icon:"pipe" },
    { id:"signs",       label:`Signs (${(db.signs||[]).length})`,                                                 icon:"road-sign" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd", overflowX:"auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setView(t.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px", whiteSpace:"nowrap",
            fontWeight: view===t.id?700:400, fontSize:13, cursor:"pointer",
            color: view===t.id?"#1a5a3a":"#666",
            borderBottom: view===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            {t.icon && <Icon name={t.icon} size={13} color={view===t.id?"#1a5a3a":"#888"} />}
            {t.label}
          </button>
        ))}
      </div>

      {view==="dashboard"  && <InfraDashboard db={db} setView={setView} />}
      {view==="roads"      && <RoadsList db={db} dispatch={dispatch} />}
      {view==="bridges"    && <BridgeList db={db} dispatch={dispatch} />}
      {view==="structures" && <StructureList db={db} dispatch={dispatch} type="structure" />}
      {view==="culverts"   && <StructureList db={db} dispatch={dispatch} type="culvert" />}
      {view==="signs"      && <SignList db={db} dispatch={dispatch} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function InfraDashboard({ db, setView }) {
  const roads      = db.roads      || [];
  const bridges    = db.bridges    || [];
  const allStructs = db.structures || [];
  const structures = allStructs.filter(s=>s.assetClass==="structure");
  const culverts   = allStructs.filter(s=>s.assetClass==="culvert");
  const signs      = db.signs      || [];

  // Condition alerts
  const poorBridges    = bridges.filter(b => Math.min(b.deckRating??9, b.superRating??9, b.subRating??9) <= 4);
  const poorStructures = structures.filter(s => (s.rating||5) <= 2);
  const poorCulverts   = culverts.filter(c => (c.rating||5) <= 2);
  const poorSigns      = signs.filter(s => s.signRating==="Poor"||s.signRating==="Failed");

  // Projects linked to assets
  const linkedProjects = (db.projects||[]).filter(p=>p.status==="active");

  const kpis = [
    { label:"Road Segments",  value:roads.length,      sub:"In system",              accent:"#1a3a5c", id:"roads",      icon:"road" },
    { label:"Bridges",        value:bridges.length,     sub:`${poorBridges.length} rated ≤4`, accent:"#6b3a1a", id:"bridges",   icon:"bridge" },
    { label:"Structures",     value:structures.length,  sub:`${poorStructures.length} critical`, accent:"#1a5a3a", id:"structures",icon:"circle-dashed" },
    { label:"Culverts",       value:culverts.length,    sub:`${poorCulverts.length} critical`,   accent:"#5a1a8a", id:"culverts",  icon:"pipe" },
    { label:"Signs",          value:signs.length,       sub:`${poorSigns.length} poor/failed`,   accent:"#d97706", id:"signs",     icon:"road-sign" },
  ];

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Infrastructure</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Roads · Bridges · Structures · Culverts · Signs</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {kpis.map((k,i)=>(
          <button key={i} onClick={()=>setView(k.id)} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.accent}`, textAlign:"left", cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888" }}>{k.label}</div>
              {k.icon && <Icon name={k.icon} size={18} color={k.accent} style={{ opacity:0.4 }} />}
            </div>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"monospace", color:k.accent }}>{k.value}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Condition alerts */}
      {(poorBridges.length>0||poorStructures.length>0||poorCulverts.length>0||poorSigns.length>0) && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"12px 18px", marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#8c1b18", marginBottom:8 }}>⚠️ Assets Needing Attention</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {poorBridges.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#8c1b18", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Bridges (Rating ≤4)</div>
                {poorBridges.slice(0,3).map(b=>(
                  <div key={b.id} style={{ fontSize:12, color:"#555", padding:"2px 0" }}>{b.countyNumber} — {b.road}</div>
                ))}
                {poorBridges.length>3 && <div style={{ fontSize:11, color:"#888" }}>+{poorBridges.length-3} more</div>}
              </div>
            )}
            {poorStructures.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#8c1b18", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Structures (Rating ≤2)</div>
                {poorStructures.slice(0,3).map(s=>(
                  <div key={s.id} style={{ fontSize:12, color:"#555", padding:"2px 0" }}>{s.assetId} — {s.road}</div>
                ))}
                {poorStructures.length>3 && <div style={{ fontSize:11, color:"#888" }}>+{poorStructures.length-3} more</div>}
              </div>
            )}
            {poorCulverts.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#8c1b18", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Culverts (Rating ≤2)</div>
                {poorCulverts.slice(0,3).map(c=>(
                  <div key={c.id} style={{ fontSize:12, color:"#555", padding:"2px 0" }}>{c.assetId} — {c.road}</div>
                ))}
                {poorCulverts.length>3 && <div style={{ fontSize:11, color:"#888" }}>+{poorCulverts.length-3} more</div>}
              </div>
            )}
            {poorSigns.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#8c1b18", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>Signs (Poor/Failed)</div>
                {poorSigns.slice(0,3).map(s=>(
                  <div key={s.id} style={{ fontSize:12, color:"#555", padding:"2px 0" }}>#{s.signName} — {s.onRoad}</div>
                ))}
                {poorSigns.length>3 && <div style={{ fontSize:11, color:"#888" }}>+{poorSigns.length-3} more</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active linked projects */}
      {linkedProjects.length>0 && (
        <SectionCard title="Active Projects on Infrastructure" subtitle={`${linkedProjects.length} active`}>
          <Table
            headers={[{ label:"Project #" },{ label:"Name" },{ label:"Type" },{ label:"Asset" },{ label:"Road" },{ label:"Status" }]}
            rows={linkedProjects.map(p=>[
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#6b3a1a" }}>{p.projectNumber}</span>,
              p.name,
              <span style={{ fontSize:11, background:"#f0f0ee", padding:"2px 6px", borderRadius:4 }}>{p.projectType}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a5a3a" }}>{p.linkedAssets?.join(", ")||"—"}</span>,
              p.roadName||"—",
              <span style={{ background:"#e6f4ec", color:"#1a6b35", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>Active</span>,
            ])}
            emptyMessage="No active projects"
          />
        </SectionCard>
      )}
    </div>
  );
}

// ── Roads ─────────────────────────────────────────────────────────────────────
function RoadsList({ db, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState("");
  const [surfFilter, setSurf]   = useState("All");

  const roads = db.roads || [];
  const filtered = roads.filter(r => {
    if (surfFilter!=="All" && r.surfType!==surfFilter) return false;
    if (search && !`${r.name} ${r.altName||""} ${r.id||""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (adding) return <RoadForm dispatch={dispatch} onDone={()=>setAdding(false)} />;
  if (selected) return <RoadDetail road={selected} db={db} onBack={()=>setSelected(null)} />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Road Segments</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{roads.length} segments in system</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search roads…" style={{ ...inp, width:200, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["All","Gravel","Bituminous","Concrete"].map(s=>(
              <button key={s} onClick={()=>setSurf(s)} style={{ padding:"7px 11px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:surfFilter===s?"#1a3a5c":"#fff", color:surfFilter===s?"#fff":"#555" }}>{s==='All'?'All':s}</button>
            ))}
          </div>
          <button onClick={()=>setAdding(true)} style={{ ...btn.primary, background:"#1a5a3a" }}>+ Add Road</button>
        </div>
      </div>
      <SectionCard title={`Roads (${filtered.length})`}>
        <Table
          headers={[{ label:"Name" },{ label:"Alt Name" },{ label:"Authority" },{ label:"Township" },{ label:"Rd Desig" },{ label:"Surface" },{ label:"From" },{ label:"To" },{ label:"Speed" }]}
          rows={filtered.map(r=>[
            <button onClick={()=>setSelected(r)} style={{ background:"none", border:"none", padding:0, color:"#1a3a5c", fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>{r.name}</button>,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{r.altName||"—"}</span>,
            r.authority||"—",
            r.township||"—",
            <span style={{ background: r.surfType==="Gravel"?"#fef3cd":r.surfType==="Bituminous"?"#e8e8e5":"#e8f0fb", color: r.surfType==="Gravel"?"#7a4f00":r.surfType==="Bituminous"?"#333":"#1a4a8a", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{r.surfType||"—"}</span>,
            <span style={{ fontSize:12, color:"#555" }}>{r.lngFrom||"—"}</span>,
            <span style={{ fontSize:12, color:"#555" }}>{r.lngTo||"—"}</span>,
            r.speed ? `${r.speed} mph` : "—",
<span style={{ fontSize:11, background:r.roadDesig==="Primary"?"#e8f0fb":r.roadDesig==="Minimum Maintenance"?"#fdecea":"#f0f0ee", color:r.roadDesig==="Primary"?"#1a4a8a":r.roadDesig==="Minimum Maintenance"?"#c0392b":"#555", padding:"2px 6px", borderRadius:4 }}>{r.roadDesig||"—"}</span>,
          ])}
          emptyMessage="No roads yet — click + Add Road to get started"
        />
      </SectionCard>
    </div>
  );
}

function RoadDetail({ road, db, onBack }) {
  const linkedProjects = (db.projects||[]).filter(p=>(p.linkedRoads||[]).includes(road.name)||(p.roadName||"").includes(road.name));
  const linkedStructures = (db.structures||[]).filter(s=>s.road===road.name||(s.road||"").includes(road.altName||"____"));
  const linkedBridges    = (db.bridges||[]).filter(b=>b.road===road.name||(b.road||"").includes(road.altName||"____"));
  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to roads</button>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>{road.name}</div>
        <div style={{ fontSize:13, color:"#888", marginBottom:16 }}>{road.altName} · {road.authority} · {road.surfType}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
          {[
            { label:"Township",        value:road.township||"—" },
            { label:"Road Designation",value:road.roadDesig||"—" },
            { label:"Authority",       value:road.authority||"—" },
            { label:"From",            value:road.lngFrom||"—" },
            { label:"To",              value:road.lngTo||"—" },
            { label:"Speed Limit",     value:road.speed?`${road.speed} mph`:"—" },
            { label:"From 911",        value:road.from911||"—" },
            { label:"To 911",          value:road.to911||"—" },
            { label:"S/T/R",           value:road.miscLoc||"—" },
            { label:"GPS 📍",          value:road.latitude?`${road.latitude}, ${road.longitude}`:"—" },
          ].map((f,i)=>(
            <div key={i}>
              <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a" }}>{f.value}</div>
            </div>
          ))}
        </div>
{road.notes && <div style={{ marginTop:16, padding:"10px 14px", background:"#f7f7f5", borderRadius:6, fontSize:13, color:"#555" }}><strong>Notes:</strong> {road.notes}</div>}
        {road.projectRefs && <div style={{ marginTop:8, padding:"10px 14px", background:"#e8f0fb", borderRadius:6, fontSize:13, color:"#1a4a8a" }}><strong>Project References:</strong> {road.projectRefs}</div>}
      </div>
      {linkedStructures.length>0 && (
        <SectionCard title="Structures & Culverts on This Road" subtitle={`${linkedStructures.length} assets`}>
          <Table
            headers={[{ label:"Asset ID" },{ label:"Class" },{ label:"Size & Type" },{ label:"Rating" }]}
            rows={linkedStructures.map(s=>[
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#1a5a3a" }}>{s.assetId}</span>,
              s.assetClass,
              s.sizeType||"—",
              <RatingBadge rating={s.rating} />,
            ])}
            emptyMessage="No structures on this road"
          />
        </SectionCard>
      )}
      {linkedBridges.length>0 && (
        <SectionCard title="Bridges on This Road" subtitle={`${linkedBridges.length} bridges`}>
          <Table
            headers={[{ label:"County #" },{ label:"State #" },{ label:"Features" },{ label:"Deck" },{ label:"Super" },{ label:"Sub" }]}
            rows={linkedBridges.map(b=>[
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#6b3a1a" }}>{b.countyNumber}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{b.stateNumber}</span>,
              b.features||"—",
              <RatingBadge rating={b.deckRating} isBridge />,
              <RatingBadge rating={b.superRating} isBridge />,
              <RatingBadge rating={b.subRating} isBridge />,
            ])}
            emptyMessage="No bridges on this road"
          />
        </SectionCard>
      )}
    </div>
  );
}

function RoadForm({ dispatch, onDone, existing }) {
  const empty = { name:"",altName:"",authority:"County",township:"",roadDesig:"Primary",lngFrom:"",lngTo:"",surfType:"Gravel",speed:"",from911:"",to911:"",miscLoc:"",latitude:"",longitude:"",notes:"",projectRefs:"" };
  const [form, setForm] = useState(existing||empty);
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const handleSubmit = () => {
    if (!form.name) return;
    dispatch({ type: existing?"UPDATE_ROAD":"ADD_ROAD", payload:{ ...form, id:existing?.id||Date.now() } });
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1500);
  };

  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{existing?"Edit Road":"Add Road Segment"}</div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Road saved</div>}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Road Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Road Name" required><input type="text" placeholder="e.g. 100 E. 26th Street" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} /></Field>
          <Field label="Alt Name / Designation"><input type="text" placeholder="e.g. 100E" value={form.altName} onChange={e=>set("altName",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Authority">
            <select value={form.authority} onChange={e=>set("authority",e.target.value)} style={inp}>
              {AUTHORITIES.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Township">
            <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {TOWNSHIPS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Road Designation">
            <select value={form.roadDesig} onChange={e=>set("roadDesig",e.target.value)} style={inp}>
              {ROAD_DESIGS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Surface Type">
            <select value={form.surfType} onChange={e=>set("surfType",e.target.value)} style={inp}>
              {SURFACE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Speed Limit (mph)"><input type="number" min="0" max="80" placeholder="55" value={form.speed} onChange={e=>set("speed",e.target.value)} style={inp} /></Field>
          <Field label="From (cross street)"><input type="text" placeholder="Wabash Avenue…" value={form.lngFrom} onChange={e=>set("lngFrom",e.target.value)} style={inp} /></Field>
          <Field label="To (cross street)"><input type="text" placeholder="Elm Avenue…" value={form.lngTo} onChange={e=>set("lngTo",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="From 911 Address"><input type="text" value={form.from911} onChange={e=>set("from911",e.target.value)} style={inp} /></Field>
          <Field label="To 911 Address"><input type="text" value={form.to911} onChange={e=>set("to911",e.target.value)} style={inp} /></Field>
          <Field label="S/T/R"><input type="text" placeholder="29-8-9" value={form.miscLoc} onChange={e=>set("miscLoc",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Latitude"><input type="number" step="0.000001" placeholder="40.611615" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Longitude"><input type="number" step="0.000001" placeholder="-98.382189" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Notes"><textarea rows={2} placeholder="Road condition notes, observations…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
          <Field label="Project References"><input type="text" placeholder="C1-493, M-2025-10…" value={form.projectRefs} onChange={e=>set("projectRefs",e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a5a3a" }}>Save Road</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Bridges ───────────────────────────────────────────────────────────────────
function BridgeList({ db, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState("");

  const bridges = db.bridges || [];
  const filtered = bridges.filter(b => !search || `${b.countyNumber} ${b.stateNumber} ${b.road} ${b.features||""}`.toLowerCase().includes(search.toLowerCase()));

  if (adding)   return <BridgeForm dispatch={dispatch} onDone={()=>setAdding(false)} />;
  if (selected) return <BridgeDetail bridge={selected} db={db} dispatch={dispatch} onBack={()=>setSelected(null)} />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Bridges</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>NBIS ratings · Deck / Superstructure / Substructure</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bridges…" style={{ ...inp, width:200, margin:0 }} />
          <button onClick={()=>setAdding(true)} style={{ ...btn.primary, background:"#1a5a3a" }}>+ Add Bridge</button>
        </div>
      </div>
      <SectionCard title={`Bridges (${filtered.length})`}>
        <Table
          headers={[{ label:"County #" },{ label:"State #" },{ label:"Road" },{ label:"Features (Crosses)" },{ label:"Deck WxL" },{ label:"Spans" },{ label:"Built" },{ label:"Deck", right:true },{ label:"Super", right:true },{ label:"Sub", right:true }]}
          rows={filtered.map(b=>{
            const minRating = Math.min(b.deckRating??9, b.superRating??9, b.subRating??9);
            const color = conditionColor(minRating, true);
            return [
              <button onClick={()=>setSelected(b)} style={{ background:"none", border:"none", padding:0, color:"#6b3a1a", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>{b.countyNumber}</button>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{b.stateNumber||"—"}</span>,
              <span style={{ fontSize:12 }}>{b.road}</span>,
              <span style={{ fontSize:12, color:"#555" }}>{b.features||"—"}</span>,
              b.deckSize||"—",
              b.spans||"—",
              b.built||"—",
              b.deckRating!=null ? <span style={{ fontFamily:"monospace", fontWeight:700, color:conditionColor(b.deckRating,true) }}>{b.deckRating}</span> : "—",
              b.superRating!=null ? <span style={{ fontFamily:"monospace", fontWeight:700, color:conditionColor(b.superRating,true) }}>{b.superRating}</span> : "—",
              b.subRating!=null ? <span style={{ fontFamily:"monospace", fontWeight:700, color:conditionColor(b.subRating,true) }}>{b.subRating}</span> : "—",
            ];
          })}
          emptyMessage="No bridges yet — click + Add Bridge"
        />
      </SectionCard>
    </div>
  );
}

function BridgeDetail({ bridge, db, dispatch, onBack }) {
  const [editingRatings, setEditingRatings] = useState(false);
  const [ratings, setRatings] = useState({ deckRating:bridge.deckRating??"", superRating:bridge.superRating??"", subRating:bridge.subRating??"", ratingDate:"", ratingNotes:"" });

  const linkedProjects = (db.projects||[]).filter(p=>(p.linkedAssets||[]).some(a=>a===bridge.countyNumber)||(p.assetId||"")===bridge.countyNumber);

  const saveRatings = () => {
    dispatch({ type:"UPDATE_BRIDGE", payload:{ ...bridge, deckRating:parseInt(ratings.deckRating), superRating:parseInt(ratings.superRating), subRating:parseInt(ratings.subRating) } });
    setEditingRatings(false);
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to bridges</button>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:18, fontWeight:700, color:"#6b3a1a" }}>{bridge.countyNumber}</span>
              {bridge.stateNumber && <span style={{ fontFamily:"monospace", fontSize:13, color:"#888", background:"#f0f0ee", padding:"2px 8px", borderRadius:4 }}>{bridge.stateNumber}</span>}
              {bridge.isOld && <span style={{ fontSize:11, background:"#fdecea", color:"#c0392b", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>REPLACED</span>}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a" }}>{bridge.road}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:2 }}>Crosses: {bridge.features||"—"} · Built: {bridge.built||"—"} · {bridge.spans||"—"} span{bridge.spans>1?"s":""}</div>
          </div>
          <button onClick={()=>setEditingRatings(!editingRatings)} style={{ ...btn.primary, background:"#6b3a1a", fontSize:12 }}>Update NBIS Ratings</button>
        </div>

        {/* NBIS Ratings */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:16 }}>
          {[
            { label:"Deck Rating",            value:bridge.deckRating,  desc:"Riding surface condition" },
            { label:"Superstructure Rating",  value:bridge.superRating, desc:"Beams, girders, trusses" },
            { label:"Substructure Rating",    value:bridge.subRating,   desc:"Piers, abutments, footings" },
          ].map((r,i)=>(
            <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"14px 16px", borderTop:`3px solid ${r.value!=null?conditionColor(r.value,true):"#ccc"}` }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{r.label}</div>
              {r.value!=null ? (
                <>
                  <div style={{ fontSize:26, fontWeight:700, fontFamily:"monospace", color:conditionColor(r.value,true) }}>{r.value}</div>
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{NBIS_LABELS[r.value]}</div>
                </>
              ) : <div style={{ fontSize:14, color:"#ccc", marginTop:6 }}>Not rated</div>}
              <div style={{ fontSize:10, color:"#aaa", marginTop:4 }}>{r.desc}</div>
            </div>
          ))}
        </div>

        {editingRatings && (
          <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:16, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>Enter NBIS Ratings from State Inspection Report</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              {[["deckRating","Deck (0-9)"],["superRating","Superstructure (0-9)"],["subRating","Substructure (0-9)"]].map(([k,l])=>(
                <Field key={k} label={l}>
                  <select value={ratings[k]} onChange={e=>setRatings(r=>({...r,[k]:e.target.value}))} style={inp}>
                    <option value="">Select…</option>
                    {[9,8,7,6,5,4,3,2,1,0].map(n=><option key={n} value={n}>{n} — {NBIS_LABELS[n]}</option>)}
                  </select>
                </Field>
              ))}
              <Field label="Inspection Date"><input type="date" value={ratings.ratingDate} onChange={e=>setRatings(r=>({...r,ratingDate:e.target.value}))} style={inp} /></Field>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Notes"><input type="text" placeholder="Inspector notes, report reference…" value={ratings.ratingNotes} onChange={e=>setRatings(r=>({...r,ratingNotes:e.target.value}))} style={inp} /></Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveRatings} style={{ ...btn.small, background:"#6b3a1a" }}>Save Ratings</button>
              <button onClick={()=>setEditingRatings(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Details */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
          {[
            { label:"Deck Size (WxL)", value:bridge.deckSize||"—" },
            { label:"Deck Width",      value:bridge.deckWidth?`${bridge.deckWidth}'`:"—" },
            { label:"Struct Length",   value:bridge.structLength?`${bridge.structLength}'`:"—" },
            { label:"Max Span",        value:bridge.maxSpan?`${bridge.maxSpan}'`:"—" },
            { label:"GPS",             value:bridge.latitude?`${bridge.latitude}, ${bridge.longitude}`:"—" },
          ].map((f,i)=>(
            <div key={i}>
              <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a", fontFamily:"monospace" }}>{f.value}</div>
            </div>
          ))}
        </div>
{bridge.notes && <div style={{ marginTop:14, padding:"10px 14px", background:"#f7f7f5", borderRadius:6, fontSize:13, color:"#555" }}><strong>Notes:</strong> {bridge.notes}</div>}
        {bridge.projectRefs && <div style={{ marginTop:8, padding:"10px 14px", background:"#e8f0fb", borderRadius:6, fontSize:13, color:"#1a4a8a" }}><strong>Project References:</strong> {bridge.projectRefs}</div>}
      </div>

      {linkedProjects.length>0 && (
        <SectionCard title="Projects on This Bridge" icon="clipboard-list">
          <Table
            headers={[{ label:"Project #" },{ label:"Name" },{ label:"Type" },{ label:"Status" },{ label:"Notes" }]}
            rows={linkedProjects.map(p=>[
              <span style={{ fontFamily:"monospace", fontWeight:600, color:"#6b3a1a" }}>{p.projectNumber}</span>,
              p.name,
              p.projectType,
              <span style={{ background:"#e6f4ec", color:"#1a6b35", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{p.status}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{p.notes||"—"}</span>,
            ])}
            emptyMessage="No projects linked"
          />
        </SectionCard>
      )}
    </div>
  );
}

function BridgeForm({ dispatch, onDone, existing }) {
  const empty = { countyNumber:"", stateNumber:"", roadDesig:"Primary", road:"", features:"", deckSize:"", deckWidth:"", structLength:"", maxSpan:"", spans:"", built:"", deckRating:"", superRating:"", subRating:"", latitude:"", longitude:"", notes:"", projectRefs:"", isOld:false };
  const [form, setForm] = useState(existing||empty);
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = () => {
    if (!form.countyNumber || !form.road) return;
    dispatch({ type: existing?"UPDATE_BRIDGE":"ADD_BRIDGE", payload:{
      ...form, id:existing?.id||Date.now(),
      countyNumber: form.countyNumber,
      stateNumber:  form.stateNumber ? `C0001${form.stateNumber}` : "",
      deckRating:   form.deckRating!==""?parseInt(form.deckRating):null,
      superRating:  form.superRating!==""?parseInt(form.superRating):null,
      subRating:    form.subRating!==""?parseInt(form.subRating):null,
    }});
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1500);
  };

  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{existing?"Edit Bridge":"Add Bridge"}</div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Bridge saved</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Bridge Identification</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <Field label="County # (e.g. N 36.1)" required>
              <input type="text" placeholder="N 36.1" value={form.countyNumber} onChange={e=>set("countyNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            <div style={{ fontSize:11, color:"#888", marginTop:4 }}>Letter · space · number</div>
          </div>
          <div>
            <Field label="State # (digits after C0001)">
              <input type="text" placeholder="24120" value={form.stateNumber} onChange={e=>set("stateNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
            {form.stateNumber && <div style={{ fontSize:11, color:"#888", marginTop:4, fontFamily:"monospace" }}>→ C0001{form.stateNumber}</div>}
          </div>
          <Field label="Road Designation">
            <select value={form.roadDesig||"Primary"} onChange={e=>set("roadDesig",e.target.value)} style={inp}>
              {ROAD_DESIGS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:22 }}>
            <input type="checkbox" id="isOld" checked={form.isOld} onChange={e=>set("isOld",e.target.checked)} style={{ width:14,height:14 }} />
            <label htmlFor="isOld" style={{ fontSize:13, fontWeight:600, color:"#444", cursor:"pointer" }}>Replaced / Old</label>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Road" required><input type="text" placeholder="15200 W. Blue Valley Road…" value={form.road} onChange={e=>set("road",e.target.value)} style={inp} /></Field>
          <Field label="Features (Crosses)"><input type="text" placeholder="Little Blue, Flat Creek, DITCH…" value={form.features} onChange={e=>set("features",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Deck Size (WxL)"><input type="text" placeholder="28X90" value={form.deckSize} onChange={e=>set("deckSize",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Deck Width (ft)"><input type="number" min="0" step="0.1" placeholder="28" value={form.deckWidth} onChange={e=>set("deckWidth",e.target.value)} style={inp} /></Field>
          <Field label="Struct Length (ft)"><input type="number" min="0" step="0.1" placeholder="90" value={form.structLength} onChange={e=>set("structLength",e.target.value)} style={inp} /></Field>
          <Field label="Max Span (ft)"><input type="number" min="0" step="0.1" placeholder="30" value={form.maxSpan} onChange={e=>set("maxSpan",e.target.value)} style={inp} /></Field>
          <Field label="Spans"><input type="number" min="1" placeholder="1" value={form.spans} onChange={e=>set("spans",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Year Built"><input type="number" min="1800" max="2030" placeholder="2018" value={form.built} onChange={e=>set("built",e.target.value)} style={inp} /></Field>
          <Field label="Latitude"><input type="number" step="0.000001" placeholder="40.350352" value={form.latitude} onChange={e=>set("latitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Longitude"><input type="number" step="0.000001" placeholder="-98.614899" value={form.longitude} onChange={e=>set("longitude",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>NBIS Ratings (from state inspection report)</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {[["deckRating","Deck Rating"],["superRating","Superstructure Rating"],["subRating","Substructure Rating"]].map(([k,l])=>(
            <Field key={k} label={l}>
              <select value={form[k]} onChange={e=>set(k,e.target.value)} style={inp}>
                <option value="">Not rated yet</option>
                {[9,8,7,6,5,4,3,2,1,0].map(n=><option key={n} value={n}>{n} — {NBIS_LABELS[n]}</option>)}
              </select>
            </Field>
          ))}
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Notes"><textarea rows={2} placeholder="Bridge condition notes…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
          <Field label="Project References"><input type="text" placeholder="M-2005-13 M-2012-06B C1-491…" value={form.projectRefs} onChange={e=>set("projectRefs",e.target.value)} style={inp} /></Field>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a5a3a" }}>Save Bridge</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Structures & Culverts ─────────────────────────────────────────────────────
function StructureList({ db, dispatch, type }) {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState("");
  const [ratingFilter, setRating] = useState("all");

  const all = (db.structures||[]).filter(s=>s.assetClass===type);
  const filtered = all.filter(s => {
    if (ratingFilter!=="all" && String(s.rating)!==ratingFilter) return false;
    if (search && !`${s.assetId} ${s.road||""} ${s.township||""} ${s.sizeType||""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const label = type==="structure" ? "Structure" : "Culvert";

  if (adding)   return <StructureForm dispatch={dispatch} type={type} onDone={()=>setAdding(false)} />;
  if (selected) return <StructureDetail asset={selected} db={db} dispatch={dispatch} onBack={()=>setSelected(null)} />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{label}s</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            {type==="structure" ? "≥48\" diameter up to 20' length" : "< 48\" diameter"} · 1-5 condition rating
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} style={{ ...inp, width:200, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all","5","4","3","2","1"].map(r=>(
              <button key={r} onClick={()=>setRating(r)} style={{ padding:"7px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:ratingFilter===r?"#1a5a3a":"#fff", color:ratingFilter===r?"#fff":r!=="all"?conditionColor(parseInt(r)):"#555" }}>
                {r==="all"?"All":r}
              </button>
            ))}
          </div>
          <button onClick={()=>setAdding(true)} style={{ ...btn.primary, background:"#1a5a3a" }}>+ Add {label}</button>
        </div>
      </div>
      <SectionCard title={`${label}s (${filtered.length})`}>
        <Table
          headers={[{ label:"Asset ID" },{ label:"Rd Desig" },{ label:"Road" },{ label:"Township" },{ label:"Size & Type" },{ label:"Feature/Drain" },{ label:"Rating" }]}
          rows={filtered.map(s=>[
            <button onClick={()=>setSelected(s)} style={{ background:"none", border:"none", padding:0, color:"#1a5a3a", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>{s.assetId}</button>,
            <span style={{ fontSize:11, background: s.roadDesig==="Primary"?"#e8f0fb":s.roadDesig==="Minimum Maintenance"?"#fdecea":"#f0f0ee", color: s.roadDesig==="Primary"?"#1a4a8a":s.roadDesig==="Minimum Maintenance"?"#c0392b":"#555", padding:"2px 6px", borderRadius:4 }}>{s.roadDesig||"—"}</span>,
            <span style={{ fontSize:12 }}>{s.road||"—"}</span>,
            s.township||"—",
            <span style={{ fontSize:12, fontFamily:"monospace", color:"#555" }}>{s.sizeType||"—"}</span>,
            s.featureDrainage||"—",
            <RatingBadge rating={s.rating} />,
          ])}
          emptyMessage={`No ${label.toLowerCase()}s yet — click + Add ${label}`}
        />
      </SectionCard>
    </div>
  );
}

// ── Barrel summary helper ─────────────────────────────────────────────────────
function barrelSummary(barrels) {
  if (!barrels || barrels.length === 0) return "—";
  const active = barrels.filter(b => b.status !== "replaced");
  if (active.length === 0) return "All replaced";
  const groups = {};
  active.forEach(b => {
    const key = `${b.shape} ${b.diameter}" x ${b.length}ft`;
    groups[key] = (groups[key]||0) + 1;
  });
  return Object.entries(groups).map(([k,n]) => n > 1 ? `${n} - ${k}` : k).join(" + ");
}

function StructureDetail({ asset, db, dispatch, onBack }) {
  const [editingRating, setEditingRating] = useState(false);
  const [addingBarrel,  setAddingBarrel]  = useState(false);
  const [newRating, setNewRating] = useState({ rating:asset.rating||"", ratingDate:"", notes:"" });
  const [newBarrel, setNewBarrel] = useState({ shape:"CMP", diameter:"", length:"", year:"", condition:"", notes:"" });

  const current = (db.structures||[]).find(s=>s.id===asset.id)||asset;
  const barrels  = current.barrels || [];
  const linkedProjects = (db.projects||[]).filter(p=>(p.linkedAssets||[]).includes(current.assetId)||(p.assetId||"")===current.assetId);
  const label = current.assetClass==="structure" ? "Structure" : "Culvert";

  const saveRating = () => {
    dispatch({ type:"UPDATE_STRUCTURE", payload:{ ...current, rating:parseInt(newRating.rating) } });
    setEditingRating(false);
  };

  const saveBarrel = () => {
    if (!newBarrel.shape || !newBarrel.diameter || !newBarrel.length) return;
    const updated = { ...current, barrels:[...barrels, { ...newBarrel, id:Date.now(), diameter:parseFloat(newBarrel.diameter), length:parseFloat(newBarrel.length) }] };
    dispatch({ type:"UPDATE_STRUCTURE", payload:updated });
    setNewBarrel({ shape:"CMP", diameter:"", length:"", year:"", condition:"", notes:"" });
    setAddingBarrel(false);
  };

  const markBarrelReplaced = (barrelId) => {
    const updated = { ...current, barrels: barrels.map(b => b.id===barrelId ? { ...b, status:"replaced" } : b) };
    dispatch({ type:"UPDATE_STRUCTURE", payload:updated });
  };

  const setB = (k,v) => setNewBarrel(b=>({...b,[k]:v}));
  const activeBarrels   = barrels.filter(b=>b.status!=="replaced");
  const replacedBarrels = barrels.filter(b=>b.status==="replaced");

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to {label.toLowerCase()}s</button>

      {/* Header card */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:18, fontWeight:700, color:"#1a5a3a" }}>{current.assetId}</span>
              <span style={{ fontSize:11, background: current.roadDesig==="Primary"?"#e8f0fb":current.roadDesig==="Minimum Maintenance"?"#fdecea":"#f0f0ee", color: current.roadDesig==="Primary"?"#1a4a8a":current.roadDesig==="Minimum Maintenance"?"#c0392b":"#555", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>{current.roadDesig||"—"}</span>
              <span style={{ fontSize:11, background:"#f7f7f5", color:"#555", padding:"2px 8px", borderRadius:4 }}>{label}</span>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a" }}>{current.road}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:2 }}>{current.township} · {barrelSummary(barrels)||current.sizeType}</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <RatingBadge rating={current.rating} />
            <button onClick={()=>setEditingRating(!editingRating)} style={{ ...btn.small, background:"#1a5a3a", fontSize:11 }}>Update Rating</button>
          </div>
        </div>

        {editingRating && (
          <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:8, padding:16, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>Update Condition Rating</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Condition Rating (1-5)">
                <select value={newRating.rating} onChange={e=>setNewRating(r=>({...r,rating:e.target.value}))} style={inp}>
                  <option value="">Select…</option>
                  {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} — {CONDITION_LABELS[n]}</option>)}
                </select>
              </Field>
              <Field label="Inspection Date"><input type="date" value={newRating.ratingDate} onChange={e=>setNewRating(r=>({...r,ratingDate:e.target.value}))} style={inp} /></Field>
              <Field label="Notes"><input type="text" placeholder="Condition notes…" value={newRating.notes} onChange={e=>setNewRating(r=>({...r,notes:e.target.value}))} style={inp} /></Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveRating} style={{ ...btn.small, background:"#1a5a3a" }}>Save</button>
              <button onClick={()=>setEditingRating(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
          {[
            { label:"Asset ID",           value:current.assetId },
            { label:"Road Designation",   value:current.roadDesig||"—" },
            { label:"Township",           value:current.township||"—" },
            { label:"Feature / Drainage", value:current.featureDrainage||"—" },
            { label:"Road / Street",      value:current.road||"—" },
            { label:"GPS",                value:current.latlong||"—" },
            { label:"Year",               value:current.year||"—" },
            { label:"Active Barrels",     value:activeBarrels.length||"—" },
          ].map((f,i)=>(
            <div key={i}>
              <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a" }}>{f.value}</div>
            </div>
          ))}
        </div>
        {current.notes && <div style={{ marginTop:14, padding:"10px 14px", background:"#f7f7f5", borderRadius:6, fontSize:13, color:"#555" }}><strong>Notes:</strong> {current.notes}</div>}
        {linkedProjects.length>0 && <div style={{ marginTop:8, padding:"10px 14px", background:"#e8f0fb", borderRadius:6, fontSize:13, color:"#1a4a8a" }}><strong>Project References (auto):</strong> {linkedProjects.map(p=>p.projectNumber).join(", ")}</div>}
      </div>

      {/* Barrels section */}
      <SectionCard
        title={`Barrels (${activeBarrels.length} active${replacedBarrels.length>0?`, ${replacedBarrels.length} replaced`:""})`}
        subtitle={barrelSummary(barrels)}
        action={<button onClick={()=>setAddingBarrel(!addingBarrel)} style={btn.small}>+ Add Barrel</button>}
      >
        {addingBarrel && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ fontWeight:700, fontSize:12, marginBottom:12, color:"#1a5a3a", textTransform:"uppercase", letterSpacing:"0.05em" }}>New Barrel</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Shape / Material">
                <select value={newBarrel.shape} onChange={e=>setB("shape",e.target.value)} style={inp}>
                  {SHAPE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label='Diameter (in)'>
                <input type="number" min="0" step="1" placeholder="36" value={newBarrel.diameter} onChange={e=>setB("diameter",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Length (ft)">
                <input type="number" min="0" step="1" placeholder="40" value={newBarrel.length} onChange={e=>setB("length",e.target.value)} style={inp} />
              </Field>
              <Field label="Year Installed">
                <input type="number" min="1900" max="2030" placeholder="2024" value={newBarrel.year} onChange={e=>setB("year",e.target.value)} style={inp} />
              </Field>
              <Field label="Condition (1-5)">
                <select value={newBarrel.condition} onChange={e=>setB("condition",e.target.value)} style={inp}>
                  <option value="">Not rated</option>
                  {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} — {CONDITION_LABELS[n]}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Notes / Observations">
                <input type="text" placeholder="Gaps at top, undercut inlet, headwall condition…" value={newBarrel.notes} onChange={e=>setB("notes",e.target.value)} style={inp} />
              </Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveBarrel} style={{ ...btn.small, background:"#1a5a3a" }}>Save Barrel</button>
              <button onClick={()=>setAddingBarrel(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}

        {barrels.length === 0 ? (
          <div style={{ padding:"24px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>
            No barrels recorded yet — click + Add Barrel to document each pipe at this location
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["#","Shape / Material","Diameter","Length","Year","Condition","Notes",""].map((h,i)=>(
                  <th key={i} style={{ padding:"8px 14px", textAlign:"left", fontWeight:600, fontSize:11, letterSpacing:"0.05em", textTransform:"uppercase", color:"#666", borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {barrels.map((b,i)=>(
                <tr key={b.id} style={{ borderTop:"1px solid #eee", background: b.status==="replaced"?"#fafaf8":"#fff", opacity:b.status==="replaced"?0.6:1 }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{i+1}</td>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>{b.shape}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace" }}>{b.diameter}"</td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace" }}>{b.length} ft</td>
                  <td style={{ padding:"10px 14px" }}>{b.year||"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {b.condition ? <RatingBadge rating={parseInt(b.condition)} /> : "—"}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#555", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.notes||"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {b.status!=="replaced"
                      ? <button onClick={()=>markBarrelReplaced(b.id)} style={{ ...btn.small, background:"#888", fontSize:10, padding:"3px 8px" }}>Mark Replaced</button>
                      : <span style={{ fontSize:11, background:"#f0f0ee", color:"#888", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>Replaced</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

function StructureForm({ dispatch, type, onDone, existing }) {
  const label = type==="structure" ? "Structure" : "Culvert";
  const empty = { assetId:"",roadDesig:"Primary",township:"",sizeType:"",featureDrainage:"DITCH",road:"",latlong:"",notes:"",year:"",rating:"",assetClass:type, barrels:[] };
  const [form, setForm]       = useState(existing||empty);
  const [barrels, setBarrels] = useState(existing?.barrels||[]);
  const [addingBarrel, setAddingBarrel] = useState(false);
  const [newBarrel, setNewBarrel]       = useState({ shape:"CMP", diameter:"", length:"", year:"", condition:"", notes:"" });
  const [saved, setSaved]     = useState(false);
  const set  = (k,v) => setForm(f=>({...f,[k]:v}));
  const setB = (k,v) => setNewBarrel(b=>({...b,[k]:v}));

  const addBarrel = () => {
    if (!newBarrel.shape || !newBarrel.diameter || !newBarrel.length) return;
    setBarrels(bs=>[...bs, { ...newBarrel, id:Date.now(), diameter:parseFloat(newBarrel.diameter), length:parseFloat(newBarrel.length) }]);
    setNewBarrel({ shape:"CMP", diameter:"", length:"", year:"", condition:"", notes:"" });
    setAddingBarrel(false);
  };

  const removeBarrel = (id) => setBarrels(bs=>bs.filter(b=>b.id!==id));

  // Auto-generate size summary from barrels
  const autoSummary = barrelSummary(barrels);

  const handleSubmit = () => {
    if (!form.assetId) return;
    dispatch({ type: existing?"UPDATE_STRUCTURE":"ADD_STRUCTURE", payload:{
      ...form, id:existing?.id||Date.now(), assetClass:type,
      rating:form.rating?parseInt(form.rating):null,
      barrels,
      sizeType: autoSummary !== "—" ? autoSummary : form.sizeType,
    }});
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1500);
  };

  return (
    <div style={{ maxWidth:800 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{existing?`Edit ${label}`:`Add ${label}`}</div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ {label} saved</div>}

      {/* Basic info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Asset Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Asset ID" required>
            <input type="text" placeholder="A 1.1" value={form.assetId} onChange={e=>set("assetId",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Road Designation">
            <select value={form.roadDesig} onChange={e=>set("roadDesig",e.target.value)} style={inp}>
              {ROAD_DESIGS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Township">
            <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {TOWNSHIPS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Year (original install)">
            <input type="number" min="1900" max="2030" placeholder="2009" value={form.year} onChange={e=>set("year",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Road / Street">
            <input type="text" placeholder="9400 N. Heartland Avenue" value={form.road} onChange={e=>set("road",e.target.value)} style={inp} />
          </Field>
          <Field label="Feature / Drainage">
            <select value={form.featureDrainage} onChange={e=>set("featureDrainage",e.target.value)} style={inp}>
              {DRAIN_TYPES.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="GPS Coordinates">
            <input type="text" placeholder="40.689261, -98.278120" value={form.latlong} onChange={e=>set("latlong",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Overall Condition Rating (1-5)">
            <select value={form.rating} onChange={e=>set("rating",e.target.value)} style={inp}>
              <option value="">Not yet rated</option>
              {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} — {CONDITION_LABELS[n]}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" placeholder="Special characteristics, skew, headwall type…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
          </Field>
        </div>
      </div>

      {/* Barrels */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"12px 18px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#f7f7f5" }}>
          <div>
            <span style={{ fontWeight:700, fontSize:13 }}>Barrels ({barrels.length})</span>
            {barrels.length>0 && <span style={{ fontSize:12, color:"#1a5a3a", marginLeft:12, fontWeight:600 }}>{autoSummary}</span>}
          </div>
          <button onClick={()=>setAddingBarrel(!addingBarrel)} style={btn.small}>+ Add Barrel</button>
        </div>

        {addingBarrel && (
          <div style={{ padding:16, background:"#f0f8f4", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Shape / Material">
                <select value={newBarrel.shape} onChange={e=>setB("shape",e.target.value)} style={inp}>
                  {SHAPE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Diameter (in)">
                <input type="number" min="0" step="1" placeholder="36" value={newBarrel.diameter} onChange={e=>setB("diameter",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Length (ft)">
                <input type="number" min="0" step="1" placeholder="40" value={newBarrel.length} onChange={e=>setB("length",e.target.value)} style={inp} />
              </Field>
              <Field label="Year Installed">
                <input type="number" min="1900" max="2030" placeholder="2024" value={newBarrel.year} onChange={e=>setB("year",e.target.value)} style={inp} />
              </Field>
              <Field label="Condition (1-5)">
                <select value={newBarrel.condition} onChange={e=>setB("condition",e.target.value)} style={inp}>
                  <option value="">Not rated</option>
                  {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} — {CONDITION_LABELS[n]}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginBottom:10 }}>
              <Field label="Notes">
                <input type="text" placeholder="Gaps, undercut, headwall, skew angle…" value={newBarrel.notes} onChange={e=>setB("notes",e.target.value)} style={inp} />
              </Field>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={addBarrel} style={{ ...btn.small, background:"#1a5a3a" }}>Add Barrel</button>
              <button onClick={()=>setAddingBarrel(false)} style={{ ...btn.small, background:"#888" }}>Cancel</button>
            </div>
          </div>
        )}

        {barrels.length===0 && !addingBarrel && (
          <div style={{ padding:"20px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>
            No barrels yet — click + Add Barrel for each pipe at this location
          </div>
        )}

        {barrels.length>0 && (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["#","Shape","Diameter","Length","Year","Condition","Notes","Action"].map((h,i)=>(
                  <th key={i} style={{ padding:"8px 12px", textAlign:"left", fontWeight:600, fontSize:11, color:"#666", borderBottom:"1px solid #eee", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {barrels.map((b,i)=>(
                <tr key={b.id} style={{ borderTop:"1px solid #eee", background: b.status==="replaced"?"#fafaf8":"#fff", opacity:b.status==="replaced"?0.5:1 }}>
                  <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{i+1}</td>
                  <td style={{ padding:"8px 12px", fontWeight:600 }}>{b.shape}</td>
                  <td style={{ padding:"8px 12px", fontFamily:"monospace" }}>{b.diameter}"</td>
                  <td style={{ padding:"8px 12px", fontFamily:"monospace" }}>{b.length} ft</td>
                  <td style={{ padding:"8px 12px" }}>{b.year||"—"}</td>
                  <td style={{ padding:"8px 12px" }}>{b.condition ? <RatingBadge rating={parseInt(b.condition)} /> : "—"}</td>
                  <td style={{ padding:"8px 12px", fontSize:12, color:"#555", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.notes||"—"}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <button onClick={()=>removeBarrel(b.id)} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 8px" }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a5a3a" }}>Save {label}</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Signs ─────────────────────────────────────────────────────────────────────
function SignList({ db, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState("");
  const [ratingFilter, setRating] = useState("All");

  const signs = db.signs || [];
  const filtered = signs.filter(s => {
    if (ratingFilter!=="All" && s.signRating!==ratingFilter) return false;
    if (search && !`${s.signName} ${s.signType||""} ${s.description||""} ${s.onRoad||""} ${s.dotNumber||""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (adding)   return <SignForm dispatch={dispatch} onDone={()=>setAdding(false)} />;
  if (selected) return <SignDetail sign={selected} db={db} dispatch={dispatch} onBack={()=>setSelected(null)} />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Signs</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{signs.length} signs in inventory</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search signs…" style={{ ...inp, width:200, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["All","Excellent","Good","Fair","Poor","Failed"].map(r=>(
              <button key={r} onClick={()=>setRating(r)} style={{ padding:"6px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:ratingFilter===r?"#d97706":"#fff", color:ratingFilter===r?"#fff":"#555" }}>{r}</button>
            ))}
          </div>
          <button onClick={()=>setAdding(true)} style={{ ...btn.primary, background:"#1a5a3a" }}>+ Add Sign</button>
        </div>
      </div>
      <SectionCard title={`Signs (${filtered.length})`}>
        <Table
          headers={[{ label:"Sign #" },{ label:"Type" },{ label:"Description" },{ label:"On Road" },{ label:"Township" },{ label:"Size" },{ label:"Surface" },{ label:"Rating" },{ label:"Position" }]}
          rows={filtered.map(s=>{
            const rColor = s.signRating==="Excellent"||s.signRating==="Good"?"#1a6b35":s.signRating==="Fair"?"#d97706":"#c0392b";
            return [
              <button onClick={()=>setSelected(s)} style={{ background:"none", border:"none", padding:0, color:"#d97706", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>#{s.signName}</button>,
              <span style={{ fontFamily:"monospace", fontSize:11, background:"#f0f0ee", padding:"1px 6px", borderRadius:3 }}>{s.signType||"—"}</span>,
              <span style={{ fontSize:12 }}>{s.description||"—"}</span>,
              s.onRoad||"—",
              s.township||"—",
              s.size||"—",
              s.surface||"—",
              s.signRating ? <span style={{ background:rColor+"18", color:rColor, padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{s.signRating}</span> : "—",
              s.position||"—",
            ];
          })}
          emptyMessage="No signs yet — click + Add Sign"
        />
      </SectionCard>
    </div>
  );
}

function SignDetail({ sign, db, dispatch, onBack }) {
  const signHistory = (db.signHistory||[]).filter(h=>String(h.signName)===String(sign.signName));
  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to signs</button>
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a" }}>Sign #{sign.signName}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:2 }}>{sign.signType} — {sign.description}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{sign.onRoad} · {sign.township}</div>
          </div>
          {sign.signRating && <span style={{ fontSize:13, fontWeight:600, padding:"4px 12px", borderRadius:6, background: sign.signRating==="Excellent"||sign.signRating==="Good"?"#e6f4ec":sign.signRating==="Fair"?"#fef3cd":"#fdecea", color: sign.signRating==="Excellent"||sign.signRating==="Good"?"#1a6b35":sign.signRating==="Fair"?"#7a4f00":"#c0392b" }}>{sign.signRating}</span>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
          {[
            { label:"DOT #",          value:sign.dotNumber||"—" },
            { label:"Size",           value:sign.size||"—" },
            { label:"Surface",        value:sign.surface||"—" },
            { label:"Support Type",   value:sign.supportType||"—" },
            { label:"Support Material",value:sign.supportMaterial||"—" },
            { label:"Support Length", value:sign.supportLength||"—" },
            { label:"Stub",           value:sign.stub||"—" },
            { label:"Sheeting",       value:sign.sheeting||"—" },
            { label:"Position",       value:sign.position||"—" },
            { label:"Side of Road",   value:sign.sideOfRoad||"—" },
            { label:"Travel Direction",value:sign.travelDir||"—" },
            { label:"Offset",         value:sign.offset||"—" },
            { label:"Height",         value:sign.height||"—" },
            { label:"Road Back",      value:sign.roadBack||"—" },
            { label:"Road Ahead",     value:sign.roadAhead||"—" },
            { label:"GPS",            value:sign.latlong||"—" },
          ].map((f,i)=>(
            <div key={i}>
              <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a" }}>{f.value}</div>
            </div>
          ))}
        </div>
        {sign.notes && <div style={{ marginTop:14, padding:"10px 14px", background:"#f7f7f5", borderRadius:6, fontSize:13, color:"#555" }}>{sign.notes}</div>}
      </div>
      {signHistory.length>0 && (
        <SectionCard title="Sign History" subtitle={`${signHistory.length} events`}>
          <Table
            headers={[{ label:"Date" },{ label:"Reason" },{ label:"Type" },{ label:"Rating" },{ label:"Materials Used" },{ label:"Notes" }]}
            rows={signHistory.map(h=>[
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{h.timestamp||"—"}</span>,
              h.reason||"—",
              <span style={{ fontFamily:"monospace", fontSize:11 }}>{h.signType||"—"}</span>,
              h.signRating||"—",
              h.materialsUsed||"—",
              <span style={{ fontSize:12, color:"#888" }}>{h.notes||"—"}</span>,
            ])}
            emptyMessage="No history recorded"
          />
        </SectionCard>
      )}
    </div>
  );
}

function SignForm({ dispatch, onDone, existing }) {
  const empty = { signName:"",reason:"Inventory",signType:"",description:"",onRoad:"",township:"",latlong:"",dotNumber:"",notes:"",materialsUsed:"",roadBack:"",roadAhead:"",surface:"",size:"",supportType:"Single",supportMaterial:"Steel",supportLength:"",stub:"",sheeting:"Diamond",signRating:"Good",position:"Right",sideOfRoad:"",travelDir:"",offset:"",height:"",gridAddress:"" };
  const [form, setForm] = useState(existing||empty);
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = () => {
    if (!form.signName) return;
    dispatch({ type: existing?"UPDATE_SIGN":"ADD_SIGN", payload:{ ...form, id:existing?.id||Date.now() } });
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1500);
  };

  return (
    <div style={{ maxWidth:760 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{existing?"Edit Sign":"Add Sign"}</div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Sign saved</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Sign Information</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Sign #" required><input type="text" placeholder="1" value={form.signName} onChange={e=>set("signName",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          <Field label="Reason"><input type="text" placeholder="Inventory, Replace Sign…" value={form.reason} onChange={e=>set("reason",e.target.value)} style={inp} /></Field>
          <Field label="Sign Type (MUTCD)">
            <select value={form.signType} onChange={e=>set("signType",e.target.value)} style={{ ...inp, fontFamily:"monospace" }}>
              <option value="">Select…</option>
              {SIGN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Description"><input type="text" placeholder="Large Arrow, Stop Ahead…" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="On Road"><input type="text" placeholder="Riverview…" value={form.onRoad} onChange={e=>set("onRoad",e.target.value)} style={inp} /></Field>
          <Field label="Township">
            <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {TOWNSHIPS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="DOT #"><input type="text" value={form.dotNumber} onChange={e=>set("dotNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Surface"><input type="text" placeholder="Gravel, Pavement…" value={form.surface} onChange={e=>set("surface",e.target.value)} style={inp} /></Field>
          <Field label="Sign Size"><input type="text" placeholder="30in, 48in…" value={form.size} onChange={e=>set("size",e.target.value)} style={inp} /></Field>
          <Field label="Sign Rating">
            <select value={form.signRating} onChange={e=>set("signRating",e.target.value)} style={inp}>
              {SIGN_RATINGS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="GPS (lat, long)"><input type="text" placeholder="40.350357, -98.278190" value={form.latlong} onChange={e=>set("latlong",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Support Type">
            <select value={form.supportType} onChange={e=>set("supportType",e.target.value)} style={inp}>
              {SUPPORT_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Support Material">
            <select value={form.supportMaterial} onChange={e=>set("supportMaterial",e.target.value)} style={inp}>
              {SUPPORT_MATS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Support Length"><input type="text" placeholder="10ft X 2in" value={form.supportLength} onChange={e=>set("supportLength",e.target.value)} style={inp} /></Field>
          <Field label="Stub"><input type="text" placeholder="2 1/4in X 4ft" value={form.stub} onChange={e=>set("stub",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Sheeting">
            <select value={form.sheeting} onChange={e=>set("sheeting",e.target.value)} style={inp}>
              {SHEETING.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Position">
            <select value={form.position} onChange={e=>set("position",e.target.value)} style={inp}>
              {ROAD_POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Side of Road"><input type="text" placeholder="North, South, East, West…" value={form.sideOfRoad} onChange={e=>set("sideOfRoad",e.target.value)} style={inp} /></Field>
          <Field label="Travel Direction"><input type="text" placeholder="North, South…" value={form.travelDir} onChange={e=>set("travelDir",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Offset"><input type="text" placeholder="8'" value={form.offset} onChange={e=>set("offset",e.target.value)} style={inp} /></Field>
          <Field label="Height"><input type="text" placeholder="5'" value={form.height} onChange={e=>set("height",e.target.value)} style={inp} /></Field>
          <Field label="Road Back"><input type="text" placeholder="Silverlake…" value={form.roadBack} onChange={e=>set("roadBack",e.target.value)} style={inp} /></Field>
          <Field label="Road Ahead"><input type="text" placeholder="Blue Valley…" value={form.roadAhead} onChange={e=>set("roadAhead",e.target.value)} style={inp} /></Field>
          <Field label="Grid Address"><input type="text" placeholder="18000 S. Riverview Ave" value={form.gridAddress} onChange={e=>set("gridAddress",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Notes"><textarea rows={2} placeholder="Inventory notes, work needed…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} /></Field>
        </div>
        <Field label="Materials Used"><input type="text" placeholder="New 30in yield sign, post, stub…" value={form.materialsUsed} onChange={e=>set("materialsUsed",e.target.value)} style={inp} /></Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a5a3a" }}>Save Sign</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
