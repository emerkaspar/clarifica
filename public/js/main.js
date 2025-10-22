import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { collection, doc, onSnapshot, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { initializeAuth } from './auth.js';
import { initializeUI } from './ui.js';
import { setupAllModals, openAssetListModal } from './api/modals.js';
import { renderAcoesCarteira } from './tabs/acoes.js';
import { renderFiisCarteira } from './tabs/fiis.js';
import { renderEtfCarteira } from './tabs/etf.js';
import { renderCriptoCarteira } from './tabs/cripto.js';
import { renderRendaFixaCarteira } from './tabs/rendaFixa.js';
import { renderHistorico } from './tabs/lancamentos.js';
import { renderClassificacao } from './tabs/classificacao.js';
import { updateProventosTab } from './tabs/proventos.js';
import { renderOpcoesTab } from './tabs/opcoes.js';
import { renderMovimentacaoChart } from './charts.js';
import { updateMainSummaryHeader } from './summary.js';
import { renderPatrimonioTab } from './tabs/patrimonio.js';
import { renderRentabilidadeTab } from './tabs/rentabilidade.js';
import { fetchCurrentPrices } from './api/brapi.js';
// ALTERADO AQUI: Importa a função renomeada
import { initializeCalculosTab } from './tabs/calculos.js';
import { renderAnalisesTab } from './tabs/analises.js';

// --- ESTADO GLOBAL DA APLicação ---
let currentUserID = null;
let allLancamentos = [];
let allProventos = [];
let allOpcoes = [];
let allClassificacoes = {};
let currentProventosMeta = null;
let allTesouroDiretoPrices = {};
let userConfig = {};

// Adicione esta função em public/js/main.js

async function fetchPatrimonioAnterior(userID, tipoAtivo) {
    if (!userID) return 0;

    try {
        const q = query(
            collection(db, "historicoPatrimonioDiario"),
            where("userID", "==", userID),
            where("tipoAtivo", "==", tipoAtivo),
            orderBy("data", "desc"),
            limit(1)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log(`Nenhum patrimônio anterior encontrado para ${tipoAtivo}.`);
            return 0;
        }

        const ultimoRegistro = querySnapshot.docs[0].data();
        return ultimoRegistro.valorPatrimonio || 0;

    } catch (error) {
        console.error(`Erro ao buscar patrimônio anterior para ${tipoAtivo}:`, error);
        return 0;
    }
}

// Função que será chamada quando o usuário fizer login
const onLogin = (userID) => {
    currentUserID = userID;
    initializeDataListeners(userID);
    setupAllModals(userID);
    // ALTERADO AQUI: Chama a função renomeada
    initializeCalculosTab(userID);
};

// Função que será chamada quando o usuário fizer logout
const onLogout = () => {
    currentUserID = null;
    allLancamentos = [];
    allProventos = [];
    allOpcoes = [];
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

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosEInfos, allTesouroDiretoPrices);

        renderHistorico(allLancamentos, precosEInfos);
        renderMovimentacaoChart(allLancamentos);
        renderAcoesCarteira(allLancamentos, allProventos, precosEInfos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderRendaFixaCarteira(allLancamentos, userID, allTesouroDiretoPrices);
        renderClassificacao(allLancamentos, allClassificacoes);
        updateProventosTab(allProventos, currentProventosMeta, precosEInfos, allLancamentos); // Passa allLancamentos aqui
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
        renderAnalisesTab(allLancamentos, allProventos, allClassificacoes, precosEInfos);
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

        const summaryData = await updateMainSummaryHeader(allLancamentos, allProventos, precosEInfos, allTesouroDiretoPrices);

        updateProventosTab(allProventos, currentProventosMeta, precosEInfos, allLancamentos); // E aqui também
        renderAcoesCarteira(allLancamentos, allProventos, precosEInfos);
        renderFiisCarteira(allLancamentos, allProventos, allClassificacoes, userConfig.divisaoIdealFIIs);
        renderEtfCarteira(allLancamentos, allProventos);
        renderCriptoCarteira(allLancamentos, allProventos);
        renderPatrimonioTab(allLancamentos, allProventos);
        renderRentabilidadeTab(allLancamentos, allProventos, summaryData);
        renderAnalisesTab(allLancamentos, allProventos, allClassificacoes, precosEInfos);
    });

    const qOpcoes = query(collection(db, "opcoes"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qOpcoes, (snapshot) => {
        allOpcoes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        window.allOpcoes = allOpcoes;
        renderOpcoesTab(allOpcoes);
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
        updateProventosTab(allProventos, currentProventosMeta, window.precosEInfos || {}, allLancamentos); // E aqui
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
        window.allTesouroDiretoPrices = allTesouroDiretoPrices;
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
    window.openAssetListModal = openAssetListModal;

    // Listener para o evento de atualização da alocação ideal
    document.addEventListener('idealAllocationChanged', () => {
        // Re-renderiza a aba de análises para refletir a nova alocação ideal
        if (allLancamentos && allProventos) {
            renderAnalisesTab(allLancamentos, allProventos, allClassificacoes, window.precosEInfos);
        }
    });
});