// Modernized UI for webchat - Mobile Optimized & Generic Name (Circle Connect)
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
import { 
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { 
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff, 
  Trash2, Settings, Image as ImageIcon, Check, CheckCheck, X, Eye, MoreVertical, User
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
              className={`${isSender ? 'text-emerald-100 underline hover:text-white' : 'text-emerald-600 underline hover:text-emerald-800'} transition-colors duration-200 break-all`}
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
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">
          <div className="text-center mb-10">
            <div className="bg-[#25d366] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
              <Phone size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Circle Connect</h1>
            <p className="text-gray-500 font-medium">Secure and private messaging</p>
          </div>
          
          <div className="space-y-6">
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              onKeyPress={(e) => e.key === 'Enter' && handleUnifiedLogin()}
              placeholder="Enter Password" 
              className="w-full px-6 py-4 bg-gray-50 border border-gray-300 rounded-xl text-xl focus:outline-none focus:border-[#25d366] transition-all text-center"
            />
            <button 
              onClick={handleUnifiedLogin} 
              className="w-full bg-[#25d366] text-white py-4 rounded-xl text-xl font-bold hover:bg-[#128c7e] active:scale-[0.98] transition-all shadow-md"
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
    <div className="flex flex-col h-[100dvh] bg-[#efeae2] font-sans text-gray-800 overflow-hidden">
      {/* HEADER */}
      <div className="bg-[#f0f2f5] border-b border-gray-300 px-4 py-3 sticky top-0 z-30 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="bg-gray-300 w-10 h-10 rounded-full flex items-center justify-center text-gray-600 overflow-hidden">
              <User size={24} />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] border-2 border-[#f0f2f5] rounded-full"></div>
          </div>
          <div>
            <h2 className="font-bold text-base text-gray-900 leading-tight">Circle Connect</h2>
            <p className="text-xs text-gray-500">
              {userType === 'admin' ? 'Admin' : 'Member'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-gray-600">
          <button 
            onClick={startCall} 
            className="p-2.5 hover:bg-gray-200 rounded-full transition-all text-gray-600"
            title="Start Voice Note"
          >
            <Phone size={20} />
          </button>
          
          {userType === 'admin' && (
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
              <Settings size={20} />
            </button>
          )}
          <button onClick={handleLogout} className="p-2 hover:bg-gray-200 rounded-full transition-all" title="Logout">
            <LogOut size={20} />
          </button>
          <button className="p-2 hover:bg-gray-200 rounded-full transition-all">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* SETTINGS OVERLAY */}
      {showSettings && userType === 'admin' && (
        <div className="bg-white border-b border-gray-300 p-6 absolute top-[65px] right-0 left-0 z-20 shadow-lg animate-in slide-in-from-top duration-200">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Auto-Delete Messages</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="flex flex-wrap gap-3">
              {[1, 3, 7, 30].map(day => (
                <button 
                  key={day} 
                  onClick={() => updateAutoDeleteSettings(day)} 
                  className={`px-6 py-3 rounded-full text-sm font-bold transition-all border ${
                    autoDeleteDays === day 
                      ? 'bg-[#25d366] text-white border-[#25d366]' 
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
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
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
        {loadingMessages ? (
          <div className="flex justify-center items-center h-full">
            <div className="bg-white/80 px-4 py-2 rounded-full text-sm font-medium shadow-sm">Loading...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <div className="bg-[#dcf8c6] px-6 py-3 rounded-xl text-sm font-medium shadow-sm border border-gray-200">
              No messages yet. Say hi!
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex w-full ${msg.sender === userType ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-[85%] sm:max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm group ${
                msg.sender === userType 
                  ? 'bg-[#dcf8c6] rounded-tr-none' 
                  : 'bg-white rounded-tl-none'
              }`}>
                
                {/* TEXT MESSAGE */}
                {msg.type === 'text' && (
                  <div className="text-[14.5px] leading-normal pr-10">
                    <LinkifyText text={msg.text} isSender={msg.sender === userType} />
                  </div>
                )}
                
                {/* FILE MESSAGE */}
                {msg.type === 'file' && (
                  <div className="space-y-1 mb-1">
                    {msg.fileType?.startsWith('image/') ? (
                      <div className="relative rounded-md overflow-hidden border border-gray-100">
                        <img 
                          src={msg.fileData} 
                          alt="Shared" 
                          className="max-h-80 object-cover w-full cursor-pointer" 
                          onClick={() => setPreviewImage(msg.fileData)} 
                        />
                      </div>
                    ) : (
                      <div className={`flex items-center space-x-3 p-3 rounded-md ${msg.sender === userType ? 'bg-black/5' : 'bg-gray-50'}`}>
                        <div className="bg-[#25d366] p-2 rounded-md text-white">
                          <Paperclip size={18} />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-sm font-bold truncate">{msg.fileName}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{Math.round(msg.fileSize/1024)} KB</p>
                        </div>
                        <a href={msg.fileData} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-600">
                          <Download size={20} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* VOICE MESSAGE */}
                {msg.type === 'voice' && (
                  <div className="flex items-center gap-3 py-1 min-w-[200px]">
                    <div className="relative">
                      <div className="bg-gray-200 p-2 rounded-full text-gray-600">
                        <Mic size={20} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-[#25d366] w-4 h-4 rounded-full flex items-center justify-center border border-white">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                    </div>
                    <audio controls src={msg.audioData} className="h-8 w-full opacity-80" preload="metadata" />
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">{formatDuration(msg.duration)}</span>
                  </div>
                )}
                
                {/* FOOTER */}
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
                  {msg.sender === userType && (
                    <span>
                      {msg.status === 'read' ? <CheckCheck size={14} className="text-[#34b7f1]" /> : <Check size={14} className="text-gray-400" />}
                    </span>
                  )}
                  {userType === 'admin' && (
                    <button onClick={() => deleteMessage(msg.id)} className="ml-1 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={12} className="text-red-400" />
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
        <div className="bg-white border-t border-gray-200 p-4 animate-in slide-in-from-bottom duration-200 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            {filePreviewUrl ? (
              <img src={filePreviewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
            ) : (
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                <Paperclip size={24} className="text-gray-400" />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{Math.round(selectedFile.size/1024)} KB</p>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelFileUpload} className="p-2 text-gray-400 hover:text-gray-600"><X size={24} /></button>
              <button onClick={confirmAndUploadFile} className="bg-[#25d366] text-white p-3 rounded-full shadow-md hover:bg-[#128c7e] transition-all">
                <Send size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INPUT AREA */}
      <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,application/pdf,.doc,.docx" disabled={uploading} />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading}
            className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-all"
            title="Attach File"
          >
            <Paperclip size={24} />
          </button>
        </div>

        <div className="flex-1 bg-white rounded-full flex items-center px-4 py-2 shadow-sm">
          <input 
            type="text" 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
            placeholder="Type a message" 
            disabled={uploading} 
            className="flex-1 focus:outline-none text-gray-800 bg-transparent text-[15px]" 
          />
        </div>

        <div className="flex items-center">
          <button 
            onClick={handleSendMessage} 
            disabled={uploading || !newMessage.trim()} 
            className={`p-3 rounded-full shadow-md transition-all active:scale-90 ${
              newMessage.trim() && !uploading
                ? 'bg-[#25d366] text-white hover:bg-[#128c7e]' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* FULL-SCREEN CALL INTERFACE */}
      {isCallActive && (
        <div className="fixed inset-0 bg-[#075e54] z-[200] flex flex-col items-center justify-between p-10 animate-in fade-in duration-300">
          <div className="flex flex-col items-center mt-20">
            <div className="bg-white/10 p-10 rounded-full mb-6">
              <User size={80} className="text-white/80" />
            </div>
            <h2 className="text-white text-3xl font-bold mb-2">Circle Connect</h2>
            <p className="text-white/60 text-xl font-medium">Recording Voice Note...</p>
            <div className="mt-6 text-white text-4xl font-mono font-bold">
              {formatDuration(recordingTime)}
            </div>
          </div>
          
          <div className="flex flex-col items-center w-full mb-10">
            <div className="w-full max-w-xs bg-white/10 h-1.5 rounded-full overflow-hidden mb-12">
              <div className="bg-[#25d366] h-full animate-pulse w-full"></div>
            </div>
            
            <button 
              onClick={stopCall} 
              className="bg-red-500 text-white p-8 rounded-full shadow-2xl hover:bg-red-600 transition-all active:scale-90 flex items-center justify-center"
            >
              <PhoneOff size={40} />
            </button>
            <p className="text-white/80 mt-6 font-bold text-lg">End & Send</p>
          </div>
        </div>
      )}

      {/* FULL IMAGE PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute top-4 right-4 flex gap-4">
            <a href={previewImage} download target="_blank" rel="noreferrer" className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
              <Download size={24} />
            </a>
            <button onClick={() => setPreviewImage(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
              <X size={24} />
            </button>
          </div>
          <img src={previewImage} alt="Full Preview" className="max-w-full max-h-[85vh] object-contain" />
        </div>
      )}

      {/* UPLOADING OVERLAY */}
      {uploading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[110] flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-[#25d366]"></div>
            <span className="text-lg font-bold text-gray-800">Sending...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncryptedChat;
