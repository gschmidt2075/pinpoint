# How fuel is costed

Settled with Greg, 2026-09-04.

> **"FIFO but I do not want a other department fill up to straddle two prices
> however we can make that work."**

---

## The question he asked

> *"I had two different deliveries to the unleaded tank but when I was doing a
> dispensing log after the second delivery it was still charging the original
> price of the first delivery — does it do first in and first out or does it
> blend the pricing?"*

It did neither. It charged **the price of the last fuel to enter the tank**, and
the reason he saw the first delivery's price was a sorting fault: the two
deliveries carried the same date, the sort had no tiebreak, and the earlier one
won.

So the behavior he reported was wrong for one reason and right for another.
**Under FIFO, the first delivery's price is the correct answer** — those gallons
were still in the tank and they go out first.

---

## What it does now

**The tank holds layers.** Each delivery is a layer: gallons that arrived
together at one price. A withdrawal takes the oldest gallons first.

```
3,000 gal @ $2.98   ← delivered 7/01, goes out first
4,000 gal @ $3.21   ← delivered 7/20
```

Pump 500 gallons and all 500 come off the $2.98 layer. Pump 3,500 and 3,000
come off at $2.98 and 500 at $3.21.

### The straddle solves itself in the presentation

A draw that crosses a boundary is recorded as its true cost and **shown as one
price a gallon** — the total divided by the gallons:

> 500 gal · $1,536.00 · **$3.0720/gal**

One price per unit, and the total exactly right rather than approximately.
Nothing straddles anywhere a person can see it. The layers stay on the record
underneath, so the arithmetic can always be shown.

The monthly department invoice does the same thing at month scale, which is the
one-line-per-department bill Greg described.

---

## Nothing is stored

The layers are **rebuilt from the transaction history every time.** That is what
makes his answer to the recosting question possible:

> *"If the invoice comes in at a different price than the delivery ticket,
> should Pinpoint go back and recost the fill-ups already logged?"* — **"Yes"**

Correct a delivery price and every gallon that came out of it afterwards
reprices itself. No migration, nothing left holding the old number.

`recostFuelDispensing` writes the derived figures back onto the dispensing
records, from **one** place in the reducer, after anything that could move them.
Five other screens read `unitCost` and `totalCost` straight off the record, and
threading a costing object into all five is how one of them quietly keeps
showing last month's number.

The history is the source of truth. The fields on the record are a copy of it
that is never allowed to be stale.

---

## Portable tanks

**The price is locked at the fill.** 402F filled off the shop tank at $2.98
carries $2.98 until it is filled again, however the shop tank moves afterwards.
Greg's call, and the right one — the fuel on the truck is the fuel that was put
on the truck.

A fill that straddles two layers gives the portable **one** blended layer, so a
machine fuelled from a portable never sees a split price.

A *correction* to the original delivery does reach the portable, because a
correction says the fuel never cost what the ticket claimed. That is a different
thing from a later load arriving at a different price.

---

## When there is nothing to draw on

Every tank on day one, and any tank drawn past what the book says it holds.

The shortfall is priced at **the last price that tank is known to have paid**,
and the record is marked `costEstimated`. The screen says so before it is saved,
and it still saves — refusing to record a fuelling because the opening balance
has not been entered yet would stop the yard for a bookkeeping reason.

---

## Ordering

Date, then **arrivals before withdrawals**, then the order entered.

Arrivals first cannot change a price — FIFO takes the oldest gallons regardless
— but without it a tank refilled and drawn down on the same day reports a
shortfall that never happened.

---

## Rounding on the invoice

450 gallons at $2.9444 is $1,324.98. The layers actually cost $1,325.00.

**The invoice is made to tie to itself:** the unit price is rounded to four
places and the amount billed is gallons times that rounded price. The difference
is reported as `rounding` rather than hidden, and never exceeds a couple of
cents on a month.

An invoice whose own arithmetic does not work generates a phone call. A two-cent
residual in the department fuel account does not.

---

## Where it lives

| | |
|---|---|
| `costFuel(tankTx, dispensing)` | rebuilds every tank's layers and costs every withdrawal |
| `quoteFuel(costing, tankId, gallons)` | what the next draw would cost — the live figure on the form |
| `tankFuelValue(costing, tankId)` | gallons, value and average for a tank card |
| `departmentFuelBill(costing, entries)` | a month of one department's fuel as one line |
| `recostFuelDispensing(tankTx, dispensing)` | writes the derived figures back onto the records |

`tankUnitCost` in `src/modules/fuel/shared.js` is **deleted**, not left unused —
a function implementing the superseded rule is one somebody imports again by
accident.

Tests: `node scripts/test-fuel.mjs` — 42 checks, including the two-delivery case
Greg reported, the straddle, the locked portable, the recost, the dry tank and
the invoice rounding.

---

# Fuel tax

Settled with Greg, 2026-09-04. Dyed diesel, bought untaxed, tax owed on the
gallons that go into something driving on a road, **remitted quarterly**.

## Which tax is deliberately not decided

Greg said federal. Dyed fuel is exempt from the federal excise, and a state or
local government may generally run it on-highway for its own use — which points
at a state tax instead. That is a question for whoever prepares the return, and
the program does not answer it.

So the rate table holds **any number of named taxes**, each named whatever the
return calls it. State, federal, both, or something a different county pays: all
the same shape, and nobody has to come back and change the program when the
answer turns out to be the other one.

## Road use is a property of the machine

`equipment.taxClass` — `off_road` or `on_road`. The pump reads it and fills the
field in, showing *"From unit 402"*. It can still be overridden, and the form
says so when it has been.

> *"Yes on the machine, that would take away having to select the difference
> when you log fuel and would make it easier."*

Gasoline is not asked at all — it is bought taxed — and it is excluded from the
on-road gallons figure, because that figure feeds a return and gasoline in it
would inflate the quarter.

## Rates are dated, and new rows rather than edits

A fuelling is taxed at the rate in force **on the day it was pumped**, not the
rate in force when the report is run. So a rate that changes mid-quarter splits
itself, and the report says it did.

When a rate changes, **add a row** with its effective date. Editing the old row
would silently restate every quarter already filed, which is the one thing a
tax record must not do. The screen says so.

## Calendar quarters

Returns are filed on the calendar year even where the county's own books are
not — Nebraska runs 1 July to 30 June. Mixing the two is how a quarter gets
filed twice.

## Two things it refuses to hide

- **No rate on file** — the gallons are still reported, and the screen says
  plainly that nothing can be calculated from them yet.
- **On-road gallons pumped before the earliest rate** — counted, reported as
  unpriced, and the total is stated to be short by that much. A return that is
  quietly short is worse than one that will not produce itself.

## The working is on the page

On-road gallons broken down by unit. A grader that has been marked on-road by
mistake shows up as a line nobody recognises, rather than as a total that is
merely too big to argue with. The screen says to fix it on the Fleet record
rather than adjust the number.

Rates are managed **on the Fuel Tax screen**, not in Settings — the person who
files the return is the person who knows the rate changed, and sending her
somewhere else to record it is how it comes to be recorded late.

---

# DEF

Settled with Greg, 2026-09-04.

> *"Jugs at all shops no bulk."*
> *"Typically an entire jug is dispensed into a machine and no carryover per jug
> so I think it would be easy to cost out."*
> *"Fuel Screen."*
> *"It is usually just logged to the machine that likely used it."*

## It is inventory, not a tank

DEF is a catalog item with `fluidType: "def"` and `unitGallons` — how many
gallons one container holds. Stock is counted in **containers**, costed FIFO off
the batches like any other part, and held per location like any other part.

Nothing about it is hardcoded. The container size is typed, so 2.5 gallon jugs
today and something else later is an edit rather than a change to the program.
**A county with a bulk DEF tank needs none of this** — a tank with
`fuelType: "def"` works through the existing tank machinery unchanged, and both
appear on the same DEF panel.

## Logged where the person already is

On the **fuel screen**, beside diesel and unleaded, because the person holding
the jug is standing at the machine. Pick the machine, pick DEF, type how many
jugs, and optionally which shelf it came off.

DEF is in `DISPENSABLE_TYPES` and deliberately **not** in `FUEL_TYPES` — nothing
should ever offer DEF as the fuel a grader burns.

## One dispatch, two records

`issueFluidToMachine` returns the fuel entry **and** the inventory issue
together, or a reason it cannot be done. They travel on one action into the
reducer.

That is the point of the design. A jug poured into a machine that never comes
off the shelf makes the shelf count meaningless — quietly, over months, with
nothing looking wrong. The two either both happen or neither does, and there is
one audit event rather than two that have to be read together.

When the shelf is short it **refuses**, says by how much, and says to count it
or take it from somewhere else. It does not go negative.

## The jugs nobody wrote down

Not written off. Logged on the Dispensing Log against the machine that most
likely had them, on the day the count found them, with a note saying so — which
is the same screen and the same action as logging it at the time.

No separate mechanism, the cost lands where it belongs, and the entry is honest
about when it was recorded rather than pretending somebody wrote it down.

## Min and max

Greg's call: **the item's own reorder point, not per shop.**

> *"No, if I am not mistaken, the inventory is going to have a min/max on items
> anyway just not shed specific and that is fine."*

The consequence is stated on the screen rather than left to be discovered: that
figure is the county's total, so a shed can be empty while the count still looks
healthy. The per-shop cards are what answers that, which is why they exist.

---

## Two things found while building this

**`createInventoryItem` had no `trackStockLevel` or `minimumQuantity`.** The
crosswalk wrote them and the Inventory screen read them, but an item added by
hand came into the world without them — `undefined` rather than `false` — so the
low-stock check silently never fired for anything typed in by a person. Added to
the factory.

**`crosswalk.js` contained raw NUL and DEL bytes** inside the control-character
regex. It behaved correctly, but the file registered as binary to grep, to
diffs, and to anything that trims stray control bytes on save. Rewritten with
escape sequences — same range, same behaviour, and the file is text again.


---

# DEF, and additives

Rebuilt 2026-09-05 after Greg tried the first version.

## DEF has its own tab

> *"I can't seem to figure out how the DEF jugs get distributed to a shop and
> where they get logged. They are usually not used when they fuel their machines
> so I don't want it under the Log Fuel option."*

The first design put DEF on the fuel log and was wrong twice over. It assumed a
jug goes in at the same moment as a tank of diesel — it does not — and it only
answered the LAST of three questions. A jug is bought, carried out to a shed,
and poured in some week later. **The middle step had no home at all**, which is
why he could not find it.

The tab owns all three:

| | |
|---|---|
| **Receive** | a delivery arrives, onto a shelf, with vendor and cost |
| **Move to a shed** | jugs from the shop out to Kenesaw — the missing step |
| **Log into a machine** | off the shelf and onto the machine's cost, one entry |

Underneath these are an ordinary receipt, transfer and issue, so DEF stays one
item with a batch per shed and nothing invents a second way to hold stock.

DEF is **removed** from the fuel log — not hidden, deleted, along with the code
behind it.

## Additives go on the delivery

> *"The BG products are fuel additives that go directly into the tanks... It
> isn't worth a screen but there needs to be a way to cost it out into the
> fuel."*
> *"The fuel additive is added at the same time of delivery."*

So it is a small optional block at the foot of the **delivery** form, not a
screen and not a separate event. Its cost joins **that load's** gallons:

```
5,000 gal @ $3.50  +  $100 of BG   →   5,000 gal @ $3.52
```

Fuel already in the tank was not treated and is not charged for it. FIFO still
runs, so the older untreated gallons go out first at their own price.

There is deliberately **no way to dose a tank that is already full.** It would
be a second screen for something the county does not do, and a second way to
record one event is how two people record it differently. An earlier version had
it; it was removed rather than left as an unused alternative.

## Which products

A mark on the inventory item — `fluidType` of `def` or `additive` — because Greg
said only *some* of the BG range are additives. Not a guess from the description,
which is exactly the mistake the crosswalk rules made first time round.

## What the tests hold

- The treated load costs more and **the fuel already in the tank does not**
- FIFO order is unchanged — untreated gallons still go first
- **No gallons are created**: a quart of BG does not make 5,000 gallons 5,000.25
- The money balances: value left in the tank plus value issued equals fuel
  bought plus additive bought
- A jug of additive cannot enter a tank without leaving inventory

## One bug this move nearly caused

The reducer took the inventory issue only when the tank transaction's type was
`additive`. Moving the additive onto a delivery meant that check stopped
matching, and the additive would have gone into the fuel **without ever coming
off the shelf** — with nothing on any screen to show it. It is now keyed on the
issue being present rather than on the type.
