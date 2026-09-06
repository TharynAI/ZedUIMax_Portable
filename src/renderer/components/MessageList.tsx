/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Virtualized message list using react-virtuoso
    Why: Handle large conversations with smooth scrolling
    Expected: Smooth scroll performance even with 1000+ messages
    2026-01-01
    What: Phase 2 - Start at bottom (most recent messages)
    Why: Chat apps show newest messages first, scroll up for history
    Expected: Conversation opens scrolled to bottom, can scroll up for older messages
    2026-01-02
    What: Step 5 - Floating navigation buttons
    Why: Quick scroll to top/bottom of conversation
    Expected: Floating buttons appear based on scroll position
*/
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChevronUp, ChevronDown } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { SessionMessage } from '../types/session';
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Forward providerId to MessageBubble so assistant label is correct
    Why: Codex/Cursor sessions were showing 'Claude' label
    Expected: Optional prop; falls back to 'claude' default in MessageBubble when omitted
*/
import type { ProviderId } from '../providers/display';
// <END Tharyn | CursorCLI

interface MessageListProps {
  messages: SessionMessage[];
  targetIndex?: number | null;
  onTargetReached?: () => void;
  searchQuery?: string;      // Filter mode: only show matching messages
  highlightQuery?: string;   // Navigate mode: highlight matches in all messages
  providerId?: ProviderId;   // Cursor/Codex assistant label support
}

// Extract content from message object
function getMessageContent(msg: SessionMessage): string {
  if (msg.type === 'summary') {
    return msg.summary || '';
  }

  const content = msg.message?.content;

  if (!content) return '';

  // Handle array content (multi-part messages)
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('\n');
  }

  // Handle string content
  return typeof content === 'string' ? content : '';
}

const MessageList = memo(function MessageList({
  messages,
  targetIndex,
  onTargetReached,
  searchQuery,
  highlightQuery,
  providerId,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atTop, setAtTop] = useState(false);
  const [atBottom, setAtBottom] = useState(true); // Start at bottom

  // Filter to only user/assistant messages (skip summaries)
  // In filter mode, also filter by search query
  const displayMessages = useMemo(() => {
    let filtered = messages.filter(
      (msg) => msg.type === 'user' || msg.type === 'assistant'
    );

    // Filter mode: only show messages matching search query
    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((msg) => {
        const content = getMessageContent(msg).toLowerCase();
        return content.includes(query);
      });
    }

    return filtered;
  }, [messages, searchQuery]);

  // Scroll handlers
  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: displayMessages.length - 1,
      behavior: 'smooth',
    });
  }, [displayMessages.length]);

  // Render individual message
  const renderMessage = useCallback(
    (index: number, msg: SessionMessage) => {
      const content = getMessageContent(msg);

      // Skip empty messages
      if (!content.trim()) return null;

      // Treat isCompactSummary (context continuation) messages as assistant type
      const displayType: 'user' | 'assistant' = msg.isCompactSummary
        ? 'assistant'
        : (msg.type as 'user' | 'assistant');

      return (
        <MessageBubble
          type={displayType}
          content={content}
          timestamp={msg.timestamp}
          highlightQuery={highlightQuery}
          providerId={providerId}
        />
      );
    },
    [highlightQuery, providerId]
  );

  // Handle initial scroll position
  // If targetIndex provided, scroll to that message; otherwise scroll to bottom (most recent)
  const initialTopMostItemIndex = useMemo(() => {
    if (targetIndex !== null && targetIndex !== undefined && targetIndex >= 0) {
      // Find the corresponding index in displayMessages
      let displayIndex = 0;
      for (let i = 0; i < messages.length && i <= targetIndex; i++) {
        if (messages[i].type === 'user' || messages[i].type === 'assistant') {
          if (i === targetIndex) {
            return displayIndex;
          }
          displayIndex++;
        }
      }
    }
    // Default: start at bottom (last message)
    return displayMessages.length > 0 ? displayMessages.length - 1 : 0;
  }, [messages, targetIndex, displayMessages.length]);

  if (displayMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <p>No messages in this conversation</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={displayMessages}
        itemContent={renderMessage}
        initialTopMostItemIndex={initialTopMostItemIndex}
        followOutput="auto"
        className="h-full"
        style={{ height: '100%' }}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        atTopStateChange={setAtTop}
        atBottomStateChange={setAtBottom}
      />

      {/* Floating navigation buttons */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        {!atTop && (
          <button
            onClick={scrollToTop}
            className="p-2 bg-bg-secondary border border-accent-border/30 rounded hover:bg-accent/15 hover:text-accent transition-colors"
            title="Scroll to top"
          >
            <ChevronUp size={18} />
          </button>
        )}
        {!atBottom && (
          <button
            onClick={scrollToBottom}
            className="p-2 bg-bg-secondary border border-accent-border/30 rounded hover:bg-accent/15 hover:text-accent transition-colors"
            title="Scroll to bottom"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>
    </div>
  );
});

export default MessageList;
// <END Tharyn | ZedUI ViewTab
