// O seu token da API Brapi. Mantê-lo aqui centraliza a configuração.
const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";

/**
 * Busca os preços atuais para uma lista de tickers.
 * @param {string[]} tickers - Um array de tickers. Ex: ['PETR4', 'VALE3']
 * @returns {Promise<{[ticker: string]: number}>} Um objeto mapeando cada ticker ao seu preço atual.
 */
export async function fetchCurrentPrices(tickers) {
    if (!tickers || tickers.length === 0) {
        return {};
    }

    const precosAtuais = {};
    // A API da Brapi permite buscar múltiplos tickers de uma vez, separados por vírgula.
    const tickersString = tickers.join(',');

    try {
        const response = await fetch(`https://brapi.dev/api/quote/${tickersString}?token=${BRAAPI_TOKEN}`);
        const data = await response.json();

        if (response.ok && data && data.results) {
            data.results.forEach(result => {
                precosAtuais[result.symbol] = result.regularMarketPrice;
            });
        } else {
            console.warn(`Não foi possível buscar os preços para: ${tickersString}`);
        }
    } catch (error) {
        console.error("Erro ao buscar cotações na Brapi:", error);
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
        // Retorna null ou um objeto de erro para que a função que chamou saiba que falhou
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
            return data.stocks.slice(0, 10); // Retorna apenas os 10 primeiros
        }
        return [];
    } catch (error) {
        console.error("Erro ao buscar sugestões de ativos:", error);
        return [];
    }
}