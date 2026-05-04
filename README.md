# Piano-Champetero

Bateria/Pads virtuales de champeta (sitio estatico en GitHub Pages) con audio en navegador, mapeo de teclas y personalizacion por `localStorage`.

## Estado actual (resumen rapido)

- Vista pads con rejillas `3x3`, `3x4`, `4x4`, `4x6` (9/12/16/24).
- Pads cuadrados en vista principal (`aspect-ratio: 1 / 1`), con enfoque desktop-first.
- Herencia en cascada de sonidos y teclas entre rejillas cuando no existe guardado por rejilla:
  - `12 <- 9`, `16 <- 12`, `24 <- 16`.
- Teclas por defecto: orden lineal fila por fila (`QWERTYUIOP`, luego `ASDFGHJKL`, luego `ZXCVBNM`). La batería usa los primeros 9; los pads siguen la misma secuencia según el tamaño de la rejilla.
- Ticker superior continuo (loop sin corte visible) en las paginas principales.

## Desarrollo local

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/virtual.html`.
