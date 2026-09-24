// 运单详情页 —— 本系统的核心页面，差异化维度「时间轴 + 地图联动」在这里收口。
//
// ── 联动设计 ────────────────────────────────────────────────────────────
// 状态：selectedId（唯一真相源）
//   两侧都只读它、都只通过同一个 handleSelect 请求改变它。
//
//   时间轴 → 地图：Timeline 的 onSelect 带 { from: 'timeline' }，
//                 selectedId 变化后，MapPanel 的 effect 调 focusNode 让视野飞过去。
//   地图 → 时间轴：MapPanel 的 onSelect 带 { from: 'map' }，
//                 除更新 selectedId 外还要调 timelineRef.scrollTo(id)——
//                 点地图不会让列表自己滚动，必须显式滚。
//
//   为什么要区分 from：只有"来自地图"才需要滚动时间轴。否则用户点时间轴上的
//   某个节点，节点自己会被 scrollIntoView 挪到屏幕中央，手点的地方跑掉，很别扭。
// ────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Page } from '../components/AppLayout'
import Timeline from '../components/Timeline'
import MapPanel from '../components/MapPanel'
import { ExceptionForm, ScanForm, TransitionForm } from '../components/WaybillForms'
import {
  Btn, Card, ErrorBlock, KV, Loading, Modal, PageHeader,
  ProgressBar, StatusPill, Tag,
} from '../components/ui'
import {
  AlertIcon, CheckIcon, ClockIcon, MapPinIcon, RefreshIcon, SparkIcon, TruckIcon,
} from '../components/Icons'
import { formatFull, money, statusMeta } from '../constants'

export default function WaybillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isDispatcher } = useAuth()
  const timelineRef = useRef(null)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [next, setNext] = useState(null)
  const [warehouses, setWarehouses] = useState([])

  // 弹窗
  const [statusModal, setStatusModal] = useState(null)
  const [exModal, setExModal] = useState(false)
  const [scanModal, setScanModal] = useState(false)
  const [transitionPayload, setTransitionPayload] = useState({})
  const [exForm, setExForm] = useState({})
  const [scanForm, setScanForm] = useState({})

  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.timeline(id),
      api.nextStatus(id).catch(() => null),
    ])
      .then(([tl, nx]) => {
        setData(tl)
        setNext(nx)
        // 默认选中"当前正在进行的节点"——一进页面地图就定位到货现在在哪
        const active = (tl.nodes || []).find((n) => n.node_status === 'active' || n.node_status === 'exception')
        const fallback = (tl.nodes || [])[tl.nodes.length - 1]
        const initial = active || fallback
        setSelectedId(initial ? initial.id : null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  // 网点下拉（表单里选操作网点用）——只需拉一次
  useEffect(() => {
    if (!isDispatcher) return
    api.options()
      .then((o) => setWarehouses(o.warehouses || []))
      .catch(() => {})
  }, [isDispatcher])

  const nodes = data?.nodes || []
  const wb = data?.waybill
  const meta = wb ? statusMeta(wb.status) : null

  // ---------- 联动：唯一的选中入口 ----------
  const handleSelect = useCallback((nodeId, info = {}) => {
    setSelectedId(nodeId)
    if (info.from === 'map') {
      timelineRef.current?.scrollTo(nodeId)
    }
  }, [])

  async function doTransition(status, payload = {}) {
    setBusy(true)
    setActionError('')
    try {
      await api.changeStatus(id, { status, ...payload })
      setStatusModal(null)
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doException(form) {
    setBusy(true)
    setActionError('')
    try {
      await api.createException({ waybill_id: Number(id), ...form })
      setExModal(false)
      setExForm({})
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doScan(form) {
    setBusy(true)
    setActionError('')
    try {
      await api.scan(id, form)
      setScanModal(false)
      setScanForm({})
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function runEta() {
    setAiLoading(true)
    setActionError('')
    try {
      const r = await api.aiEta({ waybill_id: Number(id) })
      setAiResult(r)
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return <Page><Loading rows={5} height="110px" /></Page>
  }

  if (error || !data) {
    return (
      <Page>
        <ErrorBlock title="运单加载失败" message={error || '运单不存在或已被删除'} onRetry={load} />
        <Flex justify="center" mt="14px">
          <Btn variant="plain" onClick={() => navigate('/')}>返回查询</Btn>
        </Flex>
      </Page>
    )
  }

  return (
    <Page>
      <Flex align="center" gap="6px" fontSize="13px" color="labelTertiary" mb="12px">
        <Box as={Link} to="/" color="labelSecondary" textDecoration="none" _hover={{ color: 'brand.600' }}>
          运单查询
        </Box>
        <Text>/</Text>
        <Text fontFamily="mono">{wb.waybill_no}</Text>
      </Flex>

      <PageHeader
        title={wb.waybill_no}
        sub={`${wb.origin_city || '始发'} → ${wb.dest_city || '目的'} · ${wb.goods_type} · ${wb.weight}kg`}
        actions={
          <>
            <StatusPill meta={meta} />
            {isDispatcher ? (
              <>
                <Btn variant="secondary" onClick={() => { setActionError(''); setScanModal(true) }}>
                  <MapPinIcon size={15} />
                  节点扫描
                </Btn>
                <Btn
                  variant="secondary"
                  onClick={() => { setActionError(''); setExModal(true) }}
                  disabled={['delivered', 'returned'].includes(wb.status)}
                >
                  <AlertIcon size={15} />
                  登记异常
                </Btn>
              </>
            ) : null}
            <Btn variant="secondary" loading={aiLoading} onClick={runEta}>
              <SparkIcon size={15} />
              AI 时效预测
            </Btn>
          </>
        }
      />

      {actionError && !statusModal && !exModal && !scanModal ? (
        <Card mb="16px" p="14px" bg="rgba(255,59,48,0.08)" boxShadow="none">
          <Text fontSize="13px" color="red.500">{actionError}</Text>
        </Card>
      ) : null}

      {/* 状态推进：按钮只渲染状态机允许的流转，杜绝"点了才报错" */}
      {next && next.next?.length && isDispatcher ? (
        <Card mb="18px" p="16px">
          <Flex align="center" gap="14px" wrap="wrap">
            <Box>
              <Text fontSize="13px" color="labelSecondary">当前状态</Text>
              <Text fontSize="17px" fontWeight={600} style={{ color: meta.color }}>
                {meta.label}
              </Text>
            </Box>
            <Box flex="1" minW="120px">
              <ProgressBar value={wb.progress || 0} color={meta.color} />
            </Box>
            <Flex gap="8px" wrap="wrap">
              {next.next.map((n) => {
                const nm = statusMeta(n.status)
                const isDanger = ['exception', 'returned'].includes(n.status)
                return (
                  <Btn
                    key={n.status}
                    variant={isDanger ? 'danger' : 'primary'}
                    size="sm"
                    onClick={() => {
                      setActionError('')
                      setTransitionPayload({})
                      setStatusModal({ status: n.status, label: nm.label })
                    }}
                  >
                    {isDanger ? <AlertIcon size={14} /> : <CheckIcon size={14} />}
                    标记为{n.label}
                  </Btn>
                )
              })}
            </Flex>
          </Flex>
        </Card>
      ) : null}

      {/* AI 时效预测结果（值已写入 waybills.estimated_delivery） */}
      {aiResult ? (
        <Card mb="18px" p="16px" bg="var(--tint-soft)" boxShadow="none">
          <Flex align="flex-start" gap="12px">
            <Flex boxSize="34px" flex="0 0 34px" borderRadius="10px" bg="brand.500" color="#fff" align="center" justify="center">
              <SparkIcon size={18} />
            </Flex>
            <Box flex="1" minW="0">
              <Flex align="center" gap="8px" wrap="wrap">
                <Text fontSize="15px" fontWeight={600} color="label">
                  时效预测已完成并写入运单
                </Text>
                <Tag>{aiResult.source === 'llm' ? '大模型' : '本地规则降级'}</Tag>
              </Flex>
              <Flex gap="18px" wrap="wrap" mt="8px" fontSize="13px" color="labelSecondary">
                <Box as="span">
                  预计送达：<Box as="b" color="brand.600">{formatFull(aiResult.estimated_delivery)}</Box>
                </Box>
                <Box as="span">预计耗时：{aiResult.estimated_hours} 小时</Box>
                <Box as="span">置信度：{Math.round((aiResult.confidence || 0) * 100)}%</Box>
                {aiResult.history_samples ? <Box as="span">历史样本：{aiResult.history_samples} 条</Box> : null}
              </Flex>
              {aiResult.basis ? (
                <Text fontSize="13px" color="labelSecondary" mt="6px">{aiResult.basis}</Text>
              ) : null}
              <Btn variant="plain" size="sm" mt="8px" onClick={() => setAiResult(null)}>收起</Btn>
            </Box>
          </Flex>
        </Card>
      ) : null}

      {/* ── 双栏主体：左时间轴 / 右地图 ── */}
      <Box className="lt-detail-grid">
        <Box>
          <Card p="18px">
            <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
              <Box>
                <Text fontSize="17px" fontWeight={600} color="label">物流时间轴</Text>
                <Text fontSize="13px" color="labelSecondary" mt="2px">
                  共 {data.summary.total_nodes} 个节点 · {data.summary.scanned} 次扫描
                  {data.summary.exceptions ? ` · ${data.summary.exceptions} 次异常` : ''}
                </Text>
              </Box>
              <Flex gap="8px" align="center">
                {data.summary.duration_hours ? (
                  <Tag>
                    <ClockIcon size={11} />
                    <Box as="span" ml="3px">已历时 {data.summary.duration_hours} 小时</Box>
                  </Tag>
                ) : null}
                <Btn variant="plain" size="sm" onClick={load}>
                  <RefreshIcon size={14} />
                  刷新
                </Btn>
              </Flex>
            </Flex>

            <Timeline ref={timelineRef} nodes={nodes} selectedId={selectedId} onSelect={handleSelect} />
          </Card>

          <Card p="18px" mt="16px">
            <Text fontSize="17px" fontWeight={600} color="label" mb="12px">运单信息</Text>
            <Flex gap="20px" wrap="wrap">
              <Box flex="1 1 300px" minW="0">
                <Text fontSize="13px" fontWeight={600} color="labelSecondary" mb="6px">寄件人</Text>
                <KV label="姓名">{wb.sender_name}</KV>
                <KV label="电话" mono>{wb.sender_phone}</KV>
                <KV label="地址">{wb.sender_address || '—'}</KV>
              </Box>
              <Box flex="1 1 300px" minW="0">
                <Text fontSize="13px" fontWeight={600} color="labelSecondary" mb="6px">收件人</Text>
                <KV label="姓名">{wb.receiver_name}</KV>
                <KV label="电话" mono>{wb.receiver_phone}</KV>
                <KV label="地址">{wb.receiver_address || '—'}</KV>
              </Box>
            </Flex>

            <Box mt="16px" pt="14px" borderTop="1px solid" borderColor="sep">
              <Flex gap="20px" wrap="wrap">
                <Box flex="1 1 300px" minW="0">
                  <KV label="货物类型">{wb.goods_type}</KV>
                  <KV label="重量 / 体积">{wb.weight} kg / {wb.volume} m³</KV>
                  <KV label="保价">{wb.insured ? money(wb.insured_value) : '未保价'}</KV>
                  <KV label="运费">{money(wb.freight)} · {wb.payment_method}</KV>
                </Box>
                <Box flex="1 1 300px" minW="0">
                  <KV label="发出网点">{wb.origin_warehouse_name || '—'}</KV>
                  <KV label="目的网点">{wb.dest_warehouse_name || '—'}</KV>
                  <KV label="司机">{wb.driver_name ? `${wb.driver_name}（${wb.driver_phone}）` : '未指派'}</KV>
                  <KV label="车辆">{wb.vehicle_plate || '未指派'}</KV>
                </Box>
              </Flex>
            </Box>

            {data.packages?.length ? (
              <Box mt="16px" pt="14px" borderTop="1px solid" borderColor="sep">
                <Text fontSize="13px" fontWeight={600} color="labelSecondary" mb="8px">
                  包裹明细（{data.packages.length} 件）
                </Text>
                <Flex direction="column" gap="6px">
                  {data.packages.map((p) => (
                    <Flex key={p.id} align="center" gap="10px" p="9px 11px" bg="fill" borderRadius="md" fontSize="13px">
                      <Box color="brand.600" display="flex"><TruckIcon size={15} /></Box>
                      <Text fontWeight={600} color="label" flex="1" minW="0" noOfLines={1}>{p.name}</Text>
                      <Text color="labelSecondary">×{p.quantity}</Text>
                      <Text color="labelSecondary">{p.weight} kg</Text>
                      <Text color="labelTertiary">{p.volume} m³</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            ) : null}

            <Flex gap="18px" wrap="wrap" mt="16px" pt="14px" borderTop="1px solid" borderColor="sep" fontSize="13px" color="labelSecondary">
              <Box as="span">下单：{formatFull(wb.created_at)}</Box>
              <Box as="span">预计送达：{formatFull(wb.estimated_delivery)}</Box>
              {wb.actual_delivery ? <Box as="span">实际签收：{formatFull(wb.actual_delivery)}</Box> : null}
              {wb.signed_by ? <Box as="span">签收人：{wb.signed_by}</Box> : null}
            </Flex>
          </Card>
        </Box>

        <Box className="lt-detail-map">
          <MapPanel nodes={nodes} selectedId={selectedId} onSelect={handleSelect} />
        </Box>
      </Box>

      {/* 状态流转 */}
      <Modal
        open={Boolean(statusModal)}
        onClose={() => setStatusModal(null)}
        title={`标记为「${statusModal?.label || ''}」`}
        footer={
          <>
            <Btn variant="plain" onClick={() => setStatusModal(null)}>取消</Btn>
            <Btn variant="primary" loading={busy} onClick={() => doTransition(statusModal.status, transitionPayload)}>
              确认流转
            </Btn>
          </>
        }
      >
        <TransitionForm
          status={statusModal?.status}
          onChange={setTransitionPayload}
          warehouses={warehouses}
          error={actionError}
        />
      </Modal>

      {/* 登记异常 */}
      <Modal
        open={exModal}
        onClose={() => setExModal(false)}
        title="登记异常"
        footer={
          <>
            <Btn variant="plain" onClick={() => setExModal(false)}>取消</Btn>
            <Btn variant="danger" loading={busy} onClick={() => doException(exForm)}>提交异常</Btn>
          </>
        }
      >
        <ExceptionForm onChange={setExForm} error={actionError} />
      </Modal>

      {/* 节点扫描 */}
      <Modal
        open={scanModal}
        onClose={() => setScanModal(false)}
        title="节点扫描"
        footer={
          <>
            <Btn variant="plain" onClick={() => setScanModal(false)}>取消</Btn>
            <Btn variant="primary" loading={busy} onClick={() => doScan(scanForm)}>记录扫描</Btn>
          </>
        }
      >
        <ScanForm onChange={setScanForm} next={next} warehouses={warehouses} error={actionError} />
      </Modal>
    </Page>
  )
}
