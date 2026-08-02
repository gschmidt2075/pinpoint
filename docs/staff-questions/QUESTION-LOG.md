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

#### Claim size limit — new constraint

**Maximum 15 lines per claim.** Beyond that it becomes a *separate claim*, not a
continuation page. Pinpoint must split automatically and produce multiple sheets.

Two open details before the split logic can be written:

- **Do continuation rows count toward the 15?** An item with several codes takes
  two rows — the item, then the breakdown. Does that item consume 1 or 2?
- **Is the 8-row accounting block also a hard limit?** It may bind before the 15
  does: fifteen items with distinct codes would need fifteen accounting rows and
  there are eight. If so, a claim splits when *either* limit is reached.

Note: `ExpenditureForm` already caps line items at 15 (`if (lines.length < 15)`),
which lines up — though that limit is per expenditure, and a claim sheet groups
several expenditures from one vendor, so the cap needs to move up to the sheet.

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

**Open design question:** if a direct-to-road batch is consumed the moment it's
created, and the invoice later comes in at a different rate, the correction has
to ripple through to the project's material entry as well as the batch. Staff say
the contract price is usually right, so this should be rare — but the system
needs to handle it rather than silently leaving the project cost wrong.

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
