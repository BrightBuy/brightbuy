import React from 'react';

// Shared loading/error/empty request handling keeps each page focused on its data.
export function DataState({ state, children }) {
  if (state.loading) return <p role="status">Loading…</p>;
  if (state.error)
    return (
      <div role="alert" className="error">
        {state.error} <button onClick={state.reload}>Try again</button>
      </div>
    );
  return children(state.data);
}
