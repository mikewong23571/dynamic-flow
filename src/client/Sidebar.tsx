import { useState } from 'react';
import {
  Plus,
  Workflow,
  Library,
  Settings2,
  Files,
  ChevronRight,
} from 'lucide-react';
import { Button } from './components/ui';
import { MaterialsDialog } from './MaterialsDialog';
import { reasoningLabels } from './ModelSettingsDialog';
import { workTitle } from './model';
import type { WorkspaceController } from './useWorkspace';

export function Sidebar({ controller }: { controller: WorkspaceController }) {
  const [materialsOpen, setMaterialsOpen] = useState(false);
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
    selectedMaterials,
    work,
    openWork,
  } = controller;
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Workflow size={20} />
          </span>
          <strong>Flowcraft</strong>
          <span className="brand-beta">LOCAL</span>
        </div>
        <div className="sidebar-nav">
          <button
            className={`library-link ${libraryOpen ? 'selected' : ''}`}
            onClick={() => setLibraryOpen(true)}
          >
            <Library size={16} />
            所有工作
          </button>
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
        </div>
        <div className="sidebar-label">最近工作</div>
        <nav className="work-list" aria-label="最近工作">
          {works.slice(0, 5).map((item) => (
            <button
              key={item.id}
              title={workTitle(item)}
              aria-current={
                item.id === workId && !libraryOpen ? 'page' : undefined
              }
              className={`work-item ${item.id === workId && !libraryOpen ? 'selected' : ''}`}
              onClick={() => openWork(item.id)}
            >
              <span className="work-indicator" />
              <span>{workTitle(item)}</span>
            </button>
          ))}
          {works.length === 0 && <p className="sidebar-empty">暂无工作</p>}
        </nav>
        {work && !libraryOpen && (
          <div className="work-resources">
            <div className="sidebar-label">当前工作</div>
            <button
              className="resource-button"
              onClick={() => setMaterialsOpen(true)}
              aria-label="输入材料"
            >
              <Files size={16} />
              <span>
                <strong>输入材料</strong>
                <small>
                  {selectedMaterials.length} / {work.materials.length} 条已选
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
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
          </div>
        </div>
      </aside>
      <MaterialsDialog
        controller={controller}
        open={materialsOpen}
        onOpenChange={setMaterialsOpen}
      />
    </>
  );
}
