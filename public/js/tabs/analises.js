// public/js/tabs/analises.js
import { fetchCurrentPrices } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';

let rentabilidadeComparativaChart = null;

/**
 * Calcula a rentabilidade total para cada ativo na carteira, tratando Renda Fixa e Renda Variável separadamente.
 * @param {Array<object>} lancamentos - Lista de todos os lançamentos.
 * @param {Array<object>} proventos - Lista de todos os proventos.
 * @returns {Promise<Array<object>>} - Uma lista de ativos com sua rentabilidade calculada.
 */
async function calcularRentabilidadePorAtivo(lancamentos, proventos) {
    if (!lancamentos || lancamentos.length === 0) {
        return [];
    }

    // --- SEPARA ATIVOS DE RENDA VARIÁVEL E RENDA FIXA ---
    const variaveis = {};
    const fixos = []; // Cada lançamento de RF é um investimento individual

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
    
    // Adiciona proventos aos ativos de Renda Variável
    proventos.forEach(p => {
        if (variaveis[p.ativo]) {
            variaveis[p.ativo].proventosRecebidos += p.valor;
        }
    });

    // --- 1. CÁLCULO PARA RENDA VARIÁVEL (Ações, FIIs, etc.) ---
    const tickersVariaveis = Object.keys(variaveis);
    const precosAtuais = await fetchCurrentPrices(tickersVariaveis);
    const resultadosVariaveis = Object.values(variaveis).map(ativo => {
        const precoAtual = precosAtuais[ativo.ativo] || 0;
        const quantidadeAtual = ativo.quantidadeComprada - ativo.quantidadeVendida;
        const valorAtual = quantidadeAtual * precoAtual;
        const valorInvestido = ativo.valorTotalInvestido;

        if (valorInvestido <= 0 || quantidadeAtual <=0) {
            return { ...ativo, rentabilidadeTotalPercent: 0 };
        }

        const ganhoCapital = valorAtual - valorInvestido;
        const resultadoTotal = ganhoCapital + ativo.proventosRecebidos;
        const rentabilidadeTotalPercent = (resultadoTotal / valorInvestido) * 100;
        
        return { ...ativo, rentabilidadeTotalPercent };
    });

    // --- 2. CÁLCULO PARA RENDA FIXA ---
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

    // --- 3. COMBINAR E ORDENAR ---
    const resultadosFinais = [...resultadosVariaveis, ...resultadosFixos];
    return resultadosFinais.sort((a, b) => b.rentabilidadeTotalPercent - a.rentabilidadeTotalPercent);
}


/**
 * Renderiza o gráfico de barras comparativo de rentabilidade.
 * @param {Array<object>} dadosRentabilidade - Os dados calculados e ordenados.
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
                        callback: function(value) {
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
                        label: function(context) {
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
 * @param {Array<object>} lancamentos - Lista de todos os lançamentos.
 * @param {Array<object>} proventos - Lista de todos os proventos.
 */
export async function renderAnalisesTab(lancamentos, proventos) {
    const container = document.getElementById('analises-chart-container');
    if (!container) return;
    container.innerHTML = '<canvas id="rentabilidade-comparativa-chart"></canvas>'; // Garante que o canvas esteja limpo

    try {
        const dadosRentabilidade = await calcularRentabilidadePorAtivo(lancamentos, proventos);
        renderGraficoComparativo(dadosRentabilidade);
    } catch (error) {
        console.error("Erro ao renderizar a aba de Análises:", error);
        if (container) {
            container.innerHTML = `<p style="color: #ef4444; text-align: center;">Erro ao carregar dados para o gráfico.</p>`;
        }
    }
}