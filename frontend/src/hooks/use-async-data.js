import { useEffect, useRef, useState, useCallback } from 'react';

export function useAsyncData(fetcher, deps = [], initialData = null) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    return Promise.resolve().then(fetcher).then((result) => {
      if (id === requestId.current) {
        setData(result);
        setLoading(false);
      }
      return result;
    }).catch((err) => {
      if (id === requestId.current) {
        setError(err);
        setLoading(false);
      }
      throw err;
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload().catch(() => undefined);
    return () => { requestId.current += 1; };
  }, [reload]);

  return { data, error, loading, reload };
}
