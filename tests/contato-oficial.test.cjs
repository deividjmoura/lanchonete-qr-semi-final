'use strict';

/**
 * Um só endereço de contato em todo o produto.
 *
 * Histórico: o e-mail de contato estava escrito por extenso em 23 lugares
 * (tela de acesso, landing, apresentação, páginas legais, README e
 * documentos de privacidade). Trocar o endereço exigiu caçar cada cópia, e
 * uma cópia esquecida em página legal é um canal de privacidade que ninguém
 * lê. Este teste é o que impede que uma segunda caixa de entrada volte a
 * aparecer por engano.
 *
 * A fonte da verdade é src/screens/landing/contato.ts. O SPA importa de lá; o
 * que não consegue importar (HTML estático, Markdown) precisa repetir
 * exatamente o mesmo endereço.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

function contatoDoSpa() {
  const fonte = ler('src/screens/landing/contato.ts');
  const email = /export const EMAIL_EXIBIDO = "([^"]+)";/.exec(fonte);
  const whatsapp = /export const WHATSAPP_URL = "([^"]+)";/.exec(fonte);
  assert.ok(email && whatsapp, 'contato.ts precisa declarar EMAIL_EXIBIDO e WHATSAPP_URL como texto literal');
  return { email: email[1], whatsapp: whatsapp[1] };
}

/** Tudo o que é publicado ou orienta quem opera: código, páginas e documentação viva. */
function arquivosPublicados() {
  /* Todo Markdown da raiz, não só o README: um relatório novo (REBRANDING.md,
     CHANGELOG.md…) é lido por quem opera tanto quanto a documentação de docs/. */
  const achados = ['index.html', ...fs.readdirSync(raiz).filter((nome) => nome.endsWith('.md'))];
  const andar = (pasta, extensoes, pular = () => false) => {
    for (const item of fs.readdirSync(path.join(raiz, pasta), { withFileTypes: true })) {
      const rel = `${pasta}/${item.name}`;
      if (pular(rel)) continue;
      if (item.isDirectory()) andar(rel, extensoes, pular);
      else if (extensoes.some((e) => item.name.endsWith(e))) achados.push(rel);
    }
  };
  andar('src', ['.ts', '.tsx', '.css']);
  andar('public', ['.html', '.js', '.css', '.webmanifest'], (rel) => rel === 'public/assets');
  andar('docs', ['.md']);
  return achados;
}

const ENDERECO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/* Endereços que não são contato do produto: exemplo de preenchimento no campo
   de e-mail do login Google (Admin › Logins). */
const EXEMPLOS = new Set(['funcionario@gmail.com']);

test('o endereço de contato do SPA é um e-mail válido e o WhatsApp é um link wa.me', () => {
  const { email, whatsapp } = contatoDoSpa();
  assert.match(email, /^[a-z0-9._-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  assert.match(whatsapp, /^https:\/\/wa\.me\/\d{12,13}$/);
});

test('todo mailto: publicado aponta para o endereço oficial', () => {
  const { email } = contatoDoSpa();
  const destinos = [];
  for (const arquivo of arquivosPublicados()) {
    for (const m of ler(arquivo).matchAll(/mailto:([^"'`)\s?>]+)/g)) {
      destinos.push({ arquivo, destino: m[1] });
    }
  }
  assert.ok(destinos.length >= 6, `esperava encontrar os links de e-mail do produto, achei ${destinos.length}`);
  const fora = destinos.filter((d) => d.destino !== email && d.destino !== '${EMAIL_EXIBIDO}');
  assert.deepEqual(fora, [], 'há link de e-mail apontando para outro endereço');
});

test('nenhum outro endereço de e-mail real aparece em código, páginas ou documentação', () => {
  const { email } = contatoDoSpa();
  const dominio = email.split('@')[1];
  const estranhos = [];
  for (const arquivo of arquivosPublicados()) {
    for (const [endereco] of ler(arquivo).matchAll(ENDERECO)) {
      const limpo = endereco.toLowerCase().replace(/\.$/, '');
      if (!limpo.endsWith(`@${dominio}`)) continue;
      if (limpo === email || EXEMPLOS.has(limpo)) continue;
      estranhos.push(`${arquivo}: ${limpo}`);
    }
  }
  assert.deepEqual(
    estranhos,
    [],
    `só ${email} pode ser publicado como contato. Troque o endereço em src/screens/landing/contato.ts e repita nas páginas estáticas`,
  );
});

test('a tela de acesso importa os canais em vez de repeti-los', () => {
  const login = ler('src/screens/Login.tsx');
  assert.match(login, /import \{ EMAIL_URL, WHATSAPP_URL \} from "\.\/landing\/contato";/);
  assert.match(login, /href=\{WHATSAPP_URL\}/);
  assert.match(login, /href=\{EMAIL_URL\}/);
  assert.doesNotMatch(login, /mailto:|wa\.me\//, 'Login.tsx não escreve os endereços por extenso');
});

test('o e-mail acompanha o WhatsApp em todo ponto de contato', () => {
  const { email, whatsapp } = contatoDoSpa();

  // SPA: quem mostra um canal mostra o outro (rodapé do acesso, seção de
  // contato, rodapé da landing e ações flutuantes).
  for (const arquivo of [
    'src/screens/Login.tsx',
    'src/screens/landing/sections/ContatoSection.tsx',
    'src/screens/landing/sections/Footer.tsx',
    'src/screens/landing/components/FloatingActions.tsx',
  ]) {
    const fonte = ler(arquivo);
    assert.match(fonte, /WHATSAPP_URL|whatsappLink/, `${arquivo}: WhatsApp presente`);
    assert.match(fonte, /EMAIL_URL/, `${arquivo}: e-mail ao lado do WhatsApp`);
  }

  // Páginas estáticas com contato: os dois endereços, por extenso e iguais aos do SPA.
  for (const arquivo of ['public/apresentacao.html', 'public/guia-sistema.html', 'public/termos-de-uso.html']) {
    const html = ler(arquivo);
    assert.ok(html.includes(`href="${whatsapp}"`), `${arquivo}: WhatsApp oficial`);
    assert.ok(html.includes(`href="mailto:${email}"`), `${arquivo}: e-mail oficial`);
  }

  // Páginas legais: o canal de privacidade é o mesmo endereço.
  for (const arquivo of ['public/politica-de-privacidade.html', 'public/termos-de-servico.html']) {
    assert.ok(ler(arquivo).includes(`mailto:${email}`), `${arquivo}: canal oficial`);
  }
});

test('o build publicado carrega o mesmo endereço das fontes', () => {
  const { email } = contatoDoSpa();
  const dominio = email.split('@')[1];
  const dist = path.join(raiz, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return; // sem build, nada a conferir
  const estranhos = [];
  const conferir = (rel) => {
    for (const [endereco] of fs.readFileSync(path.join(dist, rel), 'utf8').matchAll(ENDERECO)) {
      const limpo = endereco.toLowerCase().replace(/\.$/, '');
      if (limpo.endsWith(`@${dominio}`) && limpo !== email && !EXEMPLOS.has(limpo)) estranhos.push(`dist/${rel}: ${limpo}`);
    }
  };
  for (const nome of fs.readdirSync(dist)) if (nome.endsWith('.html')) conferir(nome);
  for (const nome of fs.readdirSync(path.join(dist, 'assets'))) if (nome.endsWith('.js')) conferir(`assets/${nome}`);
  assert.deepEqual(estranhos, [], 'dist/ está desatualizado em relação a public/ e src/: rode `npm run build`');
});
