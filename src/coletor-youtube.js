require('dotenv').config();
const axios = require('axios');

function extrairVideoId(url) {
  const regexes = [
    /(?:youtube\.com\/watch\?v=)([^&\s]{11})/,
    /(?:youtu\.be\/)([^?\s]{11})/,
    /(?:youtube\.com\/shorts\/)([^?\s]{11})/,
    /(?:youtube\.com\/embed\/)([^?\s]{11})/
  ];
  for (const regex of regexes) {
    const match = url.match(regex);
    if (match) return match[1];
  }
  throw new Error('URL inválida. Use um link de vídeo do YouTube.');
}

async function buscarTranscricao(videoId) {
  // Estratégia 1: youtube-transcript via import dinâmico
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const segmentos = await YoutubeTranscript.fetchTranscript(videoId);
    const texto = segmentos.map(s => s.text).join(' ').trim();
    if (texto) {
      console.log(`[coletor] Transcrição OK via youtube-transcript — ${texto.length} caracteres`);
      return texto;
    }
  } catch (err1) {
    console.log(`[coletor] Estratégia 1 falhou: ${err1.message}`);
  }

  // Estratégia 2: buscar legendas via URL direta da API do YouTube
  try {
    const res = await axios.get(
      `https://www.googleapis.com/youtube/v3/captions`,
      { params: { part: 'snippet', videoId, key: process.env.YOUTUBE_API_KEY } }
    );
    const legendas = res.data.items || [];
    const legenda = legendas.find(l =>
      l.snippet.language === 'pt' || l.snippet.language === 'pt-BR'
    ) || legendas[0];
    if (legenda) {
      console.log(`[coletor] Legenda encontrada: ${legenda.snippet.name} (${legenda.snippet.language})`);
      return `Legenda disponível no idioma: ${legenda.snippet.language} — acesso via OAuth necessário para texto completo`;
    }
  } catch (err2) {
    console.log(`[coletor] Estratégia 2 falhou: ${err2.message}`);
  }

  // Estratégia 3: extrair descrição expandida como substituto da transcrição
  try {
    const res = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos`,
      { params: { part: 'snippet', id: videoId, key: process.env.YOUTUBE_API_KEY } }
    );
    const descricao = res.data.items?.[0]?.snippet?.description || '';
    if (descricao.length > 100) {
      console.log(`[coletor] Usando descrição como contexto — ${descricao.length} caracteres`);
      return `[SEM TRANSCRIÇÃO — USANDO DESCRIÇÃO DO VÍDEO]: ${descricao}`;
    }
  } catch (err3) {
    console.log(`[coletor] Estratégia 3 falhou: ${err3.message}`);
  }

  console.log(`[coletor] Nenhuma transcrição disponível para ${videoId}`);
  return 'Transcrição não disponível';
}

async function buscarMetadados(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos`;
  const res = await axios.get(url, {
    params: {
      part: 'snippet,statistics',
      id: videoId,
      key: process.env.YOUTUBE_API_KEY
    }
  });
  const item = res.data.items?.[0];
  if (!item) throw new Error('Vídeo não encontrado na API');
  return {
    titulo: item.snippet.title,
    canal: item.snippet.channelTitle,
    descricao: item.snippet.description?.substring(0, 500),
    views: item.statistics.viewCount,
    likes: item.statistics.likeCount,
    totalComentarios: item.statistics.commentCount
  };
}

async function buscarComentarios(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads`;
  const res = await axios.get(url, {
    params: {
      part: 'snippet',
      videoId: videoId,
      maxResults: 50,
      order: 'relevance',
      key: process.env.YOUTUBE_API_KEY
    }
  });
  return res.data.items.map(item =>
    item.snippet.topLevelComment.snippet.textDisplay
  );
}

async function coletarDadosVideo(url) {
  const videoId = extrairVideoId(url);
  console.log(`[coletor] Iniciando coleta para videoId: ${videoId}`);

  const [transcricaoResult, metadadosResult, comentariosResult] = await Promise.allSettled([
    buscarTranscricao(videoId),
    buscarMetadados(videoId),
    buscarComentarios(videoId)
  ]);

  const transcricao = transcricaoResult.status === 'fulfilled'
    ? transcricaoResult.value
    : 'Transcrição não disponível';

  const metadados = metadadosResult.status === 'fulfilled'
    ? metadadosResult.value
    : null;

  if (metadadosResult.status === 'rejected') {
    console.log(`[coletor] Metadados falhou: ${metadadosResult.reason?.message}`);
  }

  const comentarios = comentariosResult.status === 'fulfilled'
    ? comentariosResult.value
    : [];

  if (comentariosResult.status === 'rejected') {
    console.log(`[coletor] Comentários falhou: ${comentariosResult.reason?.message}`);
  }

  console.log(`[coletor] Coleta finalizada — transcrição: ${transcricao !== 'Transcrição não disponível' ? 'OK' : 'indisponível'}, metadados: ${metadados ? 'OK' : 'falhou'}, comentários: ${comentarios.length}`);

  return {
    videoId,
    titulo: metadados?.titulo || 'Título não disponível',
    canal: metadados?.canal || 'Canal não disponível',
    descricao: metadados?.descricao || '',
    metricas: {
      views: metadados?.views || 0,
      likes: metadados?.likes || 0,
      totalComentarios: metadados?.totalComentarios || 0
    },
    transcricao,
    comentarios
  };
}

async function coletarDadosCanal(url) {
  const regexes = [
    /youtube\.com\/@([^/?&\s]+)/,
    /youtube\.com\/channel\/([^/?&\s]+)/,
    /youtube\.com\/c\/([^/?&\s]+)/,
    /youtube\.com\/user\/([^/?&\s]+)/
  ];

  let channelIdentifier = null;
  let isHandle = false;

  for (let i = 0; i < regexes.length; i++) {
    const match = url.match(regexes[i]);
    if (match) {
      channelIdentifier = match[1];
      isHandle = i === 0;
      break;
    }
  }

  if (!channelIdentifier) throw new Error('URL de canal inválida. Use youtube.com/@canal ou youtube.com/channel/ID');

  const key = process.env.YOUTUBE_API_KEY;

  // Busca o channelId pelo handle ou nome
  let channelId = channelIdentifier;
  if (isHandle) {
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: channelIdentifier, type: 'channel', maxResults: 1, key }
    });
    channelId = searchRes.data.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error('Canal não encontrado no YouTube');
  }

  // Dados gerais do canal
  const canalRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics,contentDetails', id: channelId, key }
  });
  const canal = canalRes.data.items?.[0];
  if (!canal) throw new Error('Canal não encontrado');

  const playlistId = canal.contentDetails?.relatedPlaylists?.uploads;
  const dataCriacao = canal.snippet?.publishedAt;
  const nomeCanal = canal.snippet?.title;
  const descricaoCanal = canal.snippet?.description?.substring(0, 300);
  const totalInscritos = canal.statistics?.subscriberCount;
  const totalVideos = canal.statistics?.videoCount;
  const totalViews = canal.statistics?.viewCount;

  // Busca IDs dos vídeos recentes
  const playlistRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
    params: { part: 'contentDetails', playlistId, maxResults: 20, key }
  });
  const videoIds = playlistRes.data.items?.map(i => i.contentDetails.videoId) || [];

  // Busca métricas de todos os vídeos
  const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { part: 'snippet,statistics', id: videoIds.join(','), key }
  });

  const todosVideos = videosRes.data.items?.map(v => ({
    titulo: v.snippet.title,
    data: v.snippet.publishedAt,
    views: parseInt(v.statistics.viewCount || 0),
    likes: parseInt(v.statistics.likeCount || 0),
    comentarios: parseInt(v.statistics.commentCount || 0),
    url: `https://youtube.com/watch?v=${v.id}`
  })) || [];

  // Separa vídeos em alta (top 5 por views) e recentes (últimos 5)
  const emAlta = [...todosVideos].sort((a, b) => b.views - a.views).slice(0, 5);
  const recentes = [...todosVideos].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);

  console.log(`[coletor] Canal coletado: ${nomeCanal} — ${totalVideos} vídeos, ${totalInscritos} inscritos`);

  return {
    channelId,
    nomeCanal,
    descricaoCanal,
    dataCriacao,
    metricas: { totalInscritos, totalVideos, totalViews },
    emAlta,
    recentes
  };
}

module.exports = { coletarDadosVideo, coletarDadosCanal };
