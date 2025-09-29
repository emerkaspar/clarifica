import { fetchCryptoPrices } from '../api/brapi.js';

/**
 * Renderiza os cards da carteira de Criptomoedas.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {Array<object>} proventos - A lista completa de todos os proventos.
 */
export async function renderCriptoCarteira(lancamentos, proventos) {
    const criptoListaDiv = document.getElementById("cripto-lista");
    if (!criptoListaDiv) return;

    criptoListaDiv.innerHTML = `<p>Calculando e buscando cotações, isso pode levar alguns segundos...</p>`;

    const criptoLancamentos = lancamentos.filter(l => l.tipoAtivo === 'Cripto');

    if (criptoLancamentos.length === 0) {
        criptoListaDiv.innerHTML = `<p>Nenhuma Criptomoeda lançada ainda.</p>`;
        return;
    }

    const carteira = {};

    // 1. Consolida os lançamentos
    criptoLancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                quantidade: 0,
                quantidadeComprada: 0,
                valorTotalInvestido: 0,
                proventos: 0, // Embora raro, mantém a estrutura
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

    // 2. Filtra os tickers com posição em carteira
    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        criptoListaDiv.innerHTML = `<p>Nenhuma Criptomoeda com posição em carteira.</p>`;
        return;
    }

    try {
        // 4. Busca os preços usando a função correta para cripto
        const precosAtuais = await fetchCryptoPrices(tickers);

        // 5. Gera o HTML dos cards
        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker] || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;
            const resultado = valorPosicaoAtual - valorInvestido;
            const variacao = precoAtual && precoMedio ? ((precoAtual / precoMedio) - 1) * 100 : 0;

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Cripto">
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
                            <span>${ativo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Médio</span>
                            <span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Atual</span>
                            <span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        criptoListaDiv.innerHTML = html;

    } catch (error) {
        console.error("Erro ao renderizar carteira de Cripto:", error);
        criptoListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

// Event listener para abrir o modal de detalhes quando um card for clicado.
document.getElementById("cripto-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});