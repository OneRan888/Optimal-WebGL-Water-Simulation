# 🌊 Optimal WebGL Water Simulation

A real-time interactive **WebGL water simulation** with physically inspired optics, dynamic caustics, and object–fluid interaction.  
Built on top of Evan Wallace’s classic **WebGL Water** demo and extended with multi-object interaction, Stanford Bunny mode, and a minimal UI.

This is the final project for Computer Vision (CS440) at Macau University of Science and Technology, which is supervised by Prof. Huang Zhizhong.

## 👥 Team Members
| Name         | Student ID | Division of Labor                              |
|--------------|------------|------------------------------------------------|
| Sun Yiran    | 1220009338 | System Architecture & Core Rendering and Integration |
| Zhang Haozhan| 1220017576 | Performance Evaluation & Limitations & Future Outlook |
| Liu Benhuang | 1220004875 | Simulation Derivation & Parameter Experiments   |
| Xu Bowen     | 1220012282 | Interaction & UI                               |
| Xu Yanxi     | 1230023419 | Caustics & Shadows                             |

---

## ✨ Highlights

- **GPU water surface simulation**
  - Height-field wave propagation on floating-point textures
  - Adjustable **Fluidity** (water → viscous liquid)
- **Physically inspired water optics**
  - Reflection + refraction at the water surface
  - Fresnel-based blending
- **Dynamic caustics & underwater shading**
  - Caustics projected onto pool floor and walls
  - Underwater attenuation and shadows
- **Interactive objects**
  - Up to **3 spheres** interacting with the water (surface disturbance + shadows)
- **Stanford Bunny mode**
  - Bunny rendered as a triangle mesh
  - Underwater shadow approximation using **multi-sub-sphere projection**
  - Bunny is excluded from water reflection/refraction (performance + stability tradeoff)
- **Customizable environment**
  - Separate textures for **pool floor** and **pool walls**
- **Minimal UI**
  - Clean controls, no verbose descriptions
  - Keyboard shortcuts

---

## 🕹 Controls

### UI Panel
- **Fluidity** — controls viscosity of the liquid  
- **Density** — controls sphere density  
- **Calm** — reset the water surface  
- **Add / Remove** — add or remove spheres (max 3)  
- **Sphere / Bunny** — switch object mode  

### Keyboard
- `Space` — pause / resume  
- `G` — toggle gravity  
- `L` — toggle lighting  

---

## 🧠 Technical Overview

### Water Simulation
- Height + velocity stored per texel in a floating-point texture
- Semi-implicit integration with damping
- Surface normals computed on GPU

### Rendering
- WebGL 1.0 + GLSL shaders
- Reflection/refraction with ray-style surface interaction
- Caustics rendered to an offscreen texture (FBO)

### Bunny Shadow Approximation
- Stanford Bunny rendered with standard rasterization
- Underwater shadow computed using multiple virtual spheres to approximate volume
- Designed for real-time performance in WebGL (no per-triangle ray tracing)

---

## 🗂 Project Structure
```
.
├── index.html
├── main.js
├── renderer.js
├── water.js
├── lightgl.js
├── cubemap.js
├── stanford-bunny.js
├── OES_texture_float_linear-polyfill.js
├── tiles.jpg       
├── wall.jpg       
├── xneg.jpg
├── xpos.jpg
├── ypos.jpg
├── zneg.jpg
├── zpos.jpg
└── README.md
```

---

## 🚀 Run Locally

Because of browser security restrictions, this project **must be served from a local web server**.

```bash
python3 -m http.server 8000
```
Then open:
```bash
http://localhost:8000
```
⚠️ Note: Opening index.html directly via file:// may fail due to WebGL texture/CORS restrictions.

## 🙏 Credits
- Original **WebGL Water** demo by Evan Wallace  
  [http://madebyevan.com/webgl-water/](http://madebyevan.com/webgl-water/)
- **Stanford Bunny** model from the Stanford 3D Scanning Repository  
  [https://www-graphics.stanford.edu/data/3Dscanrep/](https://www-graphics.stanford.edu/data/3Dscanrep/)
- **LightGL** (WebGL utility library) — used for core WebGL tooling  
  [Forked from Evan Wallace's original LightGL.js](https://tamats.com/projects/litegl/)
