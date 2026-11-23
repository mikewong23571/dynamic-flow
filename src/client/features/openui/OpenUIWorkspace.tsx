import { FormActions, FormFields } from '../../components/ui/field';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createLibrary,
  defineComponent,
  Renderer,
  useStateField,
  useTriggerAction,
  type ComponentRenderProps,
  type ActionPlan,
} from '@openuidev/react-lang';
import type { z } from 'zod/v4';
import {
  openuiContract,
  parseOpenUIProgram,
  type OpenUIField,
} from '../../../shared/openui';
import type { ItemWorkspace } from '../../../shared/workitem-composition';
import type {
  Json,
  OutputReference,
  WorkItemSummaryPage,
} from '../../../shared/records';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui';
import { DeferredDetails } from '../../components/DeferredContent';
import { itemStatusLabel, itemStatusNames } from '../work-items/item-status';
import './OpenUIWorkspace.css';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { NativeSelect } from '../../components/ui/native-select';
import { RecordTable, atPath } from '../work-items/composition/RecordTable';
import { InputFields } from '../work-items/composition/DeclaredInputForm';
import { ArtifactValue } from '../results/ArtifactValue';
import { Value } from '../results/Value';
import { DeliverySources } from '../work-items/composition/DeliverySources';
import { api } from '../../core/api';
import { errorText } from '../../core/format';
import type { DeliveryBrowserState } from '../work-items/composition/delivery-browser-state';

interface Environment {
  workspace: ItemWorkspace;
  readonly: boolean;
  busy: boolean;
  browserStates: Record<string, DeliveryBrowserState>;
  onCommand: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<ItemWorkspace>;
  onAssistant: (text: string) => Promise<unknown>;
  onSource: (source: OutputReference) => void;
  onReview: () => void;
  onContinue: (deliveryId: string, ids: string[]) => void;
  captureFormRevision?: (key: string) => void;
  discardFormRevision?: (key: string) => void;
  formRevision?: (key: string) => number | undefined;
  rebaseForm?: (key: string) => void;
}
const Context = createContext<(Environment & { error: string }) | null>(null);
function useEnvironment() {
  const value = useContext(Context);
  if (!value) throw Error('工作项界面上下文不可用');
  return value;
}
const fields = (value: unknown): OpenUIField[] =>
  Array.isArray(value)
    ? value.map((entry) => {
        const props =
          (entry as { props?: OpenUIField }).props || (entry as OpenUIField);
        return { field: props.field, label: props.label };
      })
    : [];
const findDelivery = (workspace: ItemWorkspace, output: unknown) =>
  workspace.deliveries.find((delivery) => delivery.output === output);

function ActionRenderer({ props }: ComponentRenderProps) {
  const env = useEnvironment(),
    trigger = useTriggerAction();
  return (
    <Button
      className="self-start"
      variant={
        props.emphasis === 'primary'
          ? 'default'
          : props.emphasis === 'quiet'
            ? 'ghost'
            : 'outline'
      }
      disabled={env.readonly || env.busy || props.disabled === true}
      onClick={() =>
        trigger(String(props.label), undefined, props.action as ActionPlan)
      }
    >
      {String(props.label)}
    </Button>
  );
}
function formatFieldValue(
  field: string,
  raw: Json | undefined,
): Json | undefined {
  if (
    field === 'effectiveStatus' &&
    typeof raw === 'string' &&
    raw in itemStatusNames
  )
    return itemStatusNames[raw as keyof typeof itemStatusNames];
  return raw;
}
function FieldValues({
  value,
  declared,
}: {
  value: Json | undefined;
  declared: OpenUIField[];
}) {
  return (
    <dl className="declared-record-detail">
      {declared.map((field) => {
        const display =
          value == null
            ? undefined
            : formatFieldValue(field.field, atPath(value, field.field));
        return (
          <div key={field.field}>
            <dt>{field.label}</dt>
            <dd>
              {display == null || display === '' ? (
                '—'
              ) : (
                <Value value={display} />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
function DataTableRenderer({ props, renderNode }: ComponentRenderProps) {
  const env = useEnvironment();
  // Native Query references are temporarily null before defaults/results resolve.
  const rows = (props.rows ?? []) as Record<string, Json>[];
  const sources = (props.sources ?? []) as OutputReference[];
  const [inspection, setInspection] = useState<{
    value: Json;
    source?: OutputReference;
  }>();
  const selection = useStateField<string[]>(
    `${String(props.title)}-selection`,
    props.selection as string[],
  );
  const identity = sources[0]
    ? `${sources[0].workId}/${sources[0].runId}`
    : env.workspace.item.id;
  const previous = useRef(identity);
  useEffect(() => {
    if (previous.current !== identity) {
      selection.setValue([]);
      setInspection(undefined);
      previous.current = identity;
    }
  }, [identity]);
  const detailFields = fields(props.details);
  return (
    <section
      className="composition-delivery openui-content"
      aria-label={String(props.title)}
    >
      {props.title ? <h2>{String(props.title)}</h2> : null}
      <RecordTable
        rows={rows}
        rowKey={String(props.rowKey)}
        columns={fields(props.columns)}
        searchable={props.searchable === true}
        selection={props.selection}
        onInspect={(value) =>
          setInspection({
            value,
            source: sources[rows.indexOf(value as Record<string, Json>)],
          })
        }
      >
        {Array.isArray(props.actions) && props.actions.length
          ? renderNode(props.actions)
          : null}
      </RecordTable>
      <Modal
        open={!!inspection}
        onOpenChange={(open) => !open && setInspection(undefined)}
        title={`${String(props.title)}详情`}
      >
        {inspection && (
          <>
            {detailFields.length ? (
              <FieldValues value={inspection.value} declared={detailFields} />
            ) : (
              <ArtifactValue value={inspection.value} />
            )}
            {inspection.source && (
              <FormActions>
                <Button
                  variant="outline"
                  onClick={() => env.onSource(inspection.source!)}
                >
                  查看来源
                </Button>
              </FormActions>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
function RecordsRenderer({ props, renderNode }: ComponentRenderProps) {
  const env = useEnvironment();
  const delivery = findDelivery(env.workspace, props.output);
  const [inspection, setInspection] = useState<{
    value: Json;
    source?: OutputReference;
  }>();
  const [error, setError] = useState('');
  const selectedField = useStateField<string[]>(
    String(props.output) + '-selection',
    props.selection as string[],
  );
  const identityOf = delivery
    ? `${delivery.id}/${delivery.workId}/${delivery.runId}/${delivery.output}/${delivery.recordContract?.rowKey}`
    : undefined;
  const priorIdentity = useRef(identityOf);
  useEffect(() => {
    if (priorIdentity.current !== identityOf) {
      selectedField.setValue([]);
      priorIdentity.current = identityOf;
    }
  }, [identityOf]);
  if (!delivery)
    return (
      <section className="composition-records openui-content">
        {props.title ? <h2>{String(props.title)}</h2> : null}
        <p className="meta-text">尚未绑定此项成果。</p>
      </section>
    );
  if (delivery.error) return <p role="alert">{delivery.error}</p>;
  const rowKey = delivery.recordContract?.rowKey;
  if (!rowKey || rowKey !== props.rowKey)
    return <p role="alert">记录身份已变化，请重新绑定成果。</p>;
  const identity = `${delivery.id}/${delivery.workId}/${delivery.runId}/${delivery.output}/${rowKey}`;
  const columns = fields(props.columns),
    detailFields = fields(props.details);
  return (
    <section
      className="composition-delivery openui-content"
      aria-label={String(props.title)}
    >
      {props.title ? <h2>{String(props.title)}</h2> : null}
      {error && <p role="alert">{error}</p>}
      <RecordTable
        key={identity}
        rows={(delivery.rows || []) as Record<string, Json>[]}
        rowKey={rowKey}
        columns={columns}
        searchable={props.searchable === true}
        selection={props.selection}
        groupBy={props.groupBy as string | undefined}
        browserState={(env.browserStates[identity] ??= {})}
        onContinue={
          env.readonly || props.selection == null
            ? undefined
            : (ids) => env.onContinue(delivery.id, ids)
        }
        onInspect={(value) => {
          setError('');
          void (async () => {
            try {
              const full = delivery.recordsOmitted
                ? await api<{ value: Json }>(
                    `/api/items/${env.workspace.item.id}/deliveries/${delivery.id}/records/${encodeURIComponent(String(atPath(value, rowKey)))}`,
                  )
                : { value };
              const index = delivery.rows?.findIndex(
                (row) => atPath(row, rowKey) === atPath(value, rowKey),
              );
              setInspection({
                value: full.value,
                source:
                  index === undefined ? undefined : delivery.sources[index],
              });
            } catch (reason) {
              setError(errorText(reason));
            }
          })();
        }}
      >
        {Array.isArray(props.actions) && props.actions.length
          ? renderNode(props.actions)
          : null}
      </RecordTable>
      <DeliverySources delivery={delivery} onSource={env.onSource} />
      <Modal
        open={!!inspection}
        onOpenChange={(open) => !open && setInspection(undefined)}
        title={`${String(props.title)}详情`}
        description={
          inspection
            ? String(atPath(inspection.value, rowKey) || '')
            : undefined
        }
      >
        {inspection && (
          <>
            {detailFields.length ? (
              <dl className="declared-record-detail">
                {detailFields.map((field) => (
                  <div key={field.field}>
                    <dt>{field.label}</dt>
                    <dd>
                      <ArtifactValue
                        value={atPath(inspection.value, field.field) ?? null}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ArtifactValue value={inspection.value} />
            )}
            <FormActions>
              {inspection.source && (
                <Button
                  variant="outline"
                  onClick={() => env.onSource(inspection.source!)}
                >
                  查看来源
                </Button>
              )}
              {!env.readonly && (
                <Button
                  onClick={() =>
                    env.onContinue(delivery.id, [
                      String(atPath(inspection.value, rowKey)),
                    ])
                  }
                >
                  用此记录继续
                </Button>
              )}
            </FormActions>
          </>
        )}
      </Modal>
    </section>
  );
}
function ReportRenderer({ props }: ComponentRenderProps) {
  const env = useEnvironment(),
    delivery = findDelivery(env.workspace, props.output);
  return (
    <section className="composition-delivery openui-content">
      {props.title ? <h2>{String(props.title)}</h2> : null}
      {delivery?.error ? (
        <p role="alert">{delivery.error}</p>
      ) : delivery ? (
        <>
          {fields(props.fields).length ? (
            <FieldValues
              value={delivery.value ?? delivery.rows ?? null}
              declared={fields(props.fields)}
            />
          ) : (
            <ArtifactValue value={delivery.value ?? delivery.rows ?? null} />
          )}
          <DeliverySources delivery={delivery} onSource={env.onSource} />
        </>
      ) : (
        <p className="meta-text">尚未绑定此项成果。</p>
      )}
    </section>
  );
}
function InputRenderer({ props, renderNode }: ComponentRenderProps) {
  const env = useEnvironment();
  const input = useStateField<Record<string, Json>>(
    String(props.inputPort),
    props.value as Record<string, Json>,
  );
  const work = env.workspace.work,
    definition =
      work?.definitions[work.work.draftId || work.work.adoptedId || ''];
  const method =
    typeof props.methodId === 'string'
      ? env.workspace.methods.find(
          (m) =>
            m.workId === props.methodId &&
            m.definitionId === props.methodDefinitionId,
        )
      : undefined;
  const contract = (method?.inputContracts || definition?.inputContracts)?.[
    String(props.inputPort)
  ]?.item;
  const included = Array.isArray(props.fields)
    ? (props.fields as string[])
    : undefined;
  const schema =
    contract && included
      ? {
          ...contract,
          properties: Object.fromEntries(
            Object.entries(
              (contract.properties || {}) as Record<string, unknown>,
            ).filter(([key]) => included.includes(key)),
          ),
          required: Array.isArray(contract.required)
            ? contract.required.filter((key) => included.includes(String(key)))
            : [],
        }
      : contract;
  const formKey = `${props.methodId || ''}/${props.methodDefinitionId || ''}/${String(props.inputPort)}`;
  const delivery = props.output
    ? findDelivery(env.workspace, props.output)
    : undefined;
  const inputIdentity = `${props.methodId || work?.work.id}/${props.methodDefinitionId || work?.work.draftId}/${String(props.inputPort)}/${delivery?.id || ''}`;
  const priorInput = useRef(inputIdentity);
  const priorFormKey = useRef(formKey);
  useEffect(() => {
    if (priorInput.current !== inputIdentity) {
      input.setValue({});
      env.discardFormRevision?.(priorFormKey.current);
      env.discardFormRevision?.(formKey);
      priorInput.current = inputIdentity;
      priorFormKey.current = formKey;
    }
  }, [inputIdentity]);
  return (
    <section className="declared-input-form openui-content">
      {props.title ? <h2>{String(props.title)}</h2> : null}
      {schema ? (
        <FormFields disabled={env.readonly || env.busy}>
          <InputFields
            schema={schema}
            value={input.value || {}}
            onChange={(value) => {
              env.captureFormRevision?.(formKey);
              input.setValue(value as Record<string, Json>);
            }}
          />
          {env.formRevision?.(formKey) !== undefined &&
            env.formRevision(formKey) !== env.workspace.item.revision && (
              <div role="status" className="meta-text">
                工作项已变化，当前输入仍基于编辑开始时的版本。
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => env.rebaseForm?.(formKey)}
                >
                  保留内容，使用当前版本
                </Button>
              </div>
            )}
          <FormActions>{renderNode(props.submit)}</FormActions>
        </FormFields>
      ) : (
        <p role="status" className="meta-text">
          当前方法尚未声明此输入合同，请让Assistant补齐。
        </p>
      )}
    </section>
  );
}
function NavigationRenderer({ props, renderNode }: ComponentRenderProps) {
  const views = (props.views || []) as {
    props: { title: string };
    statementId?: string;
  }[];
  const [active, setActive] = useState(views[0]?.statementId || '0');
  const key = (view: (typeof views)[number], index: number) =>
    view.statementId || String(index);
  const selected = views.some((view, index) => key(view, index) === active)
    ? active
    : views[0]
      ? key(views[0], 0)
      : '';
  return (
    <Tabs value={selected} onValueChange={setActive} className="gap-[16px]">
      {props.navigation === 'select' ? (
        <NativeSelect
          aria-label="业务视图"
          value={selected}
          onChange={(e) => setActive(e.target.value)}
        >
          {views.map((view, i) => (
            <option key={key(view, i)} value={key(view, i)}>
              {view.props.title}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <TabsList className="overflow-x-auto">
          {views.map((view, i) => (
            <TabsTrigger key={key(view, i)} value={key(view, i)}>
              {view.props.title}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {views.map((view, i) => (
        <TabsContent
          key={key(view, i)}
          value={key(view, i)}
          forceMount
          hidden={selected !== key(view, i)}
        >
          {renderNode(view)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
const SectionDepth = createContext(0);
function SectionRenderer({ props, renderNode }: ComponentRenderProps) {
  const depth = useContext(SectionDepth);
  const headingId = useId();
  const title = String(props.title || '').trim();
  const headings = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;
  const Heading = headings[Math.min(depth, headings.length - 1)];
  return (
    <section
      className="composition-section openui-section"
      aria-labelledby={title ? headingId : undefined}
      data-section-depth={depth}
    >
      {title && (
        <Heading id={headingId} className="openui-section-heading">
          {title}
        </Heading>
      )}
      <SectionDepth.Provider value={depth + (title ? 1 : 0)}>
        <div className="openui-stack">{renderNode(props.children)}</div>
      </SectionDepth.Provider>
    </section>
  );
}

function DialogRenderer({ props, renderNode }: ComponentRenderProps) {
  const env = useEnvironment();
  const open = useStateField<boolean>(
    `${String(props.title)}-open`,
    props.open as boolean,
  );
  return (
    <Modal
      title={String(props.title)}
      open={open.value === true}
      onOpenChange={open.setValue}
      className="composition-input-dialog"
    >
      {env.error && (
        <p role="alert" className="inline-error">
          {env.error}
        </p>
      )}
      {/* The task title starts a new outline, independent of the opener's nesting. */}
      <SectionDepth.Provider value={1}>
        {renderNode(props.children)}
      </SectionDepth.Provider>
    </Modal>
  );
}
const adapters: Record<string, (props: ComponentRenderProps) => ReactNode> = {
  Workspace: ({ props, renderNode }) => (
    <div className="openui-workspace" data-openui-renderer="official">
      {renderNode(props.children)}
    </div>
  ),
  Stack: ({ props, renderNode }) => (
    <div
      className={`openui-stack ${props.direction === 'horizontal' ? 'openui-stack-horizontal' : ''}`}
    >
      {renderNode(props.children)}
    </div>
  ),
  Disclosure: ({ props, renderNode }) => (
    <DeferredDetails
      className="openui-disclosure"
      summary={String(props.title)}
    >
      {() => <div className="openui-stack">{renderNode(props.children)}</div>}
    </DeferredDetails>
  ),
  Dialog: DialogRenderer,
  Section: SectionRenderer,
  View: ({ props, renderNode }) => (
    <div className="openui-view">{renderNode(props.children)}</div>
  ),
  ViewNavigation: NavigationRenderer,
  Field: () => null,
  TextContent: ({ props }) => <p>{String(props.text)}</p>,
  ActionButton: ActionRenderer,
  Records: RecordsRenderer,
  Report: ReportRenderer,
  InputForm: InputRenderer,
  Details: ({ props }) => (
    <section className="composition-section openui-content">
      {props.title ? <h2>{String(props.title)}</h2> : null}
      <FieldValues
        value={props.value as Json | undefined}
        declared={fields(props.fields)}
      />
    </section>
  ),
  Metric: ({ props }) => (
    <dl className="openui-metric">
      <dt>{String(props.label)}</dt>
      <dd>
        {props.value === null || props.value === undefined
          ? '—'
          : String(props.value)}
      </dd>
    </dl>
  ),
  DataTable: DataTableRenderer,
};
export const workItemLibrary = createLibrary({
  id: openuiContract.id,
  root: openuiContract.root,
  components: Object.values(openuiContract.components).map((component) =>
    defineComponent({ ...component, component: adapters[component.name] }),
  ),
});

/** OpenUI owns parsing, rendering and local bindings; this bridge only calls existing business actions. */
export function OpenUIWorkspace({
  workspace,
  readonly: requestedReadonly = false,
  busy = false,
  browserStates,
  onCommand,
  onAssistant,
  onSource,
  onReview,
  onContinue,
  source,
}: Omit<Environment, 'readonly' | 'busy'> & {
  readonly?: boolean;
  busy?: boolean;
  source?: string;
}) {
  const readonly =
    requestedReadonly ||
    (source !== undefined && source !== workspace.uiProgram?.source);
  const current = useRef(workspace);
  current.current = workspace;
  const callbacks = useRef({ onCommand, onReview });
  callbacks.current = { onCommand, onReview };
  const [error, setError] = useState('');
  const nativeState = useRef<Record<string, unknown>>({});
  const formRevisions = useRef(new Map<string, number>());
  const [, renderFormRevision] = useState(0);
  const env = {
    error,
    formRevision: (key: string) => formRevisions.current.get(key),
    rebaseForm: (key: string) => {
      formRevisions.current.set(key, current.current.item.revision);
      setError('');
      renderFormRevision((n) => n + 1);
    },
    captureFormRevision: (key: string) => {
      if (!formRevisions.current.has(key))
        formRevisions.current.set(key, current.current.item.revision);
    },
    discardFormRevision: (key: string) => {
      formRevisions.current.delete(key);
    },
    workspace,
    readonly,
    busy,
    browserStates,
    onCommand,
    onAssistant,
    onSource,
    onReview,
    onContinue,
  };
  const provider = useMemo(() => {
    const reads = {
      read_workspace: async () => ({
        ...current.current,
        item: {
          ...current.current.item,
          statusLabel: itemStatusLabel(current.current.item),
        },
      }),
      read_inputs: async (args: Record<string, unknown>) => {
        const query = new URLSearchParams();
        for (const key of ['offset', 'limit'])
          if (args[key] !== undefined) query.set(key, String(args[key]));
        return api(
          `/api/items/${current.current.item.id}/inputs/${encodeURIComponent(String(args.inputPort))}?${query}`,
        );
      },
      read_children: async (args: Record<string, unknown> = {}) => {
        const query = new URLSearchParams({
          summary: 'true',
          rootId: current.current.item.id,
          view: args.scope === 'descendants' ? 'all' : 'children',
        });
        for (const key of ['status', 'query', 'page', 'pageSize'])
          if (args[key] !== undefined) query.set(key, String(args[key]));
        return api<WorkItemSummaryPage>(`/api/items?${query}`);
      },
      read_output: async (args: Record<string, unknown>) => {
        const query = new URLSearchParams();
        for (const key of [
          'output',
          'nodeId',
          'port',
          'runId',
          'offset',
          'limit',
        ])
          if (args[key] !== undefined) query.set(key, String(args[key]));
        return api(`/api/items/${current.current.item.id}/output?${query}`);
      },
      read_delivery: async (args: Record<string, unknown>) =>
        findDelivery(current.current, args.output) || { rows: [], value: null },
    };
    if (readonly) return reads;
    const command = async (
      action: string,
      args: Record<string, unknown> = {},
    ) => {
      setError('');
      try {
        return await callbacks.current.onCommand(action, args);
      } catch (reason) {
        setError(errorText(reason));
        throw reason;
      }
    };
    const formCommand = async (
      action: string,
      args: Record<string, unknown>,
    ) => {
      let inputPort = args.inputPort;
      if (
        inputPort === undefined &&
        args.draft !== undefined &&
        current.current.uiProgram
      ) {
        const forms = parseOpenUIProgram(
          current.current.uiProgram.source,
        ).inputs.filter(
          (form) =>
            form.output === args.output &&
            form.methodId === args.methodId &&
            form.methodDefinitionId === args.methodDefinitionId,
        );
        const ports = [...new Set(forms.map((form) => form.inputPort))];
        if (ports.length === 1) inputPort = ports[0];
      }
      const key = `${args.methodId || ''}/${args.methodDefinitionId || ''}/${String(inputPort)}`;
      const baseRevision = formRevisions.current.get(key);
      const result = await command(action, {
        ...args,
        ...(inputPort === undefined ? {} : { inputPort }),
        ...(baseRevision === undefined ? {} : { baseRevision }),
      });
      formRevisions.current.delete(key);
      return result;
    };
    return {
      ...reads,
      submit_input: async (args: Record<string, unknown>) =>
        formCommand(args.previousId ? 'reviseInput' : 'addInput', {
          ...args,
          ...(args.previousId ? { inputId: args.previousId } : {}),
        }),
      continue_records: async (args: Record<string, unknown>) => {
        const delivery = findDelivery(current.current, args.output);
        if (!delivery) throw Error('成果尚未绑定');
        return formCommand('continueRecords', {
          ...args,
          deliveryId: delivery.id,
        });
      },
      bind_inputs: async (args: Record<string, unknown>) =>
        command('bindInputs', args),
      execute: async () => command('run'),
      publish_delivery: async (args: Record<string, unknown>) =>
        command('publishDelivery', {
          ...args,
          programId: current.current.uiProgram?.id,
        }),
      review: async () => {
        callbacks.current.onReview();
        return { opened: true };
      },
    };
  }, [readonly]);
  return (
    <Context.Provider value={env}>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <Renderer
        library={workItemLibrary}
        response={source ?? workspace.uiProgram?.source ?? null}
        initialState={nativeState.current}
        onStateUpdate={(state) => {
          nativeState.current = state;
        }}
        toolProvider={provider}
        onAction={(event) => {
          if (readonly) return;
          if (event.type === 'continue_conversation')
            void onAssistant(
              event.humanFriendlyMessage +
                (event.params.context
                  ? `\n所选界面上下文：${JSON.stringify(event.params.context)}`
                  : ''),
            ).catch((reason) => setError(errorText(reason)));
        }}
        onError={(errors) => {
          const message = errors.map((error) => error.message).join('；');
          if (message) setError(message);
        }}
      />
    </Context.Provider>
  );
}
