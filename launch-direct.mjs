import Busboy from 'busboy';
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { PUMP_SDK } from '@pump-fun/pump-sdk';
import BN from 'bn.js';
const UNCURVE_SITE = 'https://uncurve-launch.vercel.app';
const DB_REF = process.env.WEBD_SUPABASE_PROJECT_REF || 'saneojmlgtmvtglgwdcj';
const FALLBACK_IQ_SECRET = 'iq-local-dev-secret';
const CREATOR_FEE_RECIPIENT = process.env.INTERACT_CREATOR_FEE_RECIPIENT || '5ABeaFSQ3UNmKgGouX1HTrsCzTE7NDFxc3Q6Yggp8TsL';
function sqlText(value){return `'${String(value??'').replaceAll("'","''")}'`;}
async function dbQuery(query){const token=process.env.WEBD_SUPABASE_MANAGEMENT_TOKEN;if(!token)return null;const r=await fetch(`https://api.supabase.com/v1/projects/${DB_REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Index database returned ${r.status}`);return r.json();}
async function savePrepared(record){return dbQuery(`insert into public.webd_launches (mint,name,symbol,description,domain_site,token_directory,metadata_uri,initial_buy_sol,status) values (${sqlText(record.mint)},${sqlText(record.name)},${sqlText(record.symbol)},${sqlText(record.description)},${sqlText(record.domainSite)},${sqlText(record.tokenDirectory)},${sqlText(record.metadataUri)},${sqlText(record.initialBuySol)},'prepared') on conflict (mint) do update set name=excluded.name,symbol=excluded.symbol,description=excluded.description,domain_site=excluded.domain_site,token_directory=excluded.token_directory,metadata_uri=excluded.metadata_uri,initial_buy_sol=excluded.initial_buy_sol,status='prepared'`);}
async function markConfirmed(mint,signature,record={}){const baseUrl=String(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://uncurve-launch.vercel.app').replace(/\/$/,'');const tokenDirectory=record.tokenDirectory||`${baseUrl}/${mint}`;return dbQuery(`insert into public.webd_launches (mint,name,symbol,description,domain_site,token_directory,metadata_uri,initial_buy_sol,status,signature) values (${sqlText(mint)},${sqlText(record.name||'UNCURVE Launch')},${sqlText(record.symbol||'UNCURVE')},${sqlText(record.description||'Launched through IQ.')},${sqlText(record.domainSite||baseUrl)},${sqlText(tokenDirectory)},${sqlText(record.metadataUri||'')},${sqlText(record.initialBuySol||'0.05')},'confirmed',${sqlText(signature)}) on conflict (mint) do update set status='confirmed',signature=excluded.signature,name=coalesce(nullif(public.webd_launches.name,''),excluded.name),symbol=coalesce(nullif(public.webd_launches.symbol,''),excluded.symbol),description=coalesce(nullif(public.webd_launches.description,''),excluded.description),domain_site=coalesce(nullif(public.webd_launches.domain_site,''),excluded.domain_site),token_directory=coalesce(nullif(public.webd_launches.token_directory,''),excluded.token_directory),metadata_uri=coalesce(nullif(public.webd_launches.metadata_uri,''),excluded.metadata_uri),initial_buy_sol=coalesce(public.webd_launches.initial_buy_sol,excluded.initial_buy_sol)`);}
const MANUAL_INDEX = [];
const HIDDEN_MINTS = new Set([
  'Bxqfswnvt4XjypinT9xuzuYfzyH9aWLgXkPZHntkH1WD',
  'giJv5e7FHMVFBvFKrGcQkbWGZK4zmm83i4nm2MsJw2u',
  'AhSzNmbxKiEZPwf8FaDihtbANEDgnMo9AYfckzqoggFX'
]);
export async function listLaunches(){try{const rows=((await dbQuery(`select mint,name,symbol,description,domain_site,token_directory,metadata_uri,image_url,initial_buy_sol,status,signature,created_at from public.webd_launches where status='confirmed' order by created_at desc limit 100`))||[]).filter(r=>!HIDDEN_MINTS.has(r.mint));const seen=new Set(rows.map(r=>r.mint));return [...rows,...MANUAL_INDEX.filter(r=>!seen.has(r.mint)&&!HIDDEN_MINTS.has(r.mint))];}catch{return MANUAL_INDEX.filter(r=>!HIDDEN_MINTS.has(r.mint));}}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.startsWith('multipart/form-data')) return reject(Object.assign(new Error('Use a token image and launch parameters.'), { status: 400 }));
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, fields: 4, files: 1 } });
    const fields = {}; let image;
    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => { const chunks=[]; stream.on('data', c=>chunks.push(c)); stream.on('limit',()=>reject(Object.assign(new Error('Image must be 5 MB or smaller.'),{status:413}))); stream.on('end',()=>{image={buffer:Buffer.concat(chunks),type:info.mimeType||'application/octet-stream',name:info.filename};}); });
    bb.on('error', reject);
    bb.on('finish', () => resolve({ fields, image }));
    req.pipe(bb);
  });
}
function fail(message, status=400) { throw Object.assign(new Error(message), { status }); }
function cookie(req, name){return Object.fromEntries(String(req.headers?.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x[0]))[name];}
async function hasXSession(req) { try { const raw=cookie(req,'iq_x_user'); if(!raw)return false; const user=JSON.parse(raw); const secret=process.env.X_SESSION_SECRET||process.env.IQ_CHALLENGE_SECRET||FALLBACK_IQ_SECRET; const expected=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${user.id}:${user.username}:${secret}`))).toString('base64url'); return !!user.id && user.sig===expected; } catch { return false; } }
async function validIqPass(value){
  const [id, sig] = String(value||'').split('.'); if(!id || !sig) return false;
  const secret = process.env.IQ_CHALLENGE_SECRET || FALLBACK_IQ_SECRET;
  const expected = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}:${secret}`))).toString('base64url');
  if(sig !== expected) return false;
  const rows = await dbQuery(`update public.iq_launch_passes set used=true where pass_id=${sqlText(id)} and used=false and expires_at > now() returning pass_id`);
  return Array.isArray(rows) && rows.length > 0;
}
function validSite(value) { let u; try { u = new URL(String(value||'').trim()); } catch { fail('Paste a valid HTTPS domain link.'); } if (u.protocol !== 'https:' || u.username || u.password || u.hash) fail('Domain links must be HTTPS URLs without credentials or fragments.'); return u.toString(); }
async function uploadMetadata(mint, image, data, website) {
  if (!image?.buffer?.length) fail('Token image is required.');
  if (!['image/png','image/jpeg','image/webp','image/gif'].includes(image.type)) fail('Use a PNG, JPEG, WebP, or GIF image.');
  const form = new FormData(); form.set('file', new Blob([image.buffer], {type:image.type}), image.name || 'token-image'); form.set('name',data.name); form.set('symbol',data.symbol); form.set('description',data.description); form.set('showName','true'); form.set('website',website);
  const r = await fetch('https://pump.fun/api/ipfs',{method:'POST',body:form,signal:AbortSignal.timeout(25000)}); if(!r.ok) fail(`Pump metadata upload failed (${r.status}).`,502);
  const j=await r.json(); if(!j.metadataUri) fail('Pump returned no metadata URI.',502); return j.metadataUri;
}
export async function directPrepare(req) {
  const {fields,image}=await readMultipart(req); let body; try { body=JSON.parse(fields.launch||'{}'); } catch { fail('Invalid launch parameters.'); }
  const wallet = new PublicKey(String(body.wallet||'')); if(!PublicKey.isOnCurve(wallet.toBytes())) fail('A signing wallet is required.');
  const name=String(body.name||'').trim(), symbol=String(body.symbol||'').trim().toUpperCase(), description=String(body.description||'').trim();
  const decimals=Number(body.decimals); const supplyText=String(body.totalSupply||'');
  if(!name || new TextEncoder().encode(name).length>32 || !/^[A-Z0-9]{1,10}$/.test(symbol) || description.length>1000) fail('Invalid token name, ticker, or description.');
  if(!Number.isInteger(decimals)||decimals<0||decimals>9||!/^[1-9]\d*$/.test(supplyText)) fail('Enter a valid supply and decimals value.');
  const rpc=process.env.SOLANA_RPC_URL||process.env.LOOT_RPC_URL||'https://api.mainnet-beta.solana.com'; const connection=new Connection(rpc,'confirmed');
  const baseUrl=String(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||UNCURVE_SITE).replace(/\/$/,'');
  const mint=Keypair.generate(); const feeRecipient=new PublicKey(CREATOR_FEE_RECIPIENT); const tokenDirectory=`${baseUrl}/${mint.publicKey.toBase58()}`; const uri=await uploadMetadata(mint.publicKey,image,{name,symbol,description},tokenDirectory); const latest=await connection.getLatestBlockhash('confirmed');
  const instructions=[await PUMP_SDK.createV2Instruction({ mint:mint.publicKey, name, symbol, uri, creator:feeRecipient, user:wallet, mayhemMode:false })];
  const message=new TransactionMessage({payerKey:wallet,recentBlockhash:latest.blockhash,instructions}).compileToV0Message(); const tx=new VersionedTransaction(message); tx.sign([mint]); if(tx.serialize().length>1232) fail('Launch transaction is too large for Solana packet limits.',422);
  const result={intentId:mint.publicKey.toBase58(),mint:mint.publicKey.toBase58(),website:tokenDirectory,domainSite:baseUrl,tokenDirectory,transactions:[{phase:'create',transaction:Buffer.from(tx.serialize()).toString('base64')}],platformFeeSol:'0',bondingCurve:true,totalSupply:supplyText,decimals,creatorWallet:wallet.toBase58(),creatorFeeRecipient:feeRecipient.toBase58(),name,symbol,description,metadataUri:uri}; await savePrepared({mint:mint.publicKey.toBase58(),name,symbol,description,domainSite:baseUrl,tokenDirectory,metadataUri:uri,initialBuySol:'0'}); return result;
}
export async function directConfirm(body) {
  const mint=new PublicKey(String(body.intentId||'')); const encoded=String(body.transaction||''); if(!encoded||encoded.length>10000) fail('The signed launch transaction is required.'); const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')); const keys=tx.message.staticAccountKeys.map(k=>k.toBase58()); if(!keys.includes(mint.toBase58())) fail('Signed transaction does not match the launch intent.');
  const baseUrl=String(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||UNCURVE_SITE).replace(/\/$/,''); const connection=new Connection(process.env.SOLANA_RPC_URL||process.env.LOOT_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed'); const signature=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3}); const result=await connection.confirmTransaction(signature,'confirmed'); if(result.value.err) fail('Direct mint transaction failed on Solana.',422); await markConfirmed(mint.toBase58(),signature,body); return {status:'confirmed',phase:'create',mint:mint.toBase58(),signature,website:`${baseUrl}/${mint.toBase58()}`,tokenDirectory:`${baseUrl}/${mint.toBase58()}`,platformFeeSol:'0',bondingCurve:false};
}
