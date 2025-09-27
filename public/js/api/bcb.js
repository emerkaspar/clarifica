/**
 * Formata uma data para o padrão 'dd/MM/yyyy' exigido pela API do Banco Central.
 * @param {Date | string} dateInput - A data a ser formatada.
 * @returns {string | null} A data formatada ou null se a entrada for inválida.
 */
const formatDateForBCB = (dateInput) => {
    const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

/**
 * Busca os dados históricos de indexadores (CDI e IPCA) no Banco Central
 * entre duas datas.
 * @param {string} dataInicial - A data de início no formato 'yyyy-MM-dd'.
 * @param {string} dataFinal - A data final no formato 'yyyy-MM-dd'.
 * @returns {Promise<{historicoCDI: any[], historicoIPCA: any[]}>} Um objeto com os históricos de CDI e IPCA.
 */
export async function fetchIndexers(dataInicial, dataFinal) {
    const dataInicialBCB = formatDateForBCB(dataInicial);
    const dataFinalBCB = formatDateForBCB(dataFinal);

    if (!dataInicialBCB || !dataFinalBCB) {
        throw new Error('Datas fornecidas para a busca no BCB são inválidas.');
    }

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

    return { historicoCDI, historicoIPCA };
}