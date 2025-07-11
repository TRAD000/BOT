import axios from 'axios';
import { HELIUS_API_KEY } from './config.js';

// ضع هنا العنوان العام لمحفظتك
const address = '4MdBtccqcQug1oC5z9tfttZmxS7j72jCuvgm7LzUcZ9B';
const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=10`;

(async () => {
  try {
    const res = await axios.get(url);
    if (res.data && res.data.length > 0) {
      console.log('آخر 10 معاملات للمحفظة:');
      res.data.forEach((tx, i) => {
        console.log(`\n#${i+1} - Signature: ${tx.signature}`);
        console.log(`  Slot: ${tx.slot}`);
        console.log(`  Timestamp: ${tx.timestamp}`);
        console.log(`  Type: ${tx.type}`);
        if (tx.amounts && tx.amounts.length > 0) {
          tx.amounts.forEach((amt, j) => {
            console.log(`    Amount[${j}]: ${amt.amount} ${amt.mint}`);
          });
        }
      });
    } else {
      console.log('لا توجد معاملات حديثة لهذه المحفظة.');
    }
  } catch (e) {
    console.error('خطأ في جلب المعاملات:', e.message);
  }
})();
