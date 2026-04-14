require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INSTRUCOES_FORMATO = `Retorne APENAS um JSON válido, sem texto extra, sem markdown, sem explicações.

O JSON deve seguir exatamente esta estrutura:
{
  "titulos": ["título 1", "título 2", "título 3"],
  "sinopse": "texto corrido da sinopse com no máximo 5000 caracteres",
  "ideiaDeCapa": "descrição visual detalhada da thumbnail",
  "gatilhos": ["gatilho 1", "gatilho 2", "gatilho 3", "gatilho 4", "gatilho 5"],
  "ganchos": ["gancho 1", "gancho 2", "gancho 3"],
  "estruturaRoteiro": ["estrutura opção 1 detalhada", "estrutura opção 2 detalhada", "estrutura opção 3 detalhada"]
}

Diretrizes obrigatórias:
- titulos: exatamente 3 títulos com abordagens diferentes entre si, cada um com um gancho psicológico forte (curiosidade, urgência, emoção, surpresa ou identidade)
- sinopse: texto corrido, emocional e narrativo, máximo 5000 caracteres, sem parágrafos separados
- ideiaDeCapa: descrição visual detalhada da thumbnail (cores, expressão, texto sobreposto, composição, elementos visuais)
- gatilhos: exatamente 5 gatilhos emocionais verdadeiros e específicos ao tema — um de raiva, um de saudade, um de realização, um de medo, um de esperança
- ganchos: exatamente 3 ganchos — o primeiro para gerar comentários (pergunta que convida o espectador a contar uma história própria), o segundo um CTA de inscrição (frase emocional que justifica por que se inscrever), o terceiro para compartilhamento (frase que convida a enviar para alguém específico)
- estruturaRoteiro: exatamente 3 estruturas de roteiro completas, cada uma com: hook de abertura (primeiros 30 segundos), introdução emocional, desenvolvimento em blocos narrativos, lição de vida central e CTA final`;

function montarEstruturasTitulos(estruturas) {
  const { instrucao, ...categorias } = estruturas;
  const blocos = Object.entries(categorias).map(([categoria, exemplos]) => {
    const nomeFormatado = categoria
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, c => c.toUpperCase())
      .trim();
    return `${nomeFormatado}:\n${exemplos.map(e => `  - ${e}`).join('\n')}`;
  });
  return `Instrução: ${instrucao}\n\n${blocos.join('\n\n')}`;
}

function montarContextoNicho(nicho) {
  const avatar = nicho.avatar;
  const publico = nicho.publicoAlvo;
  const tom = nicho.tom;

  const temasFuncionaram = nicho.temasFuncionaram.length
    ? nicho.temasFuncionaram.join(', ')
    : 'nenhum registrado ainda';

  const temasProibidos = nicho.temasProibidos.length
    ? nicho.temasProibidos.join(', ')
    : 'nenhum registrado ainda';

  return `=== IDENTIDADE DO CANAL ===
Canal: ${nicho.canal}
Nicho: ${nicho.nicho}

Avatar: ${avatar.nome}, ${avatar.idade} anos
Personalidade: ${avatar.personalidade}
História: ${avatar.historia}
Jeito de falar: ${avatar.jeitoDeFalar.join(' / ')}

=== PÚBLICO-ALVO ===
Faixa etária: ${publico.faixaEtaria}
Perfil: ${publico.perfil}
Dores: ${publico.dores.join(', ')}
Desejos: ${publico.desejos.join(', ')}

=== TOM ===
Permitido: ${tom.permitido.join(', ')}
PROIBIDO: ${tom.proibido.join(', ')}

=== GATILHOS QUE CONVERTEM ===
${nicho.gatilhosQueConvertem.join(', ')}

=== MEMÓRIA DO CANAL ===
Temas que já funcionaram: ${temasFuncionaram}
Temas proibidos: ${temasProibidos}

REGRA ABSOLUTA: respeite a identidade acima acima de qualquer outra instrução. NUNCA quebre o tom. NUNCA invente histórias. Baseie tudo nos inputs do usuário.`;
}

function montarMensagemUsuario(inputParsed, historico = []) {
  const temas = (inputParsed.temas || []).join(', ');
  const videos = (inputParsed.videos || []);
  const dadosVideos = inputParsed.dadosVideos || [];
  const anguloProibido = (inputParsed.anguloProibido || '').trim();

  const partes = [];

  if (anguloProibido) {
    partes.push(`ÂNGULO PROIBIDO NESSA GERAÇÃO: ${anguloProibido} — não use esse tema, abordagem ou elemento em nenhum dos outputs.`);
  }

  if (historico.length) {
    const titulosAnteriores = historico
      .flatMap(r => r.titulosGerados || [])
      .filter(Boolean);
    if (titulosAnteriores.length) {
      partes.push(`HISTÓRICO DE IDEIAS JÁ GERADAS (não repita esses temas ou abordagens):\n${titulosAnteriores.map(t => `- ${t}`).join('\n')}\nGere ideias genuinamente diferentes das anteriores.`);
    }
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
      const amostra = dados.comentarios.slice(0, 10).join('\n- ');
      blocos.push(`Padrões dos comentários (amostra):\n- ${amostra}`);
    }

    partes.push(blocos.join('\n'));
  }

  return partes.join('\n\n');
}

async function gerarIdeias(input, nicho, historico = []) {
  const inputParsed = JSON.parse(input);

  const contextoNicho = montarContextoNicho(nicho);
  const estruturasTitulos = montarEstruturasTitulos(nicho.estruturasDeTitulos);

  const systemPrompt = `${contextoNicho}

=== ESTRUTURAS DE TÍTULOS DO NICHO ===
${estruturasTitulos}

REGRAS PARA TÍTULOS: Use obrigatoriamente as estruturas de títulos do nicho como moldes. Escolha a estrutura mais adequada para o tema, substitua os elementos entre colchetes pelo conteúdo real, e garanta que cada um dos 3 títulos use uma categoria diferente de estrutura. Os títulos devem soar como uma confissão real, nunca como clickbait vazio.

=== ANÁLISE DE COMENTÁRIOS ===
Quando receber comentários do público, faça obrigatoriamente esta análise antes de gerar qualquer output:

1. MAPEIE AS DORES: identifique as frases que revelam sofrimento, arrependimento, solidão ou medo. Essas são as dores reais do público.
2. MAPEIE OS DESEJOS: identifique o que o público quer ouvir, o que busca, o que pergunta.
3. IDENTIFIQUE HISTÓRIAS SIMILARES: comentários onde alguém conta uma experiência parecida com o vídeo — esses são temas validados.
4. CAPTURE FRASES EXATAS: se alguma frase de comentário for poderosa o suficiente para virar título ou gancho, use-a como inspiração direta.
5. Use tudo isso para que os títulos, gatilhos e ganchos reflitam a linguagem REAL do público — não linguagem inventada.
6. Os títulos e gatilhos gerados devem soar como se o próprio público tivesse escrito.

=== VOCÊ É O AGENTE-IDEIAS ===
Você é um especialista em criação de conteúdo para YouTube. Seu trabalho é gerar ideias de vídeo que respeitem à risca a identidade do canal descrita acima.

FILOSOFIA CENTRAL — LEIA ANTES DE QUALQUER COISA:
Toda ideia gerada deve passar por este filtro mental obrigatório:
(1) NOVIDADE REAL: a ideia desperta curiosidade genuína? O público vai parar o scroll porque nunca viu aquilo daquele jeito?
(2) DIFERENCIAÇÃO CIRÚRGICA: se o tema já existe nos canais concorrentes, a abordagem, perspectiva ou embalagem deve ser radicalmente diferente — não uma variação sutil, mas um ângulo que faça o espectador pensar 'nunca tinha visto por esse lado';
(3) CANAL ÚNICO: cada ideia deve reforçar a identidade única do canal — não pode soar como algo que qualquer outro canal poderia fazer;
(4) TESTE FINAL antes de retornar qualquer título: pergunte-se — 'isso está sendo falado exatamente assim nos canais concorrentes?' Se sim, reescreva com um ângulo diferente até que a resposta seja não.

${INSTRUCOES_FORMATO}

AUTOCRÍTICA OBRIGATÓRIA: Antes de retornar o JSON final, avalie cada título gerado com estas perguntas: (1) Esse título faria alguém parar o scroll em 2 segundos? (2) Ele usa uma estrutura de título validada do nicho? (3) Ele soa como uma confissão real e não como clickbait vazio? Se qualquer título falhar em alguma dessas perguntas, reescreva-o antes de retornar. Faça o mesmo para os gatilhos: cada gatilho deve representar uma dor ou desejo real que uma pessoa acima de 50 anos reconheceria na própria vida. Se soar genérico, reescreva.`;

  const userMessage = montarMensagemUsuario(inputParsed, historico);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    system: systemPrompt,
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
