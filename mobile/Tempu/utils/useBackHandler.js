import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// Android hardware-back plumbing for our hand-rolled (non react-navigation)
// screen switching. Each handler returns true when it consumed the press
// (it navigated somewhere) or false to pass it along; if nobody consumes it,
// Android does its default thing and closes the app.
//
// Handlers run deepest-first, which is what `depth` is for: React fires child
// effects before parent ones, so plain registration order would give the shell
// first refusal — the opposite of what we want.
export const BACK_DEPTH = {
  app: 0, // AppShell: auth funnel, passenger tabs, exit confirmation
  shell: 1, // nested tab hosts, e.g. DriverShell
  screen: 2, // a screen's own sub-views: sheets, threads, overlays
};

const handlers = [];
let subscription = null;
let nextId = 1;

function dispatch() {
  // Deepest wins; ties (two screens at the same depth) go to the newest, which
  // is the one stacked on top.
  const ordered = handlers.slice().sort((a, b) => b.depth - a.depth || b.id - a.id);
  for (const entry of ordered) {
    if (entry.fn() === true) return true;
  }
  return false;
}

export default function useBackHandler(handler, { depth = BACK_DEPTH.screen, enabled = true } = {}) {
  // Kept in a ref so a new closure every render doesn't re-subscribe.
  const fnRef = useRef(handler);
  fnRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const entry = { id: nextId++, depth, fn: () => fnRef.current?.() };
    handlers.push(entry);
    if (!subscription) {
      subscription = BackHandler.addEventListener('hardwareBackPress', dispatch);
    }
    return () => {
      const i = handlers.indexOf(entry);
      if (i !== -1) handlers.splice(i, 1);
      if (handlers.length === 0 && subscription) {
        subscription.remove();
        subscription = null;
      }
    };
  }, [depth, enabled]);
}
