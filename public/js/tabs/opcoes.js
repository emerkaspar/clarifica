import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { fetchCurrentPrices } from '../api/brapi.js';

const opcoesListaDiv = document.getElementById("opcoes-lista");

export async function renderOpcoesTab(opcoes) {
    if (!opcoesListaDiv) return;

    if (opcoes.length === 0) {
        opcoesListaDiv.innerHTML = `<p>Nenhuma opção lançada ainda.</p>`;
        return;
    }

    const tickers = [...new Set(opcoes.map(op => op.ticker))];
    const precosAtuais = await fetchCurrentPrices(tickers);

    opcoesListaDiv.innerHTML = opcoes.map(op => {
        const precoAtualAtivo = precosAtuais[op.ticker]?.price || 0;
        const diferencaReais = precoAtualAtivo - op.strike;
        const diferencaPercent = op.strike > 0 ? (diferencaReais / op.strike) * 100 : 0;
        const isITM = op.tipo === 'Call' ? precoAtualAtivo > op.strike : precoAtualAtivo < op.strike;
        const isVenda = op.operacao === 'Venda';

        // Formata a data de vencimento
        const dataVencimento = op.vencimento ? new Date(op.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';

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
                         <button class="btn-crud btn-editar-opcao" data-id="${op.id}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                         <button class="btn-crud btn-excluir-opcao" data-id="${op.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
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
                        <div class="data-item"><span>Status</span><strong>${isITM ? '<span class="status-classificado">ITM</span>' : '<span class="status-nao-classificado">OTM</span>'}</strong></div>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}


if (opcoesListaDiv) {
    opcoesListaDiv.addEventListener("click", async (e) => {
        const deleteButton = e.target.closest("button.btn-excluir-opcao");
        const editButton = e.target.closest("button.btn-editar-opcao");

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
    });
}