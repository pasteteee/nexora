import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { managementConfig } from "./lib/smtp-config.mjs";

async function main() {
  if (process.argv.slice(2).join(" ") !== "--remote-fixtures") throw new Error("Для теста требуется явный флаг --remote-fixtures");
  process.loadEnvFile(".env.local");
  process.loadEnvFile(".env.smtp.local");
  const management = managementConfig(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url !== `https://${management.projectRef}.supabase.co` || !publicKey?.startsWith("sb_publishable_")) throw new Error("Проверьте целевой проект Supabase");
  const network = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) });
  const keyResponse = await network(`https://api.supabase.com/v1/projects/${management.projectRef}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${management.accessToken}` },
  });
  if (!keyResponse.ok) throw new Error("Недостаточно прав для подготовки тестовых аккаунтов");
  const keys = await keyResponse.json();
  // Existing key stays in process memory, never in files, logs, browser assets or reports.
  const adminKey = keys.find(k => k.type === "secret" && k.api_key?.startsWith("sb_secret_"))?.api_key ??
    keys.find(k => k.id === "service_role" || k.name === "service_role")?.api_key;
  if (!adminKey) throw new Error("Не найден служебный ключ для подготовки тестовых аккаунтов");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: network } };
  const admin = createClient(url, adminKey, options);
  const run = `nexora-qa-${randomUUID()}`;
  const users = [], clients = [], checks = [], attemptedPaths = [];
  let workspaceId, filePath, server;
  const base = "http://127.0.0.1:3102";
  const sourceId = randomUUID();
  let cleanupVerified = false;
  function data(result, operation) { if (result.error) throw new Error(`${operation}: операция не выполнена`); return result.data; }
  function check(condition, label) { checks.push({ label, passed: Boolean(condition) }); if (!condition) throw new Error(label); }
  try {
    const actors = {};
    for (const role of ["owner", "viewer", "outsider", "editor"]) {
      const email = `${run}-${role}@example.test`, password = `${randomBytes(32).toString("base64url")}!aA7`;
      const created = data(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "Подготовка пользователя");
      users.push(created.user.id);
      const client = createClient(url, publicKey, options); clients.push(client);
      const signedIn = data(await client.auth.signInWithPassword({ email, password }), "Вход тестового пользователя");
      // Complete the app's independent email proof without sending an external email.
      const proof = data(await admin.auth.admin.generateLink({ type: "magiclink", email }), "Подготовка подтверждения адреса");
      data(await client.auth.verifyOtp({ token_hash: proof.properties.hashed_token, type: "magiclink" }), "Проверка подтверждения адреса");
      data(await client.rpc("confirm_profile_email"), "Подтверждение адреса профиля");
      actors[role] = { client, token: signedIn.session.access_token, email, id: created.user.id };
    }
    const owner = actors.owner.client;
    const workspace = data(await owner.from("workspaces").insert({ name: run }).select("id").single(), "Создание тестовой тетради");
    workspaceId = workspace.id;
    for (const role of ["viewer", "editor"]) {
      const invitation = data(await owner.rpc("create_workspace_invitation", { p_workspace_id: workspaceId, p_email: actors[role].email, p_role: role }), "Подготовка роли участника");
      const invitationRow = Array.isArray(invitation) ? invitation[0] : invitation;
      data(await actors[role].client.rpc("accept_workspace_invitation", { p_token: invitationRow.token }), "Принятие тестового приглашения");
      check(Boolean((await actors[role].client.rpc("accept_workspace_invitation", { p_token: invitationRow.token })).error), "Приглашение принимается только один раз");
    }
    const canvas = data(await owner.from("canvases").insert({ workspace_id: workspaceId, name: "QA page" }).select("id").single(), "Подготовка тестовой страницы");
    const peers = ["owner", "editor", "viewer"], live = [], cursorReceipts = new Set(), updates = new Set();
    try {
      const subscribe = channel => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Realtime: канал не подключился за 10 с")), 10_000);
        channel.subscribe((status, error) => {
          if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(new Error(`Realtime: ${status}: ${String(error?.message ?? "канал недоступен").replace(/eyJ[\w.-]+|sb_[\w-]+/g, "[redacted]").slice(0, 250)}`)); }
        });
      });
      async function delivered(predicate, label) {
        const start = performance.now();
        while (!predicate() && performance.now() - start < 2000) await pause(20);
        checks.push({ label, passed: predicate(), elapsedMs: Math.round(performance.now() - start) });
      }
      for (const role of peers) {
        const client = actors[role].client;
        await client.realtime.setAuth();
        const presence = client.channel(`page:${canvas.id}:live`, { config: { private: true, presence: { key: role, enabled: true } } })
          .on("presence", { event: "sync" }, () => {})
          .on("broadcast", { event: "cursor" }, ({ payload }) => cursorReceipts.add(`${payload.sender}:${role}`));
        const changed = client.channel(`page:${canvas.id}`, { config: { private: true } })
          .on("broadcast", { event: "element" }, ({ payload }) => { if (payload.op === "upsert") updates.add(role); });
        live.push(presence);
        await Promise.all([subscribe(presence), subscribe(changed)]);
      }
      for (let i = 0; i < peers.length; i++) check(await live[i].track({ userId: actors[peers[i]].id, name: peers[i] }) === "ok", `Presence ${peers[i]} подтверждён сервером`);
      await delivered(() => live.every(channel => Object.keys(channel.presenceState()).length === 3), "Три участника видят presence не позднее 2 с");
      checks.at(-1).participantCounts = live.map(channel => Object.keys(channel.presenceState()).length);
      for (let i = 0; i < peers.length; i++) {
        await live[i].send({ type: "broadcast", event: "cursor", payload: { sender: peers[i], cursor: { x: 12, y: 34 } } });
        await delivered(() => peers.filter(role => role !== peers[i]).every(role => cursorReceipts.has(`${peers[i]}:${role}`)), "Курсор участника доставляется остальным не позднее 2 с");
      }
      const element = { id: randomUUID(), canvas_id: canvas.id, workspace_id: workspaceId, type: "text", x: 100000, y: -100000, width: 400, height: 100, content_json: { text: "Public QA text" }, style_json: {} };
      data(await owner.from("elements").insert(element), "Сохранение объекта с Realtime");
      await delivered(() => peers.every(role => updates.has(role)), "Подтверждённый сервером объект доставляется трём участникам не позднее 2 с");
      check(Boolean((await actors.viewer.client.from("elements").insert({ ...element, id: randomUUID() })).error), "Наблюдатель не может записать объект через настоящий API");
      check(data(await actors.outsider.client.from("elements").select("id").eq("canvas_id", canvas.id), "Изоляция объектов").length === 0, "Посторонний не читает объекты через настоящий API");
    } catch (error) {
      if (checks.at(-1)?.passed !== false) checks.push({ label: error.message, passed: false });
      console.error(error.message);
    }
    filePath = `${workspaceId}/${sourceId}/qa.md`;
    attemptedPaths.push(filePath);
    const content = "# Nexora remote QA\nPrivate source download check.\n";
    data(await owner.from("sources").insert({ id: sourceId, workspace_id: workspaceId, file_path: filePath, original_name: "qa.md", mime_type: "text/markdown", size: Buffer.byteLength(content) }), "Регистрация тестового источника");
    data(await owner.storage.from("nexora-sources").upload(filePath, Buffer.from(content), { contentType: "text/markdown", upsert: false }), "Загрузка настоящего файла");
    const maxFile = 25 * 1024 * 1024;
    for (const size of [maxFile, maxFile + 1]) {
      const id = randomUUID(), path = `${workspaceId}/${id}/limit.txt`;
      attemptedPaths.push(path);
      // Deliberately understate metadata for the oversized upload to test Storage's own enforcement.
      data(await owner.from("sources").insert({ id, workspace_id: workspaceId, file_path: path, original_name: "limit.txt", mime_type: "text/plain", size: Math.min(size, maxFile) }), "Подготовка граничного файла");
      const uploaded = await owner.storage.from("nexora-sources").upload(path, Buffer.alloc(size, 65), { contentType: "text/plain", upsert: false });
      if (size === maxFile) check(!uploaded.error, "Настоящий файл ровно 25 МиБ загружается");
      else {
        check(Boolean(uploaded.error) && (String(uploaded.error.statusCode) === "413" || /exceed.*size|size.*exceed/i.test(uploaded.error.message)), "Storage отклоняет 25 МиБ + 1 байт при обходе клиентской проверки");
        const listed = data(await owner.storage.from("nexora-sources").list(`${workspaceId}/${id}`), "Проверка отсутствия отклонённого файла");
        check(listed.length === 0, "Отклонённый файл не сохраняется в Storage");
      }
    }
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"], {
      windowsHide: true, stdio: "ignore", env: { ...process.env, NEXORA_E2E: "0" },
    });
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await network(base)).ok) { ready = true; break; } } catch { /* Wait for our own server. */ }
      if (server.exitCode !== null) break;
      await pause(250);
    }
    if (!ready) throw new Error("Рабочий тестовый сервер не запустился. Сначала выполните npm run build");
    const publish = (token, method = "POST") => network(`${base}/api/publish/${canvas.id}`, { method, headers: { Authorization: `Bearer ${token}` } });
    check((await publish(actors.viewer.token)).status === 403, "Наблюдатель не публикует через настоящий HTTP API");
    check(!(await publish(actors.outsider.token)).ok, "Посторонний не публикует чужую страницу через HTTP API");
    const published = await publish(actors.owner.token);
    check(published.status === 200, "Владелец публикует страницу через настоящий HTTP API");
    const publication = (await published.json()).publication;
    const anonymous = createClient(url, publicKey, options);
    const projection = data(await anonymous.rpc("get_published_canvas", { p_slug: publication.slug }), "Анонимная публичная проекция");
    check(Boolean(projection) && !JSON.stringify(projection).includes(sourceId) && !JSON.stringify(projection).includes(filePath) && !Object.keys(projection).some(key => /sources|ai_requests/.test(key)), "Анонимная проекция не раскрывает приватный источник и историю ИИ");
    const publicPage = await network(`${base}/p/${publication.slug}`);
    check(publicPage.status === 200 && !(await publicPage.text()).includes(filePath), "Настоящая публичная страница открывается без приватного пути файла");
    check((await publish(actors.owner.token, "DELETE")).status === 200, "Владелец отключает публикацию через HTTP API");
    check(data(await anonymous.rpc("get_published_canvas", { p_slug: publication.slug }), "Отзыв публичной ссылки") === null, "Отключённая публичная ссылка сразу перестаёт возвращать данные");
    const download = (token, id = sourceId) => network(`${base}/api/sources/${id}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const own = await download(actors.owner.token);
    check(own.status === 200, "Владелец получает подписанную ссылку через HTTP API");
    const signed = await own.json();
    check(Object.keys(signed).sort().join() === "expiresIn,signedUrl" && signed.expiresIn >= 1 && signed.expiresIn <= 300, "Ответ содержит только ограниченную по времени ссылку");
    check((await (await network(signed.signedUrl)).text()) === content, "Подписанная ссылка скачивает исходный файл без изменений");
    check(own.headers.get("cache-control")?.includes("no-store"), "Ответ с подписанной ссылкой не кешируется");
    check((await download(actors.viewer.token)).status === 200, "Наблюдатель читает разрешённый файл");
    const foreign = await download(actors.outsider.token);
    check(foreign.status === 404, "Посторонний авторизованный пользователь получает 404");
    const missing = await download(actors.owner.token, randomUUID());
    check(missing.status === 404 && JSON.stringify(await missing.json()) === JSON.stringify(await foreign.json()), "Чужой и отсутствующий источник дают одинаковый ответ");
    check((await download(null)).status === 401, "Анонимный пользователь получает 401");
    const publicResponse = await network(`${url}/storage/v1/object/public/nexora-sources/${filePath}`);
    check(!publicResponse.ok, "Постоянная публичная ссылка не открывает приватный файл");
    const denied = await actors.outsider.client.storage.from("nexora-sources").createSignedUrl(filePath, 60);
    check(Boolean(denied.error) && !denied.data?.signedUrl, "Прямой Storage API также блокирует чужого пользователя");
    data(await owner.rpc("soft_delete_workspace", { p_workspace_id: workspaceId }), "Проверка корзины");
    check((await download(actors.owner.token)).status === 404, "Удаление тетради запрещает выдачу новых ссылок");
    data(await owner.rpc("restore_workspace", { p_workspace_id: workspaceId }), "Восстановление тестовой тетради");
    check((await download(actors.owner.token)).status === 200, "Восстановление тетради возвращает доступ к файлу");
  } finally {
    const cleanupErrors = [];
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") spawnSync(join(process.env.SystemRoot, "System32", "taskkill.exe"), ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else server.kill("SIGTERM");
    }
    if (attemptedPaths.length) { const r = await admin.storage.from("nexora-sources").remove(attemptedPaths); if (r.error) cleanupErrors.push("file"); }
    if (workspaceId) {
      const r = await admin.from("workspaces").delete().eq("id", workspaceId).eq("name", run).select("id");
      if (r.error || r.data?.length !== 1) cleanupErrors.push("workspace");
    }
    for (const client of clients) { await client.removeAllChannels(); await client.auth.signOut(); }
    for (const id of users) { const r = await admin.auth.admin.deleteUser(id); if (r.error) cleanupErrors.push("user"); }
    const leftovers = data(await admin.from("workspaces").select("id").eq("name", run), "Проверка очистки");
    cleanupVerified = cleanupErrors.length === 0 && leftovers.length === 0;
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/storage-remote-results.json", JSON.stringify({ testedAt: new Date().toISOString(), checks, cleanupVerified, emailsSent: 0 }, null, 2));
    console.log(`Проверки реального Auth/Storage/HTTP API: ${checks.filter(c => c.passed).length}/${checks.length}. Очистка: ${cleanupVerified ? "подтверждена" : "ОШИБКА"}. Писем: 0.`);
    if (!cleanupVerified) throw new Error("Очистка тестовых объектов не завершена");
    if (checks.some(check => !check.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
