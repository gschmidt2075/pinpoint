# The inventory model

Agreed with Greg, 2026-08-26. Written down before building, because the previous
attempt got the source of truth wrong and had to be unpicked.

---

## The problem R&B has

R&B IMS has one field where there should be two. `Comm Grp Alpha` answers both
"what kind of thing is this" and "where is it", and it can only answer one at a
time.

So when an oil filter goes from the shop out to Kenesaw, the only move available
is to **reassign its commodity group** from `133 FILTERS` to `7 KENESAW SHED`.
The filter arrives at Kenesaw and stops being a filter. Its category is
overwritten by its location.

That is the whole problem, and it is why the Kenesaw shed list contains CAT fuel
filters, WIX oil filters, gear lube, carbide grader blades and a Men Working
sign alongside its own air compressor and ladders.

> *"Those items are just reassigned to that commodity group. If you look at
> Kenesaw shed items you can see they have oil filters which likely started out
> at the shop as a 133 group item. That's where we need a good transfer
> system."* — Greg

---

## The model

**Every commodity group is both a category and a location.** One list of 111,
used twice.

| | |
|---|---|
| `categoryId` | What the thing **is**. Set once, and a transfer never changes it. |
| batch `location` | Where it **is**, and how much is there. Changes when stock moves. |
| `fitsEquipment` | What it is **for**. Compatibility, not position. |
| `partNumber` | Its number — and on culverts and blades, its **size**. |

On day one, category and location are identical for every item, so the system
shows staff exactly the list they already know. From then on a transfer changes
the location and leaves the category alone. That single separation is the
improvement; everything else follows from it.

### `Inventory Usual Location` is not used

The column is a copy of the group code on 74% of rows. Where it differs it
points at bare numbers — 3, 4, 5, 102 — that appear nowhere else in the export
and have no name. Greg's call, and the data agrees: it is noise.

### Group types

The type changes what a group can do, so it is recorded rather than guessed at
each use. Every one is editable in Settings.

| Type | Count | What it is |
|---|---|---|
| Shop area | 31 | A part of the main shop — the sign shop, the parts room, the filter racks |
| Building | 9 | #2 Shed, Juniata, Kenesaw, Holstein, Roseland, Pauline, 2nd Floor, 3rd Floor, Office |
| Machine | 67 | Gear that lives on that unit — an extinguisher on 327, a hammer on the bridge truck |
| Stockpile | 4 | Stockpile-Gravel, Crushed Concrete, Crushed Asphalt, Run Rock |

**There is no "Main Shop" group.** No group names it, because in R&B the
shop is where things are unless stated otherwise. Its areas cover it: something
in the shop is in the sign shop, the parts room or the filter racks. Greg's
call.

### One item per part number

Rows sharing an `Inventory #` merge into one item with **an opening batch per
row**, each at that row's group. `CARBIDE BLADE 3'` stops being four items and
becomes one item held in five places — the four sheds plus the grader blade rack
it was sent out from.

**Where a part number spans several groups, the group that is not a place is its
category.** `CARBIDE BLADE 3'` appears under four sheds *and* under `180 GRADER
BLADES` — that last one is the home copy at the shop, and the shed rows are the
transfers that already happened. This resolves 24 of the 27 affected part
numbers with no guessing at all.

Three have no home group at all, so R&B has genuinely lost what they are. They
keep the commonest place group and go to the exceptions list rather than being
guessed at:

| Part | Description | Only ever seen at |
|---|---|---|
| `15W40-26A` | Diesel Oil Kenesaw | Kenesaw, Holstein |
| `577-1435` | CAT Air Filter | Kenesaw, Holstein, Roseland |
| `ELCHD-26` | Extended Life Coolant | Kenesaw, Holstein, Roseland, Pauline |

### What this produces

```
2,302 items          from 2,375 rows — 73 merged away
2,209 opening batches, one per row holding stock
$1,554,890.75        ties to the legacy Cost On Hand exactly
  111 groups         31 shop area · 9 building · 67 machine · 4 stockpile
  110 count sheets   one per group that holds stock
  105 exceptions     flagged, not guessed at
```

Of the 2,302 items:

- **1,650** get a real category — Filters, Parts, Signs, Lubricant
- **489** are a place's own gear, categorised as that place. Kenesaw's air
  compressor is category *Kenesaw Shed*. Greg's call: *"Leave them under the
  shed's own group."* The item numbering confirms these — they carry the group
  code as a prefix, `7-01`, `11-03`, where real stock carries a manufacturer's
  number.
- **163** sit in a place group without being that place's own gear. These are
  the ones R&B lost the category of. They keep the place name for now and can be
  recategorised in Settings whenever someone notices.

Nothing is inferred from a description. An earlier attempt at that placed only
41% and got things wrong — it called a welding helmet a chainsaw and a grease
gun a lubricant.

---

## Behaviour

**Transfers** take both a single line and a restock run of many lines — one
person loading filters and oil into a truck for Kenesaw should enter one date,
one destination, and a list. A transfer moves a **quantity**, taking oldest
stock first and carrying its cost with it: a transfer is not a purchase and must
never change what the county paid.

**Receiving** pre-fills the location from the category and lets it be
overridden, because most receipts of filters do go to the filter racks.

**Renumbering a group carries its stock with it.** Batches store the code, so an
edit that touched only the group record would strand every batch at a code
nothing answers to — stock present in the county total, missing from every count
sheet. The reducer moves the batches and the transaction history together.

**Count sheets** print one per group — 110 of the 111 hold stock. Hand someone the FILTERS sheet
and someone else the KENESAW SHED sheet. Every batch has a location, so every
unit of stock lands on exactly one sheet and nothing can be missed.

**Machine locations tie to the fleet record**, so a unit's page shows its kit
and retiring a machine surfaces the gear still assigned to it.

---

## Settled

- **Group codes with two names** — majority name wins, the odd rows go to the
  exceptions list with their R&B row number. Seven rows.
- **Names are not reformatted.** Left exactly as R&B has them. Title-casing
  turned `2ND FLOOR` into `2Nd Floor` and `4100IV` into `4100Iv`; a tidy-up
  nobody asked for that makes a familiar list unfamiliar. Rename in Settings.
- **Codes are editable.** Add, rename, retype, renumber, remove — all in
  Settings → Commodity Groups. Changing a code carries its stock with it.
  Removing one is blocked while it holds stock or is in use as a category.

---

## Exceptions, not questions

Greg: *"Can we just make it so it flags the stuff that will not crosswalk? This
inventory will be very different by the time this goes live."*

So nothing is guessed and nothing blocks. 105 rows are listed on the Inventory
dashboard with their R&B row number and a reason, and can be worked through or
left alone. The crosswalk re-runs at go-live anyway.

| Count | What |
|---|---|
| 43 | Value sitting against no quantity — no opening balance created |
| 23 | Rows sharing a part number disagree on the description |
| 14 | No GL code, so nothing to charge a purchase to |
| 13 | Negative quantity — no opening balance created |
| 7 | Group code used under two names; majority kept |
| 3 | Category cannot be recovered — only ever seen in place groups |
| 2 | No unit of measure |

The 56 negative-quantity and value-without-quantity rows carry **$107,455.30**
between them and are deliberately excluded from the opening balance, so they
surface at the next physical count rather than quietly inflating it.

---

## Verifying

`npm run check` runs three passes: names and imports resolve, every file parses,
and 58 tests covering the crosswalked data and the transfer arithmetic. The
transfer maths is a pure function in `schema.js` rather than inline in the
reducer specifically so it can be tested — a transfer bug hides, because the
county-wide total stays correct however wrong the per-group figures are, and
before Pinpoint the county-wide total was the only number anyone could check.
