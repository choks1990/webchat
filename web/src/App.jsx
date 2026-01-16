// Modernized UI for webchat - Version 2 (Indigo/Slate Theme + Photo Previews)
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff, 
  Trash2, Settings, Image as ImageIcon, Check, CheckCheck, X, Link as LinkIcon, Eye
} from 'lucide-react';

// Helper component to make links clickable
const LinkifyText = ({ text, isSender }) => {
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
              className={`${isSender ? 'text-indigo-100 underline hover:text-white' : 'text-indigo-600 underline hover:text-indigo-800'} transition-colors duration-200 break-all`}
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
  
  // Preview State
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);

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
      alert("Failed to send message.");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size limit is 10MB');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const cancelFileUpload = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmAndUploadFile = async () => {
    if (!selectedFile) return;

    try {
      const fileUrl = await uploadToCloudinary(selectedFile, 'auto');
      if (fileUrl) {
        await addDoc(collection(db, "messages"), {
          fileName: selectedFile.name,
          fileData: fileUrl,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
          sender: userType,
          timestamp: serverTimestamp(),
          type: 'file',
          status: 'sent'
        });
        cancelFileUpload();
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
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
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="bg-[#1e293b] p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-700">
          <div className="text-center mb-10">
            <div className="bg-indigo-500/10 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/20">
              <Phone size={48} className="text-indigo-400" />
            </div>
            <h1 className="text-4xl font-black text-white mb-3 tracking-tight">Family Hub</h1>
            <p className="text-slate-400 font-medium text-lg">Secure connection for the family</p>
          </div>
          
          <div className="space-y-8">
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              onKeyPress={(e) => e.key === 'Enter' && handleUnifiedLogin()}
              placeholder="Enter Access Code" 
              className="w-full px-8 py-5 bg-slate-900/50 border-2 border-slate-700 rounded-3xl text-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-center tracking-[0.5em] text-white placeholder:tracking-normal placeholder:text-slate-600"
            />
            <button 
              onClick={handleUnifiedLogin} 
              className="w-full bg-indigo-600 text-white py-5 rounded-3xl text-xl font-black hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20"
            >
              Enter Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER CHAT ---
  return (
    <div className="flex flex-col h-screen bg-[#0f172a] font-sans text-slate-200">
      {/* HEADER */}
      <div className="bg-[#1e293b]/80 backdrop-blur-xl border-b border-slate-800 px-6 py-5 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="bg-indigo-600 p-3.5 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
                <Phone size={26} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-emerald-500 border-3 border-[#1e293b] rounded-full"></div>
            </div>
            <div>
              <h2 className="font-black text-2xl text-white leading-tight tracking-tight">Family Chat</h2>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                  {userType === 'admin' ? 'Admin Access' : 'Family Member'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {userType === 'admin' && (
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={`p-3.5 rounded-2xl transition-all ${
                  showSettings ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Settings size={26} />
              </button>
            )}
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 bg-slate-800 text-slate-300 px-6 py-3.5 rounded-2xl font-black hover:bg-rose-500/10 hover:text-rose-400 transition-all active:scale-95 border border-slate-700"
            >
              <LogOut size={22} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </div>

      {/* SETTINGS */}
      {showSettings && userType === 'admin' && (
        <div className="bg-[#1e293b] border-b border-slate-800 p-8 absolute top-[89px] right-0 left-0 z-20 shadow-2xl animate-in slide-in-from-top duration-300">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="font-black text-2xl text-white tracking-tight">Message Expiry</h3>
                <p className="text-slate-400 font-medium">Choose when messages should be automatically deleted</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
                <X size={28} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {[1, 3, 7, 30].map(day => (
                <button 
                  key={day} 
                  onClick={() => updateAutoDeleteSettings(day)} 
                  className={`px-8 py-5 rounded-[2rem] text-xl font-black transition-all border-2 ${
                    autoDeleteDays === day 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-600/20' 
                      : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5'
                  }`}
                >
                  {day} Day{day > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#0f172a]">
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="animate-spin rounded-full h-14 w-14 border-4 border-slate-800 border-t-indigo-500"></div>
            <p className="text-slate-500 font-black text-xl tracking-tight">Syncing family messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-[#1e293b] p-16 rounded-[3rem] shadow-xl border border-slate-800 max-w-md">
              <div className="bg-indigo-500/10 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-indigo-500/20">
                <Send size={40} className="text-indigo-400" />
              </div>
              <h3 className="text-white font-black text-3xl mb-3 tracking-tight">Empty Chat</h3>
              <p className="text-slate-400 font-medium text-lg">Start the conversation with your family!</p>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex w-full ${msg.sender === userType ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-[85%] sm:max-w-[70%] px-7 py-5 rounded-[2.5rem] shadow-lg group transition-all hover:shadow-indigo-500/5 ${
                msg.sender === userType 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-[#1e293b] text-slate-200 border border-slate-800 rounded-tl-none'
              }`}>
                
                {/* TEXT MESSAGE */}
                {msg.type === 'text' && (
                  <div className="text-[18px] leading-relaxed font-medium">
                    <LinkifyText text={msg.text} isSender={msg.sender === userType} />
                  </div>
                )}
                
                {/* FILE MESSAGE */}
                {msg.type === 'file' && (
                  <div className="space-y-3">
                    {msg.fileType?.startsWith('image/') ? (
                      <div className="relative group/img overflow-hidden rounded-3xl border-2 border-white/10 shadow-2xl">
                        <img 
                          src={msg.fileData} 
                          alt="Shared" 
                          className="max-h-96 object-cover w-full cursor-pointer transition-transform duration-500 group-hover/img:scale-105" 
                          onClick={() => setPreviewImage(msg.fileData)} 
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button onClick={() => setPreviewImage(msg.fileData)} className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white hover:bg-white/30 transition-all">
                            <Eye size={28} />
                          </button>
                          <a href={msg.fileData} target="_blank" rel="noreferrer" className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white hover:bg-white/30 transition-all">
                            <Download size={28} />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center space-x-5 p-5 rounded-3xl ${msg.sender === userType ? 'bg-white/10' : 'bg-slate-900/50'}`}>
                        <div className="bg-indigo-500 p-4 rounded-2xl text-white shadow-lg">
                          <Paperclip size={24} />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-lg font-black truncate">{msg.fileName}</p>
                          <p className={`text-sm font-bold ${msg.sender === userType ? 'text-indigo-100' : 'text-slate-500'}`}>
                            {Math.round(msg.fileSize/1024)} KB
                          </p>
                        </div>
                        <a href={msg.fileData} target="_blank" rel="noreferrer" className={`p-4 rounded-2xl transition-all ${msg.sender === userType ? 'hover:bg-white/20 text-white' : 'hover:bg-indigo-500/10 text-indigo-400'}`}>
                          <Download size={28} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* VOICE MESSAGE */}
                {msg.type === 'voice' && (
                  <div className="space-y-4 min-w-[260px]">
                    <div className="flex items-center gap-4 text-sm font-black uppercase tracking-widest">
                      <div className={`p-2.5 rounded-full ${msg.sender === userType ? 'bg-white/20' : 'bg-indigo-500/10 text-indigo-400'}`}>
                        <Mic size={20} />
                      </div>
                      <span>Voice Note • {formatDuration(msg.duration)}</span>
                    </div>
                    <audio controls src={msg.audioData} className={`w-full h-11 rounded-xl ${msg.sender === userType ? 'brightness-150' : 'invert opacity-80'}`} preload="metadata" />
                  </div>
                )}
                
                {/* FOOTER */}
                <div className={`text-[12px] mt-3 flex justify-end items-center gap-3 font-black uppercase tracking-widest ${msg.sender === userType ? 'text-indigo-100/70' : 'text-slate-500'}`}>
                  <span>{formatTime(msg.timestamp)}</span>
                  {msg.sender === userType && (
                    <span>
                      {msg.status === 'read' ? <CheckCheck size={16} className="text-emerald-400" /> : <Check size={16} className="text-white/40" />}
                    </span>
                  )}
                  {userType === 'admin' && (
                    <button onClick={() => deleteMessage(msg.id)} className="ml-2 p-2 hover:bg-rose-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={16} className={msg.sender === userType ? 'text-white' : 'text-rose-500'} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* PHOTO PREVIEW BEFORE SENDING */}
      {selectedFile && (
        <div className="bg-[#1e293b] border-t border-slate-800 p-6 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center gap-6">
            {filePreviewUrl ? (
              <img src={filePreviewUrl} alt="Preview" className="w-32 h-32 object-cover rounded-3xl border-4 border-indigo-500/30 shadow-2xl" />
            ) : (
              <div className="w-32 h-32 bg-slate-900 rounded-3xl flex items-center justify-center border-4 border-slate-800">
                <Paperclip size={40} className="text-slate-600" />
              </div>
            )}
            <div className="flex-1 text-center sm:text-left">
              <h4 className="text-xl font-black text-white mb-1 truncate max-w-xs mx-auto sm:mx-0">{selectedFile.name}</h4>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">{Math.round(selectedFile.size/1024)} KB • Ready to send</p>
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <button onClick={cancelFileUpload} className="flex-1 sm:flex-none px-8 py-4 bg-slate-800 text-slate-300 rounded-2xl font-black hover:bg-slate-700 transition-all">Cancel</button>
              <button onClick={confirmAndUploadFile} className="flex-1 sm:flex-none px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20">Send File</button>
            </div>
          </div>
        </div>
      )}

      {/* INPUT AREA */}
      <div className="bg-[#1e293b] border-t border-slate-800 px-6 py-6 pb-10 sm:pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex gap-4 mb-5">
            <button 
              onClick={isCallActive ? stopCall : startCall} 
              className={`flex-1 flex items-center justify-center gap-4 px-8 py-5 rounded-[2rem] font-black text-xl transition-all shadow-2xl active:scale-[0.98] ${
                isCallActive 
                  ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/30' 
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-600/30 hover:shadow-indigo-600/40'
              }`}
            >
              {isCallActive ? (
                <>
                  <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                  <PhoneOff size={28} />
                  <span>Stop ({formatDuration(recordingTime)})</span>
                </>
              ) : (
                <>
                  <Mic size={28} />
                  <span>Record Voice Message</span>
                </>
              )}
            </button>
            
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,application/pdf,.doc,.docx" disabled={uploading} />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
              className="bg-slate-800 text-slate-300 p-5 rounded-[2rem] font-black hover:bg-slate-700 transition-all active:scale-95 border border-slate-700 shadow-lg flex items-center gap-3"
            >
              <ImageIcon size={30} />
              <span className="hidden md:inline text-lg">Photo</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-900/50 rounded-[2rem] flex items-center px-8 py-5 border-2 border-slate-800 focus-within:border-indigo-500 focus-within:bg-slate-900 transition-all">
              <input 
                type="text" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
                placeholder={uploading ? "Uploading..." : "Type a message..."} 
                disabled={uploading} 
                className="flex-1 focus:outline-none text-white bg-transparent text-xl font-medium placeholder:text-slate-600" 
                maxLength={1000}
              />
            </div>
            <button 
              onClick={handleSendMessage} 
              disabled={uploading || !newMessage.trim()} 
              className={`p-6 rounded-[2rem] transition-all shadow-2xl active:scale-90 ${
                newMessage.trim() && !uploading
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/30' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Send size={30} />
            </button>
          </div>
        </div>
      </div>

      {/* FULL IMAGE PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <button onClick={() => setPreviewImage(null)} className="absolute top-8 right-8 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
            <X size={32} />
          </button>
          <img src={previewImage} alt="Full Preview" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
          <div className="mt-8 flex gap-6">
            <a href={previewImage} download target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-xl hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/20">
              <Download size={28} />
              Save Photo
            </a>
          </div>
        </div>
      )}

      {/* UPLOADING OVERLAY */}
      {uploading && (
        <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-md z-[110] flex items-center justify-center">
          <div className="bg-[#1e293b] p-12 rounded-[3rem] shadow-2xl border border-slate-700 flex flex-col items-center gap-6">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500/20 border-t-indigo-500"></div>
            <span className="text-2xl font-black text-white tracking-tight">Sending to Family...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncryptedChat;
