// public/js/tabs/analises.js
import { fetchCurrentPrices } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';

let rentabilidadeComparativaChart = null;
let carteiraAtualChart = null;
let carteiraIdealChart = null;
let acoesPorCapitalizacaoChart = null;
let acoesPorSetorChart = null;
let divisaoPorAtivoChart = null;


// --- FUNÇÕES DE PERSISTÊNCIA (localStorage) ---

const saveIdealAllocation = (allocation) => {
    localStorage.setItem('idealAllocation', JSON.stringify(allocation));
};

const loadIdealAllocation = () => {
    const saved = localStorage.getItem('idealAllocation');
    // Retorna um padrão se nada for encontrado
    return saved ? JSON.parse(saved) : {
        'Ações': 40,
        'FIIs': 30,
        'Renda Fixa': 20,
        'ETF': 5,
        'Cripto': 5
    };
};


// --- FUNÇÕES DE CÁLCULO DE ALOCAÇÃO ---

/**
 * Função auxiliar que obtém o valor de mercado atual de todos os ativos e suas classificações.
 */
async function getCarteiraAtualizada(lancamentos, classificacoes) {
    const carteira = {};

    // 1. Agrega posições dos lançamentos
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                valorTotalInvestido: 0,
            };
        }
        const ativo = carteira[l.ativo];
        if (l.tipoOperacao === 'compra') {
            ativo.quantidade += l.quantidade;
            ativo.valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            const precoMedioAprox = ativo.quantidade > 0 ? ativo.valorTotalInvestido / ativo.quantidade : 0;
            ativo.valorTotalInvestido -= l.quantidade * precoMedioAprox;
            ativo.quantidade -= l.quantidade;
        }
    });

    // 2. Busca preços atuais para Renda Variável
    const tickersVariaveis = Object.keys(carteira).filter(ativo =>
        !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(carteira[ativo].tipoAtivo) && carteira[ativo].quantidade > 0
    );
    const precosAtuais = await fetchCurrentPrices(tickersVariaveis);

    // 3. Calcula o valor de mercado e adiciona a classificação
    const carteiraAtualizada = [];
    for (const ticker in carteira) {
        const ativo = carteira[ticker];
        if (ativo.quantidade <= 1e-8) continue; // Ignora ativos com quantidade zerada/residual

        let valorAtualAtivo = 0;
        const isRF = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo);

        if (!isRF) {
            valorAtualAtivo = (precosAtuais[ticker]?.price || 0) * ativo.quantidade;
        } else {
            valorAtualAtivo = ativo.valorTotalInvestido; // Para RF, usa o custo como aproximação
        }

        carteiraAtualizada.push({
            ticker: ticker,
            tipoAtivo: ativo.tipoAtivo,
            valorAtual: valorAtualAtivo,
            classificacao: classificacoes[ticker]?.classificacoes || {}
        });
    }
    return carteiraAtualizada;
}


/**
 * Calcula a alocação atual da carteira com base nos dados já processados.
 */
function calcularAlocacaoAtual(carteiraAtualizada) {
    if (!carteiraAtualizada || carteiraAtualizada.length === 0) {
        return { 'Ações': 0, 'FIIs': 0, 'Renda Fixa': 0, 'ETF': 0, 'Cripto': 0 };
    }
    const alocacao = { 'Ações': 0, 'FIIs': 0, 'Renda Fixa': 0, 'ETF': 0, 'Cripto': 0 };
    let patrimonioTotal = 0;

    carteiraAtualizada.forEach(ativo => {
        const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo)
            ? 'Renda Fixa'
            : ativo.tipoAtivo;

        if (alocacao.hasOwnProperty(tipoMapeado)) {
            alocacao[tipoMapeado] += ativo.valorAtual;
            patrimonioTotal += ativo.valorAtual;
        }
    });

    // Converte para percentual
    if (patrimonioTotal > 0) {
        for (const key in alocacao) {
            alocacao[key] = (alocacao[key] / patrimonioTotal) * 100;
        }
    }
    return alocacao;
}


/**
 * Calcula os dados agregados para os gráficos de pizza de Ações.
 */
function calcularDadosAcoes(carteiraAtualizada) {
    const acoes = carteiraAtualizada.filter(a => a.tipoAtivo === 'Ações');
    const totalAcoesValor = acoes.reduce((acc, acao) => acc + acao.valorAtual, 0);
    const THRESHOLD_PERCENT = 3; // Agrupa setores com menos de 3% em "Outros"

    const capitalizacaoData = {};
    const setorDataRaw = {}; // Dados brutos antes de agrupar

    acoes.forEach(acao => {
        const cap = acao.classificacao['Capitalização'] || 'Não Classificado';
        const setor = acao.classificacao['Setor BESST'] || 'Não Classificado';
        const valor = acao.valorAtual;

        if (valor > 0) {
            capitalizacaoData[cap] = (capitalizacaoData[cap] || 0) + valor;
            setorDataRaw[setor] = (setorDataRaw[setor] || 0) + valor;
        }
    });

    // Agrupa os setores pequenos em 'Outros'
    const setorData = {};
    let outrosValor = 0;
    if (totalAcoesValor > 0) {
        for (const setor in setorDataRaw) {
            const valor = setorDataRaw[setor];
            const percent = (valor / totalAcoesValor) * 100;
            if (percent < THRESHOLD_PERCENT && setor !== 'Não Classificado') {
                outrosValor += valor;
            } else {
                setorData[setor] = valor;
            }
        }
    }
    if (outrosValor > 0) {
        setorData['Outros'] = (setorData['Outros'] || 0) + outrosValor;
    }

    return { capitalizacaoData, setorData };
}


// --- FUNÇÕES DE RENDERIZAÇÃO DOS GRÁFICOS E TABELA ---

/**
 * Renderiza o gráfico de barras horizontais mostrando a divisão por cada ativo.
 */
function renderDivisaoPorAtivoChart(carteiraAtualizada) {
    const canvas = document.getElementById('divisao-por-ativo-chart');
    if (!canvas) return;

    if (divisaoPorAtivoChart) {
        divisaoPorAtivoChart.destroy();
    }

    const patrimonioTotal = carteiraAtualizada.reduce((acc, ativo) => acc + ativo.valorAtual, 0);
    const sortedAssets = [...carteiraAtualizada].sort((a, b) => b.valorAtual - a.valorAtual);

    const labels = sortedAssets.map(a => a.ticker);
    const dataValues = sortedAssets.map(a => a.valorAtual);
    const percentages = sortedAssets.map(a => (patrimonioTotal > 0 ? (a.valorAtual / patrimonioTotal) * 100 : 0));

    divisaoPorAtivoChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor (R$)',
                data: dataValues,
                backgroundColor: 'rgba(0, 217, 195, 0.7)',
                borderColor: '#00d9c3',
                borderWidth: 1,
                borderRadius: 4,
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


function renderAllocationPieChart(canvasId, chartInstance, title, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = Object.keys(data);
    const values = Object.values(data);
    const colors = {
        'Ações': '#00d9c3',
        'FIIs': '#5A67D8',
        'Renda Fixa': '#a0a7b3',
        'ETF': '#ED64A6',
        'Cripto': '#ECC94B'
    };
    const idealColors = {
        'Ações': '#00a896',
        'FIIs': '#434190',
        'Renda Fixa': '#6b7280',
        'ETF': '#b83280',
        'Cripto': '#b49000'
    };
    const backgroundColors = labels.map(label => (canvasId.includes('ideal') ? idealColors[label] : colors[label]) || '#ccc');


    return new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderColor: '#161a22',
                borderWidth: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#a0a7b3',
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${context.raw.toFixed(2)}%`
                    }
                },
                title: {
                    display: false
                }
            }
        }
    });
}

function renderAnalisesPieChart(canvasId, chartInstance, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = Object.keys(data);
    const values = Object.values(data);
    const total = values.reduce((a, b) => a + b, 0);

    const colors = ['#00d9c3', '#5A67D8', '#ED64A6', '#ECC94B', '#4299E1', '#9F7AEA', '#F56565', '#38B2AC', '#F6AD55', '#4C51BF'];
    const backgroundColors = labels.map((label, i) => {
        if (label === 'Outros' || label === 'Não Classificado') return '#4A5568';
        return colors[i % colors.length];
    });

    return new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderColor: '#1a1b1e',
                borderWidth: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#a0a7b3',
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(2) : 0;
                            return `${label}: ${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${percentage}%)`;
                        }
                    }
                },
                title: {
                    display: false
                }
            }
        }
    });
}


function renderComparisonTable(alocacaoAtual, alocacaoIdeal) {
    const container = document.getElementById('comparativo-alocacao-table');
    if (!container) return;

    const categories = ['Ações', 'FIIs', 'Renda Fixa', 'ETF', 'Cripto'];

    let tableHtml = `
        <div class="table-header-row" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr; padding: 0 15px;">
            <div>Classe de Ativo</div>
            <div style="text-align: right;">% Atual</div>
            <div style="text-align: right;">% Ideal</div>
            <div style="text-align: right;">Diferença (p.p.)</div>
            <div style="text-align: center;">Status</div>
        </div>
    `;

    categories.forEach(cat => {
        const atual = alocacaoAtual[cat] || 0;
        const ideal = alocacaoIdeal[cat] || 0;
        const diff = atual - ideal;

        let statusClass = 'status-ok';
        let statusText = 'OK';
        if (diff <= -5) { // Tolerância de 5 p.p. para subalocação
            statusClass = 'status-sub';
            statusText = 'Aportar';
        } else if (diff >= 5) { // Tolerância de 5 p.p. para sobrealocação
            statusClass = 'status-sobre';
            statusText = 'Segurar';
        }

        tableHtml += `
            <div class="comparison-row" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr; padding: 15px;">
                <div class="comparison-category">${cat}</div>
                <div class="comparison-value" style="text-align: right;">${atual.toFixed(2)}%</div>
                <div class="comparison-value" style="text-align: right;">${ideal.toFixed(2)}%</div>
                <div class="comparison-value" style="text-align: right; color: ${diff >= 0 ? '#00d9c3' : '#ef4444'};">${diff.toFixed(2)}</div>
                <div class="comparison-status" style="text-align: center;">
                    <span class="status-pill ${statusClass}">${statusText}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = tableHtml;
}

/**
 * Calcula a rentabilidade total para cada ativo na carteira.
 */
async function calcularRentabilidadePorAtivo(lancamentos, proventos) {
    if (!lancamentos || lancamentos.length === 0) {
        return [];
    }

    const variaveis = {};
    const fixos = [];

    lancamentos.forEach(l => {
        if (['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo)) {
            fixos.push(l);
        } else {
            if (!variaveis[l.ativo]) {
                variaveis[l.ativo] = {
                    ativo: l.ativo,
                    valorTotalInvestido: 0,
                    quantidadeComprada: 0,
                    quantidadeVendida: 0,
                    proventosRecebidos: 0,
                };
            }
            if (l.tipoOperacao === 'compra') {
                variaveis[l.ativo].valorTotalInvestido += l.valorTotal;
                variaveis[l.ativo].quantidadeComprada += l.quantidade;
            } else if (l.tipoOperacao === 'venda') {
                variaveis[l.ativo].quantidadeVendida += l.quantidade;
            }
        }
    });

    proventos.forEach(p => {
        if (variaveis[p.ativo]) {
            variaveis[p.ativo].proventosRecebidos += p.valor;
        }
    });

    const tickersVariaveis = Object.keys(variaveis);
    const precosAtuais = await fetchCurrentPrices(tickersVariaveis);
    const resultadosVariaveis = Object.values(variaveis).map(ativo => {
        const precoAtual = precosAtuais[ativo.ativo]?.price || 0;
        const quantidadeAtual = ativo.quantidadeComprada - ativo.quantidadeVendida;
        const valorAtual = quantidadeAtual * precoAtual;
        const valorInvestido = ativo.valorTotalInvestido;

        if (valorInvestido <= 0 || quantidadeAtual <= 0) {
            return { ...ativo, rentabilidadeTotalPercent: 0 };
        }

        const ganhoCapital = valorAtual - valorInvestido;
        const resultadoTotal = ganhoCapital + ativo.proventosRecebidos;
        const rentabilidadeTotalPercent = (resultadoTotal / valorInvestido) * 100;

        return { ...ativo, rentabilidadeTotalPercent };
    });

    const resultadosFixos = [];
    if (fixos.length > 0) {
        const hoje = new Date();
        const dataMaisAntiga = fixos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, fixos[0].data);
        const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

        for (const ativo of fixos) {
            const valorInvestido = ativo.valorAplicado;
            let valorBruto = valorInvestido;
            const dataCalculo = new Date(ativo.data + 'T00:00:00');
            const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

            if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                let acumuladorCDI = 1;
                const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                historicoCDI
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => {
                        acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI);
                    });
                valorBruto = valorInvestido * acumuladorCDI;
            } else if (ativo.tipoRentabilidade === 'Prefixado') {
                const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorInvestido * Math.pow(1 + taxaAnual, diasUteis / 252);
            } else if (ativo.tipoRentabilidade === 'Híbrido') {
                let acumuladorIPCA = 1;
                const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                historicoIPCA
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => {
                        acumuladorIPCA *= (1 + parseFloat(item.valor) / 100);
                    });
                const valorCorrigido = valorInvestido * acumuladorIPCA;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
            }

            const lucro = valorBruto - valorInvestido;
            let aliquotaIR = 0;
            if (lucro > 0 && !['LCI', 'LCA'].includes(ativo.tipoAtivo)) {
                if (diasCorridosCalculo <= 180) aliquotaIR = 0.225;
                else if (diasCorridosCalculo <= 360) aliquotaIR = 0.20;
                else if (diasCorridosCalculo <= 720) aliquotaIR = 0.175;
                else aliquotaIR = 0.15;
            }
            const valorLiquido = valorBruto - (lucro * aliquotaIR);
            const rentabilidadeTotalPercent = valorInvestido > 0 ? ((valorLiquido / valorInvestido) - 1) * 100 : 0;

            resultadosFixos.push({
                ativo: ativo.ativo,
                rentabilidadeTotalPercent: rentabilidadeTotalPercent
            });
        }
    }

    const resultadosFinais = [...resultadosVariaveis, ...resultadosFixos];
    return resultadosFinais.sort((a, b) => b.rentabilidadeTotalPercent - a.rentabilidadeTotalPercent);
}


/**
 * Renderiza o gráfico de barras comparativo de rentabilidade.
 */
function renderGraficoComparativo(dadosRentabilidade) {
    const canvas = document.getElementById('rentabilidade-comparativa-chart');
    if (!canvas) return;

    if (rentabilidadeComparativaChart) {
        rentabilidadeComparativaChart.destroy();
    }

    const labels = dadosRentabilidade.map(d => d.ativo);
    const data = dadosRentabilidade.map(d => d.rentabilidadeTotalPercent);

    rentabilidadeComparativaChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Rentabilidade Total (%)',
                data: data,
                backgroundColor: data.map(v => v >= 0 ? 'rgba(0, 217, 195, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                borderColor: data.map(v => v >= 0 ? '#00d9c3' : '#ef4444'),
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x',
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#a0a7b3",
                        callback: function (value) {
                            return value.toFixed(0) + '%';
                        }
                    },
                    grid: {
                        color: "#2a2c30"
                    }
                },
                x: {
                    ticks: {
                        color: "#a0a7b3"
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
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
                }
            }
        }
    });
}


/**
 * Função principal que orquestra a renderização da aba de Análises.
 */
export async function renderAnalisesTab(lancamentos, proventos, classificacoes) {
    const container = document.getElementById('analises');
    if (!container) return;

    // Reseta gráficos se não houver dados
    if (!lancamentos || lancamentos.length === 0) {
        if (divisaoPorAtivoChart) divisaoPorAtivoChart.destroy();
        if (carteiraAtualChart) carteiraAtualChart.destroy();
        if (carteiraIdealChart) carteiraIdealChart.destroy();
        if (acoesPorCapitalizacaoChart) acoesPorCapitalizacaoChart.destroy();
        if (acoesPorSetorChart) acoesPorSetorChart.destroy();
        if (rentabilidadeComparativaChart) rentabilidadeComparativaChart.destroy();
        return;
    }


    try {
        // 1. Calcula os dados detalhados da carteira UMA VEZ
        const carteiraAtualizada = await getCarteiraAtualizada(lancamentos, classificacoes);

        // 2. Renderiza o novo gráfico de divisão por ativo no topo
        renderDivisaoPorAtivoChart(carteiraAtualizada);

        // 3. Renderiza a seção de alocação de carteira (por TIPO)
        const alocacaoAtual = calcularAlocacaoAtual(carteiraAtualizada);
        const alocacaoIdeal = loadIdealAllocation();

        carteiraAtualChart = renderAllocationPieChart('carteira-atual-chart', carteiraAtualChart, 'Divisão Atual', alocacaoAtual);
        carteiraIdealChart = renderAllocationPieChart('carteira-ideal-chart', carteiraIdealChart, 'Divisão Ideal', alocacaoIdeal);
        renderComparisonTable(alocacaoAtual, alocacaoIdeal);

        // 4. Renderiza os gráficos de análise de Ações
        const { capitalizacaoData, setorData } = calcularDadosAcoes(carteiraAtualizada);
        acoesPorCapitalizacaoChart = renderAnalisesPieChart('acoes-por-capitalizacao-chart', acoesPorCapitalizacaoChart, capitalizacaoData);
        acoesPorSetorChart = renderAnalisesPieChart('acoes-por-setor-chart', acoesPorSetorChart, setorData);


        // 5. Renderiza a seção de rentabilidade comparativa
        const dadosRentabilidade = await calcularRentabilidadePorAtivo(lancamentos, proventos);
        renderGraficoComparativo(dadosRentabilidade);

    } catch (error) {
        console.error("Erro ao renderizar a aba de Análises:", error);
        const chartContainer = document.getElementById('analises-chart-container');
        if (chartContainer) {
            chartContainer.innerHTML = `<p style="color: #ef4444; text-align: center;">Erro ao carregar dados para os gráficos.</p>`;
        }
    }
}