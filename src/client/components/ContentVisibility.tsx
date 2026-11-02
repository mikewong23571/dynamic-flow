import { createContext, useContext, type ReactNode } from 'react';

const Visibility = createContext(true);

/** Retained readers keep drafts, but their portals must follow the visible page. */
export function ContentVisibility({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const parent = useContext(Visibility);
  return (
    <Visibility.Provider value={parent && active}>
      {children}
    </Visibility.Provider>
  );
}

export const useContentVisibility = () => useContext(Visibility);
