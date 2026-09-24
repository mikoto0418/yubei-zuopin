import { useEffect, useState } from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Btn, Card, Field, TextField } from '../components/ui'
import { RouteIcon, BoxIcon, TruckIcon } from '../components/Icons'

// 三个演示账号，一键填入——评审不需要记密码
const DEMO = [
  { username: 'admin', password: 'admin123', label: '总部管理员', desc: '全量数据 + 概览看板', color: '#007AFF' },
  { username: 'dispatcher1', password: 'dispatcher123', label: '调度员', desc: '调度台 + 异常处理 + 网点车辆', color: '#5856D6' },
  { username: 'courier1', password: 'courier123', label: '快递员', desc: '运单查询 + 扫描 + 通知', color: '#FF9500' },
]

export default function LoginPage() {
  const { login, register, kicked, clearKicked } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', nickname: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (kicked) clearKicked()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const to = location.state?.from || '/'

  async function submit(e) {
    e?.preventDefault()
    setError('')
    if (!form.username.trim() || !form.password) {
      setError('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.username.trim(), form.password)
      } else {
        if (form.password.length < 6) throw new Error('密码至少 6 位')
        await register({
          username: form.username.trim(),
          password: form.password,
          nickname: form.nickname || form.username.trim(),
          phone: form.phone || '',
        })
      }
      navigate(to, { replace: true })
    } catch (err) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  function fill(d) {
    setMode('login')
    setForm((f) => ({ ...f, username: d.username, password: d.password }))
    setError('')
  }

  return (
    <Flex minH="100vh" align="center" justify="center" px="20px" py="40px" bg="pageBg">
      <Box w="100%" maxW="940px">
        <Flex gap="28px" align="stretch" direction={{ base: 'column', md: 'row' }}>
          {/* 左侧：品牌与说明 */}
          <Box flex="1" display="flex" flexDirection="column" justifyContent="center" py="20px">
            <Flex align="center" gap="12px" mb="18px">
              <Flex boxSize="46px" borderRadius="14px" bg="brand.500" color="#fff" align="center" justify="center">
                <RouteIcon size={24} />
              </Flex>
              <Box>
                <Heading as="h1" fontSize="28px" fontWeight={700} letterSpacing="-0.02em" color="label" lineHeight={1.15}>
                  LogiTrack
                </Heading>
                <Text fontSize="13px" color="labelSecondary">
                  物流运单跟踪平台
                </Text>
              </Box>
            </Flex>

            <Text fontSize="15px" color="labelSecondary" lineHeight={1.7} mb="20px">
              从揽收到签收的全链路跟踪。中轴时间轴按状态着色，
              运输中的站点带流动虚线；右侧地图与时间轴双向联动，
              点节点飞地图，点标记滚时间轴。
            </Text>

            <Flex direction="column" gap="10px">
              {[
                { icon: BoxIcon, title: '全链路状态机', desc: '8 个状态 + 异常分支，非法流转后端直接 400' },
                { icon: TruckIcon, title: 'AI 落库闭环', desc: '时效预测写回运单，滞留识别自动建异常单' },
                { icon: RouteIcon, title: '时间轴 × 地图', desc: '两侧共用一份状态色映射，选中即同步' },
              ].map((f, i) => (
                <Flex key={i} gap="10px" align="flex-start">
                  <Flex boxSize="30px" flex="0 0 30px" borderRadius="9px" bg="fill" color="brand.600" align="center" justify="center">
                    <f.icon size={16} />
                  </Flex>
                  <Box>
                    <Text fontSize="14px" fontWeight={600} color="label">
                      {f.title}
                    </Text>
                    <Text fontSize="13px" color="labelSecondary">
                      {f.desc}
                    </Text>
                  </Box>
                </Flex>
              ))}
            </Flex>
          </Box>

          {/* 右侧：登录 / 注册表单 */}
          <Box w={{ base: '100%', md: '380px' }} flex="0 0 auto">
            <Card p="24px">
              <Flex
                mb="18px"
                p="3px"
                bg="fill"
                borderRadius="full"
                position="relative"
              >
                {[
                  { k: 'login', label: '登录' },
                  { k: 'register', label: '注册' },
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
                    transition="all 250ms cubic-bezier(0.4,0,0.2,1)"
                    bg={mode === t.k ? 'cardBg' : 'transparent'}
                    color={mode === t.k ? 'label' : 'labelSecondary'}
                    boxShadow={mode === t.k ? 'card' : 'none'}
                    onClick={() => { setMode(t.k); setError('') }}
                  >
                    {t.label}
                  </Box>
                ))}
              </Flex>

              {kicked ? (
                <Box mb="14px" p="10px 12px" borderRadius="md" bg="rgba(255,149,0,0.12)">
                  <Text fontSize="13px" color="orange.600">
                    登录已过期，请重新登录
                  </Text>
                </Box>
              ) : null}

              <form onSubmit={submit}>
                <Flex direction="column" gap="14px">
                  <Field label="用户名" required>
                    <TextField
                      value={form.username}
                      onChange={(v) => setForm((f) => ({ ...f, username: v }))}
                      placeholder="请输入用户名"
                      autoComplete="username"
                    />
                  </Field>

                  {mode === 'register' ? (
                    <>
                      <Field label="昵称" hint="可留空，默认使用用户名">
                        <TextField
                          value={form.nickname}
                          onChange={(v) => setForm((f) => ({ ...f, nickname: v }))}
                          placeholder="如：王力强"
                        />
                      </Field>
                      <Field label="手机号" hint="可留空。注册账号默认是快递员角色">
                        <TextField
                          value={form.phone}
                          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                          placeholder="11 位手机号"
                        />
                      </Field>
                    </>
                  ) : null}

                  <Field label="密码" required error={error}>
                    <TextField
                      type="password"
                      value={form.password}
                      onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                      placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                  </Field>

                  <Btn variant="primary" type="submit" loading={loading} loadingText="处理中…" w="100%" mt="2px">
                    {mode === 'login' ? '登录' : '注册并登录'}
                  </Btn>
                </Flex>
              </form>

              {/* 演示账号快捷入口 */}
              <Box mt="20px" pt="16px" borderTop="1px solid" borderColor="sep">
                <Text fontSize="12px" color="labelTertiary" mb="10px">
                  演示账号（点击填入）
                </Text>
                <Flex direction="column" gap="7px">
                  {DEMO.map((d) => (
                    <Flex
                      key={d.username}
                      as="button"
                      onClick={() => fill(d)}
                      align="center"
                      gap="10px"
                      p="9px 11px"
                      borderRadius="md"
                      bg="fill"
                      border="none"
                      cursor="pointer"
                      textAlign="left"
                      _hover={{ bg: 'var(--tint-soft)' }}
                      transition="background 150ms"
                    >
                      <Box boxSize="7px" borderRadius="full" style={{ background: d.color }} flex="0 0 7px" />
                      <Box flex="1" minW="0">
                        <Text fontSize="13px" fontWeight={600} color="label" lineHeight={1.25}>
                          {d.label}
                        </Text>
                        <Text fontSize="11.5px" color="labelTertiary" lineHeight={1.25}>
                          {d.username} / {d.password}
                        </Text>
                      </Box>
                      <Text fontSize="11.5px" color="labelTertiary" flex="0 0 auto">
                        {d.desc}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </Card>
          </Box>
        </Flex>
      </Box>
    </Flex>
  )
}
