import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm } from "../components/shared.jsx";
import { createVendor, createInsuranceCert, createContractRate, VENDOR_TYPES } from "../data/schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

const typeLabel = (v) => VENDOR_TYPES.find(t => t.value === v)?.label || v || "—";

const TYPE_TONE = {
  supplier:         { bg:"#e6edf5", color:"#1a3a5c" },
  contractor:       { bg:"#fef3cd", color:"#7a4f00" },
  engineering_firm: { bg:"#f3ecfa", color:"#5a1a8a" },
  utility:          { bg:"#e6f4ec", color:"#1a5a3a" },
  employee:         { bg:"#f0f0ee", color:"#555" },
  other:            { bg:"#f4f4f2", color:"#888" },
};

function TypeChip({ type }) {
  const t = TYPE_TONE[type] || TYPE_TONE.other;
  return (
    <span style={{ background:t.bg, color:t.color, borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {typeLabel(type)}
    </span>
  );
}

// Address used on the claim sheet — the remit-to address when one is set.
export function payToAddress(v) {
  if (!v) return { line1:"", cityStateZip:"" };
  const useRemit = v.separateRemitTo && (v.remitAddress || v.remitCity);
  const line1 = useRemit ? v.remitAddress : v.address;
  const city  = useRemit ? v.remitCity    : v.city;
  const state = useRemit ? v.remitState   : v.state;
  const zip   = useRemit ? v.remitZip     : v.zip;
  return {
    line1: line1 || "",
    cityStateZip: [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : ""),
    isRemit: !!useRemit,
  };
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Vendors({ db, dispatch }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing]       = useState(null);
  const [showForm, setShowForm]     = useState(false);

  const vendors = db.vendors || [];
  const selected = vendors.find(v => v.id === selectedId);

  if (showForm || editing) {
    const vendor = editing ? vendors.find(v => v.id === editing) : null;
    return (
      <VendorForm
        vendor={vendor}
        invItems={db.inventoryItems || []}
        onSave={payload => {
          dispatch({ type: vendor ? "UPDATE_VENDOR" : "ADD_VENDOR", payload });
          setShowForm(false); setEditing(null);
        }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected) {
    return (
      <VendorDetail
        vendor={selected}
        db={db}
        dispatch={dispatch}
        onBack={() => setSelectedId(null)}
        onEdit={() => { setEditing(selected.id); setSelectedId(null); }}
      />
    );
  }

  return <VendorList vendors={vendors} db={db} dispatch={dispatch} onSelect={setSelectedId} onNew={() => setShowForm(true)} />;
}

// ── List ──────────────────────────────────────────────────────────────────────
function VendorList({ vendors, db, dispatch, onSelect, onNew }) {
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const active   = vendors.filter(v => v.active !== false);
  const filtered = vendors.filter(v => {
    if (!showInactive && v.active === false) return false;
    if (typeFilter !== "all" && v.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${v.name} ${v.city} ${v.vendorCode} ${v.contactName}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (a.name||"").localeCompare(b.name||""));

  const contractors = active.filter(v => v.type === "contractor").length;
  const withRates   = active.filter(v => (v.contractRates||[]).length > 0).length;
  const inactive    = vendors.filter(v => v.active === false).length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Vendors & Payees</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Anyone the department sends money to</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, city, code…" style={{ ...inp, width:220, margin:0 }} />
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="all">All Types</option>
            {VENDOR_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={onNew} style={btn.primary}>+ New Vendor</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Active Vendors" value={active.length}  sub="In use"              accent="#1a5a3a" icon="building-store" />
        <KPICard label="Contractors"    value={contractors}    sub="Insurance required"  accent="#d97706" icon="hard-hat" />
        <KPICard label="With Contract Rates" value={withRates} sub="Bid pricing on file" accent="#1a3a5c" icon="receipt" />
        <KPICard label="Inactive"       value={inactive}       sub="Kept for history"    accent="#888"    icon="archive" />
      </div>

      {vendors.length === 0 && (
        <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:20, marginBottom:16, fontSize:13, color:"#1a3a5c", lineHeight:1.6 }}>
          <strong>Starting clean.</strong> The old Road &amp; Bridge list held a lot of vendors no longer
          around, so nothing was imported. Add them as you go — roughly 140 get used in a year.
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:12, color:"#888" }}>Showing {filtered.length} of {vendors.length}</div>
        {inactive > 0 && (
          <label style={{ fontSize:12, color:"#666", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        )}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Vendor","Type","City","Vendor Code","Flags",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {vendors.length===0 ? "No vendors yet — click New Vendor to add the first." : "No vendors match your filter."}
              </td></tr>
            )}
            {filtered.map((v,i) => (
              <tr key={v.id}
                onClick={()=>onSelect(v.id)}
                style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer", opacity:v.active===false?0.5:1 }}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                <td style={{ padding:"10px 14px", fontWeight:600 }}>
                  {v.name||"—"}
                  {v.active===false && <span style={{ fontSize:10, color:"#aaa", marginLeft:7 }}>inactive</span>}
                </td>
                <td style={{ padding:"10px 14px" }}><TypeChip type={v.type} /></td>
                <td style={{ padding:"10px 14px", fontSize:12, color:"#666" }}>{v.city||"—"}</td>
                <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{v.vendorCode||"—"}</td>
                <td style={{ padding:"10px 14px", fontSize:10 }}>
                  {v.separateRemitTo   && <Flag tone="navy"   title="Separate remit-to address">REMIT</Flag>}
                  {v.tracksInsurance   && <Flag tone="amber"  title="Insurance certificate required">INS</Flag>}
                  {v.bonded            && <Flag tone="green"  title="Bonded">BOND</Flag>}
                  {v.onStateContract   && <Flag tone="navy"   title="State contract or co-op">STATE</Flag>}
                  {v.conflictOfInterest&& <Flag tone="red"    title="Conflict of interest">COI</Flag>}
                </td>
                <td style={{ padding:"10px 14px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Flag({ children, tone, title }) {
  const tones = {
    navy:  { bg:"#e6edf5", color:"#1a3a5c", border:"#c8d8f0" },
    amber: { bg:"#fef3cd", color:"#7a4f00", border:"#f0d080" },
    green: { bg:"#e6f4ec", color:"#1a5a3a", border:"#a8d5b5" },
    red:   { bg:"#fdecea", color:"#8c1b18", border:"#f5c6c6" },
  };
  const t = tones[tone] || tones.navy;
  return (
    <span title={title} style={{ background:t.bg, color:t.color, border:`1px solid ${t.border}`, borderRadius:3, padding:"1px 5px", marginRight:4, fontWeight:700 }}>
      {children}
    </span>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────
function VendorDetail({ vendor: v, db, dispatch, onBack, onEdit }) {
  const [tab, setTab] = useState("details");

  const expenditures = (db.expenditures || []).filter(e =>
    e.vendorId === v.id || (e.vendorName || e.vendor) === v.name);
  const spend = expenditures.reduce((s,e) => s + (e.totalAmount || 0), 0);
  const supplied = (v.suppliedItemIds || [])
    .map(id => (db.inventoryItems||[]).find(i => i.id === id))
    .filter(Boolean);
  const pay = payToAddress(v);

  const TABS = [
    ["details","Details","info-circle"],
    ["rates",`Contract Rates${(v.contractRates||[]).length?` (${v.contractRates.length})`:""}`,"receipt"],
    ["items",`Supplies${supplied.length?` (${supplied.length})`:""}`,"package"],
    ["history","Payment History","coin"],
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:18, flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Vendors</button>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:19, fontWeight:700 }}>{v.name||"Vendor"}</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:5, flexWrap:"wrap" }}>
            <TypeChip type={v.type} />
            {v.vendorCode && <span style={{ fontFamily:"monospace", fontSize:11, color:"#888" }}>Code {v.vendorCode}</span>}
            {v.active===false && <span style={{ fontSize:11, color:"#aaa" }}>inactive</span>}
          </div>
        </div>
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
      </div>

      {v.conflictOfInterest && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"11px 16px", marginBottom:16, fontSize:12, color:"#8c1b18", fontWeight:600 }}>
          ⚠ Flagged for conflict of interest — this payee is also an employee or elected official.
        </div>
      )}

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
        {TABS.map(([id,label,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ background:"transparent", border:"none", padding:"8px 14px 10px", fontWeight:tab===id?700:400, fontSize:13, cursor:"pointer", color:tab===id?"#1a5a3a":"#666", borderBottom:tab===id?"2px solid #1a5a3a":"2px solid transparent", marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6 }}>
            <Icon name={icon} size={12} color={tab===id?"#1a5a3a":"#888"} />{label}
          </button>
        ))}
      </div>

      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <SectionCard title="Contact & Address">
            <div style={{ padding:"0 2px" }}>
              {[
                ["Contact",  v.contactName||"—"],
                ["Phone",    v.phone||"—"],
                ["Email",    v.email||"—"],
                ["Address",  v.address||"—"],
                ["City / State / Zip", [v.city, v.state].filter(Boolean).join(", ") + (v.zip?` ${v.zip}`:"") || "—"],
              ].map(([k,val])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, gap:12 }}>
                  <span style={{ color:"#666", whiteSpace:"nowrap" }}>{k}</span>
                  <span style={{ fontWeight:600, textAlign:"right" }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background: pay.isRemit ? "#f0f4ff" : "#fafaf8", border:`1px solid ${pay.isRemit?"#c8d8f0":"#eee"}`, borderRadius:6, padding:12, marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:5 }}>
                Address to send payment to {pay.isRemit && <span style={{ color:"#1a3a5c" }}>· separate remit-to</span>}
              </div>
              <div style={{ fontSize:13, lineHeight:1.5 }}>
                <div style={{ fontWeight:600 }}>{v.name}</div>
                <div>{pay.line1 || <span style={{ color:"#bbb" }}>no address on file</span>}</div>
                <div>{pay.cityStateZip}</div>
              </div>
              <div style={{ fontSize:10, color:"#aaa", marginTop:7 }}>This is what appears on the claim sheet.</div>
            </div>
          </SectionCard>

          <SectionCard title="Compliance & Purchasing">
            <div style={{ padding:"0 2px" }}>
              {[
                ["Insurance required", v.tracksInsurance ? "Yes — general liability" : "No"],
                ["Certificates on file", `${(v.insurance||[]).filter(c=>c.certificateOnFile).length} of ${(v.insurance||[]).length}`],
                ["Bonded", v.bonded ? (v.bondAmount ? `Yes — ${v.bondAmount}` : "Yes") : "No"],
                ["Bond reference", v.bondReference||"—"],
                ["State contract / co-op", v.onStateContract ? "Yes" : "No"],
                ["Tax exemption sent", v.taxExemptSent ? "Yes" : "No"],
                ["Vendor code (Clerk's)", v.vendorCode||"—"],
              ].map(([k,val])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                  <span style={{ color:"#666" }}>{k}</span>
                  <span style={{ fontWeight:600 }}>{val}</span>
                </div>
              ))}
            </div>
            {(v.insurance||[]).length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:7 }}>Certificates</div>
                {v.insurance.map(c=>(
                  <div key={c.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", fontSize:12, borderBottom:"1px solid #f4f4f2" }}>
                    <span>{c.carrier||"—"} <span style={{ color:"#aaa", fontFamily:"monospace" }}>{c.policyNumber}</span></span>
                    <span style={{ color:"#888" }}>exp {fmtDate(c.expirationDate)} {c.certificateOnFile ? "✓" : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {v.notes && <div style={{ padding:"12px 0 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{v.notes}</div>}
          </SectionCard>
        </div>
      )}

      {tab==="rates" && <VendorRates vendor={v} dispatch={dispatch} />}

      {tab==="items" && (
        <SectionCard title="Items Supplied" subtitle="A product may have several suppliers">
          {supplied.length === 0 ? (
            <div style={{ padding:28, textAlign:"center", color:"#888", fontSize:13 }}>
              No catalog items linked. Edit the vendor to tag what they supply.
            </div>
          ) : (
            <Table
              headers={[{label:"Part #"},{label:"Item"},{label:"Group"},{label:"Unit"}]}
              rows={supplied.map(i=>[
                <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, background:"#f0f4ff", color:"#1a3a5c", padding:"2px 6px", borderRadius:3 }}>{i.legacyNumber||"—"}</span>,
                <span style={{ fontWeight:600 }}>{i.name}</span>,
                <span style={{ fontSize:12, color:"#555" }}>{i.commodityGroupCode?`${i.commodityGroupCode} — ${i.commodityGroup}`:(i.commodityGroup||"—")}</span>,
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{i.unitOfMeasure||"—"}</span>,
              ])}
            />
          )}
        </SectionCard>
      )}

      {tab==="history" && (
        <SectionCard title="Payment History" subtitle={`${expenditures.length} expenditure${expenditures.length!==1?"s":""} · ${fmt(spend)} total`}>
          <Table
            headers={[{label:"Date"},{label:"Reference"},{label:"Claim Cycle"},{label:"Amount"},{label:"Status"}]}
            rows={[...expenditures].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(e=>[
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(e.date)}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{e.reference||"—"}</span>,
              <span style={{ fontSize:12 }}>{e.claimCycleLabel||e.claimCycleId||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(e.totalAmount||0)}</span>,
              <span style={{ fontSize:11, textTransform:"capitalize", color:e.status==="approved"?"#1a6b35":"#888" }}>{e.status||"entered"}</span>,
            ])}
            emptyMessage="Nothing paid to this vendor yet"
          />
        </SectionCard>
      )}
    </div>
  );
}

// ── Contract rates ────────────────────────────────────────────────────────────
// Mostly set by bid. Rates change sometimes — each carries an effective date so
// a ticket written earlier can still be traced to the rate that applied.
function VendorRates({ vendor: v, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    haulType:"county_pickup", destinationType:"stockpile_1", township:"",
    unitRate:"", unitOfMeasure:"CY", effectiveDate:"", bidReference:"", notes:"",
  });
  const set = (k,val) => setForm(f=>({...f,[k]:val}));

  const rates = [...(v.contractRates||[])].sort((a,b)=>(b.effectiveDate||"").localeCompare(a.effectiveDate||""));

  const add = () => {
    if (!form.unitRate || !form.effectiveDate) return;
    const rate = createContractRate({
      ...form,
      unitRate: parseFloat(form.unitRate)||0,
    });
    dispatch({ type:"UPDATE_VENDOR", payload:{ ...v, contractRates:[...(v.contractRates||[]), rate] } });
    setForm({ haulType:"county_pickup", destinationType:"stockpile_1", township:"", unitRate:"", unitOfMeasure:"CY", effectiveDate:"", bidReference:"", notes:"" });
    setShowForm(false);
  };

  const remove = (id) =>
    dispatch({ type:"UPDATE_VENDOR", payload:{ ...v, contractRates:(v.contractRates||[]).filter(r=>r.id!==id) } });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:12, color:"#888" }}>
          Rates are mostly set by bid. Each has an effective date, so a scale ticket can be traced to the rate in force when it was written.
        </div>
        <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Add Rate"}</button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Haul Type">
              <select value={form.haulType} onChange={e=>set("haulType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="county_pickup">County Pickup</option>
                <option value="contractor_delivery">Contractor Delivery</option>
              </select>
            </Field>
            <Field label="Destination">
              <select value={form.destinationType} onChange={e=>set("destinationType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="stockpile_1">Wanda Stockpile</option>
                <option value="stockpile_2">Adams Central Stockpile</option>
                <option value="road_segment">Road Segment</option>
              </select>
            </Field>
            <Field label="Rate ($/unit)" required>
              <input type="number" min="0" step="0.0001" value={form.unitRate} onChange={e=>set("unitRate",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Unit">
              <select value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={{ ...inp, margin:0 }}>
                {["CY","TON","LF"].map(u=><option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:12, marginBottom:12 }}>
            <Field label="Effective From" required>
              <input type="date" value={form.effectiveDate} onChange={e=>set("effectiveDate",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
            <Field label="Bid Reference">
              <input type="text" value={form.bidReference} onChange={e=>set("bidReference",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Notes">
              <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
          </div>
          <button onClick={add} style={btn.primary}>Add Rate</button>
        </div>
      )}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Effective","Haul Type","Destination","Rate","Bid Ref","Notes",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:h==="Rate"?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.length===0 && (
              <tr><td colSpan={7} style={{ padding:28, textAlign:"center", color:"#aaa", fontSize:13 }}>No contract rates on file</td></tr>
            )}
            {rates.map((r,i)=>(
              <tr key={r.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(r.effectiveDate)}</td>
                <td style={{ padding:"9px 14px", fontSize:12 }}>{r.haulType==="county_pickup"?"County Pickup":"Contractor Delivery"}</td>
                <td style={{ padding:"9px 14px", fontSize:12 }}>
                  {r.destinationType==="stockpile_1"?"Wanda":r.destinationType==="stockpile_2"?"Adams Central":"Road Segment"}
                  {r.township && <span style={{ color:"#888" }}> · {r.township}</span>}
                </td>
                <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(r.unitRate)}/{r.unitOfMeasure}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:"#888" }}>{r.bidReference||"—"}</td>
                <td style={{ padding:"9px 14px", fontSize:12, color:"#888" }}>{r.notes||"—"}</td>
                <td style={{ padding:"9px 14px", textAlign:"right" }}>
                  <button onClick={()=>remove(r.id)} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 9px" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────
function VendorForm({ vendor, invItems, onSave, onCancel }) {
  const [form, setForm] = useState(() => vendor ? { ...vendor } : createVendor());
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [itemSearch, setItemSearch] = useState("");

  const isContractor = form.type === "contractor";
  const supplied = form.suppliedItemIds || [];

  const toggleItem = (id) =>
    set("suppliedItemIds", supplied.includes(id) ? supplied.filter(x=>x!==id) : [...supplied, id]);

  const matchingItems = (invItems||[])
    .filter(i => i.active !== false)
    .filter(i => {
      if (!itemSearch) return false;   // don't render 2,375 rows by default
      const q = itemSearch.toLowerCase();
      return `${i.legacyNumber} ${i.name} ${i.commodityGroup}`.toLowerCase().includes(q);
    })
    .slice(0, 60);

  const addCert = () =>
    set("insurance", [...(form.insurance||[]), createInsuranceCert({ type:"general_liability" })]);
  const setCert = (id,k,v) =>
    set("insurance", (form.insurance||[]).map(c=>c.id===id?{...c,[k]:v}:c));
  const removeCert = (id) =>
    set("insurance", (form.insurance||[]).filter(c=>c.id!==id));

  return (
    <div style={{ maxWidth:820 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700 }}>{vendor?"Edit Vendor":"New Vendor"}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Vendor Name" required>
            <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={e=>set("type",e.target.value)} style={inp}>
              {VENDOR_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Vendor Code">
            <input type="text" value={form.vendorCode} onChange={e=>set("vendorCode",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="From the Clerk" />
          </Field>
        </div>

        {form.type === "employee" && (
          <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:6, padding:"10px 13px", marginBottom:16, fontSize:12, color:"#1a3a5c", lineHeight:1.5 }}>
            Employee payees receive reimbursement claims — mileage, licence renewals and similar.
            Once the Payroll module exists this record can be linked to the employee so the two stay in step.
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Contact Name"><input type="text" value={form.contactName} onChange={e=>set("contactName",e.target.value)} style={inp} /></Field>
          <Field label="Phone"><input type="text" value={form.phone} onChange={e=>set("phone",e.target.value)} style={inp} /></Field>
          <Field label="Email"><input type="text" value={form.email} onChange={e=>set("email",e.target.value)} style={inp} /></Field>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 60px 1fr", gap:16, marginBottom:16 }}>
          <Field label="Address"><input type="text" value={form.address} onChange={e=>set("address",e.target.value)} style={inp} /></Field>
          <Field label="City"><input type="text" value={form.city} onChange={e=>set("city",e.target.value)} style={inp} /></Field>
          <Field label="State"><input type="text" value={form.state} onChange={e=>set("state",e.target.value)} style={inp} maxLength={2} /></Field>
          <Field label="Zip"><input type="text" value={form.zip} onChange={e=>set("zip",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
        </div>

        {/* Remit-to */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
          <label style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", marginBottom: form.separateRemitTo ? 14 : 0 }}>
            <input type="checkbox" checked={!!form.separateRemitTo} onChange={e=>set("separateRemitTo",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
            <span style={{ fontSize:13, fontWeight:600 }}>Payment goes to a different address</span>
            <span style={{ fontSize:12, color:"#888" }}>— this is what prints on the claim sheet</span>
          </label>
          {form.separateRemitTo && (
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 60px 1fr", gap:16 }}>
              <Field label="Remit Address"><input type="text" value={form.remitAddress} onChange={e=>set("remitAddress",e.target.value)} style={inp} /></Field>
              <Field label="City"><input type="text" value={form.remitCity} onChange={e=>set("remitCity",e.target.value)} style={inp} /></Field>
              <Field label="State"><input type="text" value={form.remitState} onChange={e=>set("remitState",e.target.value)} style={inp} maxLength={2} /></Field>
              <Field label="Zip"><input type="text" value={form.remitZip} onChange={e=>set("remitZip",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            </div>
          )}
        </div>

        {/* Compliance */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:10 }}>Compliance & Purchasing</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:14 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
              <input type="checkbox" checked={!!form.tracksInsurance} onChange={e=>set("tracksInsurance",e.target.checked)} />
              Insurance required
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
              <input type="checkbox" checked={!!form.bonded} onChange={e=>set("bonded",e.target.checked)} />
              Bonded
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
              <input type="checkbox" checked={!!form.onStateContract} onChange={e=>set("onStateContract",e.target.checked)} />
              State contract / co-op
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
              <input type="checkbox" checked={!!form.taxExemptSent} onChange={e=>set("taxExemptSent",e.target.checked)} />
              Tax exemption sent
            </label>
          </div>

          {form.bonded && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:16, marginBottom:14 }}>
              <Field label="Bond Amount"><input type="text" value={form.bondAmount} onChange={e=>set("bondAmount",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="$50,000" /></Field>
              <Field label="Bond Reference"><input type="text" value={form.bondReference} onChange={e=>set("bondReference",e.target.value)} style={inp} /></Field>
            </div>
          )}

          {form.tracksInsurance && (
            <div style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:600 }}>Certificates <span style={{ color:"#888", fontWeight:400 }}>— general liability</span></div>
                <button onClick={addCert} style={{ ...btn.secondary, fontSize:11, padding:"5px 11px" }}>+ Add Certificate</button>
              </div>
              {(form.insurance||[]).length === 0 && (
                <div style={{ fontSize:12, color:"#aaa", padding:"6px 0" }}>None on file.</div>
              )}
              {(form.insurance||[]).map(c=>(
                <div key={c.id} style={{ display:"grid", gridTemplateColumns:"2fr 1.5fr 1fr auto 34px", gap:10, alignItems:"end", marginBottom:8 }}>
                  <Field label="Carrier"><input type="text" value={c.carrier} onChange={e=>setCert(c.id,"carrier",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                  <Field label="Policy #"><input type="text" value={c.policyNumber} onChange={e=>setCert(c.id,"policyNumber",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
                  <Field label="Expires"><input type="date" value={c.expirationDate} onChange={e=>setCert(c.id,"expirationDate",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                  <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, height:34, whiteSpace:"nowrap" }}>
                    <input type="checkbox" checked={!!c.certificateOnFile} onChange={e=>setCert(c.id,"certificateOnFile",e.target.checked)} />
                    On file
                  </label>
                  <button onClick={()=>removeCert(c.id)} style={{ ...btn.danger, padding:"7px 0", fontSize:14, height:34 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supplied items */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:3 }}>Items Supplied</div>
          <div style={{ fontSize:11, color:"#888", marginBottom:10 }}>
            Tag what this vendor supplies. A product can have several vendors — filters, oil, parts.
          </div>
          {supplied.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
              {supplied.map(id=>{
                const item = (invItems||[]).find(i=>i.id===id);
                return (
                  <span key={id} onClick={()=>toggleItem(id)} style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", color:"#1a5a3a", borderRadius:14, padding:"4px 11px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    {item ? `${item.legacyNumber?`[${item.legacyNumber}] `:""}${item.name}` : id} ×
                  </span>
                );
              })}
            </div>
          )}
          <input type="text" value={itemSearch} onChange={e=>setItemSearch(e.target.value)} style={{ ...inp, marginBottom:8 }} placeholder="Search the catalog to tag items…" />
          {itemSearch && (
            <div style={{ maxHeight:170, overflowY:"auto", border:"1px solid #eee", borderRadius:6 }}>
              {matchingItems.map((i,idx)=>(
                <label key={i.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", cursor:"pointer", background: supplied.includes(i.id) ? "#f0f8f4" : idx%2===0?"#fff":"#fafaf8", borderBottom:"1px solid #f4f4f2" }}>
                  <input type="checkbox" checked={supplied.includes(i.id)} onChange={()=>toggleItem(i.id)} />
                  <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#1a3a5c", minWidth:80 }}>{i.legacyNumber||"—"}</span>
                  <span style={{ fontSize:12 }}>{i.name}</span>
                </label>
              ))}
              {matchingItems.length===0 && <div style={{ padding:14, textAlign:"center", color:"#aaa", fontSize:12 }}>No items match.</div>}
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
            <input type="checkbox" checked={!!form.conflictOfInterest} onChange={e=>set("conflictOfInterest",e.target.checked)} />
            Conflict of interest — also an employee or elected official
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
            <input type="checkbox" checked={form.active !== false} onChange={e=>set("active",e.target.checked)} />
            Active <span style={{ color:"#888", fontSize:12 }}>— unchecking hides them but keeps history</span>
          </label>
        </div>

        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} disabled={!form.name} style={{ ...btn.primary, opacity: form.name?1:0.4 }}>
          {vendor?"Save Changes":"Add Vendor"}
        </button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
