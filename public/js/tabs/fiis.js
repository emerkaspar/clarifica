import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
import { renderDivisaoFiisCharts } from './fiisCharts.js';


/**
 * Calcula e renderiza a valorização do dia para a carteira de FIIs.
 * @param {Array<string>} tickers - A lista de tickers de FIIs na carteira.
 * @param {object} carteira - O objeto da carteira consolidada.
 */
async function renderFiisDayValorization(tickers, carteira) {
    const valorizationReaisDiv = document.getElementById("fiis-valorization-reais");
    const valorizationPercentDiv = document.getElementById("fiis-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return;

    // Estado inicial enquanto calcula
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
                const prices = data.results[0].historicalDataPrice.reverse(); // Garante que o mais recente está em [0]
                const hoje = prices[0].close;
                const ontem = prices[1].close;
                const quantidade = carteira[ticker].quantidade;
                const valorPosicaoAtual = hoje * quantidade;

                if (ontem > 0) {
                    const variacaoPercentual = ((hoje / ontem) - 1);
                    const variacaoReais = (hoje - ontem) * quantidade;
                    
                    totalValorizacaoReais += variacaoReais;
                    totalInvestidoPonderado += valorPosicaoAtual; // Usar valor atual como peso
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
        console.error("Erro ao calcular a valorização do dia para FIIs:", error);
        valorizationReaisDiv.textContent = "Erro";
    }
}


/**
 * Renderiza a aba de Fundos Imobiliários (FIIs).
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {Array<object>} proventos - A lista completa de todos os proventos.
 * @param {object} classificacoes - As classificações de ativos salvas.
 * @param {object} divisaoIdeal - As porcentagens da divisão ideal salvas.
 */
export async function renderFiisCarteira(lancamentos, proventos, classificacoes, divisaoIdeal) {
    const fiisListaDiv = document.getElementById("fiis-lista");
    if (!fiisListaDiv) return;

    fiisListaDiv.innerHTML = `<p>Calculando e buscando cotações, isso pode levar alguns segundos...</p>`;

    const fiisLancamentos = lancamentos.filter(l => l.tipoAtivo === 'FIIs');

    if (fiisLancamentos.length === 0) {
        fiisListaDiv.innerHTML = `<p>Nenhum FII lançado ainda.</p>`;
        renderDivisaoFiisCharts(null, null);
        document.getElementById("fiis-valorization-reais").textContent = "N/A";
        document.getElementById("fiis-valorization-percent").innerHTML = "";
        document.getElementById("fiis-valorization-percent").className = 'valorization-pill';
        return;
    }

    const carteira = {};

    fiisLancamentos.forEach(l => {
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
        if (p.tipoAtivo === 'FIIs' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        fiisListaDiv.innerHTML = `<p>Nenhum FII com posição em carteira.</p>`;
        renderDivisaoFiisCharts(null, null);
        document.getElementById("fiis-valorization-reais").textContent = "N/A";
        document.getElementById("fiis-valorization-percent").innerHTML = "";
        document.getElementById("fiis-valorization-percent").className = 'valorization-pill';
        return;
    }

    // Chama a nova função de valorização
    renderFiisDayValorization(tickers, carteira);


    try {
        const precosAtuais = await fetchCurrentPrices(tickers);

        // --- CÁLCULO DA POSIÇÃO ATUAL E RENDERIZAÇÃO DOS GRÁFICOS ---
        let totalValorFiis = 0;
        const valoresAtuais = {
            tipo: { 'Tijolo': 0, 'Papel': 0 },
            risco: { 'Arrojado': 0, 'Crescimento': 0, 'Ancoragem': 0 },
            especieTijolo: { 'Lajes corporativas': 0, 'Shoppings e centros comerciais': 0, 'Logística e galpões industriais': 0, 'Outros': 0 },
            especiePapel: { 'Atrelado ao CDI': 0, 'Atrelado ao IPCA': 0 }
        };

        tickers.forEach(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker] || 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            totalValorFiis += valorPosicaoAtual;

            const classif = classificacoes[ticker]?.classificacoes;
            if (classif) {
                if (classif['Tipo FII'] === 'Tijolo') valoresAtuais.tipo.Tijolo += valorPosicaoAtual;
                if (classif['Tipo FII'] === 'Papel') valoresAtuais.tipo.Papel += valorPosicaoAtual;

                // CORREÇÃO APLICADA AQUI:
                // A verificação agora checa se a *chave* existe no objeto, em vez de checar se o *valor* é maior que zero.
                if (classif['Risco FII'] in valoresAtuais.risco) {
                    valoresAtuais.risco[classif['Risco FII']] += valorPosicaoAtual;
                }

                if (classif['Tipo FII'] === 'Tijolo') {
                    const especie = classif['Espécie'];
                    if (valoresAtuais.especieTijolo.hasOwnProperty(especie)) {
                        valoresAtuais.especieTijolo[especie] += valorPosicaoAtual;
                    } else {
                        valoresAtuais.especieTijolo['Outros'] += valorPosicaoAtual;
                    }
                } else if (classif['Tipo FII'] === 'Papel') {
                    if (valoresAtuais.especiePapel.hasOwnProperty(classif['Espécie'])) {
                        valoresAtuais.especiePapel[classif['Espécie']] += valorPosicaoAtual;
                    }
                }
            }
        });

        // Geração do HTML do card (lógica existente)
        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker] || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;
            const resultado = valorPosicaoAtual - valorInvestido;
            const variacao = precoAtual && precoMedio ? ((precoAtual / precoMedio) - 1) * 100 : 0;

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="FIIs">
                    <div class="fii-card-ticker">${ativo.ativo}</div>
                    <div class="fii-card-metric-main">
                        <div class="label">Valor Atual da Posição</div>
                        <div class="value">${valorPosicaoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                    <div class="fii-card-result ${resultado >= 0 ? 'positive-change' : 'negative-change'}">
                        ${resultado >= 0 ? '+' : ''}${resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacao.toFixed(2)}%)
                    </div>
                    <div class="fii-card-details">
                        <div class="detail-item"><span>Valor Investido</span><span>${valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Quantidade</span><span>${ativo.quantidade.toLocaleString('pt-BR')}</span></div>
                        <div class="detail-item"><span>Preço Médio</span><span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Preço Atual</span><span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Total Proventos</span><span>${ativo.proventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                    </div>
                </div>
            `;
        }).join('');

        fiisListaDiv.innerHTML = html;

        // Converte valores acumulados em percentuais
        const divisaoAtualPercentual = JSON.parse(JSON.stringify(valoresAtuais)); // Deep copy
        for (const categoria in divisaoAtualPercentual) {
            for (const subcat in divisaoAtualPercentual[categoria]) {
                divisaoAtualPercentual[categoria][subcat] = totalValorFiis > 0 ? (valoresAtuais[categoria][subcat] / totalValorFiis) * 100 : 0;
            }
        }

        // Chama a função para renderizar os gráficos de divisão
        renderDivisaoFiisCharts(divisaoAtualPercentual, divisaoIdeal);

    } catch (error) {
        console.error("Erro ao renderizar carteira de FIIs:", error);
        fiisListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

// Event listener para abrir o modal de detalhes quando um card for clicado.
document.getElementById("fiis-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});