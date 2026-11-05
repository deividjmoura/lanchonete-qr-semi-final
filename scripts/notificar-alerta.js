#!/usr/bin/env node
'use strict';

/**
 * Issue #43 — notificação de alerta operacional.
 *
 * Chamado pelo workflow de health check quando ele falha. Existe porque o
 * workflow atual apenas marca o job como vermelho: ninguém é avisado, e um
 * health check que ninguém vê não é alerta.
 *
 * Canais suportados (basta configurar UM segredo):
 *   - Telegram:  ALERTA_TELEGRAM_TOKEN + ALERTA_TELEGRAM_CHAT_ID
 *   - Webhook genérico (Slack/Discord/Teams): ALERTA_WEBHOOK_URL
 *
 * Princípios de segurança:
 *   - nunca imprime o token nem a URL do webhook;
 *   - redige qualquer credencial que apareça no texto da mensagem;
 *   - falha de entrega NÃO derruba o job com exit != 0, para não mascarar a
 *     falha original que gerou o alerta (a falha real já está no log);
 *   - sem segredo configurado, apenas avisa no log e sai em 0.
 */

const TIMEOUT_MS = 10_000;

function primeiroValor(...nomes) {
  for (const nome of nomes) {
    const v = process.env[nome];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Remove padrões de credencial de um texto antes de enviá-lo/registrá-lo. */
function redigir(texto) {
  return String(texto || '')
    .replace(/bot\d+:[\w-]{20,}/g, 'bot<TOKEN>')
    .replace(/(https?:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com)\/\S+)/gi, '<WEBHOOK>')
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1<CREDENCIAIS>@')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<SEGREDO>');
}

function montarMensagem({ url, motivo, execucao }) {
  const linhas = [
    '🔴 Health check de produção FALHOU',
    '',
    `Serviço: ${redigir(url)}`,
    `Motivo: ${redigir(motivo || 'motivo não informado')}`,
  ];
  if (execucao) linhas.push(`Execução: ${redigir(execucao)}`);
  linhas.push('', 'Ação: verificar o serviço. Este alerta é somente leitura.');
  return linhas.join('\n');
}

async function comTimeout(promessa) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await promessa(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function enviarTelegram({ token, chatId, texto }) {
  return comTimeout(async (signal) => {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
      signal,
    });
    if (!resp.ok) throw new Error(`Telegram respondeu HTTP ${resp.status}`);
    return 'telegram';
  });
}

async function enviarWebhook({ url, texto }) {
  return comTimeout(async (signal) => {
    // O campo "text" é entendido por Slack, Discord e Teams.
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: texto }),
      signal,
    });
    if (!resp.ok) throw new Error(`Webhook respondeu HTTP ${resp.status}`);
    return 'webhook';
  });
}

async function notificar({ url, motivo, execucao } = {}) {
  const texto = montarMensagem({ url, motivo, execucao });

  const telegramToken = primeiroValor('ALERTA_TELEGRAM_TOKEN');
  const telegramChat = primeiroValor('ALERTA_TELEGRAM_CHAT_ID');
  const webhookUrl = primeiroValor('ALERTA_WEBHOOK_URL');

  try {
    if (telegramToken && telegramChat) {
      return { canal: await enviarTelegram({ token: telegramToken, chatId: telegramChat, texto }), texto };
    }
    if (webhookUrl) {
      return { canal: await enviarWebhook({ url: webhookUrl, texto }), texto };
    }
    return { canal: null, texto };
  } catch (e) {
    // Contrato do módulo: falha de entrega nunca lança. Se lançasse, o step de
    // notificação falharia e mascararia a falha original do health check.
    return { canal: null, texto, erro: redigir(e && e.message ? e.message : String(e)) };
  }
}

async function main() {
  const url = primeiroValor('HEALTHCHECK_URL');
  const motivo = primeiroValor('ALERTA_MOTIVO') || 'health check retornou falha';
  const execucao = primeiroValor('GITHUB_SERVER_URL', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID')
    ? `${primeiroValor('GITHUB_SERVER_URL')}/${primeiroValor('GITHUB_REPOSITORY')}/actions/runs/${primeiroValor('GITHUB_RUN_ID')}`
    : '';

  try {
    const { canal, texto, erro } = await notificar({ url, motivo, execucao });
    if (canal) {
      console.log(`[alerta] Notificação entregue via ${canal}.`);
      return;
    }
    // Dois casos distintos: canal configurado mas entrega falhou, ou nenhum
    // canal configurado. Distinguir importa: o primeiro é um alerta perdido.
    if (erro) {
      console.warn('[alerta] Canal CONFIGURADO, mas a entrega falhou:', erro);
      console.warn('[alerta] O alerta NÃO chegou ao responsável. Corrija o segredo/configuração.');
    } else {
      console.warn('[alerta] Nenhum canal configurado.');
      console.warn('[alerta] Defina ALERTA_WEBHOOK_URL ou ALERTA_TELEGRAM_TOKEN + ALERTA_TELEGRAM_CHAT_ID.');
    }
    console.warn('[alerta] Mensagem que seria enviada:');
    console.warn(texto);
  } catch (e) {
    // Não propaga: a falha original é o que importa e já está no log do job.
    console.error('[alerta] Falha ao entregar a notificação:', redigir(e && e.message ? e.message : e));
    console.error('[alerta] A falha do health check permanece registrada acima.');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[alerta] erro inesperado:', redigir(e && e.message ? e.message : e));
  });
}

module.exports = { montarMensagem, redigir, notificar };
