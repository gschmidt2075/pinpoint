# Pinpoint — briefing for drafting a development agreement

**Prepared for:** Greg Schmidt, Highway Superintendent, Adams County, Nebraska
**Purpose:** Context for drafting an agreement with the Adams County Board of
Supervisors covering time spent developing and testing this software.
**Date:** 30 August 2026

---

## How to use this document

Paste it at the start of a fresh conversation, or hand it to an attorney. It
contains the facts about what has been built, Greg's position, and the questions
a drafter has to answer. It deliberately does **not** contain draft contract
language.

**Nothing here is legal advice.** It was written by an AI assistant that helped
build the software, not by a lawyer. The ownership question below is genuinely
contested territory in employment and public-sector law, it turns on Nebraska
statute, Adams County personnel policy and Greg's terms of employment, and it
needs a licensed attorney. See *Who should draft this* at the end.

---

## 1. What the software is

**Pinpoint** is a financial and asset management system for a county highway
department. It replaces R&B IMS — a system dating from 1999 — together with a
collection of spreadsheets and paper processes.

Eleven modules, at varying stages of completeness:

| Module | What it does |
|---|---|
| Fund Accounting | Expenditures, revenue, claim cycles, budget amendments |
| Cost Accounting | What work costs — labor, equipment, materials, by project |
| Inventory | 2,302 catalog items, FIFO costing, transfers, count sheets |
| Equipment | Fleet, work orders, preventive maintenance |
| Fuel | Tanks, deliveries, dispensing, UST daily inventory records |
| Projects | Capital, maintenance and miscellaneous project lifecycles |
| Infrastructure | Roads, bridges, culverts, signs |
| Employees | People, classifications, pay history, certifications |
| Vendors | Suppliers, insurance certificates |
| Reporting | Year-end compliance and Board reporting |
| Settings | County configuration, roles, audit trail |

**Scale as at 30 August 2026:** roughly 21,200 lines of hand-written source
across 29 files, plus 128,000 lines of generated data from the inventory
crosswalk. 177 automated tests. Five design documents. 66 commits between
8 June and 16 August 2026, with substantial further work since.

---

## 2. What it does for the county

Worth stating plainly, because it is the consideration flowing to the county and
a drafter will need it.

- **Replaces a 1999 system** that the county still depends on for inventory and
  accounting.
- **Carries the existing inventory across exactly.** The crosswalk reconciles to
  the legacy books to the penny — $1,554,890.75 of opening inventory value — and
  flags 105 rows it could not carry cleanly rather than guessing at them.
- **Supports statutory obligations.** Nebraska requires the county to maintain a
  system of inventory and accounting. The Annual Certification of Program
  Compliance filed with the Board of Public Roads Classifications and Standards
  by 31 October depends on records of this kind; four of its nine certifications
  describe systems this software provides. Underground storage tank records
  required under 40 CFR 280.43(a) are also generated here.
- **Finds errors the old system hid.** The crosswalk surfaced $107,455.30 of
  book value with no stock behind it, and 44 part numbers duplicated across
  sheds because the old system could not hold one item in two places.

---

## 3. The facts a drafter needs

- Greg is a **salaried county employee**, not a contractor.
- The work has been done **on county time, on county equipment, using county
  data**, over roughly three months to date, and is ongoing.
- No agreement of any kind currently exists.
- The software is **not yet in production**. No real financial data has been
  entered; staff are testing against a copy of the inventory export.
- Greg has **deliberately avoided hardcoding Adams County** into the program —
  funds, townships, tanks, roles and inventory groups are all configurable — with
  the express intention that other counties could use it.
- The county's own data (the inventory export) is embedded in the current build
  and would have to be removed before any distribution to another county.
- Development has been assisted by an AI tool. The extent to which that affects
  authorship and copyright is an open question a drafter should consider.

---

## 4. Greg's position

**He expects to own the software, with the county receiving a licence to use
it.** That is the position the draft should express.

The rationale, as he has described it: the design, the domain knowledge and the
direction are his, and he intends the result to be usable by other Nebraska
counties facing the same problem with the same obsolete system.

**The honest counterweight, which the draft has to deal with rather than
ignore:** work made by an employee within the scope of their employment is, by
default, generally owned by the employer. A county that has paid for the time,
supplied the equipment and provided the data has a plain argument that the work
belongs to it. Greg's position is *arguable* — it is not *automatic* — and an
agreement that simply asserts it without addressing the default is likely to be
challenged later, which is the outcome the agreement exists to prevent.

Settling this deliberately, in writing, before the software carries real county
financial records is very much in both parties' interests.

---

## 5. Questions the agreement has to answer

**On the time**

1. Is development an authorised part of the Superintendent's duties, or separate
   work? If separate, is it unpaid, or compensated differently?
2. How is time recorded and reported to the Board, and how often?
3. Is there a cap, or a review point at which the Board reconsiders?
4. What happens to the arrangement if Greg leaves the position?

**On ownership**

5. Who owns the copyright in the source code?
6. If Greg owns it: what licence does the county get? Perpetual, irrevocable,
   free of charge? Can the county keep using it if he leaves, or if the
   relationship ends badly?
7. If the county owns it: what rights does Greg retain to develop or license a
   derivative to other counties?
8. Who owns the county's **data** — as distinct from the software? (This should
   be uncontroversial: the data is the county's.)
9. What happens to work done *before* the agreement is signed? Is it covered
   retrospectively, and from what date?

**On other counties**

10. If Greg licenses or sells this to another county, does Adams County receive
    anything — a royalty, a fee reduction, nothing?
11. Would such work be done on his own time, and how is that boundary policed?
12. Does the county's investment give it any claim on revenue?

**On the awkward parts**

13. **Conflict of interest.** Nebraska has statutes governing public officials
    contracting with their own governmental body. An arrangement where the
    Superintendent stands to profit from work performed on county time needs to
    be checked against them, and against Adams County's own policies.
14. **Public records.** If the county owns the software, is the source code a
    public record subject to disclosure? Does that affect its commercial value?
15. **Procurement.** If the county later pays Greg or an entity he controls for
    support, maintenance or licensing, does that trigger bidding requirements?
16. **Support and continuity.** Who maintains it? What happens if it breaks and
    Greg is unavailable? A county running its statutory records on software with
    one person who understands it is a real operational exposure, and the Board
    is entitled to want an answer.
17. **Warranty and liability.** What is the county's recourse if the software
    produces a wrong figure in a filing? What does Greg warrant, and what is
    expressly disclaimed?

---

## 6. Who should draft this

**Greg should have his own attorney read anything before he signs it.**

The county attorney represents the county. On the ownership question their duty
runs the other way, and it would be unreasonable to expect them to advocate for
the Superintendent's retained rights against the county's interest. That is not
a criticism of anyone — it is simply whose client they are.

A draft prepared to take to the Board is a sensible way to start the
conversation. It should not be the document anyone signs without independent
review.

---

## 7. Tone worth keeping

The relationship here is cooperative, and the agreement should read that way.
The Board asked a reasonable question about how county time is being spent.
Greg has built something the county needs and would otherwise have had to buy.
Neither party is trying to take advantage of the other.

The value of writing it down is not that anyone distrusts anyone. It is that in
three years the Board will have different members, and everybody's recollection
of an informal understanding will have quietly drifted.
