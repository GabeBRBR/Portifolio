/**
 * Gabriel Biagini Almeida Reis - Portfólio de Engenharia Civil & Tech
 * Script: Interatividade, Filtros de Projetos, Modal de Pranchas e Automações
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. Mobile Menu Drawer Toggle
  // =========================================================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuIcon = document.getElementById('mobile-menu-icon');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  if (mobileMenuBtn && mobileMenu) {
    const closedClasses = ['opacity-0', 'pointer-events-none', '-translate-y-4'];
    const setMenuOpen = (open) => {
      closedClasses.forEach(cls => mobileMenu.classList.toggle(cls, !open));
      mobileMenuIcon.classList.toggle('ph-list', !open);
      mobileMenuIcon.classList.toggle('ph-x', open);
      mobileMenuBtn.setAttribute('aria-expanded', String(open));
      mobileMenuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };

    mobileMenuBtn.addEventListener('click', () => {
      setMenuOpen(mobileMenu.classList.contains('opacity-0'));
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => setMenuOpen(false));
    });
  }

  // =========================================================================
  // 2. Active Navigation Link on Scroll
  // =========================================================================
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  function updateActiveNavLink() {
    const scrollY = window.pageYOffset + 140;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop;
      const sectionId = current.getAttribute('id');

      if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  window.addEventListener('scroll', updateActiveNavLink, { passive: true });

  // =========================================================================
  // 3. Project Filter System
  // =========================================================================
  const filterBtns = document.querySelectorAll('.project-filter-btn, .filter-btn');
  const projectCards = document.querySelectorAll('.project-plate, .project-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterValue = btn.getAttribute('data-filter');

      projectCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filterValue === 'all' || category === filterValue) {
          card.classList.remove('hidden');
          card.style.opacity = '0';
          card.style.transform = 'translateY(10px)';
          setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, 40);
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // =========================================================================
  // 4. Project Modal Lightbox & Detailed Specs Data
  // =========================================================================
  const projectDetails = {
    'modal-p1': {
      title: 'Barrilete e instalações hidrossanitárias em Revit',
      sub: 'AION BIM · Residencial / Comercial',
      images: [
        { src: 'assets/images/hidro/hidro-isometrico-3d.webp', caption: 'Isométrico 3D do barrilete e das prumadas' }
      ],
      desc: 'Modelagem 3D isométrica de alta complexidade contendo barriletes, baterias de reservatórios superiores, prumadas de esgoto, ventilação e água fria devidamente compatibilizadas no Revit MEP.',
      highlights: [
        'Modelagem geométrica precisa de curvas, registros e barriletes superiores.',
        'Compatibilização espacial completa entre disciplinas MEP e Estrutural.',
        'Tabelas paramétricas com quantitativo de conexões e tubulações.',
        'Pranchas isométricas detalhadas para orientar os instaladores em obra.'
      ],
      techs: ['Revit MEP', 'Isométricos 3D', 'NBR 5626', 'NBR 8160', 'Navisworks']
    },
    'modal-p2': {
      title: 'Traçado elétrico, eletrodutos e eletrocalhas',
      sub: 'Edifício Comercial · Jardim Sul',
      images: [
        { src: 'assets/images/eletrico/eletrico-jardim-sul-ifc.webp', caption: 'Quadros de carga e diagramas multifilares' },
        { src: 'assets/images/eletrico/eletrico-isometrico-3d.webp', caption: 'Modelo elétrico em 3D' }
      ],
      desc: 'Modelagem espacial tridimensional em formato aberto IFC e Revit de todo o encaminhamento de eletrocalhas, pontos de iluminação, quadros de distribuição (QDC) e circuitos de força.',
      highlights: [
        'Distribuição racional de circuitos com balanceamento de fases.',
        'Modelagem de leitos de cabos e eletrodutos rígidos/flexíveis.',
        'Detecção de interferências pré-obra (Clash Detection).',
        'Exportação em padrão aberto IFC para troca com outras disciplinas e softwares.'
      ],
      techs: ['IFC OpenBIM', 'Revit Electrical', 'Eletrocalhas', 'NBR 5410']
    },
    'modal-p3': {
      title: 'Projeto estrutural completo em concreto armado',
      sub: 'Complexo Funerário & Crematório',
      images: [
        { src: 'assets/images/estrutural/estrutural-crematorio-01.webp', caption: 'Estacas, baldrames, vigas e isométricos da estrutura' },
        { src: 'assets/images/estrutural/estrutural-crematorio-02.webp', caption: 'Cortes da cobertura e detalhes dos blocos' },
        { src: 'assets/images/estrutural/estrutural-crematorio-03.webp', caption: 'Cortes longitudinais e isométricos' },
        { src: 'assets/images/estrutural/estrutural-crematorio-04.webp', caption: 'Detalhamento das vigas' }
      ],
      desc: 'Conjunto completo de pranchas executivas contemplando fôrmas, locação de pilares/fundações, armaduras longitudinais e transversais de vigas contínuas e dimensionamento de lajes.',
      highlights: [
        'Dimensionamento estrutural atendendo aos estados limites últimos e de serviço (ELU/ELS).',
        'Detalhamento de vigas contínuas com diagrama de momentos e corte de armaduras.',
        'Plantas de fôrmas claras com indicação de rebaixos, aberturas e cotas.',
        'Tabelas de aço estrutural com consumo discriminado por elemento (CA-50 / CA-60).'
      ],
      techs: ['Concreto Armado', 'Eberick', 'AutoCAD', 'NBR 6118:2023', 'Detalhamento Estrutural']
    },
    'modal-p4': {
      title: 'Planta de locação, estacas e pilares',
      sub: 'Edificação Multiuso',
      images: [
        { src: 'assets/images/estrutural/estrutural-locacao-terreo.webp', caption: 'Locação, quadro de cargas e blocos' },
        { src: 'assets/images/estrutural/estrutural-fundacoes.webp', caption: 'Detalhamento das fundações' },
        { src: 'assets/images/estrutural/estrutural-formas-terreo.webp', caption: 'Formas do pavimento térreo' },
        { src: 'assets/images/estrutural/estrutural-vigas-terreo.webp', caption: 'Detalhamento das vigas do térreo' },
        { src: 'assets/images/estrutural/estrutural-lajes.webp', caption: 'Armação das lajes' },
        { src: 'assets/images/estrutural/estrutural-lajes-cobertura.webp', caption: 'Armação das lajes da cobertura' },
        { src: 'assets/images/estrutural/estrutural-pilares-cobertura.webp', caption: 'Tabela e detalhamento dos pilares' }
      ],
      desc: 'Planta executiva de locação de infraestrutura, com marcação de eixos ortogonais, coordenadas de estaqueamento, cargas transmitidas às fundações e tabela de pilares.',
      highlights: [
        'Amarração precisa de eixos de locação referenciados a marcos de topografia.',
        'Quadro de cargas e esforços característicos de fundação.',
        'Tabela de pilares com seções transversais e arranjo de estribos.',
        'Padronização gráfica para facilitar a leitura no canteiro de obras.'
      ],
      techs: ['Locação', 'Fundações', 'Pilares', 'AutoCAD', 'Topografia']
    },
    'modal-p5': {
      title: 'As-built a partir de nuvem de pontos e fotos 360°',
      sub: 'Complexo Industrial DAI / SIS',
      images: [
        { src: 'assets/images/asbuilt/asbuilt-hidrantes-revit.webp', caption: 'Modelo as-built com a rede de hidrantes' },
        { src: 'assets/images/asbuilt/asbuilt-ppci.webp', caption: 'Prancha de PPCI' },
        { src: 'assets/images/asbuilt/asbuilt-comunicacao.webp', caption: 'Prancha de comunicação' }
      ],
      desc: 'Reconstituição arquitetônica e de utilidades industriais a partir de escaneamento a laser 3D (LiDAR) e fotogrametria, vetorizando a situação real com a precisão do levantamento a laser.',
      highlights: [
        'Processamento e limpeza de nuvens de pontos densas no CloudCompare.',
        'Vetorização tridimensional das estruturas existentes dentro do Revit.',
        'Identificação de desvios executivos em relação ao projeto original.',
        'Integração com fotos esféricas 360° para tour virtual interativo da edificação.'
      ],
      techs: ['CloudCompare', 'Nuvem de Pontos (LiDAR)', 'Revit As-Built', 'Tours 360°']
    },
    'modal-p6': {
      title: 'Levantamento planialtimétrico e terraplenagem',
      sub: 'Propriedade Rural J&F · Haras Santa Luzia, Aruanã',
      images: [
        { src: 'assets/images/topografia/topo-haras-santa-luzia.webp', caption: 'Levantamento, curvas de nível e terraplenagem' }
      ],
      desc: 'Planta topográfica de grande escala com curvas de nível equidistantes, cálculo volumétrico de corte e aterro para platôs, delimitação perimétrica e arruamento.',
      highlights: [
        'Geração de curvas de nível com alta fidelidade de terreno.',
        'Cálculo de movimentação de terra (terraplenagem) e compensação de volumes.',
        'Divisão de talhões, acessos e benfeitorias rurais.',
        'Elaboração no Autodesk Civil 3D com dados georreferenciados.'
      ],
      techs: ['AutoCAD Civil 3D', 'Planialtimetria', 'Terraplenagem', 'Curvas de Nível']
    },
    'modal-p7': {
      title: 'Vistas de ambientes e isométricos sanitários',
      sub: 'Edifício Residencial Jardim Sul',
      images: [
        { src: 'assets/images/hidro/hidro-jardim-sul-vistas-3d.webp', caption: 'Vistas dos ambientes' },
        { src: 'assets/images/hidro/hidro-jardim-sul-pranchas.webp', caption: 'Plantas hidráulica e sanitária do térreo' }
      ],
      desc: 'Pranchas executivas contendo ampliações de banheiros, cozinhas e áreas de serviço com indicação precisa de registros de gaveta, ralos sifonados e diâmetros nominais.',
      highlights: [
        'Vistas explodidas e isométricas de banheiros tipo.',
        'Compatibilização com peças sanitárias e pontos elétricos adjacentes.',
        'Tabela de conexões e tubos com quantitativos por ambiente.',
        'Dimensionamento conforme a NBR 5626 e a NBR 8160.'
      ],
      techs: ['Revit MEP', 'Detalhamento Executivo', 'NBR 5626', 'NBR 8160']
    },
    'modal-p8': {
      title: 'Demarcação de gleba e georreferenciamento',
      sub: 'Chácara · Senador Canedo, GO',
      images: [
        { src: 'assets/images/topografia/topo-senador-canedo.webp', caption: 'Demarcação da gleba' }
      ],
      desc: 'Planta de demarcação perimétrica, amarração em coordenadas geográficas UTM, cálculo de área e confrontações para fins de regularização fundiária.',
      highlights: [
        'Determinação de vértices em coordenadas UTM (SIRGAS 2000).',
        'Memorial descritivo perimétrico com azimutes e distâncias.',
        'Confrontações e limites de vizinhança validados.',
        'Elaboração para documentação cartorial.'
      ],
      techs: ['QGIS', 'Coordenadas UTM', 'Topografia', 'AutoCAD']
    },
    'modal-p9': {
      title: 'Pranchas executivas de água fria e esgoto',
      sub: 'Residencial Foizer Capri',
      images: [
        { src: 'assets/images/hidro/hidro-foizer-capri-01.webp', caption: 'Plantas hidráulica e sanitária do pavimento superior' },
        { src: 'assets/images/hidro/hidro-foizer-capri-02.webp', caption: 'Cobertura e isométrico do barrilete' },
        { src: 'assets/images/hidro/hidro-foizer-capri-03.webp', caption: 'Vistas dos ambientes do pavimento superior' }
      ],
      desc: 'Documentação completa para aprovação e execução em canteiro, com esquemas verticais de colunas, prumadas e dimensionamento de reservatórios.',
      highlights: [
        'Esquema vertical e prumadas de água fria e esgoto sanitário.',
        'Dimensionamento de ramais e sub-ramais por método de unidades de Hunter.',
        'Detalhamento de caixas de gordura e fossas/filtros quando aplicável.',
        'Pranchas executivas prontas para plotagem e uso em obra.'
      ],
      techs: ['Revit MEP', 'Esquema Vertical', 'Quantitativos', 'NBR 5626']
    },
    'modal-p10': {
      title: 'Projeto hidrossanitário com isométricos e lista de materiais',
      sub: 'Casa Cléria',
      images: [
        { src: 'assets/images/hidro/hidro-casa-cleria-01.webp', caption: 'Planta baixa e isométricos gerais' },
        { src: 'assets/images/hidro/hidro-casa-cleria-02.webp', caption: 'Cortes' },
        { src: 'assets/images/hidro/hidro-casa-cleria-03.webp', caption: 'Isométricos do barrilete' },
        { src: 'assets/images/hidro/hidro-casa-cleria-04.webp', caption: 'Isométricos isolados e lista de materiais' }
      ],
      desc: 'Pranchas de instalações hidrossanitárias com plantas baixas, cortes, isométricos do barrilete e dos ramais e lista de materiais.',
      highlights: [
        'Plantas baixas das instalações por pavimento.',
        'Cortes com a rede vertical e os reservatórios.',
        'Isométricos do barrilete e de trechos isolados.',
        'Lista de materiais junto às pranchas.'
      ],
      techs: ['Revit MEP', 'Isométricos 3D', 'Lista de materiais']
    },
    'modal-p11': {
      title: 'As-built hidrossanitário da cozinha do Bloco O',
      sub: 'Ministério da Saúde · Bloco O',
      images: [
        { src: 'assets/images/hidro/hidro-mnsd-brasilia-01.webp', caption: 'Detalhes dos ambientes' },
        { src: 'assets/images/hidro/hidro-mnsd-brasilia-02.webp', caption: 'Plantas de água fria, água quente e esgoto sanitário' }
      ],
      desc: 'As-built das instalações hidrossanitárias da cozinha do Bloco O do Ministério da Saúde: plantas baixas de água fria, água quente e esgoto sanitário e cortes de 1 a 12.',
      highlights: [
        'Planta baixa de água fria e água quente.',
        'Planta baixa do esgoto sanitário.',
        'Cortes de 1 a 12 detalhando os ambientes.',
        'Compatibilização BIM pela AION BIM.'
      ],
      techs: ['As-built', 'Hidrossanitário', 'Compatibilização BIM']
    },
    'modal-p12': {
      title: 'Projeto elétrico: pontos, quadros e diagramas',
      sub: 'Residencial Foizer Capri',
      images: [
        { src: 'assets/images/eletrico/eletrico-foizer-capri-01.webp', caption: 'Pontos elétricos, quadros de carga e legenda' },
        { src: 'assets/images/eletrico/eletrico-foizer-capri-02.webp', caption: 'Diagramas multifilares e proteção dos quadros' }
      ],
      desc: 'Pranchas elétricas com plantas de pontos, quadros de carga e diagramas multifilares dos quadros de distribuição.',
      highlights: [
        'Legenda e plantas de pontos elétricos.',
        'Quadros de carga dos quadros de distribuição.',
        'Diagramas multifilares e detalhes de proteção.'
      ],
      techs: ['Revit Electrical', 'Quadros de carga', 'Diagramas multifilares']
    },
    'modal-p13': {
      title: 'Terraplenagem com mapa de corte e aterro',
      sub: 'Cemitério Aldeia do Vale · Nova Fátima, GO',
      images: [
        { src: 'assets/images/topografia/topo-cav-terraplenagem.webp', caption: 'Mapa hipsométrico de corte e aterro' },
        { src: 'assets/images/topografia/topo-aldeia-do-vale.webp', caption: 'Mapa de terraplenagem e perfis' }
      ],
      desc: 'Projeto de terraplenagem com mapa hipsométrico de corte e aterro, perfis do terreno e memorial de cálculo dos volumes.',
      highlights: [
        'Mapa hipsométrico de corte e aterro por faixa de cota.',
        'Perfis do terreno com as áreas de corte e de aterro.',
        'Memorial de cálculo do estacionamento e das edificações: cerca de 13,3 mil m³ de aterro compactado e 970 m³ de corte.'
      ],
      techs: ['Terraplenagem', 'Corte e aterro', 'Memorial de cálculo']
    },
    'modal-p14': {
      title: 'Levantamento planialtimétrico com tour virtual',
      sub: 'Félix AP · Goiânia, GO',
      images: [
        { src: 'assets/images/topografia/topo-felix-ap-goiania.webp', caption: 'Levantamento planialtimétrico e modelo do terreno' }
      ],
      desc: 'Levantamento planialtimétrico com coordenadas em SIRGAS 2000, modelo do terreno e QR code na prancha para abrir o tour virtual.',
      highlights: [
        'Coordenadas em SIRGAS 2000 e plano local topográfico.',
        'Modelo tridimensional do terreno.',
        'QR code na prancha para abrir o tour virtual no celular.'
      ],
      techs: ['Planialtimetria', 'SIRGAS 2000', 'Tour virtual']
    }
  };

  const projectModal = document.getElementById('project-modal');
  const modalImg = document.getElementById('modal-img');
  const modalSub = document.getElementById('modal-sub');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-desc');
  const modalHighlights = document.getElementById('modal-highlights');
  const modalTechs = document.getElementById('modal-techs');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  const modalPrev = document.getElementById('modal-prev');
  const modalNext = document.getElementById('modal-next');
  const modalCaption = document.getElementById('modal-caption');
  const modalCounter = document.getElementById('modal-counter');
  const modalStage = projectModal ? projectModal.querySelector('.modal-stage') : null;
  let galleryImages = [];
  let galleryIndex = 0;
  let currentTitle = '';

  function showGalleryImage(index) {
    if (!galleryImages.length) return;
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    const item = galleryImages[galleryIndex];
    modalImg.src = item.src;
    modalImg.alt = item.caption ? `${currentTitle}: ${item.caption}` : currentTitle;
    modalCaption.textContent = item.caption || '';
    modalCounter.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
    // Pré-carrega a próxima imagem para a troca ser instantânea
    if (galleryImages.length > 1) {
      new Image().src = galleryImages[(galleryIndex + 1) % galleryImages.length].src;
    }
  }

  function openProjectModal(key) {
    const data = projectDetails[key];
    if (!data) return;

    galleryImages = data.images || [];
    currentTitle = data.title;
    if (modalStage) modalStage.parentElement.classList.toggle('modal-single', galleryImages.length < 2);
    showGalleryImage(0);
    modalSub.textContent = data.sub;
    modalTitle.textContent = data.title;
    modalDesc.textContent = data.desc;

    // Populate Highlights
    modalHighlights.innerHTML = '';
    data.highlights.forEach(item => {
      const li = document.createElement('li');
      li.className = 'flex items-start gap-2';
      li.innerHTML = `<span class="text-gold font-bold mt-0.5">▪</span> <span>${item}</span>`;
      modalHighlights.appendChild(li);
    });

    // Populate Tech Badges
    modalTechs.innerHTML = '';
    data.techs.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tech-badge highlight';
      span.textContent = t;
      modalTechs.appendChild(span);
    });

    projectModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeProjectModal() {
    projectModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Attach click to all project cards / plates
  document.querySelectorAll('.project-plate, .project-card, [data-modal]').forEach(card => {
    card.addEventListener('click', () => {
      const modalKey = card.getAttribute('data-modal');
      if (modalKey) {
        openProjectModal(modalKey);
      }
    });
  });

  // Direct trigger for 3D IFC Viewer
  document.querySelectorAll('[data-open-ifc]').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.ifcViewer && typeof window.ifcViewer.openViewer === 'function') {
        const workKey = card.getAttribute('data-open-ifc') || 'casa-terrea';
        window.ifcViewer.openViewer(workKey);
      } else if (window.location.protocol === 'file:') {
        window.alert('O portfólio pode ser aberto diretamente, mas o visualizador IFC precisa de um servidor local para carregar o motor WebAssembly. No terminal desta pasta, execute: pnpm dev');
      } else {
        const modal = document.getElementById('ifc-viewer-modal');
        if (modal) {
          modal.classList.remove('hidden');
          document.body.style.overflow = 'hidden';
          const status = document.getElementById('ifc-status');
          if (status) {
            status.textContent = 'O motor IFC não foi carregado. No GitHub Pages, selecione “GitHub Actions” em Settings → Pages para publicar a versão compilada do site.';
            status.classList.remove('hidden');
          }
        }
      }
    });
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeProjectModal);
  }

  if (modalPrev) modalPrev.addEventListener('click', () => showGalleryImage(galleryIndex - 1));
  if (modalNext) modalNext.addEventListener('click', () => showGalleryImage(galleryIndex + 1));

  // Deslizar o dedo na imagem também troca de prancha
  if (modalStage) {
    let touchStartX = null;
    modalStage.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    modalStage.addEventListener('touchend', (e) => {
      if (touchStartX === null || galleryImages.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 50) showGalleryImage(galleryIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  if (projectModal) {
    projectModal.addEventListener('click', (e) => {
      if (e.target === projectModal) {
        closeProjectModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (projectModal.classList.contains('hidden')) return;
      if (e.key === 'Escape') closeProjectModal();
      else if (e.key === 'ArrowLeft') showGalleryImage(galleryIndex - 1);
      else if (e.key === 'ArrowRight') showGalleryImage(galleryIndex + 1);
    });
  }

  // =========================================================================
  // 5. Code Tabs Switching & Copy
  // =========================================================================
  // Realce de sintaxe simples para os trechos em Python (sem biblioteca externa)
  const PY_KEYWORDS = new Set(['def', 'return', 'import', 'from', 'if', 'else', 'elif', 'for', 'in', 'and', 'or', 'not', 'as', 'class', 'with', 'while', 'lambda', 'pass', 'try', 'except', 'None', 'True', 'False']);
  const PY_BUILTINS = new Set(['round', 'int', 'len', 'list', 'zip', 'print', 'dict', 'float', 'str', 'range']);
  const PY_TOKEN = /(\"\"\"[\s\S]*?\"\"\"|'''[\s\S]*?''')|(#[^\n]*)|(f?\"(?:[^\"\\\n]|\\.)*\"|f?'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g;
  const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlightPython(source) {
    let html = '';
    let last = 0;
    let afterDef = false;
    source.replace(PY_TOKEN, (match, doc, comment, str, num, word, offset) => {
      html += escapeHtml(source.slice(last, offset));
      last = offset + match.length;
      const text = escapeHtml(match);
      if (doc || str) html += `<span class="tok-str">${text}</span>`;
      else if (comment) html += `<span class="tok-com">${text}</span>`;
      else if (num) html += `<span class="tok-num">${text}</span>`;
      else if (PY_KEYWORDS.has(match)) html += `<span class="tok-kw">${text}</span>`;
      else if (afterDef) html += `<span class="tok-fn">${text}</span>`;
      else if (PY_BUILTINS.has(match)) html += `<span class="tok-bi">${text}</span>`;
      else html += text;
      afterDef = match === 'def';
      return match;
    });
    return html + escapeHtml(source.slice(last));
  }

  document.querySelectorAll('code.language-python').forEach(code => {
    code.innerHTML = highlightPython(code.textContent);
  });

  const codeTabBtns = document.querySelectorAll('.code-tab, .code-tab-btn');
  const codeTabContents = document.querySelectorAll('.code-tab-content');
  const copyCodeBtn = document.getElementById('copy-code-btn');

  codeTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      codeTabBtns.forEach(b => b.classList.remove('active'));
      codeTabContents.forEach(c => {
        c.classList.add('hidden');
        c.classList.remove('active');
      });

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
      }
    });
  });

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      const activeTabContent = document.querySelector('.code-tab-content.active code, .code-tab-content.active pre');
      if (activeTabContent) {
        navigator.clipboard.writeText(activeTabContent.innerText).then(() => {
          const originalHTML = copyCodeBtn.innerHTML;
          copyCodeBtn.innerHTML = '<i class="ph-bold ph-check text-emerald-400"></i> <span>Copiado!</span>';
          setTimeout(() => {
            copyCodeBtn.innerHTML = originalHTML;
          }, 2000);
        }).catch(err => {
          console.error('Falha ao copiar: ', err);
        });
      }
    });
  }

  // =========================================================================
  // 6. Contact Form Actions (WhatsApp & Mailto)
  // =========================================================================
  const btnSendWhatsApp = document.getElementById('btn-send-whatsapp');
  const btnSendEmail = document.getElementById('btn-send-email');
  const formName = document.getElementById('form-name');
  const formEmail = document.getElementById('form-email');
  const formSubject = document.getElementById('form-subject');
  const formMessage = document.getElementById('form-message');

  function validateForm() {
    if (!formName.value.trim()) {
      alert('Por favor, informe seu nome.');
      formName.focus();
      return false;
    }
    if (!formEmail.value.trim()) {
      alert('Por favor, informe seu e-mail.');
      formEmail.focus();
      return false;
    }
    if (!formMessage.value.trim()) {
      alert('Por favor, escreva uma mensagem.');
      formMessage.focus();
      return false;
    }
    return true;
  }

  if (btnSendWhatsApp) {
    btnSendWhatsApp.addEventListener('click', () => {
      if (!validateForm()) return;

      const name = encodeURIComponent(formName.value.trim());
      const email = encodeURIComponent(formEmail.value.trim());
      const subject = encodeURIComponent(formSubject.value);
      const message = encodeURIComponent(formMessage.value.trim());

      const text = `*Contato via Portfólio*%0A%0A*Nome:* ${name}%0A*E-mail:* ${email}%0A*Assunto:* ${subject}%0A*Mensagem:* ${message}`;
      const url = `https://wa.me/5562981143331?text=${text}`;
      window.open(url, '_blank');
    });
  }

  if (btnSendEmail) {
    btnSendEmail.addEventListener('click', () => {
      if (!validateForm()) return;

      const name = encodeURIComponent(formName.value.trim());
      const email = encodeURIComponent(formEmail.value.trim());
      const subject = encodeURIComponent(`[Portfólio] ${formSubject.value} - ${formName.value.trim()}`);
      const body = encodeURIComponent(`Nome: ${formName.value.trim()}\nE-mail: ${formEmail.value.trim()}\nAssunto: ${formSubject.value}\n\nMensagem:\n${formMessage.value.trim()}`);

      const mailtoUrl = `mailto:biaginialmeida@gmail.com?subject=${subject}&body=${body}`;
      window.location.href = mailtoUrl;
    });
  }

  // =========================================================================
  // 7. Scroll Reveal & Hero Animation via GSAP
  // =========================================================================
  if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    
    // Awwwards: Check for prefers-reduced-motion
    let mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
    
    // Hero Timeline
      const heroTl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.2 } });
      heroTl.fromTo("#hero h1", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1 })
            .fromTo("#hero p", { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, "-=0.8")
            .fromTo("#hero .btn-primary-dark, #hero .btn-outline-editorial, #hero .btn-whatsapp-direct", 
                    { y: 15, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.1 }, "-=0.9");

    // Standard Reveals (Premium clip-path masking)
      gsap.utils.toArray(".reveal").forEach(elem => {
        gsap.fromTo(elem, 
          { clipPath: "inset(0 0 100% 0)", opacity: 0, y: 15 },
          {
            clipPath: "inset(0 0 0% 0)", 
            opacity: 1, 
            y: 0,
            duration: 1.2, 
            ease: "expo.out",
            scrollTrigger: {
              trigger: elem,
              start: "top 85%",
              toggleActions: "play none none none"
            }
          }
        );
      });
    });

    // Quem pede menos movimento vê o conteúdo direto, sem animação de entrada
    mm.add("(prefers-reduced-motion: reduce)", () => {
      document.querySelectorAll(".reveal").forEach(el => {
        el.style.opacity = 1;
        el.style.transform = 'none';
      });
    }); // End of matchMedia block
  } else {
    // Fallback if GSAP fails to load
    document.querySelectorAll(".reveal").forEach(el => el.style.opacity = 1);
  }

  // =========================================================================
  // 7.2 Botão flutuante do WhatsApp: aparece depois do topo da página
  // =========================================================================
  const floatingWhatsApp = document.querySelector('.floating-whatsapp');
  if (floatingWhatsApp) {
    const toggleFloatingWhatsApp = () => {
      floatingWhatsApp.classList.toggle('is-hidden', window.scrollY < 600);
    };
    toggleFloatingWhatsApp();
    window.addEventListener('scroll', toggleFloatingWhatsApp, { passive: true });
  }

  // =========================================================================
  // 8. Footer Current Year
  // =========================================================================
  const currentYearSpan = document.getElementById('current-year');
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

});

  // =========================================================================
  // 9. Tagline Word Reveal (Landing Page Design)
  // =========================================================================
  const tagline = document.querySelector('.tagline-reveal');
  if (tagline && typeof IntersectionObserver !== 'undefined') {
    const text = tagline.innerText.trim();
    tagline.innerHTML = '';
    
    // Split into words and wrap in spans
    tagline.setAttribute('aria-label', text);
    const words = text.split(/\s+/);
    words.forEach(word => {
      const span = document.createElement('span');
      span.textContent = word + ' ';
      span.style.opacity = '0.25';
      span.style.transition = 'opacity 0.8s cubic-bezier(0.32,0.72,0,1)';
      span.style.display = 'inline-block';
      span.setAttribute('aria-hidden', 'true');
      tagline.appendChild(span);
    });
    
    const wordObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          wordObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -25% 0px',
      threshold: 0
    });
    
    // Observe each word with a slight programmatic delay based on position
    // to ensure they activate in reading order if scrolling fast
    const spans = tagline.querySelectorAll('span');
    spans.forEach((span, index) => {
      span.style.transitionDelay = (index * 30) + "ms";
      wordObserver.observe(span);
    });
  }