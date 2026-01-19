// Modernized UI for webchat - Mobile Input Fix (Circle Connect)
import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase/init';
import {
  collection, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc,
  query, orderBy, onSnapshot, limit, serverTimestamp, getDocs, where, Timestamp
} from 'firebase/firestore';
import {
  Send, Phone, LogOut, Paperclip, Mic, Download, PhoneOff,
  Trash2, Settings, Image as ImageIcon, Check, CheckCheck, X, Eye, User
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
  const containerRef = useRef(null);

  // --- EFFECTS ---
  useEffect(() => {
    if (isLoggedIn && userType) {
      setLoadingMessages(true);
      const q = query(
        collection(db, 'messages'),
        orderBy('timestamp', 'asc'),
        limit(100)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(msgs);
        setLoadingMessages(false);
        scrollToBottom();
      });

      return () => unsubscribe();
    }
  }, [isLoggedIn, userType]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mobile Keyboard Fix: Adjust height when keyboard appears
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        if (containerRef.current) {
          containerRef.current.style.height = `${viewportHeight}px`;
        }
        // Ensure we scroll to bottom when keyboard opens
        setTimeout(scrollToBottom, 100);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- HANDLERS ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === '123456') {
      setIsLoggedIn(true);
    } else {
      alert('Invalid Password');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;

    const messageData = {
      text: newMessage,
      sender: userType,
      timestamp: serverTimestamp(),
      type: selectedFile ? 'file' : 'text',
      fileName: selectedFile ? selectedFile.name : null,
      fileType: selectedFile ? selectedFile.type : null,
      fileData: filePreviewUrl // In a real app, upload to Storage
    };

    try {
      setNewMessage('');
      setSelectedFile(null);
      setFilePreviewUrl(null);
      await addDoc(collection(db, 'messages'), messageData);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteMessage = async (id) => {
    if (window.confirm('Delete this message?')) {
      await deleteDoc(doc(db, 'messages', id));
    }
  };

  const clearAllMessages = async () => {
    if (window.confirm('Clear all chat history?')) {
      const q = query(collection(db, 'messages'));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(async (d) => {
        await deleteDoc(doc(db, 'messages', d.id));
      });
    }
  };

  // --- RENDER HELPERS ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
              <CheckCheck className="text-white w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Circle Connect</h1>
            <p className="text-slate-500">Secure Enterprise Messaging</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Identity</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setUserType('A')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    userType === 'A' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-emerald-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${userType === 'A' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <User size={20} />
                  </div>
                  <span className="font-medium">User A</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserType('B')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    userType === 'B' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-emerald-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${userType === 'B' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <User size={20} />
                  </div>
                  <span className="font-medium">User B</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Access Key</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter 6-digit key"
              />
            </div>

            <button
              type="submit"
              disabled={!userType || !password}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-100 transition-all active:scale-[0.98]"
            >
              Secure Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-slate-50 overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-100">
            <CheckCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 leading-tight">Circle Connect</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-slate-500 font-medium">Active: User {userType}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCallActive(!isCallActive)}
            className={`p-2.5 rounded-full transition-all ${isCallActive ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600'}`}
          >
            {isCallActive ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2.5 rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="p-2.5 rounded-full bg-slate-50 text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="absolute top-16 right-4 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in slide-in-from-top-2">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Settings size={16} /> Chat Settings
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Auto-delete (days)</label>
              <input 
                type="number" 
                value={autoDeleteDays}
                onChange={(e) => setAutoDeleteDays(e.target.value)}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <button 
              onClick={clearAllMessages}
              className="w-full flex items-center justify-center gap-2 p-2.5 text-sm font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 size={16} /> Clear History
            </button>
          </div>
        </div>
      )}

      {/* Call Banner */}
      {isCallActive && (
        <div className="bg-emerald-500 text-white px-4 py-2 flex items-center justify-between animate-in slide-in-from-top shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
              <Phone size={16} />
            </div>
            <span className="text-sm font-medium">Secure Voice Call in Progress...</span>
          </div>
          <span className="text-xs font-mono bg-black/10 px-2 py-1 rounded">00:45</span>
        </div>
      )}

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth bg-[#f8fafc]">
        {loadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Establishing secure connection...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <CheckCheck size={40} />
            </div>
            <p className="font-medium">No messages yet. Start a secure conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender === userType;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                <div className={`max-w-[85%] md:max-w-[70%] relative ${isMe ? 'order-1' : 'order-2'}`}>
                  <div className={`
                    px-4 py-2.5 rounded-2xl shadow-sm
                    ${isMe 
                      ? 'bg-emerald-500 text-white rounded-tr-none' 
                      : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}
                  `}>
                    {msg.type === 'file' && (
                      <div className="mb-2 p-2 bg-black/5 rounded-lg flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                          <ImageIcon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{msg.fileName}</p>
                          <p className="text-[10px] opacity-70">Encrypted Attachment</p>
                        </div>
                        <a href={msg.fileData} download={msg.fileName} className="p-1.5 hover:bg-white/20 rounded-md transition-colors">
                          <Download size={16} />
                        </a>
                      </div>
                    )}
                    <LinkifyText text={msg.text} isSender={isMe} />
                    <div className={`flex items-center justify-end gap-1 mt-1 opacity-70`}>
                      <span className="text-[10px] font-medium">
                        {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && <CheckCheck size={12} />}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteMessage(msg.id)}
                    className={`absolute -top-2 ${isMe ? '-left-8' : '-right-8'} p-1.5 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-md border border-slate-100 opacity-0 group-hover:opacity-100 transition-all`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-slate-200 p-4 pb-6 md:pb-4 shrink-0">
        {selectedFile && (
          <div className="mb-3 p-2 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                <Paperclip size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{selectedFile.name}</p>
                <p className="text-xs text-emerald-600">Ready to send securely</p>
              </div>
            </div>
            <button onClick={() => setSelectedFile(null)} className="p-2 text-slate-400 hover:text-red-500">
              <X size={20} />
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-6xl mx-auto">
          <div className="flex items-center gap-1">
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-full transition-all"
            >
              <Paperclip size={22} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className="hidden" 
            />
            <button 
              type="button"
              className="p-3 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-full transition-all"
            >
              <Mic size={22} />
            </button>
          </div>

          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a secure message..."
              className="w-full py-3.5 px-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={!newMessage.trim() && !selectedFile}
            className="p-3.5 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 shadow-lg shadow-emerald-100 transition-all active:scale-95"
          >
            <Send size={22} />
          </button>
        </form>
      </header>
    </div>
  );
};

export default EncryptedChat;
