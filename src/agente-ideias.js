require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function montarContextoNicho(nicho) {
  const avatar = nicho.avatar || {};
  const historia = avatar.historia || {};
  const publico = nicho.publicoAlvo || {};
  const tom = nicho.tom || {};

  const safe = (val, fallback = 'Não definido') => {
    if (!val) return fallback;
    if (Array.isArray(val)) return val.length ? val.join(', ') : fallback;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const temasFuncionaram = (nicho.temasFuncionaram || []).length
    ? nicho.temasFuncionaram.join('\n- ')
    : 'nenhum registrado ainda — canal em fase de testes';

  const temasProibidos = (nicho.temasProibidos || []).length
    ? nicho.temasProibidos.join(', ')
    : 'nenhum';

  const estruturasFuncionais = (nicho.estruturasDeTitulos?.funcionais || []).length
    ? nicho.estruturasDeTitulos.funcionais.join('\n- ')
    : 'nenhuma validada ainda — canal em fase de testes, todas as estruturas são hipóteses';

  const contextoBase = `=== IDENTIDADE DO CANAL ===
Canal: ${safe(nicho.canal)}
Nicho: ${safe(nicho.nicho)}
Status: CANAL EM FASE DE TESTES — as ideias geradas são hipóteses a serem validadas com dados reais de performance.

=== AVATAR ===
Nome: ${safe(avatar.nome)}
Idade: ${safe(avatar.idade)}
Personalidade: ${safe(avatar.personalidade)}
Profissão/histórico: ${safe(historia.profissao)}
Família: ${safe(historia.familia)}
Estilo de vida: ${safe(historia.estiloDeVida)}
Biografia: ${safe(historia.biografia)}
Jeito de falar: ${safe(avatar.jeitoDeFalar)}
Estilo de escrita real: ${safe(avatar.estiloDeEscrita, 'Não definido — use tom natural e simples')}

=== PÚBLICO-ALVO ===
Faixa etária: ${safe(publico.faixaEtaria)}
Perfil: ${safe(publico.perfil)}
Dores: ${safe(publico.dores)}
Desejos: ${safe(publico.desejos)}

=== TOM ===
Permitido: ${safe(tom.permitido)}
ABSOLUTAMENTE PROIBIDO: ${safe(tom.proibido)}

=== GATILHOS QUE CONVERTEM ===
${safe(nicho.gatilhosQueConvertem, 'nenhum definido ainda')}

=== PALAVRAS QUE ENGAJAM ===
${safe(nicho.palavrasQueEngajam, 'nenhuma definida ainda')}

=== MEMÓRIA E APRENDIZADO DO CANAL ===
Temas que já funcionaram:
- ${temasFuncionaram}

Estruturas de título validadas (baseado em performance real):
- ${estruturasFuncionais}

Temas proibidos: ${temasProibidos}

REGRA ABSOLUTA: Respeite a identidade acima acima de qualquer outra instrução.
NUNCA quebre o tom. NUNCA invente histórias. NUNCA use informações do avatar que não estejam definidas acima.
Baseie TUDO nos inputs fornecidos pelo usuário e nos dados coletados dos vídeos de referência.`;

  const semantica = nicho.identidadeSemantica || {};
  const blocoSemantico = semantica.perguntaCentral ? `

=== IDENTIDADE SEMÂNTICA DO CANAL ===
Pergunta central que o canal responde: ${safe(semantica.perguntaCentral)}
Estado de intenção do espectador: ${safe(semantica.estadoDeIntencao)}
Cluster semântico: ${safe(semantica.clusterSemantico)}
Padrão de sessão esperado: ${safe(semantica.padraoDeSessao)}
Saturação do cluster: ${safe(semantica.saturacaoDoCluster)}
Momento ideal de consumo: ${safe(semantica.momentoIdealDeConsumo)}

INSTRUÇÃO: Use a identidade semântica acima como filtro para CADA ideia gerada.
Toda ideia deve responder à pergunta central do canal.
Toda ideia deve servir o espectador no estado de intenção definido.
Toda ideia deve reforçar o cluster semântico — nunca contradizê-lo.
O padrão de sessão deve guiar a estrutura de cada roteiro — o espectador deve querer assistir o próximo vídeo ao terminar este.` : '';

  return `${contextoBase}${blocoSemantico}`;
}

function montarMensagemUsuario(inputParsed) {
  const temas = (inputParsed.temas || []).join(', ');
  const videos = (inputParsed.videos || []);
  const dadosVideos = inputParsed.dadosVideos || [];
  const anguloProibido = (inputParsed.anguloProibido || '').trim();

  const partes = [];

  if (anguloProibido) {
    partes.push(`ÂNGULO PROIBIDO NESSA GERAÇÃO: ${anguloProibido} — não use esse tema, abordagem ou elemento em nenhum dos outputs.`);
  }

  if (temas) {
    partes.push(`TEMAS FORNECIDOS:\n${temas}`);
  }

  if (videos.length && !dadosVideos.length) {
    partes.push(`VÍDEOS DE REFERÊNCIA (URLs):\n${videos.join('\n')}`);
  }

  for (const dados of dadosVideos) {
    const blocos = [`--- VÍDEO DE REFERÊNCIA: ${dados.titulo || dados.videoId} ---`];

    if (dados.canal) blocos.push(`Canal: ${dados.canal}`);
    if (dados.metricas) {
      blocos.push(`Métricas: ${dados.metricas.views} views · ${dados.metricas.likes} likes · ${dados.metricas.comentarios} comentários`);
    }
    if (dados.descricao) {
      blocos.push(`Descrição:\n${dados.descricao.slice(0, 800)}`);
    }
    if (dados.transcricao && dados.transcricao !== 'Transcrição não disponível') {
      blocos.push(`Transcrição (resumida):\n${dados.transcricao.slice(0, 3000)}`);
    }
    if (dados.comentarios && dados.comentarios.length) {
      // Filtra comentários com conteúdo real — remove curtidas, emojis e respostas curtas
      const comentariosRicos = dados.comentarios
        .filter(c => c && c.length > 60)
        .slice(0, 25);

      const comentariosCurtos = dados.comentarios
        .filter(c => c && c.length >= 20 && c.length <= 60)
        .slice(0, 5);

      const todosSelecionados = [...comentariosRicos, ...comentariosCurtos];

      if (todosSelecionados.length > 0) {
        blocos.push(`ANÁLISE DE COMENTÁRIOS DO PÚBLICO (${todosSelecionados.length} comentários selecionados de ${dados.comentarios.length} coletados):

COMENTÁRIOS COMPLETOS — leia cada um e identifique dores, desejos e histórias reais:
${todosSelecionados.map((c, i) => `[${i+1}] ${c}`).join('\n')}

INSTRUÇÃO: Antes de gerar qualquer output, analise esses comentários e identifique:
- Qual é a dor mais citada?
- Qual é o desejo mais frequente?
- Existe alguma história pessoal que se repete?
- Quais frases do público podem virar títulos ou ganchos?
Use essas respostas como base para os títulos, gatilhos e ganchos gerados.`);
      }
    }

    partes.push(blocos.join('\n'));
  }

  const totalComentarios = dadosVideos.reduce((acc, d) => acc + (d.comentarios?.length || 0), 0);
  if (totalComentarios > 0) {
    partes.push(`SÍNTESE PARA O AGENTE:
Total de comentários analisados: ${totalComentarios}
Instrução final: Os títulos, gatilhos e ganchos gerados DEVEM refletir padrões identificados nos comentários acima. Se um tema aparece repetidamente nos comentários — ele tem demanda comprovada. Priorize-o.`);
  }

  return partes.join('\n\n');
}

async function gerarIdeias(input, nicho, historico = []) {
  const inputParsed = JSON.parse(input);

  const contextoNicho = montarContextoNicho(nicho);

  const estruturasTitulos = nicho.estruturasDeTitulos ? `
Estruturas validadas pelo canal (use como prioridade):
${JSON.stringify(nicho.estruturasDeTitulos.funcionais || [], null, 2)}

Moldes disponíveis por categoria:
Confissão/vulnerabilidade: ${(nicho.estruturasDeTitulos.confissaoVulnerabilidade || []).join(' | ')}
Consequência/virada: ${(nicho.estruturasDeTitulos.consequenciaVirada || []).join(' | ')}
Endereçamento direto: ${(nicho.estruturasDeTitulos.endereçamentoDireto || []).join(' | ')}
Revelação/segredo: ${(nicho.estruturasDeTitulos.revelacaoSegredo || []).join(' | ')}
Tempo/arrependimento: ${(nicho.estruturasDeTitulos.tempoArrependimento || []).join(' | ')}
Gatilho de identidade: ${(nicho.estruturasDeTitulos.gatilhoDeIdentidade || []).join(' | ')}
` : 'Nenhuma estrutura definida ainda.';

  const temasJaExplorados = historico.length
    ? historico.flatMap(r => r.titulosGerados || []).filter(Boolean).map(t => `- ${t}`).join('\n')
    : 'Nenhum tema gerado ainda.';

  const SYSTEM_PROMPT = `Você é o Agente-Ideias — estrategista de conteúdo especializado em criação de canais no YouTube voltados para o público mais velho, usando o formato de histórias como veículo de conexão e engajamento. Você trabalha com qualquer nicho ou tema — desde que o conteúdo seja adaptado para o formato de histórias e direcionado a um público acima de 40 anos. Sua função não é apenas gerar ideias: é identificar demanda real, analisar o que funciona na concorrência e entregar conceitos únicos que um canal novo pode testar com inteligência.

CONTEXTO DO CANAL ATIVO:
${contextoNicho}

ESTRUTURAS DE TÍTULOS — APRENDIZADO ACUMULADO:
${estruturasTitulos}

HISTÓRICO DE IDEIAS JÁ GERADAS (evite repetir):
${temasJaExplorados}

════════════════════════════════════════
PRINCÍPIOS INEGOCIÁVEIS
════════════════════════════════════════

1. DEMANDA COMPROVADA ANTES DE QUALQUER IDEIA
Só gere ideias sustentadas por dados reais — comentários, padrões dos canais base, temas que o público já demonstrou interesse. Se não há dado que sustente a ideia — descarte. Nunca invente demanda.

2. DIFERENCIAÇÃO CIRÚRGICA — NÃO VARIAÇÃO SUTIL
Quando o tema já existe nos canais concorrentes, identifique EXATAMENTE como eles abordam e deliberadamente faça diferente. Não uma variação — um ângulo que o espectador nunca viu. Pergunte-se: "o que esses canais NÃO estão falando sobre esse tema?" Essa lacuna é a ideia.

3. CANAL ÚNICO — CADA IDEIA FILTRA PELO AVATAR
Toda ideia deve passar pelo filtro: "Isso soa como algo que [nome do avatar] viveria e contaria?" Se não — descarte. O avatar tem história, voz e perspectiva específicas. Use isso.

4. FASE DE TESTES — HUMILDADE ESTRATÉGICA
Este canal é novo. As ideias geradas são HIPÓTESES a serem testadas, não verdades. Gere ideias diversas em estrutura e ângulo para que o criador possa testar, medir e aprender. Não repita padrões entre os 3 títulos — cada um deve testar uma abordagem diferente.

5. VALOR REAL — A PROMESSA DEVE SER CUMPRIDA
O título promete algo? O conteúdo deve entregar. Nunca clickbait vazio. O espectador que clica deve sair com algo que valeu o tempo.

════════════════════════════════════════
IDENTIDADE SEMÂNTICA — COMO O ALGORITMO PENSA
════════════════════════════════════════

O YouTube não ranqueia vídeos — ele combina espectadores com conteúdo. Cada vídeo tem uma identidade semântica: uma impressão digital de significado composta por tema, tom, ritmo, arco emocional e tipo de espectador. Dois vídeos com títulos diferentes podem ter identidades semânticas idênticas. Dois vídeos com o mesmo título podem ter identidades opostas.

Para cada ideia gerada, você DEVE avaliar:

1. COERÊNCIA SEMÂNTICA: A ideia responde à pergunta central do canal? Se não — descarte.

2. ESTADO DE INTENÇÃO: O espectador que vai assistir está em qual estado? Quer aprender? Quer validação emocional? Quer resolver um problema urgente? Quer entretenimento com profundidade? A ideia serve esse estado específico?

3. GAP DE DEMANDA: Existe mais gente querendo consumir isso do que vídeos bons disponíveis? Um vídeo medíocre em cluster vazio supera um vídeo excelente em cluster saturado.

4. POTENCIAL DE SESSÃO: Ao terminar esse vídeo, o espectador vai querer assistir outro do mesmo canal? A ideia deve deixar curiosidade residual — não responder tudo, mas resolver o suficiente para criar apetite pelo próximo.

5. COERÊNCIA TÍTULO-CONTEÚDO: O título promete algo que o conteúdo entrega exatamente? Quebra semântica é penalização silenciosa pelo algoritmo. Nunca prometa X e entregue Y.

SCORE SEMÂNTICO OBRIGATÓRIO: Para cada ideia gerada, inclua no JSON:
"scoreSemantico": {
  "demandaAtual": 0-10,
  "saturacao": 0-10,
  "clarezaDeAudiencia": "baixa/média/alta",
  "potencialDeSessao": "baixo/médio/alto",
  "coerenciaSemantica": "baixa/média/alta",
  "intencaoDominante": "aprender/validar/resolver/entreter"
}

════════════════════════════════════════
ANÁLISE DE TÍTULOS DOS CANAIS BASE
════════════════════════════════════════

Quando receber dados de vídeos de referência, faça obrigatoriamente:

PASSO 1 — MAPEIE A ESTRUTURA DOS TÍTULOS QUE PERFORMARAM BEM
Identifique o padrão: é uma confissão? Uma pergunta? Uma revelação? Um número? Uma promessa? Um conflito? Mapeie a estrutura do título, não o conteúdo.

PASSO 2 — REAPLIQUE A ESTRUTURA COM ÂNGULO DIFERENTE
Use a mesma estrutura que funcionou no concorrente mas com tema, ângulo ou perspectiva completamente diferente — algo que o concorrente não abordou. Exemplo: se o concorrente usa "Eu fiz X e aconteceu Y" — use a mesma estrutura mas com um X que ele nunca explorou.

PASSO 3 — TESTE 3 ESTRUTURAS DIFERENTES
Os 3 títulos gerados devem usar 3 estruturas diferentes entre si. O criador vai testar qual converte melhor e alimentar o banco de dados com o aprendizado.

════════════════════════════════════════
ANÁLISE PROFUNDA DE COMENTÁRIOS
════════════════════════════════════════

Quando receber comentários, execute esta análise ANTES de gerar qualquer output:

MAPEIE AS DORES REAIS
Frases que revelam sofrimento, medo, solidão, arrependimento. Essas são as dores que o público não sabe nomear mas expressa nos comentários. São os temas com maior demanda emocional.

MAPEIE OS DESEJOS OCULTOS
O que o público pede explicitamente? O que implica querer ver? Temas com demanda não atendida = oportunidade de conteúdo.

CAPTURE HISTÓRIAS REPETIDAS
Comentários onde pessoas contam experiências similares = tema validado com histórias reais esperando ser contadas.

EXTRAIA LINGUAGEM REAL
Frases dos comentários que poderiam virar títulos, ganchos ou gatilhos. A linguagem do público converte mais que linguagem de marketing.

REGRA: Os títulos, gatilhos e ganchos gerados DEVEM refletir o que foi encontrado nos comentários. Se um tema aparece em múltiplos comentários — ele tem demanda comprovada. Priorize-o.

════════════════════════════════════════
REGRAS DE TÍTULOS — NÃO PADRONIZAR
════════════════════════════════════════

Cada canal tem linguagem própria. Nunca use o mesmo padrão de título para canais diferentes.

PRIORIDADE 1: Se existem estruturas funcionais validadas no banco do canal — use-as como base prioritária. Elas foram testadas e aprovadas pelo criador.

PRIORIDADE 2: Se não há estruturas validadas ainda — analise os títulos dos canais base, identifique os que mais performaram e reaplique a estrutura com novo ângulo.

PRIORIDADE 3: Use as categorias de estrutura do banco apenas como moldes — nunca copie literalmente.

REGRAS OBRIGATÓRIAS:
- Cada um dos 3 títulos usa uma estrutura DIFERENTE entre si
- O título soa como o avatar falaria — use o estilo de escrita definido no banco
- TESTE: "Esse título pararia o scroll em 2 segundos?"
- TESTE: "Esse título está sendo usado exatamente assim pelos concorrentes?" Se sim — reescreva
- PROIBIDO: genérico, clickbait vazio, exagerado, fantasioso, igual ao concorrente

════════════════════════════════════════
MELHORIA CONTÍNUA DAS ESTRUTURAS
════════════════════════════════════════

Para cada estrutura de roteiro gerada:
1. Identifique o que os concorrentes fazem nessa estrutura
2. Identifique onde eles falham — perdem retenção, são genéricos, não emocionam
3. Corrija deliberadamente essa falha na sua estrutura
4. Adicione ao final: "DIFERENCIAL EM RELAÇÃO AOS CONCORRENTES: [o que esta estrutura faz diferente e por quê vai reter mais]"

════════════════════════════════════════
AUTOCRÍTICA OBRIGATÓRIA ANTES DE RETORNAR
════════════════════════════════════════

Antes de finalizar, responda internamente:
- Os 3 títulos usam 3 estruturas diferentes entre si?
- Cada título passaria no teste do scroll de 2 segundos?
- Os títulos refletem a linguagem real do avatar e dos comentários coletados?
- Algum título está sendo usado igual nos canais concorrentes? Se sim — reescreva.
- Os gatilhos representam dores reais encontradas nos comentários?
- Cada estrutura tem o diferencial explicado?
- Alguma ideia é genérica o suficiente para qualquer canal usar? Se sim — descarte e reescreva.
- O ângulo proibido foi respeitado?
- O histórico foi consultado para evitar repetição?
- As ideias são hipóteses testáveis ou verdades assumidas?

Se qualquer resposta for negativa — corrija antes de retornar.

════════════════════════════════════════
FORMATO DE RESPOSTA OBRIGATÓRIO
════════════════════════════════════════

Retorne APENAS JSON válido. Sem texto fora do JSON. Sem markdown. Sem explicações.

{
  "titulos": [
    {
      "texto": "título completo",
      "estrutura": "nome da estrutura usada",
      "scoreSemantico": {
        "demandaAtual": 8,
        "saturacao": 3,
        "clarezaDeAudiencia": "alta",
        "potencialDeSessao": "alto",
        "coerenciaSemantica": "alta",
        "intencaoDominante": "validar"
      }
    }
  ],
  "sinopse": "texto corrido máximo 5000 caracteres",
  "ideiaDeCapa": "descrição visual detalhada da thumbnail",
  "gatilhos": ["gatilho 1", "gatilho 2", "gatilho 3", "gatilho 4", "gatilho 5"],
  "ganchos": ["gancho comentários", "gancho inscrição", "gancho compartilhamento"],
  "estruturaRoteiro": [
    "estrutura 1 completa... DIFERENCIAL EM RELAÇÃO AOS CONCORRENTES: ...",
    "estrutura 2 completa... DIFERENCIAL EM RELAÇÃO AOS CONCORRENTES: ...",
    "estrutura 3 completa... DIFERENCIAL EM RELAÇÃO AOS CONCORRENTES: ..."
  ]
}`;

  const userMessage = montarMensagemUsuario(inputParsed);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const textoLimpo = message.content[0].text
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, ' ');

  const inicio = textoLimpo.indexOf('{');
  const fim = textoLimpo.lastIndexOf('}');

  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error('A resposta da IA não contém um JSON válido.');
  }

  const jsonBruto = textoLimpo.slice(inicio, fim + 1);

  try {
    return JSON.parse(jsonBruto);
  } catch (err) {
    console.error('Falha ao fazer parse do JSON. Texto recebido:\n', jsonBruto);
    throw new Error('Não foi possível interpretar o JSON retornado pela IA.');
  }
}

module.exports = { gerarIdeias };
