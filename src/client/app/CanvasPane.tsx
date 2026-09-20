import { ArrowRight, Check, Code, Files, Plus, Sparkles } from 'lucide-react';
import type {
  Definition,
  FlowNode,
  Issue,
  Run,
  Snapshot,
  Work,
} from '../../shared/records';
import { inputPorts } from '../core/inputs';
import { active, errorText } from '../core/format';
import { Button, Empty } from '../components/ui';
import { WorkflowCanvas } from '../features/canvas/WorkflowCanvas';

/** 流程页签：添加步骤、查看 JS、画布或空状态，以及需要修正的输入。 */
export function CanvasPane({
  work,
  definition,
  issues,
  currentRun,
  selectedNode,
  setSelectedNode,
  setPanel,
  setSamplePort,
  addKind,
  setAddKind,
  addNode,
  setCodeOpen,
  editDefinition,
  action,
  setError,
  generate,
  busy,
}: {
  work: Work;
  definition: Definition;
  issues: Issue[];
  currentRun?: Run;
  selectedNode?: string;
  setSelectedNode: (node: string | undefined) => void;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
  setSamplePort: (port: string) => void;
  addKind: FlowNode['kind'];
  setAddKind: (kind: FlowNode['kind']) => void;
  addNode: () => void;
  setCodeOpen: (open: boolean) => void;
  editDefinition: (definition: Definition) => void;
  action: (name: string, fields?: Record<string, unknown>) => Promise<Snapshot>;
  setError: (error: string) => void;
  generate: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <>
      <div className="canvas-toolbar">
        <div className="inline-group">
          <select
            aria-label="新步骤类型"
            value={addKind}
            onChange={(e) => setAddKind(e.target.value as FlowNode['kind'])}
          >
            <option value="file">文件</option>
            <option value="function">普通处理</option>
            <option value="agent">Agent</option>
            <option value="branch">条件分流</option>
            <option value="wait">等待事件</option>
            <option value="milestone">业务里程碑</option>
          </select>
          <Button onClick={addNode}>
            <Plus size={15} />
            添加步骤
          </Button>
        </div>
        <div className="inline-group">
          <Button variant="ghost" onClick={() => setCodeOpen(true)}>
            <Code size={15} />
            查看 JS
          </Button>
          <Button
            onClick={() => {
              setSelectedNode(undefined);
              setPanel('assistant');
            }}
          >
            <Sparkles size={15} />
            修改流程
          </Button>
        </div>
      </div>
      {definition.nodes.length ? (
        <WorkflowCanvas
          key={work.id}
          definition={definition}
          view={work.view}
          selected={selectedNode}
          onSelect={(id) => {
            setSelectedNode(id);
            if (!id) return;
            setPanel('inspector');
            const node = definition.nodes.find((n) => n.id === id);
            if (node) setSamplePort(inputPorts(node)[0]);
          }}
          onChange={editDefinition}
          onLayout={(view) => {
            void action('saveLayout', { view }).catch((e) =>
              setError(errorText(e)),
            );
          }}
          run={
            currentRun?.definitionId === (work.draftId || work.adoptedId)
              ? currentRun
              : undefined
          }
        />
      ) : (
        <Empty title="把目标变成可调整的流程">
          <div className="empty-flow">
            <span>
              <Files size={21} />
              材料
            </span>
            <ArrowRight size={18} />
            <span>
              <Sparkles size={21} />
              处理步骤
            </span>
            <ArrowRight size={18} />
            <span>
              <Check size={21} />
              产物
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => void generate()}
            disabled={busy || work.messages.some((m) => active(m.status))}
          >
            <Sparkles size={16} />
            生成初始流程
          </Button>
          <p>{work.materials.length} 条材料已准备好</p>
        </Empty>
      )}
      {issues.length > 0 && (
        <div className="issues-strip">
          <strong>{issues.length} 项需要修正</strong>
          {issues.map((issue, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedNode(issue.nodeId);
                setPanel('inspector');
              }}
            >
              {issue.nodeId
                ? `${definition.nodes.find((n) => n.id === issue.nodeId)?.label || '节点'}：`
                : ''}
              {issue.message}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
