import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Limite de 15 minutos (em milissegundos) para considerar um dado "recente"
const CACHE_LIFETIME = 15 * 60 * 1000;
const COLLECTION_NAME = "cotacoes";

/**
 * Cria um ID de documento único (TICKER-YYYYMMDD-HHMMSS).
 */
function createUniqueDocId(ticker) {
    const now = new Date();
    const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
    const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/:/g, '');
    const secondsPart = String(now.getSeconds()).padStart(2, '0');
    return `${ticker}-${datePart}-${timePart}${secondsPart}`;
}

/**
 * Salva a cotação buscada no Firestore com ID único.
 */
export async function saveToFirestore(ticker, data) {
    try {
        if (!data || !data.results || data.results.length === 0) {
            console.warn(`[Cache] Não salvando ${ticker}: dados inválidos.`);
            return;
        }
        
        const priceData = data.results[0];
        const docId = createUniqueDocId(ticker);
        const timestamp = new Date().toISOString();

        await setDoc(doc(db, COLLECTION_NAME, docId), {
            ticker: ticker,
            preco: priceData.regularMarketPrice,
            data: timestamp,
            raw: data,
        });
        console.log(`[Cache] Cotação de ${ticker} salva no Firestore: ${docId}`);
    } catch (error) {
        console.error(`[Cache] Erro ao salvar ${ticker} no Firestore:`, error);
    }
}

/**
 * Pega o último registro de um ativo salvo no Firestore e verifica se é recente.
 */
export async function getFromFirestore(ticker) {
    try {
        const now = Date.now();
        const q = query(
            collection(db, COLLECTION_NAME),
            where("ticker", "==", ticker),
            orderBy("data", "desc"),
            limit(1)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return { data: null, isRecent: false };
        }

        const latestDoc = querySnapshot.docs[0].data();
        const docTimestamp = new Date(latestDoc.data).getTime();
        const isRecent = (now - docTimestamp) < CACHE_LIFETIME;

        console.log(`[Cache] Último dado de ${ticker} encontrado. Recente: ${isRecent}`);

        return { data: latestDoc.raw, isRecent: isRecent };

    } catch (error) {
        console.error(`[Cache] Erro ao buscar ${ticker} no Firestore:`, error);
        return { data: null, isRecent: false };
    }
}

/**
 * Pega o último registro de um ativo salvo no Firestore, independentemente da data.
 */
export async function getFallbackFromFirestore(ticker) {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            where("ticker", "==", ticker),
            orderBy("data", "desc"),
            limit(1)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return null;
        }

        const latestDoc = querySnapshot.docs[0].data();
        console.log(`[Cache] Usando fallback de ${ticker} (data: ${latestDoc.data})`);
        return latestDoc.raw;

    } catch (error) {
        console.error(`[Cache] Erro ao buscar fallback de ${ticker} no Firestore:`, error);
        return null;
    }
}