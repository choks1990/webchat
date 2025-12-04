// Shared Firebase configuration
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCcQjt2IeO8iojdrygJmiOPOOOUFwMbtcg",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "web-app-262d4.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "web-app-262d4",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "web-app-262d4.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "460976604916",
  appId: process.env.FIREBASE_APP_ID || "1:460976604916:web:40bec88137c9ee3b7980a1"
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