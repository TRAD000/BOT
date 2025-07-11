// توليد مفتاح Solana جديد وطباعته كـ array
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const keypair = Keypair.generate();
console.log('PRIVATE_KEY_ARRAY=' + JSON.stringify(Array.from(keypair.secretKey)));
