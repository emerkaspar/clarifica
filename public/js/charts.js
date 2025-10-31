// public/js/charts.js
import { fetchHistoricalData } from './api/brapi.js';
import { db, auth } from './firebase-config.js';
// Adiciona 'collection', 'query', 'where', 'orderBy', 'getDocs', 'limit'
import { collection, query, where, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { fetchIndexers } from './api/bcb.js';

// --- VARIÁVEIS DE INSTÂNCIA DOS GRÁFICOS ---
let movimentacaoChart = null;
let proventosPorAtivoChart = null;
let proventosEvolucaoChart = null;
let performanceChart = null;
let consolidatedPerformanceChart = null;
let proventosPorAtivoBarChart = null;
let dividendYieldChart = null;
let isChartRendering = false;
let proventosDetalheChart = null;
let acoesValorAtualChart = null;
let fiisValorAtualChart = null;
let opcoesRendaMensalChart = null;
let opcoesEstrategiasChart = null;
let opcoesPremioPorAtivoChart = null;

// Referência global para os dados processados pela função que deu certo
let lastProcessedVariacoes = null;


// --- FUNÇÕES AUXILIARES DE CORES E OPÇÕES ---

/**
 * Retorna as cores apropriadas para os gráficos com base no tema atual.
 */
const getThemeColors = () => {
    const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
    return {
        textColor: isLightTheme ? '#374151' : '#a0a7b3',
        gridColor: isLightTheme ? '#e5e7eb' : '#2a2c30',
        gridColorTransparent: isLightTheme ? 'rgba(229, 231, 235, 0)' : 'rgba(42, 44, 48, 0)',
        tooltipBg: isLightTheme ? '#fff' : '#1A202C',
        tooltipColor: isLightTheme ? '#1f2937' : '#E2E8F0',
        borderColor: isLightTheme ? '#d1d5db' : '#3a404d',
        mainBgColor: isLightTheme ? '#f9fafb' : '#161a22',
        pieBorderColor: isLightTheme ? '#fff' : '#161a22',

        // Cores principais
        primary: '#00d9c3', // Teal
        primaryTransparent: 'rgba(0, 217, 195, 0.7)',
        primaryArea: isLightTheme ? 'rgba(0, 217, 195, 0.1)' : 'rgba(0, 217, 195, 0.1)',
        secondary: '#5A67D8', // Indigo
        secondaryTransparent: 'rgba(90, 103, 216, 0.8)',
        tertiary: '#ED64A6', // Magenta/Pink
        quaternary: '#ECC94B', // Yellow
        neutral: isLightTheme ? '#6b7280' : '#a0a7b3',
        negative: '#ef4444',
        negativeTransparent: 'rgba(239, 68, 68, 0.7)',
        ibov: 'rgba(255, 51, 0, 1)',
    };
};

/**
 * Opções base para os gráficos de barra. (CORRIGIDO)
 */
const getBarChartOptions = (indexAxis = 'y') => {
    const colors = getThemeColors();
    const currencyCallback = function (value) {
        if (value >= 1000) return "R$ " + (value / 1000).toLocaleString('pt-BR') + "k";
        return "R$ " + value.toLocaleString('pt-BR');
    };

    const scales = {
        x: {
            grid: { color: colors.gridColorTransparent },
            ticks: { color: colors.textColor }
        },
        y: {
            grid: { color: colors.gridColorTransparent },
            ticks: { color: colors.textColor }
        }
    };

    if (indexAxis === 'y') {
        // Gráfico de Barras Horizontais (valor no eixo X)
        scales.x.beginAtZero = true;
        scales.x.grid.color = colors.gridColor;
        scales.x.ticks.callback = currencyCallback;
    } else {
        // Gráfico de Barras Verticais (valor no eixo Y)
        scales.y.beginAtZero = true;
        scales.y.grid.color = colors.gridColor;
        scales.y.ticks.callback = currencyCallback;
    }

    return {
        indexAxis,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.tooltipColor,
                bodyColor: colors.tooltipColor,
                callbacks: {
                    label: function (context) {
                        const value = indexAxis === 'y' ? context.parsed.x : context.parsed.y;
                        return ` Valor: ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
                    }
                }
            }
        },
        scales: scales
    };
};


/**
 * Opções base para os gráficos de Donut (Pizza).
 */
const getDonutChartOptions = (title = '') => {
    const colors = getThemeColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: colors.textColor,
                    boxWidth: 12,
                    padding: 15,
                    font: {
                        size: 12
                    }
                }
            },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.tooltipColor,
                bodyColor: colors.tooltipColor,
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.chart.getDatasetMeta(0).total || 1;
                        const percentage = total > 0 ? ((value / total) * 100) : 0;
                        return `${label}: ${percentage.toFixed(2)}%`;
                    }
                }
            },
            title: {
                display: !!title,
                text: title,
                color: colors.textColor,
                font: {
                    size: 16,
                    weight: '600'
                }
            }
        }
    };
};


/**
 * Renderiza o gráfico de detalhes de proventos de um mês/ano específico em um modal.
 */
export function renderProventosDetalheChart(proventosDoPeriodo, title) {
    const canvas = document.getElementById("proventos-detalhe-chart");
    if (!canvas) return;

    const modalTitle = document.getElementById("proventos-detalhe-modal-title");
    if (modalTitle) {
        modalTitle.textContent = `Detalhes de Proventos - ${title}`;
    }

    if (proventosDetalheChart) {
        proventosDetalheChart.destroy();
    }

    const porAtivo = proventosDoPeriodo.reduce((acc, p) => {
        acc[p.ativo] = (acc[p.ativo] || 0) + p.valor;
        return acc;
    }, {});

    const sortedData = Object.entries(porAtivo).sort(([, a], [, b]) => b - a);
    const labels = sortedData.map(item => item[0]);
    const data = sortedData.map(item => item[1]);
    const colors = getThemeColors();

    proventosDetalheChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Recebido (R$)',
                data: data,
                backgroundColor: colors.primaryTransparent,
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: getBarChartOptions('y')
    });

    const modal = document.getElementById("proventos-detalhe-modal");
    if (modal) {
        modal.classList.add("show");
    }
}


/**
 * Renderiza o novo gráfico de barras com o valor atual por ativo na aba de Ações.
 */
export function renderAcoesValorAtualChart(chartData) {
    const canvas = document.getElementById('acoes-valor-atual-chart');
    if (!canvas) return;

    if (acoesValorAtualChart) {
        acoesValorAtualChart.destroy();
    }

    if (!chartData || chartData.length === 0) {
        window.acoesChartData = [];
        return;
    }
    window.acoesChartData = chartData;

    const labels = chartData.map(item => item.ticker);
    const data = chartData.map(item => item.valorAtual);
    const percentages = chartData.map(item => item.percentual);
    const colors = getThemeColors();

    const options = getBarChartOptions('y');
    options.plugins.tooltip.callbacks = {
        label: function (context) {
            const index = context.dataIndex;
            const value = context.parsed.x;
            const percent = percentages[index];
            let label = ` ${context.dataset.label || ''}: ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${percent.toFixed(2)}%)`;
            return label;
        }
    };


    acoesValorAtualChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Atual (R$)',
                data: data,
                backgroundColor: colors.primaryTransparent,
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: options
    });
}

/**
 * Renderiza o novo gráfico de barras com o valor atual por ativo na aba de FIIs.
 */
export function renderFiisValorAtualChart(chartData) {
    const canvas = document.getElementById('fiis-valor-atual-chart');
    if (!canvas) return;

    if (fiisValorAtualChart) {
        fiisValorAtualChart.destroy();
    }

    if (!chartData || chartData.length === 0) {
        window.fiisChartData = [];
        return;
    }
    window.fiisChartData = chartData;

    const labels = chartData.map(item => item.ticker);
    const data = chartData.map(item => item.valorAtual);
    const percentages = chartData.map(item => item.percentual);
    const colors = getThemeColors();

    const options = getBarChartOptions('y');
    options.plugins.tooltip.callbacks = {
        label: function (context) {
            const index = context.dataIndex;
            const value = context.parsed.x;
            const percent = percentages[index];
            let label = ` ${context.dataset.label || ''}: ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${percent.toFixed(2)}%)`;
            return label;
        }
    };


    fiisValorAtualChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Atual (R$)',
                data: data,
                backgroundColor: colors.secondaryTransparent,
                borderColor: colors.secondary,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: options
    });
}

export function renderMovimentacaoChart(lancamentos) {
    const chartCanvas = document.getElementById("movimentacao-chart");
    if (!chartCanvas || typeof Chart === "undefined" || !lancamentos) return;
    window.movimentacaoLancamentos = lancamentos;

    const colors = getThemeColors();
    const last6MonthsData = {};
    const labels = [];
    const dataAtual = new Date();
    dataAtual.setDate(1);

    for (let i = 5; i >= 0; i--) {
        const date = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - i, 1);
        const monthYearKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        labels.push(date.toLocaleString("pt-BR", { month: "short", year: "2-digit" }));
        last6MonthsData[monthYearKey] = { compra: 0, venda: 0 };
    }

    const minDateKey = Object.keys(last6MonthsData)[0];
    lancamentos.forEach((l) => {
        if (!l.data) return;
        const [year, month, day] = l.data.split("-").map(Number);
        const dataOp = new Date(year, month - 1, day);
        const monthYearKey = `${dataOp.getFullYear()}-${String(dataOp.getMonth() + 1).padStart(2, "0")}`;
        if (monthYearKey >= minDateKey && last6MonthsData[monthYearKey]) {
            const valor = l.valorTotal || l.valorAplicado || 0;
            if (l.tipoOperacao === "compra") {
                last6MonthsData[monthYearKey].compra += valor;
            } else if (l.tipoOperacao === "venda") {
                last6MonthsData[monthYearKey].venda += valor;
            }
        }
    });


    const compras = Object.values(last6MonthsData).map((data) => data.compra);
    const vendas = Object.values(last6MonthsData).map((data) => data.venda);

    const data = {
        labels: labels,
        datasets: [
            {
                label: "Compras (R$)",
                data: compras,
                backgroundColor: colors.primaryTransparent,
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 6,
            },
            {
                label: "Vendas (R$)",
                data: vendas,
                backgroundColor: colors.negativeTransparent,
                borderColor: colors.negative,
                borderWidth: 1,
                borderRadius: 6,
            },
        ],
    };

    if (movimentacaoChart) movimentacaoChart.destroy();
    movimentacaoChart = new Chart(chartCanvas, {
        type: "bar",
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.textColor } },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textColor,
                        callback: function (value) {
                            if (value >= 1000) return "R$ " + value / 1000 + "k";
                            return "R$ " + value;
                        }
                    }
                }
            },
            plugins: {
                legend: { position: "top", align: "end", labels: { color: colors.textColor, usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipColor,
                    bodyColor: colors.tooltipColor,
                    padding: 12,
                    cornerRadius: 6,
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || "";
                            if (label) { label += ": " }
                            const value = context.parsed.y;
                            if (value !== null) {
                                label += value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                            }
                            return label;
                        }
                    }
                },
            },
        },
    });
};


export function renderPieCharts(proventos) {
    const colors = getThemeColors();

    if (proventosPorAtivoChart) {
        proventosPorAtivoChart.destroy();
        proventosPorAtivoChart = null;
    }
    const ctxAtivo = document.getElementById("proventos-por-ativo-chart");
    if (ctxAtivo) {
        const porAtivo = proventos.reduce((acc, p) => { acc[p.ativo] = (acc[p.ativo] || 0) + p.valor; return acc }, {});
        const sortedAtivos = Object.entries(porAtivo).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const labelsAtivo = sortedAtivos.map((item) => item[0]);
        const dataAtivo = sortedAtivos.map((item) => item[1]);

        const modernColors = [
            '#2dd4bf', '#60a5fa', '#f472b6', '#a78bfa', '#facc15', '#fb923c', '#9ca3af'
        ];

        proventosPorAtivoChart = new Chart(ctxAtivo, {
            type: "doughnut",
            data: {
                labels: labelsAtivo,
                datasets: [{
                    data: dataAtivo,
                    backgroundColor: modernColors,
                    borderWidth: 0,
                    borderColor: 'transparent'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "70%",
                hoverOffset: 12,
                layout: {
                    padding: 15
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: colors.tooltipBg, titleColor: colors.tooltipColor, bodyColor: colors.tooltipColor, padding: 12, cornerRadius: 6, borderColor: "rgba(255, 255, 255, 0.1)", borderWidth: 1,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || "";
                                const value = context.raw || 0;
                                const total = context.chart.getDatasetMeta(0).total || 1;
                                const percentage = ((value / total) * 100).toFixed(1);
                                const valorFormatado = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                return `${label}: ${valorFormatado} (${percentage}%)`;
                            }
                        }
                    },
                },
            },
        });
    }

    const tipoContainer = document.getElementById("dist-por-tipo-container");
    if (tipoContainer) {
        const totalProventos = proventos.reduce((acc, p) => acc + p.valor, 0);
        const porTipo = proventos.reduce((acc, p) => { const tipo = p.tipoAtivo === "Ações" || p.tipoAtivo === "FIIs" ? p.tipoAtivo : "Outros"; acc[tipo] = (acc[tipo] || 0) + p.valor; return acc }, {});
        let tipoHtml = "";
        Object.entries(porTipo).forEach(([label, value]) => { const percentage = totalProventos > 0 ? (value / totalProventos) * 100 : 0; tipoHtml += ` <div class="dist-item"> <div class="dist-label"> <span>${label}</span> <span>${percentage.toFixed(1)}%</span> </div> <div class="dist-bar-bg"> <div class="dist-bar-fill" style="width: ${percentage}%;"></div> </div> </div> ` });
        tipoContainer.innerHTML = tipoHtml || `<p style="font-size: 0.8rem; color: #a0a7b3;">Sem dados.</p>`;
    }
}

export function renderEvolutionChart(proventos) {
    const ctx = document.getElementById("proventos-evolucao-chart");
    if (!ctx) return;
    const colors = getThemeColors();
    const intervalo = document.querySelector("#intervalo-filter-group .active").dataset.intervalo;
    const periodo = document.getElementById("periodo-filter").value;
    const tipoAtivo = document.getElementById("tipo-ativo-filter").value;
    const ativo = document.getElementById("ativo-filter").value;
    let proventosFiltrados = [...proventos];
    if (tipoAtivo !== "Todos") { proventosFiltrados = proventosFiltrados.filter((p) => p.tipoAtivo === tipoAtivo) }
    if (ativo !== "Todos") { proventosFiltrados = proventosFiltrados.filter((p) => p.ativo === ativo) }
    const hoje = new Date();
    let dataInicio;
    if (periodo === "12m") { dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1) } else if (periodo === "current_year") { dataInicio = new Date(hoje.getFullYear(), 0, 1) } else if (periodo === "5y") { dataInicio = new Date(hoje.getFullYear() - 4, 0, 1) }
    proventosFiltrados = proventosFiltrados.filter(
        (p) => new Date(p.dataPagamento + "T00:00:00") >= dataInicio
    );
    const aggregatedData = {};
    proventosFiltrados.forEach((p) => { const dataPag = new Date(p.dataPagamento + "T00:00:00"); let key; if (intervalo === "Mensal") { key = `${dataPag.getFullYear()}-${String(dataPag.getMonth() + 1).padStart(2, "0")}` } else { key = dataPag.getFullYear().toString() } aggregatedData[key] = (aggregatedData[key] || 0) + p.valor });
    const sortedKeys = Object.keys(aggregatedData).sort();
    const labels = sortedKeys.map((key) => { if (intervalo === "Mensal") { const [year, month] = key.split("-"); return new Date(year, month - 1, 1).toLocaleString("pt-BR", { month: "short", year: "2-digit" }) } return key });
    const data = sortedKeys.map((key) => aggregatedData[key]);

    if (proventosEvolucaoChart) proventosEvolucaoChart.destroy();
    proventosEvolucaoChart = new Chart(ctx, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Proventos Recebidos", data: data, backgroundColor: colors.primary, borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const key = sortedKeys[index];
                    const displayLabel = labels[index];
                    let proventosDoPeriodo;
                    if (intervalo === "Mensal") {
                        const [year, month] = key.split('-').map(Number);
                        proventosDoPeriodo = proventosFiltrados.filter(p => {
                            const dataPag = new Date(p.dataPagamento + "T00:00:00");
                            return dataPag.getFullYear() === year && (dataPag.getMonth() + 1) === month;
                        });
                    } else { // Anual
                        const year = Number(key);
                        proventosDoPeriodo = proventosFiltrados.filter(p => {
                            const dataPag = new Date(p.dataPagamento + "T00:00:00");
                            return dataPag.getFullYear() === year;
                        });
                    }
                    renderProventosDetalheChart(proventosDoPeriodo, displayLabel);
                }
            },
            plugins: {
                legend: { display: false }, tooltip: {
                    backgroundColor: colors.tooltipBg, titleColor: colors.tooltipColor, bodyColor: colors.tooltipColor,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || ""; if (label) { label += ": " } const value = context.parsed.y; if (value !== null) { label += value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) } return label
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: colors.gridColor }, ticks: { color: colors.textColor, callback: function (value) { return "R$ " + value.toLocaleString("pt-BR") } } },
                x: { grid: { display: false }, ticks: { color: colors.textColor } }
            },
        },
    });
}

/**
 * Função dedicada para buscar o histórico de Índices (IBOV, IVVB11) do Firestore.
 */
async function fetchIndexHistoricalData(ticker) {
    console.log(`[Chart Performance] Buscando fallback para o índice ${ticker} no Firestore.`);
    try {
        // Busca um período maior para garantir dados para normalização
        const umAnoAtras = new Date();
        umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
        const dataInicioBusca = umAnoAtras.toISOString().split('T')[0];

        const q = query(
            collection(db, "indices"),
            where("ticker", "==", ticker),
            where("data", ">=", dataInicioBusca), // Busca desde 1 ano atrás
            orderBy("data", "asc") // Ordena crescente para facilitar encontrar a base
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error(`Nenhum dado histórico encontrado no Firestore para o índice ${ticker}.`);
            return null;
        }

        const historicalDataPrice = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                date: data.data, // Usa a string YYYY-MM-DD diretamente
                close: data.valor
            };
        });

        // A ordenação já é feita pelo Firestore (orderBy data asc)

        return {
            results: [{
                symbol: ticker,
                historicalDataPrice: historicalDataPrice
            }]
        };

    } catch (error) {
        console.error(`Erro ao buscar fallback de índice ${ticker} no Firestore:`, error);
        return null;
    }
}


export async function renderPerformanceChart(ticker, lancamentosDoAtivo, allProventosData) {
    if (performanceChart) { performanceChart.destroy(); performanceChart = null }
    const container = document.getElementById('ativo-detalhes-performance');
    if (!container) return;
    const canvas = document.getElementById('performance-chart');
    if (!canvas) { container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Erro interno: Não foi possível encontrar o elemento do gráfico.</p>`; return }
    const ctx = canvas.getContext('2d');
    if (lancamentosDoAtivo.length === 0) { container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Sem lançamentos para gerar gráfico de performance.</p>'; return }

    container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Carregando dados de performance...</p>';

    try {
        const colors = getThemeColors();
        const lancamentosOrdenados = [...lancamentosDoAtivo].sort((a, b) => new Date(a.data) - new Date(b.data));
        const dataInicio = lancamentosOrdenados[0].data;
        const hojeDate = new Date();
        const dataFinalParaAPI = hojeDate.toISOString().split('T')[0];

        // Aumenta o range da busca para garantir que temos dados antes do primeiro lançamento se necessário
        const [dadosAtivo, { historicoCDI }, dadosIBOV, dadosIVVB11] = await Promise.all([
            fetchHistoricalData(ticker, '6mo'), // Busca 6 meses por segurança
            fetchIndexers(dataInicio, dataFinalParaAPI),
            fetchIndexHistoricalData('^BVSP'),
            fetchIndexHistoricalData('IVVB11')
        ]);

        // Validações mais robustas
        if (!dadosAtivo?.results?.[0]?.historicalDataPrice) throw new Error(`Dados históricos indisponíveis para ${ticker}`);
        if (!historicoCDI) throw new Error(`Dados de CDI indisponíveis`);
        if (!dadosIBOV?.results?.[0]?.historicalDataPrice) console.warn("Dados do IBOV indisponíveis.");
        if (!dadosIVVB11?.results?.[0]?.historicalDataPrice) console.warn("Dados do IVVB11 indisponíveis.");


        const historicoPrecos = dadosAtivo.results[0].historicalDataPrice.reduce((acc, item) => { const data = new Date(item.date * 1000).toISOString().split('T')[0]; acc[data] = item.close; return acc }, {});
        const dataInicialLancamento = new Date(lancamentosOrdenados[0].data + 'T00:00:00');
        const dataInicioStr = dataInicialLancamento.toISOString().split('T')[0];

        let cdiAcumulado = 1;
        const historicoCDIIndex = {};
        historicoCDI.forEach(item => { const data = item.data.split('/').reverse().join('-'); historicoCDIIndex[data] = parseFloat(item.valor) / 100; });

        const normalizarIndice = (dadosIndice, dataInicioStr) => {
            if (!dadosIndice?.results?.[0]?.historicalDataPrice) return {};
            const precosHistoricos = dadosIndice.results[0].historicalDataPrice; // Já vem ordenado asc do Firestore
            if (!precosHistoricos || !precosHistoricos.length) return {};

            let valorBase = null;
            let dataBase = null;
            // Encontra o primeiro preço NO DIA ou APÓS a data de início
            for(const item of precosHistoricos) {
                if (item.date >= dataInicioStr) {
                    valorBase = item.close;
                    dataBase = item.date;
                    break;
                }
            }

            if (valorBase === null || valorBase === 0) { console.warn(`Não foi possível encontrar um preço base válido (>0) para normalizar ${dadosIndice.results[0].symbol}`); return {}; }

            const historicoNormalizado = {};
            precosHistoricos.forEach(item => {
                 if (item.date >= dataBase) { // Normaliza apenas a partir da data base
                     historicoNormalizado[item.date] = ((item.close / valorBase) - 1) * 100;
                 }
            });
            return historicoNormalizado;
        };


        const historicoIBOV = normalizarIndice(dadosIBOV, dataInicioStr);
        const historicoIVVB11 = normalizarIndice(dadosIVVB11, dataInicioStr);

        const labels = [];
        const dataCarteira = [];
        const dataCDI = [];
        const dataIBOV = [];
        const dataIVVB11 = [];
        let quantidade = 0;
        let valorInvestidoAcumulado = 0; // Custo base da posição atual
        let ultimoPrecoAtivo = null;
        let cdiAcumPerf = 0;
        let ultimoIbov = null;
        let ultimoIvvb11 = null;
        let primeiroValorCarteira = null;


        for (let d = new Date(dataInicialLancamento); d <= hojeDate; d.setDate(d.getDate() + 1)) {
            const dataAtualStr = d.toISOString().split('T')[0];
            labels.push(dataAtualStr);

            const lancamentosDoDia = lancamentosOrdenados.filter(l => l.data === dataAtualStr);
            if (lancamentosDoDia.length > 0) {
                 lancamentosDoDia.forEach(l => {
                     if (l.tipoOperacao === 'compra') {
                         valorInvestidoAcumulado += l.valorTotal;
                         quantidade += l.quantidade;
                     } else {
                         // Ajusta custo base proporcionalmente na venda
                         const custoMedio = (quantidade > 0 && valorInvestidoAcumulado > 0) ? valorInvestidoAcumulado / quantidade : 0;
                         valorInvestidoAcumulado -= l.quantidade * custoMedio;
                         quantidade -= l.quantidade;
                     }
                 });
                 if (valorInvestidoAcumulado < 0) valorInvestidoAcumulado = 0;
            }

            const precoDoDia = historicoPrecos[dataAtualStr] || ultimoPrecoAtivo;
            if (precoDoDia !== null) ultimoPrecoAtivo = precoDoDia;

            const valorCarteiraHoje = (quantidade > 0 && precoDoDia !== null) ? quantidade * precoDoDia : (dataCarteira.length > 0 ? dataCarteira[dataCarteira.length-1].valorBruto : 0);

            // Define o primeiro valor base como o custo após o primeiro dia de lançamentos
            if (primeiroValorCarteira === null && valorInvestidoAcumulado > 0) {
                primeiroValorCarteira = valorInvestidoAcumulado;
            }

            // Rentabilidade simples (Valor Atual / Custo Base Acumulado) - 1
            const rentabilidadeCarteira = (valorInvestidoAcumulado > 0 && valorCarteiraHoje > 0)
                ? ((valorCarteiraHoje / valorInvestidoAcumulado) - 1) * 100
                : (dataCarteira.length > 0 ? dataCarteira[dataCarteira.length - 1].rentabilidade : 0); // Repete se custo for zero

            dataCarteira.push({ valorBruto: valorCarteiraHoje, rentabilidade: rentabilidadeCarteira });


            const taxaCdiDia = historicoCDIIndex[dataAtualStr] || 0;
            // Acumula CDI corretamente
             if (cdiAcumPerf === 0 && taxaCdiDia !== 0) { // Inicia acumulação
                 cdiAcumPerf = (1 + taxaCdiDia) -1;
             } else if (cdiAcumPerf !== 0 || taxaCdiDia !== 0) { // Continua acumulação
                  cdiAcumPerf = (1 + cdiAcumPerf/100) * (1 + taxaCdiDia) - 1;
             }
            dataCDI.push(cdiAcumPerf * 100);

            const ibovHoje = historicoIBOV[dataAtualStr];
            dataIBOV.push(typeof ibovHoje === 'number' ? ibovHoje : ultimoIbov);
            if (typeof ibovHoje === 'number') ultimoIbov = ibovHoje;

            const ivvb11Hoje = historicoIVVB11[dataAtualStr];
            dataIVVB11.push(typeof ivvb11Hoje === 'number' ? ivvb11Hoje : ultimoIvvb11);
            if (typeof ivvb11Hoje === 'number') ultimoIvvb11 = ivvb11Hoje;
        }

        container.innerHTML = '';
        container.appendChild(canvas);


        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: `Performance ${ticker}`, data: dataCarteira.map(d => d.rentabilidade), borderColor: colors.primary, backgroundColor: colors.primaryArea, fill: false, tension: 0.2, pointRadius: 0 },
                    { label: 'CDI', data: dataCDI, borderColor: colors.neutral, borderDash: [5, 5], backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 },
                    { label: 'IBOV', data: dataIBOV, borderColor: colors.quaternary, backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 },
                    { label: 'IVVB11', data: dataIVVB11, borderColor: colors.secondary, backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: colors.textColor, callback: function (value) { return value.toFixed(1) + '%' } }, grid: { color: colors.gridColor } },
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd/MM/yy', displayFormats: { day: 'dd/MM' } }, ticks: { color: colors.textColor }, grid: { display: false } }
                },
                 spanGaps: true,
                plugins: {
                    tooltip: {
                        mode: 'index', intersect: false, backgroundColor: colors.tooltipBg, titleColor: colors.tooltipColor, bodyColor: colors.tooltipColor,
                        callbacks: {
                            label: function (context) { let label = context.dataset.label || ''; if (label) { label += ': ' } if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2) + '%' } return label }
                        }
                    },
                    legend: { labels: { color: colors.textColor } }
                }
            }
        });
    } catch (error) { console.error("Erro ao buscar dados para o gráfico de performance:", error); container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Não foi possível carregar os dados de performance.<br><small>${error.message}</small></p>` }
}


// --- INÍCIO DAS MODIFICAÇÕES PARA PERFORMANCE CONSOLIDADA ---

/**
 * Busca os lançamentos (compras/vendas) dentro de um período.
 */
async function fetchLancamentosDoPeriodo(userId, startDate, endDate) {
    if (!userId) return [];
    try {
        const dataInicioStr = startDate.toISOString().split('T')[0];
        const dataFimStr = endDate.toISOString().split('T')[0];

        const q = query(
            collection(db, "lancamentos"),
            where("userID", "==", userId),
            where("data", ">=", dataInicioStr),
            where("data", "<=", dataFimStr),
            orderBy("data", "asc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Erro ao buscar lançamentos do período:", error);
        return [];
    }
}


async function fetchPerformanceData(userId, startDate, endDate) { // Adicionado endDate
    const dataInicioStr = startDate.toISOString().split('T')[0];
    const dataFimStr = endDate.toISOString().split('T')[0]; // Adicionado

     // Define uma data limite para buscar índices (1 ano antes do início para garantir base de normalização)
    const indexStartDate = new Date(startDate);
    indexStartDate.setFullYear(indexStartDate.getFullYear() - 1);
    const indexStartDateStr = indexStartDate.toISOString().split('T')[0];


    const fetchData = async (collectionName, tickerField, tickerValue, start = dataInicioStr) => { // Adicionado start date
        const q = query(
            collection(db, collectionName),
            where(tickerField, "==", tickerValue),
            where("data", ">=", start), // Usa start date flexível
            where("data", "<=", dataFimStr),
            orderBy("data", "asc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    };

    const [carteiraRaw, ibovRaw, ivvb11Raw, cdiRaw, ipcaRaw] = await Promise.all([
        fetchData("historicoPatrimonioDiario", "userID", userId), // Busca patrimônio só do período
        fetchData("indices", "ticker", "^BVSP", indexStartDateStr), // Busca índices desde antes
        fetchData("indices", "ticker", "IVVB11", indexStartDateStr),// Busca índices desde antes
        fetchData("indices", "ticker", "CDI", indexStartDateStr), // Busca índices desde antes
        fetchData("indices", "ticker", "IPCA", indexStartDateStr) // Busca índices desde antes
    ]);

    const carteiraGrouped = carteiraRaw.reduce((acc, curr) => {
        acc[curr.data] = (acc[curr.data] || 0) + curr.valorPatrimonio;
        return acc;
    }, {});
    const carteiraSeries = Object.entries(carteiraGrouped).map(([date, value]) => ({ date, value }));

    const indexToSeries = (rawData) => rawData.map(d => ({ date: d.data, value: d.valor }));

    return {
        carteira: carteiraSeries,
        ibov: indexToSeries(ibovRaw),
        ivvb11: indexToSeries(ivvb11Raw),
        cdi: indexToSeries(cdiRaw),
        ipca: indexToSeries(ipcaRaw)
    };
}

/**
 * Processa os dados brutos e calcula a performance percentual para cada série.
 * Agora aceita lançamentos para ajustar a performance da carteira.
 */
function processAndCalculatePerformance(seriesData, startDate, endDate, lancamentos) {
    const labels = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        labels.push(d.toISOString().split('T')[0]);
    }

    const cashFlowByDate = new Map();
    lancamentos.forEach(l => {
        const valor = l.valorTotal || l.valorAplicado || 0;
        const fluxo = l.tipoOperacao === 'compra' ? valor : -valor;
        cashFlowByDate.set(l.data, (cashFlowByDate.get(l.data) || 0) + fluxo);
    });

    // --- NOVA VERSÃO: TWR de verdade, diário ---
// --- VERSÃO TWR com proteção p/ aporte sem patrimônio ---
// --- VERSÃO TWR com proteção p/ aporte sem patrimônio ---
// --- VERSÃO TWR à prova de aporte sem patrimônio do dia ---
const calculateAdjustedPerformance = (series, cashFlowMap, dateLabels) => {
    if (!series || series.length === 0) {
        return new Array(dateLabels.length).fill(null);
    }

    // patrimônio por data
    const seriesMap = new Map(series.map(s => [s.date, s.value]));

    const twrValues = [];
    let twrCum = 1;
    let prevMV = null; // BMV

    for (let i = 0; i < dateLabels.length; i++) {
        const date = dateLabels[i];
        const rawMV = seriesMap.get(date);              // patrimônio vindo do Firestore
        const cashFlow = cashFlowMap.get(date) || 0;    // aportes/retiradas do dia

        // 1) primeiro dia válido
        if (prevMV === null) {
            // se já veio patrimônio nesse dia, usamos
            if (rawMV !== undefined && rawMV !== null && rawMV > 0) {
                prevMV = rawMV;
                twrValues.push(0);
            } else {
                // não tem patrimônio ainda -> fica null
                twrValues.push(null);
            }
            continue;
        }

        // 2) caso crítico: teve aporte mas o patrimônio do dia NÃO veio
        //    (isso está acontecendo com você)
        if ((rawMV === undefined || rawMV === null) && cashFlow > 0) {
            // considera que o patrimônio do dia é o de ontem + o fluxo,
            // mas o retorno é 0%, porque não houve variação de preço
            const todayMV = prevMV + cashFlow;
            prevMV = todayMV;
            twrValues.push( +(((twrCum - 1) * 100).toFixed(2)) );
            continue;
        }

        // 3) se não veio patrimônio nem teve fluxo -> repete o anterior e retorno 0
        if ((rawMV === undefined || rawMV === null) && cashFlow === 0) {
            const todayMV = prevMV;
            // retorno 0
            twrValues.push( +(((twrCum - 1) * 100).toFixed(2)) );
            prevMV = todayMV;
            continue;
        }

        // 4) caso normal TWR
        const todayMV = rawMV;
        let dailyReturn = 0;

        if (prevMV > 0) {
            // fórmula TWR: (EMV - CF - BMV) / BMV
            dailyReturn = (todayMV - cashFlow - prevMV) / prevMV;
        }

        twrCum = twrCum * (1 + dailyReturn);
        twrValues.push( +(((twrCum - 1) * 100).toFixed(2)) );

        // atualiza BMV
        prevMV = todayMV;
    }

    return twrValues;
};






    // Função original para normalizar índices (sem ajuste de fluxo)
    const fillAndNormalize = (series) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date, s.value]));
        const filledValues = [];
        let lastValue = null;
        let baseValue = null;
        let firstValidIndex = -1;

        // Encontra o valor base NO PRIMEIRO DIA DO PERÍODO DO GRÁFICO (labels[0]) ou o mais próximo depois
        const startDateLabel = labels[0];
        for (let i = 0; i < series.length; i++) {
            if (series[i].date >= startDateLabel) {
                 // Encontra o índice correspondente nos labels
                 const labelIndex = labels.indexOf(series[i].date);
                 if (labelIndex !== -1) {
                    baseValue = series[i].value;
                    firstValidIndex = labelIndex; // O índice no array de labels
                    break;
                 }
            }
        }

        // Se não encontrou valor base válido no período, retorna nulo
        if (baseValue === null || baseValue === 0 || firstValidIndex === -1) {
            // console.warn("Não foi possível encontrar valor base para normalizar índice.");
            return new Array(labels.length).fill(null);
        }

        // Preenche com nulls antes do primeiro índice válido
        for (let i = 0; i < firstValidIndex; i++) {
             filledValues.push(null);
        }
         // Preenche a partir do índice válido
        for (let i = firstValidIndex; i < labels.length; i++) {
             const date = labels[i];
             lastValue = seriesMap.get(date) ?? lastValue; // Usa fallback
             filledValues.push(lastValue);
        }

        // Normaliza em relação ao valor base
        return filledValues.map(v => v === null ? null : ((v / baseValue) - 1) * 100);
    };


    const processCDI = (series) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date, s.value]));
        const performanceData = [];
        let accumulatedIndex = 1;
        let firstValidIndex = labels.findIndex(date => seriesMap.has(date));

        if (firstValidIndex === -1) return new Array(labels.length).fill(null);

        for (let i = 0; i < labels.length; i++) {
            const date = labels[i];
            if (i < firstValidIndex) {
                performanceData.push(null);
                continue;
            }
            // A acumulação começa *a partir do* primeiro dia com dados, então a performance é 0 nele
            if (i === firstValidIndex) {
                 accumulatedIndex = 1; // Reseta para 0% no dia inicial
                 performanceData.push(0);
                 continue; // Pula a acumulação neste dia
            }

            const rate = seriesMap.get(date) ?? 0;
            // Só acumula se a taxa for encontrada para evitar distorção em dias sem dados
            if (seriesMap.has(date)) {
                accumulatedIndex *= (1 + rate / 100);
            }
            performanceData.push((accumulatedIndex - 1) * 100);
        }
        return performanceData;
    };

     const processIPCA = (series, labels) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date.substring(0, 7), s.value])); // Mapeia por mês YYYY-MM
        const performanceData = [];
        const accumulatedValues = {}; // Acumulado por mês
        const sortedMonths = [...seriesMap.keys()].sort();
        let accumulatedIndex = 1;
        let firstValidMonthIndex = -1;
        let firstLabelMonth = labels.length > 0 ? labels[0].substring(0, 7) : null;

        // Encontra o primeiro mês com dados que está DENTRO ou DEPOIS do período do gráfico
        for (let i = 0; i < sortedMonths.length; i++) {
            if (firstLabelMonth && sortedMonths[i] >= firstLabelMonth) {
                firstValidMonthIndex = i;
                break;
            }
        }

        if (firstValidMonthIndex === -1) return new Array(labels.length).fill(null); // Nenhum dado no período

        // Acumula a partir do primeiro mês relevante encontrado
        accumulatedIndex = 1;
        accumulatedValues[sortedMonths[firstValidMonthIndex]] = 0; // Performance inicial é 0 no primeiro mês
        for (let i = firstValidMonthIndex + 1; i < sortedMonths.length; i++) {
            const month = sortedMonths[i];
            const previousMonth = sortedMonths[i - 1];
            // Usa a taxa do mês *anterior* para calcular o acumulado do mês atual
            const ratePreviousMonth = seriesMap.get(previousMonth);
            if (ratePreviousMonth !== undefined) {
                 accumulatedIndex *= (1 + ratePreviousMonth / 100);
            }
            accumulatedValues[month] = (accumulatedIndex - 1) * 100;
        }


        let lastPerf = null;
        for (const date of labels) {
            const month = date.substring(0, 7);
            // Antes do primeiro mês com dados, retorna null
            if (firstValidMonthIndex !== -1 && month < sortedMonths[firstValidMonthIndex]) {
                performanceData.push(null);
                continue;
            }
            const perf = accumulatedValues[month];
            if (perf !== undefined) {
                performanceData.push(perf);
                lastPerf = perf;
            } else {
                 // Se não há dados para o mês atual (pode acontecer no último mês incompleto), repete
                performanceData.push(lastPerf);
            }
        }
        return performanceData;
    };


    return {
        labels,
        carteira: calculateAdjustedPerformance(seriesData.carteira, cashFlowByDate, labels),
        ibov: fillAndNormalize(seriesData.ibov),
        ivvb11: fillAndNormalize(seriesData.ivvb11),
        cdi: processCDI(seriesData.cdi),
        ipca: processIPCA(seriesData.ipca, labels)
    };
}


export async function renderConsolidatedPerformanceChart(period = '6m', mainIndex = 'IBOV') {
    const canvas = document.getElementById('consolidated-performance-chart');
    if (!canvas || !auth.currentUser) return;

    if (isChartRendering) {
        console.warn("Renderização de gráfico já em progresso, pulando nova requisição.");
        return;
    }
    isChartRendering = true;

    try {
        if (consolidatedPerformanceChart) {
            consolidatedPerformanceChart.destroy();
            consolidatedPerformanceChart = null;
        }
        const colors = getThemeColors();

        const endDate = new Date();
        const startDate = new Date();

        switch (period) {
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case 'ytd': startDate.setMonth(0, 1); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
            case '2y': startDate.setFullYear(endDate.getFullYear() - 2); break;
            case '5y': startDate.setFullYear(endDate.getFullYear() - 5); break;
            case 'all': startDate.setFullYear(endDate.getFullYear() - 10); break; // Limita a 10 anos
        }
        if (startDate.getFullYear() < 2000) startDate.setFullYear(2000, 0, 1);

        const lancamentosDoPeriodo = await fetchLancamentosDoPeriodo(auth.currentUser.uid, startDate, endDate);
        const rawData = await fetchPerformanceData(auth.currentUser.uid, startDate, endDate);
        const chartData = processAndCalculatePerformance(rawData, startDate, endDate, lancamentosDoPeriodo);

        const datasets = [
            { label: 'Carteira', data: chartData.carteira, borderColor: colors.primary, tension: 0.1, pointRadius: 0, borderWidth: 2.5 },
            { label: 'CDI', data: chartData.cdi, borderColor: colors.neutral, tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] },
            { label: 'IPCA', data: chartData.ipca, borderColor: colors.tertiary, tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] }
        ];

        datasets.push({ label: 'IBOV', data: chartData.ibov, borderColor: colors.ibov, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
        datasets.push({ label: 'IVVB11', data: chartData.ivvb11, borderColor: colors.secondary, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });

        const validDatasets = datasets.filter(ds => ds.data && ds.data.some(val => val !== null));


        consolidatedPerformanceChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: validDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { position: 'top', align: 'center', labels: { color: colors.textColor, usePointStyle: true, boxWidth: 8, padding: 20 } },
                    tooltip: {
                        backgroundColor: colors.tooltipBg, titleColor: colors.tooltipColor, bodyColor: colors.tooltipColor,
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                if (value === null) return null;
                                return `${context.dataset.label}: ${value.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                     y: {
                        ticks: { color: colors.textColor, callback: value => value.toFixed(1) + '%' },
                        grid: { color: colors.gridColor }
                    },
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'dd/MM/yy',
                            displayFormats: { day: 'dd/MM', month: 'MMM/yy', year: 'yyyy' }
                        },
                        ticks: { color: colors.textColor, major: { enabled: true }, autoSkip: true, maxTicksLimit: 15 },
                        grid: { display: false }
                    }
                },
                spanGaps: true,
            }
        });

        // Retorna os dados processados para atualizar os cards de resumo
        return chartData;

    } catch (error) {
        console.error("Erro ao renderizar gráfico de performance consolidado:", error);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getThemeColors().textColor;
        ctx.textAlign = 'center';
        ctx.fillText('Erro ao carregar dados de performance.', canvas.width / 2, canvas.height / 2);
        return null;

    } finally {
        isChartRendering = false;
    }
}
// --- FIM DAS MODIFICAÇÕES ---


export function renderProventosPorAtivoBarChart(proventos) {
    const canvas = document.getElementById("proventos-por-ativo-bar-chart");
    if (!canvas) return;
    const colors = getThemeColors();

    if (proventosPorAtivoBarChart) {
        proventosPorAtivoBarChart.destroy();
    }

    const porAtivo = proventos.reduce((acc, p) => {
        acc[p.ativo] = (acc[p.ativo] || 0) + p.valor;
        return acc;
    }, {});

    const sortedData = Object.entries(porAtivo).sort(([, a], [, b]) => b - a);

    const labels = sortedData.map(item => item[0]);
    const data = sortedData.map(item => item[1]);

    proventosPorAtivoBarChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Recebido (R$)',
                data: data,
                backgroundColor: colors.primaryTransparent,
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: getBarChartOptions('y')
    });
}

/**
 * Renderiza o novo gráfico de Dividend Yield por Ativo.
 */
export function renderDividendYieldChart(proventos, lancamentos, precosEInfos) {
    const canvas = document.getElementById('dividend-yield-chart');
    if (!canvas) return;

    if (dividendYieldChart) {
        dividendYieldChart.destroy();
    }
    const themeColors = getThemeColors();

    const periodo = document.getElementById('dy-periodo-filter').value;
    const tipoAtivoFiltro = document.getElementById('dy-tipo-ativo-filter').value;

    const hoje = new Date();
    const dataInicio = new Date();
    if (periodo === '12m') dataInicio.setFullYear(hoje.getFullYear() - 1);
    else if (periodo === '6m') dataInicio.setMonth(hoje.getMonth() - 6);
    else if (periodo === 'ytd') dataInicio.setMonth(0, 1);
    else if (periodo === '5y') dataInicio.setFullYear(hoje.getFullYear() - 5);

    let proventosFiltrados = proventos.filter(p => new Date(p.dataPagamento + 'T00:00:00') >= dataInicio);
    if (tipoAtivoFiltro !== 'Todos') {
        proventosFiltrados = proventosFiltrados.filter(p => p.tipoAtivo === tipoAtivoFiltro);
    }

    const proventosPorAtivo = proventosFiltrados.reduce((acc, p) => {
        if (!acc[p.ativo]) {
            acc[p.ativo] = { total: 0, tipoAtivo: p.tipoAtivo };
        }
        acc[p.ativo].total += p.valor;
        return acc;
    }, {});

    const carteira = (lancamentos || []).reduce((acc, l) => {
        if (!acc[l.ativo]) {
            acc[l.ativo] = { quantidade: 0 };
        }
        if (l.tipoOperacao === 'compra') acc[l.ativo].quantidade += l.quantidade;
        else if (l.tipoOperacao === 'venda') acc[l.ativo].quantidade -= l.quantidade;
        return acc;
    }, {});

    let dyData = Object.keys(proventosPorAtivo).map(ticker => {
        const proventoInfo = proventosPorAtivo[ticker];
        const posicao = carteira[ticker];
        const precoAtual = precosEInfos[ticker]?.price || 0;

        if (!posicao || posicao.quantidade <= 0 || precoAtual <= 0) {
            return null;
        }

        const valorDeMercado = posicao.quantidade * precoAtual;
        const dividendYield = (proventoInfo.total / valorDeMercado) * 100;

        return {
            ticker,
            dividendYield,
            tipoAtivo: proventoInfo.tipoAtivo,
            totalProventos: proventoInfo.total
        };
    }).filter(Boolean);

    dyData.sort((a, b) => b.dividendYield - a.dividendYield);

    const labels = dyData.map(d => d.ticker);
    const data = dyData.map(d => d.dividendYield);

    const colors = {
        'Ações': 'rgba(0, 217, 195, 0.7)',
        'FIIs': 'rgba(90, 103, 216, 0.7)',
        'ETF': 'rgba(237, 100, 166, 0.7)'
    };
    const defaultColor = 'rgba(160, 167, 179, 0.7)';
    const backgroundColors = dyData.map(d => colors[d.tipoAtivo] || defaultColor);

    const dataLabelsPlugin = {
        id: 'customDataLabels',
        afterDatasetsDraw(chart, args, options) {
            const { ctx } = chart;
            ctx.save();

            ctx.font = '500 11px "Open Sans"';
            ctx.fillStyle = themeColors.textColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            chart.getDatasetMeta(0).data.forEach((datapoint, index) => {
                const value = chart.data.datasets[0].data[index];
                if (value === null || value <= 0) return;

                const text = value.toFixed(2) + '%';
                const xPosition = datapoint.x + 4;
                const yPosition = datapoint.y;

                if (xPosition + ctx.measureText(text).width < chart.chartArea.right - 5) {
                    ctx.fillText(text, xPosition, yPosition);
                }
            });
            ctx.restore();
        }
    };

    dividendYieldChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Dividend Yield (%)',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(c => c.replace('0.7', '1')),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: themeColors.tooltipBg,
                    titleColor: themeColors.tooltipColor,
                    bodyColor: themeColors.tooltipColor,
                    callbacks: {
                        title: (context) => context[0].label,
                        label: (context) => {
                            const dataIndex = context.dataIndex;
                            if (dyData[dataIndex]) {
                                const item = dyData[dataIndex];
                                return `DY: ${item.dividendYield.toFixed(2)}%`;
                            }
                            return '';
                        },
                        afterBody: (context) => {
                            if (!context || context.length === 0) return '';
                            const dataIndex = context[0].dataIndex;
                            if (dyData[dataIndex]) {
                                const item = dyData[dataIndex];
                                return [
                                    `Total Recebido: ${item.totalProventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
                                    `Tipo: ${item.tipoAtivo}`
                                ];
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: themeColors.gridColor },
                    ticks: { color: themeColors.textColor, callback: (value) => value.toFixed(1) + '%' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: themeColors.textColor }
                }
            }
        },
        plugins: [dataLabelsPlugin]
    });
}
/**
 * Renderiza o gráfico de barras de renda mensal com prêmios de opções.
 */
export function renderOpcoesRendaMensalChart(opcoes) {
    const canvas = document.getElementById('opcoes-renda-mensal-chart');
    if (!canvas) return;
    window.opcoesRendaMensalData = opcoes;

    if (opcoesRendaMensalChart) {
        opcoesRendaMensalChart.destroy();
    }

    const rendaPorMes = opcoes
        .filter(op => op.operacao === 'Venda')
        .reduce((acc, op) => {
            const mesVencimento = op.vencimento.substring(0, 7);
            const premioTotal = op.premio * op.quantidade;
            acc[mesVencimento] = (acc[mesVencimento] || 0) + premioTotal;
            return acc;
        }, {});

    const sortedMonths = Object.keys(rendaPorMes).sort();

    const labels = sortedMonths.map(mes => {
        const [year, month] = mes.split('-');
        return new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
    });
    const data = sortedMonths.map(mes => rendaPorMes[mes]);

    const colors = getThemeColors();

    opcoesRendaMensalChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Prêmio Recebido (R$)',
                data: data,
                backgroundColor: colors.primaryTransparent,
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: getBarChartOptions('x')
    });
}

/**
 * Renderiza o gráfico de pizza com a distribuição de estratégias de opções.
 */
export function renderOpcoesEstrategiasChart(opcoes) {
    const canvas = document.getElementById('opcoes-estrategias-chart');
    if (!canvas) return;
    window.opcoesEstrategiasData = opcoes;

    if (opcoesEstrategiasChart) {
        opcoesEstrategiasChart.destroy();
    }

    const contagemEstrategias = opcoes.reduce((acc, op) => {
        const key = `${op.operacao} de ${op.tipo}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(contagemEstrategias);
    const data = Object.values(contagemEstrategias);

    const colors = getThemeColors();
    const backgroundColors = [
        colors.primary,
        colors.negative,
        colors.secondary,
        colors.quaternary
    ];

    opcoesEstrategiasChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: colors.pieBorderColor,
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: getDonutChartOptions()
    });
}

/**
 * Renderiza o gráfico de pizza com a distribuição de prêmios de opções por ativo.
 */
export function renderOpcoesPremioPorAtivoChart(opcoes) {
    const canvas = document.getElementById('opcoes-premio-por-ativo-chart');
    if (!canvas) return;
    window.opcoesPremioPorAtivoData = opcoes;

    if (opcoesPremioPorAtivoChart) {
        opcoesPremioPorAtivoChart.destroy();
    }

    const premioPorAtivo = opcoes
        .filter(op => op.operacao === 'Venda')
        .reduce((acc, op) => {
            const premioTotal = op.premio * op.quantidade;
            acc[op.ticker] = (acc[op.ticker] || 0) + premioTotal;
            return acc;
        }, {});

    const sortedData = Object.entries(premioPorAtivo).sort(([, a], [, b]) => b - a);

    const labels = sortedData.map(item => item[0]);
    const data = sortedData.map(item => item[1]);

    const colors = getThemeColors();
    const backgroundColors = [
        '#2dd4bf', '#60a5fa', '#f472b6', '#a78bfa', '#facc15', '#fb923c', '#9ca3af'
    ];

    const options = getDonutChartOptions();
    options.plugins.tooltip.callbacks.label = (context) => {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.chart.getDatasetMeta(0).total || 1;
        const percentage = total > 0 ? ((value / total) * 100) : 0;
        const formattedValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `${label}: ${formattedValue} (${percentage.toFixed(2)}%)`;
    };


    opcoesPremioPorAtivoChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: colors.pieBorderColor,
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: options
    });
}

// Listener para atualizar gráficos quando o tema mudar
document.addEventListener('themeChanged', () => {
    // Reconstrói gráficos que usam getThemeColors()
    if (movimentacaoChart && typeof window.movimentacaoLancamentos !== 'undefined') renderMovimentacaoChart(window.movimentacaoLancamentos);
    if (typeof window.allProventos !== 'undefined') {
        if (proventosPorAtivoChart) renderPieCharts(window.allProventos);
        if (proventosEvolucaoChart) renderEvolutionChart(window.allProventos);
        if (proventosPorAtivoBarChart) renderProventosPorAtivoBarChart(window.allProventos);
        if (dividendYieldChart && typeof window.allLancamentos !== 'undefined' && typeof window.precosEInfos !== 'undefined') {
            renderDividendYieldChart(window.allProventos, window.allLancamentos, window.precosEInfos);
        }
    }
    if (performanceChart && typeof window.activeTicker !== 'undefined' && typeof window.activeLancamentos !== 'undefined' && typeof window.allProventos !== 'undefined') {
        renderPerformanceChart(window.activeTicker, window.activeLancamentos, window.allProventos);
    }
    if (consolidatedPerformanceChart) updatePerformanceChart();
    if (acoesValorAtualChart && typeof window.acoesChartData !== 'undefined') renderAcoesValorAtualChart(window.acoesChartData);
    if (fiisValorAtualChart && typeof window.fiisChartData !== 'undefined') renderFiisValorAtualChart(window.fiisChartData);
    if (typeof window.allOpcoes !== 'undefined') {
        if (opcoesRendaMensalChart) renderOpcoesRendaMensalChart(window.allOpcoes);
        if (opcoesEstrategiasChart) renderOpcoesEstrategiasChart(window.allOpcoes);
        if (opcoesPremioPorAtivoChart) renderOpcoesPremioPorAtivoChart(window.allOpcoes);
    }
    // Adiciona re-renderização do gráfico de variação diária
    if (dailyVariationChart && typeof window.allLancamentos !== 'undefined') {
        renderVariacaoDiariaChart(window.allLancamentos);
    }
});