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
    let performanceChart = null;
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
            renderAcoesCarteira(allLancamentos, allProventosData);
            renderRendaFixaCarteira(allLancamentos);
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
            renderAcoesCarteira(allLancamentos, allProventosData);
        });

        setupLancamentosModal(userID);
        setupRendaFixaModal(userID);
        setupClassificacaoModal(userID, ativosClassificadosCollection);
        setupProventoModal(userID);
        setupMetaProventosModal(userID);
    }

    // --- LÓGICA DA ABA DE AÇÕES ---
    async function renderAcoesCarteira(lancamentos, proventos) {
        const acoesListaDiv = document.getElementById("acoes-lista");
        acoesListaDiv.innerHTML = `<p>Buscando cotações, isso pode levar alguns segundos...</p>`;

        const acoesLancamentos = lancamentos.filter(l => l.tipoAtivo === 'Ações');

        if (acoesLancamentos.length === 0) {
            acoesListaDiv.innerHTML = `<p>Nenhuma Ação lançada ainda.</p>`;
            return;
        }

        const carteira = {};

        acoesLancamentos.forEach(l => {
            if (!carteira[l.ativo]) {
                carteira[l.ativo] = {
                    ativo: l.ativo,
                    quantidade: 0,
                    quantidadeComprada: 0,
                    valorTotalInvestido: 0,
                    proventos: 0,
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

        proventos.forEach(p => {
            if (p.tipoAtivo === 'Ações' && carteira[p.ativo]) {
                carteira[p.ativo].proventos += p.valor;
            }
        });

        const tickers = Object.keys(carteira).filter(ticker => ticker && carteira[ticker].quantidade > 0);
        if (tickers.length === 0) {
            acoesListaDiv.innerHTML = `<p>Nenhuma Ação com posição em carteira.</p>`;
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

                html += `
                    <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="Ações">
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
            acoesListaDiv.innerHTML = html;

        } catch (error) {
            console.error("Erro ao buscar cotações ou renderizar carteira de Ações:", error);
            acoesListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Tente novamente mais tarde.</p>`;
        }
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

                html += `
                    <div class="fii-card" data-ticker="${ativo.ativo}" data-tipo-ativo="FIIs">
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

    // --- LÓGICA DA ABA DE RENDA FIXA ---
    async function renderRendaFixaCarteira(lancamentos) {
        const rendaFixaListaDiv = document.getElementById("rendafixa-lista");
        rendaFixaListaDiv.innerHTML = `<p>Calculando rentabilidade da Renda Fixa...</p>`;

        const rfLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));

        if (rfLancamentos.length === 0) {
            rendaFixaListaDiv.innerHTML = `<p>Nenhum ativo de Renda Fixa lançado ainda.</p>`;
            return;
        }

        try {
            const carteiraRF = {};
            rfLancamentos.forEach(l => {
                carteiraRF[l.id] = l;
            });

            // --- FUNÇÃO CORRIGIDA ---
            const formatDateForBCB = (dateInput) => {
                const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput + 'T00:00:00');
                if (isNaN(d.getTime())) return null;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            };

            const hoje = new Date();
            const dataMaisAntiga = rfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, rfLancamentos[0].data);
            const dataInicialBCB = formatDateForBCB(dataMaisAntiga);
            const dataFinalBCB = formatDateForBCB(hoje);

            // Códigos SGS: 12 para CDI (Selic), 433 para IPCA
            const [cdiResponse, ipcaResponse] = await Promise.all([
                fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dataInicialBCB}&dataFinal=${dataFinalBCB}`),
                fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${dataInicialBCB}&dataFinal=${dataFinalBCB}`)
            ]);

            if (!cdiResponse.ok || !ipcaResponse.ok) {
                throw new Error('Falha ao buscar dados de indexadores do Banco Central.');
            }

            const historicoCDI = await cdiResponse.json();
            const historicoIPCA = await ipcaResponse.json();

            let html = '';

            for (const id in carteiraRF) {
                const ativo = carteiraRF[id];
                const dataAplicacao = new Date(ativo.data + 'T00:00:00');

                let valorBruto = ativo.valorAplicado;
                const diasCorridos = Math.floor((hoje - dataAplicacao) / (1000 * 60 * 60 * 24));

                if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                    let acumuladorCDI = 1;
                    const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;

                    historicoCDI
                        .filter(item => {
                            const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                            return itemDate >= dataAplicacao && itemDate <= hoje;
                        })
                        .forEach(item => {
                            acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI);
                        });
                    valorBruto = ativo.valorAplicado * acumuladorCDI;

                } else if (ativo.tipoRentabilidade === 'Prefixado') {
                    const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = ativo.valorAplicado * Math.pow(1 + taxaAnual, diasUteis / 252);

                } else if (ativo.tipoRentabilidade === 'Híbrido') {
                    let acumuladorIPCA = 1;
                    const taxaPrefixadaAnual = parseFloat(ativo.taxaContratada.match(/(\d+(\.\d+)?)%/)[1]) / 100;

                    historicoIPCA
                        .filter(item => {
                            const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                            const itemMonth = itemDate.getMonth();
                            const itemYear = itemDate.getFullYear();
                            const appMonth = dataAplicacao.getMonth();
                            const appYear = dataAplicacao.getFullYear();
                            return (itemYear > appYear) || (itemYear === appYear && itemMonth >= appMonth);
                        })
                        .forEach(item => {
                            acumuladorIPCA *= (1 + parseFloat(item.valor) / 100);
                        });

                    const valorCorrigido = ativo.valorAplicado * acumuladorIPCA;
                    const diasUteis = diasCorridos * (252 / 365.25);
                    valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
                }

                const lucro = valorBruto - ativo.valorAplicado;
                let aliquotaIR = 0;
                const isentoIR = ['LCI', 'LCA', 'CRI', 'CRA'].includes(ativo.tipoAtivo);
                if (lucro > 0 && !isentoIR) {
                    if (diasCorridos <= 180) aliquotaIR = 0.225;
                    else if (diasCorridos <= 360) aliquotaIR = 0.20;
                    else if (diasCorridos <= 720) aliquotaIR = 0.175;
                    else aliquotaIR = 0.15;
                }
                const impostoDevido = lucro * aliquotaIR;
                const valorLiquido = valorBruto - impostoDevido;
                const rentabilidadeLiquida = valorLiquido - ativo.valorAplicado;
                const rentabilidadePercentual = (rentabilidadeLiquida / ativo.valorAplicado) * 100;

                html += `
                    <div class="fii-card">
                         <div class="fii-card-actions">
                            <button class="btn-crud btn-editar-rf" data-id="${id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                            <button class="btn-crud btn-excluir-rf" data-id="${id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                        </div>
                        <div class="fii-card-ticker" style="background-color: rgba(90, 103, 216, 0.1); color: #818cf8;">
                            ${ativo.ativo}
                        </div>
                        <span class="tipo-ativo-badge">${ativo.tipoAtivo}</span>

                        <div class="fii-card-metric-main">
                            <div class="label">Valor Líquido Atual</div>
                            <div class="value">${valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        </div>
                        
                        <div class="fii-card-result ${rentabilidadeLiquida >= 0 ? 'positive-change' : 'negative-change'}">
                           Rent. Líquida: ${rentabilidadeLiquida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${rentabilidadePercentual.toFixed(2)}%)
                        </div>
    
                        <div class="fii-card-details">
                            <div class="detail-item">
                                <span>Valor Aplicado</span>
                                <span>${ativo.valorAplicado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                             <div class="detail-item">
                                <span>Valor Bruto</span>
                                <span>${valorBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            <div class="detail-item">
                                <span>Taxa</span>
                                <span>${ativo.taxaContratada}</span>
                            </div>
                            <div class="detail-item">
                                <span>Vencimento</span>
                                <span>${new Date(ativo.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            </div>
                             <div class="detail-item">
                                <span>Imposto (IR)</span>
                                <span class="${impostoDevido > 0 ? 'negative-change' : ''}">- ${impostoDevido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            rendaFixaListaDiv.innerHTML = html;

        } catch (error) {
            console.error("Erro ao renderizar carteira de Renda Fixa:", error);
            rendaFixaListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Verifique o console para mais detalhes.</p>`;
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
                (l) => {
                    const isRendaFixa = ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo);
                    return `
                      <div class="lista-item" style="grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr auto; min-width: 700px;">
                          <div class="lista-item-valor">${l.ativo}</div>
                          <div><span class="tipo-ativo-badge">${l.tipoAtivo}</span></div>
                          <div class="lista-item-valor ${l.tipoOperacao === "compra" ? "operacao-compra" : "operacao-venda"}">
                            ${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)}
                          </div>
                          <div class="lista-item-valor">${isRendaFixa ? (l.quantidade || '-').toLocaleString("pt-BR") : l.quantidade.toLocaleString("pt-BR")}</div>
                          <div class="lista-item-valor">${isRendaFixa ? '-' : l.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                          <div class="lista-item-valor">${(l.valorTotal || l.valorAplicado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                          <div class="lista-acoes">
                              <button class="btn-crud btn-editar" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                              <button class="btn-crud btn-excluir" data-id="${l.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                          </div>
                      </div>
                  `;
                }
            )
            .join("");
    };


    historicoListaDiv.addEventListener("click", async (e) => {
        const button = e.target.closest("button.btn-crud");
        if (!button || !currentuserID) return;
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

            if (isRendaFixa) {
                openRendaFixaModal(lancamento, docId);
            } else {
                openLancamentoModal(lancamento, docId);
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
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
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
                closeModal("lancamento-modal");
            } catch (error) {
                alert("Erro ao salvar: " + error.message);
            }
        });

        document.getElementById("btn-mostrar-form").addEventListener("click", () => openLancamentoModal());
        document.getElementById("btn-novo-lancamento-fii").addEventListener("click", () => openLancamentoModal({}, "", "FIIs"));
        document.getElementById("btn-novo-lancamento-acao").addEventListener("click", () => openLancamentoModal({}, "", "Ações"));


        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("lancamento-modal");
        });

        window.openLancamentoModal = (data = {}, id = "", tipoAtivo = "Ações") => {
            form.reset();
            form["doc-id"].value = id;
            form.querySelector("#tipo-ativo").value = data.tipoAtivo || tipoAtivo;

            document.getElementById("lancamento-modal-title").textContent = id ? "Editar Lançamento" : "Adicionar Lançamento";
            form.querySelector(".btn-adicionar").innerHTML = id ? '<i class="fas fa-edit"></i> Atualizar' : '<i class="fas fa-plus"></i> Adicionar';

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

    // --- NOVO MODAL DE RENDA FIXA ---
    function setupRendaFixaModal(userID) {
        const modal = document.getElementById("rendafixa-modal");
        const form = document.getElementById("form-novo-rendafixa");
        const hoje = new Date().toISOString().split("T")[0];

        document.getElementById("btn-novo-lancamento-rendafixa").addEventListener("click", () => openRendaFixaModal());

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const docId = form["rendafixa-doc-id"].value;

            const lancamentoData = {
                userID: userID,
                tipoOperacao: 'compra',
                tipoAtivo: form["rendafixa-tipo-ativo"].value,
                ativo: form["rendafixa-ativo"].value,
                data: form["rendafixa-data-operacao"].value,
                dataVencimento: form["rendafixa-data-vencimento"].value,
                valorAplicado: parseFloat(form["rendafixa-valor-aplicado"].value),
                quantidade: parseFloat(form["rendafixa-quantidade"].value) || 1,
                tipoRentabilidade: form["rendafixa-tipo-rentabilidade"].value,
                taxaContratada: form["rendafixa-taxa-contratada"].value,
                valorTotal: parseFloat(form["rendafixa-valor-aplicado"].value),
            };

            try {
                if (docId) {
                    await updateDoc(doc(db, "lancamentos", docId), lancamentoData);
                    alert("Lançamento de Renda Fixa atualizado!");
                } else {
                    lancamentoData.timestamp = serverTimestamp();
                    await addDoc(collection(db, "lancamentos"), lancamentoData);
                    alert("Ativo de Renda Fixa adicionado!");
                }
                closeModal("rendafixa-modal");
            } catch (error) {
                alert("Erro ao salvar: " + error.message);
            }
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal("rendafixa-modal");
        });

        window.openRendaFixaModal = (data = {}, id = "") => {
            form.reset();
            form["rendafixa-doc-id"].value = id;

            document.getElementById("rendafixa-modal-title").textContent = id ? "Editar Renda Fixa" : "Adicionar Renda Fixa";
            form.querySelector(".btn-adicionar").innerHTML = id ? '<i class="fas fa-save"></i> Salvar' : '<i class="fas fa-plus"></i> Adicionar';

            form["rendafixa-tipo-ativo"].value = data.tipoAtivo || "Tesouro Direto";
            form["rendafixa-ativo"].value = data.ativo || "";
            form["rendafixa-data-operacao"].value = data.data || hoje;
            form["rendafixa-data-vencimento"].value = data.dataVencimento || "";
            form["rendafixa-valor-aplicado"].value = data.valorAplicado || "";
            form["rendafixa-quantidade"].value = data.quantidade || 1;
            form["rendafixa-tipo-rentabilidade"].value = data.tipoRentabilidade || "Pós-Fixado";
            form["rendafixa-taxa-contratada"].value = data.taxaContratada || "";

            modal.classList.add("show");
        };

        // Listener para os botões de editar/excluir nos cards
        document.getElementById('rendafixa-lista').addEventListener('click', async (e) => {
            const button = e.target.closest('button.btn-crud');
            if (!button) return;

            const docId = button.dataset.id;
            const docRef = doc(db, 'lancamentos', docId);

            if (button.classList.contains('btn-excluir-rf')) {
                if (confirm('Tem certeza que deseja excluir este lançamento de Renda Fixa?')) {
                    await deleteDoc(docRef);
                }
            } else if (button.classList.contains('btn-editar-rf')) {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    openRendaFixaModal(docSnap.data(), docId);
                }
            }
        });
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
                closeModal("provento-modal");
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

        // --- OPÇÕES DE CLASSIFICAÇÃO PARA FIIs ---
        const tipoFiiOpcoes = [
            "Tijolo",
            "Papel",
            "Híbrido",
            "Fundo de Fundos",
        ];

        const especieOpcoes = {
            Tijolo: [
                "Lajes corporativas / Escritórios",
                "Shoppings e centros comerciais",
                "Logística e galpões industriais",
                "Residencial",
                "Hospitais, clínicas e lajes de saúde",
                "Hotéis",
                "Agro",
            ],
            Papel: [
                "Atrelado ao CDI",
                "Atrelado ao IPCA"
            ],
            Híbrido: ["N/A"],
            "Fundo de Fundos": ["N/A"],
        };
        // ----------------------------------------


        const updateEspecieOptions = (selectedTipo, currentValue = null) => {
            const selectEspecie = document.getElementById('select-especie');
            // Define as opções, usando N/A se o tipo não tiver opções dinâmicas
            const options = especieOpcoes[selectedTipo] || ["N/A"];
            selectEspecie.innerHTML = '';

            options.forEach(opt => {
                // Verifica se o valor atual deve ser selecionado (útil ao editar)
                // Se currentValue for null, seleciona N/A por padrão se for o caso
                const isSelected = currentValue === opt || (currentValue === null && opt === "N/A");
                selectEspecie.innerHTML += `<option value="${opt}" ${isSelected ? "selected" : ""}>${opt}</option>`;
            });
        };

        const gerarCampos = (tipo, valores) => {
            let html = "";
            fieldsContainer.innerHTML = ''; // Limpa antes de gerar

            if (tipo === "FIIs") {
                const tipoFiiAtual = valores["Tipo FII"] || "Tijolo"; // Define Tijolo como padrão se não houver valor

                // 1. Campo Tipo FII
                let tipoFiiHtml = `
                <div>
                    <label class="form-label">Tipo FII</label>
                    <select name="Tipo FII" id="select-tipo-fii" class="form-select">
            `;
                tipoFiiOpcoes.forEach(opt => {
                    tipoFiiHtml += `<option value="${opt}" ${tipoFiiAtual === opt ? "selected" : ""}>${opt}</option>`;
                });
                tipoFiiHtml += `
                    </select>
                </div>
            `;

                // 2. Campo Risco FII
                const riscoFiiHtml = `
                <div>
                    <label class="form-label">Risco FII</label>
                    <select name="Risco FII" class="form-select">
                        <option value="Arrojado" ${valores["Risco FII"] === "Arrojado" ? "selected" : ""}>Arrojado</option>
                        <option value="Crescimento" ${valores["Risco FII"] === "Crescimento" ? "selected" : ""}>Crescimento</option>
                        <option value="Ancoragem" ${valores["Risco FII"] === "Ancoragem" ? "selected" : ""}>Ancoragem</option>
                    </select>
                </div>
            `;

                // 3. Campo Espécie (o conteúdo será preenchido após a injeção do HTML)
                const especieHtml = `
                <div>
                    <label class="form-label">Espécie</label>
                    <select name="Espécie" id="select-especie" class="form-select"></select>
                </div>
            `;

                html += tipoFiiHtml + riscoFiiHtml + especieHtml;
                fieldsContainer.innerHTML = html;

                // --- Lógica Dinâmica para Espécie ---
                const selectTipoFii = document.getElementById('select-tipo-fii');

                // Inicializa as opções de Espécie
                updateEspecieOptions(selectTipoFii.value, valores["Espécie"]);

                // Adiciona listener para atualizar as opções de Espécie ao mudar o Tipo FII
                selectTipoFii.addEventListener('change', (e) => {
                    const novoTipo = e.target.value;
                    // Passa null para currentValue para que selecione a primeira opção do novo tipo (ou N/A)
                    updateEspecieOptions(novoTipo, null);
                });

            } else if (tipo === "Ações") {
                html = `
                <div>
                    <label class="form-label">Capitalização</label>
                    <select name="Capitalização" class="form-select">
                        <option value="Blue Chip" ${valores["Capitalização"] === "Blue Chip" ? "selected" : ""}>Blue Chip</option>
                        <option value="Small Cap" ${valores["Capitalização"] === "Small Cap" ? "selected" : ""}>Small Cap</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Setor</label>
                    <select name="Setor BESST" class="form-select">
                        <option value="Bancos" ${valores["Setor BESST"] === "Bancos" ? "selected" : ""}>Bancos</option>
                        <option value="Energia" ${valores["Setor BESST"] === "Energia" ? "selected" : ""}>Energia</option>
                        <option value="Saneamento" ${valores["Setor BESST"] === "Saneamento" ? "selected" : ""}>Saneamento</option>
                        <option value="Seguros" ${valores["Setor BESST"] === "Seguros" ? "selected" : ""}>Seguros</option>
                        <option value="Telecomunicações" ${valores["Setor BESST"] === "Telecomunicações" ? "selected" : ""}>Telecomunicações</option>
                        <option value="Comodities" ${valores["Setor BESST"] === "Comodities" ? "selected" : ""}>Comodities</option>
                        <option value="Petróleo, Gás e Biocombustíveis" ${valores["Setor BESST"] === "Petróleo, Gás e Biocombustíveis" ? "selected" : ""}>Petróleo, Gás e Biocombustíveis</option>
                        <option value="Outro" ${valores["Setor BESST"] === "Outro" ? "selected" : ""}>Outro</option>
                    </select>
                </div>`;
                fieldsContainer.innerHTML = html;
            }
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
    // --- LÓGICA DO MODAL DE DETALHES DO ATIVO ---
    const ativoDetalhesModal = document.getElementById("ativo-detalhes-modal");

    document.getElementById("fiis-lista").addEventListener("click", (e) => {
        const card = e.target.closest(".fii-card");
        if (card && card.dataset.ticker) {
            openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
        }
    });

    document.getElementById("acoes-lista").addEventListener("click", (e) => {
        const card = e.target.closest(".fii-card");
        if (card && card.dataset.ticker) {
            openAtivoDetalhesModal(card.dataset.ticker, card.dataset.tipoAtivo);
        }
    });

    ativoDetalhesModal.addEventListener("click", (e) => {
        if (e.target === ativoDetalhesModal || e.target.closest('.modal-close-btn')) {
            ativoDetalhesModal.classList.remove("show");
        }
    });

    ativoDetalhesModal.querySelector(".fii-detalhes-tabs").addEventListener("click", (e) => {
        if (e.target.matches('.fii-detalhes-tab-link')) {
            const tabId = e.target.dataset.tab;
            ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
            ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`ativo-detalhes-${tabId}`).classList.add('active');
        }
    });

    function openAtivoDetalhesModal(ticker, tipoAtivo) {
        document.getElementById("ativo-detalhes-modal-title").textContent = `Detalhes de ${ticker}`;

        const lancamentosDoAtivo = allLancamentos.filter(l => l.ativo === ticker).sort((a, b) => new Date(a.data) - new Date(b.data));
        const proventosDoAtivo = allProventosData.filter(p => p.ativo === ticker);

        renderDetalhesLancamentos(lancamentosDoAtivo);
        renderDetalhesProventos(proventosDoAtivo);
        setTimeout(() => {
            renderPerformanceChart(ticker, lancamentosDoAtivo);
        }, 100);

        // Reset para a primeira aba sempre que abrir
        ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
        ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
        ativoDetalhesModal.querySelector('[data-tab="performance"]').classList.add('active');
        document.getElementById('ativo-detalhes-performance').classList.add('active');

        ativoDetalhesModal.classList.add("show");
    }

    function renderDetalhesLancamentos(lancamentos) {
        const container = document.getElementById("ativo-detalhes-lancamentos");
        if (lancamentos.length === 0) {
            container.innerHTML = "<p>Nenhum lançamento para este ativo.</p>";
            return;
        }

        let totalCompras = 0;
        let totalVendas = 0;

        lancamentos.forEach(l => {
            if (l.tipoOperacao === 'compra') {
                totalCompras += l.valorTotal;
            } else if (l.tipoOperacao === 'venda') {
                totalVendas += l.valorTotal;
            }
        });

        const netTotal = totalCompras - totalVendas;
        const netClass = netTotal >= 0 ? 'positive-change' : 'negative-change';

        let resumoHtml = `
        <div class="detalhes-resumo-lancamentos" style="display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #2a2c30;">
            <div class="resumo-item">
                <span style="color: #a0a7b3; font-size: 0.85rem;">Total Compras</span>
                <strong style="color: #22c55e;">${totalCompras.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
            <div class="resumo-item">
                <span style="color: #a0a7b3; font-size: 0.85rem;">Total Vendas</span>
                <strong style="color: #ef4444;">${totalVendas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
            <div class="resumo-item">
                <span style="color: #a0a7b3; font-size: 0.85rem;">Total Líquido</span>
                <strong class="${netClass}">${netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
        </div>
    `;

        let listaHtml = `
        <div class="detalhes-lista-header">
            <div class="header-col">Data</div>
            <div class="header-col">Operação</div>
            <div class="header-col">Valor Total</div>
        </div>
    `;
        lancamentos.forEach(l => {
            listaHtml += `
            <div class="detalhes-lista-item">
                <div>${new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                <div class="${l.tipoOperacao === 'compra' ? 'operacao-compra' : 'operacao-venda'}">${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)} (${l.quantidade} x ${l.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</div>
                <div>${l.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
        `;
        });

        container.innerHTML = resumoHtml + listaHtml;
    }

    function renderDetalhesProventos(proventos) {
        const container = document.getElementById("ativo-detalhes-proventos");
        if (proventos.length === 0) {
            container.innerHTML = "<p>Nenhum provento para este ativo.</p>";
            return;
        }

        const totalProventos = proventos.reduce((acc, p) => acc + p.valor, 0);

        let html = `
        <div class="detalhes-resumo-proventos" style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #2a2c30;">
            <span style="color: #a0a7b3; font-size: 0.85rem; display: block;">Total de Proventos Recebidos</span>
            <strong style="color: #00d9c3; font-size: 1.5rem;">${totalProventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>
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
                <div style="color: #00d9c3;">${p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
        `;
        });
        container.innerHTML = html;
    }

    async function renderPerformanceChart(ticker, lancamentosDoAtivo) {
        const container = document.getElementById('ativo-detalhes-performance');

        if (performanceChart) {
            performanceChart.destroy();
            performanceChart = null;
        }

        container.innerHTML = '';

        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'performance-chart';
        container.appendChild(newCanvas);

        const canvas = document.getElementById('performance-chart');

        if (!canvas) {
            container.innerHTML = `<p style="color: #a0a7b3; text-align: center;">Erro interno: Não foi possível criar o elemento do gráfico.</p>`;
            return;
        }
        const ctx = canvas.getContext('2d');

        if (lancamentosDoAtivo.length === 0) {
            container.innerHTML = '<p style="color: #a0a7b3; text-align: center;">Sem lançamentos para gerar gráfico de performance.</p>';
            return;
        }

        let dadosAtivo;
        let dadosCDI;
        let dadosIBOV;
        let dadosIVVB11;

        try {
            const lancamentosOrdenados = [...lancamentosDoAtivo].sort((a, b) => new Date(a.data) - new Date(b.data));
            const dataInicio = lancamentosOrdenados[0].data;

            const hojeDate = new Date();
            const ontemDate = new Date(hojeDate);
            ontemDate.setDate(hojeDate.getDate() - 1);
            const dataFinalParaAPI = ontemDate.toISOString().split('T')[0];

            const BRAAPI_TOKEN = "1GPPnwHZgqXU4hbU7gwosm";
            const RANGE = '3mo';

            const [ativoResponse, cdiResponse, ibovResponse, ivvb11Response] = await Promise.all([
                fetch(`https://brapi.dev/api/quote/${ticker}?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`),
                fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${dataInicio.split('-').reverse().join('/')}&dataFinal=${dataFinalParaAPI.split('-').reverse().join('/')}`),
                fetch(`https://brapi.dev/api/quote/^BVSP?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`),
                fetch(`https://brapi.dev/api/quote/IVVB11?range=${RANGE}&interval=1d&token=${BRAAPI_TOKEN}`)
            ]);

            if (!ativoResponse.ok) throw new Error(`Falha ao buscar ${ticker}`);
            dadosAtivo = await ativoResponse.json();
            if (dadosAtivo.error || !dadosAtivo.results || dadosAtivo.results.length === 0) throw new Error(`Dados indisponíveis para ${ticker}`);

            if (!cdiResponse.ok) throw new Error(`Erro ao buscar dados do CDI`);
            dadosCDI = await cdiResponse.json();

            if (!ibovResponse.ok) throw new Error(`Falha ao buscar IBOV`);
            dadosIBOV = await ibovResponse.json();

            if (!ivvb11Response.ok) throw new Error(`Falha ao buscar IVVB11`);
            dadosIVVB11 = await ivvb11Response.json();

            if (dadosIBOV.error || !dadosIBOV.results || dadosIBOV.results.length === 0) console.warn("Dados do IBOV indisponíveis.");
            if (dadosIVVB11.error || !dadosIVVB11.results || dadosIVVB11.results.length === 0) console.warn("Dados do IVVB11 indisponíveis.");

            const historicoPrecos = dadosAtivo.results[0].historicalDataPrice.reduce((acc, item) => {
                const data = new Date(item.date * 1000).toISOString().split('T')[0];
                acc[data] = item.close;
                return acc;
            }, {});

            const dataInicialLancamento = new Date(lancamentosOrdenados[0].data + 'T00:00:00');
            const dataInicioStr = dataInicialLancamento.toISOString().split('T')[0];

            let cdiAcumulado = 1;
            const historicoCDIIndex = {};
            let cdiIndexStartFactor = 1;

            dadosCDI.forEach(item => {
                const data = item.data.split('/').reverse().join('-');
                cdiAcumulado *= (1 + (parseFloat(item.valor) / 100));
                historicoCDIIndex[data] = cdiAcumulado;

                if (data === dataInicioStr) {
                    cdiIndexStartFactor = cdiAcumulado;
                }
            });

            const normalizarIndice = (dadosIndice) => {
                const precosHistoricos = dadosIndice.results[0].historicalDataPrice;
                if (!precosHistoricos || precosHistoricos.length === 0) return {};

                const indiceNoPrimeiroDia = precosHistoricos.find(item => new Date(item.date * 1000).toISOString().split('T')[0] === dataInicioStr)?.close;
                if (!indiceNoPrimeiroDia) return {};

                return precosHistoricos.reduce((acc, item) => {
                    const data = new Date(item.date * 1000).toISOString().split('T')[0];
                    acc[data] = ((item.close / indiceNoPrimeiroDia) - 1) * 100;
                    return acc;
                }, {});
            };

            const historicoIBOV = (dadosIBOV && dadosIBOV.results && dadosIBOV.results.length > 0) ? normalizarIndice(dadosIBOV) : {};
            const historicoIVVB11 = (dadosIVVB11 && dadosIVVB11.results && dadosIVVB11.results.length > 0) ? normalizarIndice(dadosIVVB11) : {};

            const labels = [];
            const dataCarteira = [];
            const dataCDI = [];
            const dataIBOV = [];
            const dataIVVB11 = [];
            const costBasisArray = [];

            let quantidade = 0;
            let valorInvestidoAcumulado = 0;

            for (let d = new Date(dataInicialLancamento); d <= hojeDate; d.setDate(d.getDate() + 1)) {
                const dataAtualStr = d.toISOString().split('T')[0];
                labels.push(dataAtualStr);

                const lancamentosDoDia = lancamentosOrdenados.filter(l => l.data === dataAtualStr);
                if (lancamentosDoDia.length > 0) {
                    lancamentosDoDia.forEach(l => {
                        if (l.tipoOperacao === 'compra') {
                            valorInvestidoAcumulado += l.valorTotal;
                            quantidade += l.quantidade;
                        } else {
                            const precoMedio = valorInvestidoAcumulado / quantidade;
                            valorInvestidoAcumulado -= l.quantidade * precoMedio;
                            quantidade -= l.quantidade;
                        }
                    });
                }

                const precoDoDia = historicoPrecos[dataAtualStr];
                if (precoDoDia && quantidade > 0) {
                    dataCarteira.push(quantidade * precoDoDia);
                } else if (dataCarteira.length > 0) {
                    dataCarteira.push(dataCarteira[dataCarteira.length - 1]);
                } else {
                    dataCarteira.push(0);
                }

                costBasisArray.push(valorInvestidoAcumulado);

                const cdiIndex = historicoCDIIndex[dataAtualStr];
                if (cdiIndex) {
                    const cdiGain = ((cdiIndex / cdiIndexStartFactor) - 1) * 100;
                    dataCDI.push(cdiGain);
                } else if (dataCDI.length > 0) {
                    dataCDI.push(dataCDI[dataCDI.length - 1]);
                } else {
                    dataCDI.push(0);
                }

                const ibovGain = historicoIBOV[dataAtualStr];
                if (typeof ibovGain === 'number') {
                    dataIBOV.push(ibovGain);
                } else if (dataIBOV.length > 0) {
                    dataIBOV.push(dataIBOV[dataIBOV.length - 1]);
                } else {
                    dataIBOV.push(0);
                }

                const ivvb11Gain = historicoIVVB11[dataAtualStr];
                if (typeof ivvb11Gain === 'number') {
                    dataIVVB11.push(ivvb11Gain);
                } else if (dataIVVB11.length > 0) {
                    dataIVVB11.push(dataIVVB11[dataIVVB11.length - 1]);
                } else {
                    dataIVVB11.push(0);
                }
            }

            const baseCustoInicial = lancamentosOrdenados[0].valorTotal;
            const baseValor = baseCustoInicial > 0 ? baseCustoInicial : 1;

            const dataCarteiraNormalizada = dataCarteira.map((v, i) => {
                const cost = costBasisArray[i];
                if (cost > 0) {
                    return ((v / cost) - 1) * 100;
                }
                return 0;
            });

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
                        data: dataCDI,
                        borderColor: '#a0a7b3',
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                    }, {
                        label: 'IBOV',
                        data: dataIBOV,
                        borderColor: '#ECC94B',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                    }, {
                        label: 'IVVB11',
                        data: dataIVVB11,
                        borderColor: '#5A67D8',
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
                        y: {
                            ticks: {
                                color: '#a0a7b3',
                                callback: function (value) {
                                    return value.toFixed(1) + '%';
                                }
                            },
                            grid: { color: '#2a2c30' }
                        },
                        x: { type: 'time', time: { unit: 'month' }, ticks: { color: '#a0a7b3' }, grid: { display: false } }
                    },
                    plugins: {
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';

                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y.toFixed(2) + '%';
                                    }
                                    return label;
                                }
                            }
                        },
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