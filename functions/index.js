const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { getFirestore } = require('firebase-admin/firestore');

// TOKEN CORRETO USADO NO SERVIDOR
const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";

const tickerToCoinGeckoId = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
};

admin.initializeApp();
const db = getFirestore();

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

async function fetchAndSaveCrypto(ticker) {
    const coinGeckoId = tickerToCoinGeckoId[ticker];
    if (!coinGeckoId) return;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=brl`;
    try {
        const response = await axios.get(url);
        const price = response.data[coinGeckoId]?.brl;
        if (price) {
            const brapiSimulado = { results: [{ symbol: ticker, regularMarketPrice: price }] };
            await saveToFirestore(ticker, brapiSimulado);
        } else {
            console.warn(`[Scheduler] Não foi possível obter preço para cripto: ${ticker}`);
        }
    } catch (error) {
        console.error(`[Scheduler] Erro ao chamar CoinGecko para ${ticker}: ${error.message}`);
    }
}

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
                console.error(`[Scheduler] Erro BRAPI para ${ticker}: ${error.message}`);
            }
        });
        const cryptoPromises = Array.from(tickersCrypto).map(ticker => fetchAndSaveCrypto(ticker));
        await Promise.all([...brapiPromises, ...cryptoPromises]);
        console.log("Rotina de atualização agendada concluída.");
        return null;
    });


// --- INÍCIO DAS NOVAS FUNÇÕES ---

/**
 * Busca o valor do patrimônio pré-calculado pelo frontend.
 */
async function getCachedPatrimonio(userID, tipoAtivo) {
    try {
        const docRef = db.collection('patrimonioCache').doc(`${userID}_${tipoAtivo}`);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return docSnap.data().valorPatrimonio || 0;
        }
        console.warn(`[Snapshot] Nenhum cache de patrimônio encontrado para ${tipoAtivo} do usuário ${userID}.`);
        return 0;
    } catch (error) {
        console.error(`[Snapshot] Erro ao buscar patrimônio em cache para ${tipoAtivo}:`, error);
        return 0;
    }
}

/**
 * Calcula o patrimônio para ativos de Renda Variável.
 */
async function calcularPatrimonioRendaVariavel(lancamentosDoTipo) {
    let patrimonioTotal = 0;
    if (!lancamentosDoTipo || lancamentosDoTipo.length === 0) {
        return 0;
    }

    const carteira = {};
    lancamentosDoTipo.forEach(l => {
        if (!carteira[l.ativo]) { carteira[l.ativo] = { quantidade: 0 }; }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    for (const ticker in carteira) {
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


// --- FUNÇÃO PRINCIPAL CORRIGIDA ---
exports.scheduledPortfolioSnapshot = functions.pubsub.schedule('22 09 * * *')
    .timeZone('America/Sao_Paulo')
    .onRun(async (context) => {
        console.log('[Snapshot] Iniciando rotina para salvar o patrimônio diário.');
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            const lancamentosSnapshot = await db.collection("lancamentos").get();
            const todosLancamentos = [];
            lancamentosSnapshot.forEach(doc => {
                todosLancamentos.push({ id: doc.id, ...doc.data() });
            });
            const lancamentosPorUsuario = todosLancamentos.reduce((acc, l) => {
                if (!acc[l.userID]) { acc[l.userID] = []; }
                acc[l.userID].push(l);
                return acc;
            }, {});

            for (const userID in lancamentosPorUsuario) {
                const lancamentosDoUsuario = lancamentosPorUsuario[userID];
                const ativosPorTipo = lancamentosDoUsuario.reduce((acc, l) => {
                    const tipo = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo) ? 'Renda Fixa' : l.tipoAtivo;
                    if (!acc[tipo]) { acc[tipo] = []; }
                    acc[tipo].push(l);
                    return acc;
                }, {});

                const assetTypesToProcess = ['Ações', 'FIIs', 'ETF', 'Cripto', 'Renda Fixa'];

                for (const tipoAtivo of assetTypesToProcess) {
                    let patrimonio = 0;
                    const hasAssets = ativosPorTipo[tipoAtivo] && ativosPorTipo[tipoAtivo].length > 0;

                    if (hasAssets) {
                        if (tipoAtivo === 'Renda Fixa') {
                            // **NOVA LÓGICA:** Busca o valor do cache salvo pelo frontend.
                            patrimonio = await getCachedPatrimonio(userID, 'Renda Fixa');
                        } else {
                            // Lógica antiga para Renda Variável permanece.
                            patrimonio = await calcularPatrimonioRendaVariavel(ativosPorTipo[tipoAtivo]);
                        }
                    }

                    if (hasAssets) {
                        const docId = `${userID}_${tipoAtivo}_${todayStr}`;
                        await db.collection("historicoPatrimonioDiario").doc(docId).set({
                            userID: userID,
                            tipoAtivo: tipoAtivo,
                            valorPatrimonio: patrimonio,
                            data: todayStr,
                            timestamp: new Date()
                        });
                        console.log(`[Snapshot] Patrimônio de ${tipoAtivo} para usuário ${userID} salvo: ${patrimonio}`);
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