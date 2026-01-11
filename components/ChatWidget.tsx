'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimationManager } from '../lib/animations';
import gsap from 'gsap';
import React from 'react';

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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rotatingExamples = useRef<string[]>([
    'What project are you most proud of?',
    'How does the offline AI app work?',
    'Explain your rasterizer pipeline',
    'What tech stack powers the language app?',
    'Can I see your CV?',
    'Describe your MNIST classifier approach',
    'What animations use GSAP?',
    'How do you structure large React apps?' 
  ]);
  const exampleIndex = useRef(0);
  const animationController = useRef<{ cancelled: boolean; isRunning: boolean; runId: number }>({ cancelled: false, isRunning: false, runId: 0 });
  const restartTimeoutRef = useRef<number | null>(null);

  const scrollToBottomOfChat = () => {
    // Scroll within the chat container, not the page
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Only scroll within chat when messages change
    scrollToBottomOfChat();
  }, [messages]);

  // Placeholder cycling animation (only before activation)
  useEffect(() => {
    if (isActive || messages.length > 0) return; // only on landing state

    const el = inputRef.current;
    if (!el) return;
    const inputElement = el as HTMLTextAreaElement;

    // Reset controller state entirely each mount of effect
    animationController.current.cancelled = false;
    animationController.current.isRunning = false;
    // Do NOT reset runId here; preserve monotonicity across re-renders
    const controller = animationController.current;

    // Config
    const DISPLAY_HOLD_MS = 5500;      // hold fully typed phrase
    const TYPE_INTERVAL_MS = 35;       // typing speed
    const UNTYPE_INTERVAL_MS = 22;     // backspace speed
    const BETWEEN_PHRASES_MS = 350;    // pause after clearing before next typing

    // Start with caret so user sees something instantly
    inputElement.setAttribute('placeholder', '|');

    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

    async function typePhrase(phrase: string, runId: number) {
      let current = '';
      for (let i = 0; i < phrase.length; i++) {
        if (controller.cancelled || runId !== controller.runId) return; // invalidated
        current += phrase[i];
        inputElement.setAttribute('placeholder', current + '|');
        await wait(TYPE_INTERVAL_MS);
        if (controller.cancelled || runId !== controller.runId) return; // re-check after wait
      }
      if (controller.cancelled || runId !== controller.runId) return;
      inputElement.setAttribute('placeholder', phrase); // remove caret at end
    }

    async function untypePhrase(phrase: string, runId: number) {
      for (let i = phrase.length; i >= 0; i--) {
        if (controller.cancelled || runId !== controller.runId) return;
        const sub = phrase.slice(0, i);
        inputElement.setAttribute('placeholder', sub + (i > 0 ? '|' : ''));
        await wait(UNTYPE_INTERVAL_MS);
        if (controller.cancelled || runId !== controller.runId) return;
      }
      if (controller.cancelled || runId !== controller.runId) return;
      inputElement.setAttribute('placeholder', '|'); // leave caret while waiting
    }

    async function runLoop(runId: number) {
      if (controller.isRunning) return; // Prevent multiple loops for same runId
      controller.isRunning = true;

      while (!controller.cancelled && runId === controller.runId) {
        // Double-check we're still in the right state before starting each phrase
        if (isActive || messages.length > 0 || inputElement.value.length > 0) {
          controller.cancelled = true;
          break;
        }

        // Pick a random phrase from the examples
        const randomIdx = Math.floor(Math.random() * rotatingExamples.current.length);
        const phrase = rotatingExamples.current[randomIdx];

        await typePhrase(phrase, runId);
        if (controller.cancelled || runId !== controller.runId) break;
        await wait(DISPLAY_HOLD_MS);
        if (controller.cancelled || runId !== controller.runId) break;
        await untypePhrase(phrase, runId);
        if (controller.cancelled || runId !== controller.runId) break;
        await wait(BETWEEN_PHRASES_MS);
      }

      if (runId === controller.runId) {
        controller.isRunning = false; // Only clear if still current run
      }
    }

    function startSuggestions() {
      if (controller.isRunning) return; // already running current run
      controller.cancelled = false;
      const newRunId = ++controller.runId; // invalidate any pending tasks
      controller.isRunning = false; // ensure runLoop can start
      runLoop(newRunId);
    }

    // Start initial suggestions
    startSuggestions();

    const clearRestartTimeout = () => {
      if (restartTimeoutRef.current !== null) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
    };

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value.length > 0) {
        // User is typing, stop suggestions immediately & invalidate run
        controller.cancelled = true;
        controller.runId++; // invalidate any pending waits/loops
        controller.isRunning = false; // allow future restart
        clearRestartTimeout();
        target.setAttribute('placeholder', 'Ask me anything...');
      } else {
        // Input cleared -> schedule restart with debounce
        if (!isActive && messages.length === 0) {
          clearRestartTimeout();
          restartTimeoutRef.current = window.setTimeout(() => {
            if (!controller.cancelled && inputElement.value.length > 0) return; // user started typing again
            if (isActive || messages.length > 0) return; // state changed
            // Only (re)start if not already running current run
            if (!controller.isRunning) {
              startSuggestions();
            }
          }, 220); // slightly longer debounce to ensure prior awaits resume & exit
        }
      }
    };

    inputElement.addEventListener('input', handleInput);

    return () => {
      controller.cancelled = true;
      controller.runId++; // invalidate
      controller.isRunning = false;
      clearRestartTimeout();
      inputElement.removeEventListener('input', handleInput);
    };
  }, [isActive, messages.length]);

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
    
    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
    
    setIsLoading(true);
    setIsStreaming(true);
    onActivate();

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage.text,
          history: messages.map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }))
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Response Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`API Error: ${response.status} - ${errorText}`);
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
                  // Scroll as content is being streamed
                  setTimeout(scrollToBottomOfChat, 10);
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

  // CV Download Card component
  const CVCard = ({ keyProp }: { keyProp: string }) => (
    <div key={keyProp} className="my-3 p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-white font-medium text-sm">Jack Smith - CV</p>
          <p className="text-gray-400 text-xs">PDF Document</p>
        </div>
        <a
          href="/CV Jack Smith.pdf"
          download="Jack Smith - CV.pdf"
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </a>
      </div>
    </div>
  );

  // Lightweight Markdown parser for limited formatting (bold, italics, inline/code blocks, links, lists)
  function renderFormattedMarkdown(text: string): React.ReactNode {
    // Check for CV card marker and split around it
    const cvParts = text.split(/\[CV_CARD\]/gi);
    if (cvParts.length > 1) {
      return (
        <>
          {cvParts.map((part, i) => (
            <React.Fragment key={`cv-part-${i}`}>
              {part && renderMarkdownContent(part)}
              {i < cvParts.length - 1 && <CVCard keyProp={`cv-card-${i}`} />}
            </React.Fragment>
          ))}
        </>
      );
    }
    return renderMarkdownContent(text);
  }

  function renderMarkdownContent(text: string): React.ReactNode {
    const lines = text.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let blockIndex = 0;

    const flushCodeBlock = () => {
      if (codeBuffer.length) {
        const codeContent = codeBuffer.join('\n');
        elements.push(
          <pre key={`code-${blockIndex++}`} className="mt-2 mb-3 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-xs"> 
            <code>{codeContent}</code>
          </pre>
        );
        codeBuffer = [];
      }
    };

    const formatInline = (segment: string, keyBase: string) => {
      let safe = segment.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      // Inline code
      safe = safe.replace(/`([^`]+)`/g, (_, c) => `<code data-inline>${c}</code>`);
      // Bold
      safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic (single *)
      safe = safe.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
      // Markdown links [text](url)
      safe = safe.replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');
      // Autolink bare URLs (avoid ones already inside href)
      safe = safe.replace(/(?<!href=")(https?:\/\/[^\s<]+)(?![^<]*?>)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');
      // Tokenize
      const tokens = safe.split(/(<code data-inline>[^<]+<\/code>|<strong>.*?<\/strong>|<em>.*?<\/em>|<a [^>]+>.*?<\/a>)/g).filter(Boolean);
      return tokens.map((tk, i) => {
        if (tk.startsWith('<code data-inline>')) {
          const content = tk.replace('<code data-inline>', '').replace('</code>', '');
          return <code key={`${keyBase}-ic-${i}`} className="px-1 py-0.5 rounded bg-black/40 border border-white/10 text-xs">{content}</code>;
        }
        if (tk.startsWith('<strong>')) {
          return <strong key={`${keyBase}-b-${i}`} className="font-semibold text-white">{tk.replace('<strong>', '').replace('</strong>', '')}</strong>;
        }
        if (tk.startsWith('<em>')) {
          return <em key={`${keyBase}-i-${i}`} className="italic text-gray-300">{tk.replace('<em>', '').replace('</em>', '')}</em>;
        }
        if (tk.startsWith('<a ')) {
          const inner = tk.replace(/<a [^>]+>/, '').replace('</a>', '');
          const hrefMatch = tk.match(/href="([^"]+)"/);
          const href = hrefMatch ? hrefMatch[1] : '#';
          return <a key={`${keyBase}-a-${i}`} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline decoration-blue-500/50 hover:decoration-blue-400 cursor-pointer break-words">{inner}</a>;
        }
        return <React.Fragment key={`${keyBase}-t-${i}`}>{tk}</React.Fragment>;
      });
    };

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trimEnd();
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
        } else {
          inCodeBlock = false;
          flushCodeBlock();
        }
        return;
      }
      if (inCodeBlock) {
        codeBuffer.push(rawLine); // preserve indentation inside code block
        return;
      }

      // Lists
      const listMatch = line.match(/^[-*+]\s+(.*)/);
      if (listMatch) {
        // Collect consecutive list items
        const items: string[] = [listMatch[1]];
        let j = idx + 1;
        while (j < lines.length) {
          const lm = lines[j].match(/^[-*+]\s+(.*)/);
          if (!lm) break;
          items.push(lm[1]);
          lines[j] = ''; // mark consumed
          j++;
        }
        elements.push(
          <ul key={`ul-${blockIndex++}`} className="list-disc list-inside space-y-1 mt-2 mb-3 text-gray-200 text-sm">
            {items.map((it, k) => <li key={k}>{formatInline(it, `li-${blockIndex}-${k}`)}</li>)}
          </ul>
        );
        return;
      }

      const numberedMatch = line.match(/^\d+\.\s+(.*)/);
      if (numberedMatch) {
        const items: string[] = [numberedMatch[1]];
        let j = idx + 1;
        while (j < lines.length) {
          const nm = lines[j].match(/^\d+\.\s+(.*)/);
          if (!nm) break;
          items.push(nm[1]);
          lines[j] = '';
          j++;
        }
        elements.push(
          <ol key={`ol-${blockIndex++}`} className="list-decimal list-inside space-y-1 mt-2 mb-3 text-gray-200 text-sm">
            {items.map((it, k) => <li key={k}>{formatInline(it, `oli-${blockIndex}-${k}`)}</li>)}
          </ol>
        );
        return;
      }

      if (line.trim().length === 0) {
        elements.push(<div key={`sp-${blockIndex++}`} className="h-2" />);
        return;
      }

      elements.push(
        <p key={`p-${blockIndex++}`} className="text-sm leading-relaxed text-gray-200 mt-2 first:mt-0">
          {formatInline(line, `p-${idx}`)}
        </p>
      );
    });

    // Flush any dangling code block (if unfinished while streaming)
    if (codeBuffer.length) {
      elements.push(
        <pre key={`code-${blockIndex++}`} className="mt-2 mb-3 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-xs"> 
          <code>{codeBuffer.join('\n')}</code>
        </pre>
      );
    }

    return <>{elements}</>; 
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!isActive && messages.length === 0 ? (
        <form onSubmit={handleSubmit} className="relative flex items-end">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Auto-resize textarea, show scrollbar only when at max
              const maxHeight = 120;
              e.target.style.height = 'auto';
              const newHeight = Math.min(e.target.scrollHeight, maxHeight);
              e.target.style.height = newHeight + 'px';
              e.target.style.overflowY = e.target.scrollHeight > maxHeight ? 'auto' : 'hidden';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask me anything..."
            rows={1}
            className="w-full px-6 pr-14 py-4 text-lg bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all duration-300 placeholder-opacity-transition resize-none overflow-hidden"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      ) : (
        <div className="bg-black/40 backdrop-blur-md border border-white/20 rounded-3xl p-6 max-h-96 overflow-hidden">
          <div className="flex flex-col h-full">
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-64 scroll-smooth custom-scrollbar"
              style={{ scrollBehavior: 'smooth' }}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl break-words overflow-hidden ${
                      message.isUser
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-white/10 text-white rounded-bl-md border border-white/20'
                    }`}
                  >
                    <div className="text-sm leading-relaxed break-words whitespace-pre-wrap overflow-wrap-anywhere">
                      {renderFormattedMarkdown(message.text)}
                    </div>
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

            <form onSubmit={handleSubmit} className="relative flex items-end">
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  // Auto-resize textarea, show scrollbar only when at max
                  const maxHeight = 80;
                  e.target.style.height = 'auto';
                  const newHeight = Math.min(e.target.scrollHeight, maxHeight);
                  e.target.style.height = newHeight + 'px';
                  e.target.style.overflowY = e.target.scrollHeight > maxHeight ? 'auto' : 'hidden';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask another question..."
                rows={1}
                className="w-full px-4 pr-12 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all duration-300 resize-none overflow-hidden"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 rounded-xl transition-all duration-200 disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            <p className="text-xs text-gray-500 text-center mt-2">
              AI responses may be innacurate
            </p>
            
          </div>
        </div>
      )}
    </div>
  );
}