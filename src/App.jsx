import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, limit, serverTimestamp } from 'firebase/firestore';
import { Send, Phone, LogOut, Paperclip, Mic, X, Download, PhoneOff } from 'lucide-react'; // Added PhoneOff

const EncryptedChat = () => {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // NEW: State for the call screen
  const [isCallActive, setIsCallActive] = useState(false);
  
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

  // --- 1. REAL-TIME DATABASE LISTENER ---
  useEffect(() => {
    if (isLoggedIn) {
      const q = query(
        collection(db, "messages"),
        orderBy("timestamp", "asc"),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
          const data = doc.data();
          const time = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          return { id: doc.id, ...data, timestamp: time };
        });
        setMessages(msgs);
      });
      return () => unsubscribe();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- 2. CLOUDINARY UPLOAD HELPER ---
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
      if (data.error) throw new Error(data.error.message);
      return data.secure_url;
    } catch (error) {
      console.error("Upload failed:", error);
      setUploading(false);
      return null;
    }
  };

  // --- AUTHENTICATION ---
  const handleLogin = (type) => {
    if ((type === 'admin' && password === ADMIN_PASSWORD) ||
        (type === 'user' && password === USER_PASSWORD)) {
      setIsLoggedIn(true);
      setUserType(type);
      setPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserType(null);
    setPassword('');
    setMessages([]);
  };

  // --- MESSAGES ---
  const handleSendMessage = async () => {
    if (newMessage.trim()) {
      await addDoc(collection(db, "messages"), {
        text: newMessage,
        sender: userType,
        timestamp: serverTimestamp(),
        type: 'text'
      });
      setNewMessage('');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
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
        type: 'file'
      });
    }
    e.target.value = '';
  };

  // --- NEW CALL LOGIC ---
  const startCall = async () => {
    try {
      // 1. Get Permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 2. Prepare Recorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      setRecordingTime(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 3. Define what happens when we hang up
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "voice_note.webm", { type: "audio/webm" });
        
        // Upload and Send
        const audioUrl = await uploadToCloudinary(audioFile, 'video');
        if (audioUrl) {
          await addDoc(collection(db, "messages"), {
            audioData: audioUrl,
            duration: recordingTime, // Uses the final time from state
            sender: userType,
            timestamp: serverTimestamp(),
            type: 'voice'
          });
        }
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingIntervalRef.current);
      };

      // 4. Start Everything
      mediaRecorderRef.current.start();
      setIsCallActive(true); // Show Call Screen
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      alert('Microphone access denied.');
      console.error(error);
    }
  };

  const endCall = () => {
    if (mediaRecorderRef.current && isCallActive) {
      mediaRecorderRef.current.stop(); // This triggers onstop logic above
      setIsCallActive(false); // Hide Call Screen
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

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-teal-500 to-emerald-600">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md mx-4">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">Cloud Chat</h1>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
            <button onClick={() => handleLogin('admin')} className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold">Login as Admin</button>
            <button onClick={() => handleLogin('user')} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold">Login as User</button>
            <p className="text-center text-gray-500 text-xs">Admin: admin123 | User: user123</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-gray-100 relative">
      
      {/* --- NEW: CALL OVERLAY SCREEN --- */}
      {isCallActive && (
        <div className="absolute inset-0 z-50 bg-gray-900 text-white flex flex-col items-center justify-between py-12">
          {/* Top Info */}
          <div className="text-center mt-10">
            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-4xl font-bold">{userType === 'admin' ? 'U' : 'A'}</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Talking to {userType === 'admin' ? 'User' : 'Admin'}...</h2>
            <p className="text-teal-400 font-mono text-xl">{formatDuration(recordingTime)}</p>
          </div>

          {/* Bottom Actions */}
          <div className="mb-10 w-full flex justify-center">
            <button 
              onClick={endCall}
              className="bg-red-600 p-6 rounded-full hover:bg-red-700 transition transform hover:scale-110 shadow-lg"
            >
              <PhoneOff size={40} fill="white" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-teal-600 text-white p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-teal-700 rounded-full flex items-center justify-center font-bold">
            {userType === 'admin' ? 'A' : 'U'}
          </div>
          <div>
            <h2 className="font-bold">{userType === 'admin' ? 'Admin' : 'User'}</h2>
            <p className="text-xs text-teal-100">{uploading ? 'Uploading...' : 'Online'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-teal-700 rounded-full"><LogOut size={20} /></button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === userType ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-2 rounded-lg ${msg.sender === userType ? 'bg-teal-500 text-white' : 'bg-white text-gray-800 shadow'}`}>
              
              {msg.type === 'text' && <p>{msg.text}</p>}
              
              {msg.type === 'file' && (
                <div className="flex items-center space-x-2">
                  <Paperclip size={16} />
                  <a href={msg.fileData} target="_blank" rel="noreferrer" className="underline">{msg.fileName}</a>
                </div>
              )}

              {msg.type === 'voice' && (
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Mic size={16} />
                    <p className="text-sm font-semibold">Voice Message</p>
                  </div>
                  <audio controls src={msg.audioData} className="w-full min-w-[200px]" />
                  <p className="text-xs mt-1 opacity-70">Duration: {formatDuration(msg.duration)}</p>
                </div>
              )}
              
              <p className={`text-xs mt-1 text-right ${msg.sender === userType ? 'text-teal-100' : 'text-gray-400'}`}>
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4 flex items-center space-x-2">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full">
          <Paperclip size={24} />
        </button>
        
        {/* NEW CALL BUTTON (Replaces Mic) */}
        <button 
          onClick={startCall} 
          className="p-2 text-teal-600 hover:bg-teal-50 rounded-full transition"
          title="Start Call"
        >
          <Phone size={24} />
        </button>
        
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type a message..."
          disabled={uploading}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        
        <button onClick={handleSendMessage} disabled={uploading || !newMessage.trim()} className="p-2 bg-teal-600 text-white rounded-full hover:bg-teal-700">
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

export default EncryptedChat;