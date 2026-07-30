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

Stack: Node.js + Express + Claude API (claude-opus-4-5) + YouTube Data API v3.
Estrutura: /src (server.js, agente-ideias.js, agente-sessao-a.js, coletor-youtube.js, gerador-pacote.js), /public (index.html), /data/nichos (JSONs por canal), /pacotes
Em produção — v1.3 estável. NÃO remova nem reorganize arquivos sem instrução explícita.

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
- Rota: GET /api/nicho/:nichoId/videos-publicados (retorna array invertido)

**Ciclo inteligente de frameworks (agente-ideias.js)**
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
