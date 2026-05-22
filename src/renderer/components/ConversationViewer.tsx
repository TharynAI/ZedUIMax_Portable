/**
 * ConversationViewer.tsx - Display full conversation history for a session
 *
 * START> 2025-12-02 | Sphere -> Tharyn | CC
 * Phase 2 implementation: Edit Tab - Conversation Viewer
 * Shows user/assistant messages with markdown rendering and code highlighting
 * 2025-12-02 Initial implementation
 * 2025-12-08 Added virtualization with react-window for performance
 */

import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { List, ListChildComponentProps } from 'react-window';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSessionStore } from '../stores/session-store';
import { useSettingsStore } from '../stores/settings-store';
import { Copy, Check, Download, User, Bot, ChevronDown, ChevronRight } from 'lucide-react';

interface Message {
  type: 'user' | 'assistant' | 'summary';
  uuid?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  summary?: string;
}

interface SessionDetails {
  sessionId: string;
  messages: Message[];
  autoSummary: string;
  projectDisplay: string;
  messageCount: number;
}

function ConversationViewer() {
  const { selectedSessionId } = useSessionStore();
  const { settings } = useSettingsStore();
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<InstanceType<typeof List>>(null);

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Fix: Container height measurement with zoom support
   * Uses ResizeObserver for accurate measurements and handles zoom changes
   * 2025-12-08 Fix for Edit tab not populating with zoom
   */
  // Track container size with ResizeObserver
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // clientHeight returns actual DOM height (not affected by CSS transforms)
        // This is what react-window needs for proper virtualization
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();

    // Use ResizeObserver for more accurate measurements when container size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [settings.zoomLevel]); // Re-run when zoom changes to remeasure
  // <END | Sphere -> Tharyn | CC

  // Load full session details when selection changes
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    window.electronAPI.getSessionDetails(selectedSessionId)
      .then((details) => {
        if (details) {
          setSessionDetails(details);
        } else {
          setError('Session not found');
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load session');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedSessionId]);

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Filter out empty messages from display
   * Messages with no text content were showing as blank bubbles
   * 2025-12-08 Initial fix
   */
  const conversationMessages = useMemo(() => {
    if (!sessionDetails) return [];
    return sessionDetails.messages.filter(
      (m) => (m.type === 'user' || m.type === 'assistant') && extractContent(m).trim() !== ''
    );
  }, [sessionDetails]);

  const toggleCollapse = useCallback((uuid: string) => {
    setCollapsedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
    // Reset list cache when collapse state changes
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, []);

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Fix: Reset List when zoom changes
   * Forces react-window to recalculate when zoom level changes
   * 2025-12-08 Fix for Edit tab not populating with zoom
   */
  // Reset list when zoom changes to force recalculation
  useEffect(() => {
    if (listRef.current && conversationMessages.length > 0) {
      listRef.current.resetAfterIndex(0);
    }
  }, [settings.zoomLevel, conversationMessages.length]);
  // <END | Sphere -> Tharyn | CC

  const handleExportMarkdown = useCallback(() => {
    if (!sessionDetails) return;

    const lines: string[] = [];
    lines.push(`# Session: ${sessionDetails.sessionId}`);
    lines.push(`**Project:** ${sessionDetails.projectDisplay}`);
    lines.push(`**Messages:** ${sessionDetails.messageCount}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of sessionDetails.messages) {
      if (msg.type === 'summary') continue;

      const content = extractContent(msg);
      const role = msg.type === 'user' ? '## User' : '## Assistant';
      lines.push(role);
      lines.push('');
      lines.push(content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${sessionDetails.sessionId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionDetails]);
  // <END | Sphere -> Tharyn | CC

  /* START> 2025-12-08 | Sphere -> Tharyn | CC
   * Estimate row heights based on content length
   * This provides approximate heights for virtualization
   * 2025-12-08 Initial implementation
   */
  const getItemSize = useCallback((index: number) => {
    const msg = conversationMessages[index];
    if (!msg) return 100;

    const content = extractContent(msg);
    const isCollapsed = collapsedMessages.has(msg.uuid || String(index));

    // If collapsed, show minimal height
    if (isCollapsed && content.length > 500) {
      return 150;
    }

    // Estimate height based on content length
    // ~80 chars per line, ~24px per line, plus padding
    const lines = Math.ceil(content.length / 80);
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    const baseHeight = 80; // Header + padding
    const textHeight = Math.min(lines * 24, 600); // Cap at 600px
    const codeHeight = codeBlocks * 100; // Extra height for code blocks

    return Math.max(baseHeight + textHeight + codeHeight, 100);
  }, [conversationMessages, collapsedMessages]);
  // <END | Sphere -> Tharyn | CC

  if (!selectedSessionId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <p>Select a session from the Browse tab to view its conversation</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <p>Loading conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  if (!sessionDetails) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {sessionDetails.autoSummary || 'Untitled Session'}
          </h2>
          <p className="text-sm text-text-secondary">
            {sessionDetails.projectDisplay} • {conversationMessages.length} messages
          </p>
        </div>
        <button
          onClick={handleExportMarkdown}
          className="btn btn-secondary flex items-center gap-2"
          title="Export to Markdown"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {/* START> 2025-12-08 | Sphere -> Tharyn | CC
       * Virtualized message list using react-window v2
       * Only renders visible messages for performance
       * 2025-12-08 Initial implementation
       * 2025-12-08 Fixed: Use height prop instead of defaultHeight for zoom compatibility
       */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {containerHeight > 0 && (
          <List
            height={containerHeight}
            width="100%"
            itemCount={conversationMessages.length}
            itemSize={getItemSize}
            overscanCount={2}
          >
            {(props) => (
              <VirtualizedMessageRow
                {...props}
                conversationMessages={conversationMessages}
                collapsedMessages={collapsedMessages}
                toggleCollapse={toggleCollapse}
              />
            )}
          </List>
        )}
      </div>
      {/* <END | Sphere -> Tharyn | CC */}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/* START> 2025-12-08 | Sphere -> Tharyn | CC
 * Row component for react-window v2 virtualization
 * Receives rowIndex and custom rowProps
 * 2025-12-08 Initial implementation
 * 2025-12-08 Fixed: Match react-window's expected component signature
 */
interface VirtualizedRowProps {
  conversationMessages: Message[];
  collapsedMessages: Set<string>;
  toggleCollapse: (uuid: string) => void;
}

function VirtualizedMessageRow({ index: rowIndex, style, ...props }: ListChildComponentProps & VirtualizedRowProps) {
  const { conversationMessages, collapsedMessages, toggleCollapse } = props;
  const msg = conversationMessages[rowIndex];
  
  // Return empty div instead of null to satisfy react-window's type requirements
  if (!msg) {
    return <div style={style} />;
  }

  return (
    <div style={{ ...style, padding: '8px 16px' }}>
      <MessageBubble
        message={msg}
        isCollapsed={collapsedMessages.has(msg.uuid || String(rowIndex))}
        onToggleCollapse={() => toggleCollapse(msg.uuid || String(rowIndex))}
      />
    </div>
  );
}
// <END | Sphere -> Tharyn | CC

/* START> 2025-12-08 | Sphere -> Tharyn | CC
 * Memoized markdown components to prevent recreation on every render
 * Moving outside component prevents unnecessary ReactMarkdown re-parses
 * 2025-12-08 Initial implementation
 */
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    if (!inline && language) {
      return (
        <SyntaxHighlighter
          style={oneDark as any}
          language={language}
          PreTag="div"
          customStyle={{
            margin: '0.5rem 0',
            borderRadius: '2px',
            fontSize: '0.8rem',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }

    // Inline code or code without language
    if (!inline) {
      return (
        <SyntaxHighlighter
          style={oneDark as any}
          language="text"
          PreTag="div"
          customStyle={{
            margin: '0.5rem 0',
            borderRadius: '2px',
            fontSize: '0.8rem',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }

    return (
      <code
        className="bg-bg-secondary px-1 py-0.5 rounded-cyber text-sm font-mono border border-accent/20"
        {...props}
      >
        {children}
      </code>
    );
  },
};
// <END | Sphere -> Tharyn | CC

/* START> 2025-12-08 | Sphere -> Tharyn | CC
 * Memoized MessageBubble to prevent re-renders on zoom changes
 * ReactMarkdown and SyntaxHighlighter are expensive to re-render
 * 2025-12-08 Initial implementation
 */
const MessageBubble = memo(function MessageBubble({ message, isCollapsed, onToggleCollapse }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.type === 'user';
  const content = useMemo(() => extractContent(message), [message]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  // Determine if content is long enough to warrant collapsing
  const isLong = content.length > 500;
  const displayContent = isCollapsed && isLong ? content.slice(0, 300) + '...' : content;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-cyber flex items-center justify-center ${
          isUser ? 'bg-accent' : 'bg-bg-tertiary'
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-text-primary" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`flex-1 max-w-[85%] rounded-cyber p-4 ${
          isUser
            ? 'bg-accent/10 border border-accent/30 border-l-2 border-l-accent'
            : 'bg-bg-tertiary border border-border border-l-2 border-l-accent/50'
        }`}
      >
        {/* Header with copy button */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary font-medium">
            {isUser ? 'User' : 'Assistant'}
          </span>
          <div className="flex items-center gap-2">
            {isLong && (
              <button
                onClick={onToggleCollapse}
                className="p-1 hover:bg-bg-secondary rounded-cyber transition-colors"
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? (
                  <ChevronRight size={14} className="text-text-secondary" />
                ) : (
                  <ChevronDown size={14} className="text-text-secondary" />
                )}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-bg-secondary rounded-cyber transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} className="text-text-secondary" />
              )}
            </button>
          </div>
        </div>

        {/* Message body with markdown */}
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown components={markdownComponents}>
            {displayContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});
// <END | Sphere -> Tharyn | CC

/**
 * Extract text content from message, handling both string and array formats
 */
function extractContent(message: Message): string {
  if (!message.message) return '';

  const content = message.message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

export default ConversationViewer;
// <END | Sphere -> Tharyn | CC
