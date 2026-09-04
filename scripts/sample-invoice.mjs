// Render a filled-in invoice so it can actually be looked at.
//
//     node scripts/sample-invoice.mjs [out.html]
//
// The county sent the blank they use. This produces the same sheet with real
// numbers in it, which is the only way to find out that a column is too narrow
// or a total has landed in the wrong place.

import { writeFileSync } from "node:fs";
import { invoiceHTML, defaultNote } from "../src/modules/fuel/invoiceDoc.js";

const info = {
  countyName: "Example County", deptName: "Highway Department",
  address: "415 N. Example Ave.", city: "Somewhere", state: "NE", zip: "68955",
  phone: "(402) 555-0100", fax: "(402) 555-0101", email: "office@example.gov",
};
const period = "2026-08";
const lines = [{
  fuel:"unleaded", label:"Unleaded gasoline",
  description:"Unleaded gasoline — August 2026",
  gallons: 451.7, unitCost: 2.9444, amount: 1330.19,
}];

const out = process.argv[2] || "sample-invoice.html";
writeFileSync(out, invoiceHTML({
  info, department:"Sheriff's Office", period, lines,
  note: defaultNote(lines, period), dateStr: "9/1/2026",
}));
console.log("wrote " + out);
