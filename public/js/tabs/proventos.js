import { db } from '../firebase-config.js';
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { renderPieCharts, renderEvolutionChart, renderProventosPorAtivoBarChart } from '../charts.js';

// --- ELEMENTOS DA UI ---
const proventosListaDiv = document.getElementById("proventos-lista");
const filtroAtivoSelect = document.getElementById("ativo-filter");

/**
 * Renderiza la lista de proventos recebidos.
 * @param {Array<object>} proventos - La lista de proventos a ser exibida.
 */
const renderProventosList = (proventos) => {
    if (!proventosListaDiv) return;
    if (proventos.length === 0) {
        proventosListaDiv.innerHTML = `<p>Nenhum provento lançado ainda.</p>`;
        return;
    }
    proventosListaDiv.innerHTML = proventos.map((p) => `
        <div class="lista-item" style="grid-template-columns: 2fr 1fr 1.5fr 1.5fr 1.5fr auto; min-width: 600px;">
            <div class="lista-item-valor">${p.ativo}</div>
            <div><span class="tipo-ativo-badge">${p.tipoAtivo}</span></div>
            <div class="lista-item-valor provento-recebido">${p.tipoProvento}</div>
            <div class="lista-item-valor">${new Date(p.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
            <div class="lista-item-valor">${p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
            <div class="lista-acoes">
                <button class="btn-crud btn-excluir-provento" data-id="${p.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
            </div>
        </div>
    `).join("");
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
 */
export function updateProventosTab(proventos, meta) {
    renderProventosList(proventos);
    populateAssetFilter(proventos);
    renderSummary(proventos, meta);
    renderPieCharts(proventos);
    renderEvolutionChart(proventos);
    renderProventosPorAtivoBarChart(proventos);
}

// --- EVENT LISTENERS ---

// Listener para excluir um provento
proventosListaDiv.addEventListener("click", async (e) => {
    const button = e.target.closest("button.btn-excluir-provento");
    if (!button) return;
    const docId = button.dataset.id;
    if (confirm("Tem certeza que deseja excluir este provento?")) {
        await deleteDoc(doc(db, "proventos", docId)).catch(
            (err) => alert("Erro ao excluir: " + err.message)
        );
    }
});

// **CÓDIGO CORRIGIDO**
// Listeners para os filtros do gráfico de evolução
const evolutionFilters = document.querySelectorAll(".filter-select, #intervalo-filter-group .filter-btn");

evolutionFilters.forEach((el) => {
    const eventType = el.tagName === 'BUTTON' ? 'click' : 'change';

    el.addEventListener(eventType, (e) => {
        // Lógica para dar a classe 'active' para os botões (Mensal/Anual)
        if (el.tagName === 'BUTTON') {
            document.querySelectorAll("#intervalo-filter-group .filter-btn").forEach((b) => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
        }

        // Se os dados de proventos estiverem disponíveis, re-renderiza o gráfico
        // A variável window.allProventos é definida no main.js
        if (window.allProventos) {
            renderEvolutionChart(window.allProventos);
        }
    });
});