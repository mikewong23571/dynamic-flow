import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Work } from '../../shared/records.ts';
import {
  conversationTitle,
  defaultItemConversation,
  itemConversations,
  itemConversationMessages,
} from '../../shared/workitem-conversations.ts';

export function requireItemConversation(
  work: Work,
  id = defaultItemConversation,
) {
  const found = itemConversations(work).find(
    (conversation) => conversation.id === id,
  );
  if (!found)
    throw Object.assign(Error('此会话不属于当前工作项或已不存在。'), {
      code: 'CONVERSATION_NOT_FOUND',
    });
  return found;
}
function initialize(work: Work) {
  work.assistantConversations = itemConversations(work);
  for (const message of work.messages)
    message.conversationId ||= defaultItemConversation;
  return work.assistantConversations;
}
export function createItemConversation(work: Work) {
  const conversations = initialize(work),
    now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    title: `新会话 ${conversations.length + 1}`,
    createdAt: now,
    updatedAt: now,
  };
  conversations.push(conversation);
  return conversation;
}
export function beginItemConversationTurn(
  work: Work,
  id: string,
  text: string,
) {
  requireItemConversation(work, id);
  const conversations = initialize(work);
  const conversation = conversations.find(
    (conversation) => conversation.id === id,
  )!;
  if (
    !itemConversationMessages(work, id).some(
      (message) => message.role === 'user',
    )
  )
    conversation.title = conversationTitle(text);
  conversation.updatedAt = new Date().toISOString();
}
export function itemConversationDirectory(root: string, id: string) {
  return id === defaultItemConversation
    ? join(root, 'work-item')
    : join(root, 'work-item-conversations', id);
}
