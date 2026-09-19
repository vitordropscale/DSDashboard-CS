# CS Dashboard — Email Counter

Painel de KPIs de atendimento por e-mail das operações Lumvelle, Elevare, Koda,
Old Harvest, Vigewell, Vellum e Stratum.
Página estática, sem build, publicada pelo GitHub Pages.

## Como funciona

```
Script AHK (máquina do agente)
        │  HTTP GET  ?agente=&contador=&loja=&ticket=
        ▼
Google Apps Script  ──►  Google Sheets (abas Logs / Ajustes / Metas)
        │  GET ?action=getData
        ▼
index.html (GitHub Pages)
```

Um script AutoHotkey roda na máquina de cada agente e conta os e-mails respondidos.
Cada contagem vira uma linha na planilha. O dashboard lê a API e calcula tudo no
navegador — não há servidor nem build.

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

## Senha

As ações de escrita de **ajustes** e **notas** exigem senha, guardada em
**Configurações do projeto › Propriedades do script**, chave `ADMIN_TOKEN`.
Nunca no código, nunca neste repositório.

As **metas** não pedem senha a partir do Apps Script v9. Quem abrir o dashboard
publicado consegue alterá-las. Com um Apps Script mais antigo, o painel de metas
continua pedindo a senha, porque a gravação ainda é recusada sem ela.

A leitura (`?action=getData`) é aberta. A URL da API é montada em tempo de execução
em vez de aparecer literal no código — isso evita coleta automática por scanners que
varrem repositórios públicos, mas **não é segurança**: quem abrir o DevTools no site
publicado vê a URL. Os dados expostos são volume de e-mail por agente, dia e loja.

## Notas de implementação

- **Datas**: a leitura usa `getDisplayValues()` da planilha, não `getValues()`.
  Passar as células por `new Date()` devolvia epoch 0 e horas como serial de 1899.
- **Fuso**: normalizado para `America/Sao_Paulo` no Apps Script; o dashboard recebe
  `data` como `yyyy-MM-dd` e `hora` como `HH:mm`, ambos texto puro.
- **Payload**: `?compact=1` devolve formato colunar, cerca de 5x menor.
- **Contagens suspeitas**: o painel sinaliza minutos com 10+ e-mails do mesmo agente,
  padrão típico de contagem acidental. As referências de meta descontam esse excesso.
- **Ticket na contagem (modo observação)**: o contador v5.1 lê o endereço da aba da frente
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
