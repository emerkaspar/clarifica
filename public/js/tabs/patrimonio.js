import { fetchCurrentPrices } from '../api/brapi.js'; // REMOVIDO: fetchCryptoPrices

let patrimonioEvolutionChart = null;
let assetAllocationChart = null;

// Função para formatar valores monetários
const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Renderiza o Gráfico de Evolução do Patrimônio.
 */
async function renderPatrimonioEvolutionChart(lancamentos, precosAtuais) {
    const canvas = document.getElementById('patrimonio-evolution-chart');
    if (!canvas) return;

    const lancamentosOrdenados = [...lancamentos].sort((a, b) => new Date(a.data) - new Date(b.data));
    if (lancamentosOrdenados.length === 0) {
        if (patrimonioEvolutionChart) {
            patrimonioEvolutionChart.destroy();
            patrimonioEvolutionChart = null;
        }
        return;
    }

    // 1. Prepara os "baldes" mensais para os dados
    const monthlyData = {};
    const hoje = new Date();
    const dataInicio = new Date(lancamentosOrdenados[0].data);
    for (let d = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1); d <= hoje; d.setMonth(d.getMonth() + 1)) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = {
            label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
            valorAplicado: 0,
            patrimonioFinal: 0,
            processed: false // Flag para saber se o mês teve transações
        };
    }

    // 2. Processa as transações em ordem para calcular o estado da carteira a cada mês
    const carteira = {};
    lancamentosOrdenados.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                quantidade: 0,
                quantidadeComprada: 0,
                valorTotalInvestido: 0,
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

        const monthKey = l.data.substring(0, 7);

        if (monthlyData[monthKey]) {
            let patrimonioAtual = 0;
            let investidoAtual = 0;
            Object.values(carteira).forEach(ativo => {
                if (ativo.quantidade > 0) {
                    const preco = precosAtuais[ativo.ativo] || (ativo.valorTotalInvestido / ativo.quantidade);
                    patrimonioAtual += ativo.quantidade * preco;
                    investidoAtual += ativo.valorTotalInvestido;
                }
            });
            monthlyData[monthKey].patrimonioFinal = patrimonioAtual;
            monthlyData[monthKey].valorAplicado = investidoAtual;
            monthlyData[monthKey].processed = true;
        }
    });

    // 3. Preenche os meses que não tiveram transações com os valores do mês anterior
    let lastValorAplicado = 0;
    let lastPatrimonio = 0;
    for (const key in monthlyData) {
        if (!monthlyData[key].processed) {
            monthlyData[key].valorAplicado = lastValorAplicado;
            monthlyData[key].patrimonioFinal = lastPatrimonio;
        } else {
            lastValorAplicado = monthlyData[key].valorAplicado;
            lastPatrimonio = monthlyData[key].patrimonioFinal;
        }
    }

    const labels = Object.values(monthlyData).map(d => d.label);
    const valoresAplicados = Object.values(monthlyData).map(d => d.valorAplicado);
    const patrimoniosFinais = Object.values(monthlyData).map(d => d.patrimonioFinal);

    if (patrimonioEvolutionChart) {
        patrimonioEvolutionChart.destroy();
    }

    patrimonioEvolutionChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Aplicado',
                    data: valoresAplicados,
                    backgroundColor: '#2a2c30',
                    order: 2,
                },
                {
                    label: 'Ganho/Perda Capital',
                    data: patrimoniosFinais.map((patrimonio, index) => [valoresAplicados[index], patrimonio]),
                    backgroundColor: (ctx) => {
                        if (!ctx.raw) return '#00d9c3';
                        const [base, final] = ctx.raw;
                        return final >= base ? '#00d9c3' : '#ef4444';
                    },
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    // stacked: false, 
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" }
                },
                y: {
                    // stacked: false, 
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: (value) => value % 1000 === 0 && value !== 0 ? `R$ ${value / 1000}k` : `R$ ${value}`
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#a0a7b3',
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    mode: 'index',
                    callbacks: {
                        footer: function (tooltipItems) {
                            let valorAplicado = 0;
                            let ganhoCapital = 0;
                            tooltipItems.forEach(function (tooltipItem) {
                                if (tooltipItem.dataset.label === 'Valor Aplicado') {
                                    valorAplicado = tooltipItem.parsed.y;
                                } else if (tooltipItem.dataset.label === 'Ganho/Perda Capital') {
                                    const raw = tooltipItem.raw;
                                    if (Array.isArray(raw)) {
                                        ganhoCapital = raw[1] - raw[0];
                                    }
                                }
                            });
                            const patrimonioFinal = valorAplicado + ganhoCapital;
                            return `Patrimônio Final: ${formatCurrency(patrimonioFinal)}`;
                        },
                        label: function (context) {
                            let label = context.dataset.label || '';
                            let value;
                            if (context.dataset.label === 'Ganho/Perda Capital') {
                                const raw = context.raw;
                                if (Array.isArray(raw)) {
                                    value = raw[1] - raw[0];
                                } else {
                                    value = raw;
                                }
                            } else {
                                value = context.parsed.y;
                            }
                            return `${label}: ${formatCurrency(value)}`;
                        }
                    }
                }
            }
        }
    });
}


/**
 * Renderiza o Gráfico de Alocação de Ativos.
 */
function renderAssetAllocationChart(carteira, precosAtuais) {
    const canvas = document.getElementById('asset-allocation-chart');
    if (!canvas) return;

    const alocacao = {
        'Ações': 0, 'FIIs': 0, 'ETF': 0, 'Cripto': 0, 'Renda Fixa': 0
    };

    let patrimonioTotal = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const preco = precosAtuais[ativo.ativo] || (ativo.valorTotalInvestido / ativo.quantidadeComprada) || 0;
            const valorAtual = ativo.quantidade * preco;

            if (alocacao.hasOwnProperty(ativo.tipoAtivo)) {
                alocacao[ativo.tipoAtivo] += valorAtual;
            } else if (['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo)) {
                alocacao['Renda Fixa'] += valorAtual;
            }
            patrimonioTotal += valorAtual;
        }
    });

    const labels = Object.keys(alocacao).filter(key => alocacao[key] > 0);
    const data = Object.values(alocacao).filter(value => value > 0);

    const allocationDetailsDiv = document.getElementById('allocation-details');
    if (allocationDetailsDiv) {
        allocationDetailsDiv.innerHTML = labels.map((label, index) => {
            const percentage = patrimonioTotal > 0 ? (data[index] / patrimonioTotal) * 100 : 0;
            return `
                <div class="allocation-item">
                    <span class="allocation-label">${label}</span>
                    <span class="allocation-value">${formatCurrency(data[index])}</span>
                    <span class="allocation-percent">${percentage.toFixed(2)}%</span>
                </div>
            `;
        }).join('');
    }


    if (assetAllocationChart) {
        assetAllocationChart.destroy();
    }

    assetAllocationChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#00d9c3', '#5A67D8', '#ED64A6', '#F56565', '#ECC94B', '#4299E1'],
                borderColor: '#161a22',
                borderWidth: 4,
                borderRadius: 5,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.raw;
                            const percentage = patrimonioTotal > 0 ? (value / patrimonioTotal * 100).toFixed(2) : 0;
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderiza a tabela de Posição Consolidada.
 */
function renderPosicaoConsolidada(carteira, precosAtuais) {
    const tableBody = document.getElementById('posicao-consolidada-body');
    if (!tableBody) return;

    let patrimonioTotal = 0;
    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const preco = precosAtuais[ativo.ativo] || (ativo.valorTotalInvestido / ativo.quantidadeComprada) || 0;
            patrimonioTotal += ativo.quantidade * preco;
        }
    });

    const sortedCarteira = Object.values(carteira).sort((a, b) => {
        const valorA = (a.quantidade * (precosAtuais[a.ativo] || 0));
        const valorB = (b.quantidade * (precosAtuais[b.ativo] || 0));
        return valorB - valorA;
    });

    tableBody.innerHTML = sortedCarteira.map(ativo => {
        if (ativo.quantidade <= 0) return '';

        const precoMedio = ativo.quantidade > 0 ? ativo.valorTotalInvestido / ativo.quantidade : 0;
        const custoTotal = ativo.valorTotalInvestido;
        const precoAtual = precosAtuais[ativo.ativo] || precoMedio;
        const valorAtual = ativo.quantidade * precoAtual;
        const rentabilidade = custoTotal > 0 ? (valorAtual / custoTotal) - 1 : 0;
        const pesoCarteira = patrimonioTotal > 0 ? (valorAtual / patrimonioTotal) * 100 : 0;
        const rentabilidadeClass = rentabilidade >= 0 ? 'positive-change' : 'negative-change';

        return `
            <tr>
                <td>${ativo.ativo}</td>
                <td><span class="tipo-ativo-badge">${ativo.tipoAtivo}</span></td>
                <td>${ativo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</td>
                <td>${formatCurrency(precoMedio)}</td>
                <td>${formatCurrency(valorAtual)}</td>
                <td class="${rentabilidadeClass}">${(rentabilidade * 100).toFixed(2)}%</td>
                <td>${pesoCarteira.toFixed(2)}%</td>
            </tr>
        `;
    }).join('');
}


/**
 * Função principal que renderiza toda a aba "Patrimônio".
 */
export async function renderPatrimonioTab(lancamentos, proventos) {
    const patrimonioContent = document.getElementById('patrimonio-content');
    if (!patrimonioContent) return;

    if (!lancamentos || lancamentos.length === 0) {
        patrimonioContent.innerHTML = `<p>Nenhum lançamento encontrado para exibir o patrimônio.</p>`;
        return;
    }

    const carteira = {};
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                quantidadeComprada: 0,
                valorTotalInvestido: 0,
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

    const tickersAtivos = Object.values(carteira).filter(a => a.quantidade > 0 && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo)).map(a => a.ativo);

    const precosAtuais = await fetchCurrentPrices(tickersAtivos);

    renderPatrimonioEvolutionChart(lancamentos, precosAtuais);
    renderAssetAllocationChart(carteira, precosAtuais);
    renderPosicaoConsolidada(carteira, precosAtuais);
}