// 通知中心：状态变更 / 派单 / 异常提醒（模拟站内信）。
import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Empty, ErrorBlock, Loading, PageHeader, Pagination, Stat, Tag,
} from '../components/ui'
import { AlertIcon, BellIcon, CheckIcon } from '../components/Icons'
import { formatDateTime, timeAgo } from '../constants'

const TYPE_META = {
  status: { label: '状态更新', color: '#007AFF' },
  alert: { label: '异常提醒', color: '#FF3B30' },
  dispatch: { label: '派单', color: '#5856D6' },
  system: { label: '系统', color: '#8E8E93' },
}

export default function NotificationsPage() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.notifications({ page, pageSize: 15, ntype: typeFilter, unread: unreadOnly ? 1 : '' })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, typeFilter, unreadOnly])

  useEffect(() => { load() }, [load])

  async function markRead(id) {
    try {
      await api.readNotification(id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function markAll() {
    setBusy(true)
    try {
      await api.readAllNotifications()
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const list = data?.list || []
  const unread = data?.unread || 0

  return (
    <Page>
      <PageHeader
        title="通知中心"
        sub="运单状态变更 · 派单通知 · 异常提醒"
        actions={
          <Btn variant="secondary" loading={busy} disabled={!unread} onClick={markAll}>
            <CheckIcon size={15} />
            全部标为已读
          </Btn>
        }
      />

      <Flex gap="12px" mb="18px" wrap="wrap">
        <Box flex="1 1 160px"><Stat label="通知总数" value={data?.total ?? 0} hint={isAdmin ? '管理员可见全部' : '仅显示与你相关的'} /></Box>
        <Box flex="1 1 160px"><Stat label="未读" value={unread} color="#FF3B30" hint="点击单条可标记已读" /></Box>
        <Box flex="1 1 160px"><Stat label="当前页" value={list.length} hint={`第 ${page} 页`} /></Box>
      </Flex>

      {/* 筛选 */}
      <Flex gap="6px" mb="16px" wrap="wrap" align="center">
        {[{ k: '', label: '全部' }, ...Object.entries(TYPE_META).map(([k, v]) => ({ k, label: v.label }))].map((f) => {
          const active = typeFilter === f.k
          const meta = f.k ? TYPE_META[f.k] : null
          return (
            <Box
              key={f.k || 'all'}
              as="button"
              onClick={() => { setTypeFilter(f.k); setPage(1) }}
              px="13px"
              py="6px"
              borderRadius="full"
              fontSize="13px"
              fontWeight={active ? 600 : 500}
              border="none"
              cursor="pointer"
              transition="all 150ms"
              bg={active ? (meta ? `${meta.color}1F` : 'var(--tint-soft)') : 'var(--fill-secondary)'}
              color={active ? (meta ? meta.color : 'var(--tint)') : 'var(--label-secondary)'}
            >
              {f.label}
            </Box>
          )
        })}
        <Box
          as="button"
          onClick={() => { setUnreadOnly((v) => !v); setPage(1) }}
          px="13px"
          py="6px"
          borderRadius="full"
          fontSize="13px"
          fontWeight={unreadOnly ? 600 : 500}
          border="none"
          cursor="pointer"
          transition="all 150ms"
          bg={unreadOnly ? 'rgba(255,59,48,0.12)' : 'var(--fill-secondary)'}
          color={unreadOnly ? '#FF3B30' : 'var(--label-secondary)'}
        >
          只看未读
        </Box>
      </Flex>

      {loading ? (
        <Loading rows={5} height="76px" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : !list.length ? (
        <Empty
          icon={<BellIcon size={24} />}
          title={unreadOnly || typeFilter ? '没有匹配的通知' : '暂无通知'}
          description={unreadOnly || typeFilter ? '试试切换筛选条件。' : '运单状态变化时会在这里生成通知。'}
          action={unreadOnly || typeFilter ? '清空筛选' : undefined}
          onAction={unreadOnly || typeFilter ? () => { setTypeFilter(''); setUnreadOnly(false) } : undefined}
        />
      ) : (
        <>
          <Flex direction="column" gap="10px">
            {list.map((n) => {
              const meta = TYPE_META[n.ntype] || TYPE_META.system
              return (
                <Card key={n.id} p="14px" bg={n.is_read ? 'cardBg' : 'var(--tint-soft)'}>
                  <Flex align="flex-start" gap="12px">
                    <Flex
                      boxSize="32px"
                      flex="0 0 32px"
                      borderRadius="9px"
                      align="center"
                      justify="center"
                      style={{ background: `${meta.color}1F`, color: meta.color }}
                    >
                      {n.ntype === 'alert' ? <AlertIcon size={16} /> : <BellIcon size={16} />}
                    </Flex>

                    <Box flex="1" minW="0">
                      <Flex align="center" gap="8px" wrap="wrap" mb="3px">
                        <Text fontSize="14px" fontWeight={600} color="label">{n.title}</Text>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        {!n.is_read ? <Tag color="#FF3B30">未读</Tag> : null}
                        <Text fontSize="12px" color="labelTertiary" ml="auto">
                          {timeAgo(n.created_at)}
                        </Text>
                      </Flex>

                      {n.body ? (
                        <Text fontSize="13px" color="labelSecondary" mb="4px">{n.body}</Text>
                      ) : null}

                      <Flex gap="12px" wrap="wrap" fontSize="12px" color="labelTertiary" align="center">
                        <Box as="span">{formatDateTime(n.created_at)}</Box>
                        {n.waybill_id ? (
                          <Box as={Link} to={`/waybills/${n.waybill_id}`} color="brand.600" textDecoration="none">
                            查看运单 →
                          </Box>
                        ) : null}
                        {!n.is_read ? (
                          <Box
                            as="button"
                            onClick={() => markRead(n.id)}
                            bg="transparent"
                            border="none"
                            color="brand.600"
                            fontSize="12px"
                            cursor="pointer"
                            p="0"
                          >
                            标为已读
                          </Box>
                        ) : null}
                      </Flex>
                    </Box>
                  </Flex>
                </Card>
              )
            })}
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
