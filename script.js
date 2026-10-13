/**
 * NOVAFÍSICA - Script Principal & Gestor de Estado (Emil Kowalski Edition)
 */

// ==========================================
// 1. SISTEMA DE TOASTS (Estilo Sonner)
// ==========================================
class ToastSystem {
    constructor() {
        this.container = document.getElementById('toast-container');
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    /**
     * FLIP: ejecuta una mutación del DOM y anima los toasts existentes
     * desde su posición anterior a la nueva, evitando saltos bruscos en el stack.
     */
    _flip(mutar) {
        const existentes = [...this.container.children];
        const antes = new Map(existentes.map(el => [el, el.getBoundingClientRect().top]));
        mutar();
        if (this.reducedMotion.matches) return;

        existentes.forEach(el => {
            if (!el.isConnected) return;
            const delta = antes.get(el) - el.getBoundingClientRect().top;
            if (!delta) return;
            el.animate(
                [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
                { duration: 500, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
            );
        });
    }

    show(message, type = 'info') {
        if (!this.container) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        // Iconos basados en el tipo
        let icon = '✨';
        if (type === 'success') icon = '🏆';
        if (type === 'error') icon = '💔';
        
        toast.innerHTML = `<span style="font-size: 1.2rem;">${icon}</span> <span>${message}</span>`;
        
        this._flip(() => this.container.appendChild(toast));

        // Remover automáticamente después de 4 segundos
        setTimeout(() => {
            toast.classList.add('exiting');
            // Escuchar el final de la animación para limpiar el DOM
            toast.addEventListener('animationend', () => {
                this._flip(() => toast.remove());
            }, { once: true });
        }, 4000);
    }
}

const toast = new ToastSystem();

// ==========================================
// 2. GESTOR DE PROGRESO (LOCALSTORAGE)
// ==========================================
class GestorProgreso {
    constructor() {
        this.estado = null;
    }

    iniciarSesion(email) {
        const dataGuardada = localStorage.getItem(`novafisica_${email}`);
        if (dataGuardada) {
            this.estado = JSON.parse(dataGuardada);
            toast.show('Progreso cargado exitosamente. ¡Bienvenido de vuelta!', 'success');
        } else {
            // Estado inicial por defecto
            this.estado = {
                email: email,
                xp: 0,
                vidas: 3,
                racha: 1,
                insignias: ['explorador']
            };
            this.guardar();
            toast.show('Nueva aventura iniciada. ¡Exploremos el universo!', 'info');
        }
        this.actualizarUI();
    }

    guardar() {
        if (this.estado) {
            localStorage.setItem(`novafisica_${this.estado.email}`, JSON.stringify(this.estado));
        }
    }

    sumarXP(cantidad) {
        if (!this.estado) return;
        this.estado.xp += cantidad;
        
        // Pulso de XP: la animación vive en CSS (.is-bumping), JS solo alterna la clase
        const xpElement = document.getElementById('ui-xp');
        if (xpElement) {
            requestAnimationFrame(() => {
                xpElement.classList.add('is-bumping');
                setTimeout(() => xpElement.classList.remove('is-bumping'), 400);
            });
        }
        
        toast.show(`+${cantidad} XP Obtenida`, 'success');
        this.guardar();
        this.actualizarUI();
    }

    restarVida() {
        if (!this.estado || this.estado.vidas <= 0) return;
        this.estado.vidas -= 1;
        toast.show('¡Cuidado! Has perdido una vida.', 'error');
        this.guardar();
        this.actualizarUI();
    }

    actualizarUI() {
        if (!this.estado) return;

        // Header
        const profileDisplay = document.getElementById('user-profile-display');
        if (profileDisplay) {
            profileDisplay.textContent = `Explorador: ${this.estado.email.split('@')[0]}`;
        }

        // Stats
        document.getElementById('ui-xp').textContent = `${this.estado.xp} XP`;
        document.getElementById('ui-racha').textContent = `${this.estado.racha} Días`;

        // Vidas
        const vidasContainer = document.getElementById('ui-vidas');
        vidasContainer.innerHTML = '';
        const bateriaSVG = `<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M16 20H8V6h8v14zm2-16h-3V2h-6v2H6v18h12V4z"/></svg>`;
        for (let i = 0; i < 3; i++) {
            const span = document.createElement('span');
            span.innerHTML = bateriaSVG;
            span.className = i < this.estado.vidas ? 'battery' : 'battery empty';
            vidasContainer.appendChild(span);
        }

        // Insignias
        const insigniasContainer = document.getElementById('ui-insignias');
        insigniasContainer.innerHTML = '';
        
        const diccionarioInsignias = {
            'explorador': { icono: '🌌', titulo: 'Explorador Cuántico' },
            'francotirador': { icono: '🎯', titulo: 'Tiro Parabólico' }
        };

        this.estado.insignias.forEach(ins => {
            const info = diccionarioInsignias[ins];
            if (info) {
                const badgeHtml = `
                    <div class="badge glass">
                        <div class="badge-icon">${info.icono}</div>
                        <h4>${info.titulo}</h4>
                    </div>
                `;
                insigniasContainer.innerHTML += badgeHtml;
            }
        });

        // Revisar si gana nueva insignia
        if (this.estado.xp >= 500 && !this.estado.insignias.includes('francotirador')) {
            this.estado.insignias.push('francotirador');
            this.guardar();
            toast.show('¡Insignia Desbloqueada: Tiro Parabólico!', 'success');
            
            // Usamos rAF para deferir la renderización y evitar layout thrashing
            requestAnimationFrame(() => this.actualizarUI()); 
        }
    }
}

const gestor = new GestorProgreso();

// ==========================================
// 3. INICIALIZACIÓN DEL DOM Y LÓGICA UI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initSmoothScrolling();
    initScrollAnimations();
});

function initLogin() {
    const modal = document.getElementById('login-modal');
    const mainContent = document.getElementById('main-content');
    const btnLogin = document.getElementById('btn-login');
    const emailInput = document.getElementById('user-email');

    btnLogin.addEventListener('click', () => {
        const email = emailInput.value.trim();
        if (email && email.includes('@')) {
            gestor.iniciarSesion(email);
            
            // display (is-rendered) y opacity (visible) en frames distintos: así el fade-in sí se anima
            mainContent.classList.add('is-rendered');
            modal.classList.add('hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => mainContent.classList.add('visible'));
            });
            
            setTimeout(initP5Game, 400);
        } else {
            toast.show('Ingresa un correo electrónico válido para continuar.', 'error');
            
            // Shake de validación: keyframes en CSS; se reinicia la clase para poder repetirlo
            emailInput.classList.remove('shake');
            void emailInput.offsetWidth; // fuerza reflow para reiniciar la animación
            emailInput.classList.add('shake');
            emailInput.addEventListener('animationend', () => {
                emailInput.classList.remove('shake');
            }, { once: true });
        }
    });
}

function initSmoothScrolling() {
    const scrollLinks = document.querySelectorAll('.nav a, .hero a');
    scrollLinks.forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (!targetId || targetId === '#') return;

            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function initScrollAnimations() {
    // Con reduced-motion no se oculta nada: el contenido aparece directamente
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;

            requestAnimationFrame(() => el.classList.add('in-view'));

            // Al terminar el reveal se retiran las clases para que el hover/active propio de cada tarjeta recupere el control
            const limpiar = (e) => {
                if (e.target !== el || e.propertyName !== 'transform') return;
                el.classList.remove('reveal', 'in-view');
                el.style.removeProperty('--reveal-i');
                el.removeEventListener('transitionend', limpiar);
            };
            el.addEventListener('transitionend', limpiar);
            obs.unobserve(el);
        });
    }, { threshold: 0.15 });

    // Stagger: índice del elemento dentro de su contenedor (máx. 5 pasos de 60ms)
    const indicePorPadre = new Map();
    document.querySelectorAll('.section-title, .video-card, .challenge-card, .diagram-image, .glass:not(.modal-content)').forEach(el => {
        const indice = indicePorPadre.get(el.parentElement) ?? 0;
        indicePorPadre.set(el.parentElement, indice + 1);
        el.style.setProperty('--reveal-i', Math.min(indice, 5));
        el.classList.add('reveal');
        observer.observe(el);
    });
}

// ==========================================
// 4. INTEGRACIÓN DE JUEGO (p5.js)
// ==========================================
function initP5Game() {
    // Evitar instanciaciones múltiples
    if(window.p5Instance) return;

    const sketch = (p) => {
        let proyectil;
        let objetivo;
        let disparado = false;
        let gravedad;
        let estadoMensaje = "Arrastra y suelta para disparar.";
        
        p.setup = () => {
            const container = document.getElementById('p5-game-container');
            const w = Math.min(container.offsetWidth, 800);
            const canvas = p.createCanvas(w, 400);
            canvas.parent('p5-game-container');
            
            gravedad = p.createVector(0, 0.25); // Gravedad ajustada
            resetJuego();
        };

        p.draw = () => {
            // p5.js usa rAF internamente de forma muy eficiente para draw()
            p.background(248, 250, 252);
            
            // Suelo
            p.fill(15, 23, 42);
            p.noStroke();
            p.rect(0, p.height - 20, p.width, 20);

            // Dibujar objetivo
            p.fill(168, 85, 247);
            p.rect(objetivo.x, objetivo.y, objetivo.w, objetivo.h, 4); // Bordes redondeados

            // Dibujar cañón base
            p.fill(56, 189, 248);
            p.arc(50, p.height - 20, 60, 60, p.PI, p.TWO_PI);

            // Lógica del proyectil
            if (disparado) {
                proyectil.vel.add(gravedad);
                proyectil.pos.add(proyectil.vel);
                
                // Colisión bordes
                if (proyectil.pos.y > p.height || proyectil.pos.x > p.width || proyectil.pos.x < 0) {
                    fallo();
                }
                
                // Colisión objetivo (AABB simple)
                if (proyectil.pos.x > objetivo.x && proyectil.pos.x < objetivo.x + objetivo.w &&
                    proyectil.pos.y > objetivo.y && proyectil.pos.y < objetivo.y + objetivo.h) {
                    acierto();
                }
            } else if (p.mouseIsPressed) {
                // Dibujar línea de tensión
                p.stroke(148, 163, 184); // Gris suave
                p.strokeWeight(3);
                p.line(50, p.height - 20, p.mouseX, p.mouseY);
            }

            // Dibujar proyectil
            p.fill(15, 23, 42);
            p.noStroke();
            p.circle(proyectil.pos.x, proyectil.pos.y, 16);

            // Mensaje estado
            p.fill(100, 116, 139);
            p.textSize(15);
            p.textAlign(p.CENTER);
            p.textFont('Inter'); // Tipografía del proyecto
            p.text(estadoMensaje, p.width / 2, 35);
        };

        p.mouseReleased = () => {
            if (!disparado && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
                disparado = true;
                let fuerza = p.createVector(50 - p.mouseX, (p.height - 20) - p.mouseY);
                fuerza.mult(0.12); // Factor de resorte ajustado
                proyectil.vel = fuerza;
                estadoMensaje = "¡Proyectil en vuelo!";
            }
        };

        function acierto() {
            estadoMensaje = "¡Impacto Perfecto!";
            disparado = false;
            gestor.sumarXP(100);
            setTimeout(resetJuego, 1200);
        }

        function fallo() {
            estadoMensaje = "Fallaste. Intenta de nuevo.";
            disparado = false;
            gestor.restarVida();
            setTimeout(resetJuego, 1200);
        }

        function resetJuego() {
            proyectil = {
                pos: p.createVector(50, p.height - 20),
                vel: p.createVector(0, 0)
            };
            objetivo = {
                x: p.random(p.width / 2 + 50, p.width - 60),
                y: p.height - 60,
                w: 45,
                h: 40
            };
            estadoMensaje = "Arrastra y suelta para disparar.";
            disparado = false;
        }
        
        p.windowResized = () => {
            const container = document.getElementById('p5-game-container');
            if(container) {
                const w = Math.min(container.offsetWidth, 800);
                p.resizeCanvas(w, 400);
            }
        };
    };

    window.p5Instance = new p5(sketch);
}
