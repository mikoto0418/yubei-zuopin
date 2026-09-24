// 网点管理：网点 CRUD + 覆盖范围 + 吞吐量。
// 每个网点都有经纬度——这是运单时间轴与地图能定位的基础数据。
import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { api } from '../api'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Empty, ErrorBlock, Field, Loading, Modal, PageHeader,
  Pagination, SelectField, Stat, Tag, TextArea, TextField,
} from '../components/ui'
import { PlusIcon, RefreshIcon, WarehouseIcon } from '../components/Icons'
import { num } from '../constants'

const EMPTY = {
  name: '', code: '', province: '', city: '', district: '', address: '',
  lat: '', lng: '', coverage: '', manager: '', phone: '', capacity: '', status: 'active',
}

export default function WarehousesPage() {
  const [data, setData] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  const [modal, setModal] = useState(null) // { mode: 'create'|'edit', form }
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.list('warehouses', { page, pageSize: 12, q: q.trim(), city: cityFilter }),
      api.overview().catch(() => null),
    ])
      .then(([d, o]) => { setData(d); setOverview(o) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, q, cityFilter])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const list = data?.list || []

  // 城市选项从当前页数据里提取（网点数量不多，够用）
  const cities = Array.from(new Set(list.map((w) => w.city).filter(Boolean)))

  function openCreate() {
    setFormError('')
    setModal({ mode: 'create', form: { ...EMPTY } })
  }

  function openEdit(w) {
    setFormError('')
    setModal({
      mode: 'edit',
      form: {
        ...EMPTY,
        ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, w[k] ?? EMPTY[k]])),
        lat: String(w.lat ?? ''),
        lng: String(w.lng ?? ''),
        capacity: String(w.capacity ?? ''),
      },
    })
  }

  async function save() {
    const f = modal.form
    if (!String(f.name || '').trim()) {
      setFormError('请填写网点名称')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const body = {
        ...f,
        lat: Number(f.lat) || 0,
        lng: Number(f.lng) || 0,
        capacity: Number(f.capacity) || 0,
      }
      if (modal.mode === 'create') await api.create('warehouses', body)
      else await api.update('warehouses', modal.form.id, body)
      setModal(null)
      load()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await api.remove('warehouses', confirmDelete.id)
      setConfirmDelete(null)
      load()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const rank = overview?.warehouse_rank || []

  return (
    <Page>
      <PageHeader
        title="网点管理"
        sub="维护分拨中心与末端网点 · 网点经纬度是运单时间轴与地图定位的基础"
        actions={
          <>
            <Btn variant="secondary" onClick={load}>
              <RefreshIcon size={15} />
              刷新
            </Btn>
            <Btn variant="primary" onClick={openCreate}>
              <PlusIcon size={15} />
              新建网点
            </Btn>
          </>
        }
      />

      {/* 概览统计 */}
      <Flex gap="12px" mb="18px" wrap="wrap">
        <Box flex="1 1 160px"><Stat label="网点总数" value={overview?.warehouses_total ?? data?.total ?? 0} hint="含分拨中心与末端网点" /></Box>
        <Box flex="1 1 160px"><Stat label="覆盖城市" value={new Set((rank.length ? rank : list).map((w) => w.city).filter(Boolean)).size} color="#007AFF" hint="按网点所在城市去重" /></Box>
        <Box flex="1 1 160px"><Stat label="总吞吐节点" value={(rank.reduce((s, w) => s + Number(w.throughput || 0), 0))} color="#5856D6" hint="经过各网点的中转节点数" /></Box>
        <Box flex="1 1 160px"><Stat label="异常节点" value={(rank.reduce((s, w) => s + Number(w.exception_count || w.exceptions || 0), 0))} color="#FF3B30" hint="各网点产生的异常节点" /></Box>
      </Flex>

      {/* 吞吐排行 */}
      {rank.length ? (
        <Card p="18px" mb="18px">
          <Text fontSize="17px" fontWeight={600} color="label" mb="12px">网点吞吐排行</Text>
          <Flex direction="column" gap="4px">
            {rank.slice(0, 8).map((w) => {
              const max = Math.max(1, ...rank.map((x) => Number(x.throughput) || 0))
              return (
                <Flex key={w.id} className="lt-rank-row">
                  <Box className="lt-rank-name" title={w.name}>{w.name}</Box>
                  <Box className="lt-rank-track">
                    <Box className="lt-rank-fill" style={{ width: `${((Number(w.throughput) || 0) / max) * 100}%` }} />
                  </Box>
                  <Box className="lt-rank-value">{w.throughput}</Box>
                </Flex>
              )
            })}
          </Flex>
        </Card>
      ) : null}

      {/* 筛选 */}
      <Card p="16px" mb="16px">
        <Flex gap="10px" wrap="wrap" align="flex-end">
          <Box flex="1 1 240px">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
              placeholder="搜索网点名称 / 编号 / 地址 / 负责人"
              aria-label="搜索网点"
              style={{
                width: '100%', height: '38px', padding: '0 12px', fontSize: '14px',
                background: 'var(--fill-secondary)', border: '2px solid transparent',
                borderRadius: '12px', color: 'var(--label)', outline: 'none',
              }}
            />
          </Box>
          <Box w="170px">
            <SelectField
              value={cityFilter}
              onChange={(v) => { setCityFilter(v); setPage(1) }}
              placeholder="全部城市"
              options={cities}
            />
          </Box>
          {(q || cityFilter) ? (
            <Btn variant="plain" size="sm" onClick={() => { setQ(''); setCityFilter(''); setPage(1) }}>清空</Btn>
          ) : null}
        </Flex>
      </Card>

      {loading ? (
        <Loading rows={4} height="120px" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : !list.length ? (
        <Empty
          icon={<WarehouseIcon size={24} />}
          title={q || cityFilter ? '没有匹配的网点' : '还没有网点'}
          description={q || cityFilter ? '换个关键词或清空筛选条件试试。' : '新建第一个网点后，运单就能关联到它。'}
          action={q || cityFilter ? '清空筛选' : '新建网点'}
          onAction={q || cityFilter ? () => { setQ(''); setCityFilter('') } : openCreate}
        />
      ) : (
        <>
          <Flex direction="column" gap="12px">
            {list.map((w) => (
              <Card key={w.id} p="16px">
                <Flex align="flex-start" gap="12px" wrap="wrap">
                  <Flex boxSize="36px" flex="0 0 36px" borderRadius="10px" bg="var(--tint-soft)" color="brand.600" align="center" justify="center">
                    <WarehouseIcon size={18} />
                  </Flex>

                  <Box flex="1" minW="0">
                    <Flex align="center" gap="8px" wrap="wrap" mb="6px">
                      <Text fontSize="15px" fontWeight={700} color="label">{w.name}</Text>
                      {w.code ? <Tag>{w.code}</Tag> : null}
                      <Tag color={w.status === 'active' ? '#34C759' : '#8E8E93'}>
                        {w.status === 'active' ? '运营中' : '已停用'}
                      </Tag>
                      {w.capacity ? <Tag>容量 {w.capacity}</Tag> : null}
                    </Flex>

                    <Text fontSize="13px" color="labelSecondary" mb="4px">
                      {w.province}{w.city}{w.district} · {w.address}
                    </Text>

                    <Flex gap="14px" wrap="wrap" fontSize="12px" color="labelTertiary">
                      <Box as="span">负责人 {w.manager || '—'}</Box>
                      <Box as="span">{w.phone || '—'}</Box>
                      <Box as="span" fontFamily="mono">{num(w.lat, 4)}, {num(w.lng, 4)}</Box>
                    </Flex>

                    {w.coverage ? (
                      <Box mt="8px" p="9px 11px" bg="fill" borderRadius="md">
                        <Text fontSize="12px" color="labelSecondary">覆盖范围：{w.coverage}</Text>
                      </Box>
                    ) : null}
                  </Box>

                  <Flex gap="8px" flex="0 0 auto">
                    <Btn variant="secondary" size="sm" onClick={() => openEdit(w)}>编辑</Btn>
                    <Btn variant="plain" size="sm" onClick={() => setConfirmDelete(w)}>删除</Btn>
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Flex>
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        </>
      )}

      {/* 新建 / 编辑 */}
      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? '新建网点' : '编辑网点'}
        maxW="620px"
        footer={
          <>
            <Btn variant="plain" onClick={() => setModal(null)}>取消</Btn>
            <Btn variant="primary" loading={busy} onClick={save}>保存</Btn>
          </>
        }
      >
        {modal ? (
          <Flex direction="column" gap="14px">
            <Flex gap="14px" wrap="wrap">
              <Box flex="2 1 220px">
                <Field label="网点名称" required error={formError}>
                  <TextField value={modal.form.name} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, name: v } }))} placeholder="如：上海青浦分拨中心" />
                </Field>
              </Box>
              <Box flex="1 1 140px">
                <Field label="编号">
                  <TextField value={modal.form.code} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, code: v } }))} placeholder="如：SH-QP" />
                </Field>
              </Box>
            </Flex>

            <Flex gap="14px" wrap="wrap">
              <Box flex="1 1 140px">
                <Field label="省 / 直辖市">
                  <TextField value={modal.form.province} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, province: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 120px">
                <Field label="城市">
                  <TextField value={modal.form.city} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, city: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 120px">
                <Field label="区 / 县">
                  <TextField value={modal.form.district} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, district: v } }))} />
                </Field>
              </Box>
            </Flex>

            <Field label="详细地址">
              <TextField value={modal.form.address} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, address: v } }))} />
            </Field>

            <Flex gap="14px" wrap="wrap">
              <Box flex="1 1 140px">
                <Field label="纬度" hint="用于地图定位，如 31.1509">
                  <TextField type="number" value={modal.form.lat} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, lat: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 140px">
                <Field label="经度" hint="如 121.1136">
                  <TextField type="number" value={modal.form.lng} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, lng: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 140px">
                <Field label="日容量（件）">
                  <TextField type="number" value={modal.form.capacity} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, capacity: v } }))} />
                </Field>
              </Box>
            </Flex>

            <Flex gap="14px" wrap="wrap">
              <Box flex="1 1 140px">
                <Field label="负责人">
                  <TextField value={modal.form.manager} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, manager: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 160px">
                <Field label="联系电话">
                  <TextField value={modal.form.phone} onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, phone: v } }))} />
                </Field>
              </Box>
              <Box flex="1 1 120px">
                <Field label="状态">
                  <SelectField
                    value={modal.form.status}
                    onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, status: v } }))}
                    options={[{ value: 'active', label: '运营中' }, { value: 'inactive', label: '已停用' }]}
                  />
                </Field>
              </Box>
            </Flex>

            <Field label="覆盖范围">
              <TextArea
                value={modal.form.coverage}
                onChange={(v) => setModal((m) => ({ ...m, form: { ...m.form, coverage: v } }))}
                rows={2}
                placeholder="如：上海市全域 / 江浙沪次日达"
              />
            </Field>
          </Flex>
        ) : null}
      </Modal>

      {/* 删除确认 */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="删除网点"
        footer={
          <>
            <Btn variant="plain" onClick={() => setConfirmDelete(null)}>取消</Btn>
            <Btn variant="danger" loading={busy} onClick={remove}>确认删除</Btn>
          </>
        }
      >
        <Text fontSize="15px" color="label">
          确定删除「{confirmDelete?.name}」吗？关联的运单不会被删除，但会失去该网点的关联信息。
        </Text>
        {formError ? <Text fontSize="13px" color="red.500" mt="10px">{formError}</Text> : null}
      </Modal>
    </Page>
  )
}
