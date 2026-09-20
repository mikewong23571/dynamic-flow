import { createContext, useContext } from 'react';
import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from '../../components/MarkdownTable';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  Search,
  Sparkles,
  Square,
} from 'lucide-react';
import type {
  ChatMessage,
  Definition,
  ModelConfiguration,
  ModelSelection,
} from '../../../shared/records';
import { changeSummary } from '../../core/definition';
import { active, short, statusNames } from '../../core/format';
import { Badge, Button } from '../../components/ui';
import { effectiveModelLabel } from '../settings/catalog-model';
export const AssistantMessagesContext = createContext<{
  messages: ChatMessage[];
  definitions: Record<string, Definition>;
  nodeLabels: Record<string, string>;
  draftId?: string;
  disabled: boolean;
  configuration: ModelConfiguration | null;
  workSelection: ModelSelection | null;
  onRetry: (message: ChatMessage) => void;
  onStop: (id: string) => void;
  onShowCanvas: (id?: string) => void;
  onOpenSettings: () => void;
}>({
  messages: [],
  definitions: {},
  nodeLabels: {},
  disabled: false,
  configuration: null,
  workSelection: null,
  onRetry: () => {},
  onStop: () => {},
  onShowCanvas: () => {},
  onOpenSettings: () => {},
});
export const toolNames: Record<string, string> = {
  update_flow: '保存做法',
  inspect_result: '检查结果',
  inspect_material: '读取材料',
  read_materials: '读取材料',
  add_materials: '登记材料',
  read: '阅读文件',
  grep: '搜索内容',
  find: '查找文件',
  ls: '列出目录',
};
function useOriginalMessage() {
  const id = useAuiState((s) => s.message.id);
  const context = useContext(AssistantMessagesContext);
  return { message: context.messages.find((m) => m.id === id), ...context };
}
function ContextLabel({
  message,
  nodeLabels,
}: {
  message: ChatMessage;
  nodeLabels: Record<string, string>;
}) {
  return (
    <div className="message-context">
      <span>
        {message.nodeId ? nodeLabels[message.nodeId] || '原步骤' : '整个流程'}
      </span>
      {message.sampleIds?.length ? (
        <span>{message.sampleIds.length} 条样本</span>
      ) : null}
    </div>
  );
}
export function UserMessage() {
  const { message, nodeLabels } = useOriginalMessage();
  return (
    <MessagePrimitive.Root className="message user-message">
      {message && <ContextLabel message={message} nodeLabels={nodeLabels} />}
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
export function AssistantMessage() {
  const {
    message,
    messages,
    definitions,
    nodeLabels,
    draftId,
    disabled,
    configuration,
    workSelection,
    onRetry,
    onStop,
    onShowCanvas,
    onOpenSettings,
  } = useOriginalMessage();
  if (!message) return null;
  const original = messages.find(
    (m) => m.role === 'user' && m.requestId === message.requestId,
  );
  const saved =
    !!message.definitionId &&
    !!definitions[message.definitionId] &&
    message.activities?.some(
      (a) => a.toolName === 'update_flow' && a.status === 'completed',
    );
  const changes = saved
    ? changeSummary(
        definitions[original?.definitionId || ''],
        definitions[message.definitionId!],
      )
    : [];
  const waiting = active(message.status);
  const failed = message.status === 'failed';
  return (
    <MessagePrimitive.Root className="message assistant-message">
      <span className="message-author">
        <Sparkles size={14} />
        Assistant
      </span>
      {message.effectiveModel && (
        <div className="message-model muted">
          {effectiveModelLabel(
            message.effectiveModel,
            configuration?.catalog ?? [],
          )}
          {workSelection && message.effectiveModel.source !== 'work' && (
            <span className="error-text">
              所选模型已失效，实际使用 {message.effectiveModel.model}
            </span>
          )}
        </div>
      )}
      {message.text && (
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <MarkdownTextPrimitive
                remarkPlugins={[remarkGfm]}
                components={{ table: MarkdownTable }}
              />
            ),
          }}
        />
      )}
      {waiting && (
        <div className="assistant-progress" role="status">
          <LoaderCircle size={16} className="spin" />
          <div>
            <strong>
              {message.status === 'stopping'
                ? '正在停止…'
                : (() => {
                    const current = message.activities?.find(
                      (a) => a.status === 'running',
                    );
                    if (current)
                      return `正在${
                        toolNames[current.toolName] ??
                        `执行 ${current.toolName}`
                      }…`;
                    return message.nodeId
                      ? '正在完善这个步骤…'
                      : '正在整理流程…';
                  })()}
            </strong>
            <span>
              {message.nodeId
                ? nodeLabels[message.nodeId] || '已选步骤'
                : '整个流程'}{' '}
              · 请求范围已固定
              {message.sampleIds?.length
                ? ` · ${message.sampleIds.length} 条样本`
                : ''}
              {message.activities?.length
                ? ` · 已完成 ${message.activities.filter((a) => a.status === 'completed').length} 项操作`
                : ''}
            </span>
          </div>
          {message.requestId && (
            <Button
              variant="ghost"
              aria-label="停止本次修改"
              disabled={message.status === 'stopping'}
              onClick={() => onStop(message.requestId!)}
            >
              <Square size={13} />
            </Button>
          )}
        </div>
      )}
      {saved && (
        <div className="saved-change">
          <span className="saved-change-icon">
            <Check size={16} />
          </span>
          <div>
            <strong>做法已保存</strong>
            <p>
              {changes.slice(0, 2).join('；') || '流程定义已更新'}
              {changes.length > 2 ? `，另有 ${changes.length - 2} 项变化` : ''}
            </p>
            <Button
              variant="ghost"
              onClick={() => onShowCanvas(message.nodeId)}
            >
              回到画布查看
              <ArrowUpRight size={13} />
            </Button>
            <details>
              <summary>版本与保存记录</summary>
              <p>
                {message.definitionId === draftId ? '当前候选' : '历史版本'} ·{' '}
                {short(message.definitionId)}
              </p>
            </details>
          </div>
        </div>
      )}
      {!!message.activities?.length && (
        <details className="assistant-activities">
          <summary>
            <Search size={12} />
            {waiting
              ? '执行记录'
              : `执行了 ${message.activities.length} 项操作`}
            <ChevronDown size={12} />
          </summary>
          <div>
            {message.activities.map((activity) => (
              <details className="assistant-activity" key={activity.id}>
                <summary>
                  <span>{toolNames[activity.toolName] || '处理任务'}</span>
                  <Badge status={activity.status} />
                </summary>
                {activity.error && (
                  <p className="error-text">{activity.error}</p>
                )}
                <pre>
                  {JSON.stringify(
                    { 参数: activity.args, 结果: activity.result },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          </div>
        </details>
      )}
      {failed && (
        <div className="assistant-failure" role="alert">
          <strong>这次修改没有完成</strong>
          <p>
            {message.error?.replace(/^Error:\s*/, '') ||
              '请求未完成，请检查当前做法后重试。'}
          </p>
          {original && (
            <Button disabled={disabled} onClick={() => onRetry(original)}>
              <RotateCcw size={13} />
              重试本次修改
            </Button>
          )}
          <Button variant="ghost" onClick={onOpenSettings}>
            检查模型设置
          </Button>
        </div>
      )}
      {message.status === 'cancelled' && (
        <p className="assistant-stopped">
          已停止。已保存的变更仍可在画布检查。
        </p>
      )}
    </MessagePrimitive.Root>
  );
}
