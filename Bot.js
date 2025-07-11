// solana_trading_bot.js
import axios from 'axios';
// ...existing code...
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import {
  HELIUS_API_KEY,
  PRIVATE_KEY,
  NETWORK,
  WATCHED_WALLETS,
  DAILY_LIMIT,
  SOL_USD_PRICE,
  BANNED_KEYWORDS,
} from './config.js';

// تحقق احترافي من متغيرات البيئة
function validateEnv() {
  if (!HELIUS_API_KEY || !PRIVATE_KEY) {
    console.error('❌ يرجى ضبط متغيرات البيئة HELIUS_API_KEY و PRIVATE_KEY في ملف .env');
    process.exit(1);
  }
  if (!Array.isArray(PRIVATE_KEY) || PRIVATE_KEY.length < 32) {
    console.error('❌ خطأ في مفتاح المحفظة الخاصة. تأكد من أن PRIVATE_KEY عبارة عن مصفوفة أرقام صحيحة.');
    process.exit(1);
  }
}
validateEnv();

let userKeypair = Keypair.fromSecretKey(Uint8Array.from(PRIVATE_KEY));
const connection = new Connection(
  `https://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
  'confirmed'
);

const HELIUS_WS_URL = `wss://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const HELIUS_TX_API = 'https://api.helius.xyz/v0/addresses';

const purchasedTokens = new Set();
const tokenBuyPrices = new Map();
let dailyPurchaseCount = 0;
// إعادة تعيين عداد الشراء اليومي كل 24 ساعة
setInterval(() => {
  dailyPurchaseCount = 0;
  purchasedTokens.clear();
  console.log('🔄 تم إعادة تعيين عداد الشراء اليومي.');
}, 24 * 60 * 60 * 1000);


/**
 * يسجل العمليات (شراء/بيع/فشل) مع تفاصيلها
 * @param {'BUY'|'SELL'|'BUY_FAIL'|'SELL_FAIL'} type
 * @param {string} tokenMint
 * @param {string|null} txid
 * @param {object} extra
 */
import fs from 'fs';
/**
 * يسجل العمليات (شراء/بيع/فشل) مع تفاصيلها في السجل والملف
 * @param {'BUY'|'SELL'|'BUY_FAIL'|'SELL_FAIL'} type
 * @param {string} tokenMint
 * @param {string|null} txid
 * @param {object} extra
 */
function logTrade(type, tokenMint, txid, extra = {}) {
  const time = new Date().toISOString();
  const logLine = `[${time}] [${type}] ${tokenMint} tx: ${txid || '-'} ${JSON.stringify(extra)}`;
  console.log(logLine);
  try {
    fs.appendFileSync('transactions.log', logLine + '\n');
  } catch (e) {
    console.error('⚠️ فشل في كتابة سجل المعاملات:', e.message);
  }
}

/**
 * ينفذ عملية شراء توكن مع شرط ذكي: تضاعف عدد المشترين خلال 20 ثانية
 * @param {string} tokenMint
 * @param {number} retry
 */
export async function buyToken(tokenMint, retry = 0) {
  // شرط الحد الأقصى للصفقات المفتوحة: لا تشتري إذا كان هناك 5 توكنات نشطة
  if (purchasedTokens.size >= 5) {
    console.log('🚫 الحد الأقصى للصفقات المفتوحة (5) تحقق. لن يتم الشراء حتى يتم بيع أحد التوكنات.');
    logTrade('BUY_FAIL', tokenMint, null, { error: 'max open trades reached', open: Array.from(purchasedTokens) });
    return;
  }
  if (purchasedTokens.has(tokenMint)) {
    console.log('⏩ تم شراء هذا التوكن مسبقًا.');
    return;
  }
  // --- شرط ذكي: لا تشتري إلا إذا تضاعف عدد المشترين خلال 20 ثانية ---
  if (NETWORK !== 'devnet') {
    try {
      const buyersCount = await getBuyersCount(tokenMint);
      await sleep(5000); // انتظر 5 ثواني
      const buyersCount2 = await getBuyersCount(tokenMint);
      await sleep(5000);
      const buyersCount3 = await getBuyersCount(tokenMint);
      await sleep(5000);
      const buyersCount4 = await getBuyersCount(tokenMint);
      await sleep(5000);
      const buyersCount5 = await getBuyersCount(tokenMint);
      const counts = [buyersCount, buyersCount2, buyersCount3, buyersCount4, buyersCount5];
      const minBuyers = Math.min(...counts);
      const maxBuyers = Math.max(...counts);
      if (maxBuyers < 10 || maxBuyers < minBuyers * 2) {
        logTrade('BUY_FAIL', tokenMint, null, { error: 'buyers not doubled in 20s', buyers: counts });
        console.log('❌ لم يتضاعف عدد المشترين خلال 20 ثانية. لن يتم الشراء.');
        return;
      }
      // --- شرط توزيع الملكية: لا تشتري إذا كان عنوان واحد يملك > 40% ---
      const holders = await getTokenHolders(tokenMint);
      if (holders.length > 0 && holders[0].amount / holders.reduce((a, b) => a + b.amount, 0) > 0.4) {
        logTrade('BUY_FAIL', tokenMint, null, { error: 'ownership too concentrated', topHolder: holders[0] });
        console.log('❌ توزيع الملكية مركّز جدًا. لن يتم الشراء.');
        return;
      }
    } catch (e) {
      logTrade('BUY_FAIL', tokenMint, null, { error: 'buyers/holders check failed', details: e.message });
      console.log('⚠️ تعذر التحقق من عدد المشترين أو توزيع الملكية. لن يتم الشراء.');
      return;
    }
  }
// دالة مساعدة: جلب توزيع ملكية التوكن (Top Holders) من Helius API
async function getTokenHolders(tokenMint) {
  // جلب أعلى 10 محافظ تملك التوكن
  const url = `https://api.helius.xyz/v0/token/${tokenMint}/holders?api-key=${HELIUS_API_KEY}&limit=10`;
  const res = await axios.get(url);
  // النتيجة: [{owner, amount}, ...]
  return res.data.holders || [];
}
  // --- مراقبة السيولة والسبريد قبل الشراء ---
  try {
    // شراء دائمًا بقيمة 0.01 SOL (1e7 lamports)
    const [quoteRes, buyersNow] = await Promise.all([
      axios.get('https://quote-api.jup.ag/v6/quote', {
        params: {
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: tokenMint,
          amount: 10000000, // 0.01 SOL
          slippage: 1,
        },
      }),
      getBuyersCount(tokenMint)
    ]);
    const route = quoteRes.data.data[0];
    if (!route) {
      logTrade('BUY_FAIL', tokenMint, null, { error: 'no route' });
      console.error('❌ لم يتم العثور على مسار مناسب للشراء.');
      return;
    }
    // شرط السيولة: يجب أن تكون السيولة > 5 SOL
    if (route.marketInfos && route.marketInfos[0]?.liquidity < 5 * 1e9) {
      logTrade('BUY_FAIL', tokenMint, null, { error: 'liquidity too low', liquidity: route.marketInfos[0]?.liquidity });
      console.log('❌ السيولة منخفضة جدًا. لن يتم الشراء.');
      return;
    }
    // شرط السبريد: يجب أن يكون السبريد < 2%
    if (route.marketInfos && route.marketInfos[0]?.priceImpactPct > 0.02) {
      logTrade('BUY_FAIL', tokenMint, null, { error: 'spread too high', spread: route.marketInfos[0]?.priceImpactPct });
      console.log('❌ السبريد مرتفع جدًا. لن يتم الشراء.');
      return;
    }
    const pricePerToken = route.outAmount / route.inAmount;
    // تنفيذ الشراء بقيمة 0.01 SOL فقط
    const swapRes = await axios.post(JUPITER_SWAP_API, {
      route,
      userPublicKey: userKeypair.publicKey.toBase58(),
      wrapUnwrapSOL: true,
      feeAccount: null,
    });
    const { swapTransaction } = swapRes.data;
    const txBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([userKeypair]);
    const txid = await connection.sendRawTransaction(transaction.serialize());
    logTrade('BUY', tokenMint, txid, { pricePerToken, buyersNow });
    tokenBuyPrices.set(tokenMint, pricePerToken);
    purchasedTokens.add(tokenMint);
    setTimeout(() => monitorPriceForSmartSell(tokenMint), 30 * 1000);
  } catch (err) {
    if (retry < 2) {
      console.warn(`🔁 إعادة محاولة الشراء (${retry + 1})...`);
      setTimeout(() => buyToken(tokenMint, retry + 1), 2000 * (retry + 1));
    } else {
      logTrade('BUY_FAIL', tokenMint, null, { error: err.message });
      console.error('❌ فشل الشراء النهائي:', err.message, err.response?.data || '');
    }
  }
}

// دالة مساعدة: جلب عدد المشترين الفريدين لتوكن معين من Helius API
async function getBuyersCount(tokenMint) {
  // جلب آخر 100 معاملة للتوكن وتحليل المشترين
  const url = `https://api.helius.xyz/v0/token/${tokenMint}/transfers?api-key=${HELIUS_API_KEY}&limit=100`;
  const res = await axios.get(url);
  const transfers = res.data.transfers || [];
  const buyers = new Set();
  for (const t of transfers) {
    if (t.type === 'transfer' && t.destination) buyers.add(t.destination);
  }
  return buyers.size;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ينفذ عملية بيع توكن
 * @param {string} tokenMint
 * @param {number} amount
 * @param {number} retry
 */
async function sellToken(tokenMint, amount = 1000000, retry = 0) {
  try {
    const quoteRes = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: tokenMint,
        outputMint: 'So11111111111111111111111111111111111111112',
        amount,
        slippage: 1,
      },
    });
    const route = quoteRes.data.data[0];
    if (!route) {
      console.error('❌ لم يتم العثور على مسار مناسب للبيع.');
      return;
    }
    const swapRes = await axios.post(JUPITER_SWAP_API, {
      route,
      userPublicKey: userKeypair.publicKey.toBase58(),
      wrapUnwrapSOL: true,
      feeAccount: null,
    });
    const { swapTransaction } = swapRes.data;
    const txBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([userKeypair]);
    const txid = await connection.sendRawTransaction(transaction.serialize());
    logTrade('SELL', tokenMint, txid, { amount });
  } catch (err) {
    if (retry < 2) {
      console.warn(`🔁 إعادة محاولة البيع (${retry + 1})...`);
      setTimeout(() => sellToken(tokenMint, amount, retry + 1), 2000 * (retry + 1));
    } else {
      console.error('❌ فشل البيع النهائي:', err.message, err.response?.data || '');
      logTrade('SELL_FAIL', tokenMint, null, { error: err.message });
    }
  }
}

// استخراج mint من السجلات بطريقة أكثر أمانًا
/**
 * يستخرج mint جديد من السجلات
 * @param {string[]} logs
 * @returns {string|null}
 */
function extractNewTokenMintFromLogs(logs) {
  for (const line of logs) {
    // Debug: طباعة كل log يتم تحليله
    console.log('🔵 [LOG_ANALYZE]', line);
    // ابحث عن أي عنوان محتمل لطرف mint
    const parts = line.match(/[A-HJ-NP-Za-km-z1-9]{32,44}/g);
    if (parts && parts.length > 0) {
      // تحقق أن العنوان ليس من قائمة التوكنات المحظورة أو عناوين SOL
      for (const mint of parts) {
        if (
          mint !== 'So11111111111111111111111111111111111111112' &&
          !BANNED_KEYWORDS.some(k => mint.toLowerCase().includes(k))
        ) {
          return mint;
        }
      }
    }
  }
  return null;
}

const walletActivityCache = new Map();
/**
 * يتحقق من نشاط المحافظ المراقبة بالنسبة لتوكن معين
 * @param {string} tokenMint
 * @returns {Promise<boolean>}
 */
async function checkWalletsActivity(tokenMint) {
  // --- تعديل: السماح بالشراء دائماً على devnet ---
  if (NETWORK === 'devnet') return true;
  // ...existing code...
}

/**
 * يراقب سعر التوكن ويبيع تلقائيًا عند تحقيق ربح
 * @param {string} tokenMint
 */
async function monitorPriceForSmartSell(tokenMint) {
  const buyPrice = tokenBuyPrices.get(tokenMint);
  if (!buyPrice) return;

  try {
    const quoteRes = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: tokenMint,
        outputMint: 'So11111111111111111111111111111111111111112',
        amount: 1000000,
        slippage: 1,
      },
    });
    const route = quoteRes.data.data[0];
    const currentPrice = route.outAmount / route.inAmount;
    const gain = (currentPrice - buyPrice) / buyPrice;

    // Stop Loss ديناميكي: بيع كامل إذا انخفض السعر أكثر من 10%
    if (gain <= -0.1) {
      console.log('🛑 Stop Loss: بيع كامل بسبب انخفاض السعر > 10%');
      await sellToken(tokenMint);
      return;
    }
    if (gain >= 0.3) {
      console.log('📈 +30%: بيع 30% من الرصيد');
      await sellToken(tokenMint);
    } else if (gain >= 0.6) {
      console.log('📈 +60%: بيع 30% من المتبقي');
      await sellToken(tokenMint);
    }

    await checkWhaleSellOff(tokenMint);
  } catch (err) {
    console.error('📉 خطأ في مراقبة السعر:', err.message);
  } finally {
    setTimeout(() => monitorPriceForSmartSell(tokenMint), 10 * 1000); // مراقبة كل 10 ثوانٍ
  }
}

/**
 * يراقب عمليات بيع ضخمة من الحيتان
 * @param {string} tokenMint
 * @returns {Promise<boolean>}
 */
async function checkWhaleSellOff(tokenMint) {
  try {
    const results = await Promise.all(WATCHED_WALLETS.map(async (wallet) => {
      const res = await axios.get(`${HELIUS_TX_API}/${wallet}/transactions`, {
        params: {
          'api-key': HELIUS_API_KEY,
          limit: 5,
        },
      });
      const txs = res.data;
      for (const tx of txs) {
        const transfers = tx.events?.tokenTransfers || [];
        for (const t of transfers) {
          if (t.mint === tokenMint && t.tokenAmount && parseFloat(t.tokenAmount) > 5 * 1e6) {
            console.log('🚨 رصد بيع ضخم من محفظة كبرى - بيع كامل');
            await sellToken(tokenMint);
            return true;
          }
        }
      }
      return false;
    }));
    return results.some(Boolean);
  } catch (e) {
    console.error('⚠️ فشل في رصد بيع المحافظ:', e.message, e.response?.data || '');
    return false;
  }
}

let socket;
let wsReconnectAttempts = 0;
/**
 * ينشئ اتصال WebSocket ويعالج الأحداث
 */
function connectWebSocket() {
  socket = new WebSocket(HELIUS_WS_URL);
  let logCount = 0;

  socket.on('open', () => {
    wsReconnectAttempts = 0;
    console.log('🔌 WebSocket Connected');
    const message = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { all: {} },
        { commitment: 'finalized' },
      ],
    };
    socket.send(JSON.stringify(message));
  });

  socket.on('message', async (data) => {
    try {
      // Debug: طباعة كل رسالة WebSocket تصل
      console.log('🟣 [WS_RAW]', data);
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        console.log('🔴 [WS_PARSE_ERROR]', typeof data, data);
        return;
      }
      const logs = parsed?.params?.result?.value?.logs || [];
      // Debug: طباعة كل logs يتم تحليلها
      if (logs && logs.length > 0 && logCount < 10) {
        logCount++;
        console.log(`🟠 [WS_LOGS #${logCount}]`, logs);
      } else if (!logs || logs.length === 0) {
        // إذا لم يوجد logs، اطبع هيكل الرسالة بالكامل لأول 3 مرات فقط
        if (logCount < 3) {
          logCount++;
          console.log('🟡 [WS_NO_LOGS]', JSON.stringify(parsed, null, 2));
        }
      }
      // اطبع نوع الرسالة وقيم الحقول المهمة
      if (parsed && parsed.method) {
        console.log('🟤 [WS_METHOD]', parsed.method);
      }
      const tokenMintDetected = extractNewTokenMintFromLogs(logs);
      const time = new Date().toISOString();
      if (tokenMintDetected) {
        // سجل كل mint جديد يتم رصده
        const mintLog = `[${time}] [MINT_DETECTED] ${tokenMintDetected} logs: ${JSON.stringify(logs)}`;
        console.log(mintLog);
        try { fs.appendFileSync('transactions.log', mintLog + '\n'); } catch {}
      }
      if (!tokenMintDetected) return;

      if (purchasedTokens.has(tokenMintDetected)) return;
      if (BANNED_KEYWORDS.some(k => tokenMintDetected.toLowerCase().includes(k))) return;
      if (dailyPurchaseCount >= DAILY_LIMIT) return;

      // سجل محاولة الشراء حتى لو لم تنجح
      const eligible = await checkWalletsActivity(tokenMintDetected);
      const tryLog = `[${time}] [BUY_ATTEMPT] ${tokenMintDetected} eligible: ${eligible}`;
      try { fs.appendFileSync('transactions.log', tryLog + '\n'); } catch {}
      if (eligible) {
        console.log('🟢 النشاط مؤهل للشراء');
        await buyToken(tokenMintDetected);
        dailyPurchaseCount++;
      } else {
        console.log('🔴 غير مؤهل');
      }
    } catch (e) {
      console.error('❌ خطأ في معالجة رسالة WebSocket:', e.message, e.response?.data || '');
      const errLog = `[${new Date().toISOString()}] [WS_ERROR] ${e.message}`;
      try { fs.appendFileSync('transactions.log', errLog + '\n'); } catch {}
    }
  });

  socket.on('close', () => {
    wsReconnectAttempts++;
    const delay = Math.min(30000, 5000 * wsReconnectAttempts); // max 30s
    console.log(`🔴 WebSocket مغلق. إعادة الاتصال خلال ${delay / 1000} ثانية...`);
    setTimeout(connectWebSocket, delay);
  });

  socket.on('error', (err) => {
    console.error('❌ WebSocket Error:', err.message);
    try { socket.close(); } catch {}
  });
}

// --- WebSocket مراقبة نشاط المحفظة بشكل لحظي ---
import WebSocket from 'ws';

const wsUrl = `wss://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [
      { "mentions": [userKeypair.publicKey.toBase58()] },
      { "commitment": "confirmed" }
    ]
  }));
  console.log('✅ تم الاشتراك في WebSocket لمراقبة نشاط المحفظة');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  // هنا يمكنك تحليل الرسالة واتخاذ قرار الشراء/البيع تلقائيًا
  console.log('📡 حدث جديد:', msg);
  // مثال: إذا تحقق شرط معين، نفذ أمر شراء/بيع تلقائيًا
});

ws.on('close', () => {
  console.log('❌ تم إغلاق الاتصال بـ WebSocket');
});

ws.on('error', (err) => {
  console.error('WebSocket Error:', err);
});

connectWebSocket();
