import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Database, Search, ChevronDown, ChevronUp, Sparkles, RotateCcw, MessageSquareText, Brain, X } from 'lucide-react';
import { ChatMessage } from '../types';
import snowflakeBug from '../assets/bug-sno-R-blue.png';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onClearHistory?: () => void;
  onCollapse?: () => void;
  selectedWellName?: string;
  suggestedQuestions?: string[];
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showSql, setShowSql] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-mid-blue text-white'
            : 'bg-white border border-gray-200 text-midnight shadow-sm'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-xs text-medium-gray">
            <Sparkles className="w-3 h-3" />
            <span>Well Assistant</span>
          </div>
        )}
        
        {!isUser && message.statusMessage && (
          <div className="flex items-center gap-2 mb-2 text-xs text-mid-blue animate-pulse">
            <img src={snowflakeBug} alt="" className="w-3 h-3 animate-spin" />
            <span>{message.statusMessage}</span>
          </div>
        )}

        {!isUser && message.thinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
            >
              <Brain className="w-3 h-3" />
              {showThinking ? 'Hide Thinking' : 'Show Thinking'}
              {showThinking ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showThinking && (
              <div className="mt-1 p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {isUser ? (
          <div className="text-sm leading-relaxed text-white font-bold">
            {message.content}
          </div>
        ) : (
          <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-headings:text-midnight prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-strong:text-[#29B5E8]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}

        {message.sql && (
          <div className="mt-3">
            <button
              onClick={() => setShowSql(!showSql)}
              className="flex items-center gap-1 text-xs text-mid-blue hover:text-opacity-80"
            >
              <Database className="w-3 h-3" />
              {showSql ? 'Hide SQL' : 'Show SQL'}
              {showSql ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showSql && (
              <pre className="mt-2 p-2 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto">
                {message.sql}
              </pre>
            )}
          </div>
        )}

        {message.data && message.data.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowData(!showData)}
              className="flex items-center gap-1 text-xs text-mid-blue hover:text-opacity-80"
            >
              <Search className="w-3 h-3" />
              {showData ? 'Hide Data' : `Show Data (${message.data.length} rows)`}
              {showData ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showData && (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(message.data[0]).map(key => (
                        <th key={key} className="px-2 py-1 text-left font-medium text-medium-gray border-b">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {message.data.slice(0, 10).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-2 py-1 border-b border-gray-100">
                            {typeof val === 'number' ? val.toLocaleString() : String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {message.data.length > 10 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Showing 10 of {message.data.length} rows
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {message.wellsMentioned && message.wellsMentioned.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.wellsMentioned.map(wellId => (
              <span
                key={wellId}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800"
              >
                {wellId}
              </span>
            ))}
          </div>
        )}

        <div className={`text-xs mt-2 ${isUser ? 'text-blue-200' : 'text-medium-gray'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface({
  messages,
  isLoading,
  onSendMessage,
  onClearHistory,
  onCollapse,
  selectedWellName,
  suggestedQuestions = [
    "What's the decline rate for Moore 12H?",
    'What is the total oil production for the Pecos Valley field?',
    'Which well reported the latest ESP failure?',
    'Which wells in Reeves County have the highest water cut?'
  ],
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleSuggestionClick = (question: string) => {
    if (!isLoading) {
      onSendMessage(question);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-mid-blue flex items-center justify-center">
              <MessageSquareText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-midnight">Well Assistant</h2>
              <p className="text-xs text-medium-gray">
                {selectedWellName ? `Viewing ${selectedWellName}` : 'Ask about your wells'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && onClearHistory && (
              <button
                onClick={onClearHistory}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-mid-blue hover:bg-blue-50 rounded-lg transition-colors"
                title="Clear chat history"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Chat</span>
              </button>
            )}
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-medium-gray hover:text-midnight transition-colors"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
              <img src={snowflakeBug} alt="Snowflake" className="w-20 h-20" />
            </div>
            <h3 className="text-lg font-medium text-midnight mb-2">
              Welcome!
            </h3>
            <p className="text-sm text-medium-gray mb-6 max-w-sm mx-auto">
              Ask questions about your wells, production data, and operational events.
            </p>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Try asking</p>
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(q)}
                  className="block w-full text-left px-4 py-2 text-sm text-medium-gray bg-white rounded-lg border border-gray-200 hover:border-mid-blue hover:bg-blue-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {isLoading && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.thinking && (
              <div className="flex justify-start mb-4">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <img src={snowflakeBug} alt="Loading" className="w-5 h-5 animate-spin" />
                    <span className="text-sm text-medium-gray">
                      {messages[messages.length - 1]?.statusMessage || 'Thinking...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white border-t">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your wells..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:border-mid-blue focus:ring-2 focus:ring-blue-100 text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-full bg-mid-blue text-white hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
