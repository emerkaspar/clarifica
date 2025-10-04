import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { renderPieCharts, renderEvolutionChart, renderProventosPorAtivoBarChart } from '../charts.js';

// --- ELEMENTOS DA UI ---
const proventosListaDiv = document.getElementById("proventos-lista");
const filtroAtivoSelect = document.getElementById("ativo-filter");

/**
 * Renderiza a lista de proventos em formato de cards agrupados por ativo.
 * @param {Array<object>} proventos - A lista de proventos a ser exibida.
 * @param {object} precosEInfos - Objeto com preços e logos dos ativos.
 */
const renderProventosList = (proventos, precosEInfos = {}) => {
    if (!proventosListaDiv) return;

    if (proventos.length === 0) {
        proventosListaDiv.innerHTML = `<p>Nenhum provento lançado ainda.</p>`;
        return;
    }

    // 1. Agrupa proventos por ativo
    const proventosPorAtivo = proventos.reduce((acc, p) => {
        if (!acc[p.ativo]) {
            acc[p.ativo] = {
                items: [],
                total: 0,
                tipoAtivo: p.tipoAtivo
            };
        }
        acc[p.ativo].items.push(p);
        acc[p.ativo].total += p.valor;
        return acc;
    }, {});

    // 2. Ordena os ativos por nome em ordem alfabética (A-Z)
    const sortedAtivos = Object.entries(proventosPorAtivo).sort(([a], [b]) => a.localeCompare(b));

    // 3. Gera o HTML dos cards
    proventosListaDiv.innerHTML = sortedAtivos.map(([ticker, data]) => {
        const logoUrl = precosEInfos[ticker]?.logoUrl;
        let logoHtml;

        if (data.tipoAtivo === 'FIIs') {
            logoHtml = `<div class="ativo-logo-fallback"><i class="fas fa-building"></i></div>`;
        } else if (logoUrl) {
            logoHtml = `<img src="${logoUrl}" alt="${ticker}" class="ativo-logo">`;
        } else {
            logoHtml = `<div class="ativo-logo-fallback">${ticker.charAt(0)}</div>`;
        }

        const itemsHtml = data.items.map(p => `
            <div class="provento-item-row">
                <div class="card-cell" data-label="Data Pag.">${new Date(p.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                <div class="card-cell" data-label="Tipo">${p.tipoProvento}</div>
                <div class="card-cell" data-label="Valor (R$)">${p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="lista-acoes">
                    <button class="btn-crud btn-editar-provento" data-id="${p.id}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                    <button class="btn-crud btn-excluir-provento" data-id="${p.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                </div>
            </div>
        `).join('');

        return `
            <div class="provento-group-card">
                <div class="provento-group-header">
                    <div class="ativo-com-logo">
                        ${logoHtml}
                        <span>${ticker}</span>
                    </div>
                    <div class="group-summary">
                        <span>Total Recebido</span>
                        <strong>${data.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                    </div>
                    <i class="fas fa-chevron-down group-toggle-icon"></i>
                </div>
                <div class="provento-group-content collapsed">
                    <div class="provento-item-header">
                        <div>Data Pag.</div>
                        <div>Tipo</div>
                        <div>Valor (R$)</div>
                        <div style="text-align: right;">Ações</div>
                    </div>
                    ${itemsHtml}
                </div>
            </div>
        `;
    }).join("");
};


/**
 * Atualiza o card de resumo com a média mensal e a meta.
 * @param {Array<object>} proventos - A lista completa de proventos.
 * @param {object | null} meta - O objeto da meta do usuário.
 */
const renderSummary = (proventos, meta) => {
    const hoje = new Date();
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(hoje.getMonth() - 6);
    const dozeMesesAtras = new Date();
    dozeMesesAtras.setFullYear(hoje.getFullYear() - 1);

    const proventosUltimos6Meses = proventos.filter(p => new Date(p.dataPagamento) >= seisMesesAtras);
    const totalUltimos6Meses = proventosUltimos6Meses.reduce((acc, p) => acc + p.valor, 0);
    const mediaMensal6Meses = proventosUltimos6Meses.length > 0 ? totalUltimos6Meses / 6 : 0;

    const totalUltimos12Meses = proventos.filter(p => new Date(p.dataPagamento) >= dozeMesesAtras).reduce((acc, p) => acc + p.valor, 0);
    const totalCarteira = proventos.reduce((acc, p) => acc + p.valor, 0);

    document.getElementById("media-mensal-valor").textContent = mediaMensal6Meses.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    document.getElementById("total-12-meses").textContent = totalUltimos12Meses.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    document.getElementById("total-carteira-proventos").textContent = totalCarteira.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const metaValor = meta ? meta.valor : 0;
    const percentualAtingido = metaValor > 0 ? (mediaMensal6Meses / metaValor) * 100 : 0;
    document.getElementById("meta-mensal-valor").textContent = `Meta: ${metaValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
    document.getElementById("meta-proventos-atingida").textContent = `${percentualAtingido.toFixed(1)}%`;
    document.getElementById("progress-bar-proventos").style.width = `${Math.min(percentualAtingido, 100)}%`;
};

/**
 * Preenche o dropdown de filtro com os tickers únicos de proventos.
 * @param {Array<object>} proventos - A lista completa de proventos.
 */
const populateAssetFilter = (proventos) => {
    const tickersUnicos = [...new Set(proventos.map((p) => p.ativo))].sort();
    const valorAtual = filtroAtivoSelect.value;
    filtroAtivoSelect.innerHTML = '<option value="Todos">Todos os Ativos</option>';
    tickersUnicos.forEach((ticker) => {
        const option = document.createElement("option");
        option.value = ticker;
        option.textContent = ticker;
        filtroAtivoSelect.appendChild(option);
    });
    filtroAtivoSelect.value = valorAtual;
};

/**
 * Função principal que atualiza toda a aba de proventos.
 * @param {Array<object>} proventos - A lista de proventos.
 * @param {object | null} meta - O objeto da meta do usuário.
 * @param {object} precosEInfos - Objeto com preços e logos dos ativos.
 */
export function updateProventosTab(proventos, meta, precosEInfos) {
    renderProventosList(proventos, precosEInfos);
    populateAssetFilter(proventos);
    renderSummary(proventos, meta);
    renderPieCharts(proventos);
    renderEvolutionChart(proventos);
    renderProventosPorAtivoBarChart(proventos);
}

// --- EVENT LISTENERS ---

// Listener unificado para a lista de proventos (cards)
proventosListaDiv.addEventListener("click", async (e) => {
    const header = e.target.closest(".provento-group-header");
    const deleteButton = e.target.closest("button.btn-excluir-provento");
    const editButton = e.target.closest("button.btn-editar-provento");

    // Ação: Expandir/Recolher card
    if (header) {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.group-toggle-icon');
        content.classList.toggle('collapsed');
        icon.style.transform = content.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
        return;
    }

    // Ação: Excluir provento
    if (deleteButton) {
        const docId = deleteButton.dataset.id;
        if (confirm("Tem certeza que deseja excluir este provento?")) {
            await deleteDoc(doc(db, "proventos", docId)).catch(
                (err) => alert("Erro ao excluir: " + err.message)
            );
        }
        return;
    }

    // Ação: Editar provento
    if (editButton) {
        const docId = editButton.dataset.id;
        const docRef = doc(db, 'proventos', docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && typeof window.openProventoModal === 'function') {
            window.openProventoModal(docSnap.data(), docId);
        }
        return;
    }
});


const evolutionFilters = document.querySelectorAll(".filter-select, #intervalo-filter-group .filter-btn");

evolutionFilters.forEach((el) => {
    const eventType = el.tagName === 'BUTTON' ? 'click' : 'change';

    el.addEventListener(eventType, (e) => {
        if (el.tagName === 'BUTTON') {
            document.querySelectorAll("#intervalo-filter-group .filter-btn").forEach((b) => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
        }

        if (window.allProventos) {
            renderEvolutionChart(window.allProventos);
        }
    });
});