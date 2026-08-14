import { useState, useMemo } from "react";
// ── Shared UI Components ──────────────────────────────────────────────────────

// ── Icon component ────────────────────────────────────────────────────────────
export function Icon({ name, size=16, color="currentColor", style={} }) {
  return <i className={`ti ti-${name}`} style={{ fontSize:size, color, lineHeight:1, display:"inline-block", verticalAlign:"middle", ...style }} />;
}

// ── Icon + label pill ─────────────────────────────────────────────────────────
export function IconBadge({ icon, label, bg="#f0f0ee", color="#555", size=11 }) {
  return (
    <span style={{ background:bg, color, padding:"2px 8px", borderRadius:4, fontSize:size, fontWeight:600, display:"inline-flex", alignItems:"center", gap:4 }}>
      <Icon name={icon} size={size+1} color={color} />
      {label}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    posted:              { bg:"#e6f4ec", color:"#1a6b35",  icon:"circle-check" },
    approved:            { bg:"#e8f0fb", color:"#1a4a8a",  icon:"thumb-up" },
    pending:             { bg:"#fef3cd", color:"#7a4f00",  icon:"clock" },
    voided:              { bg:"#fdecea", color:"#8c1b18",  icon:"circle-x" },
    active:              { bg:"#e6f4ec", color:"#1a6b35",  icon:"player-play" },
    inactive:            { bg:"#f0f0ee", color:"#666",     icon:"pause" },
    expired:             { bg:"#fdecea", color:"#8c1b18",  icon:"calendar-x" },
    issued:              { bg:"#e8f0fb", color:"#1a4a8a",  icon:"send" },
    planned:             { bg:"#f0f0ee", color:"#666",     icon:"calendar-event" },
    complete:            { bg:"#e8f0fb", color:"#1a4a8a",  icon:"circle-check" },
    on_hold:             { bg:"#fef3cd", color:"#7a4f00",  icon:"pause-circle" },
    superintendent_review:{ bg:"#f3e8ff", color:"#5a1a8a", icon:"user-check" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background:s.bg, color:s.color, padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", display:"inline-flex", alignItems:"center", gap:4 }}>
      <Icon name={s.icon} size={11} color={s.color} />
      {status?.replace(/_/g," ")}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value }) {
  const color = value >= 90 ? "#c0392b" : value >= 75 ? "#d97706" : "#1a6b35";
  return (
    <div style={{ background:"#e8e8e5", borderRadius:3, height:6, width:"100%", overflow:"hidden" }}>
      <div style={{ width:`${Math.min(value,100)}%`, height:"100%", background:color, borderRadius:3, transition:"width 0.4s ease" }} />
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export function KPICard({ label, value, sub, accent, icon }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"18px 22px", borderTop:`3px solid ${accent||"#1a3a5c"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#888" }}>{label}</div>
        {icon && <Icon name={icon} size={18} color={accent||"#1a3a5c"} style={{ opacity:0.4 }} />}
      </div>
      <div style={{ fontSize:24, fontWeight:700, color:accent||"#1a1a1a", fontFamily:"monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, children, required }) {
  return (
    <div>
      <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#444", marginBottom:5, letterSpacing:"0.03em" }}>
        {label}{required && <span style={{ color:"#c0392b", marginLeft:2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
export function SectionCard({ title, subtitle, children, action, icon, className, style }) {
  return (
    <div className={className} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, overflow:"hidden", marginBottom:20, ...style }}>
      <div style={{ padding:"14px 18px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {icon && <Icon name={icon} size={16} color="#888" />}
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>{title}</div>
            {subtitle && <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── SearchSelect ──────────────────────────────────────────────────────────────
//
// A picker you type into. A native <select> across 2,375 parts means scrolling
// for a part number you already know, which is how the parts room actually
// works — nobody browses the catalog, they read the number off the box.
//
// Type any part of the number, name or group; matches narrow as you go. Arrow
// keys move, Enter picks, Escape closes. Rows that can't be chosen (out of
// stock) are shown greyed rather than hidden, because "it's there but empty"
// and "it doesn't exist" are different answers to different questions.
export function SearchSelect({
  items = [],
  value = "",
  onChange,
  getKey     = (i) => i.id,
  getLabel   = (i) => i.name,
  getSearch  = (i) => i.name,
  renderRow,
  isDisabled = () => false,
  placeholder = "Type to search…",
  emptyMessage = "Nothing matches",
  maxRows = 60,
  autoFocus = false,
}) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(0);

  const selected = items.find(i => String(getKey(i)) === String(value)) || null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, maxRows);
    // Every whitespace-separated term must appear somewhere, so "cat filter"
    // finds a Cat filter without depending on word order.
    const terms = q.split(/\s+/);
    const out = [];
    for (const i of items) {
      const hay = String(getSearch(i)).toLowerCase();
      if (terms.every(t => hay.includes(t))) out.push(i);
      if (out.length >= maxRows) break;
    }
    return out;
  }, [items, query, getSearch, maxRows]);

  const total = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.length;
    const terms = q.split(/\s+/);
    return items.reduce((n,i) =>
      terms.every(t => String(getSearch(i)).toLowerCase().includes(t)) ? n+1 : n, 0);
  }, [items, query, getSearch]);

  const pick = (item) => {
    if (!item || isDisabled(item)) return;
    onChange(getKey(item));
    setQuery(""); setOpen(false); setCursor(0);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c+1, matches.length-1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c-1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); pick(matches[cursor]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div style={{ position:"relative" }}>
      <div style={{ display:"flex", gap:6 }}>
        <input
          type="text"
          value={open ? query : (selected ? getLabel(selected) : query)}
          autoFocus={autoFocus}
          onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(0); }}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{ ...inp, margin:0, flex:1, fontFamily: selected ? "inherit" : undefined }}
        />
        {selected && (
          <button type="button" onMouseDown={e=>e.preventDefault()}
            onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
            title="Clear"
            style={{ ...btn.ghost, padding:"0 12px", fontSize:13 }}>×</button>
        )}
      </div>

      {open && (
        <div style={{
          position:"absolute", top:"100%", left:0, right:0, zIndex:40, marginTop:2,
          background:"#fff", border:"1px solid #ccc", borderRadius:6,
          boxShadow:"0 6px 18px rgba(0,0,0,0.12)", maxHeight:280, overflowY:"auto",
        }}>
          {matches.length === 0 && (
            <div style={{ padding:"14px 12px", fontSize:12, color:"#999" }}>{emptyMessage}</div>
          )}
          {matches.map((i, n) => {
            const off = isDisabled(i);
            return (
              <div
                key={getKey(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(i)}
                onMouseEnter={() => setCursor(n)}
                style={{
                  padding:"7px 11px", fontSize:12, cursor: off ? "not-allowed" : "pointer",
                  background: n === cursor && !off ? "#eef2f8" : "transparent",
                  color: off ? "#bbb" : "#1a1a1a",
                  borderBottom:"1px solid #f4f4f2",
                }}>
                {renderRow ? renderRow(i, off) : getLabel(i)}
              </div>
            );
          })}
          {total > matches.length && (
            <div style={{ padding:"7px 11px", fontSize:11, color:"#999", background:"#fafaf8" }}>
              {total - matches.length} more — keep typing to narrow
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ headers, rows, emptyMessage="No records found" }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:"#f7f7f5" }}>
            {headers.map((h,i)=>(
              <th key={i} style={{ padding:"9px 14px", textAlign:h.right?"right":"left", fontWeight:600, fontSize:11, letterSpacing:"0.05em", textTransform:"uppercase", color:"#666", whiteSpace:"nowrap", borderBottom:"1px solid #eee" }}>
                {h.icon && <Icon name={h.icon} size={12} color="#888" style={{ marginRight:4 }} />}
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length===0 ? (
            <tr><td colSpan={headers.length} style={{ padding:"32px", textAlign:"center", color:"#aaa", fontSize:13 }}>{emptyMessage}</td></tr>
          ) : rows.map((row,i)=>(
            <tr key={i} style={{ borderTop:"1px solid #eee", background:i%2===0?"#fff":"#fafaf8" }}>
              {row.map((cell,j)=>(
                <td key={j} style={{ padding:"10px 14px", textAlign:headers[j]?.right?"right":"left", ...headers[j]?.cellStyle }}>
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

// ── Alert bar ─────────────────────────────────────────────────────────────────
export function AlertBar({ message, type="warning" }) {
  const styles = {
    warning: { bg:"#fef3cd", border:"#f0d080", color:"#7a4f00", icon:"alert-triangle" },
    danger:  { bg:"#fdecea", border:"#f5c6c6", color:"#8c1b18", icon:"alert-circle" },
    info:    { bg:"#e8f0fb", border:"#c0d4f0", color:"#1a4a8a", icon:"info-circle" },
    success: { bg:"#e6f4ec", border:"#a8d5b5", color:"#1a6b35", icon:"circle-check" },
  };
  const s = styles[type]||styles.warning;
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:8, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10, fontSize:13, color:s.color, fontWeight:600 }}>
      <Icon name={s.icon} size={16} color={s.color} />
      {message}
    </div>
  );
}

// ── Stat row ──────────────────────────────────────────────────────────────────
export function StatRow({ items }) {
  return (
    <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
      {items.map((item,i)=>(
        <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
          {item.icon && <Icon name={item.icon} size={14} color={item.color||"#888"} />}
          <span style={{ fontSize:12, color:"#888" }}>{item.label}:</span>
          <span style={{ fontSize:12, fontWeight:700, color:item.color||"#1a1a1a", fontFamily:item.mono?"monospace":"inherit" }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Inputs / buttons ──────────────────────────────────────────────────────────
export const inp = {
  width:"100%", boxSizing:"border-box", padding:"9px 11px",
  border:"1px solid #ccc", borderRadius:6, fontSize:13,
  color:"#1a1a1a", background:"#fff", fontFamily:"inherit", lineHeight:1.4,
};

export const btn = {
  primary:   { background:"#1a3a5c", color:"#fff", border:"none", borderRadius:6, padding:"10px 24px", fontWeight:700, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 },
  secondary: { background:"#fff", color:"#1a3a5c", border:"1px solid #1a3a5c", borderRadius:6, padding:"10px 20px", fontWeight:600, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 },
  ghost:     { background:"transparent", color:"#666", border:"1px solid #ccc", borderRadius:6, padding:"10px 18px", fontWeight:600, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 },
  danger:    { background:"#fdecea", color:"#c0392b", border:"1px solid #f5c6c6", borderRadius:6, padding:"10px 18px", fontWeight:600, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 },
  small:     { background:"#1a3a5c", color:"#fff", border:"none", borderRadius:5, padding:"6px 14px", fontWeight:600, fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 },
};

export const fmt   = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits:0, maximumFractionDigits:0 });
export const fmtSm = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
export const pct   = (a,b) => b > 0 ? Math.min(100, Math.round((a/b)*100)) : 0;
export const today = () => new Date().toISOString().split("T")[0];
