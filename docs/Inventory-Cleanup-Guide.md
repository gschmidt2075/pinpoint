# Paring down the inventory before go-live

Greg asked whether trimming the CSV first would make the crosswalk easier.

**It will not make the crosswalk easier.** The script does not care whether it
reads 800 rows or 2,375; it runs in under a second either way, and it is built to
be re-run whenever the export changes.

**It will make the result better.** Every row you carry over becomes a catalog
item somebody has to scroll past, a line on a count sheet somebody has to walk
to, and a number in a total the Board sees. The question is not "can the program
cope" — it is "do you want to own this row for the next ten years".

---

## The one rule that matters

**Do not delete anything the county still physically has.**

The opening balance ties to R&B to the penny — $1,554,890.75 today. Delete a row
carrying value and the opening inventory drops by exactly that much, and it will
not match your books. That is fine when the stuff is genuinely gone. It is a
problem when the row was merely untidy.

For anything you are unsure about, **the physical count is the answer, not the
delete key.** Pinpoint prints a count sheet per group; whatever is not on the
shelf gets adjusted out with a reason, and the adjustment is recorded. Deleting
it beforehand throws away the evidence that it was ever there.

---

## What is actually in the file

2,375 rows, $1,662,346.05 of book value. Of those, 2,209 rows carry stock and
make up the $1,554,890.75 opening balance.

| Where the value sits | Rows | Value |
|---|---:|---:|
| Shop areas — parts, filters, signs, chemicals | 1,646 | $922,010.52 |
| Stockpiles — gravel, rock, crushed concrete | 9 | $419,675.36 |
| Buildings — the sheds, the office, the floors | 272 | $160,153.98 |
| Machines — gear riding on a unit | 282 | $53,050.89 |

---

## Five decisions, easiest first

### 1. Delete outright — 110 rows, $0

Zero quantity **and** zero value. They have no stock, no money and no history
worth keeping. Nothing anywhere changes if they go.

*In the workbook: filter Recommendation to "Delete — empty".*

### 2. Fix in R&B rather than delete — 56 rows, $107,455.30

- **13 rows with a negative quantity**, carrying $66,342.64
- **43 rows with value but no quantity**, carrying $41,112.66

Pinpoint already refuses to build an opening balance from these and lists them
under *Did Not Crosswalk*. But that $107,455.30 is real book value with no stock
behind it, which means either the value is wrong or the count is. Deleting the
rows makes the symptom disappear without answering the question.

If you can correct them in R&B before the final export, do. If not, leave them —
they are flagged, they are excluded, and they will surface at the count.

### 3. Decide whether stockpiles belong here at all — 9 rows, $419,675.36

Nine rows carry **27% of the entire inventory value**:

| | |
|---|---:|
| `23-20M-2025` 2025 Deweese S & G (Wanda) | $186,550.05 |
| `36-04` 1½" Crusher Run Rock | $72,967.33 |
| `23-19` 2025 Gravel AC Stockpile | $66,494.19 |
| `36-04-2025` 1½" Crusher Run Rock | $51,032.35 |
| `29-24` Crushed Concrete 2024 | $19,583.80 |
| `36-04-2024` 1½" Crusher Run Rock | $15,400.13 |

Aggregate is not counted, it is surveyed or estimated, and it moves in truckloads
rather than units. You have mentioned wanting a gravel module. Worth settling
before the crosswalk: does aggregate live in inventory alongside oil filters, or
in its own module with its own measurement? Either works — but carrying it in
both places is how two numbers start disagreeing.

### 4. Decide whether fixtures are inventory — 498 rows, $221,437.03

These are the items whose part number carries the group prefix — `7-00`,
`11-03`, `21-01A`. They are a place's own permanent gear, not stock that flows
through:

| | |
|---|---:|
| `21-01A` Sokkia SET330R3 Transit | $6,435.00 |
| `7-00` 1500 GAL Fuel Tank/Meter (Kenesaw) | $6,372.89 |
| `9-00A` 1000 Gallon Tank/Pump (Roseland) | $4,993.14 |
| `11-00` 1000 Gallon Fuel Tank/Meter (Pauline) | $4,764.80 |

A fuel tank bolted to the ground at Kenesaw is a fixed asset. It is worth
tracking — it needs to exist, be insured and be found — but "how many do we have
on hand" is not a question anyone asks about it, and it will appear on a count
sheet every year forever asking to be counted.

Three options, no wrong answer:

- **Leave them in inventory.** Simplest. They count as 1 each and nobody minds.
- **Mark them inactive after the crosswalk.** They stay findable, drop off count
  sheets, and stop inflating the item count.
- **Split them into a fixed-asset register later.** More work, better answer if
  the Board ever asks for an asset schedule.

### 5. Walk the dead consumables — 766 rows, $186,151.11

Genuine parts and materials with stock on hand that **have not been issued since
2021, or ever**. This is the pile actually worth your time.

Some will be legitimate slow movers — a bridge part you keep because you cannot
get one quickly. Some will be for machines you no longer own. Some will not be
on the shelf at all.

The workbook lists them with their last issue date and value so you can sort by
what is worth the walk. Do not bulk-delete this group: it is exactly the
population the count exists to settle.

**Not worth your time:** 425 rows are worth under $25 each and $5,777.54 between
them. Whatever you decide about those, decide it in one go.

---

## If you want a smaller starting catalog

Cutting decisions 1, 3 and 4 together would take the file from 2,375 rows to
about **1,758**, and the opening balance from $1,554,890.75 to roughly
$914,000 — with the difference living in a gravel module and an asset register
instead of in inventory.

That is a real design decision, not a tidy-up. Worth deciding deliberately rather
than by deleting rows.

---

## How to load it

Delete whole rows in the CSV — do not blank cells, and do not change the column
headers or their order. The import reads:

```
Inventory #   Commodity Group   Comm Grp Alpha   Inventory Description
GL A/C #      Quan On Hand      Cost On Hand     Unit Of Measure
Vendor        Last Issue        Last Receipt     Memo Inventory      Desc
```

Extra columns are ignored. `Inventory Usual Location` is read but deliberately
not used.

Then **Settings → Import Inventory**, pick the file, and read the preview before
confirming. It shows what you have now against what the file would produce —
items, groups, open batches, value on hand — and lists everything it would flag.
Nothing is written until you type `REPLACE`.

**The import replaces the catalog, the groups and every opening balance, and
discards any receipts, issues, transfers and counts recorded since the last
import.** The screen tells you how many. Claims, work orders, fuel and revenue
are not touched.

You can run it as often as you like. If the first count comes back wrong, fix
the export and import again.

> There is also `node scripts/gen_inventory.mjs path/to/Inventory.csv`, which
> writes the file the program ships with. Both use the same rules, from
> `src/data/crosswalk.js`, so a file imported from Settings and a file
> crosswalked from the command line give identical results.
