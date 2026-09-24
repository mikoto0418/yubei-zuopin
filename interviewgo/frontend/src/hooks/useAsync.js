import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 统一异步数据加载：返回 { data, loading, error, reload, setData }。
 * 所有页面用它保证「加载 / 空 / 错误 / 无权限」四态一致，且 403 不静默失败。
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const aliveRef = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (aliveRef.current) setData(result);
      return result;
    } catch (e) {
      if (aliveRef.current) setError(e);
      return null;
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}

export default useAsync;
