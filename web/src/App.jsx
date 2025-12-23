// Simplified UI for elderly users - Enhanced version
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff, 
  Trash2, Settings, Image, Check, CheckCheck, X 
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md mx-4">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-600 p-6 rounded-full shadow-lg">
              <Phone size={48} color="white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-3">Welcome</h1>
          <p className="text-center text-gray-600 text-lg mb-8">Please enter your password</p>
          <div className="space-y-5">
            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUnifiedLogin()}
              className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
            <button 
              onClick={handleUnifiedLogin} 
              className="w-full bg-blue-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-blue-700 transition shadow-lg active:scale-95"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: MAIN APP ---
  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-gray-50 relative">
      
      {/* RECORDING OVERLAY - More descriptive for elderly users */}
      {isCallActive && (
        <div className="absolute inset-0 z-50 bg-gradient-to-b from-red-600 to-red-700 flex flex-col items-center justify-between py-12">
          <div className="text-center mt-20 px-4">
            <div className="w-40 h-40 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse border-4 border-white shadow-2xl">
              <Mic size={64} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Recording Voice Message</h2>
            <p className="text-white/90 text-xl mb-6">Speak clearly into your microphone</p>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-8 py-4 inline-block">
              <p className="text-white font-mono text-5xl font-bold">{formatDuration(recordingTime)}</p>
            </div>
          </div>
          <div className="mb-10 text-center">
            <button 
              onClick={endCall} 
              className="bg-white text-red-600 px-8 py-5 rounded-2xl hover:bg-gray-100 shadow-2xl transform hover:scale-105 transition font-bold text-xl flex items-center gap-3"
            >
              <PhoneOff size={32} />
              <span>Stop Recording</span>
            </button>
          </div>
        </div>
      )}

      {/* HEADER - Simplified with larger text */}
      <div className="bg-blue-600 text-white p-5 shadow-lg z-10">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-white text-blue-600 rounded-full flex items-center justify-center font-bold text-2xl shadow-md">
              {userType === 'admin' ? 'A' : 'U'}
            </div>
            <div>
              <h2 className="font-bold text-2xl">
                {userType === 'admin' ? 'Admin' : 'Chat'}
              </h2>
              <p className="text-base text-blue-100">
                Messages delete after {autoDeleteDays} days
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {userType === 'admin' && (
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className="flex items-center gap-2 px-4 py-3 hover:bg-blue-700 rounded-xl transition text-base font-medium"
                title="Settings"
              >
                <Settings size={24} />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 px-4 py-3 hover:bg-blue-700 rounded-xl transition text-base font-medium"
              title="Sign Out"
            >
              <LogOut size={24} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* SETTINGS - Larger, clearer */}
      {showSettings && userType === 'admin' && (
        <div className="bg-blue-700 text-white p-6 absolute top-24 right-0 left-0 z-20 shadow-2xl">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <p className="font-bold text-xl">
                Auto-Delete Settings
              </p>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-blue-600 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-blue-100 mb-4 text-base">Messages will automatically delete after:</p>
            <div className="flex flex-wrap gap-3">
              {[1, 3, 7, 30].map(day => (
                <button 
                  key={day} 
                  onClick={() => updateAutoDeleteSettings(day)} 
                  className={`px-6 py-3 rounded-xl text-lg font-bold transition ${
                    autoDeleteDays === day 
                      ? 'bg-white text-blue-700 shadow-lg' 
                      : 'bg-blue-800 text-white hover:bg-blue-600'
                  }`}
                >
                  {day} Day{day > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MESSAGES AREA - Larger text, better spacing */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-gray-50 to-gray-100">
        
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-600"></div>
            <p className="text-gray-600 text-xl font-medium">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white p-10 rounded-2xl shadow-lg max-w-md">
              <p className="text-gray-700 font-bold text-2xl mb-3">No messages yet</p>
              <p className="text-gray-500 text-lg">Start a conversation by typing below</p>
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
                className={`relative max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl shadow-md group ${
                  msg.sender === userType 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-white text-gray-800 border-2 border-gray-200'
                }`}
              >
                
                {/* TEXT MESSAGE - Larger font */}
                {msg.type === 'text' && (
                  <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
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
                        className="rounded-xl max-h-72 object-cover w-full cursor-pointer hover:opacity-95 border-2 border-white/20" 
                        onClick={() => window.open(msg.fileData, '_blank')} 
                      />
                    ) : (
                      <div className="flex items-center space-x-3 bg-black/5 p-3 rounded-xl mb-2">
                        <div className="bg-blue-500 p-3 rounded-full text-white">
                          <Paperclip size={20} />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-base font-semibold truncate">{msg.fileName}</p>
                          <p className="text-sm text-gray-500">
                            {Math.round(msg.fileSize/1024)} KB
                          </p>
                        </div>
                        <a 
                          href={msg.fileData} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-blue-600 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-lg"
                        >
                          <Download size={24} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* VOICE MESSAGE - Clearer label */}
                {msg.type === 'voice' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Mic size={18} />
                      <span>Voice Message</span>
                    </div>
                    <audio 
                      controls 
                      src={msg.audioData} 
                      className="w-full max-w-[300px]"
                      preload="metadata"
                      style={{ height: '40px' }}
                    />
                    <p className="text-xs opacity-75">
                      Duration: {formatDuration(msg.duration)}
                    </p>
                  </div>
                )}
                
                {/* MESSAGE FOOTER */}
                <div className={`text-xs mt-2 flex justify-end items-center gap-2 ${
                  msg.sender === userType ? 'text-white/80' : 'text-gray-500'
                }`}>
                  <span className="font-medium">{formatTime(msg.timestamp)}</span>
                  
                  {msg.sender === userType && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck size={16} className="text-white" />
                      ) : (
                        <Check size={16} className="text-white/60" />
                      )}
                    </span>
                  )}

                  {userType === 'admin' && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="p-1 hover:bg-red-500/20 rounded opacity-0 group-hover:opacity-100 transition"
                      title="Delete message"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA - Larger buttons with labels */}
      <div className="bg-white border-t-2 border-gray-200 px-5 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Top Row: Voice Record and Attach Photo */}
          <div className="flex gap-3 mb-3">
            <button 
              onClick={startCall} 
              disabled={isCallActive}
              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-xl font-bold text-base hover:from-red-600 hover:to-red-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              title="Record a voice message"
            >
              <Mic size={24} />
              <span>Record Voice Message</span>
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
              className="bg-blue-500 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-600 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              title="Attach a photo or file"
            >
              <Image size={24} />
              <span className="hidden sm:inline">Attach Photo</span>
            </button>
          </div>

          {/* Bottom Row: Text Input and Send */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-xl flex items-center px-5 py-3 border-2 border-gray-200">
              <input 
                type="text" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
                placeholder={uploading ? "Uploading..." : "Type your message..."} 
                disabled={uploading} 
                className="flex-1 focus:outline-none text-gray-800 bg-transparent text-base" 
                maxLength={1000}
              />
            </div>
            
            <button 
              onClick={handleSendMessage} 
              disabled={uploading || !newMessage.trim()} 
              className={`px-8 py-4 rounded-xl font-bold text-base transition shadow-lg flex items-center gap-2 ${
                newMessage.trim() && !uploading
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title="Send message"
            >
              <Send size={24} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* UPLOADING INDICATOR */}
      {uploading && (
        <div className="absolute bottom-32 right-6 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent"></div>
            <span className="text-lg font-medium">Uploading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncryptedChat;