import { fetchCurrentPrices } from '../api/brapi.js';
import { db, auth } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Busca os preços de fechamento do dia anterior para uma lista de tickers,
 * respeitando o limite de 10 itens do Firestore para o operador 'in'.
 * @param {string} userID - O ID do usuário logado.
 * @param {Array<string>} tickers - A lista de tickers a serem buscados.
 * @returns {Promise<object>} - Um objeto mapeando ticker para o preço do dia anterior.
 */
async function fetchPreviousDayPrices(userID, tickers) {
    if (!userID || !tickers || tickers.length === 0) return {};

    try {
        const hojeStr = new Date().toISOString().split('T')[0];
        const precosAnteriores = {};

        // 1. Encontra a data do último registro de preço anterior a hoje
        const qLastDate = query(
            collection(db, "historicoPrecosDiario"),
            where("userID", "==", userID),
            where("data", "<", hojeStr),
            orderBy("data", "desc"),
            limit(1)
        );

        const lastDateSnapshot = await getDocs(qLastDate);
        if (lastDateSnapshot.empty) {
            console.warn(`[Cripto] Nenhum registro de preço de dias anteriores encontrado.`);
            return {};
        }

        const ultimoDia = lastDateSnapshot.docs[0].data().data;

        // 2. Quebra a lista de tickers em pacotes de 10
        const tickerChunks = [];
        for (let i = 0; i < tickers.length; i += 10) {
            tickerChunks.push(tickers.slice(i, i + 10));
        }

        // 3. Executa uma consulta para cada pacote de tickers
        const promises = tickerChunks.map(chunk => {
            const qPrices = query(
                collection(db, "historicoPrecosDiario"),
                where("userID", "==", userID),
                where("data", "==", ultimoDia),
                where("ticker", "in", chunk)
            );
            return getDocs(qPrices);
        });

        // 4. Aguarda todas as consultas e junta os resultados
        const snapshots = await Promise.all(promises);
        snapshots.forEach(priceSnapshot => {
            priceSnapshot.forEach(doc => {
                const data = doc.data();
                precosAnteriores[data.ticker] = data.valor;
            });
        });

        return precosAnteriores;

    } catch (error) {
        console.error("[Cripto] Erro ao buscar preços do dia anterior:", error);
        return {};
    }
}


/**
 * Calcula e renderiza a valorização do dia para a carteira de Criptos.
 */
function renderCriptoDayValorization(patrimonioAtual, patrimonioAnterior, hasPreviousDayData) {
    const valorizationReaisDiv = document.getElementById("cripto-valorization-reais");
    const valorizationPercentDiv = document.getElementById("cripto-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return;

    if (!hasPreviousDayData || patrimonioAnterior <= 0) {
        valorizationReaisDiv.textContent = "N/A";
        valorizationPercentDiv.innerHTML = "-";
        valorizationPercentDiv.className = 'valorization-pill';
        return;
    }

    const totalValorizacaoReais = patrimonioAtual - patrimonioAnterior;
    const variacaoPercentualFinal = (totalValorizacaoReais / patrimonioAnterior) * 100;

    const isPositive = totalValorizacaoReais >= 0;
    const sinal = isPositive ? '+' : '';
    const corClasse = isPositive ? 'positive' : 'negative';
    const iconeSeta = isPositive ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';

    valorizationReaisDiv.textContent = `${sinal}${totalValorizacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    valorizationReaisDiv.style.color = isPositive ? '#00d9c3' : '#ef4444';

    valorizationPercentDiv.innerHTML = `${sinal}${variacaoPercentualFinal.toFixed(2)}% ${iconeSeta}`;
    valorizationPercentDiv.className = `valorization-pill ${corClasse}`;
}


/**
 * Calcula e renderiza o resumo da carteira de Criptomoedas.
 * @param {object} carteira - O objeto da carteira consolidada.
 * @param {object} precosAtuais - Objeto com os preços atuais dos ativos.
 * @returns {number} O patrimônio atual total.
 */
function renderCriptoSummary(carteira, precosAtuais) {
    let totalInvestido = 0;
    let patrimonioAtual = 0;
    let totalProventos = 0;

    Object.values(carteira).forEach(ativo => {
        if (ativo.quantidade > 0) {
            const precoAtual = precosAtuais[ativo.ativo]?.price || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;

            totalInvestido += precoMedio * ativo.quantidade;
            patrimonioAtual += precoAtual * ativo.quantidade;
            totalProventos += ativo.proventos;
        }
    });

    const rentabilidadeReais = patrimonioAtual - totalInvestido + totalProventos;
    const rentabilidadePercent = totalInvestido > 0 ? (rentabilidadeReais / totalInvestido) * 100 : 0;

    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const updateField = (id, value, isCurrency = true, addSign = false) => {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = isCurrency ? formatCurrency(value) : `${value.toFixed(2)}%`;
            const sinal = value >= 0 ? '+' : '';
            element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
            element.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
            if (id.includes('total-investido') || id.includes('patrimonio-atual')) {
                element.style.color = '#e0e0e0';
            }
        }
    };

    updateField('cripto-total-investido', totalInvestido);
    updateField('cripto-patrimonio-atual', patrimonioAtual);
    updateField('cripto-rentabilidade-reais', rentabilidadeReais, true, true);
    updateField('cripto-rentabilidade-percent', rentabilidadePercent, false, true);

    return patrimonioAtual;
}


/**
 * Renderiza os cards da carteira de Criptomoedas.
 */
export async function renderCriptoCarteira(lancamentos, proventos) {
    const criptoListaDiv = document.getElementById("cripto-lista");
    if (!criptoListaDiv) return;

    criptoListaDiv.innerHTML = `<p>Calculando e buscando cotações...</p>`;

    const valorizationReaisDiv = document.getElementById("cripto-valorization-reais");
    const valorizationPercentDiv = document.getElementById("cripto-valorization-percent");
    if (valorizationReaisDiv) valorizationReaisDiv.textContent = "Calculando...";
    if (valorizationPercentDiv) valorizationPercentDiv.innerHTML = "";


    const criptoLancamentos = lancamentos.filter(l => l.tipoAtivo === 'Cripto');

    if (criptoLancamentos.length === 0) {
        criptoListaDiv.innerHTML = `<p>Nenhuma Criptomoeda lançada ainda.</p>`;
        document.getElementById("cripto-total-investido").textContent = "R$ 0,00";
        document.getElementById("cripto-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("cripto-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("cripto-rentabilidade-percent").textContent = "0,00%";
        if (valorizationReaisDiv) valorizationReaisDiv.textContent = "N/A";
        return;
    }

    const carteira = {};

    criptoLancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = {
                ativo: l.ativo,
                quantidade: 0,
                quantidadeComprada: 0,
                valorTotalInvestido: 0,
                proventos: 0,
            };
        }
        if (l.tipoOperacao === 'compra') {
            carteira[l.ativo].quantidade += l.quantidade;
            carteira[l.ativo].quantidadeComprada += l.quantidade;
            carteira[l.ativo].valorTotalInvestido += l.valorTotal;
        } else if (l.tipoOperacao === 'venda') {
            carteira[l.ativo].quantidade -= l.quantidade;
        }
    });

    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        criptoListaDiv.innerHTML = `<p>Nenhuma Criptomoeda com posição em carteira.</p>`;
        return;
    }

    try {
        const precosAtuais = await fetchCurrentPrices(tickers);
        const patrimonioAtual = renderCriptoSummary(carteira, precosAtuais);

        const precosDiaAnterior = await fetchPreviousDayPrices(auth.currentUser.uid, tickers);
        let patrimonioAnterior = 0;
        let hasPreviousDayData = false;
        
        tickers.forEach(ticker => {
            const ativo = carteira[ticker];
            const precoOntem = precosDiaAnterior[ticker];
            if (ativo && ativo.quantidade > 0) {
                if (precoOntem) {
                    patrimonioAnterior += ativo.quantidade * precoOntem;
                    hasPreviousDayData = true;
                }
            }
        });

        renderCriptoDayValorization(patrimonioAtual, patrimonioAnterior, hasPreviousDayData);


        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker]?.price || 0;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;

            const variacaoReais = valorPosicaoAtual - valorInvestido;
            const variacaoPercent = valorInvestido > 0 ? (variacaoReais / valorInvestido) * 100 : 0;
            const rentabilidadeReais = variacaoReais + ativo.proventos;
            const rentabilidadePercent = valorInvestido > 0 ? (rentabilidadeReais / valorInvestido) * 100 : 0;

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Cripto">
                    <div class="fii-card-ticker">${ativo.ativo}</div>
                    <div class="fii-card-metric-main">
                        <div class="label">Valor Atual da Posição</div>
                        <div class="value">${valorPosicaoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                     <div class="fii-card-results-container">
                        <div class="fii-card-result ${variacaoReais >= 0 ? 'positive-change' : 'negative-change'}">
                            Variação: ${variacaoReais >= 0 ? '+' : ''}${variacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacaoPercent.toFixed(2)}%) ${variacaoReais >= 0 ? '↑' : '↓'}
                        </div>
                        <div class="fii-card-result ${rentabilidadeReais >= 0 ? 'positive-change' : 'negative-change'}">
                            Rentabilidade: ${rentabilidadeReais >= 0 ? '+' : ''}${rentabilidadeReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${rentabilidadePercent.toFixed(2)}%) ${rentabilidadeReais >= 0 ? '↑' : '↓'}
                        </div>
                    </div>
                    <div class="fii-card-details">
                        <div class="detail-item">
                            <span>Valor Investido</span>
                            <span>${valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                         <div class="detail-item">
                            <span>Quantidade</span>
                            <span>${ativo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Médio</span>
                            <span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Atual</span>
                            <span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        criptoListaDiv.innerHTML = html;

    } catch (error) {
        console.error("Erro ao renderizar carteira de Cripto:", error);
        criptoListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

document.getElementById("cripto-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});