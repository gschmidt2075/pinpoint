import { useState } from "react";
import { Field, Table, KPICard, inp, btn, fmtSm, DateField, titleCase } from "../../components/shared.jsx";
import { createWorkOrder, createPMSchedule, PM_PRESETS, PM_PRESET_LABELS } from "../../data/schema.js";
import { lifetimeMeter, today, fmtDate, PM_TASKS } from "./shared.jsx";

// ── Preventive maintenance ────────────────────────────────────────────────────
// A rule, not a job: every 250 hours, or every 6 months, do this. Whichever
// threshold arrives first triggers the service. The work order that results is
// the WorkOrders module's business, not this one's.

const DEFAULT_WARN = { hours: 25, miles: 500, months: 1 };

// Whichever comes first.
//
// A service can carry a meter threshold, a calendar threshold, or both. Each is
// worked out separately and the nearer one decides — a grader that sat all
// winter is due on months even though the hour meter never moved, and one
// working flat out is due on hours long before six months are up.

const DEFAULT_WARN_DAYS = 21;

export function pmStatus(unit, sched) {
  if (!sched || sched.active === false) return null;
  const byMeter = Number(sched.interval) > 0;
  const byDate  = Number(sched.intervalMonths) > 0;
  if (!byMeter && !byDate) return null;

  const parts = [];

  if (byMeter) {
    if (sched.lastDoneMeter === null || sched.lastDoneMeter === undefined) {
      parts.push({ kind:"meter", state:"unknown", label:"No baseline reading", remaining:null });
    } else {
      const warn = Number(sched.warnAhead) || DEFAULT_WARN[sched.intervalType] || 0;
      const dueAt = Number(sched.lastDoneMeter) + Number(sched.interval);
      const remaining = dueAt - lifetimeMeter(unit);
      const u = sched.intervalType === "miles" ? "mi" : "hr";
      parts.push({
        kind:"meter", dueAt, remaining, unit:u,
        state: remaining < 0 ? "overdue" : remaining <= warn ? "due" : "ok",
        label: remaining < 0
          ? `${Math.abs(remaining).toLocaleString()} ${u} overdue`
          : `${remaining.toLocaleString()} ${u} to go`,
      });
    }
  }

  if (byDate) {
    if (!sched.lastDoneDate) {
      parts.push({ kind:"date", state:"unknown", label:"Never done", remaining:null });
    } else {
      const warnDays = Number(sched.warnAheadDays) || DEFAULT_WARN_DAYS;
      const due = new Date(sched.lastDoneDate);
      due.setMonth(due.getMonth() + Number(sched.intervalMonths));
      const days = Math.round((due - Date.now()) / 864e5);
      parts.push({
        kind:"date", dueDate: due.toISOString().split("T")[0], days,
        state: days < 0 ? "overdue" : days <= warnDays ? "due" : "ok",
        label: days < 0 ? `${Math.abs(days)} days overdue` : `${days} days to go`,
      });
    }
  }

  // The worst state wins, and among equals the nearer one.
  const rank = { overdue:0, due:1, unknown:2, ok:3 };
  const driver = parts.slice().sort((a,b) => rank[a.state] - rank[b.state])[0];

  return {
    ...driver,
    // Both thresholds, so the screen can show why it is due and what the other
    // one says — "250 hr to go, but 12 days overdue on the calendar".
    parts,
    state: driver.state,
    label: driver.label,
    remaining: driver.kind === "meter" ? driver.remaining : driver.days,
    dueAt: parts.find(p => p.kind === "meter")?.dueAt,
    dueDate: parts.find(p => p.kind === "date")?.dueDate,
    drivenBy: driver.kind,
  };
}

// Every schedule across the fleet that wants attention, worst first.

export function pmDueList(equipment) {
  const out = [];
  (equipment || []).forEach(unit => {
    if (unit.status === "sold") return;
    (unit.pmSchedule || []).forEach(sched => {
      const st = pmStatus(unit, sched);
      if (st && (st.state === "overdue" || st.state === "due")) out.push({ unit, sched, status: st });
    });
  });
  return out.sort((a, b) => {
    if (a.status.state !== b.status.state) return a.status.state === "overdue" ? -1 : 1;
    return (a.status.remaining ?? 0) - (b.status.remaining ?? 0);
  });
}

const PM_TONE = {
  overdue: { color:"#c0392b", bg:"#fdecea", border:"#f5c6c6", icon:"⚠" },
  due:     { color:"#d97706", bg:"#fef3cd", border:"#f0d080", icon:"◷" },
  ok:      { color:"#1a6b35", bg:"#e6f4ec", border:"#a8d5b5", icon:"✓" },
  unknown: { color:"#888",    bg:"#f4f4f2", border:"#ddd",    icon:"–" },
};

export function PMBadge({ status }) {
  if (!status) return null;
  const t = PM_TONE[status.state] || PM_TONE.unknown;
  return (
    <span style={{ background:t.bg, color:t.color, border:`1px solid ${t.border}`, borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {t.icon} {status.label}
    </span>
  );
}

// ── FIFO helpers ──────────────────────────────────────────────────────────────
// Same rules as the Inventory module: oldest batch by receipt date depletes first.

const PM_COLS = "1.8fr 0.7fr 0.9fr 0.9fr 34px";

// What the system knows about a service, as opposed to what you told it.
//
// This is deliberately NOT a set of form fields. Closing a PM work order stamps
// the reading and the date; showing them as editable boxes made a set-once
// thing look like a chore to be done at every service. It reads as status, with
// one way in to correct the starting point when a schedule is first created.

function PMRowStatus({ row, status, meterType, onChange }) {
  const [correcting, setCorrecting] = useState(false);
  const u = row.intervalType === "miles" ? "mi" : "hr";
  const never = !row.lastDoneMeter && !row.lastDoneDate;

  const tone = { overdue:"#c0392b", due:"#d97706", unknown:"#888", ok:"#1a5a3a" }[status?.state] || "#888";

  if (correcting) {
    return (
      <div style={{ display:"flex", gap:8, alignItems:"flex-end", marginTop:8, background:"#f7f7f5", border:"1px solid #e4e4e0", borderRadius:6, padding:"10px 12px" }}>
        <Field label={`Last done at (${u})`}>
          <input type="number" min="0" step="any" value={row.lastDoneMeter ?? ""}
            onChange={e=>onChange(row.id,"lastDoneMeter", e.target.value === "" ? null : (parseFloat(e.target.value)||0))}
            placeholder="unknown" style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace", width:130 }} />
        </Field>
        <Field label="On">
          <DateField value={row.lastDoneDate||""} onChange={v=>onChange(row.id,"lastDoneDate",v)} />
        </Field>
        <button type="button" onClick={()=>setCorrecting(false)} style={{ ...btn.ghost, fontSize:11, padding:"6px 12px" }}>Done</button>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:6, fontSize:11, flexWrap:"wrap" }}>
      <span style={{ color:tone, fontWeight:700 }}>
        {never ? "Not started" : status?.label || "—"}
      </span>
      {!never && (
        <span style={{ color:"#999" }}>
          last done
          {row.lastDoneMeter != null ? ` at ${Number(row.lastDoneMeter).toLocaleString()} ${u}` : ""}
          {row.lastDoneDate ? ` on ${fmtDate(row.lastDoneDate)}` : ""}
        </span>
      )}
      {/* When both thresholds are set, say what the other one thinks — "due on
          hours, but the calendar has another 40 days" is the useful sentence. */}
      {status?.parts?.length > 1 && (
        <span style={{ color:"#bbb" }}>
          · {status.parts.filter(p => p.kind !== status.drivenBy).map(p => p.label).join(" · ")}
        </span>
      )}
      <button type="button" onClick={()=>setCorrecting(true)}
        style={{ background:"none", border:"none", color:"#1a3a5c", fontSize:11, cursor:"pointer", textDecoration:"underline", padding:0 }}>
        {never ? "set a starting point" : "correct"}
      </button>
      <span style={{ color:"#ccc" }}>· kept up to date by closing work orders</span>
    </div>
  );
}

// The services that actually get scheduled, offered as a shortcut. Typing
// anything else is fine — this is a list of suggestions, not a set of choices.

const PM_SERVICE_OPTIONS = [...new Set(
  Object.values(PM_PRESETS).flat().map(p => p.service)
)].map(v => ({ value: v, label: v }));

export function PMScheduleEditor({ form, set }) {
  const rows = form.pmSchedule || [];
  const unitWord = form.meterType === "miles" ? "miles" : "hours";

  const add    = (preset) => set("pmSchedule", [...rows, createPMSchedule({ equipmentId: form.id, ...preset })]);
  const change = (id, field, value) => set("pmSchedule", rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  const remove = (id) => set("pmSchedule", rows.filter(r => r.id !== id));

  const applyPreset = (key) => {
    const preset = PM_PRESETS[key] || [];
    set("pmSchedule", [
      ...rows,
      ...preset
        .filter(p => !rows.some(r => r.service === p.service))
        .map(p => createPMSchedule({ equipmentId: form.id, ...p })),
    ]);
  };

  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>
            Preventive Maintenance Intervals
          </div>
          <div style={{ fontSize:11, color:"#888", marginTop:3 }}>
            What drives the PM Due list. A machine can have several — 250, 500 and 1000 {unitWord} are different jobs.
          </div>
        </div>
        <button type="button" onClick={()=>add({ intervalType: form.meterType || "hours" })}
          style={{ ...btn.ghost, fontSize:11, padding:"4px 10px" }}>+ Interval</button>
      </div>

      {rows.length === 0 && (
        <div style={{ background:"#f7f7f5", border:"1px dashed #ccc", borderRadius:6, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#666", marginBottom:8 }}>
            No intervals set, so this machine will never appear on the PM Due list. Start from a standard set:
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.keys(PM_PRESETS).map(k=>(
              <button key={k} type="button" onClick={()=>applyPreset(k)}
                style={{ ...btn.small, background:"#f0f0ee", color:"#555", fontSize:11 }}>
                {PM_PRESET_LABELS?.[k] || k.replace(/_/g," ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Column headings sit in their own row. Rendering them inside the first
          data row put eleven things into a six-column grid and mangled it. */}
      <datalist id="pm-service-options">
        {PM_SERVICE_OPTIONS.map(o=><option key={o.value} value={o.value} />)}
      </datalist>

      {rows.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:PM_COLS, gap:8, marginBottom:4 }}>
          {["Service","Every","","Or Every",""].map((h,n)=>(
            <div key={n} style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"#aaa" }}>{h}</div>
          ))}
        </div>
      )}

      {rows.map((r) => {
        const st = pmStatus(form, r);
        return (
          <div key={r.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:"1px solid #f4f4f2" }}>
            <div style={{ display:"grid", gridTemplateColumns:PM_COLS, gap:8, alignItems:"center" }}>
              {/* Suggestions, not a fixed list — the shop names services its own way. */}
              <input type="text" list="pm-service-options" value={r.service||""}
                onChange={e=>change(r.id,"service",e.target.value)}
                placeholder="Name the service…" style={{ ...inp, margin:0, fontSize:12 }} />
              <input type="number" min="0" step="any" value={r.interval||""}
                onChange={e=>change(r.id,"interval",parseFloat(e.target.value)||0)}
                placeholder="0" style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace" }} />
              <select value={r.intervalType||"hours"} onChange={e=>change(r.id,"intervalType",e.target.value)}
                style={{ ...inp, margin:0, fontSize:12 }}>
                <option value="hours">Hours</option>
                <option value="miles">Miles</option>
              </select>
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <input type="number" min="0" step="1" value={r.intervalMonths||""}
                  onChange={e=>change(r.id,"intervalMonths",parseFloat(e.target.value)||0)}
                  placeholder="0" style={{ ...inp, margin:0, fontSize:12, fontFamily:"monospace", width:"100%" }} />
                <span style={{ fontSize:11, color:"#888" }}>mo</span>
              </div>
              <button type="button" onClick={()=>remove(r.id)} title="Remove this service"
                style={{ ...btn.ghost, padding:"7px 0", fontSize:13, color:"#c0392b", borderColor:"#f0d0d0" }}>×</button>
            </div>

            {/* Kept by the system, not typed — shown so it can be checked, and
                correctable once at setup. It is not a field to maintain. */}
            <PMRowStatus row={r} status={st} meterType={form.meterType} onChange={change} />
          </div>
        );
      })}

      {rows.length > 0 && (
        <div style={{ fontSize:11, color:"#888", marginTop:10, lineHeight:1.65 }}>
          <strong>Set these once.</strong> Fill in one or both — whichever comes first triggers the
          service. Leave <em>Every</em> blank for a purely calendar job like an annual inspection, or
          leave <em>Or every … mo</em> blank for one that only depends on use.
        </div>
      )}
    </div>
  );
}

// ── PM Due — batch work order creation ────────────────────────────────────────
// A PM is a work order like any other: parts come out of inventory, labor is
// costed, and it rolls into the unit's operating cost. What makes the volume
// workable is that entry is batched — the shop does six oil changes on a Tuesday
// and that's one screen, not six forms.

export function PMDueTab({ units, dispatch, onOpen }) {
  const due = pmDueList(units);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], reportedBy:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const overdue = due.filter(d => d.status.state === "overdue");
  const key = (d) => `${d.unit.id}::${d.sched.id}`;
  const toggle = (d) => setSelected(s => s.includes(key(d)) ? s.filter(x=>x!==key(d)) : [...s, key(d)]);
  const chosen = due.filter(d => selected.includes(key(d)));

  const createBatch = () => {
    if (!chosen.length) return;
    const ids = [];
    chosen.forEach((d, i) => {
      const wo = createWorkOrder({
        workOrderNumber: "",   // assigned on save, one series across the fleet
        unitId:          d.unit.id,
        unitNumber:      d.unit.unitNumber || "",
        unitDescription: [d.unit.year, d.unit.make, d.unit.model].filter(Boolean).join(" "),
        description:     d.sched.service,
        category:        "preventive",
        priority:        d.status.state === "overdue" ? "urgent" : "routine",
        openedDate:      form.date,
        meterReadingOpen: lifetimeMeter(d.unit),
        pmScheduleId:    d.sched.id,
        pmService:       d.sched.service,
        reportedBy:      form.reportedBy,
        notes:           form.notes,
      });
      ids.push(wo.id);
      dispatch({ type:"ADD_WORK_ORDER", payload: wo });
    });
    setSelected([]);
    setForm(f => ({ ...f, notes:"" }));
    // One selected? Go straight into it so parts can be added.
    if (ids.length === 1) onOpen(ids[0]);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Preventive Maintenance Due</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            Driven by meter readings. Tick what's been done and raise the work orders in one go.
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Coming Due" value={due.length - overdue.length} sub="Within the warning window" accent="#d97706" icon="clock" />
        <KPICard label="Overdue"    value={overdue.length}             sub="Past the interval"         accent={overdue.length?"#c0392b":"#888"} icon="alert-triangle" />
        <KPICard label="Selected"   value={chosen.length}              sub="Ready to raise"            accent={chosen.length?"#1a5a3a":"#888"} icon="clipboard-check" />
      </div>

      {due.length === 0 && (
        <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:8, padding:28, textAlign:"center", color:"#1a5a3a", fontSize:13 }}>
          ✓ Nothing due. Warnings appear as meter readings come in — logging fuel updates them automatically.
        </div>
      )}

      {due.length > 0 && (
        <>
          {/* Batch entry */}
          <div style={{ background: chosen.length ? "#f0f8f4" : "#f7f7f5", border:`1px solid ${chosen.length?"#a8d5b5":"#ddd"}`, borderRadius:8, padding:16, marginBottom:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr 2fr auto", gap:12, alignItems:"end" }}>
              <Field label="Date performed">
                <DateField value={form.date} onChange={v => set("date", v)} />
              </Field>
              <Field label="Performed by">
                <input type="text" value={form.reportedBy} onChange={e=>set("reportedBy",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <Field label="Notes (applied to all)">
                <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
              </Field>
              <button onClick={createBatch} disabled={!chosen.length}
                style={{ ...btn.primary, opacity: chosen.length?1:0.4, whiteSpace:"nowrap" }}>
                Raise {chosen.length || ""} Work Order{chosen.length===1?"":"s"}
              </button>
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:10 }}>
              Each becomes its own work order against its machine, so parts and labor cost to the right unit.
              Add parts on the work order — they come out of inventory at FIFO cost. Closing it stamps the meter and resets the interval.
            </div>
          </div>

          <div style={{ display:"flex", gap:10, marginBottom:12 }}>
            <button onClick={()=>setSelected(due.map(key))} style={{ ...btn.small, fontSize:11 }}>Select All</button>
            <button onClick={()=>setSelected(overdue.map(key))} style={{ ...btn.small, background:"#c0392b", fontSize:11 }}>Select Overdue</button>
            <button onClick={()=>setSelected([])} style={{ ...btn.small, background:"#aaa", fontSize:11 }}>Clear</button>
          </div>

          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["","Unit","Equipment","Service","Interval","Meter","Status"].map(h=>(
                    <th key={h} style={{ padding:"9px 12px", textAlign:h==="Meter"?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {due.map((d,i)=>{
                  const checked = selected.includes(key(d));
                  return (
                    <tr key={key(d)} onClick={()=>toggle(d)}
                      style={{ borderTop:"1px solid #eee", background: checked ? "#f0f8f4" : i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                      <td style={{ padding:"9px 12px 9px 16px" }}>
                        <input type="checkbox" checked={checked} onChange={()=>toggle(d)} onClick={e=>e.stopPropagation()} />
                      </td>
                      <td style={{ padding:"9px 12px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{d.unit.unitNumber||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>{[d.unit.year,d.unit.make,d.unit.model].filter(Boolean).join(" ")||"—"}</td>
                      <td style={{ padding:"9px 12px", fontWeight:600 }}>{d.sched.service||"—"}</td>
                      <td style={{ padding:"9px 12px", color:"#888", fontSize:12 }}>
                        every {Number(d.sched.interval).toLocaleString()} {d.sched.intervalType==="miles"?"mi":d.sched.intervalType==="hours"?"hr":"mo"}
                      </td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace" }}>{lifetimeMeter(d.unit).toLocaleString()}</td>
                      <td style={{ padding:"9px 12px" }}><PMBadge status={d.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function UnitPM({ unit, pmLogs, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: today(), service:"", meterReading:"", performedBy:"", cost:"", notes:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = () => {
    if (!form.date||!form.service) return;
    dispatch({ type:"ADD_PM_LOG", payload:{
      id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      equipmentId:unit.id, scheduleId:null, date:form.date, service:form.service,
      meterReading:parseFloat(form.meterReading)||0, performedBy:form.performedBy,
      cost:parseFloat(form.cost)||0, notes:form.notes, createdAt:new Date().toISOString(),
    }});
    setForm({ date: today(), service:"", meterReading:"", performedBy:"", cost:"", notes:"" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13 }}>{pmLogs.length} PM log entries</div>
        <button onClick={()=>setShowForm(s=>!s)} style={btn.primary}>{showForm?"Cancel":"+ Log PM Service"}</button>
      </div>
      {showForm && (
        <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <Field label="Date"><DateField value={form.date} onChange={v => set("date", v)} /></Field>
            <Field label="Service Performed">
              <select value={form.service} onChange={e=>set("service",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="">Select…</option>
                {PM_TASKS.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
            <Field label={`Meter (${unit.meterType||"hours"})`}><input type="number" min="0" step="any" value={form.meterReading} onChange={e=>set("meterReading",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
            <Field label="Cost ($)"><input type="number" min="0" step="0.01" value={form.cost} onChange={e=>set("cost",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} /></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12 }}>
            <Field label="Performed By"><input type="text" value={form.performedBy} onChange={e=>set("performedBy",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
            <Field label="Notes"><input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
          </div>
          <button onClick={handleSave} style={{ ...btn.primary, marginTop:14 }}>Save PM Log</button>
        </div>
      )}
      <Table
        headers={[{label:"Date"},{label:"Service"},{label:"Meter Reading"},{label:"Performed By"},{label:"Cost"},{label:"Notes"}]}
        rows={[...pmLogs].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>[
          <span style={{fontFamily:"monospace",fontSize:12}}>{fmtDate(e.date)}</span>,
          <span style={{fontWeight:600}}>{e.service||"—"}</span>,
          <span style={{fontFamily:"monospace"}}>{e.meterReading||"—"}</span>,
          e.performedBy||"—",
          <span style={{fontFamily:"monospace"}}>{e.cost?fmtSm(e.cost):"—"}</span>,
          <span style={{fontSize:12,color:"#888"}}>{e.notes||"—"}</span>,
        ])}
        emptyMessage="No PM logs"
      />
    </div>
  );
}

// ── Unit Fuel Log ─────────────────────────────────────────────────────────────
