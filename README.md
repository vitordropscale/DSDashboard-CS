# CS Dashboard — Email Counter

Painel de KPIs de atendimento por e-mail das operações Lumvelle, Elevare e Koda.
Página estática, sem build, publicada pelo GitHub Pages.

## Como funciona

```
Script AHK (máquina do agente)
        │  HTTP GET  ?agente=&contador=&loja=
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

As ações de escrita (ajustes e metas) exigem senha, guardada em
**Configurações do projeto › Propriedades do script**, chave `ADMIN_TOKEN`.
Nunca no código, nunca neste repositório.

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
- **Metas**: guardadas com data de vigência, então alterar a meta hoje não reescreve
  o atingimento dos dias anteriores.
