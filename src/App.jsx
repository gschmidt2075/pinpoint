import { useReducer } from "react";
import FundAccounting from "./modules/FundAccounting.jsx";
import CostAccounting from "./modules/CostAccounting.jsx";
import Inventory from "./modules/Inventory.jsx";
import { FISCAL_YEAR } from "./data/accountCodes.js";

// ── Global State ──────────────────────────────────────────────────────────────
const initialState = {
  expenditures: [], revenue: [], amendments: [],
  vendors: [], contracts: [], employees: [], payroll: [],
  equipment: [], permits: [], projects: [],
  inventoryItems: [], inventoryTransactions: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "ADD_EXPENDITURE":      return { ...state, expenditures: [...state.expenditures, action.payload] };
    case "ADD_REVENUE":          return { ...state, revenue: [...state.revenue, action.payload] };
    case "ADD_AMENDMENT":        return { ...state, amendments: [...state.amendments, action.payload] };
    case "UPDATE_EXP_STATUS":    return { ...state, expenditures: state.expenditures.map(e => e.id===action.payload.id ? { ...e, status:action.payload.status } : e) };
    case "UPDATE_REV_STATUS":    return { ...state, revenue: state.revenue.map(r => r.id===action.payload.id ? { ...r, status:action.payload.status } : r) };
    case "ADD_VENDOR":           return { ...state, vendors: [...state.vendors, action.payload] };
    case "ADD_CONTRACT":         return { ...state, contracts: [...state.contracts, action.payload] };
    case "ADD_EMPLOYEE":         return { ...state, employees: [...state.employees, action.payload] };
    case "ADD_PAYROLL":          return { ...state, payroll: [...state.payroll, action.payload] };
    case "ADD_EQUIPMENT":        return { ...state, equipment: [...state.equipment, action.payload] };
    case "ADD_PERMIT":           return { ...state, permits: [...state.permits, action.payload] };
    case "ADD_PROJECT":          return { ...state, projects: [...state.projects, action.payload] };
    case "UPDATE_PROJECT":       return { ...state, projects: state.projects.map(p => p.id===action.payload.id ? action.payload : p) };
    case "ADD_PROJECT_ENTRY": {
      const { projectId, entryType, entry } = action.payload;
      return { ...state, projects: state.projects.map(p => p.id!==projectId ? p : { ...p, [entryType]:[...(p[entryType]||[]),entry] }) };
    }
    case "ADD_INVENTORY_ITEM":
      return { ...state, inventoryItems: [...state.inventoryItems, action.payload] };
    case "UPDATE_INVENTORY_ITEM":
      return { ...state, inventoryItems: state.inventoryItems.map(i => i.id===action.payload.id ? action.payload : i) };
    case "ADD_INVENTORY_TRANSACTION": {
      const tx   = action.payload;
      const qty  = parseInt(tx.quantity)||0;
      const items = state.inventoryItems.map(item => {
        if (item.id !== tx.itemId) return item;
        const stock = { ...item.locationStock };
        if (tx.type==="receive")   stock[tx.location] = (stock[tx.location]||0) + qty;
        if (tx.type==="issue")     stock[tx.location] = Math.max(0,(stock[tx.location]||0) - qty);
        if (tx.type==="transfer") {
          stock[tx.location]   = Math.max(0,(stock[tx.location]||0) - qty);
          stock[tx.toLocation] = (stock[tx.toLocation]||0) + qty;
        }
        if (tx.type==="adjust")    stock[tx.location] = Math.max(0,(stock[tx.location]||0) + qty);
        return { ...item, locationStock: stock };
      });
      return { ...state, inventoryItems: items, inventoryTransactions: [...state.inventoryTransactions, tx] };
    }
    default: return state;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
const TABS = [
  { id:"fund",       label:"Fund Accounting",    icon:"🏦", color:"#1a3a5c" },
  { id:"cost",       label:"Cost Accounting",    icon:"📐", color:"#6b3a1a" },
  { id:"inventory",  label:"Inventory",          icon:"📦", color:"#1a5a3a" },
  { id:"vendors",    label:"Vendors & Contracts", icon:"📋", color:"#6b3a1a", soon:true },
  { id:"payroll",    label:"Payroll & Personnel", icon:"👷", color:"#1a6b35", soon:true },
  { id:"equipment",  label:"Equipment & Assets",  icon:"🚛", color:"#d97706", soon:true },
  { id:"permitting", label:"Permitting",          icon:"📄", color:"#5a1a8a", soon:true },
  { id:"reporting",  label:"Reporting & Exports", icon:"📊", color:"#1a5a8a", soon:true },
];

function ComingSoon({ tab }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:400, color:"#aaa" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>{tab.icon}</div>
      <div style={{ fontSize:20, fontWeight:700, color:"#555", marginBottom:8 }}>{tab.label}</div>
      <div style={{ fontSize:14, color:"#aaa", maxWidth:320, textAlign:"center" }}>This module is coming next.</div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useReducer((_,id) => id, "fund");
  const [db, dispatch]            = useReducer(reducer, initialState);
  const currentTab = TABS.find(t => t.id===activeTab);

  return (
    <div style={{ minHeight:"100vh", background:"#f5f4f0", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background:"#1a3a5c", color:"#fff" }}>
        <div style={{ padding:"14px 28px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:36, height:36, background:"#2d6a9f", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>📍</div>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>Pinpoint</div>
              <div style={{ fontSize:11, opacity:0.6, letterSpacing:"0.04em" }}>PUBLIC WORKS MANAGEMENT · {FISCAL_YEAR.label}</div>
            </div>
          </div>
          <div style={{ fontSize:12, opacity:0.5 }}>Roads Fund · {FISCAL_YEAR.start} – {FISCAL_YEAR.end}</div>
        </div>
        <div style={{ display:"flex", paddingLeft:16, marginTop:6, overflowX:"auto" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background:"transparent", border:"none",
              color: activeTab===tab.id ? "#fff" : "rgba(255,255,255,0.5)",
              padding:"10px 18px 12px", fontWeight: activeTab===tab.id ? 700 : 400,
              fontSize:13, cursor:"pointer", whiteSpace:"nowrap",
              borderBottom: activeTab===tab.id ? `3px solid ${tab.id==="fund"?"#7ab8e8":tab.color}` : "3px solid transparent",
              display:"flex", alignItems:"center", gap:6,
            }}>
              <span>{tab.icon}</span><span>{tab.label}</span>
              {tab.soon && <span style={{ fontSize:9, background:"rgba(255,255,255,0.15)", padding:"1px 5px", borderRadius:3 }}>SOON</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"28px" }}>
        {activeTab==="fund"      && <FundAccounting db={db} dispatch={dispatch} />}
        {activeTab==="cost"      && <CostAccounting db={db} dispatch={dispatch} />}
        {activeTab==="inventory" && <Inventory db={db} dispatch={dispatch} />}
        {!["fund","cost","inventory"].includes(activeTab) && <ComingSoon tab={currentTab} />}
      </div>

      <div style={{ padding:"14px 28px", borderTop:"1px solid #ddd", background:"#fff", fontSize:11, color:"#aaa", display:"flex", justifyContent:"space-between" }}>
        <span>Pinpoint · County Public Works Management · {FISCAL_YEAR.label}</span>
        <span>In-memory session · connect to SQL Server for persistence</span>
      </div>
    </div>
  );
}
