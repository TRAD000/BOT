import { Connection, Keypair } from '@solana/web3.js';
import { PRIVATE_KEY, NETWORK, HELIUS_API_KEY } from './config.js';

const keypair = Keypair.fromSecretKey(Uint8Array.from(PRIVATE_KEY));
const connection = new Connection(`https://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

(async () => {
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('رصيد المحفظة:', balance / 1e9, 'SOL');
    console.log('العنوان العام:', keypair.publicKey.toBase58());
  } catch (e) {
    console.error('خطأ في جلب الرصيد:', e.message);
  }
})();
