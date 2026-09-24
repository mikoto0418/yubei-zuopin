// 点餐页：选桌 → 分类浏览菜单 → 加入购物车 → 提交订单（支持逐项备注与整单备注）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, Search, ShoppingCart, Trash2, UtensilsCrossed } from 'lucide-react';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Button, Card, Field, Input, PageHeader, Segmented, Tag, Textarea,
} from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { formatMoney } from '../lib/constants.js';

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tableId, setTableId] = useState(params.get('table') || '');
  const [activeCat, setActiveCat] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');
  const [customer, setCustomer] = useState('');
  const [people, setPeople] = useState(2);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, c, m] = await Promise.all([
        api.list('tables', { pageSize: 100 }),
        api.list('categories', { pageSize: 100 }),
        api.list('menu-items', { pageSize: 100 }),
      ]);
      setTables(t.list);
      setCategories(c.list);
      setItems(m.list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleItems = useMemo(() => {
    let list = items.filter((i) => i.available !== 0);
    if (activeCat !== 'all') list = list.filter((i) => String(i.category_id) === String(activeCat));
    const kw = keyword.trim();
    if (kw) list = list.filter((i) => i.name.includes(kw) || (i.description || '').includes(kw));
    return list;
  }, [items, activeCat, keyword]);

  const total = useMemo(
    () => cart.reduce((s, c) => s + c.price * c.quantity, 0),
    [cart],
  );

  const selectedTable = tables.find((t) => String(t.id) === String(tableId));

  function addToCart(item) {
    setCart((c) => {
      const found = c.find((x) => x.menu_item_id === item.id);
      if (found) return c.map((x) => (x.menu_item_id === item.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, {
        menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, note: '',
        station_id: item.station_id, prep_minutes: item.prep_minutes,
      }];
    });
  }

  function changeQty(id, delta) {
    setCart((c) => c
      .map((x) => (x.menu_item_id === id ? { ...x, quantity: x.quantity + delta } : x))
      .filter((x) => x.quantity > 0));
  }

  function setItemNote(id, note) {
    setCart((c) => c.map((x) => (x.menu_item_id === id ? { ...x, note } : x)));
  }

  async function submit() {
    if (!cart.length) { setNotice('请先添加菜品'); return; }
    setBusy(true);
    setNotice('');
    try {
      const order = await api.createOrder({
        table_id: tableId || null,
        customer_name: customer,
        people_count: Number(people) || 2,
        note: orderNote,
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, note: c.note })),
      });
      navigate(`/orders?focus=${order.id}`);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="点餐"
        subtitle="先选桌位，再从菜单加入购物车；下单后需要后厨接单才会开始制作"
        actions={
          <>
            <Tag color={selectedTable ? 'var(--orange)' : 'var(--label-secondary)'}
              bg={selectedTable ? 'rgba(255,149,0,0.12)' : 'var(--fill-secondary)'}>
              {selectedTable ? `桌 ${selectedTable.table_no}` : '未选桌（打包）'}
            </Tag>
            <Tag>购物车 {cart.length} 项</Tag>
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {loading && <CardSkeleton count={6} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
          {/* 左：选桌 + 菜单 */}
          <div className="space-y-4">
            {/* 选桌 */}
            <Card>
              <p className="apple-headline mb-3">选择桌位</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTableId('')}
                  className="apple-tag"
                  style={{
                    cursor: 'pointer', border: 'none', height: 32,
                    background: !tableId ? 'var(--tint-soft)' : 'var(--fill-secondary)',
                    color: !tableId ? 'var(--tint)' : 'var(--label-secondary)',
                  }}
                >
                  打包带走
                </button>
                {tables.map((t) => {
                  const disabled = t.status === 'occupied' && String(t.id) !== String(tableId);
                  const active = String(t.id) === String(tableId);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTableId(String(t.id))}
                      className="apple-tag"
                      title={disabled ? '该桌已有进行中订单' : `${t.zone} · ${t.seats} 人`}
                      style={{
                        cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', height: 32,
                        opacity: disabled ? 0.4 : 1,
                        background: active ? 'var(--tint-soft)' : 'var(--fill-secondary)',
                        color: active ? 'var(--tint)' : 'var(--label-secondary)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {t.table_no}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* 菜单 */}
            <Card>
              <div className="flex items-center justify-between gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
                <Segmented
                  value={activeCat}
                  onChange={setActiveCat}
                  options={[{ value: 'all', label: '全部' },
                    ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
                />
                <div className="relative" style={{ minWidth: 200 }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--label-tertiary)' }} />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索菜品"
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </div>

              {visibleItems.length === 0 ? (
                <EmptyState icon={UtensilsCrossed} title="没有匹配的菜品" description="试试其它分类或关键词。" />
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {visibleItems.map((it) => (
                    <div key={it.id} className="kf-card kf-fade-up" style={{ padding: 0, overflow: 'hidden' }}>
                      {it.image_url && (
                        <img
                          src={it.image_url}
                          alt={it.name}
                          loading="lazy"
                          style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <div style={{ padding: 12 }}>
                        <p className="apple-headline truncate" style={{ fontSize: 15 }}>{it.name}</p>
                        <p className="apple-caption apple-secondary mt-0.5 truncate">
                          {it.cooking_method || '—'} · 约 {it.prep_minutes} 分钟
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="apple-subhead" style={{ color: 'var(--tint)', fontWeight: 600 }}>
                            {formatMoney(it.price)}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => addToCart(it)}>
                            <Plus size={14} /> 加入
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* 右：购物车 */}
          <Card style={{ position: 'sticky', top: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart size={17} style={{ color: 'var(--tint)' }} />
              <p className="apple-headline">购物车</p>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="apple-caption ml-auto"
                  style={{ color: 'var(--red)', background: 'none', border: 'none' }}
                  onClick={() => setCart([])}
                >
                  清空
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="apple-footnote apple-tertiary text-center" style={{ padding: '24px 0' }}>
                还没有添加菜品
              </p>
            ) : (
              <div className="space-y-3 kf-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {cart.map((c) => (
                  <div key={c.menu_item_id} style={{ borderBottom: '1px solid var(--separator)', paddingBottom: 10 }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="apple-footnote truncate" style={{ fontWeight: 600 }}>{c.name}</p>
                      <span className="apple-footnote" style={{ color: 'var(--tint)' }}>
                        {formatMoney(c.price * c.quantity)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button type="button" className="flex items-center justify-center"
                        style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'var(--fill-secondary)', border: 'none', color: 'var(--label)' }}
                        onClick={() => changeQty(c.menu_item_id, -1)}>
                        <Minus size={13} />
                      </button>
                      <span className="apple-footnote" style={{ minWidth: 20, textAlign: 'center' }}>{c.quantity}</span>
                      <button type="button" className="flex items-center justify-center"
                        style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'var(--fill-secondary)', border: 'none', color: 'var(--label)' }}
                        onClick={() => changeQty(c.menu_item_id, 1)}>
                        <Plus size={13} />
                      </button>
                      <input
                        className="apple-input"
                        style={{ height: 24, fontSize: 12, flex: 1, minWidth: 0 }}
                        placeholder="备注：少辣"
                        value={c.note}
                        onChange={(e) => setItemNote(c.menu_item_id, e.target.value)}
                      />
                      <button type="button" style={{ background: 'none', border: 'none', color: 'var(--label-tertiary)' }}
                        onClick={() => changeQty(c.menu_item_id, -c.quantity)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 mt-4" style={{ borderTop: '1px solid var(--separator)', paddingTop: 14 }}>
              <div className="flex gap-2">
                <Field label="客人称呼">
                  <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="如 王先生" />
                </Field>
                <Field label="人数">
                  <Input type="number" min="1" value={people} onChange={(e) => setPeople(e.target.value)} style={{ width: 80 }} />
                </Field>
              </div>
              <Field label="整单备注">
                <Textarea rows={2} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="如：先上凉菜" />
              </Field>
            </div>

            <div className="flex items-center justify-between mt-4" style={{ borderTop: '1px solid var(--separator)', paddingTop: 12 }}>
              <span className="apple-subhead apple-secondary">合计</span>
              <span className="apple-title2" style={{ color: 'var(--tint)' }}>{formatMoney(total)}</span>
            </div>

            <Button className="w-full mt-3" size="lg" disabled={busy || !cart.length} onClick={submit}>
              {busy ? '提交中…' : '提交订单'}
            </Button>
            <p className="apple-caption apple-tertiary mt-2 text-center">
              提交后订单进入「待接单」，需后厨接单才会开始制作
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
