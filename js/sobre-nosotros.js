// js/sobre-nosotros.js — lógica mínima para about page
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initSiteChrome();
  setYearFooter();
  resumeOnUserGesture();
});
