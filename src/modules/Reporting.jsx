import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, inp, btn, fmt, fmtSm } from "../components/shared.jsx";
import { FISCAL_YEAR, EXPENDITURE_CODES, REVENUE_CODES } from "../data/accountCodes.js";

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING
//
// Three jobs:
//
// 1. An annual synopsis for the Board — what the department actually did in
//    the year, in plain figures.
//
// 2. Receipts and expenditures against budget. The county is required to keep
//    a system of revenue and cost accounting; this is where it can be seen
//    and printed.
//
// 3. An inventory of machinery, equipment and supplies, and what the equipment
//    costs to operate.
//
// A note on the state forms
// ─────────────────────────
// Nebraska's Board of Public Roads Classifications and Standards used to
// collect three workbooks under 428 NAC 4 — a financial report, a materials
// and supplies inventory, and a machinery and equipment inventory. Those are
// no longer submitted, so nothing here is shaped to their line numbers.
//
// What survives is the underlying obligation: the county must HAVE a system of
// inventory and accounting, and the ACPC certifies that it does. So these
// reports carry the same kinds of information, expressed in the county's own
// account codes rather than translated into the state's. Copies of the old
// forms are kept in docs/reference/ for comparison only.
// ─────────────────────────────────────────────────────────────────────────────

// Expenditure codes carry their category in the leading digit — 302.02 is a
// category 3 (supplies and materials) code. That's the county's own structure,
// so the reports group by it directly.
const EXP_CATEGORIES = [
  { digit:"1", label:"Personal Services" },
  { digit:"2", label:"Operating Expenses" },
  { digit:"3", label:"Supplies and Materials" },
  { digit:"4", label:"Equipment Rental" },
  { digit:"5", label:"Capital Outlays" },
  { digit:"6", label:"Debt Servicing" },
  { digit:"7", label:"Transfers" },
];
const categoryOf = (code) => String(code ?? "").trim().charAt(0) || "?";
const EXP_LOOKUP = new Map(EXPENDITURE_CODES.map(c => [c.code, c]));
const REV_LOOKUP = new Map(REVENUE_CODES.map(c => [c.code, c]));

// Codes are written both ways in practice — "302.1" and "302.10" are the same
// account — so look up both before giving up.
function describeCode(code, lookup) {
  const raw = String(code ?? "").trim();
  if (!raw) return "";
  const hit = lookup.get(raw);
  if (hit) return hit.description;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return "";
  for (const [k, v] of lookup) if (parseFloat(k) === n) return v.description;
  return "";
}

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
    { id:"annual",    label:"Annual Report",           icon:"presentation" },
    { id:"ledger",    label:"Receipts & Expenditures", icon:"scale" },
    { id:"inventory", label:"Inventory & Equipment",   icon:"package" },
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

      {view==="annual"    && <AnnualReport db={db} range={range} />}
      {view==="ledger"    && <ReceiptsExpenditures db={db} range={range} />}
      {view==="inventory" && <InventoryEquipment db={db} range={range} />}
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
  const county = db.countyInfo?.name || db.countyInfo?.countyName || "County";

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

// ── Shared bits for the two ledger-style reports ──────────────────────────────
function ReportHeader({ county, title, range }) {
  return (
    <div className="print-block" style={{ textAlign:"center", marginBottom:20 }}>
      <div style={{ fontSize:20, fontWeight:700, color:"#1a5a3a" }}>{county} Highway Department</div>
      <div style={{ fontSize:15, fontWeight:600, marginTop:4 }}>{title}</div>
      <div style={{ fontSize:12, color:"#888", marginTop:3 }}>
        {range.label} · {fmtDate(range.start)} through {fmtDate(range.end)}
      </div>
    </div>
  );
}

const th = (align="left") => ({
  padding:"8px 10px", textAlign:align, fontWeight:700, fontSize:10,
  textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee",
});
const td = (align="left", extra={}) => ({
  padding:"7px 10px", textAlign:align,
  ...(align==="right" ? { fontFamily:"monospace" } : {}), ...extra,
});

function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map(r => r.map(esc).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CSVButton = ({ onClick }) => (
  <button className="no-print" onClick={onClick} style={{ ...btn.secondary, fontSize:11, padding:"5px 10px" }}>
    Export CSV
  </button>
);

// ── Receipts & expenditures ───────────────────────────────────────────────────
//
// The comparison the county has to be able to show: what came in, what went
// out, and how the spending sits against the budget it was given.
function ReceiptsExpenditures({ db, range }) {
  const county = db.countyInfo?.name || db.countyInfo?.countyName || "County";

  const revenue = (db.revenue || []).filter(r => inRange(r.date, range));
  const expend  = (db.expenditures || []).filter(e => inRange(e.date, range));

  // Revenue by code. The Treasurer's receipt is what makes revenue official, so
  // the two states are shown apart rather than added together silently.
  const revenueRows = useMemo(() => {
    const by = new Map();
    for (const r of revenue) {
      const lines = (r.lines && r.lines.length)
        ? r.lines
        : [{ code: r.code, amount: r.amount || r.totalAmount || 0 }];
      for (const l of lines) {
        const code = String(l.code || r.code || "").trim() || "(uncoded)";
        const cur  = by.get(code) || { code, description: describeCode(code, REV_LOOKUP), count:0, receipted:0, pending:0 };
        cur.count += 1;
        if (r.status === "receipted") cur.receipted += l.amount || 0;
        else                          cur.pending   += l.amount || 0;
        by.set(code, cur);
      }
    }
    return [...by.values()].sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric:true }));
  }, [revenue]);

  const revReceipted = revenueRows.reduce((s,r) => s + r.receipted, 0);
  const revPending   = revenueRows.reduce((s,r) => s + r.pending, 0);

  // Expenditures by code, then grouped into the seven categories.
  const expenditureGroups = useMemo(() => {
    const by = new Map();
    for (const e of expend) {
      for (const l of (e.lines || [])) {
        const code = String(l.code || "").trim() || "(uncoded)";
        const cur  = by.get(code) || {
          code,
          description: l.description || describeCode(code, EXP_LOOKUP),
          budgeted: EXP_LOOKUP.get(code)?.budgeted ?? null,
          count: 0, actual: 0,
        };
        cur.count  += 1;
        cur.actual += l.amount || 0;
        by.set(code, cur);
      }
    }
    const rows = [...by.values()];
    return EXP_CATEGORIES
      .map(c => ({
        ...c,
        rows: rows.filter(r => categoryOf(r.code) === c.digit)
                  .sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric:true })),
      }))
      .concat([{ digit:"?", label:"Unclassified",
        rows: rows.filter(r => !EXP_CATEGORIES.some(c => c.digit === categoryOf(r.code)))
                  .sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric:true })) }])
      .filter(g => g.rows.length > 0)
      .map(g => ({
        ...g,
        actual:   g.rows.reduce((s,r) => s + r.actual, 0),
        budgeted: g.rows.reduce((s,r) => s + (r.budgeted || 0), 0),
      }));
  }, [expend]);

  const expTotal    = expenditureGroups.reduce((s,g) => s + g.actual, 0);
  const budgetTotal = expenditureGroups.reduce((s,g) => s + g.budgeted, 0);

  const exportExpenditures = () => downloadCSV(
    `receipts-expenditures-${range.label.replace(/\s/g,"")}.csv`,
    [
      ["Section","Category","Code","Description","Count","Budgeted","Actual","Variance"],
      ...revenueRows.map(r => ["Revenue","", r.code, r.description, r.count, "", r.receipted + r.pending, ""]),
      ...expenditureGroups.flatMap(g => g.rows.map(r => [
        "Expenditure", g.label, r.code, r.description, r.count,
        r.budgeted ?? "", r.actual, r.budgeted != null ? r.budgeted - r.actual : "",
      ])),
    ]
  );

  return (
    <div>
      <ReportHeader county={county} title="Receipts & Expenditures" range={range} />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }} className="print-block">
        <KPICard label="Receipts"     value={fmt(revReceipted + revPending)} sub={`${revenue.length} entries`} accent="#1a5a3a" icon="arrow-down-circle" />
        <KPICard label="Expenditures" value={fmt(expTotal)}                  sub={`${expend.length} claims`}  accent="#c0392b" icon="arrow-up-circle" />
        <KPICard label="Net"          value={fmt(revReceipted + revPending - expTotal)} sub={range.label} accent="#1a3a5c" icon="scale" />
        <KPICard label="Budget Used"  value={budgetTotal ? `${Math.round((expTotal/budgetTotal)*100)}%` : "—"}
          sub={budgetTotal ? `of ${fmt(budgetTotal)}` : "No budget on these codes"} accent="#d97706" icon="chart-bar" />
      </div>

      {/* Receipts */}
      <SectionCard
        title="Receipts" subtitle={`By revenue code · ${range.label}`} className="print-section"
        action={<CSVButton onClick={exportExpenditures} />}
      >
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              <th style={th()}>Code</th><th style={th()}>Description</th>
              <th style={th("right")}>Entries</th>
              <th style={th("right")}>Receipted</th>
              <th style={th("right")}>Awaiting Receipt</th>
              <th style={th("right")}>Total</th>
            </tr>
          </thead>
          <tbody>
            {revenueRows.length === 0 && (
              <tr><td colSpan={6} style={{ padding:26, textAlign:"center", color:"#aaa" }}>No revenue recorded in {range.label}</td></tr>
            )}
            {revenueRows.map((r,i) => (
              <tr key={r.code} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={td("left", { fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" })}>{r.code}</td>
                <td style={td()}>{r.description || <span style={{ color:"#bbb" }}>—</span>}</td>
                <td style={td("right", { color:"#888" })}>{r.count}</td>
                <td style={td("right")}>{r.receipted ? fmtSm(r.receipted) : "—"}</td>
                <td style={td("right", { color: r.pending ? "#d97706" : "#ccc" })}>{r.pending ? fmtSm(r.pending) : "—"}</td>
                <td style={td("right", { fontWeight:700 })}>{fmtSm(r.receipted + r.pending)}</td>
              </tr>
            ))}
          </tbody>
          {revenueRows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                <td colSpan={3} style={{ padding:"9px 10px", fontWeight:700 }}>Total receipts</td>
                <td style={td("right", { fontWeight:700 })}>{fmtSm(revReceipted)}</td>
                <td style={td("right", { fontWeight:700, color: revPending ? "#d97706" : "#888" })}>{fmtSm(revPending)}</td>
                <td style={td("right", { fontWeight:700, fontSize:14 })}>{fmt(revReceipted + revPending)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {revPending > 0 && (
          <div style={{ padding:"12px 14px", fontSize:12, color:"#7a4f00", background:"#fef8e8", borderTop:"1px solid #f0e0b0", lineHeight:1.6 }}>
            {fmt(revPending)} has been entered but not yet receipted by the Treasurer. Revenue becomes
            official on the receipt, so the two are kept apart here rather than added together.
          </div>
        )}
      </SectionCard>

      {/* Expenditures */}
      <SectionCard title="Expenditures Against Budget" subtitle={`By account code · ${range.label}`} className="print-section">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              <th style={th()}>Code</th><th style={th()}>Description</th>
              <th style={th("right")}>Claims</th>
              <th style={th("right")}>Budgeted</th>
              <th style={th("right")}>Actual</th>
              <th style={th("right")}>Remaining</th>
              <th style={th("right")}>Used</th>
            </tr>
          </thead>
          <tbody>
            {expenditureGroups.length === 0 && (
              <tr><td colSpan={7} style={{ padding:26, textAlign:"center", color:"#aaa" }}>No expenditures recorded in {range.label}</td></tr>
            )}
            {expenditureGroups.map(g => (
              <ExpCategoryBlock key={g.digit} group={g} />
            ))}
          </tbody>
          {expenditureGroups.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                <td colSpan={3} style={{ padding:"9px 10px", fontWeight:700 }}>Total expenditures</td>
                <td style={td("right", { fontWeight:700 })}>{budgetTotal ? fmt(budgetTotal) : "—"}</td>
                <td style={td("right", { fontWeight:700, fontSize:14 })}>{fmt(expTotal)}</td>
                <td style={td("right", { fontWeight:700, color: budgetTotal - expTotal < 0 ? "#c0392b" : "#1a5a3a" })}>
                  {budgetTotal ? fmt(budgetTotal - expTotal) : "—"}
                </td>
                <td style={td("right", { fontWeight:700 })}>{budgetTotal ? `${Math.round((expTotal/budgetTotal)*100)}%` : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </SectionCard>

      <div style={{ background:"#f7f7f5", border:"1px solid #e8e8e4", borderRadius:8, padding:14, fontSize:12, color:"#666", lineHeight:1.65, marginBottom:20 }}>
        <strong style={{ color:"#444" }}>These are cash figures, not project costs.</strong> This report
        follows money out of the fund — what was claimed and paid. What that money was consumed
        <em> on</em> is a separate question answered in Cost Accounting, where a culvert bought in June
        and installed in August lands in August. The two views must never be added together.
      </div>

      <div style={{ fontSize:10, color:"#aaa", marginTop:24, textAlign:"center" }}>
        Generated from Pinpoint on {fmtDate(new Date().toISOString().split("T")[0])} · {county} Highway Department
      </div>
    </div>
  );
}

// One expenditure category, collapsible so a long chart of accounts stays readable.
function ExpCategoryBlock({ group }) {
  const [open, setOpen] = useState(true);
  const remaining = group.budgeted - group.actual;
  const used = group.budgeted ? Math.round((group.actual / group.budgeted) * 100) : null;

  return (
    <>
      <tr style={{ background:"#eef2ee", borderTop:"2px solid #dde5dd", cursor:"pointer" }} onClick={()=>setOpen(o=>!o)}>
        <td colSpan={3} style={{ padding:"9px 10px", fontWeight:700, color:"#1a5a3a" }}>
          <span className="no-print" style={{ display:"inline-block", width:14, color:"#8aa" }}>{open?"▾":"▸"}</span>
          {group.digit !== "?" && <span style={{ fontFamily:"monospace", marginRight:8 }}>{group.digit}</span>}
          {group.label}
        </td>
        <td style={td("right", { fontWeight:700 })}>{group.budgeted ? fmt(group.budgeted) : "—"}</td>
        <td style={td("right", { fontWeight:700 })}>{fmt(group.actual)}</td>
        <td style={td("right", { fontWeight:700, color: remaining < 0 ? "#c0392b" : "#1a5a3a" })}>
          {group.budgeted ? fmt(remaining) : "—"}
        </td>
        <td style={td("right", { fontWeight:700 })}>{used != null ? `${used}%` : "—"}</td>
      </tr>
      {open && group.rows.map((r,i) => {
        const rem = r.budgeted != null ? r.budgeted - r.actual : null;
        const u   = r.budgeted ? Math.round((r.actual / r.budgeted) * 100) : null;
        return (
          <tr key={r.code} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
            <td style={td("left", { fontFamily:"monospace", fontWeight:700, color:"#1a3a5c", paddingLeft:24 })}>{r.code}</td>
            <td style={td()}>{r.description || <span style={{ color:"#bbb" }}>—</span>}</td>
            <td style={td("right", { color:"#888" })}>{r.count}</td>
            <td style={td("right", { color: r.budgeted == null ? "#ccc" : "inherit" })}>
              {r.budgeted != null ? fmtSm(r.budgeted) : "not budgeted"}
            </td>
            <td style={td("right", { fontWeight:600 })}>{fmtSm(r.actual)}</td>
            <td style={td("right", { color: rem == null ? "#ccc" : rem < 0 ? "#c0392b" : "#666" })}>
              {rem != null ? fmtSm(rem) : "—"}
            </td>
            <td style={td("right", { color: u == null ? "#ccc" : u > 100 ? "#c0392b" : "#666", fontWeight: u != null && u > 100 ? 700 : 400 })}>
              {u != null ? `${u}%` : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Inventory & equipment ─────────────────────────────────────────────────────
//
// The inventory of machinery, equipment and supplies, and what the equipment
// costs to run. Supplies are valued at FIFO cost from the open batches, so the
// figure is what the county actually paid for what is actually on the shelf.
function InventoryEquipment({ db, range }) {
  const county    = db.countyInfo?.name || db.countyInfo?.countyName || "County";
  const items     = db.inventoryItems || [];
  const batches   = db.inventoryBatches || [];
  const equipment = (db.equipment || []).filter(u => u.status !== "sold");
  const [msView, setMsView] = useState("account");

  // On-hand value per item from open FIFO batches.
  const valueByItem = useMemo(() => {
    const m = new Map();
    for (const b of batches) {
      if (b.status !== "open") continue;
      const v = (b.quantityRemaining || 0) * (b.unitCost || 0);
      if (!v) continue;
      const cur = m.get(b.itemId) || { value:0, qty:0 };
      cur.value += v; cur.qty += b.quantityRemaining || 0;
      m.set(b.itemId, cur);
    }
    return m;
  }, [batches]);

  const inventoryValue = [...valueByItem.values()].reduce((s,v) => s + v.value, 0);
  const itemsOnHand    = [...valueByItem.keys()].length;

  // Supplies rolled up two ways — by the account they were bought under, and by
  // the commodity group they're stored as. Both are asked for; neither is wrong.
  const msRows = useMemo(() => {
    const key = msView === "account"
      ? (i) => String(i.glAccountCode || "").trim() || "(uncoded)"
      : (i) => (i.commodityGroupCode ? `${i.commodityGroupCode} — ` : "") + (i.commodityGroup || "(ungrouped)");
    const by = new Map();
    for (const i of items) {
      const v = valueByItem.get(i.id);
      if (!v) continue;
      const k   = key(i);
      const cur = by.get(k) || { key:k, description: msView === "account" ? describeCode(i.glAccountCode, EXP_LOOKUP) : "", items:0, value:0 };
      cur.items += 1; cur.value += v.value;
      by.set(k, cur);
    }
    return [...by.values()].sort((a,b) =>
      msView === "account"
        ? a.key.localeCompare(b.key, undefined, { numeric:true })
        : b.value - a.value);
  }, [items, valueByItem, msView]);

  // Equipment operating cost for the year, plus meter travelled — derived from
  // the fuelling readings, which is the one meter record taken consistently.
  const equipRows = useMemo(() => equipment.map(u => {
    const allWos  = (db.workOrders || []).filter(w => w.unitId === u.id);
    const allFuel = (db.fuelDispensing || []).filter(d => d.equipmentId === u.id);
    const wos  = allWos.filter(w => inRange(w.openedDate, range));
    const fuel = allFuel.filter(d => inRange(d.date, range));

    const readings = fuel.map(d => Number(d.meterReading) || 0).filter(n => n > 0);
    const metered  = readings.length >= 2 ? Math.max(...readings) - Math.min(...readings) : 0;

    const sum = (list, key) => list.reduce((s,x) => s + (x[key] || 0), 0);

    const parts    = sum(wos, "totalPartsCost");
    const labor    = sum(wos, "totalLaborCost");
    const outside  = sum(wos, "totalServiceCost");
    const fuelCost = sum(fuel, "totalCost");
    const gallons  = sum(fuel, "gallons");
    const total    = parts + labor + outside + fuelCost;

    // Lifetime runs from the day the county took the machine on, NOT from zero
    // on the gauge. Hours a previous owner put on it were not fuelled or
    // maintained here, so charging them against our cost per hour flatters an
    // old machine and tells you nothing useful.
    const ownedMeter = Math.max(0, (Number(u.currentMeter) || 0) - (Number(u.startingMeter) || 0));
    const lifetimeTotal =
      sum(allWos, "totalPartsCost") + sum(allWos, "totalLaborCost") +
      sum(allWos, "totalServiceCost") + sum(allFuel, "totalCost");

    return {
      unit:u, parts, labor, outside, fuelCost, gallons, metered, total,
      costRate: metered > 0 ? total / metered : null,
      ownedMeter, lifetimeTotal,
      lifetimeRate: ownedMeter > 0 ? lifetimeTotal / ownedMeter : null,
    };
  }).sort((a,b) => (a.unit.unitNumber||"").localeCompare(b.unit.unitNumber||"", undefined, { numeric:true })),
  [equipment, db.workOrders, db.fuelDispensing, range]);

  const active     = equipRows.filter(r => r.total > 0);
  const equipTotal = active.reduce((s,r) => s + r.total, 0);
  const fleetValue = equipment.reduce((s,u) => s + (Number(u.purchasePrice) || 0), 0);

  const exportMS = () => downloadCSV(
    `materials-supplies-${range.label.replace(/\s/g,"")}.csv`,
    [[msView === "account" ? "Account Code" : "Commodity Group", "Description", "Items", "Value On Hand"],
     ...msRows.map(r => [r.key, r.description, r.items, r.value.toFixed(2)])]
  );

  const exportEquip = () => downloadCSV(
    `machinery-equipment-${range.label.replace(/\s/g,"")}.csv`,
    [["Unit","Year","Make","Model","Serial/VIN","Acquired","Purchase Cost","Meter Type",
      "Meter This Year","Fuel","Gallons","Parts","Labor","Outside","Total Operating","Cost Rate This Year",
      "Meter Since Acquired","Lifetime Operating","Lifetime Cost Rate"],
     ...equipRows.map(r => [
       r.unit.unitNumber, r.unit.year, r.unit.make, r.unit.model,
       r.unit.serialNumber || r.unit.vin, r.unit.dateAcquired, r.unit.purchasePrice || "",
       r.unit.meterType, r.metered || "", r.fuelCost.toFixed(2), r.gallons.toFixed(1),
       r.parts.toFixed(2), r.labor.toFixed(2), r.outside.toFixed(2), r.total.toFixed(2),
       r.costRate != null ? r.costRate.toFixed(2) : "",
       r.ownedMeter || "", r.lifetimeTotal.toFixed(2),
       r.lifetimeRate != null ? r.lifetimeRate.toFixed(2) : "",
     ])]
  );

  return (
    <div>
      <ReportHeader county={county} title="Inventory of Machinery, Equipment & Supplies" range={range} />

      <div className="no-print" style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:8, padding:14, marginBottom:20, fontSize:12, color:"#1a3a5c", lineHeight:1.6 }}>
        The county has to keep a system of inventory and accounting, and to be able to show what its
        equipment costs to operate. This is that record. Supplies are valued at what was paid for the
        stock actually on the shelf — FIFO from the open receiving batches, not a standard cost.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }} className="print-block">
        <KPICard label="Equipment Units" value={equipment.length}     sub="In fleet"                accent="#1a3a5c" icon="tractor" />
        <KPICard label="Fleet at Cost"   value={fmt(fleetValue)}      sub="Purchase price, no depreciation" accent="#5a1a8a" icon="building-bank" />
        <KPICard label="Supply Items"    value={itemsOnHand.toLocaleString()} sub={`of ${items.filter(i=>i.active!==false).length.toLocaleString()} in catalog`} accent="#d97706" icon="package" />
        <KPICard label="Supplies Value"  value={fmt(inventoryValue)}  sub="FIFO, on hand"           accent="#1a5a3a" icon="coin" />
      </div>

      {/* Materials & supplies */}
      <SectionCard
        title="Materials & Supplies On Hand"
        subtitle={msView === "account" ? "By account code" : "By commodity group"}
        className="print-section"
        action={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div className="no-print" style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
              {[["account","Account"],["group","Commodity Group"]].map(([id,label])=>(
                <button key={id} onClick={()=>setMsView(id)} style={{
                  border:"none", padding:"5px 10px", fontSize:11, cursor:"pointer",
                  background: msView===id ? "#1a5a3a" : "#fff", color: msView===id ? "#fff" : "#666",
                  fontWeight: msView===id ? 700 : 400,
                }}>{label}</button>
              ))}
            </div>
            <CSVButton onClick={exportMS} />
          </div>
        }
      >
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              <th style={th()}>{msView === "account" ? "Account Code" : "Commodity Group"}</th>
              {msView === "account" && <th style={th()}>Description</th>}
              <th style={th("right")}>Items</th>
              <th style={th("right")}>Value On Hand</th>
              <th style={th("right")}>Share</th>
            </tr>
          </thead>
          <tbody>
            {msRows.length === 0 && (
              <tr><td colSpan={5} style={{ padding:26, textAlign:"center", color:"#aaa" }}>
                Nothing on hand. Values appear once stock is received.
              </td></tr>
            )}
            {msRows.map((r,i) => (
              <tr key={r.key} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                <td style={td("left", { fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" })}>{r.key}</td>
                {msView === "account" && <td style={td()}>{r.description || <span style={{ color:"#bbb" }}>—</span>}</td>}
                <td style={td("right", { color:"#888" })}>{r.items.toLocaleString()}</td>
                <td style={td("right", { fontWeight:600 })}>{fmtSm(r.value)}</td>
                <td style={td("right", { color:"#888" })}>
                  {inventoryValue ? `${((r.value/inventoryValue)*100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {msRows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                <td colSpan={msView === "account" ? 2 : 1} style={{ padding:"9px 10px", fontWeight:700 }}>Total value on hand</td>
                <td style={td("right", { fontWeight:700 })}>{itemsOnHand.toLocaleString()}</td>
                <td style={td("right", { fontWeight:700, fontSize:14 })}>{fmt(inventoryValue)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </SectionCard>

      {/* Machinery & equipment */}
      <SectionCard
        title="Machinery & Equipment"
        subtitle={`${equipment.length} units · operating cost for ${range.label}`}
        className="print-section"
        action={<CSVButton onClick={exportEquip} />}
      >
        <div style={{ padding:"12px 14px 0", fontSize:12, color:"#888", lineHeight:1.6 }}>
          <strong>Rate this year</strong> uses the meter travelled inside the fiscal year, taken from
          the fuelling readings. <strong>Lifetime rate</strong> runs from the day the county acquired the
          machine — hours a previous owner put on it were not fuelled or maintained here, so counting
          them would flatter an old machine and tell you nothing. Depreciation is not tracked.
        </div>
        <div style={{ padding:"12px 0 0", overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                <th style={th()}>Unit</th><th style={th()}>Description</th>
                <th style={th()}>Acquired</th><th style={th("right")}>Purchase</th>
                <th style={th("right")}>Hours / Miles</th>
                <th style={th("right")}>Fuel</th><th style={th("right")}>Parts</th>
                <th style={th("right")}>Labor</th><th style={th("right")}>Outside</th>
                <th style={th("right")}>Total</th>
                <th style={th("right")}>Rate This Yr</th>
                <th style={th("right")}>Lifetime Rate</th>
              </tr>
            </thead>
            <tbody>
              {equipRows.length === 0 && (
                <tr><td colSpan={12} style={{ padding:26, textAlign:"center", color:"#aaa" }}>No equipment recorded</td></tr>
              )}
              {equipRows.map((r,i) => (
                <tr key={r.unit.id} style={{ borderTop:"1px solid #f0f0ee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={td("left", { fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" })}>{r.unit.unitNumber||"—"}</td>
                  <td style={td()}>{[r.unit.year,r.unit.make,r.unit.model].filter(Boolean).join(" ") || r.unit.description || "—"}</td>
                  <td style={td("left", { fontFamily:"monospace", fontSize:11, color:"#888" })}>{fmtDate(r.unit.dateAcquired)}</td>
                  <td style={td("right")}>{r.unit.purchasePrice ? fmt(r.unit.purchasePrice) : "—"}</td>
                  <td style={td("right", { color: r.metered ? "inherit" : "#ccc" })}>
                    {r.metered ? Math.round(r.metered).toLocaleString() : "—"}
                    {r.metered ? <span style={{ color:"#aaa", fontSize:10 }}> {r.unit.meterType==="miles"?"mi":"hr"}</span> : null}
                  </td>
                  <td style={td("right")}>{r.fuelCost ? fmtSm(r.fuelCost) : "—"}</td>
                  <td style={td("right")}>{r.parts   ? fmtSm(r.parts)   : "—"}</td>
                  <td style={td("right")}>{r.labor   ? fmtSm(r.labor)   : "—"}</td>
                  <td style={td("right")}>{r.outside ? fmtSm(r.outside) : "—"}</td>
                  <td style={td("right", { fontWeight:700 })}>{r.total ? fmtSm(r.total) : "—"}</td>
                  <td style={td("right", { color:"#1a5a3a", fontWeight:600 })}>
                    {r.costRate != null ? `${fmtSm(r.costRate)}/${r.unit.meterType==="miles"?"mi":"hr"}` : "—"}
                  </td>
                  <td style={td("right", { color:"#1a3a5c", fontWeight:600 })}
                      title={r.ownedMeter ? `${r.ownedMeter.toLocaleString()} since acquired · ${fmt(r.lifetimeTotal)} total` : ""}>
                    {r.lifetimeRate != null ? `${fmtSm(r.lifetimeRate)}/${r.unit.meterType==="miles"?"mi":"hr"}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {active.length > 0 && (
              <tfoot>
                <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                  <td colSpan={9} style={{ padding:"9px 10px", textAlign:"right", fontWeight:700 }}>
                    Total equipment operation cost — {active.length} of {equipment.length} units
                  </td>
                  <td style={td("right", { fontWeight:700, fontSize:14 })}>{fmt(equipTotal)}</td>
                  <td></td><td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      <div style={{ fontSize:10, color:"#aaa", marginTop:24, textAlign:"center" }}>
        Generated from Pinpoint on {fmtDate(new Date().toISOString().split("T")[0])} · {county} Highway Department
      </div>
    </div>
  );
}
