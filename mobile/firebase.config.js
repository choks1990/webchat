import { initializeApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import { firebaseConfig } from '../shared/firebase/config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore instance
export const db = firestore();

// Export collections helper
export const collection = (path) => db.collection(path);
export const doc = (path, id) => db.collection(path).doc(id);