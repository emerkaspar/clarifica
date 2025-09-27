/**
 * Renderiza a lista de ativos únicos para classificação.
 * @param {Array<object>} lancamentos - A lista de todos os lançamentos para encontrar os ativos únicos.
 * @param {object} classificacoes - O objeto com as classificações já salvas.
 */
export function renderClassificacao(lancamentos, classificacoes) {
    const classificacaoListaDiv = document.getElementById("classificacao-lista");
    if (!classificacaoListaDiv) return;

    // 1. Cria um objeto com todos os ativos únicos da carteira e seu tipo
    const ativosUnicos = {};
    lancamentos.forEach((l) => {
        if (!ativosUnicos[l.ativo]) {
            ativosUnicos[l.ativo] = l.tipoAtivo;
        }
    });

    if (Object.keys(ativosUnicos).length === 0) {
        classificacaoListaDiv.innerHTML = `<p>Adicione um lançamento para começar a classificar seus ativos.</p>`;
        return;
    }

    // 2. Gera o HTML para cada ativo, verificando se ele já foi classificado ou não
    const html = Object.entries(ativosUnicos).map(([ticker, tipo]) => {
        const isClassificado = classificacoes[ticker];
        return `
            <div class="lista-item" style="grid-template-columns: 2fr 1.5fr 1.5fr auto; min-width: 500px;">
                <div class="lista-item-valor">${ticker}</div>
                <div><span class="tipo-ativo-badge">${tipo}</span></div>
                <div>
                    <span class="status-classificacao ${isClassificado ? "status-classificado" : "status-nao-classificado"}">
                        ${isClassificado ? "Classificado" : "Não Classificado"}
                    </span>
                </div>
                <div class="lista-acoes">
                   <button class="btn-crud btn-classificar" data-ticker="${ticker}" data-tipo="${tipo}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                        ${isClassificado ? "Editar" : "Classificar"}
                   </button>
                </div>
            </div>
        `;
    }).join("");

    classificacaoListaDiv.innerHTML = html;
}

// Event listener para abrir o modal de classificação.
// A função `window.openClassificacaoModal` será definida no arquivo `modals.js`
document.getElementById("classificacao-lista").addEventListener("click", (e) => {
    const button = e.target.closest("button.btn-classificar");
    // Verifica se a função global que abre o modal já existe antes de chamá-la.
    if (button && typeof window.openClassificacaoModal === 'function') {
        const ticker = button.dataset.ticker;
        const tipo = button.dataset.tipo;
        // A lógica para buscar os dados existentes e abrir o modal será
        // controlada pela própria função `openClassificacaoModal`.
        window.openClassificacaoModal(ticker, tipo);
    }
});