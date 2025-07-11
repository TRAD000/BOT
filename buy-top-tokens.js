import axios from 'axios';
import { buyToken } from './Bot.js';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const NETWORK = process.env.NETWORK || 'devnet';

async function getTopActiveTokens(limit = 5) {
  // استخدم Helius API لجلب أكثر التوكنات نشاطاً على devnet
  const url = `https://api.helius.xyz/v0/tokens/most-active?network=${NETWORK}&api-key=${HELIUS_API_KEY}&limit=${limit}`;
  try {
    const res = await axios.get(url);
    return res.data.tokens?.slice(0, limit).map(t => t.mint) || [];
  } catch (e) {
    console.error('فشل في جلب التوكنات الأكثر نشاطاً:', e.message);
    return [];
  }
}

(async () => {
  const topTokens = await getTopActiveTokens(5);
  if (topTokens.length === 0) {
    console.log('لا توجد توكنات نشطة حالياً على الشبكة التجريبية.');
    return;
  }
  console.log('أعلى 5 توكنات من حيث النشاط:', topTokens);
  for (const mint of topTokens) {
    await buyToken(mint);
  }
})();
