// mobile/firebase/init.js
// Create this file to initialize Firebase for mobile

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from '../shared/firebase/config';
import { initializeChatService } from '../shared/services/chatService';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize chat service with Firestore instance
initializeChatService(db);

export default app;