/**
 * MessageSearchResults.tsx - Display message search results with snippets
 *
 * START> 2025-12-02 | Sphere -> Tharyn | CC
 * Phase 3: Session Message Search
 * Full-text search across message content with clickable results
 * 2025-12-02 Initial implementation
 */

import React, { useCallback } from 'react';
import type { MessageSearchResult } from '../types/session';
import { useSessionStore } from '../stores/session-store';
import { MessageSquare, User, Bot, ExternalLink } from 'lucide-react';

interface MessageSearchResultsProps {
  results: MessageSearchResult[];
  isLoading: boolean;
  query: string;
  onSelectSession: (sessionId: string, messageIndex: number) => void;
}

function MessageSearchResults({
  results,
  isLoading,
  query,
  onSelectSession,
}: MessageSearchResultsProps) {
  const { selectSession } = useSessionStore();

  const handleClick = useCallback((result: MessageSearchResult) => {
    // Select the session and notify parent to switch to Edit tab
    selectSession(result.sessionId);
    onSelectSession(result.sessionId, result.messageIndex);
  }, [selectSession, onSelectSession]);

  // Highlight the matched text in snippet
  const highlightMatch = useCallback((snippet: string, matchStart: number, matchLength: number) => {
    if (matchStart < 0 || matchLength <= 0) {
      return <span>{snippet}</span>;
    }

    const before = snippet.slice(0, matchStart);
    const match = snippet.slice(matchStart, matchStart + matchLength);
    const after = snippet.slice(matchStart + matchLength);

    return (
      <>
        <span>{before}</span>
        <mark className="bg-accent/30 text-accent font-medium px-0.5 rounded">{match}</mark>
        <span>{after}</span>
      </>
    );
  }, []);

  // Format timestamp
  const formatTime = useCallback((timestamp?: Date) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-secondary">
        <div className="animate-spin mr-2">
          <MessageSquare size={20} />
        </div>
        <span>Searching messages...</span>
      </div>
    );
  }

  if (results.length === 0 && query.length >= 2) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
        <MessageSquare size={32} className="mb-2 opacity-50" />
        <p>No messages found matching "{query}"</p>
      </div>
    );
  }

  if (query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
        <MessageSquare size={32} className="mb-2 opacity-50" />
        <p>Enter at least 2 characters to search messages</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-text-secondary px-2 py-1">
        Found {results.length} message{results.length !== 1 ? 's' : ''} matching "{query}"
      </div>

      {results.map((result, index) => (
        <div
          key={`${result.sessionId}-${result.messageIndex}-${index}`}
          className="p-3 rounded-lg bg-bg-tertiary hover:bg-bg-secondary cursor-pointer transition-colors border border-transparent hover:border-accent/30"
          onClick={() => handleClick(result)}
        >
          {/* Header: Message type and project */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {result.messageType === 'user' ? (
                <User size={14} className="text-blue-400" />
              ) : (
                <Bot size={14} className="text-green-400" />
              )}
              <span className="text-xs text-text-secondary capitalize">
                {result.messageType}
              </span>
              <span className="text-xs text-text-secondary">
                &middot; {result.projectDisplay}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {result.timestamp && (
                <span className="text-xs text-text-secondary">
                  {formatTime(result.timestamp)}
                </span>
              )}
              <ExternalLink size={12} className="text-text-secondary opacity-50" />
            </div>
          </div>

          {/* Snippet with highlighted match */}
          <div className="text-sm text-text-primary leading-relaxed">
            {highlightMatch(result.snippet, result.matchStart, result.matchLength)}
          </div>

          {/* Session ID */}
          <div className="mt-2 text-xs text-text-secondary font-mono">
            {result.sessionId.slice(0, 8)}... &middot; Message #{result.messageIndex + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MessageSearchResults;
// <END | Sphere -> Tharyn | CC
