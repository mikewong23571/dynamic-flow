import { useMemo, useRef, useState, useEffect } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { ArrowUp, Square, Sparkles, CornerDownLeft } from 'lucide-react';
import type {
  ChatMessage,
  Definition,
  EditRequest,
} from '../../../shared/records';
import { runAction } from '../../core/action';
import { active } from '../../core/format';
import { Button, Modal } from '../../components/ui';
import {
  AssistantMessage,
  AssistantMessagesContext,
  UserMessage,
} from './AssistantMessage';
export function Assistant({
  messages,
  nodeLabel,
  nodeLabels,
  nodeId,
  sampleIds,
  draftId,
  definitions,
  onSend,
  onStop,
  onShowCanvas,
  disabled = false,
  draftText,
  onDraftChange,
}: {
  messages: ChatMessage[];
  nodeLabel?: string;
  nodeLabels: Record<string, string>;
  nodeId?: string;
  sampleIds: string[];
  draftId?: string;
  definitions: Record<string, Definition>;
  onSend: (request: EditRequest) => Promise<unknown>;
  onStop: (id: string) => void;
  onShowCanvas: (nodeId?: string) => void;
  disabled?: boolean;
  draftText: string;
  onDraftChange: (text: string) => void;
}) {
  const [error, setError] = useState('');
  const [retryMessage, setRetryMessage] = useState<ChatMessage>();
  const [submitting, setSubmitting] = useState(false);
  const running = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && active(m.status));
  const converted = useMemo<ThreadMessageLike[]>(
    () =>
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: [{ type: 'text' as const, text: m.text }],
        ...(m.role === 'assistant'
          ? {
              status: active(m.status)
                ? { type: 'running' as const }
                : m.status === 'failed'
                  ? {
                      type: 'incomplete' as const,
                      reason: 'error' as const,
                      error: m.error,
                    }
                  : m.status === 'cancelled'
                    ? {
                        type: 'incomplete' as const,
                        reason: 'cancelled' as const,
                      }
                    : { type: 'complete' as const, reason: 'stop' as const },
            }
          : {}),
      })),
    [messages],
  );
  async function send(request: EditRequest) {
    return Boolean(
      await runAction(
        async () => {
          await onSend(request);
          return true;
        },
        { setBusy: setSubmitting, setError },
      ),
    );
  }
  const runtime = useExternalStoreRuntime({
    messages: converted,
    convertMessage: (m) => m,
    isRunning: !!running || submitting,
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      const request = {
        text,
        expectedDraftId: draftId,
        nodeId,
        sampleIds: [...sampleIds],
      };
      if (await send(request)) {
        onDraftChange('');
      } else {
        runtime.thread.composer.setText(text);
      }
    },
    onCancel: async () => {
      if (running?.requestId) onStop(running.requestId);
    },
  });
  useEffect(() => {
    runtime.thread.composer.setText(draftText);
  }, []);
  function suggest(text: string) {
    runtime.thread.composer.setText(text);
    onDraftChange(text);
  }
  async function retry(original: ChatMessage, confirmed = false) {
    if (original.definitionId !== draftId && !confirmed) {
      setRetryMessage(original);
      return;
    }
    if (original.nodeId && !nodeLabels[original.nodeId]) {
      setRetryMessage(original);
      return;
    }
    if (
      await send({
        text: original.text,
        expectedDraftId: draftId,
        nodeId: original.nodeId,
        sampleIds: [...(original.sampleIds || [])],
      })
    ) {
      setRetryMessage(undefined);
    }
  }
  const suggestions = nodeLabel
    ? [
        '保留原文依据，结果中引用材料编号。',
        '明确说明异常输入和缺少信息时如何处理。',
      ]
    : draftId
      ? ['检查这份流程的输入和连接，指出需要修正的地方。']
      : ['根据工作目标生成可运行的流程，最终结果引用材料编号。'];
  // 回调经 ref 读取最新值，上下文值只在消息或范围变化时更换引用。
  const latest = useRef({ onStop, onShowCanvas, retry });
  latest.current = { onStop, onShowCanvas, retry };
  const messagesValue = useMemo(
    () => ({
      messages,
      definitions,
      nodeLabels,
      draftId,
      disabled: disabled || !!running || submitting,
      onRetry: (m: ChatMessage) => {
        void latest.current.retry(m);
      },
      onStop: (id: string) => latest.current.onStop(id),
      onShowCanvas: (id?: string) => latest.current.onShowCanvas(id),
    }),
    [messages, definitions, nodeLabels, draftId, disabled, running, submitting],
  );
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantMessagesContext.Provider value={messagesValue}>
        <div className="assistant-context">
          <span>下一条消息的范围</span>
          <strong>{nodeLabel || '整个流程'}</strong>
          <span className="assistant-samples">
            {sampleIds.length ? `${sampleIds.length} 条所选样本` : '未指定样本'}
          </span>
          {disabled && (
            <p className="error-text">先保存画布修改，再发送对话。</p>
          )}
        </div>
        <ThreadPrimitive.Root className="thread">
          <ThreadPrimitive.Viewport className="chat-scroll" autoScroll>
            {messages.length === 0 && (
              <div className="chat-empty">
                <Sparkles size={25} />
                <h3>一起完善这份做法</h3>
                <p>
                  {nodeLabel
                    ? `你正在查看「${nodeLabel}」。描述希望改变的处理方式。`
                    : '先把目标变成步骤，再一起检查和改进。'}
                </p>
              </div>
            )}
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
          </ThreadPrimitive.Viewport>
          {error && (
            <p className="inline-error composer-error" role="alert">
              {error}
            </p>
          )}
          {!running && !disabled && (
            <div className="assistant-suggestions">
              {suggestions.map((text) => (
                <button key={text} onClick={() => suggest(text)}>
                  {text}
                </button>
              ))}
            </div>
          )}
          <ComposerPrimitive.Root className="composer">
            <ComposerPrimitive.Input
              aria-label="对话修改"
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={
                nodeLabel
                  ? `希望「${nodeLabel}」怎样改变？`
                  : '描述你希望的做法…'
              }
              disabled={disabled || submitting}
              submitMode="ctrlEnter"
              minRows={3}
              maxRows={8}
            />
            <div className="composer-footer">
              <span>
                <CornerDownLeft size={11} />⌘ / Ctrl + Enter 发送
              </span>
              {running ? (
                <ComposerPrimitive.Cancel asChild>
                  <Button
                    aria-label="停止生成"
                    variant="secondary"
                    disabled={running.status === 'stopping'}
                  >
                    <Square size={13} />
                    {running.status === 'stopping' ? '停止中' : '停止'}
                  </Button>
                </ComposerPrimitive.Cancel>
              ) : (
                <ComposerPrimitive.Send asChild>
                  <Button
                    variant="primary"
                    aria-label="发送修改"
                    disabled={disabled || submitting}
                  >
                    <ArrowUp size={15} />
                    发送
                  </Button>
                </ComposerPrimitive.Send>
              )}
            </div>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
        <Modal
          open={!!retryMessage}
          onOpenChange={(open) => !open && setRetryMessage(undefined)}
          title="在当前草稿上重试"
          description="上次请求之后做法已变化。重试会将原修改要求应用到现在的草稿，仍使用原步骤和原样本。"
        >
          <div className="retry-context">
            <strong>
              {retryMessage?.nodeId
                ? nodeLabels[retryMessage.nodeId] || '原步骤已删除'
                : '整个流程'}
            </strong>
            <span>{retryMessage?.sampleIds?.length || 0} 条原样本</span>
          </div>
          <p className="retry-request">{retryMessage?.text}</p>
          {retryMessage?.nodeId && !nodeLabels[retryMessage.nodeId] && (
            <p className="inline-error">
              原步骤已删除，请返回画布选择新步骤后重新描述改法。
            </p>
          )}
          {error && <p className="inline-error">{error}</p>}
          <div className="modal-actions">
            <Button onClick={() => setRetryMessage(undefined)}>返回检查</Button>
            <Button
              variant="primary"
              disabled={
                submitting ||
                disabled ||
                !!running ||
                (!!retryMessage?.nodeId && !nodeLabels[retryMessage.nodeId])
              }
              onClick={() => retryMessage && void retry(retryMessage, true)}
            >
              确认在当前草稿重试
            </Button>
          </div>
        </Modal>
      </AssistantMessagesContext.Provider>
    </AssistantRuntimeProvider>
  );
}
