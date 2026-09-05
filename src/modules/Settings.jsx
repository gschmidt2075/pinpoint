import { useState, useMemo } from "react";
import { Field, SectionCard, Table, Icon, AlertBar, inp, btn, fmt, fmtSm, DateField, MoneyField, titleCase } from "../components/shared.jsx";
import { useUnsavedForm, useNavigationGuard } from "../components/unsaved.jsx";
import { EXPENDITURE_CODES, REVENUE_CODES, FISCAL_YEAR } from "../data/accountCodes.js";
import { parseCSV, crosswalkInventory } from "../data/crosswalk.js";
import { LOOKUP_DEFS, createTownship, createInventoryGroup, groupLabel,
         INVENTORY_GROUP_TYPES, groupTypeLabel, createTank,
         DEFAULT_INVOICES_PER_CLAIM, MODULES, ACCESS_LEVELS, LOCKED_CAPABILITIES,
         DEFAULT_ROLES, createRole, ROOT_ROLE_ID, hasCapability, isGrantable,
         createUser, AUDIT_ACTIONS } from "../data/schema.js";

// Townships and storage locations are COUNTY data, not program data. They used
// to be hardcoded here as Adams County's list, which meant every county that
// installed this got somebody else's yard. Both now come from state — townships
// from Settings, locations from the inventory crosswalk on first run.

// ── Settings Module ───────────────────────────────────────────────────────────
export default function Settings({ db, dispatch, access }) {
  const go = useNavigationGuard();
  const [view, setView] = useState("county");

  const tabs = [
    { id:"county",    label:"County Info",       icon:"building" },
    { id:"fiscal",    label:"Fiscal Year",       icon:"calendar-event" },
    { id:"accounts",  label:"Account Codes",     icon:"receipt" },
    { id:"system",    label:"System Settings",   icon:"adjustments-horizontal" },
    // Only the two roles that hold the capability see this at all — it is not a
    // grid setting, so it cannot be ticked open.
    ...(access?.has?.("editPermissions") ? [{ id:"roles", label:"Roles & Permissions", icon:"lock" }] : []),
    ...(access?.has?.("editPermissions") ? [{ id:"users", label:"Users", icon:"users" }] : []),
    ...(access?.has?.("viewAuditTrail")  ? [{ id:"audit", label:"Audit Trail", icon:"history" }] : []),
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
              <button key={t.id} onClick={() => go(() => setView(t.id))} style={{
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
          {view==="system"   && <SystemSettings db={db} dispatch={dispatch} access={access} />}
          {view==="roles"    && <RolesAndPermissions db={db} dispatch={dispatch} />}
          {view==="users"    && <UsersScreen db={db} dispatch={dispatch} />}
          {view==="audit"    && <AuditTrail db={db} />}
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
  useUnsavedForm(form, "what you have entered");
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
  const go = useNavigationGuard();
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
            <button key={t} onClick={() => go(() => setTab(t))} style={{ padding:"8px 18px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:tab===t?"#1a3a5c":"#fff", color:tab===t?"#fff":"#555", textTransform:"capitalize" }}>
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
function SystemSettings({ db, dispatch, access }) {
  const go = useNavigationGuard();
  const [activeSection, setActiveSection] = useState("lists");
  const [newTownship, setNewTownship]     = useState("");
  const [newFund, setNewFund]             = useState("");
  const [newLocation, setNewLocation]     = useState("");

  const townships    = db.townships    || [];
  const customFunds  = db.customFunds  || [];
  const tanks        = db.tanks || [];

  const sections = [
    { id:"lists",     label:"Dropdown Lists",   icon:"list" },
    { id:"townships", label:"Townships",        icon:"map-pin" },
    { id:"groups",    label:"Commodity Groups", icon:"category" },
    // Replacing the whole catalog is destructive, so it sits behind the same
    // capability as deleting records rather than behind mere Settings access.
    ...(access?.has?.("deleteRecords") ? [{ id:"import", label:"Import Inventory", icon:"file-upload" }] : []),
    { id:"tanks",     label:"Fuel Tanks",        icon:"gas-station" },
    { id:"funds",     label:"Custom Funds",     icon:"coin" },
    { id:"fema",      label:"FEMA Rates",       icon:"alert-octagon" },
    ...(access?.has?.("deleteRecords") ? [{ id:"danger", label:"Testing Tools", icon:"alert-triangle" }] : []),
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
          <button key={s.id} onClick={() => go(() => setActiveSection(s.id))} style={{ padding:"8px 14px", fontSize:12, fontWeight:600, border:"1px solid", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6,
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


      {activeSection==="groups" && <GroupSettings db={db} dispatch={dispatch} />}

      {activeSection==="import" && <InventoryImport db={db} dispatch={dispatch} />}

      {activeSection==="danger" && <DangerZone access={access} />}

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
      <AlertBar type="info">
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

// ── Loading a county's own inventory ─────────────────────────────────────────
//
// The crosswalk used to be a Python script somebody with a checkout had to run,
// and the result was compiled into the build. That meant a county could not load
// its own inventory, could not redo it when the first count came back wrong, and
// every install shipped with Adams County's catalog in it.
//
// The rules live in src/data/crosswalk.js and run right here in the browser —
// the same module `scripts/gen_inventory.mjs` uses, so a file imported from this
// screen and a file crosswalked from the command line give identical results.
//
// Nothing is written until the preview has been read and the confirmation typed.
function InventoryImport({ db, dispatch }) {
  const [file, setFile]       = useState(null);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [confirm, setConfirm] = useState("");
  const [done, setDone]       = useState(null);

  const current = {
    items:      (db.inventoryItems   || []).length,
    groups:     (db.inventoryGroups  || []).length,
    batches:    (db.inventoryBatches || []).filter(b => b.status === "open").length,
    value:      (db.inventoryBatches || [])
                  .filter(b => b.status === "open")
                  .reduce((t, b) => t + (b.quantityRemaining || 0) * (b.unitCost || 0), 0),
  };

  // Movements recorded since the last import. These are what an import throws
  // away, and the number people most need to see before confirming.
  const movements = (db.inventoryTransactions || []).filter(t => t.type !== "crosswalk").length;

  const pick = async (f) => {
    setFile(f); setResult(null); setError(""); setConfirm(""); setDone(null);
    if (!f) return;
    setBusy(true);
    try {
      const { records } = parseCSV(await f.text());
      if (!records.length) { setError("That file has no rows in it."); return; }
      const out = crosswalkInventory(records);
      if (!out.ok) { setError(out.error); return; }
      setResult(out);
    } catch (e) {
      setError(`Could not read that file — ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    dispatch({ type:"IMPORT_INVENTORY", payload: {
      items: result.items, batches: result.batches, transactions: result.transactions,
      groups: result.groups, exceptions: result.exceptions,
    }});
    setDone(result.summary); setResult(null); setFile(null); setConfirm("");
  };

  const READY = "REPLACE";
  const canRun = result && confirm.trim().toUpperCase() === READY;

  return (
    <SectionCard title="Import Inventory" subtitle="Load a county's own R&B export" icon="file-upload">
      {done && (
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #eee" }}>
          <AlertBar type="success" message={
            `Imported ${done.items.toLocaleString()} items and ${done.batches.toLocaleString()} opening batches, ` +
            `${fmt(done.openingValue)} on hand. ${done.exceptions} rows flagged — see the Inventory dashboard.`} />
        </div>
      )}

      <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee", fontSize:13, color:"#555", lineHeight:1.7 }}>
        Pick the inventory export from R&amp;B. Nothing is written until you have read what it
        will do and typed the confirmation.
        <div style={{ marginTop:10, fontSize:12, color:"#888" }}>
          The file needs these columns: <code>Inventory #</code>, <code>Commodity Group</code>,{" "}
          <code>Comm Grp Alpha</code>, <code>Inventory Description</code>, <code>Quan On Hand</code>,{" "}
          <code>Cost On Hand</code>, <code>Unit Of Measure</code>, <code>GL A/C #</code>, <code>Vendor</code>.
          Extra columns are ignored, and <code>Inventory Usual Location</code> is deliberately not used.
        </div>
      </div>

      <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
        <input type="file" accept=".csv,text/csv" onChange={e=>pick(e.target.files?.[0] || null)}
               style={{ fontSize:13 }} />
        {busy && <span style={{ marginLeft:12, fontSize:12, color:"#888" }}>Reading…</span>}
        {file && !busy && <span style={{ marginLeft:12, fontSize:12, color:"#888" }}>{file.name}</span>}
      </div>

      {error && (
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #eee" }}>
          <AlertBar type="danger" message={error} />
        </div>
      )}

      {result && (
        <>
          <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>What this file would replace</div>
            <Table
              headers={[{label:""},{label:"Now",right:true},{label:"After importing",right:true}]}
              rows={[
                ["Items in the catalog", current.items.toLocaleString(), result.summary.items.toLocaleString()],
                ["Commodity groups",     current.groups.toLocaleString(), result.summary.groups.toLocaleString()],
                ["Open batches",         current.batches.toLocaleString(), result.summary.batches.toLocaleString()],
                ["Value on hand",        fmt(current.value), fmt(result.summary.openingValue)],
              ].map(([a,b,c]) => [
                <span style={{ fontWeight:600 }}>{a}</span>,
                <span style={{ fontFamily:"ui-monospace, monospace", color:"#888" }}>{b}</span>,
                <span style={{ fontFamily:"ui-monospace, monospace", fontWeight:700 }}>{c}</span>,
              ])}
            />
            <div style={{ fontSize:12, color:"#888", marginTop:10 }}>
              {result.summary.rows.toLocaleString()} rows read
              {result.summary.merged > 0 &&
                ` · ${result.summary.merged.toLocaleString()} merged, where one part number appeared in several groups`}
              {" · "}
              {Object.entries(result.summary.typeCounts)
                     .sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${v} ${k}`).join(" · ")}
            </div>
          </div>

          {result.summary.exceptions > 0 && (
            <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                {result.summary.exceptions} rows will be flagged rather than guessed at
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(result.summary.exceptionKinds).map(([kind,n])=>(
                  <span key={kind} style={{ background:"#fff4e0", border:"1px solid #f0d080", borderRadius:14,
                                            padding:"4px 12px", fontSize:12, color:"#7a4f00" }}>
                    {kind} <strong>{n}</strong>
                  </span>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                None of these block the import. They appear on the Inventory dashboard with their row number.
              </div>
            </div>
          )}

          <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
            <AlertBar type="warning" message={
              movements > 0
                ? `This replaces the catalog, the groups and every opening balance — and discards ${movements.toLocaleString()} recorded movement${movements===1?"":"s"} (receipts, issues, transfers, counts). Claims, work orders, fuel and revenue are not touched.`
                : "This replaces the catalog, the groups and every opening balance. Claims, work orders, fuel and revenue are not touched."} />
            <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginTop:6 }}>
              <Field label={`Type ${READY} to confirm`}>
                <input value={confirm} onChange={e=>setConfirm(e.target.value)}
                       style={{ ...inp, width:180, fontFamily:"ui-monospace, monospace", textTransform:"uppercase" }}
                       placeholder={READY} />
              </Field>
              <button onClick={run} disabled={!canRun}
                      style={{ ...btn.primary, marginBottom:2, opacity: canRun ? 1 : 0.4,
                               cursor: canRun ? "pointer" : "not-allowed" }}>
                Import {result.summary.items.toLocaleString()} items
              </button>
              <button onClick={()=>{setResult(null);setFile(null);setConfirm("");}}
                      style={{ ...btn.ghost, marginBottom:2 }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Storage locations ─────────────────────────────────────────────────────────
// Locations arrive from the inventory crosswalk carrying the numeric code the
// old system used. The code is the authoritative answer to WHERE — it is what
// every batch points at — so it is shown but never edited. The NAME is what the
// crew calls the place, and most were inferred from whatever was stored there.
//
// An inferred name is a guess, so it is marked as one until somebody confirms
// it. "Location 47 holds 52 things and we think it is the Kenesaw Shed" is a
// useful thing to be able to say; silently asserting it is not.
function GroupSettings({ db, dispatch }) {
  const groups    = db.inventoryGroups  || [];
  const items     = db.inventoryItems   || [];
  const batches   = db.inventoryBatches || [];
  const equipment = db.equipment        || [];
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft]     = useState(null);
  const [error, setError]     = useState("");

  // What each group is actually carrying, live from the data — because both
  // questions matter before letting anyone delete or renumber one.
  const usage = useMemo(() => {
    const m = new Map();
    const get = (k) => { if (!m.has(k)) m.set(k, { held: 0, value: 0, cats: 0 }); return m.get(k); };
    for (const b of batches) {
      if (b.status !== "open" || !((b.quantityRemaining || 0) > 0)) continue;
      const u = get(String(b.location));
      u.held  += 1;
      u.value += (b.quantityRemaining || 0) * (Number(b.unitCost) || 0);
    }
    const byId = new Map(groups.map(g => [g.id, String(g.code)]));
    for (const i of items) {
      const code = byId.get(i.categoryId);
      if (code) get(code).cats += 1;
    }
    return m;
  }, [batches, items, groups]);

  const stat = (g) => usage.get(String(g.code)) || { held: 0, value: 0, cats: 0 };

  const shown = groups
    .filter(g => filter === "all" || g.type === filter)
    .filter(g => !search || `${g.code} ${g.name}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0));

  const startEdit = (g) => { setEditing(g.id); setDraft({ ...g }); setError(""); };

  // Adding starts a DRAFT row rather than writing a half-made group into state.
  // The code is left blank on purpose: it is the county's numbering, not ours,
  // and there is no reason a new group should have to follow the last one. Any
  // number will do so long as nothing else already answers to it.
  const startAdd = () => {
    setEditing("new");
    setDraft(createInventoryGroup({ code: "", name: "", type: "area" }));
    setError("");
  };

  const cancel = () => { setEditing(null); setDraft(null); setError(""); };

  const save = () => {
    const code = String(draft.code || "").trim();
    if (!code)                            return setError("A group needs a code.");
    if (!String(draft.name || "").trim()) return setError("A group needs a name.");
    // Uniqueness is the only constraint. Codes need not be sequential or
    // numeric — R&B's own run to 430 with gaps all the way down.
    if (groups.some(g => g.id !== draft.id && String(g.code) === code))
      return setError(`Code ${code} is already taken by ${groupLabel(groups.find(g => String(g.code) === code))}.`);
    dispatch({ type: editing === "new" ? "ADD_INVENTORY_GROUP" : "UPDATE_INVENTORY_GROUP",
               payload: { ...draft, code } });
    cancel();
  };

  const remove = (g) => {
    const u = stat(g);
    // Deleting a group that still holds stock would strand every batch at a
    // code nothing answers to — present in the county total, absent from every
    // count sheet. Deleting one still used as a category leaves items with no
    // category at all. Both are blocked here rather than warned about.
    if (u.held) return setError(`${groupLabel(g)} still holds stock. Transfer it somewhere else first.`);
    if (u.cats) return setError(`${u.cats} item${u.cats === 1 ? " uses" : "s use"} ${groupLabel(g)} as their category. Recategorise them first.`);
    dispatch({ type: "REMOVE_INVENTORY_GROUP", payload: g.id });
    setError("");
  };

  const counts = groups.reduce((a, g) => ({ ...a, [g.type]: (a[g.type] || 0) + 1 }), {});
  const tabs = [["all", `All (${groups.length})`],
                ...INVENTORY_GROUP_TYPES.map(([v, l]) => [v, `${l} (${counts[v] || 0})`])];

  return (
    <SectionCard
      title="Commodity Groups"
      subtitle={`${groups.length} groups · a group is both what a thing IS and where it is kept`}
      icon="category">

      <div style={{ padding:"14px 18px", borderBottom:"1px solid #eee", fontSize:13, color:"#555", lineHeight:1.6 }}>
        These are the same group numbers R&amp;B uses. An item&apos;s <strong>category</strong> is a group,
        and a batch&apos;s <strong>location</strong> is a group code — so on day one they match, and they
        only differ once something has been transferred.
        <div style={{ fontSize:12, color:"#888", marginTop:6 }}>
          Changing a code moves its stock with it. A group holding stock, or in use as a category, cannot be deleted.
        </div>
      </div>

      {error && (
        <div style={{ padding:"10px 18px", borderBottom:"1px solid #eee" }}>
          <AlertBar type="danger" message={error} />
        </div>
      )}

      <div style={{ display:"flex", gap:6, padding:"12px 18px", borderBottom:"1px solid #eee", flexWrap:"wrap", alignItems:"center" }}>
        <button style={{ ...btn.primarySm, marginRight:6 }} onClick={startAdd}>
          <Icon name="plus" size={12} /> Add a group
        </button>
        {tabs.map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{ padding:"5px 11px", fontSize:12, fontWeight:600,
            border:"1px solid", borderRadius:5, cursor:"pointer",
            background: filter===v?"#1a3a5c":"#fff", color: filter===v?"#fff":"#555",
            borderColor: filter===v?"#1a3a5c":"#ccc" }}>{l}</button>
        ))}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a group…"
               style={{ ...inp, margin:0, width:180, marginLeft:"auto" }} />
      </div>

      <Table
        headers={[{label:"Code"},{label:"Name"},{label:"Type"},{label:"Items Here",right:true},
                 {label:"Value Here",right:true},{label:"Used as Category",right:true},{label:""},{label:""}]}
        rows={[
          ...(editing === "new" ? [[
            <input style={{ ...inp, width:70, fontFamily:"ui-monospace, monospace", fontWeight:700 }}
                   value={draft.code} autoFocus placeholder="e.g. 42"
                   onChange={e=>setDraft({ ...draft, code:e.target.value })}
                   onKeyDown={e=>{ if(e.key==="Enter") save(); if(e.key==="Escape") cancel(); }} />,
            <input style={inp} value={draft.name} placeholder="What is this group called?"
                   onChange={e=>setDraft({ ...draft, name:e.target.value })}
                   onKeyDown={e=>{ if(e.key==="Enter") save(); if(e.key==="Escape") cancel(); }} />,
            <select style={inp} value={draft.type} onChange={e=>setDraft({ ...draft, type:e.target.value })}>
              {INVENTORY_GROUP_TYPES.map(([v,lab])=><option key={v} value={v}>{lab}</option>)}
            </select>,
            <span style={{ color:"#aaa" }}>—</span>,
            <span style={{ color:"#aaa" }}>—</span>,
            <span style={{ color:"#aaa" }}>—</span>,
            <button style={btn.primarySm} onClick={save}>Save</button>,
            <button style={btn.ghostSm} onClick={cancel}>Cancel</button>,
          ]] : []),
          ...shown.map(g => {
          const u = stat(g);
          if (editing === g.id) return [
            <input style={{ ...inp, width:70, fontFamily:"ui-monospace, monospace", fontWeight:700 }}
                   value={draft.code} onChange={e=>setDraft({ ...draft, code:e.target.value })} />,
            <input style={inp} value={draft.name} autoFocus
                   onChange={e=>setDraft({ ...draft, name:e.target.value })}
                   onKeyDown={e=>{ if(e.key==="Enter") save(); if(e.key==="Escape") setEditing(null); }} />,
            <select style={inp} value={draft.type} onChange={e=>setDraft({ ...draft, type:e.target.value })}>
              {INVENTORY_GROUP_TYPES.map(([v,lab])=><option key={v} value={v}>{lab}</option>)}
            </select>,
            draft.type === "machine"
              ? <select style={inp} value={draft.equipmentId || ""}
                        onChange={e=>setDraft({ ...draft, equipmentId:e.target.value || null,
                          unitNumber:(equipment.find(x=>x.id===e.target.value)||{}).unitNumber || draft.unitNumber })}>
                  <option value="">Link to a unit…</option>
                  {equipment.map(x=><option key={x.id} value={x.id}>{x.unitNumber} — {x.description||x.make}</option>)}
                </select>
              : <span>{u.held}</span>,
            fmtSm(u.value),
            u.cats,
            <button style={btn.primarySm} onClick={save}>Save</button>,
            <button style={btn.ghostSm} onClick={cancel}>Cancel</button>,
          ];
          return [
            <span style={{ fontWeight:700, fontFamily:"ui-monospace, monospace" }}>{g.code}</span>,
            <span>{g.name}
              {g.type==="machine" && !g.equipmentId &&
                <span style={{ marginLeft:8, fontSize:11, color:"#a06000", background:"#fff4e0", padding:"1px 6px", borderRadius:4 }}>
                  not linked to a unit
                </span>}
            </span>,
            groupTypeLabel(g.type),
            u.held,
            fmtSm(u.value),
            u.cats,
            <button style={btn.ghostSm} onClick={()=>startEdit(g)}>Edit</button>,
            (u.held || u.cats)
              ? <span style={{ fontSize:11, color:"#999" }}>{u.held ? "holds stock" : "in use"}</span>
              : <button style={btn.ghostSm} onClick={()=>remove(g)}>Remove</button>,
          ];
        })]}
        emptyMessage="No groups match."
      />
    </SectionCard>
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
    openingDate:"", openingGallons:"", openingValue:"",
    isUnderground:false, facilityId:"", tankRegistrationId:"", installedDate:"",
    status:"active", notes:"",
  };
  const [editing, setEditing] = useState(null);   // tank id, or "new", or null
  const [form, setForm] = useState(BLANK);
  useUnsavedForm(form, "this tank");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const startNew  = () => { setForm(BLANK); setEditing("new"); };
  const startEdit = (t) => {
    setForm({ ...BLANK, ...t, capacityGallons: String(t.capacityGallons ?? ""),
              openingGallons: String(t.openingGallons ?? ""), openingValue: String(t.openingValue ?? "") });
    setEditing(t.id);
  };
  const cancel = () => { setEditing(null); setForm(BLANK); };

  const save = () => {
    if (!form.name) return;
    const payload = {
      ...form,
      capacityGallons: parseFloat(form.capacityGallons) || 0,
      openingDate:     form.openingDate || "",
      openingGallons:  parseFloat(form.openingGallons) || 0,
      openingValue:    parseFloat(form.openingValue) || 0,
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

          {/* ── What was in it to start with ──
              Greg: "I would rather just have an opening balance when the tank
              is created and what the opening value is too."
              Without these, every gallon drawn before the first delivery is
              priced at a fallback and the year-end value is a guess. Value
              rather than price per gallon, because value is what the closing
              inventory sheet says; the price is worked out from it. */}
          <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:14 }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:"#1a1a1a", marginBottom:3 }}>
              Opening balance <span style={{ fontWeight:400, color:"#888" }}>— what was in it when Pinpoint took over</span>
            </div>
            <div style={{ fontSize:11.5, color:"#888", marginBottom:10, maxWidth:620, lineHeight:1.6 }}>
              Leave blank for a tank that started empty. Fuel already in a tank has to be priced
              somehow — without this, anything drawn before the first delivery is only an estimate,
              and the year-end value cannot be relied on.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1.4fr", gap:12, alignItems:"end" }}>
              <Field label="As at">
                <DateField value={form.openingDate} onChange={v=>set("openingDate",v)} />
              </Field>
              <Field label="Gallons">
                <input type="number" min="0" step="any" value={form.openingGallons}
                  onChange={e=>set("openingGallons",e.target.value)}
                  style={{ ...inp, margin:0, fontFamily:"monospace" }} />
              </Field>
              <Field label="Value">
                <MoneyField value={form.openingValue} onChange={v=>set("openingValue",v)} />
              </Field>
              <div style={{ fontSize:11.5, color:"#40607d", paddingBottom:9 }}>
                {(parseFloat(form.openingGallons) > 0 && parseFloat(form.openingValue) > 0)
                  ? <>Works out at <strong>${(parseFloat(form.openingValue)/parseFloat(form.openingGallons)).toFixed(4)}</strong> a gallon.</>
                  : parseFloat(form.openingGallons) > 0
                  ? <span style={{ color:"#a05a00" }}>Gallons with no value — they will price as estimated.</span>
                  : ""}
              </div>
            </div>
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


// ── Roles & permissions ───────────────────────────────────────────────────────
//
// A grid: roles across the top, modules down the side, three answers in each
// cell. Blunt on purpose — this is the granularity a four-person department can
// keep correct, and a permission grid nobody maintains is worse than none.
//
// The locked capabilities are shown but not editable. They are fixed in code
// because a wrong tick on any of them costs real money or real history, and
// showing them here — greyed, with the reason — is how someone learns they
// exist rather than wondering why a button never appears.
function RolesAndPermissions({ db, dispatch }) {
  const roles = db.roles?.length ? db.roles : DEFAULT_ROLES;
  const [showNew, setShowNew] = useState(false);
  const [newRole, setNewRole] = useState({ label:"", description:"" });
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ label:"", description:"" });
  const [showLocked, setShowLocked] = useState(false);

  const LEVEL_STYLE = {
    none: { bg:"#f7f7f5", color:"#bbb",    border:"#e8e8e5" },
    view: { bg:"#eef2f8", color:"#1a3a5c", border:"#c8d8ec" },
    edit: { bg:"#e6f4ec", color:"#1a5a3a", border:"#a8d5b5" },
  };

  const cycle = (roleId, moduleId, current) => {
    const order = ["none","view","edit"];
    const next  = order[(order.indexOf(current) + 1) % order.length];
    dispatch({ type:"UPDATE_ROLE_PERMISSION", payload:{ roleId, moduleId, level: next } });
  };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="lock" size={18} color="#1a3a5c" />
          Roles & Permissions
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          Who can open what, and who can change it. Click a cell to cycle through — · View · Edit.
        </div>
      </div>

      <div style={{ background:"#fef8e8", border:"1px solid #f0d080", borderRadius:8, padding:"12px 16px", marginBottom:18, fontSize:12, color:"#7a4f00", lineHeight:1.7 }}>
        <strong>There is no login yet.</strong> Anyone can pick any role from the switcher in the top
        corner, so this decides what people SEE rather than what they are able to do. It becomes real
        enforcement when the county server and Azure AD arrive — the grid you set here carries over.
      </div>

      <SectionCard title="Module Access" subtitle={`${roles.length} roles · ${MODULES.length} modules`} icon="table">
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                <th style={{ padding:"9px 14px", textAlign:"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee", position:"sticky", left:0, background:"#f7f7f5" }}>Module</th>
                {roles.map(r => (
                  <th key={r.id} title={r.description} style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", color:"#666", borderBottom:"1px solid #eee", minWidth:96 }}>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m,i) => (
                <tr key={m.id} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"8px 14px", fontWeight:600, position:"sticky", left:0, background:i%2===0?"#fff":"#fafaf8" }}>{m.label}</td>
                  {roles.map(r => {
                    const level = r.permissions?.[m.id] || "none";
                    const st = LEVEL_STYLE[level];
                    return (
                      <td key={r.id} style={{ padding:"5px 8px", textAlign:"center" }}>
                        <button
                          onClick={()=>cycle(r.id, m.id, level)}
                          title={`${r.label} · ${m.label} — click to change`}
                          style={{
                            width:"100%", padding:"5px 0", borderRadius:5, cursor:"pointer",
                            background:st.bg, color:st.color, border:`1px solid ${st.border}`,
                            fontSize:11, fontWeight:700,
                          }}>
                          {ACCESS_LEVELS.find(a=>a.id===level)?.label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"12px 16px", borderTop:"1px solid #eee", display:"flex", gap:18, fontSize:11, color:"#888", flexWrap:"wrap" }}>
          {ACCESS_LEVELS.map(a=>(
            <span key={a.id} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
              <span style={{ display:"inline-block", width:26, textAlign:"center", padding:"2px 0", borderRadius:4,
                             background:LEVEL_STYLE[a.id].bg, color:LEVEL_STYLE[a.id].color,
                             border:`1px solid ${LEVEL_STYLE[a.id].border}`, fontWeight:700 }}>{a.label}</span>
              {a.description}
            </span>
          ))}
        </div>
      </SectionCard>

      {/* Who holds the locked capabilities. Deliberately a separate grid from
          module access — these are not reachable by widening a role, and each
          is granted on purpose rather than ticked among fifty other boxes. */}
      <SectionCard
        title="Locked Capabilities"
        subtitle="Not reachable through module access. Granted here, one at a time."
        icon="shield-lock"
      >
        <div style={{ padding:"12px 16px", fontSize:12, color:"#888", lineHeight:1.65, borderBottom:"1px solid #f0f0ee" }}>
          The Superintendent holds all of these permanently and cannot be reduced — that is what
          guarantees somebody can always approve a claim. Grant them to other roles only where the job
          genuinely needs it.
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                <th style={{ padding:"9px 14px", textAlign:"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>Capability</th>
                {roles.map(r => (
                  <th key={r.id} style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", color:"#666", borderBottom:"1px solid #eee", minWidth:96 }}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOCKED_CAPABILITIES.map((c,i) => (
                <tr key={c.id} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"9px 14px" }}>
                    <div style={{ fontWeight:600 }}>{c.label}</div>
                    <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{c.why}</div>
                  </td>
                  {roles.map(r => {
                    const isRoot = r.id === ROOT_ROLE_ID;
                    const held   = isRoot || (r.capabilities || []).includes(c.id);
                    const fixed  = isRoot || !c.grantable;
                    return (
                      <td key={r.id} style={{ padding:"6px 8px", textAlign:"center" }}>
                        <button
                          disabled={fixed}
                          title={isRoot ? "The Superintendent always holds this"
                                : !c.grantable ? "This one can never be granted — whoever held it could widen themselves"
                                : held ? `Remove from ${r.label}` : `Grant to ${r.label}`}
                          onClick={()=>{
                            if (fixed) return;
                            if (!held && !window.confirm(
                              `Grant "${c.label}" to ${r.label}?\n\n${c.why}.`)) return;
                            dispatch({ type:"SET_ROLE_CAPABILITY",
                                       payload:{ roleId:r.id, capabilityId:c.id, granted:!held } });
                          }}
                          style={{
                            width:"100%", padding:"5px 0", borderRadius:5,
                            cursor: fixed ? "default" : "pointer",
                            background: held ? "#e6f4ec" : "#f7f7f5",
                            color:      held ? "#1a5a3a" : "#bbb",
                            border:`1px solid ${held ? "#a8d5b5" : "#e8e8e5"}`,
                            fontSize:11, fontWeight:700, opacity: fixed && !held ? 0.4 : 1,
                          }}>
                          {held ? (isRoot ? "Always" : "Yes") : (c.grantable ? "—" : "Never")}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Roles"
        subtitle="Only the Superintendent is permanent. Create whatever else the county needs — every department is organised differently."
        icon="users"
        action={<button onClick={()=>setShowNew(s=>!s)} style={{ ...btn.ghost, fontSize:11, padding:"5px 12px" }}>{showNew?"Cancel":"+ Add Role"}</button>}
      >
        {showNew && (
          <div style={{ padding:16, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr auto", gap:12, alignItems:"end" }}>
              <Field label="Role name" required>
                <input type="text" value={newRole.label} onChange={e=>setNewRole(r=>({...r,label:e.target.value}))}
                  placeholder="Sign Tech" style={{ ...inp, margin:0 }} />
              </Field>
              <Field label="What this role is for">
                <input type="text" value={newRole.description} onChange={e=>setNewRole(r=>({...r,description:e.target.value}))}
                  style={{ ...inp, margin:0 }} />
              </Field>
              <button
                onClick={()=>{
                  if (!newRole.label.trim()) return;
                  dispatch({ type:"ADD_ROLE", payload: createRole({ ...newRole, label:newRole.label.trim() }) });
                  setNewRole({ label:"", description:"" }); setShowNew(false);
                }}
                disabled={!newRole.label.trim()}
                style={{ ...btn.primary, opacity:newRole.label.trim()?1:0.45 }}>Add</button>
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:8 }}>
              A new role starts closed — no modules, no capabilities. Open what it needs above.
            </div>
          </div>
        )}
        <Table
          headers={[{label:"Role"},{label:"What it is for"},{label:"Modules open"},{label:""}]}
          rows={roles.map(r => {
            const open = MODULES.filter(m => (r.permissions?.[m.id]||"none") !== "none").length;
            const isEditing = editingId === r.id;
            return [
              isEditing
                ? <input type="text" value={draft.label} onChange={e=>setDraft(d=>({...d,label:e.target.value}))}
                    style={{ ...inp, margin:0, fontSize:12 }} />
                : <span style={{ fontWeight:600 }}>
                    {r.label}
                    {r.system && <span style={{ marginLeft:7, fontSize:10, color:"#888" }}>permanent</span>}
                  </span>,
              isEditing
                ? <input type="text" value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}
                    style={{ ...inp, margin:0, fontSize:12 }} />
                : <span style={{ fontSize:12, color:"#666" }}>{r.description || "—"}</span>,
              <span style={{ fontFamily:"monospace", color: open ? "#1a5a3a" : "#bbb" }}>{open} of {MODULES.length}</span>,
              isEditing
                ? <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>{
                        dispatch({ type:"UPDATE_ROLE", payload:{ ...r, label:draft.label.trim()||r.label, description:draft.description } });
                        setEditingId(null);
                      }} style={{ ...btn.small, fontSize:11 }}>Save</button>
                    <button onClick={()=>setEditingId(null)} style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>Cancel</button>
                  </div>
                : <div style={{ display:"flex", gap:6 }}>
                    {/* Renaming is allowed on every role, permanent or not — a
                        county may call the Office Manager something else. What
                        cannot change is which role holds the locked
                        capabilities, and that follows the role, not its name. */}
                    <button onClick={()=>{ setEditingId(r.id); setDraft({ label:r.label, description:r.description||"" }); }}
                      style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>Rename</button>
                    {r.system
                      ? <span style={{ fontSize:11, color:"#ccc", alignSelf:"center" }}>permanent</span>
                      : <button onClick={()=>{
                            if (window.confirm(`Delete the ${r.label} role?\n\nAnyone holding it loses that access.`))
                              dispatch({ type:"DELETE_ROLE", payload:r.id });
                          }}
                          style={{ ...btn.ghost, fontSize:11, padding:"4px 10px", color:"#c0392b", borderColor:"#f0d0d0" }}>Delete</button>}
                  </div>,
            ];
          })}
        />
      </SectionCard>
    </div>
  );
}


// ── Users ─────────────────────────────────────────────────────────────────────
//
// Deliberately separate from employees. "Someone we pay" and "someone who logs
// in" are different sets that drift apart in both directions — a seasonal
// laborer never opens the system, county IT might need to, and a leaver's login
// should die while their employee record lives on carrying years of costing.
//
// This is also the piece Azure AD plugs into. The name picker in the header is
// scaffolding that answers "which user am I?"; sign-in will answer the same
// question and nothing under it changes.
function UsersScreen({ db, dispatch }) {
  const users = db.users || [];
  const roles = db.roles?.length ? db.roles : DEFAULT_ROLES;
  const employees = db.employees || [];
  const [editing, setEditing] = useState(null);
  const BLANK = { name:"", employeeId:"", roleIds:[], email:"", active:true, notes:"" };
  const [form, setForm] = useState(BLANK);
  useUnsavedForm(form, "what you have entered");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = () => {
    if (!form.name.trim()) return;
    const payload = { ...form, name:form.name.trim(), employeeId: form.employeeId || null };
    if (editing === "new") dispatch({ type:"ADD_USER", payload: createUser(payload) });
    else                   dispatch({ type:"UPDATE_USER", payload: { ...payload, id: editing } });
    setEditing(null); setForm(BLANK);
  };

  const toggleRole = (rid) => set("roleIds",
    form.roleIds.includes(rid) ? form.roleIds.filter(r=>r!==rid) : [...form.roleIds, rid]);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="users" size={18} color="#1a3a5c" /> Users
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          Who uses Pinpoint, and what they are allowed to do. Separate from employee records on purpose.
        </div>
      </div>

      <div style={{ background:"#eef2f8", border:"1px solid #c8d8ec", borderRadius:8, padding:"11px 15px", marginBottom:18, fontSize:12, color:"#1a3a5c", lineHeight:1.65 }}>
        Adding someone here lets them be picked in the header, and puts their name on everything they
        enter. When the county server arrives their Azure AD account attaches to this record — the
        audit trail written before then still points at the right person.
      </div>

      <SectionCard
        title="People" subtitle={`${users.filter(u=>u.active!==false).length} active`}
        icon="user"
        action={!editing && <button onClick={()=>{ setForm(BLANK); setEditing("new"); }}
          style={{ ...btn.primary, fontSize:12, padding:"7px 14px" }}>+ Add User</button>}
      >
        {editing && (
          <div style={{ padding:18, background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1.4fr 1.4fr", gap:12, marginBottom:12 }}>
              <Field label="Name" required>
                <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <Field label="Employee record">
                <select value={form.employeeId||""} onChange={e=>set("employeeId",e.target.value)} style={{ ...inp, margin:0 }}>
                  <option value="">Not an employee</option>
                  {employees.map(e=>(
                    <option key={e.id} value={e.id}>
                      {e.name || [e.firstName,e.lastName].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Email — for Azure AD later">
                <input type="text" value={form.email} onChange={e=>set("email",e.target.value)}
                  placeholder="optional" style={{ ...inp, margin:0 }} />
              </Field>
            </div>

            <Field label="Roles — several are allowed; access is the sum">
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                {roles.map(r => {
                  const on = form.roleIds.includes(r.id);
                  return (
                    <button key={r.id} type="button" onClick={()=>toggleRole(r.id)} title={r.description}
                      style={{ padding:"6px 12px", fontSize:12, fontWeight:600, borderRadius:6, cursor:"pointer",
                               background:on?"#1a3a5c":"#fff", color:on?"#fff":"#555",
                               border:`1px solid ${on?"#1a3a5c":"#ccc"}` }}>
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div style={{ display:"flex", gap:10, marginTop:14, alignItems:"center" }}>
              <button onClick={save} disabled={!form.name.trim()}
                style={{ ...btn.primary, opacity:form.name.trim()?1:0.45 }}>
                {editing==="new" ? "Add User" : "Save Changes"}
              </button>
              <button onClick={()=>{ setEditing(null); setForm(BLANK); }} style={btn.ghost}>Cancel</button>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, marginLeft:"auto" }}>
                <input type="checkbox" checked={form.active} onChange={e=>set("active",e.target.checked)} />
                Active
              </label>
            </div>
          </div>
        )}

        <Table
          headers={[{label:"Name"},{label:"Roles"},{label:"Employee"},{label:"Status"},{label:""}]}
          rows={users.map(u => [
            <span style={{ fontWeight:600 }}>{u.name}</span>,
            <span style={{ fontSize:12 }}>
              {u.roleIds?.length
                ? u.roleIds.map(rid => roles.find(r=>r.id===rid)?.label || rid).join(", ")
                : <span style={{ color:"#c0392b" }}>no role — cannot see anything</span>}
            </span>,
            <span style={{ fontSize:12, color:"#888" }}>
              {u.employeeId
                ? (employees.find(e=>e.id===u.employeeId)?.name || "linked")
                : "—"}
            </span>,
            <span style={{ fontSize:11, color: u.active!==false ? "#1a5a3a" : "#c0392b" }}>
              {u.active!==false ? "Active" : "Inactive"}
            </span>,
            <button onClick={()=>{ setForm({ ...BLANK, ...u, employeeId:u.employeeId||"" }); setEditing(u.id); }}
              style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>Edit</button>,
          ])}
          emptyMessage="Nobody added yet — add yourself first so your name appears on what you enter"
        />
      </SectionCard>
    </div>
  );
}

// ── Audit trail ───────────────────────────────────────────────────────────────
//
// What changed, who changed it, and what it was before. Money and consequential
// things only — fuel dispensed and parts issued already leave their own record,
// and logging them twice would make this unsearchable when it matters.
function AuditTrail({ db }) {
  const entries = [...(db.auditTrail || [])].reverse();   // newest first
  const users = db.users || [];
  const roles = db.roles?.length ? db.roles : DEFAULT_ROLES;
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [mod, setMod] = useState("");
  const [limit, setLimit] = useState(50);

  const nameOf = (id) => users.find(u=>u.id===id)?.name || "";
  const roleNames = (ids) => (ids||[]).map(r => roles.find(x=>x.id===r)?.label || r).join(", ");

  const shown = entries.filter(e => {
    if (who && e.userId !== who) return false;
    if (mod && e.module !== mod) return false;
    if (q) {
      const hay = `${e.label} ${e.entity} ${e.action} ${nameOf(e.userId)} ${e.reason} ${e.changes.map(c=>c.field).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const val = (v) => v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="history" size={18} color="#1a3a5c" /> Audit Trail
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          Money and consequential changes. Fuel dispensed, parts issued and work orders keep their own
          records and are not repeated here.
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"flex-end" }}>
        <Field label="Search">
          <input type="text" value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Claim number, field, reason…" style={{ ...inp, margin:0, width:230 }} />
        </Field>
        <Field label="Who">
          <select value={who} onChange={e=>setWho(e.target.value)} style={{ ...inp, margin:0, width:170 }}>
            <option value="">Anyone</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Module">
          <select value={mod} onChange={e=>setMod(e.target.value)} style={{ ...inp, margin:0, width:160 }}>
            <option value="">All</option>
            {MODULES.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <div style={{ fontSize:12, color:"#888", paddingBottom:9 }}>
          {shown.length} of {entries.length} entries
        </div>
      </div>

      <SectionCard title="Changes" subtitle="Newest first">
        {shown.length === 0 ? (
          <div style={{ padding:36, textAlign:"center", color:"#aaa", fontSize:13 }}>
            {entries.length === 0
              ? "Nothing recorded yet. Entries appear as claims, revenue and costs are entered or changed."
              : "Nothing matches those filters."}
          </div>
        ) : shown.slice(0, limit).map(e => {
          const meta = AUDIT_ACTIONS[e.action] || { label:e.action, color:"#555" };
          return (
            <div key={e.id} style={{ padding:"12px 16px", borderTop:"1px solid #f0f0ee" }}>
              <div style={{ display:"flex", gap:10, alignItems:"baseline", flexWrap:"wrap" }}>
                <span style={{ fontFamily:"monospace", fontSize:11, color:"#999", minWidth:132 }}>
                  {new Date(e.at).toLocaleString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" })}
                </span>
                <span style={{ background:`${meta.color}14`, color:meta.color, border:`1px solid ${meta.color}33`,
                               borderRadius:4, padding:"1px 8px", fontSize:11, fontWeight:700 }}>
                  {meta.label}
                </span>
                <span style={{ fontSize:13 }}>
                  {e.entity}{e.label ? <strong> {e.label}</strong> : null}
                </span>
                <span style={{ fontSize:12, color:"#888", marginLeft:"auto" }}>
                  {nameOf(e.userId) || <em style={{ color:"#bbb" }}>nobody signed in</em>}
                  {e.roleIds?.length ? <span style={{ color:"#aaa" }}> · {roleNames(e.roleIds)}</span> : null}
                </span>
              </div>

              {e.changes?.length > 0 && (
                <div style={{ marginTop:7, marginLeft:142, fontSize:12 }}>
                  {e.changes.slice(0,6).map((c,i) => (
                    <div key={i} style={{ display:"flex", gap:8, padding:"2px 0", fontFamily:"monospace", color:"#666" }}>
                      <span style={{ minWidth:150, color:"#888" }}>{c.field}</span>
                      <span style={{ color:"#c0392b" }}>{val(c.from)}</span>
                      <span style={{ color:"#bbb" }}>→</span>
                      <span style={{ color:"#1a5a3a" }}>{val(c.to)}</span>
                    </div>
                  ))}
                  {e.changes.length > 6 && (
                    <div style={{ color:"#aaa", fontSize:11, paddingTop:2 }}>
                      and {e.changes.length - 6} more fields
                    </div>
                  )}
                </div>
              )}

              {e.reason && (
                <div style={{ marginTop:6, marginLeft:142, fontSize:12, color:"#7a4f00",
                              background:"#fef8e8", border:"1px solid #f0d080", borderRadius:5, padding:"6px 10px" }}>
                  {e.reason}
                </div>
              )}
            </div>
          );
        })}
        {shown.length > limit && (
          <div style={{ padding:"12px", textAlign:"center", borderTop:"1px solid #f0f0ee" }}>
            <button onClick={()=>setLimit(l=>l+100)} style={{ ...btn.ghost, fontSize:12 }}>
              Show more — {shown.length - limit} older
            </button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}


// ── Testing tools ─────────────────────────────────────────────────────────────
//
// This exists for the preview and MUST NOT SHIP. It was a button in the header,
// one confirm away from erasing everything — fine while nothing real is stored,
// wrong the moment it is.
//
// It is here, behind a typed confirmation, because a reset should take a
// deliberate act rather than a stray click. Before go-live it comes out
// altogether; the notes say so.
function DangerZone() {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === "RESET";

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, display:"flex", alignItems:"center", gap:8, color:"#8c1b18" }}>
          <Icon name="alert-triangle" size={18} color="#c0392b" /> Testing Tools
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          For the preview only. These are removed before the system is used for real work.
        </div>
      </div>

      <SectionCard title="Reset All Data" subtitle="Returns everything to the starting inventory" icon="trash">
        <div style={{ padding:18 }}>
          <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"13px 16px", marginBottom:16, fontSize:13, color:"#8c1b18", lineHeight:1.7 }}>
            <strong>This erases everything entered since the crosswalk</strong> — claims, revenue,
            projects, work orders, fuel records, roles, users and the audit trail. The catalog returns
            to its 2,375 opening items. It cannot be undone.
          </div>

          <Field label={'Type RESET to confirm'}>
            <input type="text" value={typed} onChange={e=>setTyped(e.target.value)}
              placeholder="RESET" style={{ ...inp, margin:0, width:220, fontFamily:"monospace" }} />
          </Field>

          <button
            disabled={!armed}
            onClick={()=>{
              if (!armed) return;
              try { localStorage.removeItem("pinpoint.db.v1"); localStorage.removeItem("pinpoint.currentUser"); } catch {}
              window.location.reload();
            }}
            style={{ ...btn.danger, marginTop:14, opacity: armed ? 1 : 0.4,
                     cursor: armed ? "pointer" : "not-allowed" }}>
            Erase everything and reload
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
