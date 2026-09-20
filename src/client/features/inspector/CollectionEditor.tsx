import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Definition, FlowNode } from '../../../shared/records';
import { nodeInputPorts } from '../../../shared/node-ports';
import { Button } from '../../components/ui';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { changeInputNames, joinNames } from './collection-model';
import './CollectionEditor.css';

export function CollectionEditor({
  node,
  definition,
  onChange,
}: {
  node: FlowNode;
  definition: Definition;
  onChange: (d: Definition) => void;
}) {
  const ports = nodeInputPorts(node);
  const updateJoin = (patch: Partial<NonNullable<FlowNode['join']>>) =>
    onChange({
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === node.id
          ? {
              ...n,
              mode: 'all',
              operation: 'aggregate',
              join: {
                type: 'inner',
                leftKey: ['id'],
                rightKey: ['id'],
                duplicates: 'all',
                ...n.join,
                ...patch,
              },
            }
          : n,
      ),
    });
  return (
    <section className="collection-editor" aria-label="集合配置">
      {node.functionName === 'join' ? (
        <>
          <label className="field">
            关联方式
            <NativeSelect
              value={node.join?.type || 'inner'}
              onChange={(e) =>
                updateJoin({
                  type: e.target.value as NonNullable<FlowNode['join']>['type'],
                })
              }
            >
              {Object.entries(joinNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="field">
            左路关联字段
            <Input
              value={node.join?.leftKey.join('.') ?? 'id'}
              placeholder="id"
              onChange={(e) =>
                updateJoin({
                  leftKey:
                    e.target.value === '' ? [] : e.target.value.split('.'),
                })
              }
            />
          </label>
          <label className="field">
            右路关联字段
            <Input
              value={node.join?.rightKey.join('.') ?? 'id'}
              placeholder="id"
              onChange={(e) =>
                updateJoin({
                  rightKey:
                    e.target.value === '' ? [] : e.target.value.split('.'),
                })
              }
            />
          </label>
          <p className="collection-hint">
            嵌套字段用点分隔，如 customer.id；留空匹配整个值。
          </p>
          <label className="field">
            重复键
            <NativeSelect
              value={node.join?.duplicates || 'all'}
              onChange={(e) =>
                updateJoin({ duplicates: e.target.value as 'all' | 'error' })
              }
            >
              <option value="all">全部配对（可能产生多行）</option>
              <option value="error">发现重复即报错</option>
            </NativeSelect>
          </label>
        </>
      ) : (
        <>
          <div className="collection-heading">
            <span>输入端口 · {ports.length} 路</span>
            <Button
              variant="ghost"
              onClick={() => {
                let next = 1;
                while (ports.includes(`source${next}`)) next++;
                onChange(
                  changeInputNames(definition, node.id, [
                    ...ports,
                    `source${next}`,
                  ]),
                );
              }}
            >
              <Plus size={13} />
              添加端口
            </Button>
          </div>
          {ports.map((port, index) => (
            <PortField
              key={`${node.id}:${index}`}
              name={port}
              index={index}
              disabled={ports.length <= 2}
              onRemove={() =>
                onChange(
                  changeInputNames(
                    definition,
                    node.id,
                    ports.filter((_, i) => i !== index),
                  ),
                )
              }
              onRename={(name) => {
                if (name.trim() === port) return '';
                if (!name.trim()) return '端口名称不能为空';
                if (ports.some((p, i) => i !== index && p === name.trim()))
                  return '端口名称不能重复';
                onChange(
                  changeInputNames(
                    definition,
                    node.id,
                    ports.map((p, i) => (i === index ? name.trim() : p)),
                    [port, name.trim()],
                  ),
                );
                return '';
              }}
            />
          ))}
          <p className="collection-hint">
            {node.functionName === 'collect'
              ? '输出一个对象，每个端口对应一个数组。'
              : '按端口顺序汇合各路的所有项。'}
          </p>
        </>
      )}
    </section>
  );
}

function PortField({
  name,
  index,
  disabled,
  onRename,
  onRemove,
}: {
  name: string;
  index: number;
  disabled: boolean;
  onRename: (name: string) => string;
  onRemove: () => void;
}) {
  const [text, setText] = useState(name);
  const [error, setError] = useState('');
  useEffect(() => {
    setText(name);
    setError('');
  }, [name]);
  return (
    <div>
      <div className="collection-port-row">
        <span>{index + 1}</span>
        <Input
          aria-label={`输入端口 ${index + 1} 名称`}
          value={text}
          aria-invalid={!!error}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setError(onRename(text))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <Button
          variant="ghost"
          aria-label={`删除端口 ${name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X size={14} />
        </Button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
