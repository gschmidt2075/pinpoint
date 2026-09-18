// Which generation of the SEEDED lists a saved state came from.
//
// It lives in its own file because three things need it and none of them should
// have to import App.jsx to get it: the load path, the restore path, and the
// script that builds the sample data set.
//
// mergeSaved fills in missing keys, and rehydrate gives saved records defaults
// for new fields. Neither can help when the shape of the seed itself changes:
// the saved array wins wholesale, so somebody testing since before the inventory
// rebuild would keep 2,375 one-row-per-shed items forever and never see the new
// model at all.
//
// Bumping this replaces those specific seeded lists with the current ones, and
// leaves everything the person actually entered — claims, work orders, fuel —
// untouched. Bump it whenever a seeded list is regenerated in a new shape, and
// say so here.
//
//   1  inventory rebuilt: one item per part number, stock per location  (2026-08-23)
//   2  the commodity group became the single source of truth for both what a
//      thing is and where it is; Inventory Usual Location dropped  (2026-08-26)
//   3  fuel routed out of the inventory catalog to the tanks, and DEF merged
//      from five shed rows onto one item. Without a bump, anyone already testing
//      keeps the old catalog in localStorage — five DEF items and $55,637.89 of
//      diesel counted twice — and would have no idea why the screens disagree
//      with what the program now does.  (2026-09-15)
export const SEED_VERSION = 3;

// The keys a bump throws away and re-seeds. Anything NOT on this list is the
// user's own work and is never touched.
export const RESEED = [
  "inventoryItems", "inventoryBatches", "inventoryTransactions",
  "inventoryGroups", "inventoryExceptions",
  // Removed by the v2 rebuild — delete so they cannot linger.
  "storageLocations", "inventoryCategories",
];
