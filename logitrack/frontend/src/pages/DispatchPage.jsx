// 调度台（dispatcher / admin）：待分配运单 → 指派司机 / 车辆。
//
// 交互：
//   左侧待分配池（可多选），右侧司机卡片。选中运单后点司机卡上的「指派」即完成分配。
//   指派成功后该运单会从待分配池消失（因为它已经有 driver_id 了），司机卡片的在途数 +1。
//
// AI 派送路线优化也在这里：选中一名司机 → 让 AI 规划他当日的最优派送顺序。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { api } from '../api'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Empty, ErrorBlock, Loading, Modal, PageHeader, Pagination, SelectField, Stat, Tag,
} from '../components/ui'
import WaybillCard from '../components/WaybillCard'
import { AlertIcon, CheckIcon, RouteIcon, SparkIcon, TruckIcon, UsersIcon } from '../components/Icons'
import { DRIVER_STATUS, STATUSES, money, statusMeta } from '../constants'

export default function DispatchPage() {
  const [pending, setPending] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')

  const [selected, setSelected] = useState([]) // 选中的运单 id
  const [assignTarget, setAssignTarget] = useState(null) // 要指派的司机
  const [assignForm, setAssignForm] = useState({ vehicle_id: '' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [routeResult, setRouteResult] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.dispatchPending({ page, pageSize: 10, status: statusFilter, origin_warehouse_id: warehouseFilter }),
      api.dispatchSummary(),
    ])
      .then(([p, s]) => { setPending(p); setSummary(s) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, statusFilter, warehouseFilter])

  useEffect(() => { load() }, [load])

  const list = pending?.list || []

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function doAssign() {
    if (!assignTarget) return
    setBusy(true)
    setActionError('')
    try {
      const ids = selected.length ? selected : []
      const body = ids.length
        ? { driver_id: assignTarget.id, waybill_ids: ids, vehicle_id: Number(assignForm.vehicle_id) || assignTarget.vehicle_id || 0 }
        : { driver_id: assignTarget.id, waybill_id: assignSingleId, vehicle_id: Number(assignForm.vehicle_id) || 0 }
      await api.dispatchAssign(body)
      setAssignTarget(null)
      setSelected([])
      setAssignForm({ vehicle_id: '' })
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const [assignSingleId, setAssignSingleId] = useState(null)

  function openAssign(driver, waybillId) {
    setActionError('')
    setAssignTarget(driver)
    setAssignSingleId(waybillId || null)
    setAssignForm({ vehicle_id: String(driver.vehicle_id || '') })
  }

  async function runOptimize(driver) {
    setRouteLoading(true)
    setRouteResult(null)
    try {
      const r = await api.aiOptimizeRoute({ driver_id: driver.id })
      setRouteResult({ driver, ...r })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setRouteLoading(false)
    }
  }

  // AI 滞留识别：识别结果会创建 exceptions 记录，是本页的第二个 AI 能力入口
  async function runStale() {
    setAiLoading(true)
    setAiResult(null)
    try {
      const r = await api.aiDetectStale({ hours: 24, limit: 10 })
      setAiResult(r)
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const totals = useMemo(() => {
    if (!pending) return { freight: 0, weight: 0 }
    return {
      freight: list.reduce((s, w) => s + Number(w.freight || 0), 0),
      weight: list.reduce((s, w) => s + Number(w.weight || 0), 0),
    }
  }, [list, pending])

  return (
    <Page>
      <PageHeader
        title="调度台"
        sub="把待分配运单指派给司机与车辆 · 支持批量指派与 AI 派送顺序优化"
        actions={
          <>
            <Btn variant="secondary" loading={aiLoading} onClick={runStale}>
              <SparkIcon size={15} />
              AI 滞留识别
            </Btn>
            <Btn variant="secondary" onClick={load}>
              刷新
            </Btn>
          </>
        }
      />

      {/* 概况统计 */}
      {summary ? (
        <Flex gap="12px" mb="18px" wrap="wrap">
          <Box flex="1 1 150px"><Stat label="待分配运单" value={summary.pending} color="#FF9500" hint="尚未指派司机" /></Box>
          <Box flex="1 1 150px"><Stat label="在途任务" value={summary.active} color="#007AFF" hint="已指派未完结" /></Box>
          <Box flex="1 1 150px"><Stat label="可用司机" value={summary.available_drivers} color="#34C759" hint={`共 ${summary.drivers?.length || 0} 名司机`} /></Box>
          <Box flex="1 1 150px"><Stat label="可用车辆" value={summary.available_vehicles} color="#5856D6" hint={`共 ${summary.vehicles?.length || 0} 台车`} /></Box>
          <Box flex="1 1 150px"><Stat label="已选中" value={selected.length} hint="点击运单卡片可多选" /></Box>
        </Flex>
      ) : null}

      {/* AI 滞留识别结果 */}
      {aiResult ? (
        <Card mb="18px" p="16px" bg="var(--tint-soft)" boxShadow="none">
          <Flex align="flex-start" gap="12px">
            <Flex boxSize="34px" flex="0 0 34px" borderRadius="10px" bg="brand.500" color="#fff" align="center" justify="center">
              <SparkIcon size={18} />
            </Flex>
            <Box flex="1" minW="0">
              <Flex align="center" gap="8px" wrap="wrap">
                <Text fontSize="15px" fontWeight={600} color="label">滞留识别完成</Text>
                <Tag>{aiResult.source === 'llm' ? '大模型' : '本地规则降级'}</Tag>
                <Tag color={aiResult.risk_level === 'high' ? '#FF3B30' : aiResult.risk_level === 'medium' ? '#FF9500' : '#34C759'}>
                  风险 {aiResult.risk_level}
                </Tag>
              </Flex>
              <Text fontSize="13px" color="labelSecondary" mt="6px">{aiResult.summary}</Text>
              <Flex gap="18px" wrap="wrap" mt="8px" fontSize="13px" color="labelSecondary">
                <Box as="span">识别阈值：{aiResult.threshold_hours} 小时无扫描</Box>
                <Box as="span">命中：{aiResult.stale_total} 张</Box>
                <Box as="span">
                  新建异常单：<Box as="b" color="brand.600">{aiResult.created_exceptions}</Box> 条
                </Box>
              </Flex>
              <Btn variant="plain" size="sm" mt="8px" onClick={() => setAiResult(null)}>收起</Btn>
            </Box>
          </Flex>
        </Card>
      ) : null}

      {/* AI 派送路线优化结果 */}
      {routeResult ? (
        <Card mb="18px" p="16px">
          <Flex align="center" justify="space-between" gap="10px" mb="12px" wrap="wrap">
            <Box>
              <Text fontSize="15px" fontWeight={600} color="label">
                {routeResult.driver.name} 的派送顺序建议
              </Text>
              <Text fontSize="13px" color="labelSecondary" mt="2px">
                共 {routeResult.total_stops} 站 · 全程约 {routeResult.total_distance_km} km · 预计 {routeResult.estimated_minutes} 分钟
                <Box as="span" ml="8px" color="labelTertiary">（{routeResult.source === 'llm' ? '大模型' : '最近邻算法降级'}）</Box>
              </Text>
            </Box>
            <Btn variant="plain" size="sm" onClick={() => setRouteResult(null)}>收起</Btn>
          </Flex>
          {routeResult.plan.length ? (
            <Flex direction="column" gap="6px">
              {routeResult.plan.map((s, i) => (
                <Flex key={s.waybill_id} align="center" gap="10px" p="9px 11px" bg="fill" borderRadius="md" fontSize="13px">
                  <Flex
                    boxSize="22px" flex="0 0 22px" borderRadius="full" bg="brand.500" color="#fff"
                    align="center" justify="center" fontSize="11px" fontWeight={700}
                  >
                    {i + 1}
                  </Flex>
                  <Text fontFamily="mono" fontWeight={600} color="label">{s.waybill_no}</Text>
                  <Text color="labelSecondary" flex="1" minW="0" noOfLines={1}>{s.receiver_address}</Text>
                  <Tag>{s.leg_km} km</Tag>
                </Flex>
              ))}
            </Flex>
          ) : (
            <Text fontSize="13px" color="labelSecondary">该司机当前没有待派送运单。</Text>
          )}
          {routeResult.advice ? (
            <Box mt="12px" p="12px" bg="fill" borderRadius="md">
              <Text fontSize="13px" color="labelSecondary" whiteSpace="pre-wrap">{routeResult.advice}</Text>
            </Box>
          ) : null}
        </Card>
      ) : null}

      {actionError ? (
        <Card mb="16px" p="14px" bg="rgba(255,59,48,0.08)" boxShadow="none">
          <Text fontSize="13px" color="red.500">{actionError}</Text>
        </Card>
      ) : null}

      <Flex gap="18px" align="flex-start" direction={{ base: 'column', xl: 'row' }}>
        {/* 左：待分配池 */}
        <Box flex="1 1 620px" minW="0" w="100%">
          <Card p="18px">
            <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
              <Box>
                <Text fontSize="17px" fontWeight={600} color="label">待分配运单</Text>
                <Text fontSize="13px" color="labelSecondary" mt="2px">
                  {selected.length ? `已选中 ${selected.length} 张 · 点右侧司机完成指派` : '点击卡片可多选后批量指派'}
                </Text>
              </Box>
              {selected.length ? (
                <Btn variant="plain" size="sm" onClick={() => setSelected([])}>取消选择</Btn>
              ) : null}
            </Flex>

            {/* 筛选 */}
            <Flex gap="10px" mb="14px" wrap="wrap">
              <Box w="150px">
                <SelectField
                  value={statusFilter}
                  onChange={(v) => { setStatusFilter(v); setPage(1) }}
                  placeholder="全部状态"
                  options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
                />
              </Box>
              <Box w="200px">
                <SelectField
                  value={warehouseFilter}
                  onChange={(v) => { setWarehouseFilter(v); setPage(1) }}
                  placeholder="全部发出网点"
                  options={(summary?.by_warehouse || []).map((w) => ({ value: String(w.id), label: `${w.name}（待派 ${w.pending}）` }))}
                />
              </Box>
              {list.length ? (
                <Text fontSize="13px" color="labelTertiary" alignSelf="center" ml="auto">
                  本页 {list.length} 张 · {totals.weight.toFixed(1)} kg · {money(totals.freight)}
                </Text>
              ) : null}
            </Flex>

            {loading ? (
              <Loading rows={4} height="130px" />
            ) : error ? (
              <ErrorBlock message={error} onRetry={load} />
            ) : !list.length ? (
              <Empty
                icon={<CheckIcon size={24} />}
                title="待分配池已清空"
                description="所有运单都已指派司机。新创建的运单会自动出现在这里。"
              />
            ) : (
              <>
                <Flex direction="column" gap="12px">
                  {list.map((wb) => (
                    <Box
                      key={wb.id}
                      position="relative"
                      outline={selected.includes(wb.id) ? '2px solid var(--tint)' : 'none'}
                      borderRadius="lg"
                      transition="outline 150ms"
                    >
                      <WaybillCard wb={wb} onClick={() => toggle(wb.id)} />
                      {/* 选中态角标 */}
                      <Flex
                        position="absolute"
                        top="12px"
                        right="12px"
                        boxSize="22px"
                        borderRadius="full"
                        align="center"
                        justify="center"
                        bg={selected.includes(wb.id) ? 'brand.500' : 'fill'}
                        color={selected.includes(wb.id) ? '#fff' : 'labelTertiary'}
                        pointerEvents="none"
                      >
                        <CheckIcon size={13} />
                      </Flex>
                    </Box>
                  ))}
                </Flex>
                <Pagination
                  page={pending.page}
                  pages={pending.pages}
                  total={pending.total}
                  pageSize={pending.pageSize}
                  onChange={setPage}
                />
              </>
            )}
          </Card>
        </Box>

        {/* 右：司机与车辆 */}
        <Box flex="0 1 420px" w={{ base: '100%', xl: '420px' }} minW={{ base: '0', xl: '340px' }}>
          <Card p="18px">
            <Flex align="center" gap="8px" mb="14px">
              <Box color="brand.600" display="flex"><UsersIcon size={18} /></Box>
              <Text fontSize="17px" fontWeight={600} color="label">司机与车辆</Text>
            </Flex>

            <Flex direction="column" gap="10px">
              {(summary?.drivers || []).map((d) => {
                const st = DRIVER_STATUS[d.status] || { label: d.status, color: '#8E8E93' }
                const vehicle = (summary?.vehicles || []).find((v) => v.id === d.vehicle_id)
                const canAssign = selected.length > 0 && d.status !== 'resting'
                return (
                  <Box key={d.id} p="12px" bg="fill" borderRadius="md">
                    <Flex align="center" gap="10px" mb="8px">
                      <Flex boxSize="32px" flex="0 0 32px" borderRadius="full" bg="cardBg" color="label" align="center" justify="center" fontSize="13px" fontWeight={700}>
                        {d.name.slice(0, 1)}
                      </Flex>
                      <Box flex="1" minW="0">
                        <Flex align="center" gap="6px">
                          <Text fontSize="15px" fontWeight={600} color="label">{d.name}</Text>
                          <Tag color={st.color}>{st.label}</Tag>
                        </Flex>
                        <Text fontSize="12px" color="labelTertiary">
                          {d.phone} · 评分 {d.rating} · 完成 {d.completed_count} 单
                        </Text>
                      </Box>
                    </Flex>

                    <Flex gap="8px" wrap="wrap" align="center">
                      {vehicle ? (
                        <Tag>
                          <TruckIcon size={11} />
                          <Box as="span" ml="3px">{vehicle.plate_no} · {vehicle.vtype}</Box>
                        </Tag>
                      ) : (
                        <Tag>未绑定车辆</Tag>
                      )}
                      <Btn
                        variant={canAssign ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={!canAssign}
                        onClick={() => openAssign(d, null)}
                        ml="auto"
                      >
                        {selected.length ? `指派 ${selected.length} 张` : '先选运单'}
                      </Btn>
                      <Btn
                        variant="plain"
                        size="sm"
                        loading={routeLoading && routeResult?.driver?.id === d.id}
                        onClick={() => runOptimize(d)}
                      >
                        <RouteIcon size={14} />
                        规划路线
                      </Btn>
                    </Flex>
                  </Box>
                )
              })}
              {!(summary?.drivers || []).length ? (
                <Text fontSize="13px" color="labelSecondary" textAlign="center" py="20px">
                  暂无司机数据
                </Text>
              ) : null}
            </Flex>
          </Card>

          {/* 各网点待派 */}
          {summary?.by_warehouse?.length ? (
            <Card p="18px" mt="16px">
              <Text fontSize="17px" fontWeight={600} color="label" mb="12px">各网点待派量</Text>
              <Flex direction="column" gap="8px">
                {summary.by_warehouse.map((w) => (
                  <Flex key={w.id} align="center" gap="10px" fontSize="13px">
                    <Text flex="1" minW="0" color="label" noOfLines={1}>{w.name}</Text>
                    <Tag color="#FF9500">{w.pending} 张</Tag>
                  </Flex>
                ))}
              </Flex>
            </Card>
          ) : null}
        </Box>
      </Flex>

      {/* 指派确认弹窗 */}
      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title="指派运单"
        footer={
          <>
            <Btn variant="plain" onClick={() => setAssignTarget(null)}>取消</Btn>
            <Btn variant="primary" loading={busy} onClick={doAssign}>确认指派</Btn>
          </>
        }
      >
        {assignTarget ? (
          <Flex direction="column" gap="14px">
            <Box p="12px" borderRadius="md" bg="fill">
              <Text fontSize="13px" color="labelSecondary">指派给</Text>
              <Text fontSize="15px" fontWeight={600} color="label" mt="2px">
                {assignTarget.name} · {assignTarget.phone}
              </Text>
              <Text fontSize="13px" color="labelSecondary" mt="4px">
                本次将指派 {selected.length || 1} 张运单
              </Text>
            </Box>

            <Box>
              <Text fontSize="13px" fontWeight={600} color="labelSecondary" mb="6px">随行车辆</Text>
              <SelectField
                value={assignForm.vehicle_id}
                onChange={(v) => setAssignForm({ vehicle_id: v })}
                placeholder="不指定车辆"
                options={(summary?.vehicles || []).map((v) => ({
                  value: String(v.id),
                  label: `${v.plate_no} · ${v.vtype} · ${v.status === 'idle' ? '空闲' : v.status === 'in_use' ? '使用中' : '维保中'}`,
                }))}
              />
            </Box>

            {actionError ? <Text fontSize="13px" color="red.500">{actionError}</Text> : null}
          </Flex>
        ) : null}
      </Modal>
    </Page>
  )
}
