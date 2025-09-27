import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// Suas credenciais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA08o5_6YY7I1eCZ3DCPCopAJAUiC2JNdA",
    authDomain: "clarifica-invest.firebaseapp.com",
    projectId: "clarifica-invest",
    storageBucket: "clarifica-invest.appspot.com",
    messagingSenderId: "865871192847",
    appId: "1:865871192847:web:369d4b0edc96f74b29147a",
    measurementId: "G-6PG9XZJPB9",
};

// Inicializa e exporta os serviços do Firebase para serem usados em outros arquivos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, app };