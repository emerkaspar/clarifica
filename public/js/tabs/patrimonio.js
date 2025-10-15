import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';

// --- ESTADO E VARIÁVEIS GLOBAIS DO MÓDULO ---
let patrimonioEvolutionChart = null;
let assetAllocationChart = null;
const groupCollapseState = {}; // Armazena o estado (expandido/recolhido) de cada grupo

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---
const formatCurrency = (value, sign = false) => {
    const options = { style: 'currency', currency: 'BRL' };
    const formatted = (value || 0).toLocaleString('pt-BR', options);
    return sign && value > 0 ? `+${formatted}` : formatted;
};

const formatPercent = (value, sign = false) => {
    const formatted = `${(value || 0).toFixed(2)}%`.replace('.', ',');
    return sign && value > 0 ? `+${formatted}` : formatted;
};

/**
 * Busca os preços atuais para todos os ativos de Renda Fixa.
 */
async function getPrecosAtuaisRendaFixa(lancamentos) {
    const rfLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));
    const precosEInfos = {};
    if (rfLancamentos.length === 0) return precosEInfos;

    const tesouroDiretoLancamentos = rfLancamentos.filter(l => l.tipoAtivo === 'Tesouro Direto');
    const outrosRfLancamentos = rfLancamentos.filter(l => l.tipoAtivo !== 'Tesouro Direto');

    // Processa Tesouro Direto usando Marcação a Mercado (MaM)
    if (tesouroDiretoLancamentos.length > 0 && window.allTesouroDiretoPrices) {
        tesouroDiretoLancamentos.forEach(ativo => {
            if (!precosEInfos[ativo.ativo]) { // Evita recalcular se já tem preço
                const precoInfo = window.allTesouroDiretoPrices[ativo.ativo];
                const valorMamUnitario = precoInfo ? precoInfo.valor : ativo.valorAplicado / ativo.quantidade;
                precosEInfos[ativo.ativo] = { price: valorMamUnitario, logoUrl: null };
            }
        });
    }

    // Processa outros ativos de RF usando o cálculo na curva
    if (outrosRfLancamentos.length > 0) {
        try {
            const hoje = new Date();
            const dataMaisAntiga = outrosRfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, outrosRfLancamentos[0].data);
            if (new Date(dataMaisAntiga) <= hoje) {
                const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

                for (const ativo of outrosRfLancamentos) {
                    let valorBruto = ativo.valorAplicado;
                    const dataCalculo = new Date(ativo.data + 'T00:00:00');
                    const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

                    if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                        let acumuladorCDI = 1;
                        const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                        historicoCDI
                            .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                            .forEach(item => { acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI); });
                        valorBruto = ativo.valorAplicado * acumuladorCDI;
                    } else if (ativo.tipoRentabilidade === 'Prefixado') {
                        const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                        const diasUteis = diasCorridosCalculo * (252 / 365.25);
                        valorBruto = ativo.valorAplicado * Math.pow(1 + taxaAnual, diasUteis / 252);
                    } else if (ativo.tipoRentabilidade === 'Híbrido') {
                        let acumuladorIPCA = 1;
                        const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                        const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                        historicoIPCA
                            .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                            .forEach(item => { acumuladorIPCA *= (1 + parseFloat(item.valor) / 100); });
                        const valorCorrigido = ativo.valorAplicado * acumuladorIPCA;
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
                    precosEInfos[ativo.ativo] = { price: valorLiquido / ativo.quantidade, logoUrl: null };
                }
            }
        } catch (error) {
            console.error("Erro ao calcular preços de Outros Renda Fixa:", error);
        }
    }
    return precosEInfos;
}


/**
 * Busca dados de variação diária para um conjunto de tickers.
 */
async function fetchDailyVariation(tickers) {
    if (!tickers || tickers.length === 0) return {};
    const variations = {};
    const promises = tickers.map(ticker => fetchHistoricalData(ticker, '5d'));
    const results = await Promise.all(promises);

    results.forEach((data, index) => {
        const ticker = tickers[index];
        if (data?.results?.[0]?.historicalDataPrice?.length >= 1) {
            const prices = data.results[0].historicalDataPrice;
            const hoje = prices[0].close;
            const ontem = prices[1]?.close || hoje;
            if (hoje && ontem) {
                variations[ticker] = {
                    change: hoje - ontem,
                    changePercent: ((hoje / ontem) - 1) * 100,
                };
            }
        }
    });
    return variations;
}

/**
 * Renderiza o gráfico de evolução do patrimônio (LÓGICA CORRIGIDA).
 */
async function renderPatrimonioEvolutionChart(lancamentos, precosEInfos) {
    const canvas = document.getElementById('patrimonio-evolution-chart');
    if (!canvas) return;

    if (patrimonioEvolutionChart) {
        patrimonioEvolutionChart.destroy();
        patrimonioEvolutionChart = null;
    }

    const periodo = document.getElementById('patrimonio-periodo-filter').value;
    const tipoAtivoFiltro = document.getElementById('patrimonio-tipo-ativo-filter').value;

    let lancamentosFiltrados = lancamentos;
    if (tipoAtivoFiltro !== 'Todos') {
        const isRendaFixa = tipoAtivoFiltro === 'Renda Fixa';
        lancamentosFiltrados = lancamentos.filter(l => {
            if (isRendaFixa) {
                return ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo);
            }
            return l.tipoAtivo === tipoAtivoFiltro;
        });
    }

    const lancamentosOrdenados = [...lancamentosFiltrados].sort((a, b) => new Date(a.data) - new Date(b.data));
    if (lancamentosOrdenados.length === 0) {
        return;
    }

    const hoje = new Date();
    let dataInicio;

    switch (periodo) {
        case '12m': dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1); break;
        case '5y': dataInicio = new Date(hoje.getFullYear() - 5, hoje.getMonth(), 1); break;
        case '10y': dataInicio = new Date(hoje.getFullYear() - 10, hoje.getMonth(), 1); break;
        case 'all': dataInicio = new Date(lancamentosOrdenados[0].data + 'T00:00:00'); break;
        case 'current_year': default: dataInicio = new Date(hoje.getFullYear(), 0, 1); break;
    }

    const { historicoCDI, historicoIPCA } = await fetchIndexers(
        dataInicio.toISOString().split('T')[0],
        hoje.toISOString().split('T')[0]
    );

    const monthlyData = {};
    for (let d = new Date(dataInicio); d <= hoje; d.setMonth(d.getMonth() + 1)) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = {
            label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
            valorAplicado: 0,
            ganhoCapital: 0,
        };
    }

    const carteira = {};
    let valorInvestidoAcumulado = 0;
    let lancamentoIndex = 0;

    for (const monthKey in monthlyData) {
        const [year, month] = monthKey.split('-').map(Number);
        const fimDoMes = new Date(year, month, 0, 23, 59, 59);

        while (lancamentoIndex < lancamentosOrdenados.length && new Date(lancamentosOrdenados[lancamentoIndex].data + 'T00:00:00') <= fimDoMes) {
            const l = lancamentosOrdenados[lancamentoIndex];
            const ativoKey = l.ativo;

            if (!carteira[ativoKey]) {
                carteira[ativoKey] = {
                    ...l,
                    quantidade: 0,
                    valorTotalInvestido: 0,
                    _quantidadeComprada: 0,
                    _valorTotalComprado: 0,
                };
            }
            const ativo = carteira[ativoKey];

            if (l.tipoOperacao === 'compra') {
                valorInvestidoAcumulado += l.valorTotal;
                ativo.quantidade += l.quantidade;
                ativo.valorTotalInvestido += l.valorTotal;
                ativo._quantidadeComprada += l.quantidade;
                ativo._valorTotalComprado += l.valorTotal;
            } else if (l.tipoOperacao === 'venda') {
                if (ativo._quantidadeComprada > 0) {
                    const precoMedio = ativo._valorTotalComprado / ativo._quantidadeComprada;
                    valorInvestidoAcumulado -= l.quantidade * precoMedio;
                }
                ativo.quantidade -= l.quantidade;
            }
            lancamentoIndex++;
        }

        let patrimonioAtualDoMes = 0;
        for (const ativoKey in carteira) {
            const ativo = carteira[ativoKey];
            if (ativo.quantidade < 1e-8) continue;

            const isRendaFixa = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo);

            if (isRendaFixa) {
                const dataAplicacao = new Date(ativo.data + 'T00:00:00');
                const diasCorridos = Math.floor((fimDoMes - dataAplicacao) / (1000 * 60 * 60 * 24));
                if (diasCorridos < 0) continue;

                let valorBruto = ativo.valorTotalInvestido;

                if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                    let acumuladorCDI = 1;
                    const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                    historicoCDI
                        .filter(item => {
                            const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                            return itemDate >= dataAplicacao && itemDate <= fimDoMes;
                        })
                        .forEach(item => { acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI); });
                    valorBruto = ativo.valorTotalInvestido * acumuladorCDI;
                } else if (ativo.tipoRentabilidade === 'Prefixado') {
                    const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = ativo.valorTotalInvestido * Math.pow(1 + taxaAnual, diasUteis / 252);
                } else if (ativo.tipoRentabilidade === 'Híbrido') {
                    let acumuladorIPCA = 1;
                    const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                    const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;
                    historicoIPCA
                        .filter(item => {
                            const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                            return itemDate >= dataAplicacao && itemDate <= fimDoMes;
                        })
                        .forEach(item => { acumuladorIPCA *= (1 + parseFloat(item.valor) / 100); });
                    const valorCorrigido = ativo.valorTotalInvestido * acumuladorIPCA;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
                }

                const lucro = valorBruto - ativo.valorTotalInvestido;
                let aliquotaIR = 0;
                if (lucro > 0 && !['LCI', 'LCA'].includes(ativo.tipoAtivo)) {
                    if (diasCorridos <= 180) aliquotaIR = 0.225;
                    else if (diasCorridos <= 360) aliquotaIR = 0.20;
                    else if (diasCorridos <= 720) aliquotaIR = 0.175;
                    else aliquotaIR = 0.15;
                }
                patrimonioAtualDoMes += valorBruto - (lucro * aliquotaIR);

            } else {
                const preco = precosEInfos[ativoKey]?.price || (ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0);
                patrimonioAtualDoMes += ativo.quantidade * preco;
            }
        }

        const valorAplicadoFinal = valorInvestidoAcumulado < 0 ? 0 : valorInvestidoAcumulado;
        monthlyData[monthKey].valorAplicado = valorAplicadoFinal;
        monthlyData[monthKey].ganhoCapital = patrimonioAtualDoMes - valorAplicadoFinal;
    }

    const labels = Object.values(monthlyData).map(d => d.label);
    const valoresAplicados = Object.values(monthlyData).map(d => d.valorAplicado);
    const ganhosDeCapital = Object.values(monthlyData).map(d => d.ganhoCapital);

    patrimonioEvolutionChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Aplicado',
                    data: valoresAplicados,
                    backgroundColor: '#cccacaff',
                },
                {
                    label: 'Ganho de Capital',
                    data: ganhosDeCapital,
                    backgroundColor: '#00d9c3',
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: "#a0a7b3" } },
                y: { stacked: true, grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: (value) => value >= 1000 ? `R$ ${value / 1000}k` : `R$ ${value}` } }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { color: '#a0a7b3', usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                    }
                }
            }
        }
    });
}


/**
 * Renderiza o gráfico de alocação de ativos.
 */
function renderAssetAllocationChart(carteira, precosEInfos) {
    const canvas = document.getElementById('asset-allocation-chart');
    if (!canvas) return;

    if (assetAllocationChart) {
        assetAllocationChart.destroy();
        assetAllocationChart = null;
    }

    const alocacao = { 'Ações': 0, 'FIIs': 0, 'ETF': 0, 'Cripto': 0, 'Renda Fixa': 0 };
    let patrimonioTotal = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 1e-8) {
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

    const backgroundColors = [
        '#2dd4bf', '#60a5fa', '#f472b6', '#a78bfa', '#facc15', '#fb923c', '#9ca3af'
    ];

    assetAllocationChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: 'transparent',
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            hoverOffset: 12,
            layout: {
                padding: 15
            },
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

/**
 * Renderiza a nova seção "Posição Consolidada" com cards.
 */
function renderPosicaoConsolidada(carteira, precosEInfos, proventos, dailyVariations) {
    const container = document.getElementById('posicao-consolidada-container');
    if (!container) return;

    const proventosPorAtivo = proventos.reduce((acc, p) => {
        acc[p.ativo] = (acc[p.ativo] || 0) + p.valor;
        const umAnoAtras = new Date();
        umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
        if (new Date(p.dataPagamento) > umAnoAtras) {
            acc[`${p.ativo}_12m`] = (acc[`${p.ativo}_12m`] || 0) + p.valor;
        }
        return acc;
    }, {});

    const carteiraArray = Object.values(carteira).map(ativo => {
        if (ativo.quantidade > 1e-8) {
            const precoAtual = precosEInfos[ativo.ativo]?.price || 0;
            const valorAtual = ativo.quantidade * precoAtual;
            const custoDaPosicao = ativo.valorTotalInvestido < 0 ? 0 : ativo.valorTotalInvestido;
            const resultado = valorAtual - custoDaPosicao + (proventosPorAtivo[ativo.ativo] || 0);
            const rentabilidade = custoDaPosicao > 0 ? (resultado / custoDaPosicao) * 100 : 0;
            const dividendYield = (valorAtual > 0) ? ((proventosPorAtivo[`${ativo.ativo}_12m`] || 0) / valorAtual) * 100 : 0;

            return {
                ...ativo, valorAtual, resultado, rentabilidade, dividendYield,
                precoMedio: ativo._quantidadeComprada > 0 ? ativo._valorTotalComprado / ativo._quantidadeComprada : 0,
            };
        }
        return null;
    }).filter(Boolean);

    const groupedAssets = carteiraArray.reduce((acc, ativo) => {
        const tipoMapeado = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(ativo.tipoAtivo) ? 'Renda Fixa' : ativo.tipoAtivo;
        if (!acc[tipoMapeado]) acc[tipoMapeado] = [];
        acc[tipoMapeado].push(ativo);
        return acc;
    }, {});

    let html = `<h3 style="margin-top: 0; margin-bottom: 20px; font-weight: 600; color: #e0e0e0;">Posição Consolidada</h3>`;
    const groupOrder = ['Ações', 'FIIs', 'Renda Fixa', 'ETF', 'Cripto'];

    for (const tipo of groupOrder) {
        if (!groupedAssets[tipo]) continue;

        const assets = groupedAssets[tipo];
        const groupId = `group-${tipo.replace(/\s+/g, '-')}`;

        const groupSummary = assets.reduce((acc, ativo) => {
            acc.investido += ativo.valorTotalInvestido;
            acc.atual += ativo.valorAtual;
            acc.proventos += (proventosPorAtivo[ativo.ativo] || 0);
            return acc;
        }, { investido: 0, atual: 0, proventos: 0 });

        const groupRentabilidadeReais = groupSummary.atual - groupSummary.investido + groupSummary.proventos;

        if (groupCollapseState[groupId] === undefined) groupCollapseState[groupId] = true;
        const isCollapsed = !groupCollapseState[groupId];

        html += `
            <div class="patrimonio-group-card">
                <div class="patrimonio-group-header" data-group-id="${groupId}">
                    <div class="group-header-title">
                        <i class="fas fa-chevron-down group-toggle-icon"></i>
                        ${tipo} (${assets.length})
                    </div>
                    <div class="group-summary-grid">
                        <div class="summary-item-small"><span class="label">Total Investido</span><span class="value">${formatCurrency(groupSummary.investido)}</span></div>
                        <div class="summary-item-small"><span class="label">Valor Atual</span><span class="value large ${groupSummary.atual >= groupSummary.investido ? 'positive-change' : 'negative-change'}">${formatCurrency(groupSummary.atual)}</span></div>
                        <div class="summary-item-small">
                            <span class="label">Rentabilidade</span>
                            <span class="value ${groupRentabilidadeReais >= 0 ? 'positive-change' : 'negative-change'}">
                                ${formatCurrency(groupRentabilidadeReais, true)}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="patrimonio-group-content ${isCollapsed ? 'collapsed' : ''}" id="${groupId}">
                    <div class="asset-cards-grid">
        `;

        assets.sort((a, b) => b.valorAtual - a.valorAtual);
        assets.forEach(ativo => {
            const logoUrl = precosEInfos[ativo.ativo]?.logoUrl;
            let logoHtml;
            if (ativo.tipoAtivo === 'FIIs') {
                logoHtml = `<div class="ativo-logo-fallback"><i class="fas fa-building"></i></div>`;
            } else if (logoUrl) {
                logoHtml = `<img src="${logoUrl}" alt="${ativo.ativo}" class="ativo-logo">`;
            } else {
                logoHtml = `<div class="ativo-logo-fallback">${ativo.ativo.charAt(0)}</div>`;
            }

            html += `
                <div class="asset-card">
                    <div class="asset-card-header">
                        ${logoHtml}
                        <div class="asset-card-ticker-info">
                            <div class="ticker">${ativo.ativo}</div>
                            <div class="tipo">${ativo.tipoAtivo}</div>
                        </div>
                    </div>
                    <div class="asset-card-body">
                        <div class="asset-metric"><span class="label">Preço Médio</span><span class="value">${formatCurrency(ativo.precoMedio)}</span></div>
                        <div class="asset-metric"><span class="label">Preço Atual</span><span class="value">${formatCurrency(precosEInfos[ativo.ativo]?.price || 0)}</span></div>
                        <div class="asset-metric"><span class="label">Quantidade</span><span class="value">${ativo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</span></div>
                        <div class="asset-metric"><span class="label">Dividend Yield (12M)</span><span class="value">${formatPercent(ativo.dividendYield)}</span></div>
                        <div class="asset-metric"><span class="label">Valor Investido</span><span class="value">${formatCurrency(ativo.valorTotalInvestido)}</span></div>
                        <div class="asset-metric"><span class="label">Valor Atual</span><span class="value">${formatCurrency(ativo.valorAtual)}</span></div>
                    </div>
                    <div class="asset-card-footer">
                        <div class="result-line">
                            <span class="label">Proventos Recebidos</span>
                            <span class="value positive-change">
                                ${formatCurrency(proventosPorAtivo[ativo.ativo] || 0)}
                            </span>
                        </div>
                        <div class="result-line">
                            <span class="label">Resultado Total</span>
                            <span class="value ${ativo.resultado >= 0 ? 'positive-change' : 'negative-change'}">
                                ${formatCurrency(ativo.resultado, true)}
                                <span class="sub-value">${formatPercent(ativo.rentabilidade, true)}</span>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div></div></div>`;
    }
    container.innerHTML = html;

    Object.keys(groupCollapseState).forEach(groupId => {
        const header = document.querySelector(`[data-group-id="${groupId}"]`);
        if (header) {
            header.querySelector('.group-toggle-icon').style.transform = groupCollapseState[groupId] ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
    });
}

/**
 * Função principal que orquestra a renderização da aba Patrimônio.
 */
export async function renderPatrimonioTab(lancamentos, proventos) {
    const patrimonioContent = document.getElementById('patrimonio-content');
    if (!patrimonioContent || !lancamentos || lancamentos.length === 0) {
        if (patrimonioEvolutionChart) patrimonioEvolutionChart.destroy();
        if (assetAllocationChart) assetAllocationChart.destroy();
        document.getElementById('posicao-consolidada-container').innerHTML = '<h3 style="margin-top: 0; margin-bottom: 20px; font-weight: 600; color: #e0e0e0;">Posição Consolidada</h3><p>Nenhum lançamento encontrado.</p>';
        document.getElementById('allocation-details').innerHTML = '';
        return;
    }

    const carteira = lancamentos.reduce((acc, l) => {
        if (!acc[l.ativo]) {
            acc[l.ativo] = {
                ativo: l.ativo, tipoAtivo: l.tipoAtivo, quantidade: 0,
                valorTotalInvestido: 0, _quantidadeComprada: 0, _valorTotalComprado: 0
            };
        }
        const ativo = acc[l.ativo];
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
        return acc;
    }, {});

    const tickersRV = Object.values(carteira)
        .filter(a => a.quantidade > 1e-8 && !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(a.tipoAtivo))
        .map(a => a.ativo);

    const [precosRV, precosRF, dailyVariations] = await Promise.all([
        fetchCurrentPrices(tickersRV),
        getPrecosAtuaisRendaFixa(lancamentos),
        fetchDailyVariation(tickersRV)
    ]);
    const precosEInfos = { ...precosRV, ...precosRF };

    renderPatrimonioEvolutionChart(lancamentos, precosEInfos);
    renderAssetAllocationChart(carteira, precosEInfos);
    renderPosicaoConsolidada(carteira, precosEInfos, proventos, dailyVariations);
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const patrimonioContainer = document.getElementById('patrimonio-content');
    if (patrimonioContainer) {
        patrimonioContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.patrimonio-group-header');
            if (header) {
                const groupId = header.dataset.groupId;
                const content = document.getElementById(groupId);
                if (content) {
                    const isCollapsed = content.classList.toggle('collapsed');
                    groupCollapseState[groupId] = !isCollapsed;
                    header.querySelector('.group-toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
                }
            }
        });

        const periodoFilter = document.getElementById('patrimonio-periodo-filter');
        const tipoAtivoFilter = document.getElementById('patrimonio-tipo-ativo-filter');

        const handleFilterChange = () => {
            if (window.allLancamentos && window.precosEInfos) {
                renderPatrimonioEvolutionChart(window.allLancamentos, window.precosEInfos);
            }
        };

        periodoFilter.addEventListener('change', handleFilterChange);
        tipoAtivoFilter.addEventListener('change', handleFilterChange);
    }
});