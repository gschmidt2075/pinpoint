import { useState, useMemo } from "react";
import { Field, SectionCard, Table, Icon, AlertBar, inp, btn, fmt, fmtSm, DateField, titleCase } from "../components/shared.jsx";
import { EXPENDITURE_CODES, REVENUE_CODES, FISCAL_YEAR } from "../data/accountCodes.js";
import { LOOKUP_DEFS, createTownship, createStorageLocation, createTank,
         DEFAULT_INVOICES_PER_CLAIM } from "../data/schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_TOWNSHIPS = [
  "West Blue","Highland","Verona","Kenesaw","Wanda","Juniata",
  "Denver","Blaine","Hanover","Ayr","Roseland","Cottonwood",
  "Logan","Silverlake","Zero","Little Blue",
];

const DEFAULT_LOCATIONS = [
  { id:"main",     name:"Main Shop",     shelves:["A1","A2","A3","B1","B2","B3","C1","C2","C3","D1","D2","E1","E2"] },
  { id:"pauline",  name:"Pauline Shed",  shelves:["A1","A2","B1","B2","C1"] },
  { id:"kenesaw",  name:"Kenesaw Shed",  shelves:["A1","A2","B1","B2","C1"] },
  { id:"roseland", name:"Roseland Shed", shelves:["A1","A2","B1","B2","C1"] },
  { id:"holstein", name:"Holstein Shed", shelves:["A1","A2","B1","B2","C1"] },
  { id:"juniata",  name:"Juniata Shed",  shelves:["A1","A2","B1","B2"] },
  { id:"shed2",    name:"#2 Shed",       shelves:["A1","A2","B1","B2"] },
];

// ── Settings Module ───────────────────────────────────────────────────────────
export default function Settings({ db, dispatch }) {
  const [view, setView] = useState("county");

  const tabs = [
    { id:"county",    label:"County Info",       icon:"building" },
    { id:"fiscal",    label:"Fiscal Year",       icon:"calendar-event" },
    { id:"accounts",  label:"Account Codes",     icon:"receipt" },
    { id:"system",    label:"System Settings",   icon:"adjustments-horizontal" },
  ];

  return (
    <div>
      {/* Settings header */}
      <div style={{ background:"#1a1a1a", borderRadius:8, padding:"16px 22px", marginBottom:20, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:40, height:40, background:"#333", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon name="settings" size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#fff" }}>Settings & Administration</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>Superintendent access only · County info, fiscal year, account codes, system configuration</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:16 }}>
        {/* Left nav */}
        <div style={{ width:200, flexShrink:0 }}>
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setView(t.id)} style={{
                display:"flex", alignItems:"center", gap:10, width:"100%",
                padding:"12px 16px", background: view===t.id?"#1a1a1a":"transparent",
                border:"none", cursor:"pointer", textAlign:"left",
                color: view===t.id?"#fff":"#444",
                fontWeight: view===t.id?700:400, fontSize:13,
                borderBottom:"1px solid #eee",
              }}>
                <Icon name={t.icon} size={15} color={view===t.id?"#fff":"#888"} />
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop:12, padding:"10px 14px", background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, fontSize:12, color:"#7a4f00" }}>
            <Icon name="lock" size={13} color="#7a4f00" style={{ marginRight:4 }} />
            Superintendent access only
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1 }}>
          {view==="county"   && <CountyInfo    db={db} dispatch={dispatch} />}
          {view==="fiscal"   && <FiscalYearWizard db={db} dispatch={dispatch} />}
          {view==="accounts" && <AccountCodes  db={db} dispatch={dispatch} />}
          {view==="system"   && <SystemSettings db={db} dispatch={dispatch} />}
        </div>
      </div>
    </div>
  );
}

// ── County Info ───────────────────────────────────────────────────────────────
function CountyInfo({ db, dispatch }) {
  const info = db.countyInfo || {};
  const [form, setForm] = useState({
    countyName:       info.countyName       || "",
    deptName:         info.deptName         || "County Highway Department",
    address:          info.address          || "",
    city:             info.city             || "",
    state:            info.state            || "NE",
    zip:              info.zip              || "",
    phone:            info.phone            || "",
    fax:              info.fax              || "",
    email:            info.email            || "",
    superintendentName:  info.superintendentName  || "",
    superintendentTitle: info.superintendentTitle || "Highway Superintendent",
    officeManagerName:   info.officeManagerName   || "",
    officeManagerTitle:  info.officeManagerTitle  || "Office Manager",
    fundName:         info.fundName         || "Roads Fund",
    // The Clerk's claim form holds a fixed number of invoice lines for one
    // vendor. Counties differ, so it's a setting rather than a constant.
    invoicesPerClaim: info.invoicesPerClaim ?? DEFAULT_INVOICES_PER_CLAIM,
  });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = () => {
    dispatch({ type:"UPDATE_COUNTY_INFO", payload:{
      ...form,
      invoicesPerClaim: Math.max(1, Number(form.invoicesPerClaim) || DEFAULT_INVOICES_PER_CLAIM),
    }});
    setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="building" size={18} color="#1a3a5c" />
          County & Department Information
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Used on claim sheets, reports, and export headers</div>
      </div>

      {saved && <AlertBar message="County information saved successfully" type="success" />}

      {/* County & Department */}
      <SectionCard title="County & Department" icon="building">
        <div style={{ padding:"18px 22px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="County Name" required>
              <input type="text" placeholder="County name…" value={form.countyName} onChange={e=>set("countyName",e.target.value)} style={inp} />
            </Field>
            <Field label="Department Name">
              <input type="text" value={form.deptName} onChange={e=>set("deptName",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ marginBottom:16 }}>
            <Field label="Street Address">
              <input type="text" placeholder="123 Main Street" value={form.address} onChange={e=>set("address",e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="City"><input type="text" value={form.city} onChange={e=>set("city",e.target.value)} style={inp} /></Field>
            <Field label="State"><input type="text" value={form.state} onChange={e=>set("state",e.target.value)} style={inp} /></Field>
            <Field label="ZIP"><input type="text" value={form.zip} onChange={e=>set("zip",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
            <Field label="Phone"><input type="text" placeholder="(402) 555-0100" value={form.phone} onChange={e=>set("phone",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            <Field label="Fax"><input type="text" value={form.fax} onChange={e=>set("fax",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={e=>set("email",e.target.value)} style={inp} /></Field>
          </div>
        </div>
      </SectionCard>

      {/* Personnel */}
      <SectionCard title="Personnel" icon="users" subtitle="Names appear on claim sheets and reports">
        <div style={{ padding:"18px 22px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:16 }}>
            <div style={{ background:"#f7f7f5", borderRadius:8, padding:16, borderLeft:"3px solid #1a3a5c" }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#1a3a5c", marginBottom:12 }}>
                <Icon name="shield" size={12} color="#1a3a5c" style={{ marginRight:4 }} />
                Superintendent
              </div>
              <div style={{ display:"grid", gap:12 }}>
                <Field label="Full Name">
                  <input type="text" placeholder="Full name…" value={form.superintendentName} onChange={e=>set("superintendentName",e.target.value)} style={inp} />
                </Field>
                <Field label="Title">
                  <input type="text" value={form.superintendentTitle} onChange={e=>set("superintendentTitle",e.target.value)} style={inp} />
                </Field>
              </div>
            </div>
            <div style={{ background:"#f7f7f5", borderRadius:8, padding:16, borderLeft:"3px solid #1a6b35" }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#1a6b35", marginBottom:12 }}>
                <Icon name="user" size={12} color="#1a6b35" style={{ marginRight:4 }} />
                Office Manager
              </div>
              <div style={{ display:"grid", gap:12 }}>
                <Field label="Full Name">
                  <input type="text" value={form.officeManagerName} onChange={e=>set("officeManagerName",e.target.value)} style={inp} />
                </Field>
                <Field label="Title">
                  <input type="text" value={form.officeManagerTitle} onChange={e=>set("officeManagerTitle",e.target.value)} style={inp} />
                </Field>
              </div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="Primary Fund Name">
              <input type="text" value={form.fundName} onChange={e=>set("fundName",e.target.value)} style={inp} />
            </Field>
            <Field label="Invoices Per Claim">
              <input type="number" min="1" value={form.invoicesPerClaim}
                onChange={e=>set("invoicesPerClaim", e.target.value)} style={inp} />
              <div style={{ fontSize:11, color:"#888", marginTop:4, lineHeight:1.5 }}>
                The most invoices the Clerk's claim form will hold for one vendor. A vendor with more
                than this is split across additional claim sheets.
              </div>
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Preview */}
      {form.countyName && (
        <SectionCard title="Claim Sheet Header Preview" icon="eye" subtitle="How this appears on exported claim sheets">
          <div style={{ padding:"18px 22px", fontFamily:"Arial, sans-serif", fontSize:12 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{form.fundName?.toUpperCase()} — CLAIM FOR PAYMENT</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, border:"1px solid #ccc", padding:12, marginBottom:8 }}>
              <div>
                <div><strong>{form.countyName}</strong></div>
                <div>{form.deptName}</div>
                <div>{form.address}</div>
                <div>{form.city}, {form.state} {form.zip}</div>
                <div>{form.phone}</div>
              </div>
              <div>
                <div><strong>Superintendent:</strong> {form.superintendentName}</div>
                <div><strong>Office Manager:</strong> {form.officeManagerName}</div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <button onClick={handleSave} style={{ ...btn.primary }}>
        <Icon name="device-floppy" size={15} color="#fff" />
        Save County Information
      </button>
    </div>
  );
}

// ── Fiscal Year Wizard ────────────────────────────────────────────────────────
function FiscalYearWizard({ db, dispatch }) {
  const [step, setStep]         = useState(0);
  const [method, setMethod]     = useState("copy");
  const [fyForm, setFyForm]     = useState({
    label:  "",
    start:  "",
    end:    "",
    claimRule: "1st and 3rd Tuesday",
  });
  const [budgetLines, setBudgetLines] = useState([]);
  const [complete, setComplete]       = useState(false);
  const setFy = (k,v) => setFyForm(f=>({...f,[k]:v}));

  const currentFY = db.fiscalYear || FISCAL_YEAR;
  const steps = ["Confirm Dates","Budget Method","Review Budget","Activate"];

  // Step 1 — init new FY dates
  const initNewFY = () => {
    const currentStart = new Date(currentFY.start);
    const newStart = new Date(currentStart);
    newStart.setFullYear(newStart.getFullYear() + 1);
    const newEnd = new Date(newStart);
    newEnd.setFullYear(newEnd.getFullYear() + 1);
    newEnd.setDate(newEnd.getDate() - 1);
    const startStr = newStart.toISOString().split("T")[0];
    const endStr   = newEnd.toISOString().split("T")[0];
    const startYear = newStart.getFullYear();
    const endYear   = newEnd.getFullYear();
    setFyForm({ label:`FY${endYear}`, start:startStr, end:endStr, claimRule:"1st and 3rd Tuesday" });
  };

  // Step 2 — build budget lines based on method
  const buildBudgetLines = () => {
    const codes = EXPENDITURE_CODES.map(c => ({
      code:        c.code,
      description: c.description,
      category:    c.category,
      lastYear:    c.budgeted,
      newYear:     method==="copy" ? c.budgeted : method==="fresh" ? 0 : c.budgeted,
      active:      true,
    }));
    setBudgetLines(codes);
  };

  const updateLine = (code, field, value) => {
    setBudgetLines(lines => lines.map(l => l.code===code ? { ...l, [field]:field==="newYear"?parseFloat(value)||0:value } : l));
  };

  const totalNew  = budgetLines.reduce((s,l)=>s+(l.active?l.newYear:0),0);
  const totalLast = budgetLines.reduce((s,l)=>s+l.lastYear,0);

  const handleActivate = () => {
    dispatch({ type:"SET_FISCAL_YEAR", payload:{ ...fyForm, budgetLines } });
    setComplete(true);
  };

  if (complete) {
    return (
      <div style={{ textAlign:"center", padding:"60px 40px" }}>
        <div style={{ width:80, height:80, background:"#e6f4ec", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
          <Icon name="circle-check" size={44} color="#1a6b35" />
        </div>
        <div style={{ fontSize:22, fontWeight:700, color:"#1a6b35", marginBottom:8 }}>{fyForm.label} is now active!</div>
        <div style={{ fontSize:14, color:"#888", marginBottom:24 }}>
          {fyForm.start} through {fyForm.end} · {budgetLines.filter(l=>l.active).length} account codes · {fmt(totalNew)} total appropriation
        </div>
        <button onClick={()=>{ setStep(0); setComplete(false); }} style={{ ...btn.ghost }}>
          Set Up Another Fiscal Year
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="calendar-event" size={18} color="#1a3a5c" />
          New Fiscal Year Setup
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Current: {currentFY.label} ({currentFY.start} – {currentFY.end})</div>
      </div>

      {/* Step indicator */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:28 }}>
        {steps.map((s,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", flex:i<steps.length-1?1:"auto" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13,
                background: i<step?"#1a6b35":i===step?"#1a3a5c":"#e0e0e0",
                color: i<=step?"#fff":"#888",
              }}>
                {i<step ? <Icon name="check" size={16} color="#fff" /> : i+1}
              </div>
              <div style={{ fontSize:11, marginTop:4, color:i===step?"#1a3a5c":i<step?"#1a6b35":"#aaa", fontWeight:i===step?700:400, whiteSpace:"nowrap" }}>{s}</div>
            </div>
            {i<steps.length-1 && <div style={{ flex:1, height:2, background:i<step?"#1a6b35":"#e0e0e0", margin:"0 8px", marginBottom:18 }} />}
          </div>
        ))}
      </div>

      {/* Step 0 — Confirm dates */}
      {step===0 && (
        <SectionCard title="Step 1 — Confirm Fiscal Year Dates" icon="calendar-event">
          <div style={{ padding:"18px 22px" }}>
            <div style={{ background:"#e8f0fb", borderRadius:8, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#1a4a8a" }}>
              <Icon name="info-circle" size={14} color="#1a4a8a" style={{ marginRight:6 }} />
              Nebraska county fiscal year runs July 1 through June 30. The new year will be pre-filled below — confirm or adjust.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:20 }}>
              <Field label="FY Label">
                <input type="text" placeholder="e.g. FY2028" value={fyForm.label} onChange={e=>setFy("label",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Start Date">
                <DateField value={fyForm.start} onChange={v => setFy("start", v)} />
              </Field>
              <Field label="End Date">
                <DateField value={fyForm.end} onChange={v => setFy("end", v)} />
              </Field>
              <Field label="Claim Cycle Rule">
                <input type="text" value={fyForm.claimRule} readOnly style={{ ...inp, background:"#f7f7f5", color:"#888" }} />
              </Field>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ initNewFY(); }} style={{ ...btn.ghost, fontSize:12 }}>
                <Icon name="refresh" size={13} color="#666" />
                Auto-fill next FY
              </button>
              <button onClick={()=>setStep(1)} disabled={!fyForm.label||!fyForm.start||!fyForm.end} style={{ ...btn.primary, opacity:(!fyForm.label||!fyForm.start||!fyForm.end)?0.4:1 }}>
                Next — Budget Method
                <Icon name="arrow-right" size={14} color="#fff" />
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 1 — Budget method */}
      {step===1 && (
        <SectionCard title="Step 2 — Budget Method" icon="coin">
          <div style={{ padding:"18px 22px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
              {[
                { value:"copy",   icon:"copy",         label:"Copy Last Year",     desc:`Start with FY${currentFY.label} amounts and adjust` },
                { value:"fresh",  icon:"file-plus",    label:"Start Fresh",        desc:"Enter all new amounts from scratch" },
                { value:"import", icon:"file-upload",  label:"Import from CSV",    desc:"Upload a budget spreadsheet" },
              ].map(m=>(
                <button key={m.value} onClick={()=>setMethod(m.value)} style={{
                  background: method===m.value?"#1a3a5c":"#fff",
                  color:      method===m.value?"#fff":"#333",
                  border:`1px solid ${method===m.value?"#1a3a5c":"#ddd"}`,
                  borderRadius:8, padding:18, cursor:"pointer", textAlign:"left",
                  borderTop:`3px solid ${method===m.value?"#7ab8e8":"#ddd"}`,
                }}>
                  <Icon name={m.icon} size={22} color={method===m.value?"#fff":"#1a3a5c"} style={{ marginBottom:8, display:"block" }} />
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{m.label}</div>
                  <div style={{ fontSize:12, opacity:0.8 }}>{m.desc}</div>
                </button>
              ))}
            </div>
            {method==="import" && (
              <AlertBar message="CSV import will be available in the Reporting module. For now, use Copy Last Year and adjust amounts." type="info" />
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setStep(0)} style={btn.ghost}><Icon name="arrow-left" size={13} color="#666" /> Back</button>
              <button onClick={()=>{ buildBudgetLines(); setStep(2); }} disabled={method==="import"} style={{ ...btn.primary, opacity:method==="import"?0.4:1 }}>
                Next — Review Budget <Icon name="arrow-right" size={14} color="#fff" />
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 2 — Review budget */}
      {step===2 && (
        <div>
          <SectionCard title="Step 3 — Review & Adjust Budget" icon="edit" subtitle={`${budgetLines.filter(l=>l.active).length} active codes · Total: ${fmt(totalNew)}`}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#f7f7f5" }}>
              <div style={{ fontSize:13, color:"#555" }}>
                Last year total: <strong>{fmt(totalLast)}</strong> →
                New year total: <strong style={{ color:totalNew>totalLast?"#1a6b35":totalNew<totalLast?"#c0392b":"#1a1a1a" }}>{fmt(totalNew)}</strong>
                <span style={{ marginLeft:8, fontSize:12, color:totalNew>totalLast?"#1a6b35":"#c0392b" }}>
                  ({totalNew>=totalLast?"+":""}{fmt(totalNew-totalLast)})
                </span>
              </div>
              <div style={{ fontSize:12, color:"#888" }}>Edit amounts in the New Year column</div>
            </div>
            <div style={{ maxHeight:420, overflowY:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead style={{ position:"sticky", top:0, background:"#f7f7f5", zIndex:1 }}>
                  <tr>
                    {["Active","Code","Description","Category","Last Year","New Year"].map((h,i)=>(
                      <th key={i} style={{ padding:"9px 14px", textAlign:i>=4?"right":"left", fontWeight:600, fontSize:11, color:"#666", borderBottom:"1px solid #eee", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {budgetLines.map((l,i)=>(
                    <tr key={l.code} style={{ borderTop:"1px solid #eee", background:l.active?(i%2===0?"#fff":"#fafaf8"):"#f5f5f5", opacity:l.active?1:0.5 }}>
                      <td style={{ padding:"8px 14px" }}>
                        <input type="checkbox" checked={l.active} onChange={e=>updateLine(l.code,"active",e.target.checked)} style={{ width:14,height:14 }} />
                      </td>
                      <td style={{ padding:"8px 14px", fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{l.code}</td>
                      <td style={{ padding:"8px 14px", color:"#555" }}>{l.description}</td>
                      <td style={{ padding:"8px 14px" }}>
                        <span style={{ fontSize:11, background:"#f0f0ee", padding:"1px 6px", borderRadius:3, textTransform:"capitalize" }}>{l.category}</span>
                      </td>
                      <td style={{ padding:"8px 14px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{l.lastYear>0?fmt(l.lastYear):"—"}</td>
                      <td style={{ padding:"8px 14px", textAlign:"right" }}>
                        <input
                          type="number" min="0" step="1"
                          value={l.newYear||""}
                          onChange={e=>updateLine(l.code,"newYear",e.target.value)}
                          style={{ ...inp, width:120, textAlign:"right", fontFamily:"monospace", padding:"5px 8px", margin:0, background:l.active?"#fff":"#f5f5f5" }}
                          disabled={!l.active}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setStep(1)} style={btn.ghost}><Icon name="arrow-left" size={13} color="#666" /> Back</button>
            <button onClick={()=>setStep(3)} style={btn.primary}>
              Next — Activate <Icon name="arrow-right" size={14} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Activate */}
      {step===3 && (
        <SectionCard title="Step 4 — Activate New Fiscal Year" icon="player-play">
          <div style={{ padding:"22px" }}>
            <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:"14px 18px", marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#7a4f00", marginBottom:8 }}>
                <Icon name="alert-triangle" size={15} color="#7a4f00" style={{ marginRight:6 }} />
                Review before activating
              </div>
              <div style={{ fontSize:13, color:"#7a4f00" }}>
                Activating {fyForm.label} will switch Pinpoint to the new fiscal year. Existing transactions from {currentFY.label} will be archived and remain viewable in the Ledger.
              </div>
            </div>

            {/* Summary */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
              {[
                { label:"Fiscal Year",       value:fyForm.label,                                  icon:"calendar-event", color:"#1a3a5c" },
                { label:"Start Date",         value:fyForm.start,                                  icon:"calendar",       color:"#1a6b35" },
                { label:"End Date",           value:fyForm.end,                                    icon:"calendar",       color:"#6b3a1a" },
                { label:"Total Appropriation",value:fmt(totalNew),                                 icon:"coin",           color:"#5a1a8a" },
                { label:"Active Codes",       value:budgetLines.filter(l=>l.active).length,        icon:"receipt",        color:"#1a3a5c" },
                { label:"Claim Cycle",        value:fyForm.claimRule,                              icon:"calendar-due",   color:"#888" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"#f7f7f5", borderRadius:8, padding:"12px 14px", borderTop:`3px solid ${k.color}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>{k.label}</div>
                    <Icon name={k.icon} size={14} color={k.color} style={{ opacity:0.4 }} />
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, color:k.color, fontFamily:"monospace" }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setStep(2)} style={btn.ghost}><Icon name="arrow-left" size={13} color="#666" /> Back</button>
              <button onClick={handleActivate} style={{ ...btn.primary, background:"#1a6b35" }}>
                <Icon name="circle-check" size={15} color="#fff" />
                Activate {fyForm.label}
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Account Codes ─────────────────────────────────────────────────────────────
function AccountCodes({ db, dispatch }) {
  const [tab,    setTab]    = useState("expenditure");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  const customCodes = db.customAccountCodes || {};
  const getCodes = (type) => {
    const base = type==="expenditure" ? EXPENDITURE_CODES : REVENUE_CODES;
    return base.map(c => ({ ...c, ...(customCodes[c.code]||{}) }));
  };

  const expCodes = getCodes("expenditure");
  const revCodes = getCodes("revenue");
  const codes    = tab==="expenditure" ? expCodes : revCodes;
  const filtered = codes.filter(c => !search || `${c.code} ${c.description}`.toLowerCase().includes(search.toLowerCase()));

  const startEdit = (code) => {
    setEditing(code.code);
    setEditForm({ description:code.description, budgeted:code.budgeted||0, active:code.active!==false });
  };

  const saveEdit = () => {
    dispatch({ type:"UPDATE_ACCOUNT_CODE", payload:{ code:editing, ...editForm, budgeted:parseFloat(editForm.budgeted)||0 } });
    setEditing(null);
  };

  const totalBudget = expCodes.filter(c=>c.active!==false).reduce((s,c)=>s+(c.budgeted||0),0);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="receipt" size={18} color="#1a3a5c" />
          Account Codes
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          Edit descriptions and budgeted amounts · Total appropriation: {fmt(totalBudget)}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
          {["expenditure","revenue"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:"8px 18px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:tab===t?"#1a3a5c":"#fff", color:tab===t?"#fff":"#555", textTransform:"capitalize" }}>
              {t} Codes ({t==="expenditure"?expCodes.length:revCodes.length})
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search codes…" style={{ ...inp, width:200, margin:0 }} />
      </div>

      <SectionCard title={`${tab==="expenditure"?"Expenditure":"Revenue"} Account Codes (${filtered.length})`} icon="receipt">
        <div style={{ maxHeight:520, overflowY:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead style={{ position:"sticky", top:0, background:"#f7f7f5", zIndex:1 }}>
              <tr>
                {["Code","Description","Category","Budget / Amount","Active",""].map((h,i)=>(
                  <th key={i} style={{ padding:"9px 14px", textAlign:i===3?"right":"left", fontWeight:600, fontSize:11, color:"#666", borderBottom:"1px solid #eee", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>(
                <tr key={c.code} style={{ borderTop:"1px solid #eee", background:c.active===false?"#fafaf8":i%2===0?"#fff":"#fafaf8", opacity:c.active===false?0.5:1 }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{c.code}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {editing===c.code ? (
                      <input value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} style={{ ...inp, margin:0, padding:"4px 8px" }} />
                    ) : c.description}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:11, background:"#f0f0ee", padding:"1px 6px", borderRadius:3, textTransform:"capitalize" }}>{c.category||c.type}</span>
                  </td>
                  <td style={{ padding:"10px 14px", textAlign:"right" }}>
                    {editing===c.code ? (
                      <input type="number" value={editForm.budgeted} onChange={e=>setEditForm(f=>({...f,budgeted:e.target.value}))} style={{ ...inp, margin:0, padding:"4px 8px", width:120, textAlign:"right", fontFamily:"monospace" }} />
                    ) : <span style={{ fontFamily:"monospace" }}>{c.budgeted>0?fmt(c.budgeted):"—"}</span>}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {editing===c.code ? (
                      <input type="checkbox" checked={editForm.active} onChange={e=>setEditForm(f=>({...f,active:e.target.checked}))} style={{ width:14,height:14 }} />
                    ) : (
                      <span style={{ fontSize:11, background:c.active===false?"#fdecea":"#e6f4ec", color:c.active===false?"#c0392b":"#1a6b35", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>
                        {c.active===false?"Inactive":"Active"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {editing===c.code ? (
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={saveEdit} style={{ ...btn.small, background:"#1a6b35", fontSize:10, padding:"4px 10px" }}>Save</button>
                        <button onClick={()=>setEditing(null)} style={{ ...btn.small, background:"#888", fontSize:10, padding:"4px 8px" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={()=>startEdit(c)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>
                        <Icon name="edit" size={11} color="#fff" /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── System Settings ───────────────────────────────────────────────────────────
function SystemSettings({ db, dispatch }) {
  const [activeSection, setActiveSection] = useState("lists");
  const [newTownship, setNewTownship]     = useState("");
  const [newFund, setNewFund]             = useState("");
  const [newLocation, setNewLocation]     = useState("");

  const townships    = db.townships    || DEFAULT_TOWNSHIPS;
  const customFunds  = db.customFunds  || [];
  const locations    = db.storageLocations || [];
  const tanks        = db.tanks || [];

  const sections = [
    { id:"lists",     label:"Dropdown Lists",   icon:"list" },
    { id:"townships", label:"Townships",        icon:"map-pin" },
    { id:"locations", label:"Storage Locations", icon:"building-warehouse" },
    { id:"tanks",     label:"Fuel Tanks",        icon:"gas-station" },
    { id:"funds",     label:"Custom Funds",     icon:"coin" },
    { id:"fema",      label:"FEMA Rates",       icon:"alert-octagon" },
  ];

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="adjustments-horizontal" size={18} color="#1a3a5c" />
          System Settings
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Dropdown lists, townships, inventory locations, funds, and FEMA rates</div>
      </div>

      {/* Section selector */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{ padding:"8px 14px", fontSize:12, fontWeight:600, border:"1px solid", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6,
            background: activeSection===s.id?"#1a3a5c":"#fff",
            color:      activeSection===s.id?"#fff":"#444",
            borderColor:activeSection===s.id?"#1a3a5c":"#ccc",
          }}>
            <Icon name={s.icon} size={13} color={activeSection===s.id?"#fff":"#888"} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Townships */}
      {activeSection==="lists" && <LookupLists db={db} dispatch={dispatch} />}

      {activeSection==="townships" && (
        <ListEditor
          title="Townships"
          subtitle="Reference only — used on structures and scale tickets"
          icon="map-pin"
          items={townships}
          placeholder="Add township name…"
          onAdd={name => dispatch({ type:"ADD_TOWNSHIP", payload: createTownship({ name }) })}
          onRename={(item,name) => dispatch({ type:"UPDATE_TOWNSHIP", payload:{ ...item, name } })}
          onRemove={item => dispatch({ type:"REMOVE_TOWNSHIP", payload:item.id })}
        />
      )}


      {activeSection==="locations" && (
        <ListEditor
          title="Storage Locations"
          subtitle="Sheds hold stock. Stockpiles fill from scale tickets; portable tanks from the tank workflow."
          icon="building-warehouse"
          items={locations}
          placeholder="Add location name…"
          typeOptions={[["shed","Shed"],["stockpile","Stockpile"],["portable_tank","Portable Tank"]]}
          onAdd={(name,type) => dispatch({ type:"ADD_STORAGE_LOCATION", payload: createStorageLocation({ name, type: type||"shed" }) })}
          onRename={(item,name) => dispatch({ type:"UPDATE_STORAGE_LOCATION", payload:{ ...item, name } })}
          onRetype={(item,type) => dispatch({ type:"UPDATE_STORAGE_LOCATION", payload:{ ...item, type } })}
          onRemove={item => dispatch({ type:"REMOVE_STORAGE_LOCATION", payload:item.id })}
        />
      )}

      {activeSection==="tanks" && (
        <TankSettings tanks={tanks} dispatch={dispatch} />
      )}


      {/* Custom Funds */}
      {activeSection==="funds" && (
        <SectionCard title="Custom Funds" subtitle={`Roads Fund is always available · ${customFunds.length} custom added`} icon="coin">
          <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"8px 14px", background:"#e8f0fb", borderRadius:6, marginBottom:12, fontSize:13, color:"#1a4a8a", display:"flex", alignItems:"center", gap:8 }}>
              <Icon name="circle-check" size={14} color="#1a4a8a" />
              Roads Fund — Default (always available, cannot be removed)
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <input type="text" placeholder="e.g. NDOT Enhancement Grant 2028, RAISE Grant…" value={newFund} onChange={e=>setNewFund(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&newFund.trim()){ dispatch({type:"ADD_CUSTOM_FUND",payload:newFund.trim()}); setNewFund(""); } }} style={{ ...inp, flex:1 }} />
              <button onClick={()=>{ if(newFund.trim()){ dispatch({type:"ADD_CUSTOM_FUND",payload:newFund.trim()}); setNewFund(""); } }} style={{ ...btn.primary }}>
                <Icon name="plus" size={14} color="#fff" /> Add
              </button>
            </div>
          </div>
          {customFunds.length===0 ? (
            <div style={{ padding:"24px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>No custom funds added yet</div>
          ) : (
            <div style={{ padding:"8px 18px" }}>
              {customFunds.map((f,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f0f0ee" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                    <Icon name="coin" size={13} color="#5a1a8a" />
                    {f}
                  </div>
                  <button onClick={()=>dispatch({type:"REMOVE_CUSTOM_FUND",payload:f})} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 8px" }}>
                    <Icon name="trash" size={11} color="#fff" /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* FEMA Rates */}
      {activeSection==="fema" && (
        <SectionCard title="FEMA Schedule of Equipment Rates" subtitle="Update when FEMA publishes new annual rates" icon="alert-octagon">
          <div style={{ padding:"14px 18px", background:"#fef3cd", borderBottom:"1px solid #f0d080" }}>
            <div style={{ fontSize:13, color:"#7a4f00" }}>
              <Icon name="info-circle" size={14} color="#7a4f00" style={{ marginRight:6 }} />
              FEMA publishes updated rates annually. Current rates are from the schedule built into Pinpoint. Update here when new rates are released.
            </div>
          </div>
          <div style={{ maxHeight:400, overflowY:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead style={{ position:"sticky", top:0, background:"#f7f7f5" }}>
                <tr>
                  {["Equipment Type","Size / Class","Rate ($/hr)"].map((h,i)=>(
                    <th key={i} style={{ padding:"9px 14px", textAlign:i===2?"right":"left", fontWeight:600, fontSize:11, color:"#666", borderBottom:"1px solid #eee", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(db.femaRates||[]).map((r,i)=>(
                  <tr key={i} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                    <td style={{ padding:"9px 14px", fontWeight:600 }}>{r.type}</td>
                    <td style={{ padding:"9px 14px", color:"#888" }}>{r.size}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#c0392b" }}>{fmtSm(r.rate)}/hr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:"14px 18px", borderTop:"1px solid #eee" }}>
            <button onClick={()=>alert("FEMA rate import coming in Reporting module — will allow uploading the new FEMA schedule CSV")} style={{ ...btn.ghost, fontSize:12 }}>
              <Icon name="file-upload" size={14} color="#666" />
              Import New FEMA Rate Schedule
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Dropdown Lists ────────────────────────────────────────────────────────────
// Every list that used to be hardcoded in a module lives here now, so it can be
// corrected without a code change — renaming "2Nd Floor" to "2nd Floor", adding a
// new culvert type, retiring an equipment category.
function LookupLists({ db, dispatch }) {
  const [openKey, setOpenKey] = useState(LOOKUP_DEFS[0]?.key || null);
  const [draft, setDraft]     = useState({});
  const [editing, setEditing] = useState(null);   // { key, value }
  const [editText, setEditText] = useState("");

  const lookups = db.lookups || {};

  const byModule = LOOKUP_DEFS.reduce((acc, d) => {
    (acc[d.module] = acc[d.module] || []).push(d);
    return acc;
  }, {});

  const addValue = (key) => {
    const v = (draft[key] || "").trim();
    if (!v) return;
    dispatch({ type:"ADD_LOOKUP_VALUE", payload:{ key, value:v } });
    setDraft(d => ({ ...d, [key]: "" }));
  };

  const commitRename = () => {
    if (!editing) return;
    const nv = editText.trim();
    if (nv && nv !== editing.value) {
      dispatch({ type:"RENAME_LOOKUP_VALUE", payload:{ key:editing.key, oldValue:editing.value, newValue:nv } });
    }
    setEditing(null); setEditText("");
  };

  return (
    <div>
      <AlertBar tone="info">
        These lists feed the dropdowns throughout the app. Changing one here changes it
        everywhere — no code change needed. Records already saved keep the old wording
        until they're edited.
      </AlertBar>

      {Object.entries(byModule).map(([module, defs]) => (
        <div key={module} style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#888", margin:"14px 0 8px" }}>
            {module}
          </div>

          {defs.map(def => {
            const values = lookups[def.key] || [];
            const isOpen = openKey === def.key;
            return (
              <div key={def.key} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, marginBottom:8, overflow:"hidden" }}>
                <button
                  onClick={()=>setOpenKey(isOpen ? null : def.key)}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"11px 15px", background:isOpen?"#f7f7f5":"#fff", border:"none", cursor:"pointer", textAlign:"left" }}
                >
                  <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Icon name={isOpen?"chevron-down":"chevron-right"} size={13} color="#888" />
                    <span style={{ fontSize:13, fontWeight:600 }}>{def.label}</span>
                    {def.hint && <span style={{ fontSize:11, color:"#aaa" }}>· {def.hint}</span>}
                  </span>
                  <span style={{ fontSize:11, color:"#888", fontFamily:"monospace" }}>{values.length}</span>
                </button>

                {isOpen && (
                  <div style={{ padding:"4px 15px 15px" }}>
                    {values.length === 0 && (
                      <div style={{ padding:"12px 0", color:"#aaa", fontSize:12 }}>Empty — add the first value below.</div>
                    )}

                    {values.map((v, i) => (
                      <div key={v} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid #f4f4f2" }}>
                        <span style={{ width:22, fontSize:11, color:"#bbb", fontFamily:"monospace" }}>{i+1}</span>

                        {editing && editing.key === def.key && editing.value === v ? (
                          <>
                            <input
                              autoFocus value={editText}
                              onChange={e=>setEditText(e.target.value)}
                              onKeyDown={e=>{ if(e.key==="Enter") commitRename(); if(e.key==="Escape"){ setEditing(null); setEditText(""); } }}
                              style={{ ...inp, margin:0, flex:1, fontSize:13 }}
                            />
                            <button onClick={commitRename} style={{ ...btn.small, background:"#1a5a3a", fontSize:10, padding:"4px 10px" }}>Save</button>
                            <button onClick={()=>{ setEditing(null); setEditText(""); }} style={{ ...btn.small, background:"#aaa", fontSize:10, padding:"4px 10px" }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex:1, fontSize:13 }}>{v}</span>
                            <button onClick={()=>dispatch({ type:"REORDER_LOOKUP_VALUE", payload:{ key:def.key, value:v, direction:"up" } })}
                              disabled={i===0}
                              style={{ background:"none", border:"none", cursor:i===0?"default":"pointer", opacity:i===0?0.25:1, padding:"2px 5px", fontSize:11, color:"#888" }}>▲</button>
                            <button onClick={()=>dispatch({ type:"REORDER_LOOKUP_VALUE", payload:{ key:def.key, value:v, direction:"down" } })}
                              disabled={i===values.length-1}
                              style={{ background:"none", border:"none", cursor:i===values.length-1?"default":"pointer", opacity:i===values.length-1?0.25:1, padding:"2px 5px", fontSize:11, color:"#888" }}>▼</button>
                            <button onClick={()=>{ setEditing({ key:def.key, value:v }); setEditText(v); }}
                              style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Rename</button>
                            <button onClick={()=>{ if(window.confirm(`Remove "${v}" from ${def.label}?\n\nRecords already using it keep the value — it just won't be offered on new entries.`)) dispatch({ type:"DELETE_LOOKUP_VALUE", payload:{ key:def.key, value:v } }); }}
                              style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"4px 10px" }}>Remove</button>
                          </>
                        )}
                      </div>
                    ))}

                    <div style={{ display:"flex", gap:8, marginTop:12 }}>
                      <input
                        value={draft[def.key] || ""}
                        onChange={e=>setDraft(d=>({ ...d, [def.key]: e.target.value }))}
                        onKeyDown={e=>{ if(e.key==="Enter") addValue(def.key); }}
                        placeholder={`Add to ${def.label}…`}
                        style={{ ...inp, margin:0, flex:1, fontSize:13 }}
                      />
                      <button onClick={()=>addValue(def.key)} style={{ ...btn.primary, fontSize:12, padding:"7px 16px" }}>Add</button>
                      <button
                        onClick={()=>{ if(window.confirm(`Reset ${def.label} to its original values?\n\nAnything you've added will be lost.`)) dispatch({ type:"RESET_LOOKUP", payload:{ key:def.key, values:def.values } }); }}
                        style={{ ...btn.ghost, fontSize:12, padding:"7px 14px" }}
                      >Reset</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Generic list editor ───────────────────────────────────────────────────────
// Townships and storage locations are lists of objects, not strings. Editing one
// used to appear to do nothing, because Settings pushed raw strings into an
// object array and edited a `locations` alias no module ever read.
function ListEditor({ title, subtitle, icon, items, placeholder, typeOptions, onAdd, onRename, onRetype, onRemove }) {
  const [draft, setDraft]     = useState("");
  const [draftType, setDraftType] = useState(typeOptions?.[0]?.[0] || "");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v, draftType);
    setDraft("");
  };
  const commit = () => {
    const v = editText.trim();
    if (v && editing) onRename(editing, v);
    setEditing(null); setEditText("");
  };

  return (
    <SectionCard title={title} subtitle={subtitle || `${items.length} configured`} icon={icon}>
      <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
        <div style={{ display:"flex", gap:10 }}>
          <input
            type="text" value={draft} placeholder={placeholder}
            onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") add(); }}
            style={{ ...inp, flex:1, margin:0 }}
          />
          {typeOptions && (
            <select value={draftType} onChange={e=>setDraftType(e.target.value)} style={{ ...inp, margin:0, width:150 }}>
              {typeOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <button onClick={add} style={btn.primary}>
            <Icon name="plus" size={14} color="#fff" /> Add
          </button>
        </div>
      </div>

      <div style={{ padding:"8px 18px" }}>
        {items.length === 0 && (
          <div style={{ padding:"18px 0", textAlign:"center", color:"#aaa", fontSize:13 }}>
            None yet — add the first above.
          </div>
        )}
        {items.map((item)=>(
          <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid #f0f0ee", gap:10 }}>
            {editing?.id === item.id ? (
              <>
                <input
                  autoFocus value={editText}
                  onChange={e=>setEditText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape"){ setEditing(null); setEditText(""); } }}
                  style={{ ...inp, margin:0, flex:1 }}
                />
                <button onClick={commit} style={{ ...btn.small, background:"#1a5a3a", fontSize:10, padding:"4px 10px" }}>Save</button>
                <button onClick={()=>{setEditing(null); setEditText("");}} style={{ ...btn.small, background:"#aaa", fontSize:10, padding:"4px 10px" }}>Cancel</button>
              </>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                  <Icon name={icon} size={15} color="#1a3a5c" />
                  <span style={{ fontSize:13, fontWeight:600 }}>{item.name}</span>
                  {typeOptions && onRetype && (
                    <select
                      value={item.type} onChange={e=>onRetype(item, e.target.value)}
                      style={{ ...inp, margin:0, width:140, fontSize:11, padding:"3px 6px" }}
                    >
                      {typeOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                </div>
                <button onClick={()=>{ setEditing(item); setEditText(item.name); }} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Rename</button>
                <button
                  onClick={()=>{ if(window.confirm(`Remove "${item.name}"?\n\nRecords already using it keep the value — it just won't be offered on new entries.`)) onRemove(item); }}
                  style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"4px 10px" }}
                >Remove</button>
              </>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Fuel tanks ────────────────────────────────────────────────────────────────
// ── Fuel tanks ────────────────────────────────────────────────────────────────
//
// Tank setup lives here and only here. The Fuel module records what HAPPENS to
// a tank — deliveries, transfers, readings, dispensing. What a tank IS gets
// configured once, in settings, by someone who knows the site.
//
// The underground flag is the consequential one. Underground tanks are
// regulated: Nebraska requires a daily product inventory record for each, and
// the Fire Marshal inspects annually. Ticking this box is what puts a tank on
// the Daily Inventory screen, so it should say what is true of the ground, not
// what would be convenient.
function TankSettings({ tanks, dispatch }) {
  const BLANK = {
    name:"", location:"", fuelType:"diesel", tankType:"above_ground",
    capacityGallons:"", hasMonitor:false, filledByContractor:false, carriedByUnit:"",
    isUnderground:false, facilityId:"", tankRegistrationId:"", installedDate:"",
    status:"active", notes:"",
  };
  const [editing, setEditing] = useState(null);   // tank id, or "new", or null
  const [form, setForm] = useState(BLANK);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const startNew  = () => { setForm(BLANK); setEditing("new"); };
  const startEdit = (t) => {
    setForm({ ...BLANK, ...t, capacityGallons: String(t.capacityGallons ?? "") });
    setEditing(t.id);
  };
  const cancel = () => { setEditing(null); setForm(BLANK); };

  const save = () => {
    if (!form.name) return;
    const payload = {
      ...form,
      capacityGallons: parseFloat(form.capacityGallons) || 0,
      // A tank cannot be underground and portable at once, and the type is what
      // people actually read on screen — keep the two in step rather than
      // letting them drift apart.
      tankType: form.isUnderground ? "underground" : form.tankType,
    };
    if (editing === "new") dispatch({ type:"ADD_TANK", payload: createTank(payload) });
    else                   dispatch({ type:"UPDATE_TANK", payload: { ...payload, id: editing } });
    cancel();
  };

  const usts = tanks.filter(t => t.isUnderground);
  const isNew = editing === "new";

  return (
    <SectionCard
      title="Fuel Tanks"
      subtitle={`${tanks.length} tanks · ${usts.length} underground, carrying a daily inventory record`}
      icon="gas-station"
      action={!editing && <button onClick={startNew} style={{ ...btn.primary, fontSize:12, padding:"7px 14px" }}>+ Add Tank</button>}
    >
      {editing && (
        <div style={{ padding:18, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>
            {isNew ? "New tank" : `Editing ${form.name}`}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"2fr 1.5fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Name" required>
              <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={{ ...inp, margin:0 }} placeholder="Main Shop Diesel" />
            </Field>
            <Field label="Location">
              <input type="text" value={form.location} onChange={e=>set("location",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
            <Field label="Fuel">
              <select value={form.fuelType} onChange={e=>set("fuelType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="diesel">Diesel</option>
                <option value="unleaded">Unleaded</option>
                <option value="propane">Propane</option>
              </select>
            </Field>
            <Field label="Type">
              <select value={form.tankType} onChange={e=>set("tankType",e.target.value)}
                disabled={form.isUnderground} style={{ ...inp, margin:0, opacity: form.isUnderground?0.6:1 }}>
                <option value="above_ground">Above ground</option>
                <option value="underground">Underground</option>
                <option value="portable">Portable</option>
              </select>
            </Field>
            <Field label="Capacity (gal)">
              <input type="number" min="0" value={form.capacityGallons} onChange={e=>set("capacityGallons",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
          </div>

          <div style={{ display:"flex", gap:22, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
            <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, cursor:"pointer" }}>
              <input type="checkbox" checked={form.hasMonitor} onChange={e=>set("hasMonitor",e.target.checked)} />
              Has an electronic monitor <span style={{ color:"#888" }}>— read daily</span>
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, cursor:"pointer" }}>
              <input type="checkbox" checked={form.filledByContractor} onChange={e=>set("filledByContractor",e.target.checked)} />
              Filled by contractor tank wagon
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, cursor:"pointer", fontWeight:600, color:"#1a3a5c" }}>
              <input type="checkbox" checked={form.isUnderground}
                onChange={e=>{ set("isUnderground", e.target.checked); if (e.target.checked) set("tankType","underground"); }} />
              Underground <span style={{ color:"#888", fontWeight:400 }}>— regulated, needs a daily record</span>
            </label>
            {form.tankType === "portable" && (
              <Field label="Carried by unit">
                <input type="text" value={form.carriedByUnit} onChange={e=>set("carriedByUnit",e.target.value)} style={{ ...inp, margin:0, width:90, fontFamily:"monospace" }} placeholder="402" />
              </Field>
            )}
          </div>

          {form.isUnderground && (
            <div style={{ background:"#fff", border:"1px solid #c8d8ec", borderRadius:6, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#1a3a5c", marginBottom:4 }}>
                Regulated Tank
              </div>
              <div style={{ fontSize:11, color:"#888", marginBottom:10, lineHeight:1.6 }}>
                This tank will appear on the Daily Inventory screen and carry a monthly reconciliation.
                The Fire Marshal asks for these at the annual inspection.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <Field label="Facility ID">
                  <input type="text" value={form.facilityId} onChange={e=>set("facilityId",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Tank registration #">
                  <input type="text" value={form.tankRegistrationId} onChange={e=>set("tankRegistrationId",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Installed">
                  <DateField value={form.installedDate} onChange={v=>set("installedDate",v)} />
                </Field>
              </div>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 3fr", gap:12, marginBottom:12 }}>
            <Field label="Status">
              <select value={form.status} onChange={e=>set("status",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="active">Active</option>
                <option value="out_of_service">Out of service</option>
              </select>
            </Field>
            <Field label="Notes">
              <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
            </Field>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={save} disabled={!form.name} style={{ ...btn.primary, opacity:form.name?1:0.4 }}>
              {isNew ? "Add Tank" : "Save Changes"}
            </button>
            <button onClick={cancel} style={btn.ghost}>Cancel</button>
          </div>
        </div>
      )}

      <Table
        headers={[{label:"Tank"},{label:"Location"},{label:"Fuel"},{label:"Type"},{label:"Capacity"},
                  {label:"Monitor"},{label:"Filled By"},{label:"Status"},{label:""}]}
        rows={tanks.map(t => [
          <span style={{ fontWeight:600 }}>
            {t.name}
            {t.isUnderground && (
              <span style={{ marginLeft:7, background:"#e8f0fb", color:"#1a4a8a", border:"1px solid #c8d8ec",
                             borderRadius:99, padding:"1px 7px", fontSize:10, fontWeight:700 }}>UST</span>
            )}
          </span>,
          t.location || "—",
          titleCase(t.fuelType),
          titleCase(t.tankType),
          <span style={{ fontFamily:"monospace" }}>{t.capacityGallons ? `${t.capacityGallons.toLocaleString()} gal` : "—"}</span>,
          <span style={{ fontSize:11, color: t.hasMonitor ? "#1a5a3a" : "#aaa" }}>{t.hasMonitor ? "Yes" : "No"}</span>,
          <span style={{ fontSize:11, color:"#888" }}>{t.filledByContractor ? "Contractor" : t.tankType === "portable" ? `Unit ${t.carriedByUnit || "?"}` : "Own stock"}</span>,
          <span style={{ fontSize:11, color: t.status === "active" ? "#1a5a3a" : "#c0392b" }}>{titleCase(t.status)}</span>,
          <button onClick={()=>startEdit(t)} style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>Edit</button>,
        ])}
        emptyMessage="No tanks configured yet"
      />
    </SectionCard>
  );
}
