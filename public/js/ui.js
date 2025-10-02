const userInfoDiv = document.getElementById("user-info");

// Navegação por Abas
const setupTabs = () => {
    const tabs = document.querySelectorAll(".nav-tabs .nav-link");
    const tabPanes = document.querySelectorAll(".tab-pane");
    tabs.forEach((tab) => {
        tab.addEventListener("click", function (e) {
            e.preventDefault();
            tabs.forEach((t) => t.classList.remove("active"));
            tabPanes.forEach((p) => p.classList.remove("active"));
            this.classList.add("active");
            const tabId = this.getAttribute("data-tab");
            if (tabId) {
                // --- INÍCIO DA CORREÇÃO ---
                const pane = document.getElementById(tabId);
                if (pane) {
                    pane.classList.add("active");
                } else {
                    console.error(`Erro: A área de conteúdo para a aba "${tabId}" não foi encontrada.`);
                }
                // --- FIM DA CORREÇÃO ---
            }
        });
    });
};

// Dropdown do Usuário
const setupUserDropdown = () => {
    userInfoDiv.addEventListener("click", () =>
        document.getElementById("user-dropdown").classList.toggle("show")
    );
    document.addEventListener("click", (e) => {
        if (userInfoDiv && !userInfoDiv.contains(e.target))
            document.getElementById("user-dropdown").classList.remove("show");
    });
};

// Função principal que inicializa os componentes de UI
export function initializeUI() {
    setupTabs();
    setupUserDropdown();
}