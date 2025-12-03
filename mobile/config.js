// Shared Firebase configuration
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBhaWv2CY_JbTVSzruyOWBdWX06ubY69Vw",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "chat-a57cb.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "chat-a57cb",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "chat-a57cb.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "74674191858",
  appId: process.env.FIREBASE_APP_ID || "1:74674191858:web:013f97035bed6bd7173f6b"
};

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