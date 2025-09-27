import { fetchCurrentPrices } from '../api/brapi.js';

// A função openAtivoDetalhesModal será importada ou definida no futuro,
// por enquanto, vamos assumir que ela existe globalmente para o event listener.
// Idealmente, isso seria gerenciado por um módulo de UI principal.

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
        return;
    }

    const carteira = {};

    // 1. Consolida os lançamentos para calcular a posição atual de cada ativo
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

    // 2. Adiciona os proventos recebidos para cada ativo
    proventos.forEach(p => {
        if (p.tipoAtivo === 'Ações' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    // 3. Filtra apenas os tickers que o usuário ainda possui em carteira
    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação com posição em carteira.</p>`;
        return;
    }

    try {
        // 4. Busca os preços atuais de todos os tickers de uma vez usando a API modularizada
        const precosAtuais = await fetchCurrentPrices(tickers);

        // 5. Gera o HTML dos cards com os dados calculados e recebidos
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
// Esta parte pode ser movida para um arquivo de UI central no futuro.
document.getElementById("acoes-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});