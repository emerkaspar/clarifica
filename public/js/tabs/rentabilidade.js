// public/js/tabs/rentabilidade.js
import { renderConsolidatedPerformanceChart } from '../charts.js';
import { db, auth } from '../firebase-config.js';
import { collection, query, where, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { fetchHistoricalData, fetchCurrentPrices } from '../api/brapi.js';


// --- ESTADO GLOBAL DO MÓDULO ---
let dailyVariationChart = null;
let allHistoricoPatrimonio = [];

// --- FUNÇÕES DE RENTABILIDADE (CARDS DE RESUMO) ---

/**
 * Renderiza o card de "Resumo da Carteira" consolidado.
 */
function renderConsolidatedSummary(summaryData) {
    if (!summaryData) return;

    const { patrimonioTotal, valorInvestidoTotal, lucroTotal, ganhoCapital } = summaryData;
    const rentabilidadePercent = valorInvestidoTotal > 0 ? (lucroTotal / valorInvestidoTotal) * 100 : 0;

    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('rentabilidade-consolidada-total-investido').textContent = formatCurrency(valorInvestidoTotal);
    document.getElementById('rentabilidade-consolidada-patrimonio-atual').textContent = formatCurrency(patrimonioTotal);
    document.getElementById('rentabilidade-consolidada-rentabilidade-reais').textContent = formatCurrency(lucroTotal);
    document.getElementById('rentabilidade-consolidada-rentabilidade-percent').textContent = `${rentabilidadePercent.toFixed(2)}%`;
}

/**
 * Busca o patrimônio total consolidado do dia anterior no Firestore de forma mais eficiente.
 */
async function fetchConsolidatedPreviousDayPatrimonio(userID) {
    if (!userID) return 0;
    try {
        const hojeStr = new Date().toISOString().split('T')[0];

        // 1. Encontra a data do último registro de patrimônio ANTES de hoje
        const qLastDate = query(
            collection(db, "historicoPatrimonioDiario"),
            where("userID", "==", userID),
            where("data", "<", hojeStr),
            orderBy("data", "desc"),
            limit(1)
        );

        const lastDateSnapshot = await getDocs(qLastDate);
        if (lastDateSnapshot.empty) {
            console.warn("Nenhum registro de patrimônio de dias anteriores encontrado.");
            return 0;
        }

        const ultimoDiaComDados = lastDateSnapshot.docs[0].data().data;

        // 2. Busca todos os registros daquela data e soma os valores
        const q = query(
            collection(db, "historicoPatrimonioDiario"),
            where("userID", "==", userID),
            where("data", "==", ultimoDiaComDados)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return 0;

        let totalPatrimonioAnterior = 0;
        querySnapshot.forEach(doc => {
            totalPatrimonioAnterior += doc.data().valorPatrimonio || 0;
        });

        return totalPatrimonioAnterior;

    } catch (error) {
        console.error("Erro ao buscar patrimônio consolidado anterior:", error);
        return 0;
    }
}


/**
 * Renderiza o card de "Valorização do Dia" consolidado.
 */
async function renderConsolidatedDayValorization(summaryData, lancamentos) {
    const valorizationReaisDiv = document.getElementById("rentabilidade-consolidada-valorization-reais");
    const valorizationPercentDiv = document.getElementById("rentabilidade-consolidada-valorization-percent");
    if (!valorizationReaisDiv || !valorizationPercentDiv) return;

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";

    try {
        const patrimonioAnterior = await fetchConsolidatedPreviousDayPatrimonio(auth.currentUser.uid);
        if (patrimonioAnterior <= 0) {
            valorizationReaisDiv.textContent = "N/A";
            valorizationPercentDiv.innerHTML = "-";
            document.getElementById("rentabilidade-highlights-day").innerHTML = '';
            return;
        }

        const patrimonioHoje = summaryData.patrimonioTotal;

        // --- INÍCIO DA LÓGICA CORRIGIDA ---
        const hojeStr = new Date().toISOString().split('T')[0];
        let aportesDoDia = 0;
        let vendasDoDia = 0;

        const lancamentosDeHoje = lancamentos.filter(l => l.data === hojeStr);
        lancamentosDeHoje.forEach(l => {
            const valorOp = l.valorTotal || l.valorAplicado || 0;
            if (l.tipoOperacao === 'compra') {
                aportesDoDia += valorOp;
            } else if (l.tipoOperacao === 'venda') {
                vendasDoDia += valorOp;
            }
        });

        // Ajusta a variação para descontar as operações do dia
        const variacaoBruta = patrimonioHoje - patrimonioAnterior;
        const variacaoReais = variacaoBruta - aportesDoDia + vendasDoDia;
        // --- FIM DA LÓGICA CORRIGIDA ---

        // O patrimônio base para o cálculo percentual também precisa ser ajustado
        const patrimonioBasePercentual = patrimonioAnterior;
        const variacaoPercent = (patrimonioBasePercentual > 0) ? (variacaoReais / patrimonioBasePercentual) * 100 : 0;


        const isPositive = variacaoReais >= 0;
        valorizationReaisDiv.textContent = `${isPositive ? '+' : ''}${variacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        valorizationReaisDiv.style.color = isPositive ? '#00d9c3' : '#ef4444';

        valorizationPercentDiv.innerHTML = `${isPositive ? '+' : ''}${variacaoPercent.toFixed(2)}% <i class="fas fa-${isPositive ? 'arrow-up' : 'arrow-down'}"></i>`;
        valorizationPercentDiv.className = `valorization-pill ${isPositive ? 'positive' : 'negative'}`;

        await renderConsolidatedHighlights(lancamentos);

    } catch (error) {
        console.error("Erro ao renderizar valorização consolidada:", error);
        valorizationReaisDiv.textContent = "Erro";
    }
}

/**
 * Busca os preços de fechamento do dia anterior para uma lista de tickers.
 */
async function fetchPreviousDayPrices(userID, tickers) {
    if (!userID || !tickers || tickers.length === 0) return {};

    try {
        const hojeStr = new Date().toISOString().split('T')[0];
        const precosAnteriores = {};

        const qLastDate = query(
            collection(db, "historicoPrecosDiario"),
            where("userID", "==", userID),
            where("data", "<", hojeStr),
            orderBy("data", "desc"),
            limit(1)
        );

        const lastDateSnapshot = await getDocs(qLastDate);
        if (lastDateSnapshot.empty) {
            console.warn("[Rentabilidade] Nenhum registro de preço de dias anteriores encontrado.");
            return {};
        }

        const ultimoDia = lastDateSnapshot.docs[0].data().data;

        const tickerChunks = [];
        for (let i = 0; i < tickers.length; i += 10) {
            tickerChunks.push(tickers.slice(i, i + 10));
        }

        const promises = tickerChunks.map(chunk => {
            const qPrices = query(
                collection(db, "historicoPrecosDiario"),
                where("userID", "==", userID),
                where("data", "==", ultimoDia),
                where("ticker", "in", chunk)
            );
            return getDocs(qPrices);
        });

        const snapshots = await Promise.all(promises);
        snapshots.forEach(priceSnapshot => {
            priceSnapshot.forEach(doc => {
                const data = doc.data();
                precosAnteriores[data.ticker] = data.valor;
            });
        });

        return precosAnteriores;

    } catch (error) {
        console.error("[Rentabilidade] Erro ao buscar preços do dia anterior:", error);
        return {};
    }
}


/**
 * Renderiza os destaques do dia (maiores altas e baixas) para a carteira consolidada.
 */
async function renderConsolidatedHighlights(lancamentos) {
    const dayContainer = document.getElementById("rentabilidade-highlights-day");
    if (!dayContainer) return;
    dayContainer.innerHTML = 'Calculando destaques...';

    try {
        const tickers = [...new Set(
            lancamentos
                .filter(l => ['Ações', 'FIIs', 'ETF', 'Cripto'].includes(l.tipoAtivo))
                .map(l => l.ativo)
        )];

        if (tickers.length === 0) {
            dayContainer.innerHTML = '';
            return;
        }

        const [precosAtuais, precosOntem] = await Promise.all([
            fetchCurrentPrices(tickers),
            fetchPreviousDayPrices(auth.currentUser.uid, tickers)
        ]);

        const dailyPerformance = [];
        tickers.forEach(ticker => {
            const precoHoje = precosAtuais[ticker]?.price;
            const precoAnterior = precosOntem[ticker];

            if (precoHoje && precoAnterior > 0) {
                dailyPerformance.push({
                    ticker,
                    changePercent: ((precoHoje / precoAnterior) - 1) * 100
                });
            }
        });

        dailyPerformance.sort((a, b) => b.changePercent - a.changePercent);

        const createHtml = (item) => {
            if (!item || typeof item.changePercent !== 'number') {
                return '<div class="highlight-item"><span class="ticker">-</span><span class="value">0.00%</span></div>';
            }
            const isPositive = item.changePercent >= 0;
            return `
                <div class="highlight-item">
                    <span class="ticker">${item.ticker}</span>
                    <span class="value ${isPositive ? 'positive' : 'negative'}">${item.changePercent.toFixed(2)}% ${isPositive ? '↑' : '↓'}</span>
                </div>
            `;
        };

        const highestDay = dailyPerformance.length > 0 ? dailyPerformance[0] : null;
        const lowestDay = dailyPerformance.length > 1 ? dailyPerformance[dailyPerformance.length - 1] : null;

        dayContainer.innerHTML = createHtml(highestDay) + createHtml(lowestDay);
    } catch (error) {
        console.error("Erro ao calcular destaques do dia consolidados:", error);
        dayContainer.innerHTML = '<p style="font-size: 0.8rem; color: #a0a7b3;">Não foi possível carregar os destaques.</p>';
    }
}


// --- FUNÇÕES PARA O GRÁFICO DE VARIAÇÃO DIÁRIA ---
async function fetchHistoricoPatrimonio(intervalo) {
    if (!auth.currentUser) return;

    const CACHE_EXPIRATION_MS = 15 * 60 * 1000;
    const now = Date.now();
    const lastFetchTime = allHistoricoPatrimonio._lastFetchTime || 0;

    if (allHistoricoPatrimonio.length > 0 && (now - lastFetchTime < CACHE_EXPIRATION_MS) && intervalo !== 'Anual') {
       return;
    }

    try {
        const hoje = new Date();
        const dataFiltro = new Date();
        if (intervalo === 'Anual') {
            dataFiltro.setFullYear(hoje.getFullYear() - 5);
        } else if (intervalo === 'Mensal') {
            dataFiltro.setFullYear(hoje.getFullYear() - 1);
        } else {
            dataFiltro.setDate(hoje.getDate() - 35);
        }
        const dataFiltroStr = dataFiltro.toISOString().split('T')[0];
        const q = query(
            collection(db, "historicoPatrimonioDiario"),
            where("userID", "==", auth.currentUser.uid),
            where("data", ">=", dataFiltroStr),
            orderBy("data", "asc")
        );
        const querySnapshot = await getDocs(q);
        allHistoricoPatrimonio = querySnapshot.docs.map(doc => doc.data());
        allHistoricoPatrimonio._lastFetchTime = now;
    } catch (error) {
        console.error("Erro ao buscar histórico de patrimônio:", error);
        allHistoricoPatrimonio = [];
    }
}

/**
 * Processa os dados do histórico de patrimônio para o gráfico de variação.
 * Calcula tanto a variação ajustada por operações quanto a variação bruta.
 */
function processarVariacaoDiaria(lancamentos, tipoAtivoFiltro, intervalo) {
    const patrimonioPorDia = allHistoricoPatrimonio.reduce((acc, registro) => {
        const { data, tipoAtivo, valorPatrimonio } = registro;
        if (!acc[data]) {
            acc[data] = { total: 0, 'Ações': 0, 'FIIs': 0, 'ETF': 0, 'Cripto': 0, 'Renda Fixa': 0 };
        }
        if (acc[data][tipoAtivo] !== undefined) {
            acc[data][tipoAtivo] += valorPatrimonio;
        }
        acc[data].total += valorPatrimonio;
        return acc;
    }, {});

    const operacoesPorDia = (lancamentos || []).reduce((acc, l) => {
        const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo) ? 'Renda Fixa' : l.tipoAtivo;
        if (!acc[l.data]) acc[l.data] = {};
        if (!acc[l.data][tipoMapeado]) acc[l.data][tipoMapeado] = { compra: 0, venda: 0 };
        acc[l.data][tipoMapeado][l.tipoOperacao] += (l.valorTotal || l.valorAplicado || 0);
        return acc;
    }, {});

    let dadosAgregados = {};
    const sortedDates = Object.keys(patrimonioPorDia).sort();

    if (intervalo === 'Diário') {
        dadosAgregados = patrimonioPorDia;
    } else {
        const getKey = (date) => intervalo === 'Mensal' ? date.substring(0, 7) : date.substring(0, 4);
        sortedDates.forEach(date => {
            const key = getKey(date);
            dadosAgregados[key] = patrimonioPorDia[date];
        });
    }

    const sortedKeys = Object.keys(dadosAgregados).sort();
    const labels = [];
    const assetTypes = ['Ações', 'FIIs', 'ETF', 'Cripto', 'Renda Fixa'];
    const variacoes = {
        'Ações': [], 'FIIs': [], 'ETF': [], 'Cripto': [], 'Renda Fixa': [],
        totalReaisAjustado: [], totalPercentAjustado: [],
        pureTotalReais: [], pureTotalPercent: []
    };

    for (let i = 1; i < sortedKeys.length; i++) {
        const keyAtual = sortedKeys[i];
        const keyAnterior = sortedKeys[i - 1];

        const dadosAtuais = dadosAgregados[keyAtual];
        const dadosAnteriores = dadosAgregados[keyAnterior];
        const valorTotalAnterior = dadosAnteriores.total;

        if (valorTotalAnterior > 0) {
            let label;
            if (intervalo === 'Diário') {
                label = new Date(keyAtual + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            } else if (intervalo === 'Mensal') {
                const [year, month] = keyAtual.split('-');
                label = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            } else {
                label = keyAtual;
            }
            labels.push(label);

            let variacaoTotalAjustadaDia = 0;
            const operacoesDoPeriodo = operacoesPorDia[keyAtual] || {};

            assetTypes.forEach(tipo => {
                const valorAtual = dadosAtuais[tipo] || 0;
                const valorAnterior = dadosAnteriores[tipo] || 0;

                const opsDoTipo = operacoesDoPeriodo[tipo] || { compra: 0, venda: 0 };
                 // Aportes e Vendas só são considerados para ajuste no cálculo diário
                const aportes = intervalo === 'Diário' ? opsDoTipo.compra : 0;
                const vendas = intervalo === 'Diário' ? opsDoTipo.venda : 0;

                const variacaoAjustada = (valorAtual - valorAnterior) - aportes + vendas;

                variacoes[tipo].push(variacaoAjustada);
                variacaoTotalAjustadaDia += variacaoAjustada;
            });

            variacoes.totalReaisAjustado.push(variacaoTotalAjustadaDia);
            const basePercentualAjustado = valorTotalAnterior;
            variacoes.totalPercentAjustado.push(basePercentualAjustado > 0 ? (variacaoTotalAjustadaDia / basePercentualAjustado) * 100 : 0);

            const valorTotalAtual = dadosAtuais.total;
            const variacaoBrutaReais = valorTotalAtual - valorTotalAnterior;
            const variacaoBrutaPercent = valorTotalAnterior > 0 ? (variacaoBrutaReais / valorTotalAnterior) * 100 : 0;
            variacoes.pureTotalReais.push(variacaoBrutaReais);
            variacoes.pureTotalPercent.push(variacaoBrutaPercent);
        }
    }

    return { labels, variacoes };
}

/**
 * Renderiza o gráfico de variação diária/mensal/anual do patrimônio.
 */
async function renderVariacaoDiariaChart(lancamentos) {
    const canvas = document.getElementById('daily-variation-chart');
    if (!canvas) return;

    const filtroAtivo = document.getElementById('daily-variation-asset-filter').value;
    const filtroIntervaloBtn = document.querySelector("#daily-variation-interval-filter .filter-btn.active");
    const filtroIntervalo = filtroIntervaloBtn ? filtroIntervaloBtn.dataset.intervalo : 'Diário';

    await fetchHistoricoPatrimonio(filtroIntervalo);

    const { labels, variacoes } = processarVariacaoDiaria(lancamentos, filtroAtivo, filtroIntervalo);

    const titleEl = canvas.closest('.performance-box')?.querySelector('h3');
    if (titleEl) {
        const periodos = { 'Diário': 'últimos 30 dias', 'Mensal': 'últimos 12 meses', 'Anual': 'últimos 5 anos' };
        titleEl.textContent = `Variação ${filtroIntervalo} do Patrimônio (${periodos[filtroIntervalo]})`;
    }

    if (dailyVariationChart) {
        dailyVariationChart.destroy();
    }

    const isConsolidado = filtroAtivo === 'Todos';
    let barDatasets = []; // Renomeado para clareza
    const displayCount = filtroIntervalo === 'Diário' ? 30 : (filtroIntervalo === 'Mensal' ? 12 : 5);

    if (isConsolidado) {
        const colors = {
            'Ações': { bg: 'rgba(0, 217, 195, 0.8)', bd: '#00d9c3' },
            'FIIs': { bg: 'rgba(90, 103, 216, 0.8)', bd: '#5A67D8' },
            'ETF': { bg: 'rgba(237, 100, 166, 0.8)', bd: '#ED64A6' },
            'Cripto': { bg: 'rgba(236, 201, 75, 0.8)', bd: '#ECC94B' },
            'Renda Fixa': { bg: 'rgba(160, 167, 179, 0.8)', bd: '#a0a7b3' }
        };

        barDatasets = Object.keys(colors).map(tipo => ({
            type: 'bar', // Define o tipo aqui
            label: tipo,
            data: variacoes[tipo].slice(-displayCount),
            backgroundColor: colors[tipo].bg,
            borderColor: colors[tipo].bd,
            borderWidth: 1,
            borderRadius: 2
        }));

    } else {
        const data = variacoes[filtroAtivo].slice(-displayCount);
        barDatasets.push({
            type: 'bar', // Define o tipo aqui
            label: `Variação ${filtroAtivo}`,
            data: data,
            backgroundColor: data.map(v => v >= 0 ? 'rgba(0, 217, 195, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
            borderColor: data.map(v => v >= 0 ? '#00d9c3' : '#ef4444'),
            borderWidth: 1,
            borderRadius: 4
        });
    }

    // --- INÍCIO DA ADIÇÃO DA LINHA ---
    const lineDataset = {
        type: 'line',
        label: 'Variação Total (R$)',
        data: variacoes.totalReaisAjustado.slice(-displayCount),
        borderColor: '#facc15', // Cor amarela/dourada para contraste
        borderWidth: 2,
        pointRadius: 0, // Sem pontos na linha
        fill: false,
        tension: 0.1, // Leve curvatura
        yAxisID: 'y', // Garante que usa o mesmo eixo Y das barras
        order: 0 // Tenta desenhar a linha por cima das barras
    };
    // --- FIM DA ADIÇÃO DA LINHA ---

    dailyVariationChart = new Chart(canvas, {
        // O tipo geral pode ser 'bar', mas datasets individuais podem ter tipos diferentes
        type: 'bar',
        data: {
            labels: labels.slice(-displayCount),
            // Combina os datasets das barras com o da linha
            datasets: [...barDatasets, lineDataset]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: { stacked: isConsolidado, grid: { display: false }, ticks: { color: "#a0a7b3" } },
                y: { stacked: isConsolidado, grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) } }
            },
            plugins: {
                legend: {
                    display: isConsolidado,
                    position: 'bottom',
                    labels: {
                        color: '#a0a7b3',
                         // Filtra a legenda da linha para não aparecer lá
                        filter: item => item.datasetIndex < barDatasets.length
                    }
                },
                tooltip: {
                     // Filtra itens da linha do corpo do tooltip principal
                    filter: item => item.dataset.type !== 'line',
                    callbacks: {
                        label: function (context) {
                            // Não mostra o label se for o dataset da linha
                            if (context.dataset.type === 'line') {
                                return null;
                            }
                            const valorReal = context.raw;
                            if (valorReal === 0 && context.dataset.data.every(v => v === 0) && !isConsolidado) return null;
                            if (valorReal === 0 && isConsolidado) return null;
                            return `${context.dataset.label}: ${valorReal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                        },
                        footer: function (tooltipItems) {
                             // Pega o índice correto, ignorando o item da linha se estiver presente
                            const barTooltipItem = tooltipItems.find(item => item.dataset.type !== 'line') || tooltipItems[0];
                            const index = barTooltipItem.dataIndex;

                            const totalReais = variacoes.totalReaisAjustado.slice(-displayCount)[index];
                            const totalPercent = variacoes.totalPercentAjustado.slice(-displayCount)[index];

                            if (totalReais === undefined || totalPercent === undefined) {
                                return 'Variação total indisponível.';
                            }

                            const formatCurrency = (value) => `${value >= 0 ? '+' : ''}${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                            const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`.replace('.', ',');

                            return [
                                `Variação Total: ${formatCurrency(totalReais)}`,
                                `Percentual Total: ${formatPercent(totalPercent)}`
                            ];
                        }
                    }
                }
            }
        }
    });
}


// --- LÓGICA DO GRÁFICO DE PERFORMANCE ---
async function updatePerformanceChart() {
    const periodFilter = document.querySelector("#perf-period-filter .filter-btn.active");
    const period = periodFilter ? periodFilter.dataset.period : '6m';
    const mainIndex = 'IBOV';

    const performanceData = await renderConsolidatedPerformanceChart(period, mainIndex);

    if (performanceData && performanceData.carteira && performanceData.carteira.length > 0) {
        const lastValue = performanceData.carteira.filter(v => typeof v === 'number').pop();
        if (typeof lastValue === 'number') {
            const rentPeriodoEl = document.getElementById('perf-rent-periodo');
            if(rentPeriodoEl) {
                rentPeriodoEl.textContent = `${lastValue.toFixed(2)}%`;
                rentPeriodoEl.style.color = lastValue >= 0 ? '#00d9c3' : '#ef4444';
            }
            const rentAtualEl = document.getElementById('perf-rent-atual');
             if(rentAtualEl) {
                rentAtualEl.textContent = `${lastValue.toFixed(2)}%`;
                rentAtualEl.style.color = lastValue >= 0 ? '#00d9c3' : '#ef4444';
             }
        } else {
             const rentPeriodoEl = document.getElementById('perf-rent-periodo');
             const rentAtualEl = document.getElementById('perf-rent-atual');
             if(rentPeriodoEl) rentPeriodoEl.textContent = '0,00%';
             if(rentAtualEl) rentAtualEl.textContent = '0,00%';
        }
    }
}


/**
 * Função principal que inicializa a aba de Rentabilidade.
 */
export async function renderRentabilidadeTab(lancamentos, proventos, summaryData) {
    const rentabilidadePane = document.getElementById('rentabilidade');
    if (!rentabilidadePane) return;
    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


    if (!lancamentos || lancamentos.length === 0 || !summaryData) {
        document.getElementById('rentabilidade-consolidada-total-investido').textContent = formatCurrency(0);
        document.getElementById('rentabilidade-consolidada-patrimonio-atual').textContent = formatCurrency(0);
        document.getElementById('rentabilidade-consolidada-rentabilidade-reais').textContent = formatCurrency(0);
        document.getElementById('rentabilidade-consolidada-rentabilidade-percent').textContent = '0,00%';
        document.getElementById("rentabilidade-consolidada-valorization-reais").textContent = "N/A";
        document.getElementById("rentabilidade-consolidada-valorization-percent").innerHTML = "";
        document.getElementById("rentabilidade-highlights-day").innerHTML = '';
        if (dailyVariationChart) dailyVariationChart.destroy();
        return;
    }

    renderConsolidatedSummary(summaryData);
    await renderConsolidatedDayValorization(summaryData, lancamentos);

    await updatePerformanceChart();
    await renderVariacaoDiariaChart(lancamentos);
}


// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const assetFilter = document.getElementById('daily-variation-asset-filter');
    if (assetFilter) assetFilter.addEventListener('change', () => {
        if (window.allLancamentos) renderVariacaoDiariaChart(window.allLancamentos);
    });

    const intervalFilter = document.getElementById('daily-variation-interval-filter');
    if (intervalFilter) {
        intervalFilter.addEventListener('click', (e) => {
            if (e.target.matches('.filter-btn')) {
                intervalFilter.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                if (window.allLancamentos) renderVariacaoDiariaChart(window.allLancamentos);
            }
        });
    }

    const periodFilterGroup = document.getElementById('perf-period-filter');
    if (periodFilterGroup) {
        periodFilterGroup.addEventListener('click', (e) => {
            if (e.target.matches('.filter-btn')) {
                periodFilterGroup.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                updatePerformanceChart();
            }
        });
    }

});