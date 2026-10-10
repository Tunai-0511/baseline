# Third-party notices

The music video "Baseline" is © 2026 Tunai, all rights reserved (see `LICENSE`). The components below are
not the author's own work and stay under their own licenses.

## mexicat/pdoom-video — MIT License

Parts of the rendering engine (`app/src/engine/`, `app/scripts/render.ts`) and of the lyric-alignment and
beat-analysis tools (`analysis/`) are adapted from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video).

    Copyright (c) 2026 Giacomo Magnanini

The full license text is in `licenses/pdoom-video-MIT.txt`. The scenes, data, lyrics and music of this film
are original and are not covered by that license.

## Fonts — SIL Open Font License 1.1

The fonts in `app/public/fonts/` (originals in `app/public/fonts/src/`; the static cuts are generated from them
by `analysis/make_fonts.py`):

- **Archivo**: Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo)
- **Cormorant Garamond**: Copyright 2015 The Cormorant Project Authors (https://github.com/CatharsisFonts/Cormorant)
- **IBM Plex Mono**: Copyright 2017 IBM Corp., with Reserved Font Name "Plex"

The license text is in `licenses/fonts-OFL.txt`.

The single-stroke fonts in `app/public/fonts/stroke/` are the Hershey fonts (public domain, digitized by
Dr. A. V. Hershey at the U.S. National Bureau of Standards) and the EMS fonts by Evil Mad Scientist
Laboratories (SIL Open Font License 1.1).

## Datasets

The first-layer convolution filters shown in the film were trained by `tools/conv1/` on CIFAR-10
(A. Krizhevsky, *Learning Multiple Layers of Features from Tiny Images*, 2009). The dataset is not included.

## Packages

three.js, opentype.js, Vite, Playwright and MathJax are installed from npm (`app/package.json`) and are not
included in this repository.
