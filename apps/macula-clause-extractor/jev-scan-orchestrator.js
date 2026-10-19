#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./jev-budget.js";
export const routes=["annotated-ot","nt","ot-fallback"];
export async function dispatch({run,rounds=1,shouldStop=()=>false,betweenRouteMs=0}){const exhausted=new Set(),results=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));for(let round=0;round<rounds;round++){for(const route of routes){if(shouldStop())return{status:"execution_limit",results};if(exhausted.has(route))continue;const result=await run(route);results.push({route,...result});if(["exhausted","no_prepared_work"].includes(result.status))exhausted.add(route);else if(result.status!=="completed")return{status:result.status,results};if(betweenRouteMs>0)await pause(betweenRouteMs)}if(exhausted.size===routes.length)return{status:"eligible_routes_exhausted",results}}return{status:"checkpoint_batch_completed",results}}
const root=fileURLToPath(new URL(".",import.meta.url));
function child(file,args=[],env={}){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[join(root,file),...args],{cwd:root,env:{...process.env,...env},stdio:["ignore","pipe","inherit"]});let output="";p.stdout.on("data",d=>output+=d);p.on("error",reject);p.on("close",code=>{if(code)return reject(new Error(`${file} exited ${code}`));try{resolve(JSON.parse(output.trim()))}catch{try{resolve(JSON.parse(output.trim().split("\n").at(-1)))}catch{reject(new Error(`Invalid status output from ${file}`))}}})})}
export async function main(){
  if(process.argv.includes("--dispatch-dry-run")){console.log(JSON.stringify(await dispatch({run:async route=>({status:"completed",command:route==="annotated-ot"?"plan-next-ot-tranche.js then openrouter-jev-genesis-compact-tranche.js --route-only":`SOURCE_ONLY_KIND=${route} node openrouter-jev-nt-source-only.js`})})));return}
  const lockPath=join(root,"var","jev-orchestrator.lock"),lock=await acquireLock(lockPath);
  if(!lock){console.log(JSON.stringify({status:"overlap_prevented"}));return}
  const rounds=Number(process.env.JEV_SCAN_ROUNDS||1),betweenRouteMs=Number(process.env.JEV_ROUTE_INTERVAL_MS||0),recoveryWindow=process.env.JEV_EXPLICIT_RECOVERY_WINDOW||null;
  if(!Number.isInteger(rounds)||rounds<1){await releaseLock(lock,lockPath);throw new Error("JEV_SCAN_ROUNDS must be a positive integer")}
  if(!Number.isFinite(betweenRouteMs)||betweenRouteMs<0){await releaseLock(lock,lockPath);throw new Error("JEV_ROUTE_INTERVAL_MS must be zero or greater")}
  try{const result=await dispatch({rounds,betweenRouteMs,run:async route=>{
    if(route==="annotated-ot"){
      const plan=await child("plan-next-ot-tranche.js"); if(!plan.proposed_next_tranche?.length)return{status:"no_prepared_work"};
      const r=await child("openrouter-jev-genesis-compact-tranche.js",["--route-only",...(recoveryWindow?[`--recover-window=${recoveryWindow}`]:[])]);
      return{...r,status:r.stop?.kind==="systemic_error"?"systemic_error":r.stop&&r.stop.kind!=="recovery_completed"?"budget_limit":r.status||"completed"}
    }
    const r=await child("openrouter-jev-nt-source-only.js",[],{SOURCE_ONLY_KIND:route});return{...r,status:r.status?.endsWith("_exhausted")?"exhausted":r.status==="succeeded"?"completed":r.status}
  }});console.log(JSON.stringify(result))}finally{await releaseLock(lock,lockPath)}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await main();
