import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const historicoListaDiv = document.getElementById("historico-lista");
const searchInput = document.getElementById("search-ativo");

/**
 * Renderiza a tabela com o histórico de todos os lançamentos.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 */
export function renderHistorico(lancamentos) {
    if (!historicoListaDiv) return;

    const searchTerm = searchInput.value.toUpperCase();
    const lancamentosFiltrados = lancamentos.filter((l) =>
        l.ativo.toUpperCase().includes(searchTerm)
    );

    if (lancamentosFiltrados.length === 0) {
        historicoListaDiv.innerHTML = `<p>Nenhum lançamento encontrado.</p>`;
        return;
    }

    historicoListaDiv.innerHTML = lancamentosFiltrados.map((l) => {
        const isRendaFixa = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo);
        const valorTotal = l.valorTotal || l.valorAplicado || 0;
        const quantidade = l.quantidade || '-';
        const preco = l.preco;

        return `
            <div class="lista-item" style="grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr auto; min-width: 700px;">
                <div class="lista-item-valor">${l.ativo}</div>
                <div><span class="tipo-ativo-badge">${l.tipoAtivo}</span></div>
                <div class="lista-item-valor ${l.tipoOperacao === "compra" ? "operacao-compra" : "operacao-venda"}">
                  ${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)}
                </div>
                <div class="lista-item-valor">${typeof quantidade === 'number' ? quantidade.toLocaleString("pt-BR") : quantidade}</div>
                <div class="lista-item-valor">${isRendaFixa || !preco ? '-' : preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="lista-item-valor">${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="lista-acoes">
                    <button class="btn-crud btn-editar" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                    <button class="btn-crud btn-excluir" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                </div>
            </div>
        `;
    }).join("");
}

// Event listener para os botões de editar e excluir
historicoListaDiv.addEventListener("click", async (e) => {
    const button = e.target.closest("button.btn-crud");
    if (!button) return;

    const docId = button.dataset.id;
    const docRef = doc(db, "lancamentos", docId);

    if (button.classList.contains("btn-excluir")) {
        if (confirm("Tem certeza que deseja excluir este lançamento?")) {
            await deleteDoc(docRef).catch(
                (err) => alert("Erro ao excluir: " + err.message)
            );
        }
    } else if (button.classList.contains("btn-editar")) {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;

        const lancamento = docSnap.data();
        const isRendaFixa = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(lancamento.tipoAtivo);

        // Chama a função global correta para abrir o modal
        if (isRendaFixa && typeof window.openRendaFixaModal === 'function') {
            window.openRendaFixaModal(lancamento, docId);
        } else if (typeof window.openLancamentoModal === 'function') {
            window.openLancamentoModal(lancamento, docId);
        }
    }
});

// Event listener para a barra de pesquisa
searchInput.addEventListener("input", () => {
    // Re-renderiza a lista com o filtro aplicado.
    // Precisamos garantir que a variável `allLancamentos` esteja acessível.
    // A melhor forma é passá-la como argumento quando o listener do main.js for acionado.
    // Por enquanto, esta chamada funcionará se `allLancamentos` for atualizada no escopo global do main.js.
    if (window.allLancamentos) {
        renderHistorico(window.allLancamentos);
    }
});