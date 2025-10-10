import { fetchHistoricalData } from './api/brapi.js';
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

let movimentacaoChart = null;
let proventosPorAtivoChart = null;
let proventosEvolucaoChart = null;
let performanceChart = null;
let consolidatedPerformanceChart = null;
let proventosPorAtivoBarChart = null;
let dividendYieldChart = null;
let isChartRendering = false;
let proventosDetalheChart = null; // Variável para o novo gráfico de detalhes
let acoesValorAtualChart = null; // Variável para o novo gráfico de Ações


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

    proventosDetalheChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Recebido (R$)',
                data: data,
                backgroundColor: 'rgba(0, 217, 195, 0.7)',
                borderColor: '#00d9c3',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Gráfico de barras horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed.x;
                            return ' Recebido: ' + value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            return value.toLocaleString("pt-BR", { style: 'currency', currency: 'BRL' });
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" }
                }
            }
        }
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

    acoesValorAtualChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Atual (R$)',
                data: data,
                backgroundColor: 'rgba(0, 217, 195, 0.7)',
                borderColor: '#00d9c3',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y', // Gráfico de barras horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const index = context.dataIndex;
                            const value = context.parsed.x;
                            const percent = percentages[index];
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (value !== null) {
                                label += value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                            }
                            label += ` (${percent.toFixed(2)}%)`;
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            if (value >= 1000) {
                                return "R$ " + (value / 1000).toLocaleString('pt-BR') + "k";
                            }
                            return "R$ " + value.toLocaleString('pt-BR');
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: "#a0a7b3"
                    }
                }
            }
        }
    });
}


// ... (O restante das funções de renderMovimentacaoChart e renderPieCharts permanece igual)
export function renderMovimentacaoChart(lancamentos) {
    const chartCanvas = document.getElementById("movimentacao-chart");
    if (!chartCanvas || typeof Chart === "undefined") return;
    const last6MonthsData = {};
    const labels = [];
    const dataAtual = new Date();
    dataAtual.setDate(1);
    for (let i = 5; i >= 0; i--) {
        const date = new Date(
            dataAtual.getFullYear(),
            dataAtual.getMonth() - i,
            1
        );
        const monthYearKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(2, "0")}`;
        labels.push(
            date.toLocaleString("pt-BR", { month: "short", year: "2-digit" })
        );
        last6MonthsData[monthYearKey] = { compra: 0, venda: 0 };
    }
    const minDateKey = Object.keys(last6MonthsData)[0];
    lancamentos.forEach((l) => {
        const [year, month, day] = l.data.split("-").map(Number);
        const dataOp = new Date(year, month - 1, day);
        const monthYearKey = `${dataOp.getFullYear()}-${String(
            dataOp.getMonth() + 1
        ).padStart(2, "0")}`;
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
                backgroundColor: "rgba(0, 217, 195, 0.7)",
                borderColor: "#00d9c3",
                borderWidth: 1,
                borderRadius: 6,
            },
            {
                label: "Vendas (R$)",
                data: vendas,
                backgroundColor: "rgba(245, 101, 101, 0.7)",
                borderColor: "#F56565",
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
            scales: { x: { grid: { display: false }, ticks: { color: "#a0a7b3" } }, y: { grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: function (value) { if (value >= 1000) { return "R$ " + value / 1000 + "k" } return "R$ " + value } } } },
            plugins: {
                legend: { position: "top", align: "end", labels: { color: "#a0a7b3", usePointStyle: true, boxWidth: 8 } },
                tooltip: { backgroundColor: "#1A202C", titleColor: "#E2E8F0", bodyColor: "#E2E8F0", padding: 12, cornerRadius: 6, borderColor: "rgba(255, 255, 255, 0.1)", borderWidth: 1, callbacks: { label: function (context) { let label = context.dataset.label || ""; if (label) { label += ": " } const value = context.parsed.y; if (value !== null) { label += value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) } return label } } },
            },
        },
    });
};
export function renderPieCharts(proventos) {
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
        const modernColors = ["#00d9c3", "#5A67D8", "#ED64A6", "#F56565", "#ECC94B", "#4299E1", "#9F7AEA"];
        proventosPorAtivoChart = new Chart(ctxAtivo, {
            type: "doughnut",
            data: { labels: labelsAtivo, datasets: [{ data: dataAtivo, backgroundColor: modernColors, borderWidth: 2, borderColor: "#1a1b1e", borderRadius: 5 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "70%", hoverOffset: 12,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: "#1A202C", titleColor: "#E2E8F0", bodyColor: "#E2E8F0", padding: 12, cornerRadius: 6, borderColor: "rgba(255, 255, 255, 0.1)", borderWidth: 1, callbacks: { label: function (context) { const label = context.label || ""; const value = context.raw || 0; const total = context.chart.getDatasetMeta(0).total || 1; const percentage = ((value / total) * 100).toFixed(1); return `${label}: ${percentage}%` } } },
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
        tipoContainer.innerHTML = tipoHtml || '<p style="font-size: 0.8rem; color: #a0a7b3;">Sem dados.</p>';
    }
}

export function renderEvolutionChart(proventos) {
    const ctx = document.getElementById("proventos-evolucao-chart");
    if (!ctx) return;
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
        data: { labels: labels, datasets: [{ label: "Proventos Recebidos", data: data, backgroundColor: "#00d9c3", borderRadius: 4 }] },
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
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (context) { let label = context.dataset.label || ""; if (label) { label += ": " } const value = context.parsed.y; if (value !== null) { label += value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) } return label } } } },
            scales: { y: { beginAtZero: true, grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: function (value) { return "R$ " + value.toLocaleString("pt-BR") } } }, x: { grid: { display: false }, ticks: { color: "#a0a7b3" } } },
        },
    });
}
// ... (O restante do arquivo, a partir de renderPerformanceChart, permanece igual)
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
        const lancamentosOrdenados = [...lancamentosDoAtivo].sort((a, b) => new Date(a.data) - new Date(b.data));
        const dataInicio = lancamentosOrdenados[0].data;
        const hojeDate = new Date();
        const dataFinalParaAPI = hojeDate.toISOString().split('T')[0];

        const [dadosAtivo, { historicoCDI }, dadosIBOV, dadosIVVB11] = await Promise.all([
            fetchHistoricalData(ticker, '3mo'),
            fetchIndexers(dataInicio, dataFinalParaAPI),
            fetchHistoricalData('^BVSP', '3mo'),
            fetchHistoricalData('IVVB11', '3mo')
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
                datasets: [{ label: `Performance ${ticker}`, data: dataCarteiraNormalizada, borderColor: '#00d9c3', backgroundColor: 'rgba(0, 217, 195, 0.1)', fill: true, tension: 0.2, pointRadius: 0 }, { label: 'CDI', data: dataCDI, borderColor: '#a0a7b3', borderDash: [5, 5], backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 }, { label: 'IBOV', data: dataIBOV, borderColor: '#ECC94B', backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 }, { label: 'IVVB11', data: dataIVVB11, borderColor: '#5A67D8', backgroundColor: 'transparent', fill: false, tension: 0.2, pointRadius: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { ticks: { color: '#a0a7b3', callback: function (value) { return value.toFixed(1) + '%' } }, grid: { color: '#2a2c30' } }, x: { type: 'time', time: { unit: 'month' }, ticks: { color: '#a0a7b3' }, grid: { display: false } } },
                plugins: { tooltip: { mode: 'index', intersect: false, callbacks: { label: function (context) { let label = context.dataset.label || ''; if (label) { label += ': ' } if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2) + '%' } return label } } }, legend: { labels: { color: '#a0a7b3' } } }
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
            { label: 'Carteira', data: chartData.carteira, borderColor: '#00d9c3', tension: 0.1, pointRadius: 0, borderWidth: 2.5 },
            { label: 'CDI', data: chartData.cdi, borderColor: '#a0a7b3', tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] },
            { label: 'IPCA', data: chartData.ipca, borderColor: '#ED64A6', tension: 0.1, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5] }
        ];

        if (mainIndex === 'IBOV') {
            datasets.push({ label: 'IBOV', data: chartData.ibov, borderColor: 'rgba(255, 51, 0, 1)', tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
            datasets.push({ label: 'IVVB11', data: chartData.ivvb11, borderColor: '#5A67D8', tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
        } else {
            datasets.push({ label: 'IBOV', data: chartData.ibov, borderColor: 'rgba(255, 51, 0, 1)', tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
            datasets.push({ label: 'IVVB11', data: chartData.ivvb11, borderColor: '#5A67D8', tension: 0.1, pointRadius: 0, borderWidth: 1.5 });
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
                    legend: { position: 'top', align: 'center', labels: { color: '#a0a7b3', usePointStyle: true, boxWidth: 8, padding: 20 } },
                    tooltip: {
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
                    y: { ticks: { color: '#a0a7b3', callback: value => value.toFixed(1) + '%' }, grid: { color: '#2a2c30' } },
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd/MM/yy', displayFormats: { day: 'dd/MM' } }, ticks: { color: '#a0a7b3', major: { enabled: true } }, grid: { display: false } }
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
                backgroundColor: 'rgba(0, 217, 195, 0.7)',
                borderColor: '#00d9c3',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed.x;
                            return ' Total: ' + value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            return "R$ " + value.toLocaleString("pt-BR");
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" }
                }
            }
        }
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
            ctx.fillStyle = '#e0e0e0';
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
                    callbacks: {
                        title: (context) => context[0].label,
                        label: (context) => {
                            // CORREÇÃO APLICADA AQUI
                            const dataIndex = context.dataIndex;
                            if (dyData[dataIndex]) {
                                const item = dyData[dataIndex];
                                return `DY: ${item.dividendYield.toFixed(2)}%`;
                            }
                            return '';
                        },
                        afterBody: (context) => {
                            // E AQUI
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
                    grid: { color: "#2a2c30" },
                    ticks: { color: "#a0a7b3", callback: (value) => value.toFixed(1) + '%' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" }
                }
            }
        },
        plugins: [dataLabelsPlugin]
    });
}