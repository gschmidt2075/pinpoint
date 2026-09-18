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

## The constraint that shapes everything

> *"I can't rely on you to work this once it goes live. When this is transferred
> to county servers it will be clean and you will not have access to it."* —
> Greg, 2026-09-13

This sits alongside "don't hardcode Adams County" as a standing rule, and it is
the sharper of the two. **Anything a county will need to change must be
changeable by the county**, in the program, without a developer.

It already ruled out a plan this week: the FEMA equipment rates were going to be
a PDF I parsed and shipped as data, refreshed each year when Greg sent me the
new schedule. That makes the county dependent on me every January. It is a table
they edit instead — structured like the published schedule, Cost Code first, with
the rows they actually use marked.

Apply the same test to everything: if the answer to "who updates this next year"
is me, it is built wrong.

---

## Waiting on you

| # | Question | Blocks |
|---|---|---|
| 60 | Does the fiscal year selector change what you see **everywhere**, or only in Fund Accounting? Inventory, equipment and fuel are all dated too. | How wide the year work reaches |
| 61 | **Proposed and approved budget** — two figures side by side all year, or one figure that gets edited until it is approved and then locked? | The budget screen |
| 62 | **Retire by absence** — is a code hidden from the dashboard simply because it has no budget amount and no activity that year, with no separate "retired" switch? | Account codes |
| 67 | The claim form's account string is `0300-0705-**00-0**-30106`. What are the **`00`** and **`0`** segments? Always zero on your form, but they mean something. | Printing a claim that matches |
| 68 | Should Pinpoint **print the claim sheet** in the county's own layout, the way it now prints the department fuel invoice? | Whether the Clerk gets a familiar page |
| 109 | Does the **county server have internet access**? Decides whether map tiles come from OpenStreetMap or have to be self-hosted. | Mapping |
| 110 | Will the county GIS give you a **road centerline layer**, and do its road names match yours? A road segment holds one point today, so it can be pinned but not drawn. | Roads on a map |
| 111 | On a map, do you want to **place things by clicking**, or only look at what is already there? | How big the map work is |
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

**A map button wherever there are coordinates.** Built 2026-09-13. Greg: *"is
there any way we could provide a map button for anything that has GPS data that
takes you to like Google maps."* One `MapLink`, used on roads, bridges,
culverts and signs, and available to signs and projects when those are built.

The map URL is a **template in settings**, not a constant — a county that
standardises on something other than Google should not need a developer to
change a web address. That is the go-live constraint applied to a two-line
detail.

It renders **nothing** when the coordinate is missing or unreadable, rather
than a greyed-out button that invites a click going nowhere. And `0, 0` counts
as unreadable: it is what two empty number fields look like, it is in the
Atlantic, and it has never been a culvert.

### Projects, settled 2026-09-18

**There are TWO years, and neither of them is stored.**

Greg: *"Once a project gets a number and work actually starts on it, the number
stays with it and isn't across fiscal year but calendar year. A M-2026-54 may
have been started on June 1, 2026 and finished on July 5, 2026... So if
something got bought for the project on July 2 it would apply to the next fiscal
year. The other problem being is if the State does any auditing for work and not
the fund accounting it is calendar year and not fiscal."*

So one project spans two fiscal years while keeping one calendar-year number,
and the same costs have to report two ways:

| Question | Basis |
|---|---|
| What did the county spend, and against which budget | **Fiscal** year, 1 July – 30 June |
| What work was done, for a state audit of the work | **Calendar** year |

This settles the fiscal year design rather than complicating it. **A record
stores its date and nothing else.** Both years are worked out from that date,
and a report picks which basis it is asking on. Storing either one would create
a second fact that can disagree with the date — and here it would be wrong half
the time by construction, since a project legitimately belongs to one calendar
year and two fiscal years at once.

The same shape already exists for the fuel tax, which reports on calendar
quarters while the county's books run July to June.

**A project keeps its number.** Renumbering happens in exactly one case: a
number was issued, no work started, and 1 January arrives — then it takes a new
calendar-year number. Not at fiscal year end, and not because work is
unfinished.

**A FEMA number can be added to a project already running** — a flood event mid
job. So the FEMA identifier is something a project gains, not something it is
created as.

**Always reference a road segment**, even for a bridge or culvert job. Greg:
*"so we can keep track of what has been done in that segment of road throughout
the years."* The segment is the spine that everything else hangs off.

**Coordinates are never stored on a project.** They come from the referenced
asset — structure if there is one, segment if not — so the project can never
disagree with what Infrastructure says.

**Who can issue a project number is a permission**, not a person. Greg: *"They
will not have the sole right to issue a number. It should be a setting as to who
can."*

**A capital project's final synopsis is a SCREEN in Cost Accounting**, not a
third place for money to live — estimate, bid, contract amount, actual to date,
variance, contractor. Printable for the Board, but the screen is the thing.

**A misc project has no location; its COST ENTRIES carry the segment.** Greg
wants to know where asphalt patching happened without pretending a county-wide
project sits somewhere. One relationship seen from two ends again: the project
answers "what did patching cost this year", the segment answers "what has been
done on Riverview".

**The hardcoded lists go.** `Projects.jsx` carries its own
`PROJECT_TYPES_CAPITAL`, `PROJECT_TYPES_MAINT` and `FUNDING_SOURCES` while the
Settings lookups of the same names sit empty — which is exactly the mismatch
Greg reported. The lookup is the list.

### Cost accounting, settled 2026-09-18

**A labor rate comes from the day the work was done**, not the day it was
typed. So a backdated correction reprices, exactly like fuel and for the same
reason.

**An equipment work order is its own cost target, not a line on a road
project.** Greg: *"any equipment work order should be treated like an M-XXXX-XX
type of project but with equipment and not infrastructure."* It accumulates
parts, labor and fluids against itself and against the machine. It does **not**
belong to a project — Greg, flatly, on whether every work order does: *"No."*

That is simpler than the alternative. Nothing has to decide which road project a
February grader service belongs to, because the answer is none.

**Enter Costs is a dashboard**: pick the project, then enter everything against
it, rather than choosing a project on every line.

**Three rates bugs that are mine, not design gaps.** `CostAccounting.jsx` line
355 reads `emp.classification`, `emp.straightTimeRate`, `emp.overtimeRate` and
`emp.fringeRate` — none of which exist any more. The employee rebuild moved pay
to a dated `rateHistory` and classification to dated `assignments`, so all four
read `undefined` and quietly fill zeros. That is Greg's *"a lot of the rates or
classifications do not come over"*, and it is breakage I introduced.

The operator field is free text and should be the employee list, like the fuel
pump. And nothing in the reducer connects a closing work order to anything —
that was never built rather than broken.

### Equipment, settled 2026-09-13

**PM intervals already work the way Greg described** — a list of separate
services per unit, each with its own interval, not a nested ladder. Oil at 250,
filters at 500, hydraulics at 1000 means all three land together at 1000 by
arithmetic. Nobody describes the overlaps; they happen.

**PM folds into work orders.** The PM log records service, meter, who and a cost
and nothing else — no parts, labor or fluids, which is why it needed replacing.
PM Due stays as the view of what is coming; marking one done opens a work order.

**No pre-filled parts on a PM work order.** Greg: *"we may have a different part
number for a filter depending on if it is OEM or a cross match."* A pre-filled
list would be wrong about half the time and trusted anyway.

**A closed work order reopens and everything is editable**, with no cut-off.
Parts already issued unwind properly — changing a quantity puts stock back.

**Fluids go through inventory at whatever unit the item carries** — quart,
gallon, drum. Greg: *"there are quarts on the shelf, drums and large holding
tanks."* A light "issue to a unit" action puts a quart of oil on a machine
without opening a work order.

**In Shop is removed.** Greg knows what is in his shop; an open work order says
it anyway.

**FEMA rates are also the county's own equipment rates.** Greg: *"we use this as
a cost out on our projects also."* So importing the schedule is not a reference
list, it sets the rates that cost every project — and only the handful matching
machines the county owns need marking as in use.

**Townships start empty, and some of them are real government.** 27 of
Nebraska's 93 counties are township counties, where a township board has
authority over township roads and the county levies a tax within the township
to pay for them; a county can delegate road maintenance to a township. Adams
County dropped township government, so for Greg they are reference only — but
"for reference only" cannot be printed on the screen for everybody. A township
will carry a flag for whether it is a road authority.
