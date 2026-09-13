# The chart of accounts

Greg, 2026-09-13: *"Can you do a deep dive into the Nebraska Auditor of Public
Accounts website or similar to investigate the general ledger codes."*

Done. Source: the APA's *Accounting and Budgeting System for Nebraska Counties*,
[Chapter 5 — Expenditure Accounts](https://auditors.nebraska.gov/County_Info/CountyManual_Chapter_5.pdf),
page footers dated 8/5/26.

---

## The good news: our codes are the state's codes

Pinpoint's 152 codes are the APA **object codes**, written with a dot instead of
a space. The rule is `class digit` + `first two` + `.` + `last two`:

| Pinpoint | APA | Description |
|---|---|---|
| `302.02` | `3 0202` | Gravel & Rock |
| `302.09` | `3 0209` | Machinery and Equipment Fuel |
| `302.03` | `3 0203` | Grader Blades |
| `301.06` | `3 0106` | Shop Supplies |
| `201.0` | `2 0100` | Postal Service |
| `103.03` | `1 0303` | Regular Employee Salary — Maintenance |
| `110.0` | `1 1000` | FICA — County Share |

Descriptions match the manual almost word for word. Nothing needs renumbering.

## The gap: there is no function code

The APA code is **two parts**, and Pinpoint only has one.

**Function code** — 3 digits, *what activity the money was spent on*:

| | |
|---|---|
| 701 | Highway Superintendent |
| 702 | County Surveyor |
| 703 | County Engineer |
| **704** | **Bridge and Road Construction** |
| **705** | **Bridge and Road Maintenance** |
| 706 | Road Buyback Program |
| **707** | **Bridge and Road Special Projects** |
| 640 | Vehicle Maintenance |
| 985 | Equipment Acquisitions |

**Object code** — *what kind of thing was bought*. That is the part we have.

A complete expenditure is **function + object**. Gravel bought for road
maintenance is `705 / 3 0202`; the same gravel on a construction job is
`704 / 3 0202`. Pinpoint records only the second half, so it cannot today tell
construction from maintenance in the accounting — even though that distinction
is exactly what Greg's `M-2027-XX` numbering is for on the project side.

## What "add a code" actually means

From the manual, on its first page and repeated in Chapter 5:

> *"In order to maintain uniformity in the Numerical Codes, please contact the
> Auditor of Public Accounts office for assignment of new account numbers."*

So a county does **not** invent codes. New numbers are assigned by the state.
That changes the Settings screen: "add a code" should mean *bring one of the
state's codes into use here*, not *make one up*. A free-text box would produce
numbers that fail an audit.

It also settles the renumbering question. Codes change when the **APA** changes
them, which is rare and deliberate — not when a county feels like it.

## Two details worth noting

`2 3400 Townships – Dissolved Costs` exists in the state chart. Adams County
dissolved township government, so this is the code for that situation — a
reminder that the manual already anticipates the variations we keep finding.

`5 1200 Capital Outlay Contracts` breaks out armor coating, grading, cold mix,
bituminous and concrete surfacing, bridge contracts and gravel surfacing
individually — useful when Projects gets its root.

---

## What the county's own claim form says

Greg confirmed 705 is on the blank claim form. It is — and so is a good deal
more. Read out of `Blank Claim Form.xls` and `Claim Sheet Example.xlsx`, the
accounting block is a five-part string, entered one digit per cell:

```
Fund   Function   ??   ?   Expenditure Line
0300 - 0705     - 00 - 0 - 30106
```

Headed **Fund**, **Function** and **Expenditure Line** on the sheet. The blank
form arrives with `0300-0705-00-0-` already filled in on every line and only the
expenditure line left to type — so for this department the first four parts are
constants, and only the object code varies.

- **0300** — the Road fund
- **0705** — Bridge and Road Maintenance, exactly the APA function code
- **00** and **0** — always zero on this form. Purpose unknown; carried as
  configurable defaults rather than guessed at.
- **30106** — the object code. `3 0106` in the APA manual, `301.06` in Pinpoint

All three notations agree. A worked example from the real claim sheet: an
invoice of $562.32 for a specialty oil filter split into `...21400` $500.00
(Road Equipment Repair) and `...20100` $62.32 (Postal Service — the freight),
with mechanics wire at `...30106` $35.22 on its own line.

### The shape of a claim

Two separate lists, which is worth stating because they are easy to conflate:

- **Invoice lines** — date, invoice number, description, invoice total
- **Accounting lines** — the account string and an amount

One invoice can split across several accounting lines. The $562.32 above is one
invoice and two accounting lines. Pinpoint's expenditure already allows several
lines with different codes, so the shape fits; what is missing is the first four
parts of the account string.

### Other things the form carries that Pinpoint does not

- A **Vendor Code** assigned by the Clerk's office
- *"ALL CLAIMS MUST BE FILED WITHIN 90 DAYS"*
- Claim Preparer, Department Head, County Commissioner — Approve / Deny, and
  *"Denying a claim must be voted on separately by the county board"*

## Open

- What are the **`00`** and **`0`** segments? Always zero here, but they are in
  the county's account string and something means them.
- Should Pinpoint **print the claim sheet** in this layout, the way it now
  prints the department fuel invoice from the county's own blank?

Sources: [APA County Manual, Chapter 5](https://auditors.nebraska.gov/County_Info/CountyManual_Chapter_5.pdf) ·
[APA County Manual index](https://auditors.nebraska.gov/County_Info/County_Manual.html)
