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
import { fetchCurrentPrices } from './api/brapi.js';
import { initializePegCalculator } from './tabs/calculos.js';
import { renderAnalisesTab } from './tabs/analises.js';

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
    initializePegCalculator(userID);
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

        const tickersAtivos = allLancamentos
            .filter(a => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
            .map(a => a.ativo);

        const precosAtuais = await fetchCurrentPrices(tickersAtivos);
        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosAtuais);

        renderHistorico(allLancamentos);
        renderMovimentacaoChart(allLancamentos);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderRendaFixaCarteira(allLancamentos, userID, allValoresManuaisTD);
        renderClassificacao(allLancamentos, allClassificacoes);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
        renderAnalisesTab(allLancamentos, allProventos);
    });

    // Listener para Proventos
    const qProventos = query(collection(db, "proventos"), where("userID", "==", userID), orderBy("dataPagamento", "desc"));
    onSnapshot(qProventos, async (snapshot) => {
        allProventos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allProventos = allProventos;

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
        renderAnalisesTab(allLancamentos, allProventos);
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

    // Listener para Configurações Gerais do Usuário
    const configDocRef = doc(db, "configuracoes", userID);
    onSnapshot(configDocRef, (doc) => {
        userConfig = doc.exists() ? doc.data() : {};
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
    });
}

// --- INICIALIZAÇÃO GERAL ---
document.addEventListener("DOMContentLoaded", () => {
    initializeAuth(onLogin, onLogout);
    initializeUI();
});