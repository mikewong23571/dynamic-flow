import { useCallback, useEffect, useState } from 'react';

const pinnedKey = 'dynamic-flow.pinned-works';

function restorePinned(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(pinnedKey) || '[]');
    if (Array.isArray(saved))
      return saved.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
  return [];
}

export function usePinnedWorks() {
  const [pinned, setPinned] = useState<string[]>(restorePinned);
  useEffect(() => {
    localStorage.setItem(pinnedKey, JSON.stringify(pinned));
  }, [pinned]);
  const togglePin = useCallback((id: string) => {
    setPinned((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [id, ...list],
    );
  }, []);
  return { pinned, togglePin };
}
