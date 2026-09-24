// 运单创建：寄件人 + 收件人 + 包裹信息（重量/体积/物品类型/保价）。
// 三段式表单，段落之间用分隔线，符合 Apple 分组表单的心智。
// 寄件人可以从历史客户里选（customer 表），选完自动带出电话与地址。
import { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Page } from '../components/AppLayout'
import {
  Btn, Card, Field, PageHeader, SelectField, TextArea, TextField,
} from '../components/ui'
import { PlusIcon, TruckIcon, XIcon } from '../components/Icons'
import { GOODS_TYPES, PAYMENT_METHODS, money } from '../constants'

const EMPTY_PKG = { name: '', quantity: 1, weight: '', volume: '', note: '' }

export default function WaybillCreatePage() {
  const navigate = useNavigate()
  const [options, setOptions] = useState({ warehouses: [], cities: [], goods_types: GOODS_TYPES, payment_methods: PAYMENT_METHODS })
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState({
    sender_name: '', sender_phone: '', sender_address: '',
    receiver_name: '', receiver_phone: '', receiver_address: '',
    origin_warehouse_id: '', dest_warehouse_id: '',
    goods_type: GOODS_TYPES[0], weight: '', volume: '',
    insured: false, insured_value: '', payment_method: PAYMENT_METHODS[0],
    remark: '',
  })
  const [packages, setPackages] = useState([{ ...EMPTY_PKG }])
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.options().then(setOptions).catch(() => {})
    api.list('customers', { pageSize: 100 }).then((d) => setCustomers(d.list || [])).catch(() => {})
  }, [])

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  // 实时算运费：与后端创建接口的本地规则一致，让用户在提交前就看到金额
  const freight = useMemo(() => {
    const w = Number(form.weight) || 0
    const v = Number(form.volume) || 0
    const iv = form.insured ? Number(form.insured_value) || 0 : 0
    return Number((12 + w * 3.5 + v * 120 + iv * 0.003).toFixed(2))
  }, [form.weight, form.volume, form.insured, form.insured_value])

  function pickCustomer(c, role) {
    if (!c) return
    if (role === 'sender') {
      setForm((f) => ({ ...f, sender_name: c.name, sender_phone: c.phone, sender_address: c.address }))
    } else {
      setForm((f) => ({ ...f, receiver_name: c.name, receiver_phone: c.phone, receiver_address: c.address }))
    }
  }

  function updatePkg(i, k, v) {
    setPackages((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)))
  }

  function validate() {
    const e = {}
    if (!form.sender_name.trim()) e.sender_name = '请填写寄件人姓名'
    if (!/^1\d{10}$/.test(form.sender_phone.trim()) && !/^0\d{2,3}-?\d{7,8}$/.test(form.sender_phone.trim())) {
      e.sender_phone = '请填写正确的手机号或座机号'
    }
    if (!form.receiver_name.trim()) e.receiver_name = '请填写收件人姓名'
    if (!/^1\d{10}$/.test(form.receiver_phone.trim()) && !/^0\d{2,3}-?\d{7,8}$/.test(form.receiver_phone.trim())) {
      e.receiver_phone = '请填写正确的手机号或座机号'
    }
    if (!form.receiver_address.trim()) e.receiver_address = '请填写收件地址'
    if (form.insured && !(Number(form.insured_value) > 0)) e.insured_value = '保价金额需大于 0'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    setSubmitError('')
    if (!validate()) return
    setLoading(true)
    try {
      const payload = {
        ...form,
        origin_warehouse_id: Number(form.origin_warehouse_id) || 0,
        dest_warehouse_id: Number(form.dest_warehouse_id) || 0,
        weight: Number(form.weight) || 0,
        volume: Number(form.volume) || 0,
        insured: form.insured ? 1 : 0,
        insured_value: form.insured ? Number(form.insured_value) || 0 : 0,
        freight,
        packages: packages
          .filter((p) => String(p.name || '').trim())
          .map((p) => ({
            name: p.name,
            quantity: Number(p.quantity) || 1,
            weight: Number(p.weight) || 0,
            volume: Number(p.volume) || 0,
            note: p.note || '',
          })),
      }
      const created = await api.createWaybill(payload)
      navigate(`/waybills/${created.id}`)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const whOptions = (options.warehouses || []).map((w) => ({ value: String(w.id), label: `${w.name}（${w.city}）` }))
  const customerOptions = customers.map((c) => ({
    value: String(c.id),
    label: `${c.name} · ${c.phone}${c.company ? ` · ${c.company}` : ''}`,
  }))

  return (
    <Page maxW="960px">
      <PageHeader
        title="创建运单"
        sub="填写寄收件人与包裹信息，提交后自动生成运单号与预计送达时间"
        actions={<Btn variant="plain" onClick={() => navigate(-1)}>取消</Btn>}
      />

      {submitError ? (
        <Card mb="16px" p="14px" bg="rgba(255,59,48,0.08)" boxShadow="none">
          <Text fontSize="13px" color="red.500">{submitError}</Text>
        </Card>
      ) : null}

      {/* 寄件人 */}
      <Card p="20px" mb="16px">
        <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
          <Text fontSize="17px" fontWeight={600} color="label">寄件人信息</Text>
          {customerOptions.length ? (
            <Box w="260px">
              <SelectField
                value=""
                onChange={(v) => pickCustomer(customers.find((c) => String(c.id) === v), 'sender')}
                placeholder="从历史客户选择"
                options={customerOptions}
              />
            </Box>
          ) : null}
        </Flex>
        <Flex gap="14px" wrap="wrap">
          <Box flex="1 1 220px"><Field label="姓名" required error={errors.sender_name}>
            <TextField value={form.sender_name} onChange={set('sender_name')} placeholder="寄件人姓名" invalid={Boolean(errors.sender_name)} />
          </Field></Box>
          <Box flex="1 1 220px"><Field label="电话" required error={errors.sender_phone}>
            <TextField value={form.sender_phone} onChange={set('sender_phone')} placeholder="手机号或座机号" invalid={Boolean(errors.sender_phone)} />
          </Field></Box>
        </Flex>
        <Box mt="14px">
          <Field label="寄件地址">
            <TextField value={form.sender_address} onChange={set('sender_address')} placeholder="省 / 市 / 区 + 详细地址" />
          </Field>
        </Box>
      </Card>

      {/* 收件人 */}
      <Card p="20px" mb="16px">
        <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
          <Text fontSize="17px" fontWeight={600} color="label">收件人信息</Text>
          {customerOptions.length ? (
            <Box w="260px">
              <SelectField
                value=""
                onChange={(v) => pickCustomer(customers.find((c) => String(c.id) === v), 'receiver')}
                placeholder="从历史客户选择"
                options={customerOptions}
              />
            </Box>
          ) : null}
        </Flex>
        <Flex gap="14px" wrap="wrap">
          <Box flex="1 1 220px"><Field label="姓名" required error={errors.receiver_name}>
            <TextField value={form.receiver_name} onChange={set('receiver_name')} placeholder="收件人姓名" invalid={Boolean(errors.receiver_name)} />
          </Field></Box>
          <Box flex="1 1 220px"><Field label="电话" required error={errors.receiver_phone}>
            <TextField value={form.receiver_phone} onChange={set('receiver_phone')} placeholder="手机号或座机号" invalid={Boolean(errors.receiver_phone)} />
          </Field></Box>
        </Flex>
        <Box mt="14px">
          <Field label="收件地址" required error={errors.receiver_address}>
            <TextField value={form.receiver_address} onChange={set('receiver_address')} placeholder="省 / 市 / 区 + 详细地址" invalid={Boolean(errors.receiver_address)} />
          </Field>
        </Box>
      </Card>

      {/* 路由与货物 */}
      <Card p="20px" mb="16px">
        <Text fontSize="17px" fontWeight={600} color="label" mb="14px">路由与货物</Text>
        <Flex gap="14px" wrap="wrap">
          <Box flex="1 1 260px"><Field label="发出网点" hint="决定时间轴的起点坐标">
            <SelectField value={form.origin_warehouse_id} onChange={set('origin_warehouse_id')} placeholder="请选择发出网点" options={whOptions} />
          </Field></Box>
          <Box flex="1 1 260px"><Field label="目的网点" hint="决定时间轴的终点坐标">
            <SelectField value={form.dest_warehouse_id} onChange={set('dest_warehouse_id')} placeholder="请选择目的网点" options={whOptions} />
          </Field></Box>
        </Flex>
        <Flex gap="14px" wrap="wrap" mt="14px">
          <Box flex="1 1 180px"><Field label="货物类型" required>
            <SelectField value={form.goods_type} onChange={set('goods_type')} options={options.goods_types || GOODS_TYPES} />
          </Field></Box>
          <Box flex="1 1 140px"><Field label="重量（kg）">
            <TextField type="number" value={form.weight} onChange={set('weight')} placeholder="0" />
          </Field></Box>
          <Box flex="1 1 140px"><Field label="体积（m³）">
            <TextField type="number" value={form.volume} onChange={set('volume')} placeholder="0" />
          </Field></Box>
          <Box flex="1 1 160px"><Field label="付款方式">
            <SelectField value={form.payment_method} onChange={set('payment_method')} options={options.payment_methods || PAYMENT_METHODS} />
          </Field></Box>
        </Flex>

        {/* 保价：开关 + 金额 */}
        <Box mt="16px" pt="14px" borderTop="1px solid" borderColor="sep">
          <Flex align="center" gap="14px" wrap="wrap">
            <Flex align="center" gap="10px">
              <Box
                as="button"
                role="switch"
                aria-checked={form.insured}
                onClick={() => set('insured')(!form.insured)}
                w="46px"
                h="28px"
                borderRadius="full"
                border="none"
                cursor="pointer"
                position="relative"
                transition="background 200ms"
                bg={form.insured ? 'brand.500' : 'var(--fill-primary)'}
              >
                <Box
                  position="absolute"
                  top="2px"
                  left={form.insured ? '20px' : '2px'}
                  boxSize="24px"
                  borderRadius="full"
                  bg="#fff"
                  boxShadow="0 1px 3px rgba(0,0,0,0.2)"
                  transition="left 200ms cubic-bezier(0.4,0,0.2,1)"
                />
              </Box>
              <Text fontSize="15px" color="label">保价</Text>
            </Flex>
            {form.insured ? (
              <Box w="200px">
                <TextField
                  type="number"
                  value={form.insured_value}
                  onChange={set('insured_value')}
                  placeholder="保价金额（元）"
                  invalid={Boolean(errors.insured_value)}
                />
              </Box>
            ) : null}
            <Text fontSize="13px" color="labelSecondary" ml="auto">
              预估运费 <Box as="b" color="brand.600">{money(freight)}</Box>
            </Text>
          </Flex>
          {errors.insured_value ? (
            <Text fontSize="12px" color="red.500" mt="6px">{errors.insured_value}</Text>
          ) : null}
        </Box>
      </Card>

      {/* 包裹明细 */}
      <Card p="20px" mb="16px">
        <Flex align="center" justify="space-between" gap="10px" mb="14px" wrap="wrap">
          <Box>
            <Text fontSize="17px" fontWeight="600" color="label">包裹明细</Text>
            <Text fontSize="13px" color="labelSecondary" mt="2px">
              可添加多件；留空则按上面填写的重量/体积自动生成一条汇总件
            </Text>
          </Box>
          <Btn variant="secondary" size="sm" onClick={() => setPackages((ps) => [...ps, { ...EMPTY_PKG }])}>
            <PlusIcon size={14} />
            添加包裹
          </Btn>
        </Flex>

        <Flex direction="column" gap="12px">
          {packages.map((p, i) => (
            <Flex key={i} gap="10px" align="flex-end" wrap="wrap" p="12px" bg="fill" borderRadius="md">
              <Box flex="2 1 180px"><Field label="品名">
                <TextField value={p.name} onChange={(v) => updatePkg(i, 'name', v)} placeholder="如：手机（主件）" />
              </Field></Box>
              <Box flex="0 0 90px"><Field label="数量">
                <TextField type="number" value={p.quantity} onChange={(v) => updatePkg(i, 'quantity', v)} />
              </Field></Box>
              <Box flex="1 1 100px"><Field label="重量 kg">
                <TextField type="number" value={p.weight} onChange={(v) => updatePkg(i, 'weight', v)} />
              </Field></Box>
              <Box flex="1 1 100px"><Field label="体积 m³">
                <TextField type="number" value={p.volume} onChange={(v) => updatePkg(i, 'volume', v)} />
              </Field></Box>
              {packages.length > 1 ? (
                <Box pb="6px">
                  <Btn
                    variant="plain"
                    size="sm"
                    onClick={() => setPackages((ps) => ps.filter((_, idx) => idx !== i))}
                    aria-label="删除该包裹"
                  >
                    <XIcon size={15} />
                  </Btn>
                </Box>
              ) : null}
            </Flex>
          ))}
        </Flex>
      </Card>

      {/* 备注与提交 */}
      <Card p="20px">
        <Field label="备注">
          <TextArea value={form.remark} onChange={set('remark')} rows={2} placeholder="如：易碎品，请轻拿轻放" />
        </Field>
        <Flex gap="10px" justify="flex-end" mt="18px" wrap="wrap">
          <Btn variant="plain" onClick={() => navigate(-1)}>取消</Btn>
          <Btn variant="primary" loading={loading} loadingText="提交中…" onClick={submit}>
            <TruckIcon size={15} />
            提交运单
          </Btn>
        </Flex>
      </Card>
    </Page>
  )
}
