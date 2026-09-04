# Employees, pay and certifications

Agreed with Greg, 2026-08-28, from his Musings:

> *"I think that we need to get rid of the pay scales as we have a step program
> when people are hired and their pay may go up for a few years but their
> classification stays the same. It might best to just enter them manually."*

---

## What was wrong

The program had a **pay scale table**: classification plus effective date gives an
hourly rate. Every employee had a classification history, and each row could
carry a rate override that beat the scale.

That model says *the classification determines the pay*. Adams County runs a step
program, so two Equipment Operators on different steps earn different money. The
classification cannot be what sets the rate, and the override field was the
model quietly admitting it.

**The pay scale table is deleted.** Nobody had entered real data in it.

---

## What replaces it

**A dated rate history on the person.** Each row is a date, a rate, a reason and
a note. The rate in force on any date is the latest row on or before it.

| Effective | Rate | Reason | Note |
|---|---:|---|---|
| 7/01/2025 | 28.51 | COLA | 2.5% FY2026 |
| 3/14/2025 | 27.81 | Step increase | 3rd anniversary |
| 11/01/2024 | 27.00 | Promotion | Operator → Mechanic. Board 10/21 |
| 3/14/2022 | 21.50 | Starting wage | Hired as Operator |

### The reason is not decoration

It is what lets the program do anything useful. `Starting wage` anchors the hire
date, `Six-month review` and `Step increase` are how it knows an anniversary is
coming, `Promotion` is the row written alongside a classification change.

The list is editable in Settings, and starts as: Starting wage · Six-month
review · Step increase · COLA · Promotion · Board action · Correction · Other.

### The pattern it is shaped around

Greg's description of how pay actually moves:

> *"When a person is hired they have a starting wage and then after 6 months
> they get a review and a raise if the review is good, then at their anniversary
> they get a pay bump to the next step and then the next 7 anniversaries. There
> is also typically a COLA when a new fiscal year rolls around."*

So: a starting wage, a review at six months, then eight anniversary steps, with
a COLA on top at fiscal year.

**The program flags the dates; it does not track a step number and it does not
raise anybody's pay by itself.** Greg's call — payroll owns the decision, and a
program that quietly changed a wage would be a program nobody trusted.

---

## Classification

Kept, and still a dated history, because people do change classification. It no
longer sets the rate. It is what somebody *does* — needed on labor entries, on
reports, and for FEMA force account.

A promotion is entered as one event on one form: new classification, new rate,
one effective date. Two records are written so the histories stay separate, but
nobody has to remember to enter it twice.

---

## Overtime

**Always 1.5× the rate in force.** Derived, never typed. One number on the
record means nobody can enter an overtime rate that disagrees with the
straight-time one.

---

## Backdating

A rate can be entered with an effective date in the past — the Board approves in
September, effective July. Every labor entry on or after that date is
**recosted**, and the program reports what moved and by how much.

This is safe in a way it would not be in fund accounting, because cost
accounting is not money leaving:

> *"The cost accounting on projects or anything else really isn't claimed through
> the fund accounting. It is just a reflection of what work has been done and how
> it costed out. Everyone's hours are not 100% tracked."*

Two things follow. Recosting corrects a record rather than disturbing a payment,
so there is no need to protect closed or claimed work from it. And **a project's
labor figure is what was recorded, not what the work cost in wages** — the
reports should say so rather than implying completeness.

---

## Somebody hired without a CDL

Greg:

> *"If someone gets hired on without a CDL they start as a laborer and when they
> get their CDL they move up to an Equipment operator and get an increase. They
> still have a 6 month review though."*

Already covered: it is a promotion — classification changes, rate goes up —
triggered by earning a certificate rather than by a date. **Certification
earned** is on the default reason list so it does not have to be added.

The six-month review is measured from the **hire date**, not from the current
classification, so moving from Laborer to Operator at four months does not
disturb it.

---

## Certifications

Renewals **edit in place**: one record per certification, dates updated when it
is renewed, and the 90-day warning follows the new expiry. A wrongly entered
certification can be **deleted** — Greg's call, because a typo should not live
forever.

---

## Two bugs this fixes

**The date in classification history could not be typed into.** Not a parsing
fault — the parser handles `8/14/26`, `081426`, `14` and ISO correctly. The row
was a five-column grid giving the date `1fr`, about 104px, and `DateField`
renders a text input plus a "Today" button plus a calendar caret inside that.
The buttons took ~97px and left roughly **seven pixels of input**. Fixed by
giving dates their own room and dropping the Today button where space is tight.

**A certification could not be edited.** There was an add form and a list, and
no way back into a record once written.

---

## What this changes in the data

- `employee.rateHistory[]` — new. `{ effectiveDate, hourlyRate, reason, note }`
- `employee.assignments[]` — keeps `classification` and `effectiveDate`, loses
  `rateOverride`
- `payScales` — deleted from state, along with `createPayScale` and the screen
- `resolveHourlyRate(employee, date)` — no longer takes a pay scale list
- `overtimeRateFor(employee, date)` — new, always 1.5×
