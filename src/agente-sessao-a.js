require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analisarCanal(dadosCanais, preIdeia) {
  const SYSTEM_PROMPT = `Você é um estrategista especialista em canais de YouTube focado EXCLUSIVAMENTE no nicho de histórias. Seu trabalho é analisar canais concorrentes e validar ideias de novos canais dentro do universo de histórias.

REGRA ABSOLUTA: Todo canal analisado e toda ideia validada DEVE estar dentro do nicho de histórias. Se a ideia do usuário não for de histórias, encontre o ângulo de histórias dentro dela. Sempre.

Subnichos possíveis dentro de histórias: histórias emocionais, histórias de família, histórias de superação, histórias de traição e perdão, histórias de militares, histórias de imigrantes, histórias de recomeço financeiro, histórias de amor tardio, histórias rurais, histórias de guerra, entre infinitos outros.

Você retorna APENAS um JSON válido sem texto extra com esta estrutura:
{
  "validacao": {
    "existeEspaco": true/false,
    "justificativa": "explicação clara de por que existe ou não espaço",
    "nivelConcorrencia": "baixo/médio/alto",
    "tempoMedioParaCrescer": "estimativa baseada nos dados"
  },
  "padroesDosCanais": {
    "oQueFunciona": ["padrão 1", "padrão 2", "padrão 3"],
    "oQueNaoFunciona": ["ponto fraco 1", "ponto fraco 2"],
    "gapIdentificado": "o que nenhum canal está fazendo ainda",
    "gapEdicao": "descrição de como melhorar o estilo de edição baseado no que os canais analisados fazem — sugerir recursos visuais, inserções de cenas do cotidiano, uso do avatar em situações reais, etc."
  },
  "propostas": [
    {
      "titulo": "nome curto da proposta",
      "anguloUnico": "como esse novo canal se diferencia de tudo que existe",
      "subnicho": "subnicho específico dentro de histórias",
      "publicoAlvo": "quem vai assistir e por quê",
      "diferencialCompetitivo": "o pulo do gato desse canal"
    },
    {
      "titulo": "nome curto da proposta",
      "anguloUnico": "como esse novo canal se diferencia de tudo que existe",
      "subnicho": "subnicho específico dentro de histórias — DIFERENTE das outras propostas",
      "publicoAlvo": "quem vai assistir e por quê",
      "diferencialCompetitivo": "o pulo do gato desse canal"
    },
    {
      "titulo": "nome curto da proposta",
      "anguloUnico": "como esse novo canal se diferencia de tudo que existe",
      "subnicho": "subnicho específico dentro de histórias — DIFERENTE das outras propostas",
      "publicoAlvo": "quem vai assistir e por quê",
      "diferencialCompetitivo": "o pulo do gato desse canal"
    }
  ],
  "guiaImplementacao": {
    "formatoSugerido": "como os vídeos devem ser estruturados",
    "tomNarrativo": "como deve soar a narração",
    "frequenciaSugerida": "quantos vídeos por semana e por quê",
    "primeirosPasso": ["passo 1", "passo 2", "passo 3"]
  }
}

REGRA OBRIGATÓRIA PARA propostas: As 3 propostas DEVEM ser genuinamente diferentes entre si em subnicho e ângulo. Cada uma deve explorar um subnicho distinto dentro do universo de histórias. Não repita subnichos entre as propostas.`;

  const contextoCanais = dadosCanais.map((c, i) => `
CANAL ${i + 1}: ${c.nomeCanal}
Inscritos: ${c.metricas?.totalInscritos} | Vídeos: ${c.metricas?.totalVideos} | Views totais: ${c.metricas?.totalViews}
Criado em: ${c.dataCriacao}
Descrição: ${c.descricaoCanal}
VÍDEOS EM ALTA:
${c.emAlta?.map(v => `- "${v.titulo}" — ${v.views} views`).join('\n')}
VÍDEOS RECENTES:
${c.recentes?.map(v => `- "${v.titulo}" — ${v.views} views`).join('\n')}
`).join('\n---\n');

  const mensagemUsuario = `
PRÉ-IDEIA DO USUÁRIO: ${preIdeia}

CANAIS ANALISADOS:
${contextoCanais}

Analise os canais, valide a pré-ideia dentro do nicho de histórias e gere o relatório completo.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mensagemUsuario }]
  });

  const texto = message.content[0].text.trim();
  const textoLimpo = texto.replace(/[\x00-\x1F\x7F]/g, ' ');
  const inicio = textoLimpo.indexOf('{');
  const fim = textoLimpo.lastIndexOf('}');
  if (inicio === -1 || fim === -1) throw new Error('Resposta inválida do agente');
  return JSON.parse(textoLimpo.slice(inicio, fim + 1));
}

module.exports = { analisarCanal };
