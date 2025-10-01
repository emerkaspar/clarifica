import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';

/**
 * Calcula e renderiza a valorização do dia para a carteira de Ações.
 * @param {Array<string>} tickers - A lista de tickers de Ações na carteira.
 * @param {object} carteira - O objeto da carteira consolidada.
 * @returns {Promise<Array<object>>} - Retorna a performance diária de cada ação.
 */
async function renderAcoesDayValorization(tickers, carteira) {
    const valorizationReaisDiv = document.getElementById("acoes-valorization-reais");
    const valorizationPercentDiv = document.getElementById("acoes-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return [];

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";
    valorizationPercentDiv.className = 'valorization-pill';

    try {
        const promises = tickers.map(ticker => fetchHistoricalData(ticker, '5d'));
        const results = await Promise.all(promises);

        let totalValorizacaoReais = 0;
        let totalInvestidoPonderado = 0;
        let variacaoPonderadaTotal = 0;
        const dailyPerformance = [];

        results.forEach((data, index) => {
            if (data && data.results && data.results[0] && data.results[0].historicalDataPrice && data.results[0].historicalDataPrice.length >= 2) {
                const ticker = tickers[index];
                // API da Brapi já retorna do mais recente para o mais antigo.
                const prices = data.results[0].historicalDataPrice;
                const hoje = prices[0].close;
                const ontem = prices[1].close;
                
                if (carteira[ticker] && ontem > 0) {
                    const quantidade = carteira[ticker].quantidade;
                    const valorPosicaoAtual = hoje * quantidade;
                    const variacaoPercentual = ((hoje / ontem) - 1) * 100;
                    const variacaoReais = (hoje - ontem) * quantidade;
                    
                    totalValorizacaoReais += variacaoReais;
                    totalInvestidoPonderado += valorPosicaoAtual;
                    variacaoPonderadaTotal += variacaoPercentual * (valorPosicaoAtual / 100);
                    dailyPerformance.push({ ticker, changePercent: variacaoPercentual });
                }
            }
        });

        const variacaoPercentualFinal = totalInvestidoPonderado > 0 ? (variacaoPonderadaTotal / totalInvestidoPonderado) * 100 : 0;
        
        const isPositive = totalValorizacaoReais >= 0;
        const sinal = isPositive ? '+' : '';
        const corClasse = isPositive ? 'positive' : 'negative';
        const iconeSeta = isPositive ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';

        // ** LINHAS CORRIGIDAS / RESTAURADAS **
        const valorizacaoReaisFormatada = totalValorizacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const percentualFormatado = `${variacaoPercentualFinal.toFixed(2)}%`;
        
        valorizationReaisDiv.textContent = `${sinal}${valorizacaoReaisFormatada}`;
        valorizationReaisDiv.style.color = isPositive ? '#00d9c3' : '#ef4444';

        valorizationPercentDiv.innerHTML = `${sinal}${percentualFormatado} ${iconeSeta}`;
        valorizationPercentDiv.classList.add(corClasse);

        return dailyPerformance;

    } catch (error) {
        console.error("Erro ao calcular a valorização do dia para Ações:", error);
        valorizationReaisDiv.textContent = "Erro";
        return [];
    }
}

/**
 * Calcula e renderiza o resumo da carteira de Ações.
 * @param {object} carteira - O objeto da carteira consolidada.
 * @param {object} precosAtuais - Objeto com os preços atuais dos ativos.
 */
function renderAcoesSummary(carteira, precosAtuais) {
    let totalInvestido = 0;
    let patrimonioAtual = 0;
    let totalProventos = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const precoAtual = precosAtuais[ativo.ativo] || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            
            totalInvestido += precoMedio * ativo.quantidade;
            patrimonioAtual += precoAtual * ativo.quantidade;
            totalProventos += ativo.proventos;
        }
    });

    const rentabilidadeReais = patrimonioAtual - totalInvestido + totalProventos;
    const valorizacaoPercent = totalInvestido > 0 ? ((patrimonioAtual / totalInvestido) - 1) * 100 : 0;
    const rentabilidadePercent = totalInvestido > 0 ? (rentabilidadeReais / totalInvestido) * 100 : 0;

    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const updateField = (id, value, isCurrency = true, addSign = false) => {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = isCurrency ? formatCurrency(value) : `${value.toFixed(2)}%`;
            const sinal = value >= 0 ? '+' : '';
            element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
            element.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
            if (id === 'acoes-total-investido' || id === 'acoes-patrimonio-atual') {
                element.style.color = '#e0e0e0';
            }
        }
    };
    
    updateField('acoes-total-investido', totalInvestido);
    updateField('acoes-patrimonio-atual', patrimonioAtual);
    updateField('acoes-rentabilidade-reais', rentabilidadeReais, true, true);
    updateField('acoes-valorizacao-percent', valorizacaoPercent, false, true);
    updateField('acoes-rentabilidade-percent', rentabilidadePercent, false, true);
}

/**
 * Renderiza os destaques de rentabilidade para ações (diária e histórica).
 * @param {Array<object>} dailyPerformance - Performance diária de cada ativo.
 * @param {Array<object>} historicalPerformance - Performance histórica de cada ativo.
 */
function renderAcoesHighlights(dailyPerformance, historicalPerformance) {
    const dayContainer = document.getElementById("acoes-highlights-day");
    const historyContainer = document.getElementById("acoes-highlights-history");

    if (!dayContainer || !historyContainer) return;

    const createHtml = (item) => {
        if (!item || typeof item.changePercent !== 'number') {
            return '<div class="highlight-item"><span class="ticker">-</span><span class="value">0.00%</span></div>';
        }
        const isPositive = item.changePercent >= 0;
        const colorClass = isPositive ? 'positive' : 'negative';
        const arrow = isPositive ? '↑' : '↓';
        return `
            <div class="highlight-item">
                <span class="ticker">${item.ticker}</span>
                <span class="value ${colorClass}">${item.changePercent.toFixed(2)}% ${arrow}</span>
            </div>
        `;
    };

    // Destaques do Dia
    if (dailyPerformance && dailyPerformance.length > 0) {
        dailyPerformance.sort((a, b) => b.changePercent - a.changePercent);
        const highestDay = dailyPerformance[0];
        const lowestDay = dailyPerformance.length > 1 ? dailyPerformance[dailyPerformance.length - 1] : highestDay;
        dayContainer.innerHTML = createHtml(highestDay) + createHtml(lowestDay);
    } else {
        dayContainer.innerHTML = createHtml(null) + createHtml(null);
    }

    // Destaques Históricos
    if (historicalPerformance && historicalPerformance.length > 0) {
        historicalPerformance.sort((a, b) => b.changePercent - a.changePercent);
        const highestHistory = historicalPerformance[0];
        const lowestHistory = historicalPerformance.length > 1 ? historicalPerformance[historicalPerformance.length - 1] : highestHistory;
        historyContainer.innerHTML = createHtml(highestHistory) + createHtml(lowestHistory);
    } else {
        historyContainer.innerHTML = createHtml(null) + createHtml(null);
    }
}


/**
 * Renderiza os cards da carteira de ações.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {Array<object>} proventos - A lista completa de todos os proventos.
 */
export async function renderAcoesCarteira(lancamentos, proventos) {
    const acoesListaDiv = document.getElementById("acoes-lista");
    if (!acoesListaDiv) return;

    acoesListaDiv.innerHTML = `<p>Calculando e buscando cotações, isso pode levar alguns segundos...</p>`;

    const acoesLancamentos = lancamentos.filter(l => l.tipoAtivo === 'Ações');

    if (acoesLancamentos.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação lançada ainda.</p>`;
        document.getElementById("acoes-valorization-reais").textContent = "N/A";
        const percentDiv = document.getElementById("acoes-valorization-percent");
        if (percentDiv) {
            percentDiv.innerHTML = "";
            percentDiv.className = 'valorization-pill';
        }
        document.getElementById("acoes-total-investido").textContent = "R$ 0,00";
        document.getElementById("acoes-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("acoes-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("acoes-valorizacao-percent").textContent = "0,00%";
        document.getElementById("acoes-rentabilidade-percent").textContent = "0,00%";
        renderAcoesHighlights([], []);
        return;
    }

    const carteira = {};

    acoesLancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                quantidade: 0,
                quantidadeComprada: 0,
                valorTotalInvestido: 0,
                proventos: 0,
            };
        }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
            carteira[l.ativo].quantidadeComprada += l.quantidade;
            carteira[l.ativo].valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    proventos.forEach(p => {
        if (p.tipoAtivo === 'Ações' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação com posição em carteira.</p>`;
        renderAcoesHighlights([], []);
        return;
    }

    const dailyPerformance = await renderAcoesDayValorization(tickers, carteira);

    try {
        const precosAtuais = await fetchCurrentPrices(tickers);
        const historicalPerformance = [];

        renderAcoesSummary(carteira, precosAtuais);

        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker] || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;
            
            const variacaoReais = valorPosicaoAtual - valorInvestido;
            const variacaoPercent = valorInvestido > 0 ? (variacaoReais / valorInvestido) * 100 : 0;

            const rentabilidadeReais = variacaoReais + ativo.proventos;
            const rentabilidadePercent = valorInvestido > 0 ? (rentabilidadeReais / valorInvestido) * 100 : 0;
            
            historicalPerformance.push({ ticker, changePercent: variacaoPercent });

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Ações">
                    <div class="fii-card-ticker">${ativo.ativo}</div>
                    
                    <div class="fii-card-metric-main">
                        <div class="label">Valor Atual da Posição</div>
                        <div class="value">${valorPosicaoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                    
                    <div class="fii-card-results-container">
                        <div class="fii-card-result ${variacaoReais >= 0 ? 'positive-change' : 'negative-change'}">
                            Variação: ${variacaoReais >= 0 ? '+' : ''}${variacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacaoPercent.toFixed(2)}%) ${variacaoReais >= 0 ? '↑' : '↓'}
                        </div>
                        <div class="fii-card-result ${rentabilidadeReais >= 0 ? 'positive-change' : 'negative-change'}">
                            Rentabilidade: ${rentabilidadeReais >= 0 ? '+' : ''}${rentabilidadeReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${rentabilidadePercent.toFixed(2)}%) ${rentabilidadeReais >= 0 ? '↑' : '↓'}
                        </div>
                    </div>

                    <div class="fii-card-details">
                        <div class="detail-item">
                            <span>Valor Investido</span>
                            <span>${valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                         <div class="detail-item">
                            <span>Quantidade</span>
                            <span>${ativo.quantidade.toLocaleString('pt-BR')}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Médio</span>
                            <span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Atual</span>
                            <span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                         <div class="detail-item">
                            <span>Total Proventos</span>
                            <span>${ativo.proventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        acoesListaDiv.innerHTML = html;
        renderAcoesHighlights(dailyPerformance, historicalPerformance);

    } catch (error) {
        console.error("Erro ao renderizar carteira de Ações:", error);
        acoesListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

// Event listener para abrir o modal de detalhes quando um card for clicado.
document.getElementById("acoes-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});