// js/sobre-nosotros.js — lógica mínima para about page
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import { renderContributorsList } from './site-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Before chrome: list must not stay empty if header/nav fetch hangs.
  renderContributorsList();
  try {
    await initSiteChrome();
  } finally {
    renderContributorsList();
    setYearFooter();
    resumeOnUserGesture();
  }
});
