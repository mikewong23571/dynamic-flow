import { useState } from 'react';
import { Tree } from 'react-arborist';
import { Background, ReactFlow, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  GitBranch,
  ListTree,
} from 'lucide-react';
import { Button } from './components/ui/button';

const tree = [
  {
    id: 'workflow',
    name: '反馈分类',
    children: [
      { id: 'read', name: '读取样本' },
      { id: 'classify', name: '分类反馈' },
      { id: 'review', name: '检查结果' },
    ],
  },
];
const graph: Node[] = tree[0].children.map((item, index) => ({
  id: item.id,
  position: { x: 30, y: index * 100 },
  data: { label: item.name },
}));
const edges = [
  { id: 'e1', source: 'read', target: 'classify' },
  { id: 'e2', source: 'classify', target: 'review' },
];

export function WorkMap({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState<'tree' | 'graph'>('tree');
  return (
    <div className="work-map">
      <div className="panel-heading">
        <h2>Work Map</h2>
        <div className="button-pair">
          <Button
            variant={view === 'tree' ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label="树视图"
            onClick={() => setView('tree')}
          >
            <ListTree />
          </Button>
          <Button
            variant={view === 'graph' ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label="图视图"
            onClick={() => setView('graph')}
          >
            <GitBranch />
          </Button>
        </div>
      </div>
      {view === 'tree' ? (
        <Tree
          data={tree}
          width="100%"
          height={390}
          rowHeight={38}
          selection={selected}
          disableDrag
          disableDrop
          disableEdit
          onSelect={(nodes) => {
            if (nodes[0]) onSelect(nodes[0].id);
          }}
        >
          {({ node, style }) => (
            <div
              style={style}
              className={`tree-row ${node.isSelected ? 'selected' : ''}`}
            >
              {node.isLeaf ? (
                <Circle size={11} />
              ) : (
                <button aria-label="展开反馈分类" onClick={() => node.toggle()}>
                  {node.isOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              )}
              <span>{node.data.name}</span>
              {node.id === 'classify' && <span className="dot" />}
            </div>
          )}
        </Tree>
      ) : (
        <div className="graph">
          <ReactFlow
            nodes={graph.map((node) => ({
              ...node,
              selected: node.id === selected,
            }))}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, node) => onSelect(node.id)}
            fitView
            minZoom={0.4}
          >
            <Background />
          </ReactFlow>
        </div>
      )}
      <div className="map-footer">
        <span className="dot" /> 当前节点{' '}
        <strong data-testid="selected-node">{selected}</strong>
      </div>
    </div>
  );
}
