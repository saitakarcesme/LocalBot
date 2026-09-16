import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {definitions,allowed} from '../runtime/dist/tools.js';
const inventory=JSON.parse(readFileSync(new URL('../docs/CODEX-TOOL-INVENTORY.json',import.meta.url),'utf8'));
const statuses=new Map([
 ['implemented-equivalent','Listed as implemented'],
 ['partial-equivalent','Partial equivalent'],
 ['not-yet-implemented','Not implemented'],
 ['requires-localbot-counterpart','LocalBot counterpart required'],
 ['requires-service-adapter-and-authentication','Service adapter and authentication required'],
]);
const names=definitions.map(t=>t.function.name),targets=inventory.tools.map(t=>t.name);
assert.equal(new Set(names).size,names.length,'Duplicate runtime tool name');
assert.equal(new Set(targets).size,targets.length,'Duplicate inventory target');
assert.equal(targets.length,inventory.count,'Target count differs from inventory entries');
assert.deepEqual([...inventory.localbotBuiltins].sort(),[...names].sort(),'Update inventory built-ins to match runtime definitions');
const fullyEnabled={permissions:{filesystem:'write',terminal:true,git:true,web:true},integrations:['audit-fixture']};
for(const definition of definitions){
 const {name,description,parameters}=definition.function;
 assert(description?.trim(),`${name} has no description`);
 assert.equal(parameters.type,'object',`${name} has no object schema`);
 assert.equal(parameters.additionalProperties,false,`${name} accepts undeclared arguments`);
 assert(allowed(fullyEnabled,name),`${name} is registered but unreachable through permission dispatch`);
}
assert.equal(allowed(fullyEnabled,'__unknown_audit_tool__'),false,'Unknown tools must be denied');
const counts=new Map([...statuses.keys()].map(s=>[s,0]));
for(const entry of inventory.tools){
 assert(statuses.has(entry.status),`Unknown coverage status for ${entry.name}`);
 if(['implemented-equivalent','partial-equivalent'].includes(entry.status))assert(entry.route?.trim(),`Missing implementation route/limitation for ${entry.name}`);
 counts.set(entry.status,counts.get(entry.status)+1);
}
const report=[
 '# Tool coverage inventory','',
 `Captured target: **${inventory.count} Codex tools**. Registered LocalBot tools: **${names.length}**.`,'',
 'These counts summarize the inventory labels. They do not prove functional parity, successful authentication, or completion. LocalBot tools and target entries are different sets; the built-in count is not a coverage numerator.','',
 '| Inventory label | Count |','| --- | ---: |',
 ...[...statuses].map(([key,label])=>`| ${label} | ${counts.get(key)} |`),'',
 '## Registered LocalBot tools','',...names.map(name=>`- \`${name}\``),'',
 '## Targets listed as implemented','',
 ...inventory.tools.filter(t=>t.status==='implemented-equivalent').map(t=>`- \`${t.name}\`: ${t.route}`),'',
 'See [the full inventory](CODEX-TOOL-INVENTORY.json) for every remaining target and limitation, and [QA evidence](QA.md) for tested behavior.','',
 'Regenerate with `npm run audit:tools -- --write`; verify with `npm run audit:tools`. The check validates registration/schema/permission-dispatch reachability and inventory consistency. It does not execute tools or certify their permission enforcement.','',
].join('\n');
const reportURL=new URL('../docs/TOOL-COVERAGE.md',import.meta.url);
if(process.argv.includes('--write'))writeFileSync(reportURL,report);
else assert.equal(readFileSync(reportURL,'utf8'),report,'Tool coverage report is stale; regenerate it');
console.log(`Inventory consistent: ${names.length} built-ins; ${inventory.count} targets. Coverage remains incomplete.`);
