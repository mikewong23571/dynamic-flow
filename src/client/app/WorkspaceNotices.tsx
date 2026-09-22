import type { RefObject } from 'react';
import type { ModelConfiguration } from '../../shared/records';
import { Button } from '../components/ui';

/** 工作区横幅：错误、一般提示、模型未配置与保存版本冲突。 */
export function WorkspaceNotices({
  error,
  setError,
  notice,
  setNotice,
  configuration,
  dirty,
  draftId,
  baseId,
  discardLocalChanges,
}: {
  error: string;
  setError: (error: string) => void;
  notice: string;
  setNotice: (notice: string) => void;
  configuration: ModelConfiguration | null;
  dirty: boolean;
  draftId?: string;
  baseId: RefObject<string | undefined>;
  discardLocalChanges: () => void;
}) {
  return (
    <>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError('')}>关闭</button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}>关闭</button>
        </div>
      )}
      {configuration && !configuration.ready && (
        <div className="notice">
          {configuration.error ||
            '模型未配置。可编辑已有流程，AI 生成与处理需要先配置模型。'}
        </div>
      )}
      {dirty && draftId !== baseId.current && (
        <div className="notice">
          保存版本已被其他编辑更新。你的未提交内容已保留；请先检查新版本。
          <Button onClick={discardLocalChanges}>
            放弃本地修改并载入新版本
          </Button>
        </div>
      )}
    </>
  );
}
