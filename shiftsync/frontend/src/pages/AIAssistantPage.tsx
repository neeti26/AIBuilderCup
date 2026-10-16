import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquare, Send, Sparkles, User, Lightbulb, Cpu, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { aiApi } from '../services/api';
import { useShiftStore } from '../store/shiftStore';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChatMessage } from '../types';
import clsx from 'clsx';

const SUGGESTED_QUESTIONS = [
  { icon: AlertTriangle, text: 'What are the most critical issues from this shift?', category: 'critical' },
  { icon: Cpu, text: 'Which machines are at risk of failure?', category: 'machines' },
  { icon: TrendingUp, text: 'How is our production tracking vs target?', category: 'production' },
  { icon: Lightbulb, text: 'What should the next shift prioritize?', category: 'next' },
  { icon: Clock, text: 'Summarize unresolved maintenance items', category: 'maintenance' },
  { icon: Sparkles, text: 'What quality issues need follow-up?', category: 'quality' },
];

export default function AIAssistantPage() {
  const { activeShift } = useShiftStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I'm ShiftSync AI, powered by Gemini 2.5 Flash. I have full context of your current shift operations — machine statuses, operator logs, quality reports, and more. Ask me anything about your shift.",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: ({ message, history }: { message: string; history: ChatMessage[] }) =>
      aiApi.chat(
        message,
        activeShift?.id,
        history.slice(-6).map(m => ({ role: m.role, content: m.content }))
      ),
    onSuccess: (response) => {
      const data = response.data;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources,
        suggested_actions: data.suggested_actions,
      }]);
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    },
  });

  const handleSend = (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    chatMutation.mutate({
      message: text,
      history: messages,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" aria-hidden="true" />
            AI Operations Assistant
          </h1>
          <p className="text-slate-400 text-sm">
            Gemini 2.5 Flash · {activeShift ? `Context: ${activeShift.line} ${activeShift.shift_type} shift` : 'No active shift context'}
          </p>
        </div>
        {activeShift && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" aria-hidden="true" />
            <span className="text-green-400 text-xs">Live shift context loaded</span>
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            role="log"
            aria-label="AI conversation"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((msg, i) => (
              <div key={i} className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                {/* Avatar */}
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-gradient-to-br from-purple-600 to-blue-600'
                )} aria-hidden="true">
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Sparkles className="w-4 h-4 text-white" />
                  }
                </div>
                {/* Message bubble */}
                <div className={clsx('max-w-[75%] space-y-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <div className={clsx(
                    'rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-700 text-slate-200 rounded-tl-sm'
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {msg.sources.map((src, si) => (
                        <span key={si} className="text-xs bg-slate-700/50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-600/50">
                          📎 {src}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Suggested actions */}
                  {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">Suggested follow-ups:</p>
                      {msg.suggested_actions.map((action, ai) => (
                        <button
                          key={ai}
                          onClick={() => handleSend(action)}
                          className="block text-xs text-blue-400 hover:text-blue-300 text-left transition-colors focus:outline-none focus:underline"
                        >
                          → {action}
                        </button>
                      ))}
                    </div>
                  )}
                  <time className="text-xs text-slate-600" dateTime={msg.timestamp.toISOString()}>
                    {format(msg.timestamp, 'HH:mm')}
                  </time>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-3" aria-label="AI is thinking" role="status">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="bg-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-700 p-4">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your shift operations..."
                className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                aria-label="Message input"
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                loading={chatMutation.isPending}
                icon={<Send className="w-4 h-4" aria-hidden="true" />}
                size="md"
                className="self-end"
                aria-label="Send message"
              >
                Send
              </Button>
            </div>
            <p className="text-slate-600 text-xs mt-1.5">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* Suggested Questions Sidebar */}
        <div className="w-56 flex flex-col gap-3 flex-shrink-0">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Quick Questions</p>
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q.text)}
              className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-600/40 rounded-xl p-3 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 group"
            >
              <q.icon className="w-4 h-4 text-slate-500 group-hover:text-blue-400 mb-1.5 transition-colors" aria-hidden="true" />
              <p className="text-slate-300 text-xs leading-relaxed group-hover:text-slate-200 transition-colors">
                {q.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
