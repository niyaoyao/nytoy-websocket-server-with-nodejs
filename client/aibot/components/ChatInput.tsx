import React, { useState } from 'react';
import ModelSelector from './ModelSelector';
import { useChat } from '../hooks/useChat';

interface Props {
  onSend: (content: string) => void;
}

const ChatInput: React.FC<Props> = ({ onSend }) => {
  const { model, setModel, modelList} = useChat();
  
  const [input, setInput] = useState('');

  const handleSend = () => {
    onSend(input.trim());
    setInput('');
  };

  return (
    <div id="input-container">
      <ModelSelector
        model={model}
        setModel={setModel}
        modelList={modelList}
      />

      <textarea
        id="user-input"
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type your message..."
      />
      <button id="send-button" onClick={handleSend} disabled={!input.trim()}>
        Send
      </button>
    </div>
  );
};

export default ChatInput;
