# Pinpoint — Staff Question Log

Running register of open questions, who they went to, and what came back.
Weekend build sessions add questions here; weekday staff testing answers them.

**Workflow:** Claude writes a question form → Greg prints/shares it with staff →
staff fill in the answer column → Greg uploads the completed file → Claude reads
the answers, records them below, and builds against them.

---

## Status summary

| Module | Form | Questions | Status |
|---|---|---|---|
| Payroll & Employees | `Payroll-Questions.docx` | 37 | **Awaiting answers** |
| Vendors | `Vendor-Questions.docx` | 28 | **Awaiting answers** |
| Settings & Administration | `Settings-Questions.docx` | 38 | **Awaiting answers** |
| Infrastructure | `Infrastructure-Questions.docx` | 38 | **Awaiting answers** |
| Equipment & Fleet | `Equipment-Questions.docx` | 47 | **Awaiting answers** |
| Projects | `Projects-Questions.docx` | 36 | **Awaiting answers** |
| Cost Accounting | `CostAccounting-Questions.docx` | 24 | **Awaiting answers** |
| Reports & Printed Documents | `Reports-Questions.docx` | 27 | **Awaiting answers** |
| Fund Accounting — claim flow | *(asked in chat)* | 4 | **Awaiting answers** |
| Inventory | *(answered in chat)* | — | ✅ Complete |

**275 questions outstanding across 7 forms.** Do not hand these out all at once —
that's a good way to get nothing back. Give staff the one form matching whatever
they're testing that week.

**Suggested order:** Settings first (smallest change, immediate payoff), then
whichever module staff complain about most.

---

## Fund Accounting — claim sheet flow

Asked 2026-07-25. Greg copied these to run past staff. Source document:
`Blank Claim Form.xls` — 16 invoice rows, 8 accounting distribution rows,
validation formula checking the two totals match.

| # | Question | Answer |
|---|---|---|
| 1 | The account boxes pre-fill `0300 - 0705 - 00 - 0 -` then a blank "Expenditure Line". Does a code like `302.02` go in that blank with a fixed prefix, or does the prefix vary by code? | *pending* |
| 2 | Inventory receiving on expenditures — remove it entirely, require picking a real catalog item, or flag the line for the shop to receive later? | *pending* |
| 3 | Export format — Excel matching the template, print-ready PDF, or both? | *pending* |
| 4 | Does the office manager both enter invoices and assign expenditure codes, or is coding a separate job? | *pending* |

**Blocked work:** restructuring `ExpenditureForm` into two sections (invoice
lines + accounting distribution with balance validation), and claim sheet export.

---

## Payroll & Employees

Form issued 2026-07-25 → `Payroll-Questions.docx` (37 questions, 5 sections).

**Why this blocks things:** `db.employees` has no management UI at all, so labor
cost entry in Cost Accounting can never be used. Nothing can be costed to a
project without it.

Sections: Scope · Time entry · Rates & overtime · Employee records · Reporting & FEMA

**Load-bearing questions** — these change the data model, not just the screens:

- **Q1** — scope. Roster only, timesheets, or full payroll processing?
- **Q7** — does every hour hit a project, or is much of it general work?
- **Q19** — when a pay rate changes, do old entries keep the old rate?
  *(If yes: rate history table, not a single field. Very expensive to retrofit.)*
- **Q33** — who can see pay rates? Drives permission design.

---

## Vendors

Form issued 2026-07-25 → `Vendor-Questions.docx` (28 questions, 6 sections).

**Why this blocks things:** `db.vendors` has no management UI, so the vendor
dropdown on the expenditure form is permanently empty. Also feeds claim sheets,
scale tickets, and inventory receiving.

Sections: The basics · Claim form fields · Payment & compliance · Contractors &
insurance · Rates & purchasing · Relationships & housekeeping

**Load-bearing questions:**

- **Q2** — is there an existing vendor list to import? Changes setup entirely.
- **Q5** — where does the claim form's "Vendor Code" come from?
- **Q16** — should gravel contract rates live on the vendor so scale tickets look
  them up? Ties vendors to the inventory module.
- **Q18** — do rates need history so old tickets keep their original rate?

---

## Inventory — answered

Resolved in conversation 2026-07-25.

| Question | Answer |
|---|---|
| What is "Comm Grp Alpha" in the CSV? | A mix — shed location, material category, *and* equipment unit number. Preserve as-is, don't normalize. |
| Is "Inventory #" a part number? | Sometimes. Also a sequence number on a machine (`328-01`), or a year marker for gravel (`23-20M`). Keep raw. |
| Show group numbers? | Yes — display the numeric code everywhere and sort dropdowns by it, not alphabetically. |
| Low stock tracking? | Yes/no toggle per item, then a minimum quantity field. |
| Part compatibility? | Tag parts to equipment units; show them on that unit's page in Equipment so you can see stock at a glance. |
| Dashboard content? | Below-minimum items and pending scale tickets. Nothing else. |
| Transfers | Sheds and on-equipment only. Stockpiles fill via scale ticket; portable tanks via the tank workflow. |
| Scale tickets | Need Source, Hauler, and Destination. One invoice often covers many tickets — reconcile in bulk. |
| Year-end count | Print one sheet per group for physical reconciliation. |

---

## Settings & Administration

Form issued 2026-07-26 → `Settings-Questions.docx` (38 questions, 7 sections).

**Why it matters:** dropdown lists are hardcoded in module files today, so
correcting "2Nd Floor" to "2nd Floor" requires a code change. Everything that
varies between counties — or just changes over time — should be data, not code.

Sections: Editable lists · Account codes & budget · Fiscal year rollover ·
Printed documents · Users, roles & approvals · Defaults · Continuity

**Load-bearing questions:**

- **Q3** — when a list value is renamed, do existing records follow?
  *(Decides whether records store the value itself or a reference to it. Very
  hard to change later.)*
- **Q4** — what happens when deleting a value that records still use?
- **Q13/Q14** — fiscal year rollover behaviour and prior-year access.
- **Q26** — is an audit trail needed? Adds a column to every table if so.

---

## Infrastructure

Form issued 2026-07-26 → `Infrastructure-Questions.docx` (38 questions, 5
sections).

**Why it matters:** the module was built on assumptions rather than on how the
department actually works — the same problem inventory had. Much of this is also
driven by state and federal reporting that we shouldn't guess at.

Sections: Roads · Bridges · Culverts & structures · Signs · Across all assets

**Load-bearing questions:**

- **Q1** — one record per road, or per segment? Changes the whole road data shape.
- **Q11** — are NBIS inspection results entered here or just referenced?
  *(Entering means duplicate work; referencing means less detail available.)*
- **Q22** — which MUTCD retroreflectivity method is used? Determines what has to
  be tracked to stay compliant.
- **Q32** — should assets store GPS coordinates? Needed for the future field app;
  cheap to add now, tedious to backfill later.

---

## Equipment & Fleet

Form issued 2026-07-26 → `Equipment-Questions.docx` (47 questions, 7 sections).

Sections: The fleet · Meters & usage · Preventive maintenance · Work orders ·
Fuel & tanks · **Fuelling for other departments** · Cost & replacement

**New requirement discovered while writing this form:** other county departments
(Sheriff, Weed Control, and others) fuel their vehicles at the highway shop. This
was not in the design at all. It's likely a billing relationship, not just a fuel
log entry — see Q40, which asks whether it should flow through fund accounting as
revenue. If yes, this touches Fund Accounting as well as Equipment.

**Load-bearing questions:**

- **Q4** — when a unit is replaced, does the new one inherit the number?
  *(Decides whether history follows the number or the machine.)*
- **Q11** — what happens when a meter is replaced? Systems that assume meters
  only increase break badly here.
- **Q13** — how PM intervals are set (hours / miles / calendar / whichever first).
- **Q40** — should inter-departmental fuel be revenue in fund accounting?

---

## Projects

Form issued 2026-07-26 → `Projects-Questions.docx` (36 questions, 6 sections).

Sections: Starting a project · Scope & planning · While the project runs ·
Contractors & engineering · Closing out · FEMA projects

**Load-bearing questions:**

- **Q3/Q4** — do project numbers reset each fiscal year or run continuously?
- **Q21** — can costs be moved between projects, and should that be recorded?
- **Q29** — do projects carry across fiscal years keeping their number?
- **Q36** — what has FEMA rejected before? Failure modes tell us what to capture.

---

## Cost Accounting

Form issued 2026-07-26 → `CostAccounting-Questions.docx` (24 questions, 5
sections).

Sections: What gets costed · Rates · Township & outside billing · FEMA claims ·
Reporting

Currently unusable in practice — labour can't be entered because employees don't
exist yet. These questions cover everything beyond that gap.

**Load-bearing questions:**

- **Q8** — should old cost entries keep the rate that applied at entry time?
  *(Same rate-history decision as payroll. Answer both the same way.)*
- **Q15** — the full FEMA claim walkthrough. Highest-value answer on the form.
- **Q18** — is the 15.7% labour overhead still current, and where does it come
  from? It's hardcoded as `FEMA_OVH = 1.157` in two modules.

---

## Reports & Printed Documents

Form issued 2026-07-26 → `Reports-Questions.docx` (27 questions, 6 sections).

Cuts across every module. Reports are where systems usually disappoint —
everything works until someone needs a specific piece of paper for the Board, the
state, or an auditor.

Sections: What you produce today · The Board · State & federal · Auditors ·
Day to day · What you wish you had

**Load-bearing questions:**

- **Q1** — list every report produced in a year. Most valuable single answer
  across all seven forms.
- **Q16** — are any filings in a specific file format? Fixed-width or XML upload
  requirements are easy to miss and expensive to retrofit.
- **Q27** — anything kept in a side spreadsheet? A side spreadsheet almost always
  means the main system is missing something.
