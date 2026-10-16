import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { floatTo16BitPCM, pcmToFloat32 } from '../lib/audio-utils';

export function useJarvis() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [groundingMetadata, setGroundingMetadata] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFacebookConnected, setIsFacebookConnected] = useState(false);
  
  const isConnectedRef = useRef(false);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const aiResponseRef = useRef("");
  const userTranscriptRef = useRef("");

  const loadHistory = useCallback(async () => {
    try {
      const res = await window.fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, []);

  const saveToHistory = async (role: string, content: string, metadata?: any) => {
    try {
      await window.fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content, metadata }),
      });
      loadHistory();
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  };

  const checkFacebookStatus = useCallback(async () => {
    try {
      const res = await window.fetch("/api/facebook/status");
      if (res.ok) {
        const data = await res.json();
        setIsFacebookConnected(data.connected);
      }
    } catch (err) {
      console.error("Failed to check Facebook status:", err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    checkFacebookStatus();
  }, [loadHistory, checkFacebookStatus]);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current || !audioContextRef.current) {
      return;
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    isPlayingRef.current = true;
    const audioData = audioQueueRef.current.shift()!;
    console.log("JARVIS: Playing audio chunk", audioData.length);
    const buffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    buffer.getChannelData(0).set(audioData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const connect = useCallback(async () => {
    console.log("JARVIS: Initializing connection...");
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("JARVIS: API Key is missing");
        setError("API Key is missing. Please configure it.");
        return;
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are JARVIS, a highly sophisticated AI assistant. You are helpful, witty, and loyal. Your tone is professional yet slightly British and dry. You respond concisely and effectively. You are here to assist the user with any task. You have access to Google Search to provide real-time information. You can control the browser to open ANY website (Instagram, TikTok, YouTube, etc.), perform searches, and navigate to specific URLs in new tabs. You can see the user's screen if they share it. Use visual information from the screen to help the user navigate or understand what they are looking at. If the user asks to 'click' something and you can see a URL or a clear destination, use the clickLink tool. When the user asks to 'open', 'search', or 'go to' something, use the appropriate tools. For WhatsApp, if you don't have a phone number, you can ask the user for it or just open WhatsApp Web. Provide references and links where appropriate.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens any website by name or URL. Use this when the user says 'open Instagram', 'go to tiktok.com', etc.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      siteName: {
                        type: Type.STRING,
                        description: "The name of the website (e.g., Instagram, TikTok, Facebook)."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The direct URL if known or visible on screen."
                      }
                    }
                  }
                },
                {
                  name: "clickLink",
                  description: "Simulates clicking a link by opening its URL in a new tab. Use this when the user says 'click that link' and you can see the URL on the screen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The URL of the link to click."
                      }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "searchWebsite",
                  description: "Searches for content on a specific platform like YouTube, Instagram, or TikTok.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      platform: {
                        type: Type.STRING,
                        description: "The platform to search on (e.g., youtube, instagram, tiktok)."
                      },
                      query: {
                        type: Type.STRING,
                        description: "The search query."
                      }
                    },
                    required: ["platform", "query"]
                  }
                },
                {
                  name: "openWhatsApp",
                  description: "Opens WhatsApp Web and optionally starts a chat with a contact and a message.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      contactName: {
                        type: Type.STRING,
                        description: "The name of the contact (for reference)."
                      },
                      phoneNumber: {
                        type: Type.STRING,
                        description: "The phone number in international format (e.g., 1234567890)."
                      },
                      message: {
                        type: Type.STRING,
                        description: "The message to pre-fill."
                      }
                    }
                  }
                },
                {
                  name: "searchGoogle",
                  description: "Performs a Google search in a new tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The search query."
                      }
                    },
                    required: ["query"]
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("JARVIS: Connection established");
            setIsConnected(true);
            isConnectedRef.current = true;
            setError(null);
            startMic();
            
            // Start video streaming if screen sharing is active
            if (isSharingScreen) {
              startVideoStreaming();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log("JARVIS: Message received", message);
            // Handle audio output
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const audioData = pcmToFloat32(part.inlineData.data);
                  audioQueueRef.current.push(audioData);
                  playNextInQueue();
                }
              }
            }

            if (message.serverContent?.interrupted) {
              console.log("JARVIS: Interrupted");
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setAiResponse("");
            }

            // Handle transcriptions
            // Model output transcription
            const modelText = message.serverContent?.modelTurn?.parts?.filter(p => p.text).map(p => p.text).join("");
            if (modelText) {
              setAiResponse(prev => prev + modelText);
              aiResponseRef.current += modelText;
            }

            // Handle Tool Calls
            if (message.toolCall) {
              setIsProcessing(true);
              const responses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                console.log("JARVIS: Tool call", call);
                let result = { status: "success" };
                
                if (call.name === "openWebsite") {
                  const { siteName, url } = call.args as any;
                  let targetUrl = url;
                  if (!targetUrl && siteName) {
                    const sites: Record<string, string> = {
                      instagram: "https://www.instagram.com",
                      tiktok: "https://www.tiktok.com",
                      facebook: "https://www.facebook.com",
                      twitter: "https://www.twitter.com",
                      x: "https://www.x.com",
                      linkedin: "https://www.linkedin.com",
                      github: "https://www.github.com",
                      youtube: "https://www.youtube.com"
                    };
                    targetUrl = sites[siteName.toLowerCase()] || `https://www.google.com/search?q=${encodeURIComponent(siteName)}&btnI=I%27m+Feeling+Lucky`;
                  }
                  if (targetUrl) window.open(targetUrl, "_blank");
                } else if (call.name === "clickLink") {
                  const { url } = call.args as any;
                  window.open(url, "_blank");
                } else if (call.name === "searchWebsite") {
                  const { platform, query } = call.args as any;
                  let searchUrl = "";
                  const p = platform.toLowerCase();
                  if (p === "youtube") {
                    searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                  } else if (p === "instagram") {
                    searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/\s+/g, ""))}/`;
                  } else if (p === "tiktok") {
                    searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
                  } else {
                    searchUrl = `https://www.google.com/search?q=site:${p}+${encodeURIComponent(query)}`;
                  }
                  window.open(searchUrl, "_blank");
                } else if (call.name === "openWhatsApp") {
                  const { phoneNumber, message: wsMessage } = call.args as any;
                  let url = "https://web.whatsapp.com";
                  if (phoneNumber) {
                    url = `https://wa.me/${phoneNumber}${wsMessage ? `?text=${encodeURIComponent(wsMessage)}` : ""}`;
                  }
                  window.open(url, "_blank");
                } else if (call.name === "searchGoogle") {
                  const { query } = call.args as any;
                  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
                }
                
                responses.push({
                  name: call.name,
                  response: result,
                  id: call.id
                });
              }
              
              if (sessionRef.current) {
                sessionRef.current.sendToolResponse({
                  functionResponses: responses
                });
              }
              setIsProcessing(false);
            }

            // User input transcription
            const userText = (message.serverContent as any)?.userTurn?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("");
            if (userText) {
              setUserTranscript(prev => prev + userText);
              userTranscriptRef.current += userText;
            }

            // Handle Grounding Metadata (Search results)
            if (message.serverContent?.modelTurn) {
              const metadata = (message as any).serverContent?.modelTurn?.groundingMetadata;
              if (metadata?.groundingChunks) {
                setGroundingMetadata(metadata.groundingChunks);
              }
            }

            // Save to history when turn is complete
            if (message.serverContent?.turnComplete) {
              if (userTranscriptRef.current) {
                const text = userTranscriptRef.current;
                saveToHistory("user", text);
                parseAndExecuteCommand(text);
                userTranscriptRef.current = "";
                setUserTranscript("");
              }
              if (aiResponseRef.current) {
                saveToHistory("assistant", aiResponseRef.current, { grounding: groundingMetadata });
                aiResponseRef.current = "";
                // We don't clear aiResponse state here so it stays visible in UI until next interaction
              }
            }
          },
          onclose: () => {
            console.log("JARVIS: Connection closed");
            setIsConnected(false);
            isConnectedRef.current = false;
            stopMic();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error. Please try again.");
            setIsConnected(false);
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect:", err);
      setError("Failed to initialize JARVIS.");
    }
  }, [playNextInQueue]);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule('data:text/javascript;base64,' + btoa(`
        class AudioProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              const channelData = input[0];
              this.port.postMessage(channelData);
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `));

      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, 'audio-processor');
      
      processor.port.onmessage = (event) => {
        const audioData = event.data;
        if (sessionRef.current && isConnectedRef.current) {
          // console.log("JARVIS: Sending audio data", audioData.length);
          const pcmData = floatTo16BitPCM(audioData);
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData)));
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      audioWorkletNodeRef.current = processor;
      setIsListening(true);
    } catch (err) {
      console.error("Mic error:", err);
      setError("Microphone access denied.");
    }
  };

  const executeActions = async (actions: any[]) => {
    for (const action of actions) {
      console.log("JARVIS: Executing action", action);
      setAiResponse(prev => prev + `\n*Executing: ${action.type}...*`);
      
      try {
        if (action.type === "open_website") {
          const sites: Record<string, string> = {
            youtube: "https://www.youtube.com",
            facebook: "https://www.facebook.com",
            google: "https://www.google.com",
            wikipedia: "https://www.wikipedia.org"
          };
          const url = sites[action.website.toLowerCase()] || `https://www.google.com/search?q=${encodeURIComponent(action.website)}`;
          window.open(url, "_blank");
        } else if (action.type === "search_website") {
          let url = "";
          const site = action.website.toLowerCase();
          if (site === "youtube") {
            url = `https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`;
          } else if (site === "google") {
            url = `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
          } else {
            url = `https://www.google.com/search?q=site:${site}+${encodeURIComponent(action.query)}`;
          }
          window.open(url, "_blank");
        } else if (action.type === "facebook_post" || action.type === "facebook_notifications") {
          const res = await window.fetch("/api/facebook/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action)
          });
          const data = await res.json();
          if (data.success) {
            setAiResponse(prev => prev + `\nSuccess: ${action.type === 'facebook_post' ? 'Posted to Facebook' : data.data}`);
          } else {
            setAiResponse(prev => prev + `\nError: ${data.error}`);
          }
        }
        
        // Short delay between actions
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error("Action execution failed:", err);
        setAiResponse(prev => prev + `\n*Failed to execute ${action.type}*`);
      }
    }
  };

  const parseAndExecuteCommand = async (text: string) => {
    setIsProcessing(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        You are a command parser for JARVIS. Convert the following natural language command into a JSON array of actions.
        Supported action types:
        - open_website: { "type": "open_website", "website": "youtube|facebook|google|wikipedia" }
        - search_website: { "type": "search_website", "website": "youtube|google", "query": "string" }
        - facebook_post: { "type": "facebook_post", "message": "string" }
        - facebook_notifications: { "type": "facebook_notifications" }

        If the command has multiple steps, return them in order.
        Command: "${text}"
        Return ONLY valid JSON.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{"actions":[]}');
      if (result.actions && result.actions.length > 0) {
        await executeActions(result.actions);
      }
    } catch (err) {
      console.error("Command parsing failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsSharingScreen(true);
      
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      if (isConnectedRef.current) {
        startVideoStreaming();
      }
    } catch (err) {
      console.error("Screen share error:", err);
      setError("Screen sharing access denied.");
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    if (videoIntervalRef.current) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    setIsSharingScreen(false);
  };

  const startVideoStreaming = () => {
    if (!screenStreamRef.current || !sessionRef.current) return;

    const videoTrack = screenStreamRef.current.getVideoTracks()[0];
    const imageCapture = new (window as any).ImageCapture(videoTrack);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    videoIntervalRef.current = window.setInterval(async () => {
      if (!sessionRef.current || !isConnectedRef.current) return;
      
      try {
        const bitmap = await imageCapture.grabFrame();
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx?.drawImage(bitmap, 0, 0);
        
        // Resize for Gemini (max 1024x1024 recommended, but smaller is faster)
        const scale = Math.min(1, 640 / Math.max(canvas.width, canvas.height));
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width * scale;
        tempCanvas.height = canvas.height * scale;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx?.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        const base64Data = tempCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        sessionRef.current.sendRealtimeInput({
          media: { data: base64Data, mimeType: 'image/jpeg' }
        });
      } catch (err) {
        console.error("Video stream error:", err);
      }
    }, 1000); // Send 1 frame per second
  };

  const stopMic = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopMic();
    setIsConnected(false);
    isConnectedRef.current = false;
  };

  return {
    isConnected,
    isListening,
    isProcessing,
    isSharingScreen,
    screenStream,
    isFacebookConnected,
    userTranscript,
    aiResponse,
    history,
    groundingMetadata,
    error,
    connect,
    disconnect,
    loadHistory,
    startScreenShare,
    stopScreenShare,
    checkFacebookStatus
  };
}
