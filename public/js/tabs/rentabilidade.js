// public/js/tabs/rentabilidade.js

import { fetchCurrentPrices, fetchCryptoPrices, fetchHistoricalData } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';

// Função auxiliar para formatar valores monetários
const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Função auxiliar para atualizar os campos na UI
const updateRentabilidadeField = (percentId, reaisId, percentValue, reaisValue) => {
    const percentEl = document.getElementById(percentId);
    const reaisEl = document.getElementById(reaisId);
    const value = percentValue || 0;

    if (percentEl) {
        percentEl.textContent = `${value.toFixed(2)}%`;
        percentEl.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
    }
    if (reaisEl) {
        reaisEl.textContent = formatCurrency(reaisValue || 0);
    }
};

// Encontra o preço de fechamento mais próximo da data alvo nos dados históricos
const getPriceOnDate = (historicalData, targetDate) => {
    if (!historicalData || !historicalData.results || !historicalData.results[0]?.historicalDataPrice) {
        return null;
    }
    const prices = historicalData.results[0].historicalDataPrice; // API retorna do mais recente para o mais antigo
    const targetTimestamp = targetDate.getTime() / 1000;

    for (const price of prices) {
        if (price.date <= targetTimestamp) {
            return price.close;
        }
    }
    return prices.length > 0 ? prices[prices.length - 1].close : null; // Fallback para o preço mais antigo
};


/**
 * Função principal que calcula e renderiza todos os cards da aba de Rentabilidade.
 */
export async function renderRentabilidadeTab(lancamentos, proventos) {
    const rentabilidadePane = document.getElementById('rentabilidade');
    if (!rentabilidadePane) return;

    // Reseta os campos antes de calcular
    updateRentabilidadeField('rentabilidade-acumulada-percent', 'rentabilidade-acumulada-reais', 0, 0);
    updateRentabilidadeField('rentabilidade-ano-percent', 'rentabilidade-ano-reais', 0, 0);
    updateRentabilidadeField('rentabilidade-mes-percent', 'rentabilidade-mes-reais', 0, 0);
    const realPercentEl = document.getElementById('rentabilidade-real-percent');
    const realStatusEl = document.getElementById('rentabilidade-real-status');
    if (realPercentEl) realPercentEl.textContent = '0,00%';
    if (realStatusEl) realStatusEl.textContent = '...';


    if (!lancamentos || lancamentos.length === 0) {
        return;
    }

    // --- 1. Consolidação da Carteira e Cálculo do Patrimônio Atual ---
    const carteira = {};
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                valorTotalInvestido: 0,
                quantidadeComprada: 0,
            };
        }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
            carteira[l.ativo].quantidadeComprada += l.quantidade;
            carteira[l.ativo].valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            if (carteira[l.ativo].quantidadeComprada > 0) {
                const precoMedio = carteira[l.ativo].valorTotalInvestido / carteira[l.ativo].quantidadeComprada;
                carteira[l.ativo].valorTotalInvestido -= l.quantidade * precoMedio;
            }
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    const tickersNormais = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo !== 'Cripto' && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo)).map(a => a.ativo);
    const tickersCripto = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo === 'Cripto').map(a => a.ativo);

    const [precosNormais, precosCripto] = await Promise.all([fetchCurrentPrices(tickersNormais), fetchCryptoPrices(tickersCripto)]);
    const precosAtuais = { ...precosNormais, ...precosCripto };

    let patrimonioAtual = 0;
    let valorInvestidoTotal = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const precoAtual = precosAtuais[ativo.ativo] || precoMedio;
            patrimonioAtual += precoAtual * ativo.quantidade;
            valorInvestidoTotal += ativo.valorTotalInvestido;
        }
    });

    const totalProventos = proventos.reduce((acc, p) => acc + p.valor, 0);

    // --- 2. Cálculo da Rentabilidade Acumulada ---
    const rentabilidadeAcumuladaReais = patrimonioAtual - valorInvestidoTotal + totalProventos;
    const rentabilidadeAcumuladaPercent = valorInvestidoTotal > 0 ? (rentabilidadeAcumuladaReais / valorInvestidoTotal) * 100 : 0;
    updateRentabilidadeField('rentabilidade-acumulada-percent', 'rentabilidade-acumulada-reais', rentabilidadeAcumuladaPercent, rentabilidadeAcumuladaReais);

    // --- 3. Função Auxiliar para Rentabilidade de Período ---
    const calculatePeriodRentability = async (startDate) => {
        let patrimonioInicial = 0;
        const carteiraInicial = {};
        const lancamentosAntes = lancamentos.filter(l => new Date(l.data) < startDate);

        lancamentosAntes.forEach(l => {
            if (!carteiraInicial[l.ativo]) {
                carteiraInicial[l.ativo] = { quantidade: 0, tipoAtivo: l.tipoAtivo };
            }
            carteiraInicial[l.ativo].quantidade += (l.tipoOperacao === 'compra' ? l.quantidade : -l.quantidade);
        });

        const tickersIniciais = Object.keys(carteiraInicial).filter(t => carteiraInicial[t].quantidade > 0 && carteiraInicial[t].tipoAtivo !== 'Cripto' && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(carteiraInicial[t].tipoAtivo));

        if (tickersIniciais.length > 0) {
            const historicalDataPromises = tickersIniciais.map(t => fetchHistoricalData(t, '1y'));
            const historicalDataResults = await Promise.all(historicalDataPromises);

            historicalDataResults.forEach((data, index) => {
                const ticker = tickersIniciais[index];
                const price = getPriceOnDate(data, startDate);
                if (price) {
                    patrimonioInicial += carteiraInicial[ticker].quantidade * price;
                }
            });
        }

        const lancamentosPeriodo = lancamentos.filter(l => new Date(l.data) >= startDate);
        const aportesLiquidosPeriodo = lancamentosPeriodo.reduce((acc, l) => acc + (l.tipoOperacao === 'compra' ? l.valorTotal : -l.valorTotal), 0);
        const proventosPeriodo = proventos.filter(p => new Date(p.dataPagamento) >= startDate).reduce((acc, p) => acc + p.valor, 0);

        const rentabilidadeReais = (patrimonioAtual - patrimonioInicial - aportesLiquidosPeriodo) + proventosPeriodo;
        const baseCalculo = patrimonioInicial + aportesLiquidosPeriodo;
        const rentabilidadePercent = baseCalculo !== 0 ? (rentabilidadeReais / baseCalculo) * 100 : 0;

        return { reais: rentabilidadeReais, percent: rentabilidadePercent };
    };

    // --- 4. Cálculo da Rentabilidade no Ano e Mês ---
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [rentabilidadeAno, rentabilidadeMes] = await Promise.all([
        calculatePeriodRentability(startOfYear),
        calculatePeriodRentability(startOfMonth)
    ]);

    updateRentabilidadeField('rentabilidade-ano-percent', 'rentabilidade-ano-reais', rentabilidadeAno.percent, rentabilidadeAno.reais);
    updateRentabilidadeField('rentabilidade-mes-percent', 'rentabilidade-mes-reais', rentabilidadeMes.percent, rentabilidadeMes.reais);

    // --- 5. Cálculo da Rentabilidade Real ---
    const dataMaisAntiga = lancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, lancamentos[0].data);
    const { historicoIPCA } = await fetchIndexers(dataMaisAntiga, today.toISOString().split('T')[0]);

    if (historicoIPCA.length > 0) {
        const acumuladoIPCA = historicoIPCA.reduce((acc, item) => acc * (1 + parseFloat(item.valor) / 100), 1);
        const inflacaoPercentual = (acumuladoIPCA - 1) * 100;
        const rentabilidadeRealPercent = (((1 + rentabilidadeAcumuladaPercent / 100) / (1 + inflacaoPercentual / 100)) - 1) * 100;

        if (realPercentEl) {
            realPercentEl.textContent = `${rentabilidadeRealPercent.toFixed(2)}%`;
            realPercentEl.style.color = rentabilidadeRealPercent >= 0 ? '#00d9c3' : '#ef4444';
        }
        if (realStatusEl) {
            realStatusEl.textContent = rentabilidadeRealPercent >= 0 ? 'Acima da inflação' : 'Abaixo da inflação';
            realStatusEl.style.color = rentabilidadeRealPercent >= 0 ? '#00d9c3' : '#ef4444';
        }
    }
}