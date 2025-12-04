// web/src/components/ChatWindow.jsx
import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase/init';
import { 
  sendMessage, 
  subscribeToMessages, 
  getChatHistory,
  markMessageAsRead 
} from '../../../shared/services/chatService';

const ChatWindow = ({ currentUser, roomId = 'general' }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    // Load chat history first
    loadChatHistory();

    // Then subscribe to real-time updates
    const unsubscribe = subscribeToMessages(roomId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    });

    unsubscribeRef.current = unsubscribe;

    // Cleanup subscription when component unmounts
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [roomId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      const history = await getChatHistory(roomId);
      setMessages(history);
      setLoading(false);
    } catch (error) {
      console.error('Error loading chat history:', error);
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const messageText = newMessage;
    setNewMessage(''); // Clear input immediately for better UX

    try {
      await sendMessage({
        text: messageText,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        roomId: roomId,
        type: 'text'
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
      setNewMessage(messageText); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl text-gray-600">Loading messages...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md">
        <h1 className="text-xl font-bold">Chat Room</h1>
        <p className="text-sm opacity-90">{currentUser.email}</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <svg 
                className="w-16 h-16 mx-auto mb-4 text-gray-400" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" 
                />
              </svg>
              <p className="text-lg">No messages yet</p>
              <p className="text-sm mt-2">Start the conversation!</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.userId === currentUser.uid;
            
            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow ${
                    isOwnMessage
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-white text-gray-800 rounded-bl-none'
                  }`}
                >
                  {!isOwnMessage && (
                    <div className="text-xs font-semibold mb-1 text-blue-600">
                      {message.userName || 'Unknown User'}
                    </div>
                  )}
                  <div className="break-words">{message.text}</div>
                  <div className={`text-xs mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.createdAt 
                      ? new Date(message.createdAt).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })
                      : 'Sending...'}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="bg-white p-4 shadow-lg border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
          >
            {sending ? (
              <span className="flex items-center">
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;