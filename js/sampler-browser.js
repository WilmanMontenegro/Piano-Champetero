/**
 * Folder-style sampler picker for the edit modal.
 */

import { samplerBasename, samplerUrl } from './sampler-path.js';

/** @type {{ root: object, files: object[] } | null} */
let catalog = null;

/** @type {Promise<{ root: object, files: object[] } | null>} */
let catalogPromise = null;

export function loadSamplerCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('samplers-catalog.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.root) {
        catalog = {
          root: simplifyFolderTree(data.root),
          files: data.files || [],
        };
        return catalog;
      }
      catalog = null;
      return null;
    })
    .catch(() => {
      catalog = null;
      return null;
    });
  return catalogPromise;
}

export function getSamplerCatalog() {
  return catalog;
}

const ROOT_FOLDER_LABELS = new Set(['Samplers', 'Sitio (raíz)']);

/** Collapse folder→folder chains; file paths stay unchanged. */
export function simplifyFolderTree(node) {
  if (node.type === 'file') return node;

  let children = (node.children || []).map(simplifyFolderTree);

  while (true) {
    const files = children.filter((c) => c.type === 'file');
    const folders = children.filter((c) => c.type === 'folder');
    if (files.length || folders.length !== 1) break;
    const inner = folders[0];
    const display = ROOT_FOLDER_LABELS.has(node.name) ? inner.name : `${node.name} › ${inner.name}`;
    node = { type: 'folder', name: display, children: inner.children || [] };
    children = node.children;
  }

  return {
    ...node,
    children: children.map((c) => (c.type === 'folder' ? simplifyFolderTree(c) : c)),
  };
}

/** @param {object[]} legacyList flat filenames */
export function buildLegacyCatalog(legacyList) {
  const children = legacyList.map((path) => ({
    name: path,
    type: 'file',
    path,
  }));
  return {
    root: simplifyFolderTree({ name: 'Samplers', type: 'folder', children: [{ name: 'Sitio (raíz)', type: 'folder', children }] }),
    files: legacyList.map((path) => ({
      path,
      name: samplerBasename(path),
      folder: 'Sitio (raíz)',
    })),
  };
}

/**
 * @param {HTMLElement} rootEl
 * @param {{
 *   currentPath?: string,
 *   onSelect: (path: string) => void,
 *   onPreview: (path: string) => Promise<void>,
 *   legacyList?: string[],
 * }} opts
 */
export function mountSamplerBrowser(rootEl, opts) {
  if (rootEl._samplerBrowserApi) {
    rootEl._samplerBrowserApi.open(opts);
    return rootEl._samplerBrowserApi;
  }

  const listEl = rootEl.querySelector('#sampler-list') || rootEl;
  const searchEl = rootEl.querySelector('#sampler-search');
  const crumbEl = rootEl.querySelector('#sampler-breadcrumb');
  const backBtn = rootEl.querySelector('#sampler-back-btn');

  /** @type {object} */
  let treeRoot = { name: 'Samplers', type: 'folder', children: [] };
  /** @type {object[]} */
  let allFiles = [];
  /** @type {object | null} */
  let currentFolder = null;
  let selectedPath = opts.currentPath || '';
  let searchQuery = '';
  let onSelect = opts.onSelect;
  let onPreview = opts.onPreview;

  function findFolderByPath(node, parts, depth = 0) {
    if (!parts.length) return node;
    if (depth >= parts.length) return node;
    const name = parts[depth];
    const child = (node.children || []).find((c) => c.type === 'folder' && c.name === name);
    if (!child) return node;
    return findFolderByPath(child, parts, depth + 1);
  }

  function folderTrail(folder) {
    if (!folder || folder.name === treeRoot.name) return [];
    const trail = [];
    function walk(node, stack) {
      if (node === folder) {
        trail.push(...stack, node);
        return true;
      }
      for (const child of node.children || []) {
        if (child.type !== 'folder') continue;
        if (walk(child, [...stack, node])) return true;
      }
      return false;
    }
    walk(treeRoot, []);
    return trail.filter((n) => n.name !== treeRoot.name);
  }

  function parentOf(folder) {
    if (!folder || folder === treeRoot) return null;
    const trail = folderTrail(folder);
    if (trail.length <= 1) return treeRoot;
    return trail[trail.length - 2];
  }

  function goBack() {
    if (searchQuery.trim()) {
      searchQuery = '';
      if (searchEl) searchEl.value = '';
      render();
      return;
    }
    const parent = parentOf(currentFolder || treeRoot);
    if (!parent) return;
    currentFolder = parent;
    render();
  }

  function updateBackButton() {
    if (!backBtn) return;
    const canBack = Boolean(searchQuery.trim()) || (currentFolder && currentFolder !== treeRoot);
    backBtn.hidden = !canBack;
  }

  function renderBreadcrumb() {
    if (!crumbEl) return;
    crumbEl.innerHTML = '';

    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'sampler-crumb';
    home.textContent = treeRoot.name;
    home.addEventListener('click', () => {
      searchQuery = '';
      if (searchEl) searchEl.value = '';
      currentFolder = treeRoot;
      render();
    });
    crumbEl.appendChild(home);

    if (searchQuery.trim()) {
      const tag = document.createElement('span');
      tag.className = 'sampler-crumb sampler-crumb--static';
      tag.textContent = `Buscar: “${searchQuery.trim()}”`;
      crumbEl.appendChild(tag);
      return;
    }

    folderTrail(currentFolder).forEach((folder) => {
      const sep = document.createElement('span');
      sep.className = 'sampler-crumb-sep';
      sep.textContent = '›';
      crumbEl.appendChild(sep);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sampler-crumb';
      btn.textContent = folder.name;
      btn.addEventListener('click', () => {
        currentFolder = folder;
        render();
      });
      crumbEl.appendChild(btn);
    });
  }

  function renderSearchResults(q) {
    listEl.innerHTML = '';
    const needle = q.toLowerCase();
    const hits = allFiles
      .filter((f) => f.name.toLowerCase().includes(needle) || f.path.toLowerCase().includes(needle))
      .slice(0, 200);

    if (!hits.length) {
      const empty = document.createElement('li');
      empty.className = 'sampler-empty';
      empty.textContent = 'Sin resultados.';
      listEl.appendChild(empty);
      return;
    }

    hits.forEach((file) => {
      listEl.appendChild(createFileRow(file.path, file.name, file.folder));
    });
  }

  function createFolderRow(folder) {
    const li = document.createElement('li');
    li.className = 'sampler-folder';
    li.tabIndex = 0;
    li.innerHTML = `<span class="sampler-folder-icon" aria-hidden="true">📁</span><span class="sampler-folder-name">${escapeHtml(folder.name)}</span>`;
    const open = () => {
      currentFolder = folder;
      if (searchEl) searchEl.value = '';
      searchQuery = '';
      render();
    };
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    return li;
  }

  function createFileRow(path, label, subtitle) {
    const li = document.createElement('li');
    li.className = 'sampler-item';
    li.tabIndex = 0;
    li.title = path;
    li.innerHTML = subtitle
      ? `<span class="sampler-item-name">${escapeHtml(label.replace(/\.[^.]+$/, ''))}</span><span class="sampler-item-folder">${escapeHtml(subtitle)}</span>`
      : escapeHtml(label.replace(/\.[^.]+$/, ''));

    if (selectedPath && pathsMatch(selectedPath, path)) li.classList.add('selected');

    const activate = async () => {
      listEl.querySelectorAll('.sampler-item').forEach((el) => el.classList.remove('selected'));
      li.classList.add('selected');
      selectedPath = path;
      onSelect(path);
      await onPreview(path);
    };
    li.addEventListener('click', () => activate());
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
    return li;
  }

  function renderFolder(folder) {
    listEl.innerHTML = '';
    const folders = (folder.children || []).filter((c) => c.type === 'folder');
    const files = (folder.children || []).filter((c) => c.type === 'file');

    folders.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    files.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    folders.forEach((f) => listEl.appendChild(createFolderRow(f)));
    files.forEach((f) => listEl.appendChild(createFileRow(f.path, f.name, '')));

    if (!folders.length && !files.length) {
      const empty = document.createElement('li');
      empty.className = 'sampler-empty';
      empty.textContent = 'Carpeta vacía.';
      listEl.appendChild(empty);
    }
  }

  function render() {
    renderBreadcrumb();
    updateBackButton();
    if (searchQuery.trim()) renderSearchResults(searchQuery.trim());
    else renderFolder(currentFolder || treeRoot);
  }

  function openAtPath(path) {
    if (!path || !path.includes('/')) {
      currentFolder = treeRoot;
      render();
      return;
    }
    const parts = path.split('/');
    parts.pop();
    currentFolder = findFolderByPath(treeRoot, parts);
    render();
  }

  loadSamplerCatalog().then((data) => {
    if (data) {
      treeRoot = data.root;
      allFiles = data.files;
    } else if (opts.legacyList?.length) {
      const legacy = buildLegacyCatalog(opts.legacyList);
      treeRoot = legacy.root;
      allFiles = legacy.files;
    }
    currentFolder = treeRoot;
    openAtPath(selectedPath);
  });

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value;
      render();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', goBack);
  }

  const api = {
    open(nextOpts) {
      onSelect = nextOpts.onSelect;
      onPreview = nextOpts.onPreview;
      selectedPath = nextOpts.currentPath || '';
      searchQuery = '';
      if (searchEl) searchEl.value = '';
      openAtPath(selectedPath);
    },
    setSelection(path) {
      selectedPath = path || '';
      openAtPath(selectedPath);
    },
    refresh() {
      render();
    },
  };

  rootEl._samplerBrowserApi = api;
  return api;
}

function pathsMatch(a, b) {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
