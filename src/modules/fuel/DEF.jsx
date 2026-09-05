import { useState, useMemo } from "react";
import { Icon, Field, Table, inp, btn, fmtSm, DateField, MoneyField, SearchSelect } from "../../components/shared.jsx";
import { useUnsavedForm } from "../../components/unsaved.jsx";
import { fluidItems, fluidOnHand, locationName, placeName, groupLabel,
         issueFluidToMachine, buildFIFOLines } from "../../data/schema.js";
import { today, fmtDate } from "./shared.js";

// ── DEF ───────────────────────────────────────────────────────────────────────
//
// Greg, after trying to use the first version:
//
//   "I can't seem to figure out how the DEF jugs get distributed to a shop and
//    where they get logged. They are usually not used when they fuel their
//    machines so I don't want it under the Log Fuel option. Can we just have a
//    DEF tab in the Fuel and tanks module that can take care of all of this?"
//
// He is right and the first design was wrong. Putting DEF on the fuel log
// assumed a jug goes in at the same moment as a tank of diesel; it does not.
// And it only ever answered the last question of three — a jug is bought, it is
// carried out to a shed, and then some week later it is poured into a machine.
// The middle step had no home at all, which is why he could not find it.
//
// So this tab owns the whole life of a jug:
//
//   Received      a delivery arrives and goes on a shelf
//   Moved         somebody takes jugs out to Kenesaw
//   Used          a jug goes into a machine, and the machine carries the cost
//
// All three are ordinary inventory movements underneath — a receipt, a transfer
// and an issue — so DEF stays one item with a batch per shed and nothing here
// invents a second way to hold stock.

const EMPTY_RECEIVE = { date: today(), itemId:"", location:"", containers:"", unitCost:"",
                        vendorName:"", invoiceRef:"", notes:"" };
const EMPTY_MOVE    = { date: today(), itemId:"", from:"", to:"", containers:"", notes:"" };
const EMPTY_USE     = { date: today(), itemId:"", location:"", containers:"1",
                        equipmentId:"", meterReading:"", pumpedBy:"", notes:"" };

export function DEFTab({ items = [], batches = [], groups = [], tanks = [], units = [],
                         employees = [], transactions = [], dispensing = [], dispatch }) {
  const [action, setAction] = useState(null);   // receive | move | use

  const defItems = useMemo(() => fluidItems(items, "def"), [items]);
  const stock    = useMemo(() => fluidOnHand(items, batches, "def"), [items, batches]);
  const bulk     = tanks.filter(t => (t.fuelType || "") === "def" && t.status !== "out_of_service");

  const notSetUp = !defItems.length && !bulk.length;
  const needSize = defItems.filter(i => !(Number(i.unitGallons) > 0));
  const sized    = defItems.length > 0 && needSize.length === 0;

  // Everything that has happened to DEF, newest first — receipts, moves and
  // uses in one list, because "where did the jugs go" is one question.
  const history = useMemo(() => {
    const ids = new Set(defItems.map(i => i.id));
    const rows = [];
    for (const t of transactions) {
      if (!ids.has(t.itemId)) continue;
      rows.push({
        date: t.date, kind: t.type, qty: t.quantity, cost: t.totalCost,
        where: t.type === "transfer" ? `$`
                                     : placeName(t.location, groups),
        who: t.issuedTo || t.vendorName || "", notes: t.notes || "", id: t.id,
      });
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
  }, [transactions, defItems, groups]);

  const low = notSetUp ? [] : defItems.filter(i => {
    if (!i.trackStockLevel) return false;
    const min = parseFloat(i.minimumQuantity) || 0;
    if (min <= 0) return false;
    const onHand = batches.filter(b => b.itemId === i.id && b.status === "open")
                          .reduce((s, b) => s + (b.quantityRemaining || 0), 0);
    return onHand < min;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end",
                    marginBottom:16, gap:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>DEF</div>
          <div style={{ fontSize:12, color:"#888", marginTop:2, maxWidth:620, lineHeight:1.6 }}>
            Jugs, by shop. Received here, carried out to the sheds here, and logged into a machine
            here — not on the fuel log, because a jug rarely goes in when the machine is fuelled.
          </div>
        </div>
        {!notSetUp && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setAction(action==="receive"?null:"receive")}
                    style={action==="receive" ? btn.primary : btn.ghost}>Receive</button>
            <button onClick={()=>setAction(action==="move"?null:"move")}
                    style={action==="move" ? btn.primary : btn.ghost}>Move to a shed</button>
            <button onClick={()=>setAction(action==="use"?null:"use")}
                    style={action==="use" ? btn.primary : btn.ghost}>Log into a machine</button>
          </div>
        )}
      </div>

      {notSetUp && (
        <div style={{ border:"1px dashed #ccc", borderRadius:8, padding:"18px 20px", background:"#fafaf8",
                      fontSize:12.5, color:"#666", lineHeight:1.7, maxWidth:660, marginBottom:16 }}>
          <strong style={{ color:"#444" }}>DEF is not set up yet.</strong> It is an inventory item
          rather than a tank, because it lives in jugs on a shelf.
          <div style={{ marginTop:8 }}>
            Open the jug under <strong>Inventory</strong>, set <strong>Fluid</strong> to DEF, and enter
            how many gallons one container holds. Everything else happens on this tab.
          </div>
          <div style={{ marginTop:8, color:"#888" }}>
            A county with a bulk DEF tank adds a tank with its fuel type set to DEF instead, and none
            of the above applies.
          </div>
        </div>
      )}

      {needSize.length > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6,
                      padding:"11px 14px", marginBottom:14, fontSize:12.5, color:"#7a4f00", lineHeight:1.65 }}>
          <strong>One number needed before DEF can be costed.</strong> The R&amp;B export says how many
          containers of {needSize.map(i => i.name).join(", ")} are on hand, but not how much one holds.
          Open it under <strong>Inventory</strong> and enter <strong>gallons per container</strong> —
          2.5 for the usual jug. Until then it is counted in jugs, which is right, but gallons and cost
          per gallon would be guesses so they are not shown.
        </div>
      )}

      {low.length > 0 && (
        <div style={{ background:"#fef3cd", border:"1px solid #f0d080", borderRadius:6,
                      padding:"10px 13px", marginBottom:14, fontSize:12, color:"#7a4f00", lineHeight:1.6 }}>
          <strong>{low.map(i => i.name).join(", ")} below the reorder point.</strong>{" "}
          That figure is the county's total. A shed can be empty while the count still looks healthy —
          the cards below are what tells you which one.
        </div>
      )}

      {action === "receive" && (
        <ReceiveForm defItems={defItems} groups={groups} dispatch={dispatch}
                     onDone={()=>setAction(null)} />
      )}
      {action === "move" && (
        <MoveForm defItems={defItems} stock={stock} groups={groups} batches={batches}
                  dispatch={dispatch} onDone={()=>setAction(null)} />
      )}
      {action === "use" && (
        <UseForm defItems={defItems} stock={stock} groups={groups} batches={batches}
                 units={units} employees={employees} dispatch={dispatch} onDone={()=>setAction(null)} />
      )}

      {/* On hand, shop by shop */}
      {!notSetUp && (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", margin:"18px 0 10px" }}>
            <div style={{ fontSize:13, fontWeight:700 }}>On hand</div>
            {stock.containers > 0 && (
              <div style={{ fontSize:12, color:"#666", fontFamily:"monospace" }}>
                {stock.containers} jugs {sized && `· ${stock.gallons.toFixed(1)} gal `}· {fmtSm(stock.value)}
              </div>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
            {stock.byLocation.map(l => (
              <div key={l.location} style={{ background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{placeName(l.location, groups) || "Unassigned"}</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:8 }}>
                  <span style={{ fontSize:24, fontWeight:700, fontFamily:"monospace",
                                 color: l.containers <= 2 ? "#c0392b" : "#1a3a5c" }}>{l.containers}</span>
                  <span style={{ fontSize:12, color:"#888" }}>{l.containers === 1 ? "jug" : "jugs"}</span>
                </div>
                <div style={{ fontSize:11, color:"#888", marginTop:4, fontFamily:"monospace" }}>
                  {sized && `${l.gallons.toFixed(1)} gal · `}{fmtSm(l.value)}
                </div>
              </div>
            ))}
            {bulk.map(t => (
              <div key={t.id} style={{ background:"#fff", border:"1px solid #c8d8ec", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{t.name}</div>
                <div style={{ fontSize:10.5, color:"#888", marginTop:2 }}>bulk tank</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:6 }}>
                  <span style={{ fontSize:24, fontWeight:700, fontFamily:"monospace", color:"#1a3a5c" }}>
                    {(t.currentLevel || 0).toFixed(0)}</span>
                  <span style={{ fontSize:12, color:"#888" }}>gal</span>
                </div>
              </div>
            ))}
            {!stock.byLocation.length && !bulk.length && (
              <div style={{ gridColumn:"1/-1", padding:26, textAlign:"center", color:"#aaa",
                            border:"1px dashed #ccc", borderRadius:8, fontSize:12.5 }}>
                No DEF on any shelf. Use <strong>Receive</strong> when a delivery arrives.
              </div>
            )}
          </div>

          <div style={{ fontSize:11, color:"#888", marginTop:12, lineHeight:1.65, maxWidth:660 }}>
            When a count comes up short because nobody wrote it down, log the missing jugs with
            <strong> Log into a machine</strong> against the one that most likely had them, and say so
            in the notes. That puts the cost where it belongs and squares the shelf in one entry.
          </div>

          <div style={{ marginTop:22 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Recent movements</div>
            <Table
              headers={[{label:"Date"},{label:"What"},{label:"Jugs"},{label:"Where"},{label:"Cost"},{label:"Note"}]}
              emptyMessage="Nothing recorded against DEF yet."
              rows={history.map(h => [
                <span style={{ fontFamily:"monospace", fontSize:12 }}>{fmtDate(h.date)}</span>,
                <span style={{ textTransform:"capitalize",
                               color: h.kind === "issue" ? "#8c1b18" : h.kind === "transfer" ? "#40607d" : "#1a6b35" }}>
                  {h.kind === "issue" ? "Used" : h.kind === "transfer" ? "Moved" : "Received"}
                </span>,
                <span style={{ fontFamily:"monospace", fontWeight:600 }}>{h.qty}</span>,
                <span style={{ fontSize:12 }}>{h.where}{h.who && <span style={{ color:"#888" }}> · {h.who}</span>}</span>,
                <span style={{ fontFamily:"monospace" }}>{h.cost ? fmtSm(h.cost) : "—"}</span>,
                <span style={{ fontSize:11, color:"#888" }}>{h.notes}</span>,
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}

const card = { background:"#f7f7f5", border:"1px solid #ddd", borderRadius:8, padding:16, marginBottom:16 };
const uid  = () => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

// Every group is a candidate shelf — a shed, a shop area, even a machine if a
// county keeps a jug on one. Whatever the county has, not a list I invented.
const placeOptions = (groups) =>
  [...groups].filter(g => g.active !== false)
             .sort((a,b) => (Number(a.code)||0) - (Number(b.code)||0) || String(a.code).localeCompare(String(b.code)))
             .map(g => ({ value: g.code, label: groupLabel(g) }));

// ── Received ──────────────────────────────────────────────────────────────────
// NOTE — this does NOT create a claim. Nothing in the Inventory module does;
// only a fuel delivery reaches Fund Accounting today. Greg has asked for
// everything the county receives and pays for to go through it, so this form
// will change when that is settled. Recorded here rather than left as a
// surprise, because a receiving screen that looks complete and quietly skips
// the accounting is worse than one that says so.
function ReceiveForm({ defItems, groups, dispatch, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_RECEIVE, itemId: defItems[0]?.id || "" });
  useUnsavedForm(form, "this DEF delivery");
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const item = defItems.find(i => i.id === form.itemId);
  const qty  = parseFloat(form.containers) || 0;
  const cost = parseFloat(form.unitCost) || 0;

  const missing = [];
  if (!form.date)     missing.push("a date");
  if (!form.itemId)   missing.push("which DEF");
  if (!form.location) missing.push("where it is going");
  if (qty <= 0)       missing.push("how many jugs");
  if (cost <= 0)      missing.push("what a jug cost");

  const save = () => {
    if (missing.length) return;
    const batchId = uid();
    dispatch({ type:"ADD_INVENTORY_TRANSACTION", payload:{
      id: uid(), type:"receive", date: form.date,
      itemId: item.id, itemName: item.name,
      quantity: qty, unitOfMeasure: item.unitOfMeasure || "EA",
      unitCost: cost, totalCost: Number((qty * cost).toFixed(2)),
      location: form.location, vendorName: form.vendorName,
      invoiceRef: form.invoiceRef, batchId,
      batch: {
        id: batchId, itemId: item.id, itemName: item.name,
        receiptDate: form.date, receiptRef: form.invoiceRef || "DEF receipt",
        location: form.location, shelf: "",
        quantityReceived: qty, quantityRemaining: qty,
        unitCost: cost, totalCost: Number((qty * cost).toFixed(2)),
        vendorName: form.vendorName, invoiceStatus:"final", invoiceRef: form.invoiceRef,
        status:"open", notes: form.notes, createdAt: new Date().toISOString(),
      },
      notes: form.notes, createdAt: new Date().toISOString(),
    }});
    setForm({ ...EMPTY_RECEIVE, itemId: form.itemId, location: form.location, vendorName: form.vendorName });
  };

  return (
    <div style={card}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>DEF arrived</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
        <Field label="Date" required><DateField value={form.date} onChange={v=>set("date",v)} /></Field>
        <Field label="Which DEF" required>
          <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {defItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Onto which shelf" required>
          <select value={form.location} onChange={e=>set("location",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {placeOptions(groups).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Jugs" required>
          <input type="number" min="0" step="1" value={form.containers}
                 onChange={e=>set("containers",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <Field label="Cost each" required>
          <MoneyField value={form.unitCost} onChange={v=>set("unitCost",v)} />
        </Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr auto", gap:12, alignItems:"end" }}>
        <Field label="Vendor"><input type="text" value={form.vendorName}
               onChange={e=>set("vendorName",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
        <Field label="Invoice"><input type="text" value={form.invoiceRef}
               onChange={e=>set("invoiceRef",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
        <Field label="Notes"><input type="text" value={form.notes}
               onChange={e=>set("notes",e.target.value)} style={{ ...inp, margin:0 }} /></Field>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={save} disabled={missing.length>0}
                  style={{ ...btn.primary, opacity: missing.length?0.4:1 }}>Receive</button>
          <button onClick={onDone} style={btn.ghost}>Done</button>
        </div>
      </div>
      {missing.length > 0 && (
        <div style={{ fontSize:11.5, color:"#a05a00", marginTop:10 }}>Still needs {missing.join(", ")}.</div>
      )}
      {qty > 0 && cost > 0 && (
        <div style={{ fontSize:11.5, color:"#40607d", marginTop:10 }}>
          {qty} {qty===1?"jug":"jugs"} at {fmtSm(cost)} = <strong>{fmtSm(qty*cost)}</strong>
        </div>
      )}
    </div>
  );
}

// ── Moved ─────────────────────────────────────────────────────────────────────
//
// The step Greg could not find. A transfer moves a QUANTITY between two places
// and leaves the item alone — the jugs at Kenesaw are still the same DEF, just
// somewhere else.
function MoveForm({ defItems, stock, groups, batches, dispatch, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_MOVE, itemId: defItems[0]?.id || "" });
  useUnsavedForm(form, "this DEF move");
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const item = defItems.find(i => i.id === form.itemId);
  const qty  = parseFloat(form.containers) || 0;
  const here = stock.byLocation.filter(l => !item || l.items.includes(item.id));
  const have = here.find(l => l.location === form.from)?.containers || 0;

  const missing = [];
  if (!form.itemId) missing.push("which DEF");
  if (!form.from)   missing.push("where it is coming from");
  if (!form.to)     missing.push("where it is going");
  if (qty <= 0)     missing.push("how many jugs");
  const tooMany = qty > have;

  const save = () => {
    if (missing.length || tooMany) return;
    dispatch({ type:"ADD_INVENTORY_TRANSACTION", payload:{
      id: uid(), type:"transfer", date: form.date,
      itemId: item.id, itemName: item.name,
      quantity: qty, fromLocation: form.from, toLocation: form.to, toShelf: "",
      notes: form.notes || "DEF carried out from the shop",
      createdAt: new Date().toISOString(),
    }});
    setForm({ ...EMPTY_MOVE, itemId: form.itemId, from: form.from });
  };

  return (
    <div style={card}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:3 }}>Carry jugs out to a shed</div>
      <div style={{ fontSize:11.5, color:"#888", marginBottom:12 }}>
        The jugs stay the same item — this only records where they are now.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 1.4fr 1.4fr 0.8fr auto", gap:12, alignItems:"end" }}>
        <Field label="Date"><DateField value={form.date} onChange={v=>set("date",v)} /></Field>
        <Field label="Which DEF" required>
          <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {defItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="From" required>
          <select value={form.from} onChange={e=>set("from",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {here.map(l => (
              <option key={l.location} value={l.location}>
                {placeName(l.location, groups)} ({l.containers})
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" required>
          <select value={form.to} onChange={e=>set("to",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {placeOptions(groups).filter(o => o.value !== form.from)
              .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Jugs" required>
          <input type="number" min="0" step="1" value={form.containers}
                 onChange={e=>set("containers",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={save} disabled={missing.length>0 || tooMany}
                  style={{ ...btn.primary, opacity: (missing.length||tooMany)?0.4:1 }}>Move</button>
          <button onClick={onDone} style={btn.ghost}>Done</button>
        </div>
      </div>
      {tooMany && (
        <div style={{ fontSize:11.5, color:"#8c1b18", marginTop:10 }}>
          {placeName(form.from, groups)} only has {have}. Count it, or move fewer.
        </div>
      )}
      {missing.length > 0 && !tooMany && (
        <div style={{ fontSize:11.5, color:"#a05a00", marginTop:10 }}>Still needs {missing.join(", ")}.</div>
      )}
    </div>
  );
}

// ── Used ──────────────────────────────────────────────────────────────────────
function UseForm({ defItems, stock, groups, batches, units, employees, dispatch, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_USE, itemId: defItems[0]?.id || "" });
  useUnsavedForm(form, "this DEF entry");
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const item = defItems.find(i => i.id === form.itemId);
  const unit = units.find(u => u.id === form.equipmentId);
  const here = stock.byLocation.filter(l => !item || l.items.includes(item.id));

  const crew = [...employees].filter(e => e.active !== false)
    .sort((a,b) => (a.lastName || a.name || "").localeCompare(b.lastName || b.name || ""));

  const draft = (item && form.containers && form.equipmentId)
    ? issueFluidToMachine({
        item, location: form.location || "all", containers: parseFloat(form.containers) || 0,
        batches, date: form.date, equipmentId: form.equipmentId,
        unitNumber: unit?.unitNumber || "", meterReading: parseFloat(form.meterReading) || 0,
        meterType: unit?.meterType || "hours", pumpedBy: form.pumpedBy, notes: form.notes,
      })
    : null;

  const missing = [];
  if (!form.date)        missing.push("a date");
  if (!form.itemId)      missing.push("which DEF");
  if (!form.equipmentId) missing.push("which machine");
  if (!(parseFloat(form.containers) > 0)) missing.push("how many jugs");

  const save = () => {
    if (missing.length || !draft?.ok) return;
    dispatch({ type:"ADD_FUEL_DISPENSING", payload: draft.dispensing, transaction: draft.transaction });
    setForm({ ...EMPTY_USE, itemId: form.itemId, location: form.location, pumpedBy: form.pumpedBy });
  };

  return (
    <div style={card}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:3 }}>A jug went into a machine</div>
      <div style={{ fontSize:11.5, color:"#888", marginBottom:12 }}>
        Takes the jugs off the shelf and puts their cost on the machine, in one entry.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 1.6fr 0.8fr 1fr", gap:12, marginBottom:12 }}>
        <Field label="Date" required><DateField value={form.date} onChange={v=>set("date",v)} /></Field>
        <Field label="Which DEF" required>
          <select value={form.itemId} onChange={e=>set("itemId",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {defItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Machine" required>
          <select value={form.equipmentId} onChange={e=>set("equipmentId",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Select…</option>
            {units.filter(u => u.status !== "sold").map(u => (
              <option key={u.id} value={u.id}>
                {u.unitNumber ? `${u.unitNumber} — ` : ""}{u.year} {u.make} {u.model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jugs" required>
          <input type="number" min="0" step="1" value={form.containers}
                 onChange={e=>set("containers",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <Field label="Off which shelf">
          <select value={form.location} onChange={e=>set("location",e.target.value)} style={{ ...inp, margin:0 }}>
            <option value="">Wherever it is</option>
            {here.map(l => (
              <option key={l.location} value={l.location}>
                {placeName(l.location, groups)} ({l.containers})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 2fr auto", gap:12, alignItems:"end" }}>
        <Field label={`Meter (${unit?.meterType === "miles" ? "miles" : "hours"})`}>
          <input type="number" min="0" step="any" value={form.meterReading}
                 onChange={e=>set("meterReading",e.target.value)} style={{ ...inp, margin:0, fontFamily:"monospace" }} />
        </Field>
        <Field label="Put in by">
          {crew.length > 0 ? (
            <select value={form.pumpedBy} onChange={e=>set("pumpedBy",e.target.value)} style={{ ...inp, margin:0 }}>
              <option value="">Who?…</option>
              {crew.map(e => {
                const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || e.name;
                return <option key={e.id} value={name}>{name}</option>;
              })}
            </select>
          ) : (
            <input type="text" value={form.pumpedBy} onChange={e=>set("pumpedBy",e.target.value)}
                   style={{ ...inp, margin:0 }} placeholder="Add employees to get a list" />
          )}
        </Field>
        <Field label="Notes">
          <input type="text" value={form.notes} onChange={e=>set("notes",e.target.value)}
                 style={{ ...inp, margin:0 }} placeholder="e.g. found short at the count" />
        </Field>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={save} disabled={missing.length>0 || !draft?.ok}
                  style={{ ...btn.primary, opacity: (missing.length || !draft?.ok)?0.4:1 }}>Log it</button>
          <button onClick={onDone} style={btn.ghost}>Done</button>
        </div>
      </div>

      {missing.length > 0 && (
        <div style={{ fontSize:11.5, color:"#a05a00", marginTop:10 }}>Still needs {missing.join(", ")}.</div>
      )}
      {!missing.length && draft && !draft.ok && (
        <div style={{ fontSize:11.5, color:"#8c1b18", marginTop:10 }}>{draft.reason}</div>
      )}
      {draft?.ok && (
        <div style={{ background:"#f4f7fa", border:"1px solid #dbe4ec", borderRadius:5,
                      padding:"8px 11px", marginTop:10, fontSize:11.5, color:"#40607d" }}>
          {draft.dispensing.containers} {draft.dispensing.containers === 1 ? "jug" : "jugs"} ·{" "}
          {draft.gallons.toFixed(1)} gal · <strong>{fmtSm(draft.totalCost)}</strong> onto unit{" "}
          {draft.dispensing.unitNumber || "—"}, off the shelf at{" "}
          {placeName(draft.transaction.location, groups) || "wherever it was"}.
        </div>
      )}
    </div>
  );
}
