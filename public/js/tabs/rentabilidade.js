// public/js/tabs/rentabilidade.js

import { fetchCurrentPrices, fetchHistoricalData } from '../api/brapi.js';
import { fetchIndexers } from '../api/bcb.js';
import { renderConsolidatedPerformanceChart } from '../charts.js';
import { db, auth } from '../firebase-config.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- ESTADO GLOBAL DO MÓDULO ---
let dailyVariationChart = null;
let allHistoricoPatrimonio = []; // Cache para os dados do histórico

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---
const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const updateRentabilidadeField = (percentId, reaisId, percentValue, reaisValue) => {
    const percentEl = document.getElementById(percentId);
    const reaisEl = document.getElementById(reaisId);
    const value = percentValue || 0;
    if (percentEl) {
        percentEl.textContent = `${value.toFixed(2)}%`;
        percentEl.style.color = value >= 0 ? '#00d9c3' : '#ef4444';
    }
    if (reaisEl) {
        reaisEl.textContent = formatCurrency(reaisValue || 0);
    }
};

const getPriceOnDate = (historicalData, targetDate) => {
    if (!historicalData || !historicalData.results || !historicalData.results[0]?.historicalDataPrice) return null;
    const prices = historicalData.results[0].historicalDataPrice;
    const targetTimestamp = targetDate.getTime() / 1000;
    for (const price of prices) {
        if (price.date <= targetTimestamp) return price.close;
    }
    return prices.length > 0 ? prices[prices.length - 1].close : null;
};


// --- FUNÇÕES PARA O GRÁFICO DE VARIAÇÃO ---

async function fetchHistoricoPatrimonio(intervalo) {
    if (!auth.currentUser || (allHistoricoPatrimonio.length > 0 && intervalo !== 'Anual')) return;
    try {
        const hoje = new Date();
        const dataFiltro = new Date();
        if (intervalo === 'Anual') {
            dataFiltro.setFullYear(hoje.getFullYear() - 5);
        } else if (intervalo === 'Mensal') {
            dataFiltro.setFullYear(hoje.getFullYear() - 1);
        } else {
            dataFiltro.setDate(hoje.getDate() - 35);
        }
        const dataFiltroStr = dataFiltro.toISOString().split('T')[0];
        const q = query(
            collection(db, "historicoPatrimonioDiario"),
            where("userID", "==", auth.currentUser.uid),
            where("data", ">=", dataFiltroStr),
            orderBy("data", "asc")
        );
        const querySnapshot = await getDocs(q);
        allHistoricoPatrimonio = querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Erro ao buscar histórico de patrimônio:", error);
        allHistoricoPatrimonio = [];
    }
}

/**
 * --- FUNÇÃO ATUALIZADA ---
 * Processa os dados para calcular a variação por período, agora separando por tipo de ativo.
 */
function processarVariacaoDiaria(tipoAtivoFiltro, intervalo) {
    const patrimonioPorDia = allHistoricoPatrimonio.reduce((acc, registro) => {
        const { data, tipoAtivo, valorPatrimonio } = registro;
        if (!acc[data]) {
            acc[data] = { total: 0, 'Ações': 0, 'FIIs': 0, 'ETF': 0, 'Cripto': 0, 'Renda Fixa': 0 };
        }
        if (acc[data][tipoAtivo] !== undefined) {
             acc[data][tipoAtivo] += valorPatrimonio;
        }
        acc[data].total += valorPatrimonio;
        return acc;
    }, {});

    let dadosAgregados = {};
    const sortedDates = Object.keys(patrimonioPorDia).sort();
    
    if (intervalo === 'Diário') {
        dadosAgregados = patrimonioPorDia;
    } else {
        const getKey = (date) => intervalo === 'Mensal' ? date.substring(0, 7) : date.substring(0, 4);
        sortedDates.forEach(date => {
            const key = getKey(date);
            dadosAgregados[key] = patrimonioPorDia[date];
        });
    }

    const sortedKeys = Object.keys(dadosAgregados).sort();
    const labels = [];
    const assetTypes = ['Ações', 'FIIs', 'ETF', 'Cripto', 'Renda Fixa'];
    const variacoes = {
        'Ações': [], 'FIIs': [], 'ETF': [], 'Cripto': [], 'Renda Fixa': [], totalReais: [], totalPercent: []
    };

    for (let i = 1; i < sortedKeys.length; i++) {
        const keyAtual = sortedKeys[i];
        const keyAnterior = sortedKeys[i - 1];
        
        const valorTotalAnterior = dadosAgregados[keyAnterior].total;
        
        if (valorTotalAnterior > 0) {
            let label;
            if (intervalo === 'Diário') {
                label = new Date(keyAtual + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            } else if (intervalo === 'Mensal') {
                const [year, month] = keyAtual.split('-');
                label = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            } else {
                label = keyAtual;
            }
            labels.push(label);

            let variacaoTotalDia = 0;
            assetTypes.forEach(tipo => {
                const valorAtual = dadosAgregados[keyAtual][tipo] || 0;
                const valorAnterior = dadosAgregados[keyAnterior][tipo] || 0;
                const variacao = valorAtual - valorAnterior;
                variacoes[tipo].push(variacao);
                variacaoTotalDia += variacao;
            });
            
            variacoes.totalReais.push(variacaoTotalDia);
            variacoes.totalPercent.push((variacaoTotalDia / valorTotalAnterior) * 100);
        }
    }

    return { labels, variacoes };
}

/**
 * --- FUNÇÃO ATUALIZADA ---
 * Renderiza o gráfico, agora com lógica para ser simples ou empilhado.
 */
async function renderVariacaoDiariaChart() {
    const canvas = document.getElementById('daily-variation-chart');
    if (!canvas) return;

    const filtroAtivo = document.getElementById('daily-variation-asset-filter').value;
    const filtroIntervaloBtn = document.querySelector("#daily-variation-interval-filter .filter-btn.active");
    const filtroIntervalo = filtroIntervaloBtn ? filtroIntervaloBtn.dataset.intervalo : 'Diário';

    await fetchHistoricoPatrimonio(filtroIntervalo);

    const { labels, variacoes } = processarVariacaoDiaria(filtroAtivo, filtroIntervalo);
    
    const titleEl = canvas.closest('.performance-box').querySelector('h3');
    if (titleEl) {
        const periodos = { 'Diário': '30 dias', 'Mensal': '12 meses', 'Anual': 'últimos anos' };
        titleEl.textContent = `Variação ${filtroIntervalo} do Patrimônio (${periodos[filtroIntervalo]})`;
    }

    if (dailyVariationChart) {
        dailyVariationChart.destroy();
    }
    
    const isConsolidado = filtroAtivo === 'Todos';
    let datasets = [];
    
    if (isConsolidado) {
        const colors = {
            'Ações': { bg: 'rgba(0, 217, 195, 0.8)', bd: '#00d9c3' },
            'FIIs': { bg: 'rgba(90, 103, 216, 0.8)', bd: '#5A67D8' },
            'ETF': { bg: 'rgba(237, 100, 166, 0.8)', bd: '#ED64A6' },
            'Cripto': { bg: 'rgba(236, 201, 75, 0.8)', bd: '#ECC94B' },
            'Renda Fixa': { bg: 'rgba(160, 167, 179, 0.8)', bd: '#a0a7b3' }
        };
        
        datasets = Object.keys(colors).map(tipo => ({
            label: tipo,
            data: variacoes[tipo].slice(-30),
            backgroundColor: colors[tipo].bg,
            borderColor: colors[tipo].bd,
            borderWidth: 1,
            borderRadius: 2
        }));

    } else {
        const data = variacoes[filtroAtivo].slice(-30);
        datasets.push({
            label: 'Variação em R$',
            data: data,
            backgroundColor: data.map(v => v >= 0 ? 'rgba(0, 217, 195, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
            borderColor: data.map(v => v >= 0 ? '#00d9c3' : '#ef4444'),
            borderWidth: 1,
            borderRadius: 4
        });
    }

    dailyVariationChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.slice(-30),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: isConsolidado, grid: { display: false }, ticks: { color: "#a0a7b3" } },
                y: { stacked: isConsolidado, grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: (value) => formatCurrency(value) } }
            },
            plugins: {
                legend: { display: isConsolidado, position: 'bottom', labels: { color: '#a0a7b3' } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const valorReal = context.raw;
                            return `${context.dataset.label}: ${formatCurrency(valorReal)}`;
                        },
                        footer: function(tooltipItems) {
                             if (!isConsolidado) return;
                             let sum = 0;
                             tooltipItems.forEach(function(tooltipItem) {
                                 sum += tooltipItem.raw;
                             });
                             const index = tooltipItems[0].dataIndex;
                             const percent = variacoes.totalPercent.slice(-30)[index];
                             return `Total: ${formatCurrency(sum)} (${percent.toFixed(2)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Inicializa os listeners para os filtros
document.addEventListener('DOMContentLoaded', () => {
    const assetFilter = document.getElementById('daily-variation-asset-filter');
    if (assetFilter) {
        assetFilter.addEventListener('change', renderVariacaoDiariaChart);
    }
    const intervalFilter = document.getElementById('daily-variation-interval-filter');
    if (intervalFilter) {
        intervalFilter.addEventListener('click', (e) => {
            if (e.target.matches('.filter-btn')) {
                intervalFilter.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                renderVariacaoDiariaChart();
            }
        });
    }
});


/**
 * Função principal que calcula e renderiza todos os cards da aba de Rentabilidade.
 */
export async function renderRentabilidadeTab(lancamentos, proventos, summaryData) {
    const rentabilidadePane = document.getElementById('rentabilidade');
    if (!rentabilidadePane) return;
    
    // ... (lógica inicial de reset dos campos) ...

    if (!lancamentos || lancamentos.length === 0 || !summaryData) {
        renderConsolidatedPerformanceChart(lancamentos, proventos); 
        if (dailyVariationChart) dailyVariationChart.destroy();
        return;
    }
    
    // ... (toda a lógica de cálculo dos cards de rentabilidade permanece a mesma) ...
    
    // --- Renderiza os gráficos ---
    renderConsolidatedPerformanceChart(lancamentos, proventos);
    renderVariacaoDiariaChart();
}