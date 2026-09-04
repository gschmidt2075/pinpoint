// Tests for employee pay.
//
//     node scripts/test-employees.mjs
//
// The rate model changed shape: it used to come from a pay scale table keyed on
// classification, and it now lives on the person as a dated history. That is a
// change worth pinning down, because "what did this person earn on that day" is
// the question every labor cost is built on, and a wrong answer is invisible —
// the number still looks like a number.

import { createEmployee, createEmployeeAssignment, createRateChange, createFringeProfile,
         createFringeComponent, resolveHourlyRate, resolveClassification, overtimeRateFor,
         rateHistory, payReviewDue, laborRateFor, RATE_CHANGE_REASONS,
         OVERTIME_MULTIPLIER, DEFAULT_LOOKUPS } from "../src/data/schema.js";

let passed = 0;
const failures = [];
const ok = (c, m) => c ? (passed++, console.log("  ✓ " + m)) : (failures.push(m), console.log("  ✗ " + m));
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const close = (a, b, m) => ok(Math.abs(a - b) < 0.005, `${m} — got ${a}, wanted ${b}`);

// Dale: hired as an Operator, six-month review, promoted to Mechanic, COLA.
const dale = createEmployee({
  id: "emp-1", name: "Dale Hoffman", hireDate: "2022-03-14",
  assignments: [
    createEmployeeAssignment({ effectiveDate: "2022-03-14", classification: "Operator II" }),
    createEmployeeAssignment({ effectiveDate: "2024-11-01", classification: "Mechanic" }),
  ],
  rateHistory: [
    createRateChange({ effectiveDate: "2022-03-14", hourlyRate: 21.50, reason: "Starting wage" }),
    createRateChange({ effectiveDate: "2022-09-14", hourlyRate: 22.25, reason: "Six-month review" }),
    createRateChange({ effectiveDate: "2024-11-01", hourlyRate: 27.00, reason: "Promotion", note: "Board 10/21" }),
    createRateChange({ effectiveDate: "2025-07-01", hourlyRate: 28.51, reason: "COLA", note: "2.5% FY2026" }),
  ],
});

console.log("\nWhat somebody earned on a day");

eq(resolveHourlyRate(dale, "2022-04-01").rate, 21.50, "the day after hiring, the starting wage");
eq(resolveHourlyRate(dale, "2022-09-13").rate, 21.50, "the day before the review, still the starting wage");
eq(resolveHourlyRate(dale, "2022-09-14").rate, 22.25, "the day of the review, the new rate");
eq(resolveHourlyRate(dale, "2026-01-01").rate, 28.51, "today, the latest");
eq(resolveHourlyRate(dale, "2020-01-01").rate, 0, "before they were hired, nothing — not the earliest rate");

// The classification no longer sets the rate, but still answers what they did.
eq(resolveHourlyRate(dale, "2023-01-01").classification, "Operator II", "classification on an old date");
eq(resolveHourlyRate(dale, "2026-01-01").classification, "Mechanic", "and on a recent one");

// Two people in the same classification on different steps. This is the case
// the pay scale table could not represent, and the reason it was deleted.
{
  const junior = createEmployee({ hireDate: "2025-01-01",
    assignments: [createEmployeeAssignment({ effectiveDate: "2025-01-01", classification: "Operator II" })],
    rateHistory: [createRateChange({ effectiveDate: "2025-01-01", hourlyRate: 22.00, reason: "Starting wage" })] });
  const senior = createEmployee({ hireDate: "2015-01-01",
    assignments: [createEmployeeAssignment({ effectiveDate: "2015-01-01", classification: "Operator II" })],
    rateHistory: [createRateChange({ effectiveDate: "2024-01-01", hourlyRate: 31.40, reason: "Step increase" })] });
  eq(resolveClassification(junior, "2026-01-01").classification,
     resolveClassification(senior, "2026-01-01").classification, "same classification");
  ok(resolveHourlyRate(junior, "2026-01-01").rate !== resolveHourlyRate(senior, "2026-01-01").rate,
     "…and different pay, which is the whole reason the scale table went");
}

console.log("\nOvertime");

eq(OVERTIME_MULTIPLIER, 1.5, "time and a half");
close(overtimeRateFor(dale, "2026-01-01"), 42.77, "derived from the rate in force, never typed");
close(resolveHourlyRate(dale, "2022-04-01").overtimeRate, 32.25, "and it moves with the rate");
ok(!("overtimeRate" in createRateChange()), "a rate row has no overtime field to get out of step");

console.log("\nRate history");

{
  const rows = rateHistory(dale);
  eq(rows.length, 4, "every change is kept");
  eq(rows[0].effectiveDate, "2025-07-01", "newest first");
  eq(rows[rows.length - 1].change, null, "the first row has nothing to compare against");
  close(rows[0].change, 1.51, "each row shows the step from the one before it");
  close(rows[1].change, 4.75, "including the promotion");
  eq(rateHistory(createEmployee()).length, 0, "somebody with no history does not throw");
}

console.log("\nWho is due");

{
  const fresh = createEmployee({ hireDate: "2026-03-01",
    rateHistory: [createRateChange({ effectiveDate: "2026-03-01", hourlyRate: 20, reason: "Starting wage" })] });
  const due = payReviewDue(fresh, "2026-08-06");
  eq(due && due.kind, "Six-month review", "the six-month review is flagged as it approaches");
  eq(due && due.date, "2026-09-01", "on the right date");

  const done = { ...fresh, rateHistory: [...fresh.rateHistory,
    createRateChange({ effectiveDate: "2026-09-01", hourlyRate: 21, reason: "Six-month review" })] };
  eq(payReviewDue(done, "2026-08-06"), null, "and stops once it has been recorded");

  const ann = payReviewDue(dale, "2026-03-01");
  eq(ann && ann.kind, "Anniversary", "then the anniversary each year");
  eq(ann && ann.years, 4, "counting from the hire date");

  eq(payReviewDue(dale, "2026-01-01"), null, "nothing is said outside the window");
  eq(payReviewDue({ ...dale, active: false }, "2026-03-01"), null, "somebody who has left is not flagged");
  eq(payReviewDue({ ...dale, hireDate: "" }, "2026-03-01"), null, "nor is somebody with no hire date");

  // A Laborer who gets their CDL and becomes an Operator at four months still
  // has their six-month review, because it is measured from the hire date.
  const cdl = createEmployee({ hireDate: "2026-03-01",
    assignments: [
      createEmployeeAssignment({ effectiveDate: "2026-03-01", classification: "Laborer" }),
      createEmployeeAssignment({ effectiveDate: "2026-07-01", classification: "Operator II" }),
    ],
    rateHistory: [
      createRateChange({ effectiveDate: "2026-03-01", hourlyRate: 19, reason: "Starting wage" }),
      createRateChange({ effectiveDate: "2026-07-01", hourlyRate: 22, reason: "Certification earned" }),
    ] });
  const still = payReviewDue(cdl, "2026-08-06");
  eq(still && still.kind, "Six-month review", "getting a CDL does not disturb the six-month review");
  ok(RATE_CHANGE_REASONS.includes("Certification earned"), "and there is a reason on the list for it");
}

console.log("\nBackdating recosts");

{
  // The reducer's SAVE_RATE_CHANGE arithmetic, as written in App.jsx.
  const recost = (employee, projects, effectiveDate) =>
    projects.map(p => ({
      ...p,
      laborEntries: (p.laborEntries || []).map(l => {
        if (l.employeeId !== employee.id || String(l.date) < String(effectiveDate)) return l;
        const r = resolveHourlyRate(employee, l.date);
        const st = (Number(l.straightTimeHours) || 0) * r.rate;
        const ot = (Number(l.overtimeHours) || 0) * r.overtimeRate;
        const fringe = st * ((Number(l.fringeRate) || 0) / 100);
        return { ...l, straightTimeRate: r.rate, overtimeRate: r.overtimeRate,
                 totalCost: Number((st + ot + fringe).toFixed(2)) };
      }),
    }));

  const projects = [{ id: "p1", laborEntries: [
    { id: "l1", employeeId: "emp-1", date: "2025-06-01", straightTimeHours: 8, overtimeHours: 0, fringeRate: 0, straightTimeRate: 27.00, totalCost: 216 },
    { id: "l2", employeeId: "emp-1", date: "2025-08-01", straightTimeHours: 8, overtimeHours: 0, fringeRate: 0, straightTimeRate: 27.00, totalCost: 216 },
    { id: "l3", employeeId: "emp-2", date: "2025-08-01", straightTimeHours: 8, overtimeHours: 0, fringeRate: 0, straightTimeRate: 30.00, totalCost: 240 },
  ]}];

  // The COLA is dated 7/01. Only work on or after that date moves.
  const after = recost(dale, projects, "2025-07-01")[0].laborEntries;
  close(after[0].totalCost, 216, "work before the effective date is left exactly as it was");
  close(after[1].totalCost, 228.08, "work after it is recosted at the new rate");
  close(after[2].totalCost, 240, "another person's work is untouched");

  // Overtime follows automatically because it is derived.
  const withOT = recost(dale, [{ id: "p2", laborEntries: [
    { id: "l4", employeeId: "emp-1", date: "2025-08-01", straightTimeHours: 8, overtimeHours: 2, fringeRate: 0 },
  ]}], "2025-07-01")[0].laborEntries[0];
  close(withOT.overtimeRate, 42.77, "the recosted overtime rate is 1.5× the new rate");
  close(withOT.totalCost, 313.62, "and the total picks it up");

  // Fringe is a percentage of straight time, so it moves too.
  const withFringe = recost(dale, [{ id: "p3", laborEntries: [
    { id: "l5", employeeId: "emp-1", date: "2025-08-01", straightTimeHours: 10, overtimeHours: 0, fringeRate: 20 },
  ]}], "2025-07-01")[0].laborEntries[0];
  close(withFringe.totalCost, 342.12, "fringe recosts with the wage it is a percentage of");
}

console.log("\nSettings");

ok(Array.isArray(DEFAULT_LOOKUPS.rateChangeReasons), "the reason list is an editable lookup");
ok(DEFAULT_LOOKUPS.rateChangeReasons.includes("Six-month review") &&
   DEFAULT_LOOKUPS.rateChangeReasons.includes("Step increase"),
   "carrying the two reasons the due-date warning depends on");
ok(!("payScales" in DEFAULT_LOOKUPS), "and there is no pay scale list left anywhere");

console.log("\nLoaded rate");

{
  const withFringe = { ...dale, fringeProfiles: [createFringeProfile({
    effectiveDate: "2022-03-14",
    components: [createFringeComponent({ name: "Social Security", percent: 6.20 }),
                 createFringeComponent({ name: "Health Insurance", flatHourly: 4.00 })] })] };
  const r = laborRateFor(withFringe, "2026-01-01");
  close(r.hourlyRate, 28.51, "straight time");
  close(r.overtimeRate, 42.77, "overtime");
  close(r.fringePerHour, 5.77, "fringe per hour");
  close(r.loadedRate, 34.28, "what an hour actually costs");
  eq(r.rateReason, "COLA", "and it says why the rate is what it is");
}

console.log("\nHiring somebody");

{
  // The starting wage belongs on the form that hires them. It was only on the
  // Rate tab of a SAVED employee, so creating one offered nowhere to say what
  // they earn — you had to save, find them again, and open another tab.
  const form = createEmployee({ firstName:"Wade", lastName:"Kunz", employeeNumber:"214",
    hireDate:"2026-08-01",
    assignments:[createEmployeeAssignment({ effectiveDate:"2026-08-01", classification:"Laborer" })] });

  // What the form now writes on save.
  const saved = { ...form, name:"Wade Kunz",
    rateHistory:[createRateChange({ effectiveDate: form.hireDate, hourlyRate: 19.75, reason:"Starting wage" })] };

  const r = laborRateFor(saved, "2026-08-15");
  close(r.hourlyRate, 19.75, "the wage typed while hiring is the rate");
  close(r.overtimeRate, 29.63, "overtime derived from it");
  eq(r.classification, "Laborer", "the classification came across too");
  eq(r.rateReason, "Starting wage", "and the row says why it is what it is");
  eq(resolveHourlyRate(saved, "2026-07-31").rate, 0, "nothing applies before the hire date");

  const due = payReviewDue(saved, "2027-01-20");
  eq(due && due.kind, "Six-month review", "the review is anchored to the hire date");

  // Saving without a wage is allowed, and honest about the consequence.
  const noWage = { ...form, name:"No Wage", rateHistory:[] };
  eq(laborRateFor(noWage, "2026-08-15").hourlyRate, 0, "no wage means no rate rather than a guess");
  eq(rateHistory(noWage).length, 0, "with an empty history for the Rate tab to fill");
}

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed\n`
                            : `\nAll ${passed} checks passed ✓\n`);
process.exit(failures.length ? 1 : 0);
