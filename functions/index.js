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


// --- INÍCIO DAS NOVAS FUNÇÕES E CORREÇÕES ---

/**
 * Funções auxiliares para buscar indexadores do Banco Central (BCB).
 */
const formatDateForBCB = (dateInput) => {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

async function fetchIndexers(dataInicial, dataFinal) {
    const dataInicialBCB = formatDateForBCB(dataInicial);
    const dataFinalBCB = formatDateForBCB(dataFinal);
    if (!dataInicialBCB || !dataFinalBCB) {
        throw new Error('Datas para busca no BCB são inválidas.');
    }
    const [cdiResponse, ipcaResponse] = await Promise.all([
        axios.get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dataInicialBCB}&dataFinal=${dataFinalBCB}`),
        axios.get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${dataInicialBCB}&dataFinal=${dataFinalBCB}`)
    ]);
    return { historicoCDI: cdiResponse.data, historicoIPCA: ipcaResponse.data };
}

/**
 * Calcula o patrimônio de Renda Fixa (lógica movida do frontend para o backend).
 */
async function calcularPatrimonioRendaFixa(userID, lancamentosDoTipo) {
    let patrimonioTotalRf = 0;
    if (lancamentosDoTipo.length === 0) return 0;

    const tesouroDiretoLancamentos = lancamentosDoTipo.filter(l => l.tipoAtivo === 'Tesouro Direto');
    const outrosRfLancamentos = lancamentosDoTipo.filter(l => l.tipoAtivo !== 'Tesouro Direto');

    // 1. Processa Tesouro Direto buscando o último preço salvo
    for (const ativo of tesouroDiretoLancamentos) {
        const q = db.collection("tesouroDiretoPrices")
            .where("userID", "==", userID)
            .where("titulo", "==", ativo.ativo)
            .orderBy("timestamp", "desc")
            .limit(1);
        const precoSnapshot = await q.get();
        if (!precoSnapshot.empty) {
            const precoData = precoSnapshot.docs[0].data();
            patrimonioTotalRf += (precoData.valor * ativo.quantidade);
        } else {
            patrimonioTotalRf += ativo.valorAplicado; // Fallback
        }
    }

    // 2. Processa outros ativos de RF na curva
    if (outrosRfLancamentos.length > 0) {
        const hoje = new Date();
        const dataMaisAntiga = outrosRfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, outrosRfLancamentos[0].data);
        const { historicoCDI, historicoIPCA } = await fetchIndexers(new Date(dataMaisAntiga), hoje);

        for (const ativo of outrosRfLancamentos) {
            let valorBruto = ativo.valorAplicado;
            const dataCalculo = new Date(ativo.data + 'T00:00:00');
            const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

            if (ativo.tipoRentabilidade === 'Pós-Fixado') { /* Lógica do cálculo na curva */ }
            // ... (A lógica completa de cálculo na curva para Pós, Pre e Híbrido é mantida aqui)
            if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                let acumuladorCDI = 1;
                const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                historicoCDI
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => { acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI); });
                valorBruto = ativo.valorAplicado * acumuladorCDI;
            } else if (ativo.tipoRentabilidade === 'Prefixado') {
                const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = ativo.valorAplicado * Math.pow(1 + taxaAnual, diasUteis / 252);
            } else if (ativo.tipoRentabilidade === 'Híbrido') {
                let acumuladorIPCA = 1;
                const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                historicoIPCA
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => { acumuladorIPCA *= (1 + parseFloat(item.valor) / 100); });
                const valorCorrigido = ativo.valorAplicado * acumuladorIPCA;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
            }

            const lucro = valorBruto - ativo.valorAplicado;
            let aliquotaIR = 0;
            if (lucro > 0 && !['LCI', 'LCA'].includes(ativo.tipoAtivo)) {
                if (diasCorridosCalculo <= 180) aliquotaIR = 0.225;
                else if (diasCorridosCalculo <= 360) aliquotaIR = 0.20;
                else if (diasCorridosCalculo <= 720) aliquotaIR = 0.175;
                else aliquotaIR = 0.15;
            }
            patrimonioTotalRf += (valorBruto - (lucro * aliquotaIR));
        }
    }
    return patrimonioTotalRf;
}

// --- FIM DAS NOVAS FUNÇÕES ---


exports.scheduledPortfolioSnapshot = functions.pubsub.schedule('10 19 * * *')
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
                    acc[tipo].push(l); // Salva o lançamento inteiro, não só o ticker
                    return acc;
                }, {});

                const assetTypesToProcess = ['Ações', 'FIIs', 'ETF', 'Cripto', 'Renda Fixa'];

                for (const tipoAtivo of assetTypesToProcess) {
                    let patrimonio = 0; // CORREÇÃO: Inicializa o patrimônio

                    // --- LÓGICA DE DECISÃO CORRIGIDA ---
                    if (tipoAtivo === 'Renda Fixa') {
                        if (ativosPorTipo[tipoAtivo] && ativosPorTipo[tipoAtivo].length > 0) {
                            patrimonio = await calcularPatrimonioRendaFixa(userID, ativosPorTipo[tipoAtivo]);
                        }
                    } else {
                        if (ativosPorTipo[tipoAtivo] && ativosPorTipo[tipoAtivo].length > 0) {
                            const tickers = [...new Set(ativosPorTipo[tipoAtivo].map(l => l.ativo))];
                            patrimonio = await calcularPatrimonioPorTipo(userID, lancamentosDoUsuario, tipoAtivo, tickers);
                        }
                    }
                    // --- FIM DA LÓGICA DE DECISÃO ---

                    if (patrimonio > 0) {
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

async function calcularPatrimonioPorTipo(userID, lancamentos, tipoAtivo, tickers) {
    let patrimonioTotal = 0;
    const lancamentosDoTipo = lancamentos.filter(l => {
        const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo) ? 'Renda Fixa' : l.tipoAtivo;
        return tipoMapeado === tipoAtivo;
    });

    const carteira = {};
    lancamentosDoTipo.forEach(l => {
        if (!carteira[l.ativo]) { carteira[l.ativo] = { quantidade: 0 }; }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

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