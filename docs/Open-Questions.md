# Open questions

> *"Will you keep me a running tab of items that I have not made clear yet"* —
> Greg, 2026-09-12

Things waiting on an answer, and things waiting on somebody outside this
project. Kept here rather than in a chat transcript so neither of us has to
remember where it was said.

**Nothing on this list is built.** Where a decision was needed to make progress
and I made one, it is in the Settled section at the bottom with the reasoning,
so it can be overturned cheaply.

---

## Waiting on you

| # | Question | Blocks |
|---|---|---|
| 60 | Does the fiscal year selector change what you see **everywhere**, or only in Fund Accounting? Inventory, equipment and fuel are all dated too. | How wide the year work reaches |
| 61 | **Proposed and approved budget** — two figures side by side all year, or one figure that gets edited until it is approved and then locked? | The budget screen |
| 62 | **Retire by absence** — is a code hidden from the dashboard simply because it has no budget amount and no activity that year, with no separate "retired" switch? | Account codes |
| 67 | The claim form's account string is `0300-0705-**00-0**-30106`. What are the **`00`** and **`0`** segments? Always zero on your form, but they mean something. | Printing a claim that matches |
| 68 | Should Pinpoint **print the claim sheet** in the county's own layout, the way it now prints the department fuel invoice? | Whether the Clerk gets a familiar page |
| 69 | The form says **claims must be filed within 90 days**, and carries a **Vendor Code** from the Clerk's office. Should Pinpoint warn on the first and hold the second? | Vendors and claims |

## Waiting on somebody else

| # | Question | Who |
|---|---|---|
| 59 | Can the county server do **Azure AD**, and what would a county without it use instead? Until this is known there is no point building a login. | County IT |
| 35 | Which **fuel tax** the county actually remits — the rate table takes any number of named taxes, so nothing is blocked, but the report will name whatever you enter. | Whoever prepares the return |
| — | **Liability and ownership** if the Board wants to proceed. | County Attorney |

## Known gaps, not yet scheduled

- **171 staff questions** across five questionnaires are still unanswered.
- `access` is passed to all ten modules and **none of them read it** — roles
  shape the menu but not what happens inside a screen. `check-props` reports it
  on every run.
- **Testing Tools** (Settings → Reset Data) must be removed before go-live.
- The seeded Adams County inventory must be **stripped and re-crosswalked** from
  a fresh export at go-live.

---

## Settled, with the reasoning

Listed so a decision can be argued with later rather than rediscovered.

**A record's fiscal year is worked out from its date, not stored on it.**
A claim dated 3 August 2026 is FY2027 and cannot be anything else. Storing the
year alongside the date would create two facts that can disagree, and they
always eventually do — usually when somebody corrects a date.

**Close-out locks the budget, not the transactions.** Greg: *"The only lock
that we would need is when the budget gets finalized for that year's budget
numbers. I think being able to adjust or add a receipt might be necessary."*
Yes — and every edit is already written to the audit trail, so a late receipt
is a recorded change rather than a hole.

**A code is renumbered, not replaced.** The code keeps its identity and carries
a dated history of its numbers, the same shape as an employee's pay and the
fuel tax rate. History follows the code rather than being stranded on the old
number.

**Funds start empty.** No Roads, Capital, Grant or Special Revenue shipped.
Some counties fund roads from the general fund and would have to delete ours
first.

**An account code does not belong to a fund.** Greg's call. The fund is chosen
per entry.

**Codes are not invented by the county.** The APA manual: *"In order to maintain
uniformity in the Numerical Codes, please contact the Auditor of Public Accounts
office for assignment of new account numbers."* So "add a code" in Settings
means bringing one of the state's codes into use, not typing a new number — a
free-text box would produce numbers that fail an audit. This also settles
renumbering: it happens when the APA changes a code, which is rare and
deliberate.

**Pinpoint's 152 codes already ARE the state's object codes**, written with a
dot instead of a space — `302.02` is the APA's `3 0202 Gravel & Rock`. Nothing
needs renumbering. What is missing is the FUNCTION half of the code. See
`Account-Codes.md`.

**A fiscal year governs the money; operational work gets a date range.** Greg:
*"our Maintenance projects tend to overlap the fiscal year... Would it be
feasible to put a searchable date range in there."* Yes, and it is the right
shape. A project is not owned by a year — M-2026-14 can run from April into
September and belongs to neither year cleanly. Forcing one on it would mean
choosing which year to hide it from.

**The budget is one figure, not two.** Greg: *"One figure edited until it's
approved. After it's approved I do not care to see the proposed."* Edited freely
until the Board approves it in September, then locked. The audit trail carries
what it used to say, for anyone who asks.

**The account string is Fund-Function-XX-X-Object, and the first four parts are
constant for this department.** Confirmed off the county's own blank claim form,
which arrives pre-filled with `0300-0705-00-0-` and only the object code left to
type. Greg: the function code is *"per claim"* — which matches, since 0705 is
printed once at the top of the accounting block and every line shares it. It
still has to be configurable: 704 and 707 exist, and another county's fund
number will not be 0300.

**Townships start empty, and some of them are real government.** 27 of
Nebraska's 93 counties are township counties, where a township board has
authority over township roads and the county levies a tax within the township
to pay for them; a county can delegate road maintenance to a township. Adams
County dropped township government, so for Greg they are reference only — but
"for reference only" cannot be printed on the screen for everybody. A township
will carry a flag for whether it is a road authority.
