import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { collection, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { initializeAuth } from './auth.js';
import { initializeUI } from './ui.js';
import { setupAllModals } from './api/modals.js';
import { renderAcoesCarteira } from './tabs/acoes.js';
import { renderFiisCarteira } from './tabs/fiis.js';
import { renderEtfCarteira } from './tabs/etf.js';
import { renderCriptoCarteira } from './tabs/cripto.js';
import { renderRendaFixaCarteira } from './tabs/rendaFixa.js';
import { renderHistorico } from './tabs/lancamentos.js';
import { renderClassificacao } from './tabs/classificacao.js';
import { updateProventosTab } from './tabs/proventos.js';
import { renderMovimentacaoChart } from './charts.js';
import { updateMainSummaryHeader } from './summary.js';
import { renderPatrimonioTab } from './tabs/patrimonio.js';
import { renderRentabilidadeTab } from './tabs/rentabilidade.js';
import { fetchCurrentPrices } from './api/brapi.js'; // NOVO: Traz a busca de preços para o main.js

// --- ESTADO GLOBAL DA APLicação ---
let currentUserID = null;
let allLancamentos = [];
let allProventos = [];
let allClassificacoes = {};
let currentProventosMeta = null;
let allValoresManuaisTD = {};
let userConfig = {}; 

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
    allValoresManuaisTD = {};
    userConfig = {};
};

// --- OUVINTES DE DADOS (LISTENERS) ---
function initializeDataListeners(userID) {
    // Listener para Lançamentos
    const qLancamentos = query(collection(db, "lancamentos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qLancamentos, async (snapshot) => {
        allLancamentos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allLancamentos = allLancamentos;
        
        // 1. Identifica todos os ativos que precisam de preço (RV/Cripto/ETF)
        const tickersAtivos = allLancamentos
            .filter(a => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
            .map(a => a.ativo);

        // 2. BUSCA OS PREÇOS AGORA (CACHE-FIRST)
        const precosAtuais = await fetchCurrentPrices(tickersAtivos);

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosAtuais);

        renderHistorico(allLancamentos);
        renderMovimentacaoChart(allLancamentos);
        renderAcoesCarteira(allLancamentos, allProventos); // Estes módulos usam fetchCurrentPrices internamente.
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs); // Estes módulos usam fetchCurrentPrices internamente.
        renderEtfCarteira(allLancamentos, allProventos); // Estes módulos usam fetchCurrentPrices internamente.
        renderCriptoCarteira(allLancamentos, allProventos); // Estes módulos usam fetchCurrentPrices internamente.
        renderRendaFixaCarteira(allLancamentos, userID, allValoresManuaisTD);
        renderClassificacao(allLancamentos, allClassificacoes);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData); 
    });

    // Listener para Proventos
    const qProventos = query(collection(db, "proventos"), where("userID", "==", userID), orderBy("dataPagamento", "desc"));
    onSnapshot(qProventos, async (snapshot) => {
        allProventos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allProventos = allProventos;

        // Re-executa o fluxo de preços para atualizar o resumo
        const tickersAtivos = allLancamentos
            .filter(a => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
            .map(a => a.ativo);
        const precosAtuais = await fetchCurrentPrices(tickersAtivos);

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosAtuais);

        updateProventosTab(allProventos, currentProventosMeta);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
    });

    // Listener para Classificações
    const qClassificacoes = query(collection(db, "ativosClassificados"), where("userID", "==", userID));
    onSnapshot(qClassificacoes, (snapshot) => {
        allClassificacoes = {};
        snapshot.docs.forEach((doc) => { allClassificacoes[doc.id] = doc.data(); });
        renderClassificacao(allLancamentos, allClassificacoes);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
    });

    // Listener para Metas
    const metaDocRef = doc(db, "metas", userID);
    onSnapshot(metaDocRef, (doc) => {
        currentProventosMeta = doc.exists() ? doc.data() : null;
        updateProventosTab(allProventos, currentProventosMeta);
    });

    // Listener para Valores Manuais do Tesouro Direto
    const qValoresManuais = query(collection(db, "valoresManuaisTD"), where("userID", "==", userID));
    onSnapshot(qValoresManuais, (snapshot) => {
        allValoresManuaisTD = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            allValoresManuaisTD[data.ativo] = { id: doc.id, ...data };
        });
        renderRendaFixaCarteira(allLancamentos, userID, allValoresManuaisTD);
    });

    // NOVO: Listener para Configurações Gerais do Usuário
    const configDocRef = doc(db, "configuracoes", userID);
    onSnapshot(configDocRef, (doc) => {
        userConfig = doc.exists() ? doc.data() : {};
        // Re-renderiza a aba de FIIs com a nova configuração ideal
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
    });
}

// --- INICIALIZAÇÃO GERAL ---
document.addEventListener("DOMContentLoaded", () => {
    initializeAuth(onLogin, onLogout);
    initializeUI();
});