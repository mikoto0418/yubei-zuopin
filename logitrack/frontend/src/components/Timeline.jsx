// 中轴时间轴：运单详情的左半屏，也是「时间轴 ⇄ 地图」联动的左侧。
//
// 三个职责：
//   1) 把节点渲染成中轴形态（圆点按状态着色、运输中节点带流动虚线）
//   2) 暴露 selectedId 与 onSelect，父组件据此驱动地图定位
//   3) 接收 scrollToId，当用户点地图标记时滚动并高亮对应节点
//
// 联动协议（父子之间）：
//   父组件持有 selectedId 与 timelineRef（节点 DOM 引用表），
//   时间轴只管渲染与"我这边被点了"，不自己改地图；方向由父组件统一调度，
//   避免两侧互相 setState 造成回环。
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { NODE_TYPE_LABEL, formatFull, statusMeta } from '../constants'

// 判断节点在时间轴上的推进态：
//   done    —— 已经走过的站（实心圆点）
//   current —— 正在进行的站（放大圆点 + 光晕 + 流动虚线）
//   pending —— 尚未到达（空心灰点）
function nodeStage(node, isLastLocated) {
  if (node.node_status === 'exception') return 'current'
  if (node.node_status === 'done') return isLastLocated ? 'current' : 'done'
  if (node.node_status === 'active') return 'current'
  return 'pending'
}

const Timeline = forwardRef(function Timeline(
  { nodes = [], selectedId, onSelect, onScrollDone },
  ref,
) {
  const itemRefs = useRef(new Map())

  // 对外暴露 scrollTo：父组件在地图标记被点时调用它
  useImperativeHandle(ref, () => ({
    scrollTo(id) {
      const el = itemRefs.current.get(id)
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 滚动到位后加一次性闪烁类，帮助眼睛定位
      el.classList.remove('lt-flash')
      // 强制重排以便重复触发动画
      void el.offsetWidth
      el.classList.add('lt-flash')
      setTimeout(() => el.classList.remove('lt-flash'), 1500)
      if (onScrollDone) onScrollDone(id)
      return true
    },
  }), [onScrollDone])

  // 已完成节点数 → 中轴实线的高度。用比例算，避免逐像素测量。
  const { progressRatio, lastLocatedIdx } = useMemo(() => {
    if (!nodes.length) return { progressRatio: 0, lastLocatedIdx: -1 }
    let last = -1
    nodes.forEach((n, i) => {
      if (n.node_status === 'done') last = i
    })
    const activeIdx = nodes.findIndex((n) => n.node_status === 'active' || n.node_status === 'exception')
    const anchor = Math.max(last, activeIdx)
    return {
      progressRatio: nodes.length > 1 ? Math.max(0, anchor) / (nodes.length - 1) : 0,
      lastLocatedIdx: activeIdx >= 0 ? activeIdx : last,
    }
  }, [nodes])

  return (
    <Box className="lt-timeline">
      {/* 中轴线：底层灰色全轴 + 上层主题色进度轴 */}
      <Box className="lt-axis" />
      <Box
        className="lt-axis-progress"
        style={{ height: `calc(${(progressRatio * 100).toFixed(2)}% )` }}
      />

      {nodes.map((node, idx) => {
        const meta = statusMeta(node.status)
        const stage = nodeStage(node, idx === lastLocatedIdx)
        const selected = selectedId === node.id
        const isMoving = node.status === 'in_transit' && stage === 'current'

        return (
          <Box
            key={node.id}
            ref={(el) => {
              if (el) itemRefs.current.set(node.id, el)
              else itemRefs.current.delete(node.id)
            }}
            className={`lt-node ${selected ? 'is-selected' : ''}`}
            onClick={() => onSelect?.(node.id, { from: 'timeline' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(node.id, { from: 'timeline' })
              }
            }}
          >
            <Box className="lt-node-rail">
              {/* 运输中节点：流动虚线（本 App 唯一允许的循环动画，表示"货在路上"） */}
              {isMoving ? (
                <Box
                  className="lt-flow"
                  style={{ top: '32px', height: idx === nodes.length - 1 ? '18px' : '48px' }}
                />
              ) : null}
              <Box
                className={`lt-dot is-${stage}`}
                style={{
                  '--node-color': meta.color,
                  '--node-soft': meta.soft,
                }}
              />
            </Box>

            <Box className="lt-node-body">
              <Box className="lt-node-head">
                <Text className="lt-node-title">{node.name}</Text>
                {node.node_type && NODE_TYPE_LABEL[node.node_type] ? (
                  <Box
                    as="span"
                    fontSize="11px"
                    px="6px"
                    h="18px"
                    display="inline-flex"
                    alignItems="center"
                    borderRadius="sm"
                    style={{ background: meta.soft, color: meta.color }}
                  >
                    {NODE_TYPE_LABEL[node.node_type]}
                  </Box>
                ) : null}
                <Text className="lt-node-time" ml="auto">
                  {node.arrived_at ? formatFull(node.arrived_at) : '—'}
                </Text>
              </Box>

              <Box className="lt-node-meta">
                <Box as="span" style={{ color: meta.color, fontWeight: 600 }}>
                  {meta.label}
                </Box>
                {node.operator ? <Box as="span">操作人：{node.operator}</Box> : null}
                {node.city ? <Box as="span">{node.city}</Box> : null}
              </Box>

              {node.remark ? <Box className="lt-node-remark">{node.remark}</Box> : null}

              {/* 该节点下的扫描记录：把 route_nodes 与 scan_records 的对应关系显示出来 */}
              {Array.isArray(node.scans) && node.scans.length ? (
                <Flex gap="6px" mt="8px" wrap="wrap">
                  {node.scans.map((s) => (
                    <Box key={s.id} className="lt-scan-chip">
                      {s.scan_type} · {String(s.scanned_at || '').slice(11, 16) || '—'}
                    </Box>
                  ))}
                </Flex>
              ) : null}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
})

export default Timeline
