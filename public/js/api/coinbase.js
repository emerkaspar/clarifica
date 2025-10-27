import { getFromFirestore, saveToFirestore, getFallbackFromFirestore } from './caching.js';

/**
 * Função interna para buscar um único preço da Coinbase.
 * @param {string} ticker - O ticker (ex: "BTC").
 * @returns {Promise<number|null>} - O preço como número ou nulo.
 */
async function getFromCoinbase(ticker) {
    // A API da Coinbase espera pares (ex: "BTC-BRL")
    const pair = `${ticker}-BRL`;
    const url = `https://api.coinbase.com/v2/prices/${pair}/spot`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[Coinbase] Falha na resposta da API para ${ticker}: Status ${response.status}`);
            return null;
        }
        const data = await response.json();
        
        // A resposta da Coinbase é: { data: { base: "BTC", currency: "BRL", amount: "350000.00" } }
        if (data && data.data && data.data.amount) {
            // Retorna o preço como um número
            return parseFloat(data.data.amount);
        }
        console.warn(`[Coinbase] Resposta inesperada para ${ticker}:`, data);
        return null;
    } catch (error) {
        console.error(`[Coinbase] Erro de rede ao chamar ${ticker}:`, error);
        return null;
    }
}

/**
 * Busca os preços atuais para uma lista de tickers de Criptomoedas na Coinbase.
 * Utiliza o mesmo cache do Firestore que a Brapi usava.
 * Retorna um objeto no formato: { "TICKER": { price: 123.45, logoUrl: null } }
 */
export async function fetchCoinbasePrices(tickers) {
    if (!tickers || tickers.length === 0) {
        return {};
    }

    const precosEInfos = {};
    let tickersToFetch = [];
    
    // 1. Consulta Cache (lendo o cache existente)
    const cacheResults = await Promise.all(tickers.map(ticker => getFromFirestore(ticker)));
    
    cacheResults.forEach((result, index) => {
        const ticker = tickers[index];
        // O cache está no formato da Brapi (results[0].regularMarketPrice)
        const priceData = result.data?.results?.[0]; 
        
        if (result.isRecent && priceData) {
            // Se o cache é recente, usa o preço (pode ser da Brapi ou Coinbase)
            precosEInfos[ticker] = {
                price: priceData.regularMarketPrice, 
                logoUrl: priceData.logourl || null  // Mantém o logo antigo se houver
            };
        } else {
            tickersToFetch.push(ticker);
            if (priceData) { // Usa dado antigo se disponível (fallback)
                precosEInfos[ticker] = {
                    price: priceData.regularMarketPrice,
                    logoUrl: priceData.logourl || null
                };
            }
        }
    });

    // 2. Chama a Coinbase API (apenas para os tickers que precisam de atualização)
    if (tickersToFetch.length > 0) {
        console.log("[Coinbase] Buscando cotações para:", tickersToFetch);
        
        const fetchPromises = tickersToFetch.map(async (ticker) => {
            const price = await getFromCoinbase(ticker);
            
            if (price !== null) {
                const logoAntigo = precosEInfos[ticker]?.logoUrl || null;
                precosEInfos[ticker] = {
                    price: price,
                    logoUrl: logoAntigo // Mantém logo antigo se existir
                };
                
                // 3. Salva no Firestore no formato que o cache espera (simulando a Brapi)
                // Isso garante que o fallback e o cache recente funcionem
                const simulatedBrapiData = {
                    results: [{
                        symbol: ticker,
                        regularMarketPrice: price,
                        logourl: logoAntigo // Salva o logo antigo
                    }]
                };
                saveToFirestore(ticker, simulatedBrapiData);
            }
        });
        
        await Promise.all(fetchPromises);
    }
    
    // 4. Garante que todos os tickers tenham um objeto, mesmo que a API falhe
    for (const ticker of tickers) {
        if (!precosEInfos[ticker]) {
            const fallbackData = await getFallbackFromFirestore(ticker);
            const fallbackPriceData = fallbackData?.results?.[0];
            precosEInfos[ticker] = {
                price: fallbackPriceData?.regularMarketPrice || 0,
                logoUrl: fallbackPriceData?.logourl || null
            };
        }
    }
    
    return precosEInfos;
}