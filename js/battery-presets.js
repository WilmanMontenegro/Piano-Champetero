/**
 * Battery kits — everyone starts with Kit 1; more kits only when user creates them.
 */

import { initModal } from './modal-utils.js';

const STORAGE_KEY = 'pianoChampeteroBatteryKits_v2';
const LEGACY_KEYS = ['pianoChampeteroBatteryPresets'];
const MAX_KITS = 12;
const MAX_NAME_LEN = 32;
const DEFAULT_KIT_NAME = 'Kit 1';
const DEFAULT_KIT_ID = 'bk_default';

function isValidKit(entry) {
  return Boolean(
    entry
    && typeof entry.id === 'string'
    && typeof entry.name === 'string'
    && entry.samplers
    && typeof entry.samplers === 'object'
    && entry.keyMap
    && typeof entry.keyMap === 'object',
  );
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kits: [], activeKitId: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.kits || !Array.isArray(parsed.kits)) return { kits: [], activeKitId: null };
    const kits = parsed.kits.filter(isValidKit).slice(0, MAX_KITS);
    let migrated = false;
    for (const kit of kits) {
      if (isDefaultKit(kit) && kit.blank) {
        delete kit.blank;
        migrated = true;
      }
    }
    const activeKitId = kits.some((k) => k.id === parsed.activeKitId) ? parsed.activeKitId : null;
    if (migrated) writeStore({ kits, activeKitId });
    return { kits, activeKitId };
  } catch {
    return { kits: [], activeKitId: null };
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    kits: store.kits.slice(0, MAX_KITS),
    activeKitId: store.activeKitId,
  }));
}

function purgeLegacyKitStorage() {
  for (const key of LEGACY_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export function listBatteryKits() {
  return readStore().kits.sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
}

export function getActiveKitId() {
  const { kits, activeKitId } = readStore();
  return kits.some((k) => k.id === activeKitId) ? activeKitId : null;
}

export function setActiveKitId(id) {
  const store = readStore();
  if (!store.kits.some((k) => k.id === id)) return;
  store.activeKitId = id;
  writeStore(store);
}

/** First visit: one Kit 1 from current battery state. */
export function ensureDefaultKit(captureState) {
  purgeLegacyKitStorage();
  const store = readStore();
  if (store.kits.length > 0) {
    if (!store.activeKitId) {
      store.activeKitId = store.kits[0].id;
      writeStore(store);
    }
    return store.kits.find((k) => k.id === store.activeKitId) || store.kits[0];
  }
  const state = captureState();
  const entry = {
    id: 'bk_default',
    name: DEFAULT_KIT_NAME,
    samplers: { ...state.samplers },
    keyMap: { ...state.keyMap },
    volume: state.volume,
    pads: state.pads ? { ...state.pads } : undefined,
    padKeys: state.padKeys ? { ...state.padKeys } : undefined,
    gridType: state.gridType || undefined,
    savedAt: new Date().toISOString(),
  };
  writeStore({ kits: [entry], activeKitId: entry.id });
  return entry;
}

export function createBatteryKit({ name, samplers, keyMap, volume, pads, padKeys, gridType, blank, randomSounds }) {
  const trimmed = String(name || '').trim().slice(0, MAX_NAME_LEN);
  if (!trimmed) throw new Error('Poné un nombre al kit.');

  const store = readStore();
  if (store.kits.length >= MAX_KITS) {
    throw new Error(`Máximo ${MAX_KITS} kits. Borrá uno para crear otro.`);
  }

  const entry = {
    id: `bk_${Date.now()}`,
    name: trimmed,
    samplers: { ...samplers },
    keyMap: { ...keyMap },
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5,
    pads: pads ? { ...pads } : undefined,
    padKeys: padKeys ? { ...padKeys } : undefined,
    gridType: gridType || undefined,
    savedAt: new Date().toISOString(),
    ...(blank ? { blank: true } : {}),
    ...(randomSounds ? { randomSounds: true } : {}),
  };
  store.kits.push(entry);
  store.activeKitId = entry.id;
  writeStore(store);
  return entry;
}

export function updateBatteryKit(id, { name, samplers, keyMap, volume, pads, padKeys, gridType }) {
  const store = readStore();
  const idx = store.kits.findIndex((k) => k.id === id);
  if (idx < 0) throw new Error('Kit no encontrado.');

  const trimmed = name != null ? String(name).trim().slice(0, MAX_NAME_LEN) : store.kits[idx].name;
  if (!trimmed) throw new Error('Poné un nombre al kit.');

  store.kits[idx] = {
    ...store.kits[idx],
    name: trimmed,
    samplers: samplers ? { ...samplers } : store.kits[idx].samplers,
    keyMap: keyMap ? { ...keyMap } : store.kits[idx].keyMap,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : store.kits[idx].volume,
    pads: pads ? { ...pads } : store.kits[idx].pads,
    padKeys: padKeys ? { ...padKeys } : store.kits[idx].padKeys,
    gridType: gridType || store.kits[idx].gridType,
    savedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.kits[idx];
}

export function deleteBatteryKit(id) {
  const store = readStore();
  if (store.kits.length <= 1) return false;
  store.kits = store.kits.filter((k) => k.id !== id);
  if (store.activeKitId === id) store.activeKitId = store.kits[0]?.id ?? null;
  writeStore(store);
  return true;
}

export function getBatteryKit(id) {
  return readStore().kits.find((k) => k.id === id) || null;
}

export function isDefaultKit(kit) {
  return kit?.id === DEFAULT_KIT_ID;
}

/** True only for kits created with «Desde 0» (blank sounds + keys). Kit 1 is never blank. */
export function isActiveKitBlank() {
  const kit = getActiveKitId() ? getBatteryKit(getActiveKitId()) : null;
  if (isDefaultKit(kit)) return false;
  return kit?.blank === true;
}

export function syncActiveKit(captureState) {
  const id = getActiveKitId();
  if (!id || !captureState) return false;
  updateBatteryKit(id, captureState());
  return true;
}

/**
 * @param {object} opts
 */
export function initBatteryPresets(opts) {
  const {
    captureState,
    applyPreset,
    getTemplate,
    getFactoryKeys,
    enterEditMode,
  } = opts;

  const pickerEl = document.getElementById('battery-kit-picker');
  const toggleBtn = document.getElementById('battery-kit-toggle');
  const labelEl = document.getElementById('battery-kit-label');
  const menuEl = document.getElementById('battery-kit-menu');
  const nameInput = document.getElementById('new-kit-name');
  const statusEl = document.getElementById('new-kit-status');

  if (!toggleBtn || !menuEl || !labelEl || !captureState || !applyPreset || !getTemplate) return null;

  ensureDefaultKit(captureState);

  let menuOpen = false;
  let newKitModal = null;
  const menuHome = pickerEl;

  const mountMenu = () => {
    if (menuEl.parentElement !== document.body) document.body.appendChild(menuEl);
    positionMenu();
  };

  const unmountMenu = () => {
    if (menuHome && menuEl.parentElement === document.body) menuHome.appendChild(menuEl);
  };

  const setNewKitStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text;
    statusEl.classList.toggle('kit-import-status--error', isError);
  };

  const positionMenu = () => {
    const rect = toggleBtn.getBoundingClientRect();
    menuEl.style.top = `${rect.bottom + 4}px`;
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.minWidth = `${Math.max(rect.width, 140)}px`;
  };

  const closeMenu = () => {
    menuOpen = false;
    menuEl.hidden = true;
    unmountMenu();
    toggleBtn.setAttribute('aria-expanded', 'false');
    pickerEl?.classList.remove('battery-kit-picker--open');
  };

  const loadKit = async (id) => {
    const kit = getBatteryKit(id);
    if (!kit) return;
    await applyPreset(kit);
    setActiveKitId(id);
    render();
  };

  const deleteActiveKit = async () => {
    const id = getActiveKitId();
    const kit = id ? getBatteryKit(id) : null;
    if (!kit || listBatteryKits().length <= 1) return;
    if (!window.confirm(`¿Borrar «${kit.name}»?`)) return;
    deleteBatteryKit(id);
    const fallback = getBatteryKit(getActiveKitId());
    if (fallback) await applyPreset(fallback);
    render();
  };

  const openNewKitModal = () => {
    setNewKitStatus('');
    if (nameInput) {
      nameInput.value = '';
      nameInput.placeholder = `Kit ${listBatteryKits().length + 1}`;
    }
    newKitModal?.open();
    nameInput?.focus();
  };

  const buildMenu = () => {
    const kits = listBatteryKits();
    const activeId = getActiveKitId();

    menuEl.replaceChildren();

    for (const kit of kits) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'battery-kit-menu-item';
      btn.textContent = kit.name;
      btn.title = `Cargar «${kit.name}»`;
      if (kit.id === activeId) btn.classList.add('battery-kit-menu-item--active');
      btn.addEventListener('click', () => {
        closeMenu();
        void loadKit(kit.id);
      });
      li.appendChild(btn);
      menuEl.appendChild(li);
    }

    const newLi = document.createElement('li');
    const newItem = document.createElement('button');
    newItem.type = 'button';
    newItem.className = 'battery-kit-menu-item battery-kit-menu-item--new';
    newItem.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Nuevo kit';
    newItem.addEventListener('click', () => {
      closeMenu();
      openNewKitModal();
    });
    newLi.appendChild(newItem);
    menuEl.appendChild(newLi);

    if (kits.length > 1) {
      const activeKit = kits.find((k) => k.id === activeId);
      const deleteLi = document.createElement('li');
      const deleteItem = document.createElement('button');
      deleteItem.type = 'button';
      deleteItem.className = 'battery-kit-menu-item battery-kit-menu-item--delete';
      deleteItem.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i> Borrar kit activo';
      deleteItem.title = `Borrar «${activeKit?.name || 'kit activo'}»`;
      deleteItem.addEventListener('click', () => {
        closeMenu();
        void deleteActiveKit();
      });
      deleteLi.appendChild(deleteItem);
      menuEl.appendChild(deleteLi);
    }
  };

  const openMenu = () => {
    buildMenu();
    menuOpen = true;
    menuEl.hidden = false;
    mountMenu();
    toggleBtn.setAttribute('aria-expanded', 'true');
    pickerEl?.classList.add('battery-kit-picker--open');
  };

  const toggleMenu = () => {
    if (menuOpen) closeMenu();
    else openMenu();
  };

  const render = () => {
    const activeId = getActiveKitId();
    const activeKit = activeId ? getBatteryKit(activeId) : null;
    if (labelEl) labelEl.textContent = activeKit?.name || DEFAULT_KIT_NAME;
    if (menuOpen) {
      buildMenu();
      mountMenu();
    }
  };

  const createFromTemplate = async (templateKey) => {
    setNewKitStatus('');
    const name = nameInput?.value?.trim();
    if (!name) {
      setNewKitStatus('Poné un nombre al kit.', true);
      nameInput?.focus();
      return;
    }
    try {
      const tpl = getTemplate(templateKey);
      const fromScratch = templateKey === 'empty';
      const isRandom = templateKey === 'random';
      await applyPreset({ ...tpl, blank: fromScratch });
      let state = captureState();
      if (isRandom && getFactoryKeys) {
        state = { ...state, ...getFactoryKeys() };
      }
      createBatteryKit({
        name,
        blank: fromScratch,
        randomSounds: isRandom,
        ...state,
      });
      newKitModal?.close();
      if (fromScratch) enterEditMode?.();
      render();
    } catch (err) {
      setNewKitStatus(err instanceof Error ? err.message : 'No se pudo crear.', true);
    }
  };

  newKitModal = initModal('modal-new-kit', {
    closeBtnId: 'new-kit-cancel-btn',
    focusOnOpen: false,
    onOpen: () => {
      setNewKitStatus('');
      if (nameInput) nameInput.placeholder = `Kit ${listBatteryKits().length + 1}`;
    },
  });

  document.getElementById('new-kit-empty-btn')?.addEventListener('click', () => {
    void createFromTemplate('empty');
  });
  document.getElementById('new-kit-random-btn')?.addEventListener('click', () => {
    void createFromTemplate('random');
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', (e) => {
    if (!menuOpen) return;
    if (pickerEl?.contains(e.target) || menuEl.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (menuOpen) mountMenu();
  });

  window.addEventListener('scroll', () => {
    if (menuOpen) mountMenu();
  }, true);

  const notifyEditExit = () => {
    syncActiveKit(captureState);
  };

  render();

  return {
    refresh: render,
    onEditEnter: () => {},
    onEditExit: notifyEditExit,
    syncActive: () => syncActiveKit(captureState),
  };
}
