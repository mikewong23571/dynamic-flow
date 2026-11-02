import { useMemo, useState, type ReactNode } from 'react';
import { Copy, FileText, X } from 'lucide-react';
import type { WorkItemInput } from '../../shared/records';
import { materialPresentation } from '../core/material';
import { ArtifactValue } from '../features/results/ArtifactValue';
import { ArtifactViewControls } from '../features/results/ArtifactPresentation';
import { DeferredContent } from './DeferredContent';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui';
import './MaterialDialog.css';

export function MaterialDialog({
  material,
  materialId,
  open,
  onOpenChange,
  trigger,
  onSource,
  onRestoreFocus,
}: {
  material?: WorkItemInput['materials'][number];
  materialId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  onSource?: () => void;
  onRestoreFocus?: () => void;
}) {
  const [view, setView] = useState<'content' | 'raw'>('content');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const presentation = useMemo(
    () => (material ? materialPresentation(material) : undefined),
    [material?.text],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        showCloseButton={false}
        className="material-reader bg-[var(--paper)] flex h-[min(720px,calc(100dvh-48px))] w-[min(960px,calc(100vw-48px))] max-w-[min(960px,calc(100vw-48px))] sm:max-w-[min(960px,calc(100vw-48px))] flex-col gap-0 overflow-hidden p-0"
        onCloseAutoFocus={
          onRestoreFocus
            ? (event) => {
                event.preventDefault();
                onRestoreFocus();
              }
            : undefined
        }
      >
        <DialogHeader className="material-reader-header flex-row items-start gap-3 space-y-0 text-left">
          <div className="material-reader-icon">
            <FileText size={20} aria-hidden="true" />
          </div>
          <div className="material-reader-identity">
            <DialogTitle
              className="material-reader-title text-base leading-6 font-medium"
              title={presentation?.title}
            >
              {presentation?.title || '材料当前不可用'}
            </DialogTitle>
            <DialogDescription className="material-reader-meta mt-1.5 text-xs">
              引用编号 {material?.id || materialId || '—'}
              {material
                ? ` · ${(material.characters ?? material.text.length).toLocaleString()} 字符`
                : ''}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" className="size-8 p-0" aria-label="关闭">
              <X size={16} />
            </Button>
          </DialogClose>
        </DialogHeader>
        {material && (
          <div className="material-reader-toolbar">
            <ArtifactViewControls value={view} onChange={setView} />
            <div className="material-reader-actions">
              {onSource && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                    onSource();
                  }}
                >
                  查看引用来源
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={!!material.contentUrl}
                onClick={async () => {
                  setCopyError('');
                  try {
                    await navigator.clipboard.writeText(material.text);
                    setCopied(true);
                  } catch {
                    setCopyError('复制失败，请在原始数据中选取原文。');
                  }
                }}
              >
                <Copy size={14} />
                {copied ? '已复制' : '复制原文'}
              </Button>
            </div>
          </div>
        )}
        {copyError && (
          <p className="material-reader-error" role="alert">
            {copyError}
          </p>
        )}
        <div
          className="material-reader-body"
          hidden={view !== 'content'}
          aria-label="材料内容"
          tabIndex={0}
        >
          {open && (
            <DeferredContent active={view === 'content'}>
              {() =>
                presentation ? (
                  <ArtifactValue
                    contentUrl={material?.contentUrl}
                    value={presentation.value}
                    view="content"
                  />
                ) : (
                  <p className="muted">
                    此材料当前不可用，可在环节的固定输入中检查当时内容。
                  </p>
                )
              }
            </DeferredContent>
          )}
        </div>
        <div
          className="material-reader-body"
          hidden={view !== 'raw'}
          aria-label="材料原文"
          tabIndex={0}
        >
          {open && (
            <DeferredContent active={view === 'raw'}>
              {() => (
                <ArtifactValue
                  value={material?.text || ''}
                  contentUrl={material?.contentUrl}
                  view="raw"
                />
              )}
            </DeferredContent>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
