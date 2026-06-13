import { useState, useMemo } from "react";
import { EXPENDITURE_CODES, REVENUE_CODES, FUNDS, FISCAL_YEAR, EXP_TYPES, REV_TYPES } from "../data/accountCodes.js";
import { StatusBadge, ProgressBar, KPICard, Field, SectionCard, Table, inp, btn, fmt, fmtSm, pct } from "../components/shared.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Get the Nth Tuesday of a month (n=1 first, n=3 third)
function getNthTuesday(year, month, n) {
  const d = new Date(year, month, 1);
  const day = d.getDay(); // 0=Sun,1=Mon,2=Tue...
  const first = day <= 2 ? 2 - day : 9 - day; // first tuesday date
  return new Date(year, month, first + (n - 1) * 7);
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
          { id: "dashboard",      label: "Dashboard" },
          { id: "newExpenditure", label: "New Expenditure" },
          { id: "newRevenue",     label: "New Revenue" },
          { id: "claims",         label: "Claim Cycles" },
          { id: "ledger",         label: "Ledger" },
          { id: "amendments",     label: "Budget Amendments" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background: "transparent", border: "none", padding: "8px 16px 10px",
            fontWeight: view === v.id ? 700 : 400, fontSize: 13, cursor: "pointer",
            color: view === v.id ? "#1a3a5c" : "#666",
            borderBottom: view === v.id ? "2px solid #1a3a5c" : "2px solid transparent",
            marginBottom: -1,
          }}>{v.label}</button>
        ))}
      </div>

      {view === "dashboard"      && <FADashboard db={db} />}
      {view === "newExpenditure" && <ExpenditureForm db={db} dispatch={dispatch} onDone={() => setView("claims")} />}
      {view === "newRevenue"     && <RevenueForm dispatch={dispatch} onDone={() => setView("ledger")} />}
      {view === "claims"         && <ClaimCycles db={db} dispatch={dispatch} />}
      {view === "ledger"         && <Ledger db={db} dispatch={dispatch} />}
      {view === "amendments"     && <Amendments db={db} dispatch={dispatch} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function FADashboard({ db }) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch]       = useState("");

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
        <KPICard label="Total Appropriation"   value={fmt(totalBudgeted)} sub="FY2027 incl. amendments"    accent="#1a3a5c" />
        <KPICard label="Total Expended"         value={fmt(totalExpended)} sub={`${pct(totalExpended,totalBudgeted)}% of budget`} accent="#6b3a1a" />
        <KPICard label="Revenue Posted"         value={fmt(totalRevenue)}  sub="Posted transactions"        accent="#1a6b35" />
        <KPICard label="Pending Approval"       value={pendingCount}       sub="Awaiting superintendent"    accent="#d97706" />
        <KPICard label="Next Claim Cycle"       value={nextCycle?.label || "—"} sub="1st & 3rd Tuesday"   accent="#5a1a8a" />
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
    </div>
  );
}

// ── Expenditure Form ──────────────────────────────────────────────────────────
function ExpenditureForm({ db, dispatch, onDone }) {
  const emptyLine = () => ({
    id:          Date.now() + Math.random(),
    code:        "",
    fund:        "ROADS",
    amount:      "",
    description: "",
    isCredit:    false,
    assignType:  "",
    assignRef:   "",
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
  const today = toDateStr(new Date());

  // Group expenditures by claim cycle
  const expByCycle = useMemo(() => {
    const map = {};
    db.expenditures.forEach(e => {
      if (!e.claimCycle) return;
      if (!map[e.claimCycle]) map[e.claimCycle] = [];
      map[e.claimCycle].push(e);
    });
    return map;
  }, [db.expenditures]);

  const updateExpStatus = (id, status) => dispatch({ type: "UPDATE_EXP_STATUS", payload: { id, status } });

  if (selectedCycle) {
    const cycleExp = expByCycle[selectedCycle.id] || [];
    const totalAmt = cycleExp.reduce((s,e) => s + e.totalAmount, 0);
    const allApproved = cycleExp.length > 0 && cycleExp.every(e => e.status === "approved" || e.status === "posted");
    const pendingCount = cycleExp.filter(e => e.status === "pending").length;

    // Split into sheets of 15
    const sheets = [];
    for (let i = 0; i < cycleExp.length; i += 15) sheets.push(cycleExp.slice(i, i + 15));

    return (
      <div>
        <button onClick={() => setSelectedCycle(null)} style={{ ...btn.ghost, marginBottom: 20, fontSize: 12, padding: "6px 14px" }}>← Back to cycles</button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Claim Cycle — {selectedCycle.label}</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>
              {cycleExp.length} item{cycleExp.length !== 1 ? "s" : ""} · {sheets.length} claim sheet{sheets.length !== 1 ? "s" : ""} · Total: {fmtSm(totalAmt)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {allApproved && (
              <div style={{ background: "#e6f4ec", border: "1px solid #a8d5b5", borderRadius: 6, padding: "8px 16px", color: "#1a6b35", fontWeight: 600, fontSize: 13 }}>
                ✓ Ready for Board — all items approved by Superintendent
              </div>
            )}
            {pendingCount > 0 && (
              <div style={{ background: "#fef3cd", border: "1px solid #f0d080", borderRadius: 6, padding: "8px 16px", color: "#7a4f00", fontWeight: 600, fontSize: 13 }}>
                ⚠️ {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending Superintendent review
              </div>
            )}
          </div>
        </div>

        {/* Expenditure list with superintendent approval */}
        {cycleExp.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 40, textAlign: "center", color: "#aaa", fontSize: 13 }}>
            No expenditures assigned to this cycle yet — use New Expenditure to add items.
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #eee", fontWeight: 700, fontSize: 13, background: "#f7f7f5", display: "flex", justifyContent: "space-between" }}>
              <span>Expenditures — Superintendent Review</span>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>Max 15 per claim sheet</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f7f7f5" }}>
                  {["#","Date","Vendor","Invoice #","Lines","Total","Status","Superintendent"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: h === "Total" ? "right" : "left", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#666", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycleExp.map((e, i) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #eee", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#888" }}>{i + 1}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>{e.date}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a" }}>{e.vendor}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#555" }}>{e.reference || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {(e.lines||[]).map((l,j) => (
                          <span key={j} title={l.description} style={{ background: l.isCredit ? "#f3e8ff" : "#f0f0ee", color: l.isCredit ? "#5a1a8a" : "#1a3a5c", padding: "1px 5px", borderRadius: 3, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>
                            {l.isCredit ? "-" : ""}{l.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: e.totalAmount < 0 ? "#5a1a8a" : "#1a1a1a" }}>
                      {e.totalAmount < 0 ? "-" : ""}{fmtSm(Math.abs(e.totalAmount))}
                    </td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={e.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      {e.status === "pending" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => updateExpStatus(e.id, "approved")} style={{ ...btn.small, background: "#1a6b35", fontSize: 10, padding: "4px 8px" }}>Approve</button>
                          <button onClick={() => updateExpStatus(e.id, "voided")}   style={{ ...btn.small, background: "#c0392b", fontSize: 10, padding: "4px 8px" }}>Deny</button>
                        </div>
                      )}
                      {e.status === "approved" && <span style={{ fontSize: 11, color: "#1a6b35", fontWeight: 600 }}>✓ Approved</span>}
                      {e.status === "voided"   && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 600 }}>✗ Denied</span>}
                      {e.status === "posted"   && <span style={{ fontSize: 11, color: "#1a4a8a", fontWeight: 600 }}>Posted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #ddd", background: "#f7f7f5" }}>
                  <td colSpan={6} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13 }}>Cycle Total:</td>
                  <td colSpan={2} style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#1a3a5c" }}>{fmtSm(totalAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Sheet preview */}
        {sheets.length > 1 && (
          <div style={{ background: "#fef3cd", border: "1px solid #f0d080", borderRadius: 8, padding: "12px 18px", marginBottom: 16, fontSize: 13, color: "#7a4f00" }}>
            ⚠️ {cycleExp.length} items exceeds the 15-item limit — this cycle will export as {sheets.length} separate claim sheets.
          </div>
        )}

        {allApproved && cycleExp.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...btn.primary, background: "#1a6b35" }} onClick={() => alert("Excel export coming soon — will generate " + sheets.length + " claim sheet(s) matching your official form.")}>
              Export Claim Sheet{sheets.length > 1 ? "s" : ""} ({sheets.length})
            </button>
            <button style={{ ...btn.primary, background: "#1a4a8a" }} onClick={() => {
              cycleExp.forEach(e => dispatch({ type: "UPDATE_EXP_STATUS", payload: { id: e.id, status: "posted" } }));
            }}>
              Post to Ledger
            </button>
          </div>
        )}
      </div>
    );
  }

  // Cycle list view
  const visibleCycles = CLAIM_CYCLES.filter(c => c.date >= new Date(Date.now() - 90*24*60*60*1000).toISOString().split("T")[0]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Claim Cycles</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>1st and 3rd Tuesday of each month · Roads Fund · {FISCAL_YEAR.label}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {visibleCycles.map(cycle => {
          const items    = expByCycle[cycle.id] || [];
          const total    = items.reduce((s,e) => s + e.totalAmount, 0);
          const approved = items.filter(e => e.status === "approved" || e.status === "posted").length;
          const pending  = items.filter(e => e.status === "pending").length;
          const isPast   = cycle.date < today;
          const isToday  = cycle.date === today;

          return (
            <button key={cycle.id} onClick={() => setSelectedCycle(cycle)} style={{
              background: "#fff", border: `1px solid ${isToday ? "#1a6b35" : "#ddd"}`,
              borderRadius: 8, padding: 16, cursor: "pointer", textAlign: "left",
              borderTop: `3px solid ${isToday ? "#1a6b35" : isPast ? "#ccc" : "#1a3a5c"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isPast ? "#888" : "#1a1a1a" }}>{cycle.label}</div>
                {isToday && <span style={{ fontSize: 10, background: "#e6f4ec", color: "#1a6b35", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>TODAY</span>}
                {isPast  && <span style={{ fontSize: 10, background: "#f0f0ee", color: "#888",    padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>PAST</span>}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: "#1a3a5c", margin: "8px 0 4px" }}>
                {items.length > 0 ? fmtSm(total) : "—"}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {items.length > 0 ? (
                  <>
                    {items.length} item{items.length !== 1 ? "s" : ""}
                    {pending > 0   && <span style={{ color: "#d97706", marginLeft: 8 }}>· {pending} pending</span>}
                    {approved > 0  && <span style={{ color: "#1a6b35", marginLeft: 8 }}>· {approved} approved</span>}
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
