import { fetchIndexers } from '../api/bcb.js';
import { db } from '../firebase-config.js';
import { doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Renderiza os cards da carteira de Renda Fixa.
 * @param {Array<object>} lancamentos - A lista completa de todos os lançamentos do usuário.
 */
export async function renderRendaFixaCarteira(lancamentos) {
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

        // 1. Busca os indexadores usando o módulo da API do BCB
        const { historicoCDI, historicoIPCA } = await fetchIndexers(dataMaisAntiga, hoje.toISOString().split('T')[0]);

        // 2. Gera o HTML para cada ativo de renda fixa
        const html = rfLancamentos.map(ativo => {
            const dataAplicacao = new Date(ativo.data + 'T00:00:00');
            let valorBruto = ativo.valorAplicado;
            const diasCorridos = Math.floor((hoje - dataAplicacao) / (1000 * 60 * 60 * 24));

            // --- Lógica de cálculo da rentabilidade ---
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
                        return itemDate.getFullYear() > dataAplicacao.getFullYear() ||
                            (itemDate.getFullYear() === dataAplicacao.getFullYear() && itemDate.getMonth() >= dataAplicacao.getMonth());
                    })
                    .forEach(item => {
                        acumuladorIPCA *= (1 + parseFloat(item.valor) / 100);
                    });

                const valorCorrigido = ativo.valorAplicado * acumuladorIPCA;
                const diasUteis = diasCorridos * (252 / 365.25);
                valorBruto = valorCorrigido * Math.pow(1 + taxaPrefixadaAnual, diasUteis / 252);
            }
            // --- Fim da lógica de cálculo ---

            const lucro = valorBruto - ativo.valorAplicado;
            let aliquotaIR = 0;
            const isentoIR = ['LCI', 'LCA'].includes(ativo.tipoAtivo);
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
                </div>
            `;
        }).join('');

        rendaFixaListaDiv.innerHTML = html;

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