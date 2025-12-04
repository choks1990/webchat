// web/src/firebase/init.js

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Firebase configuration - use environment variables in production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBhaWv2CY_JbTVSzruyOWBdWX06ubY69Vw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chat-a57cb.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "chat-a57cb",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chat-a57cb.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "74674191858",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:74674191858:web:013f97035bed6bd7173f6b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Collection names
export const COLLECTIONS = {
  MESSAGES: 'messages',
  SETTINGS: 'settings',
  USERS: 'users'
};

// Cloudinary config
export const cloudinaryConfig = {
  cloudName: "dujpj0445",
  uploadPreset: "chat_app_upload"
};

export default app;