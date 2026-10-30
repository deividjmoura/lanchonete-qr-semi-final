const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('rotas de cozinha e bar consultam fila especifica por setor',()=>{
 const pedidos=read('db/pedidos.js');assert.match(pedidos,/getFilaCozinha\(\)/);assert.match(pedidos,/getFilaBar\(\)/);
 assert.match(pedidos,/ip\.setor=\$2/);
 assert.match(pedidos,/ip\.status IN \('recebido','em_producao'\)/);
});
test('migração corrige Heineken e categoria de bebidas sem tocar em porcoes',()=>{
 const sql=read('db/migrations/0021_corrigir_setores_bebidas_marcas.sql');
 assert.match(sql,/heineken/i);assert.match(sql,/c\.nome/);assert.match(sql,/SET setor='bar'/);
 assert.doesNotMatch(sql,/\|original\|/);
});
test('cadastro identifica bebidas por marca quando setor nao especificado',()=>{
 const admin=read('db/admin.js');assert.match(admin,/nomeBebida/);assert.match(admin,/heineken/);assert.match(admin,/if \(!setor\)/);
});
test('servidor redireciona HTTP publico do proxy para HTTPS',()=>{
 const server=read('server.js');assert.match(server,/x-forwarded-proto/);assert.match(server,/writeHead\(308/);
 assert.match(server,/https:\/\//);assert.match(server,/NODE_ENV === 'production'/);
 cp.execFileSync(process.execPath,['--check',path.join(root,'server.js')]);
 cp.execFileSync(process.execPath,['--check',path.join(root,'db/admin.js')]);
});
