import { useRef, useState } from 'react';
import {
  ArrowRight,
  Paperclip,
  MoreHorizontal,
  X,
  FileText,
} from 'lucide-react';
import type { WorkItemView } from '../../../shared/records';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { errorText } from '../../core/format';
import { createItemWithFiles } from './create-item';

export function WorkItemStart({
  onCreated,
  onAdvanced,
}: {
  onCreated: (item: WorkItemView) => void;
  onAdvanced: () => void;
}) {
  const [goal, setGoal] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [created, setCreated] = useState<WorkItemView>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  async function start() {
    setBusy(true);
    setError('');
    try {
      const item = await createItemWithFiles({
        input: {
          title: Array.from(goal.trim().split('\n')[0]).slice(0, 50).join(''),
          goal: goal.trim(),
          materials: [],
        },
        files,
        created,
        onSaved: setCreated,
        onUploaded: (file) =>
          setFiles((previous) => previous.filter((entry) => entry !== file)),
      });
      onCreated(item);
      setCreated(undefined);
      setGoal('');
      setFiles([]);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="work-start" aria-label="开始一件事">
      <div className="work-start-heading">
        <h2>开始一件事</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="完整创建表单"
          title="填写更多信息"
          onClick={onAdvanced}
        >
          <MoreHorizontal size={17} />
        </Button>
      </div>
      <form
        className="work-start-form"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <Textarea
          className="min-h-[88px] resize-y border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:ring-0 dark:bg-transparent"
          aria-label="工作需求"
          placeholder="描述你想完成的事情，带上已有材料…"
          rows={3}
          value={goal}
          disabled={busy || !!created}
          onChange={(event) => setGoal(event.target.value)}
          required
        />
        {!!files.length && (
          <div className="work-start-files">
            {files.map((file, index) => (
              <span key={index}>
                <FileText size={14} />
                {file.name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`移除 ${file.name}`}
                  disabled={busy || !!created}
                  onClick={() =>
                    setFiles((previous) =>
                      previous.filter((entry) => entry !== file),
                    )
                  }
                >
                  <X size={12} />
                </Button>
              </span>
            ))}
          </div>
        )}
        <footer>
          <input
            type="file"
            multiple
            hidden
            ref={fileInput}
            onChange={(event) => {
              const added = Array.from(event.target.files || []);
              setFiles((previous) => [...previous, ...added]);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !!created}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={15} />
            添加文件
          </Button>
          <Button type="submit" disabled={busy || !goal.trim()}>
            {busy ? '正在准备…' : created ? '继续准备' : '开始'}
            <ArrowRight size={15} />
          </Button>
        </footer>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {error}
          {created && (
            <Button variant="ghost" onClick={() => onCreated(created)}>
              打开已创建的工作项
            </Button>
          )}
        </p>
      )}
    </section>
  );
}
