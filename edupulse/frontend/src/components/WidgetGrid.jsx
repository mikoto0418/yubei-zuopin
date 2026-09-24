import { useCallback, useEffect, useRef, useState } from "react";

const LAYOUT_KEY = "edupulse_dashboard_layout";

/** 从 localStorage 读取已保存的 widget 顺序（容错：损坏则回退默认） */
export function loadLayout(defaultOrder) {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultOrder;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return defaultOrder;
    // 过滤掉已不存在的 widget，并补上新增的 widget
    const known = saved.filter((id) => defaultOrder.includes(id));
    const missing = defaultOrder.filter((id) => !known.includes(id));
    return [...known, ...missing];
  } catch (_) {
    return defaultOrder;
  }
}

/** 保存 widget 顺序 */
export function saveLayout(order) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(order));
  } catch (_) { /* 隐私模式等场景静默降级 */ }
}

/**
 * 可拖拽 Widget 网格（Grafana / 手机桌面式）
 * - CSS Grid 布局：每个 widget 声明自己的 span（列宽 / 行高）
 * - HTML5 原生拖放重排：拖起卡片 → 其他卡片让位 → 落下即固化顺序
 * - 顺序写入 localStorage(key: edupulse_dashboard_layout)
 *
 * props:
 *   items   [{ id, span, rowSpan, node }]
 *   editing 是否处于「编辑布局」态（关闭时禁用拖拽手柄）
 */
export default function WidgetGrid({ items, editing = false }) {
  const [order, setOrder] = useState(() => loadLayout(items.map((i) => i.id)));
  const dragId = useRef(null);
  const [overId, setOverId] = useState(null);
  const [dragging, setDragging] = useState(false);

  // 外部 widget 集合变化（如管理员项出现）时，重新对齐顺序
  useEffect(() => {
    setOrder((prev) => {
      const ids = items.map((i) => i.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [items]);

  const persist = useCallback((next) => {
    setOrder(next);
    saveLayout(next);
  }, []);

  function onDragStart(e, id) {
    if (!editing) return;
    dragId.current = id;
    setDragging(true);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch (_) {}
  }

  function onDragOver(e, id) {
    if (!editing || !dragId.current || dragId.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverId(id);
  }

  function onDrop(e, id) {
    if (!editing) return;
    e.preventDefault();
    const from = dragId.current;
    if (!from || from === id) return;
    const next = [...order];
    const fi = next.indexOf(from);
    const ti = next.indexOf(id);
    if (fi < 0 || ti < 0) return;
    next.splice(fi, 1);
    next.splice(ti, 0, from);
    persist(next);
    dragId.current = null;
    setOverId(null);
    setDragging(false);
  }

  function onDragEnd() {
    dragId.current = null;
    setOverId(null);
    setDragging(false);
  }

  function resetLayout() {
    persist(items.map((i) => i.id));
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);

  return (
    <div className={"widget-grid" + (dragging ? " is-dragging" : "")}>
      {ordered.map((it, i) => (
        <section
          key={it.id}
          className={
            "widget" +
            (it.span ? ` span-${it.span}` : "") +
            (it.rowSpan ? ` row-${it.rowSpan}` : "") +
            (editing ? " is-editable" : "") +
            (overId === it.id ? " is-over" : "") +
            (dragId.current === it.id ? " is-dragged" : "")
          }
          style={{ "--w-index": i }}
          draggable={editing}
          onDragStart={(e) => onDragStart(e, it.id)}
          onDragOver={(e) => onDragOver(e, it.id)}
          onDragLeave={() => setOverId((cur) => (cur === it.id ? null : cur))}
          onDrop={(e) => onDrop(e, it.id)}
          onDragEnd={onDragEnd}
        >
          {editing && (
            <div className="widget-handle" title="按住拖动以重排">
              <span className="dots" />
              <span className="widget-name">{it.name || it.id}</span>
            </div>
          )}
          <div className="widget-body">{it.node}</div>
        </section>
      ))}

      <button type="button" className="layout-reset" onClick={resetLayout} title="恢复默认布局">
        恢复默认布局
      </button>
    </div>
  );
}
