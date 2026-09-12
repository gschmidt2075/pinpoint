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
| 63 | When a code is renumbered, can the **old number ever be reused** for something different later? | Whether a number is an identity |

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

**Townships start empty, and some of them are real government.** 27 of
Nebraska's 93 counties are township counties, where a township board has
authority over township roads and the county levies a tax within the township
to pay for them; a county can delegate road maintenance to a township. Adams
County dropped township government, so for Greg they are reference only — but
"for reference only" cannot be printed on the screen for everybody. A township
will carry a flag for whether it is a road authority.
