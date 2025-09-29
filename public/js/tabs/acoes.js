import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';

/**
 * Calcula e renderiza a valorização do dia para a carteira de Ações.
 * @param {Array<string>} tickers - A lista de tickers de Ações na carteira.
 * @param {object} carteira - O objeto da carteira consolidada.
 */
async function renderAcoesDayValorization(tickers, carteira) {
    const valorizationReaisDiv = document.getElementById("acoes-valorization-reais");
    const valorizationPercentDiv = document.getElementById("acoes-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return;

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";
    valorizationPercentDiv.className = 'valorization-pill';

    try {
        const promises = tickers.map(ticker => fetchHistoricalData(ticker, '5d'));
        const results = await Promise.all(promises);

        let totalValorizacaoReais = 0;
        let totalInvestidoPonderado = 0;
        let variacaoPonderadaTotal = 0;

        results.forEach((data, index) => {
            if (data && data.results && data.results[0] && data.results[0].historicalDataPrice.length >= 2) {
                const ticker = tickers[index];
                const prices = data.results[0].historicalDataPrice.reverse();
                const hoje = prices[0].close;
                const ontem = prices[1].close;
                const quantidade = carteira[ticker].quantidade;
                const valorPosicaoAtual = hoje * quantidade;

                if (ontem > 0) {
                    const variacaoPercentual = ((hoje / ontem) - 1);
                    const variacaoReais = (hoje - ontem) * quantidade;
                    
                    totalValorizacaoReais += variacaoReais;
                    totalInvestidoPonderado += valorPosicaoAtual;
                    variacaoPonderadaTotal += variacaoPercentual * valorPosicaoAtual;
                }
            }
        });

        const variacaoPercentualFinal = totalInvestidoPonderado > 0 ? (variacaoPonderadaTotal / totalInvestidoPonderado) * 100 : 0;
        
        const isPositive = totalValorizacaoReais >= 0;
        const sinal = isPositive ? '+' : '';
        const corClasse = isPositive ? 'positive' : 'negative';
        const iconeSeta = isPositive ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';

        const valorizacaoReaisFormatada = totalValorizacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const percentualFormatado = `${variacaoPercentualFinal.toFixed(2)}%`;
        
        valorizationReaisDiv.textContent = `${sinal}${valorizacaoReaisFormatada}`;
        valorizationReaisDiv.style.color = isPositive ? '#00d9c3' : '#ef4444';

        valorizationPercentDiv.innerHTML = `${sinal}${percentualFormatado} ${iconeSeta}`;
        valorizationPercentDiv.classList.add(corClasse);

    } catch (error) {
        console.error("Erro ao calcular a valorização do dia para Ações:", error);
        valorizationReaisDiv.textContent = "Erro ao carregar";
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
    const formatPercent = (value) => `${value.toFixed(2)}%`;

    const updateField = (id, value, isCurrency = true, addSign = false) => {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = isCurrency ? formatCurrency(value) : formatPercent(value);
            const sinal = value >= 0 ? '+' : '';
            element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
            element.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
            if (id === 'acoes-total-investido' || id === 'acoes-patrimonio-atual') {
                element.style.color = '#e0e0e0'; // Cor padrão para valores não-indicativos
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
        const reaisDiv = document.getElementById("acoes-valorization-reais");
        const percentDiv = document.getElementById("acoes-valorization-percent");
        if (reaisDiv) reaisDiv.textContent = "N/A";
        if (percentDiv) {
            percentDiv.innerHTML = "";
            percentDiv.className = 'valorization-pill';
        }
        // Limpa também o card de resumo
        document.getElementById("acoes-total-investido").textContent = "R$ 0,00";
        document.getElementById("acoes-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("acoes-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("acoes-valorizacao-percent").textContent = "0,00%";
        document.getElementById("acoes-rentabilidade-percent").textContent = "0,00%";
        return;
    }

    const carteira = {};

    // 1. Consolida os lançamentos
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

    // 2. Adiciona os proventos
    proventos.forEach(p => {
        if (p.tipoAtivo === 'Ações' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    // 3. Filtra os tickers com posição
    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação com posição em carteira.</p>`;
        return;
    }

    renderAcoesDayValorization(tickers, carteira);

    try {
        const precosAtuais = await fetchCurrentPrices(tickers);

        // Renderiza o card de resumo
        renderAcoesSummary(carteira, precosAtuais);

        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker] || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;
            const resultado = valorPosicaoAtual - valorInvestido;
            const variacao = precoAtual && precoMedio ? ((precoAtual / precoMedio) - 1) * 100 : 0;

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Ações">
                    <div class="fii-card-ticker">${ativo.ativo}</div>
                    
                    <div class="fii-card-metric-main">
                        <div class="label">Valor Atual da Posição</div>
                        <div class="value">${valorPosicaoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                    
                    <div class="fii-card-result ${resultado >= 0 ? 'positive-change' : 'negative-change'}">
                        ${resultado >= 0 ? '+' : ''}${resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacao.toFixed(2)}%)
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