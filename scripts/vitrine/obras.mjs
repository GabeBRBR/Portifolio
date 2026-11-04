/**
 * Catálogo das obras da vitrine. Nada aqui carrega nomes de clientes: cada obra é
 * identificada só pelo tipo. Os caminhos de origem ficam fora do repositório
 * (variável PORTIFOLIO_FONTE, ver lib.mjs).
 *
 * Retângulos de redação são frações da página [x0, y0, x1, y1] (0 a 1).
 */

// Carimbo inferior direito do gabarito AION (paisagem)
const CARIMBO_AION = [[0.81, 0.715, 1, 1]];
// Cabeçalho do gabarito AION em retrato (disciplina/obra e responsável)
const CABECALHO_RETRATO = [[0.17, 0.03, 0.345, 0.075], [0.74, 0.03, 0.94, 0.075]];

export const OBRAS = [
  {
    slug: 'sobrado-fundacao-estacas', disciplina: 'estrutural',
    tipo: 'Residência térrea com cobertura', resumo: 'Fundação em estacas e blocos, vigas, lajes e barrilete.',
    ferramentas: ['Eberick', 'AutoCAD'],
    fonte: '1 - Estrutural/andre', redacao: CARIMBO_AION
  },
  {
    slug: 'sobrado-concreto-armado', disciplina: 'estrutural',
    tipo: 'Sobrado em concreto armado', resumo: 'Locação, formas, fundações, pilares, vigas, escada e lajes.',
    ferramentas: ['Eberick', 'Revit'],
    fonte: '1 - Estrutural/casa foizer', redacao: CARIMBO_AION
  },
  {
    slug: 'residencia-alto-padrao-piscina', disciplina: 'estrutural',
    tipo: 'Residência de alto padrão com piscina', resumo: 'Projeto estrutural completo com fundações, pilares, vigas, lajes e piscina.',
    ferramentas: ['Eberick', 'Revit'],
    fonte: '1 - Estrutural/casa paula', redacao: CARIMBO_AION
  },
  {
    slug: 'sobrado-popular', disciplina: 'estrutural',
    tipo: 'Sobrado popular', resumo: 'Térreo, 1º pavimento e cobertura em concreto armado.',
    ferramentas: ['Eberick', 'AutoCAD'],
    fonte: '1 - Estrutural/cleria', redacao: CARIMBO_AION
  },
  {
    slug: 'sobrado-hidrossanitario', disciplina: 'hidrossanitario',
    tipo: 'Sobrado', resumo: 'Plantas de água fria, esgoto e pluvial com detalhes e quantitativos.',
    ferramentas: ['Revit MEP'],
    fonte: '2 - Hidrossanitario/casa foizer', redacao: CABECALHO_RETRATO
  },
  {
    slug: 'residencia-alto-padrao-hidrossanitario', disciplina: 'hidrossanitario',
    tipo: 'Residência de alto padrão', resumo: 'Plantas, vistas dos ambientes e isométricos 3D hidráulico, sanitário e pluvial.',
    ferramentas: ['Revit MEP'],
    fonte: '2 - Hidrossanitario/casa paula', redacao: CABECALHO_RETRATO
  },
  {
    slug: 'sobrado-popular-hidrossanitario', disciplina: 'hidrossanitario',
    tipo: 'Sobrado popular', resumo: 'Plantas por pavimento, isométrico geral e lista de materiais.',
    ferramentas: ['Revit MEP'],
    fonte: '2 - Hidrossanitario/cleria', redacao: CABECALHO_RETRATO
  },
  {
    slug: 'cozinha-industrial-asbuilt', disciplina: 'hidrossanitario',
    tipo: 'Cozinha industrial de edificação pública', resumo: 'As-built hidrossanitário com plantas e cortes dos ambientes.',
    ferramentas: ['Revit MEP', 'As-built'],
    fonte: '2 - Hidrossanitario/cozinha ministério da saúde', redacao: [[0.82, 0.645, 1, 1]],
    // Páginas com círculos laranja não são usadas (ver verificação de cor em render-sheets.mjs)
    paginas: 'sem-laranja'
  },
  {
    slug: 'edificacao-publica-hidrossanitario', disciplina: 'hidrossanitario',
    tipo: 'Edificação pública', resumo: 'Instalações hidráulicas, notas e detalhes de fixação e compartimentação.',
    ferramentas: ['Revit MEP'],
    fonte: '2 - Hidrossanitario/prefeitura aparecida', redacao: [[0.835, 0.615, 1, 1]]
  },
  {
    slug: 'edificacao-publica-eletrico', disciplina: 'eletrico',
    tipo: 'Edificação pública (as-built)', resumo: 'Cabeamento estruturado e projeto elétrico em dois pavimentos.',
    ferramentas: ['Revit Electrical', 'As-built'],
    fonte: '3 - Eletrico/cabeamento e eletrico', redacao: [[0.835, 0.665, 1, 1]]
  },
  {
    slug: 'residencia-alto-padrao-eletrico', disciplina: 'eletrico',
    tipo: 'Residência de alto padrão', resumo: 'Pontos elétricos, circuitos e quadros de carga.',
    ferramentas: ['Revit Electrical', 'IFC'],
    fonte: '3 - Eletrico/casa paula', redacao: [[0.835, 0.67, 1, 1]]
  },
  {
    slug: 'sobrado-popular-eletrico', disciplina: 'eletrico',
    tipo: 'Sobrado popular', resumo: 'Plantas de pontos elétricos por pavimento.',
    ferramentas: ['Revit Electrical'],
    fonte: '3 - Eletrico/cleria', redacao: [], carimboAuto: false
  },
  {
    slug: 'sobrado-eletrico', disciplina: 'eletrico',
    tipo: 'Sobrado', resumo: 'Pontos elétricos, quadros de carga e diagramas.',
    ferramentas: ['Revit Electrical'],
    fonte: '3 - Eletrico/eletrico foizer', redacao: [[0.835, 0.67, 1, 1]]
  },
  {
    slug: 'edificacao-publica-ppci', disciplina: 'incendio',
    tipo: 'Edificação pública', resumo: 'Projeto de prevenção e proteção contra incêndio e pânico.',
    ferramentas: ['Revit MEP'],
    fonte: '9 - Incendio', apenas: /\.pdf$/i, redacao: [[0.80, 0.60, 1, 1]]
  },
  {
    slug: 'edificio-comercial-asbuilt', disciplina: 'asbuilt',
    tipo: 'Edifício comercial', resumo: 'As-built de alarme de incêndio, elétrica e sistemas a partir de DWG e visitas técnicas.',
    ferramentas: ['Revit', 'AutoCAD', 'As-built'],
    fonte: '4 - As-built e Nuvem de Pontos/as built a partir de dwg e visitas técnicas', apenas: /\.pdf$/i, redacao: [[0.835, 0.715, 1, 1]]
  },
  {
    slug: 'empreendimento-funerario-terraplenagem', disciplina: 'topografia',
    tipo: 'Empreendimento funerário', resumo: 'Planta de patamarização, perfis e locação do muro de arrimo.',
    ferramentas: ['Civil 3D', 'AutoCAD'],
    fonte: '5 - Topografia/topografia cemitério', redacao: [[0.775, 0.50, 1, 1]]
  }
];

// Termos que nunca podem aparecer (comparação sem acento e sem caixa).
export const BLOQUEIO = [
  /matheus/, /fernando/, /hernandez/, /araujo/, /pereira/, /ribeiro/, /\bandre\b/, /karen/, /\bpaula\b/,
  /foizer/, /capri\b/, /cleria/, /gm.?bim/, /jd.?sul/, /jardim sul/, /jardins/, /terras altas/,
  /ministerio/, /\bsaude\b/, /prefeitura/, /aparecida/, /abadia/, /cemiterio/, /aldeia/, /nova fatima/,
  /haras/, /correta/, /\bgac\b/, /base aerea/, /\bjam\b/, /evotech/, /uberlandia/, /rodovia/, /cnpj/, /cpf/,
  /crea/, /@/, /\(\d{2}\) ?\d{4,5}/, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, /\d{3}\.\d{3}\.\d{3}-\d{2}/,
  /\brua\b/, /\bavenida\b/, /\bav\.\s/, /quadra \d/, /\blote \d/, /endereco/, /cliente/, /proprietario/
];

/**
 * Obras que vêm de imagens já exportadas (JPG/PNG). `cobrir` = retângulos brancos
 * (carimbos, endereços, QR codes); `borrar` = áreas desfocadas (letreiros, rótulos).
 * `anexar: true` acrescenta as imagens a uma obra que já tem páginas vindas de PDF.
 */
export const OBRAS_IMAGEM = [
  {
    slug: 'empreendimento-funerario-terraplenagem', disciplina: 'topografia', anexar: true,
    itens: [
      { fonte: '5 - Topografia/topo-aldeia-do-vale.jpg', cobrir: [[0.69, 0.25, 1, 0.31], [0.69, 0.675, 1, 1]] }
    ]
  },
  {
    slug: 'propriedade-rural-terraplenagem', disciplina: 'topografia',
    tipo: 'Propriedade rural', resumo: 'Levantamento por aerofotogrametria, curvas de nível e cálculo de corte e aterro.',
    ferramentas: ['Civil 3D', 'Terraplenagem'],
    itens: [
      { fonte: '5 - Topografia/topo-haras-santa-luzia.jpg', cobrir: [[0.77, 0, 1, 0.25], [0.77, 0.72, 1, 0.77]] }
    ]
  },
  {
    slug: 'lote-urbano-planialtimetrico', disciplina: 'topografia',
    tipo: 'Lote urbano', resumo: 'Levantamento planialtimétrico com modelo do terreno.',
    ferramentas: ['Civil 3D', 'Planialtimetria'],
    itens: [
      { fonte: '5 - Topografia/topo-felix-ap-goiania.jpg', cobrir: [[0, 0.85, 1, 1]] }
    ]
  },
  {
    slug: 'gleba-demarcacao-georreferenciada', disciplina: 'topografia',
    tipo: 'Gleba rural', resumo: 'Demarcação em UTM/SIRGAS 2000 com áreas e confrontações para regularização.',
    ferramentas: ['QGIS', 'Georreferenciamento'],
    itens: [
      { fonte: '5 - Topografia/topo-senador-canedo.jpg', cobrir: [[0, 0.865, 1, 1], [0.0, 0, 0.0, 0]] }
    ]
  },
  {
    slug: 'edificacao-estrutura-metalica', disciplina: 'estrutural',
    tipo: 'Edificação em estrutura metálica', resumo: 'Estacas, baldrames, vigas, cortes e detalhes de cobertura e ligações.',
    ferramentas: ['Cype 3D', 'Revit', 'Estrutura metálica'],
    itens: [
      { fonte: '1 - Estrutural/metalica/estrutural-crematorio-01.jpg', cobrir: [[0.83, 0.65, 1, 1], [0.6, 0.945, 1, 1]] },
      { fonte: '1 - Estrutural/metalica/estrutural-crematorio-02.jpg', cobrir: [[0.83, 0.65, 1, 1], [0.6, 0.945, 1, 1]] },
      { fonte: '1 - Estrutural/metalica/estrutural-crematorio-03.jpg', cobrir: [[0.83, 0.65, 1, 1], [0.6, 0.945, 1, 1]] }
    ]
  },
  {
    slug: 'levantamento-nuvem-de-pontos', disciplina: 'asbuilt',
    tipo: 'Levantamento por nuvem de pontos', resumo: 'Processamento de nuvem de pontos para volumetria de vegetação, topografia e modelo as-built.',
    ferramentas: ['CloudCompare', 'Revit'],
    itens: [
      { fonte: '4 - As-built e Nuvem de Pontos/nuvem de pontos/nuvem de pontos clube caixa vista por cima.png', cobrir: [[0, 0.835, 1, 1]] },
      { fonte: '4 - As-built e Nuvem de Pontos/nuvem de pontos/processamento para volumetria de arvores e topografia .png', cobrir: [] },
      { fonte: '5 - Topografia/topografia city com nuvem de pontos.png', cobrir: [], borrar: [[0.64, 0.61, 0.77, 0.69], [0.28, 0.565, 0.40, 0.635]] }
    ]
  }
];

/** IFCs que viram modelo 3D simples (só geometria) dentro do card da obra. */
export const MODELOS = [
  { id: 'sobrado-concreto-armado', obra: 'sobrado-concreto-armado', disciplina: 'estrutural', fonte: '1 - Estrutural/casa foizer/AION-FOIZER-CAPRI-EST-R02.IFC' },
  { id: 'residencia-alto-padrao-piscina', obra: 'residencia-alto-padrao-piscina', disciplina: 'estrutural', fonte: '1 - Estrutural/casa paula/AION-GM_BIM-JD_SUL_60-EST-R06.IFC' },
  { id: 'residencia-alto-padrao-hidrossanitario', obra: 'residencia-alto-padrao-hidrossanitario', disciplina: 'hidrossanitario', fonte: '2 - Hidrossanitario/casa paula/AION-GM_BIM-JD_SUL_60-HID-R07.ifc' },
  { id: 'residencia-alto-padrao-eletrico', obra: 'residencia-alto-padrao-eletrico', disciplina: 'eletrico', fonte: '3 - Eletrico/casa paula/AION-GM_BIM-JD_SUL_60-ELE-R04.ifc' },
  { id: 'edificacao-publica-ppci', obra: 'edificacao-publica-ppci', disciplina: 'incendio', fonte: '9 - Incendio/AION-PAB-PPCI-R00.ifc' }
];

/** Ordem e rótulos das seções da vitrine. */
export const DISCIPLINAS = [
  ['estrutural', 'Estrutural', 'ph-columns'],
  ['hidrossanitario', 'Hidrossanitário', 'ph-drop'],
  ['eletrico', 'Elétrico', 'ph-lightning'],
  ['incendio', 'Incêndio', 'ph-fire-extinguisher'],
  ['asbuilt', 'As-built e nuvem de pontos', 'ph-scan'],
  ['topografia', 'Topografia', 'ph-map-trifold']
];

/**
 * Metragem aproximada. A origem é a área de lajes somada no modelo estrutural da
 * mesma obra (convert-modelos.mjs); as disciplinas da mesma casa herdam o valor.
 */
export const AREAS = {
  'sobrado-concreto-armado': { valor: 240, base: 'lajes do modelo estrutural' },
  'sobrado-hidrossanitario': { valor: 240, base: 'lajes do modelo estrutural da mesma obra' },
  'sobrado-eletrico': { valor: 240, base: 'lajes do modelo estrutural da mesma obra' },
  'residencia-alto-padrao-piscina': { valor: 200, base: 'lajes do modelo estrutural' },
  'residencia-alto-padrao-hidrossanitario': { valor: 200, base: 'lajes do modelo estrutural da mesma obra' },
  'residencia-alto-padrao-eletrico': { valor: 200, base: 'lajes do modelo estrutural da mesma obra' }
};

/** Página usada como capa do card (índice a partir de 0). */
export const CAPAS = { 'edificacao-publica-ppci': 2, 'edificacao-publica-hidrossanitario': 2 };
