require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { gerarIdeias } = require('./agente-ideias');
const { coletarDadosVideo } = require('./coletor-youtube');
const { analisarCanal, revisarCanal } = require('./agente-sessao-a');
const { coletarDadosCanal } = require('./coletor-youtube');
const { minerarCanais } = require('./agente-minerador');
const { gerarPacoteRoteirista } = require('./gerador-pacote');

const app = express();
const PORT = process.env.PORT || 3000;
const NICHOS_DIR = path.join(__dirname, 'data/nichos');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', message: 'Agente-Ideias rodando' });
});

app.get('/api/nichos', (_req, res) => {
  try {
    const arquivos = fs.readdirSync(NICHOS_DIR).filter(f => f.endsWith('.json'));
    const nichos = arquivos.map(arquivo => {
      const id = arquivo.replace('.json', '');
      const dados = JSON.parse(fs.readFileSync(path.join(NICHOS_DIR, arquivo), 'utf-8'));
      return { id, nome: dados.canal, nicho: dados.nicho };
    });
    res.json(nichos);
  } catch (err) {
    console.error('Erro ao listar nichos:', err.message);
    res.status(500).json({ error: 'Falha ao listar nichos disponíveis.' });
  }
});

app.get('/api/historico/:nichoId', (req, res) => {
  const { nichoId } = req.params;
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) {
    return res.json([]);
  }
  try {
    const nicho = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    res.json(nicho.historicoGeracoes || []);
  } catch {
    res.json([]);
  }
});

app.post('/api/analisar-canais', async (req, res) => {
  const { urls, preIdeia, nichoId } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Envie pelo menos uma URL de canal.' });
  }
  if (!preIdeia || preIdeia.trim() === '') {
    return res.status(400).json({ error: 'Descreva sua pré-ideia de abordagem.' });
  }
  let nichoAtual = null;
  if (nichoId) {
    try {
      const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
      if (fs.existsSync(nichoPath)) nichoAtual = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    } catch {}
  }
  const dadosCanais = [];
  for (const url of urls) {
    try {
      const dados = await coletarDadosCanal(url);
      dadosCanais.push(dados);
      console.log(`[server] Canal coletado: ${dados.nomeCanal}`);
    } catch (err) {
      console.warn(`[server] Falha ao coletar canal "${url}": ${err.message}`);
    }
  }
  if (dadosCanais.length === 0) {
    return res.status(400).json({ error: 'Não foi possível coletar dados de nenhum canal.' });
  }
  try {
    const relatorio = await analisarCanal(dadosCanais, preIdeia, nichoAtual);
    res.json({ dadosCanais, relatorio });
  } catch (err) {
    console.error('Erro ao analisar canais:', err.message);
    res.status(500).json({ error: 'Falha ao gerar análise.' });
  }
});

app.post('/api/criar-canal', (req, res) => {
  const { id, canal, nicho, avatar, publicoAlvo, tom, formatoDeVideo } = req.body;
  if (!id || !canal) {
    return res.status(400).json({ error: 'ID e nome do canal são obrigatórios.' });
  }
  const nichoPath = path.join(NICHOS_DIR, `${id}.json`);
  if (fs.existsSync(nichoPath)) {
    return res.status(400).json({ error: 'Já existe um canal com esse ID. Escolha outro nome.' });
  }
  const novoNicho = {
    canal, nicho, avatar, publicoAlvo, tom, formatoDeVideo,
    temasFuncionaram: [], temasProibidos: [], videosPublicados: [],
    padroesDosComentarios: [], palavrasQueEngajam: [],
    gatilhosQueConvertem: [], estruturasDeTitulos: {
      instrucao: 'Use essas estruturas como moldes.',
      confissaoVulnerabilidade: [], consequenciaVirada: [],
      endereçamentoDireto: [], revelacaoSegredo: [],
      tempoArrependimento: [], gatilhoDeIdentidade: [],
      funcionais: []
    },
    identidadeSemantica: {
      perguntaCentral: '',
      estadoDeIntencao: '',
      clusterSemantico: '',
      padraoDeSessao: '',
      scoreDeGapDemanda: 0,
      saturacaoDoCluster: '',
      momentoIdealDeConsumo: ''
    },
    historicoGeracoes: []
  };
  try {
    fs.writeFileSync(nichoPath, JSON.stringify(novoNicho, null, 2), 'utf-8');
    console.log(`[server] Canal criado: ${canal} (${id})`);
    res.json({ sucesso: true, id, canal });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao salvar o canal.' });
  }
});

app.post('/api/gerar-ideias', async (req, res) => {
  const { input, nichoId } = req.body;

  if (!nichoId || nichoId.trim() === '') {
    return res.status(400).json({ error: 'Selecione um canal antes de gerar ideias.' });
  }

  if (!input || typeof input !== 'string' || input.trim() === '') {
    return res.status(400).json({ error: 'O campo "input" é obrigatório.' });
  }

  let inputParsed;
  try {
    inputParsed = JSON.parse(input.trim());
  } catch {
    return res.status(400).json({ error: 'O campo "input" deve ser um JSON válido.' });
  }

  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) {
    return res.status(400).json({ error: `Nicho "${nichoId}" não encontrado.` });
  }

  let nicho;
  try {
    nicho = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar o nicho selecionado.' });
  }

  const videos = inputParsed.videos || [];
  const dadosVideos = [];

  for (const url of videos) {
    try {
      const dados = await coletarDadosVideo(url);
      dadosVideos.push(dados);
      console.log(`[server] Dados coletados para: ${url} (${dados.titulo})`);
    } catch (err) {
      console.warn(`[server] Falha ao coletar dados de "${url}":`, err.message);
    }
  }

  const inputEnriquecido = JSON.stringify({
    ...inputParsed,
    dadosVideos,
  });

  const historico = nicho.historicoGeracoes || [];

  try {
    const resultado = await gerarIdeias(inputEnriquecido, nicho, historico);

    const registro = {
      data: new Date().toISOString(),
      temas: inputParsed.temas || [],
      titulosGerados: resultado.titulos,
      anguloProibido: inputParsed.anguloProibido || null,
    };
    nicho.historicoGeracoes = [...historico, registro].slice(-20);
    fs.writeFileSync(nichoPath, JSON.stringify(nicho, null, 2), 'utf-8');

    res.json(resultado);
  } catch (err) {
    console.error('Erro ao gerar ideias:', err.message);
    res.status(500).json({ error: 'Falha ao gerar ideias. Tente novamente.' });
  }
});

app.get('/api/nicho/:nichoId', (req, res) => {
  const { nichoId } = req.params;
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) return res.status(404).json({ error: 'Nicho não encontrado.' });
  try {
    const nicho = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    res.json(nicho);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao carregar nicho.' });
  }
});

app.put('/api/nicho/:nichoId', (req, res) => {
  const { nichoId } = req.params;
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) return res.status(404).json({ error: 'Nicho não encontrado.' });
  try {
    const nichoAtual = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    const atualizado = {
      ...nichoAtual,
      ...req.body,
      historicoGeracoes: nichoAtual.historicoGeracoes || [],
      estrategia: nichoAtual.estrategia || req.body.estrategia || {},
      estruturasDeTitulos: nichoAtual.estruturasDeTitulos || req.body.estruturasDeTitulos || {}
    };
    fs.writeFileSync(nichoPath, JSON.stringify(atualizado, null, 2), 'utf-8');
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao salvar alterações.' });
  }
});

app.put('/api/nicho/:nichoId/estrategia', (req, res) => {
  const { nichoId } = req.params;
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) {
    return res.status(404).json({ error: 'Nicho não encontrado.' });
  }
  try {
    const nichoAtual = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    const novos = req.body;

    // Merge profundo — preserva tudo que existe, atualiza só o que veio preenchido
    const atualizado = {
      ...nichoAtual,

      // Campos básicos — só atualiza se veio preenchido
      canal: novos.canal || nichoAtual.canal,
      nicho: novos.nicho || nichoAtual.nicho,

      // Avatar — merge campo por campo
      avatar: {
        ...nichoAtual.avatar,
        nome: novos.avatar?.nome || nichoAtual.avatar?.nome,
        idade: novos.avatar?.idade || nichoAtual.avatar?.idade,
        personalidade: novos.avatar?.personalidade || nichoAtual.avatar?.personalidade,
        estiloDeEscrita: novos.avatar?.estiloDeEscrita || nichoAtual.avatar?.estiloDeEscrita,
        jeitoDeFalar: nichoAtual.avatar?.jeitoDeFalar || [],
        historia: {
          ...nichoAtual.avatar?.historia,
          profissao: novos.avatar?.historia?.profissao || nichoAtual.avatar?.historia?.profissao,
          familia: novos.avatar?.historia?.familia || nichoAtual.avatar?.historia?.familia,
          estiloDeVida: novos.avatar?.historia?.estiloDeVida || nichoAtual.avatar?.historia?.estiloDeVida,
          biografia: novos.avatar?.historia?.biografia || nichoAtual.avatar?.historia?.biografia
        }
      },

      // Público — merge campo por campo
      publicoAlvo: {
        ...nichoAtual.publicoAlvo,
        faixaEtaria: novos.publicoAlvo?.faixaEtaria || nichoAtual.publicoAlvo?.faixaEtaria,
        perfil: novos.publicoAlvo?.perfil || nichoAtual.publicoAlvo?.perfil,
        dores: novos.publicoAlvo?.dores?.length > 0 ? novos.publicoAlvo.dores : nichoAtual.publicoAlvo?.dores || [],
        desejos: novos.publicoAlvo?.desejos?.length > 0 ? novos.publicoAlvo.desejos : nichoAtual.publicoAlvo?.desejos || []
      },

      // Tom — só atualiza se veio com itens
      tom: {
        permitido: novos.tom?.permitido?.length > 0
          ? novos.tom.permitido
          : nichoAtual.tom?.permitido || [],
        proibido: novos.tom?.proibido?.length > 0
          ? novos.tom.proibido
          : nichoAtual.tom?.proibido || []
      },

      // Formato — merge campo por campo
      formatoDeVideo: {
        ...nichoAtual.formatoDeVideo,
        duracaoIdeal: novos.formatoDeVideo?.duracaoIdeal || nichoAtual.formatoDeVideo?.duracaoIdeal,
        estiloDeNarracao: novos.formatoDeVideo?.estiloDeNarracao || nichoAtual.formatoDeVideo?.estiloDeNarracao,
        estrutura: nichoAtual.formatoDeVideo?.estrutura || []
      },

      // Campos de aprendizado — NUNCA sobrescreve, sempre preserva
      temasFuncionaram: nichoAtual.temasFuncionaram || [],
      temasProibidos: nichoAtual.temasProibidos || [],
      videosPublicados: nichoAtual.videosPublicados || [],
      padroesDosComentarios: nichoAtual.padroesDosComentarios || [],
      palavrasQueEngajam: nichoAtual.palavrasQueEngajam || [],
      gatilhosQueConvertem: nichoAtual.gatilhosQueConvertem || [],
      estruturasDeTitulos: nichoAtual.estruturasDeTitulos || {},
      historicoGeracoes: nichoAtual.historicoGeracoes || [],
      ultimaRevisao: nichoAtual.ultimaRevisao || null,

      // Estratégia — só atualiza se veio uma nova análise
      estrategia: novos.estrategia?.dataAnalise
        ? novos.estrategia
        : nichoAtual.estrategia || {}
    };

    fs.writeFileSync(nichoPath, JSON.stringify(atualizado, null, 2), 'utf-8');
    console.log(`[server] Canal atualizado com merge seguro: ${atualizado.canal}`);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao atualizar canal.' });
  }
});

app.delete('/api/nicho/:nichoId', (req, res) => {
  const { nichoId } = req.params;
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) return res.status(404).json({ error: 'Nicho não encontrado.' });
  try {
    fs.unlinkSync(nichoPath);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao deletar nicho.' });
  }
});

app.post('/api/nicho/:nichoId/titulo-funcionou', (req, res) => {
  const { nichoId } = req.params;
  const { titulo, estrutura } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título obrigatório.' });
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) return res.status(404).json({ error: 'Nicho não encontrado.' });
  try {
    const nicho = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    if (!nicho.estruturasDeTitulos) nicho.estruturasDeTitulos = {};
    const funcionais = nicho.estruturasDeTitulos.funcionais || [];
    const entrada = estrutura ? `${titulo} [${estrutura}]` : titulo;
    if (!funcionais.includes(entrada)) {
      funcionais.push(entrada);
      nicho.estruturasDeTitulos.funcionais = funcionais;
      fs.writeFileSync(nichoPath, JSON.stringify(nicho, null, 2), 'utf-8');
      console.log(`[server] Título registrado como funcionou: "${titulo}"`);
    }
    res.json({ sucesso: true, total: funcionais.length });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao registrar título.' });
  }
});

app.post('/api/revisar-canal', async (req, res) => {
  const { nichoId, ...dadosRevisao } = req.body;
  if (!dadosRevisao.propostaEscolhida || !dadosRevisao.avatar?.nome) {
    return res.status(400).json({ error: 'Selecione uma proposta e preencha os dados do avatar antes de revisar.' });
  }
  let nichoAtual = null;
  if (nichoId) {
    try {
      const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
      if (fs.existsSync(nichoPath)) nichoAtual = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    } catch {}
  }
  try {
    const revisao = await revisarCanal(dadosRevisao, nichoAtual);
    res.json(revisao);
  } catch (err) {
    console.error('Erro na revisão:', err.message);
    res.status(500).json({ error: 'Falha na revisão.' });
  }
});

app.post('/api/mineracao', async (req, res) => {
  const { input, nichoId } = req.body;
  if (!input || input.trim() === '') {
    return res.status(400).json({ error: 'Digite um tema, título ou cole uma URL para iniciar a mineração.' });
  }
  let nichoAtual = null;
  if (nichoId) {
    try {
      const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
      if (fs.existsSync(nichoPath)) nichoAtual = JSON.parse(fs.readFileSync(nichoPath, 'utf-8'));
    } catch {}
  }
  try {
    const resultado = await minerarCanais(input.trim(), nichoAtual);
    res.json(resultado);
  } catch (err) {
    console.error('[minerador] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gerar-pacote', async (req, res) => {
  const pacote = req.body;
  if (!pacote.tituloEscolhido || !pacote.estruturaEscolhida) {
    return res.status(400).json({ error: 'Título e estrutura são obrigatórios para gerar o pacote.' });
  }
  try {
    // Busca dados dos vídeos de referência para incluir no .docx
    const urlsVideos = pacote.urlsVideosReferencia || [];
    const videosReferencia = [];
    for (const url of urlsVideos) {
      try {
        const dados = await coletarDadosVideo(url);
        // Pega a thumbnail de maior qualidade disponível
        const thumbUrl = dados.thumbnail || null;
        videosReferencia.push({ ...dados, thumbnail: thumbUrl });
        console.log(`[pacote] Vídeo coletado para .docx: ${dados.titulo}`);
      } catch (err) {
        console.warn(`[pacote] Falha ao coletar vídeo ${url}: ${err.message}`);
      }
    }
    pacote.videosReferencia = videosReferencia;
    const { nomeArquivo } = await gerarPacoteRoteirista(pacote);

    // Limpa pacotes antigos — mantém apenas os 20 mais recentes
    try {
      const pacotesDir = path.join(__dirname, '..', 'pacotes');
      const arquivos = fs.readdirSync(pacotesDir)
        .filter(f => f.endsWith('.docx'))
        .map(f => ({ nome: f, tempo: fs.statSync(path.join(pacotesDir, f)).mtimeMs }))
        .sort((a, b) => b.tempo - a.tempo);
      arquivos.slice(20).forEach(f => {
        try { fs.unlinkSync(path.join(pacotesDir, f.nome)); } catch {}
      });
    } catch {}

    res.json({ sucesso: true, nomeArquivo, downloadUrl: `/pacotes/${nomeArquivo}` });
  } catch (err) {
    console.error('[pacote] Erro:', err.message);
    res.status(500).json({ error: 'Falha ao gerar o pacote. Tente novamente.' });
  }
});

app.use('/pacotes', express.static(path.join(__dirname, '..', 'pacotes')));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
