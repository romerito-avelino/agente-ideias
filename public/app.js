const btn = document.getElementById('btn-gerar');
const entrada = document.getElementById('entrada');
const loading = document.getElementById('loading');
const erroDiv = document.getElementById('erro');
const resultado = document.getElementById('resultado');

const listaTitulos = document.getElementById('lista-titulos');
const listaAbordagens = document.getElementById('lista-abordagens');
const sinopseDiv = document.getElementById('sinopse');
const ideiaCapaDiv = document.getElementById('ideia-capa');

function mostrarErro(msg) {
  erroDiv.textContent = msg;
  erroDiv.hidden = false;
}

function limparUI() {
  erroDiv.hidden = true;
  resultado.hidden = true;
  listaTitulos.innerHTML = '';
  listaAbordagens.innerHTML = '';
  sinopseDiv.innerHTML = '';
  ideiaCapaDiv.textContent = '';
}

function renderizarResultado(dados) {
  dados.titulos.forEach((titulo) => {
    const li = document.createElement('li');
    li.textContent = titulo;
    listaTitulos.appendChild(li);
  });

  dados.abordagens.forEach((abordagem) => {
    const li = document.createElement('li');
    li.textContent = abordagem;
    listaAbordagens.appendChild(li);
  });

  const paragrafos = dados.sinopse.split('\n\n');
  paragrafos.forEach((p) => {
    const el = document.createElement('p');
    el.textContent = p.trim();
    sinopseDiv.appendChild(el);
  });

  ideiaCapaDiv.textContent = dados.ideiaDeCapa;

  resultado.hidden = false;
}

btn.addEventListener('click', async () => {
  const valor = entrada.value.trim();
  if (!valor) {
    mostrarErro('Por favor, insira um tema ou título para gerar ideias.');
    return;
  }

  limparUI();
  btn.disabled = true;
  loading.hidden = false;

  try {
    const resposta = await fetch('/api/gerar-ideias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: valor }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro desconhecido no servidor.');
    }

    renderizarResultado(dados);
  } catch (err) {
    mostrarErro('Não foi possível gerar as ideias. Verifique sua conexão e tente novamente.');
    console.error(err);
  } finally {
    loading.hidden = true;
    btn.disabled = false;
  }
});
