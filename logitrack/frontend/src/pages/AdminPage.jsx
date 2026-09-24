// Admin 概览：统计卡 + 时效趋势 + 异常率 + 网点吞吐排行 + 状态分布。
//
// 图表全部用纯 CSS（柱状 / 横条 / conic-gradient 环形），不引入图表库——
// 这几个图的复杂度不值得为它们多打包 100KB。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { api } from '../api'
import { Page } from '../components/AppLayout'
import {
  BarChart, Btn, Card, Donut, ErrorBlock, Legend, Loading, PageHeader, RankList, Stat, Tag,
} from '../components/ui'
import { RefreshIcon } from '../components/Icons'
import { STATUSES, money, num, statusMeta } from '../constants'

export default function AdminPage() {
  const [data, setData] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(10)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.dashboard({ days }),
      api.users().catch(() => []),
    ])
      .then(([d, u]) => { setData(d); setUsers(u) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => { load() }, [load])

  // 趋势：按天取最近 N 天，柱状图用「创建量 / 异常量」两组
  const trendData = useMemo(() => {
    if (!data?.trend) return []
    return data.trend.map((t) => ({
      label: String(t.day).slice(5),
      primary: t.created || 0,
      alt: t.abnormal || 0,
    }))
  }, [data])

  // 异常率趋势：单独算每天异常数
  const exTrend = useMemo(() => {
    const m = new Map((data?.exception_trend || []).map((r) => [r.day, r.cnt]))
    return (data?.trend || []).map((t) => ({
      label: String(t.day).slice(5),
      primary: m.get(t.day) || 0,
    }))
  }, [data])

  // 状态分布：环形图数据
  const statusSlices = useMemo(() => {
    const m = new Map((data?.status_dist || []).map((r) => [r.k, r.c]))
    return STATUSES.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      value: m.get(s.key) || 0,
    })).filter((s) => s.value > 0)
  }, [data])

  const exSlices = useMemo(() => {
    const colors = ['#FF3B30', '#FF9500', '#5856D6', '#AF52DE']
    return (data?.exception_dist || []).map((r, i) => ({
      label: r.k,
      color: colors[i % colors.length],
      value: r.c,
    }))
  }, [data])

  const ov = data?.overview || {}

  if (loading) return <Page><Loading rows={6} height="100px" /></Page>
  if (error) return <Page><ErrorBlock message={error} onRetry={load} /></Page>

  return (
    <Page>
      <PageHeader
        title="总部概览"
        sub="全网运单统计 · 时效趋势 · 异常率 · 网点吞吐排行"
        actions={
          <>
            <Flex p="3px" bg="fill" borderRadius="full">
              {[7, 10, 30].map((d) => (
                <Box
                  key={d}
                  as="button"
                  onClick={() => setDays(d)}
                  px="14px"
                  py="6px"
                  borderRadius="full"
                  fontSize="13px"
                  fontWeight={600}
                  border="none"
                  cursor="pointer"
                  transition="all 200ms"
                  bg={days === d ? 'cardBg' : 'transparent'}
                  color={days === d ? 'label' : 'labelSecondary'}
                  boxShadow={days === d ? 'card' : 'none'}
                >
                  {d} 天
                </Box>
              ))}
            </Flex>
            <Btn variant="secondary" onClick={load}>
              <RefreshIcon size={15} />
              刷新
            </Btn>
          </>
        }
      />

      {/* 核心统计卡 */}
      <Flex gap="12px" mb="16px" wrap="wrap">
        <Box flex="1 1 160px"><Stat label="运单总数" value={ov.waybills_total ?? 0} hint="全部历史运单" /></Box>
        <Box flex="1 1 160px"><Stat label="在途" value={ov.in_transit ?? 0} color="#007AFF" hint="揽收 → 派送中" /></Box>
        <Box flex="1 1 160px"><Stat label="已签收" value={ov.delivered ?? 0} color="#34C759" hint="完成全链路" /></Box>
        <Box flex="1 1 160px"><Stat label="异常率" value={`${ov.exception_rate ?? 0}%`} color="#FF3B30" hint="异常 + 退回占比" /></Box>
        <Box flex="1 1 160px"><Stat label="准时率" value={`${ov.on_time_rate ?? 0}%`} color="#5856D6" hint="实际 ≤ 预计送达" /></Box>
        <Box flex="1 1 160px"><Stat label="平均时效" value={`${ov.avg_delivery_hours ?? 0}h`} hint="已签收运单均值" /></Box>
      </Flex>

      {/* 资源与金额 */}
      <Flex gap="12px" mb="18px" wrap="wrap">
        <Box flex="1 1 150px"><Stat label="网点" value={ov.warehouses_total ?? 0} hint={`车辆 ${ov.vehicles_total ?? 0} 台`} /></Box>
        <Box flex="1 1 150px"><Stat label="司机" value={ov.drivers_total ?? 0} hint={`客户 ${ov.customers_total ?? 0} 位`} /></Box>
        <Box flex="1 1 150px"><Stat label="包裹" value={ov.packages_total ?? 0} hint={`扫描 ${ov.scans_total ?? 0} 次`} /></Box>
        <Box flex="1 1 150px"><Stat label="运费总额" value={money(ov.freight_total)} hint={`总重 ${num(ov.weight_total, 1)} kg`} /></Box>
        <Box flex="1 1 150px"><Stat label="保价单" value={ov.insured_total ?? 0} hint="占比见下方状态分布" /></Box>
        <Box flex="1 1 150px"><Stat label="待处理异常" value={ov.exceptions_open ?? 0} color="#FF3B30" hint="需要调度介入" /></Box>
      </Flex>

      {/* 图表区：趋势 + 异常率 */}
      <Flex gap="16px" mb="16px" wrap="wrap">
        <Card p="18px" flex="1 1 460px" minW="0">
          <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
            <Box>
              <Text fontSize="17px" fontWeight={600} color="label">运单量趋势</Text>
              <Text fontSize="13px" color="labelSecondary" mt="2px">
                蓝柱为当日新建运单，橙柱为当日异常/退回
              </Text>
            </Box>
            <Flex gap="10px" fontSize="12px" color="labelSecondary" align="center">
              <Flex align="center" gap="5px">
                <Box boxSize="9px" borderRadius="2px" bg="brand.500" />
                新建
              </Flex>
              <Flex align="center" gap="5px">
                <Box boxSize="9px" borderRadius="2px" bg="orange.400" />
                异常
              </Flex>
            </Flex>
          </Flex>
          {trendData.length ? (
            <BarChart data={trendData} height={140} />
          ) : (
            <Text fontSize="13px" color="labelSecondary" py="30px" textAlign="center">
              所选时间范围内没有数据
            </Text>
          )}
        </Card>

        <Card p="18px" flex="1 1 320px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="4px">状态分布</Text>
          <Text fontSize="13px" color="labelSecondary" mb="16px">
            共 {ov.waybills_total ?? 0} 张运单
          </Text>
          {statusSlices.length ? (
            <Flex gap="20px" align="center" wrap="wrap">
              <Donut
                slices={statusSlices}
                total={ov.waybills_total ?? 0}
                centerLabel="运单"
                size={148}
              />
              <Box flex="1" minW="150px">
                <Legend items={statusSlices.map((s) => ({ label: s.label, color: s.color, value: s.value }))} />
              </Box>
            </Flex>
          ) : (
            <Text fontSize="13px" color="labelSecondary">暂无数据</Text>
          )}
        </Card>
      </Flex>

      {/* 异常率趋势 + 异常类型 */}
      <Flex gap="16px" mb="16px" wrap="wrap">
        <Card p="18px" flex="1 1 460px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="14px">异常件趋势</Text>
          {exTrend.length ? (
            <BarChart data={exTrend} height={120} />
          ) : (
            <Text fontSize="13px" color="labelSecondary" py="30px" textAlign="center">暂无异常数据</Text>
          )}
        </Card>

        <Card p="18px" flex="1 1 320px" minW="0">
          <Text fontSize="17px" fontWeight="600" color="label" mb="14px">异常类型分布</Text>
          {exSlices.length ? (
            <Flex gap="20px" align="center" wrap="wrap">
              <Donut
                slices={exSlices}
                total={exSlices.reduce((s, x) => s + x.value, 0)}
                centerLabel="异常"
                size={130}
              />
              <Box flex="1" minW="140px">
                <Legend items={exSlices.map((s) => ({ label: s.label, color: s.color, value: s.value }))} />
              </Box>
            </Flex>
          ) : (
            <Text fontSize="13px" color="labelSecondary">暂无异常记录</Text>
          )}
        </Card>
      </Flex>

      {/* 网点吞吐排行 + 城市流向 */}
      <Flex gap="16px" mb="16px" wrap="wrap">
        <Card p="18px" flex="1 1 460px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="14px">网点吞吐排行</Text>
          {data?.warehouse_rank?.length ? (
            <RankList
              items={data.warehouse_rank.map((w) => ({
                name: w.name,
                value: w.throughput,
              }))}
              unit=" 节点"
            />
          ) : (
            <Text fontSize="13px" color="labelSecondary">暂无数据</Text>
          )}
        </Card>

        <Card p="18px" flex="1 1 340px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="14px">热门线路 TOP</Text>
          {data?.routes?.length ? (
            <Flex direction="column" gap="8px">
              {data.routes.map((r, i) => (
                <Flex key={i} align="center" gap="10px" fontSize="13px">
                  <Flex
                    boxSize="20px"
                    flex="0 0 20px"
                    borderRadius="full"
                    bg="fill"
                    color="labelSecondary"
                    align="center"
                    justify="center"
                    fontSize="11px"
                    fontWeight={700}
                  >
                    {i + 1}
                  </Flex>
                  <Text flex="1" minW="0" color="label" noOfLines={1}>{r.route}</Text>
                  <Tag color="#007AFF">{r.cnt} 张</Tag>
                </Flex>
              ))}
            </Flex>
          ) : (
            <Text fontSize="13px" color="labelSecondary">暂无数据</Text>
          )}
        </Card>
      </Flex>

      {/* 司机负载 */}
      <Flex gap="16px" wrap="wrap">
        <Card p="18px" flex="1 1 460px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="14px">司机负载 TOP 6</Text>
          {data?.driver_load?.length ? (
            <RankList
              items={data.driver_load.map((d) => ({
                name: `${d.name}（${d.status === 'on_task' ? '任务中' : d.status === 'available' ? '空闲' : '休息'}）`,
                value: d.active_tasks,
              }))}
              unit=" 单"
            />
          ) : (
            <Text fontSize="13px" color="labelSecondary">暂无数据</Text>
          )}
        </Card>

        <Card p="18px" flex="1 1 340px" minW="0">
          <Text fontSize="17px" fontWeight={600} color="label" mb="14px">系统账号</Text>
          <Flex direction="column" gap="8px">
            {users.map((u) => (
              <Flex key={u.id} align="center" gap="10px" fontSize="13px">
                <Flex boxSize="28px" flex="0 0 28px" borderRadius="full" bg="fill" color="label" align="center" justify="center" fontSize="12px" fontWeight={700}>
                  {(u.nickname || u.username).slice(0, 1)}
                </Flex>
                <Box flex="1" minW="0">
                  <Text color="label" fontWeight={600} noOfLines={1}>{u.nickname || u.username}</Text>
                  <Text color="labelTertiary" fontSize="11.5px">{u.username}</Text>
                </Box>
                <Tag color={u.role === 'admin' ? '#007AFF' : u.role === 'dispatcher' ? '#5856D6' : '#FF9500'}>
                  {u.role === 'admin' ? '管理员' : u.role === 'dispatcher' ? '调度员' : '快递员'}
                </Tag>
              </Flex>
            ))}
          </Flex>
        </Card>
      </Flex>
    </Page>
  )
}
