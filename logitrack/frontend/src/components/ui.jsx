// UI 原语层：把 Chakra v3 的复合组件包成简单接口，供各页面复用。
//
// 这样做的两个好处：
//   1) 页面里不出现 Chakra 的复合组件写法，降低 API 变更带来的维护成本；
//   2) Apple 基底（圆角/阴影/毛玻璃）集中在这里，改一处全局生效。
import { Box, Button, Dialog, Flex, Heading, Input, Portal, Skeleton, Spinner, Stack, Text, Textarea } from '@chakra-ui/react'
import { AlertIcon, BoxIcon, RefreshIcon, ShieldIcon, XIcon } from './Icons'

// ---------- 卡片 ----------

export function Card({ children, p = '20px', ...rest }) {
  return (
    <Box
      bg="cardBg"
      borderRadius="lg"
      boxShadow="card"
      p={p}
      {...rest}
    >
      {children}
    </Box>
  )
}

export function SectionTitle({ children, right, sub }) {
  return (
    <Flex align="baseline" justify="space-between" gap="12px" mb="12px" wrap="wrap">
      <Box>
        <Heading as="h2" fontSize="22px" fontWeight={600} letterSpacing="-0.02em" color="label">
          {children}
        </Heading>
        {sub ? (
          <Text fontSize="13px" color="labelSecondary" mt="2px">
            {sub}
          </Text>
        ) : null}
      </Box>
      {right}
    </Flex>
  )
}

export function PageHeader({ title, sub, actions }) {
  return (
    <Flex align="flex-end" justify="space-between" gap="16px" mb="20px" wrap="wrap">
      <Box>
        <Heading as="h1" fontSize="34px" fontWeight={700} letterSpacing="-0.02em" lineHeight={1.2} color="label">
          {title}
        </Heading>
        {sub ? (
          <Text fontSize="15px" color="labelSecondary" mt="4px">
            {sub}
          </Text>
        ) : null}
      </Box>
      {actions ? <Flex gap="8px" align="center" wrap="wrap">{actions}</Flex> : null}
    </Flex>
  )
}

// ---------- 按钮 ----------

// variant: primary | secondary | plain | danger
export function Btn({ children, variant = 'secondary', size = 'md', loading, ...rest }) {
  const palette = variant === 'danger' ? 'red' : 'brand'
  const chakraVariant = variant === 'primary' ? 'solid'
    : variant === 'plain' ? 'ghost'
      : variant === 'danger' ? 'solid' : 'subtle'
  return (
    <Button
      size={size === 'sm' ? 'sm' : 'md'}
      colorPalette={palette}
      variant={chakraVariant}
      borderRadius="md"
      fontWeight={600}
      loading={loading}
      loadingText={rest.loadingText}
      {...rest}
    >
      {children}
    </Button>
  )
}

// ---------- 表单 ----------

export function Field({ label, error, required, children, hint }) {
  return (
    <Stack gap="6px" w="100%">
      {label ? (
        <Text fontSize="13px" fontWeight={600} color="labelSecondary">
          {label}
          {required ? <Box as="span" color="red.500" ml="2px">*</Box> : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text fontSize="12px" color="red.500">{error}</Text>
      ) : hint ? (
        <Text fontSize="12px" color="labelTertiary">{hint}</Text>
      ) : null}
    </Stack>
  )
}

// 输入框：填充式无边框 + 聚焦主题色描边（Apple 规范）
export function TextField({ value, onChange, invalid, ...rest }) {
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      h="38px"
      px="12px"
      fontSize="15px"
      bg="fill"
      border="2px solid transparent"
      borderRadius="md"
      _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 4px var(--tint-soft)' }}
      _placeholder={{ color: 'labelTertiary' }}
      borderColor={invalid ? 'red.400' : 'transparent'}
      {...rest}
    />
  )
}

export function TextArea({ value, onChange, invalid, rows = 3, ...rest }) {
  return (
    <Textarea
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      rows={rows}
      px="12px"
      py="9px"
      fontSize="15px"
      bg="fill"
      border="2px solid transparent"
      borderRadius="md"
      _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 4px var(--tint-soft)' }}
      _placeholder={{ color: 'labelTertiary' }}
      borderColor={invalid ? 'red.400' : 'transparent'}
      {...rest}
    />
  )
}

// 下拉框：用原生 select（避免 Chakra v3 collection API 的复杂度），样式对齐输入框
export function SelectField({ value, onChange, options = [], placeholder, ...rest }) {
  return (
    <Box position="relative" w="100%">
      <Box
        as="select"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        w="100%"
        h="38px"
        px="12px"
        pr="30px"
        fontSize="15px"
        color="label"
        bg="fill"
        border="2px solid transparent"
        borderRadius="md"
        outline="none"
        appearance="none"
        cursor="pointer"
        _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 4px var(--tint-soft)' }}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => {
          const val = typeof o === 'object' ? o.value : o
          const lbl = typeof o === 'object' ? o.label : o
          return (
            <option key={String(val)} value={val}>
              {lbl}
            </option>
          )
        })}
      </Box>
      <Box
        position="absolute"
        right="12px"
        top="50%"
        transform="translateY(-50%)"
        pointerEvents="none"
        color="labelTertiary"
        fontSize="10px"
      >
        ▾
      </Box>
    </Box>
  )
}

// ---------- 弹窗 ----------

export function Modal({ open, onClose, title, children, footer, maxW = '520px' }) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose?.() }} size="md">
      <Portal>
        <Dialog.Backdrop bg="rgba(0,0,0,0.32)" backdropFilter="blur(2px)" />
        <Dialog.Positioner>
          <Dialog.Content
            maxW={maxW}
            w="92vw"
            borderRadius="xl"
            bg="cardBg"
            boxShadow="float"
            p="0"
            overflow="hidden"
          >
            <Flex align="center" justify="space-between" px="20px" py="16px" borderBottom="1px solid" borderColor="sep">
              <Dialog.Title fontSize="17px" fontWeight={600} color="label">
                {title}
              </Dialog.Title>
              <Box
                as="button"
                onClick={onClose}
                color="labelSecondary"
                cursor="pointer"
                bg="transparent"
                border="none"
                p="4px"
                borderRadius="sm"
                _hover={{ bg: 'fill' }}
                aria-label="关闭"
              >
                <XIcon size={18} />
              </Box>
            </Flex>
            <Dialog.Body px="20px" py="18px" maxH="70vh" overflowY="auto">
              {children}
            </Dialog.Body>
            {footer ? (
              <Flex px="20px" py="14px" gap="8px" justify="flex-end" borderTop="1px solid" borderColor="sep">
                {footer}
              </Flex>
            ) : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

// ---------- 状态五态 ----------

// 加载态：骨架屏（Apple 规范要求骨架而非转圈）
export function Loading({ rows = 3, height = '84px' }) {
  return (
    <Stack gap="14px" w="100%">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} borderRadius="lg" bg="fill" />
      ))}
    </Stack>
  )
}

export function InlineLoading({ text = '加载中…' }) {
  return (
    <Flex align="center" justify="center" gap="10px" py="48px" color="labelSecondary">
      <Spinner size="sm" color="brand.500" />
      <Text fontSize="15px">{text}</Text>
    </Flex>
  )
}

// 空态：图标 + 说明 + 行动按钮
export function Empty({ title, description, action, onAction, icon }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      textAlign="center"
      py="60px"
      px="24px"
      gap="14px"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="sep"
      borderRadius="xl"
      bg="cardBg"
    >
      <Flex boxSize="54px" borderRadius="full" bg="fill" color="labelSecondary" align="center" justify="center">
        {icon || <BoxIcon size={24} />}
      </Flex>
      <Heading as="h3" fontSize="17px" fontWeight={600} color="label">
        {title}
      </Heading>
      {description ? (
        <Text fontSize="15px" color="labelSecondary" maxW="420px" lineHeight={1.6}>
          {description}
        </Text>
      ) : null}
      {action && onAction ? (
        <Btn variant="primary" size="sm" onClick={onAction} mt="4px">
          {action}
        </Btn>
      ) : null}
    </Flex>
  )
}

// 错误态：说明 + 重试
export function ErrorBlock({ title = '加载失败', message, onRetry }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      textAlign="center"
      py="52px"
      px="24px"
      gap="12px"
      bg="cardBg"
      borderRadius="xl"
      boxShadow="card"
    >
      <Flex boxSize="48px" borderRadius="full" bg="rgba(255,59,48,0.12)" color="red.500" align="center" justify="center">
        <AlertIcon size={22} />
      </Flex>
      <Heading as="h3" fontSize="17px" fontWeight={600} color="label">
        {title}
      </Heading>
      <Text fontSize="15px" color="labelSecondary" maxW="460px">
        {message || '请求出错了，请稍后重试'}
      </Text>
      {onRetry ? (
        <Btn variant="secondary" size="sm" onClick={onRetry} mt="4px">
          <RefreshIcon size={15} />
          重试
        </Btn>
      ) : null}
    </Flex>
  )
}

// 无权限态
export function Forbidden({ title = '无访问权限', message = '当前账号的角色没有查看该页面的权限。请联系总部管理员分配。' }) {
  return (
    <Flex direction="column" align="center" justify="center" textAlign="center" py="72px" px="24px" gap="14px">
      <Flex boxSize="56px" borderRadius="full" bg="fill" color="labelSecondary" align="center" justify="center">
        <ShieldIcon size={26} />
      </Flex>
      <Heading as="h1" fontSize="22px" fontWeight={600} color="label">
        {title}
      </Heading>
      <Text fontSize="15px" color="labelSecondary" maxW="440px">
        {message}
      </Text>
    </Flex>
  )
}

// ---------- 数据展示零件 ----------

// 状态胶囊：底色 = 状态色 12%，文字 = 状态色
export function StatusPill({ meta, children }) {
  const m = meta || {}
  return (
    <Box
      as="span"
      className="lt-status-pill"
      style={{ background: m.soft || 'var(--fill-secondary)', color: m.color || 'var(--label-secondary)' }}
    >
      <Box as="span" boxSize="6px" borderRadius="full" style={{ background: m.color || 'var(--gray)' }} />
      {children || m.label}
    </Box>
  )
}

export function Tag({ children, color }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      h="22px"
      px="8px"
      fontSize="12px"
      borderRadius="sm"
      bg="fill"
      color={color || 'labelSecondary'}
      whiteSpace="nowrap"
    >
      {children}
    </Box>
  )
}

// 进度条
export function ProgressBar({ value = 0, color }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100
  return (
    <Box className="lt-progress">
      <Box as="span" style={{ width: `${pct}%`, background: color || 'var(--tint)' }} />
    </Box>
  )
}

// 分页器
export function Pagination({ page, pages, total, pageSize, onChange }) {
  if (!pages || pages <= 1) {
    return (
      <Text fontSize="13px" color="labelTertiary" textAlign="center" py="12px">
        共 {total ?? 0} 条
      </Text>
    )
  }
  return (
    <Flex align="center" justify="center" gap="10px" py="14px" wrap="wrap">
      <Btn size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Btn>
      <Text fontSize="13px" color="labelSecondary" fontVariantNumeric="tabular-nums">
        第 {page} / {pages} 页 · 共 {total} 条
      </Text>
      <Btn size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        下一页
      </Btn>
    </Flex>
  )
}

// 纯 CSS 柱状图：两组数据（总量 / 异常）对比
export function BarChart({ data = [], height = 120, labelKey = 'label', primaryKey = 'primary', altKey = 'alt' }) {
  const max = Math.max(1, ...data.map((d) => Math.max(Number(d[primaryKey]) || 0, Number(d[altKey]) || 0)))
  return (
    <Box className="lt-bars" style={{ height }}>
      {data.map((d, i) => (
        <Box key={i} className="lt-bar-col" title={`${d[labelKey]}：${d[primaryKey]}${d[altKey] !== undefined ? ` / 异常 ${d[altKey]}` : ''}`}>
          {d[altKey] !== undefined ? (
            <Box className="lt-bar is-alt" style={{ height: `${((Number(d[altKey]) || 0) / max) * 100}%` }} />
          ) : null}
          <Box className="lt-bar" style={{ height: `${((Number(d[primaryKey]) || 0) / max) * 100}%` }} />
          <Box className="lt-bar-label">{d[labelKey]}</Box>
        </Box>
      ))}
    </Box>
  )
}

// 横向排行
export function RankList({ items = [], nameKey = 'name', valueKey = 'value', unit = '', color }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0))
  return (
    <Stack gap="0">
      {items.map((it, i) => (
        <Box key={i} className="lt-rank-row">
          <Box className="lt-rank-name" title={it[nameKey]}>
            {it[nameKey]}
          </Box>
          <Box className="lt-rank-track">
            <Box
              className="lt-rank-fill"
              style={{
                width: `${((Number(it[valueKey]) || 0) / max) * 100}%`,
                background: color || 'var(--tint)',
              }}
            />
          </Box>
          <Box className="lt-rank-value">
            {it[valueKey]}
            {unit}
          </Box>
        </Box>
      ))}
    </Stack>
  )
}

// 环形图（状态分布）：conic-gradient 拼出扇形，中心留白显示总数
export function Donut({ slices = [], total, centerLabel = '总数', size = 148 }) {
  const sum = slices.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1
  let acc = 0
  const stops = slices.map((s) => {
    const from = (acc / sum) * 360
    acc += Number(s.value) || 0
    const to = (acc / sum) * 360
    return `${s.color} ${from}deg ${to}deg`
  })
  const bg = stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--fill-secondary)'
  return (
    <Box className="lt-donut" style={{ width: size, height: size, flexBasis: `${size}px`, background: bg }}>
      <Box className="lt-donut-center">
        <Text fontSize="24px" fontWeight={700} color="label" fontVariantNumeric="tabular-nums" lineHeight={1.1}>
          {total ?? sum}
        </Text>
        <Text fontSize="12px" color="labelSecondary">
          {centerLabel}
        </Text>
      </Box>
    </Box>
  )
}

export function Legend({ items = [] }) {
  return (
    <Box className="lt-legend">
      {items.map((it, i) => (
        <Box key={i} className="lt-legend-row">
          <Box className="lt-legend-swatch" style={{ background: it.color }} />
          <Box as="span" color="label" fontSize="13px">{it.label}</Box>
          <Box as="span" ml="auto" fontVariantNumeric="tabular-nums">{it.value}</Box>
        </Box>
      ))}
    </Box>
  )
}

// 统计卡
export function Stat({ label, value, hint, color, onClick }) {
  return (
    <Box
      className="lt-stat"
      onClick={onClick}
      cursor={onClick ? 'pointer' : 'default'}
      transition="transform 150ms, box-shadow 150ms"
      _hover={onClick ? { transform: 'translateY(-1px)', boxShadow: 'float' } : undefined}
    >
      <Text className="lt-stat-label">{label}</Text>
      <Text className="lt-stat-value" style={{ color: color || 'var(--label)' }} mt="4px">
        {value}
      </Text>
      {hint ? (
        <Text fontSize="12px" color="labelTertiary" mt="4px">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

// 键值对行（详情页大量使用）
export function KV({ label, children, mono }) {
  return (
    <Flex gap="12px" py="7px" align="flex-start" borderBottom="1px solid" borderColor="sep" _last={{ borderBottom: 'none' }}>
      <Text fontSize="13px" color="labelSecondary" flex="0 0 86px">
        {label}
      </Text>
      <Box
        flex="1"
        fontSize="15px"
        color="label"
        fontFamily={mono ? 'mono' : undefined}
        wordBreak="break-all"
        textAlign="right"
      >
        {children}
      </Box>
    </Flex>
  )
}

export { BoxIcon, AlertIcon, RefreshIcon, ShieldIcon }
