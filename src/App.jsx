import { useReducer } from "react";
import FundAccounting from "./modules/FundAccounting.jsx";
import { FISCAL_YEAR } from "./data/accountCodes.js";

// ── Global State ──────────────────────────────────────────────────────────────
const initialState = {
  expenditures: [],
  revenue:      [],
  amendments:   [],
  vendors:      [],
  contracts:    [],
  employees:    [],
  payroll:      [],
  equipment:    [],
  permits:      [],
};

function reducer(state, action) {
  switch (action.type) {
    case "ADD_EXPENDITURE":
      return { ...state, expenditures: [...state.expenditures, action.payload] };
    case "ADD_REVENUE":
      return { ...state, revenue: [...state.revenue, action.payload] };
    case "ADD_AMENDMENT":
      return { ...state, amendments: [...state.amendments, action.payload] };
    case "UPDATE_EXP_STATUS":
      return { ...state, expenditures: state.expenditures.map(e => e.id === action.payload.id ? { ...e, status: action.payload.status } : e) };
    case "UPDATE_REV_STATUS":
      return { ...state, revenue: state.revenue.map(r => r.id === action.payload.id ? { ...r, status: action.payload.status } : r) };
    case "ADD_VENDOR":
      return { ...state, vendors: [...state.vendors, action.payload] };
    case "ADD_CONTRACT":
      return { ...state, contracts: [...state.contracts, action.payload] };
    case "ADD_EMPLOYEE":
      return { ...state, employees: [...state.employees, action.payload] };
    case "ADD_PAYROLL":
      return { ...state, payroll: [...state.payroll, action.payload] };
    case "ADD_EQUIPMENT":
      return { ...state, equipment: [...state.equipment, action.payload] };
    case "ADD_PERMIT":
      return { ...state, permits: [...state.permits, action.payload] };
    default:
      return state;
  }
}

// ── Navigation tabs ───────────────────────────────────────────────────────────
const TABS = [
  { id: "fund",       label: "Fund Accounting",    icon: "🏦", color: "#1a3a5c" },
  { id: "vendors",    label: "Vendors & Contracts", icon: "📋", color: "#6b3a1a", soon: true },
  { id: "payroll",    label: "Payroll & Personnel", icon: "👷", color: "#1a6b35", soon: true },
  { id: "equipment",  label: "Equipment & Assets",  icon: "🚛", color: "#d97706", soon: true },
  { id: "permitting", label: "Permitting",           icon: "📄", color: "#5a1a8a", soon: true },
  { id: "reporting",  label: "Reporting & Exports",  icon: "📊", color: "#1a5a8a", soon: true },
];

// ── Coming Soon placeholder ───────────────────────────────────────────────────
function ComingSoon({ tab }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "#aaa" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{tab.icon}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#555", marginBottom: 8 }}>{tab.label}</div>
      <div style={{ fontSize: 14, color: "#aaa", maxWidth: 320, textAlign: "center" }}>
        This module is being built next. Fund Accounting is active — use the tab above to get started.
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useReducer((_, id) => id, "fund");
  const [db, dispatch]            = useReducer(reducer, initialState);

  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f4f0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#1a3a5c", color: "#fff" }}>
        <div style={{ padding: "14px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 36, background: "#2d6a9f", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏛️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "0.01em" }}>County Public Works</div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.04em" }}>FINANCIAL MANAGEMENT SYSTEM · {FISCAL_YEAR.label}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.5 }}>Roads Fund · {FISCAL_YEAR.start} – {FISCAL_YEAR.end}</div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", paddingLeft: 16, marginTop: 6, overflowX: "auto" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: "transparent", border: "none", color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.5)",
              padding: "10px 18px 12px", fontWeight: activeTab === tab.id ? 700 : 400,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              borderBottom: activeTab === tab.id ? `3px solid ${tab.color === "#1a3a5c" ? "#7ab8e8" : tab.color}` : "3px solid transparent",
              display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.01em",
            }}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.soon && <span style={{ fontSize: 9, background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em" }}>SOON</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Module content */}
      <div style={{ padding: "28px 28px" }}>
        {activeTab === "fund"       && <FundAccounting db={db} dispatch={dispatch} />}
        {activeTab !== "fund"       && <ComingSoon tab={currentTab} />}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 28px", borderTop: "1px solid #ddd", background: "#fff", fontSize: 11, color: "#aaa", display: "flex", justifyContent: "space-between" }}>
        <span>County Public Works Financial Management System · {FISCAL_YEAR.label} · Roads Fund</span>
        <span>In-memory session · connect to SQL Server for persistence</span>
      </div>
    </div>
  );
}
