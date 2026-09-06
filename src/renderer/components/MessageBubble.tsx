/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Individual message bubble component
    Why: Display user/assistant messages with distinct styling
    Expected: User messages blue-bordered, assistant messages amber-bordered
    2026-01-01
    What: Phase 2 - Chat-style alignment with bubble styling
    Why: User requested texting-app style layout (user right, assistant left)
    Expected: User messages right-aligned with blue fill, assistant left-aligned with amber fill
    2026-01-01
    What: Phase 2 - Collapse/expand for long messages
    Why: Messages >10 lines should start collapsed with 5-line preview
    Expected: Long messages show preview with expand button, can toggle
    2026-01-02
    What: Reduce whitespace - tighter padding and line spacing
    Why: User requested more visually compact layout
    Expected: Less space between messages and tighter content-to-border padding
*/
import { memo, useState, useMemo, useCallback } from 'react';
import { User, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import { useMessageContextMenuStore } from '../stores/message-context-menu-store';
/* START> Tharyn | CursorCLI
    2026-05-03
    What: Use centralized provider display map for assistant label
    Why: Hardcoded 'Claude' label was incorrect for Codex/Cursor sessions
    Expected: Assistant header shows 'Claude'/'Codex'/'Cursor' based on providerId prop
*/
import { getProviderDisplay, type ProviderId } from '../providers/display';
// <END Tharyn | CursorCLI

interface MessageBubbleProps {
  type: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  highlightQuery?: string;  // Text to highlight in navigate mode
  /* START> Tharyn | CursorCLI
      2026-05-03
      What: Optional providerId so assistant header shows correct label
      Why: MessageBubble previously hardcoded 'Claude'; default keeps backwards compat
      Expected: Codex/Cursor sessions show 'Codex'/'Cursor'; missing prop falls back to 'Claude'
  */
  providerId?: ProviderId;
  // <END Tharyn | CursorCLI
}

const LINE_THRESHOLD = 10;  // Collapse if more than this many lines
const PREVIEW_LINES = 5;    // Show this many lines when collapsed

const MessageBubble = memo(function MessageBubble({ type, content, timestamp, highlightQuery, providerId = 'claude' }: MessageBubbleProps) {
  const isUser = type === 'user';
  const assistantLabel = getProviderDisplay(providerId).assistantName;
  const showContextMenu = useMessageContextMenuStore((s) => s.show);

  // Check if this message matches the highlight query
  const isHighlighted = useMemo(() => {
    if (!highlightQuery?.trim()) return false;
    return content.toLowerCase().includes(highlightQuery.toLowerCase());
  }, [content, highlightQuery]);

  // Count lines in content (rough estimate based on newlines)
  const lineCount = useMemo(() => {
    return content.split('\n').length;
  }, [content]);

  const shouldCollapse = lineCount > LINE_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(!shouldCollapse);

  // Get preview content (first N lines)
  const previewContent = useMemo(() => {
    if (!shouldCollapse || isExpanded) return content;
    const lines = content.split('\n');
    return lines.slice(0, PREVIEW_LINES).join('\n');
  }, [content, shouldCollapse, isExpanded]);

  const hiddenLineCount = lineCount - PREVIEW_LINES;

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, content, type);
  }, [content, type, showContextMenu]);

  return (
    <div
      className={`
        flex w-full py-1 px-2
        ${isUser ? 'justify-end' : 'justify-start'}
      `}
      onContextMenu={handleContextMenu}
    >
      {/* Message bubble - 75% width, aligned left or right */}
      <div
        className={`
          flex gap-2 p-2 rounded max-w-[75%]
          ${isUser
            ? 'bg-blue-500/10 border border-blue-500/30'
            : 'bg-amber-500/10 border border-amber-500/30'
          }
          ${isHighlighted ? 'ring-2 ring-green-500/50 bg-green-500/5' : ''}
          hover:bg-opacity-20 transition-colors
        `}
      >
        {/* Avatar - show on left for assistant, right for user */}
        {!isUser && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-accent/20 text-accent">
            <Bot size={14} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className={`flex items-center gap-2 mb-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className={`font-semibold text-sm ${isUser ? 'text-blue-400' : 'text-accent'}`}>
              {isUser ? 'You' : assistantLabel}
            </span>
            {timestamp && (
              <span className="text-xs text-text-secondary">
                {formatTimestamp(timestamp)}
              </span>
            )}
          </div>

          {/* Message content with collapse/expand */}
          <div className="text-text-primary relative">
            <div className={!isExpanded && shouldCollapse ? 'relative' : ''}>
              <MarkdownContent content={previewContent} />

              {/* Fade gradient when collapsed */}
              {!isExpanded && shouldCollapse && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bg-primary/80 to-transparent pointer-events-none" />
              )}
            </div>

            {/* Expand/Collapse button */}
            {shouldCollapse && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`
                  flex items-center gap-1 mt-2 text-xs
                  ${isUser ? 'text-blue-400 hover:text-blue-300' : 'text-accent hover:text-amber-400'}
                  transition-colors cursor-pointer
                `}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp size={14} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    Show more ({hiddenLineCount} more lines)
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Avatar - show on right for user */}
        {isUser && (
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-blue-500/20 text-blue-400">
            <User size={14} />
          </div>
        )}
      </div>
    </div>
  );
});

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default MessageBubble;
// <END Tharyn | ZedUI ViewTab
