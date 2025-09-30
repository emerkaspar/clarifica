import { fetchCurrentPrices, fetchCryptoPrices } from './api/brapi.js';
import { fetchIndexers } from './api/bcb.js';

// Função para formatar valores monetários
const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Função para atualizar um campo na UI
const updateField = (id, value, isCurrency = true, addSign = false, defaultColor = '#e0e0e0') => {
    const element = document.getElementById(id);
    if (!element) return;

    const formattedValue = isCurrency ? formatCurrency(value) : `${value.toFixed(2)}%`;
    const sinal = value > 0 ? '+' : '';

    element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
    element.style.color = value === 0 ? defaultColor : (value > 0 ? '#00d9c3' : '#ef4444');
};


async function calculateRendaFixaPatrimonio(rfLancamentos) {
    if (!rfLancamentos || rfLancamentos.length === 0) {
        return { patrimonio: 0, investido: 0 };
    }

    let patrimonioTotalRf = 0;
    let investidoTotalRf = 0;

    try {
        const hoje = new Date();
        const dataMaisAntiga = rfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, rfLancamentos[0].data);
        const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

        for (const ativo of rfLancamentos) {
            investidoTotalRf += ativo.valorAplicado;
            let valorBase = ativo.valorAplicado;
            let dataBase = ativo.data;

            const dataCalculo = new Date(dataBase + 'T00:00:00');
            let valorBruto = valorBase;
            const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

            if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                let acumuladorCDI = 1;
                const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                historicoCDI
                    .filter(item => new Date(item.data.split('/').reverse().join('-') + 'T00:00:00') >= dataCalculo)
                    .forEach(item => {
                        acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI);
                    });
                valorBruto = valorBase * acumuladorCDI;
            } else if (ativo.tipoRentabilidade === 'Prefixado') {
                const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorBase * Math.pow(1 + taxaAnual, diasUteis / 252);
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
                const valorCorrigido = valorBase * acumuladorIPCA;
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
        console.error("Erro ao calcular patrimônio de Renda Fixa:", error);
        // Em caso de erro, retorna apenas o valor investido para não quebrar o cálculo total
        return { patrimonio: investidoTotalRf, investido: investidoTotalRf };
    }

    return { patrimonio: patrimonioTotalRf, investido: investidoTotalRf };
}


export async function updateMainSummaryHeader(lancamentos, proventos) {
    if (lancamentos.length === 0) {
        // Zera os valores se não houver lançamentos
        document.getElementById('summary-patrimonio-total').textContent = formatCurrency(0);
        document.getElementById('summary-valor-investido').textContent = `Valor investido: ${formatCurrency(0)}`;
        document.getElementById('summary-patrimonio-percent').innerHTML = `0.00%`;
        document.getElementById('summary-lucro-total').textContent = formatCurrency(0);
        document.getElementById('summary-ganho-capital').textContent = formatCurrency(0);
        document.getElementById('summary-dividendos-recebidos').textContent = formatCurrency(0);
        document.getElementById('summary-proventos-12m').textContent = formatCurrency(0);
        document.getElementById('summary-proventos-total').textContent = `Total: ${formatCurrency(0)}`;
        document.getElementById('summary-variacao-valor').textContent = formatCurrency(0);
        document.getElementById('summary-variacao-percent').innerHTML = `0.00%`;
        document.getElementById('summary-rentabilidade-percent').innerHTML = `0.00%`;
        return;
    }

    // 1. Separa lançamentos de Renda Fixa dos demais
    const rendaFixaLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));
    const outrosLancamentos = lancamentos.filter(l => !['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));

    // 2. Calcula o patrimônio de Renda Fixa
    const rfResult = await calculateRendaFixaPatrimonio(rendaFixaLancamentos);
    let patrimonioTotal = rfResult.patrimonio;
    let valorInvestidoTotal = rfResult.investido;

    // 3. Calcula o patrimônio dos outros ativos (Ações, FIIs, Cripto, etc.)
    const carteiraOutros = {};
    outrosLancamentos.forEach(l => {
        if (!carteiraOutros[l.ativo]) {
            carteiraOutros[l.ativo] = {
                ativo: l.ativo, tipoAtivo: l.tipoAtivo, quantidade: 0,
                quantidadeComprada: 0, valorTotalInvestido: 0,
            };
        }
        if (l.tipoOperacao === 'compra') {
            carteiraOutros[l.ativo].quantidade += l.quantidade;
            carteiraOutros[l.ativo].quantidadeComprada += l.quantidade;
            carteiraOutros[l.ativo].valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            if (carteiraOutros[l.ativo].quantidadeComprada > 0) {
                const precoMedio = carteiraOutros[l.ativo].valorTotalInvestido / carteiraOutros[l.ativo].quantidadeComprada;
                carteiraOutros[l.ativo].valorTotalInvestido -= l.quantidade * precoMedio;
            }
            carteiraOutros[l.ativo].quantidade -= l.quantidade;
        }
    });

    const tickersNormais = Object.values(carteiraOutros).filter(a => a.quantidade > 0 && a.tipoAtivo !== 'Cripto').map(a => a.ativo);
    const tickersCripto = Object.values(carteiraOutros).filter(a => a.quantidade > 0 && a.tipoAtivo === 'Cripto').map(a => a.ativo);

    const [precosNormais, precosCripto] = await Promise.all([
        fetchCurrentPrices(tickersNormais),
        fetchCryptoPrices(tickersCripto)
    ]);
    const precosAtuais = { ...precosNormais, ...precosCripto };

    Object.values(carteiraOutros).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const precoAtual = precosAtuais[ativo.ativo] || (ativo.valorTotalInvestido / ativo.quantidade);
            valorInvestidoTotal += ativo.valorTotalInvestido;
            patrimonioTotal += precoAtual * ativo.quantidade;
        }
    });

    // 4. Calcula as métricas finais consolidadas
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

    // 5. Atualiza a UI
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

    const variacaoArrow = variacaoPercent >= 0 ? '↑' : '↓';
    const rentabilidadeArrow = rentabilidadePercent >= 0 ? '↗' : '↘';
    updateField('summary-variacao-valor', ganhoCapital, true, true);
    document.getElementById('summary-variacao-percent').innerHTML = `${variacaoPercent.toFixed(2)}% ${variacaoArrow}`;
    document.getElementById('summary-variacao-percent').className = variacaoPercent >= 0 ? 'summary-main-value small positive' : 'summary-main-value small negative';
    document.getElementById('summary-rentabilidade-percent').innerHTML = `${rentabilidadePercent.toFixed(2)}% ${rentabilidadeArrow}`;
    document.getElementById('summary-rentabilidade-percent').className = rentabilidadePercent >= 0 ? 'summary-main-value small positive' : 'summary-main-value small negative';
}