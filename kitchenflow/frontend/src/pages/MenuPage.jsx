// 菜单管理：分类 + 菜品 CRUD，含 AI 销量预测（写入 predicted_demand）与备料清单。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Pencil, Plus, RefreshCw, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Button, Card, Field, Input, Modal, PageHeader, Select, Segmented, Tag, Textarea,
} from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { formatMoney } from '../lib/constants.js';

const EMPTY_ITEM = {
  name: '', category_id: '', station_id: '', price: '', image_url: '',
  description: '', cooking_method: '', prep_minutes: 15, available: 1,
};

export default function MenuPage() {
  const { user, isAdmin } = useAuth();
  const canWrite = ['admin', 'chef'].includes(user?.role);
  const [state, setState] = useState({ loading: true, error: '' });
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stations, setStations] = useState([]);
  const [activeCat, setActiveCat] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiSource, setAiSource] = useState('');
  const [aiBusy, setAiBusy] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const [m, c, s] = await Promise.all([
        api.list('menu-items', { pageSize: 100 }),
        api.list('categories', { pageSize: 100 }),
        api.list('stations', { pageSize: 100 }),
      ]);
      setItems(m.list);
      setCategories(c.list);
      setStations(s.list);
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const stationName = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.name])), [stations]);

  const visible = useMemo(() => {
    let list = items;
    if (activeCat !== 'all') list = list.filter((i) => String(i.category_id) === activeCat);
    const kw = keyword.trim();
    if (kw) list = list.filter((i) => i.name.includes(kw));
    return list;
  }, [items, activeCat, keyword]);

  function openCreate() {
    setEditing({ id: null });
    setForm({ ...EMPTY_ITEM, category_id: categories[0]?.id || '', station_id: stations[0]?.id || '' });
  }

  function openEdit(it) {
    setEditing(it);
    setForm({
      name: it.name, category_id: it.category_id, station_id: it.station_id || '',
      price: it.price, image_url: it.image_url || '', description: it.description || '',
      cooking_method: it.cooking_method || '', prep_minutes: it.prep_minutes, available: it.available,
    });
  }

  async function save() {
    setBusy(true);
    setNotice('');
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      prep_minutes: Number(form.prep_minutes) || 15,
      category_id: Number(form.category_id),
      station_id: form.station_id ? Number(form.station_id) : null,
      available: Number(form.available),
      restaurant_id: 1,
    };
    try {
      if (editing.id) await api.update('menu-items', editing.id, payload);
      else await api.create('menu-items', payload);
      setEditing(null);
      await load();
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }

  async function remove(it) {
    if (!window.confirm(`确认删除「${it.name}」？`)) return;
    setNotice('');
    try {
      await api.remove('menu-items', it.id);
      await load();
    } catch (e) { setNotice(e.message); }
  }

  // AI 销量预测：结果会写入 menu_items.predicted_demand，页面标签随即变化。
  async function runForecast() {
    setAiBusy('forecast');
    setNotice('');
    try {
      const r = await api.forecastDemand();
      setAiText(r.text);
      setAiSource(r.source);
      await load();
    } catch (e) { setNotice(e.message); } finally { setAiBusy(''); }
  }

  // AI 备料清单：消费预测结果，按档口分组。
  async function runPrepList() {
    setAiBusy('prep');
    setNotice('');
    try {
      const r = await api.prepList();
      setAiText(r.text);
      setAiSource(r.source);
    } catch (e) { setNotice(e.message); } finally { setAiBusy(''); }
  }

  return (
    <>
      <PageHeader
        title="菜单管理"
        subtitle="分类与菜品维护；AI 预测结果会写入菜品的「预测需求」字段"
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={aiBusy === 'forecast'} onClick={runForecast}>
              <TrendingUp size={14} /> {aiBusy === 'forecast' ? '预测中…' : 'AI 销量预测'}
            </Button>
            <Button variant="secondary" size="sm" disabled={aiBusy === 'prep'} onClick={runPrepList}>
              <Sparkles size={14} /> {aiBusy === 'prep' ? '生成中…' : 'AI 备料清单'}
            </Button>
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>
            {canWrite && <Button size="sm" onClick={openCreate}><Plus size={14} /> 新增菜品</Button>}
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}
      {aiText && (
        <div className="mb-4">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="apple-headline">AI 输出</p>
              <Tag color={aiSource === 'llm' ? 'var(--purple)' : 'var(--blue)'}
                bg={aiSource === 'llm' ? 'rgba(175,82,222,0.12)' : 'rgba(0,122,255,0.12)'}>
                {aiSource === 'llm' ? '大模型' : '本地规则'}
              </Tag>
            </div>
            <pre className="apple-footnote kf-scroll" style={{
              whiteSpace: 'pre-wrap', margin: 0, maxHeight: 200, overflowY: 'auto',
              color: 'var(--label-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            }}>{aiText}</pre>
          </Card>
        </div>
      )}

      {state.loading && <CardSkeleton count={6} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}

      {!state.loading && !state.error && (
        <>
          <div className="flex items-center justify-between gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
            <Segmented
              value={activeCat}
              onChange={setActiveCat}
              options={[{ value: 'all', label: `全部 ${items.length}` },
                ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索菜品名称"
              style={{ maxWidth: 240 }}
            />
          </div>

          {visible.length === 0 ? (
            <div className="kf-card">
              <EmptyState icon={BookOpen} title="该分类下暂无菜品"
                action={canWrite ? <Button onClick={openCreate}><Plus size={15} /> 新增菜品</Button> : null} />
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {visible.map((it) => (
                <Card key={it.id} className="kf-fade-up" padded={false} style={{ overflow: 'hidden' }}>
                  {it.image_url && (
                    <img src={it.image_url} alt={it.name} loading="lazy"
                      style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <div style={{ padding: 14 }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="apple-headline">{it.name}</p>
                      <span className="apple-subhead" style={{ color: 'var(--tint)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatMoney(it.price)}
                      </span>
                    </div>
                    <p className="apple-caption apple-secondary mt-1 line-clamp-2" style={{ minHeight: 32 }}>
                      {it.description || '暂无描述'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Tag>{catName[it.category_id] || '未分类'}</Tag>
                      <Tag>{stationName[it.station_id] || '未分配档口'}</Tag>
                      <Tag>{it.cooking_method || '—'}</Tag>
                      <Tag>{it.prep_minutes} 分钟</Tag>
                      {it.available === 0 && <Tag color="var(--red)" bg="rgba(255,59,48,0.12)">已下架</Tag>}
                      {it.predicted_demand > 0 && (
                        <Tag color="var(--orange)" bg="rgba(255,149,0,0.14)">
                          <TrendingUp size={12} /> 预测 {it.predicted_demand}
                        </Tag>
                      )}
                    </div>

                    {canWrite && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(it)}>
                          <Pencil size={13} /> 编辑
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="plain" onClick={() => remove(it)}>
                            <Trash2 size={13} /> 删除
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `编辑菜品：${editing.name}` : '新增菜品'}
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
            <Button disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="名称" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="分类" required>
              <Select
                value={String(form.category_id || '')}
                onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="请选择"
              />
            </Field>
            <Field label="所属档口">
              <Select
                value={String(form.station_id || '')}
                onChange={(v) => setForm((f) => ({ ...f, station_id: v }))}
                options={stations.map((s) => ({ value: String(s.id), label: s.name }))}
                placeholder="不分配"
              />
            </Field>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="价格（元）" required>
              <Input type="number" step="0.5" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </Field>
            <Field label="预计制作时长（分钟）">
              <Input type="number" value={form.prep_minutes} onChange={(e) => setForm((f) => ({ ...f, prep_minutes: e.target.value }))} />
            </Field>
          </div>
          <Field label="做法">
            <Input value={form.cooking_method} onChange={(e) => setForm((f) => ({ ...f, cooking_method: e.target.value }))} placeholder="爆炒 / 慢炖 / 凉拌" />
          </Field>
          <Field label="图片 URL">
            <Input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" />
          </Field>
          <Field label="描述">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="上架状态">
            <Select
              value={String(form.available)}
              onChange={(v) => setForm((f) => ({ ...f, available: v }))}
              options={[{ value: '1', label: '在售' }, { value: '0', label: '下架' }]}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
