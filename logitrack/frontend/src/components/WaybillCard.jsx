// 运单卡片：列表页与调度台共用的行视图。
// 把"当前状态 + 起终点 + 时间 + 异常标记"压成一行信息密度，点进详情看时间轴。
import { Box, Flex, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { formatDateTime, money, statusMeta } from '../constants'
import { ProgressBar, StatusPill, Tag } from './ui'
import { AlertIcon, ArrowRightIcon, ClockIcon } from './Icons'

export default function WaybillCard({ wb, right, onClick, compact }) {
  const navigate = useNavigate()
  const meta = statusMeta(wb.status)

  function open() {
    if (onClick) onClick(wb)
    else navigate(`/waybills/${wb.id}`)
  }

  return (
    <Box
      className="lt-wb-card"
      bg="cardBg"
      borderRadius="lg"
      boxShadow="card"
      p={compact ? '14px' : '18px'}
      cursor="pointer"
      onClick={open}
    >
      <Flex align="flex-start" gap="12px" wrap="wrap">
        <Box flex="1" minW="0">
          {/* 第一行：运单号 + 状态 + 异常标记 */}
          <Flex align="center" gap="8px" wrap="wrap" mb="8px">
            <Text
              fontSize="15px"
              fontWeight={700}
              color="label"
              fontFamily="mono"
              letterSpacing="-0.01em"
            >
              {wb.waybill_no}
            </Text>
            <StatusPill meta={meta} />
            {wb.exception_flag ? (
              <Tag color="#FF3B30">
                <AlertIcon size={11} />
                <Box as="span" ml="3px">异常</Box>
              </Tag>
            ) : null}
            {wb.insured ? <Tag color="#5856D6">已保价</Tag> : null}
          </Flex>

          {/* 第二行：起点 → 终点 */}
          <Box className="lt-route-line" mb="8px">
            <Text fontWeight={600} noOfLines={1}>
              {wb.origin_city || '始发'}
            </Text>
            <Box className="lt-route-arrow" />
            <ArrowRightIcon size={13} />
            <Text fontWeight={600} noOfLines={1}>
              {wb.dest_city || '目的'}
            </Text>
          </Box>

          {/* 第三行：收件人 / 货物 / 重量 */}
          <Flex gap="12px" wrap="wrap" fontSize="13px" color="labelSecondary" mb="10px">
            <Box as="span">
              {wb.receiver_name} · {wb.receiver_phone}
            </Box>
            <Box as="span">{wb.goods_type}</Box>
            <Box as="span">{wb.weight} kg</Box>
            {!compact ? <Box as="span">{money(wb.freight)}</Box> : null}
            {!compact && wb.scan_count !== undefined ? (
              <Box as="span">{wb.scan_count} 次扫描</Box>
            ) : null}
          </Flex>

          {/* 进度条：把状态机的位置可视化 */}
          <ProgressBar value={wb.progress || 0} color={meta.color} />

          <Flex gap="14px" wrap="wrap" fontSize="12px" color="labelTertiary" mt="8px">
            <Flex align="center" gap="4px">
              <ClockIcon size={12} />
              下单 {formatDateTime(wb.created_at)}
            </Flex>
            {wb.estimated_delivery ? (
              <Box as="span">预计 {formatDateTime(wb.estimated_delivery)} 送达</Box>
            ) : null}
            {wb.actual_delivery ? <Box as="span">实际 {formatDateTime(wb.actual_delivery)} 签收</Box> : null}
            {wb.driver_name ? <Box as="span">司机 {wb.driver_name}</Box> : null}
          </Flex>
        </Box>

        {right ? <Box flex="0 0 auto">{right}</Box> : null}
      </Flex>
    </Box>
  )
}
