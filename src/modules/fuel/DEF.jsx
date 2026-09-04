import { useMemo } from "react";
import { Icon, fmtSm } from "../../components/shared.jsx";
import { fluidItems, fluidOnHand, locationName } from "../../data/schema.js";

// ── DEF on hand ───────────────────────────────────────────────────────────────
//
// Greg: "I think it should look like the tanks or any inventory where you set a
// high and low amount per shop and it lets you know when quantity is getting
// low."
//
// So it reads like the tank cards next to it: one card per shop, how many jugs,
// how many gallons, what it is worth.
//
// He then decided against a min/max PER SHOP — "the inventory is going to have
// a min/max on items anyway just not shed specific and that is fine." That is
// honoured here rather than argued with, but the consequence is stated on the
// screen instead of being left for somebody to discover: the low warning is on
// the county's total, so it will not tell you Kenesaw is empty while the main
// shop has plenty. The per-shop counts on these cards are what answers that,
// which is why they are here at all.

export function DEFOnHand({ items = [], batches = [], groups = [], tanks = [] }) {
  const defItems = useMemo(() => fluidItems(items, "def"), [items]);
  const stock    = useMemo(() => fluidOnHand(items, batches, "def"), [items, batches]);
  const bulk     = tanks.filter(t => (t.fuelType || "") === "def" && t.status !== "out_of_service");

  // This used to `return null` when no DEF item existed — which is every
  // county on day one, including this one. The result was a feature that hid
  // itself completely: Greg went looking for DEF, found nothing, and had no way
  // to tell whether it had been built or not.
  //
  // A thing that needs setting up should say so where somebody is looking for
  // it. It is a few lines of grey text when a county genuinely has no DEF, and
  // the difference between "missing" and "not set up yet" when it does.
  const notSetUp = !defItems.length && !bulk.length;

  const low = notSetUp ? [] : defItems.filter(i => {
    if (!i.trackStockLevel) return false;
    const min = parseFloat(i.minimumQuantity) || 0;
    if (min <= 0) return false;
    const onHand = batches
      .filter(b => b.itemId === i.id && b.status === "open")
      .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
    return onHand < min;
  });

  return (
    <div style={{ marginTop:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12, gap:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, display:"flex", alignItems:"center", gap:7 }}>
            <Icon name="bottle" size={15} color="#1a5a3a" /> DEF on hand
          </div>
          <div style={{ fontSize:11.5, color:"#888", marginTop:3, maxWidth:600, lineHeight:1.6 }}>
            Jugs, by shop. Logged against a machine on the Dispensing Log, which takes them off
            the shelf at the same time.
          </div>
        </div>
        {!notSetUp && stock.containers > 0 && (
          <div style={{ fontSize:12, color:"#666", fontFamily:"monospace" }}>
            {stock.containers} jugs · {stock.gallons.toFixed(1)} gal · {fmtSm(stock.value)}
          </div>
        )}
      </div>

      {low.length > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6,
                      padding:"10px 13px", marginBottom:12, fontSize:12, color:"#7a4f00", lineHeight:1.6 }}>
          <strong>{low.map(i => i.name).join(", ")} below the reorder point.</strong>{" "}
          That figure is the county's total. A shed can be empty while the count still looks
          healthy — the cards below are what tells you which one.
        </div>
      )}

      {notSetUp ? (
        <div style={{ border:"1px dashed #ccc", borderRadius:8, padding:"18px 20px",
                      background:"#fafaf8", fontSize:12.5, color:"#666", lineHeight:1.7, maxWidth:660 }}>
          <strong style={{ color:"#444" }}>DEF is not set up yet.</strong> It is tracked as an
          inventory item rather than a tank, because it lives in jugs on a shelf.
          <div style={{ marginTop:8 }}>
            Go to <strong>Inventory → the DEF jug → Edit</strong>, tick <strong>This is DEF</strong>,
            and enter how many gallons one jug holds. It will then appear on the Dispensing Log
            alongside diesel, and its stock will show here shop by shop.
          </div>
          <div style={{ marginTop:8, color:"#888" }}>
            If the county ever goes to bulk, add a tank with its fuel type set to DEF instead —
            it will show up here too, and none of the above is needed.
          </div>
        </div>
      ) : (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:12 }}>
        {stock.byLocation.map(l => (
          <div key={l.location} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:13, fontWeight:700 }}>
              {locationName(l.location, groups) || "Unassigned"}
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:8 }}>
              <span style={{ fontSize:24, fontWeight:700, fontFamily:"monospace",
                             color: l.containers <= 2 ? "#c0392b" : "#1a3a5c" }}>{l.containers}</span>
              <span style={{ fontSize:12, color:"#888" }}>{l.containers === 1 ? "jug" : "jugs"}</span>
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:4, fontFamily:"monospace" }}>
              {l.gallons.toFixed(1)} gal · {fmtSm(l.value)}
            </div>
          </div>
        ))}

        {bulk.map(t => (
          <div key={t.id} style={{ background:"#fff", border:"1px solid #c8d8ec", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{t.name}</div>
            <div style={{ fontSize:10.5, color:"#888", marginTop:2 }}>bulk tank</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:6 }}>
              <span style={{ fontSize:24, fontWeight:700, fontFamily:"monospace", color:"#1a3a5c" }}>
                {(t.currentLevel || 0).toFixed(0)}
              </span>
              <span style={{ fontSize:12, color:"#888" }}>gal</span>
            </div>
          </div>
        ))}

        {!stock.byLocation.length && !bulk.length && (
          <div style={{ gridColumn:"1/-1", padding:28, textAlign:"center", color:"#aaa",
                        border:"1px dashed #ccc", borderRadius:8, fontSize:12.5 }}>
            No DEF recorded on any shelf. Receive it into inventory and it will show up here.
          </div>
        )}
      </div>
      )}

      {/* Greg: "It is usually just logged to the machine that likely used it."
          So the count shortfall is not written off — it is entered as a normal
          fuelling, on the day it is found, against the machine that probably
          had it. No separate mechanism, and the entry is honest about when it
          was recorded rather than pretending somebody wrote it down at the
          time. */}
      {!notSetUp && (
      <div style={{ fontSize:11, color:"#888", marginTop:12, lineHeight:1.65, maxWidth:640 }}>
        When a count comes up short because nobody wrote it down, log the missing jugs on the
        Dispensing Log against the machine that most likely had them, and say so in the notes.
        That puts the cost where it belongs and squares the shelf in one entry.
      </div>
      )}
    </div>
  );
}
