import { errorText } from './format';

interface ActionState {
  setBusy?: (busy: boolean) => void;
  setError: (error: string) => void;
}

/**
 * 服务端动作的统一样板：置忙、清错，失败时串化错误并复位。
 * 成功返回动作结果，失败返回 undefined；需要布尔结果时由调用方转换。
 */
export async function runAction<T>(
  run: () => T | Promise<T>,
  { setBusy, setError }: ActionState,
): Promise<T | undefined> {
  setBusy?.(true);
  setError('');
  try {
    return await run();
  } catch (reason) {
    setError(errorText(reason));
    return undefined;
  } finally {
    setBusy?.(false);
  }
}
