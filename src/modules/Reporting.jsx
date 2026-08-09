import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm } from "../components/shared.jsx";
import { FISCAL_YEAR } from "../data/accountCodes.js";
import { laborRateFor } from "../data/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING
//
// Two jobs:
//
// 1. Supporting reports for the Annual Certification of Program Compliance.
//    The county files the ACPC with the Nebraska Board of Public Roads
//    Classifications and Standards by 31 October; the Clerk handles the form
//    itself and the Board approves it. Pinpoint does NOT produce that form —
//    NBCS states plainly that recreations will not be accepted. What Pinpoint
//    provides is the evidence behind four of the nine certifications:
//
//      · a system of revenue and cost accounting comparing receipts and
//        expenditures against approved budgets
//      · a system of budgeting reflecting uses and sources of funds
//      · an accounting system including an inventory of machinery, equipment
//        and supplies
//      · an accounting system that tracks equipment operation costs
//
//    Failure to file suspends Highway Allocation funds, so the supporting
//    records need to be producible on demand.
//
// 2. An annual synopsis for the Board — what the department actually did in
//    the year, in plain figures.
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// Nebraska fiscal year runs 1 July – 30 June.
function fiscalRange(endYear) {
  return { start: `${endYear-1}-07-01`, end: `${endYear}-06-30`, label: `FY ${endYear}` };
}
const inRange = (d, r) => d && d >= r.start && d <= r.end;

const PRINT_CSS = `
  @media print {
    .no-print { display:none !important; visibility:hidden !important; height:0 !important;
                overflow:hidden !important; margin:0 !important; padding:0 !important; }
    .print-section { page-break-before: always; break-before: page; }
    .print-section:first-of-type { page-break-before: avoid; break-before: avoid; }
    .print-block { page-break-inside: avoid; break-inside: avoid; }
    body { font-size:11px; margin:0; }
    @page { margin: 0.75in; }
  }
`;

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Reporting({ db, dispatch, role = "staff" }) {
  const [view, setView] = useState("annual");
  const thisFY = Number(String(FISCAL_YEAR.label).replace(/\D/g,"")) || new Date().getFullYear();
  const [fy, setFy] = useState(thisFY);
  const range = fiscalRange(fy);

  const tabs = [
    { id:"annual",     label:"Annual Report",      icon:"presentation" },
    { id:"compliance", label:"Compliance Support", icon:"certificate" },
  ];

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18, flexWrap:"wrap", gap:12 }}>
        <div style={{ display:"flex", gap:2, borderBottom:"1px solid #ddd", flex:1 }}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} style={{
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
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <Field label="Fiscal Year">
            <select value={fy} onChange={e=>setFy(Number(e.target.value))} style={{ ...inp, margin:0, width:120 }}>
              {[thisFY+1, thisFY, thisFY-1, thisFY-2, thisFY-3].map(y=>(
                <option key={y} value={y}>FY {y}</option>
              ))}
            </select>
          </Field>
          <button onClick={()=>window.print()} style={{ ...btn.primary, marginBottom:1 }}>🖨 Print</button>
        </div>
      </div>

      {view==="annual"     && <AnnualReport db={db} range={range} />}
      {view==="compliance" && <ComplianceSupport db={db} range={range} role={role} />}
    </div>
  );
}

// ── Shared totals ─────────────────────────────────────────────────────────────
function useYearFigures(db, range) {
  return useMemo(() => {
    const projects   = db.projects || [];
    const equipment  = db.equipment || [];
    const dispensing = (db.fuelDispensing||[]).filter(f => inRange(f.date, range));
    const workOrders = (db.workOrders||[]).filter(w => inRange(w.openedDate, range));
    const expend     = (db.expenditures||[]).filter(e => inRange(e.date, range));
    const revenue    = (db.revenue||[]).filter(r => inRange(r.date, range));
    const invTx      = (db.inventoryTransactions||[]).filter(t => inRange(t.date, range));

    // Project cost entries falling inside the year
    const sumEntries = (key, amountKey = "totalCost") =>
      projects.reduce((s,p) =>
        s + (p[key]||[]).filter(e => inRange(e.date, range))
                        .reduce((t,e) => t + (e[amountKey] || e.amount || 0), 0), 0);

    const labor      = sumEntries("laborEntries");
    const equipCost  = sumEntries("equipmentEntries");
    const material   = sumEntries("materialEntries");
    const contractor = sumEntries("contractorEntries", "amount");
    const engineering= sumEntries("engineeringEntries", "amount");

    const laborHours = projects.reduce((s,p) =>
      s + (p.laborEntries||[]).filter(e=>inRange(e.date,range))
            .reduce((t,e)=>t+(e.straightTimeHours||0)+(e.overtimeHours||0),0), 0);
    const otHours = projects.reduce((s,p) =>
      s + (p.laborEntries||[]).filter(e=>inRange(e.date,range))
            .reduce((t,e)=>t+(e.overtimeHours||0),0), 0);
    const equipHours = projects.reduce((s,p) =>
      s + (p.equipmentEntries||[]).filter(e=>inRange(e.date,range))
            .reduce((t,e)=>t+(e.hoursOperated||0),0), 0);

    const projectSpend = labor + equipCost + material + contractor + engineering;

    const completed = projects.filter(p => p.status === "complete" && inRange(p.completedDate || p.endDate, range));
    const active    = projects.filter(p => p.status === "active");

    const fuelGallons = dispensing.reduce((s,f)=>s+(f.gallons||0),0);
    const fuelCost    = dispensing.reduce((s,f)=>s+(f.totalCost||0),0);
    const deptFuel    = dispensing.filter(f=>f.consumer==="other_department");

    const totalExpenditure = expend.reduce((s,e)=>s+(e.totalAmount||0),0);
    const totalRevenue     = revenue.reduce((s,r)=>s+(r.amount||0),0);

    return {
      projects, equipment, dispensing, workOrders, expend, revenue, invTx,
      labor, equipCost, material, contractor, engineering, projectSpend,
      laborHours, otHours, equipHours,
      completed, active,
      fuelGallons, fuelCost, deptFuel,
      totalExpenditure, totalRevenue,
    };
  }, [db, range]);
}

// ── Annual report to the Board ────────────────────────────────────────────────
function AnnualReport({ db, range }) {
  const f = useYearFigures(db, range);
  const county = db.countyInfo?.name || "Adams County";

  const roads      = (db.roads||[]).filter(r=>r.status!=="inactive");
  const structures = db.structures || [];
  const bridges    = db.bridges || [];
  const signs      = (db.signs||[]).filter(s=>s.status==="active");
  const signWork   = (db.signHistory||[]).filter(h=>inRange(h.date,range));

  const miles = (list) => list.reduce((s,r)=>s+(parseFloat(r.lengthMiles)||0),0);
  const milesBySurface = ["Concrete","Bituminous","Gravel","Dirt"].map(t=>({
    type:t, count: roads.filter(r=>r.surfaceType===t).length, miles: miles(roads.filter(r=>r.surfaceType===t)),
  }));
  const totalMiles = miles(roads);

  const graveledThisYear = roads.filter(r=>inRange(r.lastGraveled,range)).length;
  const bladedThisYear   = roads.filter(r=>inRange(r.lastBladed,range)).length;
  const sealedThisYear   = roads.filter(r=>inRange(r.lastSealed,range)).length;

  const anyData = f.projectSpend > 0 || f.totalExpenditure > 0 || roads.length > 0 || f.laborHours > 0;

  return (
    <div>
      <div className="print-block" style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:22, fontWeight:700, color:"#1a5a3a" }}>{county} Highway Department</div>
        <div style={{ fontSize:16, fontWeight:600, marginTop:4 }}>Annual Report — {range.label}</div>
        <div style={{ fontSize:12, color:"#888", marginTop:3 }}>
          {fmtDate(range.start)} through {fmtDate(range.end)}
        </div>
      </div>

      {!anyData && (
        <div className="no-print" style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:20, marginBottom:18, fontSize:13, color:"#1a3a5c" }}>
          Nothing recorded in {range.label} yet. This report fills in as work is entered — it reads
          existing project, road, equipment and fuel records rather than needing anything typed twice.
        </div>
      )}

      {/* Headline figures */}
      <div className="print-block" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:22 }}>
        <KPICard label="Total Spend"    value={fmt(f.projectSpend)} sub="Labor, equipment, materials" accent="#1a3a5c" icon="coin" />
        <KPICard label="Labor Hours"    value={Math.round(f.laborHours).toLocaleString()} sub={`${Math.round(f.otHours).toLocaleString()} overtime`} accent="#1a5a3a" icon="clock" />
        <KPICard label="Equipment Hours" value={Math.round(f.equipHours).toLocaleString()} sub="Operated" accent="#5a1a8a" icon="tractor" />
        <KPICard label="Projects Done"  value={f.completed.length} sub={`${f.active.length} still active`} accent="#d97706" icon="clipboard-check" />
      </div>

      {/* Where the money went */}
      <SectionCard title="Where the Money Went" subtitle={range.label} style={{ marginBottom:20 }} className="print-block">
        <div style={{ padding:16 }}>
          {f.projectSpend > 0 ? (
            <>
              <div style={{ display:"flex", height:12, borderRadius:99, overflow:"hidden", marginBottom:12 }}>
                {[["Labor",f.labor,"#1a5a3a"],["Equipment",f.equipCost,"#5a1a8a"],["Materials",f.material,"#1a3a5c"],
                  ["Contractor",f.contractor,"#d97706"],["Engineering",f.engineering,"#888"]]
                  .filter(([,v])=>v>0)
                  .map(([k,v,c])=><div key={k} title={`${k} — ${fmtSm(v)}`} style={{ width:`${(v/f.projectSpend)*100}%`, background:c }} />)}
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <tbody>
                  {[["Labor",f.labor,"#1a5a3a"],["Equipment",f.equipCost,"#5a1a8a"],["Materials",f.material,"#1a3a5c"],
                    ["Contractor",f.contractor,"#d97706"],["Engineering",f.engineering,"#888"]].map(([k,v,c])=>(
                    <tr key={k} style={{ borderBottom:"1px solid #f0f0ee" }}>
                      <td style={{ padding:"7px 0", width:20 }}><span style={{ display:"inline-block", width:10, height:10, borderRadius:2, background:c }} /></td>
                      <td style={{ padding:"7px 0" }}>{k}</td>
                      <td style={{ padding:"7px 0", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{fmtSm(v)}</td>
                      <td style={{ padding:"7px 0 7px 14px", textAlign:"right", fontFamily:"monospace", color:"#888", width:60 }}>
                        {f.projectSpend ? `${((v/f.projectSpend)*100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop:"2px solid #ddd" }}>
                    <td></td>
                    <td style={{ padding:"9px 0", fontWeight:700 }}>Total</td>
                    <td style={{ padding:"9px 0", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:15 }}>{fmt(f.projectSpend)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding:20, textAlign:"center", color:"#aaa", fontSize:13 }}>No project costs recorded in {range.label}</div>
          )}
        </div>
      </SectionCard>

      {/* The road system */}
      <SectionCard title="The Road System" subtitle={`${roads.length} segments · ${totalMiles.toFixed(1)} miles`} style={{ marginBottom:20 }} className="print-block">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Surface","Segments","Miles","Share"].map(h=>(
                <th key={h} style={{ padding:"8px 14px", textAlign:h==="Surface"?"left":"right", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {milesBySurface.map((s,i)=>(
              <tr key={s.type} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={{ padding:"8px 14px", fontWeight:600 }}>{s.type}</td>
                <td style={{ padding:"8px 14px", textAlign:"right", fontFamily:"monospace" }}>{s.count}</td>
                <td style={{ padding:"8px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{s.miles.toFixed(1)}</td>
                <td style={{ padding:"8px 14px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>
                  {totalMiles ? `${((s.miles/totalMiles)*100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
              <td style={{ padding:"9px 14px", fontWeight:700 }}>Total</td>
              <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{roads.length}</td>
              <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{totalMiles.toFixed(1)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        {(graveledThisYear || bladedThisYear || sealedThisYear) > 0 && (
          <div style={{ display:"flex", gap:24, padding:"14px 14px 4px", fontSize:13, flexWrap:"wrap" }}>
            <span>Graveled this year: <strong>{graveledThisYear}</strong> segments</span>
            <span>Bladed: <strong>{bladedThisYear}</strong></span>
            <span>Sealed: <strong>{sealedThisYear}</strong></span>
          </div>
        )}
      </SectionCard>

      {/* Assets */}
      <SectionCard title="Assets Maintained" style={{ marginBottom:20 }} className="print-block">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, padding:16 }}>
          {[
            ["Bridges", bridges.length, bridges.filter(b=>b.loadPosted).length ? `${bridges.filter(b=>b.loadPosted).length} load posted` : ""],
            ["Structures", structures.filter(s=>s.designation==="Structure").length, ""],
            ["Culverts", structures.filter(s=>s.designation==="Culvert").length, ""],
            ["Signs", signs.length, signWork.length ? `${signWork.length} serviced` : ""],
          ].map(([label,count,sub])=>(
            <div key={label} style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:14 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>{label}</div>
              <div style={{ fontSize:24, fontWeight:700, fontFamily:"monospace", color:"#1a3a5c", marginTop:3 }}>{count}</div>
              {sub && <div style={{ fontSize:10, color:"#aaa" }}>{sub}</div>}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Fleet & fuel */}
      <SectionCard title="Fleet & Fuel" style={{ marginBottom:20 }} className="print-block">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, padding:16 }}>
          {[
            ["Units in Fleet", f.equipment.filter(u=>u.status!=="sold").length, ""],
            ["Work Orders", f.workOrders.length, `${f.workOrders.filter(w=>w.status==="closed").length} closed`],
            ["Fuel Used", `${Math.round(f.fuelGallons).toLocaleString()} gal`, fmtSm(f.fuelCost)],
            ["Billed to Departments", `${Math.round(f.deptFuel.reduce((s,d)=>s+(d.gallons||0),0)).toLocaleString()} gal`,
              fmtSm(f.deptFuel.reduce((s,d)=>s+(d.totalCost||0),0))],
          ].map(([label,val,sub])=>(
            <div key={label} style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:14 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888" }}>{label}</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#1a5a3a", marginTop:3 }}>{val}</div>
              {sub && <div style={{ fontSize:10, color:"#aaa" }}>{sub}</div>}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Projects completed */}
      {f.completed.length > 0 && (
        <SectionCard title="Projects Completed" subtitle={`${f.completed.length} in ${range.label}`} className="print-block">
          <Table
            headers={[{label:"Number"},{label:"Name"},{label:"Type"},{label:"Completed"},{label:"Cost"}]}
            rows={f.completed.map(p=>{
              const cost = ["laborEntries","equipmentEntries","materialEntries","contractorEntries","engineeringEntries"]
                .reduce((s,k)=>s+(p[k]||[]).reduce((t,e)=>t+(e.totalCost||e.amount||0),0),0);
              return [
                <span style={{ fontFamily:"monospace", fontWeight:700 }}>{p.projectNumber||"—"}</span>,
                <span style={{ fontWeight:600 }}>{p.name||"—"}</span>,
                <span style={{ fontSize:12, textTransform:"capitalize" }}>{p.type}</span>,
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(p.completedDate||p.endDate)}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(cost)}</span>,
              ];
            })}
          />
        </SectionCard>
      )}

      <div style={{ fontSize:10, color:"#aaa", marginTop:24, textAlign:"center" }}>
        Generated from Pinpoint on {fmtDate(new Date().toISOString().split("T")[0])} · {county} Highway Department
      </div>
    </div>
  );
}

// ── ACPC supporting reports ───────────────────────────────────────────────────
function ComplianceSupport({ db, range, role }) {
  const f = useYearFigures(db, range);
  const county = db.countyInfo?.name || "Adams County";
  const items  = db.inventoryItems || [];
  const batches= db.inventoryBatches || [];
  const equipment = (db.equipment||[]).filter(u=>u.status!=="sold");

  const onHandValue = (itemId) => batches
    .filter(b=>b.itemId===itemId && b.status==="open")
    .reduce((s,b)=>s+(b.quantityRemaining||0)*(b.unitCost||0),0);
  const inventoryValue = items.reduce((s,i)=>s+onHandValue(i.id),0);

  // Equipment operating cost — the fourth certification
  const equipCosts = equipment.map(u => {
    const wos  = (db.workOrders||[]).filter(w=>w.unitId===u.id && inRange(w.openedDate,range));
    const fuel = (db.fuelDispensing||[]).filter(d=>d.equipmentId===u.id && inRange(d.date,range));
    const parts   = wos.reduce((s,w)=>s+(w.totalPartsCost||0),0);
    const labor   = wos.reduce((s,w)=>s+(w.totalLaborCost||0),0);
    const outside = wos.reduce((s,w)=>s+(w.totalServiceCost||0),0);
    const fuelCost= fuel.reduce((s,d)=>s+(d.totalCost||0),0);
    const gallons = fuel.reduce((s,d)=>s+(d.gallons||0),0);
    return { unit:u, parts, labor, outside, fuelCost, gallons, total: parts+labor+outside+fuelCost };
  }).filter(r => r.total > 0).sort((a,b)=>b.total-a.total);

  const equipTotal = equipCosts.reduce((s,r)=>s+r.total,0);

  const CERTS = [
    { n:4, text:"uses a system of revenue and costs accounting which clearly includes a comparison of receipts and expenditures for approved budgets, plans, programs, and standards", evidence:"Receipts & Expenditures, below" },
    { n:5, text:"uses a system of budgeting which reflects uses and sources of funds in terms of plans, programs, or standards and accomplishments", evidence:"Receipts & Expenditures, below" },
    { n:6, text:"uses an accounting system including an inventory of machinery, equipment, and supplies", evidence:"Machinery, Equipment & Supplies, below" },
    { n:7, text:"uses an accounting system that tracks equipment operation costs", evidence:"Equipment Operation Costs, below" },
  ];

  return (
    <div>
      <div className="print-block" style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:20, fontWeight:700, color:"#1a5a3a" }}>{county} Highway Department</div>
        <div style={{ fontSize:15, fontWeight:600, marginTop:4 }}>Supporting Records — Annual Certification of Program Compliance</div>
        <div style={{ fontSize:12, color:"#888", marginTop:3 }}>{range.label} · {fmtDate(range.start)} through {fmtDate(range.end)}</div>
      </div>

      <div className="no-print" style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:16, marginBottom:20, fontSize:12, color:"#1a3a5c", lineHeight:1.6 }}>
        <strong>The ACPC form itself is not produced here.</strong> The Clerk receives it from the
        Nebraska Board of Public Roads Classifications and Standards each year and it goes to the Board
        for approval — and NBCS states that recreations of the form will not be accepted.
        What follows is the <strong>evidence behind four of the nine certifications</strong>, which the
        county has to be able to produce on request.
      </div>

      <SectionCard title="Certifications This Evidences" style={{ marginBottom:20 }} className="print-block">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <tbody>
            {CERTS.map(c=>(
              <tr key={c.n} style={{ borderBottom:"1px solid #f0f0ee" }}>
                <td style={{ padding:"10px 12px", width:34, verticalAlign:"top", fontWeight:700, color:"#1a5a3a" }}>✓</td>
                <td style={{ padding:"10px 12px", verticalAlign:"top", lineHeight:1.55, fontStyle:"italic", color:"#555" }}>"{c.text}"</td>
                <td style={{ padding:"10px 12px", verticalAlign:"top", whiteSpace:"nowrap", fontSize:11, color:"#1a3a5c", fontWeight:600 }}>{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* 1 — Receipts & expenditures */}
      <SectionCard title="Receipts & Expenditures" subtitle="Certifications 4 and 5" style={{ marginBottom:20 }} className="print-section">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, padding:16 }}>
          <KPICard label="Receipts"     value={fmt(f.totalRevenue)}      sub={`${f.revenue.length} entries`} accent="#1a5a3a" icon="arrow-down-circle" />
          <KPICard label="Expenditures" value={fmt(f.totalExpenditure)}  sub={`${f.expend.length} claims`}  accent="#c0392b" icon="arrow-up-circle" />
          <KPICard label="Net"          value={fmt(f.totalRevenue - f.totalExpenditure)} sub={range.label} accent="#1a3a5c" icon="scale" />
        </div>
        <div style={{ padding:"0 16px 16px", fontSize:12, color:"#888", lineHeight:1.6 }}>
          Expenditures are the claims approved through the claim cycle. Receipts are revenue entries
          recorded in the same period. Budget comparison by expenditure code is available in Fund
          Accounting; this is the department-level summary.
        </div>
      </SectionCard>

      {/* 2 — Inventory of machinery, equipment and supplies */}
      <SectionCard title="Machinery, Equipment & Supplies" subtitle="Certification 6" style={{ marginBottom:20 }} className="print-section">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, padding:16 }}>
          <KPICard label="Equipment Units" value={equipment.length} sub="In fleet" accent="#1a3a5c" icon="tractor" />
          <KPICard label="Supply Items"    value={items.filter(i=>i.active!==false).length} sub="In catalog" accent="#5a1a8a" icon="package" />
          <KPICard label="Inventory Value" value={fmt(inventoryValue)} sub="FIFO, on hand" accent="#1a5a3a" icon="building-bank" />
        </div>
        <div style={{ padding:"0 16px 16px" }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:8 }}>Equipment Inventory</div>
          <Table
            headers={[{label:"Unit"},{label:"Description"},{label:"Serial / VIN"},{label:"Acquired"},{label:"Cost"}]}
            rows={equipment.sort((a,b)=>(a.unitNumber||"").localeCompare(b.unitNumber||"",undefined,{numeric:true})).map(u=>[
              <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{u.unitNumber||"—"}</span>,
              <span>{[u.year,u.make,u.model].filter(Boolean).join(" ")||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:11, color:"#888" }}>{u.serialNumber||u.vin||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(u.dateAcquired)}</span>,
              <span style={{ fontFamily:"monospace" }}>{u.purchasePrice?fmtSm(u.purchasePrice):"—"}</span>,
            ])}
            emptyMessage="No equipment recorded"
          />
        </div>
      </SectionCard>

      {/* 3 — Equipment operation costs */}
      <SectionCard title="Equipment Operation Costs" subtitle="Certification 7" className="print-section">
        <div style={{ padding:"14px 16px 0", fontSize:12, color:"#888", lineHeight:1.6 }}>
          Fuel, parts, in-house labor and outside repairs per unit for {range.label}. Depreciation is excluded.
        </div>
        <div style={{ padding:16 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["Unit","Description","Fuel","Gallons","Parts","Labor","Outside","Total"].map(h=>(
                  <th key={h} style={{ padding:"8px 10px", textAlign:["Unit","Description"].includes(h)?"left":"right", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipCosts.length===0 && (
                <tr><td colSpan={8} style={{ padding:26, textAlign:"center", color:"#aaa" }}>No equipment costs recorded in {range.label}</td></tr>
              )}
              {equipCosts.map((r,i)=>(
                <tr key={r.unit.id} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"7px 10px", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{r.unit.unitNumber||"—"}</td>
                  <td style={{ padding:"7px 10px" }}>{[r.unit.year,r.unit.make,r.unit.model].filter(Boolean).join(" ")}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace" }}>{r.fuelCost?fmtSm(r.fuelCost):"—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{r.gallons?r.gallons.toFixed(1):"—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace" }}>{r.parts?fmtSm(r.parts):"—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace" }}>{r.labor?fmtSm(r.labor):"—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace" }}>{r.outside?fmtSm(r.outside):"—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {equipCosts.length>0 && (
              <tfoot>
                <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                  <td colSpan={7} style={{ padding:"9px 10px", textAlign:"right", fontWeight:700 }}>Total equipment operation cost</td>
                  <td style={{ padding:"9px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14 }}>{fmt(equipTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      <div style={{ fontSize:10, color:"#aaa", marginTop:24, textAlign:"center" }}>
        Generated from Pinpoint on {fmtDate(new Date().toISOString().split("T")[0])} ·
        Supporting records for the {range.label} Annual Certification of Program Compliance
      </div>
    </div>
  );
}
