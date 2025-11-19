import { Message } from '../hooks/useChat';

export const fetchFromOpenRouter = async (messages: Message[], modelName: string): Promise<string> => {
  const apiKey = ''; // 替换你的 Key
  const siteUrl = window.location.origin;
  const siteName = document.title || 'ChatBot';

  const formatted = messages.map(m => ({
    role: m.role === 'error' ? 'assistant' : m.role,
    content: m.content,
  }));
  console.log(`request model name: ${modelName}`);
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': siteUrl,
      'X-Title': siteName,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: formatted,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
};
