# CS Dashboard — Email Counter

Painel de KPIs de atendimento por e-mail das operações Lumvelle, Elevare, Old Harvest,
Vigewell, Vellum, Stratum, Nouveian e Old World Healing. A Koda saiu de operação em 21/09/2026:
fica em `APOSENTADAS`, fora das metas, colunas e report, mas ainda reconhecida nos registros antigos.
Página estática, sem build, publicada pelo GitHub Pages.

## Como funciona

```
Script AHK (máquina do agente)
        │  HTTP GET  ?agente=&contador=&loja=&ticket=
        ▼
Google Apps Script  ──►  Google Sheets (abas Logs / Ajustes / Metas / Tarefas / Usuarios / Sessoes)
        │  GET ?action=getData&token=SESSAO      ◄── planilha do Review Desk (aba Reviews)
        ▼
index.html (GitHub Pages, com login)
```

Um script AutoHotkey roda na máquina de cada agente e conta os e-mails respondidos.
Cada contagem vira uma linha na planilha. O dashboard lê a API e calcula tudo no
navegador — não há servidor nem build.

Um segundo widget, o **Contador de Tarefas** (`ContadorTarefas.ahk`, na pasta de cada
agente), conta tarefas avulsas: o agente digita o nome da tarefa, escolhe a loja e digita
o horário de início; conta +1 com Ctrl+Espaço (só com tarefa aberta); ao finalizar digita
o fim e os minutos de pausa. Cada tarefa finalizada vira uma linha na aba **Tarefas**
(`?action=addTarefa`, Apps Script v14) e aparece na tela **Tarefas** do painel. O widget
manda o agente em `quem`, nunca em `agente`: numa implantação antiga, `agente` cairia no
gravador de e-mails. Sem a v14, a tarefa fica na fila da máquina (`pendentes.txt`) e vai
sozinha depois; o mesmo id não é gravado duas vezes.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O dashboard inteiro: HTML, CSS e JS num arquivo só. |
| `AppsScript.gs` | Código do Google Apps Script. Referência e backup — não é implantado daqui. |

## Adicionando uma loja

Tudo no painel — filtros, colunas da tabela, gráficos, metas por loja, correções,
notas, CSV e o report — é gerado a partir de três listas no topo do bloco de
configuração do `index.html`. Para incluir uma loja nova, edite só estas três
listas:

1. `STORES` — todas as lojas, incluindo `"Sem loja"`, que fica sempre por último.
2. `LOJAS` — as lojas reais, sem `"Sem loja"`. Define a ordem em que aparecem.
3. `STORE_COLOR` — a cor da loja. Aparece como um pontinho no filtro e nas metas, e
   como a cor da série nos gráficos.

A ordem das lojas e as cores andam juntas: cada loja fica ao lado de uma cor que
continua distinguível para quem tem daltonismo. Acrescente a loja nova **no fim** e
escolha uma cor que não seja vizinha da anterior (laranja ao lado de amarelo, por
exemplo, não passa). Vermelho fica de fora: no painel ele só indica estado crítico.

O Apps Script não precisa de alteração: ele grava o valor de `loja` que chegar,
sem lista fixa. O que precisa mudar é o **script AHK na máquina dos agentes**, que
é quem manda `?loja=`. Enquanto ele não for atualizado, a loja nova aparece no
filtro e nas metas, mas sem registros.

Nomes chegam normalizados por `canonStore()`, que ignora maiúsculas. Grafias
realmente diferentes (espaço, hífen, underscore) entram em `STORE_ALIAS`.

## Publicação

GitHub Pages, servindo a raiz da branch `main`. Qualquer commit no `index.html`
republica em poucos minutos, sem configuração adicional.

## Atualizando o Apps Script

O `AppsScript.gs` deste repositório é backup. Para alterar de verdade:

1. Colar o conteúdo no editor do Apps Script da planilha e salvar
2. Implantar › Gerenciar implantações › lápis › Versão: **Nova versão** › Implantar
3. Repetir em **todas** as implantações ativas — existem várias, e cada uma fica presa
   à versão em que foi publicada. Atualizar só uma deixa o resto rodando código antigo.

## Acessos (Apps Script v15)

O painel exige login com e-mail e senha. Cada pessoa é uma linha na aba **Usuarios**
(senha guardada como hash com salt, nunca em texto). O login cria um token de sessão
(aba **Sessoes**, 14 horas) que vai em todas as chamadas.

| Papel | Vê | Não vê |
|---|---|---|
| admin | tudo, mais a tela **Equipe** (criar, editar, desativar, redefinir senha) | — |
| agente | Visão geral, Tarefas e Trustpilot, só com as **próprias** contagens e tarefas; todos os reviews | metas, horários, agentes, qualidade, notas, ajustes, report, CSV |

O corte é feito no Apps Script: para um agente, o `getData` já sai sem as linhas dos
outros e sem metas, qualidade, notas e ajustes. Esconder na tela sozinho não bastaria.
O campo **Nome no contador** liga a pessoa às contagens: tem que ser igual ao
`AGENT_NAME` do contador dela.

**Primeiro admin**: abra o painel, digite e-mail e senha; com a aba Usuarios vazia,
aparece "Primeiro acesso", que pede a senha do Apps Script (`ADMIN_TOKEN`). Alternativa:
`criarAdmin()` no editor. Só funciona enquanto não existe nenhum usuário.

**Trustpilot**: os reviews vêm da aba **Reviews** da planilha do Review Desk. O ID dessa
planilha fica na propriedade do script `REVIEWS_SHEET_ID` (Configurações do projeto ›
Propriedades do script). Sem ela, o painel mostra o aviso no lugar dos reviews.

**As duas implantações vão juntas para a v15.** O `getData` existe na implantação do
painel e na dos contadores (a URL que está nos `.ahk`). Se a dos contadores ficar numa
versão antiga, qualquer agente lê tudo por ela. Conferir as duas com `?action=ping`: a
resposta tem que trazer `"version": 15`.

**Transição**: enquanto o Apps Script no ar for anterior à v15, o painel pergunta a versão
(`?action=ping`) e funciona como antes, sem login e sem a tela Equipe. Se a implantação
voltar para uma versão antiga com alguém logado, o painel larga a sessão e volta a esse
modo. Ação nova (login, Equipe) nunca é mandada para uma API antiga: lá ela cairia no
gravador de contagens e viraria uma linha falsa na aba Logs.

**Travas**: depois de 8 senhas erradas para o mesmo e-mail em 15 minutos, cada tentativa
espera até 5 s antes de responder. A senha certa sempre entra, para ninguém conseguir
trancar o admin do lado de fora. Desativar direto na planilha aceita NAO, Não, FALSE, 0
ou caixa desmarcada, mas pode levar até 10 minutos (cache das sessões); pela tela Equipe
vale na hora.

O contador de e-mails (`?agente=…`) e o de tarefas (`?action=addTarefa`) continuam sem login.

## Senha do Apps Script

`ADMIN_TOKEN`, em **Configurações do projeto › Propriedades do script**. Nunca no
código, nunca neste repositório. Continua valendo nas ações protegidas (ajustes, notas,
metas, equipe) e serve para criar o primeiro admin, então **vale como admin total**: se
ela já foi compartilhada, troque antes de implantar a v15. 20 erros em 15 minutos
bloqueiam essa senha por 15 minutos; as sessões de admin continuam funcionando.

Com login, a sessão de um admin substitui a senha: o painel não pede mais senha para quem
entrou como admin. Depois de criar o primeiro admin, dá para apagar a propriedade.

A URL da API é montada em tempo de execução em vez de aparecer literal no código. Isso
evita coleta automática, mas **não é segurança**: a proteção dos dados é o login.

## Notas de implementação

- **Datas**: a leitura usa `getDisplayValues()` da planilha, não `getValues()`.
  Passar as células por `new Date()` devolvia epoch 0 e horas como serial de 1899.
- **Fuso**: normalizado para `America/Sao_Paulo` no Apps Script; o dashboard recebe
  `data` como `yyyy-MM-dd` e `hora` como `HH:mm`, ambos texto puro.
- **Payload**: `?compact=1` devolve formato colunar, cerca de 5x menor.
- **Contagens suspeitas**: o painel sinaliza minutos com 10+ e-mails do mesmo agente,
  padrão típico de contagem acidental. As referências de meta descontam esse excesso.
- **Ticket na contagem**: o contador v6 tem `MODO := "observar"` (conta sempre, anota a situação:
  em ticket, fora, sem leitura, repetido em 1 min) ou `"bloquear"` (só conta com ticket aberto e recusa
  o mesmo ticket em 1 min; recusas vão para a aba Tentativas, sem virar e-mail). O Apps Script v11
  traduz a caixa do Commslayer em loja (`INBOX_LOJA`) e conta quando a loja do widget não bate.
  Começamos em observar. O contador v5.1 lê o endereço da aba da frente
  pela acessibilidade do Windows — só leitura, sem tecla nem área de transferência, porque
  dispara no instante em que o agente envia o e-mail. Manda só um código (`cs:conta:caixa:ticket`,
  `rp:ticket` ou `fora`), gravado na coluna H da aba Logs pelo Apps Script v10. A API aberta
  devolve apenas o resumo por agente e dia (`qualidade`), nunca os tickets. Nada é bloqueado.
  Próximo passo: cruzar esses tickets com os fechamentos que o projeto do CS Reporting já
  recebe dos helpdesks (tabela `helpdesk_events`), já que no Commslayer o login é compartilhado
  e a API não sabe quem fechou.
- **Metas**: guardadas com data de vigência, então alterar a meta hoje não reescreve
  o atingimento dos dias anteriores.
- **Gravações na hora**: ao salvar metas ou ajustes, o painel aplica a mudança na tela
  antes de a API confirmar, e desfaz se ela recusar. Antes ele esperava gravar e baixar
  a base inteira de novo (~20s). Desfazer um ajuste ainda depende dessa recarga.
