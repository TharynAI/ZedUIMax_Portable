/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Memoized markdown rendering component
    Why: Efficiently render markdown content with code block support
    Expected: Markdown renders correctly with syntax highlighting
*/
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface MarkdownContentProps {
  content: string;
}

// Custom components for ReactMarkdown
const markdownComponents = {
  // Code blocks with syntax highlighting
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');

    if (!inline && (match || code.includes('\n'))) {
      return <CodeBlock code={code} language={match?.[1]} />;
    }

    // Inline code
    return (
      <code
        className="px-1.5 py-0.5 bg-bg-tertiary border border-accent-border rounded text-sm font-mono text-accent"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Links
  a({ href, children, ...props }: any) {
    return (
      <a
        href={href}
        className="text-blue-400 hover:text-blue-300 underline"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },

  // Paragraphs
  p({ children, ...props }: any) {
    return (
      <p className="mb-2 last:mb-0" {...props}>
        {children}
      </p>
    );
  },

  // Lists
  ul({ children, ...props }: any) {
    return (
      <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
        {children}
      </ul>
    );
  },

  ol({ children, ...props }: any) {
    return (
      <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
        {children}
      </ol>
    );
  },

  // Headers
  h1({ children, ...props }: any) {
    return (
      <h1 className="text-xl font-bold mb-2 text-text-primary" {...props}>
        {children}
      </h1>
    );
  },

  h2({ children, ...props }: any) {
    return (
      <h2 className="text-lg font-bold mb-2 text-text-primary" {...props}>
        {children}
      </h2>
    );
  },

  h3({ children, ...props }: any) {
    return (
      <h3 className="text-base font-bold mb-2 text-text-primary" {...props}>
        {children}
      </h3>
    );
  },

  // Blockquotes
  blockquote({ children, ...props }: any) {
    return (
      <blockquote
        className="border-l-2 border-accent pl-4 my-2 text-text-secondary italic"
        {...props}
      >
        {children}
      </blockquote>
    );
  },

  // Strong/Bold
  strong({ children, ...props }: any) {
    return (
      <strong className="font-bold text-text-primary" {...props}>
        {children}
      </strong>
    );
  },

  // Emphasis/Italic
  em({ children, ...props }: any) {
    return (
      <em className="italic" {...props}>
        {children}
      </em>
    );
  },
};

const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  // Memoize the markdown rendering
  const renderedContent = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  ), [content]);

  return (
    <div className="prose prose-invert max-w-none text-text-primary leading-relaxed">
      {renderedContent}
    </div>
  );
});

export default MarkdownContent;
// <END Tharyn | ZedUI ViewTab
