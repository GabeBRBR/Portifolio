/** Portuguese labels and number formatting shared by every BIM panel. */

const CLASS_LABELS = {
  IFCWALL: 'Parede', IFCWALLSTANDARDCASE: 'Parede', IFCWALLELEMENTEDCASE: 'Parede', IFCCURTAINWALL: 'Fachada-cortina',
  IFCSLAB: 'Laje / piso', IFCSLABSTANDARDCASE: 'Laje / piso', IFCROOF: 'Cobertura', IFCCOVERING: 'Revestimento',
  IFCCOLUMN: 'Pilar', IFCCOLUMNSTANDARDCASE: 'Pilar', IFCBEAM: 'Viga', IFCBEAMSTANDARDCASE: 'Viga', IFCMEMBER: 'Perfil / barra',
  IFCFOOTING: 'Fundação (sapata/bloco)', IFCPILE: 'Estaca', IFCPLATE: 'Placa', IFCRAILING: 'Guarda-corpo',
  IFCSTAIR: 'Escada', IFCSTAIRFLIGHT: 'Lance de escada', IFCRAMP: 'Rampa', IFCRAMPFLIGHT: 'Lance de rampa',
  IFCDOOR: 'Porta', IFCDOORSTANDARDCASE: 'Porta', IFCWINDOW: 'Janela', IFCWINDOWSTANDARDCASE: 'Janela',
  IFCSPACE: 'Ambiente', IFCBUILDINGELEMENTPROXY: 'Elemento genérico', IFCCIVILELEMENT: 'Elemento civil',
  IFCGEOGRAPHICELEMENT: 'Terreno / topografia', IFCFURNISHINGELEMENT: 'Mobiliário', IFCFURNITURE: 'Mobiliário',
  IFCFLOWSEGMENT: 'Tubo / eletroduto', IFCPIPESEGMENT: 'Tubo', IFCDUCTSEGMENT: 'Duto', IFCCABLECARRIERSEGMENT: 'Eletrocalha / leito',
  IFCCABLESEGMENT: 'Cabo', IFCFLOWFITTING: 'Conexão', IFCPIPEFITTING: 'Conexão hidráulica', IFCDUCTFITTING: 'Conexão de duto',
  IFCCABLECARRIERFITTING: 'Conexão de eletrocalha', IFCJUNCTIONBOX: 'Caixa de passagem', IFCFLOWTERMINAL: 'Terminal / ponto',
  IFCSANITARYTERMINAL: 'Louça / metal sanitário', IFCLIGHTFIXTURE: 'Luminária', IFCOUTLET: 'Tomada', IFCSWITCHINGDEVICE: 'Interruptor',
  IFCELECTRICAPPLIANCE: 'Equipamento elétrico', IFCELECTRICDISTRIBUTIONBOARD: 'Quadro elétrico', IFCPROTECTIVEDEVICE: 'Dispositivo de proteção',
  IFCVALVE: 'Válvula / registro', IFCFLOWCONTROLLER: 'Registro / controlador', IFCBOILER: 'Aquecedor', IFCTANK: 'Reservatório',
  IFCPUMP: 'Bomba', IFCDISCRETEACCESSORY: 'Acessório', IFCFASTENER: 'Fixação', IFCMECHANICALFASTENER: 'Fixação mecânica',
  IFCREINFORCINGBAR: 'Barra de armadura', IFCREINFORCINGMESH: 'Tela de armadura', IFCBUILDINGELEMENTPART: 'Parte de elemento',
  IFCAIRTERMINAL: 'Difusor / grelha', IFCWASTETERMINAL: 'Ralo / caixa sifonada', IFCFIRESUPPRESSIONTERMINAL: 'Hidrante / sprinkler',
  IFCDISTRIBUTIONCONTROLELEMENT: 'Elemento de controle', IFCTRANSPORTELEMENT: 'Elevador / transporte'
};

export const classLabel = (cls) => CLASS_LABELS[String(cls || '').toUpperCase()] || prettifyClass(cls);

function prettifyClass(cls) {
  const raw = String(cls || 'Elemento').replace(/^IFC/i, '');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Revit writes "Family:Type" in ObjectType; the type alone reads better in lists. */
export const typeLabel = (type) => {
  if (!type) return 'Sem tipo';
  const parts = String(type).split(':');
  return parts.length > 1 ? parts.slice(1).join(':').trim() || parts[0] : type;
};
export const familyLabel = (type) => {
  if (!type) return null;
  const parts = String(type).split(':');
  return parts.length > 1 ? parts[0].trim() : null;
};

export const QUANTITIES = [
  { key: 'volume', label: 'Volume', unit: 'm³', digits: 3, sum: true },
  { key: 'area', label: 'Área', unit: 'm²', digits: 2, sum: true },
  { key: 'length', label: 'Comprimento', unit: 'm', digits: 2, sum: true },
  { key: 'height', label: 'Altura', unit: 'm', digits: 2 },
  { key: 'width', label: 'Largura', unit: 'm', digits: 2 },
  { key: 'depth', label: 'Profundidade', unit: 'm', digits: 2 },
  { key: 'thickness', label: 'Espessura', unit: 'm', digits: 3 },
  { key: 'diameter', label: 'Ø equivalente', unit: 'mm', digits: 0, scale: 1000 },
  { key: 'perimeter', label: 'Perímetro', unit: 'm', digits: 2, sum: true },
  { key: 'surface', label: 'Superfície total', unit: 'm²', digits: 2, sum: true }
];
export const QUANTITY_BY_KEY = Object.fromEntries(QUANTITIES.map((entry) => [entry.key, entry]));

const formatters = new Map();
export function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  if (!formatters.has(digits)) formatters.set(digits, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return formatters.get(digits).format(Number(value));
}
export const formatCount = (value) => formatNumber(value, 0);

export function formatQuantity(key, value, { withUnit = true } = {}) {
  const meta = QUANTITY_BY_KEY[key];
  if (!meta) return formatNumber(value);
  if (value === null || value === undefined) return '—';
  const text = formatNumber(Number(value) * (meta.scale || 1), meta.digits);
  return withUnit ? `${text} ${meta.unit}` : text;
}

// Categorical slots from the validated reference palette (dataviz skill),
// always assigned in this order. Groups beyond the eighth fold into "Outros".
export const CATEGORY_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER_COLOR = '#9b9a94';

export const DISCIPLINE_COLORS = {
  Arquitetura: '#eda100',
  Estrutural: '#2a78d6',
  'Elétrica': '#6250d6',
  'Hidráulica': '#1baf7a',
  'Sanitária': '#eb6834'
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

export const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
