// The invoice document itself — pure string building, no React.
//
// Split out from Invoice.jsx so it can be run and LOOKED AT without a browser.
// A layout nobody has actually seen printed is a layout that is wrong.
//
//     node scripts/sample-invoice.mjs   → writes a filled-in sample to open

const money  = (n, dp = 2) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const esc    = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

export const periodLabel = (p) => {
  if (!p) return "";
  const [y, m] = String(p).split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month:"long", year:"numeric" });
};

// The sentence at the foot. Generated, and then editable — Greg's call, because
// the reason for the bill is not always "fuel for the month" and a locked
// sentence would send somebody back to Excel the first time it wasn't.
export const defaultNote = (lines, period) => {
  const fuels = [...new Set(lines.map(l => l.label.toLowerCase()))];
  const what  = fuels.length === 1 ? fuels[0]
              : fuels.slice(0, -1).join(", ") + " and " + fuels[fuels.length - 1];
  return `The above invoice reflects the amount due for ${what} used for the month of ${periodLabel(period)}.  Thank you.`;
};

export function invoiceHTML({ info = {}, department, period, lines = [], note, dateStr }) {
  const dept    = info.deptName   || "County Highway Department";
  const county  = info.countyName || info.name || "";
  const payTo   = county ? `${county} ${dept}` : dept;
  const total   = lines.reduce((s, l) => s + l.amount, 0);
  const address = [info.address, [info.city, info.state].filter(Boolean).join(", ") + (info.zip ? " " + info.zip : "")]
                  .filter(t => t && t.trim() && t.trim() !== ",");
  const contact = [
    [info.phone && `Phone ${info.phone}`, info.fax && `Fax ${info.fax}`].filter(Boolean).join("   "),
    info.email,
  ].filter(Boolean);

  // Fifteen line slots on the paper original, so the box is the same height
  // whether it carries one line or ten. A short invoice that looks like a
  // fragment of a longer one is the kind of thing that gets queried.
  const BLANKS = Math.max(0, 8 - lines.length);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice — ${esc(department)} — ${esc(periodLabel(period))}</title>
<style>
  @page { margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 12pt; color:#000;
         margin:0; padding:0.15in 0.1in; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; }
  h1 { font-size:36pt; font-weight:700; margin:0 0 14px; letter-spacing:0.5px; }
  .from div { line-height:1.35; }
  .date { text-align:right; white-space:nowrap; padding-top:6px; }
  .date b { font-weight:700; }
  .date span { display:inline-block; min-width:1.6in; border-bottom:1px solid #000; margin-left:8px; text-align:center; }
  .to { margin:26px 0 6px; }
  .to .lbl { font-weight:700; letter-spacing:0.5px; }
  .to .who { font-size:13pt; margin-top:3px; min-height:1.1em; border-bottom:1px solid #000; max-width:3.6in; padding-bottom:2px; }
  table { width:100%; border-collapse:collapse; margin-top:22px; }
  th { font-weight:700; text-align:center; border:1px solid #000; padding:5px 8px; background:#f2f2f2; }
  td { border:1px solid #000; padding:5px 8px; height:26px; }
  td.q { text-align:center; width:1.1in; }
  td.p, td.a { text-align:right; width:1.25in; font-variant-numeric: tabular-nums; }
  tfoot td { border:none; }
  tfoot td.lbl { text-align:right; font-weight:700; padding-right:12px; }
  tfoot td.val { text-align:right; border:1px solid #000; font-variant-numeric: tabular-nums; }
  tfoot tr.total td.lbl { font-size:13pt; }
  tfoot tr.total td.val { font-weight:700; font-size:13pt; }
  .payable { text-align:center; font-weight:700; margin:30px 0 0; }
  .note { margin-top:18px; line-height:1.5; white-space:pre-wrap; }
  .est { margin-top:22px; font-size:8.5pt; color:#666; font-style:italic; }
</style></head><body>
  <div class="top">
    <div>
      <h1>INVOICE</h1>
      <div class="from">
        <div><b>${esc(payTo)}</b></div>
        ${address.map(a => `<div>${esc(a)}</div>`).join("")}
        ${contact.map(c => `<div>${esc(c)}</div>`).join("")}
      </div>
    </div>
    <div class="date"><b>Date :</b><span>${esc(dateStr)}</span></div>
  </div>

  <div class="to">
    <div class="lbl">TO</div>
    <div class="who">${esc(department)}</div>
  </div>

  <table>
    <thead><tr><th>Quantity</th><th>Description</th><th>Unit Price</th><th>Line Total</th></tr></thead>
    <tbody>
      ${lines.map(l => `<tr>
        <td class="q">${l.gallons.toLocaleString(undefined,{ maximumFractionDigits:1 })}</td>
        <td>${esc(l.description)}</td>
        <td class="p">${money(l.unitCost, 4)}</td>
        <td class="a">${money(l.amount)}</td></tr>`).join("")}
      ${Array.from({ length: BLANKS }, () => `<tr><td class="q">&nbsp;</td><td></td><td class="p"></td><td class="a"></td></tr>`).join("")}
    </tbody>
    <tfoot>
      <tr><td colspan="2"></td><td class="lbl">Subtotal</td><td class="val">${money(total)}</td></tr>
      <tr class="total"><td colspan="2"></td><td class="lbl">TOTAL</td><td class="val">${money(total)}</td></tr>
    </tfoot>
  </table>

  <p class="payable">Make all checks payable to ${esc(payTo)}</p>
  <div class="note">${esc(note)}</div>
</body></html>`;
}

