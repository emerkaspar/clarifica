// public/js/tabs/calculos.js
import { db } from '../firebase-config.js';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- ELEMENTOS DO FORMULÁRIO E RESULTADOS ---
const form = document.getElementById('peg-calculator-form');
const tickerInput = document.getElementById('ticker');
const plAtualInput = document.getElementById('pl-atual');
const roeMedioInput = document.getElementById('roe-medio');
const payoutMedioInput = document.getElementById('payout-medio');
const inflacaoInput = document.getElementById('inflacao');

// Resultados
const crescimentoEsperadoResultEl = document.getElementById('crescimento-esperado-result');
const pegResultEl = document.getElementById('peg-result');
const pegInterpretationEl = document.getElementById('peg-interpretation');
const crescimentoRealResultEl = document.getElementById('crescimento-real-result');
const crescimentoRealAlertEl = document.getElementById('crescimento-real-alert');
const pegRealResultEl = document.getElementById('peg-real-result');
const descontoResultEl = document.getElementById('desconto-result');
const descontoAlertEl = document.getElementById('desconto-alert');

// Modal de Salvamento
const salvarCalculoModal = document.getElementById('salvar-calculo-modal');
const btnSalvarCalculo = document.getElementById('btn-salvar-calculo');
const formSalvarCalculo = document.getElementById('form-salvar-calculo');
const salvarTituloInput = document.getElementById('salvar-titulo');
const salvarNotasInput = document.getElementById('salvar-notas');

// Modal de Cálculos Salvos
const calculosSalvosModal = document.getElementById('calculos-salvos-modal');
const btnVerSalvos = document.getElementById('btn-ver-salvos');
const searchSavedCalcInput = document.getElementById('search-saved-calc');
const calculosSalvosListaDiv = document.getElementById('calculos-salvos-lista');

let currentCalculations = {}; // Armazena os cálculos atuais
let allSavedCalculations = []; // Armazena todos os cálculos do usuário

/**
 * Executa todos os cálculos e atualiza a UI.
 */
function calculateAndUpdate() {
    // 1. Pega os valores dos inputs
    const inputs = {
        ticker: tickerInput.value.toUpperCase(),
        plAtual: parseFloat(plAtualInput.value) || 0,
        roeMedio: parseFloat(roeMedioInput.value) || 0,
        payoutMedio: parseFloat(payoutMedioInput.value) || 0,
        inflacao: parseFloat(inflacaoInput.value) || 0,
    };

    // 2. Realiza os cálculos
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

    currentCalculations = { inputs, resultados };

    // 3. Atualiza os campos de resultado na tela
    crescimentoEsperadoResultEl.textContent = `${crescimentoEsperado.toFixed(2)}%`;

    if (inputs.plAtual <= 0 || crescimentoEsperado <= 0) {
        resetResults(false);
        return;
    }

    pegResultEl.textContent = resultados.peg.toFixed(2);
    crescimentoRealResultEl.textContent = `${resultados.crescimentoReal.toFixed(2)}%`;
    pegRealResultEl.textContent = isFinite(resultados.pegReal) ? resultados.pegReal.toFixed(2) : 'N/A';
    descontoResultEl.textContent = resultados.desconto > 0 ? `${resultados.desconto.toFixed(2)}%` : 'Sem desconto';

    // 4. Aplica as regras de interpretação e alertas
    updateInterpretations(resultados.peg, resultados.desconto, resultados.crescimentoReal);
}

function updateInterpretations(peg, desconto, crescimentoReal) {
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

function resetResults(resetCrescimento = true) {
    [pegResultEl, crescimentoRealResultEl, pegRealResultEl, descontoResultEl].forEach(el => el.textContent = '-');
    [pegInterpretationEl, crescimentoRealAlertEl, descontoAlertEl].forEach(el => {
        el.textContent = '';
        el.className = 'interpretation-text';
    });
    if (resetCrescimento) {
        crescimentoEsperadoResultEl.textContent = '-';
    }
}

function loadCalculation(calc) {
    if (!calc || !calc.inputs) return;

    tickerInput.value = calc.inputs.ticker || '';
    plAtualInput.value = calc.inputs.plAtual || '';
    roeMedioInput.value = calc.inputs.roeMedio || '';
    payoutMedioInput.value = calc.inputs.payoutMedio || '';
    inflacaoInput.value = calc.inputs.inflacao || '';

    calculateAndUpdate();
    // Fecha o modal após carregar para melhorar a experiência
    calculosSalvosModal.classList.remove('show');
}

/**
 * Renderiza a lista de cálculos salvos, aplicando um filtro de busca se necessário.
 */
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

    calculosSalvosListaDiv.innerHTML = filteredCalculations.map(calc => `
        <div class="saved-calc-card">
            <div class="saved-calc-info">
                <h4>${calc.titulo || 'Cálculo Salvo'}</h4>
                <p><strong>PEG:</strong> ${calc.resultados.peg.toFixed(2)} | <strong>Desconto:</strong> ${calc.resultados.desconto > 0 ? calc.resultados.desconto.toFixed(2) + '%' : 'Nenhum'}</p>
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
    `).join('');

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
 * Inicializa a calculadora e os modais.
 */
export function initializePegCalculator(userID) {
    if (!form) return;

    // Listener para o formulário principal
    form.addEventListener('input', calculateAndUpdate);

    // Listeners para abrir e fechar modais
    btnSalvarCalculo.addEventListener('click', () => {
        if (!currentCalculations.inputs || !currentCalculations.inputs.plAtual) {
            alert('Preencha os dados da calculadora antes de salvar.');
            return;
        }
        salvarTituloInput.value = currentCalculations.inputs.ticker ? `Análise ${currentCalculations.inputs.ticker}` : '';
        salvarNotasInput.value = '';
        salvarCalculoModal.classList.add('show');
    });

    btnVerSalvos.addEventListener('click', () => {
        renderSavedCalculations(); // Renderiza a lista completa ao abrir
        calculosSalvosModal.classList.add('show');
    });

    // Listener para o formulário de salvamento
    formSalvarCalculo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dataToSave = {
            userID: userID,
            tipoCalculo: 'PEG_RATIO',
            titulo: salvarTituloInput.value,
            notas: salvarNotasInput.value,
            timestamp: serverTimestamp(),
            ...currentCalculations
        };

        try {
            await addDoc(collection(db, 'calculosSalvos'), dataToSave);
            salvarCalculoModal.classList.remove('show');
            alert('Cálculo salvo com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar cálculo:", error);
            alert('Não foi possível salvar o cálculo. Verifique as regras de segurança do Firestore.');
        }
    });

    // Listener para a busca no modal de salvos
    searchSavedCalcInput.addEventListener('input', (e) => {
        renderSavedCalculations(e.target.value);
    });

    // Listener do Firestore para atualizar a lista em tempo real
    const qCalculos = query(collection(db, "calculosSalvos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    onSnapshot(qCalculos, (snapshot) => {
        allSavedCalculations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Se o modal estiver aberto, atualiza a lista filtrada
        if (calculosSalvosModal.classList.contains('show')) {
            renderSavedCalculations(searchSavedCalcInput.value);
        }
    });
}