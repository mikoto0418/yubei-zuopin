import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, Progress, Stack, Text } from "@mantine/core";
import { IconSparkles, IconRefresh, IconArrowRight } from "@tabler/icons-react";
import { api } from "../api/client";
import { PageLoading, ErrorState, EmptyState } from "../components/States.jsx";

/** AI 情绪周报：生成 → 落库 resources 私人报告区 → 首页/此处读取展示 */
export default function WeeklyReport({ onGoResources }) {
  const [state, setState] = useState({ loading: true, error: null });
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      const data = await api.weeklyReport();
      setReport(data.report);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setGenerating(true); setGenError(null);
    try {
      const data = await api.generateWeeklyReport();
      setReport(data.report);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (state.loading) return <PageLoading rows={2} />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  const paragraphs = (report?.content || "").split(/\n{2,}/).filter(Boolean);

  return (
    <div className="mc-flow">
      <div>
        <h1 className="page-title">情绪周报</h1>
        <Text size="sm" c="dimmed" mt={6}>
          基于你最近 7 天的情绪记录生成，生成后会保存在「资源库 · 我的周报」里。
        </Text>
      </div>

      <Group>
        <Button
          radius="md"
          leftSection={<IconSparkles size={16} />}
          loading={generating}
          onClick={generate}
        >
          {report ? "重新生成" : "生成我的周报"}
        </Button>
        {report && (
          <Button radius="md" variant="light" rightSection={<IconArrowRight size={16} />} onClick={onGoResources}>
            在资源库查看
          </Button>
        )}
      </Group>

      {genError && <Text size="sm" c="red">{genError}</Text>}

      {!report ? (
        <EmptyState
          icon="📊"
          title="还没有周报"
          desc="先记录几天情绪，再点上面的按钮生成。生成的报告会进入你的私人报告区。"
        />
      ) : (
        <Stack gap="md">
          <Card className="mc-glass" padding="lg" radius="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600} className="apple-title2">{report.title}</Text>
                <Group gap="xs" mt={6}>
                  <Badge color="pink" variant="light" radius="sm" size="sm">AI 周报</Badge>
                  <Text size="xs" c="dimmed">{report.created_at?.slice(0, 16)}</Text>
                  <Text size="xs" c="dimmed">
                    · {report.source === "cloud" ? "云端生成" : "本地生成"}
                  </Text>
                </Group>
              </div>
            </Group>
            {report.summary && <Text size="sm" c="dimmed" mt="sm">{report.summary}</Text>}
          </Card>

          <Card className="mc-glass" padding="lg" radius="lg">
            <Stack gap="md">
              {paragraphs.map((p, i) => (
                <Text key={i} style={{ fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)", whiteSpace: "pre-wrap" }}>
                  {p}
                </Text>
              ))}
            </Stack>
          </Card>

          <Card className="mc-glass" padding="lg" radius="lg">
            <Text className="mc-section-title" mb={10}>说明</Text>
            <Text size="sm" c="dimmed">
              周报由 AI 根据你的情绪记录生成，仅供自我觉察参考，不构成诊断。
              如果近期状态持续低落，建议前往「咨询师」预约一次专业谈话。
            </Text>
          </Card>
        </Stack>
      )}
    </div>
  );
}
