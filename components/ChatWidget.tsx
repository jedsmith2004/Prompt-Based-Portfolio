'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimationManager } from '../lib/animations';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatWidgetProps {
  onActivate: () => void;
  isActive: boolean;
}

export default function ChatWidget({ onActivate, isActive }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setIsStreaming(true);
    onActivate();

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.text }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '',
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);

      if (reader) {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  setMessages(prev => prev.map(msg => 
                    msg.id === aiMessage.id 
                      ? { ...msg, text: msg.text + data.content }
                      : msg
                  ));
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!isActive && messages.length === 0 ? (
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="What projects have you built?"
            className="w-full px-6 py-4 text-lg bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      ) : (
        <div className="bg-black/40 backdrop-blur-md border border-white/20 rounded-3xl p-6 max-h-96 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-64">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl ${
                      message.isUser
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-white/10 text-white rounded-bl-md border border-white/20'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.text}</p>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/10 p-3 rounded-2xl rounded-bl-md border border-white/20">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask another question..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 rounded-xl transition-all duration-200 disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}