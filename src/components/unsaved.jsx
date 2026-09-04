// Warning someone before they lose what they typed.
//
// Greg: "Please make it so you cannot leave a screen that you are entering info
// in without a warning that says you need to save what you have entered or you
// will lose it."
//
// The browser's own `beforeunload` covers closing the tab and hitting refresh,
// and that is the easy half. The half that actually bites is moving WITHIN the
// program — clicking Equipment while half a claim is typed. No browser event
// fires for that, because as far as the browser is concerned nothing happened.
//
// So navigation has to ask. `useUnsavedGuard` registers a form as dirty;
// `useNavigationGuard` gives a screen a `go()` to route clicks through, which
// either navigates or raises the prompt.
//
// Deliberately NOT an autosave. A half-entered claim written to the ledger is a
// worse outcome than losing it — the person knows they were interrupted, the
// ledger does not.

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { btn } from "./shared.jsx";

const UnsavedContext = createContext(null);

export function UnsavedWorkProvider({ children }) {
  // A ref, not state: every keystroke in a form would otherwise re-render the
  // whole application shell.
  const dirty = useRef(new Map());
  const [prompt, setPrompt] = useState(null);   // { what, onLeave }

  const setDirty = useCallback((id, isDirty, what) => {
    if (isDirty) dirty.current.set(id, what || "what you have entered");
    else dirty.current.delete(id);
  }, []);

  const pending = useCallback(() => [...dirty.current.values()], []);

  // Closing the tab or reloading. The browser shows its own wording — nothing
  // here can change that — but without this it does not ask at all.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty.current.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Moving inside the program. Runs `action` straight away when nothing is
  // half-typed, so the guard is invisible almost all of the time.
  const guard = useCallback((action) => {
    const outstanding = pending();
    if (!outstanding.length) { action(); return; }
    setPrompt({
      what: outstanding,
      onLeave: () => { dirty.current.clear(); setPrompt(null); action(); },
    });
  }, [pending]);

  return (
    <UnsavedContext.Provider value={{ setDirty, guard, pending }}>
      {children}
      {prompt && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:9999,
                      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
             onClick={() => setPrompt(null)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:10, maxWidth:460, width:"100%",
                        boxShadow:"0 12px 40px rgba(0,0,0,0.25)", overflow:"hidden" }}>
            <div style={{ padding:"18px 22px 4px", fontSize:16, fontWeight:700, color:"#8c1b18" }}>
              You have not saved this yet
            </div>
            <div style={{ padding:"6px 22px 18px", fontSize:13.5, color:"#444", lineHeight:1.65 }}>
              Leaving now loses {prompt.what.length === 1 ? prompt.what[0] : "what you have entered"}.
              {prompt.what.length > 1 && (
                <ul style={{ margin:"8px 0 0", paddingLeft:20 }}>
                  {prompt.what.map((w, i) => <li key={i} style={{ marginBottom:2 }}>{w}</li>)}
                </ul>
              )}
              <div style={{ marginTop:10, fontSize:12.5, color:"#888" }}>
                Nothing has been written yet. Go back and save it, or leave and start again.
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end",
                          padding:"14px 22px", borderTop:"1px solid #eee", background:"#fafaf8" }}>
              <button onClick={() => setPrompt(null)} style={btn.primary}>Stay and save it</button>
              <button onClick={prompt.onLeave}
                      style={{ ...btn.ghost, color:"#c0392b", borderColor:"#e8b4b4" }}>
                Leave and lose it
              </button>
            </div>
          </div>
        </div>
      )}
    </UnsavedContext.Provider>
  );
}

// Nothing outside a provider should crash — tests and stories render modules on
// their own, and a guard that throws there is a guard nobody will keep.
const NO_OP = { setDirty: () => {}, guard: (action) => action(), pending: () => [] };
export const useUnsaved = () => useContext(UnsavedContext) || NO_OP;

// Mark a form dirty while it holds unsaved work.
//
//   useUnsavedGuard(form !== blank, "this expenditure");
//
// Registration is keyed to the component instance, so two forms open at once
// are tracked separately and closing one does not clear the other.
export function useUnsavedGuard(isDirty, what) {
  const { setDirty } = useUnsaved();
  const id = useRef(Symbol("form"));
  useEffect(() => {
    setDirty(id.current, isDirty, what);
    return () => setDirty(id.current, false);
  }, [isDirty, what, setDirty]);
}

// Guard a form without having to list its fields.
//
//   const [form, setForm] = useState(EMPTY);
//   useUnsavedForm(form, "this employee");
//
// It remembers the form as it was on first render and compares. That matters:
// the first version of this made each form spell out which fields counted as
// "typed in", and a list written by hand is a list that goes stale — every new
// field is one somebody has to remember to add, and forms added later got no
// guard at all. Greg found that the hard way, half way through an employee.
//
// Editing an existing record works the same way, because the record as loaded
// is what gets remembered.
export function useUnsavedForm(form, what) {
  const initial = useRef(null);
  const snapshot = JSON.stringify(form ?? null);
  if (initial.current === null) initial.current = snapshot;
  useUnsavedGuard(snapshot !== initial.current, what);
}

// Route a navigation click through the guard.
//
//   const go = useNavigationGuard();
//   <button onClick={() => go(() => setView("items"))}>
export function useNavigationGuard() {
  return useUnsaved().guard;
}
