/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, User, Briefcase, GraduationCap, Languages, Github, Linkedin, Mail, Phone, Copy, Check, ExternalLink, Info, LogOut, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Live WebSocket Session Client Proxy for Iframe Context ---
class LiveSessionClient {
  private ws: WebSocket | null = null;
  
  constructor(
    callbacks: {
      onopen: () => void;
      onmessage: (message: any) => void;
      onclose: () => void;
      onerror: (err: any) => void;
    }
  ) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/api/live-ws`);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'open') {
          callbacks.onopen();
        } else if (data.type === 'message') {
          callbacks.onmessage(data.message);
        } else if (data.type === 'close') {
          callbacks.onclose();
        } else if (data.type === 'error') {
          callbacks.onerror(new Error(data.error));
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    this.ws.onclose = () => {
      callbacks.onclose();
    };

    this.ws.onerror = (err) => {
      callbacks.onerror(err);
    };
  }

  sendRealtimeInput(input: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'realtime_input', ...input }));
    }
  }

  sendClientContent(content: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'client_content', ...content }));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// --- Constants & Types ---
const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-09-2025";

const SYSTEM_INSTRUCTION = `You are Vanessa, the bilingual (English/French) AI assistant for Océanne Benin. 
You speak both languages fluently and naturally, especially French (your native language) and English. 
Your tone is professional yet trendy, warm, receptive and approachable, fitting for a young professional in Digital Marketing.

About Océanne Benin:
- She is finalizing her Master's in Digital Marketing & International Consumer Marketing and is actively searching for a permanent contract (CDI) in the digital marketing sector starting October 2026.
- Email: oceanne.benin971@gmail.com
- Phone: 06 50 19 22 19
- Location: Saint-Pathus (77178)
- Driving License: Permis B

- Education:
  - Master's in Digital Marketing & International Consumer Marketing, PGE at ESCE International Business School, Courbevoie (since Sept 2021).
  - University Exchange at FPT University in Hồ Chí Minh City, Vietnam (Jan 2025 - Apr 2025).
  - Baccalauréat général with honors (mention assez bien) at Lycée Jean Vilar, Meaux (Sept 2018 - Jul 2021), specializing in SES, English Literature & Culture, and math.

- Work Experience:
  - Chargée de Communication Digitale (1-year apprenticeship, since Sept 2025) at M.Charraire, Rungis:
    - Deploying digital communication strategies on social media, websites, and e-mailing campaigns.
    - Creating and managing engaging content (LinkedIn, Instagram, newsletters).
    - Monitoring and analyzing digital action performances (KPIs, reporting, recommendations).
    - Contributing to the launch and promotion of an ordering mobile/web application.
  - Assistant Community & Influence Manager (Jul 2023 - Dec 2023) at Green Family: Love & Green, Rueil-Malmaison:
    - Creating social media content (Instagram, TikTok, Facebook) such as posts, stories, and videos.
    - Participating in editorial strategy and digital trend monitoring.
    - Managing collaborations with nano and micro-influencers (prospecting, coordinating, and campaign tracking).
    - Analyzing performance of influencer campaigns (KPIs, reporting).
    - Contributing to digital projects including photoshoots and stock management.
  - Multidisciplinary Internship (Jul 2022 - Sept 2022) at AP-HP (Assistance Publique - Hôpitaux de Paris):
    - HR administrative support: personnel file tracking (hiring, leaves, absences).
    - Logistical coordination: receiving, preparing, and distributing packages between hospital departments.
    - Internal communication: creating work schedules and signage for the HR department.

- Language Levels:
  - French: Native.
  - English: B2 (Intermediate).
  - Spanish: B2 (Intermediate).

- Hard Skills: Pack Office, Social Media (Instagram, TikTok, LinkedIn, etc.), Brevo (newsletters, CRM), Contentsquare, Meta Business Suite, Canva.
- Soft Skills: Team player, initiative-taker (force de proposition), autonomous, versatile, meticulous.
- Interests:
  - Basketball: played at a competitive level for 5 years.
  - Music: Dancehall, Afro, R&B...
  - Cinema: Action, Science Fiction, Comedy...

Your goal is to represent Océanne to potential recruiters or contacts. Always start the conversation in French (unless spoken to in English first) with: "Bonjour ! Je suis Vanessa, l'assistante d'Océanne Benin. Comment puis-je vous renseigner aujourd'hui sur son parcours ou sa recherche de CDI ?" (or the English equivalent if appropriate). Present her skills, experiences, and educational background with pride, precision, and passion! Be brief and conversational, allowing the user to ask details about what interest them.`;

// --- Audio Processing Helpers ---
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Components ---

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Click Start to talk with Vanessa");
  
  const [userTranscript, setUserTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);

  // States for bypassing iframe link restrictions with standard & copy-to-clipboard options
  const [activeLinkModal, setActiveLinkModal] = useState<{ isOpen: boolean; title: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLinkClick = (e: React.MouseEvent, title: string, url: string) => {
    // Intercept standard click events to guarantee popups can be copied or opened gracefully in the iframe sandbox
    e.preventDefault();
    setActiveLinkModal({ isOpen: true, title, url });
    setCopied(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (err) {
      console.warn("Navigator clipboard blocked, trying fallback", err);
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
    document.body.removeChild(textArea);
  };
  
  const sessionRef = useRef<any>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, userTranscript, assistantTranscript]);

  // --- Audio Playback ---
  const playNextInQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);
    setStatusMessage("Vanessa is speaking...");

    if (!outputAudioCtxRef.current) {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const ctx = outputAudioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;
      const float32Data = new Float32Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        float32Data[i] = chunk[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      const playPromise = new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
      
      source.start();
      await playPromise;
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
    setStatusMessage("Listening to you...");
  }, []);

  // --- Connection Logic ---
  const connect = async () => {
    if (isConnected) {
      // Disconnect
      sessionRef.current?.close();
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      if (inputAudioCtxRef.current) {
        inputAudioCtxRef.current.close();
        inputAudioCtxRef.current = null;
      }
      if (outputAudioCtxRef.current) {
        outputAudioCtxRef.current.close();
        outputAudioCtxRef.current = null;
      }
      setIsConnected(false);
      setStatusMessage("Disconnected");
      return;
    }

    setStatusMessage("Connecting to Vanessa...");
    setUserTranscript("");
    setAssistantTranscript("");
    setConversationHistory([]);

    try {
      // Create output audio context immediately on user gesture to play audio successfully
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      await outputAudioCtxRef.current.resume();

      const session = new LiveSessionClient({
        onopen: () => {
          console.log("Live API connected");
          setIsConnected(true);
          setStatusMessage("Connected! Vanessa is introducing herself...");
          startMic();
          
          // Trigger Vanessa's spoken greeting to the user immediately on load!
          setTimeout(() => {
            sessionRef.current?.sendClientContent({
              turns: [{
                role: "user",
                parts: [{ text: "Bonjour Vanessa ! S'il te plaît, présente-toi chaleureusement d'une voix accueillante en tant qu'assistante d'Océanne Benin, en français." }]
              }],
              turnComplete: true
            });
          }, 500);
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
            const audioData = new Int16Array(base64ToArrayBuffer(base64Audio));
            audioQueueRef.current.push(audioData);
            playNextInQueue();
          }

          // Handle output transcription (Vanessa speaking) in real-time
          let assistantTextChunk = "";
          if (message.serverContent?.outputTranscription?.text) {
            assistantTextChunk = message.serverContent.outputTranscription.text;
          } else if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.text) {
                assistantTextChunk += part.text;
              }
            }
          }

          if (assistantTextChunk) {
            // Clear userTranscript if we were previously showing one and push it to history
            setUserTranscript(curr => {
              if (curr.trim()) {
                setConversationHistory(prev => [...prev, { role: 'user', text: curr.trim() }]);
              }
              return "";
            });

            setAssistantTranscript(prev => prev + assistantTextChunk);
            setStatusMessage("Vanessa répond...");
          }

          // Handle input transcription (User speaking) in real-time
          if (message.serverContent?.inputTranscription?.text) {
            const userTextChunk = message.serverContent.inputTranscription.text;

            // Clear assistantTranscript if we were previously showing one and push it to history
            setAssistantTranscript(curr => {
              if (curr.trim()) {
                setConversationHistory(prev => [...prev, { role: 'assistant', text: curr.trim() }]);
              }
              return "";
            });

            setUserTranscript(prev => prev + userTextChunk);
            setStatusMessage("Vous parlez...");
          }
          
          if (message.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
            setStatusMessage("Interrompue");

            setAssistantTranscript(curr => {
              if (curr.trim()) {
                setConversationHistory(prev => [...prev, { role: 'assistant', text: curr.trim() + "..." }]);
              }
              return "";
            });
          }
        },
        onclose: () => {
          setIsConnected(false);
          stopMic();
          setStatusMessage("Closed");
        },
        onerror: (err: any) => {
          console.error("Live API error:", err);
          setIsConnected(false);
          setStatusMessage("Connection Error");
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect:", err);
      setStatusMessage("Failed to initiate connection");
    }
  };

  const resetConnection = async () => {
    console.log("Resetting connection...");
    sessionRef.current?.close();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    if (inputAudioCtxRef.current) {
      try { await inputAudioCtxRef.current.close(); } catch (e) {}
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      try { await outputAudioCtxRef.current.close(); } catch (e) {}
      outputAudioCtxRef.current = null;
    }
    setIsConnected(false);
    setStatusMessage("Réinitialisation de la liaison...");
    setTimeout(() => {
      connect();
    }, 400);
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!inputAudioCtxRef.current) {
        inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      
      const ctx = inputAudioCtxRef.current;
      await ctx.resume();
      
      sourceRef.current = ctx.createMediaStreamSource(stream);
      processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        if (isMuted) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate audio level for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setAudioLevel(Math.sqrt(sum / inputData.length));

        // Convert to PCM 16-bit
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }

        const base64Data = arrayBufferToBase64(pcmData.buffer);
        sessionRef.current?.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(ctx.destination);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setStatusMessage("Microphone Access Required");
    }
  };

  const stopMic = () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
  };

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      stopMic();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Vanessa</h1>
            <p className="text-xs text-white/50 uppercase tracking-widest">AI Assistant for Océanne Benin</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-center">
          {/* Action Links with forced target="_blank" to prevent iframe/sandbox connection restrictions */}
          <div className="flex items-center gap-2">
            <a 
              href="https://www.linkedin.com" 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => handleLinkClick(e, "LinkedIn", "https://www.linkedin.com")}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all hover:scale-105"
              title="Accéder à LinkedIn"
            >
              <Linkedin className="w-4 h-4" />
            </a>
            <a 
              href="mailto:oceanne.benin971@gmail.com" 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => handleLinkClick(e, "Email", "oceanne.benin971@gmail.com")}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all hover:scale-105"
              title="Contacter par Email"
            >
              <Mail className="w-4 h-4" />
            </a>
            <a 
              href="tel:0650192219" 
              onClick={(e) => handleLinkClick(e, "Téléphone", "0650192219")}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all hover:scale-105"
              title="Appeler Océanne"
            >
              <Phone className="w-4 h-4" />
            </a>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/70">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow relative z-10 max-w-6xl w-full mx-auto p-6 flex flex-col gap-8 justify-center overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch w-full">
          
          {/* Left Console Panel: Status & Visualizer */}
          <div className="lg:col-span-5 bg-[#050e3e] border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between items-center gap-6 relative overflow-hidden shadow-2xl">
            {/* Status indicators */}
            <div className="text-center w-full">
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20 shadow-inner">
                {statusMessage}
              </span>
            </div>

            {/* Visualizer Orb */}
            <div className="relative w-full aspect-square max-w-[240px] flex items-center justify-center my-4">
              {/* Central Orb */}
              <motion.div 
                animate={{
                 scale: isConnected ? (isSpeaking ? [1, 1.08, 1] : (audioLevel > 0.05 ? 1.05 : 1)) : 1,
                 boxShadow: isConnected 
                   ? (isSpeaking 
                       ? "0 0 60px rgba(16, 185, 129, 0.3)" 
                       : "0 0 30px rgba(59, 130, 246, 0.1)")
                   : "0 0 0px rgba(255, 255, 255, 0)"
                }}
                transition={{ duration: 0.2 }}
                className={`w-40 h-40 rounded-full flex items-center justify-center relative overflow-hidden transition-colors duration-500 z-10 ${
                 isConnected 
                   ? (isSpeaking ? 'bg-emerald-500/20 border-2 border-emerald-500/40' : 'bg-blue-500/20 border-2 border-blue-500/40') 
                   : 'bg-white/5 border border-white/10'
                }`}
              >
                <AnimatePresence mode="wait">
                 {!isConnected ? (
                   <motion.div
                     key="offline"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="text-white/20"
                   >
                     <MicOff className="w-10 h-10" />
                   </motion.div>
                 ) : (
                   <motion.div
                     key="online"
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className="flex gap-1 items-center h-10"
                   >
                     {[...Array(5)].map((_, i) => (
                       <motion.div
                         key={i}
                         animate={{
                           height: isSpeaking 
                             ? [12, 40, 20, 32, 12][i % 5] * (Math.random() * 0.5 + 0.5)
                             : Math.max(8, audioLevel * 200 * (i === 2 ? 1 : 0.6))
                         }}
                         transition={{ repeat: Infinity, duration: 0.5, ease: "easeInOut" }}
                         className={`w-1 rounded-full ${isSpeaking ? 'bg-emerald-400' : 'bg-blue-400'}`}
                       />
                     ))}
                   </motion.div>
                 )}
                </AnimatePresence>
              </motion.div>

              {/* Decorative Rings */}
              {isConnected && (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    className="absolute w-52 h-52 rounded-full border border-dashed border-white/10"
                  />
                  <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                    className="absolute w-64 h-64 rounded-full border border-dashed border-white/5"
                  />
                </>
              )}
            </div>

            {/* Controls Console */}
            <div className="flex flex-wrap items-center gap-4 w-full justify-center border-t border-white/5 pt-6">
              {isConnected ? (
                <>
                  {/* Micro Toggle */}
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-3.5 rounded-full border transition-all ${
                      isMuted 
                        ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-lg shadow-red-500/10' 
                        : 'bg-white/5 border-white/10 text-white/75 hover:text-white hover:bg-white/10'
                    }`}
                    title={isMuted ? "Réactiver le micro" : "Couper le micro"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  {/* Red/Crimson Disconnect Button */}
                  <button
                    onClick={connect}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-full font-bold tracking-wide transition-all text-sm shadow-xl bg-red-600 hover:bg-red-500 text-white shadow-red-600/20"
                    title="Se déconnecter de la session avec Vanessa"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Se Déconnecter</span>
                  </button>

                  {/* Reset/Réinitialiser Button */}
                  <button
                    onClick={resetConnection}
                    className="flex items-center gap-2 px-5 py-3.5 rounded-full font-medium tracking-wide transition-all text-sm bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                    title="Relancer / réinitialiser la liaison en direct"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Réinitialiser</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Connect / Démarrer Button */}
                  <button
                    onClick={connect}
                    className="flex items-center gap-2 px-10 py-4 rounded-full font-bold tracking-wide transition-all text-sm shadow-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 shadow-emerald-500/20 hover:scale-105"
                  >
                    <Mic className="w-5 h-5" />
                    <span>Démarrer la voix avec Vanessa</span>
                  </button>
                </>
              )}

              <div className="p-3.5 rounded-full bg-white/5 border border-white/10 text-white/50" title="Haut-parleur actif">
                <Volume2 className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Right Text Panel: Real-time Dialog Transcription */}
          <div className="lg:col-span-7 bg-white/[0.02] border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col relative overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
              <span className="text-sm font-medium tracking-wide text-white/80 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Transcription en Direct (Français / Anglais)
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-semibold text-emerald-400 uppercase tracking-widest animate-pulse">
                <span>Direct</span>
              </div>
            </div>

            {/* Subtitles Scroll Box */}
            <div className="flex-grow overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10 h-[320px] lg:h-[350px]">
              {conversationHistory.length === 0 && !userTranscript && !assistantTranscript ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                    <Sparkles className="w-5 h-5 text-white/30" />
                  </div>
                  <h4 className="text-sm font-medium text-white/70 mb-1">Vanessa vous répondra par écrit</h4>
                  <p className="text-xs text-white/40 max-w-sm">
                    Cliquez sur "Démarrer la voix" pour parler de vive voix. Vanessa parlera et écrira ses réponses en temps réel !
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversationHistory.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <span className={`text-[10px] tracking-wider uppercase font-bold px-1 ${item.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}`}>
                        {item.role === 'user' ? 'Vous' : 'Vanessa'}
                      </span>
                      <div className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                        item.role === 'user' 
                          ? 'bg-blue-500/10 border border-blue-500/20 text-white rounded-tr-none' 
                          : 'bg-emerald-500/10 border border-emerald-500/20 text-white rounded-tl-none'
                      }`}>
                        {item.text}
                      </div>
                    </div>
                  ))}

                  {/* Active user speaks in real-time */}
                  {userTranscript.trim() && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-end space-y-1"
                    >
                      <span className="text-[10px] tracking-wider uppercase font-bold text-blue-400 animate-pulse px-1">
                        Vous parlez...
                      </span>
                      <div className="p-3.5 bg-blue-500/20 border border-blue-500/40 text-white rounded-2xl rounded-tr-none max-w-[85%] text-xs leading-relaxed shadow-lg shadow-blue-500/5">
                        {userTranscript}
                      </div>
                    </motion.div>
                  )}

                  {/* Active Vanessa speaks/types in real-time */}
                  {assistantTranscript.trim() && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-start space-y-1"
                    >
                      <span className="text-[10px] tracking-wider uppercase font-bold text-emerald-400 animate-pulse flex items-center gap-1 px-1">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        Vanessa répond...
                      </span>
                      <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-white rounded-2xl rounded-tl-none max-w-[85%] text-xs leading-relaxed shadow-lg shadow-emerald-500/5">
                        {assistantTranscript}
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                      </div>
                    </motion.div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm group hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 bg-emerald-500/5">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="font-medium text-sm">Education</h3>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">Master Digital Marketing @ ESCE. Seeking a CDI starting October 2026.</p>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm group hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 bg-blue-500/5">
                <Briefcase className="w-5 h-5" />
              </div>
              <h3 className="font-medium text-sm">Experience</h3>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">Apprentice in Digital Comm @ M.Charraire. Past Community & Influence @ Love & Green.</p>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm group hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 bg-purple-500/5">
                <Languages className="w-5 h-5" />
              </div>
              <h3 className="font-medium text-sm">Bilingual</h3>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">Fluent in French & English. Professional competence in Spanish (B2).</p>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-[10px] text-white/30 uppercase tracking-[0.2em] font-medium border-t border-white/5">
        Powered by Gemini 2.5 Live API
      </footer>

      {/* Fallback Contact link Modal with direct Copy button */}
      <AnimatePresence>
        {activeLinkModal && activeLinkModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveLinkModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl z-50 overflow-hidden text-left"
            >
              {/* Top ambient light */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/10 blur-xl rounded-full pointer-events-none" />
              
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Info className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">Ouvrir {activeLinkModal.title}</h3>
                      <p className="text-xs text-white/50">Lien externe sécurisé</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveLinkModal(null)}
                    className="text-white/40 hover:text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Fermer
                  </button>
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4.5 space-y-3">
                  <p className="text-xs text-white/70 leading-relaxed">
                    Les règles de sécurité de l'iframe de prévisualisation bloquent parfois la redirection directe. Vous pouvez copier l'adresse ci-dessous ou forcer l'ouverture :
                  </p>
                  
                  {/* Option 1: Direct link button */}
                  <a 
                    href={activeLinkModal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold text-xs leading-relaxed transition-all shadow-lg shadow-emerald-500/15"
                  >
                    <span>Ouvrir dans un nouvel onglet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {/* Divider */}
                  <div className="flex items-center gap-2">
                    <div className="flex-grow h-px bg-white/5" />
                    <span className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">ou</span>
                    <div className="flex-grow h-px bg-white/5" />
                  </div>

                  {/* Option 2: Copy link with feedback */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">Copier l'adresse de contact</span>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={activeLinkModal.url}
                        className="flex-grow bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/80 select-all focus:outline-none focus:border-emerald-500/50"
                      />
                      <button
                        onClick={() => copyToClipboard(activeLinkModal.url)}
                        className={`px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs font-semibold ${
                          copied 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                        }`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 animate-pulse" />
                            <span>Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-white/40 text-center flex items-center justify-center gap-1.5 mt-1 bg-white/5 py-2 px-3 rounded-lg border border-white/5">
                  <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Astuce : ouvrez l'application en plein écran (bouton en haut à droite) pour éviter tout blocage.</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
