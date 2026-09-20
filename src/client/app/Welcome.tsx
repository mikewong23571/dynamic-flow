import { Plus, Workflow } from 'lucide-react';
import { Button } from '../components/ui';

/** 没有打开工作时的工作区首屏。 */
export function Welcome({
  error,
  onCreate,
}: {
  error: string;
  onCreate: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-symbol">
        <Workflow size={34} />
      </div>
      <span className="eyebrow">你的目标，你的做法</span>
      <h1>
        让复杂工作
        <br />
        一步步变清楚。
      </h1>
      <p>带上材料，形成流程。检查结果，试验更好的方法。</p>
      <Button variant="primary" onClick={onCreate}>
        <Plus size={17} />
        创建第一项工作
      </Button>
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}
