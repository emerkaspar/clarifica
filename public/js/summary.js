import { fetchCurrentPrices, fetchCryptoPrices } from './api/brapi.js';

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

    const carteira = {};

    // 1. Consolida todos os lançamentos
    lancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                tipoAtivo: l.tipoAtivo,
                quantidade: 0,
                valorTotalInvestido: 0,
            };
        }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
            carteira[l.ativo].valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            const precoMedio = carteira[l.ativo].valorTotalInvestido / carteira[l.ativo].quantidade;
            carteira[l.ativo].valorTotalInvestido -= l.quantidade * precoMedio;
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    const tickersNormais = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo !== 'Cripto').map(a => a.ativo);
    const tickersCripto = Object.values(carteira).filter(a => a.quantidade > 0 && a.tipoAtivo === 'Cripto').map(a => a.ativo);

    // 2. Busca os preços de todos os ativos
    const [precosNormais, precosCripto] = await Promise.all([
        fetchCurrentPrices(tickersNormais),
        fetchCryptoPrices(tickersCripto)
    ]);
    const precosAtuais = { ...precosNormais, ...precosCripto };

    // 3. Calcula as métricas
    let valorInvestidoTotal = 0;
    let patrimonioTotal = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const precoAtual = precosAtuais[ativo.ativo] || (ativo.valorTotalInvestido / ativo.quantidade); // Usa PM se o preço não for encontrado
            const precoMedio = ativo.valorTotalInvestido / ativo.quantidade;
            
            valorInvestidoTotal += precoMedio * ativo.quantidade;
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

    // 4. Atualiza a UI
    // Card 1: Patrimônio
    updateField('summary-patrimonio-total', patrimonioTotal);
    document.getElementById('summary-valor-investido').textContent = `Valor investido: ${formatCurrency(valorInvestidoTotal)}`;
    const patrimonioArrow = variacaoPercent >= 0 ? '↑' : '↓';
    document.getElementById('summary-patrimonio-percent').innerHTML = `${variacaoPercent.toFixed(2)}% ${patrimonioArrow}`;
    document.getElementById('summary-patrimonio-percent').className = variacaoPercent >= 0 ? 'summary-pill positive' : 'summary-pill negative';

    // Card 2: Lucro Total
    updateField('summary-lucro-total', lucroTotal, true, false, '#e0e0e0');
    document.getElementById('summary-ganho-capital').textContent = formatCurrency(ganhoCapital);
    document.getElementById('summary-dividendos-recebidos').textContent = formatCurrency(totalProventosGeral);

    // Card 3: Proventos
    updateField('summary-proventos-12m', proventos12M, true, false, '#e0e0e0');
    document.getElementById('summary-proventos-total').textContent = `Total: ${formatCurrency(totalProventosGeral)}`;

    // Card 4: Variação e Rentabilidade
    const variacaoArrow = variacaoPercent >= 0 ? '↑' : '↓';
    const rentabilidadeArrow = rentabilidadePercent >= 0 ? '↗' : '↘';
    updateField('summary-variacao-valor', ganhoCapital, true, true);
    document.getElementById('summary-variacao-percent').innerHTML = `${variacaoPercent.toFixed(2)}% ${variacaoArrow}`;
    document.getElementById('summary-variacao-percent').className = variacaoPercent >= 0 ? 'positive' : 'negative';
    document.getElementById('summary-rentabilidade-percent').innerHTML = `${rentabilidadePercent.toFixed(2)}% ${rentabilidadeArrow}`;
    document.getElementById('summary-rentabilidade-percent').className = rentabilidadePercent >= 0 ? 'positive' : 'negative';
}