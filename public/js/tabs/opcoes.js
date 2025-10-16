import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { fetchCurrentPrices } from '../api/brapi.js';
import { renderOpcoesRendaMensalChart, renderOpcoesEstrategiasChart, renderOpcoesPremioPorAtivoChart } from '../charts.js';

const opcoesListaDiv = document.getElementById("opcoes-lista");
const exerciciosListaDiv = document.getElementById("opcoes-exercicios-lista");
const statusFilterContainer = document.getElementById("opcoes-status-filter");

let currentStatusFilter = 'ativas'; // Estado inicial do filtro

/**
 * Renderiza os cards de resumo da aba Opções.
 * @param {Array<object>} opcoes - A lista de todas as operações com opções.
 * @param {object} precosAtuais - Objeto com os preços atuais dos ativos-objeto.
 */
function renderOpcoesSummary(opcoes, precosAtuais) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let premioTotalRecebido = 0;
    let posicoesAbertas = 0;
    let riscoExercicio = 0;

    opcoes.forEach(op => {
        const dataVenc = new Date(op.vencimento + 'T00:00:00');
        const isExpired = dataVenc < hoje;

        if (op.operacao === 'Venda') {
            premioTotalRecebido += op.premio * op.quantidade;
        }

        if (!isExpired) {
            posicoesAbertas++;
            const precoAtualAtivo = precosAtuais[op.ticker]?.price || 0;
            const isITM = op.tipo === 'Call' ? precoAtualAtivo > op.strike : precoAtualAtivo < op.strike;
            if (op.operacao === 'Venda' && isITM) {
                riscoExercicio++;
            }
        }
    });

    document.getElementById("opcoes-premio-total").textContent = premioTotalRecebido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    document.getElementById("opcoes-posicoes-abertas").textContent = posicoesAbertas;
    const riscoEl = document.getElementById("opcoes-risco-exercicio");
    riscoEl.textContent = riscoExercicio;
    riscoEl.style.color = riscoExercicio > 0 ? 'var(--negative-change)' : 'var(--positive-change)';
}

/**
 * Renderiza a tabela de compras por exercício de Venda de PUT.
 * @param {Array<object>} opcoes - A lista de todas as operações com opções.
 * @param {object} precosAtuais - Objeto com os preços atuais para verificar o exercício.
 */
function renderComprasExercidas(opcoes, precosAtuais) {
    if (!exerciciosListaDiv) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const comprasExercidas = opcoes.filter(op => {
        const dataVenc = new Date(op.vencimento + 'T00:00:00');
        const precoNoVencimento = precosAtuais[op.ticker]?.price || 0;
        const foiExercida = op.tipo === 'Put' && precoNoVencimento < op.strike;
        
        return op.operacao === 'Venda' &&
               op.tipo === 'Put' &&
               dataVenc < hoje &&
               foiExercida; 
    });

    if (comprasExercidas.length === 0) {
        exerciciosListaDiv.innerHTML = '<p style="font-size: 0.9rem; color: var(--text-secondary);">Nenhuma compra por exercício de PUT registrada.</p>';
        return;
    }
    
    const tableHeader = `
        <div class="exercicio-header">
            <div>Ativo</div>
            <div>Data Exerc.</div>
            <div>Quantidade</div>
            <div>Preço (Strike)</div>
            <div>Custo Total</div>
        </div>
    `;

    const tableRows = comprasExercidas.map(op => `
        <div class="exercicio-row">
            <div>${op.ticker}</div>
            <div>${new Date(op.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
            <div>${op.quantidade}</div>
            <div>${op.strike.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
            <div>${(op.strike * op.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
    `).join('');

    exerciciosListaDiv.innerHTML = tableHeader + tableRows;
}


export async function renderOpcoesTab(opcoes) {
    if (!opcoesListaDiv) return;

    // A lista completa de opções é mantida para os gráficos
    const allOpcoes = [...opcoes]; 

    const tickers = [...new Set(allOpcoes.map(op => op.ticker))];
    const precosAtuais = await fetchCurrentPrices(tickers);

    // Renderiza os componentes do cabeçalho com todos os dados
    renderOpcoesSummary(allOpcoes, precosAtuais);
    renderOpcoesRendaMensalChart(allOpcoes);
    renderOpcoesEstrategiasChart(allOpcoes);
    renderOpcoesPremioPorAtivoChart(allOpcoes);
    renderComprasExercidas(allOpcoes, precosAtuais);

    // *** INÍCIO DA LÓGICA DE FILTRAGEM ***
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const opcoesFiltradas = allOpcoes.filter(op => {
        const dataVenc = new Date(op.vencimento + 'T00:00:00');
        const isExpired = dataVenc < hoje;
        return currentStatusFilter === 'ativas' ? !isExpired : isExpired;
    });
    
    if (opcoesFiltradas.length === 0) {
        opcoesListaDiv.innerHTML = `<p>Nenhuma opção ${currentStatusFilter === 'ativas' ? 'ativa' : 'vencida'} encontrada.</p>`;
        return;
    }
    // *** FIM DA LÓGICA DE FILTRAGEM ***

    // Ordena as opções filtradas pela data de vencimento
    opcoesFiltradas.sort((a, b) => new Date(b.vencimento) - new Date(a.vencimento));
    
    opcoesListaDiv.innerHTML = opcoesFiltradas.map(op => {
        const precoAtualAtivo = precosAtuais[op.ticker]?.price || 0;
        const diferencaReais = precoAtualAtivo - op.strike;
        const diferencaPercent = op.strike > 0 ? (diferencaReais / op.strike) * 100 : 0;
        const isITM = op.tipo === 'Call' ? precoAtualAtivo > op.strike : precoAtualAtivo < op.strike;
        const isVenda = op.operacao === 'Venda';

        const dataVencimento = op.vencimento ? new Date(op.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';
        const isExpired = new Date(op.vencimento + 'T00:00:00') < hoje;

        let statusHtml;
        let acoesHtml = `
            <button class="btn-crud btn-editar-opcao" data-id="${op.id}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
            <button class="btn-crud btn-excluir-opcao" data-id="${op.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
        `;

        if (isExpired) {
            if (isITM) {
                statusHtml = `<span style="color: var(--negative-change); display: flex; align-items: center; gap: 6px;"><i class="fas fa-thumbs-down"></i> Exercido</span>`;
                if (op.operacao === 'Venda' && op.tipo === 'Put') {
                    acoesHtml = `<button class="btn-adicionar btn-lancar-compra" data-id="${op.id}" style="font-size: 0.8rem; padding: 6px 10px;"><i class="fas fa-plus"></i> Lançar Compra</button>` + acoesHtml;
                }
            } else {
                statusHtml = `<span style="color: var(--positive-change); display: flex; align-items: center; gap: 6px;"><i class="fas fa-thumbs-up"></i> Virou Pó</span>`;
            }
        } else {
            statusHtml = isITM 
                ? '<span style="color: var(--negative-change);">Sendo exercido</span>' 
                : '<span style="color: var(--positive-change);">Virando Pó</span>';
        }

        return `
            <div class="opcao-card">
                <div class="card-row-1">
                    <div class="ticker-info">
                        <span class="ticker-badge">${op.ticker}</span>
                        <div class="type-info">
                            <span class="tipo-operacao">${op.tipo}</span>
                            <span class="compra-venda ${isVenda ? 'operacao-venda' : 'operacao-compra'}">${op.operacao}</span>
                        </div>
                    </div>
                    <div class="strike-info">
                        <span>Strike</span>
                        <strong>${op.strike.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                    </div>
                    <div class="lista-acoes">
                        ${acoesHtml}
                    </div>
                </div>
                <div class="card-row-2">
                    <div class="data-group">
                        <div class="data-item"><span>Quantidade</span><strong>${op.quantidade}</strong></div>
                        <div class="data-item"><span>Prêmio Total</span><strong>${(op.premio * op.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
                        <div class="data-item"><span>Vencimento</span><strong>${dataVencimento}</strong></div>
                         <div class="data-item"><span>Preço Atual</span><strong>${precoAtualAtivo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
                        <div class="data-item">
                            <span>Dist. Strike</span>
                            <strong class="${diferencaReais >= 0 ? 'positive-change' : 'negative-change'}">
                                ${diferencaPercent.toFixed(2)}%
                            </strong>
                        </div>
                        <div class="data-item">
                            <span>Status</span>
                            <strong>
                                ${statusHtml}
                            </strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Event Listener para o filtro de status (Ativas/Vencidas)
if (statusFilterContainer) {
    statusFilterContainer.addEventListener('click', (e) => {
        if (e.target.matches('.filter-btn')) {
            const status = e.target.dataset.status;
            if (status !== currentStatusFilter) {
                currentStatusFilter = status;
                statusFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                // Re-renderiza a lista com o novo filtro
                if (window.allOpcoes) {
                    renderOpcoesTab(window.allOpcoes);
                }
            }
        }
    });
}


if (opcoesListaDiv) {
    opcoesListaDiv.addEventListener("click", async (e) => {
        const deleteButton = e.target.closest("button.btn-excluir-opcao");
        const editButton = e.target.closest("button.btn-editar-opcao");
        const lancarCompraButton = e.target.closest("button.btn-lancar-compra");

        if (deleteButton) {
            const docId = deleteButton.dataset.id;
            if (confirm("Tem certeza que deseja excluir este lançamento de opção?")) {
                await deleteDoc(doc(db, "opcoes", docId)).catch(
                    (err) => alert("Erro ao excluir: " + err.message)
                );
            }
            return;
        }

        if (editButton) {
            const docId = editButton.dataset.id;
            const docRef = doc(db, 'opcoes', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && typeof window.openOpcaoModal === 'function') {
                window.openOpcaoModal(docSnap.data(), docId);
            }
            return;
        }

        if (lancarCompraButton) {
            const docId = lancarCompraButton.dataset.id;
            const docRef = doc(db, 'opcoes', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && typeof window.openLancamentoModal === 'function') {
                const opcao = docSnap.data();
                const lancamentoData = {
                    ativo: opcao.ticker,
                    data: opcao.vencimento,
                    quantidade: opcao.quantidade,
                    preco: opcao.strike,
                    tipoOperacao: 'compra'
                };
                window.openLancamentoModal(lancamentoData, "", "Ações");
            }
            return;
        }
    });
}