// ── Fuel — shared helpers ─────────────────────────────────────────────────────

export const today = () => new Date().toISOString().split("T")[0];

export function fmtDate(str) {
  if (!str) return "—";
  const [y,m,d] = String(str).split("-");
  return d && m && y ? `${m}/${d}/${y}` : str;
}

// What a tank's fuel cost per gallon.
//
// Taken from the most recent fuel to ENTER the tank, whether it was delivered
// or transferred in. Looking only at deliveries was a real bug: a mobile tank
// never receives one — it gets filled from a fixed tank — so every gallon
// pumped out of it was priced at zero and the departments billed for it were
// undercharged.
export function tankUnitCost(tankId, tankTx = []) {
  const priced = tankTx
    .filter(t => t.tankId === tankId && t.unitCost > 0
              && (t.type === "delivery" || t.type === "portable_fill"))
    .sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")));
  return priced[0]?.unitCost || 0;
}

// Days since a date, or null if there isn't one.
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 864e5);
}

// Main shop tanks have an electronic monitor and are balanced against the paper
// logs daily. Outlying sheds and portables have no monitor — they are dipped
// once a year. Different cadence, so different overdue thresholds.
export function reconciliationStatus(tank, tankTx) {
  const kind    = tank.hasMonitor ? "monitor_reading" : "dip_reading";
  const cadence = tank.hasMonitor ? "daily" : "annual";
  const limit   = tank.hasMonitor ? 1 : 365;

  const last = (tankTx || [])
    .filter(t => t.tankId === tank.id && t.type === kind)
    .sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")))[0];

  const age = last ? daysSince(last.date) : null;
  if (age === null) return { state:"never", cadence, age:null, last:null, label:"Never reconciled" };
  if (age > limit)  return { state:"overdue", cadence, age, last, label:`${age} days since last reading` };
  return { state:"ok", cadence, age, last, label:`Read ${age === 0 ? "today" : `${age} days ago`}` };
}
