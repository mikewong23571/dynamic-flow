import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { useEffect, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { method, candidateMethod, samples } from './fixtures';

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript'
      ? new TypeScriptWorker()
      : new EditorWorker(),
};
loader.config({ monaco });
const options = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  padding: { top: 18 },
};

function MethodDiff({
  original,
  modified,
}: {
  original: string;
  modified: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = monaco.editor.createModel(original, 'typescript');
    const after = monaco.editor.createModel(modified, 'typescript');
    const editor = monaco.editor.createDiffEditor(container.current!, {
      ...options,
      readOnly: true,
      renderSideBySide: true,
    });
    editor.setModel({ original: before, modified: after });
    return () => {
      // Detach first: the React wrapper disposes models before Monaco 0.56's diff widget.
      editor.setModel(null);
      editor.dispose();
      before.dispose();
      after.dispose();
    };
  }, [original, modified]);
  return <div ref={container} style={{ height: '100%' }} />;
}

export function CodeLab() {
  const [baseline, setBaseline] = useState(method);
  const [candidate, setCandidate] = useState(candidateMethod);
  const [tab, setTab] = useState<'edit' | 'diff'>('edit');
  const [comparedCode, setComparedCode] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const fresh = comparedCode === candidate;
  return (
    <div className="code-lab">
      <div className="code-toolbar">
        <div className="button-pair">
          <Button
            size="sm"
            variant={tab === 'edit' ? 'secondary' : 'ghost'}
            onClick={() => setTab('edit')}
          >
            编辑 Method
          </Button>
          <Button
            size="sm"
            variant={tab === 'diff' ? 'secondary' : 'ghost'}
            onClick={() => setTab('diff')}
          >
            代码 Diff
          </Button>
        </div>
        <span>classify.ts</span>
        <Button
          size="sm"
          onClick={() => {
            setComparedCode(candidate);
            setKept(false);
            setAdopted(false);
          }}
        >
          运行 fixture 比较
        </Button>
      </div>
      <div className="editor-space">
        {tab === 'edit' ? (
          <Editor
            path="candidate.ts"
            language="typescript"
            value={candidate}
            onChange={(value) => setCandidate(value ?? '')}
            options={options}
          />
        ) : (
          <MethodDiff original={baseline} modified={candidate} />
        )}
      </div>
      <div className="comparison">
        <div className="panel-heading">
          <h2>
            样本比较 <span className="badge">固定示例结果</span>
          </h2>
          <span>
            {comparedCode
              ? fresh
                ? '对应当前草稿'
                : '草稿已变化 · 需重新比较'
              : '未比较'}
          </span>
        </div>
        {comparedCode && (
          <>
            <table>
              <thead>
                <tr>
                  <th>样本</th>
                  <th>当前</th>
                  <th>候选</th>
                </tr>
              </thead>
              <tbody>
                {samples.slice(0, 3).map((sample) => (
                  <tr key={sample.id}>
                    <td>
                      {sample.id} · {sample.title}
                    </td>
                    <td>{sample.category}</td>
                    <td
                      className={
                        sample.category !== sample.expected ? 'changed' : ''
                      }
                    >
                      {sample.expected}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="decision-bar">
              <output data-testid="method-state">
                {adopted ? 'Method 已采用' : 'Method 未采用'} ·{' '}
                {kept ? '产物已保留' : '产物未保留'}
              </output>
              <Button
                variant="outline"
                size="sm"
                disabled={!fresh || kept}
                onClick={() => setKept(true)}
              >
                保留示例产物
              </Button>
              <Button
                size="sm"
                disabled={!fresh || adopted}
                onClick={() => {
                  setBaseline(candidate);
                  setAdopted(true);
                }}
              >
                采用候选 Method
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
