// Variant D — Flight Deck
// Boeing 787 Electronic Checklist aesthetic. Pure-black background, cockpit color
// language: green for selected/active, magenta for targets (due dates),
// cyan for background info (tags), amber for CAUTION (within 2h), red for WARNING
// (overdue), white for current status. Airspeed-tape style active counter,
// ND-style category chips, FMA banner with STATUS + FLT NR.

function FlightDeckVariant({ dark = true, density = 'compact' }) {
  const T = useTodos('todo.flightdeck', SEED_TODOS);
  const { todos, trash, add, edit, toggle, remove, undo, lastDeleted,
    restore, deleteForever, emptyTrash, clearAll } = T;

  const [input, setInput] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('created');
  const [editingId, setEditingId] = React.useState(null);
  const hostRef = React.useRef(null);

  // cockpit palette — dark is warm phosphor-on-black,
  // light is glass-cockpit "reversionary day mode"
  const P = dark ? {
    bg: '#0b1114',
    panel: '#111820',
    fg: '#e7efef',
    dim: '#6a7882',
    green: '#3dfd6a',
    magenta: '#ff4cf5',
    cyan: '#4cf0ff',
    amber: '#ffb020',
    red: '#ff3838',
    line: 'rgba(120,140,152,0.22)',
    scanline: 'rgba(255,255,255,0.012)',
    completeWash: 'rgba(61,253,106,0.15)',
    deleteWash: 'rgba(255,56,56,0.18)',
    editWash: 'rgba(61,253,106,0.04)',
    toastBg: '#1a1100',
    chipBg: 'rgba(76,240,255,0.02)',
    filterActive: 'rgba(61,253,106,0.08)',
    execFg: '#000',
  } : {
    bg: '#e6e8eb',
    panel: '#dcdfe3',
    fg: '#141820',
    dim: '#707884',
    green: '#0e7a2a',
    magenta: '#9a1a88',
    cyan: '#056978',
    amber: '#a45a1b',
    red: '#b0231c',
    line: 'rgba(20,24,32,0.18)',
    scanline: 'rgba(0,0,0,0.015)',
    completeWash: 'rgba(14,122,42,0.11)',
    deleteWash: 'rgba(176,35,28,0.12)',
    editWash: 'rgba(14,122,42,0.06)',
    toastBg: '#f2e6c4',
    chipBg: 'rgba(5,105,120,0.04)',
    filterActive: 'rgba(14,122,42,0.10)',
    execFg: '#e6e8eb',
  };
  const { bg, panel, fg, dim, green, magenta, cyan, amber, red, line, scanline } = P;

  const pad = density === 'compact' ? 10 : 14;
  const rowH = density === 'compact' ? 30 : 38;
  const fs = density === 'compact' ? 11 : 12;

  const source = filter === 'trash' ? trash : todos;
  const visible = source.filter(t =>
    filter === 'all' || filter === 'trash' ? true :
    filter === 'active' ? !t.done : t.done
  );
  const sorted = [...visible].sort((a, b) => {
    if (filter !== 'trash' && a.done !== b.done) return a.done ? 1 : -1;
    if (sortBy === 'tag') return (a.category || 'zzz').localeCompare(b.category || 'zzz');
    if (sortBy === 'date') return (a.due || Infinity) - (b.due || Infinity);
    if (filter === 'trash') return (b.deletedAt || 0) - (a.deletedAt || 0);
    return (b.created || 0) - (a.created || 0);
  });
  const activeCount = todos.filter(t => !t.done).length;
  const doneCount = todos.length - activeCount;

  // STATUS thresholds — recalculated every render (clock updates every 1s)
  const nowMs = Date.now();
  const twoH = 2 * 3600 * 1000;
  const activeDueTodos = todos.filter(t => !t.done && t.due);
  const overdueCount = activeDueTodos.filter(t => t.due < nowMs).length;
  const cautionCount = activeDueTodos.filter(t => t.due >= nowMs && (t.due - nowMs) < twoH).length;
  const statusLabel = overdueCount > 0 ? 'WARNING' : cautionCount > 0 ? 'CAUTION' : 'NORMAL';
  const statusColor = overdueCount > 0 ? red : cautionCount > 0 ? amber : green;
  const statusBlink = overdueCount > 0 || cautionCount > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const { text, category, due, dueHasTime } = parseInput(input);
    add(text, category, due, dueHasTime);
    setInput('');
  };

  const handleClearAll = () => {
    if (hostRef.current && todos.length > 0) fireConfetti(hostRef.current, {
      colors: [green, magenta, cyan, amber, '#fff'],
    });
    clearAll();
  };

  // live clock for the chrono
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad2 = (n) => String(n).padStart(2, '0');
  const zulu = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}Z`;

  return (
    <div ref={hostRef} style={{
      width: '100%', height: '100%', background: bg, color: fg,
      fontFamily: '"B612 Mono", "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      fontSize: fs, display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      letterSpacing: 0.2,
    }}>
      {/* scanline veil — subtle CRT */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        backgroundImage: `repeating-linear-gradient(0deg, ${scanline} 0 1px, transparent 1px 3px)`,
      }} />

      {/* FMA banner — top */}
      <div style={{
        display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${line}`,
        background: panel,
      }}>
        {/* FLT NR — replaces TSK MODE/MANUAL; editable flight number */}
        <FlightNrBox fs={fs} line={line} green={green} dim={dim} fg={fg} />

        {/* STATUS — NORMAL / CAUTION / WARNING */}
        <FMABox
          label="STATUS"
          value={statusLabel}
          color={statusColor}
          fs={fs} line={line}
          blink={statusBlink}
        />
        <FMABox label="SORT" value={sortBy.toUpperCase()} color={green} fs={fs} line={line} />
        <FMABox label="UTC"  value={zulu} color={fg} fs={fs} line={line} last />
      </div>

      {/* PFD-style status header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', padding: `8px ${pad}px`, gap: 12,
        borderBottom: `1px solid ${line}`,
      }}>
        {/* left: speed-tape-style active counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SpeedTape value={activeCount} label="OPEN" color={green} fs={fs} dim={dim} fg={fg} />
        </div>
        {/* center: title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: fg, fontSize: fs + 1, fontWeight: 700, letterSpacing: 2, whiteSpace: 'nowrap' }}>
            ELECTRONIC CHECKLIST
          </div>
          <div style={{ color: dim, fontSize: fs - 2, letterSpacing: 1.5, marginTop: 2 }}>
            ELEC · REV {(todos.length + trash.length).toString().padStart(4, '0')}
          </div>
        </div>
        {/* right: alt-tape-style done counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <SpeedTape value={doneCount} label="DONE" color={cyan} fs={fs} dim={dim} fg={fg} rtl />
        </div>
      </div>

      {/* MCP-style filter tabs */}
      <div style={{
        display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${line}`,
        background: panel,
      }}>
        {[
          { k: 'all', label: 'ALL' },
          { k: 'active', label: 'ACT' },
          { k: 'done', label: 'DONE' },
          { k: 'trash', label: `TRSH${trash.length ? ` ${trash.length}` : ''}` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            flex: 1, background: filter === f.k ? P.filterActive : 'transparent',
            border: 'none', borderRight: `1px solid ${line}`,
            padding: '6px 0', fontFamily: 'inherit', fontSize: fs - 1,
            color: filter === f.k ? green : dim, letterSpacing: 1.5,
            cursor: 'pointer', fontWeight: filter === f.k ? 700 : 500,
            position: 'relative',
          }}>
            {filter === f.k && <span style={{
              position: 'absolute', left: 4, top: 4, width: 4, height: 4,
              background: green, borderRadius: '50%', boxShadow: `0 0 6px ${green}`,
            }} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* sort bar */}
      {filter !== 'trash' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          borderBottom: `1px solid ${line}`, padding: `3px ${pad}px`, fontSize: fs - 2,
          background: P.chipBg,
        }}>
          <span style={{ color: cyan, letterSpacing: 1.5 }}>ND ◇ SORT</span>
          <div style={{ flex: 1 }} />
          {['created', 'tag', 'date'].map((s, i) => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              background: 'transparent', border: 'none', padding: '0 8px',
              fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 1.5, cursor: 'pointer',
              color: sortBy === s ? green : dim,
              borderLeft: i > 0 ? `1px solid ${line}` : 'none',
            }}>{s.toUpperCase()}</button>
          ))}
        </div>
      )}

      {/* waypoint list */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: bg }}>
        {sorted.length === 0 ? (
          <EmptyDeck filter={filter} dim={dim} green={green} cyan={cyan} fs={fs} />
        ) : sorted.map((t, i) =>
          filter === 'trash' ? (
            <DeckTrashRow key={t.id} todo={t} i={i}
              onRestore={() => restore(t.id)} onForever={() => deleteForever(t.id)}
              rowH={rowH} pad={pad} fs={fs} fg={fg} dim={dim} red={red} cyan={cyan} amber={amber} line={line} />
          ) : (
            <DeckRow key={t.id} todo={t} i={i}
              onToggle={() => toggle(t.id)} onRemove={() => remove(t.id)}
              onSave={(patch) => { edit(t.id, patch); setEditingId(null); }}
              editing={editingId === t.id}
              onStartEdit={() => setEditingId(t.id)}
              onCancelEdit={() => setEditingId(null)}
              rowH={rowH} pad={pad} fs={fs} P={P}
              fg={fg} dim={dim} green={green} magenta={magenta} cyan={cyan}
              amber={amber} red={red} line={line} />
          )
        )}
      </div>

      {/* trash controls */}
      {filter === 'trash' && trash.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `6px ${pad}px`, borderTop: `1px solid ${line}`, background: panel,
          fontSize: fs - 1,
        }}>
          <span style={{ color: amber, letterSpacing: 1.5 }}>⚠ AUTO-PURGE 7D</span>
          <button onClick={emptyTrash} style={{
            background: 'transparent', border: `1px solid ${red}`, color: red,
            padding: '2px 10px', fontFamily: 'inherit', fontSize: fs - 2,
            letterSpacing: 1.5, cursor: 'pointer',
          }}>JETTISON ALL</button>
        </div>
      )}

      {/* CDU-style input */}
      {filter !== 'trash' && (
        <form onSubmit={submit} style={{
          display: 'flex', alignItems: 'stretch',
          borderTop: `1px solid ${line}`, background: panel,
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', padding: `0 10px`,
            color: green, fontSize: fs, letterSpacing: 1.5,
            borderRight: `1px solid ${line}`,
          }}>CDU▶</span>
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder='TASK  #TAG  /FRI  /2026-05-01  :0930AM'
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: fg, fontFamily: 'inherit', fontSize: fs, caretColor: green,
              padding: '0 10px', letterSpacing: 1.2, textTransform: 'uppercase',
            }} />
          <button type="submit" disabled={!input.trim()} style={{
            background: input.trim() ? green : 'transparent',
            color: input.trim() ? P.execFg : dim,
            border: 'none', borderLeft: `1px solid ${line}`,
            padding: '0 14px', fontFamily: 'inherit', fontSize: fs,
            fontWeight: 700, letterSpacing: 1.5, cursor: input.trim() ? 'pointer' : 'default',
          }}>EXEC</button>
        </form>
      )}

      {/* bottom status bar */}
      {filter !== 'trash' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `3px ${pad}px`, borderTop: `1px solid ${line}`, background: bg,
          fontSize: fs - 2, color: dim, letterSpacing: 1.5,
        }}>
          <span>BAT 100% · NAV OK · OFFLINE</span>
          <button onClick={handleClearAll} disabled={!todos.length}
            style={{
              background: 'transparent', border: 'none',
              color: todos.length ? red : dim,
              fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 1.5,
              cursor: todos.length ? 'pointer' : 'default', padding: 0,
              opacity: todos.length ? 1 : 0.3,
            }}>MSTR RESET ⎈</button>
        </div>
      )}

      {/* EICAS-style undo toast (amber caution bar) */}
      {lastDeleted && filter !== 'trash' && (
        <div style={{
          position: 'absolute', left: 8, right: 8, bottom: 56, zIndex: 4,
          background: P.toastBg, border: `1px solid ${amber}`,
          padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10,
          fontSize: fs - 1, color: amber, letterSpacing: 1.2,
        }}>
          <span style={{ fontWeight: 700 }}>⚠ TASK DELETED</span>
          <span style={{ flex: 1, color: fg, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            "{lastDeleted.todo.text.slice(0, 20)}{lastDeleted.todo.text.length > 20 ? '…' : ''}"
          </span>
          <button onClick={undo} style={{
            background: amber, border: 'none', color: P.execFg,
            padding: '1px 10px', fontFamily: 'inherit', fontSize: fs - 2,
            fontWeight: 700, letterSpacing: 1.5, cursor: 'pointer',
          }}>UNDO</button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// FlightNrBox — editable FLT NR (replaces TSK MODE/MANUAL).
// Tap to set flight number (e.g. VN631). Persists to localStorage.
// ───────────────────────────────────────────────────────────
function FlightNrBox({ fs, line, green, dim, fg }) {
  const [nr, setNr] = React.useState(() =>
    localStorage.getItem('flightdeck.fltnr') || '----'
  );
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState('');

  const startEdit = () => {
    setVal(nr === '----' ? '' : nr);
    setEditing(true);
  };
  const commit = () => {
    const v = (val.trim().toUpperCase() || '----').slice(0, 8);
    setNr(v);
    try { localStorage.setItem('flightdeck.fltnr', v); } catch (_) {}
    setEditing(false);
  };

  return (
    <div
      onClick={!editing ? startEdit : undefined}
      title="TAP TO SET FLIGHT NUMBER"
      style={{
        flex: 1, padding: '4px 8px',
        borderRight: `1px solid ${line}`,
        display: 'flex', flexDirection: 'column', gap: 1,
        cursor: editing ? 'default' : 'text',
      }}
    >
      <div style={{ color: green, opacity: 0.55, fontSize: fs - 3, letterSpacing: 1.5 }}>FLT NR</div>
      {editing ? (
        <input
          value={val}
          onChange={e => setVal(e.target.value.toUpperCase())}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: green, fontFamily: 'inherit', fontSize: fs - 1,
            letterSpacing: 1.2, fontWeight: 700, width: '100%',
            caretColor: green, padding: 0,
            borderBottom: `1px dashed ${green}`,
          }}
        />
      ) : (
        <div style={{ color: green, fontSize: fs - 1, letterSpacing: 1.2, fontWeight: 700 }}>
          {nr}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// FMABox — standard FMA cell
// ───────────────────────────────────────────────────────────
function FMABox({ label, value, color, fs, line, last, blink }) {
  return (
    <div style={{
      flex: 1, padding: '4px 8px',
      borderRight: last ? 'none' : `1px solid ${line}`,
      display: 'flex', flexDirection: 'column', gap: 1,
      color: color,
      animation: blink ? 'deck-blink 1s step-end infinite' : 'none',
    }}>
      <div style={{ color: 'currentColor', opacity: 0.55, fontSize: fs - 3, letterSpacing: 1.5 }}>{label}</div>
      <div style={{ color, fontSize: fs - 1, letterSpacing: 1.2, fontWeight: 700 }}>{value}</div>
      <style>{`@keyframes deck-blink { 50% { opacity: 0.35; } }`}</style>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// SpeedTape — airspeed/altitude tape numeric readout
// ───────────────────────────────────────────────────────────
function SpeedTape({ value, label, color, fs, dim, fg, rtl }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: rtl ? 'flex-end' : 'flex-start',
      gap: 1,
    }}>
      <div style={{ color: dim, fontSize: fs - 3, letterSpacing: 1.5 }}>{label}</div>
      <div style={{
        fontSize: fs + 8, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        lineHeight: 1, letterSpacing: 1, textShadow: `0 0 6px ${color}55`,
      }}>{String(value).padStart(3, '0')}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DeckRow — single checklist item with swipe gestures,
// inline edit, time tag display, and wrapping text.
//
// Text wraps naturally to 2nd/3rd lines; tag chips scale up
// proportionally with task text length (longer text = the tags
// that appear on a subsequent line are more prominent).
// ───────────────────────────────────────────────────────────
function DeckRow({ todo, i, onToggle, onRemove, onSave, editing, onStartEdit, onCancelEdit,
  rowH, pad, fs, fg, dim, green, magenta, cyan, amber, red, line, P }) {
  const { dx, bind } = useSwipe({ onLeft: onRemove, onRight: onToggle, disabled: editing });
  const actionSide = dx > 0 ? 'complete' : dx < 0 ? 'delete' : null;

  const urg = dueUrgency(todo.due);
  const dueColor = todo.done ? dim
    : urg === 'late'    ? red
    : urg === 'caution' ? amber
    : urg === 'today'   ? amber
    : urg === 'soon'    ? amber
    : magenta;

  const inputRef = React.useRef(null);
  const [val, setVal] = React.useState(todo.text);
  const [clearTag, setClearTag] = React.useState(false);
  const [clearDue, setClearDue] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setVal(todo.text);
      setClearTag(false);
      setClearDue(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing]);

  const parsedPreview = editing ? parseInput(val) : null;
  const effCat = editing
    ? (clearTag ? null : (parsedPreview.category ?? todo.category ?? null))
    : todo.category;
  const effDue = editing
    ? (clearDue ? null : (parsedPreview.due ?? todo.due ?? null))
    : todo.due;
  const effDueHasTime = editing
    ? (clearDue ? false : (parsedPreview.dueHasTime || (!parsedPreview.due && (todo.dueHasTime || false))))
    : (todo.dueHasTime || false);

  const commit = () => {
    const parsed = parseInput(val);
    const newDue = clearDue ? null : (parsed.due ?? todo.due ?? null);
    const newDueHasTime = clearDue ? false : (parsed.due ? parsed.dueHasTime : (todo.dueHasTime || false));
    onSave({
      text: parsed.text || todo.text,
      category: clearTag ? null : (parsed.category ?? todo.category ?? null),
      due: newDue,
      dueHasTime: newDueHasTime,
    });
  };

  // Tag font size scales with text length — longer entries push tags to their
  // own wrapped line, where slightly larger chips read better.
  const textLen = todo.text.length;
  const tagFs = textLen > 50 ? fs : textLen > 28 ? fs - 1 : fs - 2;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px dashed ${line}` }}>
      {/* swipe reveal layer */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: actionSide === 'complete' ? 'flex-start' : 'flex-end',
        padding: `0 ${pad + 4}px`,
        background: actionSide === 'complete' ? (P?.completeWash || 'rgba(61,253,106,0.15)')
                  : actionSide === 'delete' ? (P?.deleteWash || 'rgba(255,56,56,0.18)') : 'transparent',
        color: actionSide === 'complete' ? green : red,
        fontSize: fs, fontWeight: 700, letterSpacing: 2,
      }}>
        {actionSide === 'complete' && '✓ CAPTURE'}
        {actionSide === 'delete' && 'JETTISON ✗'}
      </div>

      {/* row content */}
      <div {...bind} data-row style={{
        padding: `${editing ? 6 : 4}px ${pad}px`,
        minHeight: rowH,
        transform: `translateX(${dx}px)`,
        transition: dx === 0 ? 'transform .2s' : 'none',
        userSelect: editing ? 'text' : 'none',
        touchAction: 'pan-y',
        background: editing ? (P?.editWash || 'rgba(61,253,106,0.04)') : 'transparent',
        display: 'flex', flexDirection: 'column', gap: 4,
        justifyContent: 'center',
      }}>
        {/* main row — number + LED + text/tags (wrapping) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* waypoint index */}
          <span style={{
            color: dim, width: 22, textAlign: 'right', fontSize: fs - 2,
            letterSpacing: 1, flexShrink: 0, paddingTop: 2,
          }}>{String(i + 1).padStart(2, '0')}</span>

          {/* LED checkbox */}
          <button onClick={onToggle} style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            width: 14, height: 14, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }} title={todo.done ? 'CAPTURED' : 'ACTIVE'}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: todo.done ? green : 'transparent',
              border: `1.5px solid ${todo.done ? green : dim}`,
              boxShadow: todo.done ? `0 0 6px ${green}` : 'none',
            }} />
          </button>

          {/* text + tags — wrapping flex container */}
          <div style={{
            flex: 1, display: 'flex', flexWrap: 'wrap',
            gap: '3px 6px', alignItems: 'baseline',
          }}>
            {/* task text (wraps) */}
            {editing ? (
              <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') onCancelEdit();
                }}
                style={{
                  flex: '1 1 60%', background: 'transparent', border: 'none', outline: 'none',
                  color: fg, fontFamily: 'inherit', fontSize: fs, caretColor: green,
                  letterSpacing: 1.2, textTransform: 'uppercase',
                  borderBottom: `1px dashed ${green}`,
                }} />
            ) : (
              <span
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => { e.stopPropagation(); if (!todo.done) onStartEdit(); }}
                style={{
                  flex: '1 1 55%', cursor: 'text',
                  color: todo.done ? dim : fg,
                  textDecoration: todo.done ? 'line-through' : 'none',
                  textDecorationColor: dim,
                  textTransform: 'uppercase', letterSpacing: 1.2,
                  wordBreak: 'break-word', lineHeight: 1.4,
                }}>{todo.text}</span>
            )}

            {/* category chip — cyan */}
            {effCat && !editing && (
              <span style={{
                color: cyan, fontSize: tagFs, letterSpacing: 1.2,
                border: `1px solid ${cyan}55`, padding: '0 5px',
                opacity: todo.done ? 0.5 : 1, flexShrink: 0,
                lineHeight: 1.5,
              }}>{effCat.toUpperCase()}</span>
            )}

            {/* due tag — magenta/amber/red; shows time if dueHasTime */}
            {effDue && !editing && (
              <span style={{
                color: dueColor, fontSize: tagFs, letterSpacing: 1,
                fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                textShadow: !todo.done ? `0 0 4px ${dueColor}55` : 'none',
                flexShrink: 0, lineHeight: 1.5,
              }}>▶{formatDue(effDue, effDueHasTime).toUpperCase()}</span>
            )}
          </div>
        </div>

        {/* edit toolbar */}
        {editing && (
          <div style={{ display: 'flex', gap: 6, paddingLeft: 34, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: dim, fontSize: fs - 3, letterSpacing: 1.5 }}>
              #TAG · /FRI · /2026-05-01 · :0930AM
            </span>
            <div style={{ flex: 1 }} />
            {effCat && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setClearTag(true)}
                style={{
                  background: 'transparent', border: `1px solid ${cyan}`, color: cyan,
                  padding: '0 6px', fontFamily: 'inherit', fontSize: fs - 3,
                  letterSpacing: 1.2, cursor: 'pointer',
                }}>{effCat.toUpperCase()} ✗</button>
            )}
            {effDue && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setClearDue(true)}
                style={{
                  background: 'transparent', border: `1px solid ${magenta}`, color: magenta,
                  padding: '0 6px', fontFamily: 'inherit', fontSize: fs - 3,
                  letterSpacing: 1.2, cursor: 'pointer',
                }}>{formatDue(effDue, effDueHasTime).toUpperCase()} ✗</button>
            )}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit}
              style={{
                background: green, border: 'none', color: P?.execFg || '#000',
                padding: '1px 10px', fontFamily: 'inherit', fontSize: fs - 3,
                fontWeight: 700, letterSpacing: 1.5, cursor: 'pointer',
              }}>EXEC</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DeckTrashRow — trashed item with restore/purge controls
// ───────────────────────────────────────────────────────────
function DeckTrashRow({ todo, i, onRestore, onForever, rowH, pad, fs, fg, dim, red, cyan, amber, line }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: `0 ${pad}px`, minHeight: rowH,
      borderBottom: `1px dashed ${line}`, opacity: 0.75,
    }}>
      <span style={{ color: dim, width: 22, textAlign: 'right', fontSize: fs - 2 }}>
        {String(i + 1).padStart(2, '0')}
      </span>
      <span style={{
        width: 10, height: 10, border: `1.5px dashed ${dim}`, borderRadius: '50%',
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1, color: dim, textDecoration: 'line-through', textDecorationColor: dim,
        textTransform: 'uppercase', letterSpacing: 1.2,
        wordBreak: 'break-word', lineHeight: 1.4,
      }}>
        {todo.category && <span style={{ color: cyan, opacity: 0.5, marginRight: 6 }}>{todo.category.toUpperCase()}</span>}
        {todo.text}
      </span>
      <span style={{ color: amber, fontSize: fs - 2, letterSpacing: 1.2, flexShrink: 0 }}>
        T-{formatTrashExpiry(todo.deletedAt).toUpperCase()}
      </span>
      <button onClick={onRestore} title="RESTORE" style={{
        background: 'transparent', border: `1px solid ${dim}`, color: fg,
        padding: '1px 6px', fontFamily: 'inherit', fontSize: fs - 3,
        letterSpacing: 1.2, cursor: 'pointer',
      }}>RCVR</button>
      <button onClick={onForever} title="DELETE FOREVER" style={{
        background: 'transparent', border: `1px solid ${red}`, color: red,
        padding: '1px 6px', fontFamily: 'inherit', fontSize: fs - 3,
        letterSpacing: 1.2, cursor: 'pointer',
      }}>PURGE</button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// EmptyDeck — empty state messaging
// ───────────────────────────────────────────────────────────
function EmptyDeck({ filter, dim, green, cyan, fs }) {
  const msgs = {
    all:    { big: 'FLIGHT PLAN EMPTY',    small: 'NO WAYPOINTS ENTERED · CDU READY' },
    active: { big: 'ALL TASKS CAPTURED',   small: 'STANDBY · NOMINAL' },
    done:   { big: 'NO CAPTURES LOGGED',   small: 'BEGIN MISSION TO POPULATE HISTORY' },
    trash:  { big: 'JETTISON BAY CLEAR',   small: 'NO TRASHED ITEMS · AUTO-PURGE 7D' },
  };
  const m = msgs[filter] || msgs.all;
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', fontFamily: 'inherit' }}>
      <div style={{ color: green, fontSize: fs + 1, letterSpacing: 3, fontWeight: 700 }}>{m.big}</div>
      <div style={{ color: dim, fontSize: fs - 2, letterSpacing: 1.5, marginTop: 6 }}>{m.small}</div>
    </div>
  );
}

Object.assign(window, { FlightDeckVariant });
