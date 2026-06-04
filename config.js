import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFi0RZmH6qiM0Mr5J2bG7DkM71s56X4Ew",
  authDomain: "starmap-80993.firebaseapp.com",
  projectId: "starmap-80993",
  storageBucket: "starmap-80993.firebasestorage.app",
  messagingSenderId: "90928835945",
  appId: "1:90928835945:web:26b2fb70a7f6c2aed4e1f8",
  measurementId: "G-N529QTV2QF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDocs, doc, updateDoc };