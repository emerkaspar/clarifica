import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
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
            console.warn("[Ações] Nenhum registro de preço de dias anteriores encontrado na coleção 'historicoPrecosDiario'.");
            return {};
        }

        const ultimoDia = lastDateSnapshot.docs[0].data().data;

        // 2. Quebra a lista de tickers em pacotes de até 10
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
        if (error.code === 'failed-precondition') {
            console.warn("[Ações] Erro ao buscar preços do dia anterior: O índice necessário no Firestore ('historicoPrecosDiario') ainda está sendo criado. Isso é temporário e deve se resolver em alguns minutos.");
        } else {
            console.error("[Ações] Erro ao buscar preços do dia anterior:", error);
        }
        return {};
    }
}


/**
 * Calcula e renderiza a valorização do dia para a carteira de Ações.
 * @param {Array<string>} tickers - A lista de tickers de Ações na carteira.
 * @param {object} carteira - O objeto da carteira consolidada.
 * @param {object} precosAtuais - Objeto com os preços atuais para os tickers (intraday).
 * @returns {Promise<object>} - Retorna a performance diária e os preços do dia anterior.
 */
async function renderAcoesDayValorization(tickers, carteira, precosAtuais) {
    const valorizationReaisDiv = document.getElementById("acoes-valorization-reais");
    const valorizationPercentDiv = document.getElementById("acoes-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return { dailyPerformance: [], precosDiaAnterior: {} };

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";
    valorizationPercentDiv.className = 'valorization-pill';

    try {
        const precosDiaAnterior = await fetchPreviousDayPrices(auth.currentUser.uid, tickers);

        let patrimonioTotalHoje = 0;
        let patrimonioTotalOntem = 0;
        const dailyPerformance = [];

        tickers.forEach(ticker => {
            const ativo = carteira[ticker];
            const precoHoje = precosAtuais[ticker]?.price;
            const precoOntem = precosDiaAnterior[ticker];

            if (ativo && ativo.quantidade > 0) {
                if (precoHoje) {
                    patrimonioTotalHoje += ativo.quantidade * precoHoje;
                }
                // Usa o preço de hoje como fallback se o de ontem não estiver disponível ainda
                patrimonioTotalOntem += ativo.quantidade * (precoOntem || precoHoje || 0);

                if (precoHoje && precoOntem > 0) {
                    dailyPerformance.push({ ticker, changePercent: ((precoHoje / precoOntem) - 1) * 100 });
                }
            }
        });

        if (patrimonioTotalOntem <= 0) {
            valorizationReaisDiv.textContent = "N/A";
            valorizationPercentDiv.innerHTML = "-";
            return { dailyPerformance, precosDiaAnterior };
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

        return { dailyPerformance, precosDiaAnterior };

    } catch (error) {
        console.error("Erro ao calcular a valorização do dia para Ações:", error);
        valorizationReaisDiv.textContent = "Erro";
        return { dailyPerformance: [], precosDiaAnterior: {} };
    }
}

function renderAcoesSummary(carteira, precosAtuais) {
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
    const valorizacaoPercent = totalInvestido > 0 ? ((patrimonioAtual / totalInvestido) - 1) * 100 : 0;
    const rentabilidadePercent = totalInvestido > 0 ? (rentabilidadeReais / totalInvestido) * 100 : 0;

    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const updateField = (id, value, isCurrency = true, addSign = false) => {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = isCurrency ? formatCurrency(value) : `${value.toFixed(2)}%`;
            const sinal = value >= 0 ? '+' : '';
            element.textContent = addSign ? `${sinal}${formattedValue}` : formattedValue;
            element.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
            if (id === 'acoes-total-investido' || id === 'acoes-patrimonio-atual') {
                element.style.color = '#e0e0e0';
            }
        }
    };

    updateField('acoes-total-investido', totalInvestido);
    updateField('acoes-patrimonio-atual', patrimonioAtual);
    updateField('acoes-rentabilidade-reais', rentabilidadeReais, true, true);
    updateField('acoes-valorizacao-percent', valorizacaoPercent, false, true);
    updateField('acoes-rentabilidade-percent', rentabilidadePercent, false, true);
}

function renderAcoesHighlights(dailyPerformance, historicalPerformance) {
    const dayContainer = document.getElementById("acoes-highlights-day");
    const historyContainer = document.getElementById("acoes-highlights-history");

    if (!dayContainer || !historyContainer) return;

    const createHtml = (item) => {
        if (!item || typeof item.changePercent !== 'number') {
            return '<div class="highlight-item"><span class="ticker">-</span><span class="value">0.00%</span></div>';
        }
        const isPositive = item.changePercent >= 0;
        const colorClass = isPositive ? 'positive' : 'negative';
        const arrow = isPositive ? '↑' : '↓';
        return `
            <div class="highlight-item">
                <span class="ticker">${item.ticker}</span>
                <span class="value ${colorClass}">${item.changePercent.toFixed(2)}% ${arrow}</span>
            </div>
        `;
    };

    if (dailyPerformance && dailyPerformance.length > 0) {
        dailyPerformance.sort((a, b) => b.changePercent - a.changePercent);
        const highestDay = dailyPerformance[0];
        const lowestDay = dailyPerformance.length > 1 ? dailyPerformance[dailyPerformance.length - 1] : highestDay;
        dayContainer.innerHTML = createHtml(highestDay) + createHtml(lowestDay);
    } else {
        dayContainer.innerHTML = createHtml(null) + createHtml(null);
    }

    if (historicalPerformance && historicalPerformance.length > 0) {
        historicalPerformance.sort((a, b) => b.changePercent - a.changePercent);
        const highestHistory = historicalPerformance[0];
        const lowestHistory = historicalPerformance.length > 1 ? historicalPerformance[historicalPerformance.length - 1] : highestHistory;
        historyContainer.innerHTML = createHtml(highestHistory) + createHtml(lowestHistory);
    } else {
        historyContainer.innerHTML = createHtml(null) + createHtml(null);
    }
}


/**
 * Renderiza a aba de Ações.
 */
export async function renderAcoesCarteira(lancamentos, proventos, precosEInfos) {
    const acoesListaDiv = document.getElementById("acoes-lista");
    if (!acoesListaDiv) return;

    acoesListaDiv.innerHTML = `<p>Calculando e buscando cotações...</p>`;

    const acoesLancamentos = lancamentos.filter(l => l.tipoAtivo === 'Ações');

    if (acoesLancamentos.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação lançada ainda.</p>`;
        document.getElementById("acoes-valorization-reais").textContent = "N/A";
        document.getElementById("acoes-valorization-percent").innerHTML = "";
        document.getElementById("acoes-total-investido").textContent = "R$ 0,00";
        document.getElementById("acoes-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("acoes-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("acoes-valorizacao-percent").textContent = "0,00%";
        document.getElementById("acoes-rentabilidade-percent").textContent = "0,00%";
        renderAcoesHighlights([], []);
        return;
    }

    const carteira = {};
    acoesLancamentos.forEach(l => {
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
        if (p.tipoAtivo === 'Ações' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    const tickers = Object.keys(carteira)
        .filter(ticker => ticker && carteira[ticker].quantidade > 0)
        .sort((a, b) => a.localeCompare(b));

    if (tickers.length === 0) {
        acoesListaDiv.innerHTML = `<p>Nenhuma Ação com posição em carteira.</p>`;
        renderAcoesHighlights([], []);
        return;
    }

    try {
        const precosAtuais = precosEInfos || {};

        const { dailyPerformance, precosDiaAnterior } = await renderAcoesDayValorization(tickers, carteira, precosAtuais);

        const historicalPerformance = [];

        renderAcoesSummary(carteira, precosAtuais);

        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker]?.price || 0;
            const logoUrl = precosAtuais[ticker]?.logoUrl;
            let logoHtml;

            if (logoUrl) {
                logoHtml = `<img src="${logoUrl}" alt="${ativo.ativo}" class="ativo-logo" style="width: 40px; height: 40px;">`;
            } else {
                logoHtml = `<div class="ativo-logo-fallback" style="width: 40px; height: 40px; font-size: 18px;"><i class="fas fa-chart-line"></i></div>`;
            }

            const precoOntem = precosDiaAnterior[ticker] || precoAtual;
            const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;
            const valorPosicaoAtual = precoAtual * ativo.quantidade;
            const valorInvestido = precoMedio * ativo.quantidade;

            const variacaoReais = valorPosicaoAtual - valorInvestido;
            const variacaoPercent = valorInvestido > 0 ? (variacaoReais / valorInvestido) * 100 : 0;

            const rentabilidadeReais = variacaoReais + ativo.proventos;
            const rentabilidadePercent = valorInvestido > 0 ? (rentabilidadeReais / valorInvestido) * 100 : 0;

            const variacaoDiaReais = (precoAtual - precoOntem) * ativo.quantidade;
            const variacaoDiaPercent = precoOntem > 0 ? ((precoAtual - precoOntem) / precoOntem) * 100 : 0;

            historicalPerformance.push({ ticker, changePercent: variacaoPercent });

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Ações">
                    <div class="asset-card-header" style="width: 100%; justify-content: center;">
                        ${logoHtml}
                        <div class="asset-card-ticker-info">
                            <div class="ticker" style="font-size: 1.15rem;">${ativo.ativo}</div>
                            <div class="tipo">Ações</div>
                        </div>
                    </div>
                    
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
                        <div class="detail-item">
                            <span>Variação (Dia)</span>
                            <span class="${variacaoDiaReais >= 0 ? 'positive-change' : 'negative-change'}">
                                ${variacaoDiaReais >= 0 ? '+' : ''}${variacaoDiaReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacaoDiaPercent.toFixed(2)}%)
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        acoesListaDiv.innerHTML = html;
        renderAcoesHighlights(dailyPerformance, historicalPerformance);

    } catch (error) {
        console.error("Erro ao renderizar carteira de Ações:", error);
        acoesListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

document.getElementById("acoes-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});