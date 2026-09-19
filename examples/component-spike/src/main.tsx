import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Group, Panel, Separator } from 'react-resizable-panels';
import JsonView from '@uiw/react-json-view';
import Markdown from 'react-markdown';
import { FlaskConical, Workflow } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { WorkMap } from './work-map';
import { SampleTable } from './sample-table';
import { Chat } from './chat';
import { samples } from './fixtures';
import './style.css';

const CodeLab = lazy(() =>
  import('./code-lab').then((module) => ({ default: module.CodeLab })),
);
function App() {
  const [selection, setSelection] = useState<Record<string, true>>({
    s3: true,
  });
  const [codeVisited, setCodeVisited] = useState(false);
  const [focus, setFocus] = useState('s3');
  const [node, setNode] = useState('classify');
  const sample = samples.find((item) => item.id === focus)!;
  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <Workflow size={20} />
          <strong>Dynamic Flow</strong>
          <span>/</span>
          <span>反馈分类</span>
        </div>
        <span className="lab-badge">
          <FlaskConical size={14} /> Component spike
        </span>
      </header>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKBENCH / 001</span>
          <h1>检查、修正，再继续。</h1>
        </div>
        <span className="run-status">
          <span className="dot" /> 6 条 fixture · 本地实验
        </span>
      </div>
      <Tabs
        defaultValue="workspace"
        className="workspace-tabs"
        onValueChange={(value) => {
          if (value === 'code') setCodeVisited(true);
        }}
      >
        <TabsList>
          <TabsTrigger value="workspace">工作区</TabsTrigger>
          <TabsTrigger value="code">Method 与比较</TabsTrigger>
          <TabsTrigger value="chat">Assistant</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" forceMount className="workspace-content">
          <Group orientation="horizontal" id="workbench-panels">
            <Panel defaultSize="22%" minSize="180px">
              <WorkMap selected={node} onSelect={setNode} />
            </Panel>
            <Separator
              className="resize-handle"
              aria-label="调整 Work Map 宽度"
            />
            <Panel defaultSize="51%" minSize="340px">
              <SampleTable
                selection={selection}
                onSelection={setSelection}
                focus={focus}
                onFocus={setFocus}
              />
            </Panel>
            <Separator
              className="resize-handle"
              aria-label="调整 Inspector 宽度"
            />
            <Panel defaultSize="27%" minSize="220px">
              <aside className="inspector">
                <div className="panel-heading">
                  <h2>Inspector</h2>
                  <span>{sample.id}</span>
                </div>
                <h3 data-testid="inspector-title">{sample.title}</h3>
                <div className="inspector-meta">
                  <span className={`badge ${sample.category}`}>
                    {sample.category}
                  </span>
                  <span>{sample.score}% confidence</span>
                </div>
                <Markdown>{`### 检查结果\n${sample.category === sample.expected ? '分类与预期一致。' : '已有能力发生故障，应归为 **bug**。'}\n\n节点：\`${node}\``}</Markdown>
                <details open>
                  <summary>原始结果</summary>
                  <JsonView
                    value={sample}
                    collapsed={1}
                    displayDataTypes={false}
                    enableClipboard={false}
                  />
                </details>
              </aside>
            </Panel>
          </Group>
        </TabsContent>
        <TabsContent value="code" forceMount className="workspace-content">
          <Suspense fallback={<p className="empty">加载编辑器…</p>}>
            {codeVisited && <CodeLab />}
          </Suspense>
        </TabsContent>
        <TabsContent
          value="chat"
          forceMount
          className="workspace-content chat-content"
        >
          <Chat selection={selection} />
        </TabsContent>
      </Tabs>
      <footer className="app-footer">
        <span>React 19 · shadcn/ui · Pi SDK</span>
        <span>EXAMPLE / 不执行编辑后的 Method</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
