import { useState, useMemo } from "react";
import { EXPENDITURE_CODES, REVENUE_CODES, FUNDS, FISCAL_YEAR, EXP_TYPES, REV_TYPES } from "../data/accountCodes.js";
import { StatusBadge, ProgressBar, KPICard, Field, SectionCard, Table, Icon, AlertBar, inp, btn, fmt, fmtSm, pct } from "../components/shared.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Get the Nth Tuesday of a month (n=1 first, n=3 third)
// JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
function getNthTuesday(year, month, n) {
  const d = new Date(year, month, 1);
  const dow = d.getDay();
  const daysToTue = (2 - dow + 7) % 7;
  return new Date(year, month, 1 + daysToTue + (n - 1) * 7);
}

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

// Generate claim cycles for a fiscal year (Jul 1 – Jun 30)
function generateClaimCycles(fyStart) {
  const start = new Date(fyStart);
  const cycles = [];
  for (let m = 0; m < 12; m++) {
    const year  = start.getFullYear() + (start.getMonth() + m >= 12 ? 1 : 0);
    const month = (start.getMonth() + m) % 12;
    [1, 3].forEach(n => {
      const d = getNthTuesday(year, month, n);
      cycles.push({
        id:    toDateStr(d),
        date:  toDateStr(d),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        status: "open", // open | superintendent_review | board_ready | closed
      });
    });
  }
  return cycles.sort((a, b) => a.date.localeCompare(b.date));
}

const CLAIM_CYCLES = generateClaimCycles(FISCAL_YEAR.start);

const ASSIGN_TYPES = [
  { value: "",         label: "None" },
  { value: "project",  label: "Project" },
  { value: "machine",  label: "Machine" },
  { value: "inventory",label: "Inventory" },
  { value: "asset",    label: "Assigned Asset" },
];

// ── Fund Accounting Module ────────────────────────────────────────────────────
export default function FundAccounting({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  return (
    <div>
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid #ddd" }}>
        {[
          { id: "dashboard",      label: "Dashboard",        icon:"layout-dashboard" },
          { id: "newExpenditure", label: "New Expenditure",  icon:"receipt" },
          { id: "newRevenue",     label: "New Revenue",      icon:"cash" },
          { id: "claims",         label: "Claim Cycles",     icon:"calendar-due" },
          { id: "ledger",         label: "Ledger",           icon:"book" },
          { id: "amendments",     label: "Amendments",       icon:"edit" },
          { id: "manageFunds",    label: "Manage Funds",     icon:"adjustments-horizontal" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background: "transparent", border: "none", padding: "8px 16px 10px",
            fontWeight: view === v.id ? 700 : 400, fontSize: 13, cursor: "pointer",
            color: view === v.id ? "#1a3a5c" : "#666",
            borderBottom: view === v.id ? "2px solid #1a3a5c" : "2px solid transparent",
            marginBottom: -1, display:"inline-flex", alignItems:"center", gap:6,
          }}>{v.icon && <Icon name={v.icon} size={13} color={view===v.id?"#1a3a5c":"#888"} />}{v.label}</button>
        ))}
      </div>

      {view === "dashboard"      && <FADashboard db={db} />}
      {view === "newExpenditure" && <ExpenditureForm db={db} dispatch={dispatch} onDone={() => setView("claims")} />}
      {view === "newRevenue"     && <RevenueForm dispatch={dispatch} onDone={() => setView("ledger")} />}
      {view === "claims"         && <ClaimCycles db={db} dispatch={dispatch} />}
      {view === "ledger"         && <Ledger db={db} dispatch={dispatch} />}
      {view === "amendments"     && <Amendments db={db} dispatch={dispatch} />}
      {view === "manageFunds"    && <ManageFundsFA db={db} dispatch={dispatch} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function FADashboard({ db }) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [revSearch, setRevSearch] = useState("");

  const expByCode = useMemo(() => {
    const map = {};
    db.expenditures.forEach(e => {
      if (e.status === "voided") return;
      (e.lines || []).forEach(l => { map[l.code] = (map[l.code] || 0) + l.amount; });
    });
    return map;
  }, [db.expenditures]);

  const amendByCode = useMemo(() => {
    const map = {};
    db.amendments.forEach(a => { map[a.code] = (map[a.code] || 0) + a.amount; });
    return map;
  }, [db.amendments]);

  const revByCode = useMemo(() => {
    const map = {};
    db.revenue.forEach(r => {
      if (r.status !== "posted") return;
      (r.lines || []).forEach(l => { map[l.code] = (map[l.code] || 0) + l.amount; });
    });
    return map;
  }, [db.revenue]);

  const totalBudgeted = EXPENDITURE_CODES.reduce((s,c) => s + c.budgeted + (amendByCode[c.code]||0), 0);
  const totalExpended = Object.values(expByCode).reduce((s,v) => s+v, 0);
  const totalRevenue  = Object.values(revByCode).reduce((s,v) => s+v, 0);
  const pendingCount  = db.expenditures.filter(e => e.status === "pending").length;
  const supReviewCount = db.expenditures.filter(e => e.status === "superintendent_review").length;

  // Pending revenue by code
  const pendingRevByCode = useMemo(() => {
    const map = {};
    db.revenue.forEach(r => {
      if (r.status !== "pending") return;
      (r.lines || []).forEach(l => { map[l.code] = (map[l.code] || 0) + l.amount; });
    });
    return map;
  }, [db.revenue]);

  // Filtered revenue codes — only show codes that have activity or a search match
  const filteredRevCodes = REVENUE_CODES.filter(c => {
    const hasActivity = (revByCode[c.code] || 0) > 0 || (pendingRevByCode[c.code] || 0) > 0;
    if (revSearch) return `${c.code} ${c.description}`.toLowerCase().includes(revSearch.toLowerCase());
    return hasActivity;
  });

  const categories = ["personnel","contracts","materials","capital","equipment","other"];
  const catColors  = { personnel:"#1a3a5c", contracts:"#6b3a1a", materials:"#1a5a3a", capital:"#5a1a6b", equipment:"#1a5a6b", other:"#6b6b1a" };

  const filtered = EXPENDITURE_CODES.filter(c => {
    const budg = c.budgeted + (amendByCode[c.code]||0);
    if (budg === 0 && !expByCode[c.code]) return false;
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (search && !`${c.code} ${c.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Next claim cycle
  const today = toDateStr(new Date());
  const nextCycle = CLAIM_CYCLES.find(c => c.date >= today);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{FISCAL_YEAR.label} — Fund Accounting</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>Roads Fund · {FISCAL_YEAR.start} through {FISCAL_YEAR.end}</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
        <KPICard label="Total Appropriation"   value={fmt(totalBudgeted)} sub="FY2027 incl. amendments"    accent="#1a3a5c" icon="building-bank" />
        <KPICard label="Total Expended"         value={fmt(totalExpended)} sub={`${pct(totalExpended,totalBudgeted)}% of budget`} accent="#6b3a1a" icon="receipt" />
        <KPICard label="Revenue Posted"         value={fmt(totalRevenue)}  sub="Posted transactions"        accent="#1a6b35" icon="cash" />
        <KPICard label="Pending Approval"       value={pendingCount}       sub="Awaiting superintendent"    accent="#d97706" icon="clock" />
        <KPICard label="Next Claim Cycle"       value={nextCycle?.label || "—"} sub="1st & 3rd Tuesday"   accent="#5a1a8a" icon="calendar-due" />
      </div>

      {/* Fund Balance Statement */}
      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 14 }}>Roads Fund Balance</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Revenue side */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#888", marginBottom: 10 }}>Revenue</div>
            {[
              { label: "Opening Balance (271.0)", value: totalRevenue > 0 ? Object.entries(revByCode).filter(([k]) => k === "271.0").reduce((s,[,v]) => s+v, 0) : 0, color: "#555" },
              { label: "Revenue Received (posted)", value: totalRevenue, color: "#1a6b35" },
              { label: "Pending Revenue", value: db.revenue.filter(r=>r.status==="pending").reduce((s,r)=>s+r.totalAmount,0), color: "#d97706" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid #f0f0ee" }}>
                <span style={{ fontSize: 13, color: "#555" }}>{row.label}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: row.color }}>{fmtSm(row.value)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "2px solid #ddd", marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total Revenue</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#1a6b35" }}>{fmtSm(totalRevenue)}</span>
            </div>
          </div>
          {/* Expenditure side + balance */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#888", marginBottom: 10 }}>Expenditures & Balance</div>
            {[
              { label: "Total Appropriation", value: totalBudgeted, color: "#1a3a5c" },
              { label: "Expended (posted + approved)", value: totalExpended, color: "#6b3a1a" },
              { label: "Pending Expenditures", value: db.expenditures.filter(e=>e.status==="pending").reduce((s,e)=>s+e.totalAmount,0), color: "#d97706" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid #f0f0ee" }}>
                <span style={{ fontSize: 13, color: "#555" }}>{row.label}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: row.color }}>{fmtSm(row.value)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "2px solid #ddd", marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Available Fund Balance</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: totalRevenue - totalExpended >= 0 ? "#1a6b35" : "#c0392b" }}>
                {fmtSm(totalRevenue - totalExpended)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Superintendent review alert */}
      {supReviewCount > 0 && (
        <div style={{ background: "#fef3cd", border: "1px solid #f0d080", borderRadius: 8, padding: "12px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#7a4f00", fontWeight: 600 }}>
            ⚠️ {supReviewCount} expenditure{supReviewCount !== 1 ? "s" : ""} pending Superintendent sign-off
          </div>
        </div>
      )}

      {/* Category cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 20 }}>
        {categories.map(cat => {
          const budg  = EXPENDITURE_CODES.filter(c => c.category === cat).reduce((s,c) => s + c.budgeted + (amendByCode[c.code]||0), 0);
          const spent = EXPENDITURE_CODES.filter(c => c.category === cat).reduce((s,c) => s + (expByCode[c.code]||0), 0);
          const used  = pct(spent, budg);
          const active = catFilter === cat;
          return (
            <button key={cat} onClick={() => setCatFilter(active ? "all" : cat)} style={{
              background: active ? catColors[cat] : "#fff",
              color: active ? "#fff" : "#333",
              border: `1px solid ${active ? catColors[cat] : "#ddd"}`,
              borderRadius: 8, padding: "10px 6px", cursor: "pointer", textAlign: "center",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{fmt(budg)}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3, opacity: 0.8 }}>{cat}</div>
              <div style={{ marginTop: 6, background: active ? "rgba(255,255,255,0.3)" : "#eee", borderRadius: 3, height: 4, overflow: "hidden" }}>
                <div style={{ width: `${used}%`, height: "100%", background: active ? "#fff" : (used >= 90 ? "#c0392b" : used >= 75 ? "#d97706" : "#1a6b35") }} />
              </div>
              <div style={{ fontSize: 9, marginTop: 3, opacity: 0.75 }}>{used}% used</div>
            </button>
          );
        })}
      </div>

      {/* Account codes table */}
      <SectionCard
        title={`Account Codes${catFilter !== "all" ? ` · ${catFilter}` : ""} (${filtered.length})`}
        action={<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, width: 200, margin: 0 }} />}
      >
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <Table
            headers={[
              { label: "Code" }, { label: "Description" }, { label: "Category" },
              { label: "Appropriation", right: true }, { label: "Expended", right: true },
              { label: "Remaining", right: true }, { label: "% Used", right: true },
            ]}
            rows={filtered.map(c => {
              const amend  = amendByCode[c.code] || 0;
              const approp = c.budgeted + amend;
              const spent  = expByCode[c.code] || 0;
              const bal    = approp - spent;
              const used   = pct(spent, approp);
              return [
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1a3a5c", fontWeight: 600 }}>{c.code}</span>,
                c.description,
                <span style={{ background: (catColors[c.category]||"#555")+"18", color: catColors[c.category]||"#555", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{c.category}</span>,
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{approp > 0 ? fmt(approp) : "—"}</span>,
                <span style={{ fontFamily: "monospace", color: spent > 0 ? "#1a1a1a" : "#ccc" }}>{spent > 0 ? fmtSm(spent) : "—"}</span>,
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: bal < 0 ? "#c0392b" : "#1a6b35" }}>{approp > 0 ? fmt(bal) : "—"}</span>,
                approp > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <div style={{ width: 60 }}><ProgressBar value={used} /></div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: used >= 90 ? "#c0392b" : used >= 75 ? "#d97706" : "#555", minWidth: 28, textAlign: "right" }}>{used}%</span>
                  </div>
                ) : "—",
              ];
            })}
            emptyMessage="No account codes match your filter"
          />
        </div>
      </SectionCard>

      {/* Revenue Account Codes Table */}
      <SectionCard
        title="Revenue Account Codes"
        subtitle="Budgeted vs actual received by revenue code"
        action={<input value={revSearch} onChange={e => setRevSearch(e.target.value)} placeholder="Search revenue codes…" style={{ ...inp, width: 200, margin: 0 }} />}
      >
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          <Table
            headers={[
              { label: "Code" }, { label: "Description" }, { label: "Type" },
              { label: "Received (posted)", right: true }, { label: "Pending", right: true },
            ]}
            rows={filteredRevCodes.map(c => {
              const received = revByCode[c.code] || 0;
              const pending  = pendingRevByCode[c.code] || 0;
              return [
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1a6b35", fontWeight: 600 }}>{c.code}</span>,
                c.description,
                <span style={{ background: c.type === "grant" ? "#e6f4ec" : c.type === "permit_fee" ? "#e8f0fb" : c.type === "intergovernmental" ? "#fef3cd" : "#f0f0ee", color: c.type === "grant" ? "#1a6b35" : c.type === "permit_fee" ? "#1a4a8a" : c.type === "intergovernmental" ? "#7a4f00" : "#555", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                  {c.type.replace(/_/g, " ")}
                </span>,
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: received > 0 ? "#1a6b35" : "#ccc" }}>{received > 0 ? fmtSm(received) : "—"}</span>,
                <span style={{ fontFamily: "monospace", color: pending > 0 ? "#d97706" : "#ccc" }}>{pending > 0 ? fmtSm(pending) : "—"}</span>,
              ];
            })}
            emptyMessage="No revenue transactions recorded yet"
          />
        </div>
      </SectionCard>
    </div>
  );
}

// ── Expenditure Form ──────────────────────────────────────────────────────────
function ExpenditureForm({ db, dispatch, onDone }) {
  const emptyLine = () => ({
    id:             Date.now() + Math.random(),
    code:           "",
    fund:           "ROADS",
    amount:         "",
    description:    "",
    isCredit:       false,
    assignType:     "",
    assignRef:      "",
    addToInventory: false,
    invName:        "",
    invUnit:        "EA",
    invQty:         "",
    invLocation:    "main",
    invShelf:       "",
  });

  const [header, setHeader] = useState({
    date: "", vendor: "", type: "invoice", reference: "", claimCycle: "",
  });
  const [lines, setLines]   = useState([emptyLine()]);
  const [saved, setSaved]   = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const set = (k,v) => setHeader(h => ({ ...h, [k]: v }));
  const setL = (id,k,v) => setLines(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
  const addLine    = () => { if (lines.length < 15) setLines(ls => [...ls, emptyLine()]); };
  const removeLine = id  => setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls);

  const totalAmount = lines.reduce((s,l) => {
    const amt = parseFloat(l.amount) || 0;
    return s + (l.isCredit ? -Math.abs(amt) : amt);
  }, 0);

  const categories    = [...new Set(EXPENDITURE_CODES.map(c => c.category))];
  const filteredCodes = EXPENDITURE_CODES.filter(c => catFilter === "all" || c.category === catFilter);

  // Upcoming open claim cycles
  const today = toDateStr(new Date());
  const openCycles = CLAIM_CYCLES.filter(c => c.date >= today).slice(0, 6);

  const handleSubmit = () => {
    if (!header.date || !header.vendor || !header.claimCycle || lines.some(l => !l.code || !l.amount)) return;
    dispatch({
      type: "ADD_EXPENDITURE",
      payload: {
        id: Date.now(),
        ...header,
        lines: lines.map(l => ({
          code:        l.code,
          fund:        l.fund,
          amount:      l.isCredit ? -Math.abs(parseFloat(l.amount)||0) : parseFloat(l.amount)||0,
          description: l.description,
          isCredit:    l.isCredit,
          assignType:  l.assignType,
          assignRef:   l.assignRef,
        })),
        totalAmount,
        status: "pending",
      },
    });
    // Auto-receive inventory items
    lines.filter(l => l.addToInventory && l.invName && l.invQty).forEach(l => {
      const newItem = {
        id:           Date.now() + Math.random(),
        name:         l.invName || l.description,
        type:         "material",
        partNumber:   "",
        description:  l.description,
        accountCode:  l.code,
        unit:         l.invUnit,
        unitCost:     parseFloat(l.amount) / (parseFloat(l.invQty)||1),
        reorderPoint: 0,
        vendor:       header.vendor,
        shelf:        l.invShelf,
        machineRefs:  [],
        locationStock:{ [l.invLocation]: parseInt(l.invQty)||0 },
      };
      dispatch({ type:"ADD_INVENTORY_ITEM", payload: newItem });
      dispatch({
        type: "ADD_INVENTORY_TRANSACTION",
        payload: {
          id:         Date.now() + Math.random(),
          itemId:     newItem.id,
          type:       "receive",
          date:       header.date,
          quantity:   parseInt(l.invQty)||0,
          location:   l.invLocation,
          shelf:      l.invShelf,
          reference:  header.reference,
          notes:      `Auto-received from expenditure — ${header.vendor}`,
        },
      });
    });
    setHeader({ date:"", vendor:"", type:"invoice", reference:"", claimCycle:"" });
    setLines([emptyLine()]);
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>New Expenditure</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>Enter each line item separately. Credits are supported per line.</div>
      </div>

      {saved && <div style={{ background: "#e6f4ec", border: "1px solid #a8d5b5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#1a6b35", fontWeight: 600, fontSize: 13 }}>✓ Expenditure saved to claim cycle — redirecting…</div>}

      {/* Transaction header */}
      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 22, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Transaction Header</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Field label="Date" required>
            <input type="date" value={header.date} onChange={e => set("date", e.target.value)} style={inp} />
          </Field>
          <Field label="Transaction Type">
            <select value={header.type} onChange={e => set("type", e.target.value)} style={inp}>
              {EXP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Invoice / Reference #">
            <input type="text" placeholder="Invoice or PO number…" value={header.reference} onChange={e => set("reference", e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Vendor / Payee" required>
            <input type="text" placeholder="Vendor name…" value={header.vendor} onChange={e => set("vendor", e.target.value)} style={inp} />
          </Field>
          <Field label="Claim Cycle" required>
            <select value={header.claimCycle} onChange={e => set("claimCycle", e.target.value)} style={inp}>
              <option value="">Assign to claim cycle…</option>
              {openCycles.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 22, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Line Items ({lines.length}/15)</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Each item can be assigned to a project, machine, inventory, or asset</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", ...categories].map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)} style={{
                padding: "3px 9px", fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                border: "1px solid", borderRadius: 4, cursor: "pointer",
                background: catFilter === cat ? "#1a3a5c" : "#fff",
                color:      catFilter === cat ? "#fff" : "#555",
                borderColor: catFilter === cat ? "#1a3a5c" : "#ccc",
              }}>{cat}</button>
            ))}
          </div>
        </div>

        {lines.map((line, i) => {
          const selectedCode = EXPENDITURE_CODES.find(c => c.code === line.code);
          return (
            <div key={line.id} style={{ background: line.isCredit ? "#fef8ff" : "#fafaf8", border: `1px solid ${line.isCredit ? "#e0c8e8" : "#eee"}`, borderRadius: 8, padding: 16, marginBottom: 10 }}>

              {/* Row 1 — account code + fund + amount + credit toggle */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
                <div style={{ flex: 3 }}>
                  <Field label={`Line ${i + 1} — Account Code`} required>
                    <select value={line.code} onChange={e => setL(line.id,"code",e.target.value)} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}>
                      <option value="">Select account code…</option>
                      {filteredCodes.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.description}{c.budgeted > 0 ? ` (${fmt(c.budgeted)})` : ""}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedCode && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      Category: <strong>{selectedCode.category}</strong> · Budget: <strong>{selectedCode.budgeted > 0 ? fmt(selectedCode.budgeted) : "Unbudgeted"}</strong>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Fund">
                    <select value={line.fund} onChange={e => setL(line.id,"fund",e.target.value)} style={inp}>
                      {FUNDS.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label={line.isCredit ? "Credit Amount ($)" : "Amount ($)"} required>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={line.amount} onChange={e => setL(line.id,"amount",e.target.value)}
                      style={{ ...inp, fontFamily: "monospace", color: line.isCredit ? "#5a1a8a" : "#1a1a1a" }} />
                  </Field>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingBottom: 2 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>Credit</label>
                  <div
                    onClick={() => setL(line.id,"isCredit",!line.isCredit)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                      background: line.isCredit ? "#5a1a8a" : "#ccc",
                      position: "relative", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3, left: line.isCredit ? 21 : 3,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>
                {lines.length > 1 && (
                  <button onClick={() => removeLine(line.id)} style={{ ...btn.danger, padding: "9px 12px", fontSize: 16, lineHeight: 1, paddingBottom: 10 }}>×</button>
                )}
              </div>

              {/* Row 2 — description + assignment */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <Field label="Item Description">
                  <input type="text" placeholder="What is this item? (e.g. Gravel CR14 Section 3)…"
                    value={line.description} onChange={e => setL(line.id,"description",e.target.value)} style={inp} />
                </Field>
                <Field label="Assign To">
                  <select value={line.assignType} onChange={e => setL(line.id,"assignType",e.target.value)} style={inp}>
                    {ASSIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {line.assignType && (
                  <Field label={line.assignType === "project" ? "Project Name/ID" : line.assignType === "machine" ? "Machine/Unit #" : line.assignType === "asset" ? "Asset Location/ID" : "Inventory Location"}>
                    <input type="text" placeholder={`Enter ${line.assignType} reference…`}
                      value={line.assignRef} onChange={e => setL(line.id,"assignRef",e.target.value)} style={inp} />
                  </Field>
                )}
              </div>

              {/* Row 3 — Add to Inventory toggle */}
              {!line.isCredit && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: line.addToInventory ? 10 : 0 }}>
                    <div
                      onClick={() => setL(line.id, "addToInventory", !line.addToInventory)}
                      style={{ width: 40, height: 22, borderRadius: 11, cursor: "pointer", background: line.addToInventory ? "#1a5a3a" : "#ccc", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                    >
                      <div style={{ position: "absolute", top: 3, left: line.addToInventory ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: line.addToInventory ? "#1a5a3a" : "#666", cursor: "pointer" }}
                      onClick={() => setL(line.id, "addToInventory", !line.addToInventory)}>
                      Add to Inventory when saved
                    </label>
                  </div>
                  {line.addToInventory && (
                    <div style={{ background: "#f0f8f4", border: "1px solid #a8d5b5", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#1a5a3a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Inventory Receipt</div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10 }}>
                        <Field label="Item Name">
                          <input type="text" placeholder="Name in inventory…" value={line.invName}
                            onChange={e => setL(line.id,"invName",e.target.value)} style={inp} />
                        </Field>
                        <Field label="Unit">
                          <select value={line.invUnit} onChange={e => setL(line.id,"invUnit",e.target.value)} style={inp}>
                            {["EA","PR","BX","CS","GAL","QT","LB","TON","CY","LF","SF","RL","SET","KIT","OTH"].map(u=><option key={u} value={u}>{u}</option>)}
                          </select>
                        </Field>
                        <Field label="Quantity">
                          <input type="number" min="1" step="1" placeholder="0" value={line.invQty}
                            onChange={e => setL(line.id,"invQty",e.target.value)} style={inp} />
                        </Field>
                        <Field label="Location">
                          <select value={line.invLocation} onChange={e => setL(line.id,"invLocation",e.target.value)} style={inp}>
                            {[{id:"main",name:"Main Shop"},{id:"pauline",name:"Pauline"},{id:"kenesaw",name:"Kenesaw"},{id:"roseland",name:"Roseland"},{id:"holstein",name:"Holstein"},{id:"juniata",name:"Juniata"},{id:"shed2",name:"#2 Shed"}].map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Shelf">
                          <input type="text" placeholder="A1…" value={line.invShelf}
                            onChange={e => setL(line.id,"invShelf",e.target.value.toUpperCase())} style={{ ...inp, fontFamily:"monospace", textTransform:"uppercase" }} />
                        </Field>
                      </div>
                      <div style={{ fontSize: 11, color: "#1a5a3a", marginTop: 8 }}>
                        This item will be added to Inventory as a received transaction when the expenditure is saved.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Credit badge */}
              {line.isCredit && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#5a1a8a", fontWeight: 600 }}>
                  CREDIT — will reduce amount: –{fmtSm(Math.abs(parseFloat(line.amount)||0))}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button onClick={addLine} disabled={lines.length >= 15} style={{ ...btn.secondary, fontSize: 12, padding: "7px 14px", opacity: lines.length >= 15 ? 0.4 : 1 }}>
            + Add line item {lines.length >= 15 ? "(limit reached)" : ""}
          </button>
          <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: totalAmount < 0 ? "#5a1a8a" : "#1a1a1a" }}>
            Total: {totalAmount < 0 ? "-" : ""}{fmtSm(Math.abs(totalAmount))}
            {totalAmount < 0 && <span style={{ fontSize: 12, color: "#5a1a8a", marginLeft: 8 }}>NET CREDIT</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleSubmit} style={btn.primary}>Save to Claim Cycle</button>
        <button onClick={() => { setHeader({ date:"",vendor:"",type:"invoice",reference:"",claimCycle:"" }); setLines([emptyLine()]); }} style={btn.ghost}>Clear</button>
      </div>
    </div>
  );
}

// ── Claim Cycles ──────────────────────────────────────────────────────────────
function ClaimCycles({ db, dispatch }) {
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [editingExp,    setEditingExp]    = useState(null);
  const [viewingExp,    setViewingExp]    = useState(null);
  const today = toDateStr(new Date());

  const expByCycle = useMemo(() => {
    const map = {};
    db.expenditures.forEach(e => {
      if (!e.claimCycle) return;
      if (!map[e.claimCycle]) map[e.claimCycle] = [];
      map[e.claimCycle].push(e);
    });
    return map;
  }, [db.expenditures]);

  const updateExpStatus = (id, status) => dispatch({ type:"UPDATE_EXP_STATUS", payload:{ id, status } });
  const approveAll = (cycleExp) => cycleExp.filter(e => e.status==="pending").forEach(e => updateExpStatus(e.id,"approved"));
  const postAll    = (cycleExp) => cycleExp.filter(e => e.status==="approved").forEach(e => updateExpStatus(e.id,"posted"));

  const printClaimSheet = (e) => {
    // Excel export coming in Reporting module — will fill your official claim form template
    alert(
      "Export coming soon!\n\n" +
      "When the Reporting module is built this will export a filled Excel claim sheet " +
      "matching your official form — vendor, account codes, amounts, and signature lines.\n\n" +
      "Vendor: " + e.vendor + "\n" +
      "Total: $" + Math.abs(e.totalAmount).toFixed(2) + "\n" +
      "Lines: " + (e.lines||[]).length
    );
  };

  // View modal
  if (viewingExp) {
    return (
      <div style={{ maxWidth:780 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <button onClick={()=>setViewingExp(null)} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Back</button>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>View Expenditure</div>
            <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{viewingExp.vendor} · {viewingExp.date}</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={()=>{ setEditingExp(viewingExp); setViewingExp(null); }} style={{ ...btn.primary, background:"#1a3a5c", fontSize:12 }}>Edit</button>
            <button onClick={()=>printClaimSheet(viewingExp)} style={{ ...btn.primary, background:"#5a1a8a", fontSize:12 }}>⬇ Export Claim Sheet</button>
          </div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:18 }}>
            {[
              { label:"Date",        value:viewingExp.date },
              { label:"Type",        value:(viewingExp.type||"").replace(/_/g," ") },
              { label:"Invoice #",   value:viewingExp.reference||"—" },
              { label:"Claim Cycle", value:viewingExp.claimCycle||"—" },
              { label:"Vendor",      value:viewingExp.vendor },
              { label:"Status",      value:viewingExp.status },
              { label:"Total",       value:fmtSm(Math.abs(viewingExp.totalAmount)) },
            ].map((f,i)=>(
              <div key={i}>
                <div style={{ fontSize:11, fontWeight:600, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{f.label}</div>
                <div style={{ fontSize:13, color:"#1a1a1a", fontWeight:f.label==="Total"?700:400 }}>{f.value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:"1px solid #eee", paddingTop:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Line Items</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["Account Code","Description","Fund","Assign To","Amount"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px", textAlign:h==="Amount"?"right":"left", fontWeight:600, fontSize:11, color:"#666", borderBottom:"1px solid #eee", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(viewingExp.lines||[]).map((l,i)=>(
                  <tr key={i} style={{ borderTop:"1px solid #eee" }}>
                    <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{l.code}</td>
                    <td style={{ padding:"9px 12px", color:"#555" }}>{l.description||"—"}</td>
                    <td style={{ padding:"9px 12px", fontSize:12 }}>{l.fund}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:"#888" }}>{l.assignType?`${l.assignType}: ${l.assignRef}`:"—"}</td>
                    <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:l.isCredit?"#5a1a8a":"#1a1a1a" }}>
                      {l.isCredit?"-":""}{fmtSm(Math.abs(l.amount))}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                  <td colSpan={4} style={{ padding:"9px 12px", textAlign:"right", fontWeight:700 }}>Total</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:15 }}>{fmtSm(Math.abs(viewingExp.totalAmount))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Edit modal
  if (editingExp) {
    return <EditExpenditure expenditure={editingExp} db={db} dispatch={dispatch} onDone={()=>setEditingExp(null)} />;
  }

  // Cycle detail
  if (selectedCycle) {
    const cycleExp     = expByCycle[selectedCycle.id] || [];
    const totalAmt     = cycleExp.reduce((s,e) => s + e.totalAmount, 0);
    const pendingCount = cycleExp.filter(e => e.status==="pending").length;
    const approvedCount= cycleExp.filter(e => e.status==="approved").length;
    const postedCount  = cycleExp.filter(e => e.status==="posted").length;
    const hasApproved  = approvedCount > 0;

    return (
      <div>
        <button onClick={()=>setSelectedCycle(null)} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to cycles</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Claim Cycle — {selectedCycle.label}</div>
            <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
              {cycleExp.length} claim sheet{cycleExp.length!==1?"s":""} · One vendor per sheet · Cycle total: {fmtSm(totalAmt)}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            {pendingCount>0  && <span style={{ background:"#fef3cd", color:"#7a4f00", padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>⏳ {pendingCount} pending</span>}
            {approvedCount>0 && <span style={{ background:"#e6f4ec", color:"#1a6b35", padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>✓ {approvedCount} approved</span>}
            {postedCount>0   && <span style={{ background:"#e8f0fb", color:"#1a4a8a", padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>📋 {postedCount} posted</span>}
          </div>
        </div>

        {cycleExp.length===0 ? (
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:40, textAlign:"center", color:"#aaa", fontSize:13 }}>
            No expenditures assigned to this cycle yet — use New Expenditure to add items.
          </div>
        ) : (
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:16 }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid #eee", background:"#f7f7f5", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Expenditures — Superintendent Review</span>
              {(pendingCount>0||approvedCount>0) && (
                <button onClick={()=>approveAll(cycleExp)} style={{ ...btn.primary, background:"#1a6b35", fontSize:12, padding:"7px 18px" }}>
                  ✓ Approve All
                </button>
              )}
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["#","Date","Vendor","Invoice #","Lines","Total","Status","Actions"].map(h=>(
                    <th key={h} style={{ padding:"9px 14px", textAlign:h==="Total"?"right":"left", fontWeight:600, fontSize:11, letterSpacing:"0.05em", textTransform:"uppercase", color:"#666", borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycleExp.map((e,i)=>(
                  <tr key={e.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                    <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{i+1}</td>
                    <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, whiteSpace:"nowrap" }}>{e.date}</td>
                    <td style={{ padding:"10px 14px", fontWeight:600, color:"#1a1a1a", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.vendor}</td>
                    <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#555" }}>{e.reference||"—"}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                        {(e.lines||[]).map((l,j)=>(
                          <span key={j} title={l.description} style={{ background:l.isCredit?"#f3e8ff":"#f0f0ee", color:l.isCredit?"#5a1a8a":"#1a3a5c", padding:"1px 5px", borderRadius:3, fontSize:10, fontFamily:"monospace", fontWeight:600 }}>
                            {l.isCredit?"-":""}{l.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:e.totalAmount<0?"#5a1a8a":"#1a1a1a" }}>
                      {e.totalAmount<0?"-":""}{fmtSm(Math.abs(e.totalAmount))}
                    </td>
                    <td style={{ padding:"10px 14px" }}><StatusBadge status={e.status} /></td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <button onClick={()=>setViewingExp(e)} style={{ ...btn.small, background:"#555", fontSize:10, padding:"4px 10px" }}>View</button>
                        {e.status!=="posted" && (
                          <button onClick={()=>setEditingExp(e)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Edit</button>
                        )}
                        <button onClick={()=>printClaimSheet(e)} style={{ ...btn.small, background:"#5a1a8a", fontSize:10, padding:"4px 10px" }}>⬇ Export</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                  <td colSpan={5} style={{ padding:"10px 14px", textAlign:"right", fontWeight:700, fontSize:13 }}>Cycle Total:</td>
                  <td colSpan={3} style={{ padding:"10px 14px", fontFamily:"monospace", fontWeight:700, fontSize:15, color:"#1a3a5c" }}>{fmtSm(totalAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          {hasApproved && (
            <button style={{ ...btn.primary, background:"#1a4a8a" }} onClick={()=>postAll(cycleExp)}>
              📋 Post Approved to Ledger ({approvedCount})
            </button>
          )}
        </div>
      </div>
    );
  }

  // Cycle list
  const visibleCycles = CLAIM_CYCLES.filter(c => c.date >= new Date(Date.now()-90*24*60*60*1000).toISOString().split("T")[0]);
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Claim Cycles</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>1st and 3rd Tuesday of each month · Roads Fund · {FISCAL_YEAR.label}</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {visibleCycles.map(cycle=>{
          const items    = expByCycle[cycle.id]||[];
          const total    = items.reduce((s,e)=>s+e.totalAmount,0);
          const approved = items.filter(e=>e.status==="approved"||e.status==="posted").length;
          const pending  = items.filter(e=>e.status==="pending").length;
          const posted   = items.filter(e=>e.status==="posted").length;
          const isPast   = cycle.date < today;
          const isToday  = cycle.date === today;
          return (
            <button key={cycle.id} onClick={()=>setSelectedCycle(cycle)} style={{
              background:"#fff", border:`1px solid ${isToday?"#1a6b35":"#ddd"}`,
              borderRadius:8, padding:16, cursor:"pointer", textAlign:"left",
              borderTop:`3px solid ${isToday?"#1a6b35":isPast?"#ccc":"#1a3a5c"}`,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ fontSize:13, fontWeight:700, color:isPast?"#888":"#1a1a1a" }}>{cycle.label}</div>
                {isToday && <span style={{ fontSize:10, background:"#e6f4ec", color:"#1a6b35", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>TODAY</span>}
                {isPast  && <span style={{ fontSize:10, background:"#f0f0ee", color:"#888",    padding:"2px 7px", borderRadius:4, fontWeight:600 }}>PAST</span>}
              </div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#1a3a5c", margin:"8px 0 4px" }}>
                {items.length>0?fmtSm(total):"—"}
              </div>
              <div style={{ fontSize:12, color:"#888" }}>
                {items.length>0 ? (
                  <>
                    {items.length} claim sheet{items.length!==1?"s":""}
                    {pending>0   && <span style={{ color:"#d97706", marginLeft:8 }}>· {pending} pending</span>}
                    {approved>0  && <span style={{ color:"#1a6b35", marginLeft:8 }}>· {approved} approved</span>}
                    {posted>0    && <span style={{ color:"#1a4a8a", marginLeft:8 }}>· {posted} posted</span>}
                  </>
                ) : "No items yet"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit Expenditure ──────────────────────────────────────────────────────────
function EditExpenditure({ expenditure, db, dispatch, onDone }) {
  const emptyLine = (l) => ({
    id:             l?.id || Date.now()+Math.random(),
    code:           l?.code || "",
    fund:           l?.fund || "ROADS",
    amount:         l ? Math.abs(l.amount).toString() : "",
    description:    l?.description || "",
    isCredit:       l?.isCredit || false,
    assignType:     l?.assignType || "",
    assignRef:      l?.assignRef || "",
    addToInventory: false,
    invName:"", invUnit:"EA", invQty:"", invLocation:"main", invShelf:"",
  });

  const [header, setHeader] = useState({
    date:      expenditure.date,
    vendor:    expenditure.vendor,
    type:      expenditure.type,
    reference: expenditure.reference || "",
    claimCycle:expenditure.claimCycle,
  });
  const [lines, setLines] = useState((expenditure.lines||[]).map(l=>emptyLine(l)));
  const [catFilter, setCatFilter] = useState("all");
  const set  = (k,v) => setHeader(h=>({ ...h, [k]:v }));
  const setL = (id,k,v) => setLines(ls=>ls.map(l=>l.id===id?{ ...l,[k]:v }:l));
  const addLine    = () => { if(lines.length<15) setLines(ls=>[...ls,emptyLine()]); };
  const removeLine = id  => setLines(ls=>ls.length>1?ls.filter(l=>l.id!==id):ls);

  const totalAmount = lines.reduce((s,l) => {
    const amt = parseFloat(l.amount)||0;
    return s + (l.isCredit ? -Math.abs(amt) : amt);
  }, 0);

  const categories    = [...new Set(EXPENDITURE_CODES.map(c=>c.category))];
  const filteredCodes = EXPENDITURE_CODES.filter(c=>catFilter==="all"||c.category===catFilter);
  const today2        = toDateStr(new Date());
  const openCycles    = CLAIM_CYCLES.filter(c=>c.date>=today2).slice(0,6);

  const handleSave = () => {
    if (!header.date||!header.vendor||!header.claimCycle||lines.some(l=>!l.code||!l.amount)) return;
    dispatch({
      type:"UPDATE_EXPENDITURE",
      payload:{
        ...expenditure,
        ...header,
        lines: lines.map(l=>({
          code:       l.code,
          fund:       l.fund,
          amount:     l.isCredit ? -Math.abs(parseFloat(l.amount)||0) : parseFloat(l.amount)||0,
          description:l.description,
          isCredit:   l.isCredit,
          assignType: l.assignType,
          assignRef:  l.assignRef,
        })),
        totalAmount,
      },
    });
    onDone();
  };

  return (
    <div style={{ maxWidth:860 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Edit Expenditure</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>
            {expenditure.vendor} · {expenditure.date} · {expenditure.reference||"No invoice #"}
          </div>
        </div>
        <div style={{ marginLeft:"auto" }}>
          <span style={{ background:"#fef3cd", color:"#7a4f00", padding:"4px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>
            Editing — changes save immediately
          </span>
        </div>
      </div>

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Transaction Header</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required><input type="date" value={header.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
          <Field label="Type">
            <select value={header.type} onChange={e=>set("type",e.target.value)} style={inp}>
              {EXP_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Invoice / Reference #"><input type="text" value={header.reference} onChange={e=>set("reference",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Vendor / Payee" required><input type="text" value={header.vendor} onChange={e=>set("vendor",e.target.value)} style={inp} /></Field>
          <Field label="Claim Cycle">
            <select value={header.claimCycle} onChange={e=>set("claimCycle",e.target.value)} style={inp}>
              <option value="">Select claim cycle…</option>
              {openCycles.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Line items */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>Line Items ({lines.length}/15)</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["all",...categories].map(cat=>(
              <button key={cat} onClick={()=>setCatFilter(cat)} style={{
                padding:"3px 9px", fontSize:11, fontWeight:600, textTransform:"capitalize",
                border:"1px solid", borderRadius:4, cursor:"pointer",
                background: catFilter===cat?"#1a3a5c":"#fff",
                color:      catFilter===cat?"#fff":"#555",
                borderColor:catFilter===cat?"#1a3a5c":"#ccc",
              }}>{cat}</button>
            ))}
          </div>
        </div>

        {lines.map((line,i) => {
          const selectedCode = EXPENDITURE_CODES.find(c=>c.code===line.code);
          return (
            <div key={line.id} style={{ background:line.isCredit?"#fef8ff":"#fafaf8", border:`1px solid ${line.isCredit?"#e0c8e8":"#eee"}`, borderRadius:8, padding:16, marginBottom:10 }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-end", marginBottom:12 }}>
                <div style={{ flex:3 }}>
                  <Field label={`Line ${i+1} — Account Code`} required>
                    <select value={line.code} onChange={e=>setL(line.id,"code",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
                      <option value="">Select account code…</option>
                      {filteredCodes.map(c=><option key={c.code} value={c.code}>{c.code} — {c.description}{c.budgeted>0?` (${fmt(c.budgeted)})`:""}</option>)}
                    </select>
                  </Field>
                  {selectedCode && <div style={{ fontSize:11, color:"#888", marginTop:4 }}>Category: <strong>{selectedCode.category}</strong> · Budget: <strong>{selectedCode.budgeted>0?fmt(selectedCode.budgeted):"Unbudgeted"}</strong></div>}
                </div>
                <div style={{ flex:1 }}>
                  <Field label="Fund">
                    <select value={line.fund} onChange={e=>setL(line.id,"fund",e.target.value)} style={inp}>
                      {FUNDS.map(f=><option key={f.code} value={f.code}>{f.name}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex:1 }}>
                  <Field label={line.isCredit?"Credit Amount ($)":"Amount ($)"} required>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={line.amount}
                      onChange={e=>setL(line.id,"amount",e.target.value)}
                      style={{ ...inp, fontFamily:"monospace", color:line.isCredit?"#5a1a8a":"#1a1a1a" }} />
                  </Field>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, paddingBottom:2 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"#666" }}>Credit</label>
                  <div onClick={()=>setL(line.id,"isCredit",!line.isCredit)} style={{ width:40, height:22, borderRadius:11, cursor:"pointer", background:line.isCredit?"#5a1a8a":"#ccc", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ position:"absolute", top:3, left:line.isCredit?21:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                  </div>
                </div>
                {lines.length>1 && <button onClick={()=>removeLine(line.id)} style={{ ...btn.danger, padding:"9px 12px", fontSize:16, lineHeight:1, paddingBottom:10 }}>×</button>}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12 }}>
                <Field label="Item Description">
                  <input type="text" placeholder="Description…" value={line.description} onChange={e=>setL(line.id,"description",e.target.value)} style={inp} />
                </Field>
                <Field label="Assign To">
                  <select value={line.assignType} onChange={e=>setL(line.id,"assignType",e.target.value)} style={inp}>
                    {ASSIGN_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {line.assignType && (
                  <Field label={line.assignType==="project"?"Project":"Machine / Location"}>
                    <input type="text" value={line.assignRef} onChange={e=>setL(line.id,"assignRef",e.target.value)} style={inp} />
                  </Field>
                )}
              </div>
              {line.isCredit && <div style={{ marginTop:8, fontSize:11, color:"#5a1a8a", fontWeight:600 }}>CREDIT — will reduce amount: –{fmtSm(Math.abs(parseFloat(line.amount)||0))}</div>}
            </div>
          );
        })}

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <button onClick={addLine} disabled={lines.length>=15} style={{ ...btn.secondary, fontSize:12, padding:"7px 14px", opacity:lines.length>=15?0.4:1 }}>
            + Add line item
          </button>
          <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:700, color:totalAmount<0?"#5a1a8a":"#1a1a1a" }}>
            Total: {totalAmount<0?"-":""}{fmtSm(Math.abs(totalAmount))}
            {totalAmount<0 && <span style={{ fontSize:12, color:"#5a1a8a", marginLeft:8 }}>NET CREDIT</span>}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>Save Changes</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Revenue Form ──────────────────────────────────────────────────────────────
function RevenueForm({ dispatch, onDone }) {
  const emptyLine = () => ({ id: Date.now() + Math.random(), code: "", fund: "ROADS", amount: "", sourceType: "intergovernmental" });
  const [header, setHeader] = useState({ date: "", source: "", reference: "", description: "", status: "pending" });
  const [lines, setLines]   = useState([emptyLine()]);
  const [saved, setSaved]   = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const setH = (k,v) => setHeader(h => ({ ...h, [k]: v }));
  const setL = (id,k,v) => setLines(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
  const addLine    = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = id  => setLines(ls => ls.filter(l => l.id !== id));
  const totalAmount = lines.reduce((s,l) => s + (parseFloat(l.amount)||0), 0);
  const revTypes = [...new Set(REVENUE_CODES.map(r => r.type))];
  const filteredCodes = REVENUE_CODES.filter(r => typeFilter === "all" || r.type === typeFilter);

  const handleSubmit = () => {
    if (!header.date || !header.source || lines.some(l => !l.code || !l.amount)) return;
    dispatch({ type: "ADD_REVENUE", payload: {
      id: Date.now(), ...header,
      lines: lines.map(l => ({ code: l.code, fund: l.fund, amount: parseFloat(l.amount), sourceType: l.sourceType })),
      totalAmount,
    }});
    setHeader({ date:"", source:"", reference:"", description:"", status:"pending" });
    setLines([emptyLine()]);
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>New Revenue Transaction</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>Grants, permits, highway allocations, intergovernmental transfers</div>
      </div>

      {saved && <div style={{ background: "#e6f4ec", border: "1px solid #a8d5b5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#1a6b35", fontWeight: 600, fontSize: 13 }}>✓ Revenue recorded — redirecting…</div>}

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 22, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Transaction Header</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Field label="Date" required><input type="date" value={header.date} onChange={e => setH("date",e.target.value)} style={inp} /></Field>
          <Field label="Reference #"><input type="text" placeholder="Check / warrant…" value={header.reference} onChange={e => setH("reference",e.target.value)} style={inp} /></Field>
          <Field label="Status">
            <select value={header.status} onChange={e => setH("status",e.target.value)} style={inp}>
              <option value="pending">Pending</option>
              <option value="posted">Posted</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Source / Grantor / Payer" required><input type="text" placeholder="IDOT, FHWA, Township of…" value={header.source} onChange={e => setH("source",e.target.value)} style={inp} /></Field>
          <Field label="Description"><input type="text" placeholder="Award number, permit reference…" value={header.description} onChange={e => setH("description",e.target.value)} style={inp} /></Field>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 22, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Revenue Code Lines</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", ...revTypes].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: "3px 9px", fontSize: 11, fontWeight: 600, border: "1px solid", borderRadius: 4, cursor: "pointer",
                background: typeFilter === t ? "#1a6b35" : "#fff",
                color:      typeFilter === t ? "#fff" : "#555",
                borderColor: typeFilter === t ? "#1a6b35" : "#ccc",
                textTransform: "capitalize",
              }}>{t.replace(/_/g," ")}</button>
            ))}
          </div>
        </div>

        {lines.map((line, i) => (
          <div key={line.id} style={{ background: "#fafaf8", border: "1px solid #eee", borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: 2 }}>
                <Field label={`Revenue Code ${i + 1}`} required>
                  <select value={line.code} onChange={e => setL(line.id,"code",e.target.value)} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}>
                    <option value="">Select revenue code…</option>
                    {filteredCodes.map(r => <option key={r.code} value={r.code}>{r.code} — {r.description}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Fund">
                  <select value={line.fund} onChange={e => setL(line.id,"fund",e.target.value)} style={inp}>
                    {FUNDS.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Amount ($)" required>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.amount} onChange={e => setL(line.id,"amount",e.target.value)}
                    style={{ ...inp, fontFamily: "monospace" }} />
                </Field>
              </div>
              {lines.length > 1 && (
                <button onClick={() => removeLine(line.id)} style={{ ...btn.danger, padding: "9px 12px", fontSize: 16, lineHeight: 1 }}>×</button>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button onClick={addLine} style={{ ...btn.secondary, fontSize: 12, padding: "7px 14px" }}>+ Add another source</button>
          <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#1a6b35" }}>Total: {fmtSm(totalAmount)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background: "#1a6b35" }}>Record Revenue</button>
        <button onClick={() => { setHeader({ date:"",source:"",reference:"",description:"",status:"pending" }); setLines([emptyLine()]); }} style={btn.ghost}>Clear</button>
      </div>
    </div>
  );
}

// ── Ledger ────────────────────────────────────────────────────────────────────
function Ledger({ db, dispatch }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const getCodeDesc = code => {
    const e = EXPENDITURE_CODES.find(c => c.code === code);
    if (e) return e.description;
    const r = REVENUE_CODES.find(c => c.code === code);
    return r ? r.description : code;
  };

  const allTx = useMemo(() => {
    const exps = db.expenditures.map(e => ({ ...e, txType: "expenditure" }));
    const revs = db.revenue.map(r => ({ ...r, txType: "revenue", vendor: r.source }));
    return [...exps, ...revs].sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [db.expenditures, db.revenue]);

  const filtered = allTx.filter(t => {
    if (filter === "expenditure" && t.txType !== "expenditure") return false;
    if (filter === "revenue"     && t.txType !== "revenue")     return false;
    if (filter === "pending"     && t.status !== "pending")     return false;
    if (filter === "posted"      && t.status !== "posted")      return false;
    if (search && !`${t.vendor||""} ${t.description||""} ${(t.lines||[]).map(l=>l.code).join(" ")}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Transaction Ledger</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>{allTx.length} transaction{allTx.length !== 1 ? "s" : ""} · {FISCAL_YEAR.label}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: 180, margin: 0 }} />
          <div style={{ display: "flex", border: "1px solid #ccc", borderRadius: 6, overflow: "hidden" }}>
            {["all","expenditure","revenue","pending","posted"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 11px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: filter === f ? "#1a3a5c" : "#fff", color: filter === f ? "#fff" : "#555", textTransform: "capitalize" }}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f7f7f5" }}>
              {["Date","Type","Vendor / Source","Codes & Items","Claim Cycle","Total","Status"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: h === "Total" ? "right" : "left", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#666", whiteSpace: "nowrap", borderBottom: "1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "36px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
                {allTx.length === 0 ? "No transactions yet." : "No transactions match your filter."}
              </td></tr>
            )}
            {filtered.map((t, i) => {
              const cycle = CLAIM_CYCLES.find(c => c.id === t.claimCycle);
              return (
                <tr key={t.id + t.txType} style={{ borderTop: "1px solid #eee", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: t.txType === "revenue" ? "#e6f4ec" : "#eef2f8", color: t.txType === "revenue" ? "#1a6b35" : "#1a3a5c", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {t.txType === "revenue" ? "Revenue" : (t.type||"").replace(/_/g," ")}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.vendor}</td>
                  <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(t.lines||[]).map((l,j) => (
                        <span key={j} title={l.description || getCodeDesc(l.code)} style={{ background: l.isCredit ? "#f3e8ff" : "#f0f0ee", color: l.isCredit ? "#5a1a8a" : "#1a3a5c", padding: "1px 5px", borderRadius: 3, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>
                          {l.isCredit ? "CR " : ""}{l.code}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{cycle?.label || "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: t.totalAmount < 0 ? "#5a1a8a" : t.txType === "revenue" ? "#1a6b35" : "#1a1a1a" }}>
                    {t.totalAmount < 0 ? "-" : t.txType === "revenue" ? "+" : ""}{fmtSm(Math.abs(t.totalAmount))}
                  </td>
                  <td style={{ padding: "10px 14px" }}><StatusBadge status={t.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Budget Amendments ─────────────────────────────────────────────────────────
function Amendments({ db, dispatch }) {
  const [form, setForm] = useState({ date:"", code:"", amount:"", reason:"" });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.date || !form.code || !form.amount) return;
    dispatch({ type: "ADD_AMENDMENT", payload: { id: Date.now(), ...form, amount: parseFloat(form.amount) } });
    setForm({ date:"", code:"", amount:"", reason:"" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Budget Amendments</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>Increase or decrease an appropriation mid-year. Use negative amounts to reduce.</div>
      </div>

      {saved && <div style={{ background: "#e6f4ec", border: "1px solid #a8d5b5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#1a6b35", fontWeight: 600, fontSize: 13 }}>✓ Amendment recorded</div>}

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 22, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Field label="Date" required><input type="date" value={form.date} onChange={e => set("date",e.target.value)} style={inp} /></Field>
          <Field label="Amount ($) — negative to reduce" required>
            <input type="number" step="0.01" placeholder="e.g. 25000 or -10000" value={form.amount} onChange={e => set("amount",e.target.value)} style={{ ...inp, fontFamily: "monospace" }} />
          </Field>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Field label="Account Code" required>
            <select value={form.code} onChange={e => set("code",e.target.value)} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}>
              <option value="">Select account code…</option>
              {EXPENDITURE_CODES.filter(c => c.budgeted > 0).map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.description} ({fmt(c.budgeted)})</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom: 20 }}>
          <Field label="Reason / Board Resolution">
            <textarea rows={3} placeholder="Board resolution number, reason for amendment…" value={form.reason} onChange={e => set("reason",e.target.value)} style={{ ...inp, resize: "vertical" }} />
          </Field>
        </div>
        <button onClick={handleSubmit} style={btn.primary}>Record Amendment</button>
      </div>

      <SectionCard title="Amendment History" subtitle={`${db.amendments.length} amendment${db.amendments.length !== 1 ? "s" : ""} recorded`}>
        <Table
          headers={[{ label:"Date" },{ label:"Account Code" },{ label:"Description" },{ label:"Amount", right:true },{ label:"Reason" }]}
          rows={db.amendments.map(a => {
            const code = EXPENDITURE_CODES.find(c => c.code === a.code);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{a.date}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{a.code}</span>,
              code?.description || "—",
              <span style={{ fontFamily:"monospace", fontWeight:700, color: a.amount >= 0 ? "#1a6b35" : "#c0392b" }}>{a.amount >= 0 ? "+" : ""}{fmtSm(a.amount)}</span>,
              <span style={{ color:"#666", fontSize:12 }}>{a.reason || "—"}</span>,
            ];
          })}
          emptyMessage="No amendments recorded yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Manage Funds (Fund Accounting) ───────────────────────────────────────────
function ManageFundsFA({ db, dispatch }) {
  const [newFund, setNewFund] = useState("");
  const customFunds = db.customFunds || [];
  const DEFAULT_FUND = "Roads Fund";

  const addFund = () => {
    if (!newFund.trim()) return;
    dispatch({ type:"ADD_CUSTOM_FUND", payload:newFund.trim() });
    setNewFund("");
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a", display:"flex", alignItems:"center", gap:10 }}>
          <Icon name="adjustments-horizontal" size={20} color="#1a3a5c" />
          Manage Funds
        </div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Add custom fund names that appear across Fund Accounting and Projects</div>
      </div>

      <SectionCard title="Default Fund" subtitle="Always available" icon="building-bank">
        <div style={{ padding:"14px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", fontSize:13, color:"#1a1a1a", fontWeight:600 }}>
            <Icon name="circle-filled" size={10} color="#1a3a5c" />
            {DEFAULT_FUND}
            <span style={{ fontSize:11, background:"#e8f0fb", color:"#1a4a8a", padding:"2px 8px", borderRadius:4, fontWeight:600, marginLeft:4 }}>Default</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Custom Funds" subtitle={`${customFunds.length} added`} icon="plus">
        <div style={{ padding:"16px 18px", borderBottom:"1px solid #eee" }}>
          <div style={{ display:"flex", gap:10 }}>
            <input
              type="text"
              placeholder="e.g. NDOT Enhancement Grant 2027, RAISE Grant, FEMA DR-4567…"
              value={newFund}
              onChange={e=>setNewFund(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addFund()}
              style={{ ...inp, flex:1 }}
            />
            <button onClick={addFund} style={{ ...btn.primary }}>
              <Icon name="plus" size={14} color="#fff" />
              Add Fund
            </button>
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:8 }}>Press Enter or click Add Fund. These appear in the funding source dropdown on Projects and expenditures.</div>
        </div>
        {customFunds.length===0 ? (
          <div style={{ padding:"24px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>
            <Icon name="inbox" size={32} color="#e0e0e0" style={{ display:"block", margin:"0 auto 10px" }} />
            No custom funds yet
          </div>
        ) : (
          <div style={{ padding:"8px 18px" }}>
            {customFunds.map((f,i)=>(
              <div key={i} style={{ padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, color:"#1a1a1a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Icon name="circle-filled" size={8} color="#5a1a8a" />
                  {f}
                </div>
                <button onClick={()=>dispatch({ type:"REMOVE_CUSTOM_FUND", payload:f })} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 8px" }}>
                  <Icon name="trash" size={11} color="#fff" />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
