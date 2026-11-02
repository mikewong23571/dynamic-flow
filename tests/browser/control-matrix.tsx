import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../../src/client/components/ui/button';
import { Input } from '../../src/client/components/ui/input';
import { Textarea } from '../../src/client/components/ui/textarea';
import { NativeSelect } from '../../src/client/components/ui/native-select';
import {
  Field,
  FormFields,
  FormActions,
} from '../../src/client/components/ui/field';

/** Test-only server markup uses the real primitives and current built stylesheet. */
export function controlMatrix() {
  return renderToStaticMarkup(
    <main className="control-matrix">
      <h1>统一控件</h1>
      <FormActions>
        <Button>主要动作</Button>
        <Button variant="outline">次要动作</Button>
        <Button variant="ghost">轻动作</Button>
        <Button variant="danger">危险动作</Button>
        <Button disabled>不可用动作</Button>
      </FormActions>
      <div className="matrix-row">
        <Button size="sm" variant="outline">
          紧凑动作
        </Button>
        <Input controlSize="sm" aria-label="紧凑输入" defaultValue="28px" />
        <NativeSelect size="sm" layout="fit" aria-label="紧凑选择">
          <option>紧凑选择</option>
        </NativeSelect>
      </div>
      <Field label="普通文本" help="辅助信息">
        <Input aria-label="普通文本" defaultValue="正常内容" />
      </Field>
      <Field label="需修正的文本" error="请修正此字段">
        <Input aria-label="需修正的文本" aria-invalid defaultValue="需要确认" />
      </Field>
      <Field label="输入选择">
        <NativeSelect aria-label="输入选择">
          <option>选择内容</option>
        </NativeSelect>
      </Field>
      <Field label="长文本">
        <Textarea
          aria-label="长文本"
          rows={2}
          defaultValue="长内容在字段内部阅读和调整高度。"
        />
      </Field>
      <FormFields disabled>
        <Field label="整组禁用">
          <Input aria-label="整组禁用" defaultValue="保留的值" />
        </Field>
        <Field label="禁用选择">
          <NativeSelect aria-label="禁用选择">
            <option>保留选择</option>
          </NativeSelect>
        </Field>
      </FormFields>
    </main>,
  );
}

process.stdout.write(controlMatrix());
