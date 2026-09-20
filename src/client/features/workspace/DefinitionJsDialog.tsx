import type { Definition } from '../../../shared/records';
import { Modal } from '../../components/ui';

/** 只读查看当前流程定义对应的 JS。 */
export function DefinitionJsDialog({
  open,
  onOpenChange,
  definition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: Definition;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="流程定义 · 只读 JS">
      <pre className="code-view">
        export default {JSON.stringify(definition, null, 2)};
      </pre>
    </Modal>
  );
}
