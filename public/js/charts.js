import { fetchHistoricalData } from './api/brapi.js';
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { fetchIndexers } from './api/bcb.js';

// --- VARIÁVEIS DE INSTÂNCIA DOS GRÁFICOS ---
let opcoesRendaMensalChart = null;
let opcoesEstrategiasChart = null;
let opcoesPremioPorAtivoChart = null;
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
 * Opções base para os gráficos de barra.
 */
const getBarChartOptions = (indexAxis = 'y') => {
    const colors = getThemeColors();
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
        scales: {
            x: {
                beginAtZero: true,
                grid: { color: indexAxis === 'y' ? colors.gridColor : colors.gridColorTransparent },
                ticks: {
                    color: colors.textColor,
                    callback: function (value) {
                        if (value >= 1000) return "R$ " + (value / 1000).toLocaleString('pt-BR') + "k";
                        return "R$ " + value.toLocaleString('pt-BR');
                    }
                }
            },
            y: {
                grid: { color: indexAxis === 'x' ? colors.gridColor : colors.gridColorTransparent },
                ticks: { color: colors.textColor }
            }
        }
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
        cutout: '65%', // Aumenta a espessura do anel
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
 * @param {Array} proventosDoPeriodo - Lista de proventos filtrados para o período clicado.
 * @param {string} title - O título para o modal (ex: "ago. de 25").
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
 * @param {Array<object>} chartData - Os dados dos ativos a serem exibidos.
 */
export function renderAcoesValorAtualChart(chartData) {
    const canvas = document.getElementById('acoes-valor-atual-chart');
    if (!canvas) return;

    if (acoesValorAtualChart) {
        acoesValorAtualChart.destroy();
    }

    if (!chartData || chartData.length === 0) {
        return; // Não renderiza nada se não houver dados
    }

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
 * @param {Array<object>} chartData - Os dados dos FIIs a serem exibidos.
 */
export function renderFiisValorAtualChart(chartData) {
    const canvas = document.getElementById('fiis-valor-atual-chart');
    if (!canvas) return;

    if (fiisValorAtualChart) {
        fiisValorAtualChart.destroy();
    }

    if (!chartData || chartData.length === 0) {
        return;
    }

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
    if (!chartCanvas || typeof Chart === "undefined") return;

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
        const [year, month, day] = l.data.split("-").map(Number);
        const dataOp = new Date(year, month - 1, day);
        const monthYearKey = `${dataOp.getFullYear()}-${String(dataOp.getMonth() + 1).padStart(2, "0")}`;
        if (monthYearKey >= minDateKey) {
            const valor = l.valorTotal || 0;
            if (l.tipoOperacao === "compra" && last6MonthsData[monthYearKey]) {
                last6MonthsData[monthYearKey].compra += valor;
            } else if (l.tipoOperacao === "venda" && last6MonthsData[monthYearKey]) {
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
                // Adicionado para criar um espaço interno
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
        (p) => new Date(p.dataPagamento) >= dataInicio
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
 * @param {string} ticker - O ticker do índice (ex: '^BVSP').
 * @returns {Promise<object|null>} - Retorna os dados no mesmo formato da API Brapi.
 */
async function fetchIndexHistoricalData(ticker) {
    console.log(`[Chart Performance] Buscando fallback para o índice ${ticker} no Firestore.`);
    try {
        const q = query(
            collection(db, "indices"), // Busca na coleção correta: 'indices'
            where("ticker", "==", ticker),
            orderBy("data", "desc"),
            limit(90) // Busca um histórico de 90 dias para ter dados suficientes
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error(`Nenhum dado histórico encontrado no Firestore para o índice ${ticker}.`);
            return null;
        }

        const historicalDataPrice = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                date: new Date(data.data).getTime() / 1000,
                close: data.valor // Usa o campo 'valor' que é o correto para índices
            };
        });

        historicalDataPrice.sort((a, b) => b.date - a.date);

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
    if (performanceChart) { performanceChart.destroy(); performanceChart = null }
    container.innerHTML = '';
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'performance-chart';
    container.appendChild(newCanvas);
    const canvas = document.getElementById('performance-chart');
    if (!canvas) { container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Erro interno: Não foi possível criar o elemento do gráfico.</p>`; return }
    const ctx = canvas.getContext('2d');
    if (lancamentosDoAtivo.length === 0) { container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Sem lançamentos para gerar gráfico de performance.</p>'; return }

    try {
        const colors = getThemeColors();
        const lancamentosOrdenados = [...lancamentosDoAtivo].sort((a, b) => new Date(a.data) - new Date(b.data));
        const dataInicio = lancamentosOrdenados[0].data;
        const hojeDate = new Date();
        const dataFinalParaAPI = hojeDate.toISOString().split('T')[0];

        const [dadosAtivo, { historicoCDI }, dadosIBOV, dadosIVVB11] = await Promise.all([
            fetchHistoricalData(ticker, '3mo'),
            fetchIndexers(dataInicio, dataFinalParaAPI),
            fetchIndexHistoricalData('^BVSP'),
            fetchIndexHistoricalData('IVVB11')
        ]);

        if (!dadosAtivo || dadosAtivo.error || !dadosAtivo.results || dadosAtivo.results.length === 0) throw new Error(`Dados indisponíveis para ${ticker}`);
        if (!dadosIBOV || dadosIBOV.error || !dadosIBOV.results || dadosIBOV.results.length === 0) console.warn("Dados do IBOV indisponíveis.");
        if (!dadosIVVB11 || dadosIVVB11.error || !dadosIVVB11.results || dadosIVVB11.results.length === 0) console.warn("Dados do IVVB11 indisponíveis.");

        const historicoPrecos = dadosAtivo.results[0].historicalDataPrice.reduce((acc, item) => { const data = new Date(item.date * 1000).toISOString().split('T')[0]; acc[data] = item.close; return acc }, {});
        const dataInicialLancamento = new Date(lancamentosOrdenados[0].data + 'T00:00:00');
        const dataInicioStr = dataInicialLancamento.toISOString().split('T')[0];
        let cdiAcumulado = 1;
        const historicoCDIIndex = {};
        let cdiIndexStartFactor = 1;
        historicoCDI.forEach(item => { const data = item.data.split('/').reverse().join('-'); cdiAcumulado *= (1 + (parseFloat(item.valor) / 100)); historicoCDIIndex[data] = cdiAcumulado; if (data === dataInicioStr) { cdiIndexStartFactor = cdiAcumulado } });

        const normalizarIndice = (dadosIndice, dataInicioStr) => {
            if (!dadosIndice || !dadosIndice.results || !dadosIndice.results.length) return {};
            const precosHistoricos = dadosIndice.results[0].historicalDataPrice;
            if (!precosHistoricos || !precosHistoricos.length) return {};
            const primeiroPrecoDisponivel = precosHistoricos.find(item => new Date(item.date * 1000).toISOString().split('T')[0] >= dataInicioStr);
            if (!primeiroPrecoDisponivel) { console.warn(`Não foi possível encontrar um preço base para normalizar o índice ${dadosIndice.results[0].symbol}`); return {} }
            const valorBase = primeiroPrecoDisponivel.close;
            return precosHistoricos.reduce((acc, item) => { const data = new Date(item.date * 1000).toISOString().split('T')[0]; acc[data] = ((item.close / valorBase) - 1) * 100; return acc }, {});
        };

        const historicoIBOV = normalizarIndice(dadosIBOV, dataInicioStr);
        const historicoIVVB11 = normalizarIndice(dadosIVVB11, dataInicioStr);
        const labels = [];
        const dataCarteira = [];
        const dataCDI = [];
        const dataIBOV = [];
        const dataIVVB11 = [];
        const costBasisArray = [];
        let quantidade = 0;
        let valorInvestidoAcumulado = 0;
        for (let d = new Date(dataInicialLancamento); d <= hojeDate; d.setDate(d.getDate() + 1)) {
            const dataAtualStr = d.toISOString().split('T')[0];
            labels.push(dataAtualStr);
            const lancamentosDoDia = lancamentosOrdenados.filter(l => l.data === dataAtualStr);
            if (lancamentosDoDia.length > 0) { lancamentosDoDia.forEach(l => { if (l.tipoOperacao === 'compra') { valorInvestidoAcumulado += l.valorTotal; quantidade += l.quantidade } else { const precoMedio = valorInvestidoAcumulado / quantidade; valorInvestidoAcumulado -= l.quantidade * precoMedio; quantidade -= l.quantidade } }) }
            const precoDoDia = historicoPrecos[dataAtualStr];
            if (precoDoDia && quantidade > 0) { dataCarteira.push(quantidade * precoDoDia) } else if (dataCarteira.length > 0) { dataCarteira.push(dataCarteira[dataCarteira.length - 1]) } else { dataCarteira.push(0) }
            costBasisArray.push(valorInvestidoAcumulado);
            const cdiIndex = historicoCDIIndex[dataAtualStr];
            if (cdiIndex) { const cdiGain = ((cdiIndex / cdiIndexStartFactor) - 1) * 100; dataCDI.push(cdiGain) } else if (dataCDI.length > 0) { dataCDI.push(dataCDI[dataCDI.length - 1]) } else { dataCDI.push(0) }
            const ibovGain = historicoIBOV[dataAtualStr];
            if (typeof ibovGain === 'number') { dataIBOV.push(ibovGain) } else if (dataIBOV.length > 0) { dataIBOV.push(dataIBOV[dataIBOV.length - 1]) } else { dataIBOV.push(0) }
            const ivvb11Gain = historicoIVVB11[dataAtualStr];
            if (typeof ivvb11Gain === 'number') { dataIVVB11.push(ivvb11Gain) } else if (dataIVVB11.length > 0) { dataIVVB11.push(dataIVVB11[dataIVVB11.length - 1]) } else { dataIVVB11.push(0) }
        }

        const dataCarteiraNormalizada = dataCarteira.map((v, i) => { const cost = costBasisArray[i]; if (cost > 0) { return ((v / cost) - 1) * 100 } return 0 });
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: `Performance ${ticker}`, data: dataCarteiraNormalizada, borderColor: colors.primary, backgroundColor: colors.primaryArea, fill: true, tension: 0.2, pointRadius: 0 },
                    { label: 'CDI', data: dataCDI, borderColor: colors.neutral, borderDash: [5, 5], backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 },
                    { label: 'IBOV', data: dataIBOV, borderColor: colors.quaternary, backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 },
                    { label: 'IVVB11', data: dataIVVB11, borderColor: colors.secondary, backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: colors.textColor, callback: function (value) { return value.toFixed(1) + '%' } }, grid: { color: colors.gridColor } },
                    x: { type: 'time', time: { unit: 'month' }, ticks: { color: colors.textColor }, grid: { display: false } }
                },
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

async function fetchPerformanceData(userId, startDate) {
    const dataInicioStr = startDate.toISOString().split('T')[0];

    const fetchData = async (collectionName, tickerField, tickerValue) => {
        const q = query(
            collection(db, collectionName),
            where(tickerField, "==", tickerValue),
            where("data", ">=", dataInicioStr),
            orderBy("data", "asc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    };

    const [carteiraRaw, ibovRaw, ivvb11Raw, cdiRaw, ipcaRaw] = await Promise.all([
        fetchData("historicoPatrimonioDiario", "userID", userId),
        fetchData("indices", "ticker", "^BVSP"),
        fetchData("indices", "ticker", "IVVB11"),
        fetchData("indices", "ticker", "CDI"),
        fetchData("indices", "ticker", "IPCA")
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

function processAndCalculatePerformance(seriesData, startDate, endDate) {
    const labels = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        labels.push(d.toISOString().split('T')[0]);
    }

    const fillAndNormalize = (series) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date, s.value]));
        const filledValues = [];
        let lastValue = null;
        let baseValue = null;
        let foundStart = false;
        for (const date of labels) {
            if (!foundStart && seriesMap.has(date)) {
                foundStart = true;
                baseValue = seriesMap.get(date);
            }
            if (!foundStart) {
                filledValues.push(null);
                continue;
            }
            lastValue = seriesMap.get(date) ?? lastValue;
            filledValues.push(lastValue);
        }
        if (baseValue === null || baseValue === 0) return new Array(labels.length).fill(0);
        return filledValues.map(v => v === null ? null : ((v / baseValue) - 1) * 100);
    };

    const processCDI = (series) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date, s.value]));
        const performanceData = [];
        let accumulatedIndex = 1;
        let foundStart = false;
        for (const date of labels) {
            if (!foundStart && series[0] && date < series[0].date) {
                performanceData.push(null);
                continue;
            }
            if (!foundStart) foundStart = true;
            const rate = seriesMap.get(date) ?? 0;
            accumulatedIndex *= (1 + rate / 100);
            performanceData.push((accumulatedIndex - 1) * 100);
        }
        return performanceData;
    };

    const processIPCA = (series, labels) => {
        if (!series || series.length === 0) return new Array(labels.length).fill(null);
        const seriesMap = new Map(series.map(s => [s.date.substring(0, 7), s.value]));
        const performanceData = [];
        const accumulatedValues = {};
        const sortedMonths = [...seriesMap.keys()].sort();
        let accumulatedIndex = 1;
        for (const month of sortedMonths) {
            const rate = seriesMap.get(month);
            accumulatedIndex *= (1 + rate / 100);
            accumulatedValues[month] = (accumulatedIndex - 1) * 100;
        }
        let lastPerf = null;
        for (const date of labels) {
            const month = date.substring(0, 7);
            const perf = accumulatedValues[month];
            if (perf !== undefined) {
                performanceData.push(perf);
                lastPerf = perf;
            } else {
                performanceData.push(lastPerf);
            }
        }
        return performanceData;
    };


    return {
        labels,
        carteira: fillAndNormalize(seriesData.carteira),
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
            case 'all': startDate.setFullYear(endDate.getFullYear() - 10); break;
        }

        const rawData = await fetchPerformanceData(auth.currentUser.uid, startDate);
        const chartData = processAndCalculatePerformance(rawData, startDate, endDate);

        const datasets = [
            { label: 'Carteira', data: chartData.carteira, borderColor: colors.primary, tension: 0.1, pointRadius: 0, borderWidth: 2.5 },
            { label: 'CDI', data: chartData.cdi, borderColor: colors.neutral, tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] },
            { label: 'IPCA', data: chartData.ipca, borderColor: colors.tertiary, tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] }
        ];

        if (mainIndex === 'IBOV') {
            datasets.push({ label: 'IBOV', data: chartData.ibov, borderColor: colors.ibov, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
            datasets.push({ label: 'IVVB11', data: chartData.ivvb11, borderColor: colors.secondary, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
        } else {
            datasets.push({ label: 'IBOV', data: chartData.ibov, borderColor: colors.ibov, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
            datasets.push({ label: 'IVVB11', data: chartData.ivvb11, borderColor: colors.secondary, tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
        }

        consolidatedPerformanceChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: datasets
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
                    y: { ticks: { color: colors.textColor, callback: value => value.toFixed(1) + '%' }, grid: { color: colors.gridColor } },
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd/MM/yy', displayFormats: { day: 'dd/MM' } }, ticks: { color: colors.textColor, major: { enabled: true } }, grid: { display: false } }
                }
            }
        });

        return chartData;

    } catch (error) {
        console.error("Erro ao renderizar gráfico de performance consolidado:", error);
    } finally {
        isChartRendering = false;
    }
}


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


    // --- LÓGICA DE CÁLCULO ---
    const periodo = document.getElementById('dy-periodo-filter').value;
    const tipoAtivoFiltro = document.getElementById('dy-tipo-ativo-filter').value;

    const hoje = new Date();
    const dataInicio = new Date();
    if (periodo === '12m') dataInicio.setFullYear(hoje.getFullYear() - 1);
    else if (periodo === '6m') dataInicio.setMonth(hoje.getMonth() - 6);
    else if (periodo === 'ytd') dataInicio.setMonth(0, 1);
    else if (periodo === '5y') dataInicio.setFullYear(hoje.getFullYear() - 5);

    let proventosFiltrados = proventos.filter(p => new Date(p.dataPagamento) >= dataInicio);
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

    // --- LÓGICA DE RENDERIZAÇÃO ---
    const labels = dyData.map(d => d.ticker);
    const data = dyData.map(d => d.dividendYield);

    const colors = {
        'Ações': 'rgba(21, 238, 166, 1)',
        'FIIs': 'rgba(0, 217, 195, 0.7)',
        'ETF': 'rgba(237, 100, 166, 0.7)'
    };
    const defaultColor = 'rgba(160, 167, 179, 0.7)';
    const backgroundColors = dyData.map(d => colors[d.tipoAtivo] || defaultColor);

    // Plugin customizado para desenhar os valores ao lado das barras
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

 // --- ADICIONE ESTA NOVA FUNÇÃO NO FINAL DO ARQUIVO ---
/**
 * Renderiza o gráfico de barras de renda mensal com prêmios de opções.
 * @param {Array<object>} opcoes - A lista de todas as operações com opções.
 */
export function renderOpcoesRendaMensalChart(opcoes) {
    const canvas = document.getElementById('opcoes-renda-mensal-chart');
    if (!canvas) return;

    if (opcoesRendaMensalChart) {
        opcoesRendaMensalChart.destroy();
    }

    // Filtra apenas as vendas e agrupa os prêmios por mês de vencimento
    const rendaPorMes = opcoes
        .filter(op => op.operacao === 'Venda')
        .reduce((acc, op) => {
            const mesVencimento = op.vencimento.substring(0, 7); // Formato YYYY-MM
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
        options: getBarChartOptions('x') // Usando 'x' para barras verticais
    });
}
// --- ADICIONE ESTA NOVA FUNÇÃO NO FINAL DO ARQUIVO ---
/**
 * Renderiza o gráfico de pizza com a distribuição de estratégias de opções.
 * @param {Array<object>} opcoes - A lista de todas as operações com opções.
 */
export function renderOpcoesEstrategiasChart(opcoes) {
    const canvas = document.getElementById('opcoes-estrategias-chart');
    if (!canvas) return;

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
// --- ADICIONE ESTA NOVA FUNÇÃO NO FINAL DO ARQUIVO ---
/**
 * Renderiza o gráfico de pizza com a distribuição de prêmios de opções por ativo.
 * @param {Array<object>} opcoes - A lista de todas as operações com opções.
 */
export function renderOpcoesPremioPorAtivoChart(opcoes) {
    const canvas = document.getElementById('opcoes-premio-por-ativo-chart');
    if (!canvas) return;

    if (opcoesPremioPorAtivoChart) {
        opcoesPremioPorAtivoChart.destroy();
    }

    // Filtra vendas e agrupa os prêmios por ativo
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
    // Customiza o tooltip para mostrar valor e percentual
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