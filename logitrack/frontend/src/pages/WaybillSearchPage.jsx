// 运单查询首页：一个大搜索框（运单号 / 手机号 / 收件人）→ 结果列表。
//
// 设计取舍：
//   - 未输入时不请求，避免首屏糊一堆数据；但给出"最近运单"作为默认视图，
//     让页面一进来就不是空的（空态只在真的搜不到时出现）。
//   - 搜索框用 Apple 风格胶囊，聚焦时有主题色光晕。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Page } from '../components/AppLayout'
import WaybillCard from '../components/WaybillCard'
import { Btn, Empty, ErrorBlock, Loading, PageHeader, Pagination, SelectField, Stat } from '../components/ui'
import { SearchIcon, XIcon, PlusIcon, BoxIcon, AlertIcon, TruckIcon, CheckIcon } from '../components/Icons'
import { STATUSES, formatDate, money, statusMeta } from '../constants'

const QUICK_FILTERS = [
  { key: '', label: '全部' },
  ...STATUSES.map((s) => ({ key: s.key, label: s.label })),
]

export default function WaybillSearchPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const inputRef = useRef(null)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 首次进入聚焦搜索框（Apple 的搜索习惯）
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  const query = useMemo(() => ({
    q: q.trim(), status, from, to, page, pageSize: 10,
  }), [q, status, from, to, page])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.waybills(query)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [query])

  // 条件变化时重新请求；输入框做 300ms 防抖，避免每敲一个字都打接口
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const list = data?.list || []
  const searching = Boolean(q.trim() || status || from || to)

  // 顶部概览：从当前结果集算，不额外请求
  const summary = useMemo(() => {
    const inTransit = list.filter((w) => ['picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery'].includes(w.status)).length
    const delivered = list.filter((w) => w.status === 'delivered').length
    const abnormal = list.filter((w) => ['exception', 'returned'].includes(w.status)).length
    return { inTransit, delivered, abnormal, freight: list.reduce((s, w) => s + Number(w.freight || 0), 0) }
  }, [list])

  function reset() {
    setQ('')
    setStatus('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <Page>
      <PageHeader
        title="运单查询"
        sub={user?.role === 'courier' ? '输入运单号、手机号或收件人姓名查询' : '全网点运单检索 · 支持运单号 / 手机号 / 收件人'}
        actions={
          <Btn variant="primary" onClick={() => navigate('/waybills/new')}>
            <PlusIcon size={15} />
            创建运单
          </Btn>
        }
      />

      {/* 大搜索框 */}
      <Box maxW="760px" mb="18px">
        <Box className="lt-hero-search">
          <Box color="labelTertiary" display="flex" flex="0 0 auto">
            <SearchIcon size={20} />
          </Box>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="输入运单号 / 手机号 / 收件人姓名"
            aria-label="运单搜索"
          />
          {q ? (
            <Box
              as="button"
              onClick={() => { setQ(''); setPage(1) }}
              bg="fill"
              border="none"
              borderRadius="full"
              boxSize="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              color="labelSecondary"
              flex="0 0 auto"
              aria-label="清空"
            >
              <XIcon size={14} />
            </Box>
          ) : null}
          <Btn variant="primary" onClick={load} flex="0 0 auto">
            查询
          </Btn>
        </Box>
      </Box>

      {/* 筛选区：状态下拉 + 日期范围 */}
      <Flex gap="10px" mb="16px" wrap="wrap" align="flex-end">
        <Box w="150px">
          <SelectField
            value={status}
            onChange={(v) => { setStatus(v); setPage(1) }}
            placeholder="全部状态"
            options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
          />
        </Box>
        <Box w="160px">
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            aria-label="开始日期"
            style={{
              width: '100%', height: '38px', padding: '0 12px', fontSize: '14px',
              background: 'var(--fill-secondary)', border: '2px solid transparent',
              borderRadius: '12px', color: 'var(--label)', outline: 'none',
            }}
          />
        </Box>
        <Text fontSize="13px" color="labelTertiary" pb="10px">至</Text>
        <Box w="160px">
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            aria-label="结束日期"
            style={{
              width: '100%', height: '38px', padding: '0 12px', fontSize: '14px',
              background: 'var(--fill-secondary)', border: '2px solid transparent',
              borderRadius: '12px', color: 'var(--label)', outline: 'none',
            }}
          />
        </Box>
        {searching ? (
          <Btn variant="plain" size="sm" onClick={reset}>清空筛选</Btn>
        ) : null}
      </Flex>

      {/* 快捷状态切换 */}
      <Flex gap="6px" mb="18px" wrap="wrap">
        {QUICK_FILTERS.map((f) => {
          const active = status === f.key
          const meta = f.key ? statusMeta(f.key) : null
          return (
            <Box
              key={f.key || 'all'}
              as="button"
              onClick={() => { setStatus(f.key); setPage(1) }}
              px="13px"
              py="6px"
              borderRadius="full"
              fontSize="13px"
              fontWeight={active ? 600 : 500}
              border="none"
              cursor="pointer"
              transition="all 150ms"
              bg={active ? (meta ? meta.soft : 'var(--tint-soft)') : 'var(--fill-secondary)'}
              color={active ? (meta ? meta.color : 'var(--tint)') : 'var(--label-secondary)'}
            >
              {f.label}
            </Box>
          )
        })}
      </Flex>

      {/* 结果概览：只在有数据时显示，避免空页面堆统计卡 */}
      {list.length ? (
        <Flex gap="12px" mb="18px" wrap="wrap">
          <Box flex="1 1 150px"><Stat label="结果条数" value={data.total} hint={searching ? '匹配当前条件' : '全部运单'} /></Box>
          <Box flex="1 1 150px"><Stat label="在途" value={summary.inTransit} color="#007AFF" hint="揽收 / 运输 / 派送中" /></Box>
          <Box flex="1 1 150px"><Stat label="已签收" value={summary.delivered} color="#34C759" hint="本页已签收" /></Box>
          <Box flex="1 1 150px"><Stat label="异常 / 退回" value={summary.abnormal} color="#FF3B30" hint="需关注" /></Box>
          <Box flex="1 1 150px"><Stat label="本页运费" value={money(summary.freight)} hint="仅统计当前页" /></Box>
        </Flex>
      ) : null}

      {loading ? (
        <Loading rows={4} height="120px" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : !list.length ? (
        <Empty
          icon={<SearchIcon size={24} />}
          title={searching ? '没有找到匹配的运单' : '还没有运单'}
          description={
            searching
              ? '换个运单号、手机号或收件人姓名试试；也可以清空筛选条件查看全部运单。'
              : '创建第一张运单后，这里会显示它的全链路状态。'
          }
          action={searching ? '清空筛选' : '创建运单'}
          onAction={searching ? reset : () => navigate('/waybills/new')}
        />
      ) : (
        <>
          <Flex direction="column" gap="12px">
            {list.map((wb) => (
              <WaybillCard key={wb.id} wb={wb} />
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
    </Page>
  )
}
