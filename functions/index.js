const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { getFirestore } = require('firebase-admin/firestore');

// TOKEN CORRETO USADO NO SERVIDOR
const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm"; 

// Mapeamento de tickers para CoinGecko (usado no servidor para contornar CORS)
const tickerToCoinGeckoId = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    // Adicione outras criptos aqui conforme necessário
};

// Inicializa o SDK Admin para acessar o Firestore
admin.initializeApp();
const db = getFirestore();

/**
 * Funções Auxiliares (Adaptadas do seu Front-End para Node.js)
 */

function createUniqueDocId(ticker) {
    const now = new Date();
    const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
    const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/:/g, '');
    const secondsPart = String(now.getSeconds()).padStart(2, '0');
    return `${ticker}-${datePart}-${timePart}${secondsPart}`;
}

async function saveToFirestore(ticker, data) {
    try {
        if (!data || !data.results || data.results.length === 0) {
            console.warn(`[Scheduler] Não salvando ${ticker}: dados inválidos.`);
            return;
        }
        
        const priceData = data.results[0];
        const docId = createUniqueDocId(ticker);
        const timestamp = new Date().toISOString();

        await db.collection("cotacoes").doc(docId).set({
            ticker: ticker,
            preco: priceData.regularMarketPrice,
            data: timestamp,
            raw: data,
        });
        console.log(`[Scheduler] Cotação de ${ticker} salva: ${docId}`);
    } catch (error) {
        console.error(`[Scheduler] Erro ao salvar ${ticker}:`, error);
    }
}


// --- NOVO: Função para buscar cripto e salvar no mesmo formato ---
async function fetchAndSaveCrypto(ticker) {
    const coinGeckoId = tickerToCoinGeckoId[ticker];
    if (!coinGeckoId) return;

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=brl`;

    try {
        const response = await axios.get(url);
        const price = response.data[coinGeckoId]?.brl;

        if (price) {
            // Cria um objeto no formato "simulado" da Brapi para o saveToFirestore
            const brapiSimulado = {
                results: [{
                    symbol: ticker,
                    regularMarketPrice: price
                }]
            };
            await saveToFirestore(ticker, brapiSimulado);
        } else {
            console.warn(`[Scheduler] Não foi possível obter preço para cripto: ${ticker}`);
        }
    } catch (error) {
        console.error(`[Scheduler] Erro ao chamar CoinGecko para ${ticker}: ${error.message}`);
    }
}


/**
 * 🚀 FUNÇÃO PRINCIPAL AGENDADA
 * * Cronograma: '0,30 * * * *' (A cada 30 minutos)
 */
exports.scheduledBrapiUpdate = functions.pubsub.schedule('0,30 * * * *')
    .onRun(async (context) => {
    
    console.log("Iniciando rotina de atualização agendada...");

    const lancamentosSnapshot = await db.collection("lancamentos").get();
    
    const tickersBrapi = new Set();
    const tickersCrypto = new Set();
    
    lancamentosSnapshot.forEach(doc => {
        const data = doc.data();
        const ativo = data.ativo;
        if (ativo) {
            if (['Ações', 'FIIs', 'ETF'].includes(data.tipoAtivo)) {
                tickersBrapi.add(ativo);
            } else if (data.tipoAtivo === 'Cripto') {
                tickersCrypto.add(ativo);
            }
        }
    });

    console.log(`Tickers BRAPI a atualizar: ${Array.from(tickersBrapi).join(', ')}`);
    console.log(`Tickers CRIPTO a atualizar: ${Array.from(tickersCrypto).join(', ')}`);


    // --- 1. Atualiza BRAPI (Ações/FIIs/ETFs) ---
    const brapiPromises = Array.from(tickersBrapi).map(async (ticker) => {
        const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAAPI_TOKEN}`;
        try {
            const response = await axios.get(url);
            
            if (response.status === 200 && response.data && response.data.results) {
                await saveToFirestore(ticker, response.data);
            } else {
                console.warn(`[Scheduler] Falha ou dado inválido para ${ticker}. Status: ${response.status}`);
            }
        } catch (error) {
            // Este log capturará o 401 se ele for de fato um erro de token expirado
            console.error(`[Scheduler] Erro BRAPI para ${ticker}: ${error.message}`);
        }
    });


    // --- 2. Atualiza Criptomoedas (CoinGecko) ---
    const cryptoPromises = Array.from(tickersCrypto).map(ticker => fetchAndSaveCrypto(ticker));


    await Promise.all([...brapiPromises, ...cryptoPromises]);

    console.log("Rotina de atualização agendada concluída.");
    return null;
});


/**
 * 🚀 FUNÇÃO AGENDADA PARA SALVAR O PATRIMÔNIO DIÁRIO
 * * Cronograma: '0 18 * * *' (Todos os dias às 18:00)
 * * Fuso Horário: America/Sao_Paulo
 */
exports.scheduledPortfolioSnapshot = functions.pubsub.schedule('0 18 * * *')
    .timeZone('America/Sao_Paulo')
    .onRun(async (context) => {

    console.log('[Snapshot] Iniciando rotina para salvar o patrimônio diário.');
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        // 1. Buscar todos os lançamentos e agrupar por userID
        const lancamentosSnapshot = await db.collection("lancamentos").get();
        const todosLancamentos = [];
        lancamentosSnapshot.forEach(doc => {
            todosLancamentos.push({ id: doc.id, ...doc.data() });
        });

        const lancamentosPorUsuario = todosLancamentos.reduce((acc, l) => {
            if (!acc[l.userID]) {
                acc[l.userID] = [];
            }
            acc[l.userID].push(l);
            return acc;
        }, {});

        // 2. Para cada usuário, calcular o patrimônio por tipo de ativo
        for (const userID in lancamentosPorUsuario) {
            const lancamentosDoUsuario = lancamentosPorUsuario[userID];
            
            // Separa os ativos por tipo para saber quais cálculos fazer
            const ativosPorTipo = lancamentosDoUsuario.reduce((acc, l) => {
                const tipo = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo) ? 'Renda Fixa' : l.tipoAtivo;
                if (!acc[tipo]) {
                    acc[tipo] = [];
                }
                acc[tipo].push(l.ativo);
                return acc;
            }, {});

            // 3. Calcula e salva o patrimônio para AÇÕES
            if (ativosPorTipo['Ações']) {
                const tickersAcoes = [...new Set(ativosPorTipo['Ações'])];
                const patrimonioAcoes = await calcularPatrimonioPorTipo(userID, lancamentosDoUsuario, 'Ações', tickersAcoes);

                if (patrimonioAcoes > 0) {
                    const docId = `${userID}_Ações_${todayStr}`;
                    await db.collection("historicoPatrimonioDiario").doc(docId).set({
                        userID: userID,
                        tipoAtivo: 'Ações',
                        valorPatrimonio: patrimonioAcoes,
                        data: todayStr,
                        timestamp: new Date()
                    });
                    console.log(`[Snapshot] Patrimônio de Ações para usuário ${userID} salvo: ${patrimonioAcoes}`);
                }
            }
            
            // --- NOVO BLOCO ---
            // 4. Calcula e salva o patrimônio para FIIS
            if (ativosPorTipo['FIIs']) {
                const tickersFiis = [...new Set(ativosPorTipo['FIIs'])];
                const patrimonioFiis = await calcularPatrimonioPorTipo(userID, lancamentosDoUsuario, 'FIIs', tickersFiis);

                if (patrimonioFiis > 0) {
                    const docId = `${userID}_FIIs_${todayStr}`;
                    await db.collection("historicoPatrimonioDiario").doc(docId).set({
                        userID: userID,
                        tipoAtivo: 'FIIs',
                        valorPatrimonio: patrimonioFiis,
                        data: todayStr,
                        timestamp: new Date()
                    });
                    console.log(`[Snapshot] Patrimônio de FIIs para usuário ${userID} salvo: ${patrimonioFiis}`);
                }
            }
        }

    } catch (error) {
        console.error('[Snapshot] Erro ao executar a rotina de snapshot:', error);
        return null;
    }
    
    console.log('[Snapshot] Rotina de snapshot concluída.');
    return null;
});


/**
 * Função auxiliar para calcular o valor de patrimônio de um tipo de ativo.
 */
async function calcularPatrimonioPorTipo(userID, lancamentos, tipoAtivo, tickers) {
    let patrimonioTotal = 0;
    
    // Filtra lançamentos para o tipo de ativo específico
    const lancamentosDoTipo = lancamentos.filter(l => l.tipoAtivo === tipoAtivo);

    // Consolida a carteira para este tipo de ativo
    const carteira = {};
    lancamentosDoTipo.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = { quantidade: 0 };
        }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    // Busca as cotações mais recentes salvas no Firestore para calcular o patrimônio
    for (const ticker of tickers) {
        const ativo = carteira[ticker];
        if (ativo && ativo.quantidade > 0) {
            const q = db.collection("cotacoes").where("ticker", "==", ticker).orderBy("data", "desc").limit(1);
            const cotacaoSnapshot = await q.get();
            
            if (!cotacaoSnapshot.empty) {
                const preco = cotacaoSnapshot.docs[0].data().preco;
                patrimonioTotal += ativo.quantidade * preco;
            }
        }
    }
    
    return patrimonioTotal;
}