import { useMemo, useState } from 'react';
import { MessageSquare, Settings2 } from 'lucide-react';
import type {
  ChatMessage,
  Definition,
  FlowNode,
  Issue,
  ModelConfiguration,
  ModelSelection,
  Snapshot,
} from '../../shared/records';
import { inputPorts } from '../core/inputs';
import { short } from '../core/format';
import { Button } from '../components/ui';
import { NodeInspector } from '../features/inspector/NodeInspector';
import { Assistant } from '../features/assistant/Assistant';

/** 面板宽度持久化键与边界；未拖过用 CSS 响应式默认宽度。 */
const PANEL_WIDTH_KEY = 'dynamic-flow.panel-width';
const MIN_PANEL_WIDTH = 260;
const maxPanelWidth = () => Math.min(640, Math.round(window.innerWidth * 0.6));

function savedPanelWidth(): number | null {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  return Number.isFinite(saved) && saved >= MIN_PANEL_WIDTH ? saved : null;
}

/** 右侧面板：步骤配置或 Assistant 对话。左缘拖拽调宽，宽度存本浏览器。 */
export function ContextPanel({
  panel,
  setPanel,
  definition,
  issues,
  selected,
  selectedNode,
  setSelectedNode,
  editDefinition,
  workId,
  draftId,
  dirty,
  messages,
  assistantDraft,
  setAssistantDraft,
  selectedNodeSamples,
  definitions,
  setTab,
  setTrialOpen,
  setSamplePort,
  action,
  perform,
  configuration,
  workSelection,
  onModelSelection,
  onOpenSettings,
}: {
  panel: 'inspector' | 'assistant';
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
  definition: Definition;
  issues: Issue[];
  selected?: FlowNode;
  selectedNode?: string;
  setSelectedNode: (node: string | undefined) => void;
  editDefinition: (definition: Definition) => void;
  workId: string;
  draftId?: string;
  dirty: boolean;
  messages: ChatMessage[];
  assistantDraft: string;
  setAssistantDraft: (text: string) => void;
  selectedNodeSamples: string[];
  definitions: Record<string, Definition>;
  setTab: (tab: 'canvas' | 'results' | 'compare') => void;
  setTrialOpen: (open: boolean) => void;
  setSamplePort: (port: string) => void;
  action: (name: string, fields?: Record<string, unknown>) => Promise<Snapshot>;
  perform: (
    name: string,
    fields?: Record<string, unknown>,
  ) => Promise<Snapshot | undefined>;
  configuration: ModelConfiguration | null;
  workSelection: ModelSelection | null;
  onModelSelection: (selection: ModelSelection | null) => Promise<unknown>;
  onOpenSettings: () => void;
}) {
  const nodeLabels = useMemo(
    () => Object.fromEntries(definition.nodes.map((n) => [n.id, n.label])),
    [definition],
  );
  const [panelWidth, setPanelWidth] = useState<number | null>(savedPanelWidth);
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const aside = event.currentTarget.parentElement;
    const startX = event.clientX;
    const startWidth = aside?.getBoundingClientRect().width ?? 342;
    const onMove = (move: PointerEvent) => {
      const next = Math.min(
        maxPanelWidth(),
        Math.max(MIN_PANEL_WIDTH, startWidth + (startX - move.clientX)),
      );
      setPanelWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      setPanelWidth((width) => {
        if (width) localStorage.setItem(PANEL_WIDTH_KEY, String(width));
        return width;
      });
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  return (
    <aside
      className="context-panel"
      style={panelWidth ? { width: panelWidth } : undefined}
    >
      <div
        className="panel-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整面板宽度"
        title="拖拽调整面板宽度"
        onPointerDown={startResize}
      />
      <div className="panel-tabs">
        <button
          className={panel === 'inspector' ? 'selected' : ''}
          onClick={() => setPanel('inspector')}
        >
          <Settings2 size={15} />
          步骤配置
        </button>
        <button
          className={panel === 'assistant' ? 'selected' : ''}
          onClick={() => setPanel('assistant')}
        >
          <MessageSquare size={15} />
          Assistant
        </button>
      </div>
      {panel === 'inspector' ? (
        <>
          <NodeInspector
            key={selectedNode}
            definition={definition}
            nodeId={selectedNode}
            issues={issues}
            onChange={editDefinition}
            onChat={() => setPanel('assistant')}
            workId={workId}
          />
          {selected && (
            <div className="panel-bottom">
              <span className="muted">
                {selected.label} · 候选 {short(draftId)}
              </span>
              <Button
                variant="primary"
                disabled={dirty || !draftId}
                onClick={() => {
                  setTrialOpen(true);
                  setSamplePort(inputPorts(selected)[0]);
                }}
              >
                选择输入并试运行
              </Button>
            </div>
          )}
        </>
      ) : (
        <Assistant
          draftText={assistantDraft}
          onDraftChange={setAssistantDraft}
          messages={messages}
          nodeLabels={nodeLabels}
          nodeLabel={selected?.label}
          nodeId={selectedNode}
          draftId={draftId}
          sampleIds={selectedNodeSamples}
          definitions={definitions}
          onShowCanvas={(id) => {
            setTab('canvas');
            if (id && definition.nodes.some((n) => n.id === id))
              setSelectedNode(id);
          }}
          disabled={dirty}
          configuration={configuration}
          workSelection={workSelection}
          onModelSelection={onModelSelection}
          onOpenSettings={onOpenSettings}
          onSend={(request) => action('edit', { ...request })}
          onStop={(requestId) => {
            void perform('stopEdit', { requestId });
          }}
        />
      )}
    </aside>
  );
}
