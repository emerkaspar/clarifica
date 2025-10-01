// public/js/tabs/calculos.js
import { db } from '../firebase-config.js';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- ELEMENTOS DO FORMULÁRIO E RESULTADOS (GERAL) ---
const salvarCalculoModal = document.getElementById('salvar-calculo-modal');
const formSalvarCalculo = document.getElementById('form-salvar-calculo');
const salvarTituloInput = document.getElementById('salvar-titulo');
const salvarNotasInput = document.getElementById('salvar-notas');

const calculosSalvosModal = document.getElementById('calculos-salvos-modal');
const btnVerSalvos = document.getElementById('btn-ver-salvos');
const searchSavedCalcInput = document.getElementById('search-saved-calc');
const calculosSalvosListaDiv = document.getElementById('calculos-salvos-lista');

let currentPegCalculations = {}; 
let currentTetoCalculations = {};
let allSavedCalculations = []; 
let calculationTypeToSave = ''; // 'PEG_RATIO' ou 'TETO_PROJETIVO'


// --- CALCULADORA: TETO PROJETIVO ---
function initializeTetoProjetivoCalculator() {
    const formTeto = document.getElementById('teto-projetivo-form');
    if (!formTeto) return;

    const tickerTetoInput = document.getElementById('teto-ticker');
    const payoutInput = document.getElementById('teto-payout');
    const lucroProjetivoInput = document.getElementById('teto-lucro-projetivo');
    const yieldMinimoInput = document.getElementById('teto-yield-minimo');
    const cotacaoAtualInput = document.getElementById('teto-cotacao-atual');
    const quantidadePapeisInput = document.getElementById('teto-quantidade-papeis');

    const lpaResultEl = document.getElementById('teto-lpa-projetivo');
    const dpaResultEl = document.getElementById('teto-dpa-projetivo');
    const yieldProjetivoResultEl = document.getElementById('teto-yield-projetivo');
    const precoJustoResultEl = document.getElementById('teto-preco-justo');
    const margemSegurancaResultEl = document.getElementById('teto-margem-seguranca');
    
    const btnReiniciar = document.getElementById('btn-reiniciar-teto');
    const btnSalvarTeto = document.getElementById('btn-salvar-teto-projetivo');

    const parseValue = (value) => {
        if (!value || typeof value !== 'string') return 0;
        return parseFloat(value.replace('R$', '').replace(/\./g, '').replace('%', '').replace(',', '.')) || 0;
    };
    const formatToCurrency = (value) => (typeof value === 'number' && !isNaN(value)) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
    const formatToPercent = (value) => (typeof value === 'number' && !isNaN(value)) ? `${value.toFixed(2).replace('.', ',')}%` : '0,00%';

    const formatInteger = (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            input.value = BigInt(value).toLocaleString('pt-BR');
        } else {
            input.value = '';
        }
    };

    const formatCurrencyDecimal = (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            let numberValue = parseInt(value, 10) / 100;
            input.value = numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            input.value = '';
        }
    };
    
    const formatPercentage = (input) => {
        let value = input.value.replace(/[^0-9,]/g, '').replace(',', '.');
        if (value && !isNaN(parseFloat(value))) {
            input.value = parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';
        } else if (input.value.trim() === '') {
            input.value = '';
        }
    };

    function clearTetoResults() {
        lpaResultEl.textContent = 'R$ 0,00';
        dpaResultEl.textContent = 'R$ 0,00';
        yieldProjetivoResultEl.textContent = '0,00%';
        precoJustoResultEl.textContent = 'R$ 0,00';
        margemSegurancaResultEl.textContent = '0,00%';
        margemSegurancaResultEl.style.color = '#e0e0e0';
        currentTetoCalculations = {};
    }

    function resetTetoCalculator() {
        formTeto.reset();
        clearTetoResults();
    }

    function calculateTeto() {
        const inputs = {
            ticker: tickerTetoInput.value,
            payout: parseValue(payoutInput.value),
            lucro_projetivo: parseValue(lucroProjetivoInput.value),
            yield_minimo: parseValue(yieldMinimoInput.value),
            cotacao_atual: parseValue(cotacaoAtualInput.value),
            quantidade_papeis: parseValue(quantidadePapeisInput.value)
        };

        if (inputs.quantidade_papeis === 0 || inputs.cotacao_atual === 0 || inputs.yield_minimo === 0) {
            clearTetoResults();
            return;
        }
        
        const lpaProjetivo = inputs.lucro_projetivo / inputs.quantidade_papeis;
        const dpaProjetivo = lpaProjetivo * (inputs.payout / 100);
        const yieldProjetivo = (dpaProjetivo / inputs.cotacao_atual) * 100;
        const precoJusto = dpaProjetivo / (inputs.yield_minimo / 100);
        const margemSeguranca = inputs.cotacao_atual > 0 ? ((precoJusto - inputs.cotacao_atual) / inputs.cotacao_atual) * 100 : 0;
        
        const resultados = {
            lpa_projetivo: lpaProjetivo,
            dpa_projetivo: dpaProjetivo,
            yield_projetivo: yieldProjetivo,
            preco_justo: precoJusto,
            margem_seguranca: margemSeguranca
        };

        currentTetoCalculations = { inputs, resultados };

        lpaResultEl.textContent = formatToCurrency(lpaProjetivo);
        dpaResultEl.textContent = formatToCurrency(dpaProjetivo);
        yieldProjetivoResultEl.textContent = formatToPercent(yieldProjetivo);
        precoJustoResultEl.textContent = formatToCurrency(precoJusto);
        margemSegurancaResultEl.textContent = formatToPercent(margemSeguranca);
        margemSegurancaResultEl.style.color = margemSeguranca >= 0 ? '#00d9c3' : '#ef4444';
    }

    formTeto.addEventListener('input', (e) => {
        const id = e.target.id;
        if (id === 'teto-ticker') {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        }
        calculateTeto();
    });

    lucroProjetivoInput.addEventListener('input', (e) => formatInteger(e.target));
    quantidadePapeisInput.addEventListener('input', (e) => formatInteger(e.target));
    cotacaoAtualInput.addEventListener('input', (e) => formatCurrencyDecimal(e.target));

    payoutInput.addEventListener('blur', (e) => formatPercentage(e.target));
    yieldMinimoInput.addEventListener('blur', (e) => formatPercentage(e.target));

    btnReiniciar.addEventListener('click', resetTetoCalculator);
    btnSalvarTeto.addEventListener('click', () => {
        if (!currentTetoCalculations.resultados || isNaN(currentTetoCalculations.resultados.preco_justo)) {
            alert('Preencha os dados da calculadora de Teto Projetivo antes de salvar.');
            return;
        }
        calculationTypeToSave = 'TETO_PROJETIVO';
        salvarTituloInput.value = currentTetoCalculations.inputs.ticker ? `Teto Projetivo - ${currentTetoCalculations.inputs.ticker}` : 'Cálculo de Teto Projetivo';
        salvarNotasInput.value = '';
        salvarCalculoModal.classList.add('show');
    });
}


// --- CALCULADORA: PEG RATIO ---
function initializePegRatioCalculator() {
    const formPeg = document.getElementById('peg-calculator-form');
    if (!formPeg) return;

    const tickerInput = document.getElementById('ticker');
    const plAtualInput = document.getElementById('pl-atual');
    const roeMedioInput = document.getElementById('roe-medio');
    const payoutMedioInput = document.getElementById('payout-medio');
    const inflacaoInput = document.getElementById('inflacao');
    const btnSalvarPeg = document.getElementById('btn-salvar-peg-ratio');

    function calculatePeg() {
        const inputs = {
            ticker: tickerInput.value.toUpperCase(),
            plAtual: parseFloat(plAtualInput.value) || 0,
            roeMedio: parseFloat(roeMedioInput.value) || 0,
            payoutMedio: parseFloat(payoutMedioInput.value) || 0,
            inflacao: parseFloat(inflacaoInput.value) || 0,
        };

        const taxaDeRetencao = 1 - (inputs.payoutMedio / 100);
        const crescimentoEsperado = inputs.roeMedio * taxaDeRetencao;
        const fatorCrescimento = 1 + (crescimentoEsperado / 100);
        const fatorInflacao = 1 + (inputs.inflacao / 100);
        const crescimentoReal = fatorInflacao > 0 ? ((fatorCrescimento / fatorInflacao) - 1) * 100 : 0;

        const resultados = {
            crescimentoEsperado: crescimentoEsperado,
            peg: inputs.plAtual > 0 && crescimentoEsperado > 0 ? inputs.plAtual / crescimentoEsperado : 0,
            crescimentoReal: crescimentoReal,
        };
        resultados.pegReal = resultados.crescimentoReal > 0 ? inputs.plAtual / resultados.crescimentoReal : Infinity;
        resultados.desconto = (1 - resultados.peg) * 100;

        currentPegCalculations = { inputs, resultados };

        crescimentoEsperadoResultEl.textContent = `${crescimentoEsperado.toFixed(2)}%`;

        if (inputs.plAtual <= 0 || crescimentoEsperado <= 0) {
            resetPegResults(false);
            return;
        }

        pegResultEl.textContent = resultados.peg.toFixed(2);
        crescimentoRealResultEl.textContent = `${resultados.crescimentoReal.toFixed(2)}%`;
        pegRealResultEl.textContent = isFinite(resultados.pegReal) ? resultados.pegReal.toFixed(2) : 'N/A';
        descontoResultEl.textContent = resultados.desconto > 0 ? `${resultados.desconto.toFixed(2)}%` : 'Sem desconto';

        updatePegInterpretations(resultados.peg, resultados.desconto, resultados.crescimentoReal);
    }

    function updatePegInterpretations(peg, desconto, crescimentoReal) {
        if (peg > 0 && peg < 1) {
            pegInterpretationEl.textContent = 'Empresa possivelmente barata.';
            pegInterpretationEl.className = 'interpretation-text good';
        } else if (peg >= 1 && peg < 1.1) {
            pegInterpretationEl.textContent = 'Preço justo.';
            pegInterpretationEl.className = 'interpretation-text neutral';
        } else if (peg >= 1.1) {
            pegInterpretationEl.textContent = 'Empresa pode estar cara.';
            pegInterpretationEl.className = 'interpretation-text bad';
        } else {
            pegInterpretationEl.textContent = '';
        }
        crescimentoRealAlertEl.textContent = (crescimentoReal <= 0) ? 'Atenção: crescimento abaixo da inflação.' : '';
        crescimentoRealAlertEl.className = (crescimentoReal <= 0) ? 'interpretation-text bad' : 'interpretation-text';
        descontoAlertEl.textContent = (desconto > 50) ? 'Desconto muito bom!' : '';
        descontoAlertEl.className = (desconto > 50) ? 'interpretation-text highlight' : 'interpretation-text';
    }

    function resetPegResults(resetCrescimento = true) {
        [pegResultEl, crescimentoRealResultEl, pegRealResultEl, descontoResultEl].forEach(el => el.textContent = '-');
        [pegInterpretationEl, crescimentoRealAlertEl, descontoAlertEl].forEach(el => {
            el.textContent = '';
            el.className = 'interpretation-text';
        });
        if (resetCrescimento) {
            crescimentoEsperadoResultEl.textContent = '-';
        }
        currentPegCalculations = {};
    }

    formPeg.addEventListener('input', calculatePeg);

    btnSalvarPeg.addEventListener('click', () => {
        if (!currentPegCalculations.inputs || !currentPegCalculations.inputs.plAtual) {
            alert('Preencha os dados da calculadora PEG Ratio antes de salvar.');
            return;
        }
        calculationTypeToSave = 'PEG_RATIO';
        salvarTituloInput.value = currentPegCalculations.inputs.ticker ? `Análise PEG - ${currentPegCalculations.inputs.ticker}` : 'Cálculo de PEG Ratio';
        salvarNotasInput.value = '';
        salvarCalculoModal.classList.add('show');
    });
}


// --- LÓGICA COMPARTILHADA DE SALVAMENTO E CONSULTA ---
function loadCalculation(calc) {
    if (!calc || !calc.inputs) return;

    if (calc.tipoCalculo === 'PEG_RATIO') {
        document.getElementById('ticker').value = calc.inputs.ticker || '';
        document.getElementById('pl-atual').value = calc.inputs.plAtual || '';
        document.getElementById('roe-medio').value = calc.inputs.roeMedio || '';
        document.getElementById('payout-medio').value = calc.inputs.payoutMedio || '';
        document.getElementById('inflacao').value = calc.inputs.inflacao || '';
        document.getElementById('peg-calculator-form').dispatchEvent(new Event('input'));
    } else if (calc.tipoCalculo === 'TETO_PROJETIVO') {
        const formTeto = document.getElementById('teto-projetivo-form');
        document.getElementById('teto-ticker').value = calc.inputs.ticker || '';
        document.getElementById('teto-payout').value = calc.inputs.payout ? `${calc.inputs.payout.toLocaleString('pt-BR')}%` : '';
        document.getElementById('teto-lucro-projetivo').value = calc.inputs.lucro_projetivo ? calc.inputs.lucro_projetivo.toLocaleString('pt-BR') : '';
        document.getElementById('teto-yield-minimo').value = calc.inputs.yield_minimo ? `${calc.inputs.yield_minimo.toLocaleString('pt-BR')}%` : '';
        document.getElementById('teto-cotacao-atual').value = calc.inputs.cotacao_atual ? calc.inputs.cotacao_atual.toLocaleString('pt-BR', {style:'currency', currency: 'BRL'}) : '';
        document.getElementById('teto-quantidade-papeis').value = calc.inputs.quantidade_papeis ? calc.inputs.quantidade_papeis.toLocaleString('pt-BR') : '';
        formTeto.dispatchEvent(new Event('input'));
    }
    
    calculosSalvosModal.classList.remove('show');
}


function renderSavedCalculations(searchTerm = '') {
    if (!calculosSalvosListaDiv) return;

    const term = searchTerm.toUpperCase();
    const filteredCalculations = allSavedCalculations.filter(c =>
        (c.titulo && c.titulo.toUpperCase().includes(term)) ||
        (c.inputs.ticker && c.inputs.ticker.toUpperCase().includes(term))
    );

    if (filteredCalculations.length === 0) {
        calculosSalvosListaDiv.innerHTML = '<p style="color: #a0a7b3;">Nenhum cálculo encontrado.</p>';
        return;
    }

    calculosSalvosListaDiv.innerHTML = filteredCalculations.map(calc => {
        let detailsHtml = '';
        if (calc.tipoCalculo === 'PEG_RATIO') {
            detailsHtml = `<p><strong>PEG:</strong> ${calc.resultados.peg.toFixed(2)} | <strong>Desconto:</strong> ${calc.resultados.desconto > 0 ? calc.resultados.desconto.toFixed(2) + '%' : 'Nenhum'}</p>`;
        } else if (calc.tipoCalculo === 'TETO_PROJETIVO') {
            detailsHtml = `<p><strong>Preço Teto:</strong> ${calc.resultados.preco_justo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} | <strong>Margem:</strong> ${calc.resultados.margem_seguranca.toFixed(2)}%</p>`;
        }

        return `
            <div class="saved-calc-card">
                <div class="saved-calc-info">
                    <h4>${calc.titulo || 'Cálculo Salvo'}</h4>
                    ${detailsHtml}
                    ${calc.notas ? `<p style="font-style: italic;">"${calc.notas}"</p>` : ''}
                    <p style="font-size: 0.75rem;">Salvo em: ${new Date(calc.timestamp.toDate()).toLocaleDateString('pt-BR')}</p>
                </div>
                <div class="saved-calc-actions">
                    <button class="btn-adicionar btn-carregar" data-id="${calc.id}">Carregar</button>
                    <div class="btn-crud-group">
                        <button class="btn-crud btn-excluir" data-id="${calc.id}" title="Excluir">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    calculosSalvosListaDiv.querySelectorAll('.btn-carregar').forEach(btn => {
        btn.addEventListener('click', () => {
            const calc = allSavedCalculations.find(c => c.id === btn.dataset.id);
            loadCalculation(calc);
        });
    });

    calculosSalvosListaDiv.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Tem certeza que deseja excluir este cálculo?')) {
                await deleteDoc(doc(db, 'calculosSalvos', btn.dataset.id));
            }
        });
    });
}

/**
 * Inicializa ambas as calculadoras e os modais.
 */
export function initializePegCalculator(userID) {
    initializeTetoProjetivoCalculator();
    initializePegRatioCalculator();

    btnVerSalvos.addEventListener('click', () => {
        renderSavedCalculations();
        calculosSalvosModal.classList.add('show');
    });

    formSalvarCalculo.addEventListener('submit', async (e) => {
        e.preventDefault();

        let dataToSave = {};
        if (calculationTypeToSave === 'PEG_RATIO') {
            dataToSave = { ...currentPegCalculations };
        } else if (calculationTypeToSave === 'TETO_PROJETIVO') {
            dataToSave = { ...currentTetoCalculations };
        } else {
            return;
        }

        dataToSave.userID = userID;
        dataToSave.tipoCalculo = calculationTypeToSave;
        dataToSave.titulo = salvarTituloInput.value;
        dataToSave.notas = salvarNotasInput.value;
        dataToSave.timestamp = serverTimestamp();

        try {
            await addDoc(collection(db, 'calculosSalvos'), dataToSave);
            salvarCalculoModal.classList.remove('show');
            alert('Cálculo salvo com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar cálculo:", error);
            alert('Não foi possível salvar o cálculo. Verifique as regras de segurança do Firestore.');
        }
    });

    searchSavedCalcInput.addEventListener('input', (e) => {
        renderSavedCalculations(e.target.value);
    });

    const qCalculos = query(collection(db, "calculosSalvos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qCalculos, (snapshot) => {
        allSavedCalculations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (calculosSalvosModal.classList.contains('show')) {
            renderSavedCalculations(searchSavedCalcInput.value);
        }
    });
}