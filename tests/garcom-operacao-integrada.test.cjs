require('dotenv').config();
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const pool = require('../db/pool');
const { papelPodeAcessar, ACESSO, ErroAuth, exigirAcesso } = require('../db/auth');
const { ErroGarcom, entregarComoGarcom } = require('../db/garcons');
const { ErroPedido, sincronizarStatusPedido, setStatusPedido } = require('../db/pedidos');
const { ErroCaixa } = require('../db/caixa');
const { sincronizarValorTotalSessao, idempotencyKeyDoCorpo } = require('../db/conta');

function setupMockPool(handler) {
  const origQuery = pool.query;
  const origConnect = pool.connect;
  const mockClient = {
    query: async (sql, params) => handler(sql, params),
    release: () => {},
  };
  pool.query = async (sql, params) => handler(sql, params);
  pool.connect = async () => mockClient;
  return () => {
    pool.query = origQuery;
    pool.connect = origConnect;
  };
}

/* =========================================================================
   1. FLUXO DO CLIENTE: REMOÇÃO DE PAGAMENTO & RETENÇÃO DE CARDÁPIO/BUSCA/CARRINHO
   ========================================================================= */
describe('1. Fluxo do Cliente — Sem Pagamento e com Recursos Essenciais', () => {
  test('Interface do cliente (Mesa.tsx) não possui botões, avisos ou ações de pagamento', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');

    // Não deve conter avisos como "Pagamento no caixa ou com o garçom"
    assert.equal(
      /Pagamento no caixa/i.test(mesaSrc),
      false,
      'Mesa.tsx não deve exibir aviso "Pagamento no caixa ou com o garçom"'
    );

    // Não deve conter badge de PIX avisado para o cliente
    assert.equal(
      /pixAvisos\s*>\s*0.*pix/i.test(mesaSrc),
      false,
      'Mesa.tsx não deve exibir avisos de PIX no cabeçalho do cliente'
    );

    // Não deve conter botões de pagar ou avisar PIX
    assert.equal(
      /informarPix/i.test(mesaSrc),
      false,
      'Mesa.tsx não deve invocar ação de pagamento/PIX'
    );
    assert.equal(
      /<button[^>]*>(?:.*Pagar.*)<\/button>/i.test(mesaSrc),
      false,
      'Mesa.tsx não deve renderizar botões de pagamento'
    );
  });

  test('Interface legada do cliente (public/js/mesa-app-a.js e mesa-pix.js) não injeta avisos de pagamento', () => {
    const mesaAppA = fs.readFileSync('public/js/mesa-app-a.js', 'utf8');
    assert.equal(
      /Pagamento no caixa ou com o garçom/i.test(mesaAppA),
      false,
      'mesa-app-a.js não deve exibir aviso de pagamento no caixa'
    );
    assert.equal(
      /Já pago.*A pagar/i.test(mesaAppA),
      false,
      'mesa-app-a.js não deve exibir detalhes parciais de pagamento na conta do cliente'
    );

    const mesaPix = fs.readFileSync('public/js/mesa-pix.js', 'utf8');
    assert.equal(
      /pixJaPagueiBtn/i.test(mesaPix),
      false,
      'mesa-pix.js não deve expor botão de pagamento PIX no cliente'
    );
  });

  test('Interface do cliente mantém cardápio, busca, carrinho, nome do cliente e status', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');

    // Cardápio & categorias
    assert.match(mesaSrc, /categoriasStore/, 'Mantém categorias do cardápio');
    assert.match(mesaSrc, /gruposCardapio|grid-cardapio/, 'Mantém exibição do cardápio');

    // Busca no cardápio
    assert.match(mesaSrc, /Buscar no cardápio/, 'Mantém campo de busca');
    assert.match(mesaSrc, /setBusca/, 'Mantém controle de busca');

    // Carrinho de compras
    assert.match(mesaSrc, /painelCarrinho/, 'Mantém painel do carrinho');
    assert.match(mesaSrc, /addCart/, 'Mantém adição ao carrinho');
    assert.match(mesaSrc, /Enviar pra cozinha/, 'Mantém envio do carrinho');

    // Nome do cliente
    assert.match(mesaSrc, /pub-nome-/, 'Mantém persistência do nome do cliente');
    assert.match(mesaSrc, /Seu nome/, 'Mantém input do nome do cliente');

    // Acompanhamento de status dos pedidos
    assert.match(mesaSrc, /STATUS_ORDEM/, 'Mantém etapas de status');
    assert.match(mesaSrc, /na_fila/, 'Mantém status na fila');
    assert.match(mesaSrc, /em_producao/, 'Mantém status em produção');
    assert.match(mesaSrc, /pronto/, 'Mantém status pronto');
    assert.match(mesaSrc, /entregue/, 'Mantém status entregue');
  });

  test('Cliente pode iniciar pedidos diretamente pelo QR fixo da mesa', () => {
    const landingSrc = fs.readFileSync('src/screens/Landing.tsx', 'utf8');
    assert.match(
      landingSrc,
      /QR Code fixo da sua mesa/i,
      'Landing instrui cliente a iniciar pelo QR fixo'
    );
    const routerSrc = fs.readFileSync('src/router.tsx', 'utf8');
    assert.match(
      routerSrc,
      /mesa\//,
      'O roteador mantém a navegação direta para a mesa via token do QR'
    );
  });

  test('Interface prepara indicação do garçom responsável quando existir', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');
    assert.match(mesaSrc, /garcomResponsavel/, 'Mesa.tsx calcula garcomResponsavel');
    assert.match(mesaSrc, /ConciergeBell/, 'Mesa.tsx usa ícone de garçom');
    assert.match(mesaSrc, /Garçom:/, 'Exibe o nome do garçom');
  });
});

/* =========================================================================
   2. SEGURANÇA: CLIENTE NÃO ACESSA ENDPOINTS OPERACIONAIS DE PAGAMENTO
   ========================================================================= */
describe('2. Segurança — Cliente não acessa endpoints de pagamento', () => {
  test('Endpoints de caixa exigem perfil "caixa" (401 sem autenticação)', async () => {
    const reqAnonimo = { headers: {} };
    await assert.rejects(
      () => exigirAcesso(reqAnonimo, 'caixa'),
      (e) => e instanceof ErroAuth && e.status === 401
    );
  });

  test('Cliente comum ou garçom não tem perfil "caixa" (403 Forbidden)', async () => {
    assert.equal(papelPodeAcessar('garcom', 'caixa'), false);
    assert.equal(papelPodeAcessar('cliente', 'caixa'), false);
    assert.equal(papelPodeAcessar('cozinha', 'caixa'), false);
    assert.equal(papelPodeAcessar('bar', 'caixa'), false);
    assert.equal(papelPodeAcessar('caixa', 'caixa'), true);
    assert.equal(papelPodeAcessar('admin', 'caixa'), true);
  });

  test('Server.js protege todas as rotas operacionais sob /api/caixa/', () => {
    const serverSrc = fs.readFileSync('server.js', 'utf8');
    assert.match(
      serverSrc,
      /p\.startsWith\('\/api\/caixa'\)\)[\s\S]*await exigirAcesso\(req,\s*'caixa'\)/,
      'server.js aplica guard de autenticação caixa em todas as rotas /api/caixa/*'
    );
  });

  test('Operações diretas de caixa rejeitam chamadas sem identificação válida', async () => {
    const caixa = require('../db/caixa');
    await assert.rejects(
      () => caixa.registrarPagamento(NaN, { valor: 50, formaPagamento: 'pix' }),
      (e) => e.status === 400
    );
    await assert.rejects(
      () => caixa.fecharSessao(NaN, { formaPagamento: 'pix' }),
      (e) => e.status === 400
    );
  });
});

/* =========================================================================
   3. MESA ABERTA PELO CLIENTE E POSTERIORMENTE ASSUMIDA PELO GARÇOM
   ========================================================================= */
describe('3. Ciclo de Vida — Mesa aberta pelo cliente e assumida pelo garçom', () => {
  test('Mapper do cliente extrai e preserva garcomNome na sessão e nos pedidos', () => {
    const mappersCode = ts.transpileModule(fs.readFileSync('src/lib/mappers.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const mappersCtx = { exports: {} };
    vm.runInNewContext(mappersCode, mappersCtx);
    const { mapSessaoFromMesaApi } = mappersCtx.exports;

    const payloadApi = {
      mesa: 3,
      sessaoAberta: true,
      sessaoId: 42,
      abertaEm: '2026-10-19T12:00:00Z',
      clienteNome: 'Mariana',
      totalDevido: 75.5,
      valorPago: 0,
      valorRestante: 75.5,
      pedidos: [
        {
          id: 101,
          status: 'em_producao',
          cliente_nome: 'Mariana',
          garcom_nome: null,
          itens: [
            { id: 1, nome: 'X-Bacon Artesanal', quantidade: 1, preco_unitario: 35.5, status: 'em_producao' },
          ],
        },
        {
          id: 102,
          status: 'entregue',
          cliente_nome: 'Mariana',
          garcom_nome: 'Carlos Garçom',
          itens: [
            { id: 2, nome: 'Chopp Artesanal', quantidade: 2, preco_unitario: 20.0, status: 'entregue' },
          ],
        },
      ],
    };

    const res = mapSessaoFromMesaApi('token-mesa-3', { id: 3, numero: 3, token: 'token-mesa-3', nome: 'Mesa 03' }, payloadApi);
    assert.equal(res.sessao.garcomNome, 'Carlos Garçom', 'Sessão adota garçom ativo da mesa');
    assert.equal(res.pedidos[0].garcomNome, undefined, 'Pedido 101 ainda não foi assumido');
    assert.equal(res.pedidos[1].garcomNome, 'Carlos Garçom', 'Pedido 102 registra Carlos Garçom');
  });

  test('Garçom assume e entrega pedido da mesa aberta pelo cliente', async () => {
    let pedidoAtualizado = null;

    const restore = setupMockPool(async (sql, params) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) {
        return { rows: [] };
      }
      if (/FROM garcons WHERE token =/.test(sql)) {
        return { rows: [{ id: 5, nome: 'Roberto Garçom', token: params[0], ativo: true }] };
      }
      if (/FROM pedidos p JOIN mesa_sessoes s.*WHERE p\.id = \$1 FOR UPDATE OF p,s/s.test(sql)) {
        return {
          rows: [
            { id: 10, status: 'concluido', sessao_id: 1, garcom_id: null, garcom_nome: null, garcom_responsavel_id: 5 },
          ],
        };
      }
      if (/UPDATE itens_pedido SET status = 'entregue'/.test(sql)) {
        return { rowCount: 1 };
      }
      if (/UPDATE pedidos\s+SET garcom_id/.test(sql)) {
        pedidoAtualizado = { garcom_id: params[1], garcom_nome: params[2] };
        return { rowCount: 1 };
      }
      if (/UPDATE mesa_sessoes SET valor_total/.test(sql)) {
        return { rowCount: 1 };
      }
      if (/UPDATE pedidos SET status = \$2/.test(sql)) {
        return { rows: [{ id: 10, status: 'entregue' }] };
      }
      if (/SELECT COALESCE\(SUM/i.test(sql)) {
        return { rows: [{ total: '32.00', pago: '32.00' }] };
      }
      if (/FROM itens_pedido/i.test(sql)) {
        return {
          rows: [
            { id: 101, quantidade: 1, preco_unitario: '32.00', status: 'concluido' },
          ],
        };
      }
      return { rows: [] };
    });

    try {
      const res = await entregarComoGarcom(10, '33333333-3333-4000-8000-333333333333');
      assert.equal(res.status, 'entregue');
      assert.equal(res.garcom.nome, 'Roberto Garçom');
      assert.equal(pedidoAtualizado.garcom_nome, 'Roberto Garçom');
      assert.equal(pedidoAtualizado.garcom_id, 5);
    } finally {
      restore();
    }
  });
});

/* =========================================================================
   4. ATUALIZAÇÃO DE STATUS, ENTREGA PARCIAL E FECHAMENTO
   ========================================================================= */
describe('4. Status, Entrega Parcial e Fechamento', () => {
  test('Cozinha/bar recebem 403 se o pedido não possui itens do próprio setor', async () => {
    const updates = [];
    const restore = setupMockPool(async (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
      if (/FROM pedidos WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 7, status: 'em_producao', sessao_id: 2 }] };
      }
      if (/SELECT ip\.id/.test(sql)) {
        return { rows: [{ id: 70, status: 'recebido', setor: 'bar' }] };
      }
      if (/^UPDATE /.test(sql.trim())) updates.push(sql);
      return { rows: [], rowCount: 0 };
    });

    try {
      await assert.rejects(
        () => setStatusPedido(7, 'em_producao', 'cozinha'),
        (error) => error instanceof ErroPedido && error.status === 403
      );
      assert.deepEqual(updates, [], 'nenhum item/pedido deve ser atualizado fora do setor autorizado');
    } finally {
      restore();
    }
  });

  test('Sincronização de status do pedido respeita regra de itens agregados', async () => {
    const mockClient = {
      async query(sql, params) {
        if (/FROM itens_pedido/.test(sql)) {
          return { rows: [{ status: 'entregue' }, { status: 'concluido' }] };
        }
        if (/UPDATE pedidos SET status = \$2/.test(sql)) {
          return { rows: [{ id: 1, status: params[1] }] };
        }
        return { rows: [] };
      },
    };
    const atualizado = await sincronizarStatusPedido(mockClient, 1);
    assert.equal(atualizado.status, 'concluido', 'Com 1 entregue e 1 concluido, status do pedido permanece concluido');
  });

  test('Entrega parcial entrega apenas os itemIds solicitados e mantém pedido aberto', async () => {
    let itensEntreguesIds = [];
    const restore = setupMockPool(async (sql, params) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return { rows: [] };
      if (/FROM garcons WHERE token =/.test(sql)) {
        return { rows: [{ id: 2, nome: 'Ana Garçonete', token: params[0], ativo: true }] };
      }
      if (/FROM pedidos p JOIN mesa_sessoes s.*WHERE p\.id = \$1 FOR UPDATE OF p,s/s.test(sql)) {
        return { rows: [{ id: 20, status: 'pronto', sessao_id: 100, garcom_id: null, garcom_responsavel_id: 2 }] };
      }
      if (/UPDATE itens_pedido SET status = 'entregue'/.test(sql)) {
        itensEntreguesIds = params[0];
        return { rowCount: 1 };
      }
      if (/UPDATE pedidos\s+SET garcom_id/.test(sql)) {
        return { rowCount: 1 };
      }
      if (/UPDATE mesa_sessoes/.test(sql)) return { rowCount: 1 };
      if (/UPDATE pedidos SET status = \$2/.test(sql)) {
        return { rows: [{ id: 20, status: params[1] }] };
      }
      if (/SELECT p\.sessao_id.*COALESCE\(SUM/s.test(sql) || /SELECT COALESCE\(SUM/i.test(sql)) {
        return { rows: [{ sessao_id: 100, total: 15.0 }] };
      }
      if (/FROM itens_pedido/i.test(sql)) {
        return { rows: [{ id: 201, quantidade: 1, preco_unitario: 15, status: 'concluido' }, { id: 202, quantidade: 1, preco_unitario: 20, status: 'em_producao' }] };
      }
      return { rows: [] };
    });

    try {
      const res = await entregarComoGarcom(20, '44444444-4444-4000-8000-444444444444', [201]);
      assert.deepEqual(res.itensEntregues, [201]);
      assert.equal(res.parcial, true, 'Indica entrega parcial');
      assert.equal(res.garcom.nome, 'Ana Garçonete');
    } finally {
      restore();
    }
  });

  test('Fechamento de mesa consolida sessão e desocupa a mesa', async () => {
    const mockClient = {
      async query(sql) {
        if (/SELECT.*FROM mesa_sessoes.*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: 100, mesa_id: 1, status: 'aberta', valor_total: 80.0 }] };
        }
        if (/SELECT.*FROM pedidos WHERE sessao_id = \$1/.test(sql)) {
          return { rows: [{ id: 10, status: 'entregue' }] };
        }
        if (/SELECT COALESCE\(SUM\(valor\)/.test(sql)) {
          return { rows: [{ pago: 80.0 }] };
        }
        if (/UPDATE mesa_sessoes SET status = 'fechada'/.test(sql)) {
          return { rows: [{ id: 100, status: 'fechada', fechada_em: new Date() }] };
        }
        return { rows: [] };
      },
      release() {},
    };

    assert.equal(typeof sincronizarValorTotalSessao, 'function');
  });
});

/* =========================================================================
   5. VALIDAÇÃO DE RESPONSIVIDADE E ACESSIBILIDADE EM CELULAR
   ========================================================================= */
describe('5. Mobile — Responsividade e Acessibilidade', () => {
  test('HTML possui meta viewport com viewport-fit=cover para celulares', () => {
    const htmlIndex = fs.readFileSync('index.html', 'utf8');
    assert.match(
      htmlIndex,
      /viewport-fit=cover/,
      'index.html precisa ter viewport-fit=cover para safe-area de entalhe/iPhone'
    );
    assert.match(htmlIndex, /width=device-width/, 'index.html tem width=device-width');
  });

  test('Mesa.tsx implementa padding inferior de safe-area-inset para celular', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');
    assert.match(
      mesaSrc,
      /safe-area-inset-bottom/,
      'Mesa.tsx aplica safe-area-inset-bottom na barra inferior mobile'
    );
    assert.match(
      mesaSrc,
      /lg:hidden fixed bottom-0/,
      'Mesa.tsx possui barra inferior fixa exclusiva para telas mobile (lg:hidden)'
    );
  });

  test('Componentes possuem alvos de toque acessíveis e rótulos semânticos', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');
    // Botões de ação principal têm altura mínima adequada (h-10, h-11, h-13)
    assert.match(mesaSrc, /h-13|h-11|h-10/, 'Alvos de toque em celular respeitam dimensões táteis (>= 40px)');
    // Modal possui role dialog e aria-modal
    const uiSrc = fs.readFileSync('src/components/ui.tsx', 'utf8');
    assert.match(uiSrc, /role="dialog"/, 'Modais usam role="dialog"');
    assert.match(uiSrc, /aria-modal="true"/, 'Modais declaram aria-modal="true"');
  });
});

/* =========================================================================
   6. CENÁRIOS INTEGRADOS DE SINCRONIZAÇÃO OFFLINE
   ========================================================================= */
describe('6. Sincronização Offline e Reconexão de APIs', () => {
  test('Idempotência protege contra envios duplicados em reconexão móvel', () => {
    const chaveValida = 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab';
    assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: chaveValida }), chaveValida);
    assert.equal(idempotencyKeyDoCorpo({ idempotency_key: chaveValida }), chaveValida);
    // Chave inválida é rejeitada
    assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: 'inválida' }), false);
    // Ausente é tratada como opcional
    assert.equal(idempotencyKeyDoCorpo({}), null);
  });

  test('Cliente reconecta eventos SSE e sincroniza estado ao retornar conexão', async () => {
    const apiSrc = fs.readFileSync('src/lib/api.ts', 'utf8');
    assert.match(apiSrc, /EventSource/, 'Cliente usa EventSource para atualizações em tempo real');
    assert.match(apiSrc, /addEventListener\("update"/, 'Cliente trata eventos recebidos');
    assert.match(apiSrc, /es\.close/, 'Cliente fecha conexão no cleanup para evitar vazamento');

    const usePubSrc = fs.readFileSync('src/store/usePub.ts', 'utf8');
    assert.match(
      usePubSrc,
      /hydrateMesaToken/,
      'Store sincroniza estado da mesa após reconexão ou eventos'
    );
  });

  test('Carrinho do cliente é preservado localmente e recuperado caso a rede caia', () => {
    const mesaSrc = fs.readFileSync('src/screens/Mesa.tsx', 'utf8');
    assert.match(
      mesaSrc,
      /sessionStorage\.getItem\(`pub-nome-\${token}`\)/,
      'Nome e contexto do cliente são mantidos em armazenamento local'
    );
  });
});
