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
let allTesouroDiretoPrices = {};
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
    allTesouroDiretoPrices = {};
    userConfig = {};
};

// --- OUVINTES DE DADOS (LISTENERS) ---
function initializeDataListeners(userID) {
    const qLancamentos = query(collection(db, "lancamentos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qLancamentos, async (snapshot) => {
        allLancamentos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allLancamentos = allLancamentos;

        const tickersAtivos = [...new Set(allLancamentos
            .filter(a => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
            .map(a => a.ativo)
        )];

        const precosEInfos = await fetchCurrentPrices(tickersAtivos);
        window.precosEInfos = precosEInfos;

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosEInfos);

        renderHistorico(allLancamentos, precosEInfos);
        renderMovimentacaoChart(allLancamentos);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderRendaFixaCarteira(allLancamentos, userID, allTesouroDiretoPrices);
        renderClassificacao(allLancamentos, allClassificacoes);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
        renderAnalisesTab(allLancamentos, allProventos);
    });

    const qProventos = query(collection(db, "proventos"), where("userID", "==", userID), orderBy("dataPagamento", "desc"));
    onSnapshot(qProventos, async (snapshot) => {
        allProventos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allProventos = allProventos;

        const tickersAtivos = [...new Set(allLancamentos
            .filter(a => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
            .map(a => a.ativo)
        )];
        const precosEInfos = await fetchCurrentPrices(tickersAtivos);
        window.precosEInfos = precosEInfos;

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosEInfos);

        updateProventosTab(allProventos, currentProventosMeta);
        renderAcoesCarteira(allLancamentos, allProventos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
        renderAnalisesTab(allLancamentos, allProventos);
    });

    const qClassificacoes = query(collection(db, "ativosClassificados"), where("userID", "==", userID));
    onSnapshot(qClassificacoes, (snapshot) => {
        allClassificacoes = {};
        snapshot.docs.forEach((doc) => { allClassificacoes[doc.id] = doc.data(); });
        renderClassificacao(allLancamentos, allClassificacoes);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
    });

    const metaDocRef = doc(db, "metas", userID);
    onSnapshot(metaDocRef, (doc) => {
        currentProventosMeta = doc.exists() ? doc.data() : null;
        updateProventosTab(allProventos, currentProventosMeta);
    });

    const qTesouroPrices = query(collection(db, "tesouroDiretoPrices"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qTesouroPrices, (snapshot) => {
        allTesouroDiretoPrices = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!allTesouroDiretoPrices[data.titulo]) {
                allTesouroDiretoPrices[data.titulo] = data;
            }
        });
        renderRendaFixaCarteira(allLancamentos, userID, allTesouroDiretoPrices);
    });

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