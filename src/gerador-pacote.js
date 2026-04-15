const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
  BorderStyle, LevelFormat } = require('docx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function downloadImagem(url) {
  return new Promise((resolve) => {
    const protocolo = url.startsWith('https') ? https : http;
    protocolo.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

function criarSeparador() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563EB', space: 1 } },
    spacing: { before: 200, after: 200 }
  });
}

function criarComentario(texto) {
  return new Paragraph({
    children: [new TextRun({
      text: `[INSTRUÇÃO PARA O AGENTE-ROTEIRISTA: ${texto}]`,
      italics: true, color: '6B7280', size: 18
    })],
    spacing: { before: 80, after: 80 }
  });
}

function criarLabel(texto) {
  return new Paragraph({
    children: [new TextRun({ text: texto.toUpperCase(), bold: true, size: 18, color: '2563EB', font: 'Arial' })],
    spacing: { before: 160, after: 60 }
  });
}

function criarTexto(texto, opcoes = {}) {
  return new Paragraph({
    children: [new TextRun({ text: texto || '—', size: 22, font: 'Arial', ...opcoes })],
    spacing: { before: 40, after: 40 }
  });
}

function criarItem(texto) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: texto, size: 22, font: 'Arial' })],
    spacing: { before: 40, after: 40 }
  });
}

async function gerarPacoteRoteirista(pacote) {
  const {
    nicho, avatar, tituloEscolhido, sinopse, ideiaDeCapa,
    gatilhos, ganchos, estruturaEscolhida,
    hookPessoal, ensinamentoProprio, ctaEspecifico,
    observacoesAdicionais
  } = pacote;

  const children = [
    // REFERÊNCIAS VISUAIS E COMENTÁRIOS — seção 0
    ...(pacote.videosReferencia && pacote.videosReferencia.length > 0 ? [
      new Paragraph({
        text: 'REFERÊNCIAS VISUAIS E PADRÕES DO PÚBLICO',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 }
      }),
      criarComentario('Esta seção contém os vídeos usados como referência na geração das ideias. Use as thumbnails para entender o padrão visual da concorrência e os comentários para entender o que o público realmente quer.'),
      ...await Promise.all((pacote.videosReferencia || []).map(async (video, i) => {
        const blocos = [
          new Paragraph({
            children: [new TextRun({ text: `Vídeo ${i+1}: ${video.titulo || 'Sem título'}`, bold: true, size: 24, font: 'Arial', color: '1E40AF' })],
            spacing: { before: 160, after: 60 }
          }),
          criarTexto(`Canal: ${video.canal || '—'} | Views: ${Number(video.metricas?.views || 0).toLocaleString()} | Likes: ${Number(video.metricas?.likes || 0).toLocaleString()}`),
        ];

        // Tenta baixar a thumbnail
        if (video.thumbnail) {
          try {
            const imgBuffer = await downloadImagem(video.thumbnail);
            if (imgBuffer) {
              blocos.push(new Paragraph({
                children: [new ImageRun({
                  data: imgBuffer,
                  transformation: { width: 320, height: 180 },
                  type: 'jpg'
                })],
                spacing: { before: 60, after: 120 }
              }));
            }
          } catch (e) {
            blocos.push(criarTexto(`[Thumbnail não disponível: ${video.thumbnail}]`));
          }
        }

        // Comentários ricos do vídeo
        if (video.comentarios && video.comentarios.length > 0) {
          const comentariosRicos = video.comentarios
            .filter(c => c && c.length > 60)
            .slice(0, 15);
          const comentariosCurtos = video.comentarios
            .filter(c => c && c.length >= 20 && c.length <= 60)
            .slice(0, 5);
          const selecionados = [...comentariosRicos, ...comentariosCurtos];

          if (selecionados.length > 0) {
            blocos.push(criarLabel(`Comentários do público (${selecionados.length} selecionados de ${video.comentarios.length} coletados)`));
            blocos.push(criarComentario('Leia estes comentários antes de escrever o roteiro. Eles revelam as dores reais, os desejos e a linguagem do público que assiste conteúdo similar.'));
            selecionados.forEach((c, j) => {
              blocos.push(new Paragraph({
                children: [
                  new TextRun({ text: `[${j+1}] `, bold: true, size: 20, font: 'Arial', color: '2563EB' }),
                  new TextRun({ text: c, size: 20, font: 'Arial', color: '374151' })
                ],
                spacing: { before: 40, after: 40 },
                border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 8 } },
                indent: { left: 240 }
              }));
            });
          }
        }

        blocos.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB', space: 1 } },
          spacing: { before: 120, after: 120 }
        }));

        return blocos;
      })).then(arr => arr.flat()),
      criarSeparador(),
    ] : []),

    // CAPA
    new Paragraph({
      children: [new TextRun({ text: 'PACOTE DE PRODUÇÃO', bold: true, size: 48, font: 'Arial', color: '1E40AF' })],
      alignment: AlignmentType.CENTER, spacing: { before: 400, after: 100 }
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Agente-Roteirista', size: 32, font: 'Arial', color: '6B7280' })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }
    }),
    new Paragraph({
      children: [new TextRun({ text: `Canal: ${nicho?.canal || ''}`, size: 24, font: 'Arial', color: '374151' })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 }
    }),
    new Paragraph({
      children: [new TextRun({ text: `Avatar: ${avatar?.nome || ''}`, size: 24, font: 'Arial', color: '374151' })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 }
    }),
    new Paragraph({
      children: [new TextRun({ text: `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, size: 20, font: 'Arial', color: '9CA3AF' })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600 }
    }),

    criarSeparador(),

    // SEÇÃO 1 — IDENTIDADE DO CANAL
    new Paragraph({
      text: '1. IDENTIDADE DO CANAL E AVATAR', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('Use estas informações para manter toda a narrativa do roteiro alinhada com a identidade do canal e a voz do avatar.'),
    criarLabel('Canal'),
    criarTexto(nicho?.canal),
    criarLabel('Nicho'),
    criarTexto(nicho?.nicho),
    criarLabel('Avatar'),
    criarTexto(`${avatar?.nome}, ${avatar?.idade} anos`),
    criarLabel('Personalidade'),
    criarTexto(avatar?.personalidade),
    criarLabel('História do avatar'),
    criarTexto(avatar?.historia?.biografia || avatar?.historia),
    criarLabel('Jeito de falar'),
    criarTexto(nicho?.tom?.permitido?.join(', ')),
    criarLabel('Estilo de escrita e fala do avatar'),
    criarComentario('ATENÇÃO: Este é o estilo de escrita real do avatar. Use como referência para cada frase do roteiro. O roteiro deve soar exatamente assim — não mais formal, não mais polido.'),
    new Paragraph({
      children: [new TextRun({
        text: avatar?.estiloDeEscrita || 'Não definido — preencher no banco de dados do canal.',
        italics: true,
        size: 22,
        font: 'Arial',
        color: avatar?.estiloDeEscrita ? '111827' : '9CA3AF'
      })],
      spacing: { before: 60, after: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 16, color: '2563EB', space: 8 } },
      indent: { left: 360 }
    }),
    criarLabel('Tom proibido'),
    criarTexto(nicho?.tom?.proibido?.join(', ')),
    criarLabel('Duração ideal do vídeo'),
    criarTexto(nicho?.formatoDeVideo?.duracaoIdeal),

    criarSeparador(),

    // SEÇÃO 2 — TÍTULO E CONCEITO
    new Paragraph({
      text: '2. TÍTULO E CONCEITO DO VÍDEO', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('Este é o título aprovado pelo criador. O roteiro inteiro deve ser desenvolvido para entregar o que esse título promete. A abertura do vídeo deve reforçar a promessa do título nos primeiros 30 segundos.'),
    criarLabel('Título aprovado'),
    new Paragraph({
      children: [new TextRun({ text: tituloEscolhido || '—', bold: true, size: 28, font: 'Arial', color: '1E40AF' })],
      spacing: { before: 80, after: 120 }
    }),
    criarLabel('Sinopse'),
    criarTexto(sinopse),
    criarLabel('Ideia de thumbnail'),
    criarComentario('Descrição visual da capa — use para criar coerência entre o roteiro e a imagem do vídeo.'),
    criarTexto(ideiaDeCapa),

    criarSeparador(),

    // SEÇÃO 3 — GATILHOS E GANCHOS
    new Paragraph({
      text: '3. GATILHOS EMOCIONAIS E GANCHOS', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('Use os gatilhos para criar momentos emocionais dentro do roteiro. Os ganchos devem aparecer em pontos estratégicos: abertura, metade do vídeo e encerramento.'),
    criarLabel('Gatilhos emocionais'),
    ...(gatilhos || []).map(g => criarItem(g)),
    criarLabel('Ganchos'),
    ...(ganchos || []).map(g => criarItem(g)),

    criarSeparador(),

    // SEÇÃO 4 — ESTRUTURA DO ROTEIRO
    new Paragraph({
      text: '4. ESTRUTURA DO ROTEIRO', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('Esta é a estrutura aprovada pelo criador. Siga-a como esqueleto do roteiro. Cada bloco deve ter uma duração proporcional ao tempo total do vídeo.'),
    criarTexto(estruturaEscolhida),

    criarSeparador(),

    // SEÇÃO 5 — VOZ DO CRIADOR
    new Paragraph({
      text: '5. VOZ DO CRIADOR — ELEMENTOS MANUAIS', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('ATENÇÃO: Estes elementos foram escritos pelo próprio criador e devem ser inseridos NO ROTEIRO EXATAMENTE COMO ESTÃO. Não reescreva, não adapte. Integre-os nos momentos indicados.'),
    criarLabel('Hook pessoal — inserir na abertura (primeiros 30s)'),
    new Paragraph({
      children: [new TextRun({ text: hookPessoal || '(não preenchido)', italics: true, size: 22, font: 'Arial', color: hookPessoal ? '111827' : '9CA3AF' })],
      spacing: { before: 60, after: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
      indent: { left: 360 }
    }),
    criarLabel('Ensinamento próprio — inserir antes do encerramento'),
    new Paragraph({
      children: [new TextRun({ text: ensinamentoProprio || '(não preenchido)', italics: true, size: 22, font: 'Arial', color: ensinamentoProprio ? '111827' : '9CA3AF' })],
      spacing: { before: 60, after: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
      indent: { left: 360 }
    }),
    criarLabel('CTA específico — inserir no encerramento'),
    new Paragraph({
      children: [new TextRun({ text: ctaEspecifico || '(não preenchido)', italics: true, size: 22, font: 'Arial', color: ctaEspecifico ? '111827' : '9CA3AF' })],
      spacing: { before: 60, after: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
      indent: { left: 360 }
    }),

    ...(observacoesAdicionais ? [
      criarLabel('Observações adicionais do criador'),
      criarComentario('Leia com atenção — estas são instruções específicas do criador para este vídeo.'),
      criarTexto(observacoesAdicionais)
    ] : []),

    criarSeparador(),

    criarSeparador(),

    // SEÇÃO 6 — CONTEXTO ESTRATÉGICO E BANCO DE DADOS
    new Paragraph({
      text: '6. CONTEXTO ESTRATÉGICO E BANCO DE DADOS DO CANAL',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('LEIA ESTA SEÇÃO INTEIRA ANTES DE COMEÇAR O ROTEIRO. Aqui estão todas as informações que definem a identidade do canal. O roteiro deve reforçar cada um desses elementos, nunca contradizê-los.'),

    criarLabel('Nicho do canal'),
    criarTexto(nicho?.nicho),

    criarLabel('Público-alvo'),
    criarTexto(`${nicho?.publicoAlvo?.faixaEtaria || ''} — ${nicho?.publicoAlvo?.perfil || ''}`),

    criarLabel('Dores do público'),
    ...(nicho?.publicoAlvo?.dores?.length
      ? nicho.publicoAlvo.dores.map(d => criarItem(d))
      : [criarTexto('Não definido — preencher no banco de dados')]),

    criarLabel('Desejos do público'),
    ...(nicho?.publicoAlvo?.desejos?.length
      ? nicho.publicoAlvo.desejos.map(d => criarItem(d))
      : [criarTexto('Não definido — preencher no banco de dados')]),

    criarLabel('Palavras que engajam'),
    criarTexto(nicho?.palavrasQueEngajam?.join(', ') || 'Não definido — preencher no banco de dados'),

    criarLabel('Gatilhos que convertem'),
    criarTexto(nicho?.gatilhosQueConvertem?.join(', ') || 'Não definido — preencher no banco de dados'),

    criarLabel('Temas que já funcionaram'),
    ...(nicho?.temasFuncionaram?.length
      ? nicho.temasFuncionaram.map(t => criarItem(t))
      : [criarTexto('Nenhum registrado ainda')]),

    criarLabel('Temas proibidos'),
    ...(nicho?.temasProibidos?.length
      ? nicho.temasProibidos.map(t => criarItem(t))
      : [criarTexto('Nenhum registrado ainda')]),

    criarLabel('Estilo de narração'),
    criarTexto(nicho?.formatoDeVideo?.estiloDeNarracao || 'Não definido'),

    criarLabel('Estrutura padrão dos vídeos'),
    ...(nicho?.formatoDeVideo?.estrutura?.length
      ? nicho.formatoDeVideo.estrutura.map(e => criarItem(e))
      : [criarTexto('Não definido')]),

    criarSeparador(),

    // SEÇÃO 7 — ESTRATÉGIA VALIDADA
    ...(nicho?.estrategia?.propostaEscolhida ? [
      new Paragraph({
        text: '7. ESTRATÉGIA VALIDADA DO CANAL',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 }
      }),
      criarComentario('Esta é a estratégia validada pelo criador. Use para garantir que o roteiro reforce o posicionamento único e não soe genérico ou igual à concorrência.'),
      criarLabel('Ângulo único do canal'),
      criarTexto(nicho.estrategia.propostaEscolhida.anguloUnico),
      criarLabel('Subnicho'),
      criarTexto(nicho.estrategia.propostaEscolhida.subnicho),
      criarLabel('Diferencial competitivo'),
      criarTexto(nicho.estrategia.propostaEscolhida.diferencialCompetitivo),
      criarLabel('Público-alvo validado'),
      criarTexto(nicho.estrategia.propostaEscolhida.publicoAlvo),
      criarLabel('Gap de mercado'),
      criarTexto(nicho.estrategia.gapMercado || 'Não registrado'),
      criarLabel('Gap de edição'),
      criarTexto(nicho.estrategia.gapEdicao || 'Não registrado'),
      criarLabel('Canais analisados como base'),
      ...(nicho.estrategia.canaisAnalisados?.length
        ? nicho.estrategia.canaisAnalisados.map(c =>
            criarItem(`${c.nome} — ${Number(c.inscritos || 0).toLocaleString()} inscritos`))
        : [criarTexto('Nenhum registrado')]),
      criarSeparador(),
    ] : [
      new Paragraph({
        text: '7. ESTRATÉGIA VALIDADA DO CANAL',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 }
      }),
      criarComentario('Estratégia ainda não registrada. O criador deve passar pela Sessão de Validação no Agente-Ideias para gerar e salvar a estratégia do canal.'),
      criarTexto('Sem estratégia registrada — realize a Validação no Agente-Ideias para completar esta seção.'),
      criarSeparador(),
    ]),
  ];

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: 'Arial', color: '1E3A8A' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const nomeArquivo = `pacote-${(nicho?.canal || 'canal').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.docx`;
  const caminho = path.join(__dirname, '..', 'pacotes', nomeArquivo);
  if (!fs.existsSync(path.join(__dirname, '..', 'pacotes'))) {
    fs.mkdirSync(path.join(__dirname, '..', 'pacotes'));
  }
  fs.writeFileSync(caminho, buffer);
  return { nomeArquivo, caminho };
}

module.exports = { gerarPacoteRoteirista };
