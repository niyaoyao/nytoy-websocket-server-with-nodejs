// useChat.ts
import { useState } from 'react';
import { fetchFromOpenRouter } from '../utils/openrouter';

export interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

const MODEL_LIST = [
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'deepseek/deepseek-r1-0528:free',
  'qwen/qwen3-coder:free',
  'qwen/qwen3-235b-a22b-2507:free',
  'moonshotai/kimi-k2:free',
  'moonshotai/kimi-dev-72b:free',
  'mistralai/mistral-nemo:free',
  'microsoft/mai-ds-r1:free',
  'google/gemma-3-27b-it:free',
  'google/gemini-2.0-flash-exp:free',
];

// ✅ 添加全局变量（模块级变量）
let currentModel = MODEL_LIST[0];

const getRandomEmoji = () => {
  const emojis = ['😎','👩‍💻','🧑‍🚀','🧙‍♂️','👨‍🎨','🦸‍♀️','🧞‍♂️'];
  return emojis[Math.floor(Math.random() * emojis.length)];
};

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [model, _setModel] = useState(MODEL_LIST[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [userAvatar] = useState(getRandomEmoji);

  // ✅ 包一层 setModel，确保同步更新全局变量
  const setModel = (newModel: string) => {
    currentModel = newModel; // 同步到全局
    _setModel(newModel);
  };

  const sendMessage = async (content: string, role: 'user' | 'system' = 'user') => {
    if (role === 'system') {
      setMessages([{ role: 'assistant', content: 'Hello! How can I help you today? 🤖' }]);
      return;
    }

    if (role === 'user') {
      const userMsg: Message = { role: 'user', content };
      const loadingMsg: Message = { role: 'assistant', content: '__loading__' };

      setMessages(prev => [...prev, userMsg, loadingMsg]);
      setIsLoading(true);

      try {
        // ✅ 这里使用 currentModel，始终是最新值
        const reply = await fetchFromOpenRouter([...messages, userMsg], currentModel);

        setMessages(prev => {
          const withoutLoading = prev.filter(msg => msg.content !== '__loading__');
          return [...withoutLoading, { role: 'assistant', content: reply }];
        });
      } catch {
        setMessages(prev => {
          const withoutLoading = prev.filter(msg => msg.content !== '__loading__');
          return [...withoutLoading, { role: 'error', content: '❌ Failed to get response.' }];
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return {
    messages,
    sendMessage,
    userAvatar,
    model,
    setModel, // ✅ 返回包装后的 setModel
    modelList: MODEL_LIST,
    isLoading,
  };
};
