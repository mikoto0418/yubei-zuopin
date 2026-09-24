// 异常件处理：异常列表 + 处理（改址重投 / 原路退回 / 理赔结案 / 重新派送）+ 关闭。
//
// 处理动作会联动运单状态机（如「原路退回」→ 运单 status 变 returned），
// 所以处理后要同时刷新列表与运单状态，不能只改本地 state。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Empty, ErrorBlock, Loading, Modal, PageHeader, Pagination,
  SelectField, Stat, StatusPill, Tag, TextArea,
} from '../components/ui'
import { AlertIcon, CheckIcon, SparkIcon, XIcon } from '../components/Icons'
import { EXCEPTION_TYPES, EX_STATUS, SEVERITIES, can, formatDateTime, statusMeta } from '../constants'

export default function ExceptionsPage() {
  const { user } = useAuth()
  const canHandle = can.handleException(user)

  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [q, setQ] = useState('')

  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolveForm, setResolveForm] = useState({ action: '', resolution: '' })
  const [actions, setActions] = useState([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.exceptions({ page, pageSize: 10, ex_status: statusFilter, ex_type: typeFilter, q: q.trim() }),
      api.exceptionStats(),
    ])
      .then(([d, s]) => { setData(d); setStats(s) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, statusFilter, typeFilter, q])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  useEffect(() => {
    if (!canHandle) return
    api.exceptionActions().then(setActions).catch(() => {})
  }, [canHandle])

  const list = data?.list || []

  async function doResolve() {
    if (!resolveTarget) return
    if (!resolveForm.action) {
      setActionError('请选择处理方式')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.resolveException(resolveTarget.id, resolveForm)
      setResolveTarget(null)
      setResolveForm({ action: '', resolution: '' })
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doClose(ex) {
    setBusy(true)
    setActionError('')
    try {
      await api.closeException(ex.id, {})
      load()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

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

  const typeStats = useMemo(() => {
    const m = new Map((stats?.by_type || []).map((r) => [r.k, r.c]))
    return EXCEPTION_TYPES.map((t) => ({ type: t, count: m.get(t) || 0 }))
  }, [stats])

  return (
    <Page>
      <PageHeader
        title="异常件处理"
        sub="登记 / 处理 / 关闭异常运单 · AI 可自动识别长时间无扫描的滞留件"
        actions={
          canHandle ? (
            <Btn variant="secondary" loading={aiLoading} onClick={runStale}>
              <SparkIcon size={15} />
              AI 滞留识别
            </Btn>
          ) : null
        }
      />

      {/* 统计卡 */}
      {stats ? (
        <Flex gap="12px" mb="18px" wrap="wrap">
          <Box flex="1 1 150px"><Stat label="异常总数" value={stats.total} hint="含已解决与已关闭" /></Box>
          <Box flex="1 1 150px"><Stat label="待处理" value={stats.open} color="#FF3B30" hint="需要立即介入" /></Box>
          <Box flex="1 1 150px"><Stat label="已解决" value={stats.resolved} color="#34C759" hint="已处理未归档" /></Box>
          {typeStats.map((t) => (
            <Box key={t.type} flex="1 1 120px">
              <Stat label={t.type} value={t.count} hint="按类型统计" />
            </Box>
          ))}
        </Flex>
      ) : null}

      {/* AI 识别结果 */}
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
                {aiResult.created_exceptions > 0 ? (
                  <Tag color="#FF3B30">新建 {aiResult.created_exceptions} 条异常</Tag>
                ) : null}
              </Flex>
              <Text fontSize="13px" color="labelSecondary" mt="6px">{aiResult.summary}</Text>
              <Btn variant="plain" size="sm" mt="8px" onClick={() => setAiResult(null)}>收起</Btn>
            </Box>
          </Flex>
        </Card>
      ) : null}

      {actionError && !resolveTarget ? (
        <Card mb="16px" p="14px" bg="rgba(255,59,48,0.08)" boxShadow="none">
          <Text fontSize="13px" color="red.500">{actionError}</Text>
        </Card>
      ) : null}

      {/* 筛选 */}
      <Card p="16px" mb="16px">
        <Flex gap="10px" wrap="wrap" align="flex-end">
          <Box w="150px">
            <SelectField
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1) }}
              placeholder="全部状态"
              options={Object.entries(EX_STATUS).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Box>
          <Box w="150px">
            <SelectField
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1) }}
              placeholder="全部类型"
              options={EXCEPTION_TYPES}
            />
          </Box>
          <Box flex="1 1 220px">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
              placeholder="搜索运单号 / 描述 / 处理人"
              aria-label="搜索异常"
              style={{
                width: '100%', height: '38px', padding: '0 12px', fontSize: '14px',
                background: 'var(--fill-secondary)', border: '2px solid transparent',
                borderRadius: '12px', color: 'var(--label)', outline: 'none',
              }}
            />
          </Box>
          {(statusFilter || typeFilter || q) ? (
            <Btn variant="plain" size="sm" onClick={() => { setStatusFilter(''); setTypeFilter(''); setQ(''); setPage(1) }}>
              清空
            </Btn>
          ) : null}
        </Flex>
      </Card>

      {loading ? (
        <Loading rows={4} height="140px" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : !list.length ? (
        <Empty
          icon={<CheckIcon size={24} />}
          title="没有异常件"
          description="当前筛选条件下没有异常记录。异常件会由人工登记或 AI 滞留识别自动生成。"
        />
      ) : (
        <>
          <Flex direction="column" gap="12px">
            {list.map((ex) => {
              const st = EX_STATUS[ex.ex_status] || { label: ex.ex_status, color: '#8E8E93' }
              const wbMeta = ex.waybill_status ? statusMeta(ex.waybill_status) : null
              const isOpen = ex.ex_status === 'open' || ex.ex_status === 'processing'
              return (
                <Card key={ex.id} p="16px">
                  <Flex align="flex-start" gap="12px" wrap="wrap">
                    <Flex
                      boxSize="36px"
                      flex="0 0 36px"
                      borderRadius="10px"
                      bg="rgba(255,59,48,0.10)"
                      color="red.500"
                      align="center"
                      justify="center"
                    >
                      <AlertIcon size={18} />
                    </Flex>

                    <Box flex="1" minW="0">
                      <Flex align="center" gap="8px" wrap="wrap" mb="6px">
                        <Box as={Link} to={`/waybills/${ex.waybill_id}`} textDecoration="none">
                          <Text fontSize="15px" fontWeight={700} color="brand.600" fontFamily="mono">
                            {ex.waybill_no}
                          </Text>
                        </Box>
                        <Tag color={st.color}>{st.label}</Tag>
                        <Tag color={ex.severity === '严重' || ex.severity === '紧急' ? '#FF3B30' : undefined}>
                          {ex.ex_type} · {ex.severity}
                        </Tag>
                        {ex.source === 'ai' ? <Tag color="#5856D6">AI 识别</Tag> : null}
                        {wbMeta ? <StatusPill meta={wbMeta} /> : null}
                      </Flex>

                      <Text fontSize="14px" color="label" mb="6px">{ex.description || '（无描述）'}</Text>

                      <Flex gap="14px" wrap="wrap" fontSize="12px" color="labelTertiary">
                        <Box as="span">收件人 {ex.receiver_name} · {ex.receiver_phone}</Box>
                        <Box as="span">目的城市 {ex.dest_city || '—'}</Box>
                        <Box as="span">登记 {formatDateTime(ex.created_at)}</Box>
                        {ex.handler ? <Box as="span">处理人 {ex.handler}</Box> : null}
                        {ex.resolved_at ? <Box as="span">处理于 {formatDateTime(ex.resolved_at)}</Box> : null}
                      </Flex>

                      {ex.resolution ? (
                        <Box mt="8px" p="10px 12px" bg="fill" borderRadius="md">
                          <Text fontSize="13px" color="labelSecondary">处理结果：{ex.resolution}</Text>
                        </Box>
                      ) : null}
                    </Box>

                    {canHandle && isOpen ? (
                      <Flex gap="8px" flex="0 0 auto" direction="column">
                        <Btn
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setActionError('')
                            setResolveTarget(ex)
                            setResolveForm({ action: '', resolution: '' })
                          }}
                        >
                          处理
                        </Btn>
                        <Btn variant="plain" size="sm" onClick={() => doClose(ex)} loading={busy}>
                          关闭
                        </Btn>
                      </Flex>
                    ) : null}
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

      {/* 处理弹窗 */}
      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title={`处理异常 · ${resolveTarget?.waybill_no || ''}`}
        footer={
          <>
            <Btn variant="plain" onClick={() => setResolveTarget(null)}>取消</Btn>
            <Btn variant="primary" loading={busy} onClick={doResolve}>确认处理</Btn>
          </>
        }
      >
        {resolveTarget ? (
          <Flex direction="column" gap="14px">
            <Box p="12px" borderRadius="md" bg="fill">
              <Text fontSize="13px" color="labelSecondary">异常详情</Text>
              <Text fontSize="14px" color="label" mt="4px">
                {resolveTarget.ex_type} · {resolveTarget.severity}
              </Text>
              <Text fontSize="13px" color="labelSecondary" mt="4px">
                {resolveTarget.description}
              </Text>
            </Box>

            <Box>
              <Text fontSize="13px" fontWeight={600} color="labelSecondary" mb="6px">
                处理方式
              </Text>
              <SelectField
                value={resolveForm.action}
                onChange={(v) => {
                  const preset = actions.find((a) => a.action === v)
                  setResolveForm({ action: v, resolution: preset?.note || '' })
                }}
                placeholder="请选择处理方式"
                options={actions.map((a) => ({
                  value: a.action,
                  label: a.status ? `${a.label}（运单将变为「${statusMeta(a.status).label}」）` : a.label,
                }))}
              />
            </Box>

            <Box>
              <Text fontSize="13px" fontWeight="600" color="labelSecondary" mb="6px">
                处理说明
              </Text>
              <TextArea
                value={resolveForm.resolution}
                onChange={(v) => setResolveForm((f) => ({ ...f, resolution: v }))}
                rows={3}
                placeholder="补充处理说明，会记入异常记录"
              />
            </Box>

            {actionError ? <Text fontSize="13px" color="red.500">{actionError}</Text> : null}
          </Flex>
        ) : null}
      </Modal>
    </Page>
  )
}
