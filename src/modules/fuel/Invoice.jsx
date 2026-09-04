import { useState, useMemo } from "react";
import { btn } from "../../components/shared.jsx";
import { invoiceHTML, defaultNote, periodLabel } from "./invoiceDoc.js";

// ── The department fuel invoice ───────────────────────────────────────────────
//
// Greg sent the blank the office actually uses. It is a Microsoft service
// invoice the county adapted years ago, and what matters is that the other
// departments have been receiving that shape for a long time. Reproducing it
// beats inventing something better, so this is built from the template rather
// than from taste:
//
//   INVOICE, large, top left
//   the department's own letterhead block beside it, and "Date :" on the right
//   TO — who is being billed
//   Quantity · Description · Unit Price · Line Total
//   Subtotal, then TOTAL
//   "Make all checks payable to …"
//   a closing sentence naming the fuel and the month
//
// The county's copy has no invoice number and no tax line in use. Greg
// confirmed both: no numbering, billed at cost.
//
// It renders into an IFRAME rather than the page. The preview and the printed
// sheet are then the same document, not two layouts that have to be kept in
// step, and none of the application's own styling can leak into something
// going out to another department.

export { invoiceHTML, defaultNote, periodLabel };

// One department, one month, ready to print or save as PDF.
export function InvoicePanel({ info, department, period, lines, onClose }) {
  const [dateStr, setDateStr] = useState(() => new Date().toLocaleDateString());
  const [note, setNote]       = useState(() => defaultNote(lines, period));

  const html = useMemo(
    () => invoiceHTML({ info, department, period, lines, note, dateStr }),
    [info, department, period, lines, note, dateStr]);

  // A separate window rather than printing the page. The application's own
  // stylesheet then cannot reach the sheet that goes to another department,
  // and "Save as PDF" from that window is the thing to attach to an email.
  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { alert("Allow pop-ups for this site to print the invoice."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <div onClick={onClose}
         style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:9998,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background:"#fff", borderRadius:10, width:"100%", maxWidth:920, maxHeight:"92vh",
                    display:"flex", flexDirection:"column", overflow:"hidden",
                    boxShadow:"0 16px 48px rgba(0,0,0,0.3)" }}>

        <div style={{ padding:"14px 20px", borderBottom:"1px solid #eee", display:"flex",
                      justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>{department}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{periodLabel(period)} · fuel invoice</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={print} style={btn.primary}>Print / Save as PDF</button>
            <button onClick={onClose} style={btn.ghost}>Close</button>
          </div>
        </div>

        <div style={{ padding:"12px 20px", borderBottom:"1px solid #eee", background:"#fafaf8",
                      display:"grid", gridTemplateColumns:"170px 1fr", gap:12, alignItems:"start" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:"#666", marginBottom:4 }}>Date on the invoice</div>
            <input value={dateStr} onChange={e => setDateStr(e.target.value)}
                   style={{ width:"100%", padding:"6px 8px", border:"1px solid #ccc", borderRadius:4, fontSize:12 }} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:"#666", marginBottom:4 }}>
              Closing sentence — written for you, change it if it needs changing
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                      style={{ width:"100%", padding:"6px 8px", border:"1px solid #ccc", borderRadius:4,
                               fontSize:12, resize:"vertical", fontFamily:"inherit" }} />
          </div>
        </div>

        {/* The preview IS the document — same HTML, same stylesheet. */}
        <iframe title="Invoice preview" srcDoc={html}
                style={{ flex:1, minHeight:520, border:"none", background:"#fff" }} />
      </div>
    </div>
  );
}
