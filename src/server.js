require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { gerarIdeias } = require('./agente-ideias');
const { coletarDadosVideo } = require('./coletor-youtube');
const { analisarCanal } = require('./agente-sessao-a');
const { coletarDadosCanal } = require('./coletor-youtube');

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
  const { urls, preIdeia } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Envie pelo menos uma URL de canal.' });
  }
  if (!preIdeia || preIdeia.trim() === '') {
    return res.status(400).json({ error: 'Descreva sua pré-ideia de abordagem.' });
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
    return res.status(400).json({ error: 'Não foi possível coletar dados de nenhum canal. Verifique as URLs.' });
  }
  try {
    const relatorio = await analisarCanal(dadosCanais, preIdeia);
    res.json({ dadosCanais, relatorio });
  } catch (err) {
    console.error('Erro ao analisar canais:', err.message);
    res.status(500).json({ error: 'Falha ao gerar análise. Tente novamente.' });
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
      tempoArrependimento: [], gatilhoDeIdentidade: []
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
  const { input, nichoId = 'seu-augusto' } = req.body;

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
    const atualizado = { ...nichoAtual, ...req.body };
    fs.writeFileSync(nichoPath, JSON.stringify(atualizado, null, 2), 'utf-8');
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao salvar alterações.' });
  }
});

app.delete('/api/nicho/:nichoId', (req, res) => {
  const { nichoId } = req.params;
  if (nichoId === 'seu-augusto') {
    return res.status(400).json({ error: 'O nicho padrão não pode ser deletado.' });
  }
  const nichoPath = path.join(NICHOS_DIR, `${nichoId}.json`);
  if (!fs.existsSync(nichoPath)) return res.status(404).json({ error: 'Nicho não encontrado.' });
  try {
    fs.unlinkSync(nichoPath);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao deletar nicho.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
