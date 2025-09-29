// O seu token da API Brapi. Mantê-lo aqui centraliza a configuração.
const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";

/**
 * Busca os preços atuais para uma lista de tickers de AÇÕES/FIIs/ETFs.
 * @param {string[]} tickers - Um array de tickers. Ex: ['PETR4', 'VALE3']
 * @returns {Promise<{[ticker: string]: number}>} Um objeto mapeando cada ticker ao seu preço atual.
 */
export async function fetchCurrentPrices(tickers) {
    if (!tickers || tickers.length === 0) {
        return {};
    }

    const precosAtuais = {};
    const promises = tickers.map(ticker =>
        fetch(`https://brapi.dev/api/quote/${ticker}?token=${BRAAPI_TOKEN}`)
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                console.warn(`Não foi possível buscar o preço para: ${ticker}`);
                return null;
            })
    );

    try {
        const results = await Promise.all(promises);
        results.forEach(data => {
            if (data && data.results && data.results[0]) {
                const result = data.results[0];
                precosAtuais[result.symbol] = result.regularMarketPrice;
            }
        });
    } catch (error) {
        console.error("Erro ao buscar múltiplas cotações na Brapi:", error);
    }

    return precosAtuais;
}

/**
 * (FUNÇÃO ATUALIZADA) Busca os preços atuais para uma lista de CRIPTOMOEDAS usando a API da CoinGecko.
 * @param {string[]} tickers - Um array de tickers de cripto. Ex: ['BTC', 'ETH']
 * @returns {Promise<{[ticker: string]: number}>} Um objeto mapeando cada ticker ao seu preço em BRL.
 */
export async function fetchCryptoPrices(tickers) {
    if (!tickers || tickers.length === 0) {
        return {};
    }

    // Mapeia os tickers da aplicação para os IDs da API da CoinGecko
    const tickerToCoinGeckoId = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        // Adicione outras criptos aqui conforme necessário
    };
    const reverseMap = Object.fromEntries(Object.entries(tickerToCoinGeckoId).map(a => a.reverse()));

    const coinGeckoIds = tickers.map(t => tickerToCoinGeckoId[t]).filter(id => id);
    if (coinGeckoIds.length === 0) {
        console.warn("Nenhum ticker de cripto válido para buscar na CoinGecko.");
        return {};
    }

    const idsString = coinGeckoIds.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsString}&vs_currencies=brl`;

    const precosAtuais = {};

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Falha ao buscar cotações de criptomoedas na CoinGecko');
        }

        const data = await response.json();

        for (const coinId in data) {
            const originalTicker = reverseMap[coinId];
            if (originalTicker && data[coinId].brl) {
                precosAtuais[originalTicker] = data[coinId].brl;
            }
        }
    } catch (error) {
        console.error("Erro ao buscar cotações de cripto na CoinGecko:", error);
    }

    return precosAtuais;
}


/**
 * Busca dados históricos para o gráfico de performance.
 * @param {string} ticker - O ticker do ativo.
 * @param {string} range - O período (ex: '3mo', '1y').
 * @returns {Promise<any>} O objeto de resposta da API com os dados históricos.
 */
export async function fetchHistoricalData(ticker, range = '3mo') {
    // ATENÇÃO: A busca de histórico para cripto precisaria de uma lógica separada
    // usando a API da CoinGecko, pois a Brapi não fornecerá.
    // Por enquanto, o gráfico de performance para cripto não funcionará.
    try {
        const response = await fetch(`https://brapi.dev/api/quote/${ticker}?range=${range}&interval=1d&token=${BRAAPI_TOKEN}`);
        if (!response.ok) {
            throw new Error(`Falha ao buscar dados históricos para ${ticker}`);
        }
        const data = await response.json();
        if (data.error || !data.results || data.results.length === 0) {
            throw new Error(`Dados históricos indisponíveis para ${ticker}`);
        }
        return data;
    } catch (error) {
        console.error(`Erro ao buscar dados históricos de ${ticker}:`, error);
        return null;
    }
}

/**
 * Busca sugestões de ativos com base em um termo de pesquisa.
 * @param {string} term - O termo a ser pesquisado.
 * @returns {Promise<string[]>} Uma lista de tickers correspondentes.
 */
export async function searchAssets(term) {
    if (term.length < 2) {
        return [];
    }
    try {
        const response = await fetch(`https://brapi.dev/api/available?search=${term}`);
        const data = await response.json();
        if (data && data.stocks && data.stocks.length > 0) {
            // Inclui sugestão de BTC e ETH se o termo for compatível
            const suggestions = data.stocks.slice(0, 8);
            if ('BTC'.startsWith(term.toUpperCase())) suggestions.unshift('BTC');
            if ('ETH'.startsWith(term.toUpperCase())) suggestions.unshift('ETH');
            return [...new Set(suggestions)]; // Garante que não haja duplicatas
        }
        return [];
    } catch (error) {
        console.error("Erro ao buscar sugestões de ativos:", error);
        return [];
    }
}