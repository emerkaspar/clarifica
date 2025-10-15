const userInfoDiv = document.getElementById("user-info");

// Navegação por Abas (Desktop)
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
                const pane = document.getElementById(tabId);
                if (pane) {
                    pane.classList.add("active");
                } else {
                    console.error(`Erro: A área de conteúdo para a aba "${tabId}" não foi encontrada.`);
                }
            }
        });
    });
};

// Lógica do Menu Hamburger (Móvel)
const setupMobileMenu = () => {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const mobileNavContainer = document.getElementById('mobile-nav-menu');
    const desktopNav = document.querySelector('.nav-tabs');
    const tabPanes = document.querySelectorAll('.tab-pane');

    if (!toggleBtn || !mobileNavContainer || !desktopNav) return;

    // Clona a lista de abas para dentro do menu móvel
    mobileNavContainer.appendChild(desktopNav.cloneNode(true));

    // Abre/Fecha o menu
    toggleBtn.addEventListener('click', () => {
        mobileNavContainer.classList.toggle('open');
    });

    // Lida com o clique em um link do menu móvel
    mobileNavContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            // 1. Fecha o menu
            mobileNavContainer.classList.remove('open');

            const tabId = link.getAttribute('data-tab');

            // 2. Sincroniza o estado 'active' com o menu desktop e mobile
            document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
            document.querySelectorAll(`.nav-link[data-tab="${tabId}"]`).forEach(t => t.classList.add('active'));

            // 3. Mostra o conteúdo da aba correta
            tabPanes.forEach((p) => p.classList.remove("active"));
            const pane = document.getElementById(tabId);
            if (pane) {
                pane.classList.add("active");
            }
        }
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

// Lógica para Troca de Tema
const setupThemeToggler = () => {
    const themeToggleButton = document.getElementById('theme-toggle-btn');
    if (!themeToggleButton) return;

    themeToggleButton.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // Dispara um evento para que os gráficos possam se redesenhar
        document.dispatchEvent(new Event('themeChanged'));
    });
};

// Função principal que inicializa os componentes de UI
export function initializeUI() {
    setupTabs();
    setupMobileMenu(); // Adiciona a inicialização do menu móvel
    setupUserDropdown();
    setupThemeToggler();
}