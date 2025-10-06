import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Busca os dados históricos de indexadores (CDI e IPCA) do Firestore.
 * @param {string} dataInicial - A data de início no formato 'yyyy-MM-dd'.
 * @param {string} dataFinal - A data final no formato 'yyyy-MM-dd'.
 * @returns {Promise<{historicoCDI: any[], historicoIPCA: any[]}>} Um objeto com os históricos de CDI e IPCA.
 */
export async function fetchIndexers(dataInicial, dataFinal) {
    if (!dataInicial || !dataFinal) {
        throw new Error('Datas de início e fim são obrigatórias para buscar indexadores.');
    }

    const fetchIndexData = async (indexName) => {
        try {
            const q = query(
                collection(db, "indices"),
                where("ticker", "==", indexName), // ✅ CORRIGIDO: Busca pelo campo padronizado 'ticker'
                where("data", ">=", dataInicial),
                where("data", "<=", dataFinal),
                orderBy("data", "asc")
            );
            const querySnapshot = await getDocs(q);

            // Transforma o resultado para o formato esperado pela aplicação (o mesmo da API do BCB)
            return querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    data: new Date(data.data + 'T00:00:00').toLocaleDateString('pt-BR'), // Formato dd/MM/yyyy
                    valor: data.valor.toString()
                };
            });
        } catch (error) {
            console.error(`Erro ao buscar ${indexName} do Firestore:`, error);
            return [];
        }
    };

    const [historicoCDI, historicoIPCA] = await Promise.all([
        fetchIndexData('CDI'),
        fetchIndexData('IPCA')
    ]);
    
    if(historicoCDI.length === 0) console.warn("[BCB] Nenhum dado de CDI encontrado no Firestore para o período.");
    if(historicoIPCA.length === 0) console.warn("[BCB] Nenhum dado de IPCA encontrado no Firestore para o período.");

    return { historicoCDI, historicoIPCA };
}