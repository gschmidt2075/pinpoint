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
| Infrastructure | `Infrastructure-Questions.docx` | 38 | ✅ **Answered** — 5 follow-ups |
| Equipment & Fleet | `Equipment-Questions.docx` | 47 | **Awaiting answers** |
| Projects | `Projects-Questions.docx` | 36 | **Awaiting answers** |
| Cost Accounting | `CostAccounting-Questions.docx` | 24 | **Awaiting answers** |
| Reports & Printed Documents | `Reports-Questions.docx` | 27 | **Awaiting answers** |
| Fund Accounting — claim flow | *(answered in chat)* | 4 | ✅ Complete |
| Fund Accounting — everything else | `FundAccounting-Questions.docx` | 46 | **Awaiting answers** |
| Inventory | *(answered in chat)* | — | ✅ Complete |

**283 questions outstanding across 7 forms.** Do not hand these out all at once —
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

#### Claim size limit — resolved 2026-07-26

**One rule only: a maximum of 15 invoices per claim, per vendor.** Beyond that it
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
6. **What scale do signs use, and what are its criteria?** *Open — the rating
   codes document covers culverts and structures only.*

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
