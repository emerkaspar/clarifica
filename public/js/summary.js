import { fetchIndexers } from './api/bcb.js';

const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const updateField = (id, value, isCurrency = true, addSign = false, defaultColor = '#e0e0e0') => {
    const element = document.getElementById(id);
    if (!element) return;

    const formattedValue = isCurrency ? formatCurrency(value) : `${(value || 0).toFixed(2)}%`;
    const sinal = value > 0 ? '+' : '';

    element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
    element.style.color = value === 0 ? defaultColor : (value > 0 ? '#00d9c3' : '#ef4444');
};

async function calculateRendaFixaPatrimonio(rfLancamentos, allTesouroDiretoPrices) {
    if (!rfLancamentos || rfLancamentos.length === 0) {
        return { patrimonio: 0, investido: 0 };
    }

    let patrimonioTotalRf = 0;
    let investidoTotalRf = 0;

    const tesouroDiretoLancamentos = rfLancamentos.filter(l => l.tipoAtivo === 'Tesouro Direto');
    const outrosRfLancamentos = rfLancamentos.filter(l => l.tipoAtivo !== 'Tesouro Direto');

    // --- LÓGICA PARA TESOURO DIRETO (MARCAÇÃO A MERCADO) ---
    tesouroDiretoLancamentos.forEach(ativo => {
        investidoTotalRf += ativo.valorAplicado;
        const precoInfo = allTesouroDiretoPrices[ativo.ativo];
        const valorDeMercado = precoInfo ? precoInfo.valor * ativo.quantidade : ativo.valorAplicado;
        patrimonioTotalRf += valorDeMercado;
    });

    // --- LÓGICA PARA OUTROS RF (CÁLCULO NA CURVA) ---
    if (outrosRfLancamentos.length > 0) {
        try {
            const hoje = new Date();
            const dataMaisAntiga = outrosRfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, outrosRfLancamentos[0].data);
            const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

            for (const ativo of outrosRfLancamentos) {
                investidoTotalRf += ativo.valorAplicado;
                const dataCalculo = new Date(ativo.data + 'T00:00:00');
                let valorBruto = ativo.valorAplicado;
                const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

                if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                    let acumuladorCDI = 1;
                    const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                    historicoCDI
                        .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                        .forEach(item => {
                            acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI);
                        });
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
                        .filter(item => {
                            const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                            return itemDate.getFullYear() > dataCalculo.getFullYear() || (itemDate.getFullYear() === dataCalculo.getFullYear() && itemDate.getMonth() >= dataCalculo.getMonth());
                        })
                        .forEach(item => {
                            acumuladorIPCA *= (1 + parseFloat(item.valor) / 100);
                        });
                    const valorCorrigido = ativo.valorAplicado * acumuladorIPCA;
                    const diasUteis = diasCorridosCalculo * (252 / 365.25);
                    valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
                }

                const lucro = valorBruto - ativo.valorAplicado;
                let aliquotaIR = 0;
                const isentoIR = ['LCI', 'LCA'].includes(ativo.tipoAtivo);
                if (lucro > 0 && !isentoIR) {
                    const diasTotaisDesdeAplicacao = Math.floor((hoje - new Date(ativo.data + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                    if (diasTotaisDesdeAplicacao <= 180) aliquotaIR = 0.225;
                    else if (diasTotaisDesdeAplicacao <= 360) aliquotaIR = 0.20;
                    else if (diasTotaisDesdeAplicacao <= 720) aliquotaIR = 0.175;
                    else aliquotaIR = 0.15;
                }
                const impostoDevido = lucro * aliquotaIR;
                patrimonioTotalRf += (valorBruto - impostoDevido);
            }
        } catch (error) {
            console.error("Erro ao calcular patrimônio de Outros Renda Fixa para o resumo:", error);
            // Em caso de erro, usa o valor investido para não quebrar o cálculo total
            outrosRfLancamentos.forEach(ativo => patrimonioTotalRf += ativo.valorAplicado);
        }
    }

    return { patrimonio: patrimonioTotalRf, investido: investidoTotalRf };
}


export async function updateMainSummaryHeader(lancamentos, proventos, precosEInfos, allTesouroDiretoPrices) {
    if (lancamentos.length === 0) {
        updateField('summary-patrimonio-total', 0);
        document.getElementById('summary-valor-investido').textContent = `Valor investido: ${formatCurrency(0)}`;
        document.getElementById('summary-patrimonio-percent').innerHTML = `0,00%`;
        document.getElementById('summary-patrimonio-percent').className = 'summary-pill';
        updateField('summary-lucro-total', 0, true, false, '#e0e0e0');
        document.getElementById('summary-ganho-capital').textContent = formatCurrency(0);
        document.getElementById('summary-dividendos-recebidos').textContent = formatCurrency(0);
        updateField('summary-proventos-12m', 0, true, false, '#e0e0e0');
        document.getElementById('summary-proventos-total').textContent = `Total: ${formatCurrency(0)}`;
        updateField('summary-variacao-valor', 0, true, true);
        document.getElementById('summary-variacao-percent').innerHTML = `0,00%`;
        document.getElementById('summary-rentabilidade-percent').innerHTML = `0,00%`;
        return { patrimonioTotal: 0, valorInvestidoTotal: 0, lucroTotal: 0, ganhoCapital: 0 };
    }

    const rendaFixaLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));
    const outrosLancamentos = lancamentos.filter(l => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));

    const rfResult = await calculateRendaFixaPatrimonio(rendaFixaLancamentos, allTesouroDiretoPrices);
    let patrimonioTotal = rfResult.patrimonio;
    let valorInvestidoTotal = rfResult.investido;

    const carteiraOutros = {};
    outrosLancamentos.forEach(l => {
        if (!carteiraOutros[l.ativo]) {
            carteiraOutros[l.ativo] = {
                ativo: l.ativo, tipoAtivo: l.tipoAtivo, quantidade: 0,
                quantidadeComprada: 0, valorTotalInvestido: 0,
            };
        }
        const ativo = carteiraOutros[l.ativo];
        if (l.tipoOperacao === 'compra') {
            ativo.quantidade += l.quantidade;
            ativo.quantidadeComprada += l.quantidade;
            ativo.valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            if (ativo.quantidadeComprada > 0) {
                const precoMedio = ativo.valorTotalInvestido / ativo.quantidade;
                ativo.valorTotalInvestido -= l.quantidade * precoMedio;
            }
            ativo.quantidade -= l.quantidade;
        }
    });

    Object.values(carteiraOutros).forEach(ativo => {
        if (ativo.quantidade > 1e-8) { // Evita quantidades residuais negativas
            const precoAtual = precosEInfos[ativo.ativo]?.price || (ativo.valorTotalInvestido > 0 && ativo.quantidade > 0 ? ativo.valorTotalInvestido / ativo.quantidade : 0);
            valorInvestidoTotal += ativo.valorTotalInvestido;
            patrimonioTotal += precoAtual * ativo.quantidade;
        }
    });

    const ganhoCapital = patrimonioTotal - valorInvestidoTotal;
    const totalProventosGeral = proventos.reduce((acc, p) => acc + p.valor, 0);
    const lucroTotal = ganhoCapital + totalProventosGeral;

    const dozeMesesAtras = new Date();
    dozeMesesAtras.setFullYear(dozeMesesAtras.getFullYear() - 1);
    const proventos12M = proventos
        .filter(p => new Date(p.dataPagamento) >= dozeMesesAtras)
        .reduce((acc, p) => acc + p.valor, 0);

    const variacaoPercent = valorInvestidoTotal > 0 ? (ganhoCapital / valorInvestidoTotal) * 100 : 0;
    const rentabilidadePercent = valorInvestidoTotal > 0 ? (lucroTotal / valorInvestidoTotal) * 100 : 0;
    const patrimonioPercent = valorInvestidoTotal > 0 ? ((patrimonioTotal / valorInvestidoTotal) - 1) * 100 : 0;

    updateField('summary-patrimonio-total', patrimonioTotal);
    document.getElementById('summary-valor-investido').textContent = `Valor investido: ${formatCurrency(valorInvestidoTotal)}`;
    const patrimonioArrow = patrimonioPercent >= 0 ? '↑' : '↓';
    document.getElementById('summary-patrimonio-percent').innerHTML = `${patrimonioPercent.toFixed(2)}% ${patrimonioArrow}`;
    document.getElementById('summary-patrimonio-percent').className = patrimonioPercent >= 0 ? 'summary-pill positive' : 'summary-pill negative';

    updateField('summary-lucro-total', lucroTotal, true, false, '#e0e0e0');
    document.getElementById('summary-ganho-capital').textContent = formatCurrency(ganhoCapital);
    document.getElementById('summary-dividendos-recebidos').textContent = formatCurrency(totalProventosGeral);

    updateField('summary-proventos-12m', proventos12M, true, false, '#e0e0e0');
    document.getElementById('summary-proventos-total').textContent = `Total: ${formatCurrency(totalProventosGeral)}`;

    updateField('summary-variacao-valor', ganhoCapital, true, true);
    document.getElementById('summary-variacao-percent').className = variacaoPercent >= 0 ? 'summary-main-value small positive' : 'summary-main-value small negative';
    document.getElementById('summary-variacao-percent').textContent = `${(variacaoPercent || 0).toFixed(2)}%`;

    document.getElementById('summary-rentabilidade-percent').className = rentabilidadePercent >= 0 ? 'summary-main-value small positive' : 'summary-main-value small negative';
    document.getElementById('summary-rentabilidade-percent').textContent = `${(rentabilidadePercent || 0).toFixed(2)}%`;


    return { patrimonioTotal, valorInvestidoTotal, lucroTotal, ganhoCapital };
}