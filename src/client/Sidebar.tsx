import { Plus, Workflow, Library, Settings2 } from 'lucide-react';

import { Button } from './components/ui';
import { reasoningLabels } from './ModelSettingsDialog';
import { workTitle } from './model';

import type { WorkspaceController } from './useWorkspace';
export function Sidebar({ controller }: { controller: WorkspaceController }) {
  const {
    libraryOpen,
    setLibraryOpen,
    setSettingsOpen,
    works,
    workId,
    configuration,
    connected,
    setError,
    setCreateOpen,
    goal,
    setAddOpen,
    panel,
    selectedMaterials,
    setSelectedMaterials,
    work,
    selected,
    openWork,
  } = controller;
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Workflow size={21} />
          </span>
          <strong>Flowcraft</strong>
          <span className="brand-beta">工作台</span>
        </div>
        <Button
          className="new-work"
          onClick={() => {
            setError('');
            setCreateOpen(true);
          }}
        >
          <Plus size={16} />
          新建工作
        </Button>
        <button
          className={`library-link ${libraryOpen ? 'selected' : ''}`}
          onClick={() => setLibraryOpen(true)}
        >
          <Library size={16} />
          所有工作
        </button>
        <div className="sidebar-label">
          最近工作 <span>{works.length}</span>
        </div>
        <nav className="work-list">
          {works.map((item) => (
            <button
              key={item.id}
              className={`work-item ${item.id === workId && !libraryOpen ? 'selected' : ''}`}
              onClick={() => openWork(item.id)}
            >
              <Workflow size={16} />
              <span>{workTitle(item)}</span>
            </button>
          ))}
          {works.length === 0 && (
            <p className="sidebar-empty">从一个目标开始</p>
          )}
        </nav>
        {work && !libraryOpen && (
          <div className="materials-panel">
            <div className="sidebar-label">
              材料 <span>{work.materials.length}</span>
              <button aria-label="添加材料" onClick={() => setAddOpen(true)}>
                <Plus size={15} />
              </button>
            </div>
            <div className="material-selection">
              <span>完整运行已选 {selectedMaterials.length} 条</span>
              <button
                onClick={() =>
                  setSelectedMaterials(
                    selectedMaterials.length === work.materials.length
                      ? []
                      : work.materials.map((m) => m.id),
                  )
                }
              >
                {selectedMaterials.length === work.materials.length
                  ? '清空'
                  : '全选'}
              </button>
            </div>
            <div className="materials-list">
              {work.materials.map((m) => (
                <label key={m.id} className="material-row">
                  <input
                    type="checkbox"
                    checked={selectedMaterials.includes(m.id)}
                    onChange={() =>
                      setSelectedMaterials((ids) =>
                        ids.includes(m.id)
                          ? ids.filter((x) => x !== m.id)
                          : [...ids, m.id],
                      )
                    }
                  />
                  <span>
                    <b>{m.id}</b>
                    <span>{m.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          className="model-settings-button"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 size={16} />
          <span>
            <strong>模型设置</strong>
            <small>
              {configuration?.model || '尚未配置'}
              {configuration?.reasoningEffort
                ? ` · 推理${reasoningLabels[configuration.reasoningEffort]}`
                : ''}
            </small>
          </span>
        </button>
        <div className="sidebar-footer">
          <span className={`connection-dot ${connected ? 'online' : ''}`} />
          {workId ? (connected ? '实时同步' : '重新连接中') : '本地工作空间'}
          <span>{configuration?.ready ? '模型已连接' : '模型未就绪'}</span>
        </div>
      </aside>
    </>
  );
}
