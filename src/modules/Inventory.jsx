import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, StatusBadge, SearchSelect, inp, btn, fmt, fmtSm, DateField, titleCase } from "../components/shared.jsx";
import { locationLabel, locationFor } from "../data/schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const UNITS = ["EA","TON","CY","YD","LF","FT","LB","OZ","GAL","QT","SF","BAG","BX","CS","RL","SET","PR","KIT","BLOCK","OTH"];

// A <select> whose value matches none of its options silently displays the
// FIRST option instead. That is how every item in the catalog came to read TON:
// the data said EACH, the list offered EA, nothing matched, and the browser
// showed the top of the list as though it were the truth.
//
// So no select of a stored code is ever built from a fixed list alone — the
// value actually held is always included. A wrong-looking option is a question;
// a confidently wrong one is a lie.
const withCurrent = (options, current) =>
  current && !options.includes(current) ? [current, ...options] : options;

const HAUL_TYPES = [
  { value:"county_pickup",       label:"County Pickup" },
  { value:"contractor_delivery", label:"Contractor Delivery" },
];

const DEST_TYPES = [
  { value:"wanda_stockpile",         label:"Wanda Stockpile" },
  { value:"adams_central_stockpile", label:"Adams Central Stockpile" },
  { value:"road_segment",            label:"Road Segment (direct)" },
];

// ── FIFO Helpers ──────────────────────────────────────────────────────────────
// Location is compared as a string because codes arrive as both "7" and 7
// depending on whether they came from the crosswalk or a form.
// Most entries are for today, so date fields open on it rather than blank. A
// blank date input is a small tax paid on every single row.
const today = () => new Date().toISOString().split("T")[0];

function getOnHand(itemId, batches, location = null) {
  return batches
    .filter(b => b.itemId === itemId && b.status === "open"
              && (location === null || String(b.location) === String(location)))
    .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
}

// Where this item is held, and how much at each — the same part sits in several
// sheds, so a single "on hand" figure hides the question people actually ask.
export function onHandByLocation(itemId, batches) {
  const m = new Map();
  for (const b of batches) {
    if (b.itemId !== itemId || b.status !== "open" || !(b.quantityRemaining > 0)) continue;
    const k = String(b.location ?? "");
    m.set(k, (m.get(k) || 0) + b.quantityRemaining);
  }
  return [...m.entries()].map(([location, qty]) => ({ location, qty }))
                         .sort((a,b) => b.qty - a.qty);
}

function getItemValue(itemId, batches) {
  return batches
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s, b) => s + (b.quantityRemaining || 0) * (b.unitCost || 0), 0);
}

function buildFIFOLines(itemId, location, qtyNeeded, batches) {
  const open = batches
    .filter(b => b.itemId === itemId && b.status === "open" && (location === "all" || b.location === location))
    .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));

  let remaining = qtyNeeded;
  const batchLines = [];
  let totalCost = 0;

  for (const batch of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityRemaining || 0);
    if (take <= 0) continue;
    batchLines.push({
      batchId:   batch.id,
      batchRef:  `${batch.receiptDate} — ${batch.vendorName || ""}`,
      itemId:    batch.itemId,
      itemName:  batch.itemName || "",
      quantity:  take,
      unitCost:  batch.unitCost || 0,
      totalCost: take * (batch.unitCost || 0),
    });
    totalCost += take * (batch.unitCost || 0);
    remaining -= take;
  }

  return { batchLines, totalCost, canFulfill: remaining <= 0 };
}

// Always show the numeric commodity group code alongside the name.
function fmtGroup(item) {
  const code  = (item.commodityGroupCode || "").trim();
  const alpha = item.commodityGroup || "—";
  return code ? `${code} — ${alpha}` : alpha;
}

// Build a group list sorted by numeric code (blank codes last, alpha-sorted).
function buildGroupList(items) {
  const map = {};
  items.forEach(i => {
    const name = i.commodityGroup || "Other";
    if (!map[name]) map[name] = { name, code: (i.commodityGroupCode||"").trim() };
  });
  return Object.values(map).sort((a, b) => {
    const na = parseInt(a.code, 10), nb = parseInt(b.code, 10);
    const aNum = !isNaN(na), bNum = !isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.name.localeCompare(b.name);
  });
}

const groupLabel = g => g.code ? `${g.code} — ${g.name}` : g.name;

// Is this item below its reorder point?
function isBelowMinimum(item, batches) {
  if (!item.trackStockLevel) return false;
  const min = parseFloat(item.minimumQuantity) || 0;
  if (min <= 0) return false;
  return getOnHand(item.id, batches) < min;
}

function fmtDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Inventory({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  const tabs = [
    { id:"dashboard",  label:"Dashboard",        icon:"layout-dashboard" },
    { id:"items",      label:"Items",             icon:"package" },
    { id:"receive",    label:"Receive",           icon:"truck-delivery" },
    { id:"scaletix",   label:"Scale Ticket",      icon:"clipboard-text" },
    { id:"issue",      label:"Issue to Project",  icon:"arrow-bar-right" },
    { id:"transfer",   label:"Transfer",          icon:"arrows-exchange" },
    { id:"adjust",     label:"Adjust",            icon:"adjustments-horizontal" },
    { id:"yearend",    label:"Year-End Count",    icon:"printer" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd", flexWrap:"wrap" }}>
        {tabs.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background:"transparent", border:"none", padding:"8px 14px 10px",
            fontWeight: view===v.id ? 700 : 400, fontSize:13, cursor:"pointer",
            color: view===v.id ? "#1a5a3a" : "#666",
            borderBottom: view===v.id ? "2px solid #1a5a3a" : "2px solid transparent",
            marginBottom:-1, display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <Icon name={v.icon} size={13} color={view===v.id?"#1a5a3a":"#888"} />
            {v.label}
          </button>
        ))}
      </div>
      {view==="dashboard" && <InvDashboard  db={db} setView={setView} />}
      {view==="items"     && <ItemList      db={db} dispatch={dispatch} />}
      {view==="receive"   && <ReceiveForm   db={db} dispatch={dispatch} onDone={() => setView("dashboard")} />}
      {view==="scaletix"  && <ScaleTicket   db={db} dispatch={dispatch} onDone={() => setView("dashboard")} />}
      {view==="issue"     && <IssueForm     db={db} dispatch={dispatch} onDone={() => setView("dashboard")} />}
      {view==="transfer"  && <TransferForm  db={db} dispatch={dispatch} onDone={() => setView("dashboard")} />}
      {view==="adjust"    && <AdjustForm    db={db} dispatch={dispatch} onDone={() => setView("dashboard")} />}
      {view==="yearend"   && <YearEndCount  db={db} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function InvDashboard({ db, setView }) {
  const items   = db.inventoryItems    || [];
  const batches = db.inventoryBatches  || [];
  const txs     = db.inventoryTransactions || [];

  const totalValue = useMemo(() =>
    items.reduce((s, i) => s + getItemValue(i.id, batches), 0)
  , [items, batches]);

  const pendingReconcile = batches.filter(b => b.invoiceStatus === "pending_reconciliation").length;

  // Items below their reorder point
  const lowItems = useMemo(() =>
    items
      .filter(i => i.active !== false && isBelowMinimum(i, batches))
      .map(i => ({
        ...i,
        onHand: getOnHand(i.id, batches),
        short:  (parseFloat(i.minimumQuantity)||0) - getOnHand(i.id, batches),
      }))
      .sort((a,b) => b.short - a.short)
  , [items, batches]);

  const trackedCount = items.filter(i => i.trackStockLevel).length;

  // Pending scale tickets awaiting invoice
  const pendingList = useMemo(() =>
    batches
      .filter(b => b.invoiceStatus === "pending_reconciliation")
      .map(b => ({ ...b, tx: txs.find(t => t.batchId === b.id) }))
      .sort((a,b) => (a.receiptDate||"").localeCompare(b.receiptDate||""))
  , [batches, txs]);

  const pendingValue = pendingList.reduce((s,b) => s + (b.quantityRemaining||0)*(b.unitCost||0), 0);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Inventory</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>FIFO costing · stock enters via receipt or scale ticket · issues to projects update cost accounting</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        <KPICard label="Active Items"         value={items.filter(i=>i.active!==false).length}    sub="In catalog"           accent="#1a5a3a" icon="package" />
        <KPICard label="Est. Inventory Value" value={fmt(totalValue)}                              sub="FIFO remaining"       accent="#1a3a5c" icon="building-bank" />
        <KPICard label="Below Minimum"        value={lowItems.length}                              sub={`${trackedCount} tracked`} accent={lowItems.length>0?"#c0392b":"#888"} icon="alert-triangle" />
        <KPICard label="Pending Reconcile"    value={pendingReconcile}                             sub="Scale tickets"        accent={pendingReconcile>0?"#d97706":"#888"} icon="clock" />
      </div>

      {/* ── Below Minimum ── */}
      <SectionCard
        title="Below Minimum"
        subtitle={lowItems.length ? `${lowItems.length} item${lowItems.length!==1?"s":""} need restocking` : "Nothing below its reorder point"}
        style={{ marginBottom:20 }}
      >
        {lowItems.length === 0 ? (
          <div style={{ padding:28, textAlign:"center", color:"#888", fontSize:13 }}>
            {trackedCount === 0
              ? "No items have stock tracking turned on yet. Edit an item and check \"Track stock level\" to start."
              : "✓ All tracked items are at or above their minimum."}
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#f7f7f5" }}>
                {["Part #","Item","Group","On Hand","Minimum","Short By",""].map(h=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:["On Hand","Minimum","Short By"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lowItems.map((item,i)=>(
                <tr key={item.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, background:"#f0f4ff", color:"#1a3a5c", padding:"2px 7px", borderRadius:4 }}>{item.legacyNumber||"—"}</span>
                  </td>
                  <td style={{ padding:"9px 14px", fontWeight:600 }}>{item.name}</td>
                  <td style={{ padding:"9px 14px", fontSize:12, color:"#555" }}>{fmtGroup(item)}</td>
                  <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#c0392b" }}>{item.onHand}</td>
                  <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{item.minimumQuantity}</td>
                  <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#c0392b" }}>−{item.short}</td>
                  <td style={{ padding:"9px 14px", textAlign:"right" }}>
                    <button onClick={()=>setView("receive")} style={{ ...btn.small, fontSize:10, padding:"4px 10px" }}>Receive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* ── Pending Scale Tickets ── */}
      <SectionCard
        title="Pending Scale Tickets"
        subtitle={pendingList.length ? `${pendingList.length} awaiting invoice · ${fmtSm(pendingValue)} estimated` : "All tickets reconciled"}
      >
        {pendingList.length === 0 ? (
          <div style={{ padding:28, textAlign:"center", color:"#888", fontSize:13 }}>
            ✓ No scale tickets are waiting on an invoice.
          </div>
        ) : (
          <>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["Date","Ticket #","Material","Source","Hauler","Delivered To","Qty","Est. Total"].map(h=>(
                    <th key={h} style={{ padding:"8px 14px", textAlign:["Qty","Est. Total"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingList.map((b,i)=>(
                  <tr key={b.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
                    <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(b.receiptDate)}</td>
                    <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:12, color:"#555" }}>{b.tx?.ticketNumber||"—"}</td>
                    <td style={{ padding:"9px 14px", fontWeight:600 }}>{b.itemName||"—"}</td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:"#555" }}>{b.tx?.source||"—"}</td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:"#555" }}>{b.tx?.haulerName||b.vendorName||"—"}</td>
                    <td style={{ padding:"9px 14px", fontSize:12 }}>{b.location||"—"}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace" }}>{b.quantityRemaining} {b.tx?.unitOfMeasure||""}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{fmtSm((b.quantityRemaining||0)*(b.unitCost||0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:"12px 14px", borderTop:"1px solid #eee", textAlign:"right" }}>
              <button onClick={()=>setView("scaletix")} style={{ ...btn.primary, fontSize:12 }}>Go to Reconcile →</button>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ── Item List / Catalog ───────────────────────────────────────────────────────
function ItemList({ db, dispatch }) {
  const [search, setSearch]           = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [editing, setEditing]         = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [detail, setDetail]           = useState(null);

  const items   = db.inventoryItems   || [];
  const batches = db.inventoryBatches || [];
  const locations = db.storageLocations || [];

  // Derive groups from live data, sorted by numeric code
  const groupList = useMemo(() => buildGroupList(items), [items]);

  const [lowOnly, setLowOnly] = useState(false);
  const lowCount = useMemo(() => items.filter(i => isBelowMinimum(i, batches)).length, [items, batches]);

  const filtered = items.filter(i => {
    if (groupFilter !== "all" && i.commodityGroup !== groupFilter) return false;
    if (lowOnly && !isBelowMinimum(i, batches)) return false;
    const q = search.toLowerCase();
    if (q && !`${i.name} ${i.legacyNumber} ${i.commodityGroupCode} ${i.commodityGroup} ${i.description}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (detail) {
    return <ItemDetail item={detail} batches={batches} equipment={db.equipment||[]}
             locations={db.storageLocations||[]} transactions={db.inventoryTransactions||[]}
             onBack={() => setDetail(null)} onEdit={()=>{ setEditing(detail); setDetail(null); }} />;
  }

  if (showForm || editing) {
    return (
      <ItemForm
        item={editing}
        locations={locations}
        groupList={groupList}
        equipment={db.equipment||[]}
        onSave={payload => {
          dispatch({ type: editing ? "UPDATE_INVENTORY_ITEM" : "ADD_INVENTORY_ITEM", payload });
          setEditing(null); setShowForm(false);
        }}
        onCancel={() => { setEditing(null); setShowForm(false); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Item Catalog</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{items.length} items · FIFO cost tracking</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search part #, name, group…" style={{ ...inp, width:230, margin:0 }} />
          <select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} style={{ ...inp, margin:0, maxWidth:200 }}>
            <option value="all">All Groups</option>
            {groupList.map(g => <option key={g.name} value={g.name}>{groupLabel(g)}</option>)}
          </select>
          {lowCount > 0 && (
            <button onClick={()=>setLowOnly(v=>!v)} style={{
              ...btn.small,
              background: lowOnly ? "#c0392b" : "#fff",
              color:      lowOnly ? "#fff"    : "#c0392b",
              border:     "1px solid #c0392b",
              fontSize:12, padding:"8px 12px", whiteSpace:"nowrap",
            }}>
              ⚠ Low Stock ({lowCount})
            </button>
          )}
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ New Item</button>
        </div>
      </div>

      <div style={{ fontSize:12, color:"#888", marginBottom:10 }}>
        Showing {filtered.length} of {items.length} items
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Part #","Item Name","Group","UOM","On Hand","FIFO Value",""].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["On Hand","FIFO Value"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={7} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {items.length===0?"No items yet — click New Item to start.":"No items match your filter."}
              </td></tr>
            )}
            {filtered.map((item, i) => {
              const onHand = getOnHand(item.id, batches);
              const value  = getItemValue(item.id, batches);
              const low    = isBelowMinimum(item, batches);
              return (
                <tr key={item.id}
                  onClick={() => setDetail(item)}
                  style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", opacity:item.active===false?0.45:1, cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f8f4"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafaf8"}
                >
                  {/* Part # — prominent */}
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, background:"#f0f4ff", color:"#1a3a5c", padding:"2px 7px", borderRadius:4 }}>
                      {item.legacyNumber || "—"}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ fontWeight:600, color:"#1a1a1a" }}>{item.name}</div>
                    {item.notes && <div style={{ fontSize:11, color:"#aaa", fontWeight:400, marginTop:1 }}>{item.notes.slice(0,60)}</div>}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#555" }}>{fmtGroup(item)}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12 }}>{item.unitOfMeasure||"—"}</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:low?"#c0392b":onHand===0?"#c0392b":"#1a1a1a" }}>
                    {onHand}
                    {low && (
                      <div style={{ fontSize:10, color:"#c0392b", fontWeight:600, whiteSpace:"nowrap" }}>
                        ⚠ min {item.minimumQuantity}
                      </div>
                    )}
                  </td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace" }}>{value>0?fmtSm(value):"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:4 }} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setEditing(item)} style={{ ...btn.small, background:"#1a3a5c", fontSize:10, padding:"4px 10px" }}>Edit</button>
                      {item.active!==false
                        ? <button onClick={()=>dispatch({ type:"DELETE_INVENTORY_ITEM", payload:item.id })} style={{ ...btn.small, background:"#c0392b", fontSize:10, padding:"4px 10px" }}>Deactivate</button>
                        : <span style={{ fontSize:11, color:"#aaa" }}>Inactive</span>
                      }
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Item Detail ───────────────────────────────────────────────────────────────
function ItemDetail({ item, batches, equipment = [], locations = [], transactions = [], onBack, onEdit }) {
  const onHand = getOnHand(item.id, batches);
  const value  = getItemValue(item.id, batches);
  const low    = isBelowMinimum(item, batches);
  const fitted = (item.fitsEquipment||[]).map(id => equipment.find(e=>e.id===id)).filter(Boolean);
  const openBatches = batches.filter(b => b.itemId === item.id && b.status === "open")
    .sort((a,b) => a.receiptDate.localeCompare(b.receiptDate));

  return (
    <div style={{ maxWidth:800 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onBack} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Back</button>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>{item.name}</div>
          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, background:"#f0f4ff", color:"#1a3a5c", padding:"2px 8px", borderRadius:4 }}>
            {item.legacyNumber || "—"}
          </span>
        </div>
        <button onClick={onEdit} style={{ ...btn.primary, marginLeft:"auto", fontSize:12 }}>Edit Item</button>
      </div>

      {low && (
        <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"12px 18px", marginBottom:16, fontSize:13, color:"#8c1b18", fontWeight:600 }}>
          ⚠ Below minimum — {onHand} on hand, minimum is {item.minimumQuantity} {item.unitOfMeasure}
        </div>
      )}

      {item.dataFlag && (
        <div style={{ background:"#fef8e8", border:"1px solid #f0d080", borderRadius:8, padding:"12px 18px", marginBottom:16, fontSize:13, color:"#7a4f00", lineHeight:1.6 }}>
          <strong>Carried over from the old system with a problem.</strong> {item.dataFlag}
          <div style={{ marginTop:6, fontSize:12, color:"#8a6520" }}>
            No opening balance was created for this item, so its value is not counted anywhere
            until someone confirms what is actually on the shelf.
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <KPICard label="On Hand"    value={`${onHand} ${item.unitOfMeasure||""}`} sub={item.trackStockLevel?`Min: ${item.minimumQuantity||0}`:"FIFO batches"} accent={low?"#c0392b":"#1a5a3a"} icon="package" />
        <KPICard label="FIFO Value" value={fmtSm(value)}                          sub="Open batches"  accent="#1a3a5c" icon="building-bank" />
        <KPICard label="Std Cost"   value={fmtSm(item.standardCost||0)}           sub="Per unit"      accent="#5a1a8a" icon="tag" />
        <KPICard label="Group"      value={fmtGroup(item)}                         sub="Commodity grp" accent="#888"    icon="folder" />
      </div>

      {fitted.length > 0 && (
        <SectionCard title="Fits Equipment" subtitle={`${fitted.length} unit${fitted.length!==1?"s":""}`} style={{ marginBottom:16 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:16 }}>
            {fitted.map(u => (
              <span key={u.id} style={{ background:"#f0f4ff", border:"1px solid #c8d8f0", borderRadius:14, padding:"5px 12px", fontSize:12 }}>
                <strong style={{ fontFamily:"monospace", color:"#1a3a5c" }}>{u.unitNumber}</strong>
                <span style={{ color:"#555", marginLeft:6 }}>{u.year} {u.make} {u.model}</span>
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Item Details" style={{ marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0 }}>
          {[
            ["Part #",       item.legacyNumber||"—"],
            ["Name",         item.name],
            ["Group",        fmtGroup(item)],
            ["GL Account",   item.glAccountCode||"—"],
            ["Location",     locationLabel(locationFor(item.locationCode ?? item.location, locations))
                             || item.location || "—"],
            ["Unit",         item.unitOfMeasure||"—"],
            ["Vendor",       item.primaryVendor||"—"],
            ["Receiving",    (item.receivingMode||"standard").replace(/_/g," ")],
            ["Status",       item.active!==false?"Active":"Inactive"],
            ["Notes",        item.notes||"—"],
          ].map(([label, val]) => (
            <div key={label} style={{ padding:"10px 16px", borderBottom:"1px solid #f0f0ee" }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#aaa", marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:13, color:"#1a1a1a" }}>{val}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {openBatches.length > 0 && (
        <SectionCard title="Open FIFO Batches" subtitle="Oldest depleted first">
          <Table
            headers={[{ label:"Receipt Date" },{ label:"Ref" },{ label:"Location" },{ label:"Qty Remaining" },{ label:"Unit Cost" },{ label:"Batch Value" }]}
            rows={openBatches.map(b => [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(b.receiptDate)}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{b.receiptRef||"—"}</span>,
              b.location||"—",
              <span style={{ fontFamily:"monospace", fontWeight:700 }}>{b.quantityRemaining}</span>,
              <span style={{ fontFamily:"monospace", color:b.invoiceStatus==="pending_reconciliation"?"#d97706":"#1a1a1a" }}>{fmtSm(b.unitCost||0)}{b.invoiceStatus==="pending_reconciliation"?" ⏳":""}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:600 }}>{fmtSm((b.quantityRemaining||0)*(b.unitCost||0))}</span>,
            ])}
            emptyMessage="No open batches"
          />
        </SectionCard>
      )}

      {(() => {
        const spread = onHandByLocation(item.id, batches);
        if (spread.length < 2) return null;
        return (
          <SectionCard title="Held At" subtitle={`${spread.length} locations`}>
            <Table
              headers={[{label:"Location"},{label:"On Hand"},{label:"Share"}]}
              rows={spread.map(s => [
                <span>{locationLabel(locationFor(s.location, locations)) || s.location || "—"}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:700 }}>{s.qty} {item.unitOfMeasure||""}</span>,
                <span style={{ fontFamily:"monospace", color:"#888" }}>
                  {`${Math.round((s.qty / spread.reduce((t,x)=>t+x.qty,0)) * 100)}%`}
                </span>,
              ])}
            />
          </SectionCard>
        );
      })()}

      <ItemHistory item={item} transactions={transactions} locations={locations} equipment={equipment} />
    </div>
  );
}

// ── Item History ──────────────────────────────────────────────────────────────
//
// Every movement of this part, newest first. The transactions were always
// recorded — they were just never shown anywhere, so from the parts room it
// looked as though transfers and work order usage vanished on completion.
//
// One line per movement: what happened, how much, and the other party — the
// vendor it came from or the machine it went to.
const TX_STYLE = {
  receive:      { label:"Received",  sign:+1, color:"#1a5a3a", bg:"#e6f4ec" },
  crosswalk:    { label:"Opening",   sign:+1, color:"#555",    bg:"#f0f0ee" },
  scale_ticket: { label:"Scale Ticket", sign:+1, color:"#1a5a3a", bg:"#e6f4ec" },
  issue:        { label:"Issued",    sign:-1, color:"#c0392b", bg:"#fdecea" },
  transfer:     { label:"Transfer",  sign: 0, color:"#1a3a5c", bg:"#eef2f8" },
  adjustment:   { label:"Adjustment",sign: 0, color:"#7a4f00", bg:"#fef8e8" },
};

function ItemHistory({ item, transactions = [], locations = [], equipment = [] }) {
  const [limit, setLimit] = useState(25);

  const rows = useMemo(() =>
    transactions
      .filter(t => t.itemId === item.id)
      .slice()
      .sort((a,b) => String(b.date).localeCompare(String(a.date))
                  || String(b.createdAt||"").localeCompare(String(a.createdAt||""))),
  [transactions, item.id]);

  // Who or what the movement involved — the vendor in, the machine or job out.
  const counterparty = (t) => {
    if (t.equipmentId) {
      const u = equipment.find(e => e.id === t.equipmentId);
      return u ? `Unit ${u.unitNumber}` : (t.unitNumber ? `Unit ${t.unitNumber}` : "—");
    }
    if (t.unitNumber)   return `Unit ${t.unitNumber}`;
    if (t.workOrderNumber) return t.workOrderNumber;
    if (t.projectNumber)   return t.projectNumber;
    if (t.vendorName)   return t.vendorName;
    if (t.type === "transfer") {
      const f = locationLabel(locationFor(t.fromLocation, locations)) || t.fromLocation || "?";
      const to = locationLabel(locationFor(t.toLocation, locations)) || t.toLocation || "?";
      return `${f} → ${to}`;
    }
    return "—";
  };

  return (
    <SectionCard
      title="History"
      subtitle={rows.length ? `${rows.length} movement${rows.length===1?"":"s"}, newest first` : "Nothing recorded yet"}
    >
      <Table
        headers={[{label:"Date"},{label:"What"},{label:"Qty"},{label:"Vendor / Unit"},{label:"Location"},{label:"Value"}]}
        rows={rows.slice(0, limit).map(t => {
          const st = TX_STYLE[t.type] || { label:t.type, sign:0, color:"#555", bg:"#f0f0ee" };
          const qty = Number(t.quantity) || 0;
          return [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(t.date)}</span>,
            <span style={{ background:st.bg, color:st.color, border:`1px solid ${st.color}22`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{st.label}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:700, color:st.sign<0?"#c0392b":st.sign>0?"#1a5a3a":"#555" }}>
              {st.sign<0 ? "−" : st.sign>0 ? "+" : ""}{Math.abs(qty)} {t.unitOfMeasure||item.unitOfMeasure||""}
            </span>,
            <span style={{ fontSize:12 }}>{counterparty(t)}</span>,
            <span style={{ fontSize:12, color:"#888" }}>
              {locationLabel(locationFor(t.location, locations)) || t.location || "—"}
            </span>,
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{t.totalCost ? fmtSm(t.totalCost) : "—"}</span>,
          ];
        })}
        emptyMessage="No movements recorded for this item"
      />
      {rows.length > limit && (
        <div style={{ padding:"10px 14px", textAlign:"center", borderTop:"1px solid #f0f0ee" }}>
          <button onClick={()=>setLimit(l=>l+50)} style={{ ...btn.ghost, fontSize:12, padding:"5px 14px" }}>
            Show more — {rows.length - limit} older
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ── Item Form (New / Edit) ────────────────────────────────────────────────────
function ItemForm({ item, locations, groupList, equipment, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:                 item?.id                 || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    legacyNumber:       item?.legacyNumber       || "",
    name:               item?.name               || "",
    description:        item?.description        || "",
    commodityGroup:     item?.commodityGroup     || "",
    commodityGroupCode: item?.commodityGroupCode || "",
    glAccountCode:      item?.glAccountCode      || "",
    unitOfMeasure:      item?.unitOfMeasure      || "EA",
    location:           item?.location           || "",
    shelfLocation:      item?.shelfLocation      || "",
    standardCost:       item?.standardCost       || 0,
    primaryVendor:      item?.primaryVendor      || "",
    receivingMode:      item?.receivingMode      || "standard",
    trackStockLevel:    item?.trackStockLevel    || false,
    minimumQuantity:    item?.minimumQuantity    || "",
    fitsEquipment:      item?.fitsEquipment      || [],
    active:             item?.active !== false,
    notes:              item?.notes              || "",
    createdAt:          item?.createdAt          || new Date().toISOString(),
  });
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));
  const [newGroup, setNewGroup]         = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [equipSearch, setEquipSearch]   = useState("");

  const isNewGroup     = form.commodityGroup === "__new__";
  const effectiveGroup = isNewGroup ? newGroup : form.commodityGroup;
  const effectiveCode  = isNewGroup
    ? newGroupCode
    : (groupList.find(g=>g.name===form.commodityGroup)?.code || "");

  const toggleEquip = (id) =>
    setForm(f => ({
      ...f,
      fitsEquipment: f.fitsEquipment.includes(id)
        ? f.fitsEquipment.filter(x=>x!==id)
        : [...f.fitsEquipment, id],
    }));

  const filteredEquip = (equipment||[]).filter(u => {
    if (!equipSearch) return true;
    const q = equipSearch.toLowerCase();
    return `${u.unitNumber} ${u.year} ${u.make} ${u.model}`.toLowerCase().includes(q);
  });

  const handleSave = () => {
    onSave({
      ...form,
      commodityGroup:     effectiveGroup,
      commodityGroupCode: effectiveCode,
      location:           effectiveGroup || form.location,
      minimumQuantity:    form.trackStockLevel ? (parseFloat(form.minimumQuantity)||0) : "",
    });
  };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700 }}>{item?"Edit Item":"New Inventory Item"}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        {/* Part # + Name */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:16, marginBottom:16 }}>
          <Field label="Part # (Inv #)">
            <input type="text" value={form.legacyNumber} onChange={e=>set("legacyNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontWeight:700 }} placeholder="#1 (MS260-16)…" />
          </Field>
          <Field label="Item Name" required>
            <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} placeholder="Description…" />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Notes / Serial #">
            <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} placeholder="S/N, memo…" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Commodity Group (= Location)">
            <select value={form.commodityGroup} onChange={e=>set("commodityGroup",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {groupList.map(g=><option key={g.name} value={g.name}>{groupLabel(g)}</option>)}
              <option value="__new__">+ New group…</option>
            </select>
            {isNewGroup && (
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                <input type="text" value={newGroupCode} onChange={e=>setNewGroupCode(e.target.value)} style={{ ...inp, width:70, fontFamily:"monospace" }} placeholder="Code" />
                <input type="text" value={newGroup} onChange={e=>setNewGroup(e.target.value)} style={inp} placeholder="New group name…" />
              </div>
            )}
          </Field>
          <Field label="Unit of Measure" required>
            <select value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={inp}>
              {withCurrent(UNITS, form.unitOfMeasure).map(u=><option key={u} value={u}>{titleCase(u)}</option>)}
            </select>
          </Field>
          <Field label="GL Account Code">
            <input type="text" value={form.glAccountCode} onChange={e=>set("glAccountCode",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="511.02…" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Standard Cost ($/unit)">
            <input type="number" min="0" step="0.01" value={form.standardCost} onChange={e=>set("standardCost",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Primary Vendor">
            <input type="text" value={form.primaryVendor} onChange={e=>set("primaryVendor",e.target.value)} style={inp} />
          </Field>
          <Field label="Receiving Mode">
            <select value={form.receivingMode} onChange={e=>set("receivingMode",e.target.value)} style={inp}>
              <option value="standard">Standard (invoice)</option>
              <option value="scale_ticket_complex">Scale Ticket — Complex (Gravel)</option>
              <option value="scale_ticket_simple">Scale Ticket — Simple (Asphalt / Cold Patch)</option>
            </select>
          </Field>
        </div>

        {/* ── Low stock tracking ── */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:16, marginTop:4 }}>
          <label style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", marginBottom:form.trackStockLevel?14:0 }}>
            <input type="checkbox" checked={form.trackStockLevel} onChange={e=>set("trackStockLevel",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
            <span style={{ fontSize:13, fontWeight:600, color:"#1a1a1a" }}>Track stock level for this item</span>
            <span style={{ fontSize:12, color:"#888" }}>— flag it when it runs low</span>
          </label>
          {form.trackStockLevel && (
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16, alignItems:"end" }}>
              <Field label={`Minimum Quantity (${form.unitOfMeasure})`}>
                <input type="number" min="0" step="any" value={form.minimumQuantity}
                  onChange={e=>set("minimumQuantity",e.target.value)}
                  style={{ ...inp, fontFamily:"monospace" }} placeholder="e.g. 4" />
              </Field>
              <div style={{ fontSize:12, color:"#888", paddingBottom:10 }}>
                Item appears on the Low Stock list when on-hand drops below this.
              </div>
            </div>
          )}
        </div>

        {/* ── Equipment compatibility ── */}
        <div style={{ borderTop:"1px solid #eee", paddingTop:16, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#1a1a1a", marginBottom:3 }}>Fits Equipment</div>
          <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>
            Tag every unit this part fits. It will show up under that unit's Parts tab in the Equipment module.
          </div>

          {form.fitsEquipment.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {form.fitsEquipment.map(id => {
                const u = (equipment||[]).find(e=>e.id===id);
                return (
                  <span key={id} onClick={()=>toggleEquip(id)} style={{
                    background:"#e6f4ec", border:"1px solid #a8d5b5", color:"#1a5a3a",
                    borderRadius:14, padding:"4px 11px", fontSize:12, fontWeight:600, cursor:"pointer",
                  }}>
                    {u ? `${u.unitNumber} — ${u.year} ${u.make} ${u.model}`.trim() : id} ×
                  </span>
                );
              })}
            </div>
          )}

          {(equipment||[]).length === 0 ? (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>
              No equipment units in the system yet — add units in the Equipment module first.
            </div>
          ) : (
            <>
              <input type="text" value={equipSearch} onChange={e=>setEquipSearch(e.target.value)}
                style={{ ...inp, marginBottom:8 }} placeholder="Search units by number, make, or model…" />
              <div style={{ maxHeight:180, overflowY:"auto", border:"1px solid #eee", borderRadius:6 }}>
                {filteredEquip.map((u,i) => {
                  const checked = form.fitsEquipment.includes(u.id);
                  return (
                    <label key={u.id} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"7px 12px", cursor:"pointer",
                      background: checked ? "#f0f8f4" : i%2===0 ? "#fff" : "#fafaf8",
                      borderBottom:"1px solid #f4f4f2",
                    }}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleEquip(u.id)} style={{ cursor:"pointer" }} />
                      <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#1a3a5c", minWidth:44 }}>{u.unitNumber||"—"}</span>
                      <span style={{ fontSize:12 }}>{u.year} {u.make} {u.model}</span>
                    </label>
                  );
                })}
                {filteredEquip.length===0 && (
                  <div style={{ padding:16, textAlign:"center", color:"#aaa", fontSize:12 }}>No units match.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>{item?"Save Changes":"Add Item"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Receive Form ──────────────────────────────────────────────────────────────
function ReceiveForm({ db, dispatch, onDone }) {
  const items     = (db.inventoryItems || []).filter(i => i.active !== false && i.receivingMode === "standard");
  const locations = (db.storageLocations || []).filter(l => l.type === "shed");
  const today     = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    date: today(), itemId:"", vendorName:"", invoiceNumber:"",
    quantity:"", unitCost:"", location:"", notes:"",
  });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const selectedItem = items.find(i => i.id === form.itemId);
  const totalCost    = (parseFloat(form.quantity)||0) * (parseFloat(form.unitCost)||0);

  const handleSave = () => {
    if (!form.date||!form.itemId||!form.quantity||!form.unitCost||!form.location) return;
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const batch = {
      id:                batchId,
      itemId:            form.itemId,
      itemName:          selectedItem?.name || "",
      receiptDate:       form.date,
      receiptRef:        form.invoiceNumber,
      location:          form.location,
      quantityReceived:  parseFloat(form.quantity),
      quantityRemaining: parseFloat(form.quantity),
      unitCost:          parseFloat(form.unitCost),
      totalCost,
      vendorName:        form.vendorName,
      invoiceStatus:     "final",
      invoiceRef:        form.invoiceNumber,
      status:            "open",
      notes:             form.notes,
      createdAt:         new Date().toISOString(),
    };
    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:              `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:            "receive",
        date:            form.date,
        itemId:          form.itemId,
        itemName:        selectedItem?.name || "",
        vendorName:      form.vendorName,
        invoiceNumber:   form.invoiceNumber,
        quantity:        parseFloat(form.quantity),
        unitCost:        parseFloat(form.unitCost),
        totalCost,
        location:        form.location,
        referenceNumber: form.invoiceNumber,
        batch,
        notes:           form.notes,
        createdAt:       new Date().toISOString(),
      },
    });
    setSaved(true);
    setForm({ date: today(), itemId:"", vendorName:"", invoiceNumber:"", quantity:"", unitCost:"", location:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Receive Stock</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Standard invoice-based receipt — creates a FIFO batch at the selected shed location</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Stock received and batch created</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <DateField value={form.date} onChange={v => set("date", v)} />
          </Field>
          <Field label="Vendor">
            <input type="text" value={form.vendorName} onChange={e=>set("vendorName",e.target.value)} style={inp} placeholder="Vendor name…" />
          </Field>
          <Field label="Invoice #">
            <input type="text" value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Item" required>
            <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
              <option value="">Select item…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.legacyNumber ? `[${i.legacyNumber}] ` : ""}{i.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label={`Qty (${selectedItem?.unitOfMeasure||"unit"})`} required>
            <input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Unit Cost ($)" required>
            <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>set("unitCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Receive to Shed" required>
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="">Select shed…</option>
              {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Total Cost">
            <div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(totalCost)}</div>
          </Field>
        </div>
        <Field label="Notes">
          <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} placeholder="Optional note…" />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>Receive into Stock</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Scale Ticket ──────────────────────────────────────────────────────────────
function ScaleTicket({ db, dispatch, onDone }) {
  const [mode, setMode] = useState("entry");
  const scaleItems = (db.inventoryItems||[]).filter(i => i.active!==false && (i.receivingMode==="scale_ticket_complex"||i.receivingMode==="scale_ticket_simple"));
  const projects   = (db.projects||[]).filter(p => p.status==="active");
  const townships  = db.townships || [];
  const pendingBatches = (db.inventoryBatches||[]).filter(b => b.invoiceStatus==="pending_reconciliation");

  const EMPTY_FORM = {
    date: today(), itemId:"", vendorName:"", ticketNumber:"",
    source:"", haulerName:"",
    quantity:"", unitOfMeasure:"CY",
    haulType:"county_pickup",
    destinationType:"wanda_stockpile", destinationLocation:"",
    township:"", projectId:"",
    unitRate:"", notes:"",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const selectedItem  = scaleItems.find(i => i.id === form.itemId);
  const isComplex     = selectedItem?.receivingMode === "scale_ticket_complex";
  const isRoadSegment = form.destinationType === "road_segment";
  const totalCost     = (parseFloat(form.quantity)||0) * (parseFloat(form.unitRate)||0);

  const destLocationName = form.destinationType === "wanda_stockpile"
    ? "Wanda Stockpile"
    : form.destinationType === "adams_central_stockpile"
    ? "Adams Central Stockpile"
    : form.destinationLocation;

  const handleSave = () => {
    if (!form.date||!form.itemId||!form.quantity||!form.unitRate) return;
    const txId    = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const qty     = parseFloat(form.quantity);
    const rate    = parseFloat(form.unitRate);

    // Confirmed with staff: ALL gravel enters inventory first, whether it went to
    // a stockpile or straight onto a road. Direct-to-road loads are then issued
    // out to the project immediately. Nothing bypasses inventory — that way every
    // ticket has a batch to reconcile against an invoice.
    const batchLocation = isRoadSegment
      ? (form.destinationLocation || "Direct to Road")
      : destLocationName;

    const batch = {
      id:                batchId,
      itemId:            form.itemId,
      itemName:          selectedItem?.name || "",
      receiptDate:       form.date,
      receiptRef:        form.ticketNumber,
      location:          batchLocation,
      quantityReceived:  qty,
      quantityRemaining: qty,
      unitCost:          rate,
      totalCost,
      vendorName:        form.vendorName,
      invoiceStatus:     "pending_reconciliation",
      invoiceRef:        "",
      status:            "open",
      notes:             form.notes,
      createdAt:         new Date().toISOString(),
    };

    const tx = {
      id:                  txId,
      type:                "scale_ticket",
      mode:                isComplex ? "complex" : "simple",
      date:                form.date,
      itemId:              form.itemId,
      itemName:            selectedItem?.name || "",
      vendorName:          form.vendorName,
      ticketNumber:        form.ticketNumber,
      source:              form.source,
      quantity:            qty,
      unitOfMeasure:       form.unitOfMeasure,
      haulType:            isComplex ? form.haulType : null,
      haulerName:          form.haulerName,
      destinationType:     isComplex ? form.destinationType : "stockpile",
      township:            form.township,
      unitRate:            rate,
      totalCost,
      destinationLocation: destLocationName,
      projectId:           isRoadSegment ? form.projectId : null,
      invoiceStatus:       "pending_reconciliation",
      invoiceRef:          "",
      batchId,
      batch,
      notes:               form.notes,
      createdAt:           new Date().toISOString(),
    };

    dispatch({ type:"ADD_INVENTORY_TRANSACTION", payload: tx });

    // Straight to a road segment — issue it back out against the project so the
    // cost actually lands somewhere. Without this the gravel was recorded as
    // neither stock nor project cost.
    if (isRoadSegment && form.projectId) {
      const project    = projects.find(p => p.id === form.projectId);
      const batchLines = [{
        batchId,
        batchRef:  `${form.date} — ${form.vendorName || form.source || "scale ticket"}`,
        itemId:    form.itemId,
        itemName:  selectedItem?.name || "",
        quantity:  qty,
        unitCost:  rate,
        totalCost,
      }];
      const noteParts = [
        `Scale ticket${form.ticketNumber ? ` ${form.ticketNumber}` : ""}`,
        form.destinationLocation,
        form.notes,
      ].filter(Boolean);

      dispatch({
        type: "ADD_INVENTORY_TRANSACTION",
        payload: {
          id:          `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          type:        "issue",
          date:        form.date,
          itemId:      form.itemId,
          itemName:    selectedItem?.name || "",
          quantity:    qty,
          location:    batchLocation,
          projectId:   form.projectId,
          projectName: project?.name || project?.projectNumber || "",
          batchLines,
          totalCost,
          notes:       noteParts.join(" · "),
          createdAt:   new Date().toISOString(),
        },
      });

      dispatch({
        type: "ADD_PROJECT_ENTRY",
        payload: {
          projectId: form.projectId,
          entryType: "materialEntries",
          entry: {
            id:            `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            date:          form.date,
            itemId:        form.itemId,
            itemName:      selectedItem?.name || "",
            quantity:      qty,
            unitOfMeasure: form.unitOfMeasure,
            batchLines,
            totalCost,
            linkedAssets:  [],
            notes:         noteParts.join(" · "),
            createdAt:     new Date().toISOString(),
          },
        },
      });
    }

    setSaved(true);
    setForm(EMPTY_FORM);
    setTimeout(()=>{ setSaved(false); }, 2000);
  };

  const [reconBatchIds, setReconBatchIds] = useState([]);
  const [reconInvoice,  setReconInvoice]  = useState("");
  const [reconDate,     setReconDate]     = useState(new Date().toISOString().split("T")[0]);

  const toggleReconBatch = (id) =>
    setReconBatchIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const handleReconcile = () => {
    if (!reconBatchIds.length || !reconInvoice) return;
    const today = new Date().toISOString().split("T")[0];
    reconBatchIds.forEach(batchId => {
      const batch = pendingBatches.find(b => b.id === batchId);
      if (!batch) return;
      dispatch({
        type: "ADD_INVENTORY_TRANSACTION",
        payload: {
          id:         `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          type:       "reconcile",
          date:       reconDate || today,
          itemId:     batch.itemId,
          itemName:   batch.itemName,
          batchId,
          newUnitCost: batch.unitCost,
          invoiceRef: reconInvoice,
          notes:      `Invoice reconciliation — ${reconInvoice}`,
          createdAt:  new Date().toISOString(),
        },
      });
    });
    setReconBatchIds([]); setReconInvoice(""); setReconDate(today);
  };

  return (
    <div style={{ maxWidth:780 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Scale Ticket</div>
          <div style={{ fontSize:13, color:"#888", marginTop:2 }}>Gravel (complex) · Asphalt / Cold Patch (simple)</div>
        </div>
        <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
          {[["entry","New Ticket"],["reconcile",`Reconcile (${pendingBatches.length})`]].map(([id,label])=>(
            <button key={id} onClick={()=>setMode(id)} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:mode===id?"#1a5a3a":"#fff", color:mode===id?"#fff":"#555" }}>{label}</button>
          ))}
        </div>
      </div>

      {mode==="entry" && (
        <>
          {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Scale ticket saved — pending invoice reconciliation</div>}
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>

            {/* Row 1: Date / Material / Ticket # */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Date" required>
                <DateField value={form.date} onChange={v => set("date", v)} />
              </Field>
              <Field label="Material" required>
                <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
                  <option value="">Select material…</option>
                  {scaleItems.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </Field>
              <Field label="Ticket #">
                <input type="text" value={form.ticketNumber} onChange={e=>set("ticketNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
            </div>

            {/* Row 2: Source / Vendor (supplier) */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Source (pit / quarry / supplier)">
                <input type="text" value={form.source} onChange={e=>set("source",e.target.value)} style={inp} placeholder="Pit, quarry or supplier…" />
              </Field>
              <Field label="Vendor (invoice will come from)">
                <input type="text" value={form.vendorName} onChange={e=>set("vendorName",e.target.value)} style={inp} placeholder="Company name…" />
              </Field>
            </div>

            {/* Row 3: Haul type / Hauler / Qty / Unit */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Hauled By">
                <select value={form.haulType} onChange={e=>set("haulType",e.target.value)} style={inp}>
                  {HAUL_TYPES.map(h=><option key={h.value} value={h.value}>{titleCase(h.label)}</option>)}
                </select>
              </Field>
              <Field label={form.haulType==="county_pickup" ? "Driver / Equipment" : "Hauler Name"}>
                <input type="text" value={form.haulerName} onChange={e=>set("haulerName",e.target.value)} style={inp}
                  placeholder={form.haulType==="county_pickup" ? "Unit #, operator…" : "Trucking company…"} />
              </Field>
              <Field label="Quantity" required>
                <input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Unit">
                <select value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={inp}>
                  {withCurrent(["CY","TON","LF"], form.unitOfMeasure).map(u=><option key={u} value={u}>{titleCase(u)}</option>)}
                </select>
              </Field>
            </div>

            {/* Row 4: Destination */}
            {isComplex && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                <Field label="Delivered To" required>
                  <select value={form.destinationType} onChange={e=>set("destinationType",e.target.value)} style={inp}>
                    {DEST_TYPES.map(d=><option key={d.value} value={d.value}>{titleCase(d.label)}</option>)}
                  </select>
                </Field>
                {isRoadSegment ? (
                  <Field label="Road / Location Description">
                    <input type="text" value={form.destinationLocation} onChange={e=>set("destinationLocation",e.target.value)} style={inp} placeholder="Road name, segment…" />
                  </Field>
                ) : (
                  <Field label="Stockpile Location">
                    <div style={{ ...inp, background:"#f7f7f5", color:"#555" }}>{destLocationName}</div>
                  </Field>
                )}
              </div>
            )}

            {/* Row 5: Township + Project (road segment only) */}
            {isComplex && isRoadSegment && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                <Field label="Township">
                  <select value={form.township} onChange={e=>set("township",e.target.value)} style={inp}>
                    <option value="">Select township…</option>
                    {townships.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Project">
                  <select value={form.projectId} onChange={e=>set("projectId",e.target.value)} style={inp}>
                    <option value="">Select project…</option>
                    {projects.map(p=><option key={p.id} value={p.id}>{p.name||p.projectNumber}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* Row 6: Rate / Total / Notes */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:16, marginBottom:16 }}>
              <Field label="Unit Rate ($/unit)" required>
                <input type="number" min="0" step="0.0001" value={form.unitRate} onChange={e=>set("unitRate",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="From contract…" />
              </Field>
              <Field label="Total Cost">
                <div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:"#1a3a5c" }}>{fmtSm(totalCost)}</div>
              </Field>
              <Field label="Notes">
                <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
              </Field>
            </div>

            {isRoadSegment && !form.projectId && (
              <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#8c1b18", marginBottom:10 }}>
                ⚠ <strong>No project selected.</strong> This load will enter inventory but won't be costed to anything. Pick a project so the cost lands on the road.
              </div>
            )}

            {isRoadSegment && form.projectId && (
              <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#1a5a3a", marginBottom:10 }}>
                ✓ Enters inventory, then issues straight out to <strong>{projects.find(p=>p.id===form.projectId)?.name || "the project"}</strong> — {fmtSm(totalCost)} of material cost.
              </div>
            )}

            <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#7a4f00" }}>
              ⏳ <strong>Pending reconciliation</strong> — stock enters inventory at the estimated rate. When the invoice arrives, go to the Reconcile tab to lock the final cost. You can reconcile multiple tickets to one invoice at once.
              {isRoadSegment && form.projectId && " If the invoice rate differs, the project cost will be flagged for your review rather than changed automatically."}
            </div>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleSave} style={btn.primary}>Save Scale Ticket</button>
            <button onClick={onDone} style={btn.ghost}>Cancel</button>
          </div>
        </>
      )}

      {mode==="reconcile" && (
        <div>
          <CostReviewQueue db={db} dispatch={dispatch} />
          {pendingBatches.length === 0 ? (
            <div style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:8, padding:32, textAlign:"center", color:"#1a5a3a", fontSize:13 }}>
              ✓ All scale ticket batches have been reconciled.
            </div>
          ) : (
            <>
              {/* Invoice entry */}
              <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Match Invoice to Scale Tickets</div>
                <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Check the tickets covered by this invoice, enter the invoice number, then reconcile all at once.</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                  <Field label="Invoice #" required>
                    <input type="text" value={reconInvoice} onChange={e=>setReconInvoice(e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="Invoice number…" />
                  </Field>
                  <Field label="Invoice Date">
                    <DateField value={reconDate} onChange={v => setReconDate(v)} />
                  </Field>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:12, color:"#888" }}>
                    {reconBatchIds.length === 0 ? "No tickets selected" : `${reconBatchIds.length} ticket${reconBatchIds.length!==1?"s":""} selected`}
                  </div>
                  <button
                    onClick={handleReconcile}
                    disabled={!reconBatchIds.length || !reconInvoice}
                    style={{ ...btn.primary, opacity:(!reconBatchIds.length||!reconInvoice)?0.4:1 }}
                  >
                    Reconcile {reconBatchIds.length > 0 ? `${reconBatchIds.length} Ticket${reconBatchIds.length!==1?"s":""}` : "Selected"}
                  </button>
                </div>
              </div>

              {/* Pending batch checklist */}
              <SectionCard title="Pending Scale Tickets" subtitle={`${pendingBatches.length} awaiting reconciliation — check all that apply to your invoice`}>
                <div style={{ padding:"0 0 8px" }}>
                  <div style={{ display:"flex", gap:10, padding:"10px 16px", borderBottom:"1px solid #eee" }}>
                    <button onClick={()=>setReconBatchIds(pendingBatches.map(b=>b.id))} style={{ ...btn.small, fontSize:11 }}>Select All</button>
                    <button onClick={()=>setReconBatchIds([])} style={{ ...btn.small, background:"#eee", color:"#555", fontSize:11 }}>Clear</button>
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#f7f7f5" }}>
                        {["","Date","Ticket #","Material","Source","Hauler","Destination","Qty","Est. Unit Cost","Est. Total"].map(h=>(
                          <th key={h} style={{ padding:"8px 10px", textAlign:["Qty","Est. Unit Cost","Est. Total"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBatches.map((b, i) => {
                        const checked = reconBatchIds.includes(b.id);
                        // Find originating transaction for source/hauler
                        const origTx = (db.inventoryTransactions||[]).find(t=>t.batchId===b.id);
                        return (
                          <tr key={b.id}
                            onClick={()=>toggleReconBatch(b.id)}
                            style={{ borderTop:"1px solid #eee", background:checked?"#f0f8f4":i%2===0?"#fff":"#fafaf8", cursor:"pointer" }}
                          >
                            <td style={{ padding:"9px 10px 9px 16px" }}>
                              <input type="checkbox" checked={checked} onChange={()=>toggleReconBatch(b.id)} onClick={e=>e.stopPropagation()} />
                            </td>
                            <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:12 }}>{fmtDate(b.receiptDate)}</td>
                            <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:12, color:"#555" }}>{origTx?.ticketNumber||"—"}</td>
                            <td style={{ padding:"9px 10px", fontWeight:600 }}>{b.itemName||"—"}</td>
                            <td style={{ padding:"9px 10px", fontSize:12, color:"#555" }}>{origTx?.source||"—"}</td>
                            <td style={{ padding:"9px 10px", fontSize:12, color:"#555" }}>{origTx?.haulerName||b.vendorName||"—"}</td>
                            <td style={{ padding:"9px 10px", fontSize:12 }}>{b.location||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"right", fontFamily:"monospace" }}>{b.quantityRemaining} {origTx?.unitOfMeasure||""}</td>
                            <td style={{ padding:"9px 10px", textAlign:"right", fontFamily:"monospace", color:"#d97706" }}>{fmtSm(b.unitCost||0)}</td>
                            <td style={{ padding:"9px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{fmtSm((b.quantityRemaining||0)*(b.unitCost||0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:"2px solid #ddd", background:"#f7f7f5" }}>
                        <td colSpan={8} style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, fontSize:12 }}>Total Pending</td>
                        <td colSpan={2} style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>
                          {fmtSm(pendingBatches.reduce((s,b)=>s+(b.quantityRemaining||0)*(b.unitCost||0),0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cost Review Queue ─────────────────────────────────────────────────────────
// When an invoice comes in at a different rate than the contract estimate, any
// project that already consumed that batch is carrying a stale cost. Staff chose
// review-and-approve over silent correction — someone may already have reported
// on that project.
function CostReviewQueue({ db, dispatch }) {
  const flagged = useMemo(() => {
    const out = [];
    (db.projects || []).forEach(p => {
      (p.materialEntries || []).forEach(e => {
        if (e.costReview) out.push({ project: p, entry: e, review: e.costReview });
      });
    });
    return out.sort((a, b) => (a.review.flaggedAt || "").localeCompare(b.review.flaggedAt || ""));
  }, [db.projects]);

  if (!flagged.length) return null;

  const resolve = (projectId, entryId, accept) =>
    dispatch({ type: "RESOLVE_COST_REVIEW", payload: { projectId, entryId, accept } });

  const resolveAll = (accept) =>
    flagged.forEach(f => resolve(f.project.id, f.entry.id, accept));

  return (
    <div style={{ background:"#fff8e1", border:"2px solid #f0d080", borderRadius:8, padding:18, marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"#7a4f00" }}>
            ⚠ {flagged.length} project cost{flagged.length!==1?"s need":" needs"} review
          </div>
          <div style={{ fontSize:12, color:"#7a4f00", marginTop:3, maxWidth:620 }}>
            An invoice came in at a different rate than estimated. These projects already used
            that material, so their recorded cost is now out of date. Nothing has been changed
            — accept the invoiced cost or keep what's there.
          </div>
        </div>
        {flagged.length > 1 && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>resolveAll(true)}  style={{ ...btn.small, background:"#1a5a3a", fontSize:11, whiteSpace:"nowrap" }}>Accept All</button>
            <button onClick={()=>resolveAll(false)} style={{ ...btn.small, background:"#888",    fontSize:11, whiteSpace:"nowrap" }}>Keep All</button>
          </div>
        )}
      </div>

      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginTop:12, background:"#fff", borderRadius:6, overflow:"hidden" }}>
        <thead>
          <tr style={{ background:"#f7f2e0" }}>
            {["Project","Material","Invoice","Rate was","Rate now","Cost was","Cost now","Change",""].map(h=>(
              <th key={h} style={{ padding:"7px 10px", textAlign:["Rate was","Rate now","Cost was","Cost now","Change"].includes(h)?"right":"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", color:"#7a4f00", borderBottom:"1px solid #f0d080" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flagged.map(({ project, entry, review }, i) => {
            const delta = (review.proposedTotal || 0) - (review.currentTotal || 0);
            return (
              <tr key={entry.id} style={{ borderTop:"1px solid #f4ecd8", background:i%2===0?"#fff":"#fffdf6" }}>
                <td style={{ padding:"8px 10px", fontWeight:600 }}>{project.name || project.projectNumber || "—"}</td>
                <td style={{ padding:"8px 10px" }}>{entry.itemName || "—"}</td>
                <td style={{ padding:"8px 10px", fontFamily:"monospace", fontSize:11, color:"#888" }}>{review.invoiceRef || "—"}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{fmtSm(review.oldUnitCost||0)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(review.newUnitCost||0)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", color:"#888" }}>{fmtSm(review.currentTotal||0)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(review.proposedTotal||0)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:delta>0?"#c0392b":delta<0?"#1a6b35":"#888" }}>
                  {delta>0?"+":""}{fmtSm(delta)}
                </td>
                <td style={{ padding:"8px 10px" }}>
                  <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
                    <button onClick={()=>resolve(project.id, entry.id, true)}  style={{ ...btn.small, background:"#1a5a3a", fontSize:10, padding:"4px 9px" }}>Accept</button>
                    <button onClick={()=>resolve(project.id, entry.id, false)} style={{ ...btn.small, background:"#888",    fontSize:10, padding:"4px 9px" }}>Keep</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Issue Form ────────────────────────────────────────────────────────────────
function IssueForm({ db, dispatch, onDone }) {
  const items    = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const batches  = db.inventoryBatches || [];
  const projects = (db.projects||[]).filter(p=>p.status==="active"||p.status==="pending");
  const locations= db.storageLocations || [];

  const [form, setForm] = useState({
    date: today(), itemId:"", location:"all", quantity:"", projectId:"", notes:"",
  });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved]     = useState(false);
  const set = (k,v) => { setForm(f=>({ ...f,[k]:v })); setPreview(null); }

  const selectedItem    = items.find(i=>i.id===form.itemId);
  const availableOnHand = selectedItem ? getOnHand(form.itemId, batches, form.location==="all"?null:form.location) : 0;

  const handlePreview = () => {
    if (!form.itemId||!form.quantity) return;
    setPreview(buildFIFOLines(form.itemId, form.location, parseFloat(form.quantity)||0, batches));
  };

  const handleIssue = () => {
    if (!preview||!form.date||!form.itemId||!form.quantity) return;
    const selectedProject = projects.find(p=>p.id===form.projectId);
    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:        "issue",
        date:        form.date,
        itemId:      form.itemId,
        itemName:    selectedItem?.name||"",
        quantity:    parseFloat(form.quantity),
        location:    form.location,
        projectId:   form.projectId||null,
        projectName: selectedProject?.name||selectedProject?.projectNumber||"",
        batchLines:  preview.batchLines,
        totalCost:   preview.totalCost,
        notes:       form.notes,
        createdAt:   new Date().toISOString(),
      },
    });
    if (form.projectId && selectedProject) {
      dispatch({
        type: "ADD_PROJECT_ENTRY",
        payload: {
          projectId: form.projectId,
          entryType: "materialEntries",
          entry: {
            id:            `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            date:          form.date,
            itemId:        form.itemId,
            itemName:      selectedItem?.name||"",
            quantity:      parseFloat(form.quantity),
            unitOfMeasure: selectedItem?.unitOfMeasure||"",
            batchLines:    preview.batchLines,
            totalCost:     preview.totalCost,
            linkedAssets:  [],
            notes:         form.notes,
            createdAt:     new Date().toISOString(),
          },
        },
      });
    }
    setSaved(true);
    setForm({ date: today(), itemId:"", location:"all", quantity:"", projectId:"", notes:"" });
    setPreview(null);
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Issue to Project</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>FIFO costing — oldest batches consumed first. Creates a material entry on the project.</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Issued and cost entry added to project</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <DateField value={form.date} onChange={v => set("date", v)} />
          </Field>
          <Field label="Project (optional)">
            <select value={form.projectId} onChange={e=>set("projectId",e.target.value)} style={inp}>
              <option value="">No project assignment…</option>
              {projects.map(p=><option key={p.id} value={p.id}>{p.name||p.projectNumber}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Item" required>
            <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
              <option value="">Select item…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.legacyNumber?`[${i.legacyNumber}] `:"" }{i.name} — {getOnHand(i.id,batches)} on hand</option>)}
            </select>
          </Field>
          <Field label="From Location">
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="all">Any (FIFO across all)</option>
              {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
          <Field label={`Qty (on hand: ${availableOnHand})`} required>
            <input type="number" min="0" step="any" value={form.quantity}
              onChange={e=>set("quantity",e.target.value)}
              style={{ ...inp, fontFamily:"monospace", borderColor:parseFloat(form.quantity)>availableOnHand?"#c0392b":"" }} />
          </Field>
        </div>
        <Field label="Notes">
          <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} placeholder="Road segment, structure, etc.…" />
        </Field>

        {form.itemId && form.quantity && !preview && (
          <button onClick={handlePreview} style={{ ...btn.secondary, marginTop:14, fontSize:12 }}>Preview FIFO Cost →</button>
        )}

        {preview && (
          <div style={{ marginTop:14, background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:6, padding:14 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#1a5a3a", marginBottom:10 }}>FIFO Cost Breakdown</div>
            {!preview.canFulfill && (
              <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:4, padding:"8px 12px", marginBottom:10, fontSize:12, color:"#8c1b18", fontWeight:600 }}>
                ⚠️ Insufficient stock — only {availableOnHand} {selectedItem?.unitOfMeasure||"units"} available
              </div>
            )}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#e6f4ec" }}>
                  {["Batch / Vendor","Qty","Unit Cost","Line Total"].map(h=>(
                    <th key={h} style={{ padding:"6px 10px", textAlign:["Qty","Unit Cost","Line Total"].includes(h)?"right":"left", fontWeight:600, color:"#1a5a3a" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.batchLines.map((l,i)=>(
                  <tr key={i} style={{ borderTop:"1px solid #c8e6d5" }}>
                    <td style={{ padding:"6px 10px" }}>{l.batchRef}</td>
                    <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace" }}>{l.quantity}</td>
                    <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace" }}>{fmtSm(l.unitCost)}</td>
                    <td style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:600 }}>{fmtSm(l.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:"2px solid #a8d5b5", background:"#e6f4ec" }}>
                  <td colSpan={3} style={{ padding:"7px 10px", textAlign:"right", fontWeight:700 }}>Total Cost to Project</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:14, color:"#1a5a3a" }}>{fmtSm(preview.totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleIssue} disabled={!preview||!preview.canFulfill||!form.date} style={{ ...btn.primary, opacity:(!preview||!preview.canFulfill||!form.date)?0.4:1 }}>Confirm Issue</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Transfer Form (shed ↔ shed or shed ↔ on-equipment only) ──────────────────
function TransferForm({ db, dispatch, onDone }) {
  const items   = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const batches = db.inventoryBatches||[];
  // Only shed locations for transfers (no stockpiles, no portable tanks)
  const shedLocations = (db.storageLocations||[]).filter(l => l.type === "shed");

  const [form, setForm] = useState({ date: today(), itemId:"", fromLocation:"", toLocation:"", toEquipment:false, equipmentUnit:"", quantity:"", notes:"" });
  const [saved, setSaved] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  // Locations are identified by their CODE, never their name. Stock is held
  // against the code, and a name is a label someone can change or has not
  // supplied yet — matching on it meant every location reported nothing to
  // move, which is what made transfers unusable.
  const availableQty = form.itemId && form.fromLocation ? getOnHand(form.itemId, batches, form.fromLocation) : 0;
  const toLocationName = form.toEquipment ? (form.equipmentUnit ? `On Equipment — ${form.equipmentUnit}` : "On Equipment") : form.toLocation;

  // Only what is actually held at the chosen shed can be moved out of it.
  // Everything else is offered behind a toggle rather than hidden outright, so
  // "we don't stock that here" and "that part doesn't exist" stay tellable apart.
  const stocked = useMemo(() => {
    if (!form.fromLocation) return [];
    return items.filter(i => getOnHand(i.id, batches, form.fromLocation) > 0);
  }, [items, batches, form.fromLocation]);

  const pickable = showEmpty || !form.fromLocation ? items : stocked;

  const handleSave = () => {
    if (!form.date||!form.itemId||!form.fromLocation||!toLocationName||!form.quantity) return;
    const selectedItem = items.find(i=>i.id===form.itemId);
    const sourceBatches = batches
      .filter(b=>b.itemId===form.itemId&&b.location===form.fromLocation&&b.status==="open")
      .sort((a,b)=>a.receiptDate.localeCompare(b.receiptDate));
    const batchId = sourceBatches[0]?.id || null;

    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:           `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:         "transfer",
        date:         form.date,
        itemId:       form.itemId,
        itemName:     selectedItem?.name||"",
        quantity:     parseFloat(form.quantity),
        fromLocation: form.fromLocation,
        toLocation:   toLocationName,
        location:     form.fromLocation,
        batchId,
        notes:        form.notes,
        createdAt:    new Date().toISOString(),
      },
    });
    setSaved(true);
    setForm({ date: today(), itemId:"", fromLocation:"", toLocation:"", toEquipment:false, equipmentUnit:"", quantity:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Transfer Stock</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:6 }}>Move stock between shed locations or to a piece of equipment.</div>
      <div style={{ fontSize:12, color:"#aaa", marginBottom:20 }}>Note: Stockpiles receive stock via Scale Ticket. Portable tank fills use the Tanks workflow in Equipment.</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Transfer recorded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <DateField value={form.date} onChange={v => set("date", v)} />
          </Field>
          <Field label="From Shed" required>
            <select value={form.fromLocation} onChange={e=>{ set("fromLocation",e.target.value); set("itemId",""); }} style={inp}>
              <option value="">Select shed…</option>
              {shedLocations.map(l=><option key={l.id} value={l.code}>{locationLabel(l)}</option>)}
            </select>
          </Field>
        </div>

        {/* To: shed or equipment toggle */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:8 }}>Destination</div>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <button onClick={()=>set("toEquipment",false)} style={{ ...btn.small, background:!form.toEquipment?"#1a5a3a":"#eee", color:!form.toEquipment?"#fff":"#555", fontSize:12 }}>Shed</button>
            <button onClick={()=>set("toEquipment",true)}  style={{ ...btn.small, background:form.toEquipment?"#1a5a3a":"#eee", color:form.toEquipment?"#fff":"#555", fontSize:12 }}>On Equipment</button>
          </div>
          {!form.toEquipment ? (
            <select value={form.toLocation} onChange={e=>set("toLocation",e.target.value)} style={inp}>
              <option value="">Select destination shed…</option>
              {shedLocations.filter(l=>String(l.code)!==String(form.fromLocation)).map(l=><option key={l.id} value={l.code}>{locationLabel(l)}</option>)}
            </select>
          ) : (
            <input type="text" value={form.equipmentUnit} onChange={e=>set("equipmentUnit",e.target.value)} style={inp} placeholder="Unit # or description (e.g. Unit 228 — 2003 140H CAT)…" />
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Item" required>
            <SearchSelect
              items={pickable}
              value={form.itemId}
              onChange={id=>set("itemId",id)}
              placeholder={form.fromLocation ? "Type a part number or name…" : "Choose the shed first…"}
              emptyMessage={form.fromLocation
                ? `Nothing matching is held at ${locationLabel(locationFor(form.fromLocation, db.storageLocations||[])) || form.fromLocation}`
                : "Choose a shed first"}
              getLabel={i=>`${i.legacyNumber?`[${i.legacyNumber}] `:""}${i.name}`}
              getSearch={i=>`${i.legacyNumber} ${i.name} ${i.commodityGroup} ${i.glAccountCode}`}
              isDisabled={i=>getOnHand(i.id,batches,form.fromLocation||null) <= 0}
              renderRow={(i,off)=>{
                const oh = getOnHand(i.id,batches,form.fromLocation||null);
                return (
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                    <span>
                      {i.legacyNumber && <strong style={{ fontFamily:"monospace", color: off?"#bbb":"#1a3a5c" }}>{i.legacyNumber}</strong>}
                      {i.legacyNumber ? "  " : ""}{i.name}
                    </span>
                    <span style={{ fontFamily:"monospace", whiteSpace:"nowrap", color: off?"#ccc":"#1a5a3a" }}>
                      {oh > 0 ? `${oh} ${i.unitOfMeasure||""}` : "none here"}
                    </span>
                  </div>
                );
              }}
            />
            {form.fromLocation && (
              <label style={{ display:"flex", alignItems:"center", gap:6, marginTop:6, fontSize:11, color:"#888" }}>
                <input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)} />
                Show parts not stocked here ({items.length - stocked.length} of {items.length})
              </label>
            )}
          </Field>
          <Field label={`Qty (available: ${availableQty})`} required>
            <input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <Field label="Notes">
          <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>Record Transfer</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Adjust Form ───────────────────────────────────────────────────────────────
function AdjustForm({ db, dispatch, onDone }) {
  const items    = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const locations= db.storageLocations||[];
  const batches  = db.inventoryBatches||[];

  const [form, setForm] = useState({ date: today(), itemId:"", location:"", quantityAdjustment:"", reason:"", notes:"" });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const selectedItem  = items.find(i=>i.id===form.itemId);
  const currentOnHand = form.itemId && form.location ? getOnHand(form.itemId, batches, form.location) : 0;
  const adjustment    = parseFloat(form.quantityAdjustment)||0;
  const newOnHand     = currentOnHand + adjustment;

  const handleSave = () => {
    if (!form.date||!form.itemId||!form.location||form.quantityAdjustment==="") return;
    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:                 `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:               "adjustment",
        date:               form.date,
        itemId:             form.itemId,
        itemName:           selectedItem?.name||"",
        location:           form.location,
        quantityAdjustment: adjustment,
        reason:             form.reason,
        notes:              form.notes,
        createdAt:          new Date().toISOString(),
      },
    });
    setSaved(true);
    setForm({ date: today(), itemId:"", location:"", quantityAdjustment:"", reason:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Quantity Adjustment</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Correct on-hand quantity — use for annual count corrections, damage, or found stock</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Adjustment recorded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <DateField value={form.date} onChange={v => set("date", v)} />
          </Field>
          <Field label="Location" required>
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Item" required>
            <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
              <option value="">Select item…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.legacyNumber?`[${i.legacyNumber}] `:"" }{i.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Adjustment (+ or −)" required>
            <input type="number" step="any" value={form.quantityAdjustment} onChange={e=>set("quantityAdjustment",e.target.value)}
              style={{ ...inp, fontFamily:"monospace", color:adjustment<0?"#c0392b":adjustment>0?"#1a6b35":"#1a1a1a" }}
              placeholder="e.g. -2 or +5" />
          </Field>
          <Field label="Current On Hand">
            <div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace" }}>{currentOnHand}</div>
          </Field>
          <Field label="New On Hand">
            <div style={{ ...inp, background:"#f7f7f5", fontFamily:"monospace", fontWeight:700, color:newOnHand<0?"#c0392b":"#1a1a1a" }}>{newOnHand}</div>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Reason">
            <select value={form.reason} onChange={e=>set("reason",e.target.value)} style={inp}>
              <option value="">Select reason…</option>
              <option value="annual_count">Annual count correction</option>
              <option value="damaged">Damaged / waste</option>
              <option value="returned">Returned to vendor</option>
              <option value="found">Found — not previously recorded</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
          </Field>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>Record Adjustment</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Year-End Count Sheet ──────────────────────────────────────────────────────
function YearEndCount({ db }) {
  const items   = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const batches = db.inventoryBatches||[];
  // Never hardcode the county — it's set in Settings → County Info
  const countyName = db.countyInfo?.countyName || db.countyInfo?.name || "County";

  // Group by commodityGroup, sort groups alpha
  const grouped = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const g = i.commodityGroup || "Other";
      if (!map[g]) map[g] = [];
      map[g].push(i);
    });
    // Sort items within each group by legacyNumber then name
    Object.values(map).forEach(arr => arr.sort((a,b)=>
      (a.legacyNumber||"").localeCompare(b.legacyNumber||"") || (a.name||"").localeCompare(b.name||"")
    ));
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  }, [items]);

  const [selectedGroup, setSelectedGroup] = useState("__all__");
  const [fiscalYear, setFiscalYear]        = useState(() => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  });

  const displayGroups = selectedGroup === "__all__"
    ? grouped
    : grouped.filter(([g]) => g === selectedGroup);

  const totalValue = displayGroups.reduce((tot, [,items]) =>
    tot + items.reduce((s,i) => s + getItemValue(i.id, batches), 0)
  , 0);

  const handlePrint = () => window.print();

  return (
    <div>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-section {
            page-break-before: always;
            break-before: page;
          }
          .print-section:first-of-type {
            page-break-before: avoid;
            break-before: avoid;
          }
          .print-row { page-break-inside: avoid; break-inside: avoid; }
          body { font-size: 11px; margin: 0; }
          @page { margin: 0.75in; }
        }
      `}</style>

      {/* Controls — hidden when printing */}
      <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Year-End Count Sheets</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Print one sheet per group for physical count reconciliation</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <Field label="Fiscal Year">
            <input type="number" value={fiscalYear} onChange={e=>setFiscalYear(parseInt(e.target.value)||fiscalYear)} style={{ ...inp, width:90, margin:0, fontFamily:"monospace" }} />
          </Field>
          <Field label="Group">
            <select value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)} style={{ ...inp, margin:0, maxWidth:220 }}>
              <option value="__all__">All Groups (multi-page)</option>
              {grouped.map(([g])=><option key={g} value={g}>{titleCase(g)}</option>)}
            </select>
          </Field>
          <button onClick={handlePrint} style={{ ...btn.primary, marginTop:20 }}>🖨 Print</button>
        </div>
      </div>

      {/* Summary banner */}
      <div className="no-print" style={{ background:"#f0f8f4", border:"1px solid #a8d5b5", borderRadius:8, padding:"12px 18px", marginBottom:20, display:"flex", gap:32 }}>
        <div><span style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.06em" }}>Groups</span><div style={{ fontSize:20, fontWeight:700 }}>{displayGroups.length}</div></div>
        <div><span style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.06em" }}>Items</span><div style={{ fontSize:20, fontWeight:700 }}>{displayGroups.reduce((s,[,a])=>s+a.length,0)}</div></div>
        <div><span style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.06em" }}>Book Value</span><div style={{ fontSize:20, fontWeight:700 }}>{fmt(totalValue)}</div></div>
      </div>

      {/* Print sections */}
      {displayGroups.map(([group, groupItems], gi) => {
        const grpValue = groupItems.reduce((s,i)=>s+getItemValue(i.id,batches),0);
        return (
          <div key={group} className="print-section" style={{ marginBottom:32 }}>
            {/* Group header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", borderBottom:"2px solid #1a5a3a", paddingBottom:8, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:"#1a5a3a" }}>{group}</div>
                <div style={{ fontSize:12, color:"#888" }}>FY{fiscalYear} Physical Count — {countyName} Highway Department</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:"#888" }}>Count Date: _______________</div>
                <div style={{ fontSize:12, color:"#888", marginTop:4 }}>Book Value: <strong>{fmtSm(grpValue)}</strong></div>
              </div>
            </div>

            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#f7f7f5" }}>
                  {["Part #","Item Name / Description","Unit","Book Qty","Book Value","Count Qty","Difference","Notes"].map(h=>(
                    <th key={h} style={{ padding:"7px 10px", textAlign:["Book Qty","Book Value","Count Qty","Difference"].includes(h)?"right":"left", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", color:"#555", borderBottom:"2px solid #ddd" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item, ii) => {
                  const onHand = getOnHand(item.id, batches);
                  const val    = getItemValue(item.id, batches);
                  return (
                    <tr key={item.id} className="print-row" style={{ borderTop:"1px solid #eee", background:ii%2===0?"#fff":"#fafaf8" }}>
                      <td style={{ padding:"8px 10px", fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#1a3a5c", whiteSpace:"nowrap" }}>{item.legacyNumber||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>
                        <div style={{ fontWeight:600 }}>{item.name}</div>
                        {item.notes && <div style={{ fontSize:10, color:"#aaa" }}>{item.notes.slice(0,80)}</div>}
                      </td>
                      <td style={{ padding:"8px 10px", fontFamily:"monospace", fontSize:11 }}>{item.unitOfMeasure}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{onHand}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontSize:11 }}>{val>0?fmtSm(val):"—"}</td>
                      {/* Count fields — blank for manual entry */}
                      <td style={{ padding:"8px 10px", textAlign:"right", borderLeft:"1px dashed #ccc" }}>
                        <div style={{ borderBottom:"1px solid #999", width:60, display:"inline-block", minHeight:16 }}></div>
                      </td>
                      <td style={{ padding:"8px 10px", textAlign:"right" }}>
                        <div style={{ borderBottom:"1px solid #999", width:60, display:"inline-block", minHeight:16 }}></div>
                      </td>
                      <td style={{ padding:"8px 10px" }}>
                        <div style={{ borderBottom:"1px solid #999", width:100, display:"inline-block", minHeight:16 }}></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:"2px solid #ddd", background:"#f0f8f4" }}>
                  <td colSpan={3} style={{ padding:"8px 10px", fontWeight:700, textAlign:"right" }}>Group Total</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{groupItems.reduce((s,i)=>s+getOnHand(i.id,batches),0)}</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{fmtSm(grpValue)}</td>
                  <td colSpan={3} style={{ padding:"8px 10px", borderLeft:"1px dashed #ccc" }}>
                    <span style={{ fontSize:11, color:"#888" }}>Counted by: ___________________________ Date: ___________</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}
