// js/contactanos.js — lógica para la página de contacto
import { loadHeader, setYearFooter, resumeOnUserGesture } from './common.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadHeader();
  setYearFooter();
  resumeOnUserGesture();

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
