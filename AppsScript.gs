/**
 * =============================================================
 *  EMAIL COUNTER — Google Apps Script (API + Logger + Ajustes + Metas + Notas + Tarefas + Acessos + Reviews)  v19.0
 *  Planilha: "Email counter KPI's"  |  Abas: "Logs", "Ajustes", "Metas", "Notas", "Tentativas", "Tarefas", "Usuarios", "Sessoes", "Reviews"
 * =============================================================
 *
 *  COMO ATUALIZAR
 *  1. Planilha > Extensoes > Apps Script
 *  2. Apague TODO o codigo antigo e cole este arquivo inteiro > Salvar
 *  3. Implantar > Gerenciar implantacoes > (lapis) > Versao: Nova versao > Implantar
 *  A senha ja configurada em ADMIN_TOKEN continua valendo — nao precisa refazer.
 *
 *  ACESSOS (v15)
 *   O dashboard passou a exigir login. Cada pessoa tem uma linha na aba "Usuarios"
 *   (email, nome, papel admin|agente, o nome que ela usa no contador, senha em hash
 *   com salt). O login devolve um token de sessao (aba "Sessoes", validade
 *   SESSAO_HORAS) que vai em todas as chamadas. O getData entrega por papel:
 *     admin  -> tudo, como antes, mais os reviews.
 *     agente -> so os proprios emails, tarefas e metas (v18), mais os reviews. As metas
 *               dos outros, qualidade, notas e ajustes NAO saem da API para ele —
 *               esconder na tela nao bastaria.
 *   Primeiro admin: rode criarAdmin() no editor OU, na tela de login, "Primeiro
 *   acesso" com a senha do Apps Script (ADMIN_TOKEN). So funciona enquanto nao
 *   existe nenhum usuario.
 *
 *  REVIEWS DO TRUSTPILOT (v16)
 *   Os reviews moram na aba "Reviews" desta planilha e sao cadastrados pelo painel
 *   por quem tem login (admin ou agente). Link do review obrigatorio (so link de
 *   review do Trustpilot, /reviews/...), o mesmo review nao entra duas vezes.
 *   Status: Investigando, Contatado, Follow up, Resolvendo, Resolvido. "Status desde",
 *   "Contatado em" e "Follow up em" sao gravados sozinhos na troca de status; o
 *   painel lista em Follow up quem esta Contatado (ou em Follow up) ha mais de
 *   FOLLOW_UP_DIAS dias sem resposta. Excluir e so para admin.
 *   Na primeira leitura a aba e criada e recebe tudo o que estava no Review Desk
 *   (propriedades REVIEWS_API_URL + REVIEWS_SECRET, ou REVIEWS_SHEET_ID). Depois
 *   disso o Review Desk so e lido quando o admin pede "Trazer do Review Desk"
 *   (acrescenta o que faltar, pelo ID). testarReviews() no editor confere a conexao.
 *   POST {action:'addReview', token, link, data, loja, nota, status, responsavel, risco, notas, ticket}
 *   POST {action:'updateReview', token, id, versao, [campos acima] | followUp:true | desfazer:true}
 *        desfazer (v17): volta a ultima troca de status (e o follow up contado junto),
 *        so se ninguem mexeu no review depois (mesma versao). A coluna "Anterior" guarda
 *        o estado de antes; qualquer outra edicao apaga essa memoria.
 *        Pedido repetido (o painel refaz por GET quando a resposta do POST se perde):
 *        addReview leva o id escolhido pelo painel (P-...) e updateReview leva "op";
 *        chegando de novo, respondem ok sem gravar duas vezes.
 *   Excluidos vao para a aba "Reviews excluidos" e a importacao nao os traz de volta;
 *   a importacao tambem pula o review que ja esta aqui com outro ID (mesmo link).
 *   POST {action:'delReview', token, id}          (admin)
 *   POST {action:'importReviews', token}          (admin)
 *   POST {action:'login', email, senha}                 -> {token, usuario}
 *   POST {action:'logout', token}
 *   POST {action:'me', token}                           -> {usuario}
 *   POST {action:'setupAdmin', token(ADMIN_TOKEN), email, nome, senha}
 *   POST {action:'listUsers', token}                    (admin)
 *   POST {action:'saveUser', token, email, nome, papel, agente, ativo [, senha]}  (admin)
 *
 *  ENDPOINTS DE LEITURA
 *   GET  ?action=getData&token=SESSAO    -> {status,total,rows,ajustes,metas,metasHist,notas,reviews,usuario,followUpDias,equipeNomes}
 *   GET  ?action=getData&compact=1       -> payload ~5x menor
 *   GET  ?action=getData&callback=fn     -> JSONP
 *   GET  ?action=ping                    -> teste de saude
 *   GET  ?agente=Vitor&contador=12&loja=Lumvelle&ticket=cs:8172:26430:194230&situacao=ticket  -> grava 1 email (AHK)
 *   GET  ...&recusado=1   -> contador v6 em modo bloquear recusou; vai para a aba Tentativas, nao conta
 *   GET  ?action=addTarefa&id=..&quem=Vitor&tarefa=Reembolsos&loja=Lumvelle&qtd=37&data=2026-09-24&inicio=09:12&fim=10:20&pausa=10
 *        -> grava 1 sessao do Contador de Tarefas (aba Tarefas). O mesmo id de novo nao duplica.
 *   POST {action:'setMetas', metas:[{agente,loja,meta},...], desde, base}   (sem senha desde a v9)
 *   POST {action:'delMeta',  agente, loja, desde}                          (sem senha desde a v9)
 *
 *  PEDIDO SEM ACAO CONHECIDA (v16)
 *   So vira contagem o pedido sem "action" que traz agente ou contador (o widget).
 *   Qualquer outra acao desconhecida volta erro e NAO grava nada: antes, um pedido
 *   que nao era para este script virava uma linha falsa na aba Logs.
 *
 *  ENDPOINTS PROTEGIDOS (token de sessao de admin, ou a senha ADMIN_TOKEN)
 *   POST {action:'setMetas' | 'delMeta', token, ...}   (voltaram a ser protegidos na v15)
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
 *  TICKET (v10)
 *   O contador v5.1 manda junto o ticket que estava aberto na hora da contagem:
 *   "cs:CONTA:CAIXA:TICKET" (Commslayer), "rp:TICKET" (Richpanel), "gg:CONTA:TICKET"
 *   (Gorgias, desde o contador v6.5 e esta API v19), "fora" (a janela
 *   da frente nao era um ticket) ou vazio (nao deu para ler). Fica na coluna H da
 *   aba Logs. E so um codigo — nenhum dado de cliente. O getData NAO devolve os
 *   tickets, so um resumo por agente e dia (campo "qualidade"). A unica excecao
 *   sao os tickets contados MAIS DE UMA VEZ no mesmo dia: esses vao na lista
 *   "repetidosLista", para dar para conferir no helpdesk qual foi.
 *
 *  SITUACAO E TENTATIVAS (v11)
 *   O contador v6 manda tambem a situacao da contagem: ticket | repetido (mesmo
 *   ticket em 1 minuto) | fora | semleitura | outra (conversa do cliente aberta
 *   fora da caixa, pelo perfil dele: conta como ticket e fica marcada). Fica na coluna I da aba Logs. Em modo
 *   bloquear ele manda as recusas com recusado=1: entram na aba "Tentativas" e nao
 *   viram email. O resumo "qualidade" do getData junta as duas abas.
 *   A caixa de entrada do Commslayer (no codigo do ticket) diz a loja de verdade:
 *   INBOX_LOJA traduz, e o resumo conta quantas vezes a loja do widget nao bateu.
 *   No Gorgias quem diz a loja e a conta (o endereco CONTA.gorgias.com): GORGIAS_LOJA.
 *
 *  DESEMPENHO (v12)
 *   Utilities.formatDate custa ~1 ms por chamada. Com 3 chamadas por linha e 20 mil
 *   linhas na aba Logs, so isso levava o getData a 40 s — mais que o tempo que o
 *   dashboard espera. A leitura agora monta data e hora com os getters do Date
 *   (ymd_ / hm_). Isso assume que o fuso do projeto do Apps Script e
 *   America/Sao_Paulo (Configuracoes do projeto > Fuso horario), o mesmo TZ daqui.
 *
 *  TAREFAS (v14)
 *   O Contador de Tarefas (widget AHK separado do contador de emails) conta
 *   tarefas avulsas: o agente digita o nome da tarefa, escolhe a loja e digita
 *   o horario de inicio; conta +1 por atalho; ao finalizar digita o fim e os
 *   minutos de pausa. Cada sessao finalizada vira uma linha na aba "Tarefas" e
 *   volta no getData, no campo "tarefas". O tempo e recalculado na leitura a
 *   partir de inicio, fim e pausa: corrigir um horario direto na planilha ja
 *   vale. Fim antes do inicio = a tarefa passou da meia-noite.
 *   O widget manda o agente em "quem", nunca em "agente": numa implantacao
 *   antiga, sem a rota addTarefa, um GET com "agente" cairia no gravador de
 *   emails e viraria um email a mais. Sem "agente", a versao antiga so devolve
 *   o "usage", e o widget guarda a sessao e tenta de novo mais tarde.
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
var HEADER      = ['Timestamp', 'Agente', 'Email #', 'Data', 'Hora', 'Dia da Semana', 'Loja', 'Ticket', 'Situacao'];
var TENT_SHEET  = 'Tentativas';
var TENT_HEADER = ['Timestamp', 'Agente', 'Data', 'Loja', 'Ticket', 'Situacao'];
var SITUACOES   = ['ticket', 'repetido', 'fora', 'semleitura', 'outra'];
/* Caixa de entrada do Commslayer -> loja. Fonte: README do CS Reporting (10/09/2026).
   Nouveian: preencher quando o usuario mandar o endereco de um ticket. */
var INBOX_LOJA  = { '26430': 'Vellum', '26575': 'Vigewell', '27261': 'Stratum', '10077': 'Elevare' };
/* Conta do Gorgias (o CONTA de CONTA.gorgias.com) -> loja. v19. */
var GORGIAS_LOJA = { 'oldworldhealing': 'Old World Healing' };
var TICKET_RE   = /^(cs:\d{1,12}:\d{1,12}:\d{1,15}|rp:\d{1,15}|gg:[a-z0-9-]{1,40}:\d{1,15}|fora)$/;
var ADJ_HEADER  = ['ID', 'Registrado em', 'Tipo', 'Data', 'Agente', 'De loja', 'Para loja', 'Qtd', 'Motivo', 'Ativo'];
var META_HEADER = ['Agente', 'Meta diaria', 'Vigente a partir de', 'Definida em', 'Base', 'Loja'];
var NOTA_HEADER = ['ID', 'Registrado em', 'Data', 'Tipo', 'Agente', 'Loja', 'Nota', 'Ativo'];
var NOTA_TIPOS  = ['nota', 'bom', 'ruim', 'ausencia', 'sistema'];
var TAREFA_SHEET  = 'Tarefas';
var TAREFA_HEADER = ['ID', 'Registrado em', 'Agente', 'Data', 'Tarefa', 'Loja', 'Quantidade', 'Inicio', 'Fim', 'Pausa (min)', 'Tempo (min)'];
var TAREFA_ID_RE  = /^[A-Za-z0-9_.:-]{6,80}$/;
var USER_SHEET    = 'Usuarios';
var USER_HEADER   = ['Email', 'Nome', 'Papel', 'Agente', 'Salt', 'Hash', 'Ativo', 'Criado em', 'Ultimo acesso'];
var SESS_SHEET    = 'Sessoes';
var SESS_HEADER   = ['Token', 'Email', 'Criado em', 'Expira em'];
var SESSAO_HORAS  = 14;
var PAPEIS        = ['admin', 'agente'];
var REVIEW_SHEET  = 'Reviews';
var REVIEW_HEADER = ['ID', 'Criado em', 'Atualizado em', 'Criado por', 'Atualizado por', 'Data do review', 'Loja', 'Nota',
                     'Status', 'Responsavel', 'Risco', 'Notas', 'Link do review', 'Ticket', 'Status desde',
                     'Contatado em', 'Follow up em', 'Follow ups', 'Origem', 'Anterior', 'Operacao'];
var RV = { id: 0, criado: 1, atualizado: 2, criadoPor: 3, atualizadoPor: 4, data: 5, loja: 6, nota: 7, status: 8,
           resp: 9, risco: 10, notas: 11, link: 12, ticket: 13, desde: 14, contatado: 15, followEm: 16, follows: 17, origem: 18, anterior: 19, op: 20 };
var REVIEW_EXCL_SHEET  = 'Reviews excluidos';   // o que o admin excluiu nao volta pela importacao
var REVIEW_EXCL_HEADER = ['ID', 'Link do review', 'Excluido em', 'Excluido por'];
var ID_PAINEL_RE = /^P-[0-9]{6}-[0-9]{5}$/;     // P- (painel) nunca colide com os R- do Review Desk
var REVIEW_STATUS = ['Investigando', 'Contatado', 'Follow up', 'Resolvendo', 'Resolvido'];
var FOLLOW_UP_DIAS = 3;   // contatado ha mais de 3 dias sem resposta -> lista de follow up

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

/** Senha do Apps Script (ADMIN_TOKEN) OU sessao de um admin logado. */
function checkToken_(t) {
  t = String(t || '');
  // sessao primeiro: o admin logado nao depende do ADMIN_TOKEN existir
  if (ehToken_(t)) {
    var u = sessao_(t);
    if (u) return u.papel === 'admin';
  }
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!k) return false;
  if (ehToken_(t) && t !== String(k)) return false;   // sessao vencida nao conta como chute de senha
  return adminTokenOk_(t);
}

/** Formato do token de sessao (64 hexadecimais). */
function ehToken_(t) { return /^[0-9a-f]{64}$/.test(String(t || '')); }

/**
 * Confere a senha do Apps Script com trava: 20 erros em 15 minutos bloqueiam a
 * senha (as sessoes de admin continuam funcionando). Desde a v15 ela cria o
 * primeiro admin e vale como admin nas acoes protegidas.
 */
function adminTokenOk_(t) {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  var cache = null, erros = 0;
  try { cache = CacheService.getScriptCache(); erros = Number(cache.get('admerr')) || 0; } catch (eC) {}
  if (erros >= 20) return false;
  if (k && String(t || '') === String(k)) return true;
  try { cache && cache.put('admerr', String(erros + 1), 900); } catch (eP) {}
  return false;
}

/* ============================================================
   ROTEAMENTO
   ============================================================ */

var PROTEGIDAS = ['listAdjust', 'addAdjust', 'delAdjust', 'addNota', 'delNota', 'setMetas', 'delMeta', 'listUsers', 'saveUser'];
var LIVRES     = [];   // metas voltaram a exigir admin na v15 (agentes nao podem ve-las)
var ACESSO     = ['login', 'logout', 'me', 'setupAdmin'];
var REVIEW_ACOES = ['addReview', 'updateReview', 'delReview', 'importReviews'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping')    return respond_({ status: 'ok', pong: true, tz: TZ, now: nowStr_(), version: 19 }, p.callback);
    if (p.action === 'getData') return respond_(getDataAuth_(p), p.callback);
    if (ACESSO.indexOf(p.action) > -1)     return respond_(acesso_(p), p.callback);
    // Contador de Tarefas. Tem que vir antes do "p.agente || p.contador" la embaixo.
    if (p.action === 'addTarefa') return respond_(addTarefa_(p), p.callback);

    // Fallback por GET (usado se o POST falhar no redirect do Apps Script)
    if (LIVRES.indexOf(p.action) > -1)     return respond_(livre_(p), p.callback);
    if (PROTEGIDAS.indexOf(p.action) > -1) return respond_(protegida_(p), p.callback);
    if (REVIEW_ACOES.indexOf(p.action) > -1) return respond_(reviewAcao_(p), p.callback);
    // acao que este script nao conhece: erro, e nada vira contagem
    if (p.action) return respond_({ status: 'error', message: 'Acao desconhecida: ' + String(p.action).slice(0, 40) }, p.callback);

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

    if (d.action === 'getData') return respond_(getDataAuth_(d), p.callback);
    if (ACESSO.indexOf(d.action) > -1)     return respond_(acesso_(d), p.callback);
    if (d.action === 'addTarefa') return respond_(addTarefa_(d), p.callback);
    if (LIVRES.indexOf(d.action) > -1)     return respond_(livre_(d), p.callback);
    if (PROTEGIDAS.indexOf(d.action) > -1) return respond_(protegida_(d), p.callback);
    if (REVIEW_ACOES.indexOf(d.action) > -1) return respond_(reviewAcao_(d), p.callback);
    // So vira contagem o pedido do widget (sem acao, com agente ou contador). Antes,
    // qualquer POST desconhecido virava uma linha falsa na aba Logs.
    if (d.action) return respond_({ status: 'error', message: 'Acao desconhecida: ' + String(d.action).slice(0, 40) }, p.callback);
    if (!(d.agente || d.contador)) return respond_({ status: 'error', message: 'Pedido sem agente: nada foi gravado.' }, p.callback);
    return respond_(logHit_(d), p.callback);
  } catch (err2) {
    return respond_({ status: 'error', message: String((err2 && err2.message) || err2) }, p.callback);
  }
}

function protegida_(d) {
  if (!checkToken_(d.token)) {
    // com token de sessao, o painel entende "code: auth" e volta para o login
    if (ehToken_(d.token)) return { status: 'error', code: 'auth', message: 'Sessao vencida ou sem permissao.' };
    return { status: 'error', message: 'Senha invalida.' };
  }
  if (d.action === 'listAdjust') return { status: 'ok', ajustes: listAdjust_() };
  if (d.action === 'addAdjust')  return addAdjust_(d);
  if (d.action === 'delAdjust')  return delAdjust_(d.id);
  if (d.action === 'addNota')    return addNota_(d);
  if (d.action === 'delNota')    return delNota_(d.id);
  if (d.action === 'setMetas')   return setMetas_(d);
  if (d.action === 'delMeta')    return delMeta_(d);
  if (d.action === 'listUsers')  return { status: 'ok', usuarios: listUsers_() };
  if (d.action === 'saveUser')   return saveUser_(d);
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

function limpaSituacao_(v) {
  v = String(v || '').trim().toLowerCase();
  return SITUACOES.indexOf(v) > -1 ? v : '';
}

/** Loja que o ticket indica (caixa do Commslayer, conta do Gorgias), ou '' quando nao diz (Richpanel, fora, vazio). */
function lojaDoTicket_(tk) {
  var m = /^cs:\d+:(\d+):/.exec(tk || '');
  if (m) return INBOX_LOJA[m[1]] || '';
  var g = /^gg:([a-z0-9-]+):/.exec(tk || '');
  return g && GORGIAS_LOJA[g[1]] ? GORGIAS_LOJA[g[1]] : '';
}

/** Recusa do contador em modo bloquear: registra e NAO conta. */
function logTentativa_(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh = ensureSheet_(TENT_SHEET, TENT_HEADER);
    var now = new Date();
    sh.appendRow([
      Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss'),
      String(d.agente || 'Sem nome').trim(),
      Utilities.formatDate(now, TZ, 'dd/MM/yyyy'),
      String(d.loja || 'Sem loja').trim(),
      limpaTicket_(d.ticket),
      limpaSituacao_(d.situacao)
    ]);
    return { status: 'ok', recusado: true };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function logHit_(d) {
  if (String(d.recusado || '') === '1') return logTentativa_(d);
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
      String(d.loja || 'Sem loja').trim(),
      limpaTicket_(d.ticket),
      limpaSituacao_(d.situacao)
    ]);
    return { status: 'ok', total: Number(d.contador || 0) || 0, at: Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss') };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** So aceita os formatos que o contador manda; qualquer outra coisa vira vazio. */
function limpaTicket_(t) {
  t = String(t || '').trim().toLowerCase();
  return TICKET_RE.test(t) ? t : '';
}

/**
 * Aba "Logs" garantindo a coluna "Ticket". Planilhas anteriores a v10 tem 7
 * colunas: a oitava e criada aqui, sem tocar nas linhas existentes.
 */
function getSheet_() {
  var sh = ensureSheet_(SHEET_NAME, HEADER);
  if (sh.getMaxColumns() < HEADER.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), HEADER.length - sh.getMaxColumns());
  }
  // colunas H (Ticket, v10) e I (Situacao, v11) — cria o cabecalho que faltar
  for (var c = 8; c <= HEADER.length; c++) {
    if (String(sh.getRange(1, c).getDisplayValue()).trim() !== HEADER[c - 1]) {
      sh.getRange(1, c).setValue(HEADER[c - 1]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('white');
    }
  }
  return sh;
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
      data:     dt ? ymd_(dt) : String(v[i][2]),
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
      data:     dt ? ymd_(dt) : String(v[i][3]),
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
   TAREFAS (Contador de Tarefas, v14)
   ============================================================ */

/**
 * Minutos entre inicio e fim ([h, m]), menos a pausa. Fim antes do inicio =
 * passou da meia-noite. Pode dar zero ou negativo; quem chama decide.
 */
function minutosTarefa_(ini, fim, pausa) {
  var a = ini[0] * 60 + ini[1], b = fim[0] * 60 + fim[1];
  var bruto = b >= a ? b - a : b + 1440 - a;
  return bruto - (Number(pausa) || 0);
}

/** Uma sessao finalizada no widget. Reenvio do mesmo id (resposta perdida) nao duplica. */
function addTarefa_(d) {
  var id = String(d.id || '').trim();
  if (!TAREFA_ID_RE.test(id)) return { status: 'error', message: 'ID da sessao invalido.' };
  var agente = String(d.quem || '').trim();
  if (!agente) return { status: 'error', message: 'Informe o agente.' };
  var tarefa = String(d.tarefa || '').replace(/\s+/g, ' ').trim();
  if (!tarefa) return { status: 'error', message: 'Informe a tarefa.' };
  if (tarefa.length > 80) tarefa = tarefa.slice(0, 80);

  var qtd = Number(d.qtd);
  if (String(d.qtd === undefined ? '' : d.qtd).trim() === '' || !isFinite(qtd) || qtd < 0 || qtd !== Math.floor(qtd))
    return { status: 'error', message: 'Quantidade invalida.' };
  var dt = parseAny_(d.data);
  if (!dt) return { status: 'error', message: 'Data invalida.' };
  var ini = parseTime_(d.inicio), fim = parseTime_(d.fim);
  if (!ini || !fim) return { status: 'error', message: 'Horario invalido (use HH:mm).' };
  var pausa = String(d.pausa === undefined || d.pausa === null ? '' : d.pausa).trim() === '' ? 0 : Number(d.pausa);
  if (!isFinite(pausa) || pausa < 0 || pausa !== Math.floor(pausa)) return { status: 'error', message: 'Pausa invalida.' };
  var tempo = minutosTarefa_(ini, fim, pausa);
  if (tempo <= 0) return { status: 'error', message: 'O tempo da tarefa ficou zerado (confira inicio, fim e pausa).' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh = ensureSheet_(TAREFA_SHEET, TAREFA_HEADER);
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) return { status: 'ok', tarefa: true, id: id, duplicado: true };
    }
    sh.appendRow([
      id,
      Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'),
      agente,
      ymd_(dt),
      tarefa,
      String(d.loja || '').trim() || 'Sem loja',
      qtd,
      pad2_(ini[0]) + ':' + pad2_(ini[1]),
      pad2_(fim[0]) + ':' + pad2_(fim[1]),
      pausa,
      tempo
    ]);
    return { status: 'ok', tarefa: true, id: id, tempo: tempo };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Sessoes da aba Tarefas a partir de `desde` ("yyyy-MM-dd"; vazio = todas). */
function listTarefas_(desde) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAREFA_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, TAREFA_HEADER.length).getDisplayValues();
  var num = function (x) { return Number(String(x || '').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0; };
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var r = v[i];
    var dt = parseAny_(r[3]);
    var agente = String(r[2] || '').trim(), tarefa = String(r[4] || '').trim();
    if (!dt || !agente || !tarefa) continue;
    var data = ymd_(dt);
    if (desde && data < desde) continue;
    var ini = parseTime_(r[7]), fim = parseTime_(r[8]);
    var pausa = num(r[9]);
    // os horarios mandam; a coluna "Tempo" so vale se eles estiverem ilegiveis
    var min = ini && fim ? minutosTarefa_(ini, fim, pausa) : 0;
    if (min <= 0) min = num(r[10]);
    out.push({
      id:      String(r[0] || ''),
      data:    data,
      agente:  agente,
      tarefa:  tarefa,
      loja:    String(r[5] || '').trim(),
      qtd:     Math.max(0, Math.round(num(r[6]))),
      inicio:  ini ? pad2_(ini[0]) + ':' + pad2_(ini[1]) : '',
      fim:     fim ? pad2_(fim[0]) + ':' + pad2_(fim[1]) : '',
      pausa:   pausa,
      minutos: min
    });
  }
  out.sort(function (a, b) {
    var ka = a.data + a.inicio, kb = b.data + b.inicio;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return out;
}

/* ============================================================
   ACESSOS: usuarios, sessoes e dados por papel (v15)
   ============================================================ */

function hash_(salt, senha) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + String(senha), Utilities.Charset.UTF_8);
  // hexadecimal: base64 pode comecar com "+" ou "=", e a planilha leria como formula
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
/** Texto puro na celula: o apostrofo impede a planilha de ler data, numero ou formula. */
function txt_(v) { return "'" + String(v === null || v === undefined ? '' : v); }
/** Roda fn com o lock do script (o mesmo do gravador de contagens). Nao aninhar. */
function comLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try { return fn(); } finally { try { lock.releaseLock(); } catch (ignore2) {} }
}
/** Nao/NAO/NÃO/FALSE/0/N/inativo desativam (inclusive caixa de selecao desmarcada). */
function ativoCelula_(v) {
  var a = String(v === '' || v === null || v === undefined ? 'SIM' : v).trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ['NAO', 'FALSE', 'FALSO', '0', 'N', 'INATIVO', 'DESATIVADO'].indexOf(a) < 0;
}
function aleatorio_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function emailLimpo_(e) { return String(e || '').trim().toLowerCase(); }
function agora_() { return new Date(); }
function iso_(d) { return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

/**
 * Primeiro admin, pelo editor: preencha as tres linhas, rode, e depois apague
 * a senha do codigo. So cria se ainda nao houver nenhum usuario.
 */
function criarAdmin() {
  var email = 'COLE_O_EMAIL_AQUI';
  var nome  = 'COLE_O_NOME_AQUI';
  var senha = 'COLE_A_SENHA_AQUI';
  if (email.indexOf('_AQUI') > -1 || senha.indexOf('_AQUI') > -1) throw new Error('Preencha email, nome e senha nas tres linhas de criarAdmin().');
  var r = setupAdmin_({ email: email, nome: nome, senha: senha, token: PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') });
  Logger.log(JSON.stringify(r));
}

function usersSheet_() { return ensureSheet_(USER_SHEET, USER_HEADER); }
function sessSheet_()  { return ensureSheet_(SESS_SHEET, SESS_HEADER); }

/** Todas as linhas da aba Usuarios como objetos (com hash; nunca devolver assim para fora). */
function readUsers_() {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, USER_HEADER.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var email = emailLimpo_(v[i][0]);
    if (!email) continue;
    out.push({
      linha: i + 2, email: email, nome: String(v[i][1] || '').trim(),
      papel: String(v[i][2] || 'agente').trim().toLowerCase(), agente: String(v[i][3] || '').trim(),
      salt: String(v[i][4] || ''), hash: String(v[i][5] || ''),
      ativo: ativoCelula_(v[i][6]),
      criadoEm: String(v[i][7] || ''), ultimoAcesso: String(v[i][8] || '')
    });
  }
  return out;
}

function publico_(u) { return { email: u.email, nome: u.nome, papel: u.papel, agente: u.agente, ativo: u.ativo, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso }; }

function listUsers_() { return readUsers_().map(publico_); }

/** Cria ou atualiza um usuario (admin). Senha so muda quando vier preenchida. */
function saveUser_(d) {
  var email = emailLimpo_(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'error', message: 'Email invalido.' };
  var nome = String(d.nome || '').trim();
  if (!nome) return { status: 'error', message: 'Informe o nome.' };
  var papel = String(d.papel || 'agente').trim().toLowerCase();
  if (PAPEIS.indexOf(papel) < 0) return { status: 'error', message: 'Papel invalido.' };
  var agente = String(d.agente || '').trim();
  var ativo = String(d.ativo === undefined ? 'SIM' : d.ativo).toUpperCase();
  ativo = (ativo === 'NAO' || ativo === 'FALSE' || ativo === '0') ? 'NAO' : 'SIM';
  var senha = String(d.senha || '');
  if (senha && senha.length < 6) return { status: 'error', message: 'A senha precisa ter pelo menos 6 caracteres.' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (ignore) {}
  try {
    var sh = usersSheet_();
    var lista = readUsers_();
    var atual = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].email === email) { atual = lista[i]; break; }

    // nunca deixar a planilha sem admin ativo
    if (atual && atual.papel === 'admin' && (papel !== 'admin' || ativo === 'NAO')) {
      var outros = lista.filter(function (u) { return u.email !== email && u.papel === 'admin' && u.ativo; }).length;
      if (!outros) return { status: 'error', message: 'Este e o unico admin ativo. Crie outro admin antes.' };
    }

    if (atual) {
      var salt = atual.salt, hash = atual.hash;
      if (senha) { salt = aleatorio_(); hash = hash_(salt, senha); }
      sh.getRange(atual.linha, 1, 1, 7).setValues([[email, nome, papel, agente, salt, hash, ativo].map(txt_)]);
      if (senha || ativo === 'NAO') apagarSessoes_(email);
      else esquecerSessoes_(email);   // papel/agente novo vale ja na proxima chamada
      return { status: 'ok', usuario: publico_({ email: email, nome: nome, papel: papel, agente: agente, ativo: ativo === 'SIM', criadoEm: atual.criadoEm, ultimoAcesso: atual.ultimoAcesso }), atualizado: true };
    }
    if (!senha) return { status: 'error', message: 'Usuario novo precisa de senha inicial.' };
    var s2 = aleatorio_();
    sh.appendRow([email, nome, papel, agente, s2, hash_(s2, senha), ativo, iso_(agora_()), ''].map(txt_));
    return { status: 'ok', usuario: { email: email, nome: nome, papel: papel, agente: agente, ativo: ativo === 'SIM' }, criado: true };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Primeiro acesso: cria o admin inicial. Exige ADMIN_TOKEN e planilha sem usuarios. */
function setupAdmin_(d) {
  if (!adminTokenOk_(d.token)) return { status: 'error', message: 'Senha do Apps Script invalida (ou muitas tentativas: espere 15 minutos).' };
  if (readUsers_().length) return { status: 'error', message: 'Ja existe usuario cadastrado. Peca ao admin para criar o seu.' };
  var r = saveUser_({ email: d.email, nome: d.nome, papel: 'admin', agente: d.agente || '', ativo: 'SIM', senha: d.senha });
  if (r.status !== 'ok') return r;
  return login_({ email: d.email, senha: d.senha });
}

function login_(d) {
  var email = emailLimpo_(d.email), senha = String(d.senha || '');
  // trava de tentativas: 8 erros em 15 min para o mesmo e-mail
  var cache = null, kErr = 'loginerr:' + email, erros = 0;
  try { cache = CacheService.getScriptCache(); erros = Number(cache.get(kErr)) || 0; } catch (eC) {}
  // Depois de 8 erros em 15 min, cada tentativa espera antes de conferir (ate 5 s).
  // Nao recusa a senha certa: recusar deixaria qualquer um trancar o admin do lado de fora.
  if (erros >= 8) Utilities.sleep(Math.min(erros - 7, 5) * 1000);
  var lista = readUsers_();
  if (!lista.length) return { status: 'error', code: 'no_users', message: 'Nenhum usuario cadastrado ainda.' };
  var u = null;
  for (var i = 0; i < lista.length; i++) if (lista[i].email === email) { u = lista[i]; break; }
  if (!u || !u.ativo || !senha || hash_(u.salt, senha) !== u.hash) {
    try { cache && cache.put(kErr, String(erros + 1), 900); } catch (eP) {}
    return { status: 'error', code: 'login', message: 'Email ou senha incorretos.' };
  }
  try { cache && cache.remove(kErr); } catch (eR) {}
  var token = aleatorio_();
  var exp = new Date(agora_().getTime() + SESSAO_HORAS * 3600 * 1000);
  comLock_(function () {
    sessSheet_().appendRow([token, u.email, iso_(agora_()), iso_(exp)].map(txt_));
    usersSheet_().getRange(u.linha, 9).setValue(txt_(iso_(agora_())));
    limparSessoes_();
  });
  var pub = publico_(u);
  try { CacheService.getScriptCache().put('sess:' + token, JSON.stringify(pub), 600); } catch (eC) {}
  return { status: 'ok', token: token, usuario: pub, expira: iso_(exp) };
}

function logout_(d) {
  var token = String(d.token || '');
  if (!token) return { status: 'ok' };
  try { CacheService.getScriptCache().remove('sess:' + token); } catch (eC) {}
  comLock_(function () { filtrarSessoes_(function (r) { return String(r[0]) !== token; }); });
  return { status: 'ok' };
}

/** Usuario da sessao (publico), ou null. Cache de 10 min para nao ler a aba a cada chamada. */
function sessao_(token) {
  token = String(token || '');
  if (token.length < 32) return null;
  var cache = null;
  try { cache = CacheService.getScriptCache(); var hit = cache.get('sess:' + token); if (hit) return JSON.parse(hit); } catch (eC) {}
  var sh = sessSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var v = sh.getRange(2, 1, last - 1, SESS_HEADER.length).getDisplayValues();
  var agoraStr = iso_(agora_());
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) !== token) continue;
    if (String(v[i][3]) < agoraStr) return null;   // expirada
    var email = emailLimpo_(v[i][1]);
    var lista = readUsers_();
    for (var j = 0; j < lista.length; j++) {
      if (lista[j].email === email && lista[j].ativo) {
        var pub = publico_(lista[j]);
        try { cache && cache.put('sess:' + token, JSON.stringify(pub), 600); } catch (eP) {}
        return pub;
      }
    }
    return null;
  }
  return null;
}

/**
 * Reescreve a aba Sessoes de uma vez, so com as linhas em que manter(linha) e
 * verdadeiro. Chamar SEMPRE com o lock (comLock_ ou o do saveUser_): apagar
 * linha por linha com indices de uma leitura anterior acertava sessoes validas
 * quando dois logins rodavam juntos.
 */
function filtrarSessoes_(manter) {
  var sh = sessSheet_();
  var last = sh.getLastRow();
  if (last < 2) return;
  var n = SESS_HEADER.length;
  var v = sh.getRange(2, 1, last - 1, n).getDisplayValues();
  var fica = v.filter(manter);
  if (fica.length === v.length) return;
  sh.getRange(2, 1, v.length, n).clearContent();
  if (fica.length) sh.getRange(2, 1, fica.length, n).setValues(fica.map(function (r) { return r.map(txt_); }));
}

/** Tira as sessoes vencidas e guarda no maximo as 500 mais novas. Chamar com o lock. */
function limparSessoes_() {
  var agoraStr = iso_(agora_());
  filtrarSessoes_(function (r) { return String(r[3]) >= agoraStr; });
  var sh = sessSheet_();
  var sobra = sh.getLastRow() - 1 - 500;
  if (sobra > 0) {
    var cont = 0;
    filtrarSessoes_(function () { return ++cont > sobra; });
  }
}

/** Derruba todas as sessoes de um e-mail. Chamar com o lock (o saveUser_ ja segura). */
function apagarSessoes_(email) {
  var sh = sessSheet_();
  var last = sh.getLastRow();
  if (last < 2) return;
  var v = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
  try {
    var cache = CacheService.getScriptCache();
    for (var i = 0; i < v.length; i++) if (emailLimpo_(v[i][1]) === email) cache.remove('sess:' + String(v[i][0]));
  } catch (eC) {}
  filtrarSessoes_(function (r) { return emailLimpo_(r[1]) !== email; });
}

/** Tira do cache as sessoes de um e-mail (continuam validas, so releem o usuario). */
function esquecerSessoes_(email) {
  var sh = sessSheet_();
  var last = sh.getLastRow();
  if (last < 2) return;
  var v = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
  try {
    var cache = CacheService.getScriptCache();
    for (var i = 0; i < v.length; i++) if (emailLimpo_(v[i][1]) === email) cache.remove('sess:' + String(v[i][0]));
  } catch (eC) {}
}

function acesso_(d) {
  if (d.action === 'login')      return login_(d);
  if (d.action === 'logout')     return logout_(d);
  if (d.action === 'setupAdmin') return setupAdmin_(d);
  if (d.action === 'me') {
    var u = sessao_(d.token);
    return u ? { status: 'ok', usuario: u } : { status: 'error', code: 'auth', message: 'Sessao invalida ou vencida.' };
  }
  return { status: 'error', message: 'Acao desconhecida.' };
}

/** getData com login: admin recebe tudo; agente recebe so o que e dele. */
function getDataAuth_(p) {
  var u = sessao_(p.token);
  if (!u) return { status: 'error', code: 'auth', message: 'Faca login para ver o painel.' };
  var base = getData_(p);
  if (u.papel !== 'admin') restringe_(base, u, !!p.compact);
  base.usuario = u;
  base.reviews = listReviews_();
  base.reviewsOk = true;
  // falha da importacao do Review Desk: so o admin ve (e so ele pode tentar de novo)
  base.reviewsErro = u.papel === 'admin' ? (PropertiesService.getScriptProperties().getProperty('REVIEWS_IMPORT_ERRO') || '') : '';
  base.followUpDias = FOLLOW_UP_DIAS;
  base.equipeNomes = nomesEquipe_();
  return base;
}

/**
 * O que um agente pode ver: os proprios emails e as proprias tarefas. Metas,
 * qualidade, notas e ajustes saem da resposta — nao adianta esconder so na tela.
 */
function restringe_(base, u, compact) {
  var meu = String(u.agente || '').trim().toLowerCase();
  var ehMeu = function (nome) { return meu && String(nome || '').trim().toLowerCase() === meu; };
  base.rows = (base.rows || []).filter(function (r) { return ehMeu(compact ? r[2] : r.agente); });
  base.total = base.rows.length;
  base.tarefas = (base.tarefas || []).filter(function (t) { return ehMeu(t.agente); });
  // metas (v18): so a do proprio agente, a atual e o historico dela
  var minhas = {};
  Object.keys(base.metas || {}).forEach(function (k) { if (ehMeu(k)) minhas[k] = base.metas[k]; });
  base.metas = minhas;
  base.metasHist = (base.metasHist || []).filter(function (m) { return ehMeu(m.agente); });
  base.qualidade = []; base.notas = []; base.ajustes = 0;
  base.skipped = 0;
}

/* ============================================================
   REVIEWS DO TRUSTPILOT (v16): aba Reviews, cadastro pelo painel, follow up
   ============================================================ */

/** Nomes da equipe para o campo Responsavel (so nomes: nada de e-mail ou papel). */
function nomesEquipe_() {
  var vistos = {}, out = [];
  readUsers_().forEach(function (u) {
    var n = String(u.agente || u.nome || '').trim();
    if (u.ativo && n && !vistos[n.toLowerCase()]) { vistos[n.toLowerCase()] = true; out.push(n); }
  });
  return out.sort();
}

/** Carimbo com milissegundos: e a versao do review (duas edicoes no mesmo segundo nao se confundem). */
function isoMs_(d) { return iso_(d) + "." + ("00" + d.getMilliseconds()).slice(-3); }

function limpa_(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max); }
function simNao_(v) { var t = String(v === undefined || v === null ? '' : v).trim().toUpperCase(); return (v === true || t === 'TRUE' || t === 'SIM' || t === '1') ? 'SIM' : 'NAO'; }

/**
 * Link de um review do Trustpilot: www, pais (br., uk.) ou o app Business, sempre
 * com /reviews/ (o link do review em si, nao o da pagina da loja). Devolve o link
 * limpo (sem ?query e sem barra no fim) ou '' se nao for um.
 */
function linkTrustpilot_(v) {
  var m = String(v || '').trim().match(/^https?:[/][/]([^/?#]+)([/][^?#]*)?/i);
  if (!m) return '';
  var host = m[1].toLowerCase(), caminho = m[2] || '';
  if (!(host === 'trustpilot.com' || host.slice(-15) === '.trustpilot.com')) return '';
  if (caminho.toLowerCase().indexOf('/reviews/') !== 0 || caminho.length < 12) return '';
  return 'https://' + host + caminho.replace(/[/]+$/, '');
}
/** Chave para achar o mesmo review escrito de outro jeito (outro dominio, ?query, maiusculas). */
function chaveLink_(v) {
  var m = String(v || '').trim().match(/^https?:[/][/]([^/?#]+)([/][^?#]*)?/i);
  if (m && /trustpilot[.]com$/i.test(m[1])) return (m[2] || '').toLowerCase().replace(/[/]+$/, '');
  return String(v || '').trim().toLowerCase();
}

/** A aba Reviews; na primeira vez cria e traz o que ja existia no Review Desk. */
function garantirAbaReviews_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(REVIEW_SHEET);
  if (sh) {
    // aba criada numa versao anterior: acrescenta o cabecalho das colunas novas
    var n = sh.getLastColumn();
    if (n < REVIEW_HEADER.length) sh.getRange(1, n + 1, 1, REVIEW_HEADER.length - n).setValues([REVIEW_HEADER.slice(n)]);
    return sh;
  }
  return comLock_(function () {
    var sh2 = ss.getSheetByName(REVIEW_SHEET);   // outra execucao pode ter criado enquanto esperava
    if (sh2) return sh2;
    sh2 = ensureSheet_(REVIEW_SHEET, REVIEW_HEADER);
    importarReviewDesk_();
    return sh2;
  });
}

function linhasReviews_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, REVIEW_HEADER.length).getDisplayValues();
}

/** Uma linha da aba no formato do painel. */
function reviewObj_(r) {
  var tk = String(r[RV.ticket] || '');
  return {
    id: String(r[RV.id]), created_at: String(r[RV.criado]), updated_at: String(r[RV.atualizado]),
    created_by: String(r[RV.criadoPor]), updated_by: String(r[RV.atualizadoPor]),
    date: String(r[RV.data]), store: String(r[RV.loja]), stars: Number(r[RV.nota]) || 0,
    status: String(r[RV.status]), owner: String(r[RV.resp]), risk: String(r[RV.risco]).toUpperCase() === 'SIM',
    notes: String(r[RV.notas]), review_link: String(r[RV.link]), ticket: tk,
    ticket_link: /^https?:[/][/]/i.test(tk) ? tk : '',   // painel antigo (v15) so entende link
    status_since: String(r[RV.desde]), contacted_at: String(r[RV.contatado]),
    follow_up_at: String(r[RV.followEm]), follow_ups: Number(r[RV.follows]) || 0, origin: String(r[RV.origem])
  };
}

function listReviews_() {
  var v = linhasReviews_(garantirAbaReviews_());
  var out = [];
  for (var i = 0; i < v.length; i++) if (String(v[i][RV.id]).trim()) out.push(reviewObj_(v[i]));
  return out;
}

/** Confere e normaliza os campos de um review. Devolve {erro} ou {campos}. */
function camposReview_(d, parcial) {
  var c = {};
  var tem = function (k) { return !parcial || Object.prototype.hasOwnProperty.call(d, k); };
  if (tem('link')) {
    if (!String(d.link || '').trim()) return { erro: 'Cole o link do review no Trustpilot. Sem ele nao da para salvar.' };
    c.link = linkTrustpilot_(d.link);
    if (!c.link) return { erro: 'Esse link nao e de um review do Trustpilot. Abra o review e copie o link que tem /reviews/ no endereco.' };
  }
  if (tem('data')) {
    var dt = parseAny_(d.data);
    if (!dt) return { erro: 'Informe a data do review.' };
    var amanha = new Date(agora_().getTime() + 86400000);
    if (dt > amanha || dt.getFullYear() < 2015) return { erro: 'A data do review esta fora do esperado.' };
    c.data = ymd_(dt);
  }
  if (tem('loja')) { c.loja = limpa_(d.loja, 40); if (!c.loja) return { erro: 'Escolha a loja.' }; }
  if (tem('nota')) {
    c.nota = Number(d.nota);
    if (!(c.nota >= 1 && c.nota <= 5 && Math.round(c.nota) === c.nota)) return { erro: 'Escolha a nota, de 1 a 5 estrelas.' };
  }
  if (tem('status')) {
    c.status = limpa_(d.status, 20) || 'Investigando';
    if (REVIEW_STATUS.indexOf(c.status) < 0) return { erro: 'Status invalido.' };
  }
  if (tem('responsavel')) c.responsavel = limpa_(d.responsavel, 40);
  if (tem('risco')) c.risco = simNao_(d.risco);
  if (tem('notas')) c.notas = limpa_(d.notas, 2000);
  if (tem('ticket')) {
    c.ticket = limpa_(d.ticket, 300);
    if (/^https?:/i.test(c.ticket) && /[ ]/.test(c.ticket)) return { erro: 'O link do ticket tem espacos. Confira o endereco.' };
  }
  return { campos: c };
}

/** Outro review com o mesmo link (ignora o proprio, na edicao). */
function reviewRepetido_(linhas, link, menosId) {
  var k = chaveLink_(link);
  for (var i = 0; i < linhas.length; i++) {
    if (menosId && linhas[i][RV.id] === menosId) continue;
    if (chaveLink_(linhas[i][RV.link]) === k) return linhas[i];
  }
  return null;
}

function reviewAcao_(d) {
  var u = sessao_(d.token);
  if (!u) return { status: 'error', code: 'auth', message: 'Sessao vencida. Entre de novo.' };
  if ((d.action === 'delReview' || d.action === 'importReviews') && u.papel !== 'admin') {
    return { status: 'error', code: 'permissao', message: 'So o admin pode fazer isso.' };
  }
  // quem fez: o nome, nunca o e-mail (os agentes veem esse campo)
  var quem = String(u.nome || u.agente || 'sem nome');
  garantirAbaReviews_();   // fora do lock: a criacao da aba pega o lock sozinha
  if (d.action === 'addReview')     return comLock_(function () { return addReview_(d, u, quem); });
  if (d.action === 'updateReview')  return comLock_(function () { return updateReview_(d, quem); });
  if (d.action === 'delReview')     return comLock_(function () { return delReview_(d, quem); });
  if (d.action === 'importReviews') return comLock_(function () { return importarReviewDesk_(); });
  return { status: 'error', message: 'Acao desconhecida.' };
}

function addReview_(d, u, quem) {
  var r = camposReview_(d, false);
  if (r.erro) return { status: 'error', message: r.erro };
  var c = r.campos;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REVIEW_SHEET);
  var linhas = linhasReviews_(sh);
  // o mesmo pedido chegando de novo: ja esta gravado, responde ok sem duplicar
  var pedido = limpa_(d.id, 20);
  if (!ID_PAINEL_RE.test(pedido)) pedido = '';
  for (var i = 0; pedido && i < linhas.length; i++) {
    if (linhas[i][RV.id] !== pedido) continue;
    if (chaveLink_(linhas[i][RV.link]) === chaveLink_(c.link)) return { status: 'ok', review: reviewObj_(linhas[i]), jaGravado: true };
    pedido = '';
  }
  var dup = reviewRepetido_(linhas, c.link, '');
  if (dup) {
    return { status: 'error', code: 'repetido', id: dup[RV.id],
             message: 'Esse review ja foi cadastrado (' + dup[RV.loja] + ', ' + dup[RV.status] + (dup[RV.resp] ? ', com ' + dup[RV.resp] : '') + ').' };
  }
  var ids = {};
  linhas.forEach(function (l) { ids[l[RV.id]] = true; });
  var agora = agora_(), agoraIso = iso_(agora), id = pedido;
  while (!id || ids[id]) id = 'P-' + ymd_(agora).replace(/-/g, '').slice(2) + '-' + (10000 + Math.floor(Math.random() * 90000));

  var linha = new Array(REVIEW_HEADER.length);
  linha[RV.id] = id; linha[RV.criado] = agoraIso; linha[RV.atualizado] = isoMs_(agora);
  linha[RV.criadoPor] = quem; linha[RV.atualizadoPor] = quem;
  linha[RV.data] = c.data; linha[RV.loja] = c.loja; linha[RV.nota] = String(c.nota);
  linha[RV.status] = c.status;
  // "Sem responsavel" escolhido no painel e respeitado; sem o campo, fica quem cadastrou
  linha[RV.resp] = Object.prototype.hasOwnProperty.call(d, 'responsavel') ? c.responsavel : String(u.agente || u.nome || '');
  linha[RV.risco] = c.risco; linha[RV.notas] = c.notas; linha[RV.link] = c.link; linha[RV.ticket] = c.ticket;
  linha[RV.desde] = agoraIso;
  linha[RV.contatado] = c.status === 'Contatado' ? agoraIso : '';
  linha[RV.followEm] = c.status === 'Follow up' ? agoraIso : '';
  linha[RV.follows] = c.status === 'Follow up' ? '1' : '0';
  linha[RV.origem] = 'Painel'; linha[RV.anterior] = ''; linha[RV.op] = '';
  sh.appendRow(linha.map(txt_));
  return { status: 'ok', review: reviewObj_(linha) };
}

function updateReview_(d, quem) {
  var id = limpa_(d.id, 40);
  if (!id) return { status: 'error', message: 'Review sem ID.' };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REVIEW_SHEET);
  var linhas = linhasReviews_(sh);
  var idx = -1;
  for (var i = 0; i < linhas.length; i++) if (linhas[i][RV.id] === id) { idx = i; break; }
  if (idx < 0) return { status: 'error', code: 'sumiu', message: 'Esse review nao existe mais (pode ter sido excluido).' };
  var linha = linhas[idx].slice();
  var op = limpa_(d.op, 40);
  // o mesmo pedido chegando de novo (repeticao por GET): ja foi aplicado
  if (op && op === linha[RV.op]) return { status: 'ok', review: reviewObj_(linha), jaGravado: true };
  // duas pessoas editando o mesmo review: a segunda nao apaga a primeira sem ver
  if (d.versao && String(d.versao) !== linha[RV.atualizado]) {
    return { status: 'error', code: 'conflito', review: reviewObj_(linha),
             message: 'Alguem alterou esse review agora ha pouco. Abra de novo para ver a versao nova.' };
  }
  var agora = agora_(), agoraIso = iso_(agora);

  // Desfazer (v17): volta ao estado guardado antes da ultima troca de status.
  if (d.desfazer === true || String(d.desfazer) === 'true' || String(d.desfazer) === '1') {
    var ant = null;
    try { ant = JSON.parse(linha[RV.anterior] || 'null'); } catch (eA) {}
    if (!ant || !ant.s) return { status: 'error', code: 'nada', message: 'Nao ha o que desfazer nesse review.' };
    linha[RV.status] = ant.s; linha[RV.desde] = ant.d || ''; linha[RV.contatado] = ant.c || '';
    linha[RV.followEm] = ant.f || ''; linha[RV.follows] = String(ant.n || '0');
    linha[RV.anterior] = ''; linha[RV.op] = op;
    linha[RV.atualizado] = isoMs_(agora); linha[RV.atualizadoPor] = quem;
    sh.getRange(idx + 2, 1, 1, REVIEW_HEADER.length).setValues([linha.map(txt_)]);
    return { status: 'ok', review: reviewObj_(linha), desfeito: true };
  }
  var antes = JSON.stringify({ s: linha[RV.status], d: linha[RV.desde], c: linha[RV.contatado], f: linha[RV.followEm], n: linha[RV.follows] });

  var r = camposReview_(d, true);
  if (r.erro) return { status: 'error', message: r.erro };
  var c = r.campos;
  if (c.link) {
    // so confere repetido quando o link muda: os pares que vieram repetidos do
    // Review Desk continuam editaveis
    if (chaveLink_(c.link) !== chaveLink_(linha[RV.link])) {
      var dup = reviewRepetido_(linhas, c.link, id);
      if (dup) return { status: 'error', code: 'repetido', id: dup[RV.id], message: 'Esse link ja esta em outro review (' + dup[RV.loja] + ', ' + dup[RV.status] + ').' };
    }
    linha[RV.link] = c.link;
  }
  if (c.data !== undefined) linha[RV.data] = c.data;
  if (c.loja !== undefined) linha[RV.loja] = c.loja;
  if (c.nota !== undefined) linha[RV.nota] = String(c.nota);
  if (c.responsavel !== undefined) linha[RV.resp] = c.responsavel;
  if (c.risco !== undefined) linha[RV.risco] = c.risco;
  if (c.notas !== undefined) linha[RV.notas] = c.notas;
  if (c.ticket !== undefined) linha[RV.ticket] = c.ticket;

  var fez = d.followUp === true || String(d.followUp) === 'true' || String(d.followUp) === '1';
  var novo = fez ? 'Follow up' : (c.status !== undefined ? c.status : linha[RV.status]);
  var mudou = novo !== linha[RV.status];
  // guarda o estado de antes so para a troca de status; qualquer outra edicao esquece
  linha[RV.anterior] = (mudou || fez) ? antes : '';
  if (mudou || fez) linha[RV.desde] = agoraIso;
  if (novo === 'Contatado' && mudou) linha[RV.contatado] = agoraIso;
  if (novo === 'Follow up' && (mudou || fez)) {
    linha[RV.followEm] = agoraIso;
    linha[RV.follows] = String((Number(linha[RV.follows]) || 0) + 1);
  }
  linha[RV.status] = novo;
  linha[RV.op] = op;
  linha[RV.atualizado] = isoMs_(agora);
  linha[RV.atualizadoPor] = quem;
  sh.getRange(idx + 2, 1, 1, REVIEW_HEADER.length).setValues([linha.map(txt_)]);
  return { status: 'ok', review: reviewObj_(linha) };
}

function delReview_(d, quem) {
  var id = limpa_(d.id, 40);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REVIEW_SHEET);
  var linhas = linhasReviews_(sh);
  for (var i = 0; i < linhas.length; i++) {
    if (linhas[i][RV.id] !== id) continue;
    // guarda o ID: "Trazer do Review Desk" nao traz de volta o que foi excluido
    ensureSheet_(REVIEW_EXCL_SHEET, REVIEW_EXCL_HEADER).appendRow([id, linhas[i][RV.link], iso_(agora_()), quem].map(txt_));
    sh.deleteRow(i + 2);
    return { status: 'ok', apagado: id };
  }
  // ja nao existe (ex.: o mesmo pedido repetido depois de a exclusao dar certo)
  return { status: 'ok', apagado: '' };
}

/* ---------- Review Desk: de onde vieram os reviews antes do painel ---------- */

/** API do Review Desk (REVIEWS_API_URL + REVIEWS_SECRET) ou a planilha dele (REVIEWS_SHEET_ID). */
function fonteReviews_() {
  var pr = PropertiesService.getScriptProperties();
  var url = String(pr.getProperty('REVIEWS_API_URL') || '').trim();
  var seg = String(pr.getProperty('REVIEWS_SECRET') || '').trim();
  if (url && seg) return { tipo: 'api', url: url, segredo: seg };
  var id = String(pr.getProperty('REVIEWS_SHEET_ID') || '').trim();
  if (id) return { tipo: 'planilha', id: id };
  return null;
}

/**
 * Rode no editor para conferir a conexao com o Review Desk. Tambem reabre a tela
 * de autorizacao do Google se "Conectar a um servico externo" ficou desmarcado
 * (consentimento granular). Nao grava nada.
 */
function testarReviews() {
  var f = fonteReviews_();
  if (!f) throw new Error('Crie as propriedades REVIEWS_API_URL e REVIEWS_SECRET (ou REVIEWS_SHEET_ID).');
  if (f.tipo === 'api' && typeof ScriptApp.requireScopes === 'function') {
    ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/script.external_request']);
  }
  var brutos = f.tipo === 'api' ? reviewsDaApi_(f) : reviewsDaPlanilha_(f.id);
  Logger.log('Tudo certo (' + (f.tipo === 'api' ? 'API do Review Desk' : 'planilha') + '): ' + brutos.length + ' reviews encontrados.');
}

/**
 * Traz do Review Desk o que ainda nao esta na aba Reviews (pelo ID). Nao mexe no
 * que ja esta aqui. Chamar com o lock (comLock_ ou garantirAbaReviews_).
 */
function importarReviewDesk_() {
  var pr = PropertiesService.getScriptProperties();
  var f = fonteReviews_();
  if (!f) return { status: 'ok', importados: 0, jaExistiam: 0, repetidos: 0, excluidos: 0, aviso: 'Review Desk nao configurado.' };
  var brutos;
  try {
    brutos = f.tipo === 'api' ? reviewsDaApi_(f) : reviewsDaPlanilha_(f.id);
  } catch (e) {
    var msg = String((e && e.message) || e);
    pr.setProperty('REVIEWS_IMPORT_ERRO', msg);
    return { status: 'error', message: 'Nao consegui ler o Review Desk: ' + msg };
  }
  pr.deleteProperty('REVIEWS_IMPORT_ERRO');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(REVIEW_SHEET) || ensureSheet_(REVIEW_SHEET, REVIEW_HEADER);
  var ids = {}, links = {};
  linhasReviews_(sh).forEach(function (l) {
    ids[l[RV.id]] = 'aqui';
    if (String(l[RV.link] || '').trim()) links[chaveLink_(l[RV.link])] = true;
  });
  var excl = ss.getSheetByName(REVIEW_EXCL_SHEET);
  if (excl && excl.getLastRow() >= 2) {
    excl.getRange(2, 1, excl.getLastRow() - 1, 1).getDisplayValues().forEach(function (l) { if (!ids[l[0]]) ids[l[0]] = 'excluido'; });
  }
  var novas = [], ja = 0, repetidos = 0, excluidos = 0;
  for (var i = 0; i < brutos.length; i++) {
    var id = String(brutos[i].id === undefined || brutos[i].id === null ? '' : brutos[i].id).trim();
    if (!id) continue;
    if (ids[id] === 'excluido') { excluidos++; continue; }
    if (ids[id]) { ja++; continue; }
    // o mesmo review ja esta aqui com outro ID (cadastrado no painel ou numa importacao anterior).
    // So compara com o que ja estava na aba: repetidos dentro do proprio Review Desk entram
    // (e aparecem marcados), para nao perder o que foi anotado em cada um.
    var link = String(brutos[i].review_link || '').trim();
    if (link && links[chaveLink_(link)]) { repetidos++; continue; }
    ids[id] = 'novo';
    novas.push(linhaImportada_(brutos[i]).map(txt_));
  }
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, REVIEW_HEADER.length).setValues(novas);
  return { status: 'ok', importados: novas.length, jaExistiam: ja, repetidos: repetidos, excluidos: excluidos };
}

/** Datas do Review Desk: ISO em UTC ("...Z") ou texto da planilha. Devolve ISO local ou ''. */
function quandoRd_(v) {
  var t = String(v === undefined || v === null ? '' : v).trim();
  if (!t) return '';
  var d = t.charAt(t.length - 1) === 'Z' ? new Date(t) : parseAny_(t);
  return d && !isNaN(d.getTime()) ? iso_(d) : '';
}

function linhaImportada_(o) {
  var criado = quandoRd_(o.created_at) || iso_(agora_());
  var atual = quandoRd_(o.updated_at) || criado;
  var st = String(o.status || '').trim();
  if (REVIEW_STATUS.indexOf(st) < 0) st = 'Investigando';
  var dr = quandoRd_(o.review_date);
  var nota = Number(String(o.stars === undefined || o.stars === null ? '' : o.stars).replace(/[^0-9]/g, '')) || 0;
  var l = new Array(REVIEW_HEADER.length);
  l[RV.id] = String(o.id).trim(); l[RV.criado] = criado; l[RV.atualizado] = atual;
  l[RV.criadoPor] = 'Review Desk'; l[RV.atualizadoPor] = '';
  l[RV.data] = (dr || criado).slice(0, 10); l[RV.loja] = String(o.store || '').trim();
  l[RV.nota] = nota ? String(nota) : ''; l[RV.status] = st; l[RV.resp] = String(o.owner || '').trim();
  l[RV.risco] = simNao_(o.risk); l[RV.notas] = String(o.notes || '');
  l[RV.link] = String(o.review_link || '').trim(); l[RV.ticket] = String(o.ticket_link || '').trim();
  // o Review Desk nao guarda quando o status mudou: a ultima alteracao e a melhor pista
  l[RV.desde] = atual; l[RV.contatado] = st === 'Contatado' ? atual : '';
  l[RV.followEm] = ''; l[RV.follows] = '0'; l[RV.origem] = 'Review Desk'; l[RV.anterior] = '';
  return l;
}

/**
 * A mesma leitura que o site do Review Desk faz (GET ?action=list&secret=), mas
 * daqui, servidor a servidor: a senha nao passa pelo navegador de ninguem.
 */
function reviewsDaApi_(f) {
  var url = f.url + (f.url.indexOf('?') > -1 ? '&' : '?') + 'action=list&secret=' + encodeURIComponent(f.segredo);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = resp.getResponseCode();
  if (code !== 200) throw new Error('a API do Review Desk respondeu HTTP ' + code + ' (confira REVIEWS_API_URL)');
  var j;
  try { j = JSON.parse(resp.getContentText()); } catch (eJ) { throw new Error('a API do Review Desk nao devolveu JSON (confira REVIEWS_API_URL)'); }
  if (!j || j.ok !== true) {
    throw new Error(j && j.error === 'unauthorized'
      ? 'REVIEWS_SECRET nao confere com o SHARED_SECRET do Review Desk'
      : 'a API do Review Desk devolveu erro: ' + (j && j.error));
  }
  return j.rows || [];
}

/** Aba Reviews do Review Desk lida direto (precisa de acesso a planilha). */
function reviewsDaPlanilha_(id) {
  var sh = SpreadsheetApp.openById(id).getSheetByName('Reviews');
  if (!sh) throw new Error('a planilha do Review Desk nao tem a aba "Reviews"');
  if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  return v.slice(1).map(function (row) {
    var o = {};
    h.forEach(function (k, i) { o[k] = row[i]; });
    return o;
  });
}

/* ============================================================
   LEITURA (API do dashboard)
   ============================================================ */

function getData_(p) {
  var sheet = getSheet_();
  var last  = sheet.getLastRow();
  var tz    = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || TZ;
  var out = [], skipped = 0, qual = {};

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

      // Resumo de onde o agente estava ao contar. Os tickets em si nao saem daqui.
      var tk = String(dr[7] || '').trim();
      if (tk) {
        var qk = ymd_(dt) + '|' + agente;
        var q = qual[qk] || (qual[qk] = { ticket: 0, fora: 0, outras: 0, vistos: {}, repetidos: 0, repetidos1min: 0, lojaDiferente: 0, recusadas: 0 });
        if (tk === 'fora') q.fora++;
        else {
          q.ticket++;
          if (q.vistos[tk]) q.repetidos++;
          q.vistos[tk] = (q.vistos[tk] || 0) + 1;
          var lj = lojaDoTicket_(tk);
          if (lj && lj !== loja) q.lojaDiferente++;
        }
        var sit = String(dr[8] || '').trim();
        if (sit === 'repetido') q.repetidos1min++;
        // Fechamento de conversa paralela: ja foi contado como ticket acima;
        // aqui so fica registrado quantos dos tickets foram desses.
        if (sit === 'outra') q.outras++;
      }

      out.push({
        data:     ymd_(dt),
        hora:     hm_(dt),
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

  // sessoes do Contador de Tarefas (v14), na mesma janela do "since"
  var tarefas = [];
  try {
    var sinceT = p.since ? parseAny_(p.since) : null;
    tarefas = listTarefas_(sinceT ? ymd_(sinceT) : '');
  } catch (eTa) {}

  // recusas do modo bloquear (aba Tentativas) entram no mesmo resumo
  try {
    var ts = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENT_SHEET);
    if (ts && ts.getLastRow() >= 2) {
      var tv = ts.getRange(2, 1, ts.getLastRow() - 1, TENT_HEADER.length).getDisplayValues();
      for (var ti = 0; ti < tv.length; ti++) {
        var td = parseAny_(tv[ti][2]) || parseAny_(tv[ti][0]);
        var ta = String(tv[ti][1] || '').trim();
        if (!td || !ta) continue;
        var tkk = ymd_(td) + '|' + ta;
        var tq = qual[tkk] || (qual[tkk] = { ticket: 0, fora: 0, outras: 0, vistos: {}, repetidos: 0, repetidos1min: 0, lojaDiferente: 0, recusadas: 0 });
        tq.recusadas++;
      }
    }
  } catch (eT) {}

  // So entram os dias em que o contador novo ja estava rodando para o agente.
  var qualidade = Object.keys(qual).sort().map(function (k) {
    var p = k.split('|'), q = qual[k];
    // Os tickets contados mais de uma vez no dia, para dar para conferir no
    // helpdesk. E so o codigo (conta, caixa, numero) — nada do cliente. Os
    // demais tickets continuam sem sair daqui.
    var reps = [];
    for (var t in q.vistos) if (q.vistos[t] > 1) reps.push({ t: t, n: q.vistos[t] });
    reps.sort(function (a, b) { return b.n - a.n; });
    if (reps.length > 80) reps = reps.slice(0, 80);
    return { data: p[0], agente: p[1], ticket: q.ticket, fora: q.fora, outras: q.outras,
             repetidos: q.repetidos, repetidos1min: q.repetidos1min,
             lojaDiferente: q.lojaDiferente, recusadas: q.recusadas, repetidosLista: reps };
  });

  var base = {
    status: 'ok', total: out.length, skipped: skipped, ajustes: aplicados,
    metas: listMetas_(), metasHist: listMetasHist_(), notas: notas, qualidade: qualidade,
    tarefas: tarefas, tz: tz, generatedAt: nowStr_(), version: 19
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

/* Rapidos, sem Utilities.formatDate (ver DESEMPENHO no cabecalho). So para datas
   montadas por parseAny_/build_, que ja estao no fuso do script. */
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymd_(d)  { return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()); }
function hm_(d)   { return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes()); }
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
  Logger.log('1. Planilha: %s | fuso: %s | fuso do script: %s (precisa ser %s)', ss.getName(), ss.getSpreadsheetTimeZone(), Session.getScriptTimeZone(), TZ);

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
  Logger.log('Sessoes de tarefas: %s', (r.tarefas || []).length);
  if (r.total) {
    Logger.log('Primeira: %s', JSON.stringify(r.rows[0]));
    Logger.log('Ultima:   %s', JSON.stringify(r.rows[r.total - 1]));
  }
}
