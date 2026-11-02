export function structuredProgress(value: string): boolean {
  if (!/^[\s]*[\[{]/.test(value)) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}
