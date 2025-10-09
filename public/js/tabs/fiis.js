import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
import { renderDivisaoFiisCharts } from './fiisCharts.js';
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
            console.warn(`[FIIs] Nenhum registro de preço de dias anteriores encontrado.`);
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
        console.error("[FIIs] Erro ao buscar preços do dia anterior:", error);
        return {};
    }
}


/**
 * Calcula e renderiza a valorização do dia para a carteira de FIIs.
 * @param {Array<string>} tickers - A lista de tickers de FIIs na carteira.
 * @param {object} carteira - O objeto da carteira consolidada.
 * @param {object} precosAtuais - Objeto com os preços atuais para os tickers (intraday).
 * @returns {Promise<object>} - Retorna uma lista com a performance diária de cada FII e os preços do dia anterior.
 */
async function renderFiisDayValorization(tickers, carteira, precosAtuais) {
    const valorizationReaisDiv = document.getElementById("fiis-valorization-reais");
    const valorizationPercentDiv = document.getElementById("fiis-valorization-percent");

    if (!valorizationReaisDiv || !valorizationPercentDiv) return { dailyPerformance: [], precosDiaAnterior: {} };

    valorizationReaisDiv.textContent = "Calculando...";
    valorizationPercentDiv.innerHTML = "";
    valorizationPercentDiv.className = 'valorization-pill';

    try {
        const precosDiaAnterior = await fetchPreviousDayPrices(auth.currentUser.uid, tickers);

        let patrimonioTotalHoje = 0;
        let patrimonioTotalOntem = 0;
        const dailyPerformance = [];
        let hasPreviousDayData = false;

        tickers.forEach(ticker => {
            const ativo = carteira[ticker];
            const precoHoje = precosAtuais[ticker]?.price;
            const precoOntem = precosDiaAnterior[ticker];

            if (ativo && ativo.quantidade > 0) {
                if (precoHoje) {
                    patrimonioTotalHoje += ativo.quantidade * precoHoje;
                }
                if (precoOntem) {
                    patrimonioTotalOntem += ativo.quantidade * precoOntem;
                    hasPreviousDayData = true;
                }

                if (precoHoje && precoOntem > 0) {
                    dailyPerformance.push({ ticker, changePercent: ((precoHoje / precoOntem) - 1) * 100 });
                }
            }
        });

        if (!hasPreviousDayData || patrimonioTotalOntem <= 0) {
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
        console.error("Erro ao calcular a valorização do dia para FIIs:", error);
        valorizationReaisDiv.textContent = "Erro";
        return { dailyPerformance: [], precosDiaAnterior: {} };
    }
}

function renderFiisSummary(carteira, precosAtuais) {
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
            if (id === 'fiis-total-investido' || id === 'fiis-patrimonio-atual') {
                element.style.color = '#e0e0e0';
            }
        }
    };

    updateField('fiis-total-investido', totalInvestido);
    updateField('fiis-patrimonio-atual', patrimonioAtual);
    updateField('fiis-rentabilidade-reais', rentabilidadeReais, true, true);
    updateField('fiis-valorizacao-percent', valorizacaoPercent, false, true);
    updateField('fiis-rentabilidade-percent', rentabilidadePercent, false, true);
}

function renderFiisHighlights(dailyPerformance, historicalPerformance) {
    const dayContainer = document.getElementById("fiis-highlights-day");
    const historyContainer = document.getElementById("fiis-highlights-history");

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

export async function renderFiisCarteira(lancamentos, proventos, classificacoes, divisaoIdeal) {
    const fiisListaDiv = document.getElementById("fiis-lista");
    if (!fiisListaDiv) return;

    fiisListaDiv.innerHTML = `<p>Calculando e buscando cotações, isso pode levar alguns segundos...</p>`;

    const fiisLancamentos = lancamentos.filter(l => l.tipoAtivo === 'FIIs');

    if (fiisLancamentos.length === 0) {
        fiisListaDiv.innerHTML = `<p>Nenhum FII lançado ainda.</p>`;
        renderDivisaoFiisCharts(null, null);
        document.getElementById("fiis-valorization-reais").textContent = "N/A";
        document.getElementById("fiis-valorization-percent").innerHTML = "";
        document.getElementById("fiis-valorization-percent").className = 'valorization-pill';
        document.getElementById("fiis-total-investido").textContent = "R$ 0,00";
        document.getElementById("fiis-patrimonio-atual").textContent = "R$ 0,00";
        document.getElementById("fiis-rentabilidade-reais").textContent = "R$ 0,00";
        document.getElementById("fiis-valorizacao-percent").textContent = "0,00%";
        document.getElementById("fiis-rentabilidade-percent").textContent = "0,00%";
        renderFiisHighlights([], []);
        return;
    }

    const carteira = {};
    fiisLancamentos.forEach(l => {
        if (!carteira[l.ativo]) {
            carteira[l.ativo] = { ativo: l.ativo, quantidade: 0, quantidadeComprada: 0, valorTotalInvestido: 0, proventos: 0, };
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
        if (p.tipoAtivo === 'FIIs' && carteira[p.ativo]) {
            carteira[p.ativo].proventos += p.valor;
        }
    });

    const tickers = Object.keys(carteira)
        .filter(ticker => ticker && carteira[ticker].quantidade > 0)
        .sort((a, b) => a.localeCompare(b));

    if (tickers.length === 0) {
        fiisListaDiv.innerHTML = `<p>Nenhum FII com posição em carteira.</p>`;
        renderDivisaoFiisCharts(null, null);
        renderFiisHighlights([], []);
        return;
    }

    try {
        const precosAtuais = await fetchCurrentPrices(tickers);
        const { dailyPerformance, precosDiaAnterior } = await renderFiisDayValorization(tickers, carteira, precosAtuais);
        const historicalPerformance = [];

        renderFiisSummary(carteira, precosAtuais);
        let totalValorFiis = 0;
        const valoresAtuais = {
            tipo: { 'Tijolo': 0, 'Papel': 0 },
            risco: { 'Arrojado': 0, 'Crescimento': 0, 'Ancoragem': 0 },
            especieTijolo: { 'Lajes corporativas': 0, 'Shoppings e centros comerciais': 0, 'Logística e galpões industriais': 0, 'Outros': 0 },
            especiePapel: { 'Atrelado ao CDI': 0, 'Atrelado ao IPCA': 0 }
        };

        const html = tickers.map(ticker => {
            const ativo = carteira[ticker];
            const precoAtual = precosAtuais[ticker]?.price || 0;
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
            totalValorFiis += valorPosicaoAtual;

            const classif = classificacoes[ticker]?.classificacoes;
            if (classif) {
                if (classif['Tipo FII'] === 'Tijolo') valoresAtuais.tipo.Tijolo += valorPosicaoAtual;
                if (classif['Tipo FII'] === 'Papel') valoresAtuais.tipo.Papel += valorPosicaoAtual;
                if (classif['Risco FII'] in valoresAtuais.risco) { valoresAtuais.risco[classif['Risco FII']] += valorPosicaoAtual; }
                if (classif['Tipo FII'] === 'Tijolo') {
                    const especie = classif['Espécie'];
                    if (valoresAtuais.especieTijolo.hasOwnProperty(especie)) { valoresAtuais.especieTijolo[especie] += valorPosicaoAtual; }
                    else { valoresAtuais.especieTijolo['Outros'] += valorPosicaoAtual; }
                } else if (classif['Tipo FII'] === 'Papel') {
                    if (valoresAtuais.especiePapel.hasOwnProperty(classif['Espécie'])) { valoresAtuais.especiePapel[classif['Espécie']] += valorPosicaoAtual; }
                }
            }

            return `
                <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="FIIs">
                    <div class="fii-card-ticker">
                        <i class="fas fa-building"></i> ${ativo.ativo}
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
                        <div class="detail-item"><span>Valor Investido</span><span>${valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Quantidade</span><span>${ativo.quantidade.toLocaleString('pt-BR')}</span></div>
                        <div class="detail-item"><span>Preço Médio</span><span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Preço Atual</span><span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        <div class="detail-item"><span>Total Proventos</span><span>${ativo.proventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
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

        fiisListaDiv.innerHTML = html;
        renderFiisHighlights(dailyPerformance, historicalPerformance);
        const divisaoAtualPercentual = JSON.parse(JSON.stringify(valoresAtuais));
        if (totalValorFiis > 0) {
            for (const categoria in divisaoAtualPercentual) {
                for (const subcat in divisaoAtualPercentual[categoria]) {
                    divisaoAtualPercentual[categoria][subcat] = (valoresAtuais[categoria][subcat] / totalValorFiis) * 100;
                }
            }
        }
        renderDivisaoFiisCharts(divisaoAtualPercentual, divisaoIdeal);
    } catch (error) {
        console.error("Erro ao renderizar carteira de FIIs:", error);
        fiisListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
    }
}

document.getElementById("fiis-lista").addEventListener("click", (e) => {
    const card = e.target.closest(".fii-card");
    if (card && card.dataset.ticker && window.openAtivoDetalhesModal) {
        window.openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
    }
});