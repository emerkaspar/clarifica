import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { auth } from './firebase-config.js';

const provider = new GoogleAuthProvider();

// Elementos da UI relacionados à autenticação
const btnHeaderLoginGoogle = document.getElementById("btn-header-login-google");
const userInfoDiv = document.getElementById("user-info");
const appContent = document.getElementById("app-content");
const welcomeSection = document.getElementById("welcome-section");
const mainSummaryHeader = document.querySelector(".main-summary-header");

const updateUIForLoggedInUser = (user) => {
    welcomeSection.style.display = "none";
    appContent.style.display = "block";
    userInfoDiv.style.display = "flex";
    btnHeaderLoginGoogle.style.display = "none";
    mainSummaryHeader.style.display = "flex"; // Garante que o resumo apareça para usuários logados
    document.getElementById("user-photo").src = user.photoURL;
    document.getElementById("dropdown-user-name").textContent = user.displayName;
    document.getElementById("dropdown-user-email").textContent = user.email;
};

const updateUIForLoggedOutUser = () => {
    welcomeSection.style.display = "flex";
    appContent.style.display = "none";
    userInfoDiv.style.display = "none";
    btnHeaderLoginGoogle.style.display = "flex";
    mainSummaryHeader.style.display = "none"; // Esconde o resumo para usuários deslogados
};

// Função principal que inicializa a autenticação
export function initializeAuth(onLoginCallback, onLogoutCallback) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            updateUIForLoggedInUser(user);
            onLoginCallback(user.uid); // Chama a função de login no main.js
        } else {
            updateUIForLoggedOutUser();
            onLogoutCallback(); // Chama a função de logout no main.js
        }
    });

    btnHeaderLoginGoogle.addEventListener("click", () =>
        signInWithPopup(auth, provider).catch(console.error)
    );

    document.getElementById("btn-logout").addEventListener("click", (e) => {
        e.preventDefault();
        signOut(auth).catch(console.error);
    });
}