import { useState, useMemo } from "react";
import { EXPENDITURE_CODES, REVENUE_CODES, FUNDS, FISCAL_YEAR, EXP_TYPES } from "../data/accountCodes.js";
import { StatusBadge, ProgressBar, KPICard, Field, SectionCard, Table, Icon, inp, btn, fmt, fmtSm, pct } from "../components/shared.jsx";
import { DEFAULT_INVOICES_PER_CLAIM } from "../data/schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getNthTuesday(year, month, n) {
  const d = new Date(year, month, 1);
  const dow = d.getDay();
  const daysToTue = (2 - dow + 7) % 7;
  return new Date(year, month, 1 + daysToTue + (n - 1) * 7);
}

function toDateStr(d) { return d.toISOString().split("T")[0]; }

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
        label: d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
      });
    });
  }
  return cycles.sort((a, b) => a.date.localeCompare(b.date));
}

const CLAIM_CYCLES = generateClaimCycles(FISCAL_YEAR.start);

// Expenditure status flow: entered → submitted → approved (voided out-of-band)
// Approval is at the claim CYCLE level — Board votes on the entire cycle.
// Post-approval corrections require a manual Journal Entry.

// ── VendorInput — text with autocomplete from db.vendors ─────────────────────
// Selecting a real vendor captures its id, so the claim sheet can pull the
// remit-to address rather than relying on a typed name matching.
function VendorInput({ value, onChange, onSelect, vendors = [], placeholder = "Vendor / Payee…" }) {
  const [open, setOpen] = useState(false);
  const suggestions = vendors
    .filter(v => v.active !== false && v.name?.toLowerCase().includes(value.toLowerCase()) && value.length > 1)
    .slice(0, 8);
  const exact = vendors.find(v => v.active !== false && v.name === value);
  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inp}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:200, background:"#fff", border:"1px solid #ccc", borderRadius:4, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", maxHeight:220, overflowY:"auto" }}>
          {suggestions.map(v => (
            <div
              key={v.id}
              onMouseDown={() => { onChange(v.name); onSelect?.(v); setOpen(false); }}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, borderBottom:"1px solid #f0f0ee" }}
              onMouseEnter={e => e.currentTarget.style.background="#f0f8ff"}
              onMouseLeave={e => e.currentTarget.style.background="#fff"}
            >
              <strong>{v.name}</strong>
              {v.separateRemitTo && <span style={{ fontSize:10, background:"#e6edf5", color:"#1a3a5c", borderRadius:3, padding:"1px 5px", marginLeft:7, fontWeight:700 }}>REMIT</span>}
              {v.address && <span style={{ fontSize:11, color:"#888", marginLeft:8 }}>{v.address}</span>}
            </div>
          ))}
        </div>
      )}
      {value.length > 1 && !exact && !open && (
        <div style={{ fontSize:11, color:"#d97706", marginTop:4 }}>
          Not in the vendor list — add them under Vendors so the payment address carries onto the claim sheet.
        </div>
      )}
    </div>
  );
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function FundAccounting({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"dashboard",      label:"Dashboard",       icon:"layout-dashboard" },
          { id:"newExpenditure", label:"New Expenditure", icon:"receipt" },
          { id:"newRevenue",     label:"New Revenue",     icon:"cash" },
          { id:"revenue",        label:"Revenue",         icon:"receipt-2" },
          { id:"claims",         label:"Claim Cycles",    icon:"calendar-due" },
          { id:"ledger",         label:"Ledger",          icon:"book" },
          { id:"journal",        label:"Journal Entries", icon:"clipboard-text" },
          { id:"amendments",     label:"Amendments",      icon:"edit" },
          { id:"manageFunds",    label:"Manage Funds",    icon:"adjustments-horizontal" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px",
            fontWeight: view===v.id ? 700 : 400, fontSize:13, cursor:"pointer",
            color: view===v.id ? "#1a3a5c" : "#666",
            borderBottom: view===v.id ? "2px solid #1a3a5c" : "2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            {v.icon && <Icon name={v.icon} size={13} color={view===v.id?"#1a3a5c":"#888"} />}
            {v.label}
          </button>
        ))}
      </div>

      {view==="dashboard"      && <FADashboard db={db} dispatch={dispatch} setView={setView} />}
      {view==="newExpenditure" && <ExpenditureForm db={db} dispatch={dispatch} onDone={() => setView("claims")} />}
      {view==="newRevenue"     && <RevenueForm     db={db} dispatch={dispatch} onDone={() => setView("revenue")} />}
      {view==="revenue"        && <RevenueList     db={db} dispatch={dispatch} onNew={() => setView("newRevenue")} />}
      {view==="claims"         && <ClaimCycles     db={db} dispatch={dispatch} />}
      {view==="ledger"         && <Ledger          db={db} dispatch={dispatch} />}
      {view==="journal"        && <JournalEntries  db={db} dispatch={dispatch} />}
      {view==="amendments"     && <Amendments      db={db} dispatch={dispatch} />}
      {view==="manageFunds"    && <ManageFundsFA   db={db} dispatch={dispatch} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function FADashboard({ db, setView }) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [revSearch, setRevSearch] = useState("");

  // Only "approved" expenditures count toward Total Expended (board voted)
  const expByCode = useMemo(() => {
    const map = {};
    db.expenditures.forEach(e => {
      if (e.status !== "approved") return;
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
      if (r.status !== "approved") return;
      (r.lines || []).forEach(l => { map[l.code] = (map[l.code] || 0) + l.amount; });
    });
    return map;
  }, [db.revenue]);

  const totalBudgeted  = EXPENDITURE_CODES.reduce((s,c) => s + c.budgeted + (amendByCode[c.code]||0), 0);
  const totalExpended  = Object.values(expByCode).reduce((s,v) => s+v, 0);
  const totalRevenue   = Object.values(revByCode).reduce((s,v) => s+v, 0);
  const submittedCount = db.expenditures.filter(e => e.status === "submitted").length;
  const enteredCount   = db.expenditures.filter(e => e.status === "entered").length;

  const pendingRevByCode = useMemo(() => {
    const map = {};
    db.revenue.forEach(r => {
      if (r.status === "approved") return;
      (r.lines || []).forEach(l => { map[l.code] = (map[l.code] || 0) + l.amount; });
    });
    return map;
  }, [db.revenue]);

  const today    = toDateStr(new Date());
  const nextCycle = CLAIM_CYCLES.find(c => c.date >= today);

  const categories  = ["personnel","contracts","materials","capital","equipment","other"];
  const catColors   = { personnel:"#1a3a5c", contracts:"#6b3a1a", materials:"#1a5a3a", capital:"#5a1a6b", equipment:"#1a5a6b", other:"#6b6b1a" };

  const filtered = EXPENDITURE_CODES.filter(c => {
    const budg = c.budgeted + (amendByCode[c.code]||0);
    if (budg === 0 && !expByCode[c.code]) return false;
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (search && !`${c.code} ${c.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredRevCodes = REVENUE_CODES.filter(c => {
    const hasActivity = (revByCode[c.code]||0) > 0 || (pendingRevByCode[c.code]||0) > 0;
    if (revSearch) return `${c.code} ${c.description}`.toLowerCase().includes(revSearch.toLowerCase());
    return hasActivity;
  });

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{FISCAL_YEAR.label} — Fund Accounting</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Roads Fund · {FISCAL_YEAR.start} through {FISCAL_YEAR.end}</div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        <KPICard label="Total Appropriation"  value={fmt(totalBudgeted)}   sub="FY incl. amendments"          accent="#1a3a5c" icon="building-bank" />
        <KPICard label="Total Expended"        value={fmt(totalExpended)}   sub={`${pct(totalExpended,totalBudgeted)}% of budget`} accent="#6b3a1a" icon="receipt" />
        <KPICard label="Revenue Approved"      value={fmt(totalRevenue)}    sub="Board-approved transactions"  accent="#1a6b35" icon="cash" />
        <KPICard label="Submitted to Board"    value={submittedCount}       sub={`${enteredCount} entered, not yet submitted`} accent="#d97706" icon="clock" />
        <KPICard label="Next Claim Cycle"      value={nextCycle?.label||"—"} sub="1st & 3rd Tuesday"          accent="#5a1a8a" icon="calendar-due" />
      </div>

      {/* Fund Balance */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"18px 22px", marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a", marginBottom:14 }}>Roads Fund Balance</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#888", marginBottom:10 }}>Revenue</div>
            {[
              { label:"Revenue Approved",           value:totalRevenue, color:"#1a6b35" },
              { label:"Pending / Submitted Revenue", value:db.revenue.filter(r=>r.status!=="approved").reduce((s,r)=>s+(r.totalAmount||0),0), color:"#d97706" },
            ].map((row,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #f0f0ee" }}>
                <span style={{ fontSize:13, color:"#555" }}>{row.label}</span>
                <span style={{ fontFamily:"monospace", fontWeight:600, color:row.color }}>{fmtSm(row.value)}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0", borderTop:"2px solid #ddd", marginTop:4 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Total Revenue</span>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:15, color:"#1a6b35" }}>{fmtSm(totalRevenue)}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"#888", marginBottom:10 }}>Expenditures & Balance</div>
            {[
              { label:"Total Appropriation",        value:totalBudgeted, color:"#1a3a5c" },
              { label:"Expended (board-approved)",   value:totalExpended, color:"#6b3a1a" },
              { label:"In-process (entered/submitted)", value:db.expenditures.filter(e=>e.status==="entered"||e.status==="submitted").reduce((s,e)=>s+(e.totalAmount||0),0), color:"#d97706" },
            ].map((row,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #f0f0ee" }}>
                <span style={{ fontSize:13, color:"#555" }}>{row.label}</span>
                <span style={{ fontFamily:"monospace", fontWeight:600, color:row.color }}>{fmtSm(row.value)}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0", borderTop:"2px solid #ddd", marginTop:4 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Available Balance</span>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:15, color:totalRevenue-totalExpended>=0?"#1a6b35":"#c0392b" }}>
                {fmtSm(totalRevenue-totalExpended)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Submitted alert */}
      {submittedCount > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:"12px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, color:"#7a4f00", fontWeight:600 }}>
            ⚠️ {submittedCount} claim sheet{submittedCount!==1?"s":""} submitted — awaiting Board approval
          </div>
          <button onClick={() => {}} style={{ ...btn.small, background:"#7a4f00", fontSize:11 }}>View Cycles →</button>
        </div>
      )}

      {/* Category cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:20 }}>
        {categories.map(cat => {
          const budg  = EXPENDITURE_CODES.filter(c=>c.category===cat).reduce((s,c)=>s+c.budgeted+(amendByCode[c.code]||0),0);
          const spent = EXPENDITURE_CODES.filter(c=>c.category===cat).reduce((s,c)=>s+(expByCode[c.code]||0),0);
          const used  = pct(spent,budg);
          const active = catFilter===cat;
          return (
            <button key={cat} onClick={()=>setCatFilter(active?"all":cat)} style={{
              background:active?catColors[cat]:"#fff",
              color:active?"#fff":"#333",
              border:`1px solid ${active?catColors[cat]:"#ddd"}`,
              borderRadius:8, padding:"10px 6px", cursor:"pointer", textAlign:"center",
            }}>
              <div style={{ fontSize:14, fontWeight:700, fontFamily:"monospace" }}>{fmt(budg)}</div>
              <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginTop:3, opacity:0.8 }}>{cat}</div>
              <div style={{ marginTop:6, background:active?"rgba(255,255,255,0.3)":"#eee", borderRadius:3, height:4, overflow:"hidden" }}>
                <div style={{ width:`${used}%`, height:"100%", background:active?"#fff":(used>=90?"#c0392b":used>=75?"#d97706":"#1a6b35") }} />
              </div>
              <div style={{ fontSize:9, marginTop:3, opacity:0.75 }}>{used}% used</div>
            </button>
          );
        })}
      </div>

      {/* Expenditure Code Table */}
      <SectionCard
        title={`Expenditure Codes${catFilter!=="all"?` · ${catFilter}`:""} (${filtered.length})`}
        action={<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, width:200, margin:0 }} />}
      >
        <div style={{ maxHeight:420, overflowY:"auto" }}>
          <Table
            headers={[
              { label:"Code" },{ label:"Description" },{ label:"Category" },
              { label:"Appropriation", right:true },{ label:"Expended", right:true },
              { label:"Remaining", right:true },{ label:"% Used", right:true },
            ]}
            rows={filtered.map(c => {
              const amend  = amendByCode[c.code]||0;
              const approp = c.budgeted+amend;
              const spent  = expByCode[c.code]||0;
              const bal    = approp-spent;
              const used   = pct(spent,approp);
              return [
                <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{c.code}</span>,
                c.description,
                <span style={{ background:(catColors[c.category]||"#555")+"18", color:catColors[c.category]||"#555", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{c.category}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:600 }}>{approp>0?fmt(approp):"—"}</span>,
                <span style={{ fontFamily:"monospace", color:spent>0?"#1a1a1a":"#ccc" }}>{spent>0?fmtSm(spent):"—"}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:600, color:bal<0?"#c0392b":"#1a6b35" }}>{approp>0?fmt(bal):"—"}</span>,
                approp>0?(
                  <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                    <div style={{ width:60 }}><ProgressBar value={used} /></div>
                    <span style={{ fontSize:12, fontWeight:600, color:used>=90?"#c0392b":used>=75?"#d97706":"#555", minWidth:28, textAlign:"right" }}>{used}%</span>
                  </div>
                ):"—",
              ];
            })}
            emptyMessage="No account codes match filter"
          />
        </div>
      </SectionCard>

      {/* Revenue Code Table */}
      <SectionCard
        title="Revenue Codes"
        subtitle="Approved vs pending by revenue code"
        action={<input value={revSearch} onChange={e=>setRevSearch(e.target.value)} placeholder="Search revenue…" style={{ ...inp, width:200, margin:0 }} />}
      >
        <div style={{ maxHeight:380, overflowY:"auto" }}>
          <Table
            headers={[{ label:"Code" },{ label:"Description" },{ label:"Type" },{ label:"Approved", right:true },{ label:"Pending", right:true }]}
            rows={filteredRevCodes.map(c => {
              const approved = revByCode[c.code]||0;
              const pending  = pendingRevByCode[c.code]||0;
              return [
                <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a6b35", fontWeight:600 }}>{c.code}</span>,
                c.description,
                <span style={{ background:"#f0f0ee", color:"#555", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{(c.type||"").replace(/_/g," ")}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:600, color:approved>0?"#1a6b35":"#ccc" }}>{approved>0?fmtSm(approved):"—"}</span>,
                <span style={{ fontFamily:"monospace", color:pending>0?"#d97706":"#ccc" }}>{pending>0?fmtSm(pending):"—"}</span>,
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
function ExpenditureForm({ db, dispatch, onDone, initialData = null }) {
  const isEdit = !!initialData;

  const emptyLine = (l = null) => ({
    id:           l?.id || Date.now() + Math.random(),
    code:         l?.code || "",
    fund:         l?.fund || "ROADS",
    amount:       l ? Math.abs(l.amount).toString() : "",
    description:  l?.description || "",
    isCredit:     l?.isCredit || false,
    assignType:   l?.assignType || "",
    assignRef:    l?.assignRef || "",
    // Inventory receipt (new — wires to FIFO batch system)
    invReceive:   false,
    invItemId:    "",
    invItemName:  "",
    invQty:       "",
    invLocationId:"",
  });

  const [header, setHeader] = useState({
    date:       initialData?.date || "",
    vendorName: initialData?.vendorName || initialData?.vendor || "",
    vendorId:   initialData?.vendorId || null,
    type:       initialData?.type || "invoice",
    reference:  initialData?.reference || "",
    claimCycleId: initialData?.claimCycleId || initialData?.claimCycle || "",
    // Assigned by the Clerk's office after processing — recorded, not generated
    claimNumber: initialData?.claimNumber || "",
  });
  const [lines, setLines]     = useState(initialData ? (initialData.lines||[]).map(l=>emptyLine(l)) : [emptyLine()]);
  const [saved, setSaved]     = useState(false);
  const [catFilter, setCatFilter] = useState("all");

  const set  = (k,v) => setHeader(h => ({ ...h, [k]:v }));
  const setL = (id,k,v) => setLines(ls => ls.map(l => l.id===id ? { ...l,[k]:v } : l));
  const addLine    = () => { if (lines.length < 15) setLines(ls => [...ls, emptyLine()]); };
  const removeLine = id => setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls);

  const totalAmount = lines.reduce((s,l) => {
    const amt = parseFloat(l.amount)||0;
    return s + (l.isCredit ? -Math.abs(amt) : amt);
  }, 0);

  const categories    = [...new Set(EXPENDITURE_CODES.map(c => c.category))];
  const filteredCodes = EXPENDITURE_CODES.filter(c => catFilter==="all" || c.category===catFilter);
  const today         = toDateStr(new Date());
  const openCycles    = CLAIM_CYCLES.filter(c => c.date >= today).slice(0, 8);

  // A line flagged for inventory receipt must name a real catalog item and a quantity.
  // Standing rule (confirmed with staff): nothing is received that isn't already in the catalog.
  const badInvLines = lines.filter(l => l.invReceive && (!l.invItemId || !l.invQty || parseFloat(l.invQty) <= 0));

  const handleSubmit = () => {
    if (!header.date || !header.vendorName || !header.claimCycleId || lines.some(l => !l.code || !l.amount)) return;
    if (badInvLines.length) return;
    const cycle = CLAIM_CYCLES.find(c => c.id === header.claimCycleId);
    const payload = {
      id:              initialData?.id || Date.now(),
      date:            header.date,
      vendorId:        header.vendorId || null,
      vendorName:      header.vendorName,
      claimNumber:     header.claimNumber,
      vendor:          header.vendorName,  // legacy compat
      type:            header.type,
      reference:       header.reference,
      claimCycleId:    header.claimCycleId,
      claimCycle:      header.claimCycleId, // legacy compat
      claimCycleLabel: cycle?.label || header.claimCycleId,
      lines: lines.map(l => ({
        id:          l.id,
        code:        l.code,
        fund:        l.fund,
        amount:      l.isCredit ? -Math.abs(parseFloat(l.amount)||0) : parseFloat(l.amount)||0,
        description: l.description,
        isCredit:    l.isCredit,
        assignType:  l.assignType,
        assignRef:   l.assignRef,
      })),
      totalAmount,
      status: initialData?.status || "entered",
      createdAt: initialData?.createdAt || new Date().toISOString(),
    };
    dispatch({ type: isEdit ? "UPDATE_EXPENDITURE" : "ADD_EXPENDITURE", payload });

    // Dispatch inventory receipts for lines marked as inventory (only on new entry, not edits)
    if (!isEdit) {
      lines.filter(l => l.invReceive && l.invQty && l.invItemId).forEach(l => {
        const qty      = parseFloat(l.invQty) || 0;
        const lineAmt  = parseFloat(l.amount) || 0;
        const unitCost = qty > 0 ? lineAmt / qty : lineAmt;
        const batchId  = Date.now() + Math.random();
        // Item is guaranteed to exist — the form blocks saving otherwise.
        const catalogItem = (db.inventoryItems||[]).find(i => i.id === l.invItemId);
        const itemName    = catalogItem?.name || l.invItemName;
        const batch = {
          id:                batchId,
          itemId:            l.invItemId,
          itemName,
          receiptDate:       header.date,
          quantityReceived:  qty,
          quantityRemaining: qty,
          unitCost,
          totalCost:         lineAmt,
          vendorName:        header.vendorName,
          referenceNumber:   header.reference,
          location:          l.invLocationId || "Main Shop",
          status:            "open",
          invoiceStatus:     "final",
          invoiceRef:        header.reference,
          expenditureId:     payload.id,
          notes:             `Auto-received from expenditure — ${header.vendorName}`,
          createdAt:         new Date().toISOString(),
        };
        dispatch({
          type: "ADD_INVENTORY_TRANSACTION",
          payload: {
            id:            Date.now() + Math.random(),
            type:          "receive",
            date:          header.date,
            itemId:        l.invItemId,
            itemName,
            vendorName:    header.vendorName,
            quantity:      qty,
            unitCost,
            totalCost:     lineAmt,
            location:      l.invLocationId || "Main Shop",
            referenceNumber: header.reference,
            expenditureId: payload.id,
            batch,
            notes: `Auto-received from expenditure — ${header.vendorName}`,
            createdAt: new Date().toISOString(),
          },
        });
      });

      setHeader({ date:"", vendorName:"", type:"invoice", reference:"", claimCycleId:"" });
      setLines([emptyLine()]);
      setSaved(true);
      setTimeout(() => { setSaved(false); onDone(); }, 1400);
    } else {
      onDone();
    }
  };

  return (
    <div style={{ maxWidth:860 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        {isEdit && <button onClick={onDone} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>}
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{isEdit ? "Edit Expenditure" : "New Expenditure"}</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            {isEdit
              ? `${initialData.vendorName||initialData.vendor} · ${initialData.date} · ${initialData.reference||"No invoice #"}`
              : "Each claim sheet is one vendor. Credits supported per line."}
          </div>
        </div>
        {isEdit && (
          <div style={{ marginLeft:"auto" }}>
            <span style={{ background:"#fef3cd", color:"#7a4f00", padding:"4px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>Editing</span>
          </div>
        )}
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Saved to claim cycle — redirecting…</div>}

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Transaction Header</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <input type="date" value={header.date} onChange={e=>set("date",e.target.value)} style={inp} />
          </Field>
          <Field label="Transaction Type">
            <select value={header.type} onChange={e=>set("type",e.target.value)} style={inp}>
              {EXP_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Invoice / Reference #">
            <input type="text" placeholder="Invoice or PO number…" value={header.reference} onChange={e=>set("reference",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Vendor / Payee" required>
            <VendorInput
              value={header.vendorName}
              onChange={v => set("vendorName",v)}
              onSelect={v => set("vendorId", v.id)}
              vendors={db.vendors||[]}
            />
          </Field>
          <Field label="Claim Cycle" required>
            <select value={header.claimCycleId} onChange={e=>set("claimCycleId",e.target.value)} style={inp}>
              <option value="">Assign to claim cycle…</option>
              {openCycles.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Line Items */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13 }}>Line Items ({lines.length}/15)</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Each line can be assigned to a project, machine, or asset for cost reporting</div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["all",...categories].map(cat=>(
              <button key={cat} onClick={()=>setCatFilter(cat)} style={{
                padding:"3px 9px", fontSize:11, fontWeight:600, textTransform:"capitalize",
                border:"1px solid", borderRadius:4, cursor:"pointer",
                background:catFilter===cat?"#1a3a5c":"#fff",
                color:catFilter===cat?"#fff":"#555",
                borderColor:catFilter===cat?"#1a3a5c":"#ccc",
              }}>{cat}</button>
            ))}
          </div>
        </div>

        {lines.map((line, i) => {
          const selectedCode = EXPENDITURE_CODES.find(c => c.code===line.code);
          return (
            <div key={line.id} style={{ background:line.isCredit?"#fef8ff":"#fafaf8", border:`1px solid ${line.isCredit?"#e0c8e8":"#eee"}`, borderRadius:8, padding:16, marginBottom:10 }}>

              {/* Row 1 — code + fund + amount + credit toggle */}
              <div style={{ display:"flex", gap:12, alignItems:"flex-end", marginBottom:12 }}>
                <div style={{ flex:3 }}>
                  <Field label={`Line ${i+1} — Account Code`} required>
                    <select value={line.code} onChange={e=>setL(line.id,"code",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
                      <option value="">Select account code…</option>
                      {filteredCodes.map(c=>(
                        <option key={c.code} value={c.code}>{c.code} — {c.description}{c.budgeted>0?` (${fmt(c.budgeted)})`:""}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedCode && (
                    <div style={{ fontSize:11, color:"#888", marginTop:4 }}>
                      Category: <strong>{selectedCode.category}</strong> · Budget: <strong>{selectedCode.budgeted>0?fmt(selectedCode.budgeted):"Unbudgeted"}</strong>
                    </div>
                  )}
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
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={line.amount} onChange={e=>setL(line.id,"amount",e.target.value)}
                      style={{ ...inp, fontFamily:"monospace", color:line.isCredit?"#5a1a8a":"#1a1a1a" }} />
                  </Field>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, paddingBottom:2 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"#666" }}>Credit</label>
                  <div onClick={()=>setL(line.id,"isCredit",!line.isCredit)} style={{ width:40, height:22, borderRadius:11, cursor:"pointer", background:line.isCredit?"#5a1a8a":"#ccc", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ position:"absolute", top:3, left:line.isCredit?21:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                  </div>
                </div>
                {lines.length > 1 && (
                  <button onClick={()=>removeLine(line.id)} style={{ ...btn.danger, padding:"9px 12px", fontSize:16, lineHeight:1, paddingBottom:10 }}>×</button>
                )}
              </div>

              {/* Row 2 — description + assignment */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12 }}>
                <Field label="Item Description">
                  <input type="text" placeholder="What is this? (e.g. Gravel CR14 Section 3)…"
                    value={line.description} onChange={e=>setL(line.id,"description",e.target.value)} style={inp} />
                </Field>
                <Field label="Assign To">
                  <select value={line.assignType} onChange={e=>setL(line.id,"assignType",e.target.value)} style={inp}>
                    {[
                      { value:"",        label:"None" },
                      { value:"project", label:"Project" },
                      { value:"machine", label:"Machine" },
                      { value:"asset",   label:"Asset" },
                    ].map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {line.assignType && (
                  <Field label={line.assignType==="project"?"Project Name/ID":line.assignType==="machine"?"Machine / Unit #":"Asset / Location"}>
                    <input type="text" placeholder={`Enter ${line.assignType} reference…`}
                      value={line.assignRef} onChange={e=>setL(line.id,"assignRef",e.target.value)} style={inp} />
                  </Field>
                )}
              </div>

              {/* Inventory receipt toggle — only on non-credit lines */}
              {!line.isCredit && !isEdit && (
                <div style={{ marginTop:10 }}>
                  <div
                    style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", width:"fit-content" }}
                    onClick={() => setL(line.id,"invReceive",!line.invReceive)}
                  >
                    <div style={{ width:40, height:22, borderRadius:11, background:line.invReceive?"#1a5a3a":"#ccc", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:3, left:line.invReceive?21:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                    </div>
                    <label style={{ fontSize:12, fontWeight:600, color:line.invReceive?"#1a5a3a":"#777", cursor:"pointer" }}>
                      Receive into Inventory
                    </label>
                  </div>

                  {line.invReceive && (
                    <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:6, padding:12, marginTop:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#1a5a3a", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
                        Inventory Receipt — creates a FIFO batch
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10 }}>
                        <Field label="Inventory Item" required>
                          <select
                            value={line.invItemId}
                            onChange={e => {
                              const item = (db.inventoryItems||[]).find(i=>i.id===e.target.value);
                              setL(line.id,"invItemId",e.target.value);
                              setL(line.id,"invItemName",item?.name||"");
                            }}
                            style={{ ...inp, fontSize:12, borderColor: line.invItemId ? "" : "#c0392b" }}
                          >
                            <option value="">Select catalog item…</option>
                            {(db.inventoryItems||[])
                              .filter(i=>i.active!==false)
                              .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
                              .map(i=>(
                                <option key={i.id} value={i.id}>
                                  {i.legacyNumber?`[${i.legacyNumber}] `:""}{i.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Quantity">
                          <input
                            type="number" min="0.001" step="any" placeholder="0"
                            value={line.invQty}
                            onChange={e=>setL(line.id,"invQty",e.target.value)}
                            style={{ ...inp, fontFamily:"monospace" }}
                          />
                        </Field>
                        <Field label="Receive to Location">
                          <select
                            value={line.invLocationId}
                            onChange={e=>setL(line.id,"invLocationId",e.target.value)}
                            style={inp}
                          >
                            <option value="">Select location…</option>
                            {(db.storageLocations||[]).map(loc=>(
                              <option key={loc.id} value={loc.name}>{loc.name}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      {!line.invItemId && (
                        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:4, padding:"8px 11px", marginTop:8, fontSize:11, color:"#8c1b18" }}>
                          <strong>An item must exist in the catalog before it can be received.</strong>{" "}
                          If it isn't in the list, add it in the Inventory module first, then come back to this claim.
                        </div>
                      )}
                      {line.invItemId && line.invQty && parseFloat(line.invQty) > 0 && parseFloat(line.amount) > 0 && (
                        <div style={{ fontSize:11, color:"#1a5a3a", marginTop:8 }}>
                          Unit cost: <strong>{fmtSm((parseFloat(line.amount)||0)/(parseFloat(line.invQty)||1))}</strong> per unit · Batch will post when expenditure is saved
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {line.isCredit && (
                <div style={{ marginTop:8, fontSize:11, color:"#5a1a8a", fontWeight:600 }}>CREDIT — reduces amount: –{fmtSm(Math.abs(parseFloat(line.amount)||0))}</div>
              )}
            </div>
          );
        })}

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <button onClick={addLine} disabled={lines.length>=15} style={{ ...btn.secondary, fontSize:12, padding:"7px 14px", opacity:lines.length>=15?0.4:1 }}>
            + Add line item {lines.length>=15?"(limit)":""}
          </button>
          <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:700, color:totalAmount<0?"#5a1a8a":"#1a1a1a" }}>
            Total: {totalAmount<0?"-":""}{fmtSm(Math.abs(totalAmount))}
            {totalAmount<0 && <span style={{ fontSize:12, color:"#5a1a8a", marginLeft:8 }}>NET CREDIT</span>}
          </div>
        </div>
      </div>

      {badInvLines.length > 0 && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:6, padding:"11px 15px", marginBottom:12, fontSize:12, color:"#8c1b18", fontWeight:600 }}>
          {badInvLines.length} line{badInvLines.length!==1?"s are":" is"} marked for inventory receipt but {badInvLines.length!==1?"are":"is"} missing a catalog item or quantity. Fix {badInvLines.length!==1?"them":"it"} — or switch off "Receive into Inventory" — before saving.
        </div>
      )}

      <div style={{ display:"flex", gap:10 }}>
        <button
          onClick={handleSubmit}
          disabled={badInvLines.length > 0}
          style={{ ...btn.primary, opacity: badInvLines.length > 0 ? 0.4 : 1, cursor: badInvLines.length > 0 ? "not-allowed" : "pointer" }}
        >
          {isEdit?"Save Changes":"Save to Claim Cycle"}
        </button>
        {!isEdit && (
          <button onClick={()=>{ setHeader({date:"",vendorName:"",type:"invoice",reference:"",claimCycleId:""}); setLines([emptyLine()]); }} style={btn.ghost}>Clear</button>
        )}
      </div>
    </div>
  );
}

// ── Claim Cycles ──────────────────────────────────────────────────────────────
function ClaimCycles({ db, dispatch }) {
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [editingExp, setEditingExp]       = useState(null);
  const [viewingExp, setViewingExp]       = useState(null);
  const today = toDateStr(new Date());

  const expByCycle = useMemo(() => {
    const map = {};
    db.expenditures.forEach(e => {
      const key = e.claimCycleId || e.claimCycle;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [db.expenditures]);

  // Cycle-level workflow actions
  const submitCycle  = cycleId => dispatch({ type:"SUBMIT_CLAIM_CYCLE",  payload:cycleId });
  const approveCycle = cycleId => dispatch({ type:"APPROVE_CLAIM_CYCLE", payload:cycleId });

  const exportClaimSheet = e => {
    alert(
      "Export coming in the Reporting module — will fill your official claim form template.\n\n" +
      "Vendor: " + (e.vendorName||e.vendor) + "\n" +
      "Total: $" + Math.abs(e.totalAmount||0).toFixed(2) + "\n" +
      "Lines: " + (e.lines||[]).length
    );
  };

  // View expenditure
  if (viewingExp) {
    return (
      <div style={{ maxWidth:780 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <button onClick={()=>setViewingExp(null)} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Back</button>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>View Expenditure</div>
            <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{viewingExp.vendorName||viewingExp.vendor} · {viewingExp.date}</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            {viewingExp.status !== "approved" && (
              <button onClick={()=>{ setEditingExp(viewingExp); setViewingExp(null); }} style={{ ...btn.primary, background:"#1a3a5c", fontSize:12 }}>Edit</button>
            )}
            <button onClick={()=>exportClaimSheet(viewingExp)} style={{ ...btn.primary, background:"#5a1a8a", fontSize:12 }}>⬇ Export Claim Sheet</button>
          </div>
        </div>
        {viewingExp.status==="approved" && (
          <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"10px 16px", marginBottom:14, fontSize:12, color:"#1a5a2a", fontWeight:600 }}>
            ✓ Board-approved — corrections require a Journal Entry
          </div>
        )}
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:18 }}>
            {[
              { label:"Date",        value:viewingExp.date },
              { label:"Type",        value:(viewingExp.type||"").replace(/_/g," ") },
              { label:"Invoice #",   value:viewingExp.reference||"—" },
              { label:"Claim Cycle", value:viewingExp.claimCycleLabel||viewingExp.claimCycle||"—" },
              { label:"Vendor",      value:viewingExp.vendorName||viewingExp.vendor },
              { label:"Status",      value:viewingExp.status },
              { label:"Total",       value:fmtSm(Math.abs(viewingExp.totalAmount||0)) },
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
                      {l.isCredit?"-":""}{fmtSm(Math.abs(l.amount||0))}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                  <td colSpan={4} style={{ padding:"9px 12px", textAlign:"right", fontWeight:700 }}>Total</td>
                  <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:15 }}>{fmtSm(Math.abs(viewingExp.totalAmount||0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  if (editingExp) {
    return (
      <ExpenditureForm
        db={db}
        dispatch={dispatch}
        initialData={editingExp}
        onDone={() => setEditingExp(null)}
      />
    );
  }

  // Cycle detail
  if (selectedCycle) {
    const cycleExp      = expByCycle[selectedCycle.id] || [];
    const totalAmt      = cycleExp.reduce((s,e) => s+(e.totalAmount||0), 0);
    const enteredCount  = cycleExp.filter(e => e.status==="entered").length;
    const submittedCount= cycleExp.filter(e => e.status==="submitted").length;
    const approvedCount = cycleExp.filter(e => e.status==="approved").length;
    const isFullyApproved = approvedCount === cycleExp.length && cycleExp.length > 0;

    // The Clerk's claim form holds a fixed number of invoice lines for one
    // vendor. Going over means the claim has to be split onto another sheet —
    // better caught here than by the Clerk after the cycle has been submitted.
    const perClaimLimit = Math.max(1, Number(db.countyInfo?.invoicesPerClaim) || DEFAULT_INVOICES_PER_CLAIM);
    const overLimit = Object.entries(
      cycleExp.reduce((acc, e) => {
        const key = e.vendorId || e.vendor || "(no vendor)";
        (acc[key] = acc[key] || { name: e.vendor || "(no vendor)", lines: 0 }).lines += (e.lines || []).length;
        return acc;
      }, {})
    ).map(([, v]) => v).filter(v => v.lines > perClaimLimit);

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
            {enteredCount>0   && <span style={{ background:"#f0f0ee", color:"#555",    padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>✏️ {enteredCount} entered</span>}
            {submittedCount>0 && <span style={{ background:"#fef3cd", color:"#7a4f00", padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>📋 {submittedCount} submitted</span>}
            {approvedCount>0  && <span style={{ background:"#e6f4ec", color:"#1a6b35", padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600 }}>✓ {approvedCount} approved</span>}
          </div>
        </div>

        {overLimit.length > 0 && (
          <div style={{ background:"#fef8e8", border:"1px solid #f0d080", borderRadius:8, padding:"14px 18px", marginBottom:16, fontSize:13, color:"#7a4f00", lineHeight:1.6 }}>
            <strong>Over the claim limit.</strong> The claim form holds {perClaimLimit} invoices for one
            vendor. These will need splitting across more than one sheet:
            <ul style={{ margin:"8px 0 0", paddingLeft:20 }}>
              {overLimit.map(v => (
                <li key={v.name} style={{ marginTop:3 }}>
                  <strong>{v.name}</strong> — {v.lines} invoices
                  {" "}({Math.ceil(v.lines / perClaimLimit)} sheets)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Workflow step banner */}
        {!isFullyApproved && cycleExp.length > 0 && (
          <div style={{ background:"#eef2f8", border:"1px solid #c8d8ec", borderRadius:8, padding:"14px 18px", marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#1a3a5c", marginBottom:8 }}>Claim Cycle Workflow</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:enteredCount>0?"#1a3a5c":"#ccc", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11 }}>1</div>
                <span style={{ color:enteredCount>0?"#1a3a5c":"#aaa" }}>Office enters expenditures</span>
              </div>
              <div style={{ color:"#ccc" }}>→</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:submittedCount>0?"#d97706":"#ccc", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11 }}>2</div>
                <span style={{ color:submittedCount>0?"#d97706":"#aaa" }}>Claim sheet printed for Superintendent</span>
              </div>
              <div style={{ color:"#ccc" }}>→</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:isFullyApproved?"#1a6b35":"#ccc", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11 }}>3</div>
                <span style={{ color:isFullyApproved?"#1a6b35":"#aaa" }}>Board approves full cycle</span>
              </div>
            </div>
          </div>
        )}

        {isFullyApproved && (
          <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:8, padding:"12px 18px", marginBottom:16, fontSize:13, color:"#1a5a2a", fontWeight:600 }}>
            ✓ Board-approved — this cycle is closed. Corrections require a Journal Entry.
          </div>
        )}

        {cycleExp.length===0 ? (
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:40, textAlign:"center", color:"#aaa", fontSize:13 }}>
            No expenditures assigned to this cycle — use New Expenditure to add items.
          </div>
        ) : (
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:16 }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid #eee", background:"#f7f7f5", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Expenditures</span>
              <div style={{ display:"flex", gap:8 }}>
                {enteredCount>0 && (
                  <button onClick={()=>submitCycle(selectedCycle.id)} style={{ ...btn.primary, background:"#d97706", fontSize:12, padding:"7px 18px" }}>
                    📋 Submit to Board ({enteredCount} sheets)
                  </button>
                )}
                {submittedCount>0 && enteredCount===0 && (
                  <button onClick={()=>approveCycle(selectedCycle.id)} style={{ ...btn.primary, background:"#1a6b35", fontSize:12, padding:"7px 18px" }}>
                    ✓ Board Approved — Close Cycle
                  </button>
                )}
              </div>
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
                    <td style={{ padding:"10px 14px", fontWeight:600, color:"#1a1a1a", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.vendorName||e.vendor}</td>
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
                    <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:(e.totalAmount||0)<0?"#5a1a8a":"#1a1a1a" }}>
                      {(e.totalAmount||0)<0?"-":""}{fmtSm(Math.abs(e.totalAmount||0))}
                    </td>
                    <td style={{ padding:"10px 14px" }}><StatusBadge status={e.status} /></td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <button onClick={()=>setViewingExp(e)} style={{ ...btn.small, background:"#555", fontSize:10, padding:"4px 10px" }}>View</button>
                        {e.status==="entered" && (
                          <button onClick={()=>setEditingExp(e)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Edit</button>
                        )}
                        <button onClick={()=>exportClaimSheet(e)} style={{ ...btn.small, background:"#5a1a8a", fontSize:10, padding:"4px 10px" }}>⬇</button>
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
          const items     = expByCycle[cycle.id]||[];
          const total     = items.reduce((s,e)=>s+(e.totalAmount||0),0);
          const entered   = items.filter(e=>e.status==="entered").length;
          const submitted = items.filter(e=>e.status==="submitted").length;
          const approved  = items.filter(e=>e.status==="approved").length;
          const isPast    = cycle.date < today;
          const isToday   = cycle.date === today;
          return (
            <button key={cycle.id} onClick={()=>setSelectedCycle(cycle)} style={{
              background:"#fff", border:`1px solid ${isToday?"#1a6b35":"#ddd"}`,
              borderRadius:8, padding:16, cursor:"pointer", textAlign:"left",
              borderTop:`3px solid ${isToday?"#1a6b35":isPast?"#ccc":"#1a3a5c"}`,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ fontSize:13, fontWeight:700, color:isPast?"#888":"#1a1a1a" }}>{cycle.label}</div>
                {isToday && <span style={{ fontSize:10, background:"#e6f4ec", color:"#1a6b35", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>TODAY</span>}
                {isPast  && !isToday && <span style={{ fontSize:10, background:"#f0f0ee", color:"#888", padding:"2px 7px", borderRadius:4, fontWeight:600 }}>PAST</span>}
              </div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:"#1a3a5c", margin:"8px 0 4px" }}>
                {items.length>0?fmtSm(total):"—"}
              </div>
              <div style={{ fontSize:12, color:"#888" }}>
                {items.length>0?(
                  <>
                    {items.length} claim sheet{items.length!==1?"s":""}
                    {entered>0   && <span style={{ color:"#555",    marginLeft:8 }}>· {entered} entered</span>}
                    {submitted>0 && <span style={{ color:"#d97706", marginLeft:8 }}>· {submitted} submitted</span>}
                    {approved>0  && <span style={{ color:"#1a6b35", marginLeft:8 }}>· {approved} approved</span>}
                  </>
                ):"No items yet"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Revenue Form ──────────────────────────────────────────────────────────────
function RevenueForm({ db, dispatch, onDone, initialData = null }) {
  const isEdit = !!initialData;
  const emptyLine = (l=null) => ({ id:l?.id||Date.now()+Math.random(), code:l?.code||"", fund:l?.fund||"ROADS", amount:l?l.amount.toString():"" });
  const [header, setHeader] = useState({
    date:        initialData?.date || "",
    sourceName:  initialData?.sourceName || initialData?.source || "",
    reference:   initialData?.reference || "",
    description: initialData?.description || "",
  });
  const [lines, setLines]   = useState(initialData ? (initialData.lines||[]).map(l=>emptyLine(l)) : [emptyLine()]);
  const [saved, setSaved]   = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const setH = (k,v) => setHeader(h=>({ ...h,[k]:v }));
  const setL = (id,k,v) => setLines(ls=>ls.map(l=>l.id===id?{ ...l,[k]:v }:l));
  const addLine    = () => setLines(ls=>[...ls,emptyLine()]);
  const removeLine = id  => setLines(ls=>ls.filter(l=>l.id!==id));
  const totalAmount = lines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const revTypes    = [...new Set(REVENUE_CODES.map(r=>r.type))];
  const filteredCodes = REVENUE_CODES.filter(r=>typeFilter==="all"||r.type===typeFilter);
  const today = toDateStr(new Date());

  const handleSubmit = () => {
    if (!header.date||!header.sourceName||lines.some(l=>!l.code||!l.amount)) return;
    const payload = {
      ...(initialData || {}),
      id: initialData?.id || Date.now(),
      date:            header.date,
      sourceName:      header.sourceName,
      source:          header.sourceName, // legacy compat
      reference:       header.reference,
      description:     header.description,
      lines: lines.map(l=>({ code:l.code, fund:l.fund, amount:parseFloat(l.amount)||0 })),
      totalAmount,
      status: initialData?.status || "entered",
      createdAt: initialData?.createdAt || new Date().toISOString(),
    };
    dispatch({ type: isEdit ? "UPDATE_REVENUE" : "ADD_REVENUE", payload });
    if (isEdit) { onDone(); return; }
    setHeader({ date:"", sourceName:"", reference:"", description:"" });
    setLines([emptyLine()]);
    setSaved(true);
    setTimeout(()=>{ setSaved(false); onDone(); },1400);
  };

  return (
    <div style={{ maxWidth:800 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>{isEdit?"Edit Revenue":"New Revenue Transaction"}</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
          Grants, permits, highway allocations, intergovernmental transfers.
          {" "}Goes to the Treasurer for receipting — no claim cycle.
        </div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Revenue recorded — redirecting…</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Transaction Header</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required><input type="date" value={header.date} onChange={e=>setH("date",e.target.value)} style={inp} /></Field>
          <Field label="Reference #"><input type="text" placeholder="Check / warrant #…" value={header.reference} onChange={e=>setH("reference",e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Source / Grantor / Payer" required>
            <input type="text" placeholder="NDOR, FHWA, Township of…" value={header.sourceName} onChange={e=>setH("sourceName",e.target.value)} style={inp} />
          </Field>
          <Field label="Description">
            <input type="text" placeholder="Award number, permit reference…" value={header.description} onChange={e=>setH("description",e.target.value)} style={inp} />
          </Field>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>Revenue Code Lines</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["all",...revTypes].map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} style={{
                padding:"3px 9px", fontSize:11, fontWeight:600, border:"1px solid", borderRadius:4, cursor:"pointer",
                background:typeFilter===t?"#1a6b35":"#fff",
                color:typeFilter===t?"#fff":"#555",
                borderColor:typeFilter===t?"#1a6b35":"#ccc",
                textTransform:"capitalize",
              }}>{t.replace(/_/g," ")}</button>
            ))}
          </div>
        </div>
        {lines.map((line,i)=>(
          <div key={line.id} style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:14, marginBottom:10 }}>
            <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
              <div style={{ flex:2 }}>
                <Field label={`Revenue Code ${i+1}`} required>
                  <select value={line.code} onChange={e=>setL(line.id,"code",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
                    <option value="">Select revenue code…</option>
                    {filteredCodes.map(r=><option key={r.code} value={r.code}>{r.code} — {r.description}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex:1 }}>
                <Field label="Fund">
                  <select value={line.fund} onChange={e=>setL(line.id,"fund",e.target.value)} style={inp}>
                    {FUNDS.map(f=><option key={f.code} value={f.code}>{f.name}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex:1 }}>
                <Field label="Amount ($)" required>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.amount} onChange={e=>setL(line.id,"amount",e.target.value)}
                    style={{ ...inp, fontFamily:"monospace" }} />
                </Field>
              </div>
              {lines.length>1 && (
                <button onClick={()=>removeLine(line.id)} style={{ ...btn.danger, padding:"9px 12px", fontSize:16, lineHeight:1 }}>×</button>
              )}
            </div>
          </div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <button onClick={addLine} style={{ ...btn.secondary, fontSize:12, padding:"7px 14px" }}>+ Add line</button>
          <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:"#1a6b35" }}>Total: {fmtSm(totalAmount)}</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a6b35" }}>{isEdit?"Save Changes":"Record Revenue"}</button>
        {isEdit
          ? <button onClick={onDone} style={btn.ghost}>Cancel</button>
          : <button onClick={()=>{ setHeader({date:"",sourceName:"",reference:"",description:""}); setLines([emptyLine()]); }} style={btn.ghost}>Clear</button>}
      </div>
    </div>
  );
}

// ── Ledger ────────────────────────────────────────────────────────────────────
function Ledger({ db }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const allTx = useMemo(() => {
    const exps = db.expenditures.map(e => ({ ...e, txType:"expenditure", displayVendor:e.vendorName||e.vendor }));
    const revs = db.revenue.map(r => ({ ...r, txType:"revenue", displayVendor:r.sourceName||r.source }));
    const jes  = (db.journalEntries||[]).map(j => ({ ...j, txType:"journal_entry", displayVendor:"Journal Entry", totalAmount:j.amount }));
    return [...exps,...revs,...jes].sort((a,b)=>new Date(b.date)-new Date(a.date));
  }, [db.expenditures, db.revenue, db.journalEntries]);

  const filtered = allTx.filter(t=>{
    if (filter==="expenditure"  && t.txType!=="expenditure")  return false;
    if (filter==="revenue"      && t.txType!=="revenue")      return false;
    if (filter==="journal"      && t.txType!=="journal_entry") return false;
    if (filter==="entered"      && t.status!=="entered")      return false;
    if (filter==="submitted"    && t.status!=="submitted")    return false;
    if (filter==="approved"     && t.status!=="approved")     return false;
    if (search && !`${t.displayVendor||""} ${t.description||""} ${(t.lines||[]).map(l=>l.code).join(" ")}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Transaction Ledger</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{allTx.length} transaction{allTx.length!==1?"s":""} · {FISCAL_YEAR.label}</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input type="text" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inp, width:180, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all","expenditure","revenue","journal","entered","submitted","approved"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{ padding:"7px 11px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:filter===f?"#1a3a5c":"#fff", color:filter===f?"#fff":"#555", textTransform:"capitalize" }}>
                {f==="journal"?"JE":f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Date","Type","Vendor / Source","Codes","Claim Cycle","Total","Status"].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:h==="Total"?"right":"left", fontWeight:600, fontSize:11, letterSpacing:"0.05em", textTransform:"uppercase", color:"#666", whiteSpace:"nowrap", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={7} style={{ padding:36, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {allTx.length===0?"No transactions yet.":"No transactions match your filter."}
              </td></tr>
            )}
            {filtered.map((t,i)=>{
              const cycle = CLAIM_CYCLES.find(c=>c.id===(t.claimCycleId||t.claimCycle));
              const typeColor = t.txType==="revenue"?"#e6f4ec":t.txType==="journal_entry"?"#fef3cd":"#eef2f8";
              const typeText  = t.txType==="revenue"?"Revenue":t.txType==="journal_entry"?"Journal Entry":(t.type||"").replace(/_/g," ");
              const textColor = t.txType==="revenue"?"#1a6b35":t.txType==="journal_entry"?"#7a4f00":"#1a3a5c";
              return (
                <tr key={t.id+t.txType} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#555", whiteSpace:"nowrap" }}>{t.date}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ background:typeColor, color:textColor, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600 }}>{typeText}</span>
                  </td>
                  <td style={{ padding:"10px 14px", fontWeight:600, color:"#1a1a1a", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.displayVendor}</td>
                  <td style={{ padding:"10px 14px", maxWidth:200 }}>
                    {t.txType==="journal_entry"
                      ? <span style={{ fontSize:12, color:"#888" }}>{t.debitCode||""}{t.creditCode?` / ${t.creditCode}`:""}</span>
                      : (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                          {(t.lines||[]).map((l,j)=>(
                            <span key={j} title={l.description} style={{ background:l.isCredit?"#f3e8ff":"#f0f0ee", color:l.isCredit?"#5a1a8a":"#1a3a5c", padding:"1px 5px", borderRadius:3, fontSize:10, fontFamily:"monospace", fontWeight:600 }}>
                              {l.isCredit?"CR ":""}{l.code}
                            </span>
                          ))}
                        </div>
                      )
                    }
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#555" }}>{cycle?.label||"—"}</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:(t.totalAmount||0)<0?"#5a1a8a":t.txType==="revenue"?"#1a6b35":"#1a1a1a" }}>
                    {(t.totalAmount||0)<0?"-":t.txType==="revenue"?"+":""}{fmtSm(Math.abs(t.totalAmount||0))}
                  </td>
                  <td style={{ padding:"10px 14px" }}><StatusBadge status={t.status||"—"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Journal Entries ───────────────────────────────────────────────────────────
function JournalEntries({ db, dispatch }) {
  const [form, setForm] = useState({
    date:"", description:"", debitCode:"", creditCode:"", amount:"", reason:"", claimCycleId:"",
  });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const allCodes = [
    ...EXPENDITURE_CODES.map(c=>({ value:c.code, label:`${c.code} — ${c.description}` })),
    ...REVENUE_CODES.map(c=>({ value:c.code, label:`${c.code} — ${c.description}` })),
  ];
  const today      = toDateStr(new Date());
  const openCycles = CLAIM_CYCLES.filter(c=>c.date>=today).slice(0,6);

  const handleSubmit = () => {
    if (!form.date||!form.description||!form.debitCode||!form.amount) return;
    dispatch({ type:"ADD_JOURNAL_ENTRY", payload:{
      id:          Date.now(),
      date:        form.date,
      description: form.description,
      debitCode:   form.debitCode,
      creditCode:  form.creditCode,
      amount:      parseFloat(form.amount)||0,
      reason:      form.reason,
      claimCycleId:form.claimCycleId,
      status:      "posted",
      createdAt:   new Date().toISOString(),
    }});
    setForm({ date:"", description:"", debitCode:"", creditCode:"", amount:"", reason:"", claimCycleId:"" });
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Journal Entries</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Manual corrections after Board approval. Journal entries bypass the claim cycle workflow.</div>
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Journal entry recorded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14, color:"#1a1a1a" }}>New Journal Entry</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
          </Field>
          <Field label="Amount ($)" required>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount}
              onChange={e=>set("amount",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Description" required>
            <input type="text" placeholder="What does this entry correct or record?" value={form.description}
              onChange={e=>set("description",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Debit (Account Code)" required>
            <select value={form.debitCode} onChange={e=>set("debitCode",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
              <option value="">Select debit code…</option>
              {allCodes.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Credit (Account Code — optional)">
            <select value={form.creditCode} onChange={e=>set("creditCode",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
              <option value="">Select credit code (if applicable)…</option>
              {allCodes.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Related Claim Cycle">
            <select value={form.claimCycleId} onChange={e=>set("claimCycleId",e.target.value)} style={inp}>
              <option value="">None / not cycle-specific</option>
              {CLAIM_CYCLES.slice().reverse().slice(0,16).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Reason / Authorization">
            <input type="text" placeholder="Board resolution #, correction reason…" value={form.reason}
              onChange={e=>set("reason",e.target.value)} style={inp} />
          </Field>
        </div>
        <button onClick={handleSubmit} style={btn.primary}>Post Journal Entry</button>
      </div>

      <SectionCard title="Journal Entry History" subtitle={`${(db.journalEntries||[]).length} entries`}>
        <Table
          headers={[{ label:"Date" },{ label:"Description" },{ label:"Debit" },{ label:"Credit" },{ label:"Amount", right:true },{ label:"Reason" }]}
          rows={(db.journalEntries||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(j=>[
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{j.date}</span>,
            j.description,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{j.debitCode||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a6b35" }}>{j.creditCode||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700 }}>{fmtSm(j.amount||0)}</span>,
            <span style={{ color:"#666", fontSize:12 }}>{j.reason||"—"}</span>,
          ])}
          emptyMessage="No journal entries yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Budget Amendments ─────────────────────────────────────────────────────────
function Amendments({ db, dispatch }) {
  const [form, setForm] = useState({ date:"", code:"", amount:"", reason:"" });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const handleSubmit = () => {
    if (!form.date||!form.code||!form.amount) return;
    dispatch({ type:"ADD_AMENDMENT", payload:{ id:Date.now(), ...form, amount:parseFloat(form.amount) }});
    setForm({ date:"", code:"", amount:"", reason:"" });
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Budget Amendments</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Increase or decrease an appropriation mid-year. Use negative amounts to reduce.</div>
      </div>
      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Amendment recorded</div>}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} /></Field>
          <Field label="Amount ($) — negative to reduce" required>
            <input type="number" step="0.01" placeholder="e.g. 25000 or -10000" value={form.amount} onChange={e=>set("amount",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Account Code" required>
            <select value={form.code} onChange={e=>set("code",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
              <option value="">Select account code…</option>
              {EXPENDITURE_CODES.filter(c=>c.budgeted>0).map(c=>(
                <option key={c.code} value={c.code}>{c.code} — {c.description} ({fmt(c.budgeted)})</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom:20 }}>
          <Field label="Reason / Board Resolution">
            <textarea rows={3} placeholder="Board resolution number, reason for amendment…" value={form.reason} onChange={e=>set("reason",e.target.value)} style={{ ...inp, resize:"vertical" }} />
          </Field>
        </div>
        <button onClick={handleSubmit} style={btn.primary}>Record Amendment</button>
      </div>

      <SectionCard title="Amendment History" subtitle={`${db.amendments.length} amendment${db.amendments.length!==1?"s":""} recorded`}>
        <Table
          headers={[{ label:"Date" },{ label:"Account Code" },{ label:"Description" },{ label:"Amount", right:true },{ label:"Reason" }]}
          rows={db.amendments.map(a=>{
            const code = EXPENDITURE_CODES.find(c=>c.code===a.code);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{a.date}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600 }}>{a.code}</span>,
              code?.description||"—",
              <span style={{ fontFamily:"monospace", fontWeight:700, color:a.amount>=0?"#1a6b35":"#c0392b" }}>{a.amount>=0?"+":""}{fmtSm(a.amount)}</span>,
              <span style={{ color:"#666", fontSize:12 }}>{a.reason||"—"}</span>,
            ];
          })}
          emptyMessage="No amendments recorded yet"
        />
      </SectionCard>
    </div>
  );
}

// ── Manage Funds ──────────────────────────────────────────────────────────────
function ManageFundsFA({ db, dispatch }) {
  const [newFund, setNewFund] = useState("");
  const customFunds = db.customFunds||[];

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
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Custom fund names appear in the funding source dropdown across Projects and expenditures</div>
      </div>

      <SectionCard title="Default Fund" subtitle="Always available">
        <div style={{ padding:"14px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#1a1a1a", fontWeight:600 }}>
            <Icon name="circle-filled" size={10} color="#1a3a5c" />
            Roads Fund
            <span style={{ fontSize:11, background:"#e8f0fb", color:"#1a4a8a", padding:"2px 8px", borderRadius:4, fontWeight:600, marginLeft:4 }}>Default</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Custom Funds" subtitle={`${customFunds.length} added`}>
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
            <button onClick={addFund} style={btn.primary}>Add Fund</button>
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:8 }}>Press Enter or click Add. These appear in the funding source dropdown on Projects and expenditures.</div>
        </div>
        {customFunds.length===0?(
          <div style={{ padding:"24px 18px", textAlign:"center", color:"#aaa", fontSize:13 }}>No custom funds yet</div>
        ):(
          <div style={{ padding:"8px 18px" }}>
            {customFunds.map((f,i)=>(
              <div key={i} style={{ padding:"8px 0", borderBottom:"1px solid #f0f0ee", fontSize:13, color:"#1a1a1a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Icon name="circle-filled" size={8} color="#5a1a8a" />
                  {f}
                </div>
                <button onClick={()=>dispatch({ type:"REMOVE_CUSTOM_FUND", payload:f })} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"3px 8px" }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Revenue list ──────────────────────────────────────────────────────────────
// Revenue runs through the Treasurer, not the claim cycle:
//
//   entered → with Treasurer → receipted    (the receipt makes it official)
//                            ↘ returned → corrected → resubmitted
//
// Freely editable until receipted. After that, changes are recorded as
// adjustments, because the Treasurer holds a matching record.
const REV_TONE = {
  entered:   { bg:"#f4f4f2", color:"#666",    border:"#ddd",    label:"Entered" },
  submitted: { bg:"#fef3cd", color:"#7a4f00", border:"#f0d080", label:"With Treasurer" },
  receipted: { bg:"#e6f4ec", color:"#1a5a3a", border:"#a8d5b5", label:"Receipted" },
  returned:  { bg:"#fdecea", color:"#8c1b18", border:"#f5c6c6", label:"Returned" },
};

function RevStatus({ status }) {
  const t = REV_TONE[status] || REV_TONE.entered;
  return (
    <span style={{ background:t.bg, color:t.color, border:`1px solid ${t.border}`, borderRadius:99, padding:"2px 9px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {t.label}
    </span>
  );
}

function RevenueList({ db, dispatch, onNew }) {
  const [editing, setEditing]   = useState(null);
  const [filter, setFilter]     = useState("all");
  const [receipting, setReceipting] = useState(null);
  const [returning, setReturning]   = useState(null);
  const [receiptForm, setReceiptForm] = useState({ receiptNumber:"", receiptDate:"" });
  const [returnReason, setReturnReason] = useState("");

  const revenue = db.revenue || [];
  const today   = toDateStr(new Date());

  if (editing) {
    const rec = revenue.find(r => r.id === editing);
    return <RevenueForm db={db} dispatch={dispatch} initialData={rec} onDone={()=>setEditing(null)} />;
  }

  const filtered = revenue
    .filter(r => filter === "all" || r.status === filter)
    .sort((a,b) => (b.date||"").localeCompare(a.date||""));

  const byStatus = (s) => revenue.filter(r => r.status === s).length;
  const total    = (s) => revenue.filter(r => !s || r.status === s).reduce((t,r)=>t+(r.totalAmount||r.amount||0),0);

  const submit = (r) =>
    dispatch({ type:"SUBMIT_REVENUE", payload:{ id:r.id, date:today } });

  const doReceipt = () => {
    if (!receipting || !receiptForm.receiptNumber) return;
    dispatch({ type:"RECEIPT_REVENUE", payload:{
      id: receipting.id,
      receiptNumber: receiptForm.receiptNumber,
      receiptDate: receiptForm.receiptDate || today,
    }});
    setReceipting(null); setReceiptForm({ receiptNumber:"", receiptDate:"" });
  };

  const doReturn = () => {
    if (!returning) return;
    dispatch({ type:"RETURN_REVENUE", payload:{ id:returning.id, reason:returnReason } });
    setReturning(null); setReturnReason("");
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Revenue</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>
            Entered here, sent to the Treasurer, official once receipted. No claim cycle.
          </div>
        </div>
        <button onClick={onNew} style={{ ...btn.primary, background:"#1a6b35" }}>+ New Revenue</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
        <KPICard label="Entered"        value={byStatus("entered")}   sub="Not yet sent"        accent="#888"    icon="pencil" />
        <KPICard label="With Treasurer" value={byStatus("submitted")} sub="Awaiting receipt"    accent="#d97706" icon="send" />
        <KPICard label="Returned"       value={byStatus("returned")}  sub="Need adjustment"     accent={byStatus("returned")?"#c0392b":"#888"} icon="arrow-back-up" />
        <KPICard label="Receipted"      value={fmt(total("receipted"))} sub={`${byStatus("receipted")} official`} accent="#1a5a3a" icon="check" />
      </div>

      {byStatus("returned") > 0 && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#8c1b18" }}>
          <strong>{byStatus("returned")} returned by the Treasurer</strong> — correct and resubmit.
        </div>
      )}

      {/* Receipt entry */}
      {receipting && (
        <div style={{ background:"#f0f8f4", border:"2px solid #a8d5b5", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Record the Treasurer's Receipt</div>
          <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>
            {receipting.sourceName || receipting.source} · {fmtSm(receipting.totalAmount||0)} · {receipting.date}
            {" "}— once receipted this is officially recorded and further changes are logged as adjustments.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto auto", gap:12, alignItems:"end" }}>
            <Field label="Receipt Number" required>
              <input type="text" autoFocus value={receiptForm.receiptNumber} onChange={e=>setReceiptForm(f=>({...f,receiptNumber:e.target.value}))} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
            </Field>
            <Field label="Receipt Date">
              <input type="date" value={receiptForm.receiptDate} onChange={e=>setReceiptForm(f=>({...f,receiptDate:e.target.value}))} style={{ ...inp, margin:0 }} placeholder={today} />
            </Field>
            <button onClick={doReceipt} disabled={!receiptForm.receiptNumber} style={{ ...btn.primary, background:"#1a6b35", opacity:receiptForm.receiptNumber?1:0.4 }}>Record Receipt</button>
            <button onClick={()=>{setReceipting(null); setReceiptForm({receiptNumber:"",receiptDate:""});}} style={btn.ghost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Return entry */}
      {returning && (
        <div style={{ background:"#fdecea", border:"2px solid #f5c6c6", borderRadius:8, padding:18, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Returned by the Treasurer</div>
          <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>
            {returning.sourceName || returning.source} · {fmtSm(returning.totalAmount||0)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:12, alignItems:"end" }}>
            <Field label="What needs correcting?">
              <input type="text" autoFocus value={returnReason} onChange={e=>setReturnReason(e.target.value)} style={{ ...inp, margin:0 }} placeholder="Wrong code, amount doesn't match the deposit…" />
            </Field>
            <button onClick={doReturn} style={{ ...btn.primary, background:"#c0392b" }}>Mark Returned</button>
            <button onClick={()=>{setReturning(null); setReturnReason("");}} style={btn.ghost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", border:"1px solid #ddd", borderRadius:6, overflow:"hidden", marginBottom:16, width:"fit-content" }}>
        {[["all","All"],["entered","Entered"],["submitted","With Treasurer"],["returned","Returned"],["receipted","Receipted"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{ padding:"6px 13px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:filter===v?"#1a5a3a":"#fff", color:filter===v?"#fff":"#555" }}>{l}</button>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Date","Source","Reference","Codes","Amount","Status","Receipt #",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:h==="Amount"?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {revenue.length===0 ? "No revenue recorded yet." : "Nothing matches this filter."}
              </td></tr>
            )}
            {filtered.map((r,i)=>{
              const locked = r.status === "receipted";
              return (
                <tr key={r.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12 }}>{r.date}</td>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>
                    {r.sourceName||r.source||"—"}
                    {r.status==="returned" && r.returnedReason && (
                      <div style={{ fontSize:11, color:"#c0392b", fontWeight:400, marginTop:2 }}>{r.returnedReason}</div>
                    )}
                    {(r.adjustments||[]).length > 0 && (
                      <div style={{ fontSize:10, color:"#888", fontWeight:400, marginTop:2 }}>{r.adjustments.length} adjustment{r.adjustments.length!==1?"s":""} after receipting</div>
                    )}
                  </td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{r.reference||"—"}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:11, color:"#666" }}>
                    {(r.lines||[]).map(l=>l.code).filter(Boolean).join(", ")||"—"}
                  </td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#1a6b35" }}>{fmtSm(r.totalAmount||r.amount||0)}</td>
                  <td style={{ padding:"10px 14px" }}><RevStatus status={r.status} /></td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>
                    {r.receiptNumber||"—"}
                    {r.receiptDate && <div style={{ fontSize:10, color:"#aaa" }}>{r.receiptDate}</div>}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:4, justifyContent:"flex-end", flexWrap:"wrap" }}>
                      {!locked && (
                        <button onClick={()=>setEditing(r.id)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Edit</button>
                      )}
                      {(r.status==="entered" || r.status==="returned") && (
                        <button onClick={()=>submit(r)} style={{ ...btn.small, background:"#d97706", fontSize:10, padding:"4px 10px" }}>
                          {r.status==="returned" ? "Resubmit" : "To Treasurer"}
                        </button>
                      )}
                      {r.status==="submitted" && (
                        <>
                          <button onClick={()=>{setReceipting(r); setReceiptForm({receiptNumber:"",receiptDate:today});}} style={{ ...btn.small, background:"#1a6b35", fontSize:10, padding:"4px 10px" }}>Receipt</button>
                          <button onClick={()=>{setReturning(r); setReturnReason("");}} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"4px 10px" }}>Returned</button>
                        </>
                      )}
                      {locked && <span style={{ fontSize:10, color:"#aaa", padding:"4px 6px" }}>locked</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                <td colSpan={4} style={{ padding:"10px 14px", fontWeight:700, textAlign:"right" }}>
                  {filter==="all" ? "All revenue" : REV_TONE[filter]?.label}
                </td>
                <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14, color:"#1a6b35" }}>
                  {fmt(filtered.reduce((t,r)=>t+(r.totalAmount||r.amount||0),0))}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div style={{ fontSize:11, color:"#888", marginTop:10, lineHeight:1.6 }}>
        Revenue can be edited freely until the Treasurer receipts it. After that it locks —
        corrections are recorded as adjustments, since the Treasurer holds a matching record.
      </div>
    </div>
  );
}
