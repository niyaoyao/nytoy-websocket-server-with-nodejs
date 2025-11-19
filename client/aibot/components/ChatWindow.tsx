import React, { useEffect, useRef } from 'react';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import { useChat } from '../hooks/useChat';

const ChatWindow: React.FC = () => {
  const { sendMessage, userAvatar, messages } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sendMessage('', 'system');
  }, []);

  useEffect(() => {
    if (messages.length > 1) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <>
      <div id="chat-container">
        {messages.map((msg, idx) => (
          <ChatMessage key={idx} message={msg} userAvatar={userAvatar} />
        ))}
        <div ref={bottomRef} />
      </div>
      <ChatInput onSend={(txt) => sendMessage(txt, 'user')} />
    </>
  );
};

export default ChatWindow;
