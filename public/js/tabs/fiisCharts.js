let tipoChart = null;
let riscoChart = null;
let especieChart = null;

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        x: {
            grid: { display: false },
            ticks: { color: "#a0a7b3" }
        },
        y: {
            grid: { color: "#2a2c30" },
            ticks: {
                color: "#a0a7b3",
                callback: value => value + '%'
            },
            min: 0,
            max: 100
        }
    },
    plugins: {
        legend: {
            position: 'top',
            align: 'end',
            labels: {
                color: '#a0a7b3',
                usePointStyle: true,
                boxWidth: 8
            }
        },
        tooltip: {
            callbacks: {
                label: context => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`
            }
        }
    }
};

function getBarColors(atuais, ideais) {
    return atuais.map((atual, index) => {
        const ideal = ideais[index];
        if (ideal === 0 && atual > 0) return '#f56565'; // Vermelho se tem algo que não deveria ter

        const bandaSuperior = ideal * 1.25;
        const bandaInferior = ideal * 0.75;

        return (atual >= bandaInferior && atual <= bandaSuperior) ? '#00d9c3' : '#f56565';
    });
}

function renderSingleChart(canvasId, chartInstance, title, labels, dataAtual, dataIdeal) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const container = canvas.parentElement;
    if (dataAtual.every(d => d === 0) && dataIdeal.every(d => d === 0)) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const barColors = getBarColors(dataAtual, dataIdeal);

    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Posição Atual',
            data: dataAtual,
            backgroundColor: barColors,
            borderRadius: 4
        }, {
            label: 'Posição Ideal',
            data: dataIdeal,
            backgroundColor: '#3a404d',
            borderRadius: 4
        }]
    };

    if (chartInstance) chartInstance.destroy();

    return new Chart(canvas, {
        type: 'bar',
        data: chartData,
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                title: {
                    display: true,
                    text: title,
                    color: '#e0e0e0',
                    font: { size: 16, weight: '600' }
                }
            }
        }
    });
}

export function renderDivisaoFiisCharts(divisaoAtual, divisaoIdeal) {
    if (!divisaoAtual || !divisaoIdeal) return;

    // Gráfico por Tipo
    const labelsTipo = ['Tijolo', 'Papel'];
    const dataAtualTipo = [divisaoAtual.tipo.Tijolo, divisaoAtual.tipo.Papel];
    const dataIdealTipo = [divisaoIdeal['tipo-tijolo'], divisaoIdeal['tipo-papel']];
    tipoChart = renderSingleChart('divisao-tipo-chart', tipoChart, 'Divisão por Tipo', labelsTipo, dataAtualTipo, dataIdealTipo);

    // Gráfico por Risco
    const labelsRisco = ['Arrojado', 'Crescimento', 'Ancoragem'];
    const dataAtualRisco = [divisaoAtual.risco.Arrojado, divisaoAtual.risco.Crescimento, divisaoAtual.risco.Ancoragem];
    const dataIdealRisco = [divisaoIdeal['risco-arrojado'], divisaoIdeal['risco-crescimento'], divisaoIdeal['risco-ancoragem']];
    riscoChart = renderSingleChart('divisao-risco-chart', riscoChart, 'Divisão por Risco', labelsRisco, dataAtualRisco, dataIdealRisco);

    // Gráfico por Espécie (combina Tijolo e Papel)
    const labelsEspecie = ['Lajes Corp.', 'Shoppings', 'Logística', 'Outros', 'CDI', 'IPCA'];
    const dataAtualEspecie = [
        divisaoAtual.especieTijolo['Lajes corporativas'],
        divisaoAtual.especieTijolo['Shoppings e centros comerciais'],
        divisaoAtual.especieTijolo['Logística e galpões industriais'],
        divisaoAtual.especieTijolo['Outros'],
        divisaoAtual.especiePapel['Atrelado ao CDI'],
        divisaoAtual.especiePapel['Atrelado ao IPCA']
    ];
    const dataIdealEspecie = [
        divisaoIdeal['tijolo-lajes'],
        divisaoIdeal['tijolo-shoppings'],
        divisaoIdeal['tijolo-logistica'],
        divisaoIdeal['tijolo-outros'],
        divisaoIdeal['papel-cdi'],
        divisaoIdeal['papel-ipca']
    ];
    especieChart = renderSingleChart('divisao-especie-chart', especieChart, 'Divisão por Espécie', labelsEspecie, dataAtualEspecie, dataIdealEspecie);
}