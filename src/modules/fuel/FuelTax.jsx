import { useState, useMemo } from "react";
import { Icon, Field, Table, inp, btn, fmtSm, DateField, MoneyField } from "../../components/shared.jsx";
import { useUnsavedForm } from "../../components/unsaved.jsx";
import { createFuelTaxRate, fuelTaxReport, quartersWithFuel, quarterOf,
         quarterLabel, fuelTaxRatesOn } from "../../data/schema.js";
import { fmtDate } from "./shared.js";

// ── Fuel tax ──────────────────────────────────────────────────────────────────
//
// The county buys dyed diesel, which arrives untaxed, and owes tax on the
// gallons that go into something driving on a road. It is remitted quarterly.
//
// Greg said federal. Dyed fuel is exempt from the federal excise, and a local
// government may generally run it on-highway for its own use, which points at a
// state tax instead. That is a question for whoever prepares the return, and it
// is not answered here: the table below holds ANY NUMBER of named taxes, so
// state, federal, both, or something a different county pays all work without
// anyone coming back to change the program.
//
// The rates live on THIS screen rather than in Settings. The person who files
// the return is the person who knows the rate changed, and sending her to
// another part of the program to record it is how it comes to be recorded late.

const RATE_HELP = {
  name: "What the return calls it, in your own words.",
};

export function FuelTaxTab({ dispensing = [], rates = [], units = [], dispatch }) {
  const quarters = useMemo(() => {
    const found = quartersWithFuel(dispensing.filter(d => (d.fuelType || "diesel") === "diesel"));
    const now = quarterOf(new Date().toISOString().slice(0, 10));
    return found.includes(now) ? found : [now, ...found];
  }, [dispensing]);

  const [quarter, setQuarter] = useState(quarters[0] || "");
  const [showRates, setShowRates] = useState(false);

  const report = useMemo(() => fuelTaxReport(dispensing, rates, quarter),
                         [dispensing, rates, quarter]);

  if (!report) return null;

  const noRates = !fuelTaxRatesOn(rates, report.range.end).length;

  const exportReport = () => {
    const q = v => { const t = v==null?"":String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
    const rows = [
      [`Fuel tax — ${report.label}`],
      [`${fmtDate(report.range.start)} to ${fmtDate(report.range.end)}`],
      [],
      ["On-road gallons", report.onRoadGallons],
      ["Off-road gallons", report.offRoadGallons],
      ["Total diesel", report.totalGallons],
      [],
      ["Tax", "Gallons", "Rate(s) $/gal", "Amount"],
      ...report.lines.map(l => [l.name, l.gallons, l.rates.map(r => r.toFixed(4)).join(" / "), l.amount]),
      ["Total owed", "", "", report.totalOwed],
      [],
      ["On-road gallons by unit"],
      ["Unit", "Fill-ups", "Gallons"],
      ...report.byUnit.map(u => [u.unit, u.fills, u.gallons]),
    ];
    const blob = new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `fuel-tax-${report.quarter}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Fuel Tax</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2, maxWidth:560, lineHeight:1.6 }}>
            Dyed diesel arrives untaxed. Tax is owed on the gallons that went into something
            driving on a road, and each fuelling is figured at the rate in force on the day it
            was pumped — so a rate that changes mid-quarter splits itself.
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <Field label="Quarter">
            <select value={quarter} onChange={e=>setQuarter(e.target.value)} style={{ ...inp, margin:0, minWidth:130 }}>
              {quarters.map(q => <option key={q} value={q}>{quarterLabel(q)}</option>)}
            </select>
          </Field>
          <button onClick={exportReport} style={{ ...btn.ghost, marginBottom:1 }}>Export</button>
          <button onClick={()=>window.print()} style={{ ...btn.ghost, marginBottom:1 }}>Print</button>
        </div>
      </div>

      {noRates && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6, padding:"12px 14px",
                      marginBottom:16, fontSize:12.5, color:"#7a4f00", lineHeight:1.6 }}>
          <strong>No tax rate on file.</strong> The gallons below are right, but nothing can be
          calculated from them until a rate is entered. Add one under <em>Rates</em>, with the date
          it took effect — old records keep the rate that applied when the fuel was pumped.
        </div>
      )}

      {report.unratedGallons > 0 && !noRates && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6, padding:"12px 14px",
                      marginBottom:16, fontSize:12.5, color:"#7a4f00", lineHeight:1.6 }}>
          <strong>{report.unratedGallons.toLocaleString(undefined,{maximumFractionDigits:1})} on-road gallons
          could not be priced</strong> — they were pumped before the earliest rate on file. The total
          below is short by whatever those gallons are worth.
        </div>
      )}

      {/* The three numbers, and then the working. */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:20 }}>
        {[
          ["On-road gallons",  report.onRoadGallons.toLocaleString(undefined,{maximumFractionDigits:1}), "#1a3a5c", `${report.fills} fill-ups`],
          ["Off-road gallons", report.offRoadGallons.toLocaleString(undefined,{maximumFractionDigits:1}), "#666", "no tax owed"],
          ["Total owed",       fmtSm(report.totalOwed), "#8c1b18", `${quarterLabel(report.quarter)}`],
        ].map(([label, value, color, sub]) => (
          <div key={label} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:700, color, marginTop:4, fontFamily:"monospace" }}>{value}</div>
            <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid #eee", fontSize:13, fontWeight:700 }}>
          What is owed · {fmtDate(report.range.start)} to {fmtDate(report.range.end)}
        </div>
        <Table
          headers={[{label:"Tax"},{label:"Gallons"},{label:"Rate $/gal"},{label:"Amount"}]}
          emptyMessage="No rate on file for this quarter."
          rows={report.lines.map(l => [
            l.name,
            <span style={{ fontFamily:"monospace" }}>{l.gallons.toLocaleString(undefined,{maximumFractionDigits:1})}</span>,
            <span style={{ fontFamily:"monospace" }}>
              {l.rates.map(r => "$" + r.toFixed(4)).join(" / ")}
              {l.rates.length > 1 && <span style={{ color:"#a05a00", fontSize:11 }}> — changed mid-quarter</span>}
            </span>,
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(l.amount)}</span>,
          ])}
        />
        {report.lines.length > 0 && (
          <div style={{ padding:"10px 14px", borderTop:"2px solid #ddd", background:"#f7f7f5",
                        display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700 }}>
            <span>Total owed for {quarterLabel(report.quarter)}</span>
            <span style={{ fontFamily:"monospace" }}>{fmtSm(report.totalOwed)}</span>
          </div>
        )}
      </div>

      {/* The working. A grader that has quietly been marked on-road shows up
          here as a line nobody recognises, rather than as a total that is
          merely too big to argue with. */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid #eee" }}>
          <div style={{ fontSize:13, fontWeight:700 }}>Where the on-road gallons went</div>
          <div style={{ fontSize:11, color:"#888", marginTop:2 }}>
            Check this before filing. Anything here that does not drive on a road is a machine set
            wrong on the Fleet screen, not a number to adjust.
          </div>
        </div>
        <Table
          headers={[{label:"Unit"},{label:"Fill-ups"},{label:"Gallons"}]}
          emptyMessage="No on-road fuel this quarter."
          rows={report.byUnit.map(u => {
            const unit = units.find(x => x.unitNumber === u.unit);
            return [
              <span><strong style={{ fontFamily:"monospace" }}>{u.unit}</strong>
                {unit && <span style={{ color:"#888", marginLeft:8 }}>{unit.description || unit.make}</span>}</span>,
              <span style={{ fontFamily:"monospace", color:"#888" }}>{u.fills}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600 }}>{u.gallons.toLocaleString(undefined,{maximumFractionDigits:1})}</span>,
            ];
          })}
        />
      </div>

      <RateTable rates={rates} open={showRates} onToggle={()=>setShowRates(v=>!v)} dispatch={dispatch} />
    </div>
  );
}

// ── The rates themselves ──────────────────────────────────────────────────────
//
// Dated, and never edited in place when a rate changes — a new row is added
// with the date it took effect. Editing the old row would silently restate
// every quarter already filed, which is the one thing a tax record must not do.
function RateTable({ rates = [], open, onToggle, dispatch }) {
  const EMPTY = { name:"", fuelType:"diesel", effectiveDate:new Date().toISOString().slice(0,10),
                  ratePerGallon:"", notes:"" };
  const [form, setForm] = useState(EMPTY);
  useUnsavedForm(form, "this tax rate");
  const set = (k,v) => setForm(f=>({ ...f, [k]:v }));

  const sorted = [...rates].sort((a,b) =>
    (a.name||"").localeCompare(b.name||"") || String(b.effectiveDate||"").localeCompare(String(a.effectiveDate||"")));

  const missing = [];
  if (!form.name.trim()) missing.push("a name");
  if (!form.effectiveDate) missing.push("the date it took effect");
  if (!(parseFloat(form.ratePerGallon) > 0)) missing.push("a rate");

  const save = () => {
    if (missing.length) return;
    dispatch({ type:"ADD_FUEL_TAX_RATE", payload: createFuelTaxRate({
      name: form.name.trim(), fuelType: form.fuelType,
      effectiveDate: form.effectiveDate,
      ratePerGallon: parseFloat(form.ratePerGallon) || 0,
      notes: form.notes,
    })});
    setForm({ ...EMPTY, name: form.name, fuelType: form.fuelType });
  };

  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
      <button onClick={onToggle} style={{ width:"100%", background:"#fafaf8", border:"none", borderBottom: open?"1px solid #eee":"none",
                     padding:"11px 14px", display:"flex", alignItems:"center", gap:8, cursor:"pointer", textAlign:"left" }}>
        <Icon name={open?"chevron-down":"chevron-right"} size={13} color="#888" />
        <span style={{ fontSize:13, fontWeight:700 }}>Rates</span>
        <span style={{ fontSize:11, color:"#888" }}>
          {rates.length ? `${rates.length} on file` : "none yet — nothing can be calculated without one"}
        </span>
      </button>

      {open && (
        <div style={{ padding:14 }}>
          <div style={{ fontSize:11.5, color:"#888", lineHeight:1.65, marginBottom:12, maxWidth:640 }}>
            Add as many taxes as the county actually remits — name each one whatever the return
            calls it. When a rate changes, <strong>add a new row with the date it took effect</strong>
            rather than editing the old one: fuel pumped before that date keeps the rate that applied
            to it, so a quarter already filed still reports the figure it was filed with.
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 1fr auto", gap:10, alignItems:"end",
                        background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:12, marginBottom:14 }}>
            <Field label="Tax">
              <input type="text" value={form.name} onChange={e=>set("name",e.target.value)}
                     placeholder="State motor fuel" style={{ ...inp, margin:0 }} />
              <div style={{ fontSize:10.5, color:"#aaa", marginTop:3 }}>{RATE_HELP.name}</div>
            </Field>
            <Field label="Applies To">
              <select value={form.fuelType} onChange={e=>set("fuelType",e.target.value)} style={{ ...inp, margin:0 }}>
                <option value="diesel">Diesel</option>
                <option value="unleaded">Unleaded</option>
              </select>
            </Field>
            <Field label="Effective">
              <DateField value={form.effectiveDate} onChange={v=>set("effectiveDate",v)} />
            </Field>
            <Field label="Rate $/gal">
              <MoneyField value={form.ratePerGallon} onChange={v=>set("ratePerGallon",v)} decimals={4} />
            </Field>
            <button onClick={save} disabled={missing.length>0}
                    style={{ ...btn.primary, opacity: missing.length?0.4:1 }}>Add</button>
          </div>

          {missing.length > 0 && (form.name || form.ratePerGallon) && (
            <div style={{ fontSize:11.5, color:"#a05a00", marginBottom:12 }}>
              Still needs {missing.join(", ")}.
            </div>
          )}

          <Table
            headers={[{label:"Tax"},{label:"Fuel"},{label:"Effective"},{label:"Rate $/gal"},{label:""}]}
            emptyMessage="No rates entered yet."
            rows={sorted.map(r => [
              r.name,
              <span style={{ textTransform:"capitalize", color:"#888" }}>{r.fuelType||"diesel"}</span>,
              <span style={{ fontFamily:"monospace" }}>{fmtDate(r.effectiveDate)}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600 }}>${Number(r.ratePerGallon||0).toFixed(4)}</span>,
              <button onClick={()=>{
                        if (confirm(`Remove ${r.name} effective ${fmtDate(r.effectiveDate)}?\n\nAny quarter figured at this rate will report a different total.`))
                          dispatch({ type:"DELETE_FUEL_TAX_RATE", payload:r.id });
                      }}
                      style={{ ...btn.ghost, fontSize:11, padding:"3px 9px", color:"#c0392b", borderColor:"#e8b4b4" }}>Remove</button>,
            ])}
          />
        </div>
      )}
    </div>
  );
}
