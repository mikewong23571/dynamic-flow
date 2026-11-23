import type { OpenUIFocus } from '../../../../shared/openui';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Settings2 } from 'lucide-react';
import type {
  Definition,
  ModelConfiguration,
  WorkItemView,
  MethodReference,
} from '../../../../shared/records';
import type { ItemWorkspace } from '../../../../shared/workitem-composition';
import { WorkspaceSidePanel } from '../../../components/WorkspaceFrame';
import { Button } from '../../../components/ui/button';
import { api } from '../../../core/api';
import { Assistant } from '../../assistant/Assistant';
import { ModelSettingsDialog } from '../../settings/ModelSettingsDialog';
import { ConversationMenu } from './ConversationMenu';
import { useItemConversations } from './useItemConversations';
import { itemConversationMessages } from '../../../../shared/workitem-conversations';
import { errorText } from '../../../core/format';
import { MethodReferences } from '../../assistant/MethodReferences';
import { MethodReferenceCommand } from './MethodReferenceCommand';
/** One mounted Assistant: the dock and thread share its runtime and composer. */
export function CompositionAssistant({
  item,
  inspector,
  workspace,
  definition,
  selected,
  expanded,
  onExpanded,
  text,
  onText,
  dirty,
  uiFocus,
  uiDirty,
  onClearUiFocus,
  onCommand,
  onRefresh,
  onCanvas,
  onConversationChange,
  onMethodReference,
}: {
  item: WorkItemView;
  inspector?: ReactNode;
  workspace?: ItemWorkspace;
  definition: Definition;
  selected?: string;
  expanded: boolean;
  onExpanded: (value: boolean) => void;
  text: string;
  onText: (text: string) => void;
  dirty: boolean;
  uiFocus?: OpenUIFocus;
  uiDirty?: boolean;
  onClearUiFocus?: () => void;
  onCommand: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
  onCanvas: (id?: string) => void;
  onConversationChange: (id: string) => void;
  onMethodReference: (reference: MethodReference) => void;
}) {
  const [configuration, setConfiguration] = useState<ModelConfiguration | null>(
      null,
    ),
    [settings, setSettings] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const hasInspector = !!inspector;
  useEffect(() => {
    setShowInspector(hasInspector && !!selected);
  }, [hasInspector, selected]);
  const inspecting = expanded && hasInspector && showInspector;
  const work = workspace?.work?.work;
  const {
    conversationId,
    draftText,
    updateDraft,
    selectConversation,
    otherRunning,
    runningConversationId,
    references,
    updateReferences,
    clearSentReferences,
  } = useItemConversations(item.id, work, text, onText);
  useEffect(() => {
    onConversationChange(conversationId);
  }, [conversationId]);
  const [conversationBusy, setConversationBusy] = useState(false),
    [conversationError, setConversationError] = useState('');
  const [referenceSubmitting, setReferenceSubmitting] = useState(false);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const [commandPrefill, setCommandPrefill] = useState<{
    conversationId: string;
    text: string;
    focusComposer: boolean;
  }>();
  const select = (id: string) => {
    selectConversation(id);
    onClearUiFocus?.();
    setConversationError('');
  };
  const create = async () => {
    setConversationBusy(true);
    setConversationError('');
    try {
      const result = (await onCommand('createConversation')) as {
        conversationId?: string;
      };
      if (!result.conversationId)
        throw Error('会话创建未返回编号，请重新读取。');
      select(result.conversationId);
    } catch (error) {
      setConversationError(errorText(error));
    } finally {
      setConversationBusy(false);
    }
  };
  const uiLabel = uiFocus ? `界面 · ${uiFocus.block}` : undefined;
  useEffect(() => {
    void api<ModelConfiguration>('/api/config')
      .then(setConfiguration)
      .catch(() => {});
  }, []);
  return (
    <>
      <WorkspaceSidePanel
        label="工作项 Assistant"
        mode={expanded ? 'side' : 'dock'}
      >
        <div className="panel-tabs">
          {expanded && hasInspector && (
            <button
              className={inspecting ? 'selected' : ''}
              onClick={() => setShowInspector(true)}
            >
              <Settings2 size={15} />
              步骤配置
            </button>
          )}
          {expanded && hasInspector ? (
            <button
              className={!inspecting ? 'selected' : ''}
              onClick={() => setShowInspector(false)}
            >
              <Bot size={15} />
              Assistant
            </button>
          ) : (
            <strong className="panel-heading">
              <Bot size={16} />
              Assistant
            </strong>
          )}
          {uiLabel && expanded && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="composition-clear-focus"
              aria-label="清除界面关注"
              onClick={onClearUiFocus}
            >
              <X size={14} />
            </Button>
          )}
          {!inspecting && (
            <ConversationMenu
              work={work}
              selectedId={conversationId}
              busy={conversationBusy}
              onSelect={select}
              onCreate={() => void create()}
            />
          )}
        </div>
        <div className="workspace-panel-body" hidden={!inspecting}>
          {inspector}
        </div>
        <div className="workspace-panel-body" hidden={inspecting}>
          {otherRunning && !expanded && (
            <div className="composition-ui-focus">
              <span>另一会话正在回复</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  select(runningConversationId!);
                  onExpanded(true);
                }}
              >
                查看会话
              </Button>
            </div>
          )}
          {conversationError && (
            <p role="alert" className="inline-error">
              {conversationError}
            </p>
          )}
          {uiLabel && !expanded && (
            <div className="composition-ui-focus">
              <span>界面 · {uiLabel}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="清除界面关注"
                onClick={onClearUiFocus}
              >
                <X size={14} />
              </Button>
            </div>
          )}
          <Assistant
            key={conversationId}
            presentation={expanded ? 'thread' : 'composer'}
            businessTitle={item.title}
            messages={
              work ? itemConversationMessages(work, conversationId) : []
            }
            nodeLabels={Object.fromEntries(
              definition.nodes.map((n) => [n.id, n.label]),
            )}
            nodeId={selected}
            nodeLabel={
              uiLabel || definition.nodes.find((n) => n.id === selected)?.label
            }
            sampleIds={[]}
            draftId={work?.draftId}
            definitions={workspace?.work?.definitions || {}}
            onSend={async (request) => {
              onExpanded(true);
              const sentReferences = request.methodReferences ?? references;
              setReferenceSubmitting(true);
              try {
                const result = await onCommand('assistant', {
                  text: request.text,
                  methodReferences: sentReferences,
                  expectedDraftId: request.expectedDraftId,
                  nodeId: uiFocus ? undefined : request.nodeId,
                  uiFocus,
                  conversationId,
                });
                if (request.methodReferences === undefined)
                  clearSentReferences(sentReferences);
                return result;
              } finally {
                setReferenceSubmitting(false);
              }
            }}
            composerContext={
              <>
                <MethodReferences
                  references={references}
                  onOpen={onMethodReference}
                  onRemove={(reference) =>
                    updateReferences(
                      references.filter(
                        (r) =>
                          r.workId !== reference.workId ||
                          r.definitionId !== reference.definitionId,
                      ),
                    )
                  }
                />
                <MethodReferenceCommand
                  methods={workspace?.methods || []}
                  selected={references}
                  text={draftText}
                  inputRef={composerInput}
                  disabled={
                    !workspace ||
                    referenceSubmitting ||
                    dirty ||
                    !!uiDirty ||
                    otherRunning
                  }
                  onSelect={(reference, remainingText) => {
                    if (
                      !references.some(
                        (r) =>
                          r.workId === reference.workId &&
                          r.definitionId === reference.definitionId,
                      )
                    )
                      updateReferences([...references, reference]);
                    setCommandPrefill({
                      conversationId,
                      text: remainingText,
                      focusComposer: true,
                    });
                  }}
                  onActivate={(text) =>
                    setCommandPrefill({
                      conversationId,
                      text,
                      focusComposer: false,
                    })
                  }
                />
              </>
            }
            composerInputRef={composerInput}
            prefill={
              commandPrefill?.conversationId === conversationId
                ? {
                    text: commandPrefill.text,
                    onApplied: () => {
                      setCommandPrefill(undefined);
                      if (commandPrefill.focusComposer)
                        requestAnimationFrame(() =>
                          composerInput.current?.focus(),
                        );
                    },
                  }
                : undefined
            }
            onOpenMethodReference={onMethodReference}
            onStop={(requestId) => {
              void onCommand('stopAssistant', { requestId }).catch(() => {});
            }}
            onShowCanvas={onCanvas}
            disabled={dirty || uiDirty || otherRunning}
            editingContext={uiFocus ? '界面安排' : undefined}
            disabledReason={
              uiDirty
                ? '先保存或取消界面安排，再发送对话。'
                : otherRunning
                  ? '另一会话正在处理，可切回查看或停止。'
                  : undefined
            }
            draftText={draftText}
            onDraftChange={updateDraft}
            configuration={configuration}
            workSelection={work?.modelSelections?.assistant || null}
            onModelSelection={async (selection) => {
              if (!work) return;
              await api(`/api/works/${work.id}/model-selection`, {
                scope: 'assistant',
                selection,
              });
              await onRefresh();
            }}
            onOpenSettings={() => setSettings(true)}
          />
        </div>
      </WorkspaceSidePanel>
      {settings && (
        <ModelSettingsDialog
          open
          onOpenChange={setSettings}
          configuration={configuration}
          onSaved={setConfiguration}
        />
      )}
    </>
  );
}
