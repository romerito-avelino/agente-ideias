require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function qualificarCanal(canal, limites = {}) {
  const inscritos = parseInt(canal.statistics?.subscriberCount || 0);
  const dataPublicacao = canal.snippet?.publishedAt;
  if (!dataPublicacao) return false;
  const mesesDesdeInicio = (Date.now() - new Date(dataPublicacao).getTime()) / (1000 * 60 * 60 * 24 * 30);

  if (inscritos > limites.maxInscritos) {
    console.log(`[minerador] Canal descartado (${inscritos.toLocaleString()} inscritos — limite ${limites.maxInscritos.toLocaleString()}): ${canal.snippet?.title}`);
    return false;
  }
  if (mesesDesdeInicio > limites.maxMeses) {
    console.log(`[minerador] Canal descartado (${Math.round(mesesDesdeInicio)} meses — limite ${limites.maxMeses}): ${canal.snippet?.title}`);
    return false;
  }
  return true;
}

async function gerarTermosDeBusca(input, nicho = null) {
  let contextoEnriquecido = input;
  const isUrl = input.includes('youtube.com') || input.includes('youtu.be');

  if (isUrl) {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      const handleMatch = input.match(/youtube\.com\/@([^/?&\s/]+)/);
      const channelIdMatch = input.match(/youtube\.com\/channel\/([^/?&\s/]+)/);

      let channelId = null;
      if (handleMatch) {
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: { part: 'snippet', q: handleMatch[1], type: 'channel', maxResults: 1, key: apiKey }
        });
        channelId = searchRes.data.items?.[0]?.id?.channelId;
      } else if (channelIdMatch) {
        channelId = channelIdMatch[1];
      }

      if (channelId) {
        const [videosRes, canalRes] = await Promise.all([
          axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', channelId, order: 'viewCount', maxResults: 5, type: 'video', key: apiKey }
          }),
          axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'snippet', id: channelId, key: apiKey }
          })
        ]);
        const titulos = videosRes.data.items?.map(v => v.snippet.title) || [];
        const descricao = canalRes.data.items?.[0]?.snippet?.description?.substring(0, 300) || '';
        const nomeCanal = canalRes.data.items?.[0]?.snippet?.title || '';
        contextoEnriquecido = `Canal de referência: "${nomeCanal}". Descrição: ${descricao}. Vídeos mais populares: ${titulos.join(' | ')}`;
        console.log(`[minerador] Contexto extraído do canal: ${nomeCanal}`);
      }
    } catch (err) {
      console.warn(`[minerador] Falha ao extrair contexto da URL — usando input original: ${err.message}`);
      contextoEnriquecido = input;
    }
  }

  const contextoCanal = nicho ? `Projeto: ${nicho.nicho || ''}. Público: ${nicho.publicoAlvo?.faixaEtaria || 'público mais velho'}.` : '';

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    system: `Você é especialista em análise de canais do YouTube. Dado um tema, URL ou contexto de canal, gere exatamente 5 termos de busca específicos — 2 em português, 2 em inglês e 1 em espanhol — para encontrar canais similares. Retorne APENAS JSON: { "termos": ["pt1", "pt2", "en1", "en2", "es1"] }. Seja específico ao tema identificado.`,
    messages: [{ role: 'user', content: `Contexto: ${contextoEnriquecido}\n${contextoCanal}` }]
  });

  const texto = message.content[0].text.trim();
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    console.warn('[minerador] Falha ao parsear termos — usando input como termo direto');
    return { termos: [input.substring(0, 50)] };
  }
}

async function buscarCanaisPorTermo(termo, apiKey) {
  const resultados = [];

  // Limites iguais para todos os idiomas — foco em tendências emergentes
  const limites = { maxInscritos: 100000, maxMeses: 10 };

  const buscas = [
    { params: { part: 'snippet', q: termo, type: 'channel', maxResults: 10, relevanceLanguage: 'en', regionCode: 'US', key: apiKey }, limites, idioma: 'EN' },
    { params: { part: 'snippet', q: termo, type: 'channel', maxResults: 10, relevanceLanguage: 'en', regionCode: 'GB', key: apiKey }, limites, idioma: 'EN-GB' },
    { params: { part: 'snippet', q: termo, type: 'channel', maxResults: 10, relevanceLanguage: 'es', regionCode: 'ES', key: apiKey }, limites, idioma: 'ES' },
    { params: { part: 'snippet', q: termo, type: 'channel', maxResults: 8, relevanceLanguage: 'es', regionCode: 'MX', key: apiKey }, limites, idioma: 'ES-MX' },
    { params: { part: 'snippet', q: termo, type: 'channel', maxResults: 6, relevanceLanguage: 'pt', regionCode: 'BR', key: apiKey }, limites, idioma: 'PT-BR' },
  ];

  const respostas = await Promise.allSettled(
    buscas.map(b => axios.get('https://www.googleapis.com/youtube/v3/search', { params: b.params }))
  );

  for (let i = 0; i < respostas.length; i++) {
    const res = respostas[i];
    const { limites, idioma } = buscas[i];
    if (res.status !== 'fulfilled') continue;
    const canaisIds = res.value.data.items
      ?.filter(item => item.id?.channelId)
      .map(item => item.id.channelId) || [];
    if (!canaisIds.length) continue;

    const detalhes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', id: canaisIds.join(','), key: apiKey }
    });

    for (const canal of detalhes.data.items || []) {
      if (qualificarCanal(canal, limites)) {
        resultados.push({ ...canal, _idioma: idioma });
      }
    }
  }

  return resultados;
}

async function coletarDadosCanal(channelId, apiKey, limites = {}) {
  const canalRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics,contentDetails', id: channelId, key: apiKey }
  });

  const canal = canalRes.data.items?.[0];
  if (!canal) return null;

  if (!qualificarCanal(canal, limites)) return null;

  const inscritos = parseInt(canal.statistics?.subscriberCount || 0);
  const playlistId = canal.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return null;

  const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
    params: { part: 'contentDetails', playlistId, maxResults: 50, key: apiKey }
  });

  const videoIds = videosRes.data.items?.map(i => i.contentDetails.videoId) || [];
  if (videoIds.length === 0) return null;

  const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { part: 'snippet,statistics', id: videoIds.join(','), key: apiKey }
  });

  const videos = statsRes.data.items?.map(v => ({
    id: v.id,
    titulo: v.snippet.title,
    data: v.snippet.publishedAt,
    views: parseInt(v.statistics?.viewCount || 0),
    likes: parseInt(v.statistics?.likeCount || 0),
    url: `https://youtube.com/watch?v=${v.id}`
  })) || [];

  if (videos.length === 0) return null;

  const datas = videos.map(v => new Date(v.data)).sort((a, b) => a - b);
  const mesesDesdeInicio = (Date.now() - datas[0].getTime()) / (1000 * 60 * 60 * 24 * 30);

  const totalVideos = videos.length;
  const totalViews = videos.reduce((acc, v) => acc + v.views, 0);

  // Parâmetro 4: Demanda (views/vídeo)
  const mediaViewsPorVideo = totalViews / totalVideos;
  const scoreDemanda = Math.min(100, Math.round((mediaViewsPorVideo / 5000) * 100));

  // Parâmetro 5: Constância (variação nos últimos 5 vídeos)
  const recentes = [...videos].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  const mediaRecentes = recentes.reduce((acc, v) => acc + v.views, 0) / recentes.length;
  const scoreConstancia = mediaRecentes > 500 ? Math.min(100, Math.round((mediaRecentes / mediaViewsPorVideo) * 70)) : 20;

  const emAlta = [...videos].sort((a, b) => b.views - a.views).slice(0, 5);

  return {
    channelId,
    nomeCanal: canal.snippet.title,
    url: `https://youtube.com/channel/${channelId}`,
    urlHandle: canal.snippet?.customUrl ? `https://youtube.com/${canal.snippet.customUrl}` : null,
    descricao: canal.snippet.description?.substring(0, 200),
    inscritos,
    totalVideos,
    totalViews,
    mesesAtivo: Math.round(mesesDesdeInicio),
    mediaViewsPorVideo: Math.round(mediaViewsPorVideo),
    scoreDemanda,
    scoreConstancia,
    emAlta,
    recentes,
    titulosParaAnalise: emAlta.map(v => v.titulo)
  };
}

async function calcularScoresIA(canais, inputOriginal, nicho = null) {
  const LOTE_SIZE = 5;
  const todasAvaliacoes = [];

  const descricaoContexto = nicho
    ? `Projeto: ${nicho.canal || 'canal novo'}. Nicho: ${nicho.nicho || ''}. Público-alvo: ${nicho.publicoAlvo?.faixaEtaria || 'público mais velho'}. Proposta: ${nicho.estrategia?.propostaEscolhida?.anguloUnico || ''}.`
    : `Projeto baseado no input: "${inputOriginal}". Público-alvo: pessoas mais velhas (40+).`;

  for (let i = 0; i < canais.length; i += LOTE_SIZE) {
    const lote = canais.slice(i, i + LOTE_SIZE);
    const listaLote = lote.map((c, j) =>
      `${i + j}|${c.nomeCanal}|${c.titulosParaAnalise.slice(0, 3).join('|')}`
    ).join('\n');

    try {
      const message = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 400,
        system: `Avalie canais do YouTube como tendências emergentes para o projeto: ${descricaoContexto}

Para cada canal, avalie:

RECRIABILIDADE (0-100): O conteúdo pode ser adaptado para histórias voltadas ao público mais velho?

OPORTUNIDADE (0-100): Existe demanda não atendida que esse canal está começando a servir?

GAP DE DEMANDA (0-10): Quanto maior, mais gente quer esse conteúdo e menos canais bons existem servindo. Canais com crescimento rápido e poucos vídeos = gap alto. Canais grandes estagnados = gap baixo.

CLUSTER SEMANTICO: Em poucas palavras, qual é a identidade semântica desse canal? Que pergunta ele responde? Para qual espectador em qual momento?

INTENCAO DO PUBLICO: O espectador quer aprender, validar emocionalmente, resolver problema urgente ou se entreter com profundidade?

Retorne APENAS JSON. Máximo 80 chars por campo de texto.
{"avaliacoes":[{
  "indice":0,
  "scoreRecriabilidade":75,
  "scoreOportunidade":80,
  "scoreGapDemanda":7,
  "clusterSemantico":"texto",
  "intencaoPublico":"aprender/validar/resolver/entreter",
  "justificativaRecriabilidade":"texto",
  "justificativaOportunidade":"texto",
  "potencialModelagem":"texto"
}]}`,
        messages: [{ role: 'user', content: `Input: "${inputOriginal}"\n${listaLote}` }]
      });

      const texto = message.content[0].text.trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\r|\n|\t/g, ' ');
      const inicio = texto.indexOf('{');
      const fim = texto.lastIndexOf('}');
      if (inicio === -1 || fim === -1) continue;
      let resultado;
      try {
        resultado = JSON.parse(texto.slice(inicio, fim + 1));
      } catch {
        const sanitizado = texto.slice(inicio, fim + 1)
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/[\u2018\u2019\u201C\u201D]/g, '"');
        resultado = JSON.parse(sanitizado);
      }
      if (resultado.avaliacoes) todasAvaliacoes.push(...resultado.avaliacoes);
      console.log(`[minerador] Lote ${Math.floor(i/LOTE_SIZE) + 1} avaliado — ${lote.length} canais`);
    } catch (err) {
      console.warn(`[minerador] Falha no lote ${Math.floor(i/LOTE_SIZE) + 1}: ${err.message}`);
      console.warn(`[minerador] JSON problemático — aplicando scores neutros para ${lote.length} canais`);
      lote.forEach((_, j) => todasAvaliacoes.push({
        indice: i + j,
        scoreRecriabilidade: 50,
        scoreOportunidade: 50,
        scoreGapDemanda: 5,
        clusterSemantico: '',
        intencaoPublico: '',
        justificativaRecriabilidade: 'Avaliação automática indisponível — verificar manualmente',
        justificativaOportunidade: 'Avaliação automática indisponível — verificar manualmente',
        potencialModelagem: 'Verificar manualmente'
      }));
    }
  }
  return { avaliacoes: todasAvaliacoes };
}

async function minerarCanais(input, nicho = null) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  console.log(`[minerador] Iniciando mineração para: "${input}"`);
  console.log(`[minerador] Estratégia: tendências emergentes — até 100k inscritos, até 10 meses. Prioridade EN e ES.`);

  const { termos } = await gerarTermosDeBusca(input, nicho);
  console.log(`[minerador] Termos gerados: ${termos.join(', ')}`);

  const todosCanais = [];
  const idsVistos = new Set();

  for (const termo of termos) {
    const canaisDoTermo = await buscarCanaisPorTermo(termo, apiKey);
    for (const canal of canaisDoTermo) {
      if (!idsVistos.has(canal.id)) {
        idsVistos.add(canal.id);
        todosCanais.push(canal);
      }
    }
  }

  console.log(`[minerador] ${todosCanais.length} canais únicos encontrados`);

  // Separa por idioma para log e ordenação
  const canaisEN = todosCanais.filter(c => c._idioma?.startsWith('EN'));
  const canaisES = todosCanais.filter(c => c._idioma === 'ES');
  const canaisBR = todosCanais.filter(c => c._idioma === 'PT-BR');
  console.log(`[minerador] Distribuição: ${canaisEN.length} EN | ${canaisES.length} ES | ${canaisBR.length} PT-BR`);

  // Ordena: EN primeiro, depois ES, depois BR
  const canaisOrdenados = [...canaisEN, ...canaisES, ...canaisBR];

  // Prepara para o scorer
  const canaisParaIA = canaisOrdenados.map(canal => ({
    id: canal.id,
    nomeCanal: canal.snippet?.title || 'Sem nome',
    inscritos: parseInt(canal.statistics?.subscriberCount || 0),
    idioma: canal._idioma || 'desconhecido',
    titulosParaAnalise: [],
    canal
  }));

  // Busca vídeos em alta para cada canal
  for (const item of canaisParaIA) {
    try {
      const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: { part: 'snippet', channelId: item.id, order: 'viewCount', maxResults: 5, type: 'video', key: apiKey }
      });
      item.titulosParaAnalise = videosRes.data.items?.map(v => v.snippet.title) || [];
      item.videosEmAlta = videosRes.data.items?.map(v => ({
        titulo: v.snippet.title,
        videoId: v.id.videoId,
        url: `https://youtube.com/watch?v=${v.id.videoId}`,
        thumbnail: v.snippet.thumbnails?.medium?.url,
        views: 0
      })) || [];
    } catch {}
  }

  // Busca views reais dos vídeos em alta (batch — economiza quota)
  const todosVideoIds = canaisParaIA.flatMap(item =>
    (item.videosEmAlta || []).map(v => v.videoId).filter(Boolean)
  );
  if (todosVideoIds.length > 0) {
    const statsMap = {};
    for (let i = 0; i < todosVideoIds.length; i += 50) {
      try {
        const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: { part: 'statistics', id: todosVideoIds.slice(i, i + 50).join(','), key: apiKey }
        });
        for (const v of statsRes.data.items || []) {
          statsMap[v.id] = parseInt(v.statistics?.viewCount || 0);
        }
      } catch {}
    }
    for (const item of canaisParaIA) {
      for (const video of item.videosEmAlta || []) {
        if (video.videoId && statsMap[video.videoId] !== undefined) {
          video.views = statsMap[video.videoId];
        }
      }
    }
    console.log(`[minerador] Views reais carregados para ${Object.keys(statsMap).length} vídeos`);
  }

  const avaliacoes = await calcularScoresIA(canaisParaIA, input, nicho);

  // Monta resultado final
  const canaisQualificados = canaisParaIA.map((item, idx) => {
    const av = avaliacoes.avaliacoes?.find(a => a.indice === idx) || {};
    return {
      nomeCanal: item.nomeCanal,
      inscritos: item.inscritos,
      idioma: item.idioma,
      urlCanal: `https://youtube.com/channel/${item.id}`,
      videosEmAlta: item.videosEmAlta || [],
      scores: {
        recriabilidade: av.scoreRecriabilidade || 50,
        oportunidade: av.scoreOportunidade || 50,
        gapDemanda: av.scoreGapDemanda || 5
      },
      semantica: {
        cluster: av.clusterSemantico || '',
        intencao: av.intencaoPublico || ''
      },
      justificativas: {
        recriabilidade: av.justificativaRecriabilidade || '',
        oportunidade: av.justificativaOportunidade || '',
        potencial: av.potencialModelagem || ''
      }
    };
  });

  // Ordena por gap de demanda primeiro, depois por recriabilidade
  canaisQualificados.sort((a, b) => {
    const scoreA = (a.scores.gapDemanda * 10) + a.scores.recriabilidade;
    const scoreB = (b.scores.gapDemanda * 10) + b.scores.recriabilidade;
    return scoreB - scoreA;
  });

  return {
    canais: canaisQualificados,
    termos,
    distribuicao: { en: canaisEN.length, es: canaisES.length, br: canaisBR.length }
  };
}

module.exports = { minerarCanais };
