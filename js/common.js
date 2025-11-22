// js/common.js — utilidades UI compartidas entre páginas
export function initNav() {
  return fetch('nav.html')
    .then(res => res.text())
    .then(html => {
      const navContainer = document.getElementById('nav-container');
      if (navContainer) {
        navContainer.innerHTML = html;
        const path = window.location.pathname.split('/').pop() || 'index.html';
        navContainer.querySelectorAll('a[href]').forEach(link => {
          if (link.getAttribute('href') === path) link.classList.add('active');
        });
        // Inicializar hamburger menu
        initHamburgerMenu();
      }
    })
  .catch((error) => { console.error('Error loading nav:', error); });
}

// Toggle menú hamburguesa
function initHamburgerMenu() {
  const hamburger = document.getElementById('nav-hamburger');
  const navMenu = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    // Toggle al hacer clic en hamburger
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Cerrar menú al hacer clic en un enlace
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (navMenu.classList.contains('active') &&
          !navMenu.contains(e.target) &&
          !hamburger.contains(e.target)) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
      }
    });
  }
}

export function setYearFooter() {
  const yearFooter = document.getElementById('year-footer');
  if (yearFooter) yearFooter.textContent = new Date().getFullYear();
}

// Instala un listener de primer gesto del usuario. Esto no asume
// un AudioContext concreto, pero permite a módulos que creen
// audioCtx escuchar el evento 'user-gesture' para reanudar audio.
export function resumeOnUserGesture() {
  if (typeof document === 'undefined') return;
  const handler = () => {
    try { document.dispatchEvent(new CustomEvent('user-gesture')); } catch (e) { /* ignore */ }
  };
  // usar once:true para limpiarse automáticamente
  document.addEventListener('click', handler, { once: true, passive: true });
  document.addEventListener('touchstart', handler, { once: true, passive: true });
}

export function initHeader() {
  return fetch('header.html')
    .then(res => res.text())
    .then(html => {
      const headerContainer = document.getElementById('header-container');
      if (headerContainer) {
        headerContainer.innerHTML = html;
        // After loading header, init nav inside it
        return initNav();
      }
    })
    .catch((error) => { console.error('Error loading header:', error); });
}

// Robust loader: try to fetch header.html, on failure inject fallback header+nav
export async function loadHeader() {
  const headerContainer = document.getElementById('header-container');
  if (!headerContainer) return initNav();

  try {
    const res = await fetch('header.html');
    if (!res.ok) throw new Error('Header fetch failed: ' + res.status);
    const html = await res.text();
    headerContainer.innerHTML = html;
    await initNav();
    return;
  } catch (err) {
    console.error('loadHeader failed, injecting fallback header:', err);
    const fallback = `
      <h1 class="title">Batería Champetera Virtual</h1>
      <nav class="main-nav">
        <button class="nav-hamburger" id="nav-hamburger" aria-label="Abrir menú">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <ul class="nav-menu" id="nav-menu">
          <li><a href="index.html" id="nav-home">Inicio</a></li>
          <li><a href="virtual.html" id="nav-virtual">Batería Champetera</a></li>
          <li><a href="sobre-nosotros.html" id="nav-about">Sobre nosotros</a></li>
          <li><a href="politicas-privacidad.html" id="nav-privacy">Políticas de privacidad</a></li>
          <li><a href="contactanos.html" id="nav-contact">Contáctanos</a></li>
        </ul>
      </nav>
    `;
    headerContainer.innerHTML = fallback;
    // mark active link
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const link = headerContainer.querySelector(`a[href="${path}"]`);
    if (link) link.classList.add('active');
    // init hamburger
    initHamburgerMenu();
  }
}
