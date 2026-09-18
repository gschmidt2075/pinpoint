// Tests for the backup file — the envelope, and what reading one back says.
//
// The point of these is narrow and worth naming: a backup is only useful if a
// file written BEFORE a rebuild still loads AFTER it. So the cases that matter
// are the ugly ones — a file missing keys that now exist, a file with keys that
// no longer do, a file somebody renamed, and a file that is not a backup at all.

import { readFileSync } from "node:fs";
import { buildBackup, readBackup, backupSummary, backupFilename,
         BACKUP_MARKER, BACKUP_FORMAT } from "../src/data/backup.js";

let passed = 0, failed = 0;
const group = (name) => console.log(`\n${name}`);
const ok = (label, got, want) => {
  const good = want === undefined ? !!got : JSON.stringify(got) === JSON.stringify(want);
  if (good) { passed++; console.log(`  ✓ ${label}${want===undefined?"":` — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`); }
  else { failed++; console.log(`  ✗ ${label} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); }
};

const sampleDb = () => ({
  expenditures: [{ id:"e1", amount: 100 }, { id:"e2", amount: 250 }],
  revenue: [],
  projects: [{ id:"p1", name:"M-2026-01" }],
  equipment: [{ id:"u1", unitNumber:"140" }],
  inventoryItems: [{ id:"i1" }, { id:"i2" }, { id:"i3" }],
  tanks: [{ id:"t1" }],
  lookups: { classifications: ["Operator"] },
  countyInfo: { countyName:"Example County", deptName:"Roads Department" },
  seedVersion: 3,
});

// ── The envelope ──────────────────────────────────────────────────────────────
group("What gets written");
{
  const db = sampleDb();
  const b = buildBackup(db);
  ok("it is marked as a Pinpoint backup", b[BACKUP_MARKER], true);
  ok("it records the format it was written in", b.formatVersion, BACKUP_FORMAT);
  ok("the whole state is in it, not a chosen few keys",
     Object.keys(b.data).sort(), Object.keys(db).sort());
  ok("the county rides along so a file says where it came from", b.county, "Example County");
  ok("and the counts are on the outside, readable without loading it", b.counts.expenditures, 2);
  ok("the date is an ISO timestamp", /^\d{4}-\d{2}-\d{2}T/.test(b.createdAt), true);
}

group("What it gets called");
{
  const name = backupFilename(sampleDb(), new Date("2026-09-18T15:00:00Z"));
  ok("county and date, so files sort and say who they belong to",
     name, "example-county-backup-2026-09-18.json");
  ok("and a county that has not filled in its name still gets a filename",
     backupFilename({}, new Date("2026-09-18T15:00:00Z")), "pinpoint-backup-2026-09-18.json");
}

// ── Reading one back ──────────────────────────────────────────────────────────
group("Reading a backup back");
{
  const text = JSON.stringify(buildBackup(sampleDb()));
  const r = readBackup(text);
  ok("it reads", r.ok, true);
  ok("the data comes back whole", r.data.expenditures.length, 2);
  ok("it knows it was a real backup file, not loose data", r.meta.wrapped, true);
  ok("and the summary counts what is actually in it",
     r.summary.find(s => s.key === "inventoryItems")?.count, 3);
  ok("empty lists are left out of the summary rather than shown as zero",
     r.summary.some(s => s.key === "revenue"), false);
}

group("A file that is not a backup");
{
  ok("unreadable text is refused with a sentence, not a crash",
     readBackup("not json at all").ok, false);
  ok("and says what to do",
     /JSON/.test(readBackup("{oh no").error), true);
  ok("a JSON file from something else is refused",
     readBackup(JSON.stringify({ hello:"world", rows:[1,2,3] })).ok, false);
  ok("an empty object is refused", readBackup("{}").ok, false);
  ok("a list is refused", readBackup("[1,2,3]").ok, false);
}

group("A backup from a newer Pinpoint");
{
  const b = buildBackup(sampleDb());
  b.formatVersion = BACKUP_FORMAT + 1;
  const r = readBackup(JSON.stringify(b));
  ok("is refused rather than half-loaded", r.ok, false);
  ok("and says to update first", /newer version/.test(r.error), true);
}

// ── The case this whole feature exists for ────────────────────────────────────
group("A backup written before a rebuild");
{
  // A file from an older Pinpoint: no `signs` (added since), and carrying
  // `storageLocations` (removed since). Both are normal after a rebuild.
  const old = {
    expenditures: [{ id:"e1", amount: 100 }],
    inventoryItems: [{ id:"i1" }],
    storageLocations: [{ id:"s1", name:"Main Shop" }],
    countyInfo: { countyName:"Example County" },
    seedVersion: 1,
  };
  const r = readBackup(JSON.stringify(buildBackup(old)));
  ok("still reads", r.ok, true);
  ok("a key the program no longer has does not stop it",
     r.data.storageLocations.length, 1);
  ok("a key the program has now is simply absent, for the merge to fill in",
     "signs" in r.data, false);
  ok("and the old seed version is reported so the load path can act on it",
     r.meta.seedVersion, 1);
}

group("Loose data somebody copied out by hand");
{
  // No envelope — just the state. The marker is how we TELL a backup, not a
  // licence we withhold from data that is obviously ours.
  const r = readBackup(JSON.stringify(sampleDb()));
  ok("loads anyway", r.ok, true);
  ok("but says it was not a proper backup file", r.meta.wrapped, false);
  ok("and finds the county inside it", r.meta.county, "Example County");
}

group("A backup of an empty system");
{
  // Legal, and the restore screen has to be able to say so before anyone
  // replaces a day's work with nothing.
  const r = readBackup(JSON.stringify(buildBackup({ expenditures: [], lookups: {} })));
  ok("reads", r.ok, true);
  ok("and the summary is empty, which is the warning", r.summary.length, 0);
}

group("Counting an unfamiliar list");
{
  // A collection added after this test was written must still be counted,
  // otherwise the export screen under-reports and quietly loses confidence.
  const s = backupSummary({ expenditures:[{id:1}], somethingNew:[{id:1},{id:2}] });
  ok("named lists come first", s[0].key, "expenditures");
  ok("and an unknown one is still counted",
     s.find(r => r.key === "somethingNew")?.count, 2);
}

// ── The sample data set that ships with Pinpoint ──────────────────────────────
//
// A dangling id is the failure mode that matters here. It does not crash: the
// screen renders a blank where a unit number should be, and the person testing
// writes down "equipment doesn't show" when in truth the sample data was wrong.
// That wastes exactly the session the sample exists to make useful.
group("The shipped sample data");
{
  const raw = readFileSync(new URL("../public/sample-data.json", import.meta.url), "utf8");
  const r = readBackup(raw);
  ok("it reads as a backup", r.ok, true);

  const d = r.data;
  const ids = (list) => new Set((list || []).map(x => x.id));
  const dangling = (list, field, pool) =>
    (list || []).filter(x => x[field] && !pool.has(x[field])).map(x => x[field]);

  const equipIds = ids(d.equipment), tankIds = ids(d.tanks);
  const vendorIds = ids(d.vendors),  empIds  = ids(d.employees);

  ok("every fuelling points at a machine that exists",
     dangling(d.fuelDispensing, "equipmentId", equipIds), []);
  ok("every fuelling points at a tank that exists",
     dangling(d.fuelDispensing, "sourceTankId", tankIds), []);
  ok("every tank transaction points at a tank that exists",
     dangling(d.tankTransactions, "tankId", tankIds), []);
  ok("every delivery names a vendor that exists",
     dangling(d.tankTransactions, "vendorId", vendorIds), []);
  ok("every claim names a vendor that exists",
     dangling(d.expenditures, "vendorId", vendorIds), []);
  ok("every work order names a machine that exists",
     dangling(d.workOrders, "unitId", equipIds), []);

  const allLabor = [
    ...(d.workOrders || []).flatMap(w => w.laborEntries || []),
    ...(d.projects   || []).flatMap(p => p.laborEntries || []),
  ];
  ok("every labor line names an employee that exists",
     dangling(allLabor, "employeeId", empIds), []);
  ok("and there are labor lines to check", allLabor.length > 0, true);

  const allEquipEntries = (d.projects || []).flatMap(p => p.equipmentEntries || []);
  ok("every project equipment line names a machine that exists",
     dangling(allEquipEntries, "equipmentId", equipIds), []);

  // The catalog is real, crosswalked data. An empty array here would replace it;
  // an absent key leaves it alone. This is the difference between the two.
  ok("it carries no inventory keys, so a restore leaves the real catalog alone",
     Object.keys(d).filter(k => k.startsWith("inventory")), []);

  // Greg: "Please don't hardcode Adams County into this program as I would like
  // to keep a clean version that may be used by other counties."
  ok("and nothing in it names a real county, shop or road",
     (raw.match(/adams|kenesaw|holstein|roseland|pauline|hastings/gi) || []), []);

  ok("the county is the invented one", r.meta.county, "Example County");
  ok("every classification used by an employee is in the lookup it ships",
     (d.employees || []).flatMap(e => (e.assignments || []).map(a => a.classification))
       .filter(c => c && !(d.lookups?.classifications || []).includes(c)), []);
}

console.log(failed === 0
  ? `\nAll ${passed} checks passed ✓\n`
  : `\n${failed} of ${passed + failed} checks FAILED ✗\n`);
process.exit(failed === 0 ? 0 : 1);
