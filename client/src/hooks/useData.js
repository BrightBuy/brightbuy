import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const loadingState = { loading: true, data: null, error: '' };

export function useData(path) {
  const [state, setState] = useState(loadingState);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ ...loadingState, path, version });
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, version, loading: false, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ path, version, loading: false, data: null, error: error.message });
      });
    // Navigation cancels obsolete requests instead of letting them update a new page.
    return () => controller.abort();
  }, [path, version]);

  // Never render the previous order's data under a newly selected order ID,
  // including the render before React runs the effect for the new path.
  const current = state.path === path && state.version === version ? state : loadingState;
  return { ...current, reload };
}
