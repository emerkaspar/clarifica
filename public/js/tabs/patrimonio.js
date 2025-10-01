import { fetchCurrentPrices } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';

let patrimonioEvolutionChart = null;
let assetAllocationChart = null;
let sortColumn = 'valorAtual';
let sortDirection = 'desc';

// Armazena o estado (expandido/recolhido) de cada grupo
const groupCollapseState = {};

const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function getPrecosAtuaisRendaFixa(lancamentos) {
    const rfLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));
    const precosEInfos = {};

    if (rfLancamentos.length === 0) {
        return precosEInfos;
    }

    const rfValores = {};

    try {
        const hoje = new Date();
        const dataMaisAntiga = rfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, rfLancamentos[0].data);
        const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

        for (const ativo of rfLancamentos) {
            const valorAplicadoOriginal = ativo.valorAplicado;
            let valorBruto = valorAplicadoOriginal;
            const dataCalculo = new Date(ativo.data + 'T00:00:00');
            const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

            if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                let acumuladorCDI = 1;
                const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                historicoCDI
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => { acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI); });
                valorBruto = valorAplicadoOriginal * acumuladorCDI;
            } else if (ativo.tipoRentabilidade === 'Prefixado') {
                const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorAplicadoOriginal * Math.pow(1 + taxaAnual, diasUteis / 252);
            } else if (ativo.tipoRentabilidade === 'Híbrido') {
                let acumuladorIPCA = 1;
                const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                historicoIPCA
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => { acumuladorIPCA *= (1 + parseFloat(item.valor) / 100); });
                const valorCorrigido = valorAplicadoOriginal * acumuladorIPCA;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
            }

            const lucro = valorBruto - ativo.valorAplicado;
            let aliquotaIR = 0;
            if (lucro > 0 && !['LCI', 'LCA'].includes(ativo.tipoAtivo)) {
                if (diasCorridosCalculo <= 180) aliquotaIR = 0.225;
                else if (diasCorridosCalculo <= 360) aliquotaIR = 0.20;
                else if (diasCorridosCalculo <= 720) aliquotaIR = 0.175;
                else aliquotaIR = 0.15;
            }
            const valorLiquido = valorBruto - (lucro * aliquotaIR);

            if (!rfValores[ativo.ativo]) {
                rfValores[ativo.ativo] = { valorTotal: 0, quantidadeTotal: 0 };
            }
            rfValores[ativo.ativo].valorTotal += valorLiquido;
            rfValores[ativo.ativo].quantidadeTotal += ativo.quantidade;
        }

        for (const ticker in rfValores) {
            const data = rfValores[ticker];
            if (data.quantidadeTotal > 0) {
                precosEInfos[ticker] = {
                    price: data.valorTotal / data.quantidadeTotal,
                    logoUrl: null
                };
            }
        }
    } catch (error) {
        console.error("Erro ao calcular preços de Renda Fixa para a aba Patrimônio:", error);
    }
    return precosEInfos;
}


async function renderPatrimonioEvolutionChart(lancamentos, precosEInfos) {
    const canvas = document.getElementById('patrimonio-evolution-chart');
    if (!canvas) return;

    const lancamentosOrdenados = [...lancamentos].sort((a, b) => new Date(a.data) - new Date(b.data));
    if (lancamentosOrdenados.length === 0) {
        if (patrimonioEvolutionChart) patrimonioEvolutionChart.destroy();
        return;
    }

    const monthlyData = {};
    const hoje = new Date();
    const dataInicio = new Date(lancamentosOrdenados[0].data);
    for (let d = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1); d <= hoje; d.setMonth(d.getMonth() + 1)) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = {
            label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
            valorAplicado: 0,
            patrimonioFinal: 0,
            processed: false
        };
    }

    const carteira = {};
    let valorInvestidoAcumulado = 0;

    lancamentosOrdenados.forEach(l => {
        const monthKey = l.data.substring(0, 7);
        if (l.tipoOperacao === 'compra') {
            valorInvestidoAcumulado += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            const ativo = carteira[l.ativo];
            if (ativo && ativo.quantidadeComprada > 0) {
                const precoMedio = ativo.valorTotalInvestido / ativo.quantidadeComprada;
                valorInvestidoAcumulado -= l.quantidade * precoMedio;
            }
        }
        
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = { quantidade: 0, valorTotalInvestido: 0, quantidadeComprada: 0 };
        }

        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
            carteira[l.ativo].valorTotalInvestido += l.valorTotal;
            carteira[l.ativo].quantidadeComprada += l.quantidade;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }

        if (monthlyData[monthKey]) {
            let patrimonioAtualDoMes = 0;
            Object.keys(carteira).forEach(ticker => {
                const ativo = carteira[ticker];
                if (ativo.quantidade > 0) {
                    const preco = precosEInfos[ticker]?.price || (ativo.valorTotalInvestido / ativo.quantidade);
                    patrimonioAtualDoMes += ativo.quantidade * preco;
                }
            });

            monthlyData[monthKey].patrimonioFinal = patrimonioAtualDoMes;
            monthlyData[monthKey].valorAplicado = valorInvestidoAcumulado < 0 ? 0 : valorInvestidoAcumulado;
            monthlyData[monthKey].processed = true;
        }
    });

    let lastValorAplicado = 0;
    let lastPatrimonio = 0;
    for (const key in monthlyData) {
        if (monthlyData[key].processed) {
            lastValorAplicado = monthlyData[key].valorAplicado;
            lastPatrimonio = monthlyData[key].patrimonioFinal;
        } else {
            monthlyData[key].valorAplicado = lastValorAplicado;
            monthlyData[key].patrimonioFinal = lastPatrimonio;
        }
    }

    const labels = Object.values(monthlyData).map(d => d.label);
    const valoresAplicados = Object.values(monthlyData).map(d => d.valorAplicado);
    const patrimoniosFinais = Object.values(monthlyData).map(d => d.patrimonioFinal);

    if (patrimonioEvolutionChart) patrimonioEvolutionChart.destroy();

    patrimonioEvolutionChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Aplicado',
                    data: valoresAplicados,
                    backgroundColor: '#3a404d',
                    borderColor: '#5a6170',
                    borderWidth: 1,
                    order: 2,
                },
                {
                    label: 'Patrimônio',
                    data: patrimoniosFinais,
                    backgroundColor: '#00d9c3',
                    borderColor: '#00a896',
                    borderWidth: 1,
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
                    stacked: false,
                    grid: { color: "#2a2c30" },
                    ticks: {
                        color: "#a0a7b3",
                        callback: (value) => value >= 1000 ? `R$ ${value / 1000}k` : `R$ ${value}`
                    }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { color: '#a0a7b3', usePointStyle: true, boxWidth: 8 }},
                tooltip: {
                    mode: 'index',
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                    }
                }
            }
        }
    });
}


function renderAssetAllocationChart(carteira, precosEInfos) {
    const canvas = document.getElementById('asset-allocation-chart');
    if (!canvas) return;

    const alocacao = { 'Ações': 0, 'FIIs': 0, 'ETF': 0, 'Cripto': 0, 'Renda Fixa': 0 };
    let patrimonioTotal = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const preco = precosEInfos[ativo.ativo]?.price || 0;
            const valorAtual = ativo.quantidade * preco;

            const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo) ? 'Renda Fixa' : ativo.tipoAtivo;
            if (alocacao.hasOwnProperty(tipoMapeado)) {
                alocacao[tipoMapeado] += valorAtual;
            }
            patrimonioTotal += valorAtual;
        }
    });

    const labels = Object.keys(alocacao).filter(key => alocacao[key] > 0.01);
    const data = labels.map(label => alocacao[label]);

    document.getElementById('allocation-details').innerHTML = labels.map((label, index) => {
        const percentage = patrimonioTotal > 0 ? (data[index] / patrimonioTotal) * 100 : 0;
        return `
            <div class="allocation-item">
                <span class="allocation-label">${label}</span>
                <span class="allocation-value">${formatCurrency(data[index])}</span>
                <span class="allocation-percent">${percentage.toFixed(2)}%</span>
            </div>`;
    }).join('');

    if (assetAllocationChart) assetAllocationChart.destroy();

    assetAllocationChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#00d9c3', '#5A67D8', '#ED64A6', '#F56565', '#ECC94B', '#4299E1'],
                borderColor: '#161a22',
                borderWidth: 4,
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
                        label: (context) => {
                            const value = context.raw;
                            const percentage = patrimonioTotal > 0 ? (value / patrimonioTotal * 100).toFixed(2) : 0;
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}


function renderPosicaoConsolidada(carteira, precosEInfos) {
    const tableContainer = document.querySelector('#patrimonio .table-wrapper');
    if (!tableContainer) return;

    let patrimonioTotal = 0;
    const carteiraArray = Object.values(carteira).map(ativo => {
        if (ativo.quantidade > 0) {
            const preco = precosEInfos[ativo.ativo]?.price || 0;
            const valorAtual = ativo.quantidade * preco;
            patrimonioTotal += valorAtual;
            const custoDaPosicao = ativo.valorTotalInvestido < 0 ? 0 : ativo.valorTotalInvestido;
            const rentabilidade = custoDaPosicao > 0 ? ((valorAtual / custoDaPosicao) - 1) * 100 : 0;
            return { ...ativo, valorAtual, rentabilidade, pesoCarteira: 0, precoMedio: ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0 };
        }
        return null;
    }).filter(Boolean);

    carteiraArray.forEach(ativo => ativo.pesoCarteira = patrimonioTotal > 0 ? (ativo.valorAtual / patrimonioTotal) * 100 : 0);

    const groupedAssets = carteiraArray.reduce((acc, ativo) => {
        const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo) ? 'Renda Fixa' : ativo.tipoAtivo;
        if (!acc[tipoMapeado]) {
            acc[tipoMapeado] = { assets: [], total: 0 };
        }
        acc[tipoMapeado].assets.push(ativo);
        acc[tipoMapeado].total += ativo.valorAtual;
        return acc;
    }, {});

    let tableHtml = '';
    const groupOrder = ['Ações', 'FIIs', 'ETF', 'Cripto', 'Renda Fixa'];

    for (const tipo of groupOrder) {
        if (!groupedAssets[tipo]) continue;

        const group = groupedAssets[tipo];
        const assets = group.assets;
        const groupTotal = group.total;
        const groupPercent = patrimonioTotal > 0 ? (groupTotal / patrimonioTotal) * 100 : 0;
        const groupId = `group-${tipo.replace(/\s+/g, '-')}`;
        
        if (groupCollapseState[groupId] === undefined) {
            groupCollapseState[groupId] = true;
        }
        const isExpanded = groupCollapseState[groupId];

        assets.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        tableHtml += `<tbody class="collapsible-group ${isExpanded ? 'is-expanded' : ''}" id="${groupId}">`;
        tableHtml += `
            <tr class="group-header">
                <td colspan="2">
                    <div class="group-header-title">
                        <i class="fas fa-chevron-right group-toggle-icon"></i>
                        ${tipo} (${assets.length})
                    </div>
                </td>
                <td></td>
                <td></td>
                <td>${formatCurrency(groupTotal)}</td>
                <td></td>
                <td style="text-align: right;">${groupPercent.toFixed(2)}%</td>
            </tr>
        `;

        assets.forEach(ativo => {
            const ativoInfo = precosEInfos[ativo.ativo];
            const logoUrl = ativoInfo?.logoUrl;
            const firstLetter = ativo.ativo.charAt(0);
            const logoHtml = logoUrl
                ? `<img src="${logoUrl}" alt="${ativo.ativo}" class="ativo-logo">`
                : `<div class="ativo-logo-fallback">${firstLetter}</div>`;

            tableHtml += `
                <tr class="asset-row">
                    <td><div class="ativo-com-logo">${logoHtml}<span>${ativo.ativo}</span></div></td>
                    <td><span class="tipo-ativo-badge">${ativo.tipoAtivo}</span></td>
                    <td>${ativo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</td>
                    <td>${formatCurrency(ativo.precoMedio)}</td>
                    <td>${formatCurrency(ativo.valorAtual)}</td>
                    <td class="${ativo.rentabilidade >= 0 ? 'positive-change' : 'negative-change'}">${ativo.rentabilidade.toFixed(2)}%</td>
                    <td style="text-align: right;">${ativo.pesoCarteira.toFixed(2)}%</td>
                </tr>
            `;
        });
        tableHtml += `</tbody>`;
    }

    const headerHtml = `
      <div class="table-header-row">
        <div data-sort="ativo">Ativo</div>
        <div data-sort="tipoAtivo">Tipo</div>
        <div data-sort="quantidade">Quantidade</div>
        <div data-sort="precoMedio">Preço Médio</div>
        <div data-sort="valorAtual">Valor Atual</div>
        <div data-sort="rentabilidade">Rentabilidade</div>
        <div data-sort="pesoCarteira" style="text-align: right;">% Carteira</div>
      </div>
    `;

    tableContainer.innerHTML = headerHtml + `<table>${tableHtml}</table>`;

    // Atualiza os indicadores de ordenação no cabeçalho
    tableContainer.querySelectorAll('.table-header-row div[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortColumn) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}


export async function renderPatrimonioTab(lancamentos, proventos) {
    const patrimonioContent = document.getElementById('patrimonio-content');
    if (!patrimonioContent) return;

    if (!lancamentos || lancamentos.length === 0) {
        return;
    }
    
    const carteira = {};
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                valorTotalInvestido: 0,
                _quantidadeComprada: 0,
                _valorTotalComprado: 0
            };
        }
        const ativo = carteira[l.ativo];
        if (l.tipoOperacao === 'compra') {
            ativo.quantidade += l.quantidade;
            ativo.valorTotalInvestido += l.valorTotal;
            ativo._quantidadeComprada += l.quantidade;
            ativo._valorTotalComprado += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            if (ativo._quantidadeComprada > 0) {
                const precoMedio = ativo._valorTotalComprado / ativo._quantidadeComprada;
                ativo.valorTotalInvestido -= l.quantidade * precoMedio;
            }
            ativo.quantidade -= l.quantidade;
        }
    });

    const tickersAtivos = Object.values(carteira)
        .filter(a => a.quantidade > 0 && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
        .map(a => a.ativo);
    
    const precosEInfos = await fetchCurrentPrices(tickersAtivos);
    const rfPrecos = await getPrecosAtuaisRendaFixa(lancamentos);
    Object.assign(precosEInfos, rfPrecos);
    
    renderPatrimonioEvolutionChart(lancamentos, precosEInfos);
    renderAssetAllocationChart(carteira, precosEInfos);
    renderPosicaoConsolidada(carteira, precosEInfos);
}

document.addEventListener('DOMContentLoaded', () => {
    const tableContainer = document.querySelector('#patrimonio .table-card');

    if (tableContainer) {
        tableContainer.addEventListener('click', (e) => {
            // Lógica para Ordenação
            const th = e.target.closest('div[data-sort]');
            if (th) {
                const newSortColumn = th.dataset.sort;
                if (sortColumn === newSortColumn) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = newSortColumn;
                    sortDirection = 'desc';
                }
                if (window.allLancamentos) {
                    renderPatrimonioTab(window.allLancamentos, window.allProventos);
                }
            }

            // Lógica para Expandir/Recolher
            const header = e.target.closest('.group-header');
            if (header) {
                const parentTbody = header.closest('tbody.collapsible-group');
                const groupId = parentTbody.id;
                
                groupCollapseState[groupId] = !parentTbody.classList.contains('is-expanded');
                
                parentTbody.classList.toggle('is-expanded');
            }
        });
    }
});