const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, ShadingType, Table, TableRow, TableCell, WidthType,
  LevelFormat, PageNumber, Header, Footer } = require('docx');
const fs = require('fs');
const path = require('path');

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
    observacoesAdicionais, estrategia
  } = pacote;

  const children = [
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

    // SEÇÃO 6 — ESTRATÉGIA DO CANAL
    new Paragraph({
      text: '6. CONTEXTO ESTRATÉGICO DO CANAL', heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 }
    }),
    criarComentario('Use este contexto para garantir que o roteiro reforce o posicionamento único do canal e não soe genérico.'),
    criarLabel('Gap de mercado'),
    criarTexto(estrategia?.gapMercado),
    criarLabel('Gap de edição'),
    criarTexto(estrategia?.gapEdicao),
    criarLabel('Diferencial do canal'),
    criarTexto(estrategia?.propostaEscolhida?.diferencialCompetitivo),
    criarLabel('Público-alvo'),
    criarTexto(estrategia?.propostaEscolhida?.publicoAlvo),
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
