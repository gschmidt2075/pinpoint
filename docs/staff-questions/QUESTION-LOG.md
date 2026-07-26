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
| Fund Accounting — claim flow | *(asked in chat)* | 4 | **Awaiting answers** |
| Inventory | *(answered in chat)* | — | ✅ Complete |

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

## Not yet asked

Modules that will need their own round when we get to them:

- **Equipment** — PM schedules, work order approval, warranty tracking, meter readings
- **Projects** — numbering rules, approval workflow, close-out, carryover between fiscal years
- **Cost Accounting** — overhead allocation, FEMA report formats, what the Board sees
- **Infrastructure** — inspection cycles, NBIS workflow, sign retroreflectivity, HSIP reporting
- **Settings / permissions** — who can do what, approval limits, audit trail
