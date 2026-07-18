// js/sobre-nosotros.js — lógica mínima para about page
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import { renderContributorsList } from './site-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initSiteChrome();
  renderContributorsList();
  setYearFooter();
  resumeOnUserGesture();
});
