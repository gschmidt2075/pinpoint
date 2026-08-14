#!/usr/bin/env python3
"""
Crosswalk the legacy inventory export into src/data/inventoryData.js.

    python3 scripts/gen_inventory.py path/to/Inventory.csv

Run this whenever the export changes. It is deliberately a script rather than a
one-off: the CSV is regenerated from the old system regularly, and a crosswalk
nobody can repeat is a crosswalk nobody can correct.

WHAT THE SOURCE COLUMNS MEAN
────────────────────────────
Two columns look interchangeable and are not:

  Commodity Group / Comm Grp Alpha
      What KIND of thing it is — PARTS, FILTERS, CULVERTS. Also, confusingly,
      sometimes a machine ("2012 F350 4X4"), because parts bought for one unit
      are grouped under it.

  Inventory Usual Location
      WHERE it physically sits. A separate numbering scheme. These two agree on
      1,746 of 2,375 rows, which is exactly often enough to fool you — they
      disagree on the other 629. An earlier version of this crosswalk filled
      location from the commodity group and threw this column away, which left
      transfers unusable because no location held any stock.

Location codes have no names in the export. The number is preserved as
`locationCode` and named in Settings → Storage Locations.
"""

import csv, json, re, sys, unicodedata
from pathlib import Path
from collections import Counter

SEED_DATE = "2026-07-01"
SEED_ISO  = "2026-07-01T00:00:00.000Z"

# ── Units of measure ─────────────────────────────────────────────────────────
# The export writes EACH/QUART/GALLON; the app offered TON/CY/LF/EA. Nothing
# matched, so every dropdown fell back to its first option and showed TON for
# the whole catalog. Normalise to one vocabulary.
UOM_ALIASES = {
    "EACH":"EA", "EA":"EA",
    "QUART":"QT", "QUARTS":"QT", "QT":"QT",
    "GALLON":"GAL", "GALLONS":"GAL", "GAL":"GAL",
    "POUND":"LB", "POUNDS":"LB", "LB":"LB", "LBS":"LB",
    "OUNCE":"OZ", "OUNCES":"OZ", "OZ":"OZ",
    "FOOT":"FT", "FEET":"FT", "FT":"FT",
    "YARD":"YD", "YARDS":"YD", "YD":"YD",
    "PAIR":"PR", "PR":"PR",
    "BAG":"BAG", "50LB BAG":"BAG",
    "BLOCK":"BLOCK", "SET":"SET", "CY":"CY", "TON":"TON", "LF":"LF",
}

def clean(s):
    """Strip, collapse whitespace, drop control characters."""
    s = (s or "").replace(" ", " ")
    s = "".join(c for c in s if unicodedata.category(c)[0] != "C")
    return re.sub(r"\s+", " ", s).strip()

def title(s):
    """Title-case but leave things that are already mixed or numeric alone."""
    s = clean(s)
    return s.title() if s.isupper() else s

def num(s):
    s = clean(s).replace("$", "").replace(",", "")
    if not s or s in {"-", "."}:
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return 0.0
    return -v if neg else v

def uom(s):
    c = clean(s).upper()
    return UOM_ALIASES.get(c, c)

def js(rows, name):
    """Emit a JS array literal — readable, so a diff is reviewable."""
    out = [f"export const {name} = ["]
    for r in rows:
        out.append("  {")
        items = list(r.items())
        for i, (k, v) in enumerate(items):
            comma = "," if i < len(items) - 1 else ""
            out.append(f"    {k}: {json.dumps(v, ensure_ascii=False)}{comma}")
        out.append("  },")
    out.append("];")
    return "\n".join(out)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    rows = list(csv.DictReader(src.open(encoding="utf-8-sig")))
    print(f"Read {len(rows)} rows from {src.name}")

    items, batches, txs = [], [], []
    stats = Counter()

    for n, r in enumerate(rows, start=1):
        legacy   = clean(r.get("Inventory #"))
        name     = title(r.get("Inventory Description")) or legacy or f"Item {n}"
        grp_code = clean(r.get("Commodity Group"))
        grp_name = title(r.get("Comm Grp Alpha"))
        loc_code = clean(r.get("Inventory Usual Location"))
        qty      = num(r.get("Quan On Hand"))
        std      = num(r.get("Standard Cost"))
        avg      = num(r.get("Avg Hist Cost Per Unit"))
        on_hand  = num(r.get("Cost On Hand"))
        vendor   = clean(r.get("Vendor"))
        memo     = clean(r.get("Memo Inventory"))

        # Unit cost: prefer what the stock on hand actually cost, then the
        # historical average, then the standard price. Never invent one.
        #
        # This ordering matters. An earlier crosswalk reached for Standard Cost
        # first and valued the catalog at $1.13m against the legacy system's own
        # $1.66m — standard cost is a price list, not what the stock cost.
        unit_cost = (on_hand / qty) if qty and on_hand else (avg or std)

        # Rows the old system cannot be right about. Negative stock is not a
        # quantity, and value with no quantity is value attached to nothing.
        # These are NOT given batches — you cannot hold -0.97 of anything — but
        # they are flagged rather than dropped, so they surface at the next
        # count instead of quietly disappearing along with their money.
        flag = ""
        if qty < 0:
            flag = f"Legacy data error — negative quantity ({qty:g}) carrying {on_hand:,.2f}. Verify at count."
            stats["negative quantity"] += 1
        elif qty == 0 and on_hand:
            flag = f"Legacy data error — {on_hand:,.2f} of value with no quantity on hand. Verify at count."
            stats["value with no quantity"] += 1

        item_id = f"inv-{n:04d}"
        items.append({
            "id": item_id,
            "legacyNumber": legacy,
            "name": name,
            "description": clean(r.get("Desc")),
            "commodityGroup": grp_name,
            "commodityGroupCode": grp_code,
            "locationCode": loc_code,          # where it physically sits
            "glAccountCode": clean(r.get("GL A/C #")),
            "unitOfMeasure": uom(r.get("Unit Of Measure")),
            "location": loc_code,              # named in Settings
            "shelfLocation": "",
            "fitsEquipment": [],
            "standardCost": round(std, 2),
            "primaryVendor": vendor,
            "receivingMode": "standard",
            "trackStockLevel": False,
            "minimumQuantity": 0,
            "active": True,
            "dataFlag": flag,
            "notes": memo,
            "createdAt": SEED_ISO,
        })
        if not loc_code:
            stats["no location"] += 1
        if not clean(r.get("Unit Of Measure")):
            stats["no unit of measure"] += 1
        if not clean(r.get("GL A/C #")):
            stats["no GL code"] += 1

        # Opening balance. Only stock actually on hand becomes a batch — a zero
        # quantity is not a batch, it is an absence.
        if qty > 0:
            b = len(batches) + 1
            batch_id = f"bat-{b:04d}"
            batches.append({
                "id": batch_id,
                "itemId": item_id,
                "itemName": name,
                "receiptDate": SEED_DATE,
                "receiptRef": "CROSSWALK",
                "location": loc_code,
                "quantityReceived": qty,
                "quantityRemaining": qty,
                "unitCost": round(unit_cost, 4),
                # The legacy figure verbatim where it exists, so the opening
                # value ties to the old system exactly rather than drifting by
                # a cent per line across 2,200 lines.
                "totalCost": round(on_hand if on_hand else qty * unit_cost, 2),
                "vendorName": vendor,
                "invoiceStatus": "final",
                "invoiceRef": "",
                "status": "open",
                "notes": "Opening balance crosswalk",
                "createdAt": SEED_ISO,
            })
            txs.append({
                "id": f"tx-{b:04d}",
                "type": "crosswalk",
                "date": SEED_DATE,
                "itemId": item_id,
                "itemName": name,
                "vendorName": vendor,
                "quantity": qty,
                "unitOfMeasure": uom(r.get("Unit Of Measure")),
                "unitCost": round(unit_cost, 4),
                "totalCost": round(on_hand if on_hand else qty * unit_cost, 2),
                "location": loc_code,
                "batchId": batch_id,
                "notes": "Opening balance crosswalk",
                "createdAt": SEED_ISO,
            })

    # ── Storage locations ────────────────────────────────────────────────────
    # The export gives location codes but no names. Where every item at a code
    # belongs to a single commodity group, that group name is almost certainly
    # what the place is called — "Kenesaw Shed", "Shop Tools". That guess is
    # offered as a suggested name and marked as inferred, never asserted. Mixed
    # locations are left blank for someone who knows the building to fill in.
    groups_at = {}
    for i in items:
        groups_at.setdefault(i["locationCode"], Counter())[i["commodityGroup"]] += 1

    locations = []
    for code in sorted(groups_at, key=lambda c: (len(c), c)):
        if not code:
            continue
        g = groups_at[code]
        only = g.most_common(1)[0][0] if len(g) == 1 else ""
        locations.append({
            "id": f"loc-{code}",
            "code": code,
            "name": only,                       # blank where it can't be inferred
            "nameInferred": bool(only),
            "type": "shed",
            "itemCount": sum(g.values()),
            "active": True,
            "notes": "" if only else "Name this location — " + ", ".join(
                f"{k} ({v})" for k, v in g.most_common(4)),
        })

    header = (
        "// AUTO-GENERATED — do not edit by hand. Re-run scripts/gen_inventory.py.\n"
        f"// Source: {src.name} — crosswalked {SEED_DATE}\n"
        "//\n"
        "// locationCode is WHERE the item sits; commodityGroupCode is WHAT it is.\n"
        "// They are different numbering schemes and agree only by coincidence.\n\n"
    )
    out = Path("src/data/inventoryData.js")
    out.write_text(
        header
        + js(items, "INITIAL_INVENTORY_ITEMS") + "\n\n"
        + js(batches, "INITIAL_INVENTORY_BATCHES") + "\n\n"
        + js(txs, "INITIAL_INVENTORY_TRANSACTIONS") + "\n\n"
        + js(locations, "INITIAL_STORAGE_LOCATIONS") + "\n",
        encoding="utf-8",
    )

    locs = Counter(i["locationCode"] for i in items)
    print(f"Wrote {len(items)} items, {len(batches)} batches, {len(txs)} transactions")
    named = sum(1 for l in locations if l["name"])
    print(f"  {len(locations)} locations — {named} named by inference, {len(locations)-named} need naming")
    print(f"  {len(locs)} distinct locations · {len(set(i['commodityGroupCode'] for i in items))} commodity groups")
    print(f"  units of measure: {sorted(set(i['unitOfMeasure'] for i in items))}")
    print(f"  total opening value: ${sum(b['totalCost'] for b in batches):,.2f}")
    for k, v in stats.items():
        print(f"  {v} items with {k}")
    flagged = [i for i in items if i["dataFlag"]]
    if flagged:
        print(f"\n  {len(flagged)} rows flagged as legacy data errors — excluded from opening")
        print(f"  value stranded on those rows: ${sum(abs(num(r.get('Cost On Hand'))) for r in rows if num(r.get('Quan On Hand')) <= 0):,.2f}")


if __name__ == "__main__":
    main()
