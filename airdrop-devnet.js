import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PRIVATE_KEY, NETWORK } from './config.js';

const keypair = Keypair.fromSecretKey(Uint8Array.from(PRIVATE_KEY));
const connection = new Connection(`https://${NETWORK}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

(async () => {
  try {
    const sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL);
    console.log('تم إرسال Airdrop. Signature:', sig);
    const latest = await connection.confirmTransaction(sig, 'confirmed');
    console.log('تم تأكيد المعاملة:', latest);
  } catch (e) {
    console.error('فشل طلب airdrop:', e.message);
  }
})();
