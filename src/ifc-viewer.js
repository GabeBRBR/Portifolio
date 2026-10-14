/**
 * Entry point of the BIM viewer on the portfolio page.
 *
 * The page only pays for the 3D engine when a visitor opens the viewer: this
 * module exposes `window.ifcViewer.openViewer()` (used by script.js) and loads
 * the application on first use.
 */

const normalizeViewerUrl = () => {
  // Links from earlier versions carried engine/debug switches that no longer exist.
  const url = new URL(window.location.href);
  if (!url.searchParams.has('ifcEngine') && !url.searchParams.has('ifcDebug')) return;
  url.searchParams.delete('ifcEngine');
  url.searchParams.delete('ifcDebug');
  const search = url.searchParams.toString();
  window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
};

let appPromise = null;
const loadApp = () => {
  appPromise ??= import('./app/BimApp.js').then(({ BimApp }) => new BimApp());
  return appPromise;
};

normalizeViewerUrl();

window.ifcViewer = {
  async openViewer(workKey = 'casa-terrea') {
    const modal = document.getElementById('ifc-viewer-modal');
    modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    try {
      const app = await loadApp();
      await app.open(workKey);
      return app;
    } catch (error) {
      console.error('Falha ao iniciar o visualizador BIM:', error);
      const status = document.getElementById('ifc-status');
      if (status) {
        status.textContent = `Não foi possível iniciar o visualizador: ${error.message}`;
        status.classList.remove('hidden');
      }
      return null;
    }
  },
  async closeViewer() {
    (await appPromise)?.close();
  }
};

// Deep link: index.html#visualizador opens the viewer directly.
if (window.location.hash === '#visualizador') {
  window.addEventListener('DOMContentLoaded', () => window.ifcViewer.openViewer());
}
