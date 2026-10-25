const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'garcom-pwa');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('consentimento inicial é contextual e persistido por token de garçom', () => {
  assert.ok(js.includes("const CONSENT_SEEN='garcom-notification-intro-v1-'+waiterToken"));
  assert.match(js, /if\(!localStorage\.getItem\(CONSENT_SEEN\)\)\s*\{[\s\S]*?consentDialog\.showModal\(\)/);
  assert.match(js, /consentDialog\.addEventListener\('close',[^;]*localStorage\.setItem\(CONSENT_SEEN,'1'\)/);
  assert.match(js, /\$\('#dismissNotificationConsent'\)\.addEventListener\('click',[^;]*localStorage\.setItem\(CONSENT_SEEN,'1'\)/);
});

test('pedido de permissão existe uma única vez e fica dentro de ação explícita', () => {
  const calls = js.match(/Notification\.requestPermission\(\)/g) || [];
  assert.equal(calls.length, 1, 'não solicitar permissão automaticamente em outros fluxos');
  const handlerStart = js.indexOf("\$\('#requestNotificationPermission'\).addEventListener('click'");
  const handlerEnd = js.indexOf("\n});", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'handler explícito de clique deve existir');
  const permissionCall = js.indexOf('Notification.requestPermission()', handlerStart);
  assert.ok(permissionCall > handlerStart && permissionCall < handlerEnd, 'chamada deve estar dentro do handler de clique');
  assert.match(html, /id="requestNotificationPermission"/);
});

test('recusa informa consequência, pede confirmação e não tenta reabrir permissão negada', () => {
  assert.match(js, /window\.confirm\('Você recusou as notificações e não receberá avisos por este navegador/);
  assert.ok(js.includes("garcom-notifications-declined-'+waiterToken"));
  assert.match(js, /Permissão negada nas configurações do navegador/);
  assert.match(js, /requestNotificationPermission'\)\.disabled=permission==='unavailable'\|\|permission==='denied'/);
  assert.match(js, /alterá-la nas configurações do site/);
});

test('permissão concedida não é descrita como push funcional em segundo plano', () => {
  assert.match(js, /push em segundo plano não está configurado no servidor/);
  assert.match(js, /servidor ainda não implementa subscrição nem envio Web Push/);
  assert.doesNotMatch(js, /PushManager\.subscribe\(/);
  assert.doesNotMatch(js, /webpush\.sendNotification/);
  assert.match(html, /Conceder permissão, por si só, não garante avisos quando o aplicativo estiver fechado/);
});

test('instalação oferece prompt nativo quando disponível e instruções manuais caso contrário', () => {
  assert.match(js, /beforeinstallprompt/);
  assert.match(js, /await prompt\.prompt\(\)/);
  assert.match(js, /display-mode: standalone/);
  assert.match(js, /Adicionar à Tela de Início/);
  assert.match(js, /Safari/);
  assert.match(js, /appinstalled/);
  assert.match(html, /id="installAppBtn"/);
});

test('navegação não reintroduz a aba Início e service worker não intercepta API', () => {
  assert.doesNotMatch(html, /data-tab="home"|data-page="home"/);
  for (const tab of ['tables', 'orders', 'deliveries', 'billing']) {
    assert.match(html, new RegExp('data-tab="' + tab + '"'));
    assert.match(html, new RegExp('data-page="' + tab + '"'));
  }
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});

test('service worker trata Web Push e limita o destino ao PWA da mesma origem', () => {
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /self\.registration\.showNotification/);
  assert.match(sw, /target\.origin !== self\.location\.origin/);
  assert.match(sw, /target\.pathname\.startsWith\('\/garcom-pwa\/'\)/);
  assert.match(sw, /clients\.matchAll\(\{ type: 'window', includeUncontrolled: true \}\)/);
  assert.match(sw, /clients\.openWindow\(target\)/);
});
