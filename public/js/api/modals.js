import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { searchAssets } from './brapi.js';
import { renderPerformanceChart } from '../charts.js';

// --- LÓGICA GENÉRICA DE MODAIS ---
const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("show");
    }
};

const initializeCloseButtons = () => {
    document.querySelectorAll(".modal-close-btn, .btn-cancelar").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const modalId = e.currentTarget.dataset.modal || e.currentTarget.closest(".modal-overlay").id;
            closeModal(modalId);
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
};

// --- MODAL DE LANÇAMENTO (AÇÕES, FIIS, ETC) ---
function setupLancamentosModal(userID) {
    const modal = document.getElementById("lancamento-modal");
    const form = document.getElementById("form-novo-ativo");
    const hoje = new Date().toISOString().split("T")[0];
    const ativoInput = form.querySelector("#ativo");
    const sugestoesDiv = form.querySelector("#ativo-sugestoes");
    let timeoutBusca;

    const calcularTotal = () => {
        const qtd = parseFloat(form.quantidade.value) || 0;
        const prc = parseFloat(form.preco.value) || 0;
        const cst = parseFloat(form["outros-custos"].value) || 0;
        form.querySelector("#valor-total-calculado").textContent = (qtd * prc + cst).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    };

    ativoInput.addEventListener("input", () => {
        clearTimeout(timeoutBusca);
        timeoutBusca = setTimeout(async () => {
            const suggestions = await searchAssets(ativoInput.value);
            sugestoesDiv.innerHTML = "";
            if (suggestions.length > 0) {
                sugestoesDiv.style.display = "block";
                suggestions.forEach((stock) => {
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
        }, 400);
    });

    form.querySelectorAll("input[type='number']").forEach((el) => el.addEventListener("input", calcularTotal));
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
            valorTotal: parseFloat(form.quantidade.value) * parseFloat(form.preco.value) + (parseFloat(form["outros-custos"].value) || 0),
        };

        try {
            if (docId) {
                await updateDoc(doc(db, "lancamentos", docId), lancamentoData);
            } else {
                lancamentoData.timestamp = serverTimestamp();
                await addDoc(collection(db, "lancamentos"), lancamentoData);
            }
            closeModal("lancamento-modal");
        } catch (error) {
            console.error("Erro ao salvar lançamento: ", error);
            alert("Erro ao salvar: " + error.message);
        }
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

    document.getElementById("btn-mostrar-form").addEventListener("click", () => window.openLancamentoModal());
    document.getElementById("btn-novo-lancamento-fii").addEventListener("click", () => window.openLancamentoModal({}, "", "FIIs"));
    document.getElementById("btn-novo-lancamento-acao").addEventListener("click", () => window.openLancamentoModal({}, "", "Ações"));
    document.getElementById("btn-novo-lancamento-etf").addEventListener("click", () => window.openLancamentoModal({ ativo: 'IVVB11' }, "", "ETF"));
}

// --- MODAL DE RENDA FIXA ---
function setupRendaFixaModal(userID) {
    const modal = document.getElementById("rendafixa-modal");
    const form = document.getElementById("form-novo-rendafixa");
    const hoje = new Date().toISOString().split("T")[0];

    document.getElementById("btn-novo-lancamento-rendafixa").addEventListener("click", () => window.openRendaFixaModal());

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
            } else {
                lancamentoData.timestamp = serverTimestamp();
                await addDoc(collection(db, "lancamentos"), lancamentoData);
            }
            closeModal("rendafixa-modal");
        } catch (error) {
            console.error("Erro ao salvar Renda Fixa: ", error);
            alert("Erro ao salvar: " + error.message);
        }
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
}

// --- MODAL DE PROVENTOS ---
function setupProventoModal(userID) {
    const modal = document.getElementById("provento-modal");
    const form = document.getElementById("form-novo-provento");
    const hoje = new Date().toISOString().split("T")[0];
    const ativoInput = form.querySelector("#provento-ativo");
    const sugestoesDiv = form.querySelector("#provento-ativo-sugestoes");
    let timeoutBusca;

    ativoInput.addEventListener("input", () => {
        clearTimeout(timeoutBusca);
        timeoutBusca = setTimeout(async () => {
            const suggestions = await searchAssets(ativoInput.value);
            sugestoesDiv.innerHTML = "";
            if (suggestions.length > 0) {
                sugestoesDiv.style.display = "block";
                suggestions.forEach((stock) => {
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
        }, 400);
    });

    form.querySelectorAll(".btn-tipo-provento").forEach((btn) => {
        btn.addEventListener("click", () => {
            form.querySelectorAll(".btn-tipo-provento").forEach((b) => b.classList.remove("active"));
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
            closeModal("provento-modal");
        } catch (error) {
            console.error("Erro ao lançar provento: ", error);
            alert("Erro ao lançar provento: " + error.message);
        }
    });

    document.getElementById("btn-lancamento-provento").addEventListener("click", () => {
        form.reset();
        form["provento-data-pagamento"].value = hoje;
        form.querySelector(".btn-tipo-provento[data-tipo='Ações']").click();
        modal.classList.add("show");
    });
}

// --- MODAL DE META DE PROVENTOS ---
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
            await setDoc(doc(db, "metas", userID), metaData);
            closeModal("meta-proventos-modal");
        } catch (error) {
            console.error("Erro ao salvar a meta: ", error);
            alert("Ocorreu um erro ao salvar a meta. Tente novamente.");
        }
    });
}

// --- MODAL DE CLASSIFICAÇÃO ---
function setupClassificacaoModal(userID) {
    const modal = document.getElementById("classificacao-modal");
    const form = document.getElementById("form-classificacao");
    const fieldsContainer = document.getElementById("classificacao-fields-container");
    const tipoFiiOpcoes = ["Tijolo", "Papel", "Híbrido", "Fundo de Fundos"];
    const especieOpcoes = {
        Tijolo: ["Lajes corporativas / Escritórios", "Shoppings e centros comerciais", "Logística e galpões industriais", "Residencial", "Hospitais, clínicas e lajes de saúde", "Hotéis", "Agro"],
        Papel: ["Atrelado ao CDI", "Atrelado ao IPCA"],
        Híbrido: ["N/A"],
        "Fundo de Fundos": ["N/A"],
    };

    const updateEspecieOptions = (selectedTipo, currentValue = null) => {
        const selectEspecie = document.getElementById('select-especie');
        const options = especieOpcoes[selectedTipo] || ["N/A"];
        selectEspecie.innerHTML = '';
        options.forEach(opt => {
            const isSelected = currentValue === opt || (currentValue === null && opt === "N/A");
            selectEspecie.innerHTML += `<option value="${opt}" ${isSelected ? "selected" : ""}>${opt}</option>`;
        });
    };

    const gerarCampos = (tipo, valores) => {
        fieldsContainer.innerHTML = '';
        if (tipo === "FIIs") {
            const tipoFiiAtual = valores["Tipo FII"] || "Tijolo";
            let tipoFiiHtml = `<div><label class="form-label">Tipo FII</label><select name="Tipo FII" id="select-tipo-fii" class="form-select">`;
            tipoFiiOpcoes.forEach(opt => {
                tipoFiiHtml += `<option value="${opt}" ${tipoFiiAtual === opt ? "selected" : ""}>${opt}</option>`;
            });
            tipoFiiHtml += `</select></div>`;
            const riscoFiiHtml = `<div><label class="form-label">Risco FII</label><select name="Risco FII" class="form-select"><option value="Arrojado" ${valores["Risco FII"] === "Arrojado" ? "selected" : ""}>Arrojado</option><option value="Crescimento" ${valores["Risco FII"] === "Crescimento" ? "selected" : ""}>Crescimento</option><option value="Ancoragem" ${valores["Risco FII"] === "Ancoragem" ? "selected" : ""}>Ancoragem</option></select></div>`;
            const especieHtml = `<div><label class="form-label">Espécie</label><select name="Espécie" id="select-especie" class="form-select"></select></div>`;
            fieldsContainer.innerHTML = tipoFiiHtml + riscoFiiHtml + especieHtml;
            const selectTipoFii = document.getElementById('select-tipo-fii');
            updateEspecieOptions(selectTipoFii.value, valores["Espécie"]);
            selectTipoFii.addEventListener('change', (e) => {
                updateEspecieOptions(e.target.value, null);
            });
        } else if (tipo === "Ações") {
            fieldsContainer.innerHTML = `<div><label class="form-label">Capitalização</label><select name="Capitalização" class="form-select"><option value="Blue Chip" ${valores["Capitalização"] === "Blue Chip" ? "selected" : ""}>Blue Chip</option><option value="Small Cap" ${valores["Capitalização"] === "Small Cap" ? "selected" : ""}>Small Cap</option></select></div><div><label class="form-label">Setor</label><select name="Setor BESST" class="form-select"><option value="Bancos" ${valores["Setor BESST"] === "Bancos" ? "selected" : ""}>Bancos</option><option value="Energia" ${valores["Setor BESST"] === "Energia" ? "selected" : ""}>Energia</option><option value="Saneamento" ${valores["Setor BESST"] === "Saneamento" ? "selected" : ""}>Saneamento</option><option value="Seguros" ${valores["Setor BESST"] === "Seguros" ? "selected" : ""}>Seguros</option><option value="Telecomunicações" ${valores["Setor BESST"] === "Telecomunicações" ? "selected" : ""}>Telecomunicações</option><option value="Comodities" ${valores["Setor BESST"] === "Comodities" ? "selected" : ""}>Comodities</option><option value="Petróleo, Gás e Biocombustíveis" ${valores["Setor BESST"] === "Petróleo, Gás e Biocombustíveis" ? "selected" : ""}>Petróleo, Gás e Biocombustíveis</option><option value="Outro" ${valores["Setor BESST"] === "Outro" ? "selected" : ""}>Outro</option></select></div>`;
        }
    };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ticker = form["classificacao-ativo-ticker"].value;
        const tipo = form["classificacao-ativo-tipo"].value;
        const classificacoes = {};
        form.querySelectorAll("select").forEach((select) => {
            classificacoes[select.name] = select.value;
        });
        try {
            await setDoc(doc(db, "ativosClassificados", ticker), {
                userID: userID,
                ativo: ticker,
                tipoAtivo: tipo,
                classificacoes: classificacoes,
            });
            closeModal("classificacao-modal");
        } catch (error) {
            console.error("Erro ao salvar classificação: ", error);
            alert("Erro ao salvar classificação: " + error.message);
        }
    });

    window.openClassificacaoModal = async (ticker, tipo) => {
        const docRef = doc(db, "ativosClassificados", ticker);
        const docSnap = await getDoc(docRef);
        const existingData = docSnap.exists() ? docSnap.data().classificacoes : {};
        form.reset();
        form["classificacao-ativo-ticker"].value = ticker;
        form["classificacao-ativo-tipo"].value = tipo;
        document.getElementById("classificacao-ativo-nome").textContent = ticker;
        gerarCampos(tipo, existingData);
        modal.classList.add("show");
    };
}

// --- MODAL DE ATUALIZAR VALOR DO TESOURO DIRETO ---
function setupAtualizarValorTdModal(userID) {
    const modal = document.getElementById("atualizar-valor-td-modal");
    const form = document.getElementById("form-atualizar-valor-td");
    const selectAtivo = document.getElementById("atualizar-td-ativo");
    const historicoDiv = document.getElementById("historico-valores-manuais-lista");
    const hoje = new Date().toISOString().split("T")[0];

    const renderHistoricoValoresManuais = (valores) => {
        if (valores.length === 0) {
            historicoDiv.innerHTML = '<p style="font-size: 0.8rem; color: #a0a7b3;">Nenhum valor manual salvo.</p>';
            return;
        }
        historicoDiv.innerHTML = valores.map(v => `
            <div class="lista-item" style="grid-template-columns: 2fr 1fr 1fr auto; min-width: 400px; padding: 10px 15px;">
                <div class="lista-item-valor">${v.ativo}</div>
                <div class="lista-item-valor">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                <div class="lista-item-valor">${v.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div class="lista-acoes">
                    <button class="btn-crud btn-editar-valor-manual" data-id="${v.id}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                    <button class="btn-crud btn-excluir-valor-manual" data-id="${v.id}" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>
                </div>
            </div>
        `).join('');
    };

    document.getElementById("btn-atualizar-valor-td").addEventListener("click", () => {
        form.reset();
        form["atualizar-td-doc-id"].value = '';
        form['data-posicao'].value = hoje;
        form.querySelector('.btn-salvar').innerHTML = '<i class="fas fa-save"></i> Salvar Valor';

        const tesouroLancamentos = (window.allLancamentos || []).filter(l => l.tipoAtivo === 'Tesouro Direto');
        const titulosUnicos = [...new Set(tesouroLancamentos.map(l => l.ativo))];

        selectAtivo.innerHTML = '<option value="">Selecione um título</option>';
        if (titulosUnicos.length > 0) {
            titulosUnicos.forEach(titulo => {
                selectAtivo.innerHTML += `<option value="${titulo}">${titulo}</option>`;
            });
        } else {
            selectAtivo.innerHTML = '<option value="">Nenhum Tesouro Direto na carteira</option>';
        }

        const q = query(collection(db, "valoresManuaisTD"), where("userID", "==", userID), orderBy("timestamp", "desc"), limit(5));
        onSnapshot(q, (snapshot) => {
            const valores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderHistoricoValoresManuais(valores);
        });

        modal.classList.add("show");
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const docId = form["atualizar-td-doc-id"].value;
        const ativo = form.ativo.value;
        const dataPosicao = form["data-posicao"].value;
        const valorAtual = parseFloat(form["valor-atual"].value);

        if (!ativo || !dataPosicao || !valorAtual) {
            alert("Por favor, preencha todos os campos.");
            return;
        }

        const valorManualData = {
            userID: userID,
            ativo: ativo,
            data: dataPosicao,
            valor: valorAtual,
            timestamp: serverTimestamp(),
        };

        try {
            if (docId) { // Editando
                await updateDoc(doc(db, "valoresManuaisTD", docId), valorManualData);
                alert("Valor atualizado com sucesso!");
            } else { // Criando novo
                const newDocId = `${userID}_${ativo.replace(/[\s/.]+/g, '_')}`;
                await setDoc(doc(db, "valoresManuaisTD", newDocId), valorManualData, { merge: true });
                alert("Valor manual salvo com sucesso!");
            }
            form.reset();
            form["atualizar-td-doc-id"].value = '';
            form['data-posicao'].value = hoje;
            form.querySelector('.btn-salvar').innerHTML = '<i class="fas fa-save"></i> Salvar Valor';

        } catch (error) {
            console.error("Erro ao salvar valor manual do Tesouro: ", error);
            alert("Erro ao salvar: " + error.message);
        }
    });

    historicoDiv.addEventListener("click", async (e) => {
        const button = e.target.closest('button.btn-crud');
        if (!button) return;

        const docId = button.dataset.id;
        const docRef = doc(db, 'valoresManuaisTD', docId);

        if (button.classList.contains('btn-excluir-valor-manual')) {
            if (confirm('Tem certeza que deseja excluir este valor manual?')) {
                await deleteDoc(docRef);
                alert('Valor excluído.');
            }
        } else if (button.classList.contains('btn-editar-valor-manual')) {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                form.ativo.value = data.ativo;
                form['data-posicao'].value = data.data;
                form['valor-atual'].value = data.valor;
                form['atualizar-td-doc-id'].value = docId;
                form.querySelector('.btn-salvar').innerHTML = '<i class="fas fa-edit"></i> Atualizar Valor';
                form.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
}

// --- MODAL DE DETALHES DO ATIVO ---
function setupAtivoDetalhesModal() {
    const ativoDetalhesModal = document.getElementById("ativo-detalhes-modal");

    function openAtivoDetalhesModal(ticker, tipoAtivo) {
        document.getElementById("ativo-detalhes-modal-title").textContent = `Detalhes de ${ticker}`;

        const lancamentosDoAtivo = (window.allLancamentos || []).filter(l => l.ativo === ticker).sort((a, b) => new Date(a.data) - new Date(b.data));
        const proventosDoAtivo = (window.allProventos || []).filter(p => p.ativo === ticker);

        renderDetalhesLancamentos(lancamentosDoAtivo);
        renderDetalhesProventos(proventosDoAtivo);
        setTimeout(() => {
            renderPerformanceChart(ticker, lancamentosDoAtivo, window.allProventos);
        }, 100);

        // Reset para a primeira aba sempre que abrir
        ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
        ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
        ativoDetalhesModal.querySelector('[data-tab="performance"]').classList.add('active');
        document.getElementById('ativo-detalhes-performance').classList.add('active');

        ativoDetalhesModal.classList.add("show");
    }

    window.openAtivoDetalhesModal = openAtivoDetalhesModal;

    function renderDetalhesLancamentos(lancamentos) {
        const container = document.getElementById("ativo-detalhes-lancamentos");
        if (lancamentos.length === 0) {
            container.innerHTML = "<p>Nenhum lançamento para este ativo.</p>";
            return;
        }
        let totalCompras = 0;
        let totalVendas = 0;
        lancamentos.forEach(l => {
            if (l.tipoOperacao === 'compra') totalCompras += l.valorTotal;
            else if (l.tipoOperacao === 'venda') totalVendas += l.valorTotal;
        });
        const netTotal = totalCompras - totalVendas;
        const netClass = netTotal >= 0 ? 'positive-change' : 'negative-change';
        let resumoHtml = `<div class="detalhes-resumo-lancamentos" style="display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #2a2c30;"><div class="resumo-item"><span style="color: #a0a7b3; font-size: 0.85rem;">Total Compras</span><strong style="color: #22c55e;">${totalCompras.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div class="resumo-item"><span style="color: #a0a7b3; font-size: 0.85rem;">Total Vendas</span><strong style="color: #ef4444;">${totalVendas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div class="resumo-item"><span style="color: #a0a7b3; font-size: 0.85rem;">Total Líquido</span><strong class="${netClass}">${netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div></div>`;
        let listaHtml = `<div class="detalhes-lista-header"><div class="header-col">Data</div><div class="header-col">Operação</div><div class="header-col">Valor Total</div></div>`;
        lancamentos.forEach(l => {
            listaHtml += `<div class="detalhes-lista-item"><div>${new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div><div class="${l.tipoOperacao === 'compra' ? 'operacao-compra' : 'operacao-venda'}">${l.tipoOperacao.charAt(0).toUpperCase() + l.tipoOperacao.slice(1)} (${l.quantidade} x ${l.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</div><div>${l.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></div>`;
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
        let html = `<div class="detalhes-resumo-proventos" style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #2a2c30;"><span style="color: #a0a7b3; font-size: 0.85rem; display: block;">Total de Proventos Recebidos</span><strong style="color: #00d9c3; font-size: 1.5rem;">${totalProventos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div class="detalhes-lista-header"><div class="header-col">Data Pag.</div><div class="header-col">Tipo</div><div class="header-col">Valor Recebido</div></div>`;
        proventos.forEach(p => {
            html += `<div class="detalhes-lista-item"><div>${new Date(p.dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</div><div>${p.tipoProvento}</div><div style="color: #00d9c3;">${p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></div>`;
        });
        container.innerHTML = html;
    }

    ativoDetalhesModal.querySelector(".fii-detalhes-tabs").addEventListener("click", (e) => {
        if (e.target.matches('.fii-detalhes-tab-link')) {
            const tabId = e.target.dataset.tab;
            ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-link').forEach(tab => tab.classList.remove('active'));
            ativoDetalhesModal.querySelectorAll('.fii-detalhes-tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`ativo-detalhes-${tabId}`).classList.add('active');
        }
    });
}

// --- FUNÇÃO DE SETUP PRINCIPAL ---
export function setupAllModals(userID) {
    initializeCloseButtons();
    setupLancamentosModal(userID);
    setupRendaFixaModal(userID);
    setupProventoModal(userID);
    setupMetaProventosModal(userID);
    setupClassificacaoModal(userID);
    setupAtivoDetalhesModal();
    setupAtualizarValorTdModal(userID);
}