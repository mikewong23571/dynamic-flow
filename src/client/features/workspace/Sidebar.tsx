import { useState } from 'react';
import { ObjectLink } from '../../components/ObjectLink';
import { routeHref, type AppRoute } from '../../app/navigation';
import {
  Workflow,
  House,
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
  route,
  navigate,
}: {
  controller: WorkspaceController;
  route: AppRoute;
  navigate: (route: AppRoute) => void;
}) {
  const [materialsFor, setMaterialsFor] = useState<string>();
  const methodOpen = route.kind === 'method';
  const section =
    route.kind === 'item' ? 'items' : methodOpen ? 'methods' : route.kind;
  const {
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
        <nav className="sidebar-nav" aria-label="应用导航">
          {(
            [
              { kind: 'home', label: '首页', Icon: House },
              { kind: 'items', label: '工作项', Icon: ListChecks },
              { kind: 'methods', label: '流水线', Icon: Library },
            ] as const
          ).map(({ kind, label, Icon }) => (
            <ObjectLink
              key={kind}
              href={routeHref({ kind })}
              className={`library-link no-underline ${section === kind ? 'selected' : ''}`}
              aria-current={section === kind ? 'page' : undefined}
              onNavigate={() => navigate({ kind })}
            >
              <Icon size={16} />
              {label}
            </ObjectLink>
          ))}
        </nav>
        <div className="sidebar-label">已打开的流水线</div>
        <nav className="work-list" aria-label="已打开的流水线">
          {works.map((item) => (
            <div className="opened-work-row" key={item.id}>
              <ObjectLink
                href={routeHref({
                  kind: 'method',
                  id: item.id,
                  tab: 'canvas',
                  ...(route.kind === 'method'
                    ? { fromItem: route.fromItem, fromTab: route.fromTab }
                    : {}),
                })}
                title={workTitle(item)}
                aria-current={
                  item.id === workId && methodOpen ? 'page' : undefined
                }
                className={`work-item no-underline ${item.id === workId && methodOpen ? 'selected' : ''}`}
                onNavigate={() => openWork(item.id)}
              >
                <span className="work-indicator" />
                <span>{workTitle(item)}</span>
              </ObjectLink>
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
        {work && methodOpen && (
          <div className="work-resources">
            <div className="sidebar-label">当前工作</div>
            <button
              className="resource-button"
              onClick={() => setMaterialsFor(workId)}
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
            <span
              className={`connection-dot ${methodOpen && connected ? 'online' : ''}`}
            />
            {methodOpen && workId
              ? connected
                ? '实时同步'
                : '重新连接中'
              : '本地工作空间'}
          </div>
        </div>
      </aside>
      <MaterialsDialog
        controller={controller}
        open={methodOpen && materialsFor === workId}
        onOpenChange={(open) => setMaterialsFor(open ? workId : undefined)}
      />
    </>
  );
}
