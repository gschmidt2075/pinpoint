import { useState, useMemo, useRef } from "react";
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
export function Field({ label, children, required, style }) {
  return (
    <div style={style}>
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

// ── Label text ────────────────────────────────────────────────────────────────
// Stored values are lower_snake_case because that is what code wants to compare.
// People should never see that. Everything user-facing goes through here.
const SMALL_WORDS = new Set(["a","an","and","by","for","in","of","on","or","the","to","vs"]);
const ALWAYS_CAPS = { pm:"PM", wo:"WO", gl:"GL", vin:"VIN", def:"DEF", psi:"PSI",
                      fema:"FEMA", oem:"OEM", cdl:"CDL", dot:"DOT", hvac:"HVAC",
                      id:"ID", po:"PO", ot:"OT", ac:"A/C", rv:"RV", atv:"ATV" };

export function titleCase(value) {
  if (value == null || value === "") return "";
  return String(value)
    // Underscores only. Hyphens are load-bearing in this domain — 15W-40,
    // F350SD 4X4, W1-1R — and splitting on them corrupts real part numbers.
    .replace(/_+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const bare = word.toLowerCase();
      if (ALWAYS_CAPS[bare]) return ALWAYS_CAPS[bare];
      // Leave anything already carrying capitals alone — "McCloud", "4WD",
      // "15W-40" are written the way they are on purpose.
      if (/[A-Z0-9]/.test(word) && word !== bare) return word;
      if (i > 0 && SMALL_WORDS.has(bare)) return bare;
      return bare.charAt(0).toUpperCase() + bare.slice(1);
    })
    .join(" ");
}

// ── DateField ─────────────────────────────────────────────────────────────────
//
// A native date input makes you land on a segment and step through it, which is
// slow for anything that isn't today — and most of what gets entered here is
// last week's ticket or last month's invoice.
//
// This takes a date the way someone would write one: 8/14/26, 08142026,
// 8-14-2026, or the full 2026-08-14. It tidies up when you leave the field, and
// the calendar button is still there when picking off a calendar is easier.
// Stored value is always ISO yyyy-mm-dd.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayISO = () => iso(new Date());

export function parseLooseDate(text, today = new Date()) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  // Already ISO
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3]);

  // 8/14/26 · 08-14-2026 · 8.14.26
  m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (m) return build(year(m[3]), +m[1], +m[2]);

  // 081426 · 08142026 — typed straight through with no separators
  m = raw.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  if (m) return build(year(m[3]), +m[1], +m[2]);

  // A bare number is a day in the current month — "14" means the 14th.
  m = raw.match(/^(\d{1,2})$/);
  if (m) return build(today.getFullYear(), today.getMonth()+1, +m[1]);

  return null;                       // unparseable — caller keeps the raw text

  function year(y) {
    if (!y) return today.getFullYear();
    const n = +y;
    // Two digits: this century unless that lands far in the future, in which
    // case they meant the last one.
    return y.length <= 2 ? (n + 2000 > today.getFullYear() + 5 ? n + 1900 : n + 2000) : n;
  }
  function build(y, mo, d) {
    if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
    const dt = new Date(y, mo-1, d);
    // Rejects 31 February rather than rolling it into March.
    return (dt.getMonth() === mo-1 && dt.getDate() === d) ? iso(dt) : null;
  }
}

export const formatDateUS = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (value || "");
};

export function DateField({ value, onChange, style = {}, required, disabled, showToday = true }) {
  const [text, setText]    = useState("");
  const [editing, setEditing] = useState(false);
  const [bad, setBad]      = useState(false);
  const nativeRef = useRef(null);

  const shown = editing ? text : formatDateUS(value);

  const commit = (raw) => {
    if (!String(raw).trim()) { onChange(""); setBad(false); return; }
    const parsed = parseLooseDate(raw);
    if (parsed) { onChange(parsed); setBad(false); }
    else setBad(true);
  };

  return (
    <div style={{ position:"relative", display:"flex", gap:6, alignItems:"stretch" }}>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        disabled={disabled}
        placeholder="mm/dd/yyyy"
        onFocus={() => { setEditing(true); setText(formatDateUS(value)); }}
        onChange={(e) => { setText(e.target.value); setBad(false); }}
        onBlur={() => { setEditing(false); commit(text); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { commit(text); setEditing(false); e.currentTarget.blur(); }
          if (e.key === "Escape") { setEditing(false); setText(formatDateUS(value)); setBad(false); }
        }}
        style={{ ...inp, margin:0, flex:1, fontFamily:"monospace",
                 borderColor: bad ? "#c0392b" : (style.borderColor || undefined), ...style }}
      />
      {showToday && (
        <button type="button" title="Today" disabled={disabled}
          onClick={() => { onChange(todayISO()); setBad(false); setEditing(false); }}
          style={{ ...btn.ghost, padding:"0 10px", fontSize:11, whiteSpace:"nowrap" }}>Today</button>
      )}
      <button type="button" title="Pick from a calendar" disabled={disabled}
        onClick={() => { nativeRef.current?.showPicker ? nativeRef.current.showPicker() : nativeRef.current?.focus(); }}
        style={{ ...btn.ghost, padding:"0 10px", fontSize:13 }}>▾</button>
      <input
        ref={nativeRef}
        type="date"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setBad(false); }}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position:"absolute", right:0, bottom:0, width:1, height:1, opacity:0, pointerEvents:"none" }}
      />
      {bad && (
        <div style={{ position:"absolute", top:"100%", left:0, marginTop:2, fontSize:11, color:"#c0392b", whiteSpace:"nowrap", zIndex:5 }}>
          Not a date — try 8/14/26
        </div>
      )}
    </div>
  );
}

// ── MoneyField ────────────────────────────────────────────────────────────────
//
// Greg: "In all dollar entities the decimal should populate if you do not enter
// it manually."
//
// Type 5, leave the field, and it settles as 5.00. Type 5.5 and it settles as
// 5.50. Nothing is corrected WHILE typing, because a field that rewrites itself
// under the cursor is impossible to type into — "5." would become "5.00" before
// the cents were reached.
//
// A `<input type="number">` cannot do this. It also gives every money field a
// spinner nobody wants, scrolls the value when the mouse passes over it, and
// silently reports an empty string for anything it considers malformed. This is
// a text field that knows it holds money.
export function MoneyField({ value, onChange, style = {}, disabled, placeholder = "0.00",
                             allowNegative = false, prefix = "$", decimals = 2 }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  const settled = (value === "" || value === null || value === undefined || Number.isNaN(Number(value)))
    ? "" : Number(value).toFixed(decimals);

  const commit = (raw) => {
    const cleaned = String(raw).replace(/[$,\s]/g, "");
    if (!cleaned) { onChange(""); return; }
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) { onChange(""); return; }
    // Store exactly what is shown. Keeping 5.555 behind a field displaying 5.55
    // means a total that does not add up from the numbers on screen, and an
    // afternoon spent looking for the missing cent.
    const rounded = Number((allowNegative ? n : Math.abs(n)).toFixed(decimals));
    onChange(rounded);
  };

  return (
    <div style={{ position:"relative", display:"flex", alignItems:"stretch" }}>
      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
                     fontSize:13, color:"#999", pointerEvents:"none" }}>{prefix}</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={editing ? text : settled}
        onFocus={() => { setEditing(true); setText(settled); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setEditing(false); commit(text); }}
        onKeyDown={(e) => {
          if (e.key === "Enter")  { commit(text); setEditing(false); e.currentTarget.blur(); }
          if (e.key === "Escape") { setEditing(false); setText(settled); }
        }}
        style={{ ...inp, margin:0, flex:1, paddingLeft:22, textAlign:"right",
                 fontFamily:"ui-monospace, monospace", ...style }}
      />
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
