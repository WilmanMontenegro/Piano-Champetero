// js/contactanos.js — lógica para la página de contacto
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import { WHATSAPP_COMMUNITY_URL } from './site-config.js';
import { WHATSAPP_GROUP_ICON_SVG } from './whatsapp-group-icon.js';

function initWhatsAppCommunityCTA() {
  if (!WHATSAPP_COMMUNITY_URL) return;
  const container = document.getElementById('contact-whatsapp-cta');
  if (!container) return;
  const link = container.querySelector('.contact-button--whatsapp');
  if (link) link.href = WHATSAPP_COMMUNITY_URL;
  const iconWrap = container.querySelector('.contact-icon');
  const btnIcon = link?.querySelector('.contact-button__icon');
  if (iconWrap) iconWrap.innerHTML = WHATSAPP_GROUP_ICON_SVG;
  if (btnIcon) btnIcon.innerHTML = WHATSAPP_GROUP_ICON_SVG;
  container.hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  await initSiteChrome();
  setYearFooter();
  resumeOnUserGesture();
  initWhatsAppCommunityCTA();

  const isContactPage = document.getElementById('contact-form') !== null;
  if (!isContactPage) return;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('enviado') === 'true') {
    const confirmationMessage = document.getElementById('confirmation-message');
    const contactForm = document.getElementById('contact-form');
    if (confirmationMessage && contactForm) {
      confirmationMessage.classList.add('show');
      contactForm.style.display = 'none';
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
        confirmationMessage.classList.remove('show');
        contactForm.style.display = 'block';
      }, 5000);
    }
  }

  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;
  contactForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('.send-button');
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) { submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; submitBtn.disabled = true; }
    const formData = new FormData(contactForm);
    try {
      const response = await fetch('https://formspree.io/f/xqalyldq', { method: 'POST', body: formData, headers: { 'Accept': 'application/json' }});
      if (response.ok) {
        const confirmationMessage = document.getElementById('confirmation-message');
        if (confirmationMessage) { confirmationMessage.classList.add('show'); contactForm.style.display = 'none'; contactForm.reset(); }
      } else {
        alert('Hubo un error al enviar el mensaje. Intenta nuevamente.');
      }
    } catch (error) {
      alert('Hubo un error de conexión. Intenta nuevamente.');
    } finally {
      if (submitBtn) { submitBtn.innerHTML = originalBtnContent; submitBtn.disabled = false; }
    }
  });

  const backToFormBtn = document.getElementById('back-to-form');
  if (backToFormBtn) backToFormBtn.addEventListener('click', function() {
    const confirmationMessage = document.getElementById('confirmation-message');
    const contactForm = document.getElementById('contact-form');
    if (confirmationMessage && contactForm) { confirmationMessage.classList.remove('show'); contactForm.style.display = 'block'; }
  });
});
