// Modal de nuevos samplers - Solo para index.html
export function initModalNuevosSamplers() {
  const modal = document.getElementById('modal-nuevos-samplers');
  const closeBtn = document.getElementById('close-modal');
  const probarBtn = document.getElementById('probar-bateria');
  
  // Mostrar modal siempre
  if (modal) {
    setTimeout(() => {
      modal.classList.add('show');
    },500); // Mostrar después de 1.5 segundos
  }
  
  // Función para cerrar modal
  function closeModal() {
    if (modal) {
      modal.classList.remove('show');
    }
  }
  
  // Event listeners
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  if (probarBtn) {
    probarBtn.addEventListener('click', () => {
      // Redirigir a la batería virtual
      window.location.href = 'virtual.html';
    });
  }
  
  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
      closeModal();
    }
  });
  
  // Cerrar haciendo clic en el overlay
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
}