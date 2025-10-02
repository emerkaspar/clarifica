import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
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
    document.getElementById("btn-novo-lancamento-cripto").addEventListener("click", () => window.openLancamentoModal({ ativo: 'BTC' }, "", "Cripto"));

}

// --- MODAL DE DIVISÃO IDEAL DE FIIS (NOVO) ---
function setupDivisaoIdealModal(userID) {
    const modal = document.getElementById("divisao-ideal-modal");
    if (!modal) return;

    const form = document.getElementById("form-divisao-ideal");
    const openBtn = document.getElementById("btn-divisao-ideal-fiis");
    const validationMessageDiv = document.getElementById("divisao-validation-message");
    const configDocRef = doc(db, "configuracoes", userID);

    const populateForm = (data = {}) => {
        form.querySelectorAll("input[type='number']").forEach(input => {
            input.value = data[input.name] || '';
        });
    };

    const validatePercentages = () => {
        const groups = {};
        form.querySelectorAll("input[data-group]").forEach(input => {
            const groupName = input.dataset.group;
            if (!groups[groupName]) {
                groups[groupName] = 0;
            }
            groups[groupName] += parseFloat(input.value) || 0;
        });

        let messages = [];
        for (const group in groups) {
            if (groups[group] !== 100 && groups[group] > 0) {
                messages.push(`A soma para "${group}" é ${groups[group]}%, mas deveria ser 100%.`);
            }
        }

        if (messages.length > 0) {
            validationMessageDiv.innerHTML = messages.join('<br>');
            validationMessageDiv.style.display = 'block';
        } else {
            validationMessageDiv.style.display = 'none';
        }
    };

    openBtn.addEventListener("click", async () => {
        form.reset();
        try {
            const docSnap = await getDoc(configDocRef);
            if (docSnap.exists() && docSnap.data().divisaoIdealFIIs) {
                populateForm(docSnap.data().divisaoIdealFIIs);
            }
        } catch (error) {
            console.error("Erro ao carregar divisão ideal:", error);
        }
        validatePercentages();
        modal.classList.add("show");
    });

    form.addEventListener("input", validatePercentages);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dataToSave = {};
        form.querySelectorAll("input[type='number']").forEach(input => {
            dataToSave[input.name] = parseFloat(input.value) || 0;
        });

        try {
            await setDoc(configDocRef, { divisaoIdealFIIs: dataToSave }, { merge: true });
            closeModal("divisao-ideal-modal");
        } catch (error) {
            console.error("Erro ao salvar divisão ideal:", error);
            alert("Erro ao salvar configuração. Tente novamente.");
        }
    });
}


// --- MODAL DE RENDA FIXA ---
function setupRendaFixaModal(userID) {
    const modal = document.getElementById("rendafixa-modal");
    if (!modal) return;
    const form = document.getElementById("form-novo-rendafixa");
    const hoje = new Date().toISOString().split("T")[0];

    const ativoInput = form.querySelector("#rendafixa-ativo");
    const sugestoesDiv = form.querySelector("#rendafixa-ativo-sugestoes");
    const tipoAtivoSelect = form.querySelector("#rendafixa-tipo-ativo");
    let timeoutBusca;

    // Lógica de autocompletar para Títulos do Tesouro
    ativoInput.addEventListener("input", () => {
        clearTimeout(timeoutBusca);
        sugestoesDiv.style.display = "none";
        sugestoesDiv.innerHTML = "";

        if (tipoAtivoSelect.value !== 'Tesouro Direto') {
            return;
        }

        timeoutBusca = setTimeout(() => {
            const term = ativoInput.value.toUpperCase();
            const allTitles = Object.keys(window.allTesouroDiretoPrices || {});
            const suggestions = allTitles.filter(title => title.toUpperCase().includes(term));

            if (suggestions.length > 0) {
                sugestoesDiv.style.display = "block";
                suggestions.forEach((titulo) => {
                    const div = document.createElement("div");
                    div.className = "sugestao-item";
                    div.textContent = titulo;
                    div.onclick = () => {
                        ativoInput.value = titulo;
                        sugestoesDiv.style.display = "none";
                    };
                    sugestoesDiv.appendChild(div);
                });
            }
        }, 300);
    });

    // Esconde sugestões se clicar fora
    document.addEventListener('click', (e) => {
        if (sugestoesDiv && !sugestoesDiv.contains(e.target) && e.target !== ativoInput) {
            sugestoesDiv.style.display = 'none';
        }
    });

    // Limpa o input e atualiza o placeholder ao mudar o tipo de ativo
    tipoAtivoSelect.addEventListener('change', () => {
        ativoInput.value = '';
        sugestoesDiv.style.display = 'none';
        ativoInput.placeholder = tipoAtivoSelect.value === 'Tesouro Direto'
            ? "Digite para buscar o título..."
            : "Ex: CDB Banco Inter 110%";
    });

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
        if (sugestoesDiv) sugestoesDiv.style.display = 'none';
        form["rendafixa-doc-id"].value = id;
        document.getElementById("rendafixa-modal-title").textContent = id ? "Editar Renda Fixa" : "Adicionar Renda Fixa";
        form.querySelector(".btn-adicionar").innerHTML = id ? '<i class="fas fa-save"></i> Salvar' : '<i class="fas fa-plus"></i> Adicionar';

        const tipoAtivo = data.tipoAtivo || "Tesouro Direto";
        form["rendafixa-tipo-ativo"].value = tipoAtivo;
        ativoInput.placeholder = tipoAtivo === 'Tesouro Direto' ? "Digite para buscar o título..." : "Ex: CDB Banco Inter";

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

// --- MODAL DE UPLOAD DE CSV DO TESOURO DIRETO ---
function setupUploadCsvModal(userID) {
    const modal = document.getElementById("upload-csv-td-modal");
    const form = document.getElementById("form-upload-csv-td");
    const fileInput = document.getElementById("csv-file-input");
    const validationMessageDiv = document.getElementById("csv-validation-message");

    document.getElementById("btn-importar-csv-td").addEventListener("click", () => {
        form.reset();
        validationMessageDiv.style.display = 'none';
        modal.classList.add("show");
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const file = fileInput.files[0];

        if (!file) {
            validationMessageDiv.textContent = "Por favor, selecione um arquivo.";
            validationMessageDiv.style.display = 'block';
            return;
        }

        if (file.type !== "text/csv") {
            validationMessageDiv.textContent = "Formato de arquivo inválido. Por favor, envie um arquivo CSV.";
            validationMessageDiv.style.display = 'block';
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (event) {
            const csvData = event.target.result;
            const lines = csvData.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                validationMessageDiv.textContent = "Arquivo CSV vazio ou com apenas o cabeçalho.";
                validationMessageDiv.style.display = 'block';
                return;
            }
            const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
            const requiredHeaders = ["Título", "Rendimento anual do título", "Vencimento do Título", "Preço unitário de investimento"];

            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
            if (missingHeaders.length > 0) {
                validationMessageDiv.textContent = `O arquivo CSV não contém as colunas obrigatórias: ${missingHeaders.join(', ')}`;
                validationMessageDiv.style.display = 'block';
                return;
            }

            try {
                const batch = writeBatch(db);
                const collectionRef = collection(db, "tesouroDiretoPrices");
                const uploadTimestamp = serverTimestamp();
                const dataUpload = new Date().toISOString().split('T')[0];

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(';');
                    const entry = {};
                    headers.forEach((header, index) => {
                        entry[header] = values[index] ? values[index].trim().replace(/"/g, '') : '';
                    });

                    if (!entry["Título"]) continue;

                    const docData = {
                        userID: userID,
                        titulo: entry["Título"],
                        taxa: entry["Rendimento anual do título"],
                        vencimento: entry["Vencimento do Título"],
                        valor: parseFloat(entry["Preço unitário de investimento"].replace('R$', '').replace(/\./g, '').replace(',', '.')),
                        data: dataUpload,
                        timestamp: uploadTimestamp
                    };

                    const docId = `${userID}_${docData.titulo.replace(/[\s/.]+/g, '_')}`;
                    const docRef = doc(collectionRef, docId);
                    batch.set(docRef, docData, { merge: true });
                }

                await batch.commit();
                alert("Arquivo CSV importado e dados atualizados com sucesso!");
                closeModal("upload-csv-td-modal");

            } catch (error) {
                console.error("Erro ao processar e salvar o arquivo CSV: ", error);
                validationMessageDiv.textContent = "Ocorreu um erro ao processar o arquivo. Verifique o formato e tente novamente.";
                validationMessageDiv.style.display = 'block';
            }
        };
        reader.readAsText(file, 'UTF-8');
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
    setupDivisaoIdealModal(userID);
    setupRendaFixaModal(userID);
    setupProventoModal(userID);
    setupMetaProventosModal(userID);
    setupClassificacaoModal(userID);
    setupAtivoDetalhesModal();
    setupUploadCsvModal(userID);
}