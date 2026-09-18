// ── Backup and restore ────────────────────────────────────────────────────────
//
// Greg, 2026-09-17: "The test data import would be very helpful as it is
// difficult to get things to work after massive rebuilds."
//
// The problem is real and it is ours, not his. Everything staff type lives in
// one browser's localStorage. A rebuild lands, the seed version bumps or a key
// changes shape, and an afternoon of test entry is gone — so the next round of
// testing starts from an empty screen and nobody can tell whether a thing is
// broken or merely not entered yet.
//
// A backup file fixes that, and it is worth being clear about what it is NOT.
// It is not a database and it is not a safety net for real county records: one
// file, on one computer, written by whoever remembered to press the button. It
// exists so a rebuild costs nothing, and so a good set of test data can be
// handed round the office instead of re-typed four times.
//
// Two rules make it survive a rebuild rather than merely survive a refresh:
//
//   1. The file carries the WHOLE state, not a curated subset. A subset is a
//      list somebody has to remember to update every time a collection is
//      added, and that list will be wrong within a month.
//   2. Restoring runs the file back through the same merge-and-rehydrate path
//      that loading from localStorage uses. So a backup written before a field
//      existed gets that field's default on the way in, exactly like saved data
//      does. That is the whole "survive a rebuild" claim, and it is only true
//      because restore does not have a second, private way in.
//
// This module is deliberately free of React and of App.jsx: it makes the
// envelope, reads it back, and says what is inside. Applying it is the
// reducer's job, because that is where the defaults live.

export const BACKUP_FORMAT = 1;
export const BACKUP_MARKER = "pinpoint-backup";

// The collections worth counting on the restore screen, in the order a person
// would look for them. Anything not listed still gets backed up and restored —
// this list only decides what the summary mentions.
const SUMMARY_KEYS = [
  ["expenditures",        "Claims / expenditures"],
  ["revenue",             "Revenue"],
  ["projects",            "Projects"],
  ["equipment",           "Equipment units"],
  ["workOrders",          "Work orders"],
  ["pmLogs",              "PM logs"],
  ["inventoryItems",      "Inventory items"],
  ["inventoryBatches",    "Inventory batches"],
  ["inventoryTransactions","Inventory transactions"],
  ["tanks",               "Fuel tanks"],
  ["tankTransactions",    "Tank transactions"],
  ["fuelDispensing",      "Fuel dispensed"],
  ["roads",               "Roads"],
  ["bridges",             "Bridges"],
  ["structures",          "Structures"],
  ["signs",               "Signs"],
  ["vendors",             "Vendors"],
  ["employees",           "Employees"],
  ["users",               "Users"],
  ["roles",               "Roles"],
  ["townships",           "Townships"],
  ["femaRates",           "FEMA rates"],
  ["auditTrail",          "Audit entries"],
];

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Count every array in the state, so nothing is invisible just because it is
 *  new. Named collections come first and in order; the rest follow. */
export function backupSummary(data = {}) {
  const named = new Set(SUMMARY_KEYS.map(([k]) => k));
  const line = (key, label) => {
    const v = data[key];
    return Array.isArray(v) && v.length > 0 ? { key, label, count: v.length } : null;
  };
  const out = SUMMARY_KEYS.map(([k, l]) => line(k, l)).filter(Boolean);
  for (const key of Object.keys(data)) {
    if (named.has(key)) continue;
    const row = line(key, key);
    if (row) out.push(row);
  }
  return out;
}

/** Wrap a state in the envelope that gets written to disk. */
export function buildBackup(db = {}, { note = "", appVersion = "" } = {}) {
  return {
    [BACKUP_MARKER]: true,
    formatVersion: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    // Recorded so a restore can say "this file predates the current seed" —
    // information, not a gate. Old files are meant to load.
    seedVersion: db.seedVersion ?? null,
    county: db.countyInfo?.countyName || "",
    department: db.countyInfo?.deptName || "",
    appVersion,
    note,
    counts: backupSummary(db).reduce((a, r) => { a[r.key] = r.count; return a; }, {}),
    data: db,
  };
}

/** A filename that sorts by date and says where it came from. */
export function backupFilename(db = {}, now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  const who = (db.countyInfo?.countyName || "pinpoint")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pinpoint";
  return `${who}-backup-${d}.json`;
}

/** Read a file's text back into a state, refusing anything that is not one.
 *
 *  Returns { ok:false, error } or { ok:true, meta, data, summary }. It never
 *  throws: a person picking the wrong file out of Downloads is an ordinary
 *  Tuesday, and should get a sentence rather than a blank screen.
 */
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not readable as JSON. Pick the .json file Pinpoint wrote." };
  }
  if (!isPlainObject(parsed))
    return { ok: false, error: "That file does not contain a backup." };

  // Accept a bare state too — someone who copied localStorage out by hand has
  // the right data in the wrong wrapper, and there is no reason to be precious
  // about it. The marker is how we TELL, not a licence we withhold.
  const data = parsed[BACKUP_MARKER] ? parsed.data : parsed;
  if (!isPlainObject(data))
    return { ok: false, error: "The backup file has no data in it." };

  // A state has collections. A random JSON file does not. One recognisable key
  // is enough — demanding more would reject a backup taken before that key
  // existed, which is the exact case this is for.
  const known = SUMMARY_KEYS.map(([k]) => k).concat(["lookups", "countyInfo", "customFunds"]);
  if (!known.some(k => k in data))
    return { ok: false, error: "That file does not look like Pinpoint data — none of the expected records are in it." };

  if (parsed[BACKUP_MARKER] && parsed.formatVersion > BACKUP_FORMAT)
    return { ok: false, error: `That backup was written by a newer version of Pinpoint (format ${parsed.formatVersion}). Update first, then restore it.` };

  return {
    ok: true,
    meta: {
      createdAt:  parsed.createdAt || null,
      county:     parsed.county || data.countyInfo?.countyName || "",
      department: parsed.department || data.countyInfo?.deptName || "",
      note:       parsed.note || "",
      seedVersion: parsed.seedVersion ?? data.seedVersion ?? null,
      wrapped:    !!parsed[BACKUP_MARKER],
    },
    data,
    summary: backupSummary(data),
  };
}
