/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Syntax-highlighted code block component
    Why: Display code with proper highlighting and copy functionality
    Expected: Code blocks render with syntax highlighting and copy button
*/
import { useState, memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock = memo(function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Detect language from common patterns if not specified
  const detectedLanguage = language || 'text';

  return (
    <div className="relative group my-2">
      {/* Language label and copy button */}
      <div className="flex items-center justify-between px-3 py-1 bg-bg-tertiary border border-accent-border border-b-0 rounded-t text-xs text-text-secondary">
        <span className="font-mono">{detectedLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 hover:bg-bg-primary rounded transition-colors opacity-0 group-hover:opacity-100"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={detectedLanguage}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0 0 2px 2px',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderTop: 'none',
          fontSize: '0.875rem',
        }}
        showLineNumbers={code.split('\n').length > 3}
        wrapLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});

export default CodeBlock;
// <END Tharyn | ZedUI ViewTab
