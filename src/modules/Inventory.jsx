import { useState, useMemo } from "react";
import { Field, SectionCard, Table, StatusBadge, inp, btn, fmt, fmtSm } from "../components/shared.jsx";
import { EXPENDITURE_CODES } from "../data/accountCodes.js";

// ── Default locations & shelves ───────────────────────────────────────────────
const DEFAULT_LOCATIONS = [
  { id: "main",     name: "Main Shop",      shelves: ["A1","A2","A3","B1","B2","B3","C1","C2","C3","D1","D2","E1","E2"] },
  { id: "pauline",  name: "Pauline Shed",   shelves: ["A1","A2","B1","B2","C1"] },
  { id: "kenesaw",  name: "Kenesaw Shed",   shelves: ["A1","A2","B1","B2","C1"] },
  { id: "roseland", name: "Roseland Shed",  shelves: ["A1","A2","B1","B2","C1"] },
  { id: "holstein", name: "Holstein Shed",  shelves: ["A1","A2","B1","B2","C1"] },
  { id: "on_asset", name: "On-Asset",       shelves: [] },
];

const ITEM_TYPES = [
  { value: "material",       label: "Material / Supply",  icon: "📦", color: "#1a3a5c" },
  { value: "part",           label: "Part (cross-ref)",   icon: "⚙️",  color: "#6b3a1a" },
  { value: "tool",           label: "Small Tool",         icon: "🔧", color: "#1a6b35" },
  { value: "assigned_asset", label: "Assigned Asset",     icon: "🔌", color: "#5a1a8a" },
];

const UNITS = ["EA","PR","BX","CS","GAL","QT","LB","TON","CY","LF","SF","RL","SET","KIT","OTH"];

const TX_TYPES = [
  { value: "receive",  label: "Receive",  color: "#1a6b35" },
  { value: "issue",    label: "Issue",    color: "#6b3a1a" },
  { value: "transfer", label: "Transfer", color: "#1a3a5c" },
  { value: "adjust",   label: "Adjust",   color: "#5a1a8a" },
];

// ── Inventory Module ──────────────────────────────────────────────────────────
export default function Inventory({ db, dispatch }) {
  const [view, setView] = useState("dashboard");

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:"1px solid #ddd" }}>
        {[
          { id:"dashboard",  label:"Dashboard" },
          { id:"items",      label:"All Items" },
          { id:"addItem",    label:"Add Item" },
          { id:"transaction",label:"Issue / Receive" },
          { id:"locations",  label:"Locations & Shelves" },
          { id:"lowstock",   label:"Low Stock" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background:"transparent", border:"none", padding:"8px 16px 10px",
            fontWeight: view===v.id ? 700 : 400, fontSize:13, cursor:"pointer",
            color: view===v.id ? "#1a5a3a" : "#666",
            borderBottom: view===v.id ? "2px solid #1a5a3a" : "2px solid transparent",
            marginBottom:-1,
          }}>{v.label}</button>
        ))}
      </div>

      {view==="dashboard"   && <InvDashboard db={db} setView={setView} />}
      {view==="items"       && <ItemList db={db} dispatch={dispatch} />}
      {view==="addItem"     && <AddItemForm db={db} dispatch={dispatch} onDone={() => setView("items")} />}
      {view==="transaction" && <TransactionForm db={db} dispatch={dispatch} onDone={() => setView("items")} />}
      {view==="locations"   && <Locations db={db} dispatch={dispatch} />}
      {view==="lowstock"    && <LowStock db={db} />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function InvDashboard({ db, setView }) {
  const items = db.inventoryItems || [];

  const totalItems    = items.length;
  const lowStock      = items.filter(i => i.reorderPoint > 0 && totalOnHand(i) <= i.reorderPoint && totalOnHand(i) > 0);
  const outOfStock    = items.filter(i => totalOnHand(i) === 0);
  const totalValue    = items.reduce((s,i) => s + (totalOnHand(i) * (i.unitCost||0)), 0);
  const partsCount    = items.filter(i => i.type==="part").length;

  const recentTx = [...(db.inventoryTransactions||[])].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,8);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Inventory</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Materials · Parts · Tools · Assigned Assets · {DEFAULT_LOCATIONS.length} locations</div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total Items",     value:totalItems,       sub:"In inventory",          accent:"#1a5a3a" },
          { label:"Parts (Cross-ref)",value:partsCount,      sub:"Multi-machine parts",   accent:"#6b3a1a" },
          { label:"Low Stock",       value:lowStock.length,  sub:"At or below reorder",   accent:"#d97706" },
          { label:"Out of Stock",    value:outOfStock.length,sub:"Zero on hand",           accent:"#c0392b" },
          { label:"Est. Value",      value:fmt(totalValue),  sub:"At cost",               accent:"#1a3a5c" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"16px 18px", borderTop:`3px solid ${k.accent}` }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888", marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color: k.accent }}>{k.value}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div style={{ marginBottom:20 }}>
          {outOfStock.length > 0 && (
            <div style={{ background:"#fdecea", border:"1px solid #f5c6c6", borderRadius:8, padding:"12px 18px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:"#8c1b18", fontWeight:600 }}>🔴 {outOfStock.length} item{outOfStock.length!==1?"s":""} out of stock: {outOfStock.slice(0,3).map(i=>i.name).join(", ")}{outOfStock.length>3?"…":""}</div>
              <button onClick={() => setView("lowstock")} style={{ ...btn.small, background:"#c0392b", fontSize:11 }}>View All</button>
            </div>
          )}
          {lowStock.length > 0 && (
            <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:8, padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:"#7a4f00", fontWeight:600 }}>⚠️ {lowStock.length} item{lowStock.length!==1?"s":""} low: {lowStock.slice(0,3).map(i=>i.name).join(", ")}{lowStock.length>3?"…":""}</div>
              <button onClick={() => setView("lowstock")} style={{ ...btn.small, background:"#d97706", fontSize:11 }}>View All</button>
            </div>
          )}
        </div>
      )}

      {/* Items by type */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {ITEM_TYPES.map(type => {
          const typeItems = items.filter(i => i.type===type.value);
          const low = typeItems.filter(i => i.reorderPoint>0 && totalOnHand(i)<=i.reorderPoint);
          return (
            <div key={type.value} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:16, borderLeft:`4px solid ${type.color}` }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{type.icon}</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a" }}>{type.label}</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:type.color, margin:"6px 0 2px" }}>{typeItems.length}</div>
              {low.length > 0 && <div style={{ fontSize:11, color:"#d97706", fontWeight:600 }}>⚠️ {low.length} low stock</div>}
            </div>
          );
        })}
      </div>

      {/* Recent transactions */}
      <SectionCard title="Recent Transactions" subtitle={`${(db.inventoryTransactions||[]).length} total`}>
        <Table
          headers={[{ label:"Date" },{ label:"Type" },{ label:"Item" },{ label:"Location" },{ label:"Shelf" },{ label:"Qty", right:true },{ label:"Reference" }]}
          rows={recentTx.map(tx => {
            const item = items.find(i=>i.id===tx.itemId);
            const txType = TX_TYPES.find(t=>t.value===tx.type);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{tx.date}</span>,
              <span style={{ background:txType?.color+"18", color:txType?.color, padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{txType?.label||tx.type}</span>,
              <span style={{ fontWeight:600 }}>{item?.name||"Unknown"}</span>,
              tx.location||"—",
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{tx.shelf||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700, color: tx.type==="receive"?"#1a6b35": tx.type==="issue"?"#c0392b":"#1a3a5c" }}>
                {tx.type==="receive"?"+":tx.type==="issue"?"-":""}{tx.quantity}
              </span>,
              <span style={{ fontSize:12, color:"#888" }}>{tx.reference||"—"}</span>,
            ];
          })}
          emptyMessage="No transactions yet — use Issue / Receive to log inventory movement"
        />
      </SectionCard>
    </div>
  );
}

// ── Helper: total on hand across all locations ────────────────────────────────
function totalOnHand(item) {
  return Object.values(item.locationStock||{}).reduce((s,v)=>s+v,0);
}

// ── Item List ─────────────────────────────────────────────────────────────────
function ItemList({ db, dispatch }) {
  const [search, setSearch]     = useState("");
  const [typeFilter, setType]   = useState("all");
  const [locFilter, setLoc]     = useState("all");
  const [selected, setSelected] = useState(null);
  const items = db.inventoryItems || [];

  const filtered = items.filter(i => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (locFilter !== "all" && !i.locationStock?.[locFilter]) return false;
    if (search && !`${i.name} ${i.partNumber||""} ${i.description||""} ${(i.machineRefs||[]).join(" ")}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selected) {
    return <ItemDetail item={selected} db={db} dispatch={dispatch} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>All Items ({filtered.length})</div>
          <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Click an item to view details, transactions, and machine cross-references</div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, part #, machine…" style={{ ...inp, width:220, margin:0 }} />
          <div style={{ display:"flex", border:"1px solid #ccc", borderRadius:6, overflow:"hidden" }}>
            {["all",...ITEM_TYPES.map(t=>t.value)].map(t => {
              const type = ITEM_TYPES.find(x=>x.value===t);
              return (
                <button key={t} onClick={()=>setType(t)} style={{ padding:"7px 10px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background: typeFilter===t?"#1a5a3a":"#fff", color: typeFilter===t?"#fff":"#555", textTransform:"capitalize" }}>
                  {type ? type.icon+" "+type.label.split(" ")[0] : "All"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SectionCard title={`Items (${filtered.length})`}>
        <Table
          headers={[
            { label:"Type" },{ label:"Name" },{ label:"Part #" },
            { label:"Location / Shelf" },{ label:"On Hand", right:true },
            { label:"Unit" },{ label:"Reorder At", right:true },
            { label:"Est. Value", right:true },{ label:"Status" },
          ]}
          rows={filtered.map(item => {
            const onHand   = totalOnHand(item);
            const type     = ITEM_TYPES.find(t=>t.value===item.type);
            const isLow    = item.reorderPoint>0 && onHand<=item.reorderPoint && onHand>0;
            const isOut    = onHand===0;
            const locSummary = Object.entries(item.locationStock||{})
              .filter(([,q])=>q>0)
              .map(([loc,q])=>{
                const l = DEFAULT_LOCATIONS.find(x=>x.id===loc);
                return `${l?.name||loc} (${q})`;
              }).join(", ");
            return [
              <span style={{ fontSize:16 }}>{type?.icon}</span>,
              <button onClick={()=>setSelected(item)} style={{ background:"none", border:"none", padding:0, color:"#1a3a5c", fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>{item.name}</button>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{item.partNumber||"—"}</span>,
              <div>
                <div style={{ fontSize:12, color:"#555" }}>{locSummary||"—"}</div>
                {item.shelf && <div style={{ fontSize:11, color:"#888", fontFamily:"monospace" }}>Shelf {item.shelf}</div>}
              </div>,
              <span style={{ fontFamily:"monospace", fontWeight:700, color: isOut?"#c0392b":isLow?"#d97706":"#1a6b35", fontSize:15 }}>{onHand}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{item.unit||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{item.reorderPoint||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{item.unitCost>0?fmtSm(onHand*item.unitCost):"—"}</span>,
              isOut ? <span style={{ background:"#fdecea", color:"#c0392b", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>Out of Stock</span>
                : isLow ? <span style={{ background:"#fef3cd", color:"#7a4f00", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>Low Stock</span>
                : <span style={{ background:"#e6f4ec", color:"#1a6b35", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>In Stock</span>,
            ];
          })}
          emptyMessage="No items yet — click Add Item to get started"
        />
      </SectionCard>
    </div>
  );
}

// ── Item Detail ───────────────────────────────────────────────────────────────
function ItemDetail({ item, db, dispatch, onBack }) {
  const txHistory = (db.inventoryTransactions||[]).filter(t=>t.itemId===item.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const onHand    = totalOnHand(item);
  const type      = ITEM_TYPES.find(t=>t.value===item.type);
  const isLow     = item.reorderPoint>0 && onHand<=item.reorderPoint && onHand>0;
  const isOut     = onHand===0;

  return (
    <div>
      <button onClick={onBack} style={{ ...btn.ghost, marginBottom:20, fontSize:12, padding:"6px 14px" }}>← Back to items</button>

      {/* Header */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontSize:24 }}>{type?.icon}</span>
              <span style={{ fontSize:11, background:type?.color+"18", color:type?.color, padding:"2px 8px", borderRadius:4, fontWeight:600 }}>{type?.label}</span>
              {item.partNumber && <span style={{ fontFamily:"monospace", fontSize:12, color:"#888", background:"#f0f0ee", padding:"2px 8px", borderRadius:4 }}>{item.partNumber}</span>}
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:"#1a1a1a" }}>{item.name}</div>
            {item.description && <div style={{ fontSize:13, color:"#555", marginTop:3 }}>{item.description}</div>}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:32, fontWeight:700, fontFamily:"monospace", color: isOut?"#c0392b":isLow?"#d97706":"#1a6b35" }}>{onHand}</div>
            <div style={{ fontSize:12, color:"#888" }}>{item.unit} on hand</div>
            {isOut && <div style={{ fontSize:12, color:"#c0392b", fontWeight:600 }}>OUT OF STOCK</div>}
            {isLow && !isOut && <div style={{ fontSize:12, color:"#d97706", fontWeight:600 }}>LOW STOCK — reorder at {item.reorderPoint}</div>}
          </div>
        </div>

        {/* Details grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginTop:18 }}>
          <div><div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Account Code</div><div style={{ fontSize:13, fontFamily:"monospace", color:"#1a3a5c", fontWeight:600, marginTop:3 }}>{item.accountCode||"—"}</div></div>
          <div><div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Unit Cost</div><div style={{ fontSize:13, fontFamily:"monospace", marginTop:3 }}>{item.unitCost>0?fmtSm(item.unitCost):"—"}</div></div>
          <div><div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Primary Vendor</div><div style={{ fontSize:13, marginTop:3 }}>{item.vendor||"—"}</div></div>
          <div><div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Reorder Point</div><div style={{ fontSize:13, fontFamily:"monospace", marginTop:3 }}>{item.reorderPoint||"—"} {item.unit}</div></div>
        </div>

        {/* Location stock */}
        {Object.keys(item.locationStock||{}).length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Stock by Location</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {Object.entries(item.locationStock||{}).map(([locId,qty]) => {
                const loc = DEFAULT_LOCATIONS.find(l=>l.id===locId);
                return (
                  <div key={locId} style={{ background:"#f7f7f5", borderRadius:6, padding:"8px 14px", border:"1px solid #eee" }}>
                    <div style={{ fontSize:11, color:"#888" }}>{loc?.name||locId}</div>
                    <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:"#1a5a3a" }}>{qty} <span style={{ fontSize:11, fontWeight:400 }}>{item.unit}</span></div>
                    {item.shelf && <div style={{ fontSize:11, color:"#888", fontFamily:"monospace" }}>Shelf {item.shelf}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Machine cross-references */}
        {item.type==="part" && (item.machineRefs||[]).length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Compatible Equipment</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {(item.machineRefs||[]).map((ref,i) => (
                <span key={i} style={{ background:"#e8f0fb", color:"#1a4a8a", padding:"4px 12px", borderRadius:16, fontSize:12, fontWeight:600 }}>🚛 {ref}</span>
              ))}
            </div>
          </div>
        )}

        {/* Assigned asset location */}
        {item.type==="assigned_asset" && item.assignedTo && (
          <div style={{ marginTop:16, background:"#f3e8ff", borderRadius:6, padding:"10px 14px" }}>
            <div style={{ fontSize:11, color:"#5a1a8a", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Permanently Assigned To</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#5a1a8a", marginTop:3 }}>{item.assignedTo}</div>
          </div>
        )}
      </div>

      {/* Transaction history */}
      <SectionCard title="Transaction History" subtitle={`${txHistory.length} transactions`}>
        <Table
          headers={[{ label:"Date" },{ label:"Type" },{ label:"Qty", right:true },{ label:"Location" },{ label:"Shelf" },{ label:"Project / Job" },{ label:"Reference" },{ label:"Notes" }]}
          rows={txHistory.map(tx => {
            const txType = TX_TYPES.find(t=>t.value===tx.type);
            const loc    = DEFAULT_LOCATIONS.find(l=>l.id===tx.location);
            return [
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{tx.date}</span>,
              <span style={{ background:txType?.color+"18", color:txType?.color, padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:600 }}>{txType?.label}</span>,
              <span style={{ fontFamily:"monospace", fontWeight:700, color: tx.type==="receive"?"#1a6b35":tx.type==="issue"?"#c0392b":"#1a3a5c" }}>
                {tx.type==="receive"?"+":tx.type==="issue"?"-":""}{tx.quantity}
              </span>,
              loc?.name||tx.location||"—",
              <span style={{ fontFamily:"monospace", fontSize:12 }}>{tx.shelf||"—"}</span>,
              <span style={{ fontSize:12, color:"#555" }}>{tx.projectRef||"—"}</span>,
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#888" }}>{tx.reference||"—"}</span>,
              <span style={{ fontSize:12, color:"#888" }}>{tx.notes||"—"}</span>,
            ];
          })}
          emptyMessage="No transactions recorded for this item"
        />
      </SectionCard>
    </div>
  );
}

// ── Add Item Form ─────────────────────────────────────────────────────────────
function AddItemForm({ db, dispatch, onDone }) {
  const empty = {
    name:"", type:"material", partNumber:"", description:"",
    accountCode:"", unit:"EA", unitCost:"", reorderPoint:"",
    vendor:"", shelf:"", assignedTo:"",
    machineRefs:[], locationStock:{},
  };
  const [form, setForm]         = useState(empty);
  const [machineInput, setMachineInput] = useState("");
  const [saved, setSaved]       = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const addMachineRef = () => {
    if (!machineInput.trim()) return;
    set("machineRefs", [...(form.machineRefs||[]), machineInput.trim()]);
    setMachineInput("");
  };

  const removeMachineRef = (ref) => set("machineRefs", form.machineRefs.filter(r=>r!==ref));

  const setLocationQty = (locId, qty) => set("locationStock", { ...form.locationStock, [locId]: parseInt(qty)||0 });

  const matCodes = EXPENDITURE_CODES.filter(c => ["materials","equipment","other"].includes(c.category));

  const handleSubmit = () => {
    if (!form.name || !form.type) return;
    dispatch({
      type:"ADD_INVENTORY_ITEM",
      payload:{ ...form, id:Date.now(), unitCost:parseFloat(form.unitCost)||0, reorderPoint:parseInt(form.reorderPoint)||0 },
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  return (
    <div style={{ maxWidth:780 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Add Inventory Item</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Materials, parts, tools, and assigned assets</div>
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Item added to inventory</div>}

      {/* Type selector */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Item Type</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {ITEM_TYPES.map(t => (
            <button key={t.value} onClick={() => set("type",t.value)} style={{
              background: form.type===t.value ? t.color : "#fff",
              color: form.type===t.value ? "#fff" : "#333",
              border: `1px solid ${form.type===t.value ? t.color : "#ddd"}`,
              borderRadius:8, padding:"14px 10px", cursor:"pointer", textAlign:"center",
            }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{t.icon}</div>
              <div style={{ fontSize:12, fontWeight:600 }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Basic info */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Item Details</div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Item Name" required>
            <input type="text" placeholder={form.type==="part"?"e.g. Oil Filter — Donaldson P551670":"e.g. 36in Concrete Culvert"} value={form.name} onChange={e=>set("name",e.target.value)} style={inp} />
          </Field>
          <Field label="Part Number / SKU">
            <input type="text" placeholder="e.g. P551670" value={form.partNumber} onChange={e=>set("partNumber",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>
        <div style={{ marginBottom:16 }}>
          <Field label="Description">
            <input type="text" placeholder="Additional details, specifications…" value={form.description} onChange={e=>set("description",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <Field label="Unit">
            <select value={form.unit} onChange={e=>set("unit",e.target.value)} style={inp}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Unit Cost ($)">
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.unitCost} onChange={e=>set("unitCost",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Reorder Point">
            <input type="number" min="0" step="1" placeholder="0" value={form.reorderPoint} onChange={e=>set("reorderPoint",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
          <Field label="Primary Vendor">
            <input type="text" placeholder="Vendor name…" value={form.vendor} onChange={e=>set("vendor",e.target.value)} style={inp} />
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="Account Code">
            <select value={form.accountCode} onChange={e=>set("accountCode",e.target.value)} style={{ ...inp, fontFamily:"monospace", fontSize:12 }}>
              <option value="">Select account code…</option>
              {matCodes.map(c=><option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
            </select>
          </Field>
          <Field label="Default Shelf Location">
            <input type="text" placeholder="e.g. A1, B3…" value={form.shelf} onChange={e=>set("shelf",e.target.value.toUpperCase())} style={{ ...inp, fontFamily:"monospace", textTransform:"uppercase" }} />
          </Field>
        </div>
      </div>

      {/* Machine cross-references — parts only */}
      {form.type==="part" && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>Compatible Equipment (Cross-Reference)</div>
          <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Add every machine this part fits — unit number, description, or both</div>
          <div style={{ display:"flex", gap:10, marginBottom:12 }}>
            <input type="text" placeholder="e.g. Grader #1, Unit 142, Loader #3…" value={machineInput} onChange={e=>setMachineInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addMachineRef()} style={{ ...inp, flex:1 }} />
            <button onClick={addMachineRef} style={{ ...btn.small, background:"#6b3a1a", padding:"9px 16px" }}>+ Add</button>
          </div>
          {(form.machineRefs||[]).length > 0 && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {form.machineRefs.map((ref,i) => (
                <span key={i} style={{ background:"#e8f0fb", color:"#1a4a8a", padding:"5px 12px", borderRadius:16, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                  🚛 {ref}
                  <button onClick={()=>removeMachineRef(ref)} style={{ background:"none", border:"none", color:"#1a4a8a", cursor:"pointer", padding:0, fontSize:14, lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assigned asset location */}
      {form.type==="assigned_asset" && (
        <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Permanent Assignment</div>
          <Field label="Assigned To (machine, location, or crew)">
            <input type="text" placeholder="e.g. Grader #1, Shop Office, Crew Truck 4…" value={form.assignedTo} onChange={e=>set("assignedTo",e.target.value)} style={inp} />
          </Field>
        </div>
      )}

      {/* Initial stock by location */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>Initial Stock Quantity</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Enter current on-hand quantity per location (leave blank if none)</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {DEFAULT_LOCATIONS.map(loc => (
            <Field key={loc.id} label={loc.name}>
              <input type="number" min="0" step="1" placeholder="0"
                value={form.locationStock?.[loc.id]||""}
                onChange={e=>setLocationQty(loc.id,e.target.value)}
                style={{ ...inp, fontFamily:"monospace" }} />
            </Field>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background:"#1a5a3a" }}>Add to Inventory</button>
        <button onClick={() => setForm(empty)} style={btn.ghost}>Clear</button>
      </div>
    </div>
  );
}

// ── Issue / Receive / Transfer / Adjust ───────────────────────────────────────
function TransactionForm({ db, dispatch, onDone }) {
  const items = db.inventoryItems || [];
  const [form, setForm] = useState({
    type:"receive", itemId:"", date:"", quantity:"", location:"", shelf:"",
    toLocation:"", projectRef:"", reference:"", notes:"",
  });
  const [saved, setSaved] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const selectedItem = items.find(i=>i.id===parseInt(form.itemId));
  const onHand = selectedItem ? totalOnHand(selectedItem) : 0;
  const locOnHand = selectedItem?.locationStock?.[form.location]||0;

  const handleSubmit = () => {
    if (!form.itemId || !form.date || !form.quantity || !form.location) return;
    dispatch({
      type:"ADD_INVENTORY_TRANSACTION",
      payload:{ ...form, id:Date.now(), itemId:parseInt(form.itemId), quantity:parseInt(form.quantity)||0 },
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onDone(); }, 1500);
  };

  const projects = [...(db.projects||[])].filter(p=>p.status==="active");

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Issue / Receive / Transfer / Adjust</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Log inventory movement — updates on-hand quantities automatically</div>
      </div>

      {saved && <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:6, padding:"12px 16px", marginBottom:16, color:"#1a6b35", fontWeight:600, fontSize:13 }}>✓ Transaction recorded</div>}

      {/* Transaction type */}
      <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:22, marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Transaction Type</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
          {TX_TYPES.map(t => (
            <button key={t.value} onClick={() => set("type",t.value)} style={{
              background: form.type===t.value ? t.color : "#fff",
              color: form.type===t.value ? "#fff" : "#333",
              border: `1px solid ${form.type===t.value ? t.color : "#ddd"}`,
              borderRadius:8, padding:"12px 8px", cursor:"pointer", textAlign:"center",
              fontWeight:600, fontSize:13,
            }}>
              {t.label}
              <div style={{ fontSize:10, marginTop:4, opacity:0.8 }}>
                {t.value==="receive"?"Stock coming in":t.value==="issue"?"Stock going out":t.value==="transfer"?"Move between locations":"Quantity correction"}
              </div>
            </button>
          ))}
        </div>

        {/* Item + date */}
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
          <Field label="Item" required>
            <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={inp}>
              <option value="">Select item…</option>
              {items.map(i=>(
                <option key={i.id} value={i.id}>{ITEM_TYPES.find(t=>t.value===i.type)?.icon} {i.name}{i.partNumber?` (${i.partNumber})`:""} — {totalOnHand(i)} {i.unit} on hand</option>
              ))}
            </select>
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp} />
          </Field>
        </div>

        {/* Selected item info */}
        {selectedItem && (
          <div style={{ background:"#f7f7f5", borderRadius:6, padding:"10px 14px", marginBottom:16, display:"flex", gap:20, fontSize:12 }}>
            <span><strong>Total on hand:</strong> <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a5a3a" }}>{onHand} {selectedItem.unit}</span></span>
            {selectedItem.partNumber && <span><strong>Part #:</strong> <span style={{ fontFamily:"monospace" }}>{selectedItem.partNumber}</span></span>}
            {selectedItem.reorderPoint>0 && <span><strong>Reorder at:</strong> <span style={{ fontFamily:"monospace" }}>{selectedItem.reorderPoint}</span></span>}
            {selectedItem.shelf && <span><strong>Default shelf:</strong> <span style={{ fontFamily:"monospace" }}>{selectedItem.shelf}</span></span>}
          </div>
        )}

        {/* Location + shelf + quantity */}
        <div style={{ display:"grid", gridTemplateColumns: form.type==="transfer" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <Field label={form.type==="transfer"?"From Location":"Location"} required>
            <select value={form.location} onChange={e=>set("location",e.target.value)} style={inp}>
              <option value="">Select location…</option>
              {DEFAULT_LOCATIONS.map(l=>(
                <option key={l.id} value={l.id}>{l.name}{selectedItem?.locationStock?.[l.id]?` (${selectedItem.locationStock[l.id]} on hand)`:""}</option>
              ))}
            </select>
          </Field>
          {form.type==="transfer" && (
            <Field label="To Location" required>
              <select value={form.toLocation} onChange={e=>set("toLocation",e.target.value)} style={inp}>
                <option value="">Select location…</option>
                {DEFAULT_LOCATIONS.filter(l=>l.id!==form.location).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Shelf">
            <input type="text" placeholder="e.g. A1" value={form.shelf} onChange={e=>set("shelf",e.target.value.toUpperCase())} style={{ ...inp, fontFamily:"monospace", textTransform:"uppercase" }} />
          </Field>
          <Field label="Quantity" required>
            <input type="number" min="1" step="1" placeholder="0" value={form.quantity} onChange={e=>set("quantity",e.target.value)} style={{ ...inp, fontFamily:"monospace" }} />
          </Field>
        </div>

        {/* Issue — link to project */}
        {form.type==="issue" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Project / Job (optional)">
              <select value={form.projectRef} onChange={e=>set("projectRef",e.target.value)} style={inp}>
                <option value="">Not assigned to a project…</option>
                {projects.map(p=><option key={p.id} value={p.projectNumber}>{p.projectNumber} — {p.name}</option>)}
              </select>
            </Field>
            <Field label="Reference">
              <input type="text" placeholder="Work order, PO, etc…" value={form.reference} onChange={e=>set("reference",e.target.value)} style={inp} />
            </Field>
          </div>
        )}

        {/* Receive — vendor reference */}
        {form.type==="receive" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Invoice / PO Number">
              <input type="text" placeholder="Invoice or PO reference…" value={form.reference} onChange={e=>set("reference",e.target.value)} style={inp} />
            </Field>
          </div>
        )}

        {/* Adjust — reason required */}
        {form.type==="adjust" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#7a4f00", marginBottom:12 }}>
              ⚠️ Adjustments add or subtract from current quantity. Use positive numbers to increase, negative to decrease (e.g. -5 to remove 5 from stock after damage or loss).
            </div>
          </div>
        )}

        <Field label="Notes">
          <input type="text" placeholder="Additional notes…" value={form.notes} onChange={e=>set("notes",e.target.value)} style={inp} />
        </Field>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSubmit} style={{ ...btn.primary, background: TX_TYPES.find(t=>t.value===form.type)?.color||"#1a3a5c" }}>
          Record {TX_TYPES.find(t=>t.value===form.type)?.label}
        </button>
        <button onClick={() => setForm({ type:"receive", itemId:"", date:"", quantity:"", location:"", shelf:"", toLocation:"", projectRef:"", reference:"", notes:"" })} style={btn.ghost}>Clear</button>
      </div>
    </div>
  );
}

// ── Locations & Shelves ───────────────────────────────────────────────────────
function Locations({ db }) {
  const items = db.inventoryItems || [];

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Locations & Shelves</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>Stock summary by location — {DEFAULT_LOCATIONS.length} locations configured</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {DEFAULT_LOCATIONS.map(loc => {
          const locItems = items.filter(i => (i.locationStock?.[loc.id]||0) > 0);
          const locValue = locItems.reduce((s,i) => s + ((i.locationStock?.[loc.id]||0)*(i.unitCost||0)), 0);

          return (
            <div key={loc.id} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"14px 18px", background:"#f7f7f5", borderBottom:"1px solid #eee" }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1a1a1a" }}>{loc.name}</div>
                <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{locItems.length} items · Est. value {fmt(locValue)}</div>
              </div>

              {/* Shelves */}
              <div style={{ padding:14 }}>
                <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Shelves</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                  {loc.shelves.map(shelf => {
                    const shelfItems = locItems.filter(i=>i.shelf===shelf);
                    return (
                      <div key={shelf} style={{ background: shelfItems.length>0?"#e8f0fb":"#f0f0ee", color: shelfItems.length>0?"#1a4a8a":"#aaa", padding:"4px 10px", borderRadius:6, fontSize:12, fontWeight:600, fontFamily:"monospace", border:`1px solid ${shelfItems.length>0?"#c0d4f0":"#e0e0e0"}` }}
                        title={shelfItems.map(i=>i.name).join(", ")}>
                        {shelf}
                        {shelfItems.length>0 && <span style={{ fontSize:9, marginLeft:4, opacity:0.7 }}>{shelfItems.length}</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Items at this location */}
                {locItems.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Items on Hand</div>
                    {locItems.slice(0,6).map(item => (
                      <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid #f0f0ee", fontSize:12 }}>
                        <div>
                          <span style={{ fontWeight:600, color:"#1a1a1a" }}>{item.name}</span>
                          {item.shelf && <span style={{ fontFamily:"monospace", fontSize:10, color:"#888", marginLeft:6 }}>Shelf {item.shelf}</span>}
                        </div>
                        <span style={{ fontFamily:"monospace", fontWeight:700, color:"#1a5a3a" }}>{item.locationStock[loc.id]} {item.unit}</span>
                      </div>
                    ))}
                    {locItems.length > 6 && <div style={{ fontSize:11, color:"#888", marginTop:6 }}>+{locItems.length-6} more items…</div>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Low Stock ─────────────────────────────────────────────────────────────────
function LowStock({ db }) {
  const items = db.inventoryItems || [];
  const outOfStock = items.filter(i => totalOnHand(i)===0);
  const lowStock   = items.filter(i => i.reorderPoint>0 && totalOnHand(i)>0 && totalOnHand(i)<=i.reorderPoint);

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#1a1a1a" }}>Low Stock Alerts</div>
        <div style={{ fontSize:13, color:"#888", marginTop:3 }}>{outOfStock.length} out of stock · {lowStock.length} below reorder point</div>
      </div>

      {outOfStock.length > 0 && (
        <SectionCard title="Out of Stock" subtitle="Zero quantity on hand — order immediately">
          <Table
            headers={[{ label:"Item" },{ label:"Type" },{ label:"Part #" },{ label:"Vendor" },{ label:"Account Code" },{ label:"Last Unit Cost", right:true }]}
            rows={outOfStock.map(item => {
              const type = ITEM_TYPES.find(t=>t.value===item.type);
              return [
                <span style={{ fontWeight:600, color:"#c0392b" }}>{type?.icon} {item.name}</span>,
                <span style={{ fontSize:11, background:type?.color+"18", color:type?.color, padding:"2px 6px", borderRadius:4 }}>{type?.label}</span>,
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{item.partNumber||"—"}</span>,
                item.vendor||"—",
                <span style={{ fontFamily:"monospace", fontSize:12, color:"#1a3a5c" }}>{item.accountCode||"—"}</span>,
                <span style={{ fontFamily:"monospace" }}>{item.unitCost>0?fmtSm(item.unitCost):"—"}</span>,
              ];
            })}
            emptyMessage="No items out of stock"
          />
        </SectionCard>
      )}

      {lowStock.length > 0 && (
        <SectionCard title="Low Stock" subtitle="At or below reorder point — order soon">
          <Table
            headers={[{ label:"Item" },{ label:"On Hand", right:true },{ label:"Reorder At", right:true },{ label:"Needed", right:true },{ label:"Vendor" },{ label:"Part #" },{ label:"Unit Cost", right:true }]}
            rows={lowStock.map(item => {
              const onHand = totalOnHand(item);
              const type   = ITEM_TYPES.find(t=>t.value===item.type);
              return [
                <span style={{ fontWeight:600, color:"#d97706" }}>{type?.icon} {item.name}</span>,
                <span style={{ fontFamily:"monospace", fontWeight:700, color:"#d97706" }}>{onHand} {item.unit}</span>,
                <span style={{ fontFamily:"monospace" }}>{item.reorderPoint} {item.unit}</span>,
                <span style={{ fontFamily:"monospace", color:"#c0392b", fontWeight:700 }}>{item.reorderPoint-onHand} {item.unit}</span>,
                item.vendor||"—",
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{item.partNumber||"—"}</span>,
                <span style={{ fontFamily:"monospace" }}>{item.unitCost>0?fmtSm(item.unitCost):"—"}</span>,
              ];
            })}
            emptyMessage="Nothing below reorder point"
          />
        </SectionCard>
      )}

      {outOfStock.length===0 && lowStock.length===0 && (
        <div style={{ background:"#e6f4ec", border:"1px solid #a8d5b5", borderRadius:8, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#1a6b35" }}>All items are sufficiently stocked</div>
          <div style={{ fontSize:13, color:"#888", marginTop:6 }}>No items are at or below their reorder points</div>
        </div>
      )}
    </div>
  );
}
