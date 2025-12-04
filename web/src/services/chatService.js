// web/src/services/chatService.js
// Create this file directly in your web folder

import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  where,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/init';

// Collection name from your shared config
const MESSAGES_COLLECTION = 'messages';

// Send a new message
export const sendMessage = async (messageData) => {
  try {
    const messagesRef = collection(db, MESSAGES_COLLECTION);
    const docRef = await addDoc(messagesRef, {
      ...messageData,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      isRead: false
    });
    return docRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

// Subscribe to messages in real-time
export const subscribeToMessages = (roomId = null, callback) => {
  const messagesRef = collection(db, MESSAGES_COLLECTION);
  let q;

  if (roomId) {
    q = query(
      messagesRef,
      where('roomId', '==', roomId),
      orderBy('timestamp', 'asc')
    );
  } else {
    q = query(messagesRef, orderBy('timestamp', 'asc'));
  }
  
  return onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(messages);
  }, (error) => {
    console.error('Error subscribing to messages:', error);
    callback([]);
  });
};

// Get chat history
export const getChatHistory = async (roomId = null, limit = 100) => {
  try {
    const messagesRef = collection(db, MESSAGES_COLLECTION);
    let q;
    
    if (roomId) {
      q = query(
        messagesRef, 
        where('roomId', '==', roomId),
        orderBy('timestamp', 'desc')
      );
    } else {
      q = query(messagesRef, orderBy('timestamp', 'desc'));
    }
    
    const snapshot = await getDocs(q);
    const messages = [];
    
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return messages.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw error;
  }
};

// Mark message as read
export const markMessageAsRead = async (messageId) => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    await updateDoc(messageRef, {
      isRead: true,
      readAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    throw error;
  }
};

// Delete a message
export const deleteMessage = async (messageId) => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    await deleteDoc(messageRef);
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

// Auto-delete old messages based on settings
export const autoDeleteOldMessages = async (daysToKeep = 7) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const messagesRef = collection(db, MESSAGES_COLLECTION);
    const q = query(
      messagesRef,
      where('createdAt', '<=', cutoffDate.toISOString())
    );
    
    const snapshot = await getDocs(q);
    const deletePromises = [];
    
    snapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    await Promise.all(deletePromises);
    console.log(`Deleted ${deletePromises.length} old messages`);
  } catch (error) {
    console.error('Error auto-deleting messages:', error);
    throw error;
  }
};