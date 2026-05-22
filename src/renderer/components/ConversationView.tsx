/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Main conversation view container
    Why: Lazy-load and display session conversations in View tab
    Expected: Shows conversation when session selected, loading/empty states handled
    2026-01-02
    What: Step 6 - Search with Filter/Navigate mode
    Why: Enable searching within conversation messages
    Expected: Search input with filter (hide non-matches) or navigate (highlight and jump) modes
*/
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSessionStore } from '../stores/session-store';
import { MessageSquare, Loader2, AlertCircle, Search, Filter, Navigation, ChevronUp, ChevronDown, X } from 'lucide-react';
import MessageList from './MessageList';
import type { SessionDetails, SessionMessage } from '../types/session';

// Helper to extract text content from a message
function getMessageText(msg: SessionMessage): string {
  if (msg.type === 'summary') return msg.summary || '';
  const content = msg.message?.content;
  if (!content) return '';
  if (Array.isArray(content)) {
    return content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('\n');
  }
  return typeof content === 'string' ? content : '';
}

function ConversationView() {
  const { selectedSessionId, selectedSession, targetMessageIndex, clearTargetMessage } =
    useSessionStore();

  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'filter' | 'navigate'>('filter');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load session details when selection changes
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetails(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    window.electronAPI
      .getSessionDetails(selectedSessionId)
      .then((details) => {
        if (details) {
          setSessionDetails(details);
        } else {
          setError('Session not found');
        }
      })
      .catch((err) => {
        console.error('Failed to load session:', err);
        setError('Failed to load conversation');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedSessionId]);

  // Clear target message after scrolling
  const handleTargetReached = useCallback(() => {
    if (targetMessageIndex !== null) {
      // Small delay to allow scroll to settle
      setTimeout(() => {
        clearTargetMessage();
      }, 100);
    }
  }, [targetMessageIndex, clearTargetMessage]);

  // Clear search when session changes
  useEffect(() => {
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, [selectedSessionId]);

  // Keyboard shortcut: Ctrl+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // Compute matching message indices
  const matchingIndices = useMemo(() => {
    if (!searchQuery.trim() || !sessionDetails?.messages) return [];
    const query = searchQuery.toLowerCase();
    const indices: number[] = [];
    sessionDetails.messages.forEach((msg, idx) => {
      if (msg.type === 'user' || msg.type === 'assistant') {
        const text = getMessageText(msg).toLowerCase();
        if (text.includes(query)) {
          indices.push(idx);
        }
      }
    });
    return indices;
  }, [searchQuery, sessionDetails?.messages]);

  // Reset match index when matches change
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [matchingIndices.length]);

  // Navigate to prev/next match
  const goToPrevMatch = useCallback(() => {
    if (matchingIndices.length === 0) return;
    setCurrentMatchIndex((prev) =>
      prev > 0 ? prev - 1 : matchingIndices.length - 1
    );
  }, [matchingIndices.length]);

  const goToNextMatch = useCallback(() => {
    if (matchingIndices.length === 0) return;
    setCurrentMatchIndex((prev) =>
      prev < matchingIndices.length - 1 ? prev + 1 : 0
    );
  }, [matchingIndices.length]);

  // Current target for navigate mode
  const navigateTargetIndex = searchMode === 'navigate' && matchingIndices.length > 0
    ? matchingIndices[currentMatchIndex]
    : null;

  // Empty state - no session selected
  if (!selectedSessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <MessageSquare size={48} className="mb-4 opacity-50" />
        <h2 className="text-lg font-semibold mb-2">No Session Selected</h2>
        <p className="text-sm">Select a session from the Browse tab to view the conversation</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <Loader2 size={32} className="mb-4 animate-spin text-accent" />
        <p className="text-sm">Loading conversation...</p>
        {selectedSession && (
          <p className="text-xs mt-2 opacity-70">
            {selectedSession.messageCount} messages
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertCircle size={48} className="mb-4 opacity-70" />
        <h2 className="text-lg font-semibold mb-2">Error</h2>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // No messages
  if (!sessionDetails || sessionDetails.messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <MessageSquare size={48} className="mb-4 opacity-50" />
        <h2 className="text-lg font-semibold mb-2">Empty Conversation</h2>
        <p className="text-sm">This session has no messages</p>
      </div>
    );
  }

  // Conversation loaded
  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary/50 gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <MessageSquare size={16} className="text-accent" />
          <span className="text-sm font-medium text-text-primary truncate max-w-[200px]">
            {sessionDetails.projectDisplay}
          </span>
        </div>

        {/* Search controls */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages... (Ctrl+F)"
              className="w-full pl-7 pr-8 py-1 text-sm bg-bg-primary border border-border rounded focus:border-accent focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mode toggle */}
          <button
            onClick={() => setSearchMode(searchMode === 'filter' ? 'navigate' : 'filter')}
            className={`p-1.5 rounded border transition-colors ${
              searchMode === 'filter'
                ? 'bg-accent/15 border-accent/30 text-accent'
                : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
            }`}
            title={searchMode === 'filter' ? 'Filter mode (hiding non-matches)' : 'Navigate mode (jump to matches)'}
          >
            {searchMode === 'filter' ? <Filter size={14} /> : <Navigation size={14} />}
          </button>

          {/* Navigate mode controls */}
          {searchMode === 'navigate' && searchQuery && matchingIndices.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary whitespace-nowrap">
                {currentMatchIndex + 1}/{matchingIndices.length}
              </span>
              <button
                onClick={goToPrevMatch}
                className="p-1 rounded hover:bg-accent/15 text-text-secondary hover:text-accent"
                title="Previous match"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={goToNextMatch}
                className="p-1 rounded hover:bg-accent/15 text-text-secondary hover:text-accent"
                title="Next match"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}

          {/* Match count for filter mode */}
          {searchMode === 'filter' && searchQuery && (
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {matchingIndices.length} match{matchingIndices.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>

        <span className="text-xs text-text-secondary flex-shrink-0">
          {sessionDetails.messages.filter(m => m.type !== 'summary').length} messages
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        {/* START> Tharyn | CursorCLI
            2026-05-03
            What: Forward providerId from selectedSession so MessageBubble assistant label is correct
            Why: Without this, Codex/Cursor sessions showed 'Claude' header
            Expected: Cursor session bubbles say 'Cursor', Codex say 'Codex', Claude say 'Claude'
        */}
        <MessageList
          messages={sessionDetails.messages}
          targetIndex={navigateTargetIndex ?? targetMessageIndex}
          onTargetReached={handleTargetReached}
          searchQuery={searchMode === 'filter' ? searchQuery : undefined}
          highlightQuery={searchMode === 'navigate' ? searchQuery : undefined}
          providerId={selectedSession?.providerId}
        />
        {/* <END Tharyn | CursorCLI */}
      </div>
    </div>
  );
}

export default ConversationView;
// <END Tharyn | ZedUI ViewTab
