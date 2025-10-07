import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
import { db, auth } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";


/**
 * Busca os preços de fechamento do dia anterior para uma lista de tickers.
 * @param {string} userID - O ID do usuário logado.
 * @param {Array<string>} tickers - A lista de tickers a serem buscados.
 * @returns {Promise<object>} - Um objeto mapeando ticker para o preço do dia anterior.
 */
async function fetchPreviousDayPrices(userID, tickers) {
    if (!userID || !tickers || tickers.length === 0) return {};

    try {
        const hojeStr = new Date().toISOString().split('T')[0];
        const precosAnteriores = {};

        const qLastDate = query(
            collection(db, "historicoPrecosDiario"),
            where("userID", "==", userID),
            where("data", "<", hojeStr),
            orderBy("data", "desc"),
            limit(1)
        );

        const lastDateSnapshot = await getDocs(qLastDate);
        if (lastDateSnapshot.empty) {
            console.warn("[ETF] Nenhum registro de preço de dias anteriores encontrado.");
            return {};
        }

        const ultimoDia = lastDateSnapshot.docs[0].data().data;

        const qPrices = query(
            collection(db, "historicoPrecosDiario"),
            where("userID", "==", userID),
            where("data", "==", ultimoDia),
            where("ticker", "in", tickers)
        );

        const priceSnapshot = await getDocs(qPrices);
        priceSnapshot.forEach(doc => {
            const data = doc.data();
            precosAnteriores[data.ticker] = data.valor;
        });

        return precosAnteriores;

    } catch (error) {
        if (error.code === 'failed-precondition') {
            console.warn("[ETF] Erro ao buscar preços: O índice para 'historicoPrecosDiario' ainda está sendo criado no Firestore. Tente novamente em alguns minutos.");
        } else {
            console.error("[ETF] Erro ao buscar preços do dia anterior:", error);
        }
        return {};
    }
}


/**
 * Calcula e renderiza a valorização do dia para a carteira de ETFs.
 */
async function renderEtfDayValorization(tickers, carteira, precosAtuais) {
    const valorizationReaisDiv = document.getElementById("etf-valorization-reais");
    const valorizationPercentDiv = document.getElementById("etf-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return;

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";
    valorizationPercentDiv.className = 'valorization-pill';

    try {
        const precosDiaAnterior = await fetchPreviousDayPrices(auth.currentUser.uid, tickers);

        let patrimonioTotalHoje = 0;
        let patrimonioTotalOntem = 0;

        tickers.forEach(ticker => {
            const ativo = carteira[ticker];
            const precoHoje = precosAtuais[ticker]?.price;
            const precoOntem = precosDiaAnterior[ticker];

            if (ativo && ativo.quantidade > 0) {
                if (precoHoje) {
                    patrimonioTotalHoje += ativo.quantidade * precoHoje;
                }
                patrimonioTotalOntem += ativo.quantidade * (precoOntem || precoHoje || 0);
            }
        });

        if (patrimonioTotalOntem <= 0) {
            valorizationReaisDiv.textContent = "N/A";
            valorizationPercentDiv.innerHTML = "-";
            return;
        }

        const totalValorizacaoReais = patrimonioTotalHoje - patrimonioTotalOntem;
        const variacaoPercentualFinal = (totalValorizacaoReais / patrimonioTotalOntem) * 100;

        const isPositive = totalValorizacaoReais >= 0;
        const sinal = isPositive ? '+' : '';
        const corClasse = isPositive ? 'positive' : 'negative';
        const iconeSeta = isPositive ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';

        valorizationReaisDiv.textContent = `${sinal}${totalValorizacaoReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        valorizationReaisDiv.style.color = isPositive ? '#00d9c3' : '#ef4444';

        valorizationPercentDiv.innerHTML = `${sinal}${variacaoPercentualFinal.toFixed(2)}% ${iconeSeta}`;
        valorizationPercentDiv.classList.add(corClasse);

    } catch (error) {
        console.error("Erro ao calcular a valorização do dia para ETFs:", error);
        valorizationReaisDiv.textContent = "Erro ao carregar";
    }
}

/**
 * Calcula e renderiza o resumo da carteira de ETFs.
 */
function renderEtfSummary(carteira, precosAtuais) {
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

    updateField('etf-total-investido', totalInvestido);
    updateField('etf-patrimonio-atual', patrimonioAtual);
    updateField('etf-rentabilidade-reais', rentabilidadeReais, true, true);
    updateField('etf-rentabilidade-percent', rentabilidadePercent, false, true);
}


/**
 * Renderiza os cards da carteira de ETFs.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {Array<object>} proventos - A lista completa de todos os proventos.
 */
export async function renderEtfCarteira(lancamentos, proventos) {
    const etfListaDiv = document.getElementById("etf-lista");
    if (!etfListaDiv) return;

    etfListaDiv.innerHTML = `<p>Calculando e buscando cotações...</p>`;

    const etfLancamentos = lancamentos.filter(l => l.tipoAtivo === 'ETF');

    if (etfLancamentos.length === 0) {
        etfListaDiv.innerHTML = `<p>Nenhum ETF lançado ainda.</p>`;
        document.getElementById("etf-valorization-reais").textContent = "N/A";
        document.getElementById("etf-valorization-percent").innerHTML = "";
        document.getElementById("etf-total-investido").textContent = "R$ 0,00";
        document.getElementById("etf-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("etf-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("etf-rentabilidade-percent").textContent = "0,00%";
        return;
    }

    const carteira = {};

    etfLancamentos.forEach(l => {
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

    proventos.forEach(p => {
        if (p.tipoAtivo === 'ETF' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
    if (tickers.length === 0) {
        etfListaDiv.innerHTML = `<p>Nenhum ETF com posição em carteira.</p>`;
        return;
    }

    try {
        const precosAtuais = await fetchCurrentPrices(tickers);

        await renderEtfDayValorization(tickers, carteira, precosAtuais);

        renderEtfSummary(carteira, precosAtuais);

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
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="ETF">
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
                            <span>${ativo.quantidade.toLocaleString('pt-BR')}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Médio</span>
                            <span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div class="detail-item">
                            <span>Preço Atual</span>
                            <span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                         <div class="detail-item">
                            <span>Total Proventos</span>
                            <span>${ativo.proventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        etfListaDiv.innerHTML = html;

    } catch (error) {
        console.error("Erro ao renderizar carteira de ETFs:", error);
        etfListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

document.getElementById("etf-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});