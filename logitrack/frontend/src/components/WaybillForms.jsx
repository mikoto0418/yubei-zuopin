// 运单相关的三个表单：状态流转、异常登记、节点扫描。
// 拆出来是因为详情页主文件已经够长，且这三个表单彼此独立、可单测。
import { useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Field, SelectField, TextArea, TextField } from './ui'
import { EXCEPTION_TYPES, SEVERITIES, statusMeta } from '../constants'

// ---------- 状态流转：备注 + 网点 + 坐标（可选） ----------
// 「签收」额外要求签收人；「异常」要求说明原因——表单随目标状态变。
export function TransitionForm({ status, value, onChange, warehouses = [], error }) {
  const [note, setNote] = useState(value?.note || '')
  const [warehouseId, setWarehouseId] = useState(value?.warehouse_id || '')
  const [location, setLocation] = useState(value?.location || '')

  useEffect(() => {
    onChange?.({ note, warehouse_id: warehouseId || 0, location })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, warehouseId, location])

  const meta = status ? statusMeta(status) : null
  const needNote = ['exception', 'returned', 'delivered'].includes(status)

  return (
    <Flex direction="column" gap="14px">
      <Box p="12px" borderRadius="md" bg="fill">
        <Text fontSize="13px" color="labelSecondary">
          目标状态
        </Text>
        <Text fontSize="15px" fontWeight={600} style={{ color: meta?.color }} mt="2px">
          {meta?.label}
        </Text>
      </Box>

      <Field label="操作网点" hint="选择后会自动带入该网点的经纬度，时间轴与地图都会用上">
        <SelectField
          value={warehouseId}
          onChange={setWarehouseId}
          placeholder="不指定网点"
          options={warehouses.map((w) => ({ value: String(w.id), label: `${w.name}（${w.city}）` }))}
        />
      </Field>

      {status === 'delivered' ? (
        <Field label="签收人" required>
          <TextField
            value={note}
            onChange={setNote}
            placeholder="请输入签收人姓名，如：本人 / 前台代收"
          />
        </Field>
      ) : (
        <Field
          label={needNote ? '处理说明' : '备注'}
          required={needNote}
          error={error}
          hint={status === 'exception' ? '请说明异常原因，会写入异常记录与时间轴' : '可选，会显示在时间轴节点上'}
        >
          <TextArea
            value={note}
            onChange={setNote}
            rows={3}
            placeholder={
              status === 'exception' ? '如：收件人拒收，货物原路带回'
                : status === 'returned' ? '如：按寄件人要求原路退回'
                  : '补充说明（可选）'
            }
          />
        </Field>
      )}

      <Field label="当前位置描述" hint="留空则使用网点名称">
        <TextField value={location} onChange={setLocation} placeholder="如：上海青浦分拨中心" />
      </Field>
    </Flex>
  )
}

// ---------- 异常登记 ----------
export function ExceptionForm({ value, onChange, error }) {
  const [exType, setExType] = useState(value?.ex_type || EXCEPTION_TYPES[0])
  const [severity, setSeverity] = useState(value?.severity || '一般')
  const [description, setDescription] = useState(value?.description || '')

  useEffect(() => {
    onChange?.({ ex_type: exType, severity, description })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exType, severity, description])

  return (
    <Flex direction="column" gap="14px">
      <Field label="异常类型" required>
        <SelectField value={exType} onChange={setExType} options={EXCEPTION_TYPES} />
      </Field>
      <Field label="严重程度">
        <SelectField value={severity} onChange={setSeverity} options={SEVERITIES} />
      </Field>
      <Field
        label="异常描述"
        required
        error={error}
        hint="提交后运单会进入「异常」状态，并写入时间轴与异常件列表"
      >
        <TextArea
          value={description}
          onChange={setDescription}
          rows={3}
          placeholder="请描述异常情况，如：收件地址门牌号不存在，多次联系收件人未果"
        />
      </Field>
    </Flex>
  )
}

// ---------- 节点扫描 ----------
// 两种模式：
//   1) 只记扫描（不选状态）——在该运单的最新节点上追加一条扫描记录
//   2) 扫描并推进状态——同时走状态机，会生成新节点
export function ScanForm({ value, onChange, next, warehouses = [], error }) {
  const [scanType, setScanType] = useState(value?.scan_type || 'inbound')
  const [warehouseId, setWarehouseId] = useState(value?.warehouse_id || '')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState(value?.note || '')

  useEffect(() => {
    onChange?.({
      scan_type: scanType,
      warehouse_id: warehouseId || 0,
      status: status || undefined,
      note,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanType, warehouseId, status, note])

  const SCAN_TYPES = [
    { value: 'inbound', label: '入库扫描' },
    { value: 'outbound', label: '出库扫描' },
    { value: 'transit', label: '中转扫描' },
    { value: 'pickup', label: '揽收扫描' },
    { value: 'signed', label: '签收扫描' },
    { value: 'exception', label: '异常扫描' },
  ]

  return (
    <Flex direction="column" gap="14px">
      <Field label="扫描类型" required>
        <SelectField value={scanType} onChange={setScanType} options={SCAN_TYPES} />
      </Field>

      <Field label="扫描网点" hint="决定这条扫描记录的坐标，地图上会据此定位">
        <SelectField
          value={warehouseId}
          onChange={setWarehouseId}
          placeholder="不指定网点"
          options={warehouses.map((w) => ({ value: String(w.id), label: `${w.name}（${w.city}）` }))}
        />
      </Field>

      <Field
        label="同时推进状态"
        hint={next?.next?.length ? '不选则只追加一条扫描记录，运单状态不变' : '当前状态已无可推进的下一步'}
      >
        <SelectField
          value={status}
          onChange={setStatus}
          placeholder="仅记录扫描，不改变状态"
          options={(next?.next || []).map((n) => ({ value: n.status, label: n.label }))}
        />
      </Field>

      <Field label="备注" error={error}>
        <TextArea value={note} onChange={setNote} rows={2} placeholder="如：外包装完好，已入 3 号库位" />
      </Field>
    </Flex>
  )
}
