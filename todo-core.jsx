// Shared todo state management + helpers.
// Each variant uses its own localStorage key so the three demos don't bleed.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// Auto-purge horizon: trashed items older than this vanish for good.
const TRASH_TTL_MS = 7 * 86400000;

// ───────────────────────────────────────────────────────────
// useTodos — the brain. Manages live items + a trash bin.
// Trash auto-purges items older than 7 days on every load and
// on every mutation. Supports add/edit/toggle/remove/restore/
// deleteForever/emptyTrash + undo toast for soft-delete.
// ───────────────────────────────────────────────────────────
function useTodos(storageKey, seed = []) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return { todos: parsed, trash: [] };
        return { todos: parsed.todos || [], trash: parsed.trash || [] };
      }
    } catch (e) {}
    return { todos: seed, trash: [] };
  });
  const [lastDeleted, setLastDeleted] = useState(null);
  const undoTimer = useRef(null);

  // Persist + auto-purge old trash on any state change.
  useEffect(() => {
    const cutoff = Date.now() - TRASH_TTL_MS;
    const alive = state.trash.filter(t => (t.deletedAt || 0) >= cutoff);
    const toWrite = alive.length === state.trash.length ? state : { ...state, trash: alive };
    try { localStorage.setItem(storageKey, JSON.stringify(toWrite)); } catch (e) {}
    if (alive.length !== state.trash.length) setState(toWrite);
  }, [state, storageKey]);

  // dueHasTime: true when user set an explicit HH:MM, false for date-only deadlines
  const add = useCallback((text, category = null, due = null, dueHasTime = false) => {
    if (!text || !text.trim()) return;
    setState(s => ({
      ...s,
      todos: [
        { id: Date.now() + Math.random(), text: text.trim(), done: false, category, due, dueHasTime, created: Date.now() },
        ...s.todos,
      ],
    }));
  }, []);

  const edit = useCallback((id, patch) => {
    setState(s => ({
      ...s,
      todos: s.todos.map(x => x.id === id ? { ...x, ...patch } : x),
    }));
  }, []);

  const toggle = useCallback((id) => {
    setState(s => ({
      ...s,
      todos: s.todos.map(x =>
        x.id === id ? { ...x, done: !x.done, completedAt: !x.done ? Date.now() : null } : x
      ),
    }));
  }, []);

  // Soft delete: move to trash, show undo toast for 4s.
  const remove = useCallback((id) => {
    setState(s => {
      const victim = s.todos.find(x => x.id === id);
      if (!victim) return s;
      const idx = s.todos.indexOf(victim);
      setLastDeleted({ todo: victim, idx });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setLastDeleted(null), 4000);
      return {
        ...s,
        todos: s.todos.filter(x => x.id !== id),
        trash: [{ ...victim, deletedAt: Date.now() }, ...s.trash],
      };
    });
  }, []);

  const undo = useCallback(() => {
    if (!lastDeleted) return;
    setState(s => {
      const next = s.todos.slice();
      next.splice(Math.min(lastDeleted.idx, next.length), 0, lastDeleted.todo);
      return {
        ...s,
        todos: next,
        trash: s.trash.filter(t => t.id !== lastDeleted.todo.id),
      };
    });
    setLastDeleted(null);
    clearTimeout(undoTimer.current);
  }, [lastDeleted]);

  const restore = useCallback((id) => {
    setState(s => {
      const t = s.trash.find(x => x.id === id);
      if (!t) return s;
      const { deletedAt, ...rest } = t;
      return {
        ...s,
        todos: [rest, ...s.todos],
        trash: s.trash.filter(x => x.id !== id),
      };
    });
  }, []);

  const deleteForever = useCallback((id) => {
    setState(s => ({ ...s, trash: s.trash.filter(x => x.id !== id) }));
  }, []);

  const emptyTrash = useCallback(() => {
    setState(s => ({ ...s, trash: [] }));
  }, []);

  const clearCompleted = useCallback(() => {
    setState(s => {
      const now = Date.now();
      const { done, keep } = s.todos.reduce((a, x) => {
        (x.done ? a.done : a.keep).push(x); return a;
      }, { done: [], keep: [] });
      return {
        ...s,
        todos: keep,
        trash: [...done.map(t => ({ ...t, deletedAt: now })), ...s.trash],
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState(s => {
      const now = Date.now();
      return {
        ...s,
        todos: [],
        trash: [...s.todos.map(t => ({ ...t, deletedAt: now })), ...s.trash],
      };
    });
  }, []);

  return {
    todos: state.todos,
    trash: state.trash,
    add, edit, toggle, remove, undo, lastDeleted,
    restore, deleteForever, emptyTrash,
    clearCompleted, clearAll,
  };
}

// ───────────────────────────────────────────────────────────
// useSwipe — horizontal drag on a row.
// ───────────────────────────────────────────────────────────
function useSwipe({ onLeft, onRight, threshold = 72, max = 120, disabled = false }) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const active = useRef(false);

  const onPointerDown = (e) => {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    active.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onPointerMove = (e) => {
    if (!active.current || !start.current) return;
    const rawDx = e.clientX - start.current.x;
    const rawDy = e.clientY - start.current.y;
    if (Math.abs(rawDy) > Math.abs(rawDx) && Math.abs(rawDy) > 10) {
      active.current = false;
      setDx(0);
      return;
    }
    const clamped = Math.max(-max, Math.min(max, rawDx));
    setDx(clamped);
  };
  const onPointerUp = (e) => {
    if (!active.current) { setDx(0); return; }
    active.current = false;
    if (dx <= -threshold && onLeft) onLeft();
    else if (dx >= threshold && onRight) onRight();
    setDx(0);
    start.current = null;
  };
  const onPointerCancel = () => { active.current = false; setDx(0); };

  return { dx, bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}

// ───────────────────────────────────────────────────────────
// Confetti — one-shot canvas burst.
// ───────────────────────────────────────────────────────────
function fireConfetti(host, { colors = ['#ff5964', '#ffcf5c', '#4fb286', '#4a90e2', '#fff'], count = 90 } = {}) {
  const c = document.createElement('canvas');
  const rect = host.getBoundingClientRect();
  c.width = rect.width; c.height = rect.height;
  c.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:1000;`;
  host.appendChild(c);
  const ctx = c.getContext('2d');
  const parts = Array.from({ length: count }, () => ({
    x: rect.width / 2 + (Math.random() - 0.5) * 40,
    y: rect.height * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 4, g: 0.55,
    rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
    w: 4 + Math.random() * 5, h: 6 + Math.random() * 8,
    color: colors[(Math.random() * colors.length) | 0], life: 1,
  }));
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.005;
      if (p.y < rect.height + 40 && p.life > 0) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
    }
    if (alive > 0 && frame < 200) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}

// ───────────────────────────────────────────────────────────
// parseInput — extracts #tag, /day or /date, :HHMMam/:HHMMpm
// time tags, and trailing natural-language deadline words.
// Returns { text, category, due, dueHasTime }.
//
// Accepted syntax (anywhere in input; repeats = last wins):
//   #work                  → category "work"
//   /fri | /tom | /today   → deadline by weekday/keyword
//   /2026-05-01            → explicit ISO date
//   /"May 1" | /'may 1'    → quoted human date (best-effort)
//   :0930am | :1430        → time tag (am/pm or 24h)
//   :0930pm | :09:30am     → also accepted
//   plus trailing "fri"/"tomorrow" (legacy) still works.
// ───────────────────────────────────────────────────────────
const DAY_WORDS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function dueFromWord(word) {
  const w = word.toLowerCase();
  const now = new Date(); now.setHours(23, 59, 0, 0);
  let add = null;
  if (w === 'today') add = 0;
  else if (w === 'tomorrow' || w === 'tom' || w === 'tmrw') add = 1;
  else if (DAY_WORDS[w.slice(0, 3)] !== undefined) {
    const target = DAY_WORDS[w.slice(0, 3)];
    add = (target - now.getDay() + 7) % 7 || 7;
  }
  if (add === null) return null;
  const d = new Date(now); d.setDate(d.getDate() + add); return d.getTime();
}

function dueFromIso(str) {
  const m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59);
  return isNaN(d) ? null : d.getTime();
}

function dueFromHuman(str) {
  const d = new Date(str + ' ' + new Date().getFullYear());
  if (!isNaN(d)) { d.setHours(23, 59); return d.getTime(); }
  const d2 = new Date(str);
  if (!isNaN(d2)) { d2.setHours(23, 59); return d2.getTime(); }
  return null;
}

function parseInput(input) {
  let text = input;
  let category = null;
  let due = null;
  let dueHasTime = false;
  let parsedTime = null; // { h, m }

  // #tag — word chars, 2–14 chars
  text = text.replace(/(^|\s)#([a-z][a-z0-9_-]{1,13})/gi, (_, pre, tag) => {
    category = tag.toLowerCase(); return pre;
  });

  // :HHMMam / :HHMMpm / :HHMM (24h) — e.g. :0930am :1430 :09:30pm
  // Accepts optional colon between hours and minutes: :09:30am or :0930am
  text = text.replace(/(^|\s):(\d{1,2}):?(\d{2})(am|pm)?/gi, (_, pre, hStr, mStr, meridiem) => {
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (meridiem) {
      const mer = meridiem.toLowerCase();
      if (mer === 'am' && h === 12) h = 0;
      if (mer === 'pm' && h !== 12) h += 12;
    }
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      parsedTime = { h, m };
    }
    return pre;
  });

  // /"quoted date" or /'quoted date'
  text = text.replace(/(^|\s)\/"([^"]+)"/g, (_, pre, q) => {
    const ts = dueFromHuman(q); if (ts) due = ts; return pre;
  });
  text = text.replace(/(^|\s)\/'([^']+)'/g, (_, pre, q) => {
    const ts = dueFromHuman(q); if (ts) due = ts; return pre;
  });

  // /YYYY-MM-DD
  text = text.replace(/(^|\s)\/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g, (_, pre, d) => {
    const ts = dueFromIso(d); if (ts) due = ts; return pre;
  });

  // /day (word)
  text = text.replace(/(^|\s)\/([a-z]{3,9})/gi, (_, pre, w) => {
    const ts = dueFromWord(w); if (ts) due = ts; return pre;
  });

  // Legacy trailing-word deadline (no slash)
  if (!due) {
    const re = /\s+(today|tomorrow|tom|tmrw|mon|tue|wed|thu|fri|sat|sun)$/i;
    const m = text.match(re);
    if (m) { due = dueFromWord(m[1]); text = text.replace(re, ''); }
  }

  // Legacy "cat: text" prefix (still supported)
  if (!category) {
    const cm = text.match(/^\s*([a-z][a-z0-9_-]{1,13}):\s*(.+)/i);
    if (cm) { category = cm[1].toLowerCase(); text = cm[2]; }
  }

  // Apply parsed time to due date (or default to today if no date set)
  if (parsedTime) {
    const base = due ? new Date(due) : new Date();
    base.setHours(parsedTime.h, parsedTime.m, 0, 0);
    due = base.getTime();
    dueHasTime = true;
  }

  return { text: text.trim().replace(/\s+/g, ' '), category, due, dueHasTime };
}

// Back-compat for anything still calling parseDue.
function parseDue(input) {
  const p = parseInput(input);
  return { text: p.text, due: p.due, category: p.category, dueHasTime: p.dueHasTime };
}

// ───────────────────────────────────────────────────────────
// formatDue — human-readable deadline label.
// Pass hasTime=true to append the HH:MMa/p suffix.
// ───────────────────────────────────────────────────────────
function formatDue(ts, hasTime) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.round(diffMs / 86400000);

  let datePart;
  if (diffDays < 0) datePart = `${Math.abs(diffDays)}d late`;
  else if (diffDays === 0) datePart = 'today';
  else if (diffDays === 1) datePart = 'tmrw';
  else if (diffDays < 7) datePart = d.toLocaleDateString('en', { weekday: 'short' }).toLowerCase();
  else datePart = d.toLocaleDateString('en', { month: 'short', day: 'numeric' }).toLowerCase();

  if (hasTime) {
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'p' : 'a';
    const h12 = h % 12 || 12;
    datePart += `:${String(h12).padStart(2, '0')}${String(m).padStart(2, '0')}${ampm}`;
  }

  return datePart;
}

// ───────────────────────────────────────────────────────────
// dueUrgency — STATUS thresholds:
//   'late'    → overdue (WARNING)
//   'caution' → within 2 hours (CAUTION)
//   'today'   → same calendar day but >2h away
//   'soon'    → within 2 days
//   'later'   → beyond that
//   'none'    → no deadline set
// ───────────────────────────────────────────────────────────
function dueUrgency(ts) {
  if (!ts) return 'none';
  const diff = ts - Date.now();
  if (diff < 0) return 'late';
  if (diff < 2 * 3600 * 1000) return 'caution'; // within 2 hours → CAUTION
  const diffDays = Math.round(diff / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays <= 2) return 'soon';
  return 'later';
}

// Format time-until-purge for trash ("6d", "3d", "<1d")
function formatTrashExpiry(deletedAt) {
  const left = (deletedAt + TRASH_TTL_MS) - Date.now();
  if (left <= 0) return 'gone';
  const days = Math.ceil(left / 86400000);
  return days <= 1 ? '<1d' : `${days}d`;
}

// ───────────────────────────────────────────────────────────
// Seed data
// ───────────────────────────────────────────────────────────
const SEED_TODOS = [
  { id: 1, text: 'ship offline-first release', done: false, category: 'work', due: Date.now() + 86400000, dueHasTime: false, created: Date.now() - 2e8 },
  { id: 2, text: 'reply to andre re: Q3 plan', done: false, category: 'work', due: Date.now() - 86400000, dueHasTime: false, created: Date.now() - 3e8 },
  { id: 3, text: 'pay rent', done: false, category: 'life', due: Date.now() + 3 * 86400000, dueHasTime: false, created: Date.now() - 1e8 },
  { id: 4, text: 'water the monstera', done: true, category: 'life', due: null, dueHasTime: false, created: Date.now() - 4e8, completedAt: Date.now() - 1e7 },
  { id: 5, text: 'book dentist', done: false, category: 'health', due: null, dueHasTime: false, created: Date.now() - 1e7 },
  { id: 6, text: 'read "patterns of software"', done: false, category: 'read', due: null, dueHasTime: false, created: Date.now() - 5e8 },
  { id: 7, text: 'draft annual review', done: true, category: 'work', due: null, dueHasTime: false, created: Date.now() - 6e8, completedAt: Date.now() - 2e7 },
];

Object.assign(window, {
  useTodos, useSwipe, fireConfetti,
  parseDue, parseInput,
  formatDue, dueUrgency, formatTrashExpiry,
  SEED_TODOS, TRASH_TTL_MS,
});
