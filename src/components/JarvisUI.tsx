import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Shield, Cpu, Activity, Zap, History, Search, ExternalLink, Trash2, Monitor, MonitorOff, Eye } from 'lucide-react';
import Markdown from 'react-markdown';
import { useJarvis } from '../hooks/useJarvis';
import { cn } from '../lib/utils';

export const JarvisUI: React.FC = () => {
  const { 
    isConnected, 
    isListening, 
    isProcessing, 
    isSharingScreen,
    isFacebookConnected,
    screenStream,
    aiResponse, 
    userTranscript, 
    history, 
    groundingMetadata, 
    error, 
    connect, 
    disconnect, 
    loadHistory,
    startScreenShare,
    stopScreenShare,
    checkFacebookStatus
  } = useJarvis();
  const [showHistory, setShowHistory] = React.useState(false);
  const [showVisualFeed, setShowVisualFeed] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkFacebookStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkFacebookStatus]);

  const connectFacebook = async () => {
    try {
      const res = await window.fetch("/api/auth/facebook/url");
      const { url } = await res.json();
      window.open(url, 'facebook_oauth', 'width=600,height=700');
    } catch (err) {
      console.error("Failed to get Facebook auth URL:", err);
    }
  };

  React.useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  const clearHistory = async () => {
    await window.fetch("/api/history", { method: "DELETE" });
    loadHistory();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-cyan-400 font-mono overflow-hidden flex flex-row p-4 relative">
      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed left-0 top-0 bottom-0 w-80 bg-black/90 border-r border-cyan-500/30 z-50 p-6 flex flex-col gap-6 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                <History size={16} />
                Archive
              </h2>
              <button onClick={clearHistory} className="text-red-500/60 hover:text-red-500 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {history.length === 0 ? (
                <div className="text-[10px] opacity-40 uppercase text-center mt-20">No data stored</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="p-3 border border-cyan-500/10 rounded bg-cyan-500/5 space-y-2">
                    <div className="flex justify-between text-[8px] uppercase opacity-40">
                      <span>{item.role}</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[10px] line-clamp-3 text-cyan-100/80">{item.content}</p>
                  </div>
                ))
              )}
            </div>
            
            <button 
              onClick={() => setShowHistory(false)}
              className="mt-auto py-2 border border-cyan-500/30 text-[10px] uppercase tracking-widest hover:bg-cyan-500 hover:text-black transition-all"
            >
              Close Archive
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Feed Preview */}
      <AnimatePresence>
        {showVisualFeed && isSharingScreen && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0, x: 20, y: 20 }}
            animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, x: 20, y: 20 }}
            className="fixed right-8 bottom-32 w-80 aspect-video bg-black border border-cyan-500/30 rounded-lg overflow-hidden z-40 shadow-[0_0_30px_rgba(34,211,238,0.2)]"
          >
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded border border-cyan-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[8px] uppercase tracking-widest text-cyan-400">Live Visual Feed</span>
            </div>
            <button 
              onClick={() => setShowVisualFeed(false)}
              className="absolute top-2 right-2 text-cyan-500/60 hover:text-cyan-400 transition-colors"
            >
              <Trash2 size={12} className="rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* User Transcript Overlay */}
        <AnimatePresence>
          {userTranscript && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-24 left-1/2 -translate-x-1/2 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-full backdrop-blur-md z-20"
            >
              <p className="text-[10px] text-cyan-300 uppercase tracking-widest italic">"{userTranscript}"</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Background Grid */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #22d3ee 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        
        {/* HUD Elements */}
        <div className="absolute top-4 left-4 flex flex-col gap-4 opacity-60">
          <button 
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            <History size={16} />
            <span className="text-[10px] tracking-widest uppercase">Access Archives</span>
          </button>
          <div className="flex items-center gap-2">
            <Shield size={16} />
            <span className="text-[10px] tracking-widest uppercase">System Status: {isConnected ? 'Online' : 'Standby'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Monitor size={16} className={isSharingScreen ? "text-cyan-400" : "opacity-40"} />
            <span className="text-[10px] tracking-widest uppercase">Visual Feed: {isSharingScreen ? 'Active' : 'Inactive'}</span>
          </div>
          <button 
            onClick={connectFacebook}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded border transition-colors text-[10px] tracking-widest uppercase w-fit",
              isFacebookConnected 
                ? "border-blue-500/50 text-blue-400 bg-blue-500/10" 
                : "border-gray-500/30 text-gray-500 hover:border-blue-500/50 hover:text-blue-400"
            )}
          >
            <ExternalLink size={12} />
            {isFacebookConnected ? 'Connected' : 'Connect Facebook'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Cpu size={16} />
          <span className="text-[10px] tracking-widest uppercase">Core Engine: Gemini 2.5 Flash</span>
        </div>
      </div>

      <div className="absolute top-8 right-8 flex flex-col gap-4 opacity-60 items-end">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest uppercase">Network: Secure</span>
          <Activity size={16} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest uppercase">Power Level: 100%</span>
          <Zap size={16} />
        </div>
      </div>

      {/* Main Interface */}
      <div className="relative z-10 flex flex-col items-center gap-12 max-w-2xl w-full">
        
        {/* The Arc Reactor / Visualizer */}
        <div className="relative w-64 h-64 flex items-center justify-center">
          {/* Outer Ring */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-2 border-dashed border-cyan-500/30 rounded-full"
          />
          
          {/* Middle Ring */}
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-4 border border-cyan-400/20 rounded-full"
          />

          {/* Core Visualizer */}
          <div className="relative w-40 h-40 rounded-full bg-cyan-950/20 border border-cyan-500/50 flex items-center justify-center overflow-hidden shadow-[0_0_50px_rgba(34,211,238,0.2)]">
            <AnimatePresence mode="wait">
              {isConnected ? (
                <motion.div
                  key="active"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="flex items-center justify-center"
                >
                  {/* Pulsing Core */}
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5],
                      boxShadow: [
                        "0 0 20px rgba(34,211,238,0.3)",
                        "0 0 40px rgba(34,211,238,0.6)",
                        "0 0 20px rgba(34,211,238,0.3)"
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-full bg-cyan-400"
                  />
                  
                  {/* Waveform Visualization (Simulated) */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1">
                    {[...Array(8)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: isListening ? [10, 40, 10] : [5, 15, 5] }}
                        transition={{ duration: 0.5 + i * 0.1, repeat: Infinity }}
                        className="w-1 bg-cyan-400/40 rounded-full"
                      />
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="inactive"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-cyan-900"
                >
                  <Power size={48} className="opacity-20" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase text-white">
            {isConnected ? 'J.A.R.V.I.S.' : 'System Offline'}
          </h1>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-cyan-500/60 uppercase tracking-widest">
              {error ? error : isConnected ? (isProcessing ? 'Processing command...' : isListening ? 'Listening for commands...' : 'Awaiting input...') : 'Initiate system startup'}
            </p>
            {isProcessing && (
              <motion.div 
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1"
              >
                <Search size={10} className="text-cyan-400" />
                <span className="text-[8px] uppercase tracking-widest text-cyan-400">Accessing intelligence network...</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Response Area */}
        <AnimatePresence>
          {(aiResponse || groundingMetadata.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl space-y-4"
            >
              {/* AI Text Response */}
              {aiResponse && (
                <div className="bg-cyan-950/20 border border-cyan-500/30 p-6 rounded-lg backdrop-blur-sm max-h-48 overflow-y-auto custom-scrollbar">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-500/40 mb-2">Response Output</div>
                  <div className="text-sm leading-relaxed text-cyan-100 markdown-body">
                    <Markdown>{aiResponse}</Markdown>
                  </div>
                </div>
              )}

              {/* Search Grounding Results */}
              {groundingMetadata.length > 0 && (
                <div className="bg-cyan-950/10 border border-cyan-500/20 p-4 rounded-lg backdrop-blur-sm space-y-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-500/40">
                    <Search size={12} />
                    Intelligence Sources
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groundingMetadata.map((chunk, idx) => (
                      chunk.web && (
                        <a 
                          key={idx}
                          href={chunk.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2 border border-cyan-500/10 rounded bg-cyan-500/5 hover:bg-cyan-500/20 transition-all group"
                        >
                          <span className="text-[10px] truncate pr-2">{chunk.web.title || chunk.web.uri}</span>
                          <ExternalLink size={10} className="opacity-40 group-hover:opacity-100" />
                        </a>
                      )
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center gap-6">
          {!isConnected ? (
            <button
              onClick={connect}
              className="group relative flex items-center justify-center w-20 h-20 rounded-full border border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-400 hover:text-black transition-all duration-500 shadow-[0_0_20px_rgba(34,211,238,0.1)] hover:shadow-[0_0_40px_rgba(34,211,238,0.4)]"
            >
              <Power size={32} className="group-hover:scale-110 transition-transform" />
              <div className="absolute -bottom-8 text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Initialize</div>
            </button>
          ) : (
            <>
              <button
                onClick={isSharingScreen ? stopScreenShare : startScreenShare}
                className={cn(
                  "group relative flex items-center justify-center w-16 h-16 rounded-full border transition-all duration-500",
                  isSharingScreen 
                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]" 
                    : "border-cyan-500/30 bg-cyan-950/10 text-cyan-500/60 hover:border-cyan-400 hover:text-cyan-400"
                )}
              >
                {isSharingScreen ? <MonitorOff size={24} /> : <Monitor size={24} />}
                <div className="absolute -bottom-8 text-[8px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
                </div>
              </button>

              <button
                onClick={disconnect}
                className="group relative flex items-center justify-center w-20 h-20 rounded-full border border-red-500/50 bg-red-950/20 hover:bg-red-500 hover:text-white transition-all duration-500 shadow-[0_0_20px_rgba(239,68,68,0.1)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
              >
                <MicOff size={32} />
                <div className="absolute -bottom-8 text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Shutdown</div>
              </button>

              <button
                onClick={() => setShowVisualFeed(!showVisualFeed)}
                className={cn(
                  "group relative flex items-center justify-center w-16 h-16 rounded-full border transition-all duration-500",
                  showVisualFeed 
                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]" 
                    : "border-cyan-500/30 bg-cyan-950/10 text-cyan-500/60 hover:border-cyan-400 hover:text-cyan-400"
                )}
              >
                <Eye size={24} />
                <div className="absolute -bottom-8 text-[8px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {showVisualFeed ? 'Hide Feed' : 'Show Feed'}
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer Micro-details */}
      <div className="absolute bottom-8 w-full px-12 flex justify-between items-end opacity-40">
        <div className="text-[8px] uppercase tracking-[0.3em]">
          Stark Industries // Protocol 11
        </div>
        <div className="flex gap-4">
          <div className="w-12 h-[1px] bg-cyan-500/50" />
          <div className="w-4 h-[1px] bg-cyan-500/50" />
        </div>
      </div>
    </div>
  );
};
