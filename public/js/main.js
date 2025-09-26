import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    getDoc,
    updateDoc,
    serverTimestamp,
    setDoc,
    getDocs,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", function () {
    // --- INICIALIZAÇÃO E REFERÊNCIAS ---
    const firebaseConfig = {
        apiKey: "AIzaSyA08o5_6YY7I1eCZ3DCPCopAJAUiC2JNdA",
        authDomain: "clarifica-invest.firebaseapp.com",
        projectId: "clarifica-invest",
        storageBucket: "clarifica-invest.appspot.com",
        messagingSenderId: "865871192847",
        appId: "1:865871192847:web:369d4b0edc96f74b29147a",
        measurementId: "G-6PG9XZJPB9",
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";

    let currentuserID = null;
    let movimentacaoChart = null;
    let proventosPorAtivoChart, proventosPorTipoChart, proventosEvolucaoChart;
    let performanceChart = null; // Gráfico do novo modal
    let currentProventosMeta = null;
    let allProventosData = [];
    let allLancamentos = [];
    let allClassificacoes = {};


    // --- LÓGICA DE AUTENTICAÇÃO E UI GERAL ---
    const btnHeaderLoginGoogle = document.getElementById(
        "btn-header-login-google"
    );
    const userInfoDiv = document.getElementById("user-info");
    const appContent = document.getElementById("app-content");
    const welcomeSection = document.getElementById("welcome-section");

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentuserID = user.uid;
            updateUIForLoggedInUser(user);
            initializeAppData(user.uid);
        } else {
            currentuserID = null;
            updateUIForLoggedOutUser();
        }
    });

    const updateUIForLoggedInUser = (user) => {
        welcomeSection.style.display = "none";
        appContent.style.display = "block";
        userInfoDiv.style.display = "flex";
        btnHeaderLoginGoogle.style.display = "none";
        document.getElementById("user-photo").src = user.photoURL;
        document.getElementById("user-name").textContent = user.displayName;
        document.getElementById("dropdown-user-name").textContent =
            user.displayName;
        document.getElementById("dropdown-user-email").textContent = user.email;
    };

    const updateUIForLoggedOutUser = () => {
        welcomeSection.style.display = "flex";
        appContent.style.display = "none";
        userInfoDiv.style.display = "none";
        btnHeaderLoginGoogle.style.display = "flex";
    };

    btnHeaderLoginGoogle.addEventListener("click", () =>
        signInWithPopup(auth, provider).catch(console.error)
    );
    document.getElementById("btn-logout").addEventListener("click", (e) => {
        e.preventDefault();
        signOut(auth).catch(console.error);
    });
    userInfoDiv.addEventListener("click", () =>
        document.getElementById("user-dropdown").classList.toggle("show")
    );
    document.addEventListener("click", (e) => {
        if (userInfoDiv && !userInfoDiv.contains(e.target))
            document.getElementById("user-dropdown").classList.remove("show");
    });

    // --- NAVEGAÇÃO POR ABAS ---
    const tabs = document.querySelectorAll(".nav-tabs .nav-link");
    const tabPanes = document.querySelectorAll(".tab-pane");
    tabs.forEach((tab) => {
        tab.addEventListener("click", function (e) {
            e.preventDefault();
            tabs.forEach((t) => t.classList.remove("active"));
            tabPanes.forEach((p) => p.classList.remove("active"));
            this.classList.add("active");
            document
                .getElementById(this.getAttribute("data-tab"))
                .classList.add("active");
        });
    });

    // --- LÓGICA PRINCIPAL DA APLICAÇÃO ---
    function initializeAppData(userID) {
        const lancamentosCollection = collection(db, "lancamentos");
        const ativosClassificadosCollection = collection(db, "ativosClassificados");
        const proventosCollection = collection(db, "proventos");

        const qLancamentos = query(
            lancamentosCollection,
            where("userID", "==", userID),
            orderBy("timestamp", "desc")
        );
        const qClassificacoes = query(
            ativosClassificadosCollection,
            where("userID", "==", userID)
        );
        const qProventos = query(
            proventosCollection,
            where("userID", "==", userID),
            orderBy("dataPagamento", "desc")
        );

        onSnapshot(qClassificacoes, (snapshot) => {
            allClassificacoes = {};
            snapshot.docs.forEach((doc) => {
                allClassificacoes[doc.id] = doc.data();
            });
            renderClassificacao(allLancamentos, allClassificacoes);
        });

        onSnapshot(qLancamentos, (snapshot) => {
            allLancamentos = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            renderHistorico(allLancamentos);
            renderClassificacao(allLancamentos, allClassificacoes);
            renderMovimentacaoChart(allLancamentos);
            renderFiisCarteira(allLancamentos, allProventosData);
        });

        const metaDocRef = doc(db, "metas", userID);
        onSnapshot(metaDocRef, (doc) => {
            currentProventosMeta = doc.exists() ? doc.data() : null;
            updateProventosDashboard();
        });

        onSnapshot(qProventos, (snapshot) => {
            allProventosData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            renderProventos(allProventosData);
            populateAssetFilter(allProventosData);
            updateProventosDashboard();
            renderFiisCarteira(allLancamentos, allProventosData);
        });

        setupLancamentosModal(userID);
        setupClassificacaoModal(userID, ativosClassificadosCollection);
        setupProventoModal(userID);
        setupMetaProventosModal(userID);
    }

    // --- LÓGICA DA ABA DE FIIS ---
    async function renderFiisCarteira(lancamentos, proventos) {
        const fiisListaDiv = document.getElementById("fiis-lista");
        fiisListaDiv.innerHTML = `<p>Buscando cotações, isso pode levar alguns segundos...</p>`;

        const fiisLancamentos = lancamentos.filter(l => l.tipoAtivo === 'FIIs');

        if (fiisLancamentos.length === 0) {
            fiisListaDiv.innerHTML = `<p>Nenhum FII lançado ainda.</p>`;
            return;
        }

        const carteira = {};

        fiisLancamentos.forEach(l => {
            if (!carteira[l.ativo]) {
                carteira[l.ativo] = {
                    ativo: l.ativo,
                    quantidade: 0,
                    quantidadeComprada: 0,
                    valorTotalInvestido: 0,
                    proventos: 0,
                    proventos12m: 0,
                };
            }
            if (l.tipoOperacao === 'compra') {
                carteira[l.ativo].quantidade += l.quantidade;
                carteira[l.ativo].quantidadeComprada += l.quantidade;
                carteira[l.ativo].valorTotalInvestido += l.valorTotal;
            } else if (l.tipoOperacao === 'venda') {
                carteira[l.ativo].quantidade -= l.quantidade;
            }
        });

        const hoje = new Date();
        const dozeMesesAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());

        proventos.forEach(p => {
            if (p.tipoAtivo === 'FIIs' && carteira[p.ativo]) {
                carteira[p.ativo].proventos += p.valor;
                const dataPagamento = new Date(p.dataPagamento + "T00:00:00");
                if (dataPagamento >= dozeMesesAtras) {
                    carteira[p.ativo].proventos12m += p.valor;
                }
            }
        });

        const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
        if (tickers.length === 0) {
            fiisListaDiv.innerHTML = `<p>Nenhum FII com posição em carteira.</p>`;
            return;
        }

        try {
            const precosAtuais = {};

            for (const ticker of tickers) {
                const response = await fetch(`https://brapi.dev/api/quote/${ticker}?token=${BRAAPI_TOKEN}`);
                const data = await response.json();

                if (response.ok && data && data.results && data.results.length > 0) {
                    const result = data.results[0];
                    precosAtuais[result.symbol] = result.regularMarketPrice;
                } else {
                    console.warn(`Não foi possível buscar o preço para o ticker: ${ticker}`);
                    precosAtuais[ticker] = 0;
                }
            }

            let html = '';
            for (const ticker of tickers) {
                const ativo = carteira[ticker];
                const precoAtual = precosAtuais[ticker] || 0;
                const precoMedio = ativo.quantidadeComprada > 0 ? ativo.valorTotalInvestido / ativo.quantidadeComprada : 0;

                const valorPosicaoAtual = precoAtual * ativo.quantidade;
                const valorInvestido = precoMedio * ativo.quantidade;
                const resultado = valorPosicaoAtual - valorInvestido;
                const variacao = precoAtual && precoMedio ? ((precoAtual / precoMedio) - 1) * 100 : 0;
                const rentabilidade = valorInvestido > 0 ? ((valorPosicaoAtual + ativo.proventos) / valorInvestido - 1) * 100 : 0;
                const dividendYield = valorPosicaoAtual > 0 ? (ativo.proventos12m / valorPosicaoAtual) * 100 : 0;
                const yieldOnCost = valorInvestido > 0 ? (ativo.proventos12m / valorInvestido) * 100 : 0;

                html += `
                    <div class="fii-card" data-ticker="${ativo.ativo}">
                        <div class="fii-card-ticker">${ativo.ativo}</div>
                        
                        <div class="fii-card-metric-main">
                            <div class="label">Valor Atual da Posição</div>
                            <div class="value">${valorPosicaoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        </div>
                        
                        <div class="fii-card-result ${resultado >= 0 ? 'positive-change' : 'negative-change'}">
                            ${resultado >= 0 ? '+' : ''}${resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${variacao.toFixed(2)}%)
                        </div>
    
                        <div class="fii-card-details">
                            <div class="detail-item">
                                <span>Valor Investido</span>
                                <span>${valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                             <div class="detail-item">
                                <span>Quantidade</span>
                                <span>${ativo.quantidade.toLocaleString('pt-BR')}</span>
                            </div>
                            <div class="detail-item">
                                <span>Preço Médio</span>
                                <span>${precoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            <div class="detail-item">
                                <span>Preço Atual</span>
                                <span>${precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                             <div class="detail-item">
                                <span>Total Proventos</span>
                                <span>${ativo.proventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            fiisListaDiv.innerHTML = html;

        } catch (error) {
            console.error("Erro ao buscar cotações ou renderizar carteira de FIIs:", error);
            fiisListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
        }
    }

    // --- LÓGICA DA ABA DE PROVENTOS ---
    const proventosListaDiv = document.getElementById("proventos-lista");

    const renderProventos = (proventos) => {
        if (proventos.length === 0) {
            proventosListaDiv.innerHTML = `<p>Nenhum provento lançado ainda.</p>`;
            return;
        }
        proventosListaDiv.innerHTML = proventos
            .map(
                (p) => `
          <div class="lista-item" style="grid-template-columns: 2fr 1fr 1.5fr 1.5fr 1.5fr auto; min-width: 600px;">
              <div class="lista-item-valor">${p.ativo}</div>
              <div><span class="tipo-ativo-badge">${p.tipoAtivo}</span></div>
              <div class="lista-item-valor provento-recebido">${p.tipoProvento
                    }</div>
              <div class="lista-item-valor">${p.dataPagamento}</div>
              <div class="lista-item-valor">${p.valor.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                    })}</div>
              <div class="lista-acoes">
                  <button class="btn-crud btn-excluir-provento" data-id="${p.id
                    }"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
              </div>
          </div>
      `
            )
            .join("");
    };

    proventosListaDiv.addEventListener("click", async (e) => {
        const button = e.target.closest("button.btn-excluir-provento");
        if (!button || !currentuserID) return;
        const docId = button.dataset.id;
        if (confirm("Tem certeza que deseja excluir este provento?")) {
            await deleteDoc(doc(db, "proventos", docId)).catch(
                (err) => alert("Erro ao excluir: " + err.message)
            );
        }
    });

    function populateAssetFilter(proventos) {
        const filtroAtivo = document.getElementById("ativo-filter");
        const tickersUnicos = [...new Set(proventos.map((p) => p.ativo))].sort();
        filtroAtivo.innerHTML = '<option value="Todos">Todos os Ativos</option>';
        tickersUnicos.forEach((ticker) => {
            const option = document.createElement("option");
            option.value = ticker;
            option.textContent = ticker;
            filtroAtivo.appendChild(option);
        });
    }

    function updateProventosDashboard() {
        if (!allProventosData) return;
        renderSummary(allProventosData, currentProventosMeta);
        renderPieCharts(allProventosData);
        renderEvolutionChart(allProventosData);
    }

    function renderSummary(proventos, meta) {
        const hoje = new Date();
        const seisMesesAtras = new Date();
        seisMesesAtras.setMonth(hoje.getMonth() - 6);
        const dozeMesesAtras = new Date();
        dozeMesesAtras.setMonth(hoje.getMonth() - 12);

        const proventosUltimos6Meses = proventos.filter(
            (p) => new Date(p.dataPagamento) >= seisMesesAtras
        );
        const totalUltimos6Meses = proventosUltimos6Meses.reduce(
            (acc, p) => acc + p.valor,
            0
        );
        const mediaMensal6Meses =
            proventosUltimos6Meses.length > 0 ? totalUltimos6Meses / 6 : 0;

        const proventosUltimos12Meses = proventos.filter(
            (p) => new Date(p.dataPagamento) >= dozeMesesAtras
        );
        const totalUltimos12Meses = proventosUltimos12Meses.reduce(
            (acc, p) => acc + p.valor,
            0
        );
        const totalCarteira = proventos.reduce((acc, p) => acc + p.valor, 0);

        document.getElementById("media-mensal-valor").textContent =
            mediaMensal6Meses.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });
        document.getElementById("total-12-meses").textContent =
            totalUltimos12Meses.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });
        document.getElementById("total-carteira-proventos").textContent =
            totalCarteira.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });

        const metaValor = meta ? meta.valor : 0;
        const percentualAtingido =
            metaValor > 0 ? (mediaMensal6Meses / metaValor) * 100 : 0;
        document.getElementById(
            "meta-mensal-valor"
        ).textContent = `Meta: ${metaValor.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
        })}`;
        document.getElementById("meta-proventos-atingida").textContent = `${percentualAtingido.toFixed(1)}%`;
        document.getElementById("progress-bar-proventos").style.width = `${Math.min(percentualAtingido, 100)}%`;
    }

    function renderPieCharts(proventos) {
        if (proventosPorAtivoChart) {
            proventosPorAtivoChart.destroy();
            proventosPorAtivoChart = null;
        }
        if (proventosPorTipoChart) {
            proventosPorTipoChart.destroy();
            proventosPorTipoChart = null;
        }

        const ctxAtivo = document.getElementById("proventos-por-ativo-chart");
        if (ctxAtivo) {
            const porAtivo = proventos.reduce((acc, p) => {
                acc[p.ativo] = (acc[p.ativo] || 0) + p.valor;
                return acc;
            }, {});
            const sortedAtivos = Object.entries(porAtivo)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7);
            const labelsAtivo = sortedAtivos.map((item) => item[0]);
            const dataAtivo = sortedAtivos.map((item) => item[1]);
            const modernColors = ["#00d9c3", "#5A67D8", "#ED64A6", "#F56565", "#ECC94B", "#4299E1", "#9F7AEA"];

            proventosPorAtivoChart = new Chart(ctxAtivo, {
                type: "doughnut",
                data: {
                    labels: labelsAtivo,
                    datasets: [{
                        data: dataAtivo,
                        backgroundColor: modernColors,
                        borderWidth: 2,
                        borderColor: "#1a1b1e",
                        borderRadius: 5,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "70%",
                    hoverOffset: 12,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: "#1A202C",
                            titleColor: "#E2E8F0",
                            bodyColor: "#E2E8F0",
                            padding: 12,
                            cornerRadius: 6,
                            borderColor: "rgba(255, 255, 255, 0.1)",
                            borderWidth: 1,
                            callbacks: {
                                label: function (context) {
                                    const label = context.label || "";
                                    const value = context.raw || 0;
                                    const total = context.chart.getDatasetMeta(0).total || 1;
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: ${percentage}%`;
                                },
                            },
                        },
                    },
                },
            });
        }

        const tipoContainer = document.getElementById("dist-por-tipo-container");
        if (tipoContainer) {
            const totalProventos = proventos.reduce((acc, p) => acc + p.valor, 0);
            const porTipo = proventos.reduce((acc, p) => {
                const tipo =
                    p.tipoAtivo === "Ações" || p.tipoAtivo === "FIIs"
                        ? p.tipoAtivo
                        : "Outros";
                acc[tipo] = (acc[tipo] || 0) + p.valor;
                return acc;
            }, {});

            let tipoHtml = "";
            Object.entries(porTipo).forEach(([label, value]) => {
                const percentage = totalProventos > 0 ? (value / totalProventos) * 100 : 0;
                tipoHtml += `
            <div class="dist-item">
                <div class="dist-label">
                    <span>${label}</span>
                    <span>${percentage.toFixed(1)}%</span>
                </div>
                <div class="dist-bar-bg">
                    <div class="dist-bar-fill" style="width: ${percentage}%;"></div>
                </div>
            </div>
        `;
            });
            tipoContainer.innerHTML =
                tipoHtml ||
                '<p style="font-size: 0.8rem; color: #a0a7b3;">Sem dados.</p>';
        }
    }

    function renderEvolutionChart(proventos) {
        const ctx = document.getElementById("proventos-evolucao-chart");
        if (!ctx) return;

        const intervalo = document.querySelector("#intervalo-filter-group .active")
            .dataset.intervalo;
        const periodo = document.getElementById("periodo-filter").value;
        const tipoAtivo = document.getElementById("tipo-ativo-filter").value;
        const ativo = document.getElementById("ativo-filter").value;

        let proventosFiltrados = [...proventos];
        if (tipoAtivo !== "Todos") {
            proventosFiltrados = proventosFiltrados.filter(
                (p) => p.tipoAtivo === tipoAtivo
            );
        }
        if (ativo !== "Todos") {
            proventosFiltrados = proventosFiltrados.filter((p) => p.ativo === ativo);
        }

        const hoje = new Date();
        let dataInicio;
        if (periodo === "12m") {
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
        } else if (periodo === "current_year") {
            dataInicio = new Date(hoje.getFullYear(), 0, 1);
        } else if (periodo === "5y") {
            dataInicio = new Date(hoje.getFullYear() - 4, 0, 1);
        }
        proventosFiltrados = proventosFiltrados.filter(
            (p) => new Date(p.dataPagamento) >= dataInicio
        );

        const aggregatedData = {};
        proventosFiltrados.forEach((p) => {
            const dataPag = new Date(p.dataPagamento + "T00:00:00");
            let key;
            if (intervalo === "Mensal") {
                key = `${dataPag.getFullYear()}-${String(
                    dataPag.getMonth() + 1
                ).padStart(2, "0")}`;
            } else {
                key = dataPag.getFullYear().toString();
            }
            aggregatedData[key] = (aggregatedData[key] || 0) + p.valor;
        });

        const sortedKeys = Object.keys(aggregatedData).sort();
        const labels = sortedKeys.map((key) => {
            if (intervalo === "Mensal") {
                const [year, month] = key.split("-");
                return new Date(year, month - 1, 1).toLocaleString("pt-BR", {
                    month: "short",
                    year: "2-digit",
                });
            }
            return key;
        });
        const data = sortedKeys.map((key) => aggregatedData[key]);

        if (proventosEvolucaoChart) proventosEvolucaoChart.destroy();
        proventosEvolucaoChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Proventos Recebidos",
                        data: data,
                        backgroundColor: "#00d9c3",
                        borderRadius: 4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || "";
                                if (label) {
                                    label += ": ";
                                }
                                const value = context.parsed.y;
                                if (value !== null) {
                                    label += value.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                    });
                                }
                                return label;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "#2a2c30" },
                        ticks: {
                            color: "#a0a7b3",
                            callback: function (value) {
                                return "R$ " + value.toLocaleString("pt-BR");
                            },
                        },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: "#a0a7b3" },
                    },
                },
            },
        });
    }

    document
        .querySelectorAll(".filter-select")
        .forEach((el) => el.addEventListener("change", updateProventosDashboard));
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            document
                .querySelectorAll(".filter-btn")
                .forEach((b) => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            updateProventosDashboard();
        });
    });

    // --- GRÁFICO DE MOVIMENTAÇÃO ---
    const renderMovimentacaoChart = (lancamentos) => {
        const chartCanvas = document.getElementById("movimentacao-chart");
        if (!chartCanvas || typeof Chart === "undefined") return;

        const last6MonthsData = {};
        const labels = [];
        const dataAtual = new Date();
        dataAtual.setDate(1);

        for (let i = 5; i >= 0; i--) {
            const date = new Date(
                dataAtual.getFullYear(),
                dataAtual.getMonth() - i,
                1
            );
            const monthYearKey = `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}`;
            labels.push(
                date.toLocaleString("pt-BR", { month: "short", year: "2-digit" })
            );
            last6MonthsData[monthYearKey] = { compra: 0, venda: 0 };
        }

        const minDateKey = Object.keys(last6MonthsData)[0];
        lancamentos.forEach((l) => {
            const [year, month, day] = l.data.split("-").map(Number);
            const dataOp = new Date(year, month - 1, day);
            const monthYearKey = `${dataOp.getFullYear()}-${String(
                dataOp.getMonth() + 1
            ).padStart(2, "0")}`;
            if (monthYearKey >= minDateKey) {
                const valor = l.valorTotal || 0;
                if (l.tipoOperacao === "compra" && last6MonthsData[monthYearKey]) {
                    last6MonthsData[monthYearKey].compra += valor;
                } else if (l.tipoOperacao === "venda" && last6MonthsData[monthYearKey]) {
                    last6MonthsData[monthYearKey].venda += valor;
                }
            }
        });

        const compras = Object.values(last6MonthsData).map((data) => data.compra);
        const vendas = Object.values(last6MonthsData).map((data) => data.venda);
        const data = {
            labels: labels,
            datasets: [
                {
                    label: "Compras (R$)",
                    data: compras,
                    backgroundColor: "rgba(0, 217, 195, 0.7)",
                    borderColor: "#00d9c3",
                    borderWidth: 1,
                    borderRadius: 6,
                },
                {
                    label: "Vendas (R$)",
                    data: vendas,
                    backgroundColor: "rgba(245, 101, 101, 0.7)",
                    borderColor: "#F56565",
                    borderWidth: 1,
                    borderRadius: 6,
                },
            ],
        };

        if (movimentacaoChart) movimentacaoChart.destroy();
        movimentacaoChart = new Chart(chartCanvas, {
            type: "bar",
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false,
                        },
                        ticks: {
                            color: "#a0a7b3",
                        },
                    },
                    y: {
                        grid: {
                            color: "#2a2c30",
                        },
                        ticks: {
                            color: "#a0a7b3",
                            callback: function (value) {
                                if (value >= 1000) {
                                    return "R$ " + value / 1000 + "k";
                                }
                                return "R$ " + value;
                            },
                        },
                    },
                },
                plugins: {
                    legend: {
                        position: "top",
                        align: "end",
                        labels: {
                            color: "#a0a7b3",
                            usePointStyle: true,
                            boxWidth: 8,
                        },
                    },
                    tooltip: {
                        backgroundColor: "#1A202C",
                        titleColor: "#E2E8F0",
                        bodyColor: "#E2E8F0",
                        padding: 12,
                        cornerRadius: 6,
                        borderColor: "rgba(255, 255, 255, 0.1)",
                        borderWidth: 1,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || "";
                                if (label) {
                                    label += ": ";
                                }
                                const value = context.parsed.y;
                                if (value !== null) {
                                    label += value.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                    });
                                }
                                return label;
                            },
                        },
                    },
                },
            },
        });
    };

    // --- LÓGICA DA ABA DE LANÇAMENTOS ---
    const historicoListaDiv = document.getElementById("historico-lista");
    const searchInput = document.getElementById("search-ativo");

    const renderHistorico = (lancamentos) => {
        const searchTerm = searchInput.value.toUpperCase();
        const lancamentosFiltrados = lancamentos.filter((l) =>
            l.ativo.toUpperCase().includes(searchTerm)
        );
        if (lancamentosFiltrados.length === 0) {
            historicoListaDiv.innerHTML = `<p>Nenhum lançamento encontrado.</p>`;
            return;
        }
        historicoListaDiv.innerHTML = lancamentosFiltrados
            .map(
                (l) => `
          <div class="lista-item" style="grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr auto; min-width: 700px;">
              <div class="lista-item-valor">${l.ativo}</div>
              <div><span class="tipo-ativo-badge">${l.tipoAtivo}</span></div>
              <div class="lista-item-valor ${l.tipoOperacao === "compra"
                        ? "operacao-compra"
                        : "operacao-venda"
                    }">${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)
                    }</div>
              <div class="lista-item-valor">${l.quantidade.toLocaleString(
                        "pt-BR"
                    )}</div>
              <div class="lista-item-valor">${l.preco.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                    })}</div>
              <div class="lista-item-valor">${l.valorTotal.toLocaleString(
                        "pt-BR",
                        { style: "currency", currency: "BRL" }
                    )}</div>
              <div class="lista-acoes">
                  <button class="btn-crud btn-editar" data-id="${l.id
                    }"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                  <button class="btn-crud btn-excluir" data-id="${l.id
                    }"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
              </div>
          </div>
      `
            )
            .join("");
    };

    historicoListaDiv.addEventListener("click", async (e) => {
        const button = e.target.closest("button.btn-crud");
        if (!button || !currentuserID) return;
        const docId = button.dataset.id;
        if (button.classList.contains("btn-excluir")) {
            if (confirm("Tem certeza que deseja excluir este lançamento?")) {
                await deleteDoc(doc(db, "lancamentos", docId)).catch(
                    (err) => alert("Erro ao excluir: " + err.message)
                );
            }
        } else if (button.classList.contains("btn-editar")) {
            const docSnap = await getDoc(doc(db, "lancamentos", docId));
            if (docSnap.exists()) {
                openLancamentoModal(docSnap.data(), docId);
            }
        }
    });

    searchInput.addEventListener("input", () => {
        renderHistorico(allLancamentos);
    });

    // --- LÓGICA DA ABA DE CLASSIFICAÇÃO ---
    const classificacaoListaDiv = document.getElementById("classificacao-lista");

    const renderClassificacao = (lancamentos, classificacoes) => {
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
        classificacaoListaDiv.innerHTML = Object.entries(ativosUnicos)
            .map(([ticker, tipo]) => {
                const isClassificado = classificacoes[ticker];
                return `
              <div class="lista-item" style="grid-template-columns: 2fr 1.5fr 1.5fr auto; min-width: 500px;">
                  <div class="lista-item-valor">${ticker}</div>
                  <div><span class="tipo-ativo-badge">${tipo}</span></div>
                  <div>
                      <span class="status-classificacao ${isClassificado
                        ? "status-classificado"
                        : "status-nao-classificado"
                    }">
                          ${isClassificado ? "Classificado" : "Não Classificado"}
                      </span>
                  </div>
                  <div class="lista-acoes">
                     <button class="btn-crud btn-classificar" data-ticker="${ticker}" data-tipo="${tipo}">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                          ${isClassificado ? "Editar" : "Classificar"}
                     </button>
                  </div>
              </div>
          `;
            })
            .join("");
    };

    classificacaoListaDiv.addEventListener("click", async (e) => {
        const button = e.target.closest("button.btn-classificar");
        if (!button || !currentuserID) return;
        const ticker = button.dataset.ticker;
        const tipo = button.dataset.tipo;
        const docRef = doc(db, "ativosClassificados", ticker);
        const docSnap = await getDoc(docRef);
        const existingData = docSnap.exists()
            ? docSnap.data().classificacoes
            : {};
        openClassificacaoModal(ticker, tipo, existingData);
    });

    // --- SETUP DOS MODAIS ---
    const closeModal = (modalId) => {
        document.getElementById(modalId).classList.remove("show");
    };
    document.querySelectorAll(".modal-close-btn, .btn-cancelar").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const modalId =
                e.currentTarget.dataset.modal ||
                e.currentTarget.closest(".modal-overlay").id;
            closeModal(modalId);
        });
    });

    function setupLancamentosModal(userID) {
        const modal = document.getElementById("lancamento-modal");
        const form = document.getElementById("form-novo-ativo");
        const hoje = new Date().toISOString().split("T")[0];
        const ativoInput = form.querySelector("#ativo");
        const sugestoesDiv = form.querySelector("#ativo-sugestoes");
        let timeoutBusca;

        ativoInput.addEventListener("input", () => {
            clearTimeout(timeoutBusca);
            const termo = ativoInput.value.trim().toUpperCase();
            if (termo.length < 2) {
                sugestoesDiv.style.display = "none";
                return;
            }
            timeoutBusca = setTimeout(async () => {
                try {
                    const resp = await fetch(
                        `https://brapi.dev/api/available?search=${termo}`
                    );
                    const data = await resp.json();
                    sugestoesDiv.innerHTML = "";
                    if (data && data.stocks && data.stocks.length > 0) {
                        sugestoesDiv.style.display = "block";
                        data.stocks.slice(0, 10).forEach((stock) => {
                            const div = document.createElement("div");
                            div.className = "sugestao-item";
                            div.textContent = stock;
                            div.onclick = () => {
                                ativoInput.value = stock;
                                sugestoesDiv.style.display = "none";
                            };
                            sugestoesDiv.appendChild(div);
                        });
                    } else {
                        sugestoesDiv.style.display = "none";
                    }
                } catch (e) {
                    console.error("Erro ao buscar ativos:", e);
                    sugestoesDiv.style.display = "none";
                }
            }, 400);
        });
        document.addEventListener("click", (e) => {
            if (
                ativoInput &&
                !ativoInput.contains(e.target) &&
                !sugestoesDiv.contains(e.target)
            ) {
                sugestoesDiv.style.display = "none";
            }
        });

        const calcularTotal = () => {
            const qtd = parseFloat(form.quantidade.value) || 0;
            const prc = parseFloat(form.preco.value) || 0;
            const cst = parseFloat(form["outros-custos"].value) || 0;
            form.querySelector("#valor-total-calculado").textContent = (
                qtd * prc +
                cst
            ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        };

        form
            .querySelectorAll("input[type='number']")
            .forEach((el) => el.addEventListener("input", calcularTotal));
        form.querySelector(".btn-compra").addEventListener("click", () => {
            form.querySelector("#operacao-tipo").value = "compra";
            form.querySelector(".btn-compra").classList.add("active");
            form.querySelector(".btn-venda").classList.remove("active");
        });
        form.querySelector(".btn-venda").addEventListener("click", () => {
            form.querySelector("#operacao-tipo").value = "venda";
            form.querySelector(".btn-venda").classList.add("active");
            form.querySelector(".btn-compra").classList.remove("active");
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const docId = form["doc-id"].value;
            const lancamentoData = {
                userID: userID,
                tipoOperacao: form["operacao-tipo"].value,
                tipoAtivo: form["tipo-ativo"].value,
                ativo: form.ativo.value.toUpperCase(),
                data: form["data-operacao"].value,
                quantidade: parseFloat(form.quantidade.value),
                preco: parseFloat(form.preco.value),
                custos: parseFloat(form["outros-custos"].value) || 0,
                valorTotal:
                    parseFloat(form.quantidade.value) * parseFloat(form.preco.value) +
                    (parseFloat(form["outros-custos"].value) || 0),
            };

            try {
                if (docId) {
                    await updateDoc(doc(db, "lancamentos", docId), lancamentoData);
                    alert("Lançamento atualizado!");
                } else {
                    lancamentoData.timestamp = serverTimestamp();
                    await addDoc(collection(db, "lancamentos"), lancamentoData);
                    alert("Lançamento adicionado!");
                }
                // closeModal("lancamento-modal"); // LINHA REMOVIDA
            } catch (error) {
                alert("Erro ao salvar: " + error.message);
            }
        });

        document
            .getElementById("btn-mostrar-form")
            .addEventListener("click", () => openLancamentoModal());

        document
            .getElementById("btn-novo-lancamento-fii")
            .addEventListener("click", () => openLancamentoModal({}, "", "FIIs"));

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("lancamento-modal");
        });

        window.openLancamentoModal = (data = {}, id = "", tipoAtivo = null) => {
            form.reset();
            form["doc-id"].value = id;

            const tipoAtivoSelect = form.querySelector("#tipo-ativo");
            tipoAtivoSelect.disabled = false;

            document.getElementById("lancamento-modal-title").textContent = id
                ? "Editar Lançamento"
                : "Adicionar Lançamento";
            form.querySelector(".btn-adicionar").innerHTML = id
                ? '<i class="fas fa-edit"></i> Atualizar'
                : '<i class="fas fa-plus"></i> Adicionar';

            if (tipoAtivo) {
                tipoAtivoSelect.value = tipoAtivo;
                tipoAtivoSelect.disabled = true;
            } else {
                tipoAtivoSelect.value = data.tipoAtivo || "Ações";
            }

            form.ativo.value = data.ativo || "";
            form["data-operacao"].value = data.data || hoje;
            form.quantidade.value = data.quantidade || 1;
            form.preco.value = data.preco || "";
            form["outros-custos"].value = data.custos || "";
            form["operacao-tipo"].value = data.tipoOperacao || "compra";
            if (data.tipoOperacao === "venda") {
                form.querySelector(".btn-venda").click();
            } else {
                form.querySelector(".btn-compra").click();
            }
            calcularTotal();
            modal.classList.add("show");
        };
    }

    function setupProventoModal(userID) {
        const modal = document.getElementById("provento-modal");
        const form = document.getElementById("form-novo-provento");
        const hoje = new Date().toISOString().split("T")[0];
        const ativoInput = form.querySelector("#provento-ativo");
        const sugestoesDiv = form.querySelector("#provento-ativo-sugestoes");
        let timeoutBusca;

        ativoInput.addEventListener("input", () => {
            clearTimeout(timeoutBusca);
            const termo = ativoInput.value.trim().toUpperCase();
            if (termo.length < 2) {
                sugestoesDiv.style.display = "none";
                return;
            }
            timeoutBusca = setTimeout(async () => {
                try {
                    const resp = await fetch(
                        `https://brapi.dev/api/available?search=${termo}`
                    );
                    const data = await resp.json();
                    sugestoesDiv.innerHTML = "";
                    if (data && data.stocks && data.stocks.length > 0) {
                        sugestoesDiv.style.display = "block";
                        data.stocks.slice(0, 10).forEach((stock) => {
                            const div = document.createElement("div");
                            div.className = "sugestao-item";
                            div.textContent = stock;
                            div.onclick = () => {
                                ativoInput.value = stock;
                                sugestoesDiv.style.display = "none";
                            };
                            sugestoesDiv.appendChild(div);
                        });
                    } else {
                        sugestoesDiv.style.display = "none";
                    }
                } catch (e) {
                    console.error("Erro ao buscar ativos:", e);
                    sugestoesDiv.style.display = "none";
                }
            }, 400);
        });
        document.addEventListener("click", (e) => {
            if (
                ativoInput &&
                !ativoInput.contains(e.target) &&
                !sugestoesDiv.contains(e.target)
            ) {
                sugestoesDiv.style.display = "none";
            }
        });

        form.querySelectorAll(".btn-tipo-provento").forEach((btn) => {
            btn.addEventListener("click", () => {
                form
                    .querySelectorAll(".btn-tipo-provento")
                    .forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                form.querySelector("#provento-tipo-ativo").value = btn.dataset.tipo;
            });
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const proventoData = {
                userID: userID,
                tipoAtivo: form["provento-tipo-ativo"].value,
                ativo: form["provento-ativo"].value.toUpperCase(),
                tipoProvento: form["provento-tipo-provento"].value,
                dataPagamento: form["provento-data-pagamento"].value,
                valor: parseFloat(form["provento-valor"].value),
                timestamp: serverTimestamp(),
            };

            try {
                await addDoc(collection(db, "proventos"), proventoData);
                alert("Provento lançado com sucesso!");
                form.reset();
                // closeModal("provento-modal"); // LINHA REMOVIDA
            } catch (error) {
                alert("Erro ao lançar provento: " + error.message);
            }
        });

        document
            .getElementById("btn-lancamento-provento")
            .addEventListener("click", () => {
                form["provento-data-pagamento"].value = hoje;
                form["provento-tipo-provento"].value = "Dividendos";
                modal.classList.add("show");
            });
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("provento-modal");
        });
    }

    function setupMetaProventosModal(userID) {
        const modal = document.getElementById("meta-proventos-modal");
        const form = document.getElementById("form-meta-proventos");
        const openBtn = document.getElementById("btn-meta-proventos");

        const loadUserMeta = async () => {
            if (!userID) return;
            const metaDocRef = doc(db, "metas", userID);
            const docSnap = await getDoc(metaDocRef);
            if (docSnap.exists()) {
                const metaData = docSnap.data();
                form["meta-valor"].value = metaData.valor;
                form["meta-data-conclusao"].value = metaData.dataConclusao;
            } else {
                form.reset();
            }
        };

        openBtn.addEventListener("click", () => {
            loadUserMeta();
            modal.classList.add("show");
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("meta-proventos-modal");
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const metaData = {
                userID: userID,
                valor: parseFloat(form["meta-valor"].value),
                dataConclusao: form["meta-data-conclusao"].value,
                timestamp: serverTimestamp(),
            };

            if (!metaData.valor || !metaData.dataConclusao) {
                alert("Por favor, preencha todos os campos.");
                return;
            }

            try {
                const metaDocRef = doc(db, "metas", userID);
                await setDoc(metaDocRef, metaData);
                alert("Meta de proventos salva com sucesso!");
                closeModal("meta-proventos-modal");
            } catch (error) {
                console.error("Erro ao salvar a meta: ", error);
                alert("Ocorreu um erro ao salvar a meta. Tente novamente.");
            }
        });
    }

    function setupClassificacaoModal(userID, collectionRef) {
        const modal = document.getElementById("classificacao-modal");
        const form = document.getElementById("form-classificacao");
        const fieldsContainer = document.getElementById(
            "classificacao-fields-container"
        );

        const gerarCampos = (tipo, valores) => {
            let html = "";
            if (tipo === "FIIs") {
                html = `
              <div>
                  <label class="form-label">Tipo FII</label>
                  <select name="Tipo FII" class="form-select">
                      <option value="Tijolo" ${valores["Tipo FII"] === "Tijolo" ? "selected" : ""
                    }>Tijolo</option>
                      <option value="Papel" ${valores["Tipo FII"] === "Papel" ? "selected" : ""
                    }>Papel</option>
                      <option value="Híbrido" ${valores["Tipo FII"] === "Híbrido" ? "selected" : ""
                    }>Híbrido</option>
                      <option value="Fundo de Fundos" ${valores["Tipo FII"] === "Fundo de Fundos"
                        ? "selected"
                        : ""
                    }>Fundo de Fundos</option>
                  </select>
              </div>
              <div>
                  <label class="form-label">Risco FII</label>
                  <select name="Risco FII" class="form-select">
                      <option value="Arrojado" ${valores["Risco FII"] === "Arrojado" ? "selected" : ""
                    }>Arrojado</option>
                      <option value="Crescimento" ${valores["Risco FII"] === "Crescimento" ? "selected" : ""
                    }>Crescimento</option>
                      <option value="Ancoragem" ${valores["Risco FII"] === "Ancoragem" ? "selected" : ""
                    }>Ancoragem</option>
                  </select>
              </div>`;
            } else if (tipo === "Ações") {
                html = `
              <div>
                  <label class="form-label">Capitalização</label>
                  <select name="Capitalização" class="form-select">
                      <option value="Blue Chip" ${valores["Capitalização"] === "Blue Chip"
                        ? "selected"
                        : ""
                    }>Blue Chip</option>
                      <option value="Small Cap" ${valores["Capitalização"] === "Small Cap"
                        ? "selected"
                        : ""
                    }>Small Cap</option>
                  </select>
              </div>
              <div>
                  <label class="form-label">Setor BESST</label>
                  <select name="Setor BESST" class="form-select">
                      <option value="Bancos" ${valores["Setor BESST"] === "Bancos" ? "selected" : ""
                    }>Bancos</option>
                      <option value="Energia" ${valores["Setor BESST"] === "Energia" ? "selected" : ""
                    }>Energia</option>
                      <option value="Saneamento" ${valores["Setor BESST"] === "Saneamento" ? "selected" : ""
                    }>Saneamento</option>
                      <option value="Seguros" ${valores["Setor BESST"] === "Seguros" ? "selected" : ""
                    }>Seguros</option>
                      <option value="Telecomunicações" ${valores["Setor BESST"] === "Telecomunicações"
                        ? "selected"
                        : ""
                    }>Telecomunicações</option>
                      <option value="Outro" ${valores["Setor BESST"] === "Outro" ? "selected" : ""
                    }>Outro</option>
                  </select>
              </div>`;
            }
            fieldsContainer.innerHTML = html;
        };

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const ticker = form["classificacao-ativo-ticker"].value;
            const tipo = form["classificacao-ativo-tipo"].value;
            const classificacoes = {};
            form
                .querySelectorAll("select")
                .forEach((select) => {
                    classificacoes[select.name] = select.value;
                });
            try {
                const docRef = doc(db, "ativosClassificados", ticker);
                await setDoc(docRef, {
                    userID: userID,
                    ativo: ticker,
                    tipoAtivo: tipo,
                    classificacoes: classificacoes,
                });
                alert("Classificação salva com sucesso!");
                closeModal("classificacao-modal");
            } catch (error) {
                alert("Erro ao salvar classificação: " + error.message);
            }
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("classificacao-modal");
        });

        window.openClassificacaoModal = (ticker, tipo, valores = {}) => {
            form.reset();
            form["classificacao-ativo-ticker"].value = ticker;
            form["classificacao-ativo-tipo"].value = tipo;
            document.getElementById("classificacao-ativo-nome").textContent = ticker;
            gerarCampos(tipo, valores);
            modal.classList.add("show");
        };
    }

    // --- LÓGICA DO MODAL DE DETALHES DO FII ---
    const fiiDetalhesModal = document.getElementById("fii-detalhes-modal");

    document.getElementById("fiis-lista").addEventListener("click", (e) => {
        const card = e.target.closest(".fii-card");
        if (card && card.dataset.ticker) {
            openFiiDetalhesModal(card.dataset.ticker);
        }
    });

    fiiDetalhesModal.addEventListener("click", (e) => {
        if (e.target === fiiDetalhesModal || e.target.closest('.modal-close-btn')) {
            fiiDetalhesModal.classList.remove("show");
        }
    });

    fiiDetalhesModal.querySelector(".fii-detalhes-tabs").addEventListener("click", (e) => {
        if (e.target.matches('.fii-detalhes-tab-link')) {
            const tabId = e.target.dataset.tab;
            fiiDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
            fiiDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`fii-detalhes-${tabId}`).classList.add('active');
        }
    });

    function openFiiDetalhesModal(ticker) {
        document.getElementById("fii-detalhes-modal-title").textContent = `Detalhes de ${ticker}`;

        const lancamentosDoAtivo = allLancamentos.filter(l => l.ativo === ticker).sort((a, b) => new Date(a.data) - new Date(b.data));
        const proventosDoAtivo = allProventosData.filter(p => p.ativo === ticker);

        renderDetalhesLancamentos(lancamentosDoAtivo);
        renderDetalhesProventos(proventosDoAtivo);
        renderPerformanceChart(ticker, lancamentosDoAtivo);

        // Reset para a primeira aba sempre que abrir
        fiiDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
        fiiDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
        fiiDetalhesModal.querySelector('[data-tab="performance"]').classList.add('active');
        document.getElementById('fii-detalhes-performance').classList.add('active');

        fiiDetalhesModal.classList.add("show");
    }

    function renderDetalhesLancamentos(lancamentos) {
        const container = document.getElementById("fii-detalhes-lancamentos");
        if (lancamentos.length === 0) {
            container.innerHTML = "<p>Nenhum lançamento para este ativo.</p>";
            return;
        }

        let html = `
            <div class="detalhes-lista-header">
                <div class="header-col">Data</div>
                <div class="header-col">Operação</div>
                <div class="header-col">Valor Total</div>
            </div>
        `;
        lancamentos.forEach(l => {
            html += `
                <div class="detalhes-lista-item">
                    <div>${new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    <div class="${l.tipoOperacao === 'compra' ? 'operacao-compra' : 'operacao-venda'}">${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)} (${l.quantidade} x ${l.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</div>
                    <div>${l.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function renderDetalhesProventos(proventos) {
        const container = document.getElementById("fii-detalhes-proventos");
        if (proventos.length === 0) {
            container.innerHTML = "<p>Nenhum provento para este ativo.</p>";
            return;
        }
        let html = `
            <div class="detalhes-lista-header">
                <div class="header-col">Data Pag.</div>
                <div class="header-col">Tipo</div>
                <div class="header-col">Valor Recebido</div>
            </div>
        `;
        proventos.forEach(p => {
            html += `
                <div class="detalhes-lista-item">
                    <div>${new Date(p.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    <div>${p.tipoProvento}</div>
                    <div>${p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async function renderPerformanceChart(ticker, lancamentosDoAtivo) {
        const container = document.getElementById('fii-detalhes-performance');
        const canvas = document.getElementById('performance-chart');
        const ctx = canvas.getContext('2d');
        
        if (performanceChart) {
            performanceChart.destroy();
        }

        // Limpa o container e mostra o canvas
        container.innerHTML = '';
        container.appendChild(canvas);

        if (lancamentosDoAtivo.length === 0) {
            container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Sem lançamentos para gerar gráfico de performance.</p>';
            return;
        }

        try {
            const dataInicio = lancamentosDoAtivo[0].data;
            const hoje = new Date().toISOString().split('T')[0];

            const [ativoResponse, cdiResponse] = await Promise.all([
                fetch(`https://brapi.dev/api/quote/${ticker}?range=5y&interval=1d&token=${BRAAPI_TOKEN}`),
                fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dataInicio.split('-').reverse().join('/')}&dataFinal=${hoje.split('-').reverse().join('/')}`)
            ]);
            
            // --- INÍCIO DA CORREÇÃO ---
            // Verificação de segurança para a resposta da API do ativo
            if (!ativoResponse.ok) {
                throw new Error(`Erro ao buscar dados do ativo: ${ativoResponse.statusText}`);
            }
            const dadosAtivo = await ativoResponse.json();
            if (dadosAtivo.error || !dadosAtivo.results || dadosAtivo.results.length === 0) {
                throw new Error(dadosAtivo.message || `Ticker ${ticker} não encontrado ou sem dados históricos.`);
            }

            // Verificação de segurança para a resposta da API do CDI
            if (!cdiResponse.ok) {
                throw new Error(`Erro ao buscar dados do CDI: ${cdiResponse.statusText}`);
            }
            const dadosCDI = await cdiResponse.json();
            // --- FIM DA CORREÇÃO ---


            const historicoPrecos = dadosAtivo.results[0].historicalDataPrice.reduce((acc, item) => {
                const data = new Date(item.date * 1000).toISOString().split('T')[0];
                acc[data] = item.close;
                return acc;
            }, {});

            let cdiAcumulado = 1;
            const historicoCDI = dadosCDI.reduce((acc, item) => {
                const data = item.data.split('/').reverse().join('-');
                cdiAcumulado *= (1 + (parseFloat(item.valor) / 100));
                acc[data] = cdiAcumulado;
                return acc;
            }, {});

            const labels = [];
            const dataCarteira = [];
            const dataCDI = [];

            let quantidade = 0;
            let valorInvestido = 0;
            let cdiBaseValue = 0;

            const dataInicialLancamento = new Date(lancamentosDoAtivo[0].data + 'T00:00:00');
            const hojeDate = new Date();

            let ultimoCDI = 1;
            for (let d = new Date(dataInicialLancamento); d <= hojeDate; d.setDate(d.getDate() + 1)) {
                const dataAtualStr = d.toISOString().split('T')[0];
                labels.push(dataAtualStr);

                const lancamentosDoDia = lancamentosDoAtivo.filter(l => l.data === dataAtualStr);
                if (lancamentosDoDia.length > 0) {
                    lancamentosDoDia.forEach(l => {
                         if (l.tipoOperacao === 'compra') {
                            valorInvestido += l.valorTotal;
                            quantidade += l.quantidade;
                        } else {
                            const proporcaoVenda = l.quantidade / quantidade;
                            valorInvestido *= (1 - proporcaoVenda);
                            quantidade -= l.quantidade;
                        }
                    });
                     // Ajusta o valor base do CDI a cada novo aporte
                    cdiBaseValue = valorInvestido / ultimoCDI;
                }
                
                ultimoCDI = historicoCDI[dataAtualStr] || ultimoCDI;
                const precoDoDia = historicoPrecos[dataAtualStr];

                if(precoDoDia && quantidade > 0) {
                     dataCarteira.push(quantidade * precoDoDia);
                } else if(dataCarteira.length > 0) {
                    dataCarteira.push(dataCarteira[dataCarteira.length - 1]);
                } else {
                    dataCarteira.push(0);
                }
                dataCDI.push(cdiBaseValue * ultimoCDI);
            }
            
            const primeiroValorCarteira = dataCarteira.find(v => v > 0) || 1;
            const primeiroValorCDI = dataCDI.find(v => v > 0) || 1;

            const dataCarteiraNormalizada = dataCarteira.map(v => (v / primeiroValorCarteira) * 100);
            const dataCDINormalizada = dataCDI.map(v => (v / primeiroValorCDI) * 100);
            
            performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `Performance ${ticker}`,
                        data: dataCarteiraNormalizada,
                        borderColor: '#00d9c3',
                        backgroundColor: 'rgba(0, 217, 195, 0.1)',
                        fill: true,
                        tension: 0.2,
                        pointRadius: 0,
                    }, {
                        label: 'CDI',
                        data: dataCDINormalizada,
                        borderColor: '#a0a7b3',
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { ticks: { color: '#a0a7b3' }, grid: { color: '#2a2c30' } },
                        x: { type: 'time', time: { unit: 'month' }, ticks: { color: '#a0a7b3' }, grid: { display: false } }
                    },
                    plugins: {
                        tooltip: { mode: 'index', intersect: false },
                        legend: { labels: { color: '#a0a7b3' } }
                    }
                }
            });

        } catch (error) {
            console.error("Erro ao buscar dados para o gráfico de performance:", error);
            container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Não foi possível carregar os dados de performance.<br><small>${error.message}</small></p>`;
        }
    }
});