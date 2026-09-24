import React from "react";
import { Skeleton, Stack, Box } from "@mantine/core";

/**
 * 五态展示组件：加载 / 空 / 错误 / 无权限 / 404
 * 全站页面统一复用，保证状态语义一致。
 */

export function PageLoading({ rows = 3 }) {
  return (
    <Stack gap="md" aria-busy="true" aria-label="加载中">
      <Box className="mc-skeleton-card">
        <Box className="apple-skeleton mc-skeleton-line" style={{ width: "40%", height: 20 }} />
        <Box className="apple-skeleton mc-skeleton-line" style={{ width: "100%" }} />
        <Box className="apple-skeleton mc-skeleton-line" style={{ width: "70%" }} />
      </Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Box className="mc-skeleton-card" key={i}>
          <Box className="apple-skeleton mc-skeleton-line" style={{ width: "55%", height: 18 }} />
          <Box className="apple-skeleton mc-skeleton-line" style={{ width: "90%" }} />
          <Box className="apple-skeleton mc-skeleton-line" style={{ width: "65%" }} />
        </Box>
      ))}
    </Stack>
  );
}

export function PageState({ icon = "🗂️", title, desc, action }) {
  return (
    <div className="mc-state">
      <div className="mc-state-icon" aria-hidden="true">{icon}</div>
      <h3 className="apple-headline">{title}</h3>
      {desc ? <p>{desc}</p> : null}
      {action}
    </div>
  );
}

export function EmptyState({ title = "暂无内容", desc, action, icon = "📭" }) {
  return <PageState icon={icon} title={title} desc={desc} action={action} />;
}

export function ErrorState({ error, onRetry }) {
  const msg = typeof error === "string" ? error : error?.message || "加载失败，请稍后重试";
  return (
    <PageState
      icon="⚠️"
      title="出了点问题"
      desc={msg}
      action={
        onRetry ? (
          <button type="button" className="apple-btn apple-btn--secondary" onClick={onRetry}>
            重试
          </button>
        ) : null
      }
    />
  );
}

export function ForbiddenState({ desc = "当前账号没有查看该页面的权限。" }) {
  return <PageState icon="🔒" title="无权限访问" desc={desc} />;
}

export function NotFoundState({ desc = "你访问的页面不存在，或已被移除。" }) {
  return <PageState icon="🧭" title="页面不存在" desc={desc} />;
}

/** 骨架卡片（图表等自定义区域复用） */
export function SkeletonCard({ height = 280 }) {
  return <Skeleton height={height} radius="lg" />;
}
