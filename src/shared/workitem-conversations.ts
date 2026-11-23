import type { Work } from './records.js';

export const defaultItemConversation = 'main';
export const conversationTitle = (text: string) =>
  text.trim().replace(/\s+/g, ' ').slice(0, 40);
export function itemConversationMessages(
  work: Pick<Work, 'messages'>,
  id: string,
) {
  return work.messages.filter(
    (message) => (message.conversationId || defaultItemConversation) === id,
  );
}
/** Read-only projection: the original persistent conversation remains available without a migration write. */
export function itemConversations(
  work: Pick<Work, 'messages' | 'createdAt' | 'assistantConversations'>,
) {
  const saved = work.assistantConversations || [];
  if (saved.some((conversation) => conversation.id === defaultItemConversation))
    return saved;
  const first = itemConversationMessages(work, defaultItemConversation).find(
    (message) => message.role === 'user',
  );
  return [
    {
      id: defaultItemConversation,
      title: first ? conversationTitle(first.text) : '新会话',
      createdAt: work.createdAt,
      updatedAt: work.createdAt,
    },
    ...saved,
  ];
}
