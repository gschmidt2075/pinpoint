# Pinpoint — Project Notes

**Living document.** Read this first. It exists so that anyone — a new AI
conversation, a future developer, or Greg six months from now — can get oriented
in minutes instead of re-deriving everything.

Last updated: 2026-07-27

---

## What this is

A financial and asset management system for a county public works / highway
department. Built by **Greg Schmidt, Highway Superintendent** — the person who
actually does this job — for Adams County, Nebraska.

It replaces a mix of aging software, spreadsheets, and paper across:

- Fund accounting (claims, expenditures, revenue, budget)
- Cost accounting (labor, equipment, materials charged to projects)
- Inventory (2,375 items, FIFO costing, five sheds + stockpiles)
- Equipment (fleet, work orders, PM, fuel, tanks)
- Infrastructure (roads, bridges, culverts, signs)
- Projects (capital, maintenance, miscellaneous)

---

## Current state

| Module | File | State |
|---|---|---|
| Fund Accounting | `FundAccounting.jsx` | Built. Claim flow fully specified, **not yet restructured** |
| Cost Accounting | `CostAccounting.jsx` | Built. Unusable until employees exist |
| Inventory | `Inventory.jsx` | Built and overhauled against staff answers |
| Equipment | `Equipment.jsx` | Built and overhauled. Parts issue from inventory, PM warnings, fuel & department billing, operating cost |
| Infrastructure | `Infrastructure.jsx` | Built and overhauled. Barrels, 0–5 ratings, road history, bridge postings |
| Projects | `Projects.jsx` | Built. Form still out with staff |
| Settings | `Settings.jsx` | Built. **Dropdown Lists screen added** — lists now live in `db.lookups` |
| Employees | `Employees.jsx` | **Built 2026-07-27.** Rate history, per-person fringe, certifications, pay scales. Labour costing only — not payroll |
| Vendors | `Vendors.jsx` | **Built 2026-07-27.** Payees, remit-to, insurance, bonding, contract rates, supplied items |

**The two gaps matter more than they look.** `db.employees` and `db.vendors` are
read by Cost Accounting and Fund Accounting but nothing populates them. Labor
can't be costed to a project, and the vendor dropdown on the expenditure form is
permanently empty. Question forms are out with staff — see
`docs/staff-questions/`.

---

## Architecture

### Today

```
React (Vite) SPA  →  useReducer  →  localStorage
```

Single-page app, no backend. All state lives in one `useReducer` in `App.jsx`.
Persisted to browser localStorage so data survives refresh.

**Consequence:** data is per-browser, per-machine. Staff testing on different
computers have completely separate data. Fine for "does this workflow make
sense," useless for real work. This is a deliberate, temporary state.

### Where it's going (committed to county IT)

```
React SPA  →  Node.js + Express API  →  Microsoft SQL Server
                                        Azure AD authentication
                                        On-premise, county network only
```

See the IT requirements letter. **This commits us to SQL Server, not
PostgreSQL** — a Supabase/Postgres route was considered and rejected because it
contradicts what IT was told.

If an interim shared database is needed before the county server exists, use
**Azure SQL free tier** — it's the same SQL Server engine, so schema and queries
transfer unchanged.

### Deployment

- **GitHub:** `github.com/gschmidt2075/pinpoint`
- **Vercel:** auto-deploys from `main` on every push
- **Live preview:** https://pinpoint-uv5n.vercel.app
- Public URL, no password. Acceptable only because there's no real data yet.

---

## Domain concepts

Things that aren't obvious from the code.

**Fiscal year** — July 1 to June 30. FY2027 = 2026-07-01 through 2027-06-30.

**Claim cycles** — the County Board approves payments on the 1st and 3rd Tuesday.
Expenditures are assigned to a cycle; approval happens at the *cycle* level, not
per invoice.

**Claim sheet** — one vendor per sheet. Up to 16 invoice lines (date, invoice
number, description, total) and up to 8 accounting distribution rows. **The two
totals must match** — the paper form has a formula enforcing this. The current
expenditure form does not work this way yet; restructuring is blocked on staff
answers.

**Project types**
- Capital — numbered `C1-###`
- Maintenance — numbered `M-YYYY-##`
- Miscellaneous — no number, tracked by calendar year

**FEMA force account** — for disaster reimbursement. Labor gets a **15.7%
overhead multiplier** (`FEMA_OVH = 1.157`). Equipment uses published FEMA rates
by type and size rather than actual cost. `FEMA_EQUIPMENT_RATES` is defined and
exported from `Equipment.jsx`; `CostAccounting.jsx` imports it from there.

**FIFO inventory costing** — `db.inventoryBatches` drives cost-out. Oldest batch
by receipt date depletes first. Issues to a project consume batches in order and
the resulting cost lands on the project as a material entry.

**Scale tickets** — gravel and asphalt arrive by the truckload against a contract
rate, before any invoice exists. Tickets are created as
`invoiceStatus: "pending_reconciliation"`. When the invoice arrives, the
Reconcile tab matches it — **one invoice often covers many tickets**, so
reconcile supports multi-select. One contractor emails tickets individually;
another mails them in a batch. Both flow through the same queue.

*Confirmed with staff 2026-07-26:* **all gravel enters inventory first**, whether
delivered to a stockpile or picked up by county forces. If it's then placed on a
road, it's costed out to that road segment. Nothing bypasses inventory. The
**Fixed 2026-07-26.** Every scale ticket now creates a batch; a road-segment
destination then issues it straight back out to the project, producing the
material entry. If a later invoice reconciles at a different rate, affected
project costs are **flagged for review** in a queue on the Reconcile tab rather
than being rewritten silently — a project may already have been reported on.
Reducer action: `RESOLVE_COST_REVIEW` with `accept: true | false`.

**NBIS bridge ratings** — 0–9 scale. ≥7 good (green), 5–6 fair (amber), ≤4 poor
(red). Structures and signs use a separate 1–5 condition scale.

**Commodity groups** — from the legacy inventory system. A group is
simultaneously a *storage location*, a *material category*, **and** sometimes an
*equipment unit number*. "Bridge Supplies," "Kenesaw Shed," and "2012
International" are all valid groups. Do not try to normalize these into clean
categories — that was tried and was wrong. Preserve the source values.

---

## Decisions made, and why

**Inventory `legacyNumber` is preserved raw.** The legacy "Inventory #" is
inconsistent by nature — sometimes a manufacturer part number (`MS260-16`),
sometimes a sequence on a machine (`328-01`), sometimes a year marker for gravel
(`23-20M`). Attempting to parse it into structure loses information. Store it
as-is, display it prominently, make it searchable.

**Commodity group codes are displayed everywhere and sort numerically.** Group
`328 — 2012 International` is more identifiable to staff than the name alone,
especially for equipment.

**Transfers are limited to sheds and equipment.** Stockpiles receive stock via
scale ticket; portable tanks via the tank workflow in Equipment. Allowing
transfers into them would create two conflicting paths for the same thing.

**Low stock is opt-in per item.** A "track stock level" checkbox, then a minimum
quantity. Most of 2,375 items don't need a reorder point; forcing one on all of
them would produce noise, not signal.

**Part compatibility is bidirectional.** Tag a part to equipment units in
Inventory; it appears on that unit's Parts tab in Equipment with live stock. The
question being answered is "do we have this part for this machine."

**Dashboard shows only actionable lists.** Below-minimum items and pending scale
tickets. Static count tiles that don't link anywhere were removed — they looked
informative but nobody could do anything with them.

**localStorage, deliberately.** Chosen over a real database so staff can test
workflow before the data model is locked. Every schema change is nearly free
right now and gets expensive once a database exists.

**Work orders are kept, but parts come out of inventory.** Staff don't currently
use work orders — repairs are recorded as cost accounting entries. Greg chose to
adopt them anyway, on the condition that parts behave like every other inventory
movement: anything bought is received into inventory first, then issued out.

**Depreciation is excluded from operating cost.** Cost per hour is cash out the
door — fuel, parts, labour, outside repairs — not book value.

**Meters can be replaced.** Lifetime meter is `meterOffset + currentMeter`. Code
that assumes a meter only ever climbs will break the first time one is swapped.

**Unit numbers are never reused**, and they're the same numbers as the inventory
commodity group codes — group `228` is the 2003 140H CAT.

**Employees is not payroll.** The Clerk's office runs gross-to-net, withholding
and direct deposit. Pinpoint holds rates and benefit loading for one purpose:
costing labour to work. SSN, home address and date of birth are deliberately
absent — asked for and declined. Don't add them.

**Rates are dated series, not numbers.** A pay scale belongs to a classification
and takes effect from a date; an employee's classification is itself a dated
history; fringe is a dated per-person profile. `laborRateFor(employee, date,
payScales)` resolves what applied *on that date*, so a raise doesn't silently
rewrite last year's project costs.

---

## Deliberately deferred

Not forgotten — waiting on something.

| Item | Waiting on |
|---|---|
| Claim sheet restructure + Excel export | Nothing — fully specified, just needs building |
| Per-claim status incl. denial | Same. `APPROVE_CLAIM_CYCLE` can't express a single denial |
| Road segment grid address | Greg supplying an example |
| Operator timesheets as a fuel source | The payroll/timesheet work |
| Photos & document attachment | A backend — browser storage can't hold them |
| Real database + API | Data model stability, then a county server |
| Azure AD authentication | The database move |
| Mobile field app (Flutter) | Everything above |
| Inter-departmental fuel billing | Staff answer — see below |

**Discovered 2026-07-26:** other county departments (Sheriff, Weed Control,
others) fuel their vehicles at the highway shop. This was not in the design at
all. If those departments are billed, it's a revenue stream and belongs in Fund
Accounting, not just the fuel log. Questions are on the Equipment form.

---

## Conventions

- **Lookup lists:** every dropdown that might change lives in `db.lookups`,
  defined by `LOOKUP_DEFS` in `schema.js` and edited under Settings → Dropdown
  Lists. Do not hardcode a list in a module. Records store the string value, so
  renaming a list value does not rewrite existing records (see Settings Q3,
  unanswered).
- **Styling:** inline styles throughout. No CSS framework, no styled-components.
  Shared primitives (`Icon`, `Field`, `SectionCard`, `Table`, `KPICard`, `inp`,
  `btn`, `fmt`, `fmtSm`) live in `components/shared.jsx`.
- **Colors:** green `#1a5a3a` primary, navy `#1a3a5c` secondary, red `#c0392b`
  alert, amber `#d97706` warning.
- **State:** one `useReducer` in `App.jsx`. Modules receive `db` and `dispatch`
  as props. No context, no Redux.
- **Object shapes:** every entity has a factory function in `data/schema.js`.
  Add fields there, not ad hoc in modules.
- **Money:** `fmt()` for full amounts, `fmtSm()` for compact.
- **Dates:** ISO `YYYY-MM-DD` in state; `fmtDate()` for display.

---

## File map

```
src/
  App.jsx                    State, reducer, nav shell, localStorage persistence
  data/
    schema.js                Factory functions for every entity — source of truth
    accountCodes.js          152 expenditure codes, fiscal year, expense types
    inventoryData.js         2,375 items + opening batches (2.8 MB, generated)
  components/
    shared.jsx               Shared UI primitives
  modules/
    FundAccounting.jsx       Claims, expenditures, revenue, ledger, amendments
    CostAccounting.jsx       Labor/equipment/material costs per project, FEMA
    Inventory.jsx            Items, receive, scale tickets, issue, transfer, count
    Equipment.jsx            Fleet, work orders, PM, fuel, tanks, parts
    Infrastructure.jsx       Roads, bridges, structures, signs
    Projects.jsx             Project records
    Settings.jsx             County info, fiscal year, account codes, lookups
docs/
  staff-questions/           Question forms and the running answer log
```

`inventoryData.js` is generated from a CSV by a Python script — do not hand-edit.
It disappears once inventory lives in a database.

---

## How we work

**Weekend build, weekday test.** Greg builds on weekends; staff use the Vercel
preview during the week and report back.

**Questions go on paper.** Rather than guessing at workflow, questions are
collected into Word forms in `docs/staff-questions/`, filled in by staff, and
returned. Answers get recorded in `QUESTION-LOG.md` before code is written.

**Update this file at the end of each session.** Decisions, deferrals, anything
learned about how the department actually works.

---

## Known problems

- **OneDrive vs git.** The repo lives in OneDrive, which holds `.git` files open
  and leaves stale `index.lock` / `HEAD.lock` files after operations. Moving the
  project outside OneDrive would eliminate this.
- **`inventoryData.js` is 2.8 MB.** Fine for GitHub, makes the browser bundle
  large. Goes away with a real database.
- **The preview URL is public.** No real data should be entered until there's
  authentication.

---

## Under consideration — multi-county product

Greg is weighing whether Pinpoint could be sold to other counties.

**Not committed. No work should be done specifically for this yet.**

The reason it's recorded here: a few cheap habits keep the option open, and
they're good practice regardless.

- Don't hardcode "Adams County" anywhere — it's already in `countyInfo`
- Keep account codes, townships, storage locations, and equipment types as data,
  not constants in module files
- Keep the API layer separate from UI, so the database underneath can change
- Avoid assuming Nebraska-specific rules without marking them as such

What would genuinely need building *later* if this happens — multi-tenancy, a
setup wizard, billing, support processes — is out of scope now and shouldn't
influence current decisions.

---

## Quick orientation for a new conversation

1. Read this file
2. Read `docs/staff-questions/QUESTION-LOG.md` for open questions
3. Read `src/data/schema.js` for data shapes
4. Ask before assuming how the department works — it's usually not what you'd guess
