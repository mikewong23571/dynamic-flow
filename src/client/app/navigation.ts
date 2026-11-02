import { useCallback, useEffect, useState } from 'react';

export type ItemTab = 'results' | 'flow' | 'inputs' | 'history';
export type MethodTab = 'canvas' | 'results' | 'compare';
export type ResultView = 'overview' | 'artifacts' | 'process';
export type AppRoute =
  | { kind: 'home' }
  | { kind: 'items' }
  | { kind: 'methods' }
  | { kind: 'item'; id: string; tab?: ItemTab }
  | {
      kind: 'method';
      id: string;
      tab?: MethodTab;
      runId?: string;
      resultView?: ResultView;
      fromItem?: string;
      fromTab?: ItemTab;
    };

export function readRoute(url: URL): AppRoute {
  const parts = url.pathname.split('/').filter(Boolean);
  const value = url.searchParams.get('tab');
  if (parts.length === 1 && (parts[0] === 'items' || parts[0] === 'methods'))
    return { kind: parts[0] };
  if (parts.length === 2 && (parts[0] === 'items' || parts[0] === 'methods')) {
    let id: string;
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return { kind: 'home' };
    }
    if (parts[0] === 'items') return { kind: 'item', id, tab: itemTab(value) };
    return {
      kind: 'method',
      id,
      tab: value === 'results' || value === 'compare' ? value : 'canvas',
      runId: url.searchParams.get('run') || undefined,
      resultView: resultView(url.searchParams.get('view')),
      fromItem: url.searchParams.get('fromItem') || undefined,
      fromTab: itemTab(url.searchParams.get('fromTab')),
    };
  }
  return { kind: 'home' };
}
function resultView(value: string | null): ResultView | undefined {
  return value === 'overview' || value === 'artifacts' || value === 'process'
    ? value
    : undefined;
}
function itemTab(value: string | null): ItemTab | undefined {
  return value === 'results' ||
    value === 'flow' ||
    value === 'inputs' ||
    value === 'history'
    ? value
    : undefined;
}
export function routeHref(route: AppRoute): string {
  if (route.kind === 'home') return '/';
  if (route.kind === 'items' || route.kind === 'methods')
    return `/${route.kind}`;
  const parameters = new URLSearchParams();
  if (route.tab) parameters.set('tab', route.tab);
  if (route.kind === 'method') {
    if (route.runId) parameters.set('run', route.runId);
    if (route.resultView) parameters.set('view', route.resultView);
    if (route.fromItem) parameters.set('fromItem', route.fromItem);
    if (route.fromTab) parameters.set('fromTab', route.fromTab);
  }
  return `/${route.kind === 'item' ? 'items' : 'methods'}/${encodeURIComponent(route.id)}${parameters.size ? `?${parameters}` : ''}`;
}
/** URLs hold only page identity and reading location. Domain commands never run on popstate. */
export function useNavigation() {
  const [route, setRoute] = useState(() =>
    readRoute(new URL(window.location.href)),
  );
  useEffect(() => {
    const restore = () => setRoute(readRoute(new URL(window.location.href)));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const navigate = useCallback((next: AppRoute, replace = false) => {
    const href = routeHref(next);
    const current = new URL(window.location.href);
    if (href === current.pathname + current.search) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
    setRoute(next);
  }, []);
  return { route, navigate };
}
