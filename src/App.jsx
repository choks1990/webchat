import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase'; // Import the firebase config we just made
import { collection, addDoc, query, orderBy, onSnapshot, limit, serverTimestamp } from 'firebase/firestore';
import { Send, Phone, LogOut, Settings, Paperclip, Mic, X, Download, StopCircle } from 'lucide-react';

const EncryptedChat = () => {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showVoicemail, setShowVoicemail] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false); // New state for loading spinner

  // --- REFS ---
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  // --- CONSTANTS ---
  const ADMIN_PASSWORD = 'admin123';
  const USER_PASSWORD = 'user123';

  // --- 1. REAL-TIME DATABASE LISTENER ---
  useEffect(() => {
    if (isLoggedIn) {
      // Create a query to get the last 100 messages ordered by time
      const q = query(
        collection(db, "messages"),
        orderBy("timestamp", "asc"),
        limit(100)
      );

      // This listener runs automatically whenever the database changes
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
          const data = doc.data();
          // Handle Firestore timestamps vs local timestamps
          const time = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          return {
            id: doc.id,
            ...data,
            timestamp: time
          };
        });
        setMessages(msgs);
      });

      return () => unsubscribe();
    }
  }, [isLoggedIn]);

  // Scroll to bottom on new message
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- 2. CLOUDINARY UPLOAD HELPER ---
  const uploadToCloudinary = async (fileOrBlob, resourceType = 'auto') => {
    // ---------------------------------------------------------
    // REPLACE THESE TWO VALUES WITH YOUR CLOUDINARY DETAILS
    const cloudName = "dujpj0445"; 
    const uploadPreset = "chat_app_upload"; 
    // ---------------------------------------------------------

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
      alert("Upload failed. Check your Cloudinary settings.");
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

  // --- SEND MESSAGES ---
  const handleSendMessage = async () => {
    if (newMessage.trim()) {
      try {
        await addDoc(collection(db, "messages"), {
          text: newMessage,
          sender: userType,
          timestamp: serverTimestamp(), // Use server time for accuracy
          type: 'text'
        });
        setNewMessage('');
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
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

  // --- RECORDING ---
  const startRecording = async () => {
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
        
        // Convert Blob to File for Cloudinary
        const audioFile = new File([audioBlob], "voice_note.webm", { type: "audio/webm" });
        
        const audioUrl = await uploadToCloudinary(audioFile, 'video'); // Cloudinary treats audio as 'video' resource type often
        
        if (audioUrl) {
          await addDoc(collection(db, "messages"), {
            audioData: audioUrl,
            duration: recordingTime,
            sender: userType,
            timestamp: serverTimestamp(),
            type: 'voice'
          });
        }
        
        stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingIntervalRef.current);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // --- UTILS ---
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- UI RENDERING ---
  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-teal-500 to-emerald-600">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md mx-4">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Cloud Chat</h1>
            <p className="text-sm text-gray-500 mt-2">Access from anywhere</p>
          </div>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={() => handleLogin('admin')} className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition font-semibold">
              Login as Admin
            </button>
            <button onClick={() => handleLogin('user')} className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition font-semibold">
              Login as User
            </button>
            <div className="text-xs text-gray-500 text-center mt-4 p-3 bg-gray-50 rounded-lg">
              <p>Admin: <span className="font-mono">admin123</span> | User: <span className="font-mono">user123</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-gray-100">
      {/* Header */}
      <div className="bg-teal-600 text-white p-3 md:p-4 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-teal-700 rounded-full flex items-center justify-center">
            <span className="font-bold">{userType === 'admin' ? 'A' : 'U'}</span>
          </div>
          <div>
            <h2 className="font-bold">{userType === 'admin' ? 'Admin' : 'User'}</h2>
            <p className="text-xs text-teal-100">{uploading ? 'Uploading...' : 'Online'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleLogout} className="p-2 hover:bg-teal-700 rounded-full"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === userType ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg ${msg.sender === userType ? 'bg-teal-500 text-white' : 'bg-white text-gray-800 shadow'}`}>
              
              {msg.type === 'text' && <p>{msg.text}</p>}
              
              {msg.type === 'file' && (
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Paperclip size={16} />
                    <p className="text-sm font-semibold truncate max-w-[150px]">{msg.fileName}</p>
                  </div>
                  <a href={msg.fileData} target="_blank" rel="noreferrer" className="flex items-center text-sm font-semibold underline">
                    <Download size={16} className="mr-1" /> Download
                  </a>
                </div>
              )}

              {msg.type === 'voice' && (
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Mic size={16} />
                    <p className="text-sm font-semibold">Voice Message</p>
                  </div>
                  <audio controls className="w-full min-w-[200px]">
                    <source src={msg.audioData} type="audio/webm" />
                  </audio>
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
      <div className="bg-white border-t border-gray-200 p-2 md:p-4">
        {isRecording && (
          <div className="mb-2 p-2 bg-red-50 rounded-lg flex items-center justify-between">
            <span className="text-red-600 font-bold animate-pulse">Recording: {formatDuration(recordingTime)}</span>
            <button onClick={stopRecording} className="bg-red-600 text-white px-3 py-1 rounded-full text-sm">Stop</button>
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" disabled={uploading}>
            <Paperclip size={20} />
          </button>
          
          <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`} disabled={uploading}>
            <Mic size={20} />
          </button>
          
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={uploading ? "Uploading file..." : "Type a message..."}
            disabled={isRecording || uploading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          
          <button onClick={handleSendMessage} disabled={isRecording || uploading || !newMessage.trim()} className="p-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50">
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EncryptedChat;