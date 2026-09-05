import { useState, useMemo } from "react";
import { Field, Table, inp, btn, fmtSm, DateField, titleCase } from "../../components/shared.jsx";
import { fuelValuation } from "../../data/schema.js";
import { fmtDate } from "./shared.js";

// ── What the fuel is worth ────────────────────────────────────────────────────
//
// Greg: "I'm assuming there will be a way to export the value for the end of
// year count."
//
// The county's year runs to 30 June and the fuel in the tanks is part of what
// gets counted, the same as the shelves. This is that number.
//
// It is an AS-AT figure, not today's number with an old date on the top. The
// costing runs over history up to the chosen day and stops, so running it next
// year for this year gives this year's answer — which is the entire point of a
// closing balance, and the thing a report that just totals current stock gets
// wrong.

const fiscalYearEnds = () => {
  const now = new Date();
  // The county's year ends 30 June. Offer the last few.
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return [0, 1, 2].map(back => {
    const y = endYear - back;
    return { value: `${y}-06-30`, label: `30 June ${y} — FY ${y}` };
  });
};

export function YearEndTab({ tanks = [], tankTx = [], dispensing = [], countyInfo = {} }) {
  const options = useMemo(fiscalYearEnds, []);
  const [asOf, setAsOf] = useState(options[0].value);

  const v = useMemo(() => fuelValuation(tankTx, dispensing, tanks, asOf),
                    [tankTx, dispensing, tanks, asOf]);

  const noOpening = v.lines.filter(l => l.noOpening && l.gallons > 0);

  const exportCsv = () => {
    const q = x => { const t = x==null?"":String(x); return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
    const rows = [
      [`Fuel on hand — ${fmtDate(v.asOf)}`],
      [countyInfo.countyName || "", countyInfo.deptName || ""],
      [],
      ["Tank","Location","Fuel","Gallons","$/gal","Value"],
      ...v.lines.map(l => [l.name, l.location, l.fuelType, l.gallons, l.average, l.value]),
      [],
      ["Total", "", "", v.totalGallons, "", v.totalValue],
      [],
      ["By fuel"],
      ["Fuel","Gallons","Value"],
      ...v.byFuel.map(f => [f.fuelType, f.gallons, f.value]),
    ];
    const blob = new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `fuel-on-hand-${v.asOf}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end",
                    marginBottom:16, gap:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Fuel on hand</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2, maxWidth:600, lineHeight:1.6 }}>
            Gallons and value in every tank on a chosen day, valued FIFO. Goes with the year-end
            inventory count — the tanks are stock too.
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }} className="no-print">
          <Field label="As at">
            <select value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...inp, margin:0, minWidth:190 }}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              {!options.some(o => o.value === asOf) && <option value={asOf}>{fmtDate(asOf)}</option>}
            </select>
          </Field>
          <Field label="Or any date">
            <DateField value={asOf} onChange={v2 => setAsOf(v2)} />
          </Field>
          <button onClick={exportCsv} style={{ ...btn.ghost, marginBottom:1 }}>Export</button>
          <button onClick={()=>window.print()} style={{ ...btn.ghost, marginBottom:1 }}>Print</button>
        </div>
      </div>

      {noOpening.length > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6,
                      padding:"11px 14px", marginBottom:14, fontSize:12.5, color:"#7a4f00", lineHeight:1.65 }}>
          <strong>{noOpening.map(l => l.name).join(", ")} {noOpening.length === 1 ? "has" : "have"} no
          opening balance recorded.</strong> The gallons come from deliveries alone, so anything that
          was already in the tank when Pinpoint took over is missing from this figure. Set it under{" "}
          <strong>Settings → Fuel Tanks</strong> — gallons and value, as at the day you started.
        </div>
      )}

      {v.unpriced > 0 && (
        <div style={{ background:"#fdecea", border:"1px solid #f0b4b4", borderRadius:6,
                      padding:"11px 14px", marginBottom:14, fontSize:12.5, color:"#8c1b18", lineHeight:1.65 }}>
          <strong>{v.unpriced} tank{v.unpriced === 1 ? " holds" : "s hold"} fuel that nothing has
          priced.</strong> The gallons may be right, but there is no opening balance and no delivery
          behind them, so the value below is short.
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:20 }}>
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
          <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>Gallons on hand</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#1a3a5c", marginTop:4, fontFamily:"monospace" }}>
            {v.totalGallons.toLocaleString()}
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{fmtDate(v.asOf)}</div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
          <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>Value</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#1a6b35", marginTop:4, fontFamily:"monospace" }}>
            {fmtSm(v.totalValue)}
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>FIFO, at what it cost</div>
        </div>
        {v.byFuel.map(f => (
          <div key={f.fuelType} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>
              {titleCase(f.fuelType)}
            </div>
            <div style={{ fontSize:18, fontWeight:700, marginTop:4, fontFamily:"monospace" }}>
              {f.gallons.toLocaleString()} <span style={{ fontSize:12, color:"#888", fontWeight:400 }}>gal</span>
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:2, fontFamily:"monospace" }}>{fmtSm(f.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid #eee", fontSize:13, fontWeight:700 }}>
          Tank by tank · {fmtDate(v.asOf)}
        </div>
        <Table
          headers={[{label:"Tank"},{label:"Location"},{label:"Fuel"},{label:"Gallons"},{label:"$/gal"},{label:"Value"}]}
          emptyMessage="No tanks existed on that date."
          rows={v.lines.map(l => [
            <span style={{ fontWeight:600 }}>{l.name}</span>,
            <span style={{ color:"#888" }}>{l.location || "—"}</span>,
            <span style={{ textTransform:"capitalize", color:"#888" }}>{l.fuelType}</span>,
            <span style={{ fontFamily:"monospace" }}>
              {l.gallons.toLocaleString()}
              {l.capacityGallons > 0 && <span style={{ color:"#bbb" }}> / {l.capacityGallons.toLocaleString()}</span>}
            </span>,
            <span style={{ fontFamily:"monospace", color: l.unpriced ? "#c0392b" : "#666" }}>
              {l.average ? `$${l.average.toFixed(4)}` : "—"}
            </span>,
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(l.value)}</span>,
          ])}
        />
        {v.lines.length > 0 && (
          <div style={{ padding:"10px 14px", borderTop:"2px solid #ddd", background:"#f7f7f5",
                        display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700 }}>
            <span>Total fuel on hand</span>
            <span style={{ fontFamily:"monospace" }}>
              {v.totalGallons.toLocaleString()} gal · {fmtSm(v.totalValue)}
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize:11, color:"#888", marginTop:12, lineHeight:1.65, maxWidth:660 }}>
        Valued first-in-first-out at what the fuel actually cost, so this ties to the deliveries
        rather than to today's price. Re-running it for a past year end gives that year's figure —
        it does not drift as new fuel arrives.
      </div>
    </div>
  );
}
