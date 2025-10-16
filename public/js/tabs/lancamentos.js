import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const historicoListaDiv = document.getElementById("historico-lista");
const searchInput = document.getElementById("search-ativo");
const paginationContainer = document.getElementById("lancamentos-pagination");

let currentPage = 1;
const ITEMS_PER_PAGE = 10;

/**
 * Renderiza os controles de paginação.
 * @param {number} totalItems - O número total de lançamentos a serem paginados.
 */
const renderPagination = (totalItems) => {
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) {
        return;
    }

    // Botão "Anterior"
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Anterior';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderHistorico(window.allLancamentos, window.precosEInfos);
        }
    });
    paginationContainer.appendChild(prevButton);

    // Indicador de página
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;
    paginationContainer.appendChild(pageIndicator);

    // Botão "Próxima"
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Próxima';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderHistorico(window.allLancamentos, window.precosEInfos);
        }
    });
    paginationContainer.appendChild(nextButton);
};

/**
 * Renderiza a tabela com o histórico de todos os lançamentos com paginação.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {object} precosEInfos - Objeto com preços e URLs de logos dos ativos.
 */
export function renderHistorico(lancamentos, precosEInfos = {}) {
    if (!historicoListaDiv) return;

    const searchTerm = searchInput.value.toUpperCase();

    // Filtra e ordena os lançamentos
    const lancamentosFiltrados = lancamentos
        .filter((l) => l.ativo.toUpperCase().includes(searchTerm))
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    if (lancamentosFiltrados.length === 0) {
        historicoListaDiv.innerHTML = `<p>Nenhum lançamento encontrado.</p>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // Lógica de Paginação
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const lancamentosDaPagina = lancamentosFiltrados.slice(startIndex, endIndex);

    historicoListaDiv.innerHTML = lancamentosDaPagina.map((l) => {
        const isRendaFixa = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo);
        const valorTotal = l.valorTotal || l.valorAplicado || 0;
        const quantidade = l.quantidade || '-';
        const preco = l.preco;
        const dataOperacaoFormatada = new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const ativoInfo = precosEInfos[l.ativo];
        const logoUrl = ativoInfo?.logoUrl;

        let logoHtml;
        if (l.tipoAtivo === 'FIIs') {
            logoHtml = `<div class="ativo-logo-fallback"><i class="fas fa-building"></i></div>`;
        } else if (logoUrl) {
            logoHtml = `<img src="${logoUrl}" alt="${l.ativo}" class="ativo-logo">`;
        } else {
            logoHtml = `<div class="ativo-logo-fallback"><i class="fas fa-dollar-sign"></i></div>`;
        }

        return `
            <div class="lista-item lancamento-card">
                <div class="card-cell" data-label="Ativo">
                    <div class="ativo-com-logo">
                        ${logoHtml}
                        <span>${l.ativo}</span>
                    </div>
                </div>
                <div class="card-cell" data-label="Data Operação">${dataOperacaoFormatada}</div>
                <div class="card-cell" data-label="Tipo"><span class="tipo-ativo-badge">${l.tipoAtivo}</span></div>
                <div class="card-cell" data-label="Ordem">
                    <span class="${l.tipoOperacao === "compra" ? "operacao-compra" : "operacao-venda"}">
                      ${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)}
                    </span>
                </div>
                <div class="card-cell" data-label="Quantidade">${typeof quantidade === 'number' ? quantidade.toLocaleString("pt-BR") : quantidade}</div>
                <div class="card-cell" data-label="Preço Unitário">${isRendaFixa || !preco ? '-' : preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="card-cell" data-label="Total">${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="lista-acoes">
                    <button class="btn-crud btn-editar" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                    <button class="btn-crud btn-excluir" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                </div>
            </div>
        `;
    }).join("");

    renderPagination(lancamentosFiltrados.length);
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

        if (isRendaFixa && typeof window.openRendaFixaModal === 'function') {
            window.openRendaFixaModal(lancamento, docId);
        } else if (typeof window.openLancamentoModal === 'function') {
            window.openLancamentoModal(lancamento, docId);
        }
    }
});

searchInput.addEventListener("input", () => {
    currentPage = 1; // Reseta para a primeira página ao pesquisar
    if (window.allLancamentos && window.precosEInfos) {
        renderHistorico(window.allLancamentos, window.precosEInfos);
    }
});