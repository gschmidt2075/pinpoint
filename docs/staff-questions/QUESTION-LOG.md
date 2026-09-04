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
| Payroll & Employees | `Payroll-Questions.docx` | 37 | ✅ **Answered** — 4 follow-ups |
| Vendors | `Vendor-Questions.docx` | 28 | ✅ **Answered** — ⚠ 12-vs-15 conflict |
| Settings & Administration | `Settings-Questions.docx` | 38 | **Awaiting answers** |
| Infrastructure | `Infrastructure-Questions.docx` | 38 | ✅ **Answered** — 2 follow-ups open |
| Equipment & Fleet | `Equipment-Questions.docx` | 47 | ✅ **Answered** — 4 follow-ups, 1 major |
| Projects | `Projects-Questions.docx` | 36 | **Awaiting answers** |
| Cost Accounting | `CostAccounting-Questions.docx` | 24 | **Awaiting answers** |
| Reports & Printed Documents | `Reports-Questions.docx` | 27 | **Awaiting answers** |
| Fund Accounting — claim flow | *(answered in chat)* | 4 | ✅ Complete |
| Fund Accounting — everything else | `FundAccounting-Questions.docx` | 46 | **Awaiting answers** |
| Inventory | *(answered in chat)* | — | ✅ Complete |

**171 questions outstanding across 4 forms.** Do not hand these out all at once —
that's a good way to get nothing back. Give staff the one form matching whatever
they're testing that week.

**Suggested order:** Settings first (smallest change, immediate payoff), then
whichever module staff complain about most.

---

## Fund Accounting — claim sheet flow

Asked 2026-07-25. Greg copied these to run past staff. Source document:
`Blank Claim Form.xls` — 16 invoice rows, 8 accounting distribution rows,
validation formula checking the two totals match.

**Answered 2026-07-26.**

| # | Question | Answer |
|---|---|---|
| 1 | Account code boxes — fixed prefix or varies? | Possibly keep manual / outside Pinpoint. **Key detail:** a single invoice item can carry two codes — e.g. a repair part code *and* a shipping code. That's noted in the description row beneath the item, then everything totals in the Accounting Information block. *Needs one clarification — see below.* |
| 2 | Inventory receiving on expenditures | **Keep it, but force selection of a real catalog item.** No free-text. New standing rule: anything received must exist as an inventory item first. |
| 3 | Export format | **Excel.** |
| 4 | Who does what | See workflow below. |

### The actual claim workflow

1. **Office manager or parts manager** enters invoices — either can
2. **Office manager** reviews all invoices for the cycle, then builds the claim
   sheet in Excel: vendor info, invoice info, and assigns all expenditure codes
3. She prints it and gives it to **Greg for review and a wet signature**
4. If something's wrong she corrects it, reprints, and he signs the new copy
5. Signed sheets go to the **Clerk's office** for entry
6. The **Board reviews** and approves or denies

**The Board sometimes denies an individual claim.** Rare, but it happens — and
the current model can't represent it. `APPROVE_CLAIM_CYCLE` approves an entire
cycle at once; there is no per-claim denial.

### What this means for the build

- **Two entry roles.** Both office manager and parts manager enter invoices.
- **Claim assembly is its own step**, done later by the office manager — not a
  by-product of entering an expenditure. The app needs a "build claim sheet"
  action that groups a cycle's invoices by vendor.
- **This confirms the multi-invoice design.** Several invoices from one vendor in
  one cycle belong on one sheet.
- **Invoice lines and account codes are many-to-many.** One invoice line can
  split across two codes; several invoices can roll into one code. The two
  sections are genuinely independent lists that must total the same — exactly what
  the paper form's balance formula enforces.
- **A wet signature is legally required**, so the export is the real artifact.
  The app supports the process; it doesn't replace the paper.
- **Per-claim status is needed:** entered → on sheet → signed → submitted →
  approved / **denied**.

### Denial handling — answered 2026-07-26

**A denied claim comes back for correction and goes on a later cycle.**

Consequences for the build:

- Claim status is per-claim, not per-cycle. `APPROVE_CLAIM_CYCLE` currently
  approves an entire cycle at once and cannot express a single denial.
- A claim must be able to **move to a different cycle** after being denied.
- Denial history should persist — a claim that was denied once and later approved
  should show that, not silently appear as approved.
- Required statuses: `entered` → `on_sheet` → `signed` → `submitted` →
  `approved` | `denied`, with `denied` → corrected → reassigned to a later cycle.

### Q1 resolved 2026-07-26 — claim sheet layout decoded

Source: `Claim Sheet Example.xlsx`. **The convention is fully derivable, so
Pinpoint can generate the entire sheet.** Greg's concern — that split codes
wouldn't sum cleanly — only applies when a human transcribes between the two
blocks. Generated from one dataset, they agree by construction.

#### Invoice block (rows 7–22)

| Column | Contents |
|---|---|
| A–B | Date |
| C–J | Invoice number |
| L–AA | Description of item |
| **AB** | **Expenditure code — only when the item has exactly one code.** This is the unlabeled column. |
| AC | Invoice total |

**Item with one code** — code goes in AB on the item's own row:

```
8/1/2026 | LU58425 | Mechanics Wire        [301.06] | 35.22
```

**Item with several codes** — AB blank, and a continuation row underneath
carries the split as free text in the description column:

```
7/31/2026 | KI657541 | Specialty oil filter          | 562.32
         |          | 214.00 = $500.00  201.00 = $62.32 |
```

The continuation row has no date, no invoice number, no total.

#### Accounting block (rows 24–31)

One row per distinct code/amount pair. Prefix is **constant on every row** —
`0300 - 0705 - 00 - 0 -` — so it belongs in Settings, not in a per-code mapping.

**Expenditure Line (columns T–X) is the account code with the decimal removed,**
one digit per cell:

| Code | T–X | Amount (Y–AA) |
|---|---|---|
| 214.00 | `2 1 4 0 0` | 500.00 |
| 201.00 | `2 0 1 0 0` | 62.32 |
| 301.06 | `3 0 1 0 6` | 35.22 |

Rule: split on `.`, pad the decimal part to two digits, concatenate.
`105.0` → `10500`. `301.06` → `30106`.

#### Balance

- `Y32 = SUM(Y24:Y31)` — accounting total
- `AC32 = SUM(AC7:AC31)` — invoice total
- `AB24` holds `=IF(Y32=AC32,"","Not Equal to Account Detail")`

Example balances at 597.54 both ways.

#### Confirmed 2026-07-26

1. **AB always holds the code when an item has exactly one.** ✅
2. **The breakdown line has no fixed format** — written however reads best. So
   Pinpoint can choose a clean, consistent rendering rather than mimicking a
   convention. Suggested: `214.00 = $500.00   201.00 = $62.32`
3. **`105.0` renders as `10500`.** ✅ Split on `.`, pad decimals to two, join.

#### Claim size limit — RESOLVED 2026-08-14

**15 invoices per claim, per vendor.** Greg confirmed on 2026-08-14, settling the
disagreement with the Office Manager's "12" from the Vendor form 2026-07-27.

Stored as `countyInfo.invoicesPerClaim`, editable in Settings → County Info, and
defaulting to 15. It is not a constant: there is no reason to assume every
county's claim form holds the same number of lines.

**One rule only: a maximum of N invoices per claim, per vendor.** Beyond that it
becomes a *separate claim*, not a continuation page.

Both earlier worries turned out not to apply:

- **Continuation rows don't count.** The limit counts invoices, not printed rows.
  A split-code item still counts as one invoice however many rows it occupies.
- **The 8-row accounting block is not a hard limit.** Rows can be added as needed.

So the sheet grows vertically as required — the export builds the layout with as
many rows as the data needs, rather than filling a fixed template. The only
splitting rule is the 15-invoice count.

Note: `ExpenditureForm` currently caps *line items* at 15
(`if (lines.length < 15)`). That's a different thing from 15 invoices per claim,
and the real cap belongs on the assembled sheet — three 6-line invoices from one
vendor would otherwise quietly produce an oversized claim.

---

## Payroll & Employees — ✅ ANSWERED 2026-07-27

All 37 answered, signed CB. **The scope answer cuts this module roughly in half.**

### Scope

| # | Answer |
|---|---|
| 1 | **"Pay with benefits for costs in the project."** |
| 2 | The **Clerk's Office** runs actual payroll |
| 3 | **"This system will not need to track that. The only payroll portion this will need is for determining labor costs for projects."** |
| 4 | Pay period runs **the 10th to the 9th** |
| 5 | No union — **policy governs** rates and overtime |

**So: no gross-to-net, no withholding, no direct deposit, and no feeding hours
out to anyone.** Pinpoint needs employees, their rates and their benefit loading,
so labor can be costed to work. That's it.

### Time entry

| # | Answer |
|---|---|
| 6 | **The office enters hours** from the **Daily Work Report** and **Grading Sheets** |
| 7 | **Every hour should be charged** — *"proving the need for the staff and all that they do"* |
| 8 | See the activity list below |
| 9 | **Yes** — one person's day splits across several jobs |
| 10 | **Equipment is recorded with labor:** *"If 1 person works 8 hours with 2 hours 434 then 6 hours in 241."* |
| 11 | Must show **each person, what equipment they used, and for how long** |
| 12 | Snow may need separate treatment **if FEMA-declared** |
| 13 | **Total hours**, not start/stop times |
| 14 | The Clerk's office can correct payroll at any time, per law |

**Activity list (Q8)** — work with no project number, which still needs costing:

> Snow removal · Mowing · Grading · Equipment maintenance · Bridge inspections ·
> Building repair · Cemeteries · Culverts (cut, jack, inspections) · Driveway
> installations · Gravel deliveries · Illegal dumping · Paint striping ·
> Patching · General road maintenance (grading, small fill on gravel roads) ·
> Seeding · Shouldering · Sign maintenance · Snow fence · Weed spraying ·
> Sylvex patching · Trees (cutting, stacking, burning) · **each Village worked
> for** · Building repairs

### Rates & overtime

| # | Answer |
|---|---|
| 15 | **1.5×**, with exemptions per policy. **2-hour minimum** when called in after hours and not continuing the workday |
| 16 | Over **40 hours per week, Monday–Sunday** |
| 17 | **Call-out — 2 hour minimum** |
| 18 | Rates change on **anniversary** and by **Board approval** |
| 19 | **YES — entries keep the rate that applied when they were made. Rate history is required.** |
| 20 | **Fringe varies by person** — insurance elections and years of service |
| 21 | The internal fringe rate **is** the FEMA one |
| 22 | Fringe covers: **Social Security 6.20%, Retirement 6.75%, Medicare 1.45%**, holiday pay, vacation pay, sick leave, health insurance (in-lieu, dental, HRA, disability), FSA, wellness, workers comp |

### Employee records

| # | Answer |
|---|---|
| 23 | **Classifications:** Laborer · Operator II · Operator III · Road Foreman · Shop Foreman · Mechanic · Bridge Inspector · Sign Tech · Parts Manager · Office Manager · Accountant |
| 24 | **A pay scale per classification** — the rate comes from the classification, not the individual |
| 25 | **Employee number and name** |
| 26 | **Certifications:** CDL · licences (Bridge, Superintendent, Applicator) · CPR · Flagger · First Aid · specialised training |
| 27 | **90-day expiry warning** |
| 28 | Part-time and seasonal exist — **no special rules yet** |
| 29 | Equipment assignment is loose, but **blade operators are assigned a machine** |
| 30 | Leave — "maybe". Sick and vacation **accrue monthly with maximums by years of service**. **Comp time is paid out twice a year if unused** |
| 31 | **Emergency contact — yes** |
| 32 | **DO NOT STORE: SSN, home address, date of birth** |
| 33 | Pay rates visible to **Superintendent and Office Manager only** |
| 34 | Keep history, **hide leavers from dropdowns** |

### Reporting & FEMA

| # | Answer |
|---|---|
| 35 | FEMA needs a spreadsheet of **employee names, rates with the benefit breakdown per hour, and job title**. Work reports need **name, hours worked, which equipment, and equipment time** |
| 36 | Wants a **timesheet** and a **project report** — *samples referenced but not attached* |
| 37 | **Hours by project** would be welcome |

---

### What this changes

**The module is much smaller than the form implied.** No payroll processing, no
export to the Clerk. Employees, classifications, rates, fringe — enough to cost
labor. That's a fraction of what a payroll module usually carries.

**Four things are structurally new:**

1. **Rate history is required** (Q19). A rate isn't a number on an employee — it's
   a dated series, and a labor entry resolves the rate in force on its date.
   Cost Accounting Q8 asks the same thing about equipment rates; answer both the
   same way.

2. **Rates come from classification, not person** (Q24). A pay scale per
   classification, with the employee pointing at one. Fringe, by contrast,
   **is** per person (Q20).

3. **Activities are handled by Miscellaneous projects** (Q7, Q8). Every hour
   should land somewhere, and most work has no project number — Greg confirmed
   2026-07-27 that misc projects cover this rather than a separate activity
   concept. The 28-item list is seeded as `miscProjectTypes` so naming stays
   consistent when creating them.

4. **Labor and equipment are one entry, not two** (Q10). Eight hours of a
   person's day, with two hours on unit 434 and six on 241. Cost Accounting
   currently keeps labor and equipment entries separate, which can't express
   "these six hours are the same six hours."

**Sensitive data is explicitly out** (Q32) — no SSN, home address or date of
birth. Worth honouring in the schema rather than just the form, so it can't creep
back in.

**Rate visibility is restricted** (Q33) to Superintendent and Office Manager.
That's the first real permission requirement on the project.

### Project report decoded 2026-07-27

Source: `Project Report Example.pdf` — a real **Detail Costs** report for
`M-2021-01` out of *R&B IMS, Jan 1999*, the system being replaced. Six pages,
73 detail records. **The timesheet is deliberately ignored — it comes from other
software that won't be integrated.**

#### Header

`(uses TASK Codes)` · **Adams County** · `Detail Costs: M-2021-01` · print date ·
page number

| Field | Example |
|---|---|
| Size / quantity | 2,560 |
| FEMA Site # | 294 |
| Project Priority | 0 |
| Prj Length (Yrs) | *(blank)* |
| Started | 3/10/2021 |
| Reviewed | 7/01/2021 |
| **Completed** | **4/12/2021** *(red)* |
| Fiscal Yr | 2021 |
| Map Index | 20-5-9 |

#### Columns

`Date · Employee · Rate · Reg Hrs · OT Hrs · Labor Cost · Inven # · Mtl Qty ·
Matl Cost · Eqp # · Eqp Hrs · Eqp Cost · Contr & Inv # · Payment · Total Cost`

#### Row shape — two printed lines per record

```
3/08/2021  SEYBOLD  48.29  3.00      144.87        327   2.00   113.62    258.49
Q20.1                15600 S. Union Avenue               Rate: 56.81
```

Line one carries the figures. Line two carries the **structure number**, the
**road segment**, the equipment description and the equipment rate.

**⚠ Corrected 2026-07-27.** `Q20.1` is *not* a task code — it's the **structure
number** being worked on, and `15600 S. Union Avenue` is the **road segment that
structure sits in**. The whole of M-2021-01 concerns that one structure, so both
values repeat on all 73 records. The `(uses TASK Codes)` header appears to be an
unused feature of the old software; Greg isn't aware of any task codes existing.

**This belongs in the project header, not on every cost record** — which is what
`project.linkedAssets` already does. No new structure needed.

Incidentally `Q20.1` confirms the culvert numbering convention from Infrastructure
Q19 — township code `Q`, section `20`, order `.1` — matching the `A 2.2` and
`D 27.3C` examples.

**This confirms Q10 exactly — labor and equipment are ONE record.** Seybold's
3 hours at $48.29 is $144.87; unit 327 for 2 of those hours at $56.81 is $113.62;
the record totals $258.49. Equipment hours are a subset of the person's hours.

**Equipment also appears without an employee** — unit 117 for 0.50 hr at $79.43
stands alone.

#### Materials arrive two ways

**From inventory** — `Inven #`, quantity, cost.

**Direct charged**, grouped by vendor with the invoice number:

```
BIG G ACE
4/06/2021   Face shield   1.00   26.06   670209/   26.06
Q20.1       Direct Charged Purchased Item
```

Vendors seen: Big G Ace · Consolidated · Fastenal · Menards · Stetson · Sunbelt ·
Ace Irrigation.

#### Leased equipment

`LEASE21-1`, `LEASE22-1` carry their own pseudo unit numbers and hourly rates
($38.72), sitting alongside owned units in the same column.

#### Totals

| | Reg Hrs | Mtl Qty | Eqp Hrs | Labor | Material | Equipment | Total |
|---|---|---|---|---|---|---|---|
| **Actuals** | 268.00 | 113.00 | 186.00 | $10,229.07 | $10,620.67 | $14,121.64 | **$34,971.38** |
| **Budgeted** | 0.00 | | 0.00 | | | | |
| **% Actual/Budget** | 0% | | 0% | 0% | 0% | 0% | |

`Number of Detail Cost Records: 73` · `Available Balance: 34,971.38`

Labor + material + equipment reconciles exactly to the total.

---

### What the report demands that Pinpoint lacks

*(Originally seven items — two removed after Greg corrected the structure/road
misreading. No task code system is needed, and no per-record location: the
project's linked assets already carry both.)*

1. **Labor and equipment as one record.** Cost Accounting keeps
   `laborEntries` and `equipmentEntries` separate and cannot express "these two
   hours are within those eight." **This needs restructuring** — it's the
   biggest remaining change.

2. **Direct-charged purchases.** Material bought for a project rather than drawn
   from inventory, shown grouped by vendor with an invoice number.

3. **Leased equipment** as a first-class unit with an hourly rate, not owned
   fleet.

4. **Project header fields** absent from `createProject`: FEMA site number,
   project priority, project length in years, reviewed date, map index, and the
   size/quantity figure.

5. **Budget vs actual with percentages**, and an available balance.

**Already covered:** the structure and road belong in the project header via
`linkedAssets`, which exists and which `AssetCostHistory` already reads — so
lifetime cost per asset (Infrastructure Q37) works through the same mechanism.

### Follow-ups

1. ~~The TASK code list~~ — **resolved.** Not task codes; structure number and
   road segment, which belong in the project header. No such list exists.
2. **Timesheet sample** — *not needed. Greg confirmed it's from other software
   that won't be integrated.*
3. **The Q8 activity list still stands** as a separate requirement — general work
   with no project number (snow removal, mowing, cemeteries, villages) still
   needs somewhere to be costed. That's unrelated to the old report's structure
   numbers.
2. **Overtime "exemptions per policy"** (Q15) — which classifications are exempt?
3. **Leave tracking** (Q30) was "maybe". Accruals with service-based maximums and
   twice-yearly comp payout is real work — in or out?
4. **Villages** appear in the activity list. Is work for a village billed back,
   like township work?

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

## Vendors — ✅ ANSWERED 2026-07-27

All 28 answered. **⚠ The free-text note contradicts the claim size limit Greg
gave — see the conflict below.**

### The basics

| # | Answer |
|---|---|
| 1 | **134–157 vendors used per year.** 424 exist in Road & Bridge overall, **including employees for payroll** |
| 2 | **Start clean — do not import.** R&B holds a lot of vendors no longer around or used |
| 3 | Office Manager maintains it, but **the Parts Manager also adds vendors** when she has the invoice before the account is set up |
| 4 | Suppliers, contractors, engineering firms, utilities — **and employees for payroll. "Anyone we send money."** |

### Claim form fields

| # | Answer |
|---|---|
| 5 | **The Vendor Code box belongs to the Clerk's office.** Pinpoint shouldn't fill it. **A claim # comes back after processing and should be recorded** |
| 6 | **Yes** — remit address should auto-fill |
| 7 | **Yes** — some vendors have a payment address different from their main address |
| 8 | No contact name or phone needed on the claim sheet |

### Payment & compliance

| # | Answer |
|---|---|
| 9 | No payment terms tracked |
| 10 | 1099s — **Clerk's office does that** |
| 11 | W-9s — **Clerk's office duty** |
| 12 | SAM.gov / debarment — **"Not yet"** (may come with federal work) |
| 13 | **Sales tax exemption certificates go the other way** — the county *sends* them to vendors on request, rather than collecting them |

### Contractors & insurance

| # | Answer |
|---|---|
| 14 | **Yes** — certificates required before work |
| 15 | **General liability only** |
| 16 | **No expiry warning wanted** |
| 17 | **Yes** — bonding tracked on larger projects |
| 18 | No prequalified/approved status |

### Rates & purchasing

| # | Answer |
|---|---|
| 19 | **Yes** — contract rates belong on the vendor record |
| 20 | Set by **bid**, mostly |
| 21 | Rates change **"sometimes"** — *the rate-history half of this question wasn't answered* |
| 22 | POs — "yes and no… not a deal breaker." Low priority |
| 23 | Quotes tracked **only for large purchases** |
| 24 | **Yes** — some vendors are on state contract or a co-op |

### Relationships & housekeeping

| # | Answer |
|---|---|
| 25 | **Yes** — link vendors to inventory items, and **one product may have several vendors** (filters, oil, parts). Many-to-many |
| 26 | One contact per vendor is enough |
| 27 | Conflict of interest overlap — **"possibly"** |
| 28 | **Yes** — hide unused vendors but keep them for history |

### Free-text note

> "Report that lists the vendor, GL Codes in a set date range.
> **Claims are limited to 12 invoices.**"

---

### ✅ RESOLVED 2026-08-14 — 15 invoices per claim

- **Greg, 2026-07-26:** *"there is a maximum of 15 invoices per claim from one vendor"*
- **Office Manager, 2026-07-27:** *"Claims are limited to 12 invoices"*
- **Greg, 2026-08-14:** *"15 claim limit"* — settled.

A claim cycle now warns when any one vendor's invoices exceed the limit, naming
the vendor and how many sheets it will take. The auto-split itself is still to
build, but nothing is blocked on the number any more.

### What this changes

**Simplifications:**

- **No vendor import.** Starting clean removes the crosswalk work entirely.
- **No 1099, W-9 or expiry-warning tracking** — all Clerk's office, or not wanted.
- **General liability only**, not the full GL/auto/workers-comp matrix.

**New or corrected:**

- **Employees are vendors.** "Anyone we send money." This ties the Vendors and
  Payroll modules together — needs a decision on whether an employee record
  doubles as a vendor or the two are separate records.
- **Vendor Code is not ours to fill.** But a **claim number comes back from the
  Clerk after processing** and needs somewhere to live — that's new.
- **Separate remit-to address** required, distinct from the main address.
- **Sales tax exemption runs outward** — the county issues certificates to
  vendors, rather than collecting them.
- **Vendors ↔ inventory items is many-to-many.** Several vendors can supply the
  same filter.
- **Bonding** tracked on larger projects.
- **New report wanted:** vendor and GL codes across a date range.

### Built 2026-07-27

`Vendors.jsx` — list with type/flag columns and inactive toggle, detail with
Details / Contract Rates / Supplies / Payment History tabs, and a form covering
everything the answers called for:

- **Payee types** including employee, for reimbursement claims
- **Separate remit-to address**, with a preview of exactly what prints on the
  claim sheet. Falls back to the main address if the flag is set but the fields
  are blank
- **Vendor code** recorded but never generated — it's the Clerk's
- **Insurance** limited to general liability, no expiry warnings
- **Bonding** with amount and reference
- **State contract / co-op** and **tax exemption sent** flags
- **Contract rates** with effective dates and bid references, so a scale ticket
  can be traced to the rate in force when written
- **Supplied items** many-to-many against the catalog, searchable rather than
  rendering all 2,375 rows
- **Conflict of interest** flag
- **Inactive** hides but keeps history

Fund Accounting's vendor picker now captures the vendor id rather than just a
typed name, shows a REMIT badge on vendors with a separate payment address, and
warns when a typed name isn't in the list. An expenditure can also hold the
**claim number the Clerk returns after processing**.

### Follow-ups

1. ~~12 or 15 invoices per claim?~~ **Resolved 2026-08-14 — 15.**
2. **Q21** — when a contract rate changes, should scale tickets already written
   keep the old rate? (Same rate-history question as payroll.)
3. **Employees as vendors** — one record serving both, or two linked records?

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

### Scale ticket workflow — confirmed with staff 2026-07-26

Greg walked the flow through with the office. Their description:

1. Gravel arrives — **delivered to a stockpile or picked up by county forces**
2. Either way it is **entered into inventory** first
3. If it's placed on a road segment, it is then **costed out to that road**
4. Price is already known from the contract, so they enter at that rate
5. Scale tickets are matched to invoices as the invoices arrive

**Everything enters inventory. Nothing bypasses it.**

**Two bugs this exposes in the current build:**

1. `ScaleTicket.handleSave()` only creates a batch when
   `goesToStockpile === true`. A road-segment destination creates **no batch**,
   so that gravel never enters inventory at all.
2. The handler dispatches only `ADD_INVENTORY_TRANSACTION`. There is no
   `ADD_PROJECT_ENTRY`, so despite the ticket carrying a `projectId`, **the cost
   never lands on the project.** Direct-to-road gravel currently disappears
   entirely — absent from both inventory and project costs.

**Fix:** always create a batch on receipt. When the destination is a road
segment, immediately issue it out against that project, producing both the
inventory movement and the project material entry.

**Answered 2026-07-26 — flag for review, don't auto-apply.** When a reconciled
invoice changes the rate on a batch a project already consumed, the project entry
is flagged and shown in a review queue on the Reconcile tab. Nothing changes until
someone accepts it. Rationale: a project may already have been reported on, so a
silent cost change would be worse than a visible decision.

**Fixed and verified 2026-07-26.** All scale tickets now create a batch. Road
segment destinations additionally issue straight back out to the project,
producing the material entry. Reconciling at a different rate flags affected
project costs with accept / keep options rather than rewriting them.

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

## Infrastructure — ✅ ANSWERED 2026-07-26

37 of 38 answered. Full answers below, then what changes.

### Roads

| # | Question | Answer |
|---|---|---|
| 1 | Miles and division | **1,000 miles, one record per segment between intersections** |
| 2 | Segment identification | **Grid address assigned at each intersection** |
| 3 | Surface types | Concrete, bituminous, gravel, dirt |
| 4 | Condition rating | **No** — roads are not rated |
| 5 | Inspection frequency | Varies |
| 6 | Last graveled / bladed / sealed | **Yes — track this** |
| 7 | Mileage by surface type | Not required for reporting, but would be helpful |
| 8 | State reports | Filed when seeking funding reimbursement; forms and reports vary |

### Bridges

| # | Question | Answer |
|---|---|---|
| 9 | Who inspects | County staff |
| 10 | How results arrive | Greg pulls them from the **state database** |
| 11 | Enter or reference? | **Reference only** — don't re-enter inspection detail |
| 12 | What triggers action | A rating of **3 or 4** |
| 13 | Load postings / weight limits | Yes |
| 14 | State + county number | Both needed |
| 15 | Bridge reporting | All through the state database — **not needed here** |
| 16 | Scour / fracture-critical | Yes |
| 17 | Priority list | No |

### Culverts & structures

| # | Question | Answer |
|---|---|---|
| 18 | Bridge vs structure vs culvert | **NBIS-reportable → bridge. Under 20 ft but 48 in or larger → structure. Under 48 in → culvert.** |
| 19 | Numbering | **Township code + section number + order.** Assigned by the bridge foreman or the Highway Superintendent |
| 20 | Inspection cycle | **Every 4 years** |
| 21 | Condition scale | **0–5** |
| 22 | Details that matter | Material, shape, size, length, **number of barrels**, install date, road it's under |
| 23 | Township | Recorded, but **the township system was eliminated** — names are reference only and don't affect who pays. Noted as potentially useful if sold to a county that still has townships |
| 24 | Priority list | No — but **culverts rated 0 take priority** |

### Signs

| # | Question | Answer |
|---|---|---|
| 25 | How many | ~**3,500** |
| 26 | Retroreflectivity method | **Inspection** |
| 27 | Sheeting type + install date | Yes |
| 28 | How replacement is known | From inspections |
| 29 | HSIP reporting | GPS, cross road or approaching road, sometimes intersection |
| 30 | FHWA/state sign inventory | No |
| 31 | Posts vs faces | **Tracked separately** |
| 32 | Knocked-down sign | It gets put back up, then a **sign report** is made |

### Across all assets

| # | Question | Answer |
|---|---|---|
| 33 | GIS in use | **AppSheet GIS, Google Earth** |
| 34 | GPS coordinates | **Yes** |
| 35 | Photos on assets | **Yes** |
| 36 | Asset reports today | None — but wants cost reporting **to show the Board what things actually cost** |
| 37 | Lifetime cost per asset | **Yes** |
| 38 | Missing asset types | *(blank)* |

### Free-text note

> "At some structure and culvert sites there are multiple barrels that sometimes
> have different shapes, sizes and material."

**This is a data-shape change.** A structure isn't one pipe — it's a site with one
or more barrels, each with its own shape, size and material. Current schema holds
a single shape/size/material on the structure record.

---

### What changes

**Simplifications — less to build than assumed:**

- **Roads aren't rated.** Drop condition rating from roads entirely.
- **Bridge inspections are reference-only.** No NBIS data entry, no inspection
  forms, no state reporting from Pinpoint. Store identifiers, load posting, and a
  current rating pulled across; the state database stays the system of record.

**Corrections to what's built:**

- **Structure condition scale is 0–5, not 1–5.** Currently coded as 1–5 with
  1 = Critical. Needs 0 added, and 0 is the highest-priority state.
- **Road segments are identified by grid address**, not name/number. Needs
  confirming what the format looks like.

**New, not yet built:**

- **Barrels as sub-records** on a structure — shape, size, material, each
  independent
- **GPS coordinates** on every asset type
- **Photo attachments** on assets
- **Road surface history** — last graveled, bladed, sealed
- **Sign posts as separate records** from sign faces
- **Sign reports** — the artifact produced after a knock-down
- **Bridge extras** — load posting, weight limit, scour, fracture-critical flags
- **Mileage by surface type** — useful, not required
- **Lifetime cost per asset**, surfaced for the Board

### Follow-up questions

1. **What does a grid address look like?** — *Greg is getting this.*
2. **Rating scale meanings** — ✅ **Answered.** See below.
3. **Sign posts and faces** — ✅ **Answered.** See below.
4. **What is a "sign report"?** — ✅ **Answered.** See below.
5. **Barrels** — practical maximum, and are they numbered within a site? *Open.*
6. **What scale do signs use?** ✅ **Answered 2026-07-26** — Excellent, Good,
   Fair, Poor, Critical. Five levels, **no 0**. Signs don't have the exception
   state that culverts and structures do.

---

### Rating codes — answered 2026-07-26

Source: `Culvert and Structure Rating Codes.docx`, now in `docs/reference/`.

**5 is best, 1 is critical — and 0 is an exception, not the bottom of the scale.**

| Code | Culvert *(under 48")* | Structure *(48" or greater)* |
|---|---|---|
| 5 | New or like new, sound and adequate | Same |
| 4 | Minor rust or damage, still sound | Plus weathered planks/piling, minor concrete cracking |
| 3 | Rust with pinholes, major end damage, waterway issues starting. Too short or low | Plus deck plank or piling issues, cracking with spalling |
| 2 | Major rust with large holes, smashed ends, significant waterway issues | Plus pipe deformation, major plank/pile damage, severe cracking and spalling |
| 1 | Critical — possible failure, assess for closing | Same |
| **0** | **Inaccessible for assessment, or no rating can be assigned** | **Structure is closed** |

The criteria differ between the two types at nearly every level, so the rating
vocabulary is chosen from the asset's designation.

**Implemented 2026-07-26.** `RATING_CODES` in `Infrastructure.jsx` holds both
vocabularies; 0 renders in purple rather than on the red-to-green scale, since
placing it below 1 would misrepresent it; the "Needs Attention" count includes
0, 1 and 2; a collapsible criteria reference sits on the structures list.

---

### Sign posts — answered 2026-07-26

**Posts are not separate assets.** Some locations carry two signs on one post.
Each sign has its own number and its own record, and each records the same
support details — type, material, length, stub. Posts are only tracked as
*inventory*, i.e. what's in the yard for replacements.

So no post entity. Support fields stay on the sign record, which is what's
already built.

---

### Sign report — answered 2026-07-26

Source: `Copy of Sign PDF.docx` (AppSheet template), now in `docs/reference/`.

**The current workflow involves double entry:**

1. Sign tech replaces, inventories or fixes a sign
2. Updates it in the **AppSheet** app in the field
3. AppSheet generates this report
4. Emailed to the **project accountant**
5. She **prints** it
6. Sign tech **re-keys it** into the existing inventory system

Steps 4–6 exist only because the two systems don't talk.

**Fields on the report** — 26 in total, and Pinpoint's `createSign` already
covered 23 of them. Added 2026-07-26: `height`, `changedBy` (AppSheet "Editor"),
`lastModified` (AppSheet "Timestamp"), plus `sourceSystem` to mark imported
records.

One to check: **"Stub Used"** is a boolean in Pinpoint (`stub: false`) but may be
a size or type value in AppSheet.

**The near-term opportunity.** The sign tech needs a mobile device in the field,
and Pinpoint has no mobile app yet — so AppSheet has to stay for field capture
for now. But the re-keying can go: AppSheet is normally backed by a Google Sheet,
so if that can be exported, Pinpoint can import it directly and steps 4–6
disappear. **Needs confirming: what sits behind the AppSheet app, and can it be
exported?**

**Why it matters:** the module was built on assumptions rather than on how the
department actually works — the same problem inventory had. Much of this is also
driven by state and federal reporting that we shouldn't guess at.

---

## Equipment & Fleet — ✅ ANSWERED 2026-07-27

All 47 answered. **One answer invalidates a subsystem that's already built — see
"They don't use work orders" below.**

### The fleet

| # | Answer |
|---|---|
| 1 | **87 units** |
| 2 | Anything requiring regular maintenance, or that gets sold off, needs a record |
| 3 | **Becky assigns numbers, by prefix:** `1##` loaders/tractors · `2##` graders · `3##` dump trucks, semis, semi trailers · `4##` pickups · `5##` Weed Department · `6##` implements · `7##` pickup trailers |
| 4 | **Numbers are never reused** — otherwise you couldn't tell which machine was used historically. History follows the number |
| 5 | VIN, serial, license plate |
| 6 | Vendor, cost, fund. Warranty "would be nice". **Purchases are charged to projects and/or equipment numbers.** Old invoices get searched for part numbers when re-ordering — scanning invoices in "would be nice, not absolutely necessary" |
| 7 | Equipment is based at a location but it's only noted in the detail record. Inventory locations, by contrast, must stay separate for usage tracking and year-end count |
| 8 | Graders and some trucks have a regular operator |

**Note:** the unit prefixes match the inventory commodity group codes exactly —
group `228` is a 2003 140H CAT grader, `402` is a 1991 GMC pickup. The two
numbering systems are the same system.

### Meters & usage

| # | Answer |
|---|---|
| 9 | **Off-road tracked by hours, on-road by miles.** Both watched closely for service intervals |
| 10 | Becky records them. Read **every time equipment is fueled, serviced or repaired** |
| 11 | **A replaced meter is noted with the broken one's final reading so a running lifetime total can still be worked out** |
| 12 | Service intervals, operating cost, FEMA claims, replacement decisions |

### Preventive maintenance

| # | Answer |
|---|---|
| 13 | Hours or miles, occasionally calendar time for lightly-used equipment |
| 14 | **On/off road trucks:** oil 5,000 mi · trans, hydraulic, fuel 40,000 mi. **On-road trucks (2):** oil 10,000 mi · trans, hydraulic, fuel 40,000 mi. **Off-road:** oil 250 hr · trans, fuel 500 hr · trans, fuel, hydraulic 1,000 hr. **Greasing** as needed, up to several times a day |
| 15 | Meter readings determine it. Becky alerts so it can be scheduled |
| 16 | Advance warning — *"Not really necessary?"* (uncertain, worth confirming) |
| 17 | Yes — paperwork is filled out when a service is complete |
| 18 | Performed as soon as it can be. No catching up, no reset |

### Work orders — **they don't use them**

| # | Answer |
|---|---|
| 19 | **"Becky processes the service paperwork … Not an actual 'work order'. All records are entered in cost accounting, or fund accounting."** |
| 20 | Approval sought for scheduling, high repair cost, or if the unit is due for replacement |
| 21 | Repair, PM and accident damage are distinguished |
| 22 | Out-of-service time tracked occasionally |
| 23 | **Our own outside shops** → recorded like any work in cost accounting. **Another company** → recorded as outside labor in fund accounting |
| 24 | Warranty work only tracked via work orders from outside companies, scanned into the equipment file |
| 25 | *"If we are going to use work orders, yes. **If we aren't going to use work orders, the cost and fund accounting entries will need to have a way to link all entries to a project and/or an equipment number and/or an inventory number**"* |
| 26 | Parts entered in cost accounting, then removed from inventory |

### Fuel & tanks

| # | Answer |
|---|---|
| 27 | **8 tanks.** Kenesaw 1,500 gal diesel · Holstein 1,000 · Roseland 1,000 · Pauline 1,000 · Main 8,000 diesel + 8,000 unleaded · **402F** 100 · **430F** 100 |
| 28 | Metered pumps, **paper logs** |
| 29 | Main shop logs balanced against the tank monitor **daily**. Tanks dipped and reconciled **annually** |
| 30 | Mobile tanks filled at Main and logged. Dispensing to equipment records gallons + meter reading. **Outlying sheds are filled by contracted tank wagons** — operators record fuel on weekly timesheets |
| 31 | Cost per unit **and** per hour |
| 32 | Off-road vs on-road tracked for tax |

**The portable tanks are named after the pickups that carry them** — 402F and
430F correspond to units 402 and 430.

### Fuelling for other departments

| # | Answer |
|---|---|
| 33 | **Weed, Sheriff, Assessor, Emergency Management, Maintenance** |
| 34 | Paper logs in the fuel shed. Reconciled weekly, **billed monthly** |
| 35 | **Billed back** |
| 36 | **At cost** — no markup |
| 37 | First of every month. A ledger of date, who, and amount |
| 38 | They log their vehicle, mileage and fuel — but **billing is a department total.** Individual vehicles are only tracked for county highway units |
| 39 | Yes — need to know who pumped it |
| 40 | Revenue recognised **when the check is received** |
| 41 | Nobody else fuels there |

### Cost & replacement

| # | Answer |
|---|---|
| 42 | Yes — cost per hour and per mile |
| 43 | Fuel, parts, oils, shop supplies, all repairs, in-house and outside labor. **Depreciation uncertain** |
| 44 | No replacement schedule at present |
| 45 | Age, reliability, repair costs |
| 46 | **History stays in the system forever** — useful because they own multiples of the same unit |
| 47 | FEMA rates from <https://www.fema.gov/assistance/public/tools-resources/schedule-equipment-rates> |

---

### What this changes

**1. They don't use work orders — and Equipment.jsx is built around them.**

Work is recorded as cost accounting entries that reference an equipment number,
not as work orders. Q25 puts the decision plainly: either adopt work orders as a
new way of working, or make cost accounting entries linkable to equipment,
project and inventory. **This is Greg's call, and the biggest open question on
the project.**

**2. Meter replacement needs modelling.** A machine's lifetime hours are the sum
across meters — the old meter's final reading plus the new meter's current one. A
system assuming meters only increase will produce nonsense the first time one is
swapped.

**3. PM intervals are concrete and can be built now.** Six distinct schedules
across three equipment classes, driven by hours or miles.

**4. Fuel is a bigger subsystem than modelled.** Eight tanks, daily monitor
reconciliation at Main, annual dips, contracted tank wagons filling outlying
sheds, operator timesheets as a fuel source, off-road vs on-road tax split, and
monthly billing to five other departments at cost.

**5. Inter-departmental fuel is revenue** — recognised on receipt of the check,
which is cash-basis and needs a Fund Accounting path.

**6. Document attachment keeps recurring** — scanned invoices (Q6), outside
warranty work orders (Q24). Same deferral as photos: needs a backend.

### Follow-ups — answered 2026-07-27

1. **Work orders — KEEP them.** But parts on a work order must come out of
   inventory like everything else: anything bought is received into inventory
   first, then issued out to whatever consumes it.
2. **PM warnings — YES.**
3. **Per-vehicle detail for other departments — YES**, so a report can be
   produced if they challenge the numbers. Billing stays a department total.
4. **Depreciation — NO**, keep it out of cost-per-hour.

### Built 2026-07-27

**Work order parts now issue from inventory.** The old version was wrong four
ways: free-text "manual entry" invented parts with no catalog record, cost came
from `standardCost` rather than FIFO, inventory was never decremented
(`batchLines: []`), and the picker filtered on commodity group names that stopped
existing after the crosswalk. Now: catalog-only, FIFO cost across batches, an
issue transaction that decrements stock, blocked when there isn't enough on hand,
and parts tagged to that unit float to the top of the picker.

**PM warnings.** `pmStatus` compares lifetime meter against
`lastDoneMeter + interval`; `pmDueList` gathers everything overdue or approaching
across the fleet, worst first. Shown as a KPI and a panel on the Fleet tab.
Default warning windows are 25 hr / 500 mi / 1 month, overridable per schedule.

**Meter replacement handled** (Q11). `lifetimeMeter = meterOffset + currentMeter`,
so banking a dead gauge's final reading keeps the service clock honest. Verified:
a unit whose meter died at 8,750 hr and was replaced with one reading 412 shows
9,162 lifetime — naive code would read 412 and think it had 8,838 hours to go.

**PM presets** from Q14 are in `PM_PRESETS` — the three real schedules
(on/off road truck, on-road truck, off-road equipment) available as one-click
setup rather than typing intervals per unit.

### Fuel subsystem — built 2026-07-27

**The eight real tanks are seeded** — Main Shop diesel and unleaded (8,000 each,
monitored), Kenesaw 1,500, Holstein / Roseland / Pauline 1,000 each (all filled
by contracted tank wagons), and portables 402F and 430F at 100 gallons, each
recording the pickup that carries it.

**The fuel log now asks who took it.** County equipment or one of five other
departments. County entries capture the unit and meter reading; department
entries capture their vehicle and mileage as written on the paper log. Both
capture who pumped it and the off-road/on-road tax class.

**Fuel is costed from the tank's most recent delivery**, so "billed at cost" is
automatic rather than worked out by hand. A warning shows if a tank has no
delivery cost recorded yet.

**Department billing** groups a month's fuel by department with a Mark Billed /
Mark Paid flow. Expanding a department shows every fill-up — date, vehicle,
mileage, gallons, rate, amount, who pumped it — which is the answer to a
challenge. The bill itself stays a department total.

**Meter readings carry through.** Logging fuel updates the unit's meter, since
it's read at every fuelling anyway. It only moves forward, so a typo or a
post-swap gauge won't wind the clock backwards.

Verified: two Sheriff fill-ups and one Weed fill-up in July, at a $3.42 delivery
cost, bill as Sheriff $114.91 / Weed $106.02, total $220.93 across 64.6 gallons.
The county grader's 62.5 gallons is excluded from billing but counted in the
off-road tax total.

### Operating cost & tank reconciliation — built 2026-07-27

**Cost per hour / per mile** sits on each unit's Overview tab. Adds fuel, parts,
in-house labor and outside repairs; **excludes depreciation** as instructed. The
denominator is the metered span actually on record — earliest fuelling reading to
current lifetime meter — so it doesn't invent a rate from a single reading. A
stacked bar shows where the money went, which is what makes a repair-versus-
replace conversation concrete.

Verified: unit 241 with $655.61 fuel, $2,132.55 parts, $960 labor and $2,100
outside over a 300-hour span reports **$19.49/hr**, split fuel 11% · parts 36% ·
labor 16% · outside 36%.

**Tank reconciliation** distinguishes the two cadences. Monitored Main shop tanks
are balanced against the logs **daily**; everything else is dipped **annually**.
A panel on the Tanks tab lists anything overdue or never done, with the last
variance. Verified: Main shop read today = ok, Kenesaw dipped 200 days ago = ok,
Holstein 400 days ago = overdue.

### Still to build from this form

- **Operator timesheets as a fuel source** — outlying sheds are recorded on
  weekly timesheets, not at a pump. Needs the payroll/timesheet work first, so
  it's blocked behind the Payroll form.
- **Document attachment** — scanned invoices and outside warranty orders.
  Deferred with photos until there's a backend

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

Currently unusable in practice — labor can't be entered because employees don't
exist yet. These questions cover everything beyond that gap.

**Load-bearing questions:**

- **Q8** — should old cost entries keep the rate that applied at entry time?
  *(Same rate-history decision as payroll. Answer both the same way.)*
- **Q15** — the full FEMA claim walkthrough. Highest-value answer on the form.
- **Q18** — is the 15.7% labor overhead still current, and where does it come
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


---

## Infrastructure — build status 2026-07-26

**Built:**

- Culvert/structure 0–5 rating with the department's criteria, 0 rendered as an
  exception state rather than the bottom of the scale
- Barrels as sub-records with an Add Barrel button and live summary
- Culvert form trimmed — status, feature intersected, drainage, FAS number and
  route removed; FAS number and route moved to bridges
- Sign rating fixed to 5–1, no 0
- Road surface history — last graveled, bladed, sealed, shown on the list as
  "1 yr 2 mo ago" rather than a bare date
- Road segment length plus mileage-by-surface totals on the KPI cards
- Bridge load posting, load limit, scour critical, fracture critical, with flags
  in the list
- Bridge NBIS reduced to reference-only: a single current rating plus inspection
  date, framed as a copy from the state database. Legacy per-component ratings
  still display on records that have them
- Dropdown lists moved into `db.lookups`, editable under Settings

**Still open:**

- **Grid address format** for road segments — Greg is getting an example
- **Barrel numbering within a site** — probably moot, since barrels are specs
  rather than individually identified assets

**Deferred with reason:**

- **Photos.** Answered yes, and `photos` exists on every asset, but there's no UI
  and shouldn't be until there's a backend. Browser storage caps around 5–10 MB;
  photos across 3,500 signs would blow past that immediately.
- **Asset reports for the Board.** The cost linkage exists via
  `AssetCostHistory`; what the Board actually wants to see belongs to the Reports
  form, still outstanding.


---

## Year-end reporting — researched 2026-07-27

### Annual Certification of Program Compliance (ACPC)

Filed with the **Nebraska Board of Public Roads Classifications and Standards**
by **31 October** each year. Signed by the County Board Chairperson with a Board
resolution authorising the signing; the Highway Superintendent's signature is
optional but recommended. Statutes: §§39-2115, 39-2119, 39-2120, 39-2121,
39-2510(2).

**Failure to file suspends Highway Allocation funds.**

**Greg's decision 2026-07-27: Pinpoint does NOT touch the form.** The Clerk
receives it from NBCS each year and it goes to the Board for approval. NBCS also
states plainly that *"recreations will not be accepted"*, so producing it would
be actively wrong.

**Four of the nine certifications describe what Pinpoint does:**

> · *"uses a system of revenue and costs accounting which clearly includes a
>    comparison of receipts and expenditures for approved budgets…"*
> · *"uses a system of budgeting which reflects uses and sources of funds…"*
> · *"uses an accounting system including an inventory of machinery, equipment,
>    and supplies"*
> · *"uses an accounting system that tracks equipment operation costs"*

### Also in scope

- **One- and Six-Year Plan** annual reporting — 428 NAC 3
- **Standardized System of Annual Reporting for Roads, Street and Highway
  Programs** — 428 NAC 4, financial and inventory data. **Greg is retrieving a
  copy from his work computer.** Not scoped until then.
- **§39-2510(2)** — a determination of motor vehicle sales and use tax revenue to
  be expended, kept as a public record

### Built 2026-07-27

`Reporting.jsx`, replacing the "coming soon" nav slot. Fiscal year selector
(1 July – 30 June) and print CSS on both views.

**Annual Report** — the synopsis for the Board. Headline figures, where the money
went with a proportional bar, the road system by surface type with mileage, how
many segments were graveled/bladed/sealed this year, asset counts, fleet and fuel
including what was billed to other departments, and projects completed with their
costs.

**Compliance Support** — the evidence behind the four certifications, each quoted
verbatim against the report that backs it. Receipts vs expenditures; machinery,
equipment and supplies with the full equipment inventory and FIFO stock value;
and equipment operation costs per unit broken into fuel, parts, labor and outside
repairs.

Verified: the FY window includes 2025-07-01 through 2026-06-30 and excludes the
days either side; equipment costs roll up correctly per unit and exclude work
orders from prior years.

### Still open

- **428 NAC 4 annual report** — awaiting a copy


---

## Staff feedback outside the question sheets — 2026-07-27

Raised by Greg from staff testing, and some architectural musings.

### 1. Revenue had no way to edit — ✅ FIXED

**The real workflow:** revenue is received and entered, given to the Treasurer,
who sends back a receipt. The receipt signifies it's correct; otherwise it comes
back for adjustment. Once receipted it's officially recorded.

**Revenue does not belong to a claim cycle** — that's the expenditure side. The
old model gave revenue a `claimCycleId` and swept it up in
`APPROVE_CLAIM_CYCLE`, which was simply wrong.

**Built 2026-07-27.** New lifecycle:

```
entered → with Treasurer → receipted        (the receipt makes it official)
                         ↘ returned → corrected → resubmitted
```

Freely editable until receipted, then locked — changes after that are recorded
as **adjustments**, since the Treasurer holds a matching record. Revenue gets its
own tab with status filters and the receipt number stored against the entry.

Verified through the full cycle including a return and correction: returning
records the reason, resubmitting clears it, receipting locks the record, and a
later adjustment updates the figure while preserving both the receipt and an
audit line.

### 2. No county hardcoding — partially addressed, more to do

Three literal "Adams County" strings found (two in Reporting, one on the
inventory count sheet). **Still to fix.**

The larger issue is **seed data**: `DEFAULT_STORAGE_LOCATIONS`, `DEFAULT_TANKS`
and `DEFAULT_TOWNSHIPS` are all Adams County's, and `inventoryData.js` is 2,375
of its items. A clean copy for another county would arrive pre-loaded with the
wrong sheds and fuel tanks.

**Agreed approach:** storage locations, tanks and townships all become Settings
(the townships section exists but doesn't work — Settings writes somewhere
Infrastructure doesn't read). Seeds move to `data/seed/`, and a clean install
starts empty.

### 3. Inventory crosswalk needs to be repeatable

The current crosswalk is a Python script producing a file — fine for a mockup,
useless at go-live. **Agreed:** build a CSV import screen with a preview showing
what will change before anything commits. Replace semantics for the initial load,
clearly labelled. No staging database needed; the preview is what makes it safe.

### 4. Work orders as costing targets — agreed, not as projects

Costs should flow to work orders the way they flow to projects, but a work order
stays a work order — project numbers (`C1-###`, `M-YYYY-##`) mean something to
the Board and the state and shouldn't be diluted by 400 oil changes.

**Confirmed flow:** Fund Accounting (items arrive — into inventory, or direct to
a project or work order) → Inventory (assigned to a project or work order) →
Cost Accounting.

**Guard:** never total Fund Accounting and Cost Accounting together. Buying three
culverts for $9,000 is one event in Fund Accounting; consuming two on project A
and one on project B is $6,000 + $3,000 in Cost Accounting. Same money, two
views, different timing. Summing them double-counts.

### 5. PM work orders — agreed, with batch entry

PMs get work order numbers so costing tracks across modules. Volume is real —
87 units at 250-hour oil changes is several hundred a year — but the fix is fast
entry, not fewer records. One big annual PM record was considered and rejected:
it loses the per-machine detail that's the whole point.

**Design:** PM work orders created from the due list, pre-filled; batch entry so
six oil changes on a Tuesday is one screen; work order list defaults to open;
PM category so repair analysis can exclude routine service; closing stamps the
meter and resets the interval.

Greg's note: *"I will try it and if we don't like it, it can always be changed."*
The screen is cheap to change indefinitely; the data shape (PM = work order) is
cheap now and awkward after go-live. PM work orders carry a category from the
start so they can be separated later if wanted.

### Agreed sequence

1. ✅ **Revenue** — Treasurer receipt flow, editable, no claim cycle
2. ✅ **Settings** — townships and storage locations were writing where nothing
   read; both fixed, tanks section added, county hardcoding removed
3. ✅ **PM work orders with batch entry**
4. ✅ **Work orders as cost targets**
5. CSV import — any time before go-live

### Work orders as cost targets — built 2026-07-27

Cost Accounting's "Enter Costs" now offers **a project or an open work order**.
Work orders stay work orders — project numbers keep their meaning rather than
being diluted by several hundred oil changes a year.

The five entry components were written against a project parent. Rather than
rewrite them, a work order is presented through a small adapter: the record
exposes project-shaped field names (`partEntries` → `materialEntries`,
`serviceEntries` → `contractorEntries`) and dispatches are translated on the way
out to `ADD_WORK_ORDER_ENTRY`. Projects pass through untouched.

Work order entry shows only **Labor, Parts and Outside Service** — a work order
is *about* a machine, so there's no equipment line to add, and engineering
doesn't apply.

**By Project** gains a work order summary split into **repairs** and
**preventive**, which is what makes "what is this machine costing me in
breakdowns" answerable. Deliberately shown alongside projects rather than mixed
into them.

Verified: the shim exposes labor, parts and service under project-shaped names,
dispatches translate to the work order actions with the right entry types, and
project dispatches are unchanged.

### PM work orders — built 2026-07-27

A PM is a work order like any other, so parts come out of inventory at FIFO cost
and everything rolls into the unit's operating cost. Two fields link it back:
`pmScheduleId` and `pmService`.

**New PM Due tab.** Everything overdue or approaching across the fleet, worst
first. Tick what's been done, set the date and who did it once, and raise all the
work orders in one go — the shop's six Tuesday oil changes are one screen, not
six forms. Each still becomes its own work order against its own machine, so
costing stays per-unit. Select All and Select Overdue for speed. Picking a single
one opens it straight away so parts can be added.

**Overdue items open as urgent**, everything else routine.

**Closing a PM work order stamps the schedule** — `lastDoneMeter` and
`lastDoneDate` — so the interval resets and the warning stops firing for work
already done. Uses lifetime meter, so a replaced gauge doesn't reset the clock.

**Category stays `preventive`**, so repair analysis can exclude routine service —
"what is this grader costing me in breakdowns" shouldn't include oil changes.

Verified end to end: three units due (one overdue), batched into three work
orders one per machine, closing unit 241's at meter 3,480 stamps the schedule and
pushes the next oil change to 3,730, that unit drops off the due list, and a
separate hydraulic failure is the only work order counted as a repair.


---

## 2026-08-14 — Year-end reporting, and the state forms

Greg supplied the three 428 NAC 4 workbooks NBCS used to collect — SSAR
Financial, SSAR Materials & Supplies Inventory, SSAR Machinery & Equipment
Inventory — and then established the important thing about them:

> "I think we scrap those reports as they are not required any longer and just
> build our own reports that mirror the type of information on the reports. We
> are required to have some sort of system of inventory and accounting but we no
> longer have to submit these reports. Lets use them for reference only"

### What this changed

A first pass had gone a long way down the wrong road: a full line-by-line model
of the state forms and a rule for translating the county's account codes onto
NBCS line numbers. That work is **deleted**. It was accurate — 89 of 119
expenditure codes hit an exact state line — but accuracy against a form nobody
collects is worth nothing, and it carried real risk. A handful of Adams codes
diverge from the state's (`503.03` is Truck/Tractor/Side Dumps locally and Safety
Equipment to the state), so the translation would have needed a permanent review
screen and permanent maintenance.

**What survives is the obligation, not the form.** The county must *have* a
system of inventory and accounting, and the ACPC certifies that it does. So the
reports carry the same kinds of information in the county's own account codes.

The three workbooks are kept in `docs/reference/` for comparison only.

### Built

Reporting now has three tabs.

**Receipts & Expenditures.** Revenue by code, split between receipted and
awaiting the Treasurer — those two are never added together silently, because
only the receipt makes revenue official. Expenditures by account code, grouped
into the seven categories the leading digit already encodes (302.02 is a
category 3 code), each with budgeted, actual, remaining and percent used.
Over-budget lines turn red. CSV export. Carries the standing warning that these
are cash figures and must never be summed with Cost Accounting.

**Inventory & Equipment.** Materials and supplies valued at FIFO cost from the
open receiving batches — what was actually paid for what is actually on the
shelf, not standard cost. Viewable by account code or by commodity group, since
both questions get asked and neither view is wrong. Then the machinery and
equipment inventory: unit, acquired, purchase cost, hours or miles travelled in
the year, fuel, parts, labor, outside repairs, total, and cost rate per hour or
mile. No depreciation, as instructed.

**Meter travelled comes from the fuelling readings** — the one meter capture
that happens every time a unit is used. A unit needs two fuellings in the year
before a rate is calculated; with one reading there is no interval, so it shows
a dash rather than a fabricated number.

### Worth Greg's attention

**17 of the 53 GL codes on inventory items are not in the FY2027 budget chart:**
511.01, 511.02, 511.03, 511.05, 511.07, 513.04, 504, 218.05, 301.04, 301.08,
301.11, 303.02, 303.03, 304.01, 304.02, 304.04, 304.06.

They come through from the CSV and report fine — the code shows with a blank
description. But it's worth knowing whether they are dead codes from the old
system or live codes missing from the budget list.

**14 inventory items have no GL code at all.**


---

## 2026-08-14 — Staff bug list (Becky), and what it turned up

`App Bugs.docx`. Fifteen items, seven causes, three of them ours.

### Fixed

**Locations.** The export's `Inventory Usual Location` column was ignored and
location filled from the commodity group. The two agree on 1,746 of 2,375 rows
and disagree on 629. With no location holding stock, transfers offered nothing
to move. Real codes preserved; 95 locations seeded; 83 named by inference from
what is stored there. **91 parts are held at more than one location** — Becky
was right, SHOP VAC is in six.

**Everything reading TON.** Nothing defaulted to ton. Items say EACH/QUART/
GALLON, the dropdown offered TON/CY/LF/EA, and a select whose value matches no
option shows the first one. Vocabulary reconciled, and selects of stored codes
now always include the value actually held.

**Duplicate work order numbers.** Numbering read the selected unit's work
orders, so every machine started at 001. Moved to the reducer.

**Missing fuel departments — not a fuel bug.** Saved state replaced whole
objects instead of merging, so anything added to Settings after someone began
testing stayed invisible to them. Would have swallowed the claim limit too.

**Item history.** Every movement, newest first, with the vendor it came from or
the machine it went to. Always recorded, never shown.

**Fuel into mobile tanks.** Required a source, moves rather than invents,
refuses to over-draw, carries the cost per gallon. Second half found while
testing: the dispensing rate looked only at deliveries, and a mobile tank never
gets one — so fuel from it billed at **zero** and other departments were
undercharged. Rate now comes from the most recent fuel to enter the tank.

**Searchable part pickers**, in transfers and work order parts.

### Found while fixing — needs Greg

**Opening inventory value was wrong.** The crosswalk used Standard Cost — a
price list, not what stock cost — valuing the catalog at **$1.13m against the
legacy system's own $1.66m**. Now derived from Cost On Hand, tying to the penny.

**56 legacy rows cannot be right.** 13 with negative quantity, 43 carrying value
with no quantity — **$107,455.30** between them. One gravel line reads −0.97
units and $19,972. No opening balance created; each flagged on the item so it
surfaces at the next count. *Are these known ghosts?*

### Open questions

1. **What are location numbers 134, 2, 11, 14, 3, 5, 47, 13, 48, 430, 12, 6?**
   134 holds 1,124 items — parts, filters, chemicals, lubricant. Main parts room?
   The other 83 were named by inference and should be spot-checked.
2. **Credit invoices / returns.** Does a warranty return go back to the batch it
   came from at that batch's cost, or is it a credit against the vendor only?
   Changes what inventory is worth afterwards.
3. **Becky said "more to come"** — expect a second list.


---

## 2026-08-14 (later) — Greg's testing, and a rethink

### Equipment, from Greg tinkering

**One rate, not two.** `internalRate` removed — always set equal to the FEMA
rate in practice.

**Added to a machine:** fuel type, starting meter (a machine arrives with hours
on it), engine make and model, and repeatable lists of filters, fluids and
tires. Lists rather than fixed fields because a grader has three hydraulic
filters and a pickup has one oil filter. Filters carry both OEM and aftermarket
numbers — the OEM number is what every cross-reference is keyed on even when the
county buys aftermarket. Fluids carry a capacity, which is the thing actually
needed at 6am with the machine down.

Beyond the air/oil/hydraulic Greg listed: fuel, water separator, transmission,
cab air, coolant, DEF, breather, belt, battery, wiper.

**Work order labor was broken.** The tab never received `db` at all — no
employee list, no pay scales, no rate resolution, while Cost Accounting did all
three properly. Now picks a real employee and resolves the rate for the entry's
own date.

**Forms stay open.** "Add & keep going" alongside "add & close" on labor and
parts, keeping the date between rows.

**Identifiers lead.** Unit number is the biggest thing on a machine, work order
number on a work order. Year/make/model became the subtitle.

### PM — built wrong, then rebuilt

> "I still don't like how the PM schedule is trying to populate. Is this
> supposed to be updated at each PM or is this an enter and it should be helpful
> across many hour readings."

That question is the bug report. **It is set once and maintained by the system**
— and the screen was arguing otherwise, because `lastDoneMeter` sat in the row
as an editable box. Two faults, both mine: column headings rendered inside the
first data row (eleven items in a six-column grid), and every blank row showing
the placeholder "Oil & Filter", so adding three intervals looked like adding the
same one three times.

**Whichever comes first.** Meter threshold, calendar threshold, or both — the
nearer decides. Greg's case: *"sometimes we have a machine that isn't used for
quite sometime and probably needs a service even though it hasn't reached an
hour/mile threshold."* Twenty hours used but seven months elapsed is now caught.

**Meter captured at close**, not assumed — the only moment someone is certainly
standing at the machine. Any work order carries it forward, per Greg: *"Any
service including any work for a work order the hours or miles should be logged.
We log hours even when we add oil, hydraulic fluid, etc between services."*

**Cost per hour both ways** — this year, and lifetime from acquisition. Previous
owner hours excluded: *"Previous hours on a used machine are irrelevant as we
didn't fuel or maintain it."*

### Dates and dropdowns

51 native date inputs replaced. The new field takes `8/14/26`, `081426`,
`8-14-2026`, `2026-08-14`, or a bare `14` for the 14th of this month. Rejects
2/31 rather than rolling it into March.

41 option lists now title-cased. Hyphens deliberately survive — `15W-40` and
`F350SD 4X4` must not be mangled.

### Structure

**Equipment split** from one 2,828-line file into six. **Fuel promoted to its
own module** at Greg's suggestion: *"With all of the different billing and tank
management, I think it would be a better way to go."* He is right — it is an
operation, not a corner of Equipment.

Separating them exposed `tankUnitCost`, `reconciliationStatus` and `daysSince`
existing in two copies each. `tankUnitCost` is the rule behind the
mobile-tank-bills-at-zero bug; two copies of it is how that bug returns.

### Fuel deliveries — ANSWERED

> "I would like this to work seamlessly when a fuel truck shows up with a
> delivery we enter the fuel and invoice in one shot."

| Question | Answer |
|---|---|
| Invoice with the truck or later? | **Later**, like a scale ticket |
| Who enters it? | **Parts Manager usually** |
| Always create the claim? | **Always, but reviewable** |
| Is it contracted? | **No — bid PER DELIVERY.** *"It's not contracted, it's per fuel delivery"* |

That last correction mattered. I built a dated contract-rate series for fuel and
reverted it — she takes bids per load, so the price per gallon is known when the
truck arrives and the claim is complete from the start. The invoice arriving
later **checks** the bid rather than supplying the price.

Cost accounting needs nothing extra, as Greg said: the machine's hourly rate
carries fuel to a project. Buying fuel is fund accounting, burning it is cost
accounting, and the two are never summed — the same rule as the culvert.

### Open questions

1. **12 location numbers still unnamed**, including 134 (1,124 items).
2. **56 legacy inventory rows** carrying $107,455.30 — known ghosts?
3. **17 GL codes** on items that are not in the FY2027 budget chart.
4. **Should heating fuel or other tanks use a GL code other than 302.09?**
   Currently one default; could be per tank.
5. **Roles** — Greg wants Project Accountant and Parts Manager, with the
   Superintendent and Office Manager able to configure what each can see and
   edit. Pay rates stay restricted regardless. Sign Tech eventually.
6. **Becky's second list** — *"………………more to come LOL"*

### Still out

Settings (38), Projects (36), Cost Accounting (24), Reports (27), Fund
Accounting (46). Plus Payroll Q15 (overtime exemptions), Vendor Q21 (contract
rate history), employees-as-vendors, and the road segment grid address format.
