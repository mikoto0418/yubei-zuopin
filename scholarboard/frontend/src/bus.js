// 极简事件总线：用于「命令面板 → 各功能页」的跨组件意图投递。
// 不引入第三方依赖；Vue 3 下作为轻量 message bus 使用。

const handlers = new Map();

export function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  const set = handlers.get(evt);
  if (set) set.delete(fn);
}

// 返回是否至少有一个订阅者消费了该事件
export function emit(evt, payload) {
  const set = handlers.get(evt);
  if (!set || set.size === 0) return false;
  set.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error('[bus]', evt, e); }
  });
  return true;
}

// 目标页面是懒加载路由，可能尚未挂载：短轮询重投，直到被消费或超时。
export function emitRetry(evt, payload, tries = 25) {
  if (emit(evt, payload)) return;
  if (tries <= 0) return;
  setTimeout(() => emitRetry(evt, payload, tries - 1), 80);
}
