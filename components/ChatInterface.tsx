import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => scrollToBottom(), [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  return (
    <div className="flex h-full flex-col premium-surface-strong rounded-none lg:rounded-l-[1.5rem] overflow-hidden">
      <div className="panel-divider border-b p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl cta-secondary flex items-center justify-center text-[var(--color-primary)]">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Design Assistant</h3>
            <p className="flex items-center gap-2 text-xs text-[var(--color-text)]/75">
              <span className={`h-2 w-2 rounded-full ${isLoading ? 'bg-[var(--color-accent)] animate-pulse' : 'bg-emerald-500'}`} />
              {isLoading ? 'Generating suggestions...' : 'Ready to help'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="premium-surface rounded-3xl p-6 text-center text-[var(--color-text)]/80 mt-4">
            <Sparkles size={28} className="mx-auto mb-3 text-[var(--color-accent)]" />
            <p className="font-semibold text-[var(--color-ink)]">Request prompt refinements or styling directions</p>
            <p className="text-sm mt-2">Ask for layout changes, materials, staging choices, or cleanup guidance.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'model' && (
                <div className="h-9 w-9 rounded-xl cta-secondary flex items-center justify-center text-[var(--color-primary)] shrink-0">
                  <Bot size={16} />
                </div>
              )}
              <div
                className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'cta-primary text-white rounded-br-sm'
                    : 'subtle-card text-[var(--color-ink)] rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
              {msg.role === 'user' && (
                <div className="h-9 w-9 rounded-xl bg-[var(--color-ink)] text-white flex items-center justify-center shrink-0">
                  <User size={15} />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && messages.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl cta-secondary flex items-center justify-center text-[var(--color-primary)] shrink-0">
              <Bot size={16} />
            </div>
            <div className="subtle-card rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]/45 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]/45 animate-bounce [animation-delay:0.2s]" />
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]/45 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="panel-divider border-t p-4">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Describe the change you want..."
              className="w-full rounded-full border border-[var(--color-border)] bg-white/90 py-3 pl-4 pr-12 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text)]/55"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full cta-primary flex items-center justify-center disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
