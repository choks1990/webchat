// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBhaWv2CY_JbTVSzruyOWBdWX06ubY69Vw",
  authDomain: "chat-a57cb.firebaseapp.com",
  projectId: "chat-a57cb",
  storageBucket: "chat-a57cb.firebasestorage.app",
  messagingSenderId: "74674191858",
  appId: "1:74674191858:web:013f97035bed6bd7173f6b",
  measurementId: "G-CEY9ZPYBXJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 👇 THIS LINE IS THE FIX. YOU MUST HAVE "export" HERE
export const db = getFirestore(app);