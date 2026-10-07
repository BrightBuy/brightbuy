import React, { useEffect, useState } from 'react';
import { quantity } from '../utils/interactions.js';

export function QuantityInput({ value, disabled, onCommit, label = 'Quantity' }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const next = quantity(draft);
    if (next === null) { setDraft(String(value)); return; }
    if (next !== value) onCommit(next);
  }
  return <input type="number" min="1" max="99" step="1" aria-label={label}
    value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)}
    onBlur={commit} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    }} style={{ width: '70px' }} />;
}
