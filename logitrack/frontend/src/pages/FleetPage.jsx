// 车辆司机：车辆档案 + 司机 + 当前任务。
// 数据来自 /ops/fleet/tasks（一次请求同时返回司机与其在途任务、车辆与其当前司机），
// 比分别拉两个 CRUD 列表再前端 join 更直接。
import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Empty, ErrorBlock, Loading, PageHeader, Stat, StatusPill, Tag,
} from '../components/ui'
import { RefreshIcon, TruckIcon, UsersIcon } from '../components/Icons'
import { DRIVER_STATUS, VEHICLE_STATUS, num, statusMeta } from '../constants'

export default function FleetPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('drivers')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.fleetTasks()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const drivers = data?.drivers || []
  const vehicles = data?.vehicles || []

  const totals = {
    onTask: drivers.filter((d) => d.status === 'on_task').length,
    idle: vehicles.filter((v) => v.status === 'idle').length,
    maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
    tasks: drivers.reduce((s, d) => s + (d.active_tasks || 0), 0),
  }

  return (
    <Page>
      <PageHeader
        title="车辆司机"
        sub="车辆档案 · 司机信息 · 当前任务负载"
        actions={
          <Btn variant="secondary" onClick={load}>
            <RefreshIcon size={15} />
            刷新
          </Btn>
        }
      />

      <Flex gap="12px" mb="18px" wrap="wrap">
        <Box flex="1 1 150px"><Stat label="司机总数" value={drivers.length} hint={`任务中 ${totals.onTask} 名`} /></Box>
        <Box flex="1 1 150px"><Stat label="车辆总数" value={vehicles.length} hint={`空闲 ${totals.idle} 台`} /></Box>
        <Box flex="1 1 150px"><Stat label="在途任务" value={totals.tasks} color="#007AFF" hint="所有司机未完结运单数" /></Box>
        <Box flex="1 1 150px"><Stat label="维保中" value={totals.maintenance} color="#FF9500" hint="暂不可调度" /></Box>
      </Flex>

      {/* 分段控件：司机 / 车辆 */}
      <Flex p="3px" bg="fill" borderRadius="full" mb="18px" maxW="280px">
        {[
          { k: 'drivers', label: '司机', icon: UsersIcon },
          { k: 'vehicles', label: '车辆', icon: TruckIcon },
        ].map((t) => (
          <Box
            key={t.k}
            as="button"
            flex="1"
            py="7px"
            borderRadius="full"
            fontSize="14px"
            fontWeight={600}
            border="none"
            cursor="pointer"
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap="6px"
            transition="all 250ms cubic-bezier(0.4,0,0.2,1)"
            bg={tab === t.k ? 'cardBg' : 'transparent'}
            color={tab === t.k ? 'label' : 'labelSecondary'}
            boxShadow={tab === t.k ? 'card' : 'none'}
            onClick={() => setTab(t.k)}
          >
            <t.icon size={14} />
            {t.label}
          </Box>
        ))}
      </Flex>

      {loading ? (
        <Loading rows={4} height="130px" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : tab === 'drivers' ? (
        !drivers.length ? (
          <Empty icon={<UsersIcon size={24} />} title="暂无司机档案" description="司机数据来自种子或后台维护。" />
        ) : (
          <Flex direction="column" gap="12px">
            {drivers.map((d) => {
              const st = DRIVER_STATUS[d.status] || { label: d.status, color: '#8E8E93' }
              return (
                <Card key={d.id} p="16px">
                  <Flex align="flex-start" gap="12px" wrap="wrap">
                    <Flex boxSize="40px" flex="0 0 40px" borderRadius="full" bg="var(--tint-soft)" color="brand.600" align="center" justify="center" fontSize="15px" fontWeight={700}>
                      {d.name.slice(0, 1)}
                    </Flex>

                    <Box flex="1" minW="0">
                      <Flex align="center" gap="8px" wrap="wrap" mb="4px">
                        <Text fontSize="15px" fontWeight={700} color="label">{d.name}</Text>
                        <Tag color={st.color}>{st.label}</Tag>
                        <Tag>评分 {d.rating}</Tag>
                        <Tag>已完成 {d.completed_count} 单</Tag>
                        {d.active_tasks ? <Tag color="#007AFF">在途 {d.active_tasks}</Tag> : null}
                      </Flex>

                      <Flex gap="14px" wrap="wrap" fontSize="12px" color="labelTertiary" mb="8px">
                        <Box as="span">{d.phone}</Box>
                        <Box as="span">驾照 {d.license_no || '—'}</Box>
                        <Box as="span">所属 {d.warehouse?.name || '—'}</Box>
                        {d.vehicle ? (
                          <Box as="span">车辆 {d.vehicle.plate_no} · {d.vehicle.vtype}</Box>
                        ) : (
                          <Box as="span">未绑定车辆</Box>
                        )}
                      </Flex>

                      {/* 当前任务列表 */}
                      {d.tasks?.length ? (
                        <Flex direction="column" gap="5px">
                          {d.tasks.map((t) => {
                            const tm = statusMeta(t.status)
                            return (
                              <Flex key={t.id} align="center" gap="9px" p="8px 10px" bg="fill" borderRadius="md" fontSize="13px">
                                <Box as={Link} to={`/waybills/${t.id}`} textDecoration="none" flex="0 0 auto">
                                  <Text fontFamily="mono" fontWeight={600} color="brand.600">{t.waybill_no}</Text>
                                </Box>
                                <StatusPill meta={tm} />
                                <Text color="labelSecondary" flex="1" minW="0" noOfLines={1}>
                                  {t.receiver_name} · {t.dest_city}
                                </Text>
                                <Text color="labelTertiary" fontSize="12px" flex="0 0 auto">
                                  {t.estimated_delivery ? t.estimated_delivery.slice(5, 16) : ''}
                                </Text>
                              </Flex>
                            )
                          })}
                        </Flex>
                      ) : (
                        <Text fontSize="13px" color="labelTertiary">当前没有在途任务</Text>
                      )}
                    </Box>
                  </Flex>
                </Card>
              )
            })}
          </Flex>
        )
      ) : !vehicles.length ? (
        <Empty icon={<TruckIcon size={24} />} title="暂无车辆档案" description="车辆数据来自种子或后台维护。" />
      ) : (
        <Flex direction="column" gap="12px">
          {vehicles.map((v) => {
            const st = VEHICLE_STATUS[v.status] || { label: v.status, color: '#8E8E93' }
            return (
              <Card key={v.id} p="16px">
                <Flex align="flex-start" gap="12px" wrap="wrap">
                  <Flex boxSize="40px" flex="0 0 40px" borderRadius="12px" bg="var(--tint-soft)" color="brand.600" align="center" justify="center">
                    <TruckIcon size={20} />
                  </Flex>

                  <Box flex="1" minW="0">
                    <Flex align="center" gap="8px" wrap="wrap" mb="4px">
                      <Text fontSize="15px" fontWeight={700} color="label" fontFamily="mono">{v.plate_no}</Text>
                      <Tag color={st.color}>{st.label}</Tag>
                      <Tag>{v.vtype}</Tag>
                      {v.active_tasks ? <Tag color="#007AFF">在途 {v.active_tasks}</Tag> : null}
                    </Flex>

                    <Flex gap="14px" wrap="wrap" fontSize="12px" color="labelTertiary">
                      <Box as="span">载重 {num(v.load_capacity, 1)} t / 容积 {num(v.volume_capacity, 0)} m³</Box>
                      <Box as="span">里程 {num(v.mileage, 0)} km</Box>
                      <Box as="span">下次保养 {v.next_service || '—'}</Box>
                      <Box as="span">所属 {v.warehouse?.name || '—'}</Box>
                      {v.driver ? (
                        <Box as="span">司机 {v.driver.name} · {v.driver.phone}</Box>
                      ) : (
                        <Box as="span">未绑定司机</Box>
                      )}
                    </Flex>
                  </Box>
                </Flex>
              </Card>
            )
          })}
        </Flex>
      )}
    </Page>
  )
}
