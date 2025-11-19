import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { Message } from '../hooks/useChat';
import '../assets/styles/ChatMessage.css';  // 这里引入CSS文件

interface Props {
  message: Message;
  userAvatar: string;
}

const ChatMessage: React.FC<Props> = ({ message, userAvatar }) => {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const avatar = isUser ? userAvatar : '🤖';

  const isLoading = message.content === '__loading__' && message.role === 'assistant';

  return (
    <div className={`message-container ${isUser ? 'user-message-container' : 'bot-message-container'}`}>
      <div className={`avatar ${isUser ? 'user-avatar' : 'bot-avatar'}`}>
        {avatar}
      </div>
      <div className={`message ${isUser ? 'user-message' : 'bot-message'} ${isError ? 'error-message' : ''}`}>
        {isLoading ? (
          <span className="loading-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
