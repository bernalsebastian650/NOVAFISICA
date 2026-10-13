# GitHub Copilot Instructions — NOVAFÍSICA

Directrices de ingeniería Frontend, arquitectura y UX/UI para el desarrollo de la plataforma educativa gamificada **NOVAFÍSICA**. Toda contribución o sugerencia de código debe ceñirse estrictamente a estas especificaciones técnicas y estándares de diseño.

---

## 🛠️ Stack Tecnológico y Arquitectura
- **Core:** HTML5 semántico y accesible, Vanilla CSS3 estructurado mediante Custom Properties, Vanilla JavaScript (ES6+ modular orientado a clases).
- **Simulación Física:** Canvas interactivo acelerado mediante `p5.js` montado en contenedores específicos.
- **Persistencia de Estado:** Almacenamiento local mediante `localStorage` gestionado a través de la clase `GestorProgreso`.
- **Notificaciones:** Sistema de Toasts flotantes (`ToastSystem`, estilo Sonner) sin recurrir a diálogos bloqueantes (`alert`, `confirm`).

---

## 1. Skill: Emil Kowalski (Animaciones, Físicas de Resorte y Micro-interacciones)
- **Física sobre Duración:** Prohibido el uso de transiciones lineales o `ease` genéricos. Usar siempre las curvas cubic-bezier parametrizadas del proyecto:
  - `--spring: cubic-bezier(0.175, 0.885, 0.32, 1.275)` para botones, tarjetas y elementos interactivos reactivos con rebote sutil.
  - `--spring-bouncy: cubic-bezier(0.34, 1.56, 0.64, 1)` para toasts, badges e hitos gamificados con rebote dinámico.
  - `--smooth: cubic-bezier(0.32, 0.72, 0, 1)` para aperturas de modales, overlays y desplazamientos de sección continuos.
- **Micro-interacción Táctil Obligatoria:** Todo elemento interactivo (`.btn`, `.video-card`, `.glass`, `.play-btn`) debe responder al estado activo con compresión elástica:
  ```css
  .btn:active, .video-card:active, .glass:active {
      transform: scale(0.96);
      transition-duration: 0.1s;
  }
  ```
  - **Excepción:** el canvas de p5.js (`#p5-game-container`) NO escala en `:active`, porque el usuario arrastra para apuntar y el escalado desfasa `mouseX/mouseY`.
- **Aceleración por Hardware y Rendimiento a 60fps:**
  - Animar exclusivamente propiedades compuestas por GPU: `transform` y `opacity`.
  - Evitar provocar repaints y reflows (no animar `top`, `left`, `width`, `height`, ni `margin`).
  - Utilizar `will-change: transform, opacity` en elementos con transiciones complejas o continuas.
  - Utilizar `requestAnimationFrame` para animaciones o actualizaciones de layout en tiempo real.
  - Las sombras de elevación en hover NO se transicionan con `box-shadow`: viven en un `::after` cuya `opacity` es lo único que anima.
  - Prohibido `transition: all` y animar `left/top`; los loops decorativos usan `transform` con curvas tokenizadas (`--ease-float`).
  - No usar `style.*` para animar desde JS: alternar clases (`.reveal/.in-view`, `.is-bumping`, `.shake`) y definir las curvas en CSS.
  - Un `animation` con `forwards` retiene `transform` y anula `:hover/:active`; usar `backwards`.
- **Aparición Progresiva (Staggering):** Los elementos en listas, grids o grupos de estadísticas deben ingresar con escalonamiento temporal (`--stagger: 60ms`, máx. 5 pasos vía `--reveal-i`) y desvanecimiento vertical.
- **Respeto a la Accesibilidad:** Soportar `@media (prefers-reduced-motion: reduce)` suprimiendo rebotes y transformaciones en favor de fundidos suaves de opacidad (ya implementado al final de `styles.css`; JS debe consultar `matchMedia` antes de animar). Todo elemento interactivo necesita `:focus-visible` (los hotspots llevan `tabindex="0"`).

---

## 2. Skill: Impeccable (Diseño de Interfaz, Jerarquía y Tokens Visuales)
- **Sistema Tipográfico Estricto:**
  - Títulos principales, navegación y CTAs: `'Poppins', sans-serif` (700 para `h1`/`h2`, 600 para botones y títulos de categorías).
  - Texto de lectura y datos: `'Inter', sans-serif` (400 para cuerpo de texto/explicaciones, 500 para instrucciones y etiquetas de estadísticas).
- **Paleta de Color y Gradientes:**
  - Fondo base: `--bg-main: #F8FAFC;`
  - Fondos oscuros estructurales (Header, Footer, Hero oscuro): `--dark-blue: #0F172A;`
  - Gradiente Nebulosa (Acción principal / Energía): `linear-gradient(135deg, #38BDF8, #A855F7)`
  - Gradiente Plasma (Niveles avanzados / Éxito gamificado): `linear-gradient(135deg, #7E22CE, #C084FC)`
  - Texto: `--text-main: #334155;`, `--text-light: #64748B;`
- **Sombras Multicapa Hiperrealistas:** Reemplazar sombras duras de un solo paso por elevaciones difusas multicapa:
  - `--shadow-premium: 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.12);`
  - `--shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.25);`
- **Glassmorphism y Superficies Elevadas:**
  - Modales y tarjetas flotantes deben aplicar `backdrop-filter: blur(16px)` junto con un borde sutil translúcido (`border: 1px solid rgba(255, 255, 255, 0.15)` en fondos oscuros o `rgba(0, 0, 0, 0.05)` en fondos claros).
- **Consistencia de Espaciado y Radios:**
  - Tarjetas y contenedores: `--radius-card: 24px;`
  - Botones y pastillas (Pills): `--radius-btn: 999px;`

---

## 3. Skill: Logic & State Craft (Persistencia y Simulación en Tiempo Real)
- **Gestión de Estado Centralizada:**
  - Todo cambio en la sesión del usuario (XP, vidas, racha, nivel desbloqueado) debe pasar por el método correspondiente de `GestorProgreso` y guardarse automáticamente bajo la clave `novafisica_{email}` en `localStorage`.
- **Feedback Inmediato no Invasivo:**
  - Al completar un desafío, perder una vida o ganar una racha, invocar `toast.show(mensaje, 'success' | 'error' | 'info')`.
- **Simulador p5.js Limpio y Reutilizable:**
  - Encapsular la lógica de cálculo cinemático ($x = v_0 \cdot \cos(\theta) \cdot t$, $y = v_0 \cdot \sin(\theta) \cdot t - \frac{1}{2}g t^2$).
  - Mantener los bucles `draw()` optimizados, limpiando y redibujando únicamente dentro del canvas sin colisiones con los eventos del DOM circundante.