import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { PRIVATE_KEY, NETWORK, HELIUS_API_KEY } from './config.js';

const keypair = Keypair.fromSecretKey(Uint8Array.from(PRIVATE_KEY));
const connection = new Connection(`https://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

(async () => {
  try {
    // إنشاء mint جديد
    const mint = await createMint(
      connection,
      keypair,
      keypair.publicKey,
      null,
      9 // Decimals
    );
    console.log('✅ تم إنشاء توكن جديد. mint:', mint.toBase58());

    // إنشاء حساب توكن مرتبط بالمحفظة
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      keypair.publicKey
    );
    // سك كمية من التوكن
    await mintTo(
      connection,
      keypair,
      mint,
      tokenAccount.address,
      keypair.publicKey,
      1000000000 // 1 مليار وحدة
    );
    console.log('✅ تم سك التوكن في الحساب:', tokenAccount.address.toBase58());
  } catch (e) {
    console.error('❌ خطأ في إنشاء التوكن:', e.message);
  }
})();
