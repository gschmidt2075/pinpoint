import { useState, useMemo } from "react";
import { Field, SectionCard, Table, KPICard, inp, btn, fmt, DateField } from "../../components/shared.jsx";
import { createDailyInventory, bookClosing, dailyVariance, ustMonthlyReconciliation,
         gaugeCheck, lastGaugeCheck,
         UST_VARIANCE_PERCENT, UST_VARIANCE_CONSTANT } from "../../data/schema.js";
import { today, fmtDate } from "./shared.js";

// ── Daily inventory record — underground tanks ────────────────────────────────
//
// Nebraska requires a DAILY product inventory record for every underground
// tank, under 40 CFR 280.43(a)(1)-(6). Not monthly, not when convenient — every
// operating day, at about the same time each day. The Fire Marshal inspects at
// least annually and looks at these records first.
//
// The comparison is the whole point: what the book says should be in the tank
// against what the stick says is in it. One day's disagreement is stick noise.
// A month's disagreement beyond 1% of throughput plus 130 gallons is a
// suspected release and has to be reported.
//
// Only tanks flagged underground appear here. Above-ground tanks are not
// covered by the rule and putting them on this screen would imply otherwise.
//
// HOW ADAMS COUNTY ACTUALLY DOES IT — Equipment questionnaire Q29:
//
//   "Main shop fuel logs are collected and reconciled against the tank monitor
//    daily. Once per year, tanks are dipped and reconciled with tank monitor."
//
// Two different checks, and it is worth being precise about which is which:
//
//   DAILY   the paper logs against the monitor — is the tank losing product?
//   ANNUAL  a stick against the monitor        — is the monitor telling the truth?
//
// The second is not a lesser version of the first. A gauge reading two hundred
// gallons high passes every daily reconciliation while hiding a real loss,
// because everything is being measured against the same wrong number. That is
// why the annual stick exists, and why it is recorded separately here.

const gal = (n) => `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits:1 })}`;

function csv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const blob = new Blob([rows.map(r => r.map(esc).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const monthOf = (d) => String(d || "").slice(0, 7);
const monthLabel = (m) => {
  const [y, mo] = String(m).split("-");
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString("en-US", { month:"long", year:"numeric" });
};

export function DailyInventoryTab({ tanks, tankTx, dispensing, records, dispatch }) {
  const usts = tanks.filter(t => t.isUnderground && t.status !== "out_of_service");
  const [tankId, setTankId] = useState(usts[0]?.id || "");
  const [month, setMonth]   = useState(monthOf(today()));
  const [showForm, setShowForm] = useState(false);

  const tank = usts.find(t => t.id === tankId);

  const forTank = useMemo(
    () => (records || []).filter(r => r.tankId === tankId)
            .sort((a,b) => String(b.date).localeCompare(String(a.date))),
    [records, tankId]);

  const forMonth = useMemo(
    () => forTank.filter(r => monthOf(r.date) === month)
            .sort((a,b) => String(a.date).localeCompare(String(b.date))),
    [forTank, month]);

  const rec = useMemo(() => ustMonthlyReconciliation(forMonth), [forMonth]);

  const months = useMemo(() => {
    const set = new Set(forTank.map(r => monthOf(r.date)));
    set.add(monthOf(today()));
    return [...set].sort().reverse();
  }, [forTank]);

  if (!usts.length) {
    return (
      <div style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:20, fontSize:13, color:"#1a3a5c", lineHeight:1.7 }}>
        <strong>No underground tanks are on record.</strong> The daily inventory rule applies only to
        underground storage tanks, so nothing is required here.
        <div style={{ marginTop:8, color:"#456" }}>
          If a tank is underground, mark it so in <strong>Settings → Fuel Tanks</strong> and it will
          appear here with its record.
        </div>
      </div>
    );
  }

  const exportMonth = () => csv(
    `daily-inventory-${(tank?.name||"tank").replace(/\W+/g,"-")}-${month}.csv`,
    [
      [`Daily Inventory Record — ${tank?.name || ""}`],
      [`Month`, monthLabel(month)],
      [`Capacity (gal)`, tank?.capacityGallons || ""],
      [`Facility ID`, tank?.facilityId || ""],
      [`Tank registration`, tank?.tankRegistrationId || ""],
      [],
      ["Date","Read From","Opening","Deliveries In","Dispensed Out","Book Closing","Measured Closing",
       "Variance","Water (in)","Gauge Check Stick","Gauge Check Monitor","Recorded By","Notes"],
      ...forMonth.map(r => [
        r.date, r.measuredBy || "monitor", r.openingStick, r.deliveries, r.dispensed,
        bookClosing(r), r.closingStick, dailyVariance(r).toFixed(1),
        r.waterInches ?? "", r.gaugeCheckStick ?? "", r.gaugeCheckMonitor ?? "",
        r.recordedBy || "", r.notes || "",
      ]),
      [],
      ...(rec ? [
        ["MONTHLY RECONCILIATION"],
        ["Opening stick", rec.opening],
        ["Delivered", rec.delivered],
        ["Throughput (dispensed)", rec.throughput],
        ["Book closing", rec.book.toFixed(1)],
        ["Closing stick", rec.closing],
        ["Variance", rec.variance.toFixed(1)],
        [`Allowed (1% of throughput + ${UST_VARIANCE_CONSTANT} gal)`, rec.threshold.toFixed(1)],
        ["Result", rec.pass ? "WITHIN TOLERANCE" : "EXCEEDS TOLERANCE — investigate"],
        ["Water readings this month", rec.waterReadings],
      ] : []),
    ]);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Daily Inventory Record</div>
          <div style={{ fontSize:12, color:"#888", marginTop:3, maxWidth:560, lineHeight:1.6 }}>
            Required for underground tanks every operating day, read at about the same time each day.
            Reconciled monthly — a loss or gain over 1% of throughput plus {UST_VARIANCE_CONSTANT} gallons
            is a suspected release.
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <Field label="Tank">
            <select value={tankId} onChange={e=>setTankId(e.target.value)} style={{ ...inp, margin:0, width:190 }}>
              {usts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Month">
            <select value={month} onChange={e=>setMonth(e.target.value)} style={{ ...inp, margin:0, width:170 }}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </Field>
          <button onClick={exportMonth} style={{ ...btn.secondary, marginBottom:1 }}>Export CSV</button>
          <button onClick={()=>setShowForm(s=>!s)} style={{ ...btn.primary, marginBottom:1 }}>
            {showForm ? "Cancel" : "+ Record a Day"}
          </button>
        </div>
      </div>

      {showForm && (
        <DayForm
          tank={tank} records={forTank} tankTx={tankTx} dispensing={dispensing}
          onSave={payload => { dispatch({ type:"ADD_DAILY_INVENTORY", payload }); setShowForm(false); }}
          onCancel={()=>setShowForm(false)}
        />
      )}

      {(() => {
        const g = lastGaugeCheck(forTank, tankId);
        const check = g ? gaugeCheck(g) : null;
        const daysSince = g ? Math.floor((Date.now() - new Date(g.date)) / 864e5) : null;
        const overdue = !g || daysSince > 365;
        return (
          <div style={{
            background: overdue ? "#fef8e8" : check?.agrees ? "#f0f8f4" : "#fdecea",
            border: `1px solid ${overdue ? "#f0d080" : check?.agrees ? "#a8d5b5" : "#f5c6c6"}`,
            borderRadius:8, padding:"11px 14px", marginBottom:16, fontSize:12, lineHeight:1.6,
            color: overdue ? "#7a4f00" : check?.agrees ? "#1a5a3a" : "#8c1b18",
          }}>
            <strong>Annual gauge check — </strong>
            {!g ? (
              <>never done. The tank is dipped once a year to confirm the monitor is telling the truth.
                 Until then, every daily figure rests on a gauge nobody has verified.</>
            ) : (
              <>last done {fmtDate(g.date)} ({daysSince} days ago). Stick {gal(check.stick)} gal
                 against monitor {gal(check.monitor)} gal — {check.difference >= 0 ? "+" : ""}
                 {check.difference.toFixed(1)} gal.
                 {check.agrees ? " The monitor agrees." : " The monitor is off; daily figures inherit that error."}
                 {daysSince > 365 && " Overdue for this year's stick."}</>
            )}
          </div>
        );
      })()}

      {rec && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            <KPICard label="Days Recorded" value={rec.days} sub={`${fmtDate(rec.from)} – ${fmtDate(rec.to)}`} accent="#1a3a5c" icon="calendar" />
            <KPICard label="Throughput"    value={`${gal(rec.throughput)} gal`} sub="Dispensed this month" accent="#5a1a8a" icon="droplet" />
            <KPICard label="Variance"      value={`${rec.variance >= 0 ? "+" : ""}${gal(rec.variance)} gal`}
              sub={`Allowed ± ${gal(rec.threshold)}`} accent={rec.pass ? "#1a5a3a" : "#c0392b"} icon="scale" />
            <KPICard label="Water Readings" value={rec.waterReadings}
              sub={rec.waterMissing ? "None — one is required" : `Max ${rec.maxWater}"`}
              accent={rec.waterMissing ? "#d97706" : "#1a5a3a"} icon="ripple" />
          </div>

          <div style={{
            background: rec.pass ? "#f0f8f4" : "#fdecea",
            border: `2px solid ${rec.pass ? "#a8d5b5" : "#f5c6c6"}`,
            borderRadius:8, padding:16, marginBottom:18,
          }}>
            <div style={{ fontWeight:700, fontSize:14, color: rec.pass ? "#1a5a3a" : "#8c1b18", marginBottom:6 }}>
              {rec.pass
                ? `Within tolerance for ${monthLabel(month)}`
                : `Exceeds tolerance for ${monthLabel(month)} — investigate`}
            </div>
            <div style={{ fontSize:12, color: rec.pass ? "#3a6a4a" : "#8c1b18", lineHeight:1.7, fontFamily:"monospace" }}>
              opening {gal(rec.opening)} + delivered {gal(rec.delivered)} − dispensed {gal(rec.throughput)}
              {" "}= book {gal(rec.book)} gal<br />
              stick reads {gal(rec.closing)} gal → <strong>variance {rec.variance >= 0 ? "+" : ""}{gal(rec.variance)} gal</strong><br />
              allowed: {(UST_VARIANCE_PERCENT * 100).toFixed(0)}% of {gal(rec.throughput)} + {UST_VARIANCE_CONSTANT} = {gal(rec.threshold)} gal
            </div>
            {!rec.pass && (
              <div style={{ marginTop:10, fontSize:12, color:"#8c1b18", lineHeight:1.6 }}>
                A month outside tolerance is a suspected release. Check the stick readings and the
                dispensing log first, then the tank.
              </div>
            )}
            {rec.waterMissing && (
              <div style={{ marginTop:10, fontSize:12, color:"#7a4f00", background:"#fef8e8", border:"1px solid #f0d080", borderRadius:6, padding:"8px 11px" }}>
                No water reading this month. The rule asks for one, measured to the nearest ⅛ inch.
              </div>
            )}
          </div>
        </>
      )}

      <SectionCard title={`${tank?.name || "Tank"} — ${monthLabel(month)}`}
        subtitle={forMonth.length ? `${forMonth.length} days recorded` : "Nothing recorded this month"}>
        <Table
          headers={[{label:"Date"},{label:"Read"},{label:"Opening"},{label:"In"},{label:"Out"},
                    {label:"Book"},{label:"Measured"},{label:"Variance"},{label:"Water"},{label:"By"}]}
          rows={forMonth.map(r => {
            const v = dailyVariance(r);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(r.date)}</span>,
              <span style={{ fontSize:10, fontWeight:700, color: r.measuredBy === "stick" ? "#5a1a8a" : "#888" }}>
                {r.measuredBy === "stick" ? "STICK" : "MONITOR"}
                {r.gaugeCheckStick != null && <span style={{ color:"#1a3a5c" }}> · GAUGE</span>}
              </span>,
              <span style={{ fontFamily:"monospace" }}>{gal(r.openingStick)}</span>,
              <span style={{ fontFamily:"monospace", color: r.deliveries ? "#1a5a3a" : "#ccc" }}>{r.deliveries ? `+${gal(r.deliveries)}` : "—"}</span>,
              <span style={{ fontFamily:"monospace", color:"#c0392b" }}>−{gal(r.dispensed)}</span>,
              <span style={{ fontFamily:"monospace", color:"#888" }}>{gal(bookClosing(r))}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700 }}>{gal(r.closingStick)}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700,
                             color: Math.abs(v) > 10 ? "#c0392b" : Math.abs(v) > 0 ? "#d97706" : "#888" }}>
                {v >= 0 ? "+" : ""}{v.toFixed(1)}
              </span>,
              <span style={{ fontFamily:"monospace", color: r.waterInches != null ? "#1a3a5c" : "#ccc" }}>
                {r.waterInches != null ? `${r.waterInches}"` : "—"}
              </span>,
              <span style={{ fontSize:12, color:"#888" }}>{r.recordedBy || "—"}</span>,
            ];
          })}
          emptyMessage={`No readings recorded for ${monthLabel(month)}`}
        />
      </SectionCard>
    </div>
  );
}

// One day's reading. Deliveries and dispensing are filled in from what the
// system already knows, so the only thing actually measured — the stick — is
// what has to be typed. They stay editable because the paper log wins if they
// disagree.
function DayForm({ tank, records, tankTx, dispensing, onSave, onCancel }) {
  const last = records[0];
  const [form, setForm] = useState({
    date: today(),
    measuredBy: tank?.hasMonitor ? "monitor" : "stick",
    openingStick: last?.closingStick ?? "",
    closingStick: "",
    waterInches: "",
    recordedBy: "",
    notes: "",
    overrideTotals: false,
    deliveries: "",
    dispensed: "",
    // The annual check — only filled in on the day the tank is sticked.
    gaugeCheck: false,
    gaugeCheckStick: "",
    gaugeCheckMonitor: "",
  });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // What the system already knows moved on that date.
  const auto = useMemo(() => {
    const inGal = (tankTx || [])
      .filter(t => t.tankId === tank?.id && t.date === form.date
                && (t.type === "delivery" || t.type === "portable_fill") && t.gallons > 0)
      .reduce((s,t) => s + (Number(t.gallons) || 0), 0);
    const outFill = (tankTx || [])
      .filter(t => t.sourceTankId === tank?.id && t.date === form.date)
      .reduce((s,t) => s + Math.abs(Number(t.gallons) || 0), 0);
    const outPump = (dispensing || [])
      .filter(d => d.sourceTankId === tank?.id && d.date === form.date)
      .reduce((s,d) => s + (Number(d.gallons) || 0), 0);
    return { deliveries: inGal, dispensed: outFill + outPump };
  }, [tankTx, dispensing, tank, form.date]);

  const deliveries = form.overrideTotals ? (parseFloat(form.deliveries) || 0) : auto.deliveries;
  const dispensed  = form.overrideTotals ? (parseFloat(form.dispensed)  || 0) : auto.dispensed;
  const opening    = parseFloat(form.openingStick) || 0;
  const closing    = parseFloat(form.closingStick) || 0;
  const book       = opening + deliveries - dispensed;
  const variance   = form.closingStick === "" ? null : closing - book;

  const gaugeNow = gaugeCheck({
    gaugeCheckStick:   form.gaugeCheckStick   === "" ? null : parseFloat(form.gaugeCheckStick),
    gaugeCheckMonitor: form.gaugeCheckMonitor === "" ? null : parseFloat(form.gaugeCheckMonitor),
  });

  const canSave = form.date && form.openingStick !== "" && form.closingStick !== "";

  return (
    <div style={{ background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:18, marginBottom:18 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>
        {tank?.name} — one day's reading
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
        <Field label="Date" required><DateField value={form.date} onChange={v=>set("date",v)} /></Field>
        <Field label="Read from">
          <select value={form.measuredBy} onChange={e=>set("measuredBy",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="monitor">Tank monitor</option>
            <option value="stick">Stick</option>
          </select>
        </Field>
        <Field label={`Opening ${form.measuredBy === "stick" ? "stick" : "reading"} (gal)`} required>
          <input type="number" step="any" value={form.openingStick} onChange={e=>set("openingStick",e.target.value)}
            style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <Field label="Delivered in">
          <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", color: deliveries ? "#1a5a3a" : "#bbb" }}>
            {deliveries ? `+${gal(deliveries)}` : "—"}
          </div>
        </Field>
        <Field label="Dispensed out">
          <div style={{ ...inp, margin:0, background:"#fff", fontFamily:"monospace", color: dispensed ? "#c0392b" : "#bbb" }}>
            {dispensed ? `−${gal(dispensed)}` : "—"}
          </div>
        </Field>
        <Field label={`Closing ${form.measuredBy === "stick" ? "stick" : "reading"} (gal)`} required>
          <input type="number" step="any" value={form.closingStick} onChange={e=>set("closingStick",e.target.value)}
            style={{ ...inp, margin:0, fontFamily:"monospace", fontWeight:700 }} />
        </Field>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:12, marginBottom:12 }}>
        <Field label='Water (inches, monthly)'>
          <input type="number" step="0.125" value={form.waterInches} onChange={e=>set("waterInches",e.target.value)}
            placeholder="to nearest ⅛" style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <Field label="Recorded by">
          <input type="text" value={form.recordedBy} onChange={e=>set("recordedBy",e.target.value)} style={{ ...inp, margin:0 }} />
        </Field>
        <Field label="Notes">
          <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} />
        </Field>
      </div>

      {variance !== null && (
        <div style={{
          background: Math.abs(variance) > 10 ? "#fdecea" : "#f0f8f4",
          border: `1px solid ${Math.abs(variance) > 10 ? "#f5c6c6" : "#a8d5b5"}`,
          borderRadius:6, padding:"9px 12px", marginBottom:12,
          fontSize:12, fontFamily:"monospace", color: Math.abs(variance) > 10 ? "#8c1b18" : "#1a5a3a",
        }}>
          book says {gal(book)} · stick says {gal(closing)} · <strong>variance {variance >= 0 ? "+" : ""}{variance.toFixed(1)} gal</strong>
        </div>
      )}

      {/* The once-a-year stick, compared against the monitor on the same day. */}
      {tank?.hasMonitor && (
        <div style={{ background:"#fff", border:"1px solid #e4e4e0", borderRadius:6, padding:12, marginBottom:12 }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, color:"#1a3a5c" }}>
            <input type="checkbox" checked={form.gaugeCheck} onChange={e=>set("gaugeCheck", e.target.checked)} />
            This is the annual stick — check the monitor against it
          </label>
          {form.gaugeCheck && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.6fr", gap:12, marginTop:10 }}>
                <Field label="Stick reads (gal)">
                  <input type="number" step="any" value={form.gaugeCheckStick}
                    onChange={e=>set("gaugeCheckStick",e.target.value)}
                    style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Monitor reads (gal)">
                  <input type="number" step="any" value={form.gaugeCheckMonitor}
                    onChange={e=>set("gaugeCheckMonitor",e.target.value)}
                    style={{ ...inp, margin:0, fontFamily:"monospace" }} />
                </Field>
                <Field label="Gauge agreement">
                  <div style={{ ...inp, margin:0, background:"#f7f7f5", fontFamily:"monospace",
                                color: gaugeNow ? (gaugeNow.agrees ? "#1a5a3a" : "#c0392b") : "#bbb" }}>
                    {gaugeNow
                      ? `${gaugeNow.difference >= 0 ? "+" : ""}${gaugeNow.difference.toFixed(1)} gal ${gaugeNow.agrees ? "— agrees" : "— monitor is off"}`
                      : "—"}
                  </div>
                </Field>
              </div>
              {gaugeNow && !gaugeNow.agrees && (
                <div style={{ marginTop:8, background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:6, padding:"9px 12px", fontSize:12, color:"#8c1b18", lineHeight:1.6 }}>
                  The monitor disagrees with the stick by {Math.abs(gaugeNow.difference).toFixed(0)} gallons.
                  Every daily reconciliation this year was measured against that monitor, so they were all
                  measured against the same wrong number. Worth a service call before trusting them.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#888", marginBottom:12 }}>
        <input type="checkbox" checked={form.overrideTotals}
          onChange={e=>{ set("overrideTotals", e.target.checked);
                         set("deliveries", String(auto.deliveries)); set("dispensed", String(auto.dispensed)); }} />
        The paper log disagrees — let me enter the gallons myself
      </label>

      {form.overrideTotals && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 3fr", gap:12, marginBottom:12 }}>
          <Field label="Delivered in (gal)">
            <input type="number" step="any" value={form.deliveries} onChange={e=>set("deliveries",e.target.value)}
              style={{ ...inp, margin:0, fontFamily:"monospace" }} />
          </Field>
          <Field label="Dispensed out (gal)">
            <input type="number" step="any" value={form.dispensed} onChange={e=>set("dispensed",e.target.value)}
              style={{ ...inp, margin:0, fontFamily:"monospace" }} />
          </Field>
        </div>
      )}

      <div style={{ display:"flex", gap:10 }}>
        <button
          onClick={()=>onSave(createDailyInventory({
            tankId: tank.id, tankName: tank.name, date: form.date,
            openingStick: opening, closingStick: closing,
            deliveries, dispensed,
            measuredBy: form.measuredBy,
            waterInches: form.waterInches === "" ? null : parseFloat(form.waterInches),
            gaugeCheckStick:   form.gaugeCheck && form.gaugeCheckStick   !== "" ? parseFloat(form.gaugeCheckStick)   : null,
            gaugeCheckMonitor: form.gaugeCheck && form.gaugeCheckMonitor !== "" ? parseFloat(form.gaugeCheckMonitor) : null,
            recordedBy: form.recordedBy, notes: form.notes,
          }))}
          disabled={!canSave}
          style={{ ...btn.primary, opacity: canSave?1:0.45, cursor: canSave?"pointer":"not-allowed" }}>
          Save Reading
        </button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
