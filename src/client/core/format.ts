import type { Work } from '../../shared/records';

export const statusNames: Record<string, string> = {
  queued: '等待中',
  running: '运行中',
  stopping: '正在停止',
  completed: '已完成',
  failed: '失败',
  cancelled: '已停止',
  interrupted: '已中断',
  blocked: '依赖失败',
  waiting: '等待事件',
};
export const active = (status?: string) =>
  ['queued', 'running', 'stopping', 'waiting'].includes(status || '');
export const short = (id?: string) => (id ? id.slice(0, 8) : '尚未生成');
/** 统一的本地时间显示：月日与时分。 */
export const dateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
/** 统一的错误串化：Error 取 message，其余取 String。 */
export const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);
// crypto.randomUUID 仅在安全上下文（HTTPS 或 localhost）可用；
// 局域网 HTTP 访问时退回同形随机 UUID，保持服务端校验兼容。
export const newId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};
export const splitMaterials = (text: string) =>
  text
    .split(/\n\s*\n|\n/)
    .map((x) => x.trim())
    .filter(Boolean);
export const portLabel = (port: string) =>
  ({
    event: '触发事件',
    input: '输入',
    output: '输出',
    matched: '符合条件',
    unmatched: '其他',
    left: '左路',
    right: '右路',
    materials: '材料',
    feedback: '反馈',
  })[port] || port;
export const workTitle = (work: Pick<Work, 'title' | 'goal'>) =>
  work.title || Array.from(work.goal.trim()).slice(0, 28).join('');
