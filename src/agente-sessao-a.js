require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analisarCanal(dadosCanais, preIdeia, nicho = null) {
  const contextoCanal = nicho ? `
CONTEXTO DO PROJETO:
Canal: ${nicho.canal || 'novo canal'}
Nicho: ${nicho.nicho || 'a definir'}
Público-alvo: ${nicho.publicoAlvo?.faixaEtaria || 'público mais velho'}
Tom: ${nicho.tom?.permitido?.join(', ') || 'não definido'}
Proposta atual: ${nicho.estrategia?.propostaEscolhida?.anguloUnico || 'não definida ainda'}` : 'Nenhum canal ativo — analise com base na pré-ideia do usuário.';

  const SYSTEM_PROMPT = `Você é um estrategista especialista em canais do YouTube voltados para o público mais velho (40+ anos), usando o formato de histórias como veículo de engajamento.

${contextoCanal}

Sua função é analisar os canais apresentados e validar a pré-ideia do criador com base em dados reais.

REGRAS:
- Não force nenhum nicho específico — analise o que os dados mostram
- Valide a pré-ideia com base nos canais apresentados e no contexto do projeto
- Identifique gaps reais — o que esses canais não estão fazendo que o projeto poderia fazer
- Seja honesto: se a ideia não tiver potencial, diga claramente por quê
- Sempre puxe para o formato de histórias voltadas ao público mais velho — esse é o veículo, não o limite

Retorne APENAS um JSON válido sem texto extra com esta estrutura:
{
  "validacao": {
    "existeEspaco": true/false,
    "justificativa": "explicação clara",
    "nivelConcorrencia": "baixo/médio/alto",
    "tempoMedioParaCrescer": "estimativa baseada nos dados"
  },
  "padroesDosCanais": {
    "oQueFunciona": ["padrão 1", "padrão 2", "padrão 3"],
    "oQueNaoFunciona": ["ponto fraco 1", "ponto fraco 2"],
    "gapIdentificado": "o que ninguém está fazendo ainda",
    "gapEdicao": "como melhorar o estilo de edição baseado nos canais analisados"
  },
  "propostas": [
    {
      "titulo": "nome curto",
      "anguloUnico": "",
      "subnicho": "",
      "publicoAlvo": "",
      "diferencialCompetitivo": ""
    },
    { "titulo": "", "anguloUnico": "", "subnicho": "", "publicoAlvo": "", "diferencialCompetitivo": "" },
    { "titulo": "", "anguloUnico": "", "subnicho": "", "publicoAlvo": "", "diferencialCompetitivo": "" }
  ],
  "guiaImplementacao": {
    "formatoSugerido": "",
    "tomNarrativo": "",
    "frequenciaSugerida": "",
    "primeirosPasso": ["passo 1", "passo 2", "passo 3"]
  }
}

IMPORTANTE: As 3 propostas devem ser genuinamente diferentes entre si. Cada uma deve explorar um subnicho ou ângulo distinto dentro do contexto do projeto. Máximo 200 caracteres por campo de texto.`;

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

Analise os canais, valide a pré-ideia com base nos dados coletados e no contexto do projeto, e gere o relatório completo.`;

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

async function revisarCanal(dadosRevisao, nicho = null) {
  const contexto = nicho
    ? `Canal: ${nicho.canal}. Nicho: ${nicho.nicho}. Público: ${nicho.publicoAlvo?.faixaEtaria}.`
    : 'Novo canal sem contexto definido.';

  const SYSTEM_PROMPT = `Você é um consultor especialista em canais do YouTube voltados para o público mais velho, usando histórias como formato de conteúdo.

Contexto: ${contexto}

Revise criticamente o projeto de canal apresentado. Avalie coerência, identifique conflitos e dê um veredicto honesto sobre o potencial de sucesso.

Retorne APENAS JSON válido:
{
  "probabilidadeSucesso": { "percentual": 0, "classificacao": "baixa/média/alta/muito alta", "justificativa": "" },
  "avaliacaoGeral": {
    "avatar": { "status": "ok/atencao/critico", "observacao": "" },
    "proposta": { "status": "ok/atencao/critico", "observacao": "" },
    "publico": { "status": "ok/atencao/critico", "observacao": "" },
    "tom": { "status": "ok/atencao/critico", "observacao": "" },
    "nicho": { "status": "ok/atencao/critico", "observacao": "" }
  },
  "conflitos": [],
  "camposVaziosCriticos": [],
  "pontosFortesDoCanal": [],
  "recomendacoesFinais": [],
  "veredicto": "aprovado/aprovado_com_ressalvas/requer_ajustes",
  "mensagemFinal": ""
}

Seja conciso. Máximo 100 caracteres por campo de texto. JSON compacto e válido.`;

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
