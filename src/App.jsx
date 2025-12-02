import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff, 
  Trash2, Settings, Image as ImageIcon, Check, CheckCheck 
} from 'lucide-react';

const EncryptedChat = () => {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
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

  const ADMIN_PASSWORD = 'admin123';
  const USER_PASSWORD = 'user123';

  // --- 1. INITIALIZATION & CLEANUP ---
  useEffect(() => {
    if (isLoggedIn) {
      // A. Load Settings
      const fetchSettings = async () => {
        const docRef = doc(db, "settings", "config");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAutoDeleteDays(docSnap.data().autoDeleteDays || 7);
        } else {
          await setDoc(doc(db, "settings", "config"), { autoDeleteDays: 7 });
        }
      };
      fetchSettings();

      // B. Load Messages & Mark as Read
      const q = query(collection(db, "messages"), orderBy("timestamp", "asc"), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
          const data = doc.data();
          const time = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          return { id: doc.id, ...data, timestamp: time };
        });
        setMessages(msgs);
        
        // MARK MESSAGES AS READ
        // If I am 'admin', I should mark all 'user' messages as read
        // If I am 'user', I should mark all 'admin' messages as read
        snapshot.docs.forEach(async (docSnap) => {
          const msg = docSnap.data();
          // Only mark if it's NOT my message and NOT already read
          if (msg.sender !== userType && msg.status !== 'read') {
             await updateDoc(doc(db, "messages", docSnap.id), { status: 'read' });
          }
        });
      });

      // C. Cleanup
      checkAndCleanOldMessages();

      return () => unsubscribe();
    }
  }, [isLoggedIn, userType]); // Re-run when userType is set

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- 2. LOGIC: AUTO-DELETE ---
  const updateAutoDeleteSettings = async (days) => {
    setAutoDeleteDays(days);
    await setDoc(doc(db, "settings", "config"), { autoDeleteDays: days });
    setShowSettings(false);
    checkAndCleanOldMessages(days);
  };

  const checkAndCleanOldMessages = async (daysOverride) => {
    const days = daysOverride || autoDeleteDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const q = query(collection(db, "messages"));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(async (docSnap) => {
      const data = docSnap.data();
      if (data.timestamp && data.timestamp.toMillis) {
        if (data.timestamp.toMillis() < cutoffDate.getTime()) {
           await deleteDoc(doc(db, "messages", docSnap.id));
        }
      }
    });
  };

  // --- 3. LOGIC: MANUAL DELETE ---
  const deleteMessage = async (msgId) => {
    if (window.confirm("Delete this message permanently?")) {
      await deleteDoc(doc(db, "messages", msgId));
    }
  };

  // --- 4. CLOUDINARY UPLOAD ---
  const uploadToCloudinary = async (fileOrBlob, resourceType = 'auto') => {
    const cloudName = "dujpj0445"; // <--- MAKE SURE THIS IS STILL FILLED
    const uploadPreset = "chat_app_upload";  // <--- MAKE SURE THIS IS STILL FILLED

    const formData = new FormData();
    formData.append("file", fileOrBlob);
    formData.append("upload_preset", uploadPreset);

    try {
      setUploading(true);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, 
        { method: "POST", body: formData }
      );
      const data = await response.json();
      setUploading(false);
      return data.secure_url;
    } catch (error) {
      console.error("Upload failed:", error);
      setUploading(false);
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

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserType(null);
    setPassword('');
    setMessages([]);
  };

  // --- 6. SENDING MESSAGES ---
  const handleSendMessage = async () => {
    const textToSend = newMessage.trim();
    if (textToSend) {
      setNewMessage(''); // Optimistic update
      try {
        await addDoc(collection(db, "messages"), {
          text: textToSend,
          sender: userType,
          timestamp: serverTimestamp(),
          type: 'text',
          status: 'sent' // Default status
        });
      } catch (error) {
        console.error("Error sending:", error);
        setNewMessage(textToSend); // Revert if failed
        alert("Failed to send");
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size limit is 10MB');
      return;
    }

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
    e.target.value = '';
  };

  // --- 7. CALL LOGIC ---
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      setRecordingTime(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "voice_note.webm", { type: "audio/webm" });
        const audioUrl = await uploadToCloudinary(audioFile, 'video');
        
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
        clearInterval(recordingIntervalRef.current);
      };

      mediaRecorderRef.current.start();
      setIsCallActive(true);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (error) {
      alert('Microphone access denied.');
    }
  };

  const endCall = () => {
    if (mediaRecorderRef.current && isCallActive) {
      mediaRecorderRef.current.stop();
      setIsCallActive(false);
    }
  };

  // --- UTILS ---
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

  // --- RENDER: LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-800 to-gray-900">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm mx-4">
          <div className="flex justify-center mb-6">
            <div className="bg-teal-600 p-4 rounded-full">
              <Phone size={32} color="white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Secure Login</h1>
          <p className="text-center text-gray-500 text-sm mb-6">Enter your access key to continue</p>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUnifiedLogin()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button onClick={handleUnifiedLogin} className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 transition shadow-lg">Login</button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: MAIN APP ---
  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-gray-100 relative">
      
      {/* CALL OVERLAY */}
      {isCallActive && (
        <div className="absolute inset-0 z-50 bg-gray-900 flex flex-col items-center justify-between py-12">
          <div className="text-center mt-20">
            <div className="w-32 h-32 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse border-4 border-teal-500">
              <span className="text-5xl font-bold text-white">{userType === 'admin' ? 'U' : 'A'}</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Voice Call Active</h2>
            <p className="text-teal-400 font-mono text-3xl">{formatDuration(recordingTime)}</p>
          </div>
          <div className="mb-10">
            <button onClick={endCall} className="bg-red-600 p-6 rounded-full hover:bg-red-700 shadow-xl transform hover:scale-105 transition">
              <PhoneOff size={40} fill="white" />
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-teal-600 text-white p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white text-teal-600 rounded-full flex items-center justify-center font-bold shadow-sm">
            {userType === 'admin' ? 'A' : 'U'}
          </div>
          <div>
            <h2 className="font-bold text-lg">{userType === 'admin' ? 'Admin Control' : 'Secure Chat'}</h2>
            <p className="text-xs text-teal-100 opacity-90">Disappearing: {autoDeleteDays} days</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          {userType === 'admin' && (
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-teal-700 rounded-full transition">
              <Settings size={22} />
            </button>
          )}
          <button onClick={startCall} className="p-2 hover:bg-teal-700 rounded-full transition"><Phone size={22} /></button>
          <button onClick={handleLogout} className="p-2 hover:bg-teal-700 rounded-full transition"><LogOut size={22} /></button>
        </div>
      </div>

      {/* SETTINGS (Admin Only) */}
      {showSettings && userType === 'admin' && (
        <div className="bg-teal-700 text-white p-4 absolute top-16 right-0 left-0 z-20 shadow-xl border-b border-teal-500">
          <p className="font-semibold mb-3 text-sm uppercase tracking-wide">Auto-Delete Messages After:</p>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 7, 30].map(day => (
              <button key={day} onClick={() => updateAutoDeleteSettings(day)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${autoDeleteDays === day ? 'bg-white text-teal-700' : 'bg-teal-800 text-teal-100 hover:bg-teal-600'}`}>
                {day} Days
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ded8]">
        {messages.map(msg => (
          <div key={msg.id} className={`flex w-full ${msg.sender === userType ? 'justify-end' : 'justify-start'}`}>
            <div className={`relative max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-lg shadow-sm ${msg.sender === userType ? 'bg-[#d9fdd3] text-gray-800 rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}`}>
              
              {userType === 'admin' && (
                <button onClick={() => deleteMessage(msg.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition" title="Delete Message"><Trash2 size={12} /></button>
              )}

              {msg.type === 'text' && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
              
              {msg.type === 'file' && (
                <div>
                  {msg.fileType?.startsWith('image/') ? (
                    <img src={msg.fileData} alt="Shared photo" className="rounded-lg max-h-60 object-cover w-full cursor-pointer hover:opacity-95" onClick={() => window.open(msg.fileData, '_blank')} />
                  ) : (
                    <div className="flex items-center space-x-3 bg-black/5 p-2 rounded-md mb-1">
                      <div className="bg-teal-500 p-2 rounded-full text-white"><Paperclip size={16} /></div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold truncate">{msg.fileName}</p>
                        <p className="text-xs text-gray-500">{Math.round(msg.fileSize/1024)} KB</p>
                      </div>
                      <a href={msg.fileData} target="_blank" rel="noreferrer" className="ml-auto text-teal-600"><Download size={18} /></a>
                    </div>
                  )}
                </div>
              )}

              {msg.type === 'voice' && (
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="text-gray-500"><Mic size={20} /></div>
                  <div className="flex-1"><audio controls src={msg.audioData} className="h-8 w-full max-w-[200px]" /></div>
                  <span className="text-xs text-gray-500 font-mono">{formatDuration(msg.duration)}</span>
                </div>
              )}
              
              <div className="text-[10px] text-gray-500 text-right mt-1 flex justify-end items-center gap-1">
                {formatTime(msg.timestamp)}
                
                {/* --- TICKS LOGIC --- */}
                {msg.sender === userType && (
                  <span className="ml-1">
                    {msg.status === 'read' ? (
                      <CheckCheck size={14} className="text-blue-500" /> // Blue Ticks
                    ) : (
                      <Check size={14} className="text-gray-500" /> // One Grey Tick (Sent)
                    )}
                  </span>
                )}

                {userType === 'admin' && (
                    <Trash2 size={12} className="cursor-pointer text-red-400 hover:text-red-600 ml-2" onClick={() => deleteMessage(msg.id)} />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="bg-[#f0f2f5] px-4 py-2 flex items-center space-x-2">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" />
        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition"><ImageIcon size={24} /></button>
        <div className="flex-1 bg-white rounded-full flex items-center px-4 py-2 shadow-sm border border-gray-100">
          <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Message" disabled={uploading} className="flex-1 focus:outline-none text-gray-700 bg-transparent" />
        </div>
        <button onClick={handleSendMessage} disabled={uploading || !newMessage.trim()} className={`p-3 rounded-full shadow-md transition ${newMessage.trim() ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-gray-300 text-gray-500'}`}><Send size={20} /></button>
      </div>
    </div>
  );
};

export default EncryptedChat;