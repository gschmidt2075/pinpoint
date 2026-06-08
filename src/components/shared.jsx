// ── Shared UI Components ──────────────────────────────────────────────────────

export function StatusBadge({ status }) {
  const map = {
    posted:    { bg: "#e6f4ec", color: "#1a6b35" },
    approved:  { bg: "#e8f0fb", color: "#1a4a8a" },
    pending:   { bg: "#fef3cd", color: "#7a4f00" },
    voided:    { bg: "#fdecea", color: "#8c1b18" },
    active:    { bg: "#e6f4ec", color: "#1a6b35" },
    inactive:  { bg: "#f0f0ee", color: "#666" },
    expired:   { bg: "#fdecea", color: "#8c1b18" },
    issued:    { bg: "#e8f0fb", color: "#1a4a8a" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {status}
    </span>
  );
}

export function ProgressBar({ value }) {
  const color = value >= 90 ? "#c0392b" : value >= 75 ? "#d97706" : "#1a6b35";
  return (
    <div style={{ background: "#e8e8e5", borderRadius: 3, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
    </div>
  );
}

export function KPICard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "18px 22px", borderTop: `3px solid ${accent || "#1a3a5c"}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 5, letterSpacing: "0.03em" }}>
        {label}{required && <span style={{ color: "#c0392b", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function SectionCard({ title, subtitle, children, action }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Table({ headers, rows, emptyMessage = "No records found" }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f7f7f5" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "9px 14px", textAlign: h.right ? "right" : "left", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#666", whiteSpace: "nowrap", borderBottom: "1px solid #eee" }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: "32px", textAlign: "center", color: "#aaa", fontSize: 13 }}>{emptyMessage}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid #eee", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "10px 14px", textAlign: headers[j]?.right ? "right" : "left", ...headers[j]?.cellStyle }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccc", borderRadius: 6, fontSize: 13,
  color: "#1a1a1a", background: "#fff", fontFamily: "inherit", lineHeight: 1.4,
};

export const btn = {
  primary: { background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 6, padding: "10px 24px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  secondary: { background: "#fff", color: "#1a3a5c", border: "1px solid #1a3a5c", borderRadius: 6, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  ghost: { background: "transparent", color: "#666", border: "1px solid #ccc", borderRadius: 6, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  danger: { background: "#fdecea", color: "#c0392b", border: "1px solid #f5c6c6", borderRadius: 6, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  small:  { background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" },
};

export const fmt    = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const fmtSm  = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct    = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
export const today  = () => new Date().toISOString().split("T")[0];
