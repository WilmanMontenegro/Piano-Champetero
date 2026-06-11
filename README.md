# Batería Champetera Virtual

Sitio estático de **batería y pads champeteros** en el navegador ([bateriachampetera.com](https://bateriachampetera.com)). Audio con Web Audio API, teclado personalizable y preferencias en `localStorage`. Desplegado en **GitHub Pages** desde `main`.

## Desarrollo con Cursor

Este proyecto se mantiene con **[Cursor](https://cursor.com)** (agente + reglas en `.cursor/rules/`). El contexto para humanos y agentes está en **[AGENTS.md](./AGENTS.md)** — léelo antes de cambios grandes.

No se usa Claude Code ni configuración de VS Code en el repo (`.claude/`, `.vscode/` están en `.gitignore`).

## Estado actual

- Vistas **Batería** (9 toms) y **Pads** (rejillas 9 / 12 / 16 / 24).
- Teclas por defecto en orden lineal QWERTY (misma lógica batería y pads).
- Herencia en cascada de sonidos y teclas entre rejillas (`12←9`, `16←12`, `24←16`).
- **Brillo al tocar** pads y toms (paleta caribeña).
- Nav **desktop-first**; menú hamburguesa solo si el header es estrecho.
- Cinta de agradecimientos desde `js/site-config.js` (un solo lugar para nombres).

## En progreso

- Organización del catálogo de sonidos (máquinas tipo DD14, SK5).
- Vista **piano champetero**.

## Estructura rápida

```
styles/tokens.css          → colores y variables
styles/components/         → nav, ticker
js/site-config.js          → cinta, parámetros de UI
js/common.js               → initSiteChrome()
js/virtual.js              → batería / pads
```

## Local

```bash
python -m http.server 8000
```

Abrir [http://localhost:8000/virtual.html](http://localhost:8000/virtual.html) (HTTP obligatorio para ES modules).

## Publicar

```bash
git push origin main
```

GitHub Pages actualiza en unos minutos. Tras cambiar CSS/JS, subir `CACHE_NAME` en `sw.js` para invalidar caché PWA.

## Documentación

| Archivo | Contenido |
|---------|-----------|
| [AGENTS.md](./AGENTS.md) | Convenciones, storage, layout, roadmap |
| [.cursor/rules/](./.cursor/rules/) | Reglas always-on para Cursor |
