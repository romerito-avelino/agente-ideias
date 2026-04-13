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

REGRA OBRIGATÓRIA PARA propostas: As 3 propostas DEVEM ser genuinamente diferentes entre si em subnicho e ângulo. Cada uma deve explorar um subnicho distinto dentro do universo de histórias. Não repita subnichos entre as propostas.

IMPORTANTE: Mantenha cada campo de texto com no máximo 200 caracteres. Seja direto e objetivo. JSON inválido ou muito longo será rejeitado.`;

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
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mensagemUsuario }]
  });

  const texto = message.content[0].text.trim();
  const textoLimpo = texto
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');

  const inicio = textoLimpo.indexOf('{');
  const fim = textoLimpo.lastIndexOf('}');

  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error('Resposta inválida do agente — JSON não encontrado');
  }

  const jsonStr = textoLimpo.slice(inicio, fim + 1);

  let resultado;
  try {
    resultado = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[agente-sessao-a] JSON inválido, tentando sanitização extra...');
    const jsonSanitizado = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    resultado = JSON.parse(jsonSanitizado);
  }

  return resultado;
}

async function revisarCanal(dadosRevisao) {
  const SYSTEM_PROMPT = `Você é um consultor especialista em canais de YouTube no nicho de histórias. Sua função é fazer uma revisão crítica e honesta de um projeto de canal antes do lançamento.

Você analisa coerência, identifica conflitos, avalia potencial de sucesso e dá um veredicto claro.

Seja conciso. Máximo 100 caracteres por campo de texto. JSON compacto e válido.

Retorne APENAS um JSON válido sem texto extra com esta estrutura:
{
  "probabilidadeSucesso": {
    "percentual": 0,
    "classificacao": "baixa/média/alta/muito alta",
    "justificativa": "explicação direta e honesta"
  },
  "avaliacaoGeral": {
    "avatar": {
      "status": "ok/atencao/critico",
      "observacao": "o avatar vai gerar conexão emocional com o público?"
    },
    "proposta": {
      "status": "ok/atencao/critico",
      "observacao": "a proposta é diferenciada e viável?"
    },
    "publico": {
      "status": "ok/atencao/critico",
      "observacao": "o público tem interesse real nesse conteúdo?"
    },
    "tom": {
      "status": "ok/atencao/critico",
      "observacao": "o tom está alinhado com o avatar e o público?"
    },
    "nicho": {
      "status": "ok/atencao/critico",
      "observacao": "o subnicho escolhido tem espaço real no mercado?"
    }
  },
  "conflitos": [],
  "camposVaziosCriticos": [],
  "pontosFortesDoCanal": [],
  "recomendacoesFinais": [],
  "veredicto": "aprovado/aprovado_com_ressalvas/requer_ajustes",
  "mensagemFinal": "mensagem direta e motivadora para o criador"
}`;

  const mensagem = `Revise este projeto de canal completo e dê seu veredicto:

PROPOSTA ESCOLHIDA:
${JSON.stringify(dadosRevisao.propostaEscolhida, null, 2)}

AVATAR:
Nome: ${dadosRevisao.avatar?.nome}
Idade: ${dadosRevisao.avatar?.idade}
Personalidade: ${dadosRevisao.avatar?.personalidade}
História: ${JSON.stringify(dadosRevisao.avatar?.historia, null, 2)}

TOM PERMITIDO: ${dadosRevisao.tom?.permitido?.join(', ')}
TOM PROIBIDO: ${dadosRevisao.tom?.proibido?.join(', ')}

PÚBLICO-ALVO: ${dadosRevisao.publicoAlvo?.faixaEtaria}

NICHO: ${dadosRevisao.nicho}

GAP DE MERCADO: ${dadosRevisao.gapMercado}
GAP DE EDIÇÃO: ${dadosRevisao.gapEdicao}

GUIA DE IMPLEMENTAÇÃO:
${JSON.stringify(dadosRevisao.guiaImplementacao, null, 2)}`;

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mensagem }]
  });

  const texto = message.content[0].text.trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r|\n|\t/g, ' ');
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) throw new Error('JSON não encontrado na resposta da revisão');
  const jsonStr = texto.slice(inicio, fim + 1);
  let resultado;
  try {
    resultado = JSON.parse(jsonStr);
  } catch {
    const sanitizado = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\u2018\u2019\u201C\u201D]/g, '"');
    resultado = JSON.parse(sanitizado);
  }
  return resultado;
}

module.exports = { analisarCanal, revisarCanal };
