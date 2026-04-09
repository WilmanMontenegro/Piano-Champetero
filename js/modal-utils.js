// js/modal-utils.js - Utilidades reutilizables para modales

/**
 * Inicializa un modal con comportamientos estándar
 * @param {string} modalId - ID del elemento modal
 * @param {Object} options - Opciones de configuración
 * @returns {Object|null} - Objeto con métodos open, close y element
 */
export function initModal(modalId, options = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;

  const {
    openBtnId = null,
    closeBtnId = null,
    confirmBtnId = null,
    onOpen = null,
    onClose = null,
    onConfirm = null,
    focusOnOpen = true
  } = options;

  function open() {
    modal.style.display = 'flex';
    if (onOpen) onOpen();
    
    // Focus en el primer elemento focusable
    if (focusOnOpen) {
      const focusable = modal.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
    }
  }

  function close() {
    modal.style.display = 'none';
    if (onClose) onClose();
  }

  // Click en overlay (fuera del contenido)
  modal.addEventListener('click', e => {
    if (e.target === modal) close();
  });

  // Tecla Escape
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  // Botón abrir
  if (openBtnId) {
    const openBtn = document.getElementById(openBtnId);
    if (openBtn) openBtn.addEventListener('click', open);
  }

  // Botón cerrar
  if (closeBtnId) {
    const closeBtn = document.getElementById(closeBtnId);
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  // Botón confirmar
  if (confirmBtnId) {
    const confirmBtn = document.getElementById(confirmBtnId);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (onConfirm) await onConfirm();
        close();
      });
    }
  }

  return { open, close, element: modal };
}

/**
 * Cierra todos los modales en la página
 * @param {string} selector - Selector CSS para los modales (default: '.modal-edit')
 */
export function closeAllModals(selector = '.modal-edit') {
  document.querySelectorAll(selector).forEach(modal => {
    modal.style.display = 'none';
  });
}

/**
 * Verifica si un modal está abierto
 * @param {string|HTMLElement} modal - ID o elemento del modal
 * @returns {boolean}
 */
export function isModalOpen(modal) {
  const element = typeof modal === 'string' ? document.getElementById(modal) : modal;
  return element && element.style.display === 'flex';
}
