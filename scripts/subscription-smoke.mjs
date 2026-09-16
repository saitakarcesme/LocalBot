import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const connection = JSON.parse(await readFile(join(homedir(), "Library/Application Support/LocalBot/connection.json"), "utf8"));
async function api(path, body) {
  const r = await fetch(connection.url + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + connection.token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
async function run(conversationId, content, project = false) {
  const task = await api("/messages", { conversationId, content });
  console.log("Started", task.id);
  const end = Date.now() + 12 * 60_000;
  while (Date.now() < end) {
    const snapshot = await api("/snapshot");
    for (const approval of snapshot.approvals.filter(a => a.taskId === task.id)) {
      const activity = await api("/activity?conversationId=" + conversationId);
      const call = activity.find(a => a.id === approval.toolCallId);
      const args = JSON.parse(call.arguments);
      const safe = call.name === "remember" ||
        (call.name === "write_file" && (project || args.path.startsWith("localbot-v02-"))) ||
        (call.name === "run_tests" && /^node --test(?: [a-zA-Z0-9_./*-]+)?$/.test(args.command));
      await api("/approvals", { id: approval.id, allow: safe });
      console.log(safe ? "Approved test action" : "Denied unexpected action", call.name);
    }
    const current = snapshot.tasks.find(t => t.id === task.id);
    if (!["queued", "running", "awaiting_approval"].includes(current.status)) {
      const actions = (await api("/activity?conversationId=" + conversationId)).filter(a => a.taskId === task.id);
      console.log(JSON.stringify({ task: task.id, status: current.status, error: current.error, actions: actions.map(a => ({ name: a.name, status: a.status })) }));
      assert.equal(current.status, "completed");
      assert(actions.some(a => a.status === "completed"), "Must execute a real tool");
      return { task: task.id, actions: actions.map(a => ({ name: a.name, status: a.status })) };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await api("/cancel", { taskId: task.id });
  throw new Error("Live verification timed out");
}
const snapshot = await api("/snapshot");
const prompts = {
  coder: "write_file kullanarak localbot-v02-math.cjs dosyasına module.exports.add=(a,b)=>a+b yaz. Sonra localbot-v02-math.test.cjs oluştur: node:test ve node:assert/strict ile 2+3=5 ve -1+1=0 testleri. Başka dosya değiştirme. Türkçe kısa sonuç ver.",
  researcher: "web_fetch kullanarak https://example.com sayfasını incele. Bu alan adının ne amaçla kullanıldığını tek cümleyle açıkla ve kaynak bağlantısını yaz.",
  reviewer: "read_file kullanarak localbot-v02-math.cjs dosyasını incele. Değişiklik yapmadan fonksiyonun sınırlarını kısa açıkla.",
  tester: "run_tests kullanarak tam olarak node --test localbot-v02-math.test.cjs komutunu çalıştır. Gerçek test sonucunu bildir.",
  assistant: "remember kullanarak şu tercihi kaydet: İbrahim kısa, doğal Türkçe ve doğrulanmış sonuçlar istiyor. Kaydettikten sonra tek cümleyle yanıtla.",
};
const results = [];
for (const [agent, prompt] of Object.entries(prompts)) {
  const c = snapshot.conversations.find(c => c.members.length === 1 && c.members[0] === agent);
  assert(c, `Missing ${agent} conversation`);
  results.push({ agent, ...await run(c.id, prompt) });
}
const workspace = join(homedir(), "LocalBot Workspace", "Focus Ledger");
await mkdir(workspace, { recursive: true });
const project = await api("/projects", { name: "Focus Ledger", workspace });
const conversation = await api("/conversations", { title: "New project conversation", members: [], projectId: project.id, automatic: true });
results.push({ project: project.id, ...await run(conversation.id,
  "Bu proje için çalışan bir Node.js komut satırı odak süresi hesaplayıcısı geliştir. Dış bağımlılık kullanma. focus.cjs modülü toplam dakika hesaplayan ve negatif/geçersiz değerleri reddeden saf bir fonksiyon sunsun; doğrudan node focus.cjs 25 50 çalıştırılınca 75 yazsın. focus.test.cjs içinde en az 4 gerçek node:test testi ve README.md kullanım açıklaması olsun. Geliştirici uygulasın, reviewer dosyaları okuyup kontrol etsin, tester node --test focus.test.cjs çalıştırsın. Dosya işlemleri write_file/read_file ile olsun, terminal kullanma. Herkes kendi rolüne odaklansın, tamamlanmış işi tekrar yapmasın. Türkçe kısa iletişim kurun.", true) });
await mkdir("build", { recursive: true });
await writeFile("build/subscription-smoke-result.json", JSON.stringify(results, null, 2));
console.log("Subscription live verification complete");
