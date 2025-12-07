// web/src/App.jsx - OPTIMIZED VERSION
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
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

      // A. Load Settings (non-blocking, parallel)
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
      fetchSettings(); // Don't await - run in parallel

      // B. OPTIMIZED: Use desc order with limit (much faster than limitToLast)
      // This queries the NEWEST messages first, which is indexed by default
      const q = query(
        collection(db, "messages"), 
        orderBy("timestamp", "desc"), // DESC is faster - uses default index
        limit(25)
      );
      
      unsubscribe = onSnapshot(q, 
        async (snapshot) => {
          // Reverse the array since we queried desc but want to display asc
          const msgs = snapshot.docs.reverse().map(docSnap => {
            const data = docSnap.data();
            
            // Robust timestamp handling
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
          
          // OPTIMIZED: Mark as read in background (non-blocking)
          const updatePromises = snapshot.docs
            .filter(docSnap => {
              const msg = docSnap.data();
              return msg.sender && msg.sender !== userType && msg.status !== 'read';
            })
            .map(docSnap => 
              updateDoc(doc(db, "messages", docSnap.id), { status: 'read' })
            );
          
          if (updatePromises.length > 0) {
            // Fire and forget - don't block UI
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

      // C. OPTIMIZED: Run cleanup in background after 2 seconds
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
      // Run cleanup in background
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
      
      // Use Firestore Timestamp for proper comparison
      const cutoffTimestamp = cutoffDate.getTime();

      const q = query(
        collection(db, "messages"),
        where("timestamp", "<", cutoffTimestamp),
        orderBy("timestamp", "asc"),
        limit(100) // Batch delete in chunks
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
        const audioFile = new File([audioBlob], "voice_note.webm", { type: "audio/webm" });
        
        const audioUrl = await uploadToCloudinary(audioFile, 'video');
        
        if (audioUrl) {
          try {
            await addDoc(collection(db, "messages"), {
              audioData: audioUrl,
              duration: recordingTime,
              sender: userType,
              timestamp: serverTimestamp(),
              type: 'voice',
              status: 'sent'
            });
          } catch (error) {
            console.error("Error saving voice message:", error);
            alert("Failed to save voice message");
          }
        }
        
        stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingIntervalRef.current);
        setRecordingTime(0);
      };

      mediaRecorderRef.current.start();
      setIsCallActive(true);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Microphone error:", error);
      alert('Microphone access denied or not available.');
    }
  };

  const endCall = () => {
    if (mediaRecorderRef.current && isCallActive) {
      try {
        mediaRecorderRef.current.stop();
        setIsCallActive(false);
      } catch (error) {
        console.error("Error ending call:", error);
      }
    }
  };

  // --- UTILS ---
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
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
              autoFocus
            />
            <button 
              onClick={handleUnifiedLogin} 
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 transition shadow-lg"
            >
              Login
            </button>
            <div className="text-center text-xs text-gray-500 mt-4">
              <p>Welcome</p>
            </div>
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
              <span className="text-5xl font-bold text-white">
                {userType === 'admin' ? 'U' : 'A'}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Voice Call Active</h2>
            <p className="text-teal-400 font-mono text-3xl">{formatDuration(recordingTime)}</p>
          </div>
          <div className="mb-10">
            <button 
              onClick={endCall} 
              className="bg-red-600 p-6 rounded-full hover:bg-red-700 shadow-xl transform hover:scale-105 transition"
            >
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
            <h2 className="font-bold text-lg">
              {userType === 'admin' ? 'Admin Control' : 'Secure Chat'}
            </h2>
            <p className="text-xs text-teal-100 opacity-90">
              Disappearing: {autoDeleteDays} days
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          {userType === 'admin' && (
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="p-2 hover:bg-teal-700 rounded-full transition"
              title="Settings"
            >
              <Settings size={22} />
            </button>
          )}
          <button 
            onClick={startCall} 
            className="p-2 hover:bg-teal-700 rounded-full transition"
            title="Start voice call"
            disabled={isCallActive}
          >
            <Phone size={22} />
          </button>
          <button 
            onClick={handleLogout} 
            className="p-2 hover:bg-teal-700 rounded-full transition"
            title="Logout"
          >
            <LogOut size={22} />
          </button>
        </div>
      </div>

      {/* SETTINGS (Admin Only) */}
      {showSettings && userType === 'admin' && (
        <div className="bg-teal-700 text-white p-4 absolute top-16 right-0 left-0 z-20 shadow-xl border-b border-teal-500">
          <p className="font-semibold mb-3 text-sm uppercase tracking-wide">
            Auto-Delete Messages After:
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 7, 30].map(day => (
              <button 
                key={day} 
                onClick={() => updateAutoDeleteSettings(day)} 
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  autoDeleteDays === day 
                    ? 'bg-white text-teal-700' 
                    : 'bg-teal-800 text-teal-100 hover:bg-teal-600'
                }`}
              >
                {day} Day{day > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ded8]">
        
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-300 border-t-teal-600"></div>
            <p className="text-gray-500 text-sm font-medium animate-pulse">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white/50 p-6 rounded-xl backdrop-blur-sm">
              <p className="text-gray-600 font-medium">No messages yet.</p>
              <p className="text-gray-400 text-sm mt-1">Send a message to start the chat.</p>
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
                className={`relative max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-lg shadow-sm group ${
                  msg.sender === userType 
                    ? 'bg-[#d9fdd3] text-gray-800 rounded-tr-none' 
                    : 'bg-white text-gray-800 rounded-tl-none'
                }`}
              >
                
                {/* TEXT MESSAGE */}
                {msg.type === 'text' && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                )}
                
                {/* FILE MESSAGE */}
                {msg.type === 'file' && (
                  <div>
                    {msg.fileType?.startsWith('image/') ? (
                      <img 
                        src={msg.fileData} 
                        alt="Shared" 
                        className="rounded-lg max-h-60 object-cover w-full cursor-pointer hover:opacity-95" 
                        onClick={() => window.open(msg.fileData, '_blank')} 
                      />
                    ) : (
                      <div className="flex items-center space-x-3 bg-black/5 p-2 rounded-md mb-1">
                        <div className="bg-teal-500 p-2 rounded-full text-white">
                          <Paperclip size={16} />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-sm font-semibold truncate">{msg.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {Math.round(msg.fileSize/1024)} KB
                          </p>
                        </div>
                        <a 
                          href={msg.fileData} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-teal-600 hover:text-teal-700"
                        >
                          <Download size={18} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* VOICE MESSAGE */}
                {msg.type === 'voice' && (
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="text-gray-500"><Mic size={20} /></div>
                    <div className="flex-1">
                      <audio 
                        controls 
                        src={msg.audioData} 
                        className="h-8 w-full max-w-[200px]"
                        preload="metadata"
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-mono">
                      {formatDuration(msg.duration)}
                    </span>
                  </div>
                )}
                
                {/* MESSAGE FOOTER (Time + Status) */}
                <div className="text-[10px] text-gray-500 text-right mt-1 flex justify-end items-center gap-1">
                  {formatTime(msg.timestamp)}
                  
                  {/* READ RECEIPTS (for sender only) */}
                  {msg.sender === userType && (
                    <span className="ml-1">
                      {msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-blue-500" />
                      ) : (
                        <Check size={14} className="text-gray-500" />
                      )}
                    </span>
                  )}

                  {/* DELETE BUTTON (admin only) */}
                  {userType === 'admin' && (
                    <Trash2 
                      size={12} 
                      className="cursor-pointer text-red-400 hover:text-red-600 ml-2 opacity-0 group-hover:opacity-100 transition" 
                      onClick={() => deleteMessage(msg.id)}
                      title="Delete message"
                    />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="bg-[#f0f2f5] px-4 py-2 flex items-center space-x-2">
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
          className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition disabled:opacity-50"
          disabled={uploading}
          title="Attach file"
        >
          <ImageIcon size={24} />
        </button>
        
        <div className="flex-1 bg-white rounded-full flex items-center px-4 py-2 shadow-sm border border-gray-100">
          <input 
            type="text" 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
            placeholder={uploading ? "Uploading..." : "Message"} 
            disabled={uploading} 
            className="flex-1 focus:outline-none text-gray-700 bg-transparent" 
            maxLength={1000}
          />
        </div>
        
        <button 
          onClick={handleSendMessage} 
          disabled={uploading || !newMessage.trim()} 
          className={`p-3 rounded-full shadow-md transition ${
            newMessage.trim() && !uploading
              ? 'bg-teal-600 text-white hover:bg-teal-700' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <Send size={20} />
        </button>
      </div>

      {/* UPLOADING INDICATOR */}
      {uploading && (
        <div className="absolute bottom-20 right-4 bg-teal-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span className="text-sm">Uploading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncryptedChat;