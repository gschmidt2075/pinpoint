import { useState } from "react";
import { Icon, Field, inp, btn, fmtSm } from "../../components/shared.jsx";
import { fmtDate } from "./shared.js";

// Five other county departments fuel at the shop and are billed monthly at
// cost. Reconciled weekly, billed on the 1st. Revenue is recognised when the
// check arrives, not when the bill goes out.

export function FuelBilling({ dispensing, dispatch }) {
  const outside = dispensing.filter(f => f.consumer === "other_department");

  const periods = [...new Set(outside.map(f => f.billingPeriod || (f.date||"").slice(0,7)).filter(Boolean))]
    .sort().reverse();
  const [period, setPeriod] = useState(periods[0] || "");
  const [expanded, setExpanded] = useState(null);

  const inPeriod = outside.filter(f => (f.billingPeriod || (f.date||"").slice(0,7)) === period);

  const byDept = {};
  inPeriod.forEach(f => {
    const d = f.departmentName || "Unassigned";
    if (!byDept[d]) byDept[d] = { gallons:0, cost:0, entries:[], billed:0 };
    byDept[d].gallons += f.gallons || 0;
    byDept[d].cost    += f.totalCost || 0;
    if (f.billedDate) byDept[d].billed++;
    byDept[d].entries.push(f);
  });
  const rows = Object.entries(byDept).sort((a,b)=>b[1].cost-a[1].cost);
  const grandGal  = rows.reduce((s,[,d])=>s+d.gallons,0);
  const grandCost = rows.reduce((s,[,d])=>s+d.cost,0);

  const markBilled = (dept) => {
    const today = new Date().toISOString().split("T")[0];
    byDept[dept].entries.filter(e=>!e.billedDate).forEach(e =>
      dispatch({ type:"UPDATE_FUEL_DISPENSING", payload:{ ...e, billedDate: today } }));
  };
  const markPaid = (dept) => {
    const today = new Date().toISOString().split("T")[0];
    byDept[dept].entries.filter(e=>!e.paidDate).forEach(e =>
      dispatch({ type:"UPDATE_FUEL_DISPENSING", payload:{ ...e, paidDate: today } }));
  };

  const fmtPeriod = (p) => {
    if (!p) return "—";
    const [y,m] = p.split("-");
    return new Date(Number(y), Number(m)-1, 1).toLocaleDateString(undefined,{ month:"long", year:"numeric" });
  };

  if (!outside.length) {
    return (
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:36, textAlign:"center" }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#555", marginBottom:6 }}>No department fuel logged yet</div>
        <div style={{ fontSize:12, color:"#888" }}>
          Log fuel with "Other Department" selected and it will appear here for monthly billing.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700 }}>Department Fuel Billing</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Billed at cost on the 1st. Click a department to see the vehicle detail.</div>
        </div>
        <Field label="Billing Period">
          <select value={period} onChange={e=>{setPeriod(e.target.value); setExpanded(null);}} style={{ ...inp, margin:0, minWidth:180 }}>
            {periods.map(p=><option key={p} value={p}>{fmtPeriod(p)}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Department","Fill-ups","Gallons","Amount","Status",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["Gallons","Amount","Fill-ups"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([dept, d], i) => {
              const allBilled = d.entries.every(e=>e.billedDate);
              const allPaid   = d.entries.every(e=>e.paidDate);
              const isOpen    = expanded === dept;
              return (
                <>
                  <tr key={dept} onClick={()=>setExpanded(isOpen?null:dept)}
                    style={{ borderTop:"1px solid #eee", background:isOpen?"#f0f8f4":i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}>
                    <td style={{ padding:"10px 14px", fontWeight:700 }}>
                      <Icon name={isOpen?"chevron-down":"chevron-right"} size={12} color="#888" /> {dept}
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{d.entries.length}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{d.gallons.toFixed(1)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(d.cost)}</td>
                    <td style={{ padding:"10px 14px" }}>
                      {allPaid
                        ? <span style={{ background:"#e6f4ec", color:"#1a6b35", border:"1px solid #a8d5b5", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Paid</span>
                        : allBilled
                        ? <span style={{ background:"#fef3cd", color:"#7a4f00", border:"1px solid #f0d080", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Billed</span>
                        : <span style={{ background:"#f4f4f2", color:"#888", border:"1px solid #ddd", borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700 }}>Unbilled</span>}
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right" }} onClick={e=>e.stopPropagation()}>
                      {!allBilled && <button onClick={()=>markBilled(dept)} style={{ ...btn.small, fontSize:10, padding:"4px 10px" }}>Mark Billed</button>}
                      {allBilled && !allPaid && <button onClick={()=>markPaid(dept)} style={{ ...btn.small, background:"#1a6b35", fontSize:10, padding:"4px 10px" }}>Mark Paid</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${dept}-detail`}>
                      <td colSpan={6} style={{ padding:"0 14px 14px", background:"#f0f8f4" }}>
                        <div style={{ fontSize:11, color:"#1a5a3a", padding:"8px 0 6px", fontWeight:600 }}>
                          Vehicle detail — kept in case the numbers are challenged
                        </div>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, background:"#fff", borderRadius:6, overflow:"hidden" }}>
                          <thead>
                            <tr style={{ background:"#e6f4ec" }}>
                              {["Date","Vehicle","Mileage","Fuel","Gallons","Rate","Amount","Pumped By"].map(h=>(
                                <th key={h} style={{ padding:"6px 10px", textAlign:["Gallons","Rate","Amount"].includes(h)?"right":"left", fontWeight:600, fontSize:10, color:"#1a5a3a" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.entries.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(e=>(
                              <tr key={e.id} style={{ borderTop:"1px solid #e6f4ec" }}>
                                <td style={{ padding:"6px 10px", fontFamily:"monospace" }}>{fmtDate(e.date)}</td>
                                <td style={{ padding:"6px 10px" }}>{e.outsideVehicle||"—"}</td>
                                <td style={{ padding:"6px 10px", fontFamily:"monospace", color:"#888" }}>{e.outsideOdometer||"—"}</td>
                                <td style={{ padding:"6px 10px", textTransform:"capitalize" }}>{e.fuelType}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace" }}>{e.gallons}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{e.unitCost?fmtSm(e.unitCost):"—"}</td>
                                <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{e.totalCost?fmtSm(e.totalCost):"—"}</td>
                                <td style={{ padding:"6px 10px", color:"#888" }}>{e.pumpedBy||"—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
              <td colSpan={2} style={{ padding:"10px 14px", fontWeight:700, textAlign:"right" }}>{fmtPeriod(period)} total</td>
              <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{grandGal.toFixed(1)}</td>
              <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14 }}>{fmtSm(grandCost)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize:11, color:"#888", marginTop:10, lineHeight:1.6 }}>
        Marking a department <strong>Paid</strong> is when the money is actually earned — revenue is
        recognised on receipt of the check, not when the bill goes out.
      </div>
    </div>
  );
}

// ── Tanks Tab ─────────────────────────────────────────────────────────────────
