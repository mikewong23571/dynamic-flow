import { ChevronDown, Plus } from 'lucide-react';
import type { Work } from '../../../../shared/records';
import {
  itemConversations,
  itemConversationMessages,
} from '../../../../shared/workitem-conversations';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../../components/ui/dropdown-menu';
import { dateTime } from '../../../core/format';

export function ConversationMenu({
  work,
  selectedId,
  busy,
  onSelect,
  onCreate,
}: {
  work?: Work;
  selectedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const conversations = work ? itemConversations(work) : [];
  const selected = conversations.find(
    (conversation) => conversation.id === selectedId,
  );
  return (
    <div className="composition-conversation-controls">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="composition-conversation-trigger shrink"
            aria-label="切换会话"
          >
            <span>{selected?.title || '新会话'}</span>
            <ChevronDown size={12} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-72 max-w-[calc(100vw-48px)] max-h-80"
        >
          <DropdownMenuLabel>会话历史</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selectedId} onValueChange={onSelect}>
            {conversations.map((conversation) => {
              const messages = itemConversationMessages(work!, conversation.id);
              const running = messages.some(
                (message) =>
                  message.role === 'assistant' &&
                  ['queued', 'running', 'stopping'].includes(
                    message.status || '',
                  ),
              );
              return (
                <DropdownMenuRadioItem
                  key={conversation.id}
                  value={conversation.id}
                  className="items-start py-2"
                >
                  <div className="composition-conversation-option">
                    <strong>{conversation.title}</strong>
                    <span>
                      {running ? '回复中' : `${messages.length} 条消息`} ·{' '}
                      {dateTime(conversation.updatedAt)}
                    </span>
                  </div>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="新建会话"
        title="新建会话"
        disabled={busy}
        onClick={onCreate}
      >
        <Plus size={15} />
      </Button>
    </div>
  );
}
