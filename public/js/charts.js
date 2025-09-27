let movimentacaoChart = null;
let proventosPorAtivoChart = null;
let proventosEvolucaoChart = null;
let performanceChart = null;

// Gráfico de Movimentação (aba Lançamentos)
export function renderMovimentacaoChart(lancamentos) {
    const chartCanvas = document.getElementById("movimentacao-chart");
    if (!chartCanvas || typeof Chart === "undefined") return;

    // ... (cole aqui toda a lógica da função renderMovimentacaoChart do seu arquivo original)
    // ... é a função que começa com "const last6MonthsData = {};"
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
            scales: {
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: "#a0a7b3",
                    },
                },
                y: {
                    grid: {
                        color: "#2a2c30",
                    },
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            if (value >= 1000) {
                                return "R$ " + value / 1000 + "k";
                            }
                            return "R$ " + value;
                        },
                    },
                },
            },
            plugins: {
                legend: {
                    position: "top",
                    align: "end",
                    labels: {
                        color: "#a0a7b3",
                        usePointStyle: true,
                        boxWidth: 8,
                    },
                },
                tooltip: {
                    backgroundColor: "#1A202C",
                    titleColor: "#E2E8F0",
                    bodyColor: "#E2E8F0",
                    padding: 12,
                    cornerRadius: 6,
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || "";
                            if (label) {
                                label += ": ";
                            }
                            const value = context.parsed.y;
                            if (value !== null) {
                                label += value.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                });
                            }
                            return label;
                        },
                    },
                },
            },
        },
    });
};

// Gráficos de Pizza/Barra (aba Proventos)
export function renderPieCharts(proventos) {
    if (proventosPorAtivoChart) {
        proventosPorAtivoChart.destroy();
        proventosPorAtivoChart = null;
    }

    // ... (cole aqui toda a lógica da função renderPieCharts do seu arquivo original)
    const ctxAtivo = document.getElementById("proventos-por-ativo-chart");
    if (ctxAtivo) {
        const porAtivo = proventos.reduce((acc, p) => {
            acc[p.ativo] = (acc[p.ativo] || 0) + p.valor;
            return acc;
        }, {});
        const sortedAtivos = Object.entries(porAtivo)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7);
        const labelsAtivo = sortedAtivos.map((item) => item[0]);
        const dataAtivo = sortedAtivos.map((item) => item[1]);
        const modernColors = ["#00d9c3", "#5A67D8", "#ED64A6", "#F56565", "#ECC94B", "#4299E1", "#9F7AEA"];

        proventosPorAtivoChart = new Chart(ctxAtivo, {
            type: "doughnut",
            data: {
                labels: labelsAtivo,
                datasets: [{
                    data: dataAtivo,
                    backgroundColor: modernColors,
                    borderWidth: 2,
                    borderColor: "#1a1b1e",
                    borderRadius: 5,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "70%",
                hoverOffset: 12,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#1A202C",
                        titleColor: "#E2E8F0",
                        bodyColor: "#E2E8F0",
                        padding: 12,
                        cornerRadius: 6,
                        borderColor: "rgba(255, 255, 255, 0.1)",
                        borderWidth: 1,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || "";
                                const value = context.raw || 0;
                                const total = context.chart.getDatasetMeta(0).total || 1;
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${percentage}%`;
                            },
                        },
                    },
                },
            },
        });
    }

    const tipoContainer = document.getElementById("dist-por-tipo-container");
    if (tipoContainer) {
        const totalProventos = proventos.reduce((acc, p) => acc + p.valor, 0);
        const porTipo = proventos.reduce((acc, p) => {
            const tipo =
                p.tipoAtivo === "Ações" || p.tipoAtivo === "FIIs"
                    ? p.tipoAtivo
                    : "Outros";
            acc[tipo] = (acc[tipo] || 0) + p.valor;
            return acc;
        }, {});

        let tipoHtml = "";
        Object.entries(porTipo).forEach(([label, value]) => {
            const percentage = totalProventos > 0 ? (value / totalProventos) * 100 : 0;
            tipoHtml += `
            <div class="dist-item">
                <div class="dist-label">
                    <span>${label}</span>
                    <span>${percentage.toFixed(1)}%</span>
                </div>
                <div class="dist-bar-bg">
                    <div class="dist-bar-fill" style="width: ${percentage}%;"></div>
                </div>
            </div>
        `;
        });
        tipoContainer.innerHTML =
            tipoHtml ||
            '<p style="font-size: 0.8rem; color: #a0a7b3;">Sem dados.</p>';
    }

}

// Gráfico de Evolução (aba Proventos)
export function renderEvolutionChart(proventos) {
    const ctx = document.getElementById("proventos-evolucao-chart");
    if (!ctx) return;

    // ... (cole aqui toda a lógica da função renderEvolutionChart do seu arquivo original)
    // ... é a função que começa com "const intervalo = ..."
    const intervalo = document.querySelector("#intervalo-filter-group .active")
        .dataset.intervalo;
    const periodo = document.getElementById("periodo-filter").value;
    const tipoAtivo = document.getElementById("tipo-ativo-filter").value;
    const ativo = document.getElementById("ativo-filter").value;

    let proventosFiltrados = [...proventos];
    if (tipoAtivo !== "Todos") {
        proventosFiltrados = proventosFiltrados.filter(
            (p) => p.tipoAtivo === tipoAtivo
        );
    }
    if (ativo !== "Todos") {
        proventosFiltrados = proventosFiltrados.filter((p) => p.ativo === ativo);
    }

    const hoje = new Date();
    let dataInicio;
    if (periodo === "12m") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    } else if (periodo === "current_year") {
        dataInicio = new Date(hoje.getFullYear(), 0, 1);
    } else if (periodo === "5y") {
        dataInicio = new Date(hoje.getFullYear() - 4, 0, 1);
    }
    proventosFiltrados = proventosFiltrados.filter(
        (p) => new Date(p.dataPagamento) >= dataInicio
    );

    const aggregatedData = {};
    proventosFiltrados.forEach((p) => {
        const dataPag = new Date(p.dataPagamento + "T00:00:00");
        let key;
        if (intervalo === "Mensal") {
            key = `${dataPag.getFullYear()}-${String(
                dataPag.getMonth() + 1
            ).padStart(2, "0")}`;
        } else {
            key = dataPag.getFullYear().toString();
        }
        aggregatedData[key] = (aggregatedData[key] || 0) + p.valor;
    });

    const sortedKeys = Object.keys(aggregatedData).sort();
    const labels = sortedKeys.map((key) => {
        if (intervalo === "Mensal") {
            const [year, month] = key.split("-");
            return new Date(year, month - 1, 1).toLocaleString("pt-BR", {
                month: "short",
                year: "2-digit",
            });
        }
        return key;
    });
    const data = sortedKeys.map((key) => aggregatedData[key]);

    if (proventosEvolucaoChart) proventosEvolucaoChart.destroy();
    proventosEvolucaoChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Proventos Recebidos",
                    data: data,
                    backgroundColor: "#00d9c3",
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || "";
                            if (label) {
                                label += ": ";
                            }
                            const value = context.parsed.y;
                            if (value !== null) {
                                label += value.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                });
                            }
                            return label;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            return "R$ " + value.toLocaleString("pt-BR");
                        },
                    },
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" },
                },
            },
        },
    });
}

// Gráfico de Performance (Modal de Detalhes)
export async function renderPerformanceChart(ticker, lancamentosDoAtivo, allProventosData) {
    if (performanceChart) {
        performanceChart.destroy();
        performanceChart = null;
    }

    // ... (cole aqui toda a lógica da função renderPerformanceChart do seu arquivo original)
    const container = document.getElementById('ativo-detalhes-performance');

    if (performanceChart) {
        performanceChart.destroy();
        performanceChart = null;
    }

    container.innerHTML = '';

    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'performance-chart';
    container.appendChild(newCanvas);

    const canvas = document.getElementById('performance-chart');

    if (!canvas) {
        container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Erro interno: Não foi possível criar o elemento do gráfico.</p>`;
        return;
    }
    const ctx = canvas.getContext('2d');

    if (lancamentosDoAtivo.length === 0) {
        container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Sem lançamentos para gerar gráfico de performance.</p>';
        return;
    }

    let dadosAtivo;
    let dadosCDI;
    let dadosIBOV;
    let dadosIVVB11;

    try {
        const lancamentosOrdenados = [...lancamentosDoAtivo].sort((a, b) => new Date(a.data) - new Date(b.data));
        const dataInicio = lancamentosOrdenados[0].data;

        const hojeDate = new Date();
        const ontemDate = new Date(hojeDate);
        ontemDate.setDate(hojeDate.getDate() - 1);
        const dataFinalParaAPI = ontemDate.toISOString().split('T')[0];

        const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";
        const RANGE = '3mo';

        const [ativoResponse, cdiResponse, ibovResponse, ivvb11Response] = await Promise.all([
            fetch(`https://brapi.dev/api/quote/${ticker}?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`),
            fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dataInicio.split('-').reverse().join('/')}&dataFinal=${dataFinalParaAPI.split('-').reverse().join('/')}`),
            fetch(`https://brapi.dev/api/quote/^BVSP?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`),
            fetch(`https://brapi.dev/api/quote/IVVB11?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`)
        ]);

        if (!ativoResponse.ok) throw new Error(`Falha ao buscar ${ticker}`);
        dadosAtivo = await ativoResponse.json();
        if (dadosAtivo.error || !dadosAtivo.results || dadosAtivo.results.length === 0) throw new Error(`Dados indisponíveis para ${ticker}`);

        if (!cdiResponse.ok) throw new Error(`Erro ao buscar dados do CDI`);
        dadosCDI = await cdiResponse.json();

        if (!ibovResponse.ok) throw new Error(`Falha ao buscar IBOV`);
        dadosIBOV = await ibovResponse.json();

        if (!ivvb11Response.ok) throw new Error(`Falha ao buscar IVVB11`);
        dadosIVVB11 = await ivvb11Response.json();

        if (dadosIBOV.error || !dadosIBOV.results || dadosIBOV.results.length === 0) console.warn("Dados do IBOV indisponíveis.");
        if (dadosIVVB11.error || !dadosIVVB11.results || dadosIVVB11.results.length === 0) console.warn("Dados do IVVB11 indisponíveis.");

        const historicoPrecos = dadosAtivo.results[0].historicalDataPrice.reduce((acc, item) => {
            const data = new Date(item.date * 1000).toISOString().split('T')[0];
            acc[data] = item.close;
            return acc;
        }, {});

        const dataInicialLancamento = new Date(lancamentosOrdenados[0].data + 'T00:00:00');
        const dataInicioStr = dataInicialLancamento.toISOString().split('T')[0];

        let cdiAcumulado = 1;
        const historicoCDIIndex = {};
        let cdiIndexStartFactor = 1;

        dadosCDI.forEach(item => {
            const data = item.data.split('/').reverse().join('-');
            cdiAcumulado *= (1 + (parseFloat(item.valor) / 100));
            historicoCDIIndex[data] = cdiAcumulado;

            if (data === dataInicioStr) {
                cdiIndexStartFactor = cdiAcumulado;
            }
        });

        const normalizarIndice = (dadosIndice) => {
            const precosHistoricos = dadosIndice.results[0].historicalDataPrice;
            if (!precosHistoricos || precosHistoricos.length === 0) return {};

            const indiceNoPrimeiroDia = precosHistoricos.find(item => new Date(item.date * 1000).toISOString().split('T')[0] === dataInicioStr)?.close;
            if (!indiceNoPrimeiroDia) return {};

            return precosHistoricos.reduce((acc, item) => {
                const data = new Date(item.date * 1000).toISOString().split('T')[0];
                acc[data] = ((item.close / indiceNoPrimeiroDia) - 1) * 100;
                return acc;
            }, {});
        };

        const historicoIBOV = (dadosIBOV && dadosIBOV.results && dadosIBOV.results.length > 0) ? normalizarIndice(dadosIBOV) : {};
        const historicoIVVB11 = (dadosIVVB11 && dadosIVVB11.results && dadosIVVB11.results.length > 0) ? normalizarIndice(dadosIVVB11) : {};

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
            if (lancamentosDoDia.length > 0) {
                lancamentosDoDia.forEach(l => {
                    if (l.tipoOperacao === 'compra') {
                        valorInvestidoAcumulado += l.valorTotal;
                        quantidade += l.quantidade;
                    } else {
                        const precoMedio = valorInvestidoAcumulado / quantidade;
                        valorInvestidoAcumulado -= l.quantidade * precoMedio;
                        quantidade -= l.quantidade;
                    }
                });
            }

            const precoDoDia = historicoPrecos[dataAtualStr];
            if (precoDoDia && quantidade > 0) {
                dataCarteira.push(quantidade * precoDoDia);
            } else if (dataCarteira.length > 0) {
                dataCarteira.push(dataCarteira[dataCarteira.length - 1]);
            } else {
                dataCarteira.push(0);
            }

            costBasisArray.push(valorInvestidoAcumulado);

            const cdiIndex = historicoCDIIndex[dataAtualStr];
            if (cdiIndex) {
                const cdiGain = ((cdiIndex / cdiIndexStartFactor) - 1) * 100;
                dataCDI.push(cdiGain);
            } else if (dataCDI.length > 0) {
                dataCDI.push(dataCDI[dataCDI.length - 1]);
            } else {
                dataCDI.push(0);
            }

            const ibovGain = historicoIBOV[dataAtualStr];
            if (typeof ibovGain === 'number') {
                dataIBOV.push(ibovGain);
            } else if (dataIBOV.length > 0) {
                dataIBOV.push(dataIBOV[dataIBOV.length - 1]);
            } else {
                dataIBOV.push(0);
            }

            const ivvb11Gain = historicoIVVB11[dataAtualStr];
            if (typeof ivvb11Gain === 'number') {
                dataIVVB11.push(ivvb11Gain);
            } else if (dataIVVB11.length > 0) {
                dataIVVB11.push(dataIVVB11[dataIVVB11.length - 1]);
            } else {
                dataIVVB11.push(0);
            }
        }

        const baseCustoInicial = lancamentosOrdenados[0].valorTotal;
        const baseValor = baseCustoInicial > 0 ? baseCustoInicial : 1;

        const dataCarteiraNormalizada = dataCarteira.map((v, i) => {
            const cost = costBasisArray[i];
            if (cost > 0) {
                return ((v / cost) - 1) * 100;
            }
            return 0;
        });

        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Performance ${ticker}`,
                    data: dataCarteiraNormalizada,
                    borderColor: '#00d9c3',
                    backgroundColor: 'rgba(0, 217, 195, 0.1)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                }, {
                    label: 'CDI',
                    data: dataCDI,
                    borderColor: '#a0a7b3',
                    borderDash: [5, 5],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0,
                }, {
                    label: 'IBOV',
                    data: dataIBOV,
                    borderColor: '#ECC94B',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0,
                }, {
                    label: 'IVVB11',
                    data: dataIVVB11,
                    borderColor: '#5A67D8',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: {
                            color: '#a0a7b3',
                            callback: function (value) {
                                return value.toFixed(1) + '%';
                            }
                        },
                        grid: { color: '#2a2c30' }
                    },
                    x: { type: 'time', time: { unit: 'month' }, ticks: { color: '#a0a7b3' }, grid: { display: false } }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';

                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(2) + '%';
                                }
                                return label;
                            }
                        }
                    },
                    legend: { labels: { color: '#a0a7b3' } }
                }
            }
        });

    } catch (error) {
        console.error("Erro ao buscar dados para o gráfico de performance:", error);
        container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Não foi possível carregar os dados de performance.<br><small>${error.message}</small></p>`;
    }
}