// Editor completo de cardápio (admin) — inclui fotoUrl
function fotoThumb(url) {
  if (!url) return '';
  return '<img src="' + esc(url) + '" alt="" class="prod-thumb" loading="lazy" onerror="this.style.display=\'none\'">';
}

function renderProduto(p) {
  const statusChip = p.disponivel ? '<span class="chip on">disponível</span>' : '<span class="chip off">indisponível</span>';
  const stockChip = p.controlaEstoque
    ? (p.estoqueBaixo
        ? '<span class="chip off">estoque ' + (p.estoque != null ? p.estoque : 0) + ' ⚠️</span>'
        : '<span class="chip">estoque ' + (p.estoque != null ? p.estoque : 0) + '</span>')
    : '';
    const fotoChip = p.fotoUrl ? '<span class="chip on">foto</span>' : '';
  const setorChip = '<span class="chip">' + (p.setor === 'bar' ? '🍹 bar' : '🍳 cozinha') + '</span>';
  const adds = (p.adicionais || []).map(a => esc(a.nome) + ' (' + br(a.preco) + ')').join(', ') || '—';
  const rems = (p.removiveis || []).join(', ') || '—';
  const addRows = (p.adicionais || []).map(a =>
    '<div class="row" style="margin-bottom:6px"><span>' + esc(a.nome) + ' · ' + br(a.preco) + '</span>' +
    '<button class="btn" type="button" style="padding:4px 10px" onclick="delAdd(' + a.id + ')">Remover</button></div>'
  ).join('') || '<p class="muted">Nenhum.</p>';
  return '<div class="prod-row" id="prod-' + p.id + '">' +
    fotoThumb(p.fotoUrl) +
    '<div style="flex:1;min-width:0">' +
    '<strong>' + esc(p.nome) + '</strong> · <span class="price">' + br(p.preco) + '</span>' +
    '<div class="prod-meta" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">' + statusChip + setorChip + stockChip + fotoChip + '<span class="chip">#' + p.id + '</span></div>' +
    (p.descricao ? '<p class="muted" style="margin:6px 0 0;font-size:.9rem">' + esc(p.descricao) + '</p>' : '') +
    '<p class="muted" style="margin:6px 0 0;font-size:.85rem"><b>Adicionais:</b> ' + adds + '</p>' +
    '<p class="muted" style="margin:2px 0 0;font-size:.85rem"><b>Removíveis:</b> ' + rems + '</p>' +
    '<div class="edit-panel" id="edit-' + p.id + '" style="display:none">' +
        '<div class="grid2"><div><label>Nome</label><input id="e-nome-' + p.id + '" value="' + esc(p.nome) + '"></div>' +
    '<div><label>Preço</label><input id="e-preco-' + p.id + '" type="number" step="0.01" min="0" value="' + p.preco + '"></div></div>' +
    '<div style="margin-top:10px"><label>Setor</label><select id="e-setor-' + p.id + '">' +
    '<option value="cozinha"' + (p.setor === 'bar' ? '' : ' selected') + '>🍳 Cozinha</option>' +
    '<option value="bar"' + (p.setor === 'bar' ? ' selected' : '') + '>🍹 Bar</option>' +
    '</select></div>' +
    '<div style="margin-top:10px"><label>Setor</label><select id="e-setor-' + p.id + '">' +
    '<option value="cozinha"' + (p.setor === 'bar' ? '' : ' selected') + '>🍳 Cozinha</option>' +
    '<option value="bar"' + (p.setor === 'bar' ? ' selected' : '') + '>🍹 Bar</option>' +
    '</select></div>' +
    '<div style="margin-top:10px"><label>Descrição</label><textarea id="e-desc-' + p.id + '">' + esc(p.descricao || '') + '</textarea></div>' +
    '<div style="margin-top:10px"><label>Foto</label>' +
    '<input id="e-foto-' + p.id + '" type="text" inputmode="url" autocomplete="off" placeholder="https://… ou /uploads/….webp" value="' + esc(p.fotoUrl || '') + '">' +
    '<div class="form-inline" style="margin-top:8px;align-items:center">' +
    '<input id="e-foto-file-' + p.id + '" type="file" accept="image/*" hidden onchange="onFotoFileEdit(' + p.id + ')">' +
    '<button class="btn primary" type="button" onclick="document.getElementById(\'e-foto-file-' + p.id + '\').click()">📷 Upload</button>' +
    '<button class="btn" type="button" onclick="otimizarFotoEdit(' + p.id + ')">Otimizar link</button>' +
    '<span class="muted" id="e-foto-name-' + p.id + '" style="font-size:.8rem"></span></div>' +
    '<p class="muted" style="margin:4px 0 0;font-size:.8rem">Upload ou link → WebP leve (~480px) em /uploads.</p></div>' +
    (p.fotoUrl ? '<div style="margin-top:8px"><img src="' + esc(p.fotoUrl) + '" alt="" class="prod-thumb-lg" loading="lazy" onerror="this.style.display=\'none\'"></div>' : '') +
    '<div class="form-inline" style="margin-top:10px">' +
    '<label><input type="checkbox" id="e-disp-' + p.id + '"' + (p.disponivel ? ' checked' : '') + '> Disponível</label>' +
    '<label><input type="checkbox" id="e-stock-' + p.id + '"' + (p.controlaEstoque ? ' checked' : '') + '> Controlar estoque</label></div>' +
    '<div class="form-inline" style="margin-top:8px">' +
    '<label>Estoque atual<input type="number" id="e-est-' + p.id + '" min="0" step="1" value="' + (p.estoque != null ? p.estoque : '') + '" placeholder="—" style="width:90px"></label>' +
    '<label>Mínimo<input type="number" id="e-estmin-' + p.id + '" min="0" step="1" value="' + (p.estoqueMinimo || 0) + '" style="width:80px"></label></div>' +
    '<div class="actions"><button class="btn primary" type="button" onclick="salvarProd(' + p.id + ')">Salvar</button>' +
    '<button class="btn" type="button" style="border-color:var(--danger);color:var(--danger)" onclick="esgotarProd(' + p.id + ')">Esgotar</button>' +
    '<button class="btn" type="button" onclick="toggleEdit(' + p.id + ')">Cancelar</button></div><hr>' +
    '<h3 style="font-size:1rem;margin-bottom:8px">Adicionais / opções</h3>' +
    '<p class="muted" style="font-size:.8rem;margin:0 0 8px">Em <b>Bebidas / Drinks / Sucos</b>: cadastre sabores ou tamanhos aqui (ex.: Coca-Cola, Maracujá). Sem removíveis → o cliente vê <b>Escolher</b> (uma opção). Em lanches: extras multi (Bacon +2,50). Observação do cliente substitui ponto da carne.</p>' +
    '<div id="adds-' + p.id + '">' + addRows + '</div>' +
    '<div class="form-inline"><input id="add-nome-' + p.id + '" placeholder="Ex.: Coca-Cola ou Bacon extra">' +
    '<input id="add-preco-' + p.id + '" type="number" step="0.01" min="0" placeholder="Preço" style="width:90px">' +
    '<button class="btn primary" type="button" onclick="addAdd(' + p.id + ')">+ Opção</button></div><hr>' +
    '<h3 style="font-size:1rem;margin-bottom:8px">Ingredientes removíveis</h3>' +
    '<input id="rems-' + p.id + '" value="' + esc((p.removiveis || []).join(', ')) + '" placeholder="queijo, alface, tomate">' +
    '<div class="actions"><button class="btn primary" type="button" onclick="salvarRems(' + p.id + ')">Salvar removíveis</button></div>' +
    '</div></div><div>' +
    '<button class="btn" type="button" onclick="toggleEdit(' + p.id + ')">Editar</button>' +
    '<button class="btn ' + (p.disponivel ? '' : 'primary') + '" type="button" style="margin-top:8px;width:100%"' +
    ' onclick="toggleDisp(' + p.id + ', ' + (!p.disponivel) + ')">' + (p.disponivel ? 'Pausar' : 'Ativar') + '</button>' +
    '<button class="btn" type="button" style="margin-top:8px;width:100%;border-color:var(--danger);color:var(--danger)"' +
    ' onclick="excluirProd(' + p.id + ')">Excluir</button>' +
    '</div></div>';
}

function toggleEdit(id) {
  const el = document.getElementById('edit-' + id);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function criarCat() {
  const nome = document.getElementById('catNome').value.trim();
  const ordem = Number(document.getElementById('catOrdem').value) || 0;
  if (!nome) return toast('Informe o nome');
  const r = await fetch('/api/admin/categorias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, ordem }),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  document.getElementById('catNome').value = '';
  toast('Categoria criada');
  loadCardapio();
}

async function criarProd() {
  const categoriaId = Number(document.getElementById('prodCat').value);
  const nome = document.getElementById('prodNome').value.trim();
  const preco = Number(document.getElementById('prodPreco').value);
  const fotoEl = document.getElementById('prodFoto');
  const finalEl = document.getElementById('prodFotoFinal');
  const fileEl = document.getElementById('prodFotoFile');
  let fotoUrl = (finalEl && finalEl.value.trim()) || (fotoEl ? fotoEl.value.trim() : '') || '';
  // Se tem arquivo ou link externo ainda não otimizado, processa antes de criar
  const file = fileEl && fileEl.files && fileEl.files[0];
  const precisaOtimizar =
    file ||
    (fotoUrl && !fotoUrl.startsWith('/uploads/') && /^https?:\/\//i.test(fotoUrl));
  if (!nome || Number.isNaN(preco)) return toast('Nome e preço obrigatórios');
  try {
    if (precisaOtimizar) {
      toast('Otimizando foto…');
      const out = await uploadFotoOtimizada({
        file: file || null,
        url: file ? null : fotoUrl,
      });
      fotoUrl = out.fotoUrl;
      if (finalEl) finalEl.value = fotoUrl;
      if (fotoEl) fotoEl.value = fotoUrl;
    }
  } catch (e) {
    return toast(e.message || 'Erro na foto');
  }
  const setor = document.getElementById('prodSetor').value;
  const r = await fetch('/api/admin/produtos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoriaId, nome, preco, setor, pedePontoCarne: false, fotoUrl: fotoUrl || null }),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  document.getElementById('prodNome').value = '';
  document.getElementById('prodPreco').value = '';
  if (fotoEl) fotoEl.value = '';
  if (finalEl) finalEl.value = '';
  if (fileEl) fileEl.value = '';
  const prev = document.getElementById('prodFotoPreview');
  if (prev) prev.innerHTML = '';
  toast('Produto criado');
  loadCardapio();
}

async function salvarProd(id) {
  const estRaw = document.getElementById('e-est-' + id).value;
  let fotoRaw = (document.getElementById('e-foto-' + id).value || '').trim();
  const fileEl = document.getElementById('e-foto-file-' + id);
  const file = fileEl && fileEl.files && fileEl.files[0];
  try {
    if (file) {
      toast('Otimizando foto…');
      const out = await uploadFotoOtimizada({ file });
      fotoRaw = out.fotoUrl;
      document.getElementById('e-foto-' + id).value = fotoRaw;
    } else if (fotoRaw && !fotoRaw.startsWith('/uploads/') && /^https?:\/\//i.test(fotoRaw)) {
      toast('Otimizando foto do link…');
      const out = await uploadFotoOtimizada({ url: fotoRaw });
      fotoRaw = out.fotoUrl;
      document.getElementById('e-foto-' + id).value = fotoRaw;
    }
  } catch (e) {
    return toast(e.message || 'Erro na foto');
  }
  const body = {
    nome: document.getElementById('e-nome-' + id).value.trim(),
    preco: Number(document.getElementById('e-preco-' + id).value),
    descricao: document.getElementById('e-desc-' + id).value.trim(),
    disponivel: document.getElementById('e-disp-' + id).checked,
    pedePontoCarne: false,
    setor: document.getElementById('e-setor-' + id).value,
    controlaEstoque: document.getElementById('e-stock-' + id).checked,
    estoque: estRaw === '' ? null : Number(estRaw),
    estoqueMinimo: Number(document.getElementById('e-estmin-' + id).value) || 0,
  };
  // Só atualiza foto se houver valor (evita apagar /uploads ao salvar outros campos)
  if (fotoRaw) body.fotoUrl = fotoRaw;
  const r = await fetch('/api/admin/produtos/' + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  toast('Produto atualizado');
  loadCardapio();
}

async function esgotarProd(id) {
  if (!confirm('Marcar produto como esgotado (estoque 0 e indisponível)?')) return;
  const r = await fetch('/api/admin/produtos/' + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlaEstoque: true, estoque: 0, disponivel: false }),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  toast('Produto esgotado');
  loadCardapio();
}

async function toggleDisp(id, disponivel) {
  const r = await fetch('/api/admin/produtos/' + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disponivel }),
  });
  if (!r.ok) { const data = await r.json(); return toast(data.error || 'Erro'); }
  toast(disponivel ? 'Produto ativado' : 'Produto pausado');
  loadCardapio();
}

async function addAdd(produtoId) {
  const nome = document.getElementById('add-nome-' + produtoId).value.trim();
  const preco = Number(document.getElementById('add-preco-' + produtoId).value);
  if (!nome || Number.isNaN(preco)) return toast('Nome e preço do adicional');
  const r = await fetch('/api/admin/produtos/' + produtoId + '/adicionais', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, preco }),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  toast('Adicional criado');
  loadCardapio();
}

async function delAdd(id) {
  if (!confirm('Remover este adicional?')) return;
  const r = await fetch('/api/admin/adicionais/' + id, { method: 'DELETE' });
  if (!r.ok) { const data = await r.json(); return toast(data.error || 'Erro'); }
  toast('Adicional removido');
  loadCardapio();
}

async function salvarRems(produtoId) {
  const raw = document.getElementById('rems-' + produtoId).value;
  const ingredientes = raw.split(',').map(s => s.trim()).filter(Boolean);
  const r = await fetch('/api/admin/produtos/' + produtoId + '/removiveis', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredientes }),
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erro');
  toast('Removíveis atualizados');
  loadCardapio();
}

async function excluirProd(id) {
  if (!confirm('Excluir este produto permanentemente? Só funciona se ele nunca tiver sido pedido. Prefira Pausar se já vendeu.')) return;
  const r = await fetch('/api/admin/produtos/' + id, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return toast(data.error || 'Erro ao excluir');
  toast('Produto excluído');
  loadCardapio();
}

/** Lê arquivo local → data URL base64 (para enviar ao servidor). */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Selecione uma imagem'));
    }
    if (file.size > 6 * 1024 * 1024) {
      return reject(new Error('Imagem maior que 6 MB'));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

/** POST /api/admin/upload-foto → { fotoUrl, bytes } */
async function uploadFotoOtimizada({ file, url }) {
  const body = {};
  if (file) {
    body.data = await fileToDataUrl(file);
  } else if (url) {
    body.url = String(url).trim();
  } else {
    throw new Error('Informe um arquivo ou um link');
  }
  const r = await fetch('/api/admin/upload-foto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro ao otimizar foto');
  return data;
}

function mostrarPreviewFoto(url, bytes) {
  const preview = document.getElementById('prodFotoPreview');
  if (!preview) return;
  const kb = bytes != null ? ' · ' + Math.round(bytes / 1024) + ' KB' : '';
  preview.innerHTML =
    '<img src="' + esc(url) + '" alt="" class="prod-thumb-lg" loading="lazy">' +
    '<p class="muted" style="margin:6px 0 0;font-size:.8rem">Salva: ' + esc(url) + kb + '</p>';
}

async function otimizarFotoNovo() {
  const fileEl = document.getElementById('prodFotoFile');
  const urlEl = document.getElementById('prodFoto');
  const finalEl = document.getElementById('prodFotoFinal');
  const file = fileEl && fileEl.files && fileEl.files[0];
  const url = urlEl ? urlEl.value.trim() : '';
  if (!file && !url) return toast('Escolha um arquivo ou cole um link');
  try {
    toast('Otimizando foto…');
    const out = await uploadFotoOtimizada({ file: file || null, url: file ? null : url });
    if (finalEl) finalEl.value = out.fotoUrl;
    if (urlEl) urlEl.value = out.fotoUrl;
    mostrarPreviewFoto(out.fotoUrl, out.bytes);
    toast('Foto otimizada (' + Math.round((out.bytes || 0) / 1024) + ' KB)');
  } catch (e) {
    toast(e.message || 'Erro na foto');
  }
}

/** Ao escolher arquivo no formulário de novo produto, otimiza na hora. */
async function onFotoFileNovo() {
  const fileEl = document.getElementById('prodFotoFile');
  const nameEl = document.getElementById('prodFotoFileName');
  const file = fileEl && fileEl.files && fileEl.files[0];
  if (nameEl) nameEl.textContent = file ? file.name : '';
  if (!file) return;
  await otimizarFotoNovo();
}

async function otimizarFotoEdit(id) {
  const fileEl = document.getElementById('e-foto-file-' + id);
  const urlEl = document.getElementById('e-foto-' + id);
  const file = fileEl && fileEl.files && fileEl.files[0];
  const url = urlEl ? urlEl.value.trim() : '';
  if (!file && !url) return toast('Escolha um arquivo ou informe um link');
  if (!file && url.startsWith('/uploads/') && /\.webp$/i.test(url)) {
    return toast('Foto já otimizada localmente');
  }
  try {
    toast('Otimizando foto…');
    const out = await uploadFotoOtimizada({ file: file || null, url: file ? null : url });
    if (urlEl) urlEl.value = out.fotoUrl;
    toast('Foto otimizada · clique em Salvar (' + Math.round((out.bytes || 0) / 1024) + ' KB)');
  } catch (e) {
    toast(e.message || 'Erro na foto');
  }
}

async function onFotoFileEdit(id) {
  const fileEl = document.getElementById('e-foto-file-' + id);
  const nameEl = document.getElementById('e-foto-name-' + id);
  const file = fileEl && fileEl.files && fileEl.files[0];
  if (nameEl) nameEl.textContent = file ? file.name : '';
  if (!file) return;
  await otimizarFotoEdit(id);
}

