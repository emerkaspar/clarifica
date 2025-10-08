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
        const variacaoReais = patrimonioHoje - patrimonioAnterior;
        const variacaoPercent = (variacaoReais / patrimonioAnterior) * 100;

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
 * Renderiza os destaques do dia (maiores altas e baixas) para a carteira consolidada.
 */
async function renderConsolidatedHighlights(lancamentos) {
    const dayContainer = document.getElementById("rentabilidade-highlights-day");
    if (!dayContainer) return;
    dayContainer.innerHTML = 'Calculando destaques...';

    try {
        const tickers = [...new Set(lancamentos.filter(l => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo)).map(l => l.ativo))];

        if (tickers.length === 0) {
            dayContainer.innerHTML = '';
            return;
        }

        const [precosAtuais, historicalResults] = await Promise.all([
            fetchCurrentPrices(tickers),
            Promise.all(tickers.map(ticker => fetchHistoricalData(ticker, '5d')))
        ]);

        const dailyPerformance = [];
        historicalResults.forEach((data, index) => {
            const ticker = tickers[index];
            if (data?.results?.[0]?.historicalDataPrice?.length >= 1 && precosAtuais[ticker]) {
                const hoje = precosAtuais[ticker]?.price;
                const ontem = data.results[0].historicalDataPrice[0].close;
                if (hoje && ontem > 0) {
                    dailyPerformance.push({ ticker, changePercent: ((hoje / ontem) - 1) * 100 });
                }
            }
        });

        dailyPerformance.sort((a, b) => b.changePercent - a.changePercent);

        const createHtml = (item) => {
            if (!item) return '<div class="highlight-item"><span class="ticker">-</span><span class="value">0.00%</span></div>';
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
        console.error("Erro ao calcular destaques do dia:", error);
        dayContainer.innerHTML = '<p style="font-size: 0.8rem; color: #a0a7b3;">Não foi possível carregar os destaques.</p>';
    }
}


// --- FUNÇÕES PARA O GRÁFICO DE VARIAÇÃO DIÁRIA ---
async function fetchHistoricoPatrimonio(intervalo) {
    if (!auth.currentUser || (allHistoricoPatrimonio.length > 0 && intervalo !== 'Anual')) return;
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
    } catch (error) {
        console.error("Erro ao buscar histórico de patrimônio:", error);
        allHistoricoPatrimonio = [];
    }
}
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
        acc[l.data][tipoMapeado][l.tipoOperacao] += (l.valorTotal || 0);
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
        'Ações': [], 'FIIs': [], 'ETF': [], 'Cripto': [], 'Renda Fixa': [], totalReais: [], totalPercent: []
    };

    for (let i = 1; i < sortedKeys.length; i++) {
        const keyAtual = sortedKeys[i];
        const keyAnterior = sortedKeys[i - 1];

        const valorTotalAnterior = dadosAgregados[keyAnterior].total;
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

            let variacaoTotalDia = 0;
            const operacoesDoDia = operacoesPorDia[keyAtual] || {};

            assetTypes.forEach(tipo => {
                const valorAtual = dadosAgregados[keyAtual][tipo] || 0;
                const valorAnterior = dadosAgregados[keyAnterior][tipo] || 0;

                const opsDoTipo = operacoesDoDia[tipo] || { compra: 0, venda: 0 };
                const aportes = opsDoTipo.compra;
                const vendas = opsDoTipo.venda;

                const variacao = (valorAtual - valorAnterior) - aportes + vendas;

                variacoes[tipo].push(variacao);
                variacaoTotalDia += variacao;
            });

            variacoes.totalReais.push(variacaoTotalDia);
            const basePercentual = valorTotalAnterior - (operacoesDoDia.total?.compra || 0) + (operacoesDoDia.total?.venda || 0);
            variacoes.totalPercent.push(basePercentual > 0 ? (variacaoTotalDia / basePercentual) * 100 : 0);
        }
    }

    return { labels, variacoes };
}
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
        const periodos = { 'Diário': '30 dias', 'Mensal': '12 meses', 'Anual': 'últimos anos' };
        titleEl.textContent = `Variação Diária do Patrimônio (${periodos[filtroIntervalo]})`;
    }

    if (dailyVariationChart) {
        dailyVariationChart.destroy();
    }

    const isConsolidado = filtroAtivo === 'Todos';
    let datasets = [];

    if (isConsolidado) {
        const colors = {
            'Ações': { bg: 'rgba(0, 217, 195, 0.8)', bd: '#00d9c3' },
            'FIIs': { bg: 'rgba(90, 103, 216, 0.8)', bd: '#5A67D8' },
            'ETF': { bg: 'rgba(237, 100, 166, 0.8)', bd: '#ED64A6' },
            'Cripto': { bg: 'rgba(236, 201, 75, 0.8)', bd: '#ECC94B' },
            'Renda Fixa': { bg: 'rgba(160, 167, 179, 0.8)', bd: '#a0a7b3' }
        };

        datasets = Object.keys(colors).map(tipo => ({
            label: tipo,
            data: variacoes[tipo].slice(-30),
            backgroundColor: colors[tipo].bg,
            borderColor: colors[tipo].bd,
            borderWidth: 1,
            borderRadius: 2
        }));

    } else {
        const data = variacoes[filtroAtivo].slice(-30);
        datasets.push({
            label: 'Variação em R$',
            data: data,
            backgroundColor: data.map(v => v >= 0 ? 'rgba(0, 217, 195, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
            borderColor: data.map(v => v >= 0 ? '#00d9c3' : '#ef4444'),
            borderWidth: 1,
            borderRadius: 4
        });
    }

    dailyVariationChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.slice(-30),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: isConsolidado, grid: { display: false }, ticks: { color: "#a0a7b3" } },
                y: { stacked: isConsolidado, grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) } }
            },
            plugins: {
                legend: { display: isConsolidado, position: 'bottom', labels: { color: '#a0a7b3' } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const valorReal = context.raw;
                            return `${context.dataset.label}: ${valorReal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                        },
                        footer: function (tooltipItems) {
                            if (!isConsolidado) return;
                            let sum = 0;
                            tooltipItems.forEach(function (tooltipItem) {
                                sum += tooltipItem.raw;
                            });
                            const index = tooltipItems[0].dataIndex;
                            const percent = variacoes.totalPercent.slice(-30)[index];
                            return `Total: ${sum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${percent.toFixed(2)}%)`;
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
    const mainIndex = 'IBOV'; // Fixo como IBOV, já que o seletor foi removido.

    const performanceData = await renderConsolidatedPerformanceChart(period, mainIndex);

    if (performanceData && performanceData.carteira.length > 0) {
        const lastValue = performanceData.carteira[performanceData.carteira.length - 1];
        if (typeof lastValue === 'number') {
            const rentPeriodoEl = document.getElementById('perf-rent-periodo');
            rentPeriodoEl.textContent = `${lastValue.toFixed(2)}%`;
            rentPeriodoEl.style.color = lastValue >= 0 ? '#00d9c3' : '#ef4444';

            const rentAtualEl = document.getElementById('perf-rent-atual');
            rentAtualEl.textContent = `${lastValue.toFixed(2)}%`;
            rentAtualEl.style.color = lastValue >= 0 ? '#00d9c3' : '#ef4444';
        }
    }
}


/**
 * Função principal que inicializa a aba de Rentabilidade.
 */
export async function renderRentabilidadeTab(lancamentos, proventos, summaryData) {
    const rentabilidadePane = document.getElementById('rentabilidade');
    if (!rentabilidadePane) return;

    if (!lancamentos || lancamentos.length === 0 || !summaryData) {
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
    if (assetFilter) assetFilter.addEventListener('change', () => renderVariacaoDiariaChart(window.allLancamentos));

    const intervalFilter = document.getElementById('daily-variation-interval-filter');
    if (intervalFilter) {
        intervalFilter.addEventListener('click', (e) => {
            if (e.target.matches('.filter-btn')) {
                intervalFilter.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                renderVariacaoDiariaChart(window.allLancamentos);
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

    // O event listener para 'perf-index-filter' foi removido.
});