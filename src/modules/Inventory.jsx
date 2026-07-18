import { useState, useMemo } from "react";
import { Icon, Field, SectionCard, Table, KPICard, StatusBadge, inp, btn, fmt, fmtSm } from "../components/shared.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────
const UNITS = ["TON","CY","LF","EA","LB","GAL","QT","SF","BX","CS","RL","SET","PR","KIT","OTH"];

const COMMODITY_GROUPS = [
  "AGGREGATE","ASPHALT","COLD PATCH","CULVERTS","FILTERS","FLUIDS",
  "HARDWARE","PARTS","SAFETY","SIGNS","SMALL TOOLS","OTHER",
];

const HAUL_TYPES = [
  { value:"county_pickup",        label:"County Pickup" },
  { value:"contractor_delivery",  label:"Contractor Delivery" },
];

const DEST_TYPES = [
  { value:"wanda_stockpile",         label:"Wanda Stockpile" },
  { value:"adams_central_stockpile", label:"Adams Central Stockpile" },
  { value:"road_segment",            label:"Road Segment (direct)" },
];

// ── FIFO Helpers ──────────────────────────────────────────────────────────────
// Total quantity on hand for an item at a specific location (or all locations)
function getOnHand(itemId, batches, location = null) {
  return batches
    .filter(b => b.itemId === itemId && b.status === "open" && (location === null || b.location === location))
    .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
}

// Total inventory value for an item (FIFO remaining batches)
function getItemValue(itemId, batches) {
  return batches
    .filter(b => b.itemId === itemId && b.status === "open")
    .reduce((s, b) => s + (b.quantityRemaining || 0) * (b.unitCost || 0), 0);
}

// Build FIFO batch lines for issuing qty units from a location
// Returns { batchLines, totalCost, canFulfill }
function buildFIFOLines(itemId, location, qtyNeeded, batches) {
  const open = batches
    .filter(b => b.itemId === itemId && b.status === "open" && (location === "all" || b.location === location))
    .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate)); // oldest first

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

function fmtDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// ── Module Shell ──────────────────────────────────────────────────────────────
export default function Inventory({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  const tabs = [
    { id:"dashboard",   label:"Dashboard",         icon:"layout-dashboard" },
    { id:"items",       label:"Items",              icon:"package" },
    { id:"receive",     label:"Receive",            icon:"truck-delivery" },
    { id:"scaletix",    label:"Scale Ticket",       icon:"clipboard-text" },
    { id:"issue",       label:"Issue to Project",   icon:"arrow-bar-right" },
    { id:"transfer",    label:"Transfer",           icon:"arrows-exchange" },
    { id:"adjust",      label:"Adjust",             icon:"adjustments-horizontal" },
    { id:"crosswalk",   label:"Crosswalk",          icon:"database-import" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
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
      {view==="crosswalk" && <CrosswalkForm db={db} dispatch={dispatch} onDone={() => setView("items")} />}
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
  const recentTx = [...txs].sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")).slice(0, 12);

  // Group items by commodity group
  const byGroup = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const g = i.commodityGroup || "OTHER";
      if (!map[g]) map[g] = { count:0, value:0 };
      map[g].count++;
      map[g].value += getItemValue(i.id, batches);
    });
    return Object.entries(map).sort((a,b) => b[1].value - a[1].value);
  }, [items, batches]);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Inventory</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>FIFO costing · stock enters via receipt or crosswalk · issues to projects update cost accounting</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <KPICard label="Active Items"         value={items.filter(i=>i.active!==false).length} sub="In catalog"         accent="#1a5a3a" icon="package" />
        <KPICard label="Est. Inventory Value" value={fmt(totalValue)}                           sub="FIFO remaining"    accent="#1a3a5c" icon="building-bank" />
        <KPICard label="Open Batches"         value={batches.filter(b=>b.status==="open").length} sub="Across all locations" accent="#5a1a8a" icon="stack-2" />
        <KPICard label="Pending Reconcile"    value={pendingReconcile}                          sub="Scale tickets"    accent={pendingReconcile>0?"#d97706":"#888"} icon="clock" />
      </div>

      {pendingReconcile > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:"12px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, color:"#7a4f00", fontWeight:600 }}>
            ⚠️ {pendingReconcile} scale ticket batch{pendingReconcile!==1?"es":""} pending invoice reconciliation
          </div>
          <button onClick={()=>setView("scaletix")} style={{ ...btn.small, background:"#d97706", fontSize:11 }}>Review</button>
        </div>
      )}

      {/* By commodity group */}
      {byGroup.length > 0 && (
        <SectionCard title="Stock by Commodity Group" style={{ marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, padding:16 }}>
            {byGroup.map(([group, data]) => (
              <div key={group} style={{ background:"#fafaf8", border:"1px solid #eee", borderRadius:6, padding:12 }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#888", marginBottom:4 }}>{group}</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", color:"#1a5a3a" }}>{data.count}</div>
                <div style={{ fontSize:11, color:"#aaa" }}>{fmtSm(data.value)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Recent transactions */}
      <SectionCard title="Recent Transactions" subtitle={`${txs.length} total`}>
        <Table
          headers={[{ label:"Date" },{ label:"Type" },{ label:"Item" },{ label:"Qty" },{ label:"Location" },{ label:"Reference" }]}
          rows={recentTx.map(t => [
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(t.date)}</span>,
            <span style={{ background:"#f0f0ee", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600, textTransform:"capitalize" }}>{(t.type||"").replace(/_/g," ")}</span>,
            <span style={{ fontWeight:600 }}>{t.itemName||"—"}</span>,
            <span style={{ fontFamily:"monospace", fontWeight:600, color:t.type==="issue"?"#c0392b":t.type==="receive"||t.type==="crosswalk"?"#1a6b35":"#555" }}>
              {t.type==="issue"?"-":t.type==="receive"||t.type==="crosswalk"?"+":""}{t.quantity||0}
            </span>,
            t.location||"—",
            <span style={{ fontSize:12, color:"#888" }}>{t.referenceNumber||t.invoiceNumber||t.ticketNumber||"—"}</span>,
          ])}
          emptyMessage="No transactions yet — use Receive or Crosswalk to add stock"
        />
      </SectionCard>
    </div>
  );
}

// ── Item List / Catalog ───────────────────────────────────────────────────────
function ItemList({ db, dispatch }) {
  const [search, setSearch]       = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [editing, setEditing]     = useState(null);
  const [showForm, setShowForm]   = useState(false);

  const items   = db.inventoryItems   || [];
  const batches = db.inventoryBatches || [];
  const locations = db.storageLocations || [];

  const filtered = items.filter(i => {
    if (groupFilter !== "all" && i.commodityGroup !== groupFilter) return false;
    if (search && !`${i.name} ${i.legacyNumber} ${i.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (showForm || editing) {
    return (
      <ItemForm
        item={editing}
        locations={locations}
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
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, legacy #…" style={{ ...inp, width:220, margin:0 }} />
          <select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="all">All Groups</option>
            {COMMODITY_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={()=>setShowForm(true)} style={btn.primary}>+ New Item</button>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Inv #","Name","Group","Unit","Location","On Hand","FIFO Value","Actions"].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:["On Hand","FIFO Value"].includes(h)?"right":"left", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:"#666", borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:13 }}>
                {items.length===0?"No items yet — click New Item to start.":"No items match your filter."}
              </td></tr>
            )}
            {filtered.map((item,i) => {
              const onHand = getOnHand(item.id, batches);
              const value  = getItemValue(item.id, batches);
              return (
                <tr key={item.id} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8", opacity:item.active===false?0.45:1 }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#888" }}>{item.legacyNumber||"—"}</td>
                  <td style={{ padding:"10px 14px", fontWeight:600, color:"#1a1a1a" }}>
                    {item.name}
                    {item.description && <div style={{ fontSize:11, color:"#888", fontWeight:400 }}>{item.description}</div>}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12 }}>{item.commodityGroup||"—"}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12 }}>{item.unitOfMeasure||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:"#888" }}>{item.location||"—"}</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:onHand===0?"#c0392b":onHand<=2?"#d97706":"#1a1a1a" }}>{onHand}</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:"monospace" }}>{value>0?fmtSm(value):"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:4 }}>
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

// ── Item Form (New / Edit) ────────────────────────────────────────────────────
function ItemForm({ item, locations, onSave, onCancel }) {
  const [form, setForm] = useState({
    id:            item?.id            || `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    legacyNumber:  item?.legacyNumber  || "",
    name:          item?.name          || "",
    description:   item?.description   || "",
    commodityGroup:item?.commodityGroup || "",
    glAccountCode: item?.glAccountCode || "",
    unitOfMeasure: item?.unitOfMeasure || "EA",
    location:      item?.location      || "",
    shelfLocation: item?.shelfLocation || "",
    fitsEquipment: item?.fitsEquipment || [],
    standardCost:  item?.standardCost  || 0,
    primaryVendor: item?.primaryVendor || "",
    receivingMode: item?.receivingMode || "standard",
    active:        item?.active !== false,
    notes:         item?.notes         || "",
    createdAt:     item?.createdAt     || new Date().toISOString(),
  });
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <button onClick={onCancel} style={{ ...btn.ghost, fontSize:12, padding:"6px 14px" }}>← Cancel</button>
        <div style={{ fontSize:18, fontWeight:700 }}>{item?"Edit Item":"New Inventory Item"}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:16, marginBottom:16 }}>
          <Field label="Legacy Inv #">
            <input type="text" value={form.legacyNumber} onChange={e=>set("legacyNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="23-19…" />
          </Field>
          <Field label="Item Name" required>
            <input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={inp} placeholder="e.g. 2025 Gravel — Grade 2" />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Description">
            <input type="text" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} placeholder="Additional detail…" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Commodity Group">
            <select value={form.commodityGroup} onChange={e=>set("commodityGroup",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {COMMODITY_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Unit of Measure" required>
            <select value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={inp}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="GL Account Code">
            <input type="text" value={form.glAccountCode} onChange={e=>set("glAccountCode",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="302.xx" />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Usual Location">
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {(locations||[]).map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
              <option value="equipment">On Equipment Unit</option>
            </select>
          </Field>
          <Field label="Shelf / Bin">
            <input type="text" value={form.shelfLocation} onChange={e=>set("shelfLocation",e.target.value.toUpperCase())} style={{ ...inp, fontFamily:"monospace", textTransform:"uppercase" }} placeholder="A1…" />
          </Field>
          <Field label="Standard Cost ($/unit)">
            <input type="number" min="0" step="0.01" value={form.standardCost} onChange={e=>set("standardCost",parseFloat(e.target.value)||0)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Primary Vendor">
            <input type="text" value={form.primaryVendor} onChange={e=>set("primaryVendor",e.target.value)} style={inp} />
          </Field>
          <Field label="Receiving Mode">
            <select value={form.receivingMode} onChange={e=>set("receivingMode",e.target.value)} style={inp}>
              <option value="standard">Standard (invoice-based)</option>
              <option value="scale_ticket_complex">Scale Ticket — Complex (Gravel)</option>
              <option value="scale_ticket_simple">Scale Ticket — Simple (Asphalt / Cold Patch)</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} style={{ ...inp, resize:"vertical" }} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={()=>onSave(form)} style={btn.primary}>{item?"Save Changes":"Add Item"}</button>
        <button onClick={onCancel} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ── Receive Form (standard invoice-based receiving) ───────────────────────────
function ReceiveForm({ db, dispatch, onDone }) {
  const items     = (db.inventoryItems || []).filter(i => i.active !== false && i.receivingMode === "standard");
  const locations = db.storageLocations || [];
  const today     = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    date:"", itemId:"", vendorName:"", invoiceNumber:"",
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
    setForm({ date:"", itemId:"", vendorName:"", invoiceNumber:"", quantity:"", unitCost:"", location:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Receive Stock</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Standard invoice-based receipt — creates a FIFO batch</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Stock received and batch created</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
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
              {items.map(i=><option key={i.id} value={i.id}>{i.name}{i.legacyNumber?` (${i.legacyNumber})`:""}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label={`Quantity (${selectedItem?.unitOfMeasure||"unit"})`} required>
            <input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Unit Cost ($)" required>
            <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>set("unitCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Receive to Location" required>
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="">Select…</option>
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
  const [mode, setMode] = useState("entry"); // entry | reconcile
  const scaleItems = (db.inventoryItems||[]).filter(i => i.active!==false && (i.receivingMode==="scale_ticket_complex"||i.receivingMode==="scale_ticket_simple"));
  const locations  = db.storageLocations || [];
  const projects   = (db.projects||[]).filter(p => p.status==="active");
  const townships  = db.townships || [];
  const pendingBatches = (db.inventoryBatches||[]).filter(b => b.invoiceStatus==="pending_reconciliation");

  const [form, setForm] = useState({
    date:"", itemId:"", vendorName:"", ticketNumber:"",
    quantity:"", unitOfMeasure:"CY",
    haulType:"county_pickup", destinationType:"wanda_stockpile",
    township:"", destinationLocation:"",
    projectId:"", unitRate:"", notes:"",
  });
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
    const goesToStockpile = !isRoadSegment;

    const tx = {
      id:                txId,
      type:              "scale_ticket",
      mode:              isComplex ? "complex" : "simple",
      date:              form.date,
      itemId:            form.itemId,
      itemName:          selectedItem?.name || "",
      vendorName:        form.vendorName,
      ticketNumber:      form.ticketNumber,
      quantity:          parseFloat(form.quantity),
      unitOfMeasure:     form.unitOfMeasure,
      haulType:          isComplex ? form.haulType : null,
      destinationType:   isComplex ? form.destinationType : "stockpile",
      township:          form.township,
      unitRate:          parseFloat(form.unitRate),
      totalCost,
      destinationLocation: destLocationName,
      projectId:         isRoadSegment ? form.projectId : null,
      invoiceStatus:     "pending_reconciliation",
      invoiceRef:        "",
      batchId:           goesToStockpile ? batchId : null,
      notes:             form.notes,
      createdAt:         new Date().toISOString(),
    };

    // Create a batch if going to stockpile
    let batch = null;
    if (goesToStockpile) {
      batch = {
        id:                batchId,
        itemId:            form.itemId,
        itemName:          selectedItem?.name || "",
        receiptDate:       form.date,
        receiptRef:        form.ticketNumber,
        location:          destLocationName,
        quantityReceived:  parseFloat(form.quantity),
        quantityRemaining: parseFloat(form.quantity),
        unitCost:          parseFloat(form.unitRate),
        totalCost,
        vendorName:        form.vendorName,
        invoiceStatus:     "pending_reconciliation",
        invoiceRef:        "",
        status:            "open",
        notes:             form.notes,
        createdAt:         new Date().toISOString(),
      };
      tx.batch = batch;
    }

    dispatch({ type:"ADD_INVENTORY_TRANSACTION", payload: tx });
    setSaved(true);
    setForm({ date:"", itemId:"", vendorName:"", ticketNumber:"", quantity:"", unitOfMeasure:"CY", haulType:"county_pickup", destinationType:"wanda_stockpile", township:"", destinationLocation:"", projectId:"", unitRate:"", notes:"" });
    setTimeout(()=>{ setSaved(false); }, 2000);
  };

  // Reconcile a batch (match to invoice)
  const [reconBatchId, setReconBatchId] = useState("");
  const [reconInvoice, setReconInvoice] = useState("");
  const [reconRate, setReconRate]       = useState("");

  const handleReconcile = () => {
    const batch = pendingBatches.find(b => b.id === reconBatchId);
    if (!batch||!reconInvoice) return;
    const newUnitCost = parseFloat(reconRate)||batch.unitCost;
    dispatch({
      type: "ADD_INVENTORY_TRANSACTION",
      payload: {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        type:        "reconcile",
        date:        new Date().toISOString().split("T")[0],
        itemId:      batch.itemId,
        itemName:    batch.itemName,
        batchId:     reconBatchId,
        newUnitCost,
        invoiceRef:  reconInvoice,
        notes:       `Invoice reconciliation — ${reconInvoice}`,
        createdAt:   new Date().toISOString(),
      },
    });
    setReconBatchId(""); setReconInvoice(""); setReconRate("");
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
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Date" required>
                <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
              </Field>
              <Field label="Vendor">
                <input type="text" value={form.vendorName} onChange={e=>set("vendorName",e.target.value)} style={inp} />
              </Field>
              <Field label="Ticket #">
                <input type="text" value={form.ticketNumber} onChange={e=>set("ticketNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Material" required>
                <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
                  <option value="">Select material…</option>
                  {scaleItems.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </Field>
              <Field label="Quantity" required>
                <input type="number" min="0" step="any" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Unit">
                <select value={form.unitOfMeasure} onChange={e=>set("unitOfMeasure",e.target.value)} style={inp}>
                  {["CY","TON","LF"].map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>

            {isComplex && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                  <Field label="Haul Type" required>
                    <select value={form.haulType} onChange={e=>set("haulType",e.target.value)} style={inp}>
                      {HAUL_TYPES.map(h=><option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Destination" required>
                    <select value={form.destinationType} onChange={e=>set("destinationType",e.target.value)} style={inp}>
                      {DEST_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </Field>
                </div>
                {isRoadSegment && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                    <Field label="Township (drives rate)">
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
              </>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
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

            {!isRoadSegment && (
              <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#7a4f00" }}>
                ⏳ Cost is <strong>pending reconciliation</strong> — stock will appear in inventory but the unit cost may be adjusted when the invoice arrives.
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleSave} style={btn.primary}>Save Scale Ticket</button>
            <button onClick={onDone} style={btn.ghost}>Cancel</button>
          </div>
        </>
      )}

      {mode==="reconcile" && (
        <div>
          <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Match Invoice to Scale Ticket Batches</div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16, marginBottom:16 }}>
              <Field label="Scale Ticket Batch">
                <select value={reconBatchId} onChange={e=>setReconBatchId(e.target.value)} style={inp}>
                  <option value="">Select pending batch…</option>
                  {pendingBatches.map(b=>(
                    <option key={b.id} value={b.id}>{b.itemName} · {b.receiptDate} · {b.quantityRemaining} {b.unitCost!=null?`@ ${fmtSm(b.unitCost)}`:""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice #" required>
                <input type="text" value={reconInvoice} onChange={e=>setReconInvoice(e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
              </Field>
              <Field label="Final Unit Cost (if different)">
                <input type="number" min="0" step="0.0001" value={reconRate} onChange={e=>setReconRate(e.target.value)} style={{ ...inp, fontFamily:"monospace" }} placeholder="Leave blank if same…" />
              </Field>
            </div>
            <button onClick={handleReconcile} style={btn.primary}>Reconcile Batch</button>
          </div>

          <SectionCard title="Pending Reconciliation" subtitle={`${pendingBatches.length} batch${pendingBatches.length!==1?"es":""}`}>
            <Table
              headers={[{ label:"Item" },{ label:"Date" },{ label:"Location" },{ label:"Qty Remaining" },{ label:"Est. Unit Cost" },{ label:"Est. Total" }]}
              rows={pendingBatches.map(b=>[
                b.itemName||"—",
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(b.receiptDate)}</span>,
                b.location||"—",
                <span style={{ fontFamily:"monospace" }}>{b.quantityRemaining}</span>,
                <span style={{ fontFamily:"monospace", color:"#d97706" }}>{fmtSm(b.unitCost||0)}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:600 }}>{fmtSm((b.quantityRemaining||0)*(b.unitCost||0))}</span>,
              ])}
              emptyMessage="No pending reconciliations"
            />
          </SectionCard>
        </div>
      )}
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
    date:"", itemId:"", location:"all", quantity:"", projectId:"", notes:"",
  });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved]     = useState(false);
  const set = (k,v) => { setForm(f=>({ ...f,[k]:v })); setPreview(null); }

  const selectedItem    = items.find(i=>i.id===form.itemId);
  const availableOnHand = selectedItem ? getOnHand(form.itemId, batches, form.location==="all"?null:form.location) : 0;

  const handlePreview = () => {
    if (!form.itemId||!form.quantity) return;
    const result = buildFIFOLines(form.itemId, form.location, parseFloat(form.quantity)||0, batches);
    setPreview(result);
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
    // Also add a material entry to the project if one was selected
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
    setForm({ date:"", itemId:"", location:"all", quantity:"", projectId:"", notes:"" });
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
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
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
              {items.map(i=><option key={i.id} value={i.id}>{i.name}{i.legacyNumber?` (${i.legacyNumber})`:""} — {getOnHand(i.id,batches)} on hand</option>)}
            </select>
          </Field>
          <Field label="From Location">
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="all">Any (FIFO across all)</option>
              {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
          <Field label={`Quantity (on hand: ${availableOnHand})`} required>
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
                ⚠️ Insufficient stock to fulfill {form.quantity} {selectedItem?.unitOfMeasure||"units"} — only {availableOnHand} available
              </div>
            )}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#e6f4ec" }}>
                  {["Batch Date / Vendor","Qty","Unit Cost","Line Total"].map(h=>(
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

// ── Transfer Form ─────────────────────────────────────────────────────────────
function TransferForm({ db, dispatch, onDone }) {
  const items    = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const batches  = db.inventoryBatches||[];
  const locations= db.storageLocations||[];

  const [form, setForm] = useState({ date:"", itemId:"", fromLocation:"", toLocation:"", quantity:"", notes:"" });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f=>({ ...f,[k]:v }));

  const availableQty = form.itemId && form.fromLocation ? getOnHand(form.itemId, batches, form.fromLocation) : 0;

  const handleSave = () => {
    if (!form.date||!form.itemId||!form.fromLocation||!form.toLocation||!form.quantity) return;
    const selectedItem = items.find(i=>i.id===form.itemId);
    // For transfers, find the oldest open batch at the source and move it
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
        toLocation:   form.toLocation,
        location:     form.fromLocation,
        batchId,
        notes:        form.notes,
        createdAt:    new Date().toISOString(),
      },
    });
    setSaved(true);
    setForm({ date:"", itemId:"", fromLocation:"", toLocation:"", quantity:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Transfer Stock</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Move stock between storage locations</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Transfer recorded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
          </Field>
          <Field label="From Location" required>
            <select value={form.fromLocation} onChange={e=>set("fromLocation",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="To Location" required>
            <select value={form.toLocation} onChange={e=>set("toLocation",e.target.value)} style={inp}>
              <option value="">Select…</option>
              {locations.filter(l=>l.name!==form.fromLocation).map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Item" required>
            <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
              <option value="">Select item…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.name} — {getOnHand(i.id,batches,form.fromLocation||null)} at {form.fromLocation||"selected loc"}</option>)}
            </select>
          </Field>
          <Field label={`Quantity (available: ${availableQty})`} required>
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

  const [form, setForm] = useState({ date:"", itemId:"", location:"", quantityAdjustment:"", reason:"", notes:"" });
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
    setForm({ date:"", itemId:"", location:"", quantityAdjustment:"", reason:"", notes:"" });
    setTimeout(()=>{ setSaved(false); onDone(); }, 1400);
  };

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Quantity Adjustment</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Correct on-hand quantity — applied FIFO to oldest open batches first</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Adjustment recorded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
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
              {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
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

// ── Crosswalk Form (opening balance) ─────────────────────────────────────────
function CrosswalkForm({ db, dispatch, onDone }) {
  const items    = (db.inventoryItems||[]).filter(i=>i.active!==false);
  const locations= db.storageLocations||[];

  const [rows, setRows]   = useState([{ id:Date.now(), itemId:"", location:"", quantity:"", unitCost:"", notes:"" }]);
  const [date, setDate]   = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState(false);

  const addRow    = () => setRows(r=>[...r,{ id:Date.now()+Math.random(), itemId:"", location:"", quantity:"", unitCost:"", notes:"" }]);
  const removeRow = id => setRows(r=>r.filter(x=>x.id!==id));
  const setR = (id,k,v) => setRows(rs=>rs.map(r=>r.id===id?{ ...r,[k]:v }:r));

  const handleSave = () => {
    const valid = rows.filter(r=>r.itemId&&r.location&&r.quantity&&r.unitCost);
    if (valid.length===0) return;
    valid.forEach(r => {
      const selectedItem = items.find(i=>i.id===r.itemId);
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      const qty     = parseFloat(r.quantity)||0;
      const cost    = parseFloat(r.unitCost)||0;
      const batch   = {
        id:                batchId,
        itemId:            r.itemId,
        itemName:          selectedItem?.name||"",
        receiptDate:       date,
        receiptRef:        "CROSSWALK",
        location:          r.location,
        quantityReceived:  qty,
        quantityRemaining: qty,
        unitCost:          cost,
        totalCost:         qty*cost,
        vendorName:        "",
        invoiceStatus:     "final",
        status:            "open",
        notes:             r.notes||"Opening balance crosswalk",
        createdAt:         new Date().toISOString(),
      };
      dispatch({
        type: "ADD_INVENTORY_TRANSACTION",
        payload: {
          id:          `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          type:        "crosswalk",
          date,
          itemId:      r.itemId,
          itemName:    selectedItem?.name||"",
          location:    r.location,
          quantity:    qty,
          unitCost:    cost,
          totalCost:   qty*cost,
          batchId,
          batch,
          notes:       r.notes||"Opening balance crosswalk",
          createdAt:   new Date().toISOString(),
        },
      });
    });
    setSaved(true);
    setRows([{ id:Date.now(), itemId:"", location:"", quantity:"", unitCost:"", notes:"" }]);
    setTimeout(()=>{ setSaved(false); onDone(); }, 1600);
  };

  return (
    <div>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Initial Crosswalk</div>
      <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Load opening balances from your existing system. Each row creates a FIFO batch dated today.</div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Opening balances loaded</div>}

      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
          <Field label="As-Of Date">
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...inp, width:160 }} />
          </Field>
          <div style={{ fontSize:12, color:"#888", paddingTop:20 }}>Each row becomes a FIFO batch at this date</div>
        </div>

        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, marginBottom:12 }}>
          <thead>
            <tr style={{ background:"#f7f7f5" }}>
              {["Item","Location","Qty","Unit Cost ($)","Total","Notes",""].map(h=>(
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:600, fontSize:11, textTransform:"uppercase", color:"#666", borderBottom:"1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => {
              const total = (parseFloat(r.quantity)||0)*(parseFloat(r.unitCost)||0);
              return (
                <tr key={r.id} style={{ borderTop:"1px solid #eee" }}>
                  <td style={{ padding:"8px 8px" }}>
                    <select value={r.itemId} onChange={e=>setR(r.id,"itemId",e.target.value)} style={{ ...inp, margin:0, fontSize:12, minWidth:180 }}>
                      <option value="">Select…</option>
                      {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:"8px 6px" }}>
                    <select value={r.location} onChange={e=>setR(r.id,"location",e.target.value)} style={{ ...inp, margin:0, fontSize:12, minWidth:140 }}>
                      <option value="">Select…</option>
                      {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:"8px 6px" }}>
                    <input type="number" min="0" step="any" value={r.quantity} onChange={e=>setR(r.id,"quantity",e.target.value)} style={{ ...inp, margin:0, width:80, fontFamily:"monospace" }} />
                  </td>
                  <td style={{ padding:"8px 6px" }}>
                    <input type="number" min="0" step="0.01" value={r.unitCost} onChange={e=>setR(r.id,"unitCost",e.target.value)} style={{ ...inp, margin:0, width:90, fontFamily:"monospace" }} />
                  </td>
                  <td style={{ padding:"8px 6px", fontFamily:"monospace", fontSize:12, color:"#1a3a5c", fontWeight:600, whiteSpace:"nowrap" }}>
                    {total>0?fmtSm(total):"—"}
                  </td>
                  <td style={{ padding:"8px 6px" }}>
                    <input type="text" value={r.notes} onChange={e=>setR(r.id,"notes",e.target.value)} style={{ ...inp, margin:0, minWidth:120 }} placeholder="Optional…" />
                  </td>
                  <td style={{ padding:"8px 6px" }}>
                    {rows.length>1 && <button onClick={()=>removeRow(r.id)} style={{ ...btn.danger, padding:"5px 10px", fontSize:14 }}>×</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={addRow} style={{ ...btn.secondary, fontSize:12, padding:"6px 14px" }}>+ Add Row</button>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} style={btn.primary}>Load Opening Balances</button>
        <button onClick={onDone} style={btn.ghost}>Cancel</button>
      </div>
    </div>
  );
}
