// Modernized UI for webchat - Enhanced version
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff, 
  Trash2, Settings, Image, Check, CheckCheck, X, Link as LinkIcon
} from 'lucide-react';

// Helper component to make links clickable
const LinkifyText = ({ text }) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a 
              key={i} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-200 underline hover:text-white transition-colors duration-200 break-all"
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </span>
  );
};

const EncryptedChat = () => {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  
  // Data State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  // Call & UI State
  const [isCallActive, setIsCallActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState(7);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);

  // --- REFS ---
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const unsubscribeRef = useRef(null); 

  const ADMIN_PASSWORD = '1990';
  const USER_PASSWORD = '1964';

  // --- 1. INITIALIZATION & CLEANUP ---
  useEffect(() => {
    let unsubscribe = null;

    if (isLoggedIn && userType) {
      setLoadingMessages(true);

      // A. Load Settings
      const fetchSettings = async () => {
        try {
          const docRef = doc(db, "settings", "config");
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setAutoDeleteDays(docSnap.data().autoDeleteDays || 7);
          } else {
            await setDoc(docRef, { autoDeleteDays: 7 });
          }
        } catch (error) {
          console.error("Error fetching settings:", error);
        }
      };
      fetchSettings();

      // B. Query messages
      const q = query(
        collection(db, "messages"), 
        orderBy("timestamp", "desc"),
        limit(25)
      );
      
      unsubscribe = onSnapshot(q, 
        async (snapshot) => {
          const msgs = snapshot.docs.reverse().map(docSnap => {
            const data = docSnap.data();
            
            let time = Date.now();
            if (data.timestamp?.toMillis) {
              time = data.timestamp.toMillis();
            } else if (data.timestamp instanceof Date) {
              time = data.timestamp.getTime();
            }

            return { id: docSnap.id, ...data, timestamp: time };
          });
          
          setMessages(msgs);
          setLoadingMessages(false);
          
          // Mark as read in background
          const updatePromises = snapshot.docs
            .filter(docSnap => {
              const msg = docSnap.data();
              return msg.sender && msg.sender !== userType && msg.status !== 'read';
            })
            .map(docSnap => 
              updateDoc(doc(db, "messages", docSnap.id), { status: 'read' })
            );
          
          if (updatePromises.length > 0) {
            Promise.all(updatePromises).catch(err => 
              console.error("Error marking messages as read:", err)
            );
          }
        },
        (error) => {
          console.error("Error fetching messages:", error);
          setLoadingMessages(false);
        }
      );

      unsubscribeRef.current = unsubscribe;

      // C. Cleanup old messages
      setTimeout(() => {
        checkAndCleanOldMessages();
      }, 2000);

    } else if (!isLoggedIn) {
      setMessages([]);
      setLoadingMessages(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isLoggedIn, userType]);

  useEffect(() => {
    if (!loadingMessages && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, loadingMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- 2. LOGIC: AUTO-DELETE ---
  const updateAutoDeleteSettings = async (days) => {
    setAutoDeleteDays(days);
    try {
      await setDoc(doc(db, "settings", "config"), { autoDeleteDays: days });
      setShowSettings(false);
      checkAndCleanOldMessages(days);
    } catch (error) {
      console.error("Error updating settings:", error);
      alert("Failed to update settings");
    }
  };

  const checkAndCleanOldMessages = async (daysOverride) => {
    try {
      const days = daysOverride || autoDeleteDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffTimestamp = cutoffDate.getTime();

      const q = query(
        collection(db, "messages"),
        where("timestamp", "<", cutoffTimestamp),
        orderBy("timestamp", "asc"),
        limit(100)
      );
      
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(docSnap => 
        deleteDoc(doc(db, "messages", docSnap.id))
      );

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} old messages`);
      }
    } catch (error) {
      console.error("Error cleaning old messages:", error);
    }
  };

  // --- 3. LOGIC: MANUAL DELETE ---
  const deleteMessage = async (msgId) => {
    if (window.confirm("Delete this message permanently?")) {
      try {
        await deleteDoc(doc(db, "messages", msgId));
      } catch (error) {
        console.error("Error deleting message:", error);
        alert("Failed to delete message");
      }
    }
  };

  // --- 4. CLOUDINARY UPLOAD ---
  const uploadToCloudinary = async (fileOrBlob, resourceType = 'auto') => {
    const cloudName = "dujpj0445";
    const uploadPreset = "chat_app_upload";

    const formData = new FormData();
    formData.append("file", fileOrBlob);
    formData.append("upload_preset", uploadPreset);

    try {
      setUploading(true);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, 
        { method: "POST", body: formData }
      );
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      setUploading(false);
      return data.secure_url;
    } catch (error) {
      console.error("Upload failed:", error);
      setUploading(false);
      alert("Upload failed. Please try again.");
      return null;
    }
  };

  // --- 5. AUTHENTICATION ---
  const handleUnifiedLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('admin');
      setPassword('');
    } else if (password === USER_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('user');
      setPassword('');
    } else {
      alert('Incorrect Password');
    }
  };

  const handleLogout = async () => {
    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (isCallActive && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        clearInterval(recordingIntervalRef.current);
      }

      setIsLoggedIn(false);
      setUserType(null);
      setPassword('');
      setMessages([]);
      setLoadingMessages(false);
      setNewMessage('');
      setIsCallActive(false);
      setShowSettings(false);
      setRecordingTime(0);
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  // --- 6. SENDING MESSAGES ---
  const handleSendMessage = async () => {
    const textToSend = newMessage.trim();
    if (!textToSend || !isLoggedIn || !userType) return;

    const tempMessage = textToSend;
    setNewMessage(''); 

    try {
      await addDoc(collection(db, "messages"), {
        text: tempMessage,
        sender: userType,
        timestamp: serverTimestamp(),
        type: 'text',
        status: 'sent'
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(tempMessage); 
      alert("Failed to send message. Please try again.");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size limit is 10MB');
      e.target.value = '';
      return;
    }

    try {
      const fileUrl = await uploadToCloudinary(file, 'auto');
      if (fileUrl) {
        await addDoc(collection(db, "messages"), {
          fileName: file.name,
          fileData: fileUrl,
          fileType: file.type,
          fileSize: file.size,
          sender: userType,
          timestamp: serverTimestamp(),
          type: 'file',
          status: 'sent'
        });
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      e.target.value = '';
    }
  };

  // --- 7. CALL LOGIC ---
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      setRecordingTime(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = await uploadToCloudinary(audioBlob, 'video');
        
        if (audioUrl) {
          await addDoc(collection(db, "messages"), {
            audioData: audioUrl,
            duration: recordingTime,
            sender: userType,
            timestamp: serverTimestamp(),
            type: 'voice',
            status: 'sent'
          });
        }
        
        stream.getTracks().forEach(track => track.stop());
        setIsCallActive(false);
        setRecordingTime(0);
      };

      mediaRecorderRef.current.start();
      setIsCallActive(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Error starting call:", error);
      alert("Could not access microphone");
    }
  };

  const stopCall = () => {
    if (mediaRecorderRef.current && isCallActive) {
      mediaRecorderRef.current.stop();
      clearInterval(recordingIntervalRef.current);
    }
  };

  // --- HELPERS ---
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RENDER LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all hover:scale-[1.01]">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone size={40} className="text-blue-600" />
            </div>
            <h1 className="text-3xl font-black text-gray-800 mb-2">Secure Chat</h1>
            <p className="text-gray-500 font-medium">Enter your password to continue</p>
          </div>
          
          <div className="space-y-6">
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              onKeyPress={(e) => e.key === 'Enter' && handleUnifiedLogin()}
              placeholder="Enter Password" 
              className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-center tracking-widest"
            />
            <button 
              onClick={handleUnifiedLogin} 
              className="w-full bg-blue-600 text-white py-4 rounded-2xl text-xl font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-600/30"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER CHAT ---
  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* HEADER - Modernized with glassmorphism effect */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-600/20">
                <Phone size={24} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div>
              <h2 className="font-black text-xl text-gray-800 leading-tight">Family Chat</h2>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-wider">
                {userType === 'admin' ? 'Administrator' : 'Family Member'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {userType === 'admin' && (
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={`p-3 rounded-2xl transition-all ${
                  showSettings ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Settings"
              >
                <Settings size={24} />
              </button>
            )}
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-5 py-3 rounded-2xl font-bold hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
            >
              <LogOut size={20} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* SETTINGS - Modernized overlay */}
      {showSettings && userType === 'admin' && (
        <div className="bg-white border-b border-gray-200 p-6 absolute top-[81px] right-0 left-0 z-20 shadow-xl animate-in slide-in-from-top duration-300">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-black text-xl text-gray-800">Auto-Delete Settings</h3>
                <p className="text-gray-500 font-medium">Messages will be permanently removed after the selected period</p>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 3, 7, 30].map(day => (
                <button 
                  key={day} 
                  onClick={() => updateAutoDeleteSettings(day)} 
                  className={`px-6 py-4 rounded-2xl text-lg font-bold transition-all border-2 ${
                    autoDeleteDays === day 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' 
                      : 'bg-white text-gray-600 border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  {day} Day{day > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MESSAGES AREA - Improved bubbles and spacing */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8F9FC]">
        
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
            <p className="text-gray-500 font-bold text-lg">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white p-12 rounded-[40px] shadow-sm border border-gray-100 max-w-md">
              <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Send size={32} className="text-blue-600" />
              </div>
              <h3 className="text-gray-800 font-black text-2xl mb-2">No messages yet</h3>
              <p className="text-gray-500 font-medium">Be the first to say hello to the family!</p>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div 
              key={msg.id} 
              className={`flex w-full ${
                msg.sender === userType ? 'justify-end' : 'justify-start'
              }`}
            >
              <div 
                className={`relative max-w-[85%] sm:max-w-[70%] px-6 py-4 rounded-[28px] shadow-sm group transition-all hover:shadow-md ${
                  msg.sender === userType 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                }`}
              >
                
                {/* TEXT MESSAGE */}
                {msg.type === 'text' && (
                  <div className="text-[17px] leading-relaxed">
                    {msg.sender === userType ? (
                      <LinkifyText text={msg.text} />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">
                        {msg.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                          if (part.match(/(https?:\/\/[^\s]+)/g)) {
                            return (
                              <a 
                                key={i} 
                                href={part} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 underline hover:text-blue-800 transition-colors duration-200 break-all"
                              >
                                {part}
                              </a>
                            );
                          }
                          return part;
                        })}
                      </span>
                    )}
                  </div>
                )}
                
                {/* FILE MESSAGE */}
                {msg.type === 'file' && (
                  <div className="space-y-2">
                    {msg.fileType?.startsWith('image/') ? (
                      <div className="relative group/img">
                        <img 
                          src={msg.fileData} 
                          alt="Shared" 
                          className="rounded-2xl max-h-80 object-cover w-full cursor-pointer border-2 border-white/10 shadow-sm" 
                          onClick={() => window.open(msg.fileData, '_blank')} 
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                          <Download size={32} className="text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center space-x-4 p-4 rounded-2xl ${
                        msg.sender === userType ? 'bg-white/10' : 'bg-gray-50'
                      }`}>
                        <div className="bg-blue-500 p-3 rounded-xl text-white shadow-sm">
                          <Paperclip size={20} />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-base font-bold truncate">{msg.fileName}</p>
                          <p className={`text-sm ${msg.sender === userType ? 'text-blue-100' : 'text-gray-500'}`}>
                            {Math.round(msg.fileSize/1024)} KB
                          </p>
                        </div>
                        <a 
                          href={msg.fileData} 
                          target="_blank" 
                          rel="noreferrer" 
                          className={`p-3 rounded-xl transition-all ${
                            msg.sender === userType ? 'hover:bg-white/20 text-white' : 'hover:bg-blue-50 text-blue-600'
                          }`}
                        >
                          <Download size={24} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* VOICE MESSAGE */}
                {msg.type === 'voice' && (
                  <div className="space-y-3 min-w-[240px]">
                    <div className="flex items-center gap-3 text-sm font-bold">
                      <div className={`p-2 rounded-full ${msg.sender === userType ? 'bg-white/20' : 'bg-blue-50 text-blue-600'}`}>
                        <Mic size={18} />
                      </div>
                      <span>Voice Message • {formatDuration(msg.duration)}</span>
                    </div>
                    <audio 
                      controls 
                      src={msg.audioData} 
                      className={`w-full h-10 rounded-lg ${msg.sender === userType ? 'brightness-125' : ''}`}
                      preload="metadata"
                    />
                  </div>
                )}
                
                {/* MESSAGE FOOTER */}
                <div className={`text-[11px] mt-2 flex justify-end items-center gap-2 font-bold uppercase tracking-tighter ${
                  msg.sender === userType ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  <span>{formatTime(msg.timestamp)}</span>
                  
                  {msg.sender === userType && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-white" />
                      ) : (
                        <Check size={14} className="text-white/60" />
                      )}
                    </span>
                  )}

                  {userType === 'admin' && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="ml-2 p-1.5 hover:bg-red-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete message"
                    >
                      <Trash2 size={14} className={msg.sender === userType ? 'text-white' : 'text-red-500'} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA - Modernized with better layout */}
      <div className="bg-white border-t border-gray-200 px-6 py-6 pb-8 sm:pb-6">
        <div className="max-w-6xl mx-auto">
          {/* Action Row: Voice and Attach */}
          <div className="flex gap-4 mb-4">
            {/* Modernized Call/Record Button */}
            <button 
              onClick={isCallActive ? stopCall : startCall} 
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-black text-lg transition-all shadow-lg active:scale-[0.98] ${
                isCallActive 
                  ? 'bg-red-500 text-white animate-pulse shadow-red-500/30' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-600/30 hover:shadow-blue-600/40'
              }`}
            >
              {isCallActive ? (
                <>
                  <div className="w-3 h-3 bg-white rounded-full animate-ping"></div>
                  <PhoneOff size={24} />
                  <span>Stop & Send ({formatDuration(recordingTime)})</span>
                </>
              ) : (
                <>
                  <Mic size={24} />
                  <span>Record Voice Message</span>
                </>
              )}
            </button>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="image/*,application/pdf,.doc,.docx"
              disabled={uploading}
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
              className="bg-gray-100 text-gray-700 p-4 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95 shadow-sm flex items-center gap-2"
              title="Attach Photo"
            >
              <Image size={24} />
              <span className="hidden md:inline">Photo</span>
            </button>
          </div>

          {/* Text Input Row */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-50 rounded-2xl flex items-center px-6 py-4 border-2 border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all">
              <input 
                type="text" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
                placeholder={uploading ? "Uploading file..." : "Type a message..."} 
                disabled={uploading} 
                className="flex-1 focus:outline-none text-gray-800 bg-transparent text-lg font-medium" 
                maxLength={1000}
              />
            </div>
            
            <button 
              onClick={handleSendMessage} 
              disabled={uploading || !newMessage.trim()} 
              className={`p-5 rounded-2xl transition-all shadow-lg active:scale-90 ${
                newMessage.trim() && !uploading
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* UPLOADING OVERLAY */}
      {uploading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-[32px] shadow-2xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
            <span className="text-xl font-black text-gray-800">Sending File...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncryptedChat;
