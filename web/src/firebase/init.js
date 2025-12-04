// web/src/firebase/init.js

import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Firebase configuration - use environment variables in production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCcQjt2IeO8iojdrygJmiOPOOOUFwMbtcg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "web-app-262d4.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "web-app-262d4",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "web-app-262d4.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "460976604916",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:460976604916:web:40bec88137c9ee3b7980a1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
      console.log('Persistence not supported by browser');
    }
  });

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