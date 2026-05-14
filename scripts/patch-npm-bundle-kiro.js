/**
 * Patch 9router npm bundle for Kiro provider fixes.
 * Run after: npm install -g 9router@latest
 *
 * Fixes:
 *  1. retry:{429:4}, timeout:15000, keepAlive:true, Connection:keep-alive
 *  2. listAvailableModels: new endpoint + GET + KiroIDE User-Agent (dynamic model list)
 *  3. profileArn optional (works for non-IdC accounts too)
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Auto-detect 9router install path
let BASE;
try {
  const bin = execSync('which 9router', { encoding: 'utf8' }).trim();
  // bin = /path/to/bin/9router -> resolve to package root
  const pkgRoot = require('path').resolve(require('fs').realpathSync(bin), '../../');
  BASE = pkgRoot + '/app/.next/';
} catch {
  // fallback to hardcoded nvm path
  const nodeVer = execSync('node -e "process.version.slice(1)"', { encoding: 'utf8' }).trim();
  BASE = `${process.env.HOME}/.nvm/versions/node/v${nodeVer}/lib/node_modules/9router/app/.next/`;
}
console.log('Bundle path:', BASE);

const patches = [
  // --- Patch 1: retry/timeout/keepAlive ---
  {
    label: 'retry/timeout/keepAlive',
    files: [
      'server/app/api/v1/web/fetch/route.js',
      'server/app/api/v1/search/route.js',
      'server/app/api/providers/[id]/models/route.js',
      'server/chunks/1795.js',
      'server/chunks/8012.js',
      'server/chunks/9737.js',
      'static/chunks/505-b308a2b0c9199c92.js',
    ],
    check: 'generateAssistantResponse',
    old: `kiro:{baseUrl:"https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",format:"kiro",retry:{429:2},headers:{"Content-Type":"application/json",Accept:"application/vnd.amazon.eventstream","X-Amz-Target":"AmazonCodeWhispererStreamingService.GenerateAssistantResponse","User-Agent":"AWS-SDK-JS/3.0.0 kiro-ide/1.0.0","X-Amz-User-Agent":"aws-sdk-js/3.0.0 kiro-ide/1.0.0"}`,
    new: `kiro:{baseUrl:"https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",format:"kiro",retry:{429:4},timeout:15000,keepAlive:true,headers:{"Content-Type":"application/json",Accept:"application/vnd.amazon.eventstream","X-Amz-Target":"AmazonCodeWhispererStreamingService.GenerateAssistantResponse","User-Agent":"AWS-SDK-JS/3.0.0 kiro-ide/1.0.0","X-Amz-User-Agent":"aws-sdk-js/3.0.0 kiro-ide/1.0.0","Connection":"keep-alive"}`,
  },

  // --- Patch 2: listAvailableModels - auto-fetch profileArn via ListAvailableProfiles + new endpoint ---
  {
    label: 'listAvailableModels dynamic fetch + auto profileArn',
    files: ['server/chunks/5445.js'],
    check: 'listAvailableModels',
    old: `async listAvailableModels(a,b){let c=await fetch("https://codewhisperer.us-east-1.amazonaws.com",{method:"POST",headers:{"Content-Type":"application/x-amz-json-1.0","x-amz-target":"AmazonCodeWhispererService.ListAvailableModels",Authorization:\`Bearer \${a}\`,Accept:"application/json"},body:JSON.stringify({origin:"AI_EDITOR",profileArn:b})});if(!c.ok){let a=await c.text();throw Error(\`Failed to list models: \${a}\`)}return((await c.json()).models||[]).map(a=>({id:a.modelId,name:a.modelName||a.modelId,description:a.description,rateMultiplier:a.rateMultiplier,rateUnit:a.rateUnit,maxInputTokens:a.tokenLimits?.maxInputTokens||0}))`,
    new: `async listAvailableModels(a,b){const headers={Authorization:\`Bearer \${a}\`,Accept:"application/json","User-Agent":"aws-sdk-js/1.0.27 ua/2.1 os/win32#10.0.19044 lang/js md/nodejs#22.21.1 api/codewhispererstreaming#1.0.27 m/E KiroIDE-0.7.45","x-amz-user-agent":"aws-sdk-js/1.0.27 KiroIDE-0.7.45","x-amzn-kiro-agent-mode":"vibe"};if(!b){try{const pr=await fetch("https://q.us-east-1.amazonaws.com/ListAvailableProfiles",{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({})});if(pr.ok){const pd=await pr.json();b=(pd.profiles||[])[0]?.arn;console.log("[Kiro] resolved profileArn:",b);}}catch(e){console.log("[Kiro] ListAvailableProfiles failed:",e.message);}}let p=new URLSearchParams({origin:"AI_EDITOR"});if(b)p.set("profileArn",b);let c=await fetch(\`https://q.us-east-1.amazonaws.com/ListAvailableModels?\${p}\`,{method:"GET",headers});if(!c.ok){let a=await c.text();throw Error(\`Failed to list models: \${a}\`)}return((await c.json()).models||[]).map(a=>({id:a.modelId,name:a.modelName||a.modelId,description:a.description,rateMultiplier:a.rateMultiplier,rateUnit:a.rateUnit,maxInputTokens:a.tokenLimits?.maxInputTokens||0}))`,
  },

  // --- Patch 3: profileArn optional (works for non-IdC/free accounts with null profileArn) ---
  {
    label: 'profileArn optional',
    files: ['server/app/api/providers/[id]/models/route.js'],
    check: 'listAvailableModels(c,b)',
    old: `if(c&&b)try{let e=await a.listAvailableModels(c,b)`,
    new: `if(c)try{let e=await a.listAvailableModels(c,b)`,
  },

  // --- Patch 5: full kr models list in static/server bundles (dashboard UI) ---
  {
    label: 'kr static models list (UI)',
    files: [
      'server/chunks/9737.js',
      'server/chunks/1795.js',
      'static/chunks/505-b308a2b0c9199c92.js',
    ],
    check: 'claude-sonnet-4.5',
    old: `kr:[{id:"claude-sonnet-4.5",name:"Claude Sonnet 4.5"},{id:"claude-haiku-4.5",name:"Claude Haiku 4.5"},{id:"deepseek-3.2",name:"DeepSeek 3.2",strip:["image","audio"]},{id:"qwen3-coder-next",name:"Qwen3 Coder Next",strip:["image","audio"]},{id:"glm-5",name:"GLM 5"},{id:"MiniMax-M2.5",name:"MiniMax M2.5"}]`,
    new: `kr:[{id:"auto",name:"Auto"},{id:"claude-opus-4.7",name:"Claude Opus 4.7"},{id:"claude-opus-4.6",name:"Claude Opus 4.6"},{id:"claude-sonnet-4.6",name:"Claude Sonnet 4.6"},{id:"claude-opus-4.5",name:"Claude Opus 4.5"},{id:"claude-sonnet-4.5",name:"Claude Sonnet 4.5"},{id:"claude-sonnet-4",name:"Claude Sonnet 4"},{id:"claude-haiku-4.5",name:"Claude Haiku 4.5"},{id:"deepseek-3.2",name:"DeepSeek 3.2",strip:["image","audio"]},{id:"minimax-m2.5",name:"MiniMax M2.5"},{id:"minimax-m2.1",name:"MiniMax M2.1"},{id:"glm-5",name:"GLM 5"},{id:"qwen3-coder-next",name:"Qwen3 Coder Next",strip:["image","audio"]}]`,
  },

  // --- Patch 4: fallback to full static model list instead of [] on dynamic fetch failure ---
  {
    label: 'kiro static fallback models',
    files: ['server/app/api/providers/[id]/models/route.js'],
    check: 'Failed to fetch Kiro models',
    old: `return v.NextResponse.json({provider:d.provider,connectionId:d.id,models:[],warning:a})}if("gemini-cli"===d.provider)`,
    new: `return v.NextResponse.json({provider:d.provider,connectionId:d.id,models:[{id:"claude-opus-4.7",name:"Claude Opus 4.7"},{id:"claude-opus-4.6",name:"Claude Opus 4.6"},{id:"claude-sonnet-4.6",name:"Claude Sonnet 4.6"},{id:"claude-sonnet-4.5",name:"Claude Sonnet 4.5"},{id:"claude-haiku-4.5",name:"Claude Haiku 4.5"},{id:"deepseek-3.2",name:"DeepSeek 3.2"},{id:"qwen3-coder-next",name:"Qwen3 Coder Next"},{id:"glm-5",name:"GLM 5"},{id:"MiniMax-M2.5",name:"MiniMax M2.5"}],warning:a})}if("gemini-cli"===d.provider)`,
  },
];

let totalPatched = 0;
for (const patch of patches) {
  for (const rel of patch.files) {
    const f = BASE + rel;
    if (!fs.existsSync(f)) { console.log(`MISSING [${patch.label}]: ${rel.split('/').pop()}`); continue; }
    let c = fs.readFileSync(f, 'utf8');
    if (!c.includes(patch.check)) continue; // file doesn't have this section
    if (c.includes(patch.old)) {
      fs.writeFileSync(f, c.replace(patch.old, patch.new));
      console.log(`PATCHED [${patch.label}]: ${rel.split('/').pop()}`);
      totalPatched++;
    } else if (c.includes(patch.new)) {
      console.log(`ALREADY [${patch.label}]: ${rel.split('/').pop()}`);
    } else {
      const idx = c.indexOf(patch.check);
      console.log(`NO_MATCH [${patch.label}]: ${rel.split('/').pop()} — snippet: ${c.slice(Math.max(0,idx-30), idx+150)}`);
    }
  }
}
console.log(`\nTotal patched: ${totalPatched}`);
