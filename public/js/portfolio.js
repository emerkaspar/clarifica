// public/js/portfolio.js

import { fetchCurrentPrices } from './api/brapi.js'; // REMOVIDO: fetchCryptoPrices

/**
 * Função central que recebe dados brutos e retorna o estado completo e calculado da carteira.
 */
export async function calculatePortfolioState(lancamentos, proventos) {
    if (!lancamentos) {
        return { carteira: {}, totais: { patrimonio: 0, investido: 0, resultado: 0, ganhoCapital: 0, totalProventos: 0 }, precosAtuais: {} };
    }

    const carteira = {};

    // 1. Consolida Lançamentos para obter posições
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                valorTotalInvestido: 0, // Custo de aquisição da posição ATUAL
                proventosRecebidos: 0,
                // Campos auxiliares para cálculo de Preço Médio
                _quantidadeComprada: 0,
                _valorTotalComprado: 0,
            };
        }
        const ativo = carteira[l.ativo];
        if (l.tipoOperacao === 'compra') {
            ativo.quantidade += l.quantidade;
            ativo.valorTotalInvestido += l.valorTotal;
            ativo._quantidadeComprada += l.quantidade;
            ativo._valorTotalComprado += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            // Reduz o custo de aquisição proporcionalmente na venda
            if (ativo.quantidade > 0) {
                const precoMedio = ativo._valorTotalComprado / ativo._quantidadeComprada;
                ativo.valorTotalInvestido -= l.quantidade * precoMedio;
            }
            ativo.quantidade -= l.quantidade;
        }
    });

    // 2. Adiciona Proventos
    proventos.forEach(p => {
        if (carteira[p.ativo]) {
            carteira[p.ativo].proventosRecebidos += p.valor;
        }
    });

    // 3. Separa tickers e busca preços UMA ÚNICA VEZ
    const tickersAtivos = Object.values(carteira).filter(a => a.quantidade > 0 && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo)).map(a => a.ativo);
    
    // Busca todos os preços (RV e Cripto) usando a função unificada (CACHE-FIRST)
    const precosAtuais = await fetchCurrentPrices(tickersAtivos);

    // 4. Calcula métricas finais para cada ativo e os totais
    let patrimonioTotal = 0;
    let valorInvestidoTotal = 0;

    for (const ticker in carteira) {
        const ativo = carteira[ticker];
        if (ativo.quantidade <= 1e-8) { // Remove ativos com quantidade residual/zerada
            delete carteira[ticker];
            continue;
        }

        ativo.precoMedio = ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0;
        ativo.custoTotal = ativo.valorTotalInvestido < 0 ? 0 : ativo.valorTotalInvestido;

        ativo.precoAtual = precosAtuais[ticker] || 0;
        ativo.valorAtual = ativo.quantidade * ativo.precoAtual;

        if (['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo)) {
            ativo.valorAtual = ativo.custoTotal; // Valor de RF é calculado em sua própria aba
        }

        ativo.ganhoCapital = ativo.valorAtual - ativo.custoTotal;
        ativo.resultado = ativo.ganhoCapital + ativo.proventosRecebidos;
        ativo.rentabilidadePercent = ativo.custoTotal > 0 ? (ativo.resultado / ativo.custoTotal) * 100 : 0;

        patrimonioTotal += ativo.valorAtual;
        valorInvestidoTotal += ativo.custoTotal;
    }

    const totalProventosGeral = proventos.reduce((acc, p) => acc + p.valor, 0);

    return {
        carteira,
        totais: {
            patrimonio: patrimonioTotal,
            investido: valorInvestidoTotal,
            resultado: patrimonioTotal - valorInvestidoTotal,
            ganhoCapital: patrimonioTotal - valorInvestidoTotal,
            totalProventos: totalProventosGeral
        },
        precosAtuais
    };
}