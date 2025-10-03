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


// --- NOVAS FUNÇÕES PARA O GRÁFICO DE VARIAÇÃO ---

/**
 * Busca e armazena em cache o histórico de patrimônio diário do Firestore.
 * A busca agora é mais longa para acomodar a visão anual.
 */
async function fetchHistoricoPatrimonio(intervalo) {
    if (!auth.currentUser || (allHistoricoPatrimonio.length > 0 && intervalo !== 'Anual')) return;

    try {
        const hoje = new Date();
        const dataFiltro = new Date();
        
        // Define o período de busca com base no intervalo para otimizar
        if (intervalo === 'Anual') {
            dataFiltro.setFullYear(hoje.getFullYear() - 5); // Busca até 5 anos
        } else if (intervalo === 'Mensal') {
            dataFiltro.setFullYear(hoje.getFullYear() - 1); // Busca 1 ano
        } else {
            dataFiltro.setDate(hoje.getDate() - 35); // Busca 35 dias para garantir 30 variações
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
 * Processa os dados históricos para calcular a variação diária, mensal ou anual.
 */
function processarVariacaoDiaria(tipoAtivoFiltro, intervalo) {
    // 1. Agrega o patrimônio total por dia
    const patrimonioPorDia = allHistoricoPatrimonio.reduce((acc, registro) => {
        const { data, tipoAtivo, valorPatrimonio } = registro;
        if (!acc[data]) {
            acc[data] = { total: 0, Ações: 0, FIIs: 0, ETF: 0, Cripto: 0, 'Renda Fixa': 0 };
        }
        if (acc[data][tipoAtivo] !== undefined) {
            acc[data][tipoAtivo] += valorPatrimonio;
        }
        acc[data].total += valorPatrimonio;
        return acc;
    }, {});

    // 2. Agrega os dados por período (mês ou ano), se necessário
    let dadosAgregados = {};
    const sortedDates = Object.keys(patrimonioPorDia).sort();
    
    if (intervalo === 'Diário') {
        dadosAgregados = patrimonioPorDia;
    } else { // Mensal ou Anual
        const getKey = (date) => intervalo === 'Mensal' 
            ? date.substring(0, 7) // 'YYYY-MM'
            : date.substring(0, 4); // 'YYYY'

        sortedDates.forEach(date => {
            const key = getKey(date);
            // Salva apenas o último valor do período
            dadosAgregados[key] = patrimonioPorDia[date];
        });
    }

    // 3. Calcula a variação entre os períodos
    const sortedKeys = Object.keys(dadosAgregados).sort();
    const labels = [];
    const variacoesReais = [];
    const variacoesPercent = [];

    for (let i = 1; i < sortedKeys.length; i++) {
        const keyAtual = sortedKeys[i];
        const keyAnterior = sortedKeys[i - 1];

        const valorAtual = tipoAtivoFiltro === 'Todos' ? dadosAgregados[keyAtual].total : dadosAgregados[keyAtual][tipoAtivoFiltro] || 0;
        const valorAnterior = tipoAtivoFiltro === 'Todos' ? dadosAgregados[keyAnterior].total : dadosAgregados[keyAnterior][tipoAtivoFiltro] || 0;

        if (valorAnterior > 0) {
            const variacao = valorAtual - valorAnterior;
            const percentual = (variacao / valorAnterior) * 100;
            
            let label;
            if (intervalo === 'Diário') {
                label = new Date(keyAtual + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            } else if (intervalo === 'Mensal') {
                const [year, month] = keyAtual.split('-');
                label = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            } else { // Anual
                label = keyAtual;
            }

            labels.push(label);
            variacoesReais.push(variacao);
            variacoesPercent.push(percentual);
        }
    }

    return { labels, variacoesReais, variacoesPercent };
}

/**
 * Renderiza ou atualiza o gráfico de variação diária.
 */
async function renderVariacaoDiariaChart() {
    const canvas = document.getElementById('daily-variation-chart');
    if (!canvas) return;

    const filtroAtivo = document.getElementById('daily-variation-asset-filter').value;
    const filtroIntervaloBtn = document.querySelector("#daily-variation-interval-filter .filter-btn.active");
    const filtroIntervalo = filtroIntervaloBtn ? filtroIntervaloBtn.dataset.intervalo : 'Diário';

    // Garante que temos dados suficientes para o período selecionado
    await fetchHistoricoPatrimonio(filtroIntervalo);

    const { labels, variacoesReais, variacoesPercent } = processarVariacaoDiaria(filtroAtivo, filtroIntervalo);
    
    // Atualiza o título do gráfico dinamicamente
    const titleEl = canvas.closest('.performance-box').querySelector('h3');
    if (titleEl) {
        const periodos = { 'Diário': '30 dias', 'Mensal': '12 meses', 'Anual': 'últimos anos' };
        titleEl.textContent = `Variação ${filtroIntervalo} do Patrimônio (${periodos[filtroIntervalo]})`;
    }

    if (dailyVariationChart) {
        dailyVariationChart.destroy();
    }

    dailyVariationChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.slice(-30), // Limita a exibição para não poluir o gráfico
            datasets: [{
                label: 'Variação em R$',
                data: variacoesReais.slice(-30),
                backgroundColor: variacoesReais.slice(-30).map(v => v >= 0 ? 'rgba(0, 217, 195, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                borderColor: variacoesReais.slice(-30).map(v => v >= 0 ? '#00d9c3' : '#ef4444'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: "#a0a7b3" } },
                y: { grid: { color: "#2a2c30" }, ticks: { color: "#a0a7b3", callback: (value) => formatCurrency(value) } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const index = context.dataIndex;
                            const valorReal = variacoesReais.slice(-30)[index];
                            const valorPercent = variacoesPercent.slice(-30)[index];
                            return `${formatCurrency(valorReal)} (${valorPercent.toFixed(2)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Inicializa os listeners para os filtros do novo gráfico
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
    // ... (o início da função permanece o mesmo, calculando os cards de rentabilidade)
    const rentabilidadePane = document.getElementById('rentabilidade');
    if (!rentabilidadePane) return;
    updateRentabilidadeField('rentabilidade-acumulada-percent', 'rentabilidade-acumulada-reais', 0, 0);
    // ... etc ...

    if (!lancamentos || lancamentos.length === 0 || !summaryData) {
        renderConsolidatedPerformanceChart(lancamentos, proventos); 
        if (dailyVariationChart) dailyVariationChart.destroy();
        return;
    }
    
    // ... (toda a lógica de cálculo dos cards de rentabilidade) ...
    
    // --- Renderiza os gráficos ---
    renderConsolidatedPerformanceChart(lancamentos, proventos);
    
    // --- RENDERIZA O NOVO GRÁFICO DE VARIAÇÃO ---
    renderVariacaoDiariaChart();
}