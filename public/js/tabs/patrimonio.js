import { fetchCurrentPrices, fetchCryptoPrices } from '../api/brapi.js';

let patrimonioEvolutionChart = null;
let assetAllocationChart = null;

// Função para formatar valores monetários
const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Renderiza o Gráfico de Evolução do Patrimônio.
 */
async function renderPatrimonioEvolutionChart(lancamentos, precosAtuais) {
    const canvas = document.getElementById('patrimonio-evolution-chart');
    if (!canvas) return;

    const lancamentosOrdenados = [...lancamentos].sort((a, b) => new Date(a.data) - new Date(b.data));
    if (lancamentosOrdenados.length === 0) return;

    const monthlyData = {};
    const hoje = new Date();
    const dataInicio = new Date(lancamentosOrdenados[0].data);

    // Agrupa os dados por mês
    for (let d = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1); d <= hoje; d.setMonth(d.getMonth() + 1)) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = {
            label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
            valorAplicado: 0,
            patrimonioFinal: 0
        };
    }

    let valorAplicadoAcumulado = 0;
    let carteiraAcumulada = {};
    let quantidadeComprada = {};
    let valorTotalInvestido = {};


    lancamentosOrdenados.forEach(l => {
        const monthKey = l.data.substring(0, 7);
        if (!quantidadeComprada[l.ativo]) {
            quantidadeComprada[l.ativo] = 0;
            valorTotalInvestido[l.ativo] = 0;
        }

        if (l.tipoOperacao === 'compra') {
            quantidadeComprada[l.ativo] += l.quantidade;
            valorTotalInvestido[l.ativo] += l.valorTotal;
        } else if (l.tipoOperacao === 'venda' && quantidadeComprada[l.ativo] > 0) {
            const precoMedioVenda = valorTotalInvestido[l.ativo] / quantidadeComprada[l.ativo];
            valorTotalInvestido[l.ativo] -= l.quantidade * precoMedioVenda;
        }

        // Atualiza a carteira para o cálculo do patrimônio
        if (!carteiraAcumulada[l.ativo]) {
            carteiraAcumulada[l.ativo] = { quantidade: 0, valorTotalInvestido: 0, ativo: l.ativo };
        }
        if (l.tipoOperacao === 'compra') {
            carteiraAcumulada[l.ativo].quantidade += l.quantidade;
        } else if (l.tipoOperacao === 'venda') {
            carteiraAcumulada[l.ativo].quantidade -= l.quantidade;
        }

        if (monthlyData[monthKey]) {
            monthlyData[monthKey].valorAplicado = Object.values(valorTotalInvestido).reduce((a, b) => a + b, 0);

            let patrimonioDoMes = 0;
            Object.keys(carteiraAcumulada).forEach(ativo => {
                const preco = precosAtuais[ativo] || 0;
                patrimonioDoMes += (carteiraAcumulada[ativo].quantidade * preco);
            });
            monthlyData[monthKey].patrimonioFinal = patrimonioDoMes;
        }
    });

    // Preenche meses sem lançamentos com os valores do mês anterior
    let lastValorAplicado = 0;
    let lastPatrimonio = 0;
    for (const key in monthlyData) {
        if (monthlyData[key].valorAplicado === 0 && monthlyData[key].patrimonioFinal === 0) {
            monthlyData[key].valorAplicado = lastValorAplicado;
            monthlyData[key].patrimonioFinal = lastPatrimonio;
        } else {
            lastValorAplicado = monthlyData[key].valorAplicado;
            lastPatrimonio = monthlyData[key].patrimonioFinal;
        }
    }


    const labels = Object.values(monthlyData).map(d => d.label);
    const valoresAplicados = Object.values(monthlyData).map(d => d.valorAplicado);
    const ganhosDeCapital = Object.values(monthlyData).map(d => d.patrimonioFinal - d.valorAplicado);

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
                    data: ganhosDeCapital,
                    backgroundColor: (ctx) => {
                        const value = ctx.raw;
                        return value >= 0 ? '#00d9c3' : '#ef4444';
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
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: "#a0a7b3" }
                },
                y: {
                    stacked: true,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: (value) => `R$ ${value / 1000}k`
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
                        label: function (context) {
                            const label = context.dataset.label || '';
                            const value = context.raw;
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

    // Atualiza a legenda/tabela de alocação
    const allocationDetailsDiv = document.getElementById('allocation-details');
    if (allocationDetailsDiv) {
        allocationDetailsDiv.innerHTML = labels.map((label, index) => {
            const percentage = (data[index] / patrimonioTotal) * 100;
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
                            const percentage = (value / patrimonioTotal * 100).toFixed(2);
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

        const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
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

    // 1. Consolidar carteira
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

    // 2. Buscar preços
    const tickersNormais = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo !== 'Cripto' && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo)).map(a => a.ativo);
    const tickersCripto = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo === 'Cripto').map(a => a.ativo);
    const [precosNormais, precosCripto] = await Promise.all([
        fetchCurrentPrices(tickersNormais),
        fetchCryptoPrices(tickersCripto)
    ]);
    const precosAtuais = { ...precosNormais, ...precosCripto };

    // 3. Renderizar componentes
    renderPatrimonioEvolutionChart(lancamentos, precosAtuais);
    renderAssetAllocationChart(carteira, precosAtuais);
    renderPosicaoConsolidada(carteira, precosAtuais);
}