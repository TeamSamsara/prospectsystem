// public/js/firestore.js

import { db } from "./firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export {
    db,
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit,
};