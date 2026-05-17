// js/politicas-privacidad.js — lógica para la página de políticas
import { initSiteChrome, setYearFooter } from './common.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initSiteChrome();
  setYearFooter();
});
