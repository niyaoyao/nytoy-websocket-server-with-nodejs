import React from 'react';
import { marked } from 'marked';

export interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const html = marked.parse(content || '') as string;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

export default MarkdownRenderer;
