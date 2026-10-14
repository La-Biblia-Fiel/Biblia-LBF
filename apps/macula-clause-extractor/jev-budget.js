import { mkdir, open, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const JEV_INPUT_USD_PER_MILLION = .042, JEV_OUTPUT_USD_PER_MILLION = 0, JEV_CUMULATIVE_USD_CAP = 10;
export const estimatedCost = ({ input_tokens = 0, output_tokens = 0 }) => input_tokens / 1e6 * JEV_INPUT_USD_PER_MILLION + output_tokens / 1e6 * JEV_OUTPUT_USD_PER_MILLION;
export async function recordedSpend(root) { let total=0, usage={input_tokens:0,output_tokens:0}; async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.json'))try{const x=JSON.parse(await readFile(p,'utf8'));if(x.usage?.input_tokens!=null){usage.input_tokens+=x.usage.input_tokens||0;usage.output_tokens+=x.usage.output_tokens||0;total+=Number.isFinite(x.cost_usd)?x.cost_usd:estimatedCost(x.usage)}}catch{}}} await walk(root); return {usd:total,usage}; }
export async function acquireLock(path){await mkdir(join(path,'..'),{recursive:true});try{return await open(path,'wx')}catch(e){if(e.code==='EEXIST')return null;throw e}}
export async function releaseLock(lock,path){if(lock){await lock.close();await import('node:fs/promises').then(({unlink})=>unlink(path));}}
