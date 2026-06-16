import { useReducer, useState } from "react";
import FundAccounting from "./modules/FundAccounting.jsx";
import CostAccounting from "./modules/CostAccounting.jsx";
import Inventory from "./modules/Inventory.jsx";
import Equipment from "./modules/Equipment.jsx";
import Infrastructure from "./modules/Infrastructure.jsx";
import Projects from "./modules/Projects.jsx";
import Settings from "./modules/Settings.jsx";
import { FISCAL_YEAR } from "./data/accountCodes.js";
import { Icon } from "./components/shared.jsx";

// ── Global State ──────────────────────────────────────────────────────────────
const initialState = {
  expenditures: [], revenue: [], amendments: [],
  vendors: [], contracts: [], employees: [], payroll: [],
  equipment: [], permits: [], projects: [],
  inventoryItems: [], inventoryTransactions: [],
  fuelLogs: [], pmLogs: [],
  roads: [], bridges: [], structures: [], signs: [], signHistory: [],
  customFunds: [],
  townships: [], locations: [], countyInfo: {}, fiscalYear: null, customAccountCodes: {}, femaRates: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "ADD_EXPENDITURE":      return { ...state, expenditures: [...state.expenditures, action.payload] };
    case "ADD_REVENUE":          return { ...state, revenue: [...state.revenue, action.payload] };
    case "ADD_AMENDMENT":        return { ...state, amendments: [...state.amendments, action.payload] };
    case "UPDATE_EXP_STATUS":    return { ...state, expenditures: state.expenditures.map(e => e.id===action.payload.id ? { ...e, status:action.payload.status } : e) };
    case "UPDATE_EXPENDITURE":   return { ...state, expenditures: state.expenditures.map(e => e.id===action.payload.id ? { ...action.payload } : e) };
    case "UPDATE_REV_STATUS":    return { ...state, revenue: state.revenue.map(r => r.id===action.payload.id ? { ...r, status:action.payload.status } : r) };
    case "ADD_VENDOR":           return { ...state, vendors: [...state.vendors, action.payload] };
    case "ADD_CONTRACT":         return { ...state, contracts: [...state.contracts, action.payload] };
    case "ADD_EMPLOYEE":         return { ...state, employees: [...state.employees, action.payload] };
    case "ADD_PAYROLL":          return { ...state, payroll: [...state.payroll, action.payload] };
    case "ADD_EQUIPMENT":        return { ...state, equipment: [...state.equipment, action.payload] };
    case "UPDATE_EQUIPMENT_STATUS": return { ...state, equipment: state.equipment.map(u => u.id===action.payload.id ? { ...u, status:action.payload.status } : u) };
    case "ADD_PM_SCHEDULE":      return { ...state, equipment: state.equipment.map(u => u.id!==action.payload.unitId ? u : { ...u, pmSchedule:[...(u.pmSchedule||[]), action.payload.pm] }) };
    case "ADD_PM_LOG":           return { ...state, pmLogs: [...state.pmLogs, action.payload] };
    case "ADD_FUEL_LOG":         return { ...state, fuelLogs: [...state.fuelLogs, action.payload] };
    case "ADD_PERMIT":           return { ...state, permits: [...state.permits, action.payload] };
    case "ADD_PROJECT":          return { ...state, projects: [...state.projects, action.payload] };
    case "UPDATE_PROJECT":       return { ...state, projects: state.projects.map(p => p.id===action.payload.id ? action.payload : p) };
    case "ADD_PROJECT_ENTRY": {
      const { projectId, entryType, entry } = action.payload;
      return { ...state, projects: state.projects.map(p => p.id!==projectId ? p : { ...p, [entryType]:[...(p[entryType]||[]),entry] }) };
    }
    case "ADD_INVENTORY_ITEM":   return { ...state, inventoryItems: [...state.inventoryItems, action.payload] };
    case "UPDATE_INVENTORY_ITEM":return { ...state, inventoryItems: state.inventoryItems.map(i => i.id===action.payload.id ? action.payload : i) };
    case "ADD_INVENTORY_TRANSACTION": {
      const tx  = action.payload;
      const qty = parseInt(tx.quantity)||0;
      const items = state.inventoryItems.map(item => {
        if (item.id !== tx.itemId) return item;
        const stock = { ...item.locationStock };
        if (tx.type==="receive")   stock[tx.location] = (stock[tx.location]||0) + qty;
        if (tx.type==="issue")     stock[tx.location] = Math.max(0,(stock[tx.location]||0) - qty);
        if (tx.type==="transfer") { stock[tx.location]=Math.max(0,(stock[tx.location]||0)-qty); stock[tx.toLocation]=(stock[tx.toLocation]||0)+qty; }
        if (tx.type==="adjust")    stock[tx.location] = Math.max(0,(stock[tx.location]||0) + qty);
        return { ...item, locationStock: stock };
      });
      return { ...state, inventoryItems: items, inventoryTransactions: [...state.inventoryTransactions, tx] };
    }
    case "ADD_ROAD":         return { ...state, roads:      [...state.roads,      action.payload] };
    case "UPDATE_ROAD":      return { ...state, roads:      state.roads.map(r      => r.id===action.payload.id ? action.payload : r) };
    case "ADD_BRIDGE":       return { ...state, bridges:    [...state.bridges,    action.payload] };
    case "UPDATE_BRIDGE":    return { ...state, bridges:    state.bridges.map(b    => b.id===action.payload.id ? action.payload : b) };
    case "ADD_STRUCTURE":    return { ...state, structures: [...state.structures, action.payload] };
    case "UPDATE_STRUCTURE": return { ...state, structures: state.structures.map(s => s.id===action.payload.id ? action.payload : s) };
    case "ADD_SIGN":         return { ...state, signs:      [...state.signs,      action.payload] };
    case "UPDATE_SIGN":      return { ...state, signs:      state.signs.map(s      => s.id===action.payload.id ? action.payload : s) };
    case "ADD_SIGN_HISTORY":    return { ...state, signHistory:[...state.signHistory, action.payload] };
    case "ADD_CUSTOM_FUND":    return { ...state, customFunds:[...state.customFunds, action.payload] };
    case "REMOVE_CUSTOM_FUND":    return { ...state, customFunds:state.customFunds.filter(f=>f!==action.payload) };
    case "UPDATE_COUNTY_INFO":    return { ...state, countyInfo:action.payload };
    case "SET_FISCAL_YEAR":       return { ...state, fiscalYear:action.payload };
    case "UPDATE_ACCOUNT_CODE":   return { ...state, customAccountCodes:{ ...state.customAccountCodes, [action.payload.code]:action.payload } };
    case "ADD_TOWNSHIP":          return { ...state, townships:[...(state.townships||[]), action.payload] };
    case "REMOVE_TOWNSHIP":       return { ...state, townships:(state.townships||[]).filter(t=>t!==action.payload) };
    case "ADD_LOCATION":          return { ...state, locations:[...(state.locations||[]), action.payload] };
    case "REMOVE_LOCATION":       return { ...state, locations:(state.locations||[]).filter(l=>l.id!==action.payload) };
    default: return state;
  }
}

// ── Navigation config ─────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Finance",
    items: [
      { id:"fund",           label:"Fund Accounting",   icon:"ti-building-bank" },
      { id:"cost",           label:"Cost Accounting",   icon:"ti-calculator" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id:"inventory",      label:"Inventory",         icon:"ti-package" },
      { id:"equipment",      label:"Equipment",         icon:"ti-tractor" },
      { id:"infrastructure", label:"Infrastructure",    icon:"ti-road" },
      { id:"projects",       label:"Projects",          icon:"ti-clipboard-list" },
      { id:"payroll",        label:"Payroll",           icon:"ti-users",        soon:true },
      { id:"vendors",        label:"Vendors",           icon:"ti-file-invoice", soon:true },
    ],
  },
  {
    label: "Admin",
    items: [
      { id:"permitting",     label:"Permitting",        icon:"ti-license",      soon:true },
      { id:"reporting",      label:"Reporting",         icon:"ti-chart-bar",    soon:true },
      { id:"settings",       label:"Settings",          icon:"ti-settings",     adminOnly:true },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap(g => g.items);

// ── Module colors ─────────────────────────────────────────────────────────────
const MODULE_COLORS = {
  fund:"#1a3a5c", cost:"#6b3a1a", inventory:"#1a5a3a",
  equipment:"#d97706", payroll:"#1a6b35", vendors:"#6b3a1a",
  permitting:"#5a1a8a", reporting:"#1a5a8a",
};

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoon({ tab }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:400, color:"#aaa" }}>
      <Icon name={(tab?.icon||"").replace("ti-","")} size={48} color="#ddd" style={{ display:"block", marginBottom:16 }} />
      <div style={{ fontSize:20, fontWeight:700, color:"#555", marginBottom:8 }}>{tab?.label}</div>
      <div style={{ fontSize:14, color:"#aaa", maxWidth:320, textAlign:"center" }}>This module is coming next.</div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("fund");
  const [role, setRole] = useState("superintendent"); // superintendent | staff
  const [db, dispatch]            = useReducer(reducer, initialState);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const currentTab = ALL_TABS.find(t=>t.id===activeTab);

  return (
    <div style={{ minHeight:"100vh", background:"#f5f4f0", fontFamily:"'Segoe UI', system-ui, sans-serif", display:"flex", flexDirection:"column" }}>

      {/* Top header */}
      <div style={{ background:"#1a3a5c", color:"#fff", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={()=>setSidebarOpen(o=>!o)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:18, padding:"4px 6px", borderRadius:4 }}>
<Icon name="menu-2" size={18} color="rgba(255,255,255,0.7)" />
          </button>
          <div style={{ width:30, height:30, background:"#2d6a9f", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📍</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, lineHeight:1.2 }}>Pinpoint</div>
            <div style={{ fontSize:10, opacity:0.55, letterSpacing:"0.04em" }}>PUBLIC WORKS MANAGEMENT · {FISCAL_YEAR.label}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:12, opacity:0.5 }}>Roads Fund · {FISCAL_YEAR.start} – {FISCAL_YEAR.end}</div>
            <div style={{ display:"flex", background:"rgba(255,255,255,0.1)", borderRadius:6, padding:2 }}>
              {["superintendent","staff"].map(r=>(
                <button key={r} onClick={()=>setRole(r)} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, border:"none", borderRadius:4, cursor:"pointer", background:role===r?"#fff":"transparent", color:role===r?"#1a3a5c":"rgba(255,255,255,0.6)", textTransform:"capitalize" }}>{r==="superintendent"?"Superintendent":"Staff"}</button>
              ))}
            </div>
          </div>
          <div style={{ width:30, height:30, background:"rgba(255,255,255,0.15)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className="ti ti-user" style={{ fontSize:15, color:"#fff" }} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ width:190, background:"#fff", borderRight:"1px solid #e8e8e5", flexShrink:0, overflowY:"auto", paddingTop:8 }}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#aaa", padding:"8px 16px 4px" }}>{group.label}</div>
                {group.items.filter(item=>!item.adminOnly||role==="superintendent").map(item => (
                  <button key={item.id} onClick={() => !item.soon && setActiveTab(item.id)} style={{
                    display:"flex", alignItems:"center", gap:10, width:"100%",
                    padding:"9px 16px", background: activeTab===item.id?"#eef2f8":"transparent",
                    border:"none", cursor: item.soon?"default":"pointer", textAlign:"left",
                    color: activeTab===item.id?"#1a3a5c": item.soon?"#ccc":"#444",
                    fontWeight: activeTab===item.id?700:400, fontSize:13,
                    borderLeft: activeTab===item.id?"3px solid #1a3a5c":"3px solid transparent",
                    opacity: item.soon?0.5:1,
                  }}>
                    <Icon name={item.icon.replace("ti-","")} size={16} color={activeTab===item.id?"#1a3a5c":"#888"} />
                    <span style={{ flex:1 }}>{item.label}</span>
                    {item.soon && <span style={{ fontSize:9, background:"#f0f0ee", color:"#aaa", padding:"1px 5px", borderRadius:3 }}>SOON</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
          {activeTab==="fund"      && <FundAccounting db={db} dispatch={dispatch} />}
          {activeTab==="cost"      && <CostAccounting db={db} dispatch={dispatch} />}
          {activeTab==="inventory" && <Inventory db={db} dispatch={dispatch} />}
          {activeTab==="equipment"      && <Equipment db={db} dispatch={dispatch} />}
          {activeTab==="infrastructure" && <Infrastructure db={db} dispatch={dispatch} />}
          {activeTab==="projects"       && <Projects db={db} dispatch={dispatch} />}
          {activeTab==="settings"      && <Settings db={db} dispatch={dispatch} />}
          {!["fund","cost","inventory","equipment","infrastructure","projects","settings"].includes(activeTab) && <ComingSoon tab={currentTab} />}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:"10px 24px", borderTop:"1px solid #ddd", background:"#fff", fontSize:11, color:"#aaa", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
        <span>Pinpoint · County Public Works Management · {FISCAL_YEAR.label}</span>
        <span>In-memory session · connect to SQL Server for persistence</span>
      </div>
    </div>
  );
}
