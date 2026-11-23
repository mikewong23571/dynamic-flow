import { useEffect, useRef, useState } from 'react';
import type { Work, MethodReference } from '../../../../shared/records';
import { defaultItemConversation } from '../../../../shared/workitem-conversations';

type Drafts = {
  id: string;
  drafts: Record<string, string>;
  references: Record<string, MethodReference[]>;
};
function readDrafts(key: string): Drafts {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (
      saved &&
      typeof saved.id === 'string' &&
      saved.drafts &&
      typeof saved.drafts === 'object'
    )
      return {
        id: saved.id,
        drafts: Object.fromEntries(
          Object.entries(saved.drafts).filter(
            ([, value]) => typeof value === 'string',
          ),
        ) as Record<string, string>,
        references: Object.fromEntries(
          Object.entries(saved.references || {}).map(([id, values]) => [
            id,
            Array.isArray(values)
              ? values
                  .filter(
                    (r) =>
                      r &&
                      typeof r.workId === 'string' &&
                      typeof r.definitionId === 'string' &&
                      typeof r.title === 'string',
                  )
                  .slice(0, 8)
              : [],
          ]),
        ),
      };
  } catch {}
  return { id: defaultItemConversation, drafts: {}, references: {} };
}
/** Per browser tab drafts; conversations themselves and all business state stay on the server. */
export function useItemConversations(
  itemId: string,
  work: Work | undefined,
  text: string,
  onText: (value: string) => void,
) {
  const key = `flowcraft.item-conversations.${itemId}`;
  const [state, setState] = useState(() => {
    const saved = readDrafts(key);
    return {
      ...saved,
      drafts: { ...saved.drafts, [saved.id]: saved.drafts[saved.id] ?? text },
    };
  });
  const current = useRef(state);
  const external = useRef({ mounted: false, text });
  const commit = (next: Drafts) => {
    current.current = next;
    setState(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  useEffect(() => {
    if (!external.current.mounted) {
      external.current.mounted = true;
      onText(current.current.drafts[current.current.id] || '');
      return;
    }
    if (text !== external.current.text) {
      external.current.text = text;
      const value = current.current;
      if (value.drafts[value.id] !== text)
        commit({ ...value, drafts: { ...value.drafts, [value.id]: text } });
    }
  }, [text]);
  const select = (id: string) => {
    const next = { ...current.current, id };
    commit(next);
    onText(next.drafts[id] || '');
  };
  // Capture this render's conversation: a late send completion must not clear another draft.
  const updateDraft = (value: string) => {
    const latest = current.current;
    commit({ ...latest, drafts: { ...latest.drafts, [state.id]: value } });
    if (latest.id === state.id) onText(value);
  };
  const updateReferences = (references: MethodReference[]) => {
    const latest = current.current;
    commit({
      ...latest,
      references: { ...latest.references, [state.id]: references },
    });
  };
  const clearSentReferences = (sent: MethodReference[]) => {
    const latest = current.current;
    updateReferences(
      (latest.references[state.id] || []).filter(
        (r) =>
          !sent.some(
            (s) => s.workId === r.workId && s.definitionId === r.definitionId,
          ),
      ),
    );
  };
  const otherMessage = work?.messages.find(
    (message) =>
      message.role === 'assistant' &&
      ['queued', 'running', 'stopping'].includes(message.status || '') &&
      (message.conversationId || defaultItemConversation) !== state.id,
  );
  return {
    conversationId: state.id,
    draftText: state.drafts[state.id] || '',
    updateDraft,
    references: state.references[state.id] || [],
    updateReferences,
    clearSentReferences,
    selectConversation: select,
    otherRunning: !!otherMessage,
    runningConversationId: otherMessage
      ? otherMessage.conversationId || defaultItemConversation
      : undefined,
  };
}
