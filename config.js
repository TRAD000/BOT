import dotenv from 'dotenv';
dotenv.config();

export const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
export const PRIVATE_KEY = JSON.parse(process.env.PRIVATE_KEY);
export const NETWORK = process.env.NETWORK;
export const WATCHED_WALLETS = process.env.WATCHED_WALLETS ? process.env.WATCHED_WALLETS.split(',') : [];
export const DAILY_LIMIT = process.env.DAILY_LIMIT ? Number(process.env.DAILY_LIMIT) : 0;
export const SOL_USD_PRICE = process.env.SOL_USD_PRICE ? Number(process.env.SOL_USD_PRICE) : 0;
export const BANNED_KEYWORDS = process.env.BANNED_KEYWORDS ? process.env.BANNED_KEYWORDS.split(',') : [];
