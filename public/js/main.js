import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { collection, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { initializeAuth } from './auth.js';
import { initializeUI } from './ui.js';
import { setupAllModals } from './api/modals.js';
import { renderAcoesCarteira } from './tabs/acoes.js';
import { renderFiisCarteira } from './tabs/fiis.js';
import { renderEtfCarteira } from './tabs/etf.js';
import { renderRendaFixaCarteira } from './tabs/rendaFixa.js';
import { renderHistorico } from './tabs/lancamentos.js';
import { renderClassificacao } from './tabs/classificacao.js';
import { updateProventosTab } from './tabs/proventos.js';
import { renderMovimentacaoChart } from './charts.js';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let currentUserID = null;
let allLancamentos = [];
let allProventos = [];
let allClassificacoes = {};
let currentProventosMeta = null;
let allValoresManuaisTD = {}; // Novo estado para valores manuais

// Função que será chamada quando o usuário fizer login
const onLogin = (userID) => {
    currentUserID = userID;
    initializeDataListeners(userID);
    setupAllModals(userID);
};

// Função que será chamada quando o usuário fizer logout
const onLogout = () => {
    currentUserID = null;
    allLancamentos = [];
    allProventos = [];
    allClassificacoes = {};
    currentProventosMeta = null;
    allValoresManuaisTD = {}; // Limpa o estado no logout
};

// --- OUVINTES DE DADOS (LISTENERS) ---
function initializeDataListeners(userID) {
    // Listener para Lançamentos
    const qLancamentos = query(collection(db, "lancamentos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qLancamentos, (snapshot) => {
        allLancamentos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allLancamentos = allLancamentos;

        renderHistorico(allLancamentos);
        renderMovimentacaoChart(allLancamentos);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos);
        renderEtfCarteira(allLancamentos, allProventos);
        renderRendaFixaCarteira(allLancamentos, userID, allValoresManuaisTD);
        renderClassificacao(allLancamentos, allClassificacoes);
    });

    // Listener para Proventos
    const qProventos = query(collection(db, "proventos"), where("userID", "==", userID), orderBy("dataPagamento", "desc"));
    onSnapshot(qProventos, (snapshot) => {
        allProventos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allProventos = allProventos;

        updateProventosTab(allProventos, currentProventosMeta);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos);
        renderEtfCarteira(allLancamentos, allProventos);
    });

    // Listener para Classificações
    const qClassificacoes = query(collection(db, "ativosClassificados"), where("userID", "==", userID));
    onSnapshot(qClassificacoes, (snapshot) => {
        allClassificacoes = {};
        snapshot.docs.forEach((doc) => { allClassificacoes[doc.id] = doc.data(); });
        renderClassificacao(allLancamentos, allClassificacoes);
    });

    // Listener para Metas
    const metaDocRef = doc(db, "metas", userID);
    onSnapshot(metaDocRef, (doc) => {
        currentProventosMeta = doc.exists() ? doc.data() : null;
        updateProventosTab(allProventos, currentProventosMeta);
    });

    // NOVO: Listener para Valores Manuais do Tesouro Direto
    const qValoresManuais = query(collection(db, "valoresManuaisTD"), where("userID", "==", userID));
    onSnapshot(qValoresManuais, (snapshot) => {
        allValoresManuaisTD = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            allValoresManuaisTD[data.ativo] = { id: doc.id, ...data };
        });
        // Re-renderiza a Renda Fixa sempre que um valor manual for alterado
        renderRendaFixaCarteira(allLancamentos, userID, allValoresManuaisTD);
    });
}

// --- INICIALIZAÇÃO GERAL ---
document.addEventListener("DOMContentLoaded", () => {
    initializeAuth(onLogin, onLogout);
    initializeUI();
});