// public/js/tabs/calculos.js
import { db } from '../firebase-config.js';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, query, where, orderBy, onSnapshot, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth } from '../firebase-config.js';
import { searchAssets, fetchCurrentPrices } from '../api/brapi.js';

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


// --- NOVO: ACOMPANHAMENTO DE PREÇO TETO ---
let acompanhamentoListenerUnsubscribe = null;
let precosAtuaisAcompanhamento = {};

function formatCurrencyDecimalInput(input) {
    let value = input.value.replace(/\D/g, '');
    if (value) {
        let numberValue = parseInt(value, 10) / 100;
        input.value = numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        input.value = '';
    }
}

async function renderAcompanhamentoLista() {
    const listaDiv = document.getElementById('acompanhamento-lista');
    if (!listaDiv || !auth.currentUser) return;

    try {
        const q = query(collection(db, "acompanhamentoTeto"), where("userID", "==", auth.currentUser.uid));
        const snapshot = await getDocs(q);
        const acompanhamentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (acompanhamentos.length === 0) {
            listaDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 15px;">Nenhum ativo adicionado para acompanhamento.</p>';
            return;
        }

        const tickers = acompanhamentos.map(a => a.ticker);
        precosAtuaisAcompanhamento = await fetchCurrentPrices(tickers);
        acompanhamentos.sort((a, b) => a.ticker.localeCompare(b.ticker));

        listaDiv.innerHTML = acompanhamentos.map(item => {
            const precoAtualInfo = precosAtuaisAcompanhamento[item.ticker];
            const precoAtual = precoAtualInfo?.price ?? 0;
            const precoTeto = item.precoTeto || 0;
            const diferencaReais = precoAtual - precoTeto;
            const diferencaPercent = precoTeto > 0 ? (diferencaReais / precoTeto) * 100 : (precoAtual > 0 ? Infinity : 0);
            const corClasse = diferencaReais <= 0 ? 'diferenca-positiva' : 'diferenca-negativa';
            const icone = diferencaReais <= 0 ? '<i class="fas fa-check-circle" style="color: var(--positive-change);"></i>' : '<i class="fas fa-exclamation-triangle" style="color: var(--negative-change);"></i>';
            const dataDefinicao = item.dataDefinicao
                ? new Date(item.dataDefinicao + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '-';

            // **CORRIGIDO:** Removidos os comentários {/* ... */}
            return `
                <div class="lista-item acompanhamento-item" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; min-width: 700px;">
                    <div class="lista-item-valor" data-label="Ativo">${item.ticker} ${icone}</div>
                    <div style="text-align: right;" data-label="Data Def.">${dataDefinicao}</div>
                    <div style="text-align: right;" data-label="Preço Atual">${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div style="text-align: right;" data-label="Preço Teto">${precoTeto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div class="${corClasse}" style="text-align: right;" data-label="Diferença (R$)">${diferencaReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div class="${corClasse}" style="text-align: right;" data-label="Diferença (%)">${isFinite(diferencaPercent) ? `${diferencaPercent.toFixed(2)}%` : 'N/A'}</div>
                    <div class="lista-acoes">
                        <button class="btn-crud btn-excluir-acompanhamento" data-id="${item.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"></path></svg></button>
                    </div>
                </div>
            `;
        }).join('');

        listaDiv.querySelectorAll('.btn-excluir-acompanhamento').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
            listaDiv.querySelector(`button.btn-excluir-acompanhamento[data-id="${btn.dataset.id}"]`).addEventListener('click', async () => {
                const docId = btn.dataset.id;
                if (confirm(`Tem certeza que deseja remover o acompanhamento de ${docId}?`)) {
                    try {
                        await deleteDoc(doc(db, "acompanhamentoTeto", docId));
                    } catch (error) {
                        console.error("Erro ao excluir acompanhamento:", error);
                        alert("Erro ao remover o ativo.");
                    }
                }
            });
        });

    } catch (error) {
        console.error("Erro ao buscar ou renderizar lista de acompanhamento:", error);
        listaDiv.innerHTML = '<p style="color: var(--negative-change); text-align: center; padding: 15px;">Erro ao carregar dados.</p>';
    }
}


function initializeAcompanhamentoPrecoTeto(userID) {
    const form = document.getElementById('form-acompanhamento-teto');
    const tickerInput = document.getElementById('acompanhamento-ticker');
    const sugestoesDiv = document.getElementById('acompanhamento-ticker-sugestoes');
    const precoTetoInput = document.getElementById('acompanhamento-preco-teto');
    const precoAtualSpan = document.getElementById('acompanhamento-preco-atual');
    let timeoutBusca;

    tickerInput.addEventListener('input', () => {
        clearTimeout(timeoutBusca);
        sugestoesDiv.style.display = 'none';
        precoAtualSpan.textContent = '';

        timeoutBusca = setTimeout(async () => {
            const term = tickerInput.value.trim().toUpperCase();
            if (term.length < 2) {
                sugestoesDiv.innerHTML = '';
                return;
            }
            try {
                const suggestions = await searchAssets(term);
                sugestoesDiv.innerHTML = "";
                if (suggestions.length > 0) {
                    sugestoesDiv.style.display = "block";
                    suggestions.forEach((stock) => {
                        const div = document.createElement("div");
                        div.className = "sugestao-item";
                        div.textContent = stock;
                        div.addEventListener('click', async () => {
                            tickerInput.value = stock;
                            sugestoesDiv.style.display = "none";
                            precoAtualSpan.textContent = 'Buscando...';
                            try {
                                const priceData = await fetchCurrentPrices([stock]);
                                if (priceData[stock] && priceData[stock].price) {
                                    const preco = priceData[stock].price;
                                    precoAtualSpan.textContent = `Atual: ${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                                    precosAtuaisAcompanhamento[stock] = priceData[stock];
                                    renderAcompanhamentoLista();
                                } else {
                                    precoAtualSpan.textContent = 'Preço N/D';
                                }
                            } catch (fetchError) {
                                console.error("Erro ao buscar preço:", fetchError);
                                precoAtualSpan.textContent = 'Erro';
                            }
                            precoTetoInput.focus();
                        });
                        sugestoesDiv.appendChild(div);
                    });
                } else {
                    sugestoesDiv.style.display = "none";
                }
            } catch (searchError) {
                console.error("Erro ao buscar sugestões:", searchError);
                sugestoesDiv.innerHTML = '<div class="sugestao-item">Erro ao buscar</div>';
                sugestoesDiv.style.display = "block";
            }
        }, 400);
    });

    precoTetoInput.addEventListener('input', (e) => formatCurrencyDecimalInput(e.target));

    document.addEventListener('click', (e) => {
        if (sugestoesDiv && !sugestoesDiv.contains(e.target) && e.target !== tickerInput) {
            sugestoesDiv.style.display = 'none';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticker = tickerInput.value.trim().toUpperCase();
        const precoTetoRaw = precoTetoInput.value;
        const precoTeto = parseFloat(precoTetoRaw.replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;

        if (!ticker || precoTeto <= 0) {
            alert("Por favor, preencha o ticker e um preço teto válido.");
            return;
        }

        const docRef = doc(db, "acompanhamentoTeto", ticker);
        const dataToSave = {
            userID: userID,
            ticker: ticker,
            precoTeto: precoTeto,
            dataDefinicao: new Date().toISOString().split('T')[0],
            timestamp: serverTimestamp()
        };

        const btnSalvar = document.getElementById('btn-salvar-acompanhamento');
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            await setDoc(docRef, dataToSave, { merge: true });
            tickerInput.value = '';
            precoTetoInput.value = '';
            precoAtualSpan.textContent = '';
            sugestoesDiv.innerHTML = '';
            sugestoesDiv.style.display = 'none';
            tickerInput.focus();
        } catch (error) {
            console.error("Erro ao salvar acompanhamento:", error);
            alert("Erro ao salvar o acompanhamento.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
        }
    });

    if (acompanhamentoListenerUnsubscribe) {
        acompanhamentoListenerUnsubscribe();
    }
    const q = query(collection(db, "acompanhamentoTeto"), where("userID", "==", userID));
    acompanhamentoListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.metadata.hasPendingWrites) {
            renderAcompanhamentoLista();
        }
    }, (error) => {
        console.error("Erro no listener de acompanhamento:", error);
    });

    renderAcompanhamentoLista();
}
// --- FIM ACOMPANHAMENTO DE PREÇO TETO ---


// --- CALCULADORA: TETO PROJETIVO ---
function initializeTetoProjetivoCalculator() {
    const formTeto = document.getElementById('teto-projetivo-form');
    if (!formTeto) return;

    const tickerTetoInput = document.getElementById('teto-ticker');
    const sugestoesTetoDiv = document.getElementById('teto-ticker-sugestoes');
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

    let timeoutBuscaTeto;

    const parseValue = (value) => {
        if (!value || typeof value !== 'string') return 0;
        value = value.replace('R$', '').replace('%', '').trim();
        if (value.includes(',')) {
             return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
        } else {
             return parseFloat(value.replace(/\./g, '')) || 0;
        }
    };
    const formatToCurrency = (value) => (typeof value === 'number' && !isNaN(value)) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
    const formatToPercent = (value) => (typeof value === 'number' && !isNaN(value)) ? `${value.toFixed(2).replace('.', ',')}%` : '0,00%';

    const formatInteger = (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            try {
                input.value = BigInt(value).toLocaleString('pt-BR');
            } catch (e) {
                input.value = value;
            }
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
        let value = input.value.replace(/[^0-9,.]/g, '').replace(',', '.');
        if (value && !isNaN(parseFloat(value))) {
             input.value = parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
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
        margemSegurancaResultEl.style.color = 'var(--text-primary, #e0e0e0)';
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

        if (inputs.quantidade_papeis === 0 || inputs.yield_minimo === 0 || inputs.lucro_projetivo < 0) {
            clearTetoResults();
            return;
        }

        const lpaProjetivo = inputs.lucro_projetivo / inputs.quantidade_papeis;
        const dpaProjetivo = lpaProjetivo * (inputs.payout / 100);
        const precoJusto = inputs.yield_minimo > 0 ? dpaProjetivo / (inputs.yield_minimo / 100) : 0;

        let yieldProjetivo = 0;
        let margemSeguranca = 0;

        if (inputs.cotacao_atual > 0) {
            yieldProjetivo = (dpaProjetivo / inputs.cotacao_atual) * 100;
            margemSeguranca = ((precoJusto / inputs.cotacao_atual) - 1) * 100;
        } else if (precoJusto > 0) {
            margemSeguranca = Infinity;
        }

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

        if (isFinite(margemSeguranca)) {
             margemSegurancaResultEl.textContent = formatToPercent(margemSeguranca);
             margemSegurancaResultEl.style.color = margemSeguranca >= 0 ? 'var(--positive-change)' : 'var(--negative-change)';
        } else {
             margemSegurancaResultEl.textContent = '+∞%';
             margemSegurancaResultEl.style.color = 'var(--positive-change)';
        }
    }

    tickerTetoInput.addEventListener('input', () => {
        clearTimeout(timeoutBuscaTeto);
        sugestoesTetoDiv.style.display = 'none';
        timeoutBuscaTeto = setTimeout(async () => {
            const term = tickerTetoInput.value;
            if (term.length < 2) {
                sugestoesTetoDiv.innerHTML = '';
                return;
            }
            try {
                 const suggestions = await searchAssets(term);
                 sugestoesTetoDiv.innerHTML = "";
                 if (suggestions.length > 0) {
                     sugestoesTetoDiv.style.display = "block";
                     suggestions.forEach((stock) => {
                         const div = document.createElement("div");
                         div.className = "sugestao-item";
                         div.textContent = stock;
                         div.addEventListener('click', async () => {
                             tickerTetoInput.value = stock;
                             sugestoesTetoDiv.style.display = "none";
                             try {
                                 const priceData = await fetchCurrentPrices([stock]);
                                 if (priceData[stock] && priceData[stock].price) {
                                     cotacaoAtualInput.value = priceData[stock].price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                     formTeto.dispatchEvent(new Event('input', { bubbles: true }));
                                 } else { cotacaoAtualInput.value = ''; }
                             } catch (fetchErr) {
                                  console.error("Erro ao buscar preço para", stock, fetchErr);
                                  cotacaoAtualInput.value = '';
                             }
                         });
                         sugestoesTetoDiv.appendChild(div);
                     });
                 }
             } catch (searchErr) { console.error("Erro ao buscar sugestões:", searchErr); }
        }, 400);
    });

    document.addEventListener('click', (e) => {
        if (sugestoesTetoDiv && !sugestoesTetoDiv.contains(e.target) && e.target !== tickerTetoInput) {
            sugestoesTetoDiv.style.display = 'none';
        }
    });

    formTeto.addEventListener('input', (e) => {
        if (e.target.id === 'teto-ticker') { e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
        else if (e.target.type === 'text' && e.target.inputMode === 'numeric') { formatInteger(e.target); }
        else if (e.target.type === 'text' && e.target.inputMode === 'decimal' && e.target.id === 'teto-cotacao-atual') { formatCurrencyDecimal(e.target); }
        else if (e.target.type === 'text' && e.target.inputMode === 'decimal') { formatPercentage(e.target); }
        calculateTeto();
    });

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

    const crescimentoEsperadoResultEl = document.getElementById('crescimento-esperado-result');
    const pegResultEl = document.getElementById('peg-result');
    const pegInterpretationEl = document.getElementById('peg-interpretation');
    const crescimentoRealResultEl = document.getElementById('crescimento-real-result');
    const crescimentoRealAlertEl = document.getElementById('crescimento-real-alert');
    const pegRealResultEl = document.getElementById('peg-real-result');
    const descontoResultEl = document.getElementById('desconto-result');
    const descontoAlertEl = document.getElementById('desconto-alert');

    function calculatePeg() {
        const inputs = {
            ticker: tickerInput.value.toUpperCase(),
            plAtual: parseFloat(plAtualInput.value.replace(',', '.')) || 0,
            roeMedio: parseFloat(roeMedioInput.value.replace(',', '.')) || 0,
            payoutMedio: parseFloat(payoutMedioInput.value.replace(',', '.')) || 0,
            inflacao: parseFloat(inflacaoInput.value.replace(',', '.')) || 0,
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

        crescimentoEsperadoResultEl.textContent = `${crescimentoEsperado.toFixed(2).replace('.', ',')}%`;

        if (inputs.plAtual <= 0 || crescimentoEsperado <= 0) {
            resetPegResults(false);
            return;
        }

        pegResultEl.textContent = resultados.peg.toFixed(2).replace('.', ',');
        crescimentoRealResultEl.textContent = `${resultados.crescimentoReal.toFixed(2).replace('.', ',')}%`;
        pegRealResultEl.textContent = isFinite(resultados.pegReal) ? resultados.pegReal.toFixed(2).replace('.', ',') : 'N/A';
        descontoResultEl.textContent = resultados.desconto > 0 ? `${resultados.desconto.toFixed(2).replace('.', ',')}%` : 'Sem desconto';

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
            pegInterpretationEl.className = 'interpretation-text';
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
        if (resetCrescimento) { crescimentoEsperadoResultEl.textContent = '-'; }
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


// --- CALCULADORA: FLUXO DE CAIXA DESCONTADO (SIMPLIFICADO) ---
function initializeDCFCalculatorSimplified() {
    const dcfForm = document.getElementById('dcf-form-simplified');
    if (!dcfForm) return;

    const parseNumber = (value) => {
        if (typeof value !== 'string' || value.trim() === '') return 0;
        return parseFloat(value.replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
    };
    const parsePercent = (value) => {
        if (typeof value !== 'string' || value.trim() === '') return 0;
        return (parseFloat(value.replace('%', '').replace(',', '.')) || 0) / 100;
    };
    const formatCurrency = (value, fractionDigits = 2) => {
        if (isNaN(value)) return 'R$ 0,00';
        const numValue = Number(value);
        return numValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    };
    const formatPercent = (value) => {
        if (isNaN(value)) return '0,00%';
        const numValue = Number(value);
        return (numValue * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    };
    const formatBigNumberInput = (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            try { input.value = BigInt(value).toLocaleString('pt-BR'); }
            catch (e) { input.value = value; }
        } else { input.value = ''; }
    };
    const formatCurrencyInput = (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            let numberValue = parseInt(value, 10) / 100;
            input.value = numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else { input.value = ''; }
    };
    const formatPercentInput = (input) => {
        let value = input.value.replace(/[^\d,.-]/g, '').replace(',', '.');
        const parts = value.split('.');
        if (parts.length > 2) { value = parts[0] + '.' + parts.slice(1).join(''); }
        if (value && !isNaN(parseFloat(value))) { input.value = value.replace('.', ','); }
        else if (value !== '-' && value.trim() !== '') { input.value = ''; }
        else { input.value = value; }
    };

    const inputs = {
        ticker: document.getElementById('dcf-ticker'),
        precoAtual: document.getElementById('dcf-preco-atual-simplified'),
        numAcoes: document.getElementById('dcf-num-acoes-simplified'),
        dividaLiquida: document.getElementById('dcf-divida-liquida-simplified'),
        fcl: [
            document.getElementById('dcf-fcl-ano-5'), document.getElementById('dcf-fcl-ano-4'),
            document.getElementById('dcf-fcl-ano-3'), document.getElementById('dcf-fcl-ano-2'),
            document.getElementById('dcf-fcl-ano-1'),
        ],
        taxaDesconto: document.getElementById('dcf-taxa-desconto'),
        crescimentoProjetado: document.getElementById('dcf-crescimento-projetado'),
        crescimentoPerpetuo: document.getElementById('dcf-crescimento-perpetuo-simplified'),
    };
    const projectionTableBody = document.getElementById('dcf-projection-table-simplified');
    const results = {
        enterpriseValue: document.getElementById('dcf-enterprise-value-simplified'),
        equityValue: document.getElementById('dcf-equity-value-simplified'),
        intrinsicValue: document.getElementById('dcf-intrinsic-value-simplified'),
        upsidePotential: document.getElementById('dcf-upside-potential-simplified')
    };

    function calculateDCF() {
        const fclHistoricoValues = inputs.fcl.map(input => parseNumber(input.value)).filter(value => value > 0);
        const fclBase = fclHistoricoValues.length > 0 ? fclHistoricoValues.reduce((sum, value) => sum + value, 0) / fclHistoricoValues.length : 0;
        const p = {
            precoAtual: parseNumber(inputs.precoAtual.value), numAcoes: parseNumber(inputs.numAcoes.value),
            dividaLiquida: parseNumber(inputs.dividaLiquida.value), fclBase: fclBase,
            taxaDesconto: parsePercent(inputs.taxaDesconto.value), crescimentoProjetado: parsePercent(inputs.crescimentoProjetado.value),
            crescimentoPerpetuo: parsePercent(inputs.crescimentoPerpetuo.value),
        };
        if (p.fclBase <= 0 || p.numAcoes <= 0 || p.taxaDesconto <= p.crescimentoPerpetuo || p.taxaDesconto <= 0) { clearResults(); return; }
        const projecoes = [];
        let fclProjetadoAcumulado = p.fclBase;
        for (let i = 1; i <= 5; i++) {
            fclProjetadoAcumulado *= (1 + p.crescimentoProjetado);
            const vpFcl = fclProjetadoAcumulado / Math.pow(1 + p.taxaDesconto, i);
            projecoes.push({ fcl: fclProjetadoAcumulado, vpFcl: vpFcl });
        }
        const fclAno5 = projecoes[4].fcl;
        const terminalValue = (fclAno5 * (1 + p.crescimentoPerpetuo)) / (p.taxaDesconto - p.crescimentoPerpetuo);
        const vpTerminalValue = terminalValue / Math.pow(1 + p.taxaDesconto, 5);
        const somaVpFcl = projecoes.reduce((sum, proj) => sum + proj.vpFcl, 0);
        const enterpriseValue = somaVpFcl + vpTerminalValue;
        const equityValue = enterpriseValue - p.dividaLiquida;
        const intrinsicValuePerShare = equityValue / p.numAcoes;
        const upsidePotential = p.precoAtual > 0 ? (intrinsicValuePerShare / p.precoAtual) - 1 : Infinity;
        updateUI(projecoes, { enterpriseValue, equityValue, intrinsicValuePerShare, upsidePotential });
    }
    function updateUI(projecoes, finalResults) {
        projectionTableBody.innerHTML = `
            <tr class="highlight-row"><td>FCL Projetado</td>${projecoes.map(p => `<td>${formatCurrency(p.fcl, 0)}</td>`).join('')}</tr>
            <tr><td>FCL (Valor Presente)</td>${projecoes.map(p => `<td>${formatCurrency(p.vpFcl, 0)}</td>`).join('')}</tr>`;
        results.enterpriseValue.textContent = formatCurrency(finalResults.enterpriseValue, 0);
        results.equityValue.textContent = formatCurrency(finalResults.equityValue, 0);
        results.intrinsicValue.textContent = formatCurrency(finalResults.intrinsicValuePerShare);
        if (isFinite(finalResults.upsidePotential)) {
            results.upsidePotential.textContent = formatPercent(finalResults.upsidePotential);
            results.upsidePotential.style.color = finalResults.upsidePotential >= 0 ? 'var(--positive-change)' : 'var(--negative-change)';
        } else {
            results.upsidePotential.textContent = '+∞%';
            results.upsidePotential.style.color = 'var(--positive-change)';
        }
    }
    function clearResults() {
        projectionTableBody.innerHTML = `
            <tr class="highlight-row"><td>FCL Projetado</td>${Array(5).fill('<td>-</td>').join('')}</tr>
            <tr><td>FCL (Valor Presente)</td>${Array(5).fill('<td>-</td>').join('')}</tr>`;
        Object.values(results).forEach(el => {
            if (el.id.includes('upside')) {
                el.textContent = '0,00%';
                el.style.color = 'var(--text-primary, #e0e0e0)';
            } else { el.textContent = 'R$ 0,00'; }
        });
    }
    dcfForm.addEventListener('input', (e) => {
        const input = e.target;
        if (input.id.startsWith('dcf-fcl-') || input.id === 'dcf-num-acoes-simplified' || input.id === 'dcf-divida-liquida-simplified') { formatBigNumberInput(input); }
        else if (input.id === 'dcf-preco-atual-simplified') { formatCurrencyInput(input); }
        else if (input.id.includes('taxa') || input.id.includes('crescimento')) { formatPercentInput(input); }
        calculateDCF();
    });
    calculateDCF();
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
        document.getElementById('teto-payout').value = calc.inputs.payout ? calc.inputs.payout.toLocaleString('pt-BR') : '';
        document.getElementById('teto-lucro-projetivo').value = calc.inputs.lucro_projetivo ? BigInt(Math.round(calc.inputs.lucro_projetivo)).toLocaleString('pt-BR') : '';
        document.getElementById('teto-yield-minimo').value = calc.inputs.yield_minimo ? calc.inputs.yield_minimo.toLocaleString('pt-BR') : '';
        document.getElementById('teto-cotacao-atual').value = calc.inputs.cotacao_atual ? calc.inputs.cotacao_atual.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '';
        document.getElementById('teto-quantidade-papeis').value = calc.inputs.quantidade_papeis ? BigInt(Math.round(calc.inputs.quantidade_papeis)).toLocaleString('pt-BR') : '';
        formTeto.dispatchEvent(new Event('input', {bubbles: true}));
    }

    calculosSalvosModal.classList.remove('show');
}

function renderSavedCalculations(searchTerm = '') {
    if (!calculosSalvosListaDiv) return;

    const term = searchTerm.toUpperCase();
    const filteredCalculations = allSavedCalculations.filter(c =>
        (c.titulo && c.titulo.toUpperCase().includes(term)) ||
        (c.inputs?.ticker && c.inputs.ticker.toUpperCase().includes(term))
    );

    if (filteredCalculations.length === 0) {
        calculosSalvosListaDiv.innerHTML = '<p style="color: #a0a7b3;">Nenhum cálculo encontrado.</p>';
        return;
    }

    calculosSalvosListaDiv.innerHTML = filteredCalculations.map(calc => {
        let detailsHtml = '';
        if (calc.tipoCalculo === 'PEG_RATIO' && calc.resultados) {
            detailsHtml = `<p><strong>PEG:</strong> ${calc.resultados.peg?.toFixed(2).replace('.', ',')} | <strong>Desconto:</strong> ${calc.resultados.desconto > 0 ? calc.resultados.desconto.toFixed(2).replace('.', ',') + '%' : 'Nenhum'}</p>`;
        } else if (calc.tipoCalculo === 'TETO_PROJETIVO' && calc.resultados) {
             const margem = isFinite(calc.resultados.margem_seguranca)
                ? `${calc.resultados.margem_seguranca.toFixed(2).replace('.', ',')}%`
                : '+∞%';
             detailsHtml = `<p><strong>Preço Teto:</strong> ${calc.resultados.preco_justo?.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} | <strong>Margem:</strong> ${margem}</p>`;
        }
        const dataSalvo = calc.timestamp?.toDate ? new Date(calc.timestamp.toDate()).toLocaleDateString('pt-BR') : 'Data indisponível';

        return `
            <div class="saved-calc-card">
                <div class="saved-calc-info">
                    <h4>${calc.titulo || 'Cálculo Salvo'} (${calc.inputs?.ticker || 'Sem Ticker'})</h4>
                    ${detailsHtml}
                    ${calc.notas ? `<p style="font-style: italic;">"${calc.notas}"</p>` : ''}
                    <p style="font-size: 0.75rem;">Salvo em: ${dataSalvo}</p>
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
         btn.replaceWith(btn.cloneNode(true));
         calculosSalvosListaDiv.querySelector(`button.btn-carregar[data-id="${btn.dataset.id}"]`).addEventListener('click', () => {
             const calc = allSavedCalculations.find(c => c.id === btn.dataset.id);
             loadCalculation(calc);
         });
    });

    calculosSalvosListaDiv.querySelectorAll('.btn-excluir').forEach(btn => {
         btn.replaceWith(btn.cloneNode(true));
         calculosSalvosListaDiv.querySelector(`button.btn-excluir[data-id="${btn.dataset.id}"]`).addEventListener('click', async () => {
             if (confirm('Tem certeza que deseja excluir este cálculo?')) {
                 await deleteDoc(doc(db, 'calculosSalvos', btn.dataset.id));
             }
         });
    });
}

/**
 * Inicializa todas as calculadoras e funcionalidades da aba.
 */
export function initializeCalculosTab(userID) {
    initializeAcompanhamentoPrecoTeto(userID);
    initializeTetoProjetivoCalculator();
    initializePegRatioCalculator();
    initializeDCFCalculatorSimplified();

    if(btnVerSalvos) {
         btnVerSalvos.addEventListener('click', () => {
             renderSavedCalculations();
             calculosSalvosModal.classList.add('show');
         });
    }

    if(formSalvarCalculo) {
         formSalvarCalculo.addEventListener('submit', async (e) => {
             e.preventDefault();
             let dataToSave = {};
             if (calculationTypeToSave === 'PEG_RATIO' && currentPegCalculations.inputs) {
                 dataToSave = { ...currentPegCalculations };
             } else if (calculationTypeToSave === 'TETO_PROJETIVO' && currentTetoCalculations.inputs) {
                 dataToSave = { ...currentTetoCalculations };
             } else {
                 alert("Nenhum cálculo válido para salvar.");
                 return;
             }
             dataToSave.userID = userID;
             dataToSave.tipoCalculo = calculationTypeToSave;
             dataToSave.titulo = salvarTituloInput.value || `Cálculo ${calculationTypeToSave.replace('_', ' ')}`;
             dataToSave.notas = salvarNotasInput.value;
             dataToSave.timestamp = serverTimestamp();
             try {
                 await addDoc(collection(db, 'calculosSalvos'), dataToSave);
                 salvarCalculoModal.classList.remove('show');
                 alert('Cálculo salvo com sucesso!');
             } catch (error) {
                 console.error("Erro ao salvar cálculo:", error);
                 alert('Não foi possível salvar o cálculo.');
             }
         });
    }

    if(searchSavedCalcInput) {
         searchSavedCalcInput.addEventListener('input', (e) => {
             renderSavedCalculations(e.target.value);
         });
    }

    const qCalculos = query(collection(db, "calculosSalvos"), where("userID", "==", userID), orderBy("timestamp", "desc"));
    const unsubscribeCalculosSalvos = onSnapshot(qCalculos, (snapshot) => {
        allSavedCalculations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (calculosSalvosModal && calculosSalvosModal.classList.contains('show')) {
            renderSavedCalculations(searchSavedCalcInput.value);
        }
    }, (error) => {
         console.error("Erro no listener de cálculos salvos:", error);
    });
    window.unsubscribeCalculosSalvos = unsubscribeCalculosSalvos;
}

auth.onAuthStateChanged(user => {
    if (!user) {
         if (acompanhamentoListenerUnsubscribe) {
             acompanhamentoListenerUnsubscribe();
             acompanhamentoListenerUnsubscribe = null;
             const listaAcompanhamentoDiv = document.getElementById('acompanhamento-lista');
             if (listaAcompanhamentoDiv) listaAcompanhamentoDiv.innerHTML = '<p>Nenhum ativo adicionado para acompanhamento.</p>';
         }
         if (window.unsubscribeCalculosSalvos) {
              window.unsubscribeCalculosSalvos();
              window.unsubscribeCalculosSalvos = null;
              allSavedCalculations = [];
              if (calculosSalvosListaDiv) calculosSalvosListaDiv.innerHTML = '<p>Nenhum cálculo salvo ainda.</p>';
         }
    }
});