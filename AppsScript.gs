/**
 * =============================================================
 *  EMAIL COUNTER — Google Apps Script (API + Logger + Ajustes + Metas + Notas)  v9.0
 *  Planilha: "Email counter KPI's"  |  Abas: "Logs", "Ajustes", "Metas", "Notas"
 * =============================================================
 *
 *  COMO ATUALIZAR
 *  1. Planilha > Extensoes > Apps Script
 *  2. Apague TODO o codigo antigo e cole este arquivo inteiro > Salvar
 *  3. Implantar > Gerenciar implantacoes > (lapis) > Versao: Nova versao > Implantar
 *  A senha ja configurada em ADMIN_TOKEN continua valendo — nao precisa refazer.
 *
 *  ENDPOINTS DE LEITURA (abertos)
 *   GET  ?action=getData                 -> {status,total,rows,ajustes,metas,metasHist,notas}
 *   GET  ?action=getData&compact=1       -> payload ~5x menor
 *   GET  ?action=getData&callback=fn     -> JSONP
 *   GET  ?action=ping                    -> teste de saude
 *   GET  ?agente=Vitor&contador=12&loja=Lumvelle   -> grava 1 email (AHK)
 *   POST {action:'setMetas', metas:[{agente,loja,meta},...], desde, base}   (sem senha desde a v9)
 *   POST {action:'delMeta',  agente, loja, desde}                          (sem senha desde a v9)
 *
 *  ENDPOINTS PROTEGIDOS (exigem senha)
 *   POST {action:'listAdjust', token}
 *   POST {action:'addAdjust',  token, tipo, data, agente, deLoja, paraLoja, qtd, motivo}
 *   POST {action:'delAdjust',  token, id}
 *   POST {action:'addNota',    token, data, texto, tipo, agente, loja [, id p/ editar]}
 *   POST {action:'delNota',    token, id}
 *
 *  METAS
 *   Uma linha por (agente, loja, data de vigencia) na aba "Metas". A coluna
 *   "Loja" vazia = meta do agente somando todas as lojas; preenchida = meta
 *   daquela loja. Assim o Thiago pode ter 400/dia no total, sendo 200 Lumvelle
 *   e 200 Elevare. Metas antigas (planilha sem a coluna Loja) continuam valendo
 *   como meta total — a coluna e criada sozinha na primeira leitura.
 *
 *  NOTAS
 *   Aba "Notas": o que aconteceu de especial em cada dia (falta, queda de
 *   sistema, promocao, elogio). Sao lidas junto com getData e entram no report
 *   semanal, para nada se perder no fechamento.
 *
 *  As metas e as notas sao lidas SEM senha, junto com o resto dos dados — quem
 *  tiver a URL da API le tudo. Nao escreva em nota nada que nao possa ser lido
 *  por quem abrir o dashboard.
 *
 *  A partir da v9 as METAS tambem sao gravadas sem senha: quem abrir o dashboard
 *  publicado pode altera-las. Ajustes e notas continuam exigindo a senha.
 */

var SHEET_NAME  = 'Logs';
var ADJ_SHEET   = 'Ajustes';
var META_SHEET  = 'Metas';
var NOTA_SHEET  = 'Notas';
var TZ          = 'America/Sao_Paulo';
var HEADER      = ['Timestamp', 'Agente', 'Email #', 'Data', 'Hora', 'Dia da Semana', 'Loja'];
var ADJ_HEADER  = ['ID', 'Registrado em', 'Tipo', 'Data', 'Agente', 'De loja', 'Para loja', 'Qtd', 'Motivo', 'Ativo'];
var META_HEADER = ['Agente', 'Meta diaria', 'Vigente a partir de', 'Definida em', 'Base', 'Loja'];
var NOTA_HEADER = ['ID', 'Registrado em', 'Data', 'Tipo', 'Agente', 'Loja', 'Nota', 'Ativo'];
var NOTA_TIPOS  = ['nota', 'bom', 'ruim', 'ausencia', 'sistema'];

/* ============================================================
   SENHA
   ============================================================ */

function definirSenha() {

  var senha = 'COLE_A_SENHA_AQUI';   // <<< troque SO esta linha, nao mexa no resto

  if (!senha || senha.length < 6 || senha.indexOf('_AQUI') > -1) {
    throw new Error('Edite a linha "var senha = ..." e coloque a senha real (minimo 6 caracteres).');
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN', senha);
  Logger.log('Senha definida com sucesso. Agora apague a senha do codigo e salve de novo.');
}

/** Confere se a senha ja foi salva, sem mostrar qual e. */
function conferirSenha() {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (k) Logger.log('OK — senha configurada (%s caracteres).', k.length);
  else   Logger.log('ATENCAO — nenhuma senha configurada. Rode definirSenha() ou cadastre ADMIN_TOKEN nas Propriedades do script.');
}

function checkToken_(t) {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!k) throw new Error('Senha nao configurada no Apps Script (rode definirSenha()).');
  return String(t || '') === String(k);
}

/* ============================================================
   ROTEAMENTO
   ============================================================ */

var PROTEGIDAS = ['listAdjust', 'addAdjust', 'delAdjust', 'addNota', 'delNota'];
var LIVRES     = ['setMetas', 'delMeta'];   // gravacao sem senha (v9)

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping')    return respond_({ status: 'ok', pong: true, tz: TZ, now: nowStr_() }, p.callback);
    if (p.action === 'getData') return respond_(getData_(p), p.callback);

    // Fallback por GET (usado se o POST falhar no redirect do Apps Script)
    if (LIVRES.indexOf(p.action) > -1)     return respond_(livre_(p), p.callback);
    if (PROTEGIDAS.indexOf(p.action) > -1) return respond_(protegida_(p), p.callback);

    // O AHK grava via GET simples: ?agente=X&contador=N&loja=Y
    if (p.agente || p.contador) return respond_(logHit_(p), p.callback);
    return respond_({ status: 'ok', usage: '?action=getData' }, p.callback);
  } catch (err) {
    return respond_({ status: 'error', message: String((err && err.message) || err) }, p.callback);
  }
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents) || {}; } catch (ignore) {}
    }
    var d = {};
    for (var a in p)    d[a] = p[a];
    for (var b in body) d[b] = body[b];

    if (d.action === 'getData') return respond_(getData_(d), p.callback);
    if (LIVRES.indexOf(d.action) > -1)     return respond_(livre_(d), p.callback);
    if (PROTEGIDAS.indexOf(d.action) > -1) return respond_(protegida_(d), p.callback);
    return respond_(logHit_(d), p.callback);
  } catch (err2) {
    return respond_({ status: 'error', message: String((err2 && err2.message) || err2) }, p.callback);
  }
}

function protegida_(d) {
  if (!checkToken_(d.token)) return { status: 'error', message: 'Senha invalida.' };
  if (d.action === 'listAdjust') return { status: 'ok', ajustes: listAdjust_() };
  if (d.action === 'addAdjust')  return addAdjust_(d);
  if (d.action === 'delAdjust')  return delAdjust_(d.id);
  if (d.action === 'addNota')    return addNota_(d);
  if (d.action === 'delNota')    return delNota_(d.id);
  return { status: 'error', message: 'Acao desconhecida.' };
}

function livre_(d) {
  if (d.action === 'setMetas') return setMetas_(d);
  if (d.action === 'delMeta')  return delMeta_(d);
  return { status: 'error', message: 'Acao desconhecida.' };
}

/* ============================================================
   GRAVACAO DO CONTADOR (AHK)
   ============================================================ */

function logHit_(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sheet = getSheet_();
    var now   = new Date();
    sheet.appendRow([
      Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss'),
      String(d.agente || 'Sem nome').trim(),
      Number(d.contador || d.email || 0) || 0,
      Utilities.formatDate(now, TZ, 'dd/MM/yyyy'),
      Utilities.formatDate(now, TZ, 'HH:mm'),
      Utilities.formatDate(now, TZ, 'EEEE'),
      String(d.loja || 'Sem loja').trim()
    ]);
    return { status: 'ok', total: Number(d.contador || 0) || 0, at: Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss') };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function getSheet_() {
  return ensureSheet_(SHEET_NAME, HEADER);
}

function ensureSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length)
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('white');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ============================================================
   METAS
   ============================================================ */

/**
 * Aba "Metas" garantindo a coluna "Loja". Planilhas criadas antes da v8 tem
 * so 5 colunas: a sexta e acrescentada aqui, sem tocar nas linhas existentes
 * (que ficam com a loja vazia = meta total do agente).
 */
function getMetaSheet_() {
  var sh = ensureSheet_(META_SHEET, META_HEADER);
  if (sh.getMaxColumns() < META_HEADER.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), META_HEADER.length - sh.getMaxColumns());
  }
  if (String(sh.getRange(1, META_HEADER.length).getDisplayValue()).trim() !== META_HEADER[META_HEADER.length - 1]) {
    sh.getRange(1, META_HEADER.length).setValue(META_HEADER[META_HEADER.length - 1]);
    sh.getRange(1, 1, 1, META_HEADER.length)
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('white');
  }
  return sh;
}

/**
 * Historico completo de metas: uma linha por (agente, loja, data de vigencia).
 * Loja vazia = meta total do agente. Linhas antigas sem data de vigencia valem
 * "desde sempre". Meta 0 e valida: significa "deixou de ter meta a partir dali".
 */
function listMetasHist_() {
  var sh = getMetaSheet_();
  var last = sh.getLastRow();
  var out = [];
  if (last < 2) return out;
  var v = sh.getRange(2, 1, last - 1, META_HEADER.length).getDisplayValues();
  for (var i = 0; i < v.length; i++) {
    var nome = String(v[i][0] || '').trim();
    var cru  = String(v[i][1] === null || v[i][1] === undefined ? '' : v[i][1]).trim();
    if (!nome || cru === '') continue;
    var meta = Number(cru.replace(/[^0-9.-]/g, ''));
    if (isNaN(meta) || meta < 0) continue;
    var dt = parseAny_(v[i][2]);
    out.push({
      agente: nome,
      loja:   String(v[i][5] || '').trim(),      // '' = meta total do agente
      meta:   Math.round(meta),
      desde:  dt ? fmt_(dt, 'yyyy-MM-dd') : '0000-01-01',
      criadaEm: String(v[i][3] || ''),
      base:   String(v[i][4] || '')
    });
  }
  out.sort(function (a, b) {
    if (a.agente !== b.agente) return a.agente < b.agente ? -1 : 1;
    if (a.loja   !== b.loja)   return a.loja   < b.loja   ? -1 : 1;
    return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0;
  });
  return out;
}

/** Meta TOTAL em vigor hoje, por agente — formato antigo, mantido por compatibilidade. */
function listMetas_() {
  var hoje = fmt_(new Date(), 'yyyy-MM-dd');
  var hist = listMetasHist_();
  var out = {};
  for (var i = 0; i < hist.length; i++) {
    if (hist[i].loja) continue;
    if (hist[i].desde <= hoje) out[hist[i].agente] = hist[i].meta;
  }
  return out;
}

/** Aceita o formato novo (lista) e o antigo ({Agente:N} = meta total). */
function normalizaMetas_(metas) {
  if (typeof metas === 'string') {
    try { metas = JSON.parse(metas); } catch (e) { return null; }
  }
  if (!metas || typeof metas !== 'object') return null;

  var out = [];
  if (Object.prototype.toString.call(metas) === '[object Array]') {
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i] || {};
      var nome = String(m.agente || '').trim();
      var val  = Math.round(Number(m.meta));
      if (!nome || isNaN(val) || val < 0) continue;
      out.push({ agente: nome, loja: String(m.loja || '').trim(), meta: val });
    }
  } else {
    var nomes = Object.keys(metas);
    for (var j = 0; j < nomes.length; j++) {
      var val2 = Math.round(Number(metas[nomes[j]]));
      if (isNaN(val2) || val2 < 0) continue;
      out.push({ agente: nomes[j], loja: '', meta: val2 });
    }
  }
  return out;
}

/**
 * Grava metas com data de vigencia. NAO apaga o historico: se ja existir uma
 * linha do mesmo agente/loja na mesma data, ela e atualizada; senao, uma nova entra.
 */
function setMetas_(d) {
  var lista = normalizaMetas_(d.metas);
  if (!lista) return { status: 'error', message: 'Metas em formato invalido.' };
  if (!lista.length) return { status: 'error', message: 'Nenhuma meta recebida.' };

  var dv = parseAny_(d.desde);
  var desde = dv ? fmt_(dv, 'yyyy-MM-dd') : fmt_(new Date(), 'yyyy-MM-dd');

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh   = getMetaSheet_();
    var last = sh.getLastRow();
    var atuais = last > 1 ? sh.getRange(2, 1, last - 1, META_HEADER.length).getDisplayValues() : [];

    var quando = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    var base   = String(d.base || 'manual');
    var novas = 0, atualizadas = 0;

    for (var i = 0; i < lista.length; i++) {
      var nome = lista[i].agente;
      var loja = lista[i].loja;
      var val  = lista[i].meta;      // 0 e valido: encerra a meta a partir desta data

      var achou = -1;
      for (var j = 0; j < atuais.length; j++) {
        var dj = parseAny_(atuais[j][2]);
        var sj = dj ? fmt_(dj, 'yyyy-MM-dd') : '0000-01-01';
        if (String(atuais[j][0]).trim() === nome &&
            String(atuais[j][5] || '').trim() === loja && sj === desde) { achou = j; break; }
      }

      if (achou > -1) {
        sh.getRange(achou + 2, 2).setValue(val);
        sh.getRange(achou + 2, 4).setValue(quando);
        sh.getRange(achou + 2, 5).setValue(base);
        atualizadas++;
      } else {
        sh.appendRow([nome, val, desde, quando, base, loja]);
        atuais.push([nome, String(val), desde, quando, base, loja]);
        novas++;
      }
    }
    return { status: 'ok', novas: novas, atualizadas: atualizadas, desde: desde };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Remove uma entrada do historico (agente + loja + data de vigencia). */
function delMeta_(d) {
  var nome = String(d.agente || '').trim();
  var loja = String(d.loja || '').trim();
  var dv   = parseAny_(d.desde);
  if (!nome || !dv) return { status: 'error', message: 'Informe agente e data de vigencia.' };
  var alvo = fmt_(dv, 'yyyy-MM-dd');

  var sh   = getMetaSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { status: 'error', message: 'Meta nao encontrada.' };
  var v = sh.getRange(2, 1, last - 1, META_HEADER.length).getDisplayValues();
  for (var i = 0; i < v.length; i++) {
    var di = parseAny_(v[i][2]);
    var si = di ? fmt_(di, 'yyyy-MM-dd') : '0000-01-01';
    if (String(v[i][0]).trim() === nome && String(v[i][5] || '').trim() === loja && si === alvo) {
      sh.deleteRow(i + 2);
      return { status: 'ok' };
    }
  }
  return { status: 'error', message: 'Meta nao encontrada.' };
}

/* ============================================================
   NOTAS DO DIA
   ============================================================ */

function getNotaSheet_() {
  var sh = ensureSheet_(NOTA_SHEET, NOTA_HEADER);
  sh.setColumnWidth(7, 420);
  return sh;
}

function listNotas_() {
  var sh = getNotaSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, NOTA_HEADER.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    if (String(v[i][7]).toUpperCase() === 'NAO') continue;
    var dt = parseAny_(v[i][2]);
    out.push({
      id:       String(v[i][0]),
      criadoEm: String(v[i][1]),
      data:     dt ? fmt_(dt, 'yyyy-MM-dd') : String(v[i][2]),
      tipo:     String(v[i][3] || 'nota').toLowerCase(),
      agente:   String(v[i][4] || ''),
      loja:     String(v[i][5] || ''),
      texto:    String(v[i][6] || '')
    });
  }
  out.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });  // recentes primeiro
  return out;
}

/** Cria uma nota. Se vier `id` de uma nota existente, edita aquela linha. */
function addNota_(d) {
  var dt = parseAny_(d.data);
  if (!dt) return { status: 'error', message: 'Data invalida.' };

  var texto = String(d.texto || d.nota || '').trim();
  if (!texto) return { status: 'error', message: 'Escreva a nota.' };
  if (texto.length > 1000) texto = texto.slice(0, 1000);

  var tipo = String(d.tipo || 'nota').toLowerCase();
  if (NOTA_TIPOS.indexOf(tipo) < 0) tipo = 'nota';

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh = getNotaSheet_();
    var quando = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
    var linha = [
      '', quando, fmt_(dt, 'yyyy-MM-dd'), tipo,
      String(d.agente || '').trim(), String(d.loja || '').trim(), texto, 'SIM'
    ];

    var id = String(d.id || '').trim();
    if (id) {
      var last = sh.getLastRow();
      var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) {
          linha[0] = id;
          sh.getRange(i + 2, 1, 1, NOTA_HEADER.length).setValues([linha]);
          return { status: 'ok', id: id, editada: true };
        }
      }
      return { status: 'error', message: 'Nota nao encontrada.' };
    }

    linha[0] = 'N' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
    sh.appendRow(linha);
    return { status: 'ok', id: linha[0] };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function delNota_(id) {
  id = String(id || '');
  if (!id) return { status: 'error', message: 'ID nao informado.' };
  var sh = getNotaSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { status: 'error', message: 'Nota nao encontrada.' };
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      sh.getRange(i + 2, 8).setValue('NAO');
      return { status: 'ok', id: id };
    }
  }
  return { status: 'error', message: 'Nota nao encontrada.' };
}

/* ============================================================
   AJUSTES
   ============================================================ */

function getAdjSheet_() {
  var sh = ensureSheet_(ADJ_SHEET, ADJ_HEADER);
  sh.setColumnWidth(9, 280);
  return sh;
}

function listAdjust_() {
  var sh = getAdjSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, ADJ_HEADER.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    var dt = parseAny_(v[i][3]);
    out.push({
      id:       String(v[i][0]),
      criadoEm: String(v[i][1]),
      tipo:     String(v[i][2]),
      data:     dt ? fmt_(dt, 'yyyy-MM-dd') : String(v[i][3]),
      agente:   String(v[i][4]),
      deLoja:   String(v[i][5]),
      paraLoja: String(v[i][6]),
      qtd:      v[i][7] === '' ? null : Number(v[i][7]),
      motivo:   String(v[i][8]),
      ativo:    String(v[i][9]).toUpperCase() !== 'NAO'
    });
  }
  out.reverse();   // mais recentes primeiro
  return out;
}

function addAdjust_(d) {
  var tipo = String(d.tipo || '').toLowerCase();
  if (tipo !== 'loja' && tipo !== 'total') return { status: 'error', message: 'Tipo invalido.' };

  var dt = parseAny_(d.data);
  if (!dt) return { status: 'error', message: 'Data invalida.' };

  var agente = String(d.agente || '').trim();
  if (!agente) return { status: 'error', message: 'Informe o agente.' };

  var qtd = (d.qtd === '' || d.qtd === null || d.qtd === undefined) ? '' : Number(d.qtd);
  if (qtd !== '' && (isNaN(qtd) || !isFinite(qtd))) return { status: 'error', message: 'Quantidade invalida.' };

  if (tipo === 'loja') {
    if (!d.deLoja || !d.paraLoja) return { status: 'error', message: 'Informe a loja de origem e a de destino.' };
    if (d.deLoja === d.paraLoja)  return { status: 'error', message: 'As lojas de origem e destino sao iguais.' };
    if (qtd !== '' && qtd <= 0)   return { status: 'error', message: 'Para correcao de loja, a quantidade deve ser positiva (ou vazia = todos).' };
  } else {
    if (!d.paraLoja)              return { status: 'error', message: 'Informe a loja.' };
    if (qtd === '' || qtd === 0)  return { status: 'error', message: 'Informe uma quantidade diferente de zero (use - para subtrair).' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh = getAdjSheet_();
    var id = 'A' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
    sh.appendRow([
      id,
      Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'),
      tipo,
      fmt_(dt, 'yyyy-MM-dd'),
      agente,
      String(d.deLoja || ''),
      String(d.paraLoja || ''),
      qtd,
      String(d.motivo || '').trim(),
      'SIM'
    ]);
    return { status: 'ok', id: id };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function delAdjust_(id) {
  id = String(id || '');
  if (!id) return { status: 'error', message: 'ID nao informado.' };
  var sh = getAdjSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { status: 'error', message: 'Ajuste nao encontrado.' };
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      sh.getRange(i + 2, 10).setValue('NAO');
      return { status: 'ok', id: id };
    }
  }
  return { status: 'error', message: 'Ajuste nao encontrado.' };
}

/* ============================================================
   LEITURA (API do dashboard)
   ============================================================ */

function getData_(p) {
  var sheet = getSheet_();
  var last  = sheet.getLastRow();
  var tz    = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || TZ;
  var out = [], skipped = 0;

  if (last >= 2) {
    var range   = sheet.getRange(2, 1, last - 1, HEADER.length);
    var display = range.getDisplayValues();   // o que aparece na planilha (imune a fuso/serial)
    var values  = range.getValues();          // fallback tipado

    for (var i = 0; i < display.length; i++) {
      var dr = display[i], vr = values[i];

      var agente = String(dr[1] || vr[1] || '').trim();
      var loja   = String(dr[6] || vr[6] || '').trim() || 'Sem loja';
      var cont   = Number(vr[2]) || 0;

      var dt = parseAny_(dr[0]) || parseAny_(vr[0]) || parseAny_(dr[3]) || parseAny_(vr[3]);
      if (!dt || !agente) { skipped++; continue; }

      var hm = parseTime_(dr[4]);
      if (!hm && isDate_(vr[4])) hm = parseTime_(Utilities.formatDate(vr[4], tz, 'HH:mm'));
      if (!hm) hm = parseTimeIn_(dr[0]) || parseTimeIn_(dr[3]);
      if (hm) dt.setHours(hm[0], hm[1], 0, 0);

      out.push({
        data:     fmt_(dt, 'yyyy-MM-dd'),
        hora:     fmt_(dt, 'HH:mm'),
        agente:   agente,
        loja:     loja,
        contador: cont
      });
    }
  }

  var aplicados = applyAdjustments_(out);

  if (p.since) {
    var sinceD = parseAny_(p.since);
    if (sinceD) {
      var lim = fmt_(sinceD, 'yyyy-MM-dd');
      out = out.filter(function (r) { return r.data >= lim; });
    }
  }

  out.sort(function (a, b) {
    var ka = a.data + a.hora, kb = b.data + b.hora;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  var notas = [];
  try { notas = listNotas_(); } catch (eN) {}

  var base = {
    status: 'ok', total: out.length, skipped: skipped, ajustes: aplicados,
    metas: listMetas_(), metasHist: listMetasHist_(), notas: notas,
    tz: tz, generatedAt: nowStr_(), version: 9
  };

  if (p.compact) {
    base.cols = ['data', 'hora', 'agente', 'loja', 'contador'];
    base.rows = out.map(function (r) { return [r.data, r.hora, r.agente, r.loja, r.contador]; });
  } else {
    base.rows = out;
  }
  return base;
}

/** Aplica os ajustes ativos sobre o array lido da aba Logs. Muta `out`. */
function applyAdjustments_(out) {
  var adj;
  try { adj = listAdjust_(); } catch (e) { return 0; }
  adj = adj.filter(function (a) { return a.ativo; });
  if (!adj.length) return 0;
  adj.reverse();   // aplica na ordem cronologica de criacao

  var n = 0;
  for (var k = 0; k < adj.length; k++) {
    var a = adj[k];

    if (a.tipo === 'loja') {
      var moved = 0;
      var limit = (a.qtd === null || a.qtd === '' || isNaN(a.qtd)) ? Infinity : a.qtd;
      for (var i = 0; i < out.length && moved < limit; i++) {
        if (out[i].data === a.data && out[i].agente === a.agente && out[i].loja === a.deLoja) {
          out[i].loja = a.paraLoja;
          moved++;
        }
      }
      if (moved) n++;

    } else if (a.tipo === 'total') {
      var q = Number(a.qtd) || 0;

      if (q > 0) {
        var horas = [];
        for (var h = 0; h < out.length; h++) {
          if (out[h].data === a.data && out[h].agente === a.agente) horas.push(out[h].hora);
        }
        if (!horas.length) horas = ['12:00'];
        for (var c = 0; c < q; c++) {
          out.push({
            data: a.data, hora: horas[Math.floor(c * horas.length / q)] || horas[0],
            agente: a.agente, loja: a.paraLoja, contador: 0, ajuste: true
          });
        }
        n++;

      } else if (q < 0) {
        var rem = -q;
        for (var j = out.length - 1; j >= 0 && rem > 0; j--) {
          if (out[j].data === a.data && out[j].agente === a.agente &&
              (!a.paraLoja || out[j].loja === a.paraLoja)) {
            out.splice(j, 1);
            rem--;
          }
        }
        n++;
      }
    }
  }
  return n;
}

/* ============================================================
   PARSERS TOLERANTES
   ============================================================ */

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** Aceita Date, serial do Sheets, "dd/MM/yyyy [HH:mm[:ss]]" e "yyyy-MM-dd[THH:mm]". */
function parseAny_(v) {
  if (v === null || v === undefined || v === '') return null;

  if (isDate_(v)) {
    return v.getFullYear() < 1950 ? null : new Date(v.getTime());
  }

  if (typeof v === 'number') {                       // serial do Sheets
    if (v < 100) return null;                        // hora pura
    var ds = new Date(Math.round((v - 25569) * 86400000));
    return (isNaN(ds.getTime()) || ds.getFullYear() < 1950) ? null : ds;
  }

  var s = String(v).trim();
  if (!s) return null;

  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return build_(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var day = +m[1], mon = +m[2], yr = +m[3];
    if (yr < 100) yr += 2000;
    if (mon > 12 && day <= 12) { var t = day; day = mon; mon = t; }  // veio como MM/dd
    return build_(yr, mon, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  return null;
}

function build_(y, mo, d, h, mi, s) {
  var dt = new Date(y, mo - 1, d, h, mi, s);
  return (isNaN(dt.getTime()) || dt.getFullYear() < 1950) ? null : dt;
}

/** So aceita hora "pura" (HH:mm ou HH:mm:ss). Evita capturar o lixo do serial 1899. */
function parseTime_(v) {
  if (v === null || v === undefined) return null;
  var m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? clampHM_(+m[1], +m[2]) : null;
}

/** Extrai a hora de um timestamp completo tipo "19/08/2025 14:32:11". */
function parseTimeIn_(v) {
  if (v === null || v === undefined) return null;
  var m = String(v).trim().match(/(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
  return m ? clampHM_(+m[1], +m[2]) : null;
}

function clampHM_(h, mi) {
  return (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) ? [h, mi] : null;
}

/* ============================================================
   SAIDA
   ============================================================ */

function fmt_(d, pattern) { return Utilities.formatDate(d, TZ, pattern); }
function nowStr_()        { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

function respond_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   DIAGNOSTICO
   ============================================================ */

/** Mostra passo a passo onde a leitura quebra. Rode e mande o log. */
function diagnostico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('1. Planilha: %s | fuso: %s', ss.getName(), ss.getSpreadsheetTimeZone());

  var sh = ss.getSheetByName(SHEET_NAME);
  Logger.log('2. Aba "%s": %s', SHEET_NAME, sh ? 'encontrada' : 'NAO ENCONTRADA');
  if (!sh) return;

  var last = sh.getLastRow();
  Logger.log('3. Linhas: %s | Colunas: %s', last, sh.getLastColumn());
  if (last < 2) return;

  var n = Math.min(3, last - 1);
  var rg = sh.getRange(2, 1, n, 7);
  Logger.log('4. getDisplayValues: %s', JSON.stringify(rg.getDisplayValues()));
  Logger.log('5. getValues:        %s', JSON.stringify(rg.getValues()));

  var d0 = rg.getDisplayValues()[0];
  var dt = parseAny_(d0[0]) || parseAny_(d0[3]);
  Logger.log('6. Data reconhecida: %s', dt ? Utilities.formatDate(dt, TZ, 'yyyy-MM-dd') : 'FALHOU');
  Logger.log('7. Hora reconhecida: %s', JSON.stringify(parseTime_(d0[4])));
  Logger.log('8. Aba "%s": %s | Aba "%s": %s | Aba "%s": %s', ADJ_SHEET,
    ss.getSheetByName(ADJ_SHEET) ? 'existe' : 'ainda nao criada',
    META_SHEET, ss.getSheetByName(META_SHEET) ? 'existe' : 'ainda nao criada',
    NOTA_SHEET, ss.getSheetByName(NOTA_SHEET) ? 'existe' : 'ainda nao criada');
}

function testarLeitura() {
  var r = getData_({});
  Logger.log('Linhas validas: %s | ignoradas: %s | ajustes: %s', r.total, r.skipped, r.ajustes);
  Logger.log('Metas (total por agente): %s', JSON.stringify(r.metas));
  Logger.log('Metas com loja: %s', JSON.stringify(r.metasHist));
  Logger.log('Notas: %s', (r.notas || []).length);
  if (r.total) {
    Logger.log('Primeira: %s', JSON.stringify(r.rows[0]));
    Logger.log('Ultima:   %s', JSON.stringify(r.rows[r.total - 1]));
  }
}
