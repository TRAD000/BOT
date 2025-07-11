import { Keypair } from '@solana/web3.js';
import { PRIVATE_KEY } from './config.js';

const keypair = Keypair.fromSecretKey(Uint8Array.from(PRIVATE_KEY));
console.log('Public Key:', keypair.publicKey.toBase58());
