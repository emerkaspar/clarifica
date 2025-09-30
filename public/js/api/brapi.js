import { getFromFirestore, saveToFirestore, getFallbackFromFirestore } from './caching.js';

// TOKEN CORRETO USADO NO FRONT-END
const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";

// Flag para rastrear se a API está permanentemente indisponível (401/403)
let BRAAPI_IS_PERMANENTLY_DOWN = false; 

/**
 * Função interna para chamar a API BRAPI com tratamento de erro e bloqueio 401.
 */
async function getFromBrapi(url) {
    const fullUrl = `${url}&token=${BRAAPI_TOKEN}`;
    try {
        const response = await fetch(fullUrl);
        
        // Detecta erro permanente (401 ou 403)
        if (response.status === 401 || response.status === 403) {
            BRAAPI_IS_PERMANENTLY_DOWN = true;
            console.error(`[BRAPI] Chave inválida ou limite atingido permanentemente (Status ${response.status}). Parando chamadas automáticas.`);
            return null; 
        }

        if (!response.ok) {
            console.warn(`[BRAPI] Falha na resposta da API para ${url}: Status ${response.status}`);
            return null;
        }
        const data = await response.json();
        if (data.error) {
            console.warn(`[BRAPI] Erro na API para ${url}: ${data.error}`);
            return null;
        }
        return data;
    } catch (error) {
        console.error(`[BRAPI] Erro de rede ao chamar ${url}:`, error);
        return null;
    }
}

/**
 * Busca os preços atuais para uma lista de tickers, priorizando o cache do Firestore.
 * Esta função é a principal fonte de dados para AÇÕES, FIIs, ETFs e CRIPTOMOEDAS.
 */
export async function fetchCurrentPrices(tickers) {
    if (!tickers || tickers.length === 0) {
        return {};
    }

    const precosAtuais = {};
    let tickersToFetch = [];
    const cacheResults = await Promise.all(tickers.map(ticker => getFromFirestore(ticker)));
    
    // 1. Consulta Cache
    cacheResults.forEach((result, index) => {
        const ticker = tickers[index];
        if (result.isRecent) {
            precosAtuais[ticker] = result.data.results[0].regularMarketPrice;
        } else {
            if (!BRAAPI_IS_PERMANENTLY_DOWN) {
                 tickersToFetch.push(ticker);
            }
            if (result.data) {
                precosAtuais[ticker] = result.data.results[0].regularMarketPrice;
            }
        }
    });

    // Se a BRAPI estiver bloqueada, usa o último dado disponível no cache.
    if (BRAAPI_IS_PERMANENTLY_DOWN) {
        console.warn("[BRAPI - MODO FALHA] Utilizando dados do Firestore como única fonte (fallback).");
        
        for(const ticker of tickers) {
            if (!precosAtuais[ticker]) {
                const fallbackData = await getFallbackFromFirestore(ticker);
                precosAtuais[ticker] = fallbackData ? fallbackData.results[0].regularMarketPrice : 0;
            }
        }
        return precosAtuais;
    }

    // 2. Chama a BRAPI (só para os que precisam)
    const apiPromises = tickersToFetch.map(ticker => {
        const url = `https://brapi.dev/api/quote/${ticker}?token=`;
        return getFromBrapi(url).then(apiData => ({ ticker, apiData }));
    });

    const apiResults = await Promise.all(apiPromises);

    // 3. Processa e salva o resultado
    for (const { ticker, apiData } of apiResults) {
        if (apiData) {
            const priceData = apiData.results[0];
            if (priceData && priceData.regularMarketPrice) {
                precosAtuais[ticker] = priceData.regularMarketPrice;
                saveToFirestore(ticker, apiData); 
            } else {
                if (!precosAtuais[ticker]) {
                    const fallbackData = await getFallbackFromFirestore(ticker);
                    if (fallbackData) precosAtuais[ticker] = fallbackData.results[0].regularMarketPrice;
                }
            }
        } else {
            if (!precosAtuais[ticker]) {
                 const fallbackData = await getFallbackFromFirestore(ticker);
                if (fallbackData) precosAtuais[ticker] = fallbackData.results[0].regularMarketPrice;
            }
        }
    }
    
    return precosAtuais;
}

/**
 * Busca dados históricos para o gráfico de performance (com fallback).
 */
export async function fetchHistoricalData(ticker, range = '1mo') {
    if (BRAAPI_IS_PERMANENTLY_DOWN) {
        console.warn(`[BRAPI - MODO FALHA] Chamada histórica bloqueada. Usando fallback de preço atual.`);
    }
    
    const url = `https://brapi.dev/api/quote/${ticker}?range=${range}&interval=1d`;
    const data = await getFromBrapi(url);
    
    if (data && data.results && data.results.length > 0) {
        return data;
    }

    const fallbackData = await getFallbackFromFirestore(ticker);
    if (fallbackData) {
        return {
            results: [{
                symbol: ticker,
                historicalDataPrice: [{
                    date: new Date(fallbackData.data).getTime() / 1000, 
                    close: fallbackData.preco 
                }]
            }]
        };
    }

    console.error(`Erro ao buscar dados históricos de ${ticker}: Nenhuma fonte disponível.`);
    return null;
}

/**
 * REMOVIDO: fetchCryptoPrices não é mais usada, pois o Front-End agora usa fetchCurrentPrices
 * e depende da Cloud Function para alimentar o cache de criptomoedas.
 */

/**
 * Busca sugestões de ativos com base em um termo de pesquisa.
 */
export async function searchAssets(term) {
    if (term.length < 2) {
        return [];
    }
    const url = `https://brapi.dev/api/available?search=${term}`;
    const data = await getFromBrapi(url);

    if (data && data.stocks && data.stocks.length > 0) {
        const suggestions = data.stocks.slice(0, 8);
        if ('BTC'.startsWith(term.toUpperCase())) suggestions.unshift('BTC');
        if ('ETH'.startsWith(term.toUpperCase())) suggestions.unshift('ETH');
        return [...new Set(suggestions)];
    }
    return [];
}