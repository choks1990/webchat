import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCcQjt2IeO8iojdrygJmiOPOOOUFwMbtcg",
  authDomain: "web-app-262d4.firebaseapp.com",
  projectId: "web-app-262d4",
  storageBucket: "web-app-262d4.firebasestorage.app",
  messagingSenderId: "460976604916",
  appId: "1:460976604916:web:40bec88137c9ee3b7980a1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);