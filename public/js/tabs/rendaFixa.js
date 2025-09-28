import { fetchIndexers } from '../api/bcb.js';
import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Renderiza os cards da carteira de Renda Fixa.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 * @param {string} userID - O ID do usuário logado.
 * @param {object} valoresManuais - Objeto com os valores manuais salvos para o Tesouro.
 */
export async function renderRendaFixaCarteira(lancamentos, userID, valoresManuais) {
    const rendaFixaListaDiv = document.getElementById("rendafixa-lista");
    if (!rendaFixaListaDiv) return;

    rendaFixaListaDiv.innerHTML = `<p>Calculando rentabilidade da Renda Fixa...</p>`;

    const rfLancamentos = lancamentos.filter(l => ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Outro'].includes(l.tipoAtivo));

    if (rfLancamentos.length === 0) {
        rendaFixaListaDiv.innerHTML = `<p>Nenhum ativo de Renda Fixa lançado ainda.</p>`;
        return;
    }

    try {
        const hoje = new Date();
        const dataMaisAntiga = rfLancamentos.reduce((min, p) => new Date(p.data) < new Date(min) ? p.data : min, rfLancamentos[0].data);

        const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

        const htmlPromises = rfLancamentos.map(async (ativo) => {
            let valorBase = ativo.valorAplicado;
            let dataBase = ativo.data;

            if (ativo.tipoAtivo === 'Tesouro Direto' && valoresManuais && valoresManuais[ativo.ativo]) {
                valorBase = valoresManuais[ativo.ativo].valor * ativo.quantidade;
                dataBase = valoresManuais[ativo.ativo].data;
            }

            const dataCalculo = new Date(dataBase + 'T00:00:00');
            let valorBruto = valorBase;
            const diasCorridosCalculo = Math.floor((hoje - dataCalculo) / (1000 * 60 * 60 * 24));

            if (ativo.tipoRentabilidade === 'Pós-Fixado') {
                let acumuladorCDI = 1;
                const percentualCDI = parseFloat(ativo.taxaContratada.replace(/% do CDI/i, '')) / 100;
                historicoCDI
                    .filter(item => {
                        const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                        return itemDate >= dataCalculo && itemDate <= hoje;
                    })
                    .forEach(item => {
                        acumuladorCDI *= (1 + (parseFloat(item.valor) / 100) * percentualCDI);
                    });
                valorBruto = valorBase * acumuladorCDI;

            } else if (ativo.tipoRentabilidade === 'Prefixado') {
                const taxaAnual = parseFloat(ativo.taxaContratada.replace('%', '')) / 100;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorBase * Math.pow(1 + taxaAnual, diasUteis / 252);

            } else if (ativo.tipoRentabilidade === 'Híbrido') {
                let acumuladorIPCA = 1;
                const matchTaxa = ativo.taxaContratada.match(/(\d+(\.\d+)?)%/);
                const taxaPrefixadaAnual = matchTaxa ? parseFloat(matchTaxa[1]) / 100 : 0;

                historicoIPCA
                    .filter(item => {
                        const itemDate = new Date(item.data.split('/').reverse().join('-') + 'T00:00:00');
                        return itemDate.getFullYear() > dataCalculo.getFullYear() ||
                            (itemDate.getFullYear() === dataCalculo.getFullYear() && itemDate.getMonth() >= dataCalculo.getMonth());
                    })
                    .forEach(item => {
                        acumuladorIPCA *= (1 + parseFloat(item.valor) / 100);
                    });

                const valorCorrigido = valorBase * acumuladorIPCA;
                const diasUteis = diasCorridosCalculo * (252 / 365.25);
                valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
            }

            const lucro = valorBruto - ativo.valorAplicado;
            let aliquotaIR = 0;
            const isentoIR = ['LCI', 'LCA'].includes(ativo.tipoAtivo);
            if (lucro > 0 && !isentoIR) {
                const diasTotaisDesdeAplicacao = Math.floor((hoje - new Date(ativo.data + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                if (diasTotaisDesdeAplicacao <= 180) aliquotaIR = 0.225;
                else if (diasTotaisDesdeAplicacao <= 360) aliquotaIR = 0.20;
                else if (diasTotaisDesdeAplicacao <= 720) aliquotaIR = 0.175;
                else aliquotaIR = 0.15;
            }
            const impostoDevido = lucro * aliquotaIR;
            const valorLiquido = valorBruto - impostoDevido;
            const rentabilidadeLiquida = valorLiquido - ativo.valorAplicado;
            const rentabilidadePercentual = (rentabilidadeLiquida / ativo.valorAplicado) * 100;

            return `
                <div class="fii-card">
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

                    <div class="lista-acoes" style="width: 100%; border-top: 1px solid #2a2c30; padding-top: 15px; margin-top: 15px;">
                        <button class="btn-crud btn-editar-rf" data-id="${ativo.id}" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2-2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                        </button>
                        <button class="btn-crud btn-excluir-rf" data-id="${ativo.id}" title="Excluir">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                </div>
            `;
        });

        const html = await Promise.all(htmlPromises);
        rendaFixaListaDiv.innerHTML = html.join('');

    } catch (error) {
        console.error("Erro ao renderizar carteira de Renda Fixa:", error);
        rendaFixaListaDiv.innerHTML = `<p>Erro ao carregar os dados da carteira. Verifique o console para mais detalhes.</p>`;
    }
}

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
        if (docSnap.exists() && typeof window.openRendaFixaModal === 'function') {
            window.openRendaFixaModal(docSnap.data(), docId);
        }
    }
});