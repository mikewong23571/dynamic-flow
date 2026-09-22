import { useState } from 'react';
import {
  Workflow,
  Library,
  Settings2,
  Files,
  ChevronRight,
  ListChecks,
  X,
} from 'lucide-react';
import { Button as IconButton } from '../../components/ui/button';
import { MaterialsDialog } from '../materials/MaterialsDialog';
import { reasoningLabels } from '../settings/ModelSettingsDialog';
import { workTitle } from '../../core/format';
import type { WorkspaceController } from '../../app/controller';

export function Sidebar({
  controller,
  itemsOpen,
  onItems,
  onMethods,
}: {
  controller: WorkspaceController;
  itemsOpen: boolean;
  onItems: () => void;
  onMethods: () => void;
}) {
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const {
    libraryOpen,
    setLibraryOpen,
    setSettingsOpen,
    works,
    workId,
    configuration,
    connected,
    selectedMaterials,
    work,
    openWork,
    closeWork,
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
            className={`library-link ${itemsOpen ? 'selected' : ''}`}
            onClick={onItems}
          >
            <ListChecks size={16} />
            工作项
          </button>
          <button
            className={`library-link ${libraryOpen && !itemsOpen ? 'selected' : ''}`}
            onClick={() => {
              onMethods();
              setLibraryOpen(true);
            }}
          >
            <Library size={16} />
            全部流水线
          </button>
        </div>
        <div className="sidebar-label">已打开的流水线</div>
        <nav className="work-list" aria-label="已打开的流水线">
          {works.map((item) => (
            <div className="opened-work-row" key={item.id}>
              <button
                title={workTitle(item)}
                aria-current={
                  item.id === workId && !libraryOpen && !itemsOpen
                    ? 'page'
                    : undefined
                }
                className={`work-item ${item.id === workId && !libraryOpen && !itemsOpen ? 'selected' : ''}`}
                onClick={() => {
                  onMethods();
                  openWork(item.id);
                }}
              >
                <span className="work-indicator" />
                <span>{workTitle(item)}</span>
              </button>
              <IconButton
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`关闭流水线 ${workTitle(item)}`}
                title="关闭入口，保留流水线"
                onClick={() => closeWork(item.id)}
              >
                <X />
              </IconButton>
            </div>
          ))}
          {works.length === 0 && (
            <p className="sidebar-empty">尚未打开流水线</p>
          )}
        </nav>
        {work && !libraryOpen && !itemsOpen && (
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
                {configuration?.resolved?.default === 'catalog' &&
                configuration.defaultSelection
                  ? `${
                      configuration.catalog?.find(
                        (entry) =>
                          entry.alias === configuration.defaultSelection!.alias,
                      )?.displayName || configuration.defaultSelection.alias
                    }${
                      configuration.defaultSelection.effort
                        ? ` · ${reasoningLabels[configuration.defaultSelection.effort]}`
                        : ''
                    }`
                  : '尚未配置'}
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
