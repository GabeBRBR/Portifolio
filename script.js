/**
 * Gabriel Biagini Almeida Reis - Portfólio de Engenharia Civil & Tech
 * Script: Interatividade, Filtros de Projetos, Modal de Pranchas e Automações
 */

document.addEventListener('DOMContentLoaded', () => {
  // Put the work itself before biography. Keeping this explicit makes the
  // portfolio hierarchy independent of formatting in the source document.
  const hero = document.getElementById('hero');
  const projects = document.getElementById('projetos');
  const profile = document.getElementById('perfil');
  const experience = document.getElementById('experiencia');
  if (hero && projects) hero.after(projects);
  if (experience && profile) experience.after(profile);

  // =========================================================================
  // 1. Mobile Menu Drawer Toggle
  // =========================================================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuIcon = document.getElementById('mobile-menu-icon');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = !mobileMenu.classList.contains('hidden');
      if (isOpen) {
        mobileMenu.classList.add('hidden');
        mobileMenuIcon.classList.remove('fa-xmark');
        mobileMenuIcon.classList.add('fa-bars');
      } else {
        mobileMenu.classList.remove('hidden');
        mobileMenuIcon.classList.remove('fa-bars');
        mobileMenuIcon.classList.add('fa-xmark');
      }
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenuIcon.classList.remove('fa-xmark');
        mobileMenuIcon.classList.add('fa-bars');
      });
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
      title: 'Barrilete & Instalações Hidrossanitárias em Revit',
      sub: 'AION BIM · Residencial / Comercial',
      img: 'assets/images/hidro/hidro-isometrico-3d.jpg',
      desc: 'Modelagem 3D isométrica de alta complexidade contendo barriletes, baterias de reservatórios superiores, prumadas de esgoto, ventilação e água fria devidamente compatibilizadas no Revit MEP.',
      highlights: [
        'Modelagem geométrica precisa de curvas, registros e barriletes superiores.',
        'Compatibilização espacial completa entre disciplinas MEP e Estrutural.',
        'Geração de tabelas paramétricas com quantitativo exato de conexões e tubulações.',
        'Pranchas isométricas detalhadas para orientar os instaladores em obra.'
      ],
      techs: ['Revit MEP', 'Isométricos 3D', 'NBR 5626', 'NBR 8160', 'Navisworks']
    },
    'modal-p2': {
      title: 'Traçado Elétrico, Eletrodutos & Eletrocalhas',
      sub: 'Edifício Comercial · Jardim Sul',
      img: 'assets/images/eletrico/eletrico-jardim-sul-ifc.jpg',
      desc: 'Modelagem espacial tridimensional em formato aberto IFC e Revit de todo o encaminhamento de eletrocalhas, pontos de iluminação, quadros de distribuição (QDC) e circuitos de força.',
      highlights: [
        'Distribuição racional de circuitos com balanceamento de fases.',
        'Modelagem de leitos de cabos e eletrodutos rígidos/flexíveis.',
        'Detecção de interferências pré-obra (Clash Detection).',
        'Exportação em padrão aberto IFC para interoperabilidade total.'
      ],
      techs: ['IFC OpenBIM', 'Revit Electrical', 'Eletrocalhas', 'NBR 5410']
    },
    'modal-p3': {
      title: 'Projeto Estrutural Completo em Concreto Armado',
      sub: 'Complexo Funerário & Crematório',
      img: 'assets/images/estrutural/estrutural-crematorio-01.jpg',
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
      title: 'Planta de Locação, Estacas & Pilares',
      sub: 'Edificação Multiuso',
      img: 'assets/images/estrutural/estrutural-locacao-terreo.jpg',
      desc: 'Planta executiva de locação de infraestrutura, com marcação de eixos ortogonais, coordenadas de estaqueamento, cargas transmitidas às fundações e tabela de pilares.',
      highlights: [
        'Amarração precisa de eixos de locação referenciados a marcos de topografia.',
        'Quadro de cargas e esforços característicos de fundação.',
        'Tabela de pilares com seções transversais e arranjo de estribos.',
        'Normatização rigorosa para facilitar a leitura no canteiro de obras.'
      ],
      techs: ['Locação', 'Fundações', 'Pilares', 'AutoCAD', 'Topografia']
    },
    'modal-p5': {
      title: 'As-Built a partir de Nuvem de Pontos & Imagens 360°',
      sub: 'Complexo Industrial DAI / SIS',
      img: 'assets/images/asbuilt/asbuilt-hidrantes-revit.jpg',
      desc: 'Reconstituição arquitetônica e de utilidades industriais a partir de escaneamento a laser 3D (LiDAR) e fotogrametria, vetorizando a situação real com precisão milimétrica.',
      highlights: [
        'Processamento e limpeza de nuvens de pontos densas no CloudCompare.',
        'Vetorização tridimensional das estruturas existentes dentro do Revit.',
        'Identificação de desvios executivos em relação ao projeto original.',
        'Integração com fotos esféricas 360° para tour virtual interativo da edificação.'
      ],
      techs: ['CloudCompare', 'Nuvem de Pontos (LiDAR)', 'Revit As-Built', 'Tours 360°']
    },
    'modal-p6': {
      title: 'Levantamento Planialtimétrico & Terraplenagem',
      sub: 'Propriedade Rural J&F · Haras Santa Luzia',
      img: 'assets/images/topografia/topo-haras-santa-luzia.jpg',
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
      title: 'Vistas de Ambientes & Isométricos Sanitários',
      sub: 'Edifício Residencial Jardim Sul',
      img: 'assets/images/hidro/hidro-jardim-sul-vistas-3d.jpg',
      desc: 'Pranchas executivas contendo ampliações de banheiros, cozinhas e áreas de serviço com indicação precisa de registros de gaveta, ralos sifonados e diâmetros nominais.',
      highlights: [
        'Vistas explodidas e isométricas de banheiros tipo.',
        'Compatibilização com peças sanitárias e pontos elétricos adjacentes.',
        'Tabela de conexões e tubos com quantitativos exatos por ambiente.',
        'Conformidade total com a NBR 5626 e NBR 8160.'
      ],
      techs: ['Revit MEP', 'Detalhamento Executivo', 'NBR 5626', 'NBR 8160']
    },
    'modal-p8': {
      title: 'Demarcação de Gleba & Georreferenciamento',
      sub: 'Chácara · Senador Canedo, GO',
      img: 'assets/images/topografia/topo-senador-canedo.jpg',
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
      title: 'Pranchas Executivas de Água Fria & Esgoto',
      sub: 'Residencial Foizer Capri',
      img: 'assets/images/hidro/hidro-foizer-capri-01.jpg',
      desc: 'Documentação completa para aprovação e execução em canteiro, com esquemas verticais de colunas, prumadas e dimensionamento de reservatórios.',
      highlights: [
        'Esquema vertical e prumadas de água fria e esgoto sanitário.',
        'Dimensionamento de ramais e sub-ramais por método de unidades de Hunter.',
        'Detalhamento de caixas de gordura e fossas/filtros quando aplicável.',
        'Pranchas executivas prontas para plotagem e uso em obra.'
      ],
      techs: ['Revit MEP', 'Esquema Vertical', 'Quantitativos', 'NBR 5626']
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

  function openProjectModal(key) {
    const data = projectDetails[key];
    if (!data) return;

    modalImg.src = data.img;
    modalImg.alt = data.title;
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

  if (projectModal) {
    projectModal.addEventListener('click', (e) => {
      if (e.target === projectModal) {
        closeProjectModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !projectModal.classList.contains('hidden')) {
        closeProjectModal();
      }
    });
  }

  // =========================================================================
  // 5. Code Tabs Switching & Copy
  // =========================================================================
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
          copyCodeBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> <span>Copiado!</span>';
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
  // 7. Scroll Reveal Animation via IntersectionObserver
  // =========================================================================
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }

  // =========================================================================
  // 8. Footer Current Year
  // =========================================================================
  const currentYearSpan = document.getElementById('current-year');
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

});
