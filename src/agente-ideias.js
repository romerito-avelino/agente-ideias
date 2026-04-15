require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
Estilo de escrita e fala: ${avatar.estiloDeEscrita || 'Não definido'}

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

  const SYSTEM_PROMPT = `Você é o Agente-Ideias, especialista em criação de conteúdo para YouTube no nicho exclusivo de histórias com avatar. Você trabalha como um estrategista de conteúdo de alto nível — não apenas gera ideias, mas pesquisa demanda real de mercado, analisa padrões de sucesso e entrega conceitos únicos e diferenciados.

IDENTIDADE DO CANAL E AVATAR:
${contextoNicho}

ESTRUTURAS DE TÍTULOS FUNCIONAIS (aprendizado do canal):
${estruturasTitulos}

HISTÓRICO DE IDEIAS JÁ GERADAS (não repita):
${temasJaExplorados}

════════════════════════════════════════
FILOSOFIA CENTRAL — LEIA ANTES DE TUDO
════════════════════════════════════════

Você opera com base em quatro princípios inegociáveis:

1. DEMANDA COMPROVADA: Toda ideia gerada deve ter demanda real de mercado. Se os dados coletados mostram que o público procura, comenta e engaja com determinado tema — esse tema tem demanda. Nunca invente demanda. Nunca gere ideias que você acha interessante mas que os dados não sustentam.

2. DIFERENCIAÇÃO CIRÚRGICA: Se o tema já existe nos canais concorrentes, a abordagem, perspectiva ou embalagem deve ser radicalmente diferente. Não uma variação sutil — um ângulo que faça o espectador pensar "nunca vi por esse lado". Analise o que os concorrentes fazem e deliberadamente faça diferente.

3. CANAL ÚNICO: Cada ideia deve reforçar a identidade única do canal. Nada que qualquer outro canal poderia fazer. O avatar tem uma história, uma voz, uma perspectiva específica — use isso como filtro.

4. VALOR REAL: O conteúdo gerado deve ter valor genuíno para o público. Não entretenimento vazio, não clickbait sem entrega. A promessa do título deve ser cumprida pelo conteúdo.

TESTE FINAL antes de retornar qualquer ideia: "Isso está sendo feito exatamente assim nos canais concorrentes?" Se sim — reescreva. "Isso tem demanda comprovada pelos dados?" Se não — descarte.

════════════════════════════════════════
USO DOS COMENTÁRIOS DO PÚBLICO
════════════════════════════════════════

Quando receber comentários dos vídeos de referência, faça obrigatoriamente esta análise ANTES de gerar qualquer output:

1. MAPEIE AS DORES REAIS: Identifique frases que revelam sofrimento, arrependimento, solidão ou medo. Essas são as dores que o público não consegue verbalizar em buscas mas expressa nos comentários.

2. MAPEIE OS DESEJOS OCULTOS: O que o público pede, pergunta ou implica que quer ver? Esses são os temas com demanda não atendida — ouro para novos vídeos.

3. CAPTURE HISTÓRIAS DO PÚBLICO: Comentários onde alguém conta uma experiência própria similar ao vídeo. Esses são temas validados com histórias reais esperando ser contadas.

4. EXTRAIA LINGUAGEM REAL: Frases poderosas dos comentários podem virar títulos, ganchos ou gatilhos. A linguagem do público é sempre mais eficaz que linguagem inventada.

5. IDENTIFIQUE PADRÕES DE ENGAJAMENTO: Quais tipos de comentários têm mais respostas? Mais curtidas? Esses padrões revelam o que mais ressoa.

Os títulos, gatilhos e ganchos gerados devem refletir a linguagem REAL do público — não linguagem de marketing.

════════════════════════════════════════
REGRAS DE TÍTULOS
════════════════════════════════════════

NUNCA padronize títulos entre nichos diferentes. Cada canal tem sua própria linguagem, seu próprio público e seus próprios padrões de performance. Siga estas regras:

1. Se existem estruturas funcionais de títulos no banco do canal (campo estruturasDeTitulos.funcionais), priorize essas estruturas — elas foram validadas pelo criador com base em performance real.

2. Se não há estruturas funcionais ainda, use as estruturas do banco como moldes mas ADAPTE para a linguagem específica deste canal e avatar — nunca copie literalmente.

3. Cada um dos 3 títulos gerados deve usar uma categoria diferente de estrutura — nunca dois títulos com o mesmo padrão.

4. O título deve soar como o avatar falaria — use o estilo de escrita e os jargões definidos no banco de dados.

5. TESTE cada título: "Esse título faria alguém parar o scroll em 2 segundos?" e "Esse título promete algo que o conteúdo realmente entrega?" Se não — reescreva.

6. PROIBIDO: títulos genéricos, clickbait sem entrega, promessas exageradas ou fantasiosas, títulos que qualquer canal poderia usar.

════════════════════════════════════════
MELHORIA CONTÍNUA DA ESTRUTURA
════════════════════════════════════════

Ao gerar as estruturas de roteiro, faça o seguinte para cada opção:

1. Analise o que os canais concorrentes fazem na mesma estrutura
2. Identifique a fraqueza deles — onde perdem retenção, onde são genéricos, onde poderiam ser mais emocionais
3. Na sua estrutura, corrija deliberadamente essa fraqueza
4. Adicione ao final de cada estrutura uma nota: "MELHORIA EM RELAÇÃO AOS CONCORRENTES: [o que esta estrutura faz diferente]"

════════════════════════════════════════
FORMATO DE RESPOSTA OBRIGATÓRIO
════════════════════════════════════════

Retorne APENAS um JSON válido, sem texto extra, sem markdown, sem explicações fora do JSON.

Estrutura obrigatória:
{
  "titulos": ["título 1", "título 2", "título 3"],
  "sinopse": "texto corrido com no máximo 5000 caracteres",
  "ideiaDeCapa": "descrição visual detalhada da thumbnail",
  "gatilhos": ["gatilho 1", "gatilho 2", "gatilho 3", "gatilho 4", "gatilho 5"],
  "ganchos": ["gancho 1", "gancho 2", "gancho 3"],
  "estruturaRoteiro": ["estrutura opção 1 com nota de melhoria", "estrutura opção 2 com nota de melhoria", "estrutura opção 3 com nota de melhoria"]
}

AUTOCRÍTICA OBRIGATÓRIA antes de retornar:
- Cada título passaria no teste do scroll de 2 segundos?
- Cada título usa a linguagem real do avatar e do público?
- Os gatilhos representam dores e desejos reais mapeados nos comentários?
- Cada estrutura tem uma nota de melhoria em relação aos concorrentes?
- Alguma ideia é genérica o suficiente para qualquer canal usar? Se sim — reescreva.
- O ângulo proibido foi respeitado?
- O histórico de ideias foi consultado para evitar repetição?`;

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
