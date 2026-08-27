import { useEffect, useState, useCallback, useRef } from 'react';
import { Well, ChatMessage } from './types';
import { fetchWells, fetchWellHealth, streamChatMessage, getCurrentUser, fetchInferenceStatus, resumeInferenceService } from './api/wells';
import WellClarificationModal from './components/WellClarificationModal';
import WellHealthModal from './components/WellHealthModal';
import WellPredictModal from './components/WellPredictModal';
import WellMap from './components/WellMap';
import ChatInterface from './components/ChatInterface';
import WorkflowAutomation from './components/WorkflowAutomation';
import Well360 from './components/Well360';
import { User, GripVertical, Settings, RefreshCw, Activity, TrendingDown } from 'lucide-react';
import snowflakeLogo from './assets/logo-sno-blue.png';
import snowflakeBug from './assets/bug-sno-R-blue.png';

export default function App() {
  const [wells, setWells] = useState<Well[]>([]);
  const [selectedWell, setSelectedWell] = useState<Well | null>(null);
  const [highlightedWells, setHighlightedWells] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<{ user: string; role: string } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatWidth, setChatWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [wellClarification, setWellClarification] = useState<{
    options: string[];
    originalQuery: string;
  } | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(1);
  const [lastHealthRefresh, setLastHealthRefresh] = useState<Date | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState<string>('UNKNOWN');
  const [inferencePolling, setInferencePolling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [healthModalWell, setHealthModalWell] = useState<Well | null>(null);
  const [predictModalWell, setPredictModalWell] = useState<Well | null>(null);
  const [areaSelectedWells, setAreaSelectedWells] = useState<Well[]>([]);
  const [currentPage, setCurrentPage] = useState<'production' | 'well360' | 'automation'>('well360');
  const [fabY, setFabY] = useState<number | null>(null);
  const [isDraggingFab, setIsDraggingFab] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const fabDragStartY = useRef(0);
  const fabStartTop = useRef(0);
  const fabDidDrag = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to Snowflake...');

  const minWidth = 320;
  const maxWidth = 700;

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingMessage('Fetching well metadata...');
        const [wellsData, userData] = await Promise.all([
          fetchWells(),
          getCurrentUser(),
        ]);
        setWells(wellsData);
        setUser(userData);

        setLoadingMessage('Loading well health scores...');
        const status = await fetchInferenceStatus();
        setInferenceStatus(status.status);
        if (status.status === 'READY') {
          const healthData = await fetchWellHealth();
          setWells(prev => prev.map(w => {
            const h = healthData.find(hd => hd.api_no === w.api_no);
            if (h) return { ...w, health_score: h.health_score, health_status: h.health_status };
            return w;
          }));
          setLastHealthRefresh(new Date());
        }
        setMapReady(true);
      } catch (err) {
        setError('Failed to load data. Make sure the backend is running.');
        console.error(err);
      }
    };
    loadData();
  }, []);

  const refreshHealth = useCallback(async () => {
    setIsHealthLoading(true);
    try {
      const status = await fetchInferenceStatus();
      setInferenceStatus(status.status);
      if (status.status !== 'READY') {
        return;
      }
      const healthData = await fetchWellHealth();
      setWells(prev => prev.map(w => {
        const h = healthData.find(hd => hd.api_no === w.api_no);
        if (h) return { ...w, health_score: h.health_score, health_status: h.health_status };
        return w;
      }));
      setLastHealthRefresh(new Date());
    } catch {
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  const handleResumeService = useCallback(async () => {
    try {
      setInferenceStatus('PENDING');
      await resumeInferenceService();
      setInferencePolling(true);
    } catch (e) {
      console.error('Failed to resume service:', e);
      setInferenceStatus('ERROR');
    }
  }, []);

  useEffect(() => {
    if (!inferencePolling) return;
    const interval = setInterval(async () => {
      try {
        const status = await fetchInferenceStatus();
        setInferenceStatus(status.status);
        if (status.status === 'READY') {
          setInferencePolling(false);
          refreshHealth();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [inferencePolling, refreshHealth]);

  useEffect(() => {
    const intervalMs = refreshInterval * 60 * 1000;
    const timer = setInterval(refreshHealth, intervalMs);
    return () => clearInterval(timer);
  }, [refreshInterval, refreshHealth]);

  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-settings-menu]')) setShowSettings(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSettings]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setChatWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleFabMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFab(true);
    fabDragStartY.current = e.clientY;
    fabDidDrag.current = false;
    const rect = fabRef.current?.getBoundingClientRect();
    fabStartTop.current = rect ? rect.top : 0;
  }, []);

  const handleFabMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingFab) return;
    const delta = e.clientY - fabDragStartY.current;
    if (Math.abs(delta) > 4) fabDidDrag.current = true;
    const newTop = fabStartTop.current + delta;
    const minTop = 80;
    const maxTop = window.innerHeight - 60;
    setFabY(Math.max(minTop, Math.min(maxTop, newTop)));
  }, [isDraggingFab]);

  const handleFabMouseUp = useCallback(() => {
    setIsDraggingFab(false);
  }, []);

  const handleFabClick = useCallback(() => {
    if (!fabDidDrag.current) {
      setIsChatOpen(true);
    }
  }, []);

  useEffect(() => {
    if (isDraggingFab) {
      document.addEventListener('mousemove', handleFabMouseMove);
      document.addEventListener('mouseup', handleFabMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleFabMouseMove);
      document.removeEventListener('mouseup', handleFabMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleFabMouseMove);
      document.removeEventListener('mouseup', handleFabMouseUp);
    };
  }, [isDraggingFab, handleFabMouseMove, handleFabMouseUp]);

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    let textSoFar = '';
    let thinkingSoFar = '';
    let sql: string | undefined;
    let data: Record<string, unknown>[] | undefined;
    let wellsMentioned: string[] | undefined;

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const selectedWellNames = areaSelectedWells.length > 0
        ? areaSelectedWells.map(w => w.well_name)
        : undefined;

      await streamChatMessage(
        content,
        (event) => {
          switch (event.type) {
            case 'text_delta':
              textSoFar += event.text || '';
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: textSoFar,
                };
                return updated;
              });
              break;

            case 'thinking_delta':
              thinkingSoFar += event.text || '';
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  thinking: thinkingSoFar,
                };
                return updated;
              });
              break;

            case 'status':
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  statusMessage: event.message || '',
                };
                return updated;
              });
              break;

            case 'tool_result':
              if (event.sql) sql = event.sql;
              if (event.data) data = event.data;
              if (event.wells_mentioned) wellsMentioned = event.wells_mentioned;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  sql,
                  data,
                  wellsMentioned,
                };
                return updated;
              });
              break;

            case 'clarification':
              if (event.well_options) {
                pendingQueryRef.current = content;
                setWellClarification({
                  options: event.well_options,
                  originalQuery: content,
                });
                setMessages(prev => prev.slice(0, -1));
              }
              break;

            case 'error':
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: event.message || 'An error occurred.',
                };
                return updated;
              });
              break;
          }
        },
        selectedWell?.well_name,
        conversationHistory,
        selectedWellNames
      );

      if (!textSoFar && !wellsMentioned) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: 'No response from agent.',
              statusMessage: undefined,
            };
          }
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            statusMessage: undefined,
          };
          return updated;
        });
      }

      if (wellsMentioned && wellsMentioned.length > 0) {
        setHighlightedWells(wellsMentioned);
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWellClarificationSelect = async (wellName: string) => {
    const originalQuery = pendingQueryRef.current;
    setWellClarification(null);
    pendingQueryRef.current = null;

    if (!originalQuery) return;

    const clarifiedQuery = `${originalQuery} [Filter to WELL_NAME = '${wellName}']`;
    await handleSendMessage(clarifiedQuery);
  };

  const handleWellClarificationCancel = () => {
    setWellClarification(null);
    pendingQueryRef.current = null;
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'No problem! Feel free to ask another question.',
        timestamp: new Date(),
      },
    ]);
  };

  const handleWellSelect = (well: Well | null) => {
    setSelectedWell(well);
    if (well) {
      setHighlightedWells([]);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setHighlightedWells([]);
  };

  if (!mapReady && !error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-[#29B5E8] rounded-full animate-spin" />
            <img
              src={snowflakeBug}
              alt=""
              className="absolute inset-0 m-auto w-8 h-8"
            />
          </div>
          <div className="text-center">
            <h2 className="text-white text-lg font-semibold mb-2">Preparing Well Map</h2>
            <p className="text-blue-200 text-sm animate-pulse">{loadingMessage}</p>
          </div>
          <div className="w-64 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#29B5E8] to-[#11567F] rounded-full animate-[loading_2s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-mid-blue text-white rounded hover:bg-opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <img src={snowflakeLogo} alt="Snowflake" className="h-8" />
          <div className="h-6 w-px bg-gray-300" />
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage('well360')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                currentPage === 'well360' ? 'bg-blue-50 text-mid-blue' : 'text-medium-gray hover:text-midnight hover:bg-gray-100'
              }`}
            >
              Well 360
            </button>
            <button
              onClick={() => setCurrentPage('production')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                currentPage === 'production' ? 'bg-blue-50 text-mid-blue' : 'text-medium-gray hover:text-midnight hover:bg-gray-100'
              }`}
            >
              Production Insights
            </button>
            <button
              onClick={() => setCurrentPage('automation')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                currentPage === 'automation' ? 'bg-blue-50 text-mid-blue' : 'text-medium-gray hover:text-midnight hover:bg-gray-100'
              }`}
            >
              Workflow Automation
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          {user && (
            <div className="relative" data-settings-menu>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-sm text-medium-gray hover:text-mid-blue transition-colors"
              >
                <User className="w-4 h-4" />
                <span>{user.user}</span>
                <Settings className="w-3.5 h-3.5" />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase">Health Refresh Interval</p>
                  </div>
                  {[1, 5, 60].map(min => (
                    <button
                      key={min}
                      onClick={() => { setRefreshInterval(min); setShowSettings(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                        refreshInterval === min ? 'text-mid-blue font-medium bg-blue-50' : 'text-gray-700'
                      }`}
                    >
                      {min === 1 ? '1 minute' : min === 5 ? '5 minutes' : '60 minutes'}
                      {refreshInterval === min && ' ✓'}
                    </button>
                  ))}
                  {lastHealthRefresh && (
                    <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
                      Last refresh: {lastHealthRefresh.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {currentPage === 'production' && (
      <div className="flex-1 flex overflow-hidden relative">
        {!isChatOpen && (
          <button
            ref={fabRef}
            onMouseDown={handleFabMouseDown}
            onClick={handleFabClick}
            className="absolute left-4 z-20 w-12 h-12 bg-white border-2 border-[#29B5E8] rounded-full shadow-lg flex items-center justify-center hover:bg-blue-50 transition-shadow cursor-grab active:cursor-grabbing"
            style={{ top: fabY !== null ? `${fabY}px` : '50%', transform: fabY === null ? 'translateY(-50%)' : undefined, position: 'fixed', left: '16px' }}
            title="Open AI Assistant (drag to reposition)"
          >
            <img src={snowflakeBug} alt="AI" className="w-7 h-7 pointer-events-none" />
          </button>
        )}

        <div
          className={`${
            isChatOpen ? 'flex' : 'hidden'
          } flex-shrink-0 bg-white`}
          style={{ width: isChatOpen ? `${chatWidth}px` : undefined }}
        >
          <div className="flex-1 w-full">
            <ChatInterface
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onClearHistory={handleClearHistory}
              onCollapse={() => setIsChatOpen(false)}
              selectedWellName={areaSelectedWells.length > 0 ? `${areaSelectedWells.length} wells selected` : selectedWell?.well_name}
              suggestedQuestions={areaSelectedWells.length > 0 ? [
                'Which of these wells has the highest water cut?',
                'What is the total oil production for these wells?',
                'Are any of these wells experiencing decline?',
                'Show me recent failures for these wells',
              ] : undefined}
            />
          </div>
        </div>

        <div
          onMouseDown={handleMouseDown}
          className={`${
            isChatOpen ? 'flex' : 'hidden'
          } w-2 bg-gray-200 hover:bg-[#29B5E8] cursor-col-resize items-center justify-center transition-colors group flex-shrink-0`}
        >
          <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-white" />
        </div>

        <div className="flex-1">
          <WellMap
            wells={wells}
            selectedWell={selectedWell}
            highlightedWells={highlightedWells}
            onWellSelect={handleWellSelect}
            onAskAboutWell={(wellName) => { if (!isChatOpen) setIsChatOpen(true); handleSendMessage(`Tell me the latest information about ${wellName}`); }}
            onHealthClick={(well) => setHealthModalWell(well)}
            onPredictClick={(well) => setPredictModalWell(well)}
            onAreaSelect={(selected) => {
              setAreaSelectedWells(selected);
              if (selected.length > 0 && !isChatOpen) setIsChatOpen(true);
            }}
          />
        </div>

        <div className="w-[280px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Unhealthy Wells</h3>
              <p className="text-xs text-gray-400">Ranked by risk (highest first)</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5" title={`Service: ${inferenceStatus}`}>
                <div className={`w-2 h-2 rounded-full ${
                  inferenceStatus === 'READY' ? 'bg-green-500' :
                  inferenceStatus === 'PENDING' || inferenceStatus === 'RUNNING' ? 'bg-amber-400 animate-pulse' :
                  'bg-red-400'
                }`} />
                <span className="text-[10px] text-gray-400 uppercase">{
                  inferenceStatus === 'READY' ? 'Online' :
                  inferenceStatus === 'PENDING' ? 'Starting' :
                  'Offline'
                }</span>
              </div>
              <button
                onClick={refreshHealth}
                disabled={isHealthLoading || inferenceStatus !== 'READY'}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30"
                title="Refresh health scores"
              >
                <RefreshCw className={`w-4 h-4 ${isHealthLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {inferenceStatus === 'SUSPENDED' || inferenceStatus === 'ERROR' || inferenceStatus === 'UNKNOWN' ? (
              <div className="px-4 py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">ML Service Offline</p>
                <p className="text-xs text-gray-400 mb-4">The inference service needs to be started to generate health scores.</p>
                <button
                  onClick={handleResumeService}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#29B5E8] rounded-lg hover:bg-[#1a9fd4] transition-colors"
                >
                  Start Service
                </button>
              </div>
            ) : inferenceStatus === 'PENDING' ? (
              <div className="px-4 py-12 text-center">
                <RefreshCw className="w-8 h-8 text-[#29B5E8] animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700 mb-1">Service Starting</p>
                <p className="text-xs text-gray-400">Health scores will appear once the service is ready...</p>
              </div>
            ) : (
            <>
            {wells
              .filter(w => w.health_score !== undefined && w.health_score < 85)
              .sort((a, b) => (a.health_score ?? 100) - (b.health_score ?? 100))
              .slice(0, 25)
              .map(well => (
                <button
                  key={well.api_no}
                  onClick={() => {
                    setSelectedWell(well);
                  }}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                    selectedWell?.api_no === well.api_no ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{well.well_name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <TrendingDown className="w-3.5 h-3.5" style={{
                        color: (well.health_score ?? 100) < 25 ? '#ef4444' : (well.health_score ?? 100) < 40 ? '#f97316' : (well.health_score ?? 100) < 55 ? '#f59e0b' : '#6b7280'
                      }} />
                      <span className="text-xs font-bold" style={{
                        color: (well.health_score ?? 100) < 25 ? '#ef4444' : (well.health_score ?? 100) < 40 ? '#f97316' : (well.health_score ?? 100) < 55 ? '#f59e0b' : '#6b7280'
                      }}>{well.health_score}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{well.field}</p>
                </button>
              ))}
            {wells.filter(w => w.health_score !== undefined && w.health_score < 85).length === 0 && inferenceStatus === 'READY' && (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                Loading health scores...
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </div>
      )}

      {currentPage === 'well360' && (
        <Well360 wells={wells} />
      )}

      {currentPage === 'automation' && (
        <WorkflowAutomation />
      )}

      {wellClarification && (
        <WellClarificationModal
          options={wellClarification.options}
          originalQuery={wellClarification.originalQuery}
          onSelect={handleWellClarificationSelect}
          onCancel={handleWellClarificationCancel}
        />
      )}

      {healthModalWell && (
        <WellHealthModal
          well={healthModalWell}
          onClose={() => setHealthModalWell(null)}
        />
      )}

      {predictModalWell && (
        <WellPredictModal
          well={predictModalWell}
          onClose={() => setPredictModalWell(null)}
        />
      )}
    </div>
  );
}
