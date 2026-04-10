require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function gerarTermosDeBusca(input) {
  let contextoEnriquecido = input;

  const isUrl = input.includes('youtube.com') || input.includes('youtu.be');
  if (isUrl) {
    try {
      const regexCanal = /youtube\.com\/@([^/?&\s/]+)/;
      const match = input.match(regexCanal);
      if (match) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: { part: 'snippet', q: match[1], type: 'channel', maxResults: 1, key: apiKey }
        });
        const channelId = searchRes.data.items?.[0]?.id?.channelId;
        if (channelId) {
          const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', channelId, order: 'viewCount', maxResults: 5, type: 'video', key: apiKey }
          });
          const titulos = videosRes.data.items?.map(v => v.snippet.title) || [];
          const canalRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'snippet', id: channelId, key: apiKey }
          });
          const descricao = canalRes.data.items?.[0]?.snippet?.description?.substring(0, 200) || '';
          contextoEnriquecido = `Canal de referência: ${match[1]}. Descrição: ${descricao}. Vídeos mais populares: ${titulos.join(' | ')}`;
          console.log(`[minerador] URL detectada — contexto extraído do canal: ${match[1]}`);
        }
      }
    } catch (err) {
      console.warn(`[minerador] Não foi possível extrair contexto da URL: ${err.message}`);
    }
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    system: `Você é especialista em canais de YouTube no nicho de histórias. Dado um tema ou contexto de canal, gere termos de busca em português, inglês e espanhol para encontrar canais similares com potencial de modelagem para histórias com avatar. Retorne APENAS um JSON: { "termos": ["termo pt 1", "termo pt 2", "termo en 1", "termo en 2", "termo es 1"] }. Os termos devem ser específicos ao estilo e tema identificado, não genéricos.`,
    messages: [{ role: 'user', content: `Contexto: ${contextoEnriquecido}` }]
  });

  const texto = message.content[0].text.trim();
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  return JSON.parse(texto.slice(inicio, fim + 1));
}

async function buscarCanaisPorTermo(termo, apiKey) {
  const buscas = await Promise.allSettled([
    axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: termo, type: 'channel', maxResults: 8, relevanceLanguage: 'pt', regionCode: 'BR', key: apiKey }
    }),
    axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: termo, type: 'channel', maxResults: 8, relevanceLanguage: 'en', regionCode: 'US', key: apiKey }
    }),
    axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: termo + ' historias', type: 'channel', maxResults: 8, relevanceLanguage: 'es', regionCode: 'ES', key: apiKey }
    })
  ]);
  const ids = new Set();
  buscas.forEach(b => {
    if (b.status === 'fulfilled') {
      b.value.data.items?.forEach(item => ids.add(item.snippet.channelId));
    }
  });
  return [...ids];
}

async function coletarDadosCanal(channelId, apiKey) {
  const canalRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics,contentDetails', id: channelId, key: apiKey }
  });

  const canal = canalRes.data.items?.[0];
  if (!canal) return null;

  const inscritos = parseInt(canal.statistics?.subscriberCount || 0);
  if (inscritos > 100000) {
    console.log(`[minerador] Canal descartado (${inscritos.toLocaleString()} inscritos — limite 100k): ${canal.snippet?.title}`);
    return null;
  }

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

  // Parâmetro 3: vídeo mais antigo com até 8 meses
  const datas = videos.map(v => new Date(v.data)).sort((a, b) => a - b);
  const videoMaisAntigo = datas[0];
  const mesesDesdeInicio = (Date.now() - videoMaisAntigo.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (mesesDesdeInicio > 8) {
    console.log(`[minerador] Canal descartado (${Math.round(mesesDesdeInicio)} meses — limite 8): ${canal.snippet.title}`);
    return null;
  }

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

async function calcularScoresIA(canais, inputOriginal) {
  const LOTE_SIZE = 5;
  const todasAvaliacoes = [];

  for (let i = 0; i < canais.length; i += LOTE_SIZE) {
    const lote = canais.slice(i, i + LOTE_SIZE);
    const listaLote = lote.map((c, j) => `${i + j}|${c.nomeCanal}|${c.titulosParaAnalise.slice(0, 3).join('|')}`).join('\n');

    try {
      const message = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 400,
        system: `Avalie canais para modelagem em histórias com avatar idoso. Retorne APENAS JSON. Máximo 50 chars por campo de texto. Formato: {"avaliacoes":[{"indice":0,"scoreRecriabilidade":75,"scoreOportunidade":80,"justificativaRecriabilidade":"texto","justificativaOportunidade":"texto","potencialModelagem":"texto"}]}`,
        messages: [{
          role: 'user',
          content: `Input: "${inputOriginal}"\n${listaLote}`
        }]
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

      if (resultado.avaliacoes) {
        todasAvaliacoes.push(...resultado.avaliacoes);
      }
      console.log(`[minerador] Lote ${Math.floor(i/LOTE_SIZE) + 1} avaliado — ${lote.length} canais`);
    } catch (err) {
      console.warn(`[minerador] Falha no lote ${Math.floor(i/LOTE_SIZE) + 1}: ${err.message}`);
      lote.forEach((_, j) => todasAvaliacoes.push({
        indice: i + j,
        scoreRecriabilidade: 50,
        scoreOportunidade: 50,
        justificativaRecriabilidade: 'Avaliação indisponível',
        justificativaOportunidade: 'Avaliação indisponível',
        potencialModelagem: 'Verificar manualmente'
      }));
    }
  }

  return { avaliacoes: todasAvaliacoes };
}

async function minerarCanais(input) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  console.log(`[minerador] Iniciando mineração para: "${input}"`);

  const { termos } = await gerarTermosDeBusca(input);
  console.log(`[minerador] Termos gerados: ${termos.join(', ')}`);

  const channelIdsSet = new Set();
  for (const termo of termos.slice(0, 3)) {
    try {
      const ids = await buscarCanaisPorTermo(termo, apiKey);
      ids.forEach(id => channelIdsSet.add(id));
    } catch (err) {
      console.warn(`[minerador] Busca falhou para "${termo}": ${err.message}`);
    }
  }

  console.log(`[minerador] ${channelIdsSet.size} canais únicos encontrados`);

  const canaisColetados = [];
  for (const channelId of channelIdsSet) {
    try {
      const dados = await coletarDadosCanal(channelId, apiKey);
      if (dados) {
        canaisColetados.push(dados);
        console.log(`[minerador] ✓ ${dados.nomeCanal} — ${dados.inscritos} inscritos, ${dados.mesesAtivo} meses`);
      }
    } catch (err) {
      console.warn(`[minerador] Falha ao coletar canal ${channelId}: ${err.message}`);
    }
  }

  if (canaisColetados.length === 0) {
    throw new Error('Nenhum canal encontrado dentro dos parâmetros. Tente outro tema ou título.');
  }

  const canaisParaIA = canaisColetados
    .sort((a, b) => (b.scoreDemanda + b.scoreConstancia) - (a.scoreDemanda + a.scoreConstancia))
    .slice(0, 15);

  const avaliacoes = await calcularScoresIA(canaisParaIA, input);

  const canaisFinais = canaisParaIA.map((canal, i) => {
    const avaliacao = avaliacoes.avaliacoes?.find(a => a.indice === i) || {};
    const scoreRecriabilidade = avaliacao.scoreRecriabilidade || 50;
    const scoreOportunidade = avaliacao.scoreOportunidade || 50;
    const scorePotencial = Math.round(
      canal.scoreDemanda * 0.30 +
      canal.scoreConstancia * 0.25 +
      scoreRecriabilidade * 0.25 +
      scoreOportunidade * 0.20
    );
    return {
      ...canal,
      scoreRecriabilidade,
      scoreOportunidade,
      scorePotencial,
      justificativaRecriabilidade: avaliacao.justificativaRecriabilidade || '',
      justificativaOportunidade: avaliacao.justificativaOportunidade || '',
      potencialModelagem: avaliacao.potencialModelagem || ''
    };
  });

  const qualificados = canaisFinais
    .filter(c => c.scorePotencial >= 60)
    .sort((a, b) => b.scorePotencial - a.scorePotencial)
    .slice(0, 10);

  console.log(`[minerador] ${qualificados.length} canais qualificados`);
  return { termos, totalEncontrados: canaisColetados.length, canais: qualificados };
}

module.exports = { minerarCanais };
