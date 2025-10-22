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

// --- NOVO: Variáveis de estado para Paginação e Ordenação do Acompanhamento ---
let currentPageAcompanhamento = 1;
const itemsPerPageAcompanhamento = 10;
let sortColumnAcompanhamento = 'ticker'; // Coluna inicial de ordenação
let sortDirectionAcompanhamento = 'asc'; // Direção inicial ('asc' ou 'desc')
// --- FIM NOVO ---


function formatCurrencyDecimalInput(input) {
    let value = input.value.replace(/\D/g, '');
    if (value) {
        let numberValue = parseInt(value, 10) / 100;
        input.value = numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        input.value = '';
    }
}

// Substitua a função renderAcompanhamentoLista inteira por esta:
async function renderAcompanhamentoLista() {
    const listaDiv = document.getElementById('acompanhamento-lista');
    const headerContainer = document.getElementById('acompanhamento-header'); // ID do container do cabeçalho
    if (!listaDiv || !headerContainer || !auth.currentUser) return;

    try {
        const q = query(collection(db, "acompanhamentoTeto"), where("userID", "==", auth.currentUser.uid));
        const snapshot = await getDocs(q);
        let acompanhamentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (acompanhamentos.length === 0) {
            listaDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 15px;">Nenhum ativo adicionado para acompanhamento.</p>';
            renderAcompanhamentoPagination(0); // Limpa a paginação
            // Limpa cabeçalho ou define um padrão se necessário
            headerContainer.innerHTML = `
                <div class="header-col sortable-header" data-sort-key="ticker">Ativo</div>
                <div class="header-col sortable-header" style="text-align: right;" data-sort-key="dataDefinicao">Data Def.</div>
                <div class="header-col sortable-header" style="text-align: right;" data-sort-key="precoAtual">Preço Atual</div>
                <div class="header-col sortable-header" style="text-align: right;" data-sort-key="precoTeto">Preço Teto</div>
                <div class="header-col sortable-header" style="text-align: right;" data-sort-key="diferencaReais">Diferença (R$)</div>
                <div class="header-col sortable-header" style="text-align: right;" data-sort-key="diferencaPercent">Diferença (%)</div>
                <div class="header-col" style="text-align: right;">Ações</div>
            `;
            return;
        }

        const tickers = acompanhamentos.map(a => a.ticker);
        // Atualiza os preços atuais se necessário (ou usa os já existentes)
        // A busca de preços agora é feita apenas se necessário ou periodicamente, não a cada renderização
        const now = Date.now();
        const lastFetchKey = `lastFetch_${auth.currentUser.uid}`;
        const lastFetchTime = parseInt(localStorage.getItem(lastFetchKey) || '0');
        const priceCacheTime = 5 * 60 * 1000; // 5 minutos

        if (Object.keys(precosAtuaisAcompanhamento).length === 0 || now - lastFetchTime > priceCacheTime) {
             console.log("[Acompanhamento] Buscando preços atualizados...");
             precosAtuaisAcompanhamento = await fetchCurrentPrices(tickers);
             localStorage.setItem(lastFetchKey, now.toString());
        }

        // Adiciona dados calculados para ordenação
        acompanhamentos = acompanhamentos.map(item => {
            const precoAtualInfo = precosAtuaisAcompanhamento[item.ticker];
            const precoAtual = precoAtualInfo?.price ?? 0;
            const precoTeto = item.precoTeto || 0;
            const diferencaReais = precoAtual - precoTeto;
            const diferencaPercent = precoTeto > 0 ? (diferencaReais / precoTeto) * 100 : (precoAtual > 0 ? Infinity : 0);
             // Converte string 'YYYY-MM-DD' para objeto Date ou null
            const dataDefinicaoDate = item.dataDefinicao ? new Date(item.dataDefinicao + 'T00:00:00') : null;

            return {
                ...item,
                precoAtualNum: precoAtual,
                precoTetoNum: precoTeto,
                diferencaReaisNum: diferencaReais,
                diferencaPercentNum: isFinite(diferencaPercent) ? diferencaPercent : (diferencaReais > 0 ? Infinity : -Infinity), // Trata Infinity para ordenação
                 dataDefinicaoDate: dataDefinicaoDate // Armazena como objeto Date
            };
        });

        // --- LÓGICA DE ORDENAÇÃO ---
        acompanhamentos.sort((a, b) => {
            let valA, valB;

             // Mapeia a chave de ordenação para a chave de dados correta (Num/Date)
             const sortKeyMap = {
                 'precoAtual': 'precoAtualNum',
                 'precoTeto': 'precoTetoNum',
                 'diferencaReais': 'diferencaReaisNum',
                 'diferencaPercent': 'diferencaPercentNum',
                 'dataDefinicao': 'dataDefinicaoDate'
                 // ticker não precisa mapear
             };
             const actualSortKey = sortKeyMap[sortColumnAcompanhamento] || sortColumnAcompanhamento;

            valA = a[actualSortKey];
            valB = b[actualSortKey];


            // Trata valores nulos ou indefinidos em datas e números
            if (valA === null || valA === undefined) valA = sortDirectionAcompanhamento === 'asc' ? Infinity : -Infinity;
            if (valB === null || valB === undefined) valB = sortDirectionAcompanhamento === 'asc' ? Infinity : -Infinity;


            if (valA instanceof Date && valB instanceof Date) {
                 // Compara como datas
                return sortDirectionAcompanhamento === 'asc' ? valA - valB : valB - valA;
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                // Compara como números
                return sortDirectionAcompanhamento === 'asc' ? valA - valB : valB - valA;
            } else if (typeof valA === 'string' && typeof valB === 'string') {
                 // Compara como strings (ticker)
                return sortDirectionAcompanhamento === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
             // Fallback se tipos forem diferentes ou não comparáveis diretamente
            return 0;
        });
        // --- FIM LÓGICA DE ORDENAÇÃO ---


        // --- LÓGICA DE PAGINAÇÃO ---
        const totalItems = acompanhamentos.length;
        const totalPages = Math.ceil(totalItems / itemsPerPageAcompanhamento);
        currentPageAcompanhamento = Math.max(1, Math.min(currentPageAcompanhamento, totalPages)); // Garante que a página atual seja válida
        const startIndex = (currentPageAcompanhamento - 1) * itemsPerPageAcompanhamento;
        const endIndex = startIndex + itemsPerPageAcompanhamento;
        const paginatedItems = acompanhamentos.slice(startIndex, endIndex);
        // --- FIM LÓGICA DE PAGINAÇÃO ---

         // Mapeia a chave de dados de volta para a chave de exibição para destacar o header correto
         const displaySortKeyMap = {
             'precoAtualNum': 'precoAtual',
             'precoTetoNum': 'precoTeto',
             'diferencaReaisNum': 'diferencaReais',
             'diferencaPercentNum': 'diferencaPercent',
             'dataDefinicaoDate': 'dataDefinicao'
         };
         const displaySortColumn = displaySortKeyMap[sortColumnAcompanhamento] || sortColumnAcompanhamento;

        // Renderiza Cabeçalho com indicadores de ordenação
        headerContainer.innerHTML = `
            <div class="header-col sortable-header ${displaySortColumn === 'ticker' ? `sort-${sortDirectionAcompanhamento}` : ''}" data-sort-key="ticker">Ativo</div>
            <div class="header-col sortable-header ${displaySortColumn === 'dataDefinicao' ? `sort-${sortDirectionAcompanhamento}` : ''}" style="text-align: right;" data-sort-key="dataDefinicao">Data Def.</div>
            <div class="header-col sortable-header ${displaySortColumn === 'precoAtual' ? `sort-${sortDirectionAcompanhamento}` : ''}" style="text-align: right;" data-sort-key="precoAtual">Preço Atual</div>
            <div class="header-col sortable-header ${displaySortColumn === 'precoTeto' ? `sort-${sortDirectionAcompanhamento}` : ''}" style="text-align: right;" data-sort-key="precoTeto">Preço Teto</div>
            <div class="header-col sortable-header ${displaySortColumn === 'diferencaReais' ? `sort-${sortDirectionAcompanhamento}` : ''}" style="text-align: right;" data-sort-key="diferencaReais">Diferença (R$)</div>
            <div class="header-col sortable-header ${displaySortColumn === 'diferencaPercent' ? `sort-${sortDirectionAcompanhamento}` : ''}" style="text-align: right;" data-sort-key="diferencaPercent">Diferença (%)</div>
            <div class="header-col" style="text-align: right;">Ações</div>
        `;

        // Renderiza Itens da Página Atual
        listaDiv.innerHTML = paginatedItems.map(item => {
            const corClasse = item.diferencaReaisNum <= 0 ? 'diferenca-positiva' : 'diferenca-negativa';
            const icone = item.diferencaReaisNum <= 0 ? '<i class="fas fa-check-circle" style="color: var(--positive-change);"></i>' : '<i class="fas fa-exclamation-triangle" style="color: var(--negative-change);"></i>';
             // Formata a data (que agora é um objeto Date ou null)
            const dataDefinicaoFormatada = item.dataDefinicaoDate
                ? item.dataDefinicaoDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '-';

            return `
                <div class="lista-item acompanhamento-item" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; min-width: 700px;">
                    <div class="lista-item-valor" data-label="Ativo">${item.ticker} ${icone}</div>
                    <div style="text-align: right;" data-label="Data Def.">${dataDefinicaoFormatada}</div>
                    <div style="text-align: right;" data-label="Preço Atual">${item.precoAtualNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div style="text-align: right;" data-label="Preço Teto">${item.precoTetoNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div class="${corClasse}" style="text-align: right;" data-label="Diferença (R$)">${item.diferencaReaisNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div class="${corClasse}" style="text-align: right;" data-label="Diferença (%)">${isFinite(item.diferencaPercentNum) ? `${item.diferencaPercentNum.toFixed(2)}%` : 'N/A'}</div>
                    <div class="lista-acoes" data-label="Ações">
                        <button class="btn-crud btn-excluir-acompanhamento" data-id="${item.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"></path></svg></button>
                    </div>
                </div>
            `;
        }).join('');

        renderAcompanhamentoPagination(totalItems); // Renderiza controles de paginação

        // Reanexa listeners de exclusão usando delegação para performance e simplicidade
        // (O listener antigo no initializeAcompanhamentoPrecoTeto agora cuida disso)

    } catch (error) {
        console.error("Erro ao buscar ou renderizar lista de acompanhamento:", error);
        listaDiv.innerHTML = '<p style="color: var(--negative-change); text-align: center; padding: 15px;">Erro ao carregar dados.</p>';
        renderAcompanhamentoPagination(0); // Limpa paginação em caso de erro
    }
}


// --- NOVA FUNÇÃO: Renderizar Controles de Paginação ---
function renderAcompanhamentoPagination(totalItems) {
    const paginationContainer = document.getElementById("acompanhamento-pagination");
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / itemsPerPageAcompanhamento);
    paginationContainer.innerHTML = ''; // Limpa controles antigos

    if (totalPages <= 1) {
        return; // Não mostra paginação se só tem 1 página ou menos
    }

    // Botão "Anterior"
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> Anterior';
    prevButton.disabled = currentPageAcompanhamento === 1;
    prevButton.addEventListener('click', () => {
        if (currentPageAcompanhamento > 1) {
            currentPageAcompanhamento--;
            renderAcompanhamentoLista(); // Re-renderiza a lista
        }
    });
    paginationContainer.appendChild(prevButton);

    // Indicador de página
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPageAcompanhamento} de ${totalPages}`;
    paginationContainer.appendChild(pageIndicator);

    // Botão "Próxima"
    const nextButton = document.createElement('button');
    nextButton.innerHTML = 'Próxima <i class="fas fa-chevron-right"></i>';
    nextButton.disabled = currentPageAcompanhamento === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPageAcompanhamento < totalPages) {
            currentPageAcompanhamento++;
            renderAcompanhamentoLista(); // Re-renderiza a lista
        }
    });
    paginationContainer.appendChild(nextButton);
}
// --- FIM NOVA FUNÇÃO ---

// Modifica a função initializeAcompanhamentoPrecoTeto
// Adiciona delegação de evento para ordenação no cabeçalho
function initializeAcompanhamentoPrecoTeto(userID) {
    const form = document.getElementById('form-acompanhamento-teto');
    const tickerInput = document.getElementById('acompanhamento-ticker');
    const sugestoesDiv = document.getElementById('acompanhamento-ticker-sugestoes');
    const precoTetoInput = document.getElementById('acompanhamento-preco-teto');
    const precoAtualSpan = document.getElementById('acompanhamento-preco-atual');
    const headerContainer = document.getElementById('acompanhamento-header'); // Seleciona o container do cabeçalho
    const listaDiv = document.getElementById('acompanhamento-lista'); // Seleciona a lista para delegação do botão excluir
    let timeoutBusca;

    // --- Lógica de Input e Busca de Ticker (sem alterações) ---
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
                                    // Adiciona ou atualiza o preço no cache local para renderização imediata
                                    precosAtuaisAcompanhamento[stock] = priceData[stock];
                                    // Re-renderiza a lista para refletir o preço atualizado se o ativo já estiver lá
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
    // --- FIM Lógica de Input ---

    // --- Lógica de Submit do Formulário (sem alterações) ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticker = tickerInput.value.trim().toUpperCase();
        const precoTetoRaw = precoTetoInput.value;
        const precoTeto = parseFloat(precoTetoRaw.replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;

        if (!ticker || precoTeto <= 0) {
            alert("Por favor, preencha o ticker e um preço teto válido.");
            return;
        }

        // Usa o ticker como ID do documento para fácil sobrescrita/atualização
        const docRef = doc(db, "acompanhamentoTeto", ticker); // Alterado aqui
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
            await setDoc(docRef, dataToSave, { merge: true }); // Usa setDoc com merge
            tickerInput.value = '';
            precoTetoInput.value = '';
            precoAtualSpan.textContent = '';
            sugestoesDiv.innerHTML = '';
            sugestoesDiv.style.display = 'none';
            tickerInput.focus();
             // Força busca de preço ao adicionar novo item, caso não exista no cache
             if (!precosAtuaisAcompanhamento[ticker]) {
                const priceData = await fetchCurrentPrices([ticker]);
                if(priceData[ticker]) precosAtuaisAcompanhamento[ticker] = priceData[ticker];
             }
            // A lista será atualizada pelo onSnapshot
        } catch (error) {
            console.error("Erro ao salvar acompanhamento:", error);
            alert("Erro ao salvar o acompanhamento.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
        }
    });
    // --- FIM Lógica de Submit ---

    // --- Listener para Ordenação (Delegação de Evento) ---
    if (headerContainer) {
        headerContainer.addEventListener('click', (e) => {
            const headerClicked = e.target.closest('.sortable-header');
            if (!headerClicked) return;

            const sortKey = headerClicked.dataset.sortKey;

            if (sortColumnAcompanhamento === sortKey) {
                // Inverte a direção se clicar na mesma coluna
                sortDirectionAcompanhamento = sortDirectionAcompanhamento === 'asc' ? 'desc' : 'asc';
            } else {
                // Define nova coluna e reseta direção para ascendente
                sortColumnAcompanhamento = sortKey;
                sortDirectionAcompanhamento = 'asc';
            }
            currentPageAcompanhamento = 1; // Volta para a primeira página ao ordenar
            renderAcompanhamentoLista(); // Re-renderiza a lista com nova ordenação/página
        });
    }
    // --- FIM Listener de Ordenação ---

    // --- Listener para Exclusão (Delegação de Evento) ---
    if (listaDiv) {
        listaDiv.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.btn-excluir-acompanhamento');
            if (!deleteButton) return;

            const docId = deleteButton.dataset.id; // O ID do documento é o ticker
             const tickerParaConfirmacao = docId; // Usa o ID (ticker) para confirmação

            if (confirm(`Tem certeza que deseja remover o acompanhamento de ${tickerParaConfirmacao}?`)) {
                try {
                    await deleteDoc(doc(db, "acompanhamentoTeto", docId));
                     // Remove do cache local também
                     delete precosAtuaisAcompanhamento[tickerParaConfirmacao];
                    // A lista será atualizada automaticamente pelo listener onSnapshot
                } catch (error) {
                    console.error("Erro ao excluir acompanhamento:", error);
                    alert("Erro ao remover o ativo.");
                }
            }
        });
    }
    // --- FIM Listener de Exclusão ---


    // --- Listener do Firestore (sem alterações) ---
    if (acompanhamentoListenerUnsubscribe) {
        acompanhamentoListenerUnsubscribe();
    }
    const q = query(collection(db, "acompanhamentoTeto"), where("userID", "==", userID));
    acompanhamentoListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        // Verifica se a mudança não veio do próprio cliente para evitar loop
        if (!snapshot.metadata.hasPendingWrites) {
             console.log("[Acompanhamento] Dados atualizados pelo Firestore.");
             // Atualiza a lista, mantendo a página e ordenação atuais
            renderAcompanhamentoLista();
        } else {
             console.log("[Acompanhamento] Atualização local detectada, aguardando confirmação do servidor...");
        }
    }, (error) => {
        console.error("Erro no listener de acompanhamento:", error);
    });

    renderAcompanhamentoLista(); // Renderização inicial
}

// --- RESTANTE DO CÓDIGO (Calculadoras PEG, Teto, DCF, Salvamento, etc.) ---
// ... (O código das outras calculadoras e da lógica de salvamento/consulta permanece inalterado) ...

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
        // Primeiro remove os pontos de milhar, depois substitui a vírgula decimal por ponto
        return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
    };
    const formatToCurrency = (value) => (typeof value === 'number' && !isNaN(value)) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
    const formatToPercent = (value) => (typeof value === 'number' && !isNaN(value)) ? `${value.toFixed(2).replace('.', ',')}%` : '0,00%';

    // Formata números inteiros grandes com pontos de milhar
    const formatInteger = (input) => {
        let value = input.value.replace(/\D/g, ''); // Remove não dígitos
        if (value) {
            try {
                // Usa BigInt para números realmente grandes, se necessário, ou Number para os comuns
                input.value = Number(value).toLocaleString('pt-BR');
            } catch (e) {
                input.value = value; // Fallback se não conseguir formatar
            }
        } else {
            input.value = '';
        }
    };

    // Formata valores monetários ou decimais com vírgula
     const formatCurrencyDecimal = (input) => {
        let value = input.value.replace(/\D/g, ''); // Remove não dígitos
        if (value) {
            let numberValue = parseInt(value, 10) / 100;
             // Formata com 2 casas decimais e separadores corretos para pt-BR
            input.value = numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            input.value = '';
        }
    };

    // Formata percentuais permitindo vírgula decimal
    const formatPercentage = (input) => {
         // Permite dígitos, vírgula e ponto (para digitação inicial)
        let value = input.value.replace(/[^\d,.]/g, '');
        // Garante que só haja uma vírgula
        const commaIndex = value.indexOf(',');
        if (commaIndex !== -1) {
            value = value.substring(0, commaIndex + 1) + value.substring(commaIndex + 1).replace(/,/g, '');
        }
         // Remove pontos que não sejam separadores de milhar válidos antes da vírgula
         // (Essa parte é complexa de fazer perfeitamente no input, foca na conversão)

        // Atualiza o valor formatado se for um número válido
         if (value.trim() === '' || !isNaN(parseFloat(value.replace(/\./g, '').replace(',', '.')))) {
            input.value = value; // Mantém a digitação com vírgula
         } else if (input.value.trim() !== '') {
             // Se inválido (exceto vazio), tenta limpar ou reverter (simplificado aqui)
             // input.value = ''; // ou reverter para valor anterior se tivesse cache
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

     // Listener de busca de ticker (sem alterações significativas)
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
                                     // Formata o preço buscado antes de inserir no input
                                     cotacaoAtualInput.value = priceData[stock].price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                     // Dispara o evento de input para recalcular tudo
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

     // Listener para fechar sugestões (sem alterações)
    document.addEventListener('click', (e) => {
        if (sugestoesTetoDiv && !sugestoesTetoDiv.contains(e.target) && e.target !== tickerTetoInput) {
            sugestoesTetoDiv.style.display = 'none';
        }
    });

     // Listener unificado para formatação e cálculo
    formTeto.addEventListener('input', (e) => {
        if (e.target.id === 'teto-ticker') { e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
         // Formata números inteiros grandes
        else if (e.target.id === 'teto-lucro-projetivo' || e.target.id === 'teto-quantidade-papeis') { formatInteger(e.target); }
         // Formata cotação atual como moeda
        else if (e.target.id === 'teto-cotacao-atual') { formatCurrencyDecimal(e.target); }
         // Formata payout e yield como percentual (permite vírgula)
        else if (e.target.id === 'teto-payout' || e.target.id === 'teto-yield-minimo') { formatPercentage(e.target); }

        calculateTeto(); // Recalcula a cada input formatado
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

    // Funções auxiliares (parse, format, etc.) - Sem alterações
    const parseNumber = (value) => { /* ... */ };
    const parsePercent = (value) => { /* ... */ };
    const formatCurrency = (value, fractionDigits = 2) => { /* ... */ };
    const formatPercent = (value) => { /* ... */ };
    const formatBigNumberInput = (input) => { /* ... */ };
    const formatCurrencyInput = (input) => { /* ... */ };
    const formatPercentInput = (input) => { /* ... */ };

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

    // Função calculateDCF - Sem alterações
    function calculateDCF() { /* ... */ }
    // Função updateUI - Sem alterações
    function updateUI(projecoes, finalResults) { /* ... */ }
    // Função clearResults - Sem alterações
    function clearResults() { /* ... */ }

    // Listener de input do formulário DCF - Sem alterações
    dcfForm.addEventListener('input', (e) => { /* ... */ });

    calculateDCF(); // Cálculo inicial
}


// --- LÓGICA COMPARTILHADA DE SALVAMENTO E CONSULTA ---
// Função loadCalculation - Sem alterações
function loadCalculation(calc) { /* ... */ }
// Função renderSavedCalculations - Sem alterações
function renderSavedCalculations(searchTerm = '') { /* ... */ }

/**
 * Inicializa todas as calculadoras e funcionalidades da aba.
 */
export function initializeCalculosTab(userID) {
    initializeAcompanhamentoPrecoTeto(userID);
    initializeTetoProjetivoCalculator();
    initializePegRatioCalculator();
    initializeDCFCalculatorSimplified();

    // Listeners para abrir/fechar modais e salvar cálculos (sem alterações)
     if(btnVerSalvos) { /* ... */ }
     if(formSalvarCalculo) { /* ... */ }
     if(searchSavedCalcInput) { /* ... */ }

    // Listener do Firestore para cálculos salvos (sem alterações)
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

// Listener de autenticação para limpar listeners (sem alterações)
auth.onAuthStateChanged(user => { /* ... */ });