import { useEffect, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from './components/ui/button';
import {
  reduceEvent,
  snapshotSelection,
  type Part,
  type WireEvent,
} from './bridge';

function ToolResult({ args, result, status }: ToolCallMessagePartProps) {
  return (
    <details className="tool-result">
      <summary>
        inspect_sample · {String(args.sampleId)}{' '}
        <span>
          {result ? '完成' : status.type === 'incomplete' ? '已停止' : '执行中'}
        </span>
      </summary>
      {result !== undefined && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </details>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="message user-message">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message assistant-message">
      <span className="eyebrow">PI · FIXTURE</span>
      <MessagePrimitive.Parts
        components={{
          Text: () => <MarkdownTextPrimitive />,
          tools: { Fallback: ToolResult },
        }}
      />
    </MessagePrimitive.Root>
  );
}

export function Chat({ selection }: { selection: Record<string, boolean> }) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [frozen, setFrozen] = useState<string[]>([]);
  const activeId = useRef<string | null>(null);
  const cancelRequested = useRef(false);
  const readerController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (activeId.current)
        void fetch(`/api/chat/${activeId.current}/cancel`, { method: 'POST' });
      readerController.current?.abort();
    },
    [],
  );

  async function onNew(message: AppendMessage) {
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    const id = crypto.randomUUID();
    const selectedIds = snapshotSelection(selection);
    setFrozen(selectedIds);
    activeId.current = id;
    cancelRequested.current = false;
    readerController.current = new AbortController();
    setRunning(true);
    setStatus('连接中');
    let parts: Part[] = [];
    setMessages((previous) => [
      ...previous,
      { id: `${id}-user`, role: 'user', content: [{ type: 'text', text }] },
      { id, role: 'assistant', content: [], status: { type: 'running' } },
    ]);
    let terminal = false;
    const receive = (event: WireEvent) => {
      parts = reduceEvent(parts, event);
      terminal = ['done', 'cancelled', 'error'].includes(event.type);
      setStatus(
        event.type === 'cancelled'
          ? '已取消 · Pi 已停止'
          : event.type === 'done'
            ? '完成'
            : event.type === 'error'
              ? event.message
              : '生成中',
      );
      setMessages((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                content: parts,
                status:
                  event.type === 'cancelled'
                    ? { type: 'incomplete', reason: 'cancelled' }
                    : event.type === 'error'
                      ? {
                          type: 'incomplete',
                          reason: 'error',
                          error: event.message,
                        }
                      : event.type === 'done'
                        ? { type: 'complete', reason: 'stop' }
                        : { type: 'running' },
              }
            : item,
        ),
      );
    };
    try {
      const response = await fetch(`/api/chat/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sampleIds: selectedIds }),
        signal: readerController.current.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`HTTP ${response.status}`);
      if (cancelRequested.current)
        await fetch(`/api/chat/${id}/cancel`, { method: 'POST' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const data = block
            .split('\n')
            .find((line) => line.startsWith('data:'));
          if (data) receive(JSON.parse(data.slice(5)) as WireEvent);
        }
      }
      if (!terminal) throw new Error('连接已关闭，未收到完成事件');
    } catch (error) {
      receive({ type: 'error', message: String(error) });
    } finally {
      activeId.current = null;
      setRunning(false);
    }
  }
  async function onCancel() {
    if (!activeId.current) return;
    cancelRequested.current = true;
    setStatus('正在停止');
    await fetch(`/api/chat/${activeId.current}/cancel`, { method: 'POST' });
  }
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message) => message,
    isRunning: running,
    onNew,
    onCancel,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="chat-context">
        <span>
          本轮样本{' '}
          <strong data-testid="frozen-selection">
            {frozen.join(', ') || '发送时确定'}
          </strong>
        </span>
        <output data-testid="chat-status">{status}</output>
      </div>
      <ThreadPrimitive.Root className="thread">
        <ThreadPrimitive.Viewport className="chat-viewport" autoScroll>
          {messages.length === 0 && (
            <div className="chat-empty">
              <h2>用选中的样本检查 Method</h2>
              <p>真实 Pi SDK · 确定性响应 · 无需 API Key</p>
            </div>
          )}
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="composer">
          <ComposerPrimitive.Input
            placeholder="检查选中的样本…"
            aria-label="消息"
          />
          {running ? (
            <ComposerPrimitive.Cancel asChild>
              <Button size="icon" aria-label="停止生成">
                <Square size={14} />
              </Button>
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send asChild>
              <Button size="icon" aria-label="发送">
                <ArrowUp size={18} />
              </Button>
            </ComposerPrimitive.Send>
          )}
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
