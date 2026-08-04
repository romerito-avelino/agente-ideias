# CLAUDE.md — agente-ideias

## Leitura obrigatória antes de qualquer ação
Leia primeiro: F:\1-YOUTUBE\cerebro\CEREBRO.md
Este arquivo contém as regras universais do estúdio que este agente também segue.

## Papel deste agente na Mente Colmeia
Este agente é a FONTE DE VERDADE do estúdio.
Tudo que diz respeito a canais, avatares, histórico e aprendizado nasce aqui.
Os outros agentes (roteiros, thumbs, edições) consultam os dados daqui — nunca duplicam.

## Project

**agente-ideias** — Agente de mineração e geração de ideias para YouTube.

Stack: Node.js + Express (porta 3001) + Claude API (claude-opus-4-5) + YouTube Data API v3.

Estrutura /src (motores renomeados na reorganização):
- pesquisa.js (antigo agente-minerador.js) — descoberta/mineração de canais no YouTube
- canais.js (antigo agente-sessao-a.js) — análise, validação e gerenciamento de canais
- ideias.js (antigo agente-ideias.js) — geração de ideias e conteúdo
- coletor-youtube.js — ferramenta compartilhada de coleta da YouTube API
- gerador-pacote.js — ferramenta compartilhada de exportação do pacote .docx
- server.js — servidor Express que conecta tudo

Estrutura /public: apenas index.html (app.js e style.css foram removidos por serem órfãos).
Estrutura /data/nichos (JSONs por canal), /pacotes.
Em produção — v1.3 estável. NÃO remova nem reorganize arquivos sem instrução explícita.

## Rotas da API

**Pesquisa** — descoberta de canais
- POST /api/pesquisa

**Canais** — gerenciamento completo de canais
- GET /api/canais
- GET / PUT / DELETE /api/canais/:nichoId
- GET /api/canais/:nichoId/historico
- GET /api/canais/:nichoId/estrategia
- GET /api/canais/:nichoId/videos-publicados
- POST /api/canais/:nichoId/titulo-funcionou
- POST /api/canais/criar
- POST /api/canais/:nichoId/analisar
- POST /api/canais/:nichoId/revisar

**Ideias** — geração e exportação
- POST /api/ideias/gerar
- POST /api/ideias/gerar-pacote

## Divisão de responsabilidades por aba

- **Aba Pesquisa** — apenas descoberta de canais. Sem seletor de canal.
- **Aba Canais** (internamente "validacao") — todo o gerenciamento: criar, validar, editar banco de dados, ver estratégia, deletar. Os modais de edição e de estratégia pertencem a esta aba.
- **Aba Ideias** (internamente "videos") — apenas produção: seleciona um canal já cadastrado, gera ideias e exporta o pacote. O modal de "voz do criador" pertence a esta aba.

## Observação sobre vocabulário
O parâmetro de URL e as variáveis internas ainda usam o termo "nicho" (ex: :nichoId, pasta src/data/nichos/), embora conceitualmente signifiquem "canal". A limpeza desse vocabulário está planejada para uma etapa futura.

## Fonte de verdade — JSONs dos canais
Cada canal tem um JSON em: src/data/nichos/[canal-id].json
Campos que TODOS os agentes do estúdio consultam:
- canal, nicho, avatar (nome, idade, personalidade, jeitoDeFalar, historia)
- publicoAlvo (faixaEtaria, perfil, dores, desejos)
- tom.permitido / tom.proibido
- formatoDeVideo (duracaoIdeal, estiloDeNarracao)
- gatilhosQueConvertem, temasProibidos, palavrasQueEngajam
- edutainment (extracoesQueEngajam, dadosEstatisticasDoNicho, reflexoesRecorrentes)
- videosPublicados[] — registro automático a cada exportação de pacote
- estruturasDeTitulos.funcionais — padrões vencedores
- identidadeSemantica — como o algoritmo enxerga o canal
- estrategia — proposta, gap, guia de implementação

## Auto-registro no cérebro
Quando um canal é criado ou deletado via API, o server.js atualiza automaticamente
F:\1-YOUTUBE\cerebro\config.json — nenhuma ação manual necessária.

## SISTEMA DE CICLO DE PUBLICAÇÃO — v1.3

### Princípio central
O agente equilibra dois objetivos: respeitar o algoritmo do YouTube (variedade de formatos) e respeitar a identidade do canal. O banco de dados do canal é a fonte de verdade absoluta — sempre tem prioridade sobre qualquer regra genérica.

### O que foi implementado

**Registro automático de vídeos exportados (server.js)**
- A cada exportação de pacote .docx, o vídeo é registrado automaticamente em nicho.videosPublicados[]
- Campos: id, titulo, estrutura (80 chars), sinopse (120 chars), gatilhos, dataExportacao, dataPublicacao (null)
- O registro usa try/catch separado — erro no registro nunca quebra o download
- Rota: GET /api/canais/:nichoId/videos-publicados (retorna array invertido)

**Ciclo inteligente de frameworks (ideias.js)**
- Função analisarCicloAtual(nicho) lê os últimos 3 vídeos publicados
- Identifica o framework usado em cada título via palavras-chave
- Calcula deveRepetirVencedor: true se o padrão vencedor sumiu dos últimos 2 vídeos
- Retorna proximoFrameworkSugerido para guiar o agente

### Os 6 Frameworks de Título
1. confissao-temporal — "Eu tinha [contexto] quando [descoberta/erro]..."
2. consequencia-revelada — "O [decisão/erro] que [transforma/cobra] mais tarde..."
3. enderecamento-direto — "Por que [perfil do público] [situação]..."
4. revelacao-segredo — "O que ninguém te conta sobre [tema]..."
5. virada-narrativa — "Eu [perdi/errei/caí]. E foi [consequência inesperada]..."
6. gatilho-identidade — "Se você [perfil] e faz [ação], [consequência]..."

**Regras:** nunca repetir o mesmo framework do último vídeo. Os 3 títulos gerados numa sessão usam 3 frameworks diferentes entre si.

### As 3 Estruturas de Roteiro em Ciclo
- Estrutura A — Linear Confessional (padrão até 6 vídeos)
- Estrutura B — Revelação Progressiva (audiência fidelizada)
- Estrutura C — Comparação de Realidades (temas com forte contraste)

### Edutainment obrigatório (v1.3)
Ficção pura proibida — toda ideia tem extração de valor declarada.
4 tipos válidos: reflexao, ensinamento, dado, pergunta-provocadora.
Teste dos 2 minutos: se o espectador sair cedo, já levou algo de valor?

### Próximas melhorias planejadas
- Score de originalidade: comparar ideia nova com vídeos já publicados
- Aba de aprendizado pós-postagem: views 48h, CTR, padrão de comentários
- Campo dataPublicacao em videosPublicados: preenchimento manual
