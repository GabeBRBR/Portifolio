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
  // 3. Vitrine de projetos (gerada de assets/vitrine/projetos.json)
  // =========================================================================
  const vitrineRoot = document.getElementById('vitrine-root');
  const viewerBlock = document.getElementById('vitrine-viewer');
  const filterBtns = document.querySelectorAll('.project-filter-btn');
  const projectDetails = {};
  const escapeText = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function projectCard(p, disciplina) {
    const area = p.area ? `<span class="project-meta-chip" title="Metragem aproximada, calculada a partir de ${escapeText(p.area.base)}"><i class="ph-bold ph-ruler"></i> ≈ ${p.area.valor} m²</span>` : '';
    return `<article class="project-plate" data-modal="${p.id}">
      <div class="project-media-wrap">
        <img src="${p.capa}" alt="${escapeText(`${disciplina.nome}: ${p.tipo}`)}" class="project-media" loading="lazy" decoding="async">
        <span class="project-code-tag">${escapeText(disciplina.nome.toUpperCase())}</span>
        ${p.modelo ? '<span class="project-3d-tag"><i class="ph-bold ph-cube"></i> Modelo 3D</span>' : ''}
        <span class="project-count-tag"><i class="ph-bold ph-images"></i> ${p.imagens.length}</span>
      </div>
      <div class="project-plate-body">
        <div>
          <h3 class="project-plate-title">${escapeText(p.tipo)}</h3>
          <p class="project-plate-desc">${escapeText(p.resumo)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 pt-3 border-t border-border-light">
          ${area}${p.ferramentas.map((t) => `<span class="tech-badge">${escapeText(t)}</span>`).join('')}
        </div>
      </div>
    </article>`;
  }

  function renderVitrine(data) {
    const disciplinas = new Map(data.disciplinas.map((d) => [d.id, d]));
    vitrineRoot.innerHTML = data.disciplinas.map((d) => {
      const obras = data.projetos.filter((p) => p.disciplina === d.id);
      if (!obras.length) return '';
      return `<section class="vitrine-section" data-disc="${d.id}" aria-label="${escapeText(d.nome)}">
        <div class="vitrine-head"><i class="ph-bold ${d.icone}" aria-hidden="true"></i><h3>${escapeText(d.nome)}</h3><span>${obras.length} ${obras.length > 1 ? 'obras' : 'obra'}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">${obras.map((p) => projectCard(p, d)).join('')}</div>
      </section>`;
    }).join('');

    for (const p of data.projetos) {
      const disciplina = disciplinas.get(p.disciplina);
      const destaques = [];
      if (p.conteudo.length) destaques.push(`Conteúdo: ${p.conteudo.join(', ').toLowerCase()}.`);
      destaques.push(`${p.imagens.length} ${p.imagens.length > 1 ? 'pranchas publicadas' : 'prancha publicada'}, com carimbo e dados do cliente omitidos.`);
      if (p.area) destaques.push(`Metragem aproximada de ${p.area.valor} m², obtida a partir de ${p.area.base}.`);
      if (p.modelo) destaques.push('Modelo 3D simples: arraste para girar e role para ampliar. As pranchas ficam na outra aba.');
      projectDetails[p.id] = {
        title: p.tipo, sub: disciplina.nome, desc: p.resumo, highlights: destaques, techs: p.ferramentas,
        images: p.imagens.map((i) => ({ src: i.src, caption: i.caption })), modelo: p.modelo
      };
    }
  }

  function applyProjectFilter(value) {
    if (viewerBlock) viewerBlock.classList.toggle('hidden', value !== 'all' && value !== 'viewer');
    document.querySelectorAll('.vitrine-section').forEach((section) => {
      section.classList.toggle('hidden', value === 'viewer' || (value !== 'all' && section.dataset.disc !== value));
    });
  }

  fetch('assets/vitrine/projetos.json')
    .then((response) => response.json())
    .then((data) => {
      renderVitrine(data);
      applyProjectFilter(document.querySelector('.project-filter-btn.active')?.dataset.filter || 'all');
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    })
    .catch((error) => {
      console.error('Falha ao carregar a vitrine de projetos:', error);
      if (vitrineRoot) vitrineRoot.innerHTML = '<p class="text-sm text-ink-muted">Não foi possível carregar os projetos agora. Atualize a página para tentar de novo.</p>';
    });

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyProjectFilter(btn.dataset.filter);
    });
  });

  // =========================================================================
  // 4. Modal do projeto: galeria de pranchas e modelo 3D simples
  // =========================================================================

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
  const modalTabs = document.getElementById('modal-tabs');
  const modalPaneSheets = document.getElementById('modal-pane-sheets');
  const modalPane3d = document.getElementById('modal-pane-3d');
  const modal3dStage = document.getElementById('modal-3d-stage');
  const modal3dStatus = document.getElementById('modal-3d-status');
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

    currentModelUrl = data.modelo || null;
    modalTabs.classList.toggle('hidden', !currentModelUrl);
    // Obras com modelo abrem direto no 3D; as pranchas ficam na outra aba
    setModalTab(currentModelUrl ? 'modelo' : 'pranchas');

    projectModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  // Modelo 3D simples: o motor só é baixado quando a pessoa abre a aba "Modelo 3D"
  let miniViewer = null;
  let currentModelUrl = null;
  async function startModel3D() {
    if (miniViewer || !currentModelUrl) return;
    const url = currentModelUrl;
    modal3dStatus.textContent = 'Carregando modelo 3D…';
    modal3dStatus.classList.remove('hidden');
    try {
      const { MiniViewer } = await import('./src/vitrine/MiniViewer.js');
      const viewer = new MiniViewer(modal3dStage);
      miniViewer = viewer;
      await viewer.load(url);
      if (miniViewer === viewer) modal3dStatus.classList.add('hidden');
    } catch (error) {
      console.error('Falha ao abrir o modelo 3D:', error);
      modal3dStatus.textContent = 'Não foi possível abrir o modelo 3D neste navegador.';
    }
  }

  function stopModel3D() {
    if (!miniViewer) return;
    const viewer = miniViewer;
    miniViewer = null;
    viewer.dispose();
  }

  function setModalTab(tab) {
    const is3d = tab === 'modelo';
    modalPaneSheets.classList.toggle('hidden', is3d);
    modalPane3d.classList.toggle('hidden', !is3d);
    modalTabs.querySelectorAll('[data-tab]').forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
    if (is3d) startModel3D();
  }

  modalTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) setModalTab(btn.dataset.tab);
  });

  function closeProjectModal() {
    stopModel3D();
    projectModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Os cards são criados depois do carregamento do JSON, então o clique é delegado
  if (vitrineRoot) {
    vitrineRoot.addEventListener('click', (e) => {
      const card = e.target.closest('[data-modal]');
      if (card) openProjectModal(card.getAttribute('data-modal'));
    });
  }

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

  // Aba "Plugins Revit": ferramentas lidas da extensão pyRevit (assets/plugins/plugins.json)
  const pluginsTabs = document.getElementById('plugins-tabs');
  const pluginsGrid = document.getElementById('plugins-grid');
  const pluginsResumo = document.getElementById('plugins-resumo');
  let pluginsData = null;

  function showPluginTab(id) {
    const aba = pluginsData.abas.find((a) => a.id === id) || pluginsData.abas[0];
    pluginsTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.plugin === aba.id)));
    pluginsResumo.textContent = aba.resumo;
    pluginsGrid.innerHTML = aba.ferramentas.map((f) => `<article class="plugin-tile">
      <img src="${f.icone}" alt="" width="48" height="48" decoding="async">
      <div><h4>${escapeText(f.nome)}</h4><p>${escapeText(f.descricao)}</p></div>
    </article>`).join('');
  }

  if (pluginsTabs && pluginsGrid) {
    fetch('assets/plugins/plugins.json')
      .then((response) => response.json())
      .then((data) => {
        pluginsData = data;
        pluginsTabs.innerHTML = data.abas.map((a) => `<button type="button" role="tab" data-plugin="${a.id}" aria-selected="false">${escapeText(a.nome)} <span>${a.ferramentas.length}</span></button>`).join('');
        showPluginTab(data.abas[0].id);
      })
      .catch((error) => {
        console.error('Falha ao carregar os plugins:', error);
        pluginsGrid.innerHTML = '<p class="text-sm">Não foi possível carregar a lista de plugins agora.</p>';
      });
    pluginsTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-plugin]');
      if (btn && pluginsData) showPluginTab(btn.dataset.plugin);
    });
  }

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
      if (copyCodeBtn) copyCodeBtn.classList.toggle('hidden', targetId === 'tab-plugins');
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