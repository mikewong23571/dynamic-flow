import { useRef } from 'react';
import { useContentVisibility } from './ContentVisibility';

/** Shared task handoff for both controlled forms and the dedicated material reader. */
export function useTaskDialogFocus(onCloseAutoFocus?: (event: Event) => void) {
  const visible = useContentVisibility();
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnContext = useRef<HTMLElement | null>(null);
  const returnIdentity = useRef('');
  const dialog = useRef<HTMLElement | null>(null);
  const suspended = useRef(false);
  const identity = (element: HTMLElement) =>
    element.getAttribute('aria-label') ||
    element.getAttribute('name') ||
    element.id ||
    element.textContent?.trim().slice(0, 256) ||
    '';
  return {
    onOpenAutoFocus(event: Event) {
      dialog.current =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[role="dialog"]')
          : null;
      if (suspended.current && returnFocus.current?.isConnected) {
        suspended.current = false;
        return;
      }
      suspended.current = false;
      const target =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      returnFocus.current =
        target === document.body ||
        target === document.documentElement ||
        target?.matches('[data-radix-focus-guard]')
          ? null
          : target;
      returnIdentity.current = returnFocus.current
        ? identity(returnFocus.current)
        : '';
      returnContext.current =
        returnFocus.current?.closest<HTMLElement>(
          '.composition-workspace, .workspace',
        ) || null;
    },
    onCloseAutoFocus(event: Event) {
      if (!visible) {
        suspended.current = true;
        event.preventDefault();
        return;
      }
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const target = returnFocus.current;
      if (
        target?.isConnected &&
        identity(target) === returnIdentity.current &&
        !dialog.current?.contains(target) &&
        target.getClientRects().length &&
        !target.closest('[hidden], [inert]') &&
        !target.matches(
          ':disabled, [aria-disabled="true"], [data-radix-focus-guard]',
        )
      ) {
        event.preventDefault();
        target.focus({ preventScroll: true });
        return;
      }
      const scope = returnContext.current?.isConnected
        ? returnContext.current
        : document;
      const headings = Array.from(
        scope.querySelectorAll<HTMLElement>('.workspace-header h1'),
      );
      const mains = Array.from(scope.querySelectorAll<HTMLElement>('main'));
      if (scope instanceof HTMLElement && scope.matches('main'))
        mains.unshift(scope);
      const fallback = [...headings, ...mains].find(
        (element) =>
          element.getClientRects().length &&
          !element.closest('[hidden], [inert]'),
      );
      if (fallback) {
        event.preventDefault();
        fallback.tabIndex = -1;
        fallback.focus({ preventScroll: true });
      }
    },
  };
}
