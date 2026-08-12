/**
 * DNA DO AGENTE-IDEIAS
 * --------------------
 * Este arquivo guarda a FILOSOFIA FIXA do agente — o que vale para TODOS os
 * canais, sempre. Ele NÃO define nada específico de um canal (isso vive no
 * JSON de cada canal, em src/data/nichos/*.json).
 *
 * PRINCÍPIO DE OURO: o DNA direciona; o CANAL especifica.
 * Sempre que houver um dado no JSON do canal (idade, dores, tom, avatar),
 * esse dado tem prioridade sobre o DNA. O DNA nunca crava número de idade.
 *
 * Para ajustar a estratégia geral do agente, mude AQUI — em um lugar só —
 * e todos os motores (ideias, canais) acompanham automaticamente.
 */

const DNA = {
  // Direcionamento de público — qualitativo, SEM número cravado.
  publico:
    'Público mais velho / maduro. A idade exata, o perfil e as dores vêm ' +
    'SEMPRE do JSON de cada canal — este DNA nunca crava faixa de idade.',

  // Formato central do conteúdo.
  formato:
    'Histórias documentais: narrativas em primeira pessoa (causos do avatar) ' +
    'embasadas em notícias, estudos, dados reais e/ou na biografia do avatar ' +
    'do canal. A história é o veículo; o valor é o destino.',

  // Método de origem das ideias (recriabilidade / arbitragem de conteúdo).
  metodo:
    'RECRIABILIDADE: a matéria-prima vem de vídeos de ALTA demanda e BAIXA ' +
    'concorrência, de QUALQUER nicho. A tarefa é ADAPTAR o tema para o público ' +
    'e o formato do canal — nunca copiar. Traduza a dor ou o tema para a ' +
    'realidade e a linguagem do avatar. Um tema de qualquer área pode virar ' +
    'história documental para o público mais velho, se for bem adaptado.',

  // O que a narrativa deve entregar (edutainment).
  valor:
    'Dentro de cada história, agregue valor real: fatos, pesquisas, dados, ' +
    'soluções para dores concretas e um ensinamento útil. Entreter e ensinar ' +
    'ao mesmo tempo — nunca só emoção vazia, nunca só dado frio.',

  // Regra de verdade (definida com o criador) — o que a persona pode narrar.
  regraDeVerdade:
    'NUNCA invente histórias FORA do contexto de vida do avatar. DENTRO do ' +
    'contexto biográfico do avatar, você PODE enriquecer e detalhar os ' +
    'acontecimentos de forma plausível. PROIBIDO: eventos impossíveis, ' +
    'fantasiosos ou que contradigam a biografia definida no canal.',
};

/**
 * Monta o bloco de texto do DNA para injetar no início dos prompts de sistema.
 * Os motores chamam esta função em vez de escrever o direcionamento na mão.
 */
function blocoDNA() {
  return `═══════════ DNA DO AGENTE (filosofia fixa) ═══════════
PÚBLICO: ${DNA.publico}
FORMATO: ${DNA.formato}
MÉTODO: ${DNA.metodo}
VALOR: ${DNA.valor}
REGRA DE VERDADE: ${DNA.regraDeVerdade}

LEMBRETE: este DNA é o direcionamento geral. Os dados específicos do canal
(que vêm a seguir) SEMPRE têm prioridade sobre qualquer generalização acima.`;
}

module.exports = { DNA, blocoDNA };