import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm, DateField, titleCase, MoneyField } from "../components/shared.jsx";
import { useUnsavedForm, useNavigationGuard } from "../components/unsaved.jsx";
import {
  createEmployee, createEmployeeAssignment, createRateChange,
  createFringeProfile, createFringeComponent, createCertification,
  laborRateFor, resolveClassification, rateHistory, payReviewDue,
  RATE_CHANGE_REASONS, DEFAULT_FRINGE_COMPONENTS,
} from "../data/schema.js";
import { AlertBar } from "../components/shared.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}
const today = () => new Date().toISOString().split("T")[0];

// Certifications warn 90 days out (Q27)
const CERT_WARN_DAYS = 90;

function certStatus(cert) {
  if (!cert?.expirationDate) return { state:"none", days:null, label:"No expiry" };
  const days = Math.floor((new Date(cert.expirationDate) - Date.now()) / 864e5);
  if (days < 0)                return { state:"expired", days, label:`Expired ${Math.abs(days)}d ago` };
  if (days <= CERT_WARN_DAYS)  return { state:"expiring", days, label:`${days}d left` };
  return { state:"ok", days, label:`${days}d left` };
}

const CERT_TONE = {
  expired:  { bg:"#fdecea", color:"#8c1b18", border:"#f5c6c6" },
  expiring: { bg:"#fef3cd", color:"#7a4f00", border:"#f0d080" },
  ok:       { bg:"#e6f4ec", color:"#1a5a3a", border:"#a8d5b5" },
  none:     { bg:"#f4f4f2", color:"#888",    border:"#ddd" },
};

function CertBadge({ cert }) {
  const s = certStatus(cert);
  const t = CERT_TONE[s.state];
  return (
    <span style={{ background:t.bg, color:t.color, border:`1px solid ${t.border}`, borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {s.label}
    </span>
  );
}

// Everything expiring or expired across the department
export function certAlerts(employees) {
  const out = [];
  (employees||[]).filter(e => e.active !== false).forEach(e => {
    (e.certifications||[]).forEach(c => {
      const s = certStatus(c);
      if (s.state === "expired" || s.state === "expiring") out.push({ employee:e, cert:c, status:s });
    });
  });
  return out.sort((a,b) => (a.status.days ?? 0) - (b.status.days ?? 0));
}

const displayName = (e) =>
  e.name || [e.firstName, e.lastName].filter(Boolean).join(" ") || "—";

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Employees({ db, dispatch, role = "staff" }) {
  const go = useNavigationGuard();
  const [view, setView]         = useState("people");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Rates are visible to the Superintendent and Office Manager only (Q33).
  const canSeeRates = role === "superintendent" || role === "office_manager";

  const employees = db.employees || [];
  const selected  = employees.find(e => e.id === selectedId);

  const tabs = [
    { id:"people",  label:"Employees",  icon:"users" },
    { id:"certs",   label:"Certifications", icon:"certificate" },
  ].filter(t => !t.adminOnly || canSeeRates);

  if (showForm || editing) {
    const employee = editing ? employees.find(e => e.id === editing) : null;
    return (
      <EmployeeForm
        employee={employee}
        db={db}
        canSeeRates={canSeeRates}
        onSave={payload => {
          dispatch({ type: employee ? "UPDATE_EMPLOYEE" : "ADD_EMPLOYEE", payload });
          setShowForm(false); setEditing(null);
        }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (selected) {
    return (
      <EmployeeDetail
        employee={selected}
        db={db}
        canSeeRates={canSeeRates}
        dispatch={dispatch}
        onBack={() => setSelectedId(null)}
        onEdit={() => { setEditing(selected.id); setSelectedId(null); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:22, borderBottom:"1px solid #ddd" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => go(() => setView(t.id))} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight: view===t.id?700:400, fontSize:13, cursor:"pointer",
            color: view===t.id?"#1a5a3a":"#666",
            borderBottom: view===t.id?"2px solid #1a5a3a":"2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={t.icon} size={13} color={view===t.id?"#1a5a3a":"#888"} />{t.label}
          </button>
        ))}
      </div>

      {view==="people" && (
        <EmployeeList
          employees={employees} canSeeRates={canSeeRates}
          onSelect={setSelectedId} onNew={()=>setShowForm(true)}
        />
      )}
      {view==="certs"  && <CertificationsView employees={employees} onSelect={setSelectedId} />}
    </div>
  );
}

// ── Employee list ─────────────────────────────────────────────────────────────
function EmployeeList({ employees, canSeeRates, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const [showFormer, setShowFormer] = useState(false);

  const current = employees.filter(e => e.active !== false);
  const alerts  = certAlerts(employees);

  const filtered = employees.filter(e => {
    if (!showFormer && e.active === false) return false;
    if (search) {
      const q = search.toLowerCase();
      const cls = resolveClassification(e, today())?.classification || "";
      if (!`${displayName(e)} ${e.employeeNumber} ${cls}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (a.employeeNumber||"").localeCompare(b.employeeNumber||"", undefined, { numeric:true }));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Employees</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            Rates and benefit loading for costing labor. Payroll itself is run by the Clerk's office.
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, number, classification…" style={{ ...inp, width:250, margin:0 }} />
          <button onClick={onNew} style={btn.primary}>+ New Employee</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Current"      value={current.length} sub="Active"      accent="#1a5a3a" icon="users" />
        <KPICard label="Full Time"    value={current.filter(e=>e.employmentType==="full_time").length} sub="" accent="#1a3a5c" icon="user-check" />
        <KPICard label="Part / Seasonal" value={current.filter(e=>e.employmentType!=="full_time").length} sub="" accent="#5a1a8a" icon="user-plus" />
        <KPICard label="Cert Alerts"  value={alerts.length}
          sub={alerts.filter(a=>a.status.state==="expired").length ? `${alerts.filter(a=>a.status.state==="expired").length} expired` : "Within 90 days"}
          accent={alerts.length?"#c0392b":"#888"} icon="alert-triangle" />
      </div>

      {alerts.length > 0 && (
        <div style={{ background:"#fff", border:"2px solid #f0d080", borderRadius:8, padding:15, marginBottom:18 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#7a4f00", marginBottom:9 }}>
            ⚠ {alerts.length} certification{alerts.length!==1?"s":""} expired or expiring within 90 days
          </div>
          {alerts.slice(0,6).map(({ employee, cert, status }) => (
            <div key={`${employee.id}-${cert.id}`}
              onClick={()=>onSelect(employee.id)}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderTop:"1px solid #f4f4f2", cursor:"pointer", fontSize:12 }}>
              <span><strong>{displayName(employee)}</strong> <span style={{ color:"#888" }}>· {cert.type||cert.description||"certification"}</span></span>
              <span style={{ display:"flex", gap:10, alignItems:"center" }}>
                <span style={{ color:"#888", fontFamily:"monospace" }}>{fmtDate(cert.expirationDate)}</span>
                <CertBadge cert={cert} />
              </span>
            </div>
          ))}
          {alerts.length > 6 && <div style={{ fontSize:11, color:"#888", marginTop:8 }}>…and {alerts.length-6} more</div>}
        </div>
      )}

      {employees.length === 0 && (
        <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:20, marginBottom:16, fontSize:13, color:"#1a3a5c", lineHeight:1.6 }}>
          <strong>No employees yet.</strong> Cost Accounting can't record labor until people exist here.
          {canSeeRates && <> Add someone with their hire date, classification and starting wage — that is everything
          needed to cost their time. Later raises go on their Rate tab.</>}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:12, color:"#888" }}>Showing {filtered.length} of {employees.length}</div>
        {employees.some(e=>e.active===false) && (
          <label style={{ fontSize:12, color:"#666", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input type="checkbox" checked={showFormer} onChange={e=>setShowFormer(e.target.checked)} />
            Show former employees
          </label>
        )}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Emp #","Name","Classification","Type",...(canSeeRates?["Rate","Loaded"]:[]),"Certs",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["Rate","Loaded"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={canSeeRates?8:6} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {employees.length===0 ? "No employees yet — click New Employee." : "Nobody matches your filter."}
              </td></tr>
            )}
            {filtered.map((e,i)=>{
              const r = laborRateFor(e, today());
              const certs = (e.certifications||[]).length;
              const bad   = (e.certifications||[]).filter(c=>["expired","expiring"].includes(certStatus(c).state)).length;
              return (
                <tr key={e.id} onClick={()=>onSelect(e.id)}
                  style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer", opacity:e.active===false?0.5:1 }}
                  onMouseEnter={ev=>ev.currentTarget.style.background="#f0f8f4"}
                  onMouseLeave={ev=>ev.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{e.employeeNumber||"—"}</td>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>
                    {displayName(e)}
                    {e.active===false && <span style={{ fontSize:10, color:"#aaa", marginLeft:7 }}>former</span>}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{r.classification||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:"#888", textTransform:"capitalize" }}>{(e.employmentType||"").replace("_"," ")}</td>
                  {canSeeRates && (
                    <>
                      <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", color:r.hourlyRate?"#1a1a1a":"#c0392b" }}>
                        {r.hourlyRate ? fmtSm(r.hourlyRate) : "no scale"}
                      </td>
                      <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>
                        {r.loadedRate ? fmtSm(r.loadedRate) : "—"}
                      </td>
                    </>
                  )}
                  <td style={{ padding:"10px 14px", fontSize:11 }}>
                    {certs === 0 ? <span style={{ color:"#ccc" }}>—</span>
                      : bad > 0
                      ? <span style={{ background:"#fdecea", color:"#8c1b18", border:"1px solid #f5c6c6", borderRadius:99, padding:"1px 8px", fontWeight:700 }}>{bad} of {certs}</span>
                      : <span style={{ color:"#888" }}>{certs} ok</span>}
                  </td>
                  <td style={{ padding:"10px 14px" }}><Icon name="chevron-right" size={14} color="#ccc" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!canSeeRates && (
        <div style={{ fontSize:11, color:"#888", marginTop:10 }}>
          Pay rates are hidden — visible to the Superintendent and Office Manager only.
        </div>
      )}
    </div>
  );
}

// ── Employee detail ───────────────────────────────────────────────────────────
function EmployeeDetail({ employee: e, db, canSeeRates, dispatch, onBack, onEdit }) {
  const go = useNavigationGuard();
  const [tab, setTab] = useState("details");
  const rate = laborRateFor(e, today());
  const unit = (db.equipment||[]).find(u => u.id === e.assignedEquipmentId);

  const TABS = [
    ["details","Details","info-circle"],
    ...(canSeeRates ? [["rate","Rate & Fringe","coin"]] : []),
    ["certs",`Certifications${(e.certifications||[]).length?` (${e.certifications.length})`:""}`,"certificate"],
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:18, flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"5px 12px" }}>← Employees</button>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:11, fontFamily:"monospace", color:"#888" }}>#{e.employeeNumber||"—"}</div>
          <div style={{ fontSize:19, fontWeight:700 }}>{displayName(e)}</div>
          <div style={{ fontSize:13, color:"#666", marginTop:2 }}>
            {rate.classification||"No classification"}
            {e.active===false && <span style={{ color:"#aaa" }}> · former employee</span>}
          </div>
        </div>
        <button onClick={onEdit} style={{ ...btn.small, background:"#1a3a5c" }}>Edit</button>
      </div>

      {canSeeRates && rate.hourlyRate === 0 && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"11px 16px", marginBottom:16, fontSize:12, color:"#8c1b18" }}>
          <strong>No rate resolves for today.</strong> Either no classification is assigned, or no pay scale
          exists for {rate.classification||"their classification"} on or before today. Labor can't be costed until one does.
        </div>
      )}

      <div style={{ display:"flex", borderBottom:"1px solid #ddd", marginBottom:20 }}>
        {TABS.map(([id,label,icon])=>(
          <button key={id} onClick={() => go(() => setTab(id))} style={{ background:"transparent", border:"none", padding:"8px 14px 10px", fontWeight:tab===id?700:400, fontSize:13, cursor:"pointer", color:tab===id?"#1a5a3a":"#666", borderBottom:tab===id?"2px solid #1a5a3a":"2px solid transparent", marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6 }}>
            <Icon name={icon} size={12} color={tab===id?"#1a5a3a":"#888"} />{label}
          </button>
        ))}
      </div>

      {tab==="details" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <SectionCard title="Employee">
            <div style={{ padding:"0 2px" }}>
              {[
                ["Employee #", e.employeeNumber||"—"],
                ["Name", displayName(e)],
                ["Employment", (e.employmentType||"").replace("_"," ")],
                ["Hired", fmtDate(e.hireDate)],
                ...(e.endDate ? [["Left", fmtDate(e.endDate)]] : []),
                ["Phone", e.phone||"—"],
                ["Email", e.email||"—"],
                ["Assigned Equipment", unit ? `${unit.unitNumber} — ${[unit.year,unit.make,unit.model].filter(Boolean).join(" ")}` : "—"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, gap:12 }}>
                  <span style={{ color:"#666", whiteSpace:"nowrap" }}>{k}</span>
                  <span style={{ fontWeight:600, textAlign:"right", textTransform:k==="Employment"?"capitalize":"none" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:10, color:"#aaa", marginTop:12, lineHeight:1.5 }}>
              Social security numbers, home addresses and dates of birth are deliberately not stored.
            </div>
          </SectionCard>

          <SectionCard title="Emergency Contact">
            <div style={{ padding:"0 2px" }}>
              {[
                ["Name", e.emergencyContact?.name||"—"],
                ["Relationship", e.emergencyContact?.relationship||"—"],
                ["Phone", e.emergencyContact?.phone||"—"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
            {e.notes && <div style={{ padding:"12px 0 0", fontSize:13, color:"#555", lineHeight:1.6 }}>{e.notes}</div>}
          </SectionCard>
        </div>
      )}

      {tab==="rate" && canSeeRates && <RateTab employee={e} db={db} dispatch={dispatch} />}
      {tab==="certs" && <CertsTab employee={e} db={db} dispatch={dispatch} />}
    </div>
  );
}

// ── Rate & fringe ─────────────────────────────────────────────────────────────
function RateTab({ employee: e, db, dispatch }) {
  const [asOf, setAsOf] = useState(today());
  const r = laborRateFor(e, asOf);
  const history = rateHistory(e);
  const due = payReviewDue(e, today());

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const reasons = db?.lookups?.rateChangeReasons || RATE_CHANGE_REASONS;
  const classifications = db?.lookups?.classifications || [];

  const currentClass = resolveClassification(e, today())?.classification || "";
  const blank = () => ({ id:null, effectiveDate: today(), hourlyRate:"", reason:"", note:"",
                         classification: "" });
  const [form, setForm] = useState(blank);
  useUnsavedForm(form, "this rate change");
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const open = (row) => {
    setEditing(row?.id || null);
    setForm(row ? { id:row.id, effectiveDate:row.effectiveDate, hourlyRate:row.hourlyRate,
                    reason:row.reason, note:row.note || "", classification:"" }
                : blank());
    setAdding(true);
  };
  const close = () => { setAdding(false); setEditing(null); setForm(blank()); };

  const canSave = form.effectiveDate && form.hourlyRate !== "" && form.reason;
  const backdated = form.effectiveDate && form.effectiveDate < today();

  // How many labor entries a backdated change would move, worked out before it
  // is saved so the person can see the consequence rather than discover it.
  const wouldRecost = useMemo(() => {
    if (!backdated) return 0;
    return (db.projects || []).reduce((n, p) =>
      n + (p.laborEntries || []).filter(l =>
        l.employeeId === e.id && String(l.date) >= String(form.effectiveDate)).length, 0);
  }, [db.projects, e.id, form.effectiveDate, backdated]);

  const save = () => {
    if (!canSave) return;
    dispatch({ type:"SAVE_RATE_CHANGE", payload:{
      employeeId: e.id,
      change: createRateChange({
        ...(editing ? { id: editing } : {}),
        effectiveDate: form.effectiveDate,
        hourlyRate: Number(form.hourlyRate) || 0,
        reason: form.reason,
        note: form.note,
      }),
      // A promotion is one event. Ticking a new classification writes the
      // assignment alongside the rate row, on the same date, so nobody has to
      // remember to enter it twice.
      assignment: form.classification
        ? createEmployeeAssignment({ effectiveDate: form.effectiveDate, classification: form.classification })
        : null,
    }});
    close();
  };

  const profiles = [...(e.fringeProfiles||[])].sort((a,b)=>(b.effectiveDate||"").localeCompare(a.effectiveDate||""));
  const assignments = [...(e.assignments||[])].sort((a,b)=>(b.effectiveDate||"").localeCompare(a.effectiveDate||""));

  return (
    <div>
      {due && (
        <div style={{ background:"#fff4e0", border:"1px solid #f0d080", borderRadius:8,
                      padding:"11px 15px", marginBottom:16, fontSize:13, color:"#7a4f00" }}>
          <strong>{due.kind}</strong> on {fmtDate(due.date)}
          {due.daysAway >= 0 ? ` — ${due.daysAway} day${due.daysAway===1?"":"s"} away` : " — overdue"}.
          Nothing changes on its own; record the new rate when it is decided.
        </div>
      )}

      <div style={{ display:"flex", alignItems:"flex-end", gap:14, marginBottom:16, flexWrap:"wrap" }}>
        <Field label="Show the rate as of" style={{ minWidth:220 }}>
          <DateField value={asOf} onChange={v => setAsOf(v)} />
        </Field>
        <div style={{ fontSize:12, color:"#888", paddingBottom:9 }}>
          {r.classification || "No classification"}
          {r.rateEffective && <> · in force since {fmtDate(r.rateEffective)}</>}
          {r.rateReason && <> · {r.rateReason}</>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <KPICard label="Straight Time" value={fmtSm(r.hourlyRate)}   sub="Per hour"       accent="#1a3a5c" icon="clock" />
        <KPICard label="Overtime"      value={fmtSm(r.overtimeRate)} sub="1.5× over 40"   accent="#d97706" icon="clock-plus" />
        <KPICard label="Fringe"        value={fmtSm(r.fringePerHour)} sub={`${r.fringePercent.toFixed(1)}% of wage`} accent="#5a1a8a" icon="heart-handshake" />
        <KPICard label="Loaded Rate"   value={fmtSm(r.loadedRate)}   sub="What an hour costs" accent="#1a5a3a" icon="coin" />
      </div>

      <SectionCard
        title="Rate History"
        subtitle="What they are paid, dated. A labor entry uses whatever applied on its own date."
        style={{ marginBottom:20 }}
        action={!adding && <button onClick={()=>open(null)} style={btn.primary}>+ Add a rate change</button>}>

        {adding && (
          <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee", background:"#fafaf8" }}>
            <div style={{ display:"grid", gridTemplateColumns:"240px 130px 1fr", gap:14, marginBottom:12 }}>
              <Field label="Effective" required>
                <DateField value={form.effectiveDate} onChange={v=>set("effectiveDate",v)} />
              </Field>
              <Field label="Hourly rate" required>
                <MoneyField value={form.hourlyRate} onChange={v=>set("hourlyRate",v)} />
              </Field>
              <Field label="Reason" required>
                <select value={form.reason} onChange={ev=>set("reason",ev.target.value)} style={inp}>
                  <option value="">Why is it changing?…</option>
                  {reasons.map(x=><option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:4 }}>
              <Field label="Note">
                <input type="text" value={form.note} onChange={ev=>set("note",ev.target.value)}
                       style={inp} placeholder="Board 8/19, effective 7/1 · 2.5% FY2026" />
              </Field>
              {!editing && (
                <Field label="Also change their classification">
                  <select value={form.classification} onChange={ev=>set("classification",ev.target.value)} style={inp}>
                    <option value="">No change — stays {currentClass || "unset"}</option>
                    {classifications.filter(c=>c!==currentClass).map(c=>(
                      <option key={c} value={c}>{titleCase(c)}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            {form.hourlyRate !== "" && (
              <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                Overtime works out at <strong>{fmtSm((Number(form.hourlyRate)||0) * 1.5)}</strong> — always 1.5×, never typed.
              </div>
            )}

            {backdated && wouldRecost > 0 && (
              <div style={{ marginTop:10 }}>
                <AlertBar type="warning" message={
                  `This is backdated. ${wouldRecost} labor entr${wouldRecost===1?"y":"ies"} on or after ` +
                  `${fmtDate(form.effectiveDate)} will be recosted at the new rate.`} />
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginTop:12 }}>
              <button onClick={save} disabled={!canSave}
                      style={{ ...btn.primary, opacity:canSave?1:0.4, cursor:canSave?"pointer":"not-allowed" }}>
                {editing ? "Save change" : "Add rate change"}
              </button>
              <button onClick={close} style={btn.ghost}>Cancel</button>
            </div>
          </div>
        )}

        <Table
          headers={[{label:"Effective"},{label:"Rate",right:true},{label:"Change",right:true},
                    {label:"Overtime",right:true},{label:"Reason"},{label:"Note"},{label:""},{label:""}]}
          rows={history.map(row=>[
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(row.effectiveDate)}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(row.hourlyRate)}</span>,
            <span style={{ fontFamily:"monospace", color: row.change === null ? "#ccc" : row.change > 0 ? "#1a6b35" : "#c0392b" }}>
              {row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}`}
            </span>,
            <span style={{ fontFamily:"monospace", color:"#888" }}>{fmtSm(row.overtimeRate)}</span>,
            <span style={{ fontSize:12 }}>{row.reason || "—"}</span>,
            <span style={{ fontSize:12, color:"#888" }}>{row.note || ""}</span>,
            <button style={btn.ghostSm} onClick={()=>open(row)}>Edit</button>,
            <button style={btn.ghostSm}
              onClick={()=>dispatch({ type:"DELETE_RATE_CHANGE", payload:{ employeeId:e.id, id:row.id } })}>
              Remove
            </button>,
          ])}
          emptyMessage="No rate recorded — labor for this person cannot be costed"
        />
      </SectionCard>

      {r.fringeLines.length > 0 && (
        <SectionCard title="Fringe Breakdown" subtitle={`Per hour at ${fmtSm(r.hourlyRate)} straight time`} style={{ marginBottom:20 }}>
          <Table
            headers={[{label:"Component"},{label:"Percent",right:true},{label:"Flat $/hr",right:true},{label:"Per Hour",right:true}]}
            rows={r.fringeLines.filter(l=>l.amount>0).map(l=>[
              l.name,
              <span style={{ fontFamily:"monospace", color:"#888" }}>{l.percent?`${l.percent}%`:"—"}</span>,
              <span style={{ fontFamily:"monospace", color:"#888" }}>{l.flatHourly?fmtSm(l.flatHourly):"—"}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600 }}>{fmtSm(l.amount)}</span>,
            ])}
          />
          <div style={{ fontSize:11, color:"#888", padding:"10px 14px 0" }}>
            Total fringe <strong>{fmtSm(r.fringePerHour)}</strong> per hour. The same figure is used for FEMA reporting.
          </div>
        </SectionCard>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <SectionCard title="Classification History" subtitle="What they do. Promotions add a row rather than overwriting.">
          <Table
            headers={[{label:"Effective"},{label:"Classification"},{label:"Notes"}]}
            rows={assignments.map(a=>[
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(a.effectiveDate)}</span>,
              <span style={{ fontWeight:600 }}>{a.classification||"—"}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{a.notes||"—"}</span>,
            ])}
            emptyMessage="No classification assigned"
          />
        </SectionCard>

        <SectionCard title="Fringe History" subtitle="Changes when insurance or service years change">
          <Table
            headers={[{label:"Effective"},{label:"Components"},{label:"Notes"}]}
            rows={profiles.map(p=>[
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(p.effectiveDate)}</span>,
              <span>{(p.components||[]).filter(c=>c.percent||c.flatHourly).length} active</span>,
              <span style={{ fontSize:12, color:"#888" }}>{p.notes||"—"}</span>,
            ])}
            emptyMessage="No fringe profile — only base wage will be costed"
          />
        </SectionCard>
      </div>
    </div>
  );
}

// ── Certifications ────────────────────────────────────────────────────────────
function CertsTab({ employee: e, db, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const types = db?.lookups?.certificationTypes || [];
  const blank = { type:"", certificateNumber:"", issuedDate:"", expirationDate:"", notes:"" };
  const [form, setForm] = useState(blank);
  useUnsavedForm(form, "this certification");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // A renewal EDITS IN PLACE. Greg's call: one record per certification, dates
  // updated when the card is renewed, and the 90-day warning follows the new
  // expiry. There was no way back into a record once written, so a mistyped
  // expiry date warned forever and a renewed CDL needed a duplicate row.
  const open = (cert) => {
    setEditing(cert?.id || null);
    setForm(cert ? { type:cert.type||"", certificateNumber:cert.certificateNumber||"",
                     issuedDate:cert.issuedDate||"", expirationDate:cert.expirationDate||"",
                     notes:cert.notes||"" } : blank);
    setShowForm(true);
  };
  const close = () => { setShowForm(false); setEditing(null); setForm(blank); };

  const save = () => {
    if (!form.type) return;
    const list = e.certifications || [];
    const next = editing
      ? list.map(c => c.id === editing ? { ...c, ...form } : c)
      : [...list, createCertification({ ...form, employeeId:e.id })];
    dispatch({ type:"UPDATE_EMPLOYEE", payload:{ ...e, certifications: next } });
    close();
  };
  const remove = (id) =>
    dispatch({ type:"UPDATE_EMPLOYEE", payload:{ ...e, certifications:(e.certifications||[]).filter(c=>c.id!==id) } });

  const certs = [...(e.certifications||[])].sort((a,b)=>(a.expirationDate||"9999").localeCompare(b.expirationDate||"9999"));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:12, color:"#888" }}>
          Warned 90 days before expiry. Renewing a card edits the record rather than adding a second one.
        </div>
        <button onClick={()=>showForm ? close() : open(null)} style={btn.primary}>
          {showForm ? "Cancel" : "+ Add Certification"}
        </button>
      </div>

      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Type" required>
              <select value={form.type} onChange={ev=>set("type",ev.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Select…</option>
                {types.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
            <Field label="Number"><input type="text" value={form.certificateNumber} onChange={ev=>set("certificateNumber",ev.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Issued"><DateField value={form.issuedDate} onChange={v => set("issuedDate", v)} /></Field>
            <Field label="Expires"><DateField value={form.expirationDate} onChange={v => set("expirationDate", v)} /></Field>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <Field label="Notes" style={{ flex:1 }}><input type="text" value={form.notes} onChange={ev=>set("notes",ev.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <button onClick={save} style={{ ...btn.primary, marginTop:20 }}>
              {editing ? "Save changes" : "Add"}
            </button>
          </div>
        </div>
      )}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Type","Number","Issued","Expires","Status",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {certs.length===0 && (
              <tr><td colSpan={6} style={{ padding:28, textAlign:"center", color:"#aaa", fontSize:13 }}>No certifications recorded</td></tr>
            )}
            {certs.map((c,i)=>(
              <tr key={c.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={{ padding:"9px 14px", fontWeight:600 }}>{c.type||"—"}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{c.certificateNumber||"—"}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(c.issuedDate)}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(c.expirationDate)}</td>
                <td style={{ padding:"9px 14px" }}><CertBadge cert={c} /></td>
                <td style={{ padding:"9px 14px", textAlign:"right", whiteSpace:"nowrap" }}>
                  <button onClick={()=>open(c)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"3px 9px", marginRight:5 }}>
                    Edit
                  </button>
                  <button onClick={()=>remove(c.id)} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 9px" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Department-wide certifications ────────────────────────────────────────────
function CertificationsView({ employees, onSelect }) {
  const rows = [];
  employees.filter(e=>e.active!==false).forEach(e =>
    (e.certifications||[]).forEach(c => rows.push({ employee:e, cert:c, status:certStatus(c) })));
  rows.sort((a,b)=>(a.cert.expirationDate||"9999").localeCompare(b.cert.expirationDate||"9999"));

  const expired  = rows.filter(r=>r.status.state==="expired").length;
  const expiring = rows.filter(r=>r.status.state==="expiring").length;

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:700 }}>Certifications</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Across everyone currently employed. Warned 90 days out.</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Tracked"  value={rows.length} sub="Certifications" accent="#1a3a5c" icon="certificate" />
        <KPICard label="Expiring" value={expiring} sub="Within 90 days"   accent={expiring?"#d97706":"#888"} icon="clock" />
        <KPICard label="Expired"  value={expired}  sub="Need renewal"     accent={expired?"#c0392b":"#888"} icon="alert-circle" />
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Employee","Type","Number","Expires","Status"].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={5} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>Nothing tracked yet</td></tr>
            )}
            {rows.map(({ employee, cert, status },i)=>(
              <tr key={`${employee.id}-${cert.id}`} onClick={()=>onSelect(employee.id)}
                style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                <td style={{ padding:"9px 14px", fontWeight:600 }}>{displayName(employee)}</td>
                <td style={{ padding:"9px 14px" }}>{cert.type||"—"}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{cert.certificateNumber||"—"}</td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(cert.expirationDate)}</td>
                <td style={{ padding:"9px 14px" }}><CertBadge cert={cert} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Employee form ─────────────────────────────────────────────────────────────
function EmployeeForm({ employee, db, canSeeRates, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    const base = employee ? { ...employee } : createEmployee();
    if (!base.emergencyContact) base.emergencyContact = { name:"", relationship:"", phone:"" };
    if (!Array.isArray(base.assignments))    base.assignments = [];
    if (!Array.isArray(base.fringeProfiles)) base.fringeProfiles = [];
    if (!Array.isArray(base.rateHistory))    base.rateHistory = [];
    return base;
  });
  useUnsavedForm(form, "this employee");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Hiring somebody is ONE event: name, hire date, classification, starting
  // wage. The rate history lives on the Rate tab, which is right for a raise
  // three years later and wrong for the first number — it meant saving the
  // person, finding them again, opening another tab, and only then being able
  // to say what they earn.
  //
  // Shown only until there IS a rate. After that the Rate tab owns it, because
  // two places to edit the same number is how they end up disagreeing.
  const noRateYet = (form.rateHistory || []).length === 0;
  const [startingWage, setStartingWage] = useState("");
  const setEC = (k,v) => setForm(f=>({ ...f, emergencyContact:{ ...(f.emergencyContact||{}), [k]:v } }));

  const classifications = db?.lookups?.classifications || [];
  const equipment = (db.equipment||[]).filter(u=>u.status!=="sold");

  const addAssignment = () =>
    set("assignments", [...(form.assignments||[]), createEmployeeAssignment()]);
  const setAssignment = (id,k,v) =>
    set("assignments", (form.assignments||[]).map(a=>a.id===id?{...a,[k]:v}:a));
  const removeAssignment = (id) =>
    set("assignments", (form.assignments||[]).filter(a=>a.id!==id));

  const addProfile = () =>
    set("fringeProfiles", [...(form.fringeProfiles||[]), createFringeProfile()]);
  const setProfileField = (id,k,v) =>
    set("fringeProfiles", (form.fringeProfiles||[]).map(p=>p.id===id?{...p,[k]:v}:p));
  const setComponent = (pid,cid,k,v) =>
    set("fringeProfiles", (form.fringeProfiles||[]).map(p=>p.id!==pid?p:{
      ...p, components:(p.components||[]).map(c=>c.id===cid?{...c,[k]:v===""?0:Number(v)}:c) }));
  const removeProfile = (id) =>
    set("fringeProfiles", (form.fringeProfiles||[]).filter(p=>p.id!==id));

  const handleSave = () => {
    const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || form.name;
    // The starting wage becomes the first row of the rate history, dated to the
    // hire date, so the reason list can anchor the six-month review to it.
    const rateHistory = (noRateYet && startingWage !== "")
      ? [createRateChange({
          effectiveDate: form.hireDate || today(),
          hourlyRate: Number(startingWage) || 0,
          reason: "Starting wage",
        })]
      : form.rateHistory;
    onSave({ ...form, name, rateHistory });
  };

  const valid = (form.firstName || form.lastName || form.name) && form.employeeNumber;

  return (
    <div style={{ maxWidth:860 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700 }}>{employee?"Edit Employee":"New Employee"}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr 1.5fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Employee #" required>
            <input type="text" value={form.employeeNumber} onChange={e=>set("employeeNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="First Name" required>
            <input type="text" value={form.firstName} onChange={e=>set("firstName",e.target.value)} style={inp} />
          </Field>
          <Field label="Last Name" required>
            <input type="text" value={form.lastName} onChange={e=>set("lastName",e.target.value)} style={inp} />
          </Field>
          <Field label="Employment">
            <select value={form.employmentType} onChange={e=>set("employmentType",e.target.value)} style={inp}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="seasonal">Seasonal</option>
            </select>
          </Field>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Hired"><DateField value={form.hireDate} onChange={v => set("hireDate", v)} /></Field>
          <Field label="Phone"><input type="text" value={form.phone} onChange={e=>set("phone",e.target.value)} style={inp} /></Field>
          <Field label="Email"><input type="text" value={form.email} onChange={e=>set("email",e.target.value)} style={inp} /></Field>
          <Field label="Assigned Equipment">
            <select value={form.assignedEquipmentId||""} onChange={e=>set("assignedEquipmentId",e.target.value||null)} style={inp}>
              <option value="">None</option>
              {equipment.map(u=><option key={u.id} value={u.id}>{u.unitNumber} — {[u.year,u.make,u.model].filter(Boolean).join(" ")}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:6, padding:"9px 12px", marginBottom:16, fontSize:11, color:"#1a3a5c" }}>
          Social security numbers, home addresses and dates of birth are deliberately not collected.
        </div>

        {/* ── Starting wage ──────────────────────────────────────────────
            Only while there is no rate yet. Once one exists the Rate tab owns
            it, so the same number is never editable in two places. */}
        {canSeeRates && noRateYet && (
          <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:4 }}>Starting Wage</div>
            <div style={{ fontSize:11, color:"#888", marginBottom:11 }}>
              What they are paid on their hire date. Every later change — the six-month review,
              anniversaries, a COLA — goes on their Rate tab, so past work keeps the rate that applied then.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"150px 1fr", gap:14, alignItems:"end" }}>
              <Field label="Hourly rate">
                <MoneyField value={startingWage} onChange={v=>setStartingWage(v)} />
              </Field>
              <div style={{ fontSize:12, color:"#888", paddingBottom:10 }}>
                {startingWage === ""
                  ? "Leave blank and add it later on the Rate tab — but their time cannot be costed until it is set."
                  : <>Recorded as <strong>Starting wage</strong> effective{" "}
                     <strong>{form.hireDate ? fmtDate(form.hireDate) : "today"}</strong>.
                     Overtime works out at <strong>{fmtSm((Number(startingWage)||0) * 1.5)}</strong>.</>}
              </div>
            </div>
          </div>
        )}

        {/* Classification history */}
        {canSeeRates && (
          <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#555" }}>Classification History</div>
              <button onClick={addAssignment} style={{ ...btn.secondary, fontSize:11, padding:"5px 11px" }}>+ Add</button>
            </div>
            <div style={{ fontSize:11, color:"#888", marginBottom:11 }}>
              What they do, dated. A promotion adds a row from its effective date rather than overwriting,
              so past labor keeps the classification that applied then. Pay is separate — it lives on the
              Rate tab, because two people in the same classification can be on different steps.
            </div>
            {(form.assignments||[]).length===0 && (
              <div style={{ fontSize:12, color:"#c0392b", padding:"6px 0" }}>
                None yet — labor can't be costed without at least one classification.
              </div>
            )}
            {(form.assignments||[]).map(a=>(
              // A date needs ROOM. This row used to give it 1fr — about 104px —
              // while DateField renders a text input plus a Today button plus a
              // calendar caret inside it. The buttons took ~97px and left seven
              // pixels to type into, which is why the date "did not work".
              <div key={a.id} style={{ display:"grid", gridTemplateColumns:"210px 1.4fr 2fr 34px", gap:10, alignItems:"end", marginBottom:8 }}>
                <Field label="Effective"><DateField value={a.effectiveDate} onChange={v => setAssignment(a.id,"effectiveDate", v)} /></Field>
                <Field label="Classification">
                  <select value={a.classification} onChange={e=>setAssignment(a.id,"classification",e.target.value)} style={{ ...inp, margin:0 }}>
                    <option value="">Select…</option>
                    {classifications.map(c=><option key={c} value={c}>{titleCase(c)}</option>)}
                  </select>
                </Field>
                <Field label="Notes"><input type="text" value={a.notes} onChange={e=>setAssignment(a.id,"notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
                <button onClick={()=>removeAssignment(a.id)} style={{ ...btn.danger, padding:"7px 0", fontSize:14, height:34 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Fringe */}
        {canSeeRates && (
          <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#555" }}>Fringe Profiles</div>
              <button onClick={addProfile} style={{ ...btn.secondary, fontSize:11, padding:"5px 11px" }}>+ Add Profile</button>
            </div>
            <div style={{ fontSize:11, color:"#888", marginBottom:11 }}>
              Fringe varies by person — insurance elections and years of service. Add a new profile when it
              changes rather than editing the old one, so past costs stay correct.
            </div>
            {(form.fringeProfiles||[]).map(p=>(
              <div key={p.id} style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:14, marginBottom:10 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 34px", gap:10, alignItems:"end", marginBottom:12 }}>
                  <Field label="Effective From"><DateField value={p.effectiveDate} onChange={v => setProfileField(p.id,"effectiveDate", v)} /></Field>
                  <Field label="Notes"><input type="text" value={p.notes} onChange={e=>setProfileField(p.id,"notes",e.target.value)} style={{ ...inp, margin:0 }} placeholder="e.g. family plan, 10 yr service" /></Field>
                  <button onClick={()=>removeProfile(p.id)} style={{ ...btn.danger, padding:"7px 0", fontSize:14, height:34 }}>×</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10 }}>
                  {(p.components||[]).map(c=>(
                    <div key={c.id} style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ fontSize:11, flex:1, color:"#555" }}>{c.name}</span>
                      <input type="number" min="0" step="0.01" value={c.percent||""} onChange={e=>setComponent(p.id,c.id,"percent",e.target.value)}
                        style={{ ...inp, margin:0, width:56, fontFamily:"monospace", fontSize:11, padding:"4px 6px" }} placeholder="%" title="Percent of wage" />
                      <MoneyField value={c.flatHourly||""} onChange={v=>setComponent(p.id,c.id,"flatHourly",v)} placeholder="$/hr" style={{ ...inp, margin:0, width:60, fontFamily:"monospace", fontSize:11, padding:"4px 6px" }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Emergency contact */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:14, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:10 }}>Emergency Contact</div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16 }}>
            <Field label="Name"><input type="text" value={form.emergencyContact?.name||""} onChange={e=>setEC("name",e.target.value)} style={inp} /></Field>
            <Field label="Relationship"><input type="text" value={form.emergencyContact?.relationship||""} onChange={e=>setEC("relationship",e.target.value)} style={inp} /></Field>
            <Field label="Phone"><input type="text" value={form.emergencyContact?.phone||""} onChange={e=>setEC("phone",e.target.value)} style={inp} /></Field>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="End Date"><DateField value={form.endDate} onChange={v => set("endDate", v)} /></Field>
          <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, paddingTop:20 }}>
            <input type="checkbox" checked={form.active !== false} onChange={e=>set("active",e.target.checked)} />
            Current employee <span style={{ color:"#888", fontSize:12 }}>— unchecking keeps history but hides them</span>
          </label>
        </div>

        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} disabled={!valid} style={{ ...btn.primary, opacity: valid?1:0.4 }}>
          {employee?"Save Changes":"Add Employee"}
        </button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
