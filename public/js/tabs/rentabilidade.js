// public/js/tabs/rentabilidade.js

import { fetchCurrentPrices, fetchCryptoPrices, fetchHistoricalData } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';
import { renderConsolidatedPerformanceChart } from '../charts.js';

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
export async function renderRentabilidadeTab(lancamentos, proventos, summaryData) {
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


    if (!lancamentos || lancamentos.length === 0 || !summaryData) {
        renderConsolidatedPerformanceChart(lancamentos, proventos); // Chama com dados vazios para limpar o gráfico
        return;
    }

    // --- 1. Utiliza os dados já consolidados do summary ---
    const { patrimonioTotal, valorInvestidoTotal, lucroTotal } = summaryData;
    const patrimonioAtual = patrimonioTotal;

    // --- 2. Cálculo da Rentabilidade Acumulada ---
    const rentabilidadeAcumuladaReais = lucroTotal;
    const rentabilidadeAcumuladaPercent = valorInvestidoTotal > 0 ? (lucroTotal / valorInvestidoTotal) * 100 : 0;
    updateRentabilidadeField('rentabilidade-acumulada-percent', 'rentabilidade-acumulada-reais', rentabilidadeAcumuladaPercent, rentabilidadeAcumuladaReais);


    // --- 3. Função Auxiliar para Rentabilidade de Período ---
    const calculatePeriodRentability = async (startDate) => {
        let patrimonioInicial = 0;
        const lancamentosAntes = lancamentos.filter(l => new Date(l.data) < startDate);

        // --- 3.1 Renda Fixa (RF) Patrimônio Inicial ---
        const rfLancamentosAntes = lancamentosAntes.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));
        if (rfLancamentosAntes.length > 0) {
            const dataMaisAntigaRF = rfLancamentosAntes.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, rfLancamentosAntes[0].data);
            const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntigaRF, startDate.toISOString().split('T')[0]);

            for (const ativo of rfLancamentosAntes) {
                let valorBase = ativo.valorAplicado;
                const dataAplicacao = new Date(ativo.data + 'T00:00:00');
                let valorBruto = valorBase;
                const diasCorridos = Math.max(0, Math.floor((startDate - dataAplicacao) / (1000 * 60 * 60 * 24)));

                if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                    let acumuladorCDI = 1;
                    const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                    historicoCDI
                        .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataAplicacao)
                        .forEach(item => { acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI); });
                    valorBruto = valorBase * acumuladorCDI;
                } else if (ativo.tipoRentabilidade === 'Prefixado') {
                    const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = valorBase * Math.pow(1 + taxaAnual, diasUteis / 252);
                } else if (ativo.tipoRentabilidade === 'Híbrido') {
                    let acumuladorIPCA = 1;
                    const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                    const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                    historicoIPCA
                        .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataAplicacao)
                        .forEach(item => { acumuladorIPCA *= (1 + parseFloat(item.valor) / 100); });
                    const valorCorrigido = valorBase * acumuladorIPCA;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
                }

                const lucro = valorBruto - ativo.valorAplicado;
                let aliquotaIR = 0;
                if (lucro > 0 && !['LCI', 'LCA'].includes(ativo.tipoAtivo)) {
                    if (diasCorridos <= 180) aliquotaIR = 0.225;
                    else if (diasCorridos <= 360) aliquotaIR = 0.20;
                    else if (diasCorridos <= 720) aliquotaIR = 0.175;
                    else aliquotaIR = 0.15;
                }
                patrimonioInicial += (valorBruto - (lucro * aliquotaIR));
            }
        }

        // --- 3.2 Renda Variável (RV) Patrimônio Inicial ---
        const carteiraInicialRV = {};
        lancamentosAntes
            .filter(l => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo))
            .forEach(l => {
                if (!carteiraInicialRV[l.ativo]) {
                    carteiraInicialRV[l.ativo] = { quantidade: 0, tipoAtivo: l.tipoAtivo, _valorTotalComprado: 0, _quantidadeComprada: 0 };
                }
                const ativo = carteiraInicialRV[l.ativo];
                if (l.tipoOperacao === 'compra') {
                    ativo.quantidade += l.quantidade;
                    ativo._quantidadeComprada += l.quantidade;
                    ativo._valorTotalComprado += l.valorTotal;
                } else if (l.tipoOperacao === 'venda') {
                    ativo.quantidade -= l.quantidade;
                }
            });

        const tickersNormais = Object.keys(carteiraInicialRV).filter(t => carteiraInicialRV[t].quantidade > 0 && carteiraInicialRV[t].tipoAtivo !== 'Cripto');
        if (tickersNormais.length > 0) {
            const historicalDataPromises = tickersNormais.map(t => fetchHistoricalData(t, '1y'));
            const historicalDataResults = await Promise.all(historicalDataPromises);
            historicalDataResults.forEach((data, index) => {
                const ticker = tickersNormais[index];
                const price = getPriceOnDate(data, startDate);
                const ativo = carteiraInicialRV[ticker];
                if (price) {
                    patrimonioInicial += ativo.quantidade * price;
                } else {
                    const precoMedio = ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0;
                    patrimonioInicial += ativo.quantidade * precoMedio;
                }
            });
        }
        const tickersCripto = Object.keys(carteiraInicialRV).filter(t => carteiraInicialRV[t].quantidade > 0 && carteiraInicialRV[t].tipoAtivo === 'Cripto');
        tickersCripto.forEach(ticker => {
            const ativo = carteiraInicialRV[ticker];
            const precoMedio = ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0;
            patrimonioInicial += ativo.quantidade * precoMedio;
        });

        // --- 3.3 Cálculo Final da Rentabilidade do Período ---
        const lancamentosPeriodo = lancamentos.filter(l => new Date(l.data) >= startDate);
        const aportesLiquidosPeriodo = lancamentosPeriodo.reduce((acc, l) => acc + (l.tipoOperacao === 'compra' ? l.valorTotal : -l.valorTotal), 0);
        const proventosPeriodo = proventos.filter(p => new Date(p.dataPagamento) >= startDate).reduce((acc, p) => acc + p.valor, 0);

        const rentabilidadeReais = (patrimonioAtual - patrimonioInicial - aportesLiquidosPeriodo) + proventosPeriodo;
        const baseCalculo = patrimonioInicial + aportesLiquidosPeriodo;
        const rentabilidadePercent = Math.abs(baseCalculo) < 0.01 ? 0 : (rentabilidadeReais / baseCalculo) * 100;

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

    // --- 6. Renderiza o Gráfico de Performance Consolidado ---
    renderConsolidatedPerformanceChart(lancamentos, proventos);
}