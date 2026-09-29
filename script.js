/**
 * NOVAFÍSICA - Script Principal & Gestor de Estado
 */

// ==========================================
// 1. GESTOR DE PROGRESO (LOCALSTORAGE)
// ==========================================
class GestorProgreso {
    constructor() {
        this.estado = null;
    }

    iniciarSesion(email) {
        const dataGuardada = localStorage.getItem(`novafisica_${email}`);
        if (dataGuardada) {
            this.estado = JSON.parse(dataGuardada);
        } else {
            // Estado inicial por defecto
            this.estado = {
                email: email,
                xp: 0,
                vidas: 3,
                racha: 1,
                insignias: ['explorador'] // Insignia inicial
            };
            this.guardar();
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
        
        // Efecto visual en XP
        const xpElement = document.getElementById('ui-xp');
        if (xpElement) {
            xpElement.style.transform = 'scale(1.2)';
            setTimeout(() => xpElement.style.transform = 'scale(1)', 300);
        }
        
        this.guardar();
        this.actualizarUI();
    }

    restarVida() {
        if (!this.estado || this.estado.vidas <= 0) return;
        this.estado.vidas -= 1;
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

        // Insignias (Renderizado simple basado en array)
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

        // Revisar si gana nueva insignia por XP
        if (this.estado.xp >= 500 && !this.estado.insignias.includes('francotirador')) {
            this.estado.insignias.push('francotirador');
            this.guardar();
            this.actualizarUI(); // Re-renderizar
        }
    }
}

const gestor = new GestorProgreso();

// ==========================================
// 2. INICIALIZACIÓN DEL DOM Y LÓGICA UI
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
            // 1. Iniciar sesión en el gestor
            gestor.iniciarSesion(email);
            
            // 2. Ocultar modal
            modal.classList.add('hidden');
            
            // 3. Mostrar contenido principal y cargar p5.js
            mainContent.classList.add('visible');
            
            // Inicializar el canvas solo después del login para que tome el tamaño correcto
            setTimeout(initP5Game, 300);
        } else {
            alert('Por favor, ingresa un correo electrónico válido.');
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
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    const animatedElements = document.querySelectorAll('.section-title, .video-card, .challenge-card, .diagram-image, .glass');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(40px)';
        el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
        observer.observe(el);
    });
}

// ==========================================
// 3. INTEGRACIÓN DE JUEGO (p5.js)
// ==========================================
function initP5Game() {
    // Usamos el "Instance Mode" de p5 para no contaminar el scope global
    const sketch = (p) => {
        let proyectil;
        let objetivo;
        let disparado = false;
        let gravedad;
        let estadoMensaje = "Haz clic, arrastra y suelta para disparar.";
        
        p.setup = () => {
            const container = document.getElementById('p5-game-container');
            const w = Math.min(container.offsetWidth, 800);
            const canvas = p.createCanvas(w, 400);
            canvas.parent('p5-game-container');
            
            gravedad = p.createVector(0, 0.2);
            resetJuego();
        };

        p.draw = () => {
            p.background(240, 245, 250); // Color de fondo del laboratorio
            
            // Suelo
            p.fill(30, 41, 59);
            p.noStroke();
            p.rect(0, p.height - 20, p.width, 20);

            // Dibujar objetivo
            p.fill(168, 85, 247); // Morado
            p.rect(objetivo.x, objetivo.y, objetivo.w, objetivo.h);

            // Dibujar cañón base
            p.fill(56, 189, 248); // Azul clarito
            p.arc(50, p.height - 20, 60, 60, p.PI, p.TWO_PI);

            // Lógica del proyectil
            if (disparado) {
                proyectil.vel.add(gravedad);
                proyectil.pos.add(proyectil.vel);
                
                // Colisión con suelo o paredes
                if (proyectil.pos.y > p.height || proyectil.pos.x > p.width || proyectil.pos.x < 0) {
                    fallo();
                }
                
                // Colisión con objetivo
                if (proyectil.pos.x > objetivo.x && proyectil.pos.x < objetivo.x + objetivo.w &&
                    proyectil.pos.y > objetivo.y && proyectil.pos.y < objetivo.y + objetivo.h) {
                    acierto();
                }
            } else if (p.mouseIsPressed) {
                // Dibujar línea de puntería
                p.stroke(56, 189, 248);
                p.strokeWeight(2);
                p.line(50, p.height - 20, p.mouseX, p.mouseY);
            }

            // Dibujar proyectil
            p.fill(15, 23, 42);
            p.noStroke();
            p.circle(proyectil.pos.x, proyectil.pos.y, 16);

            // Mensaje de estado
            p.fill(15, 23, 42);
            p.textSize(16);
            p.textAlign(p.CENTER);
            p.text(estadoMensaje, p.width / 2, 30);
        };

        p.mouseReleased = () => {
            if (!disparado && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
                disparado = true;
                // Calcular vector de fuerza según distancia del click al cañón (Inverso, como resortera)
                let fuerza = p.createVector(50 - p.mouseX, (p.height - 20) - p.mouseY);
                fuerza.mult(0.1); // Reducir escala de fuerza
                proyectil.vel = fuerza;
                estadoMensaje = "¡Proyectil en vuelo!";
            }
        };

        function acierto() {
            estadoMensaje = "¡Impacto Perfecto! +100 XP";
            disparado = false;
            gestor.sumarXP(100);
            setTimeout(resetJuego, 1500);
        }

        function fallo() {
            estadoMensaje = "Fallaste. Pierdes 1 vida.";
            disparado = false;
            gestor.restarVida();
            setTimeout(resetJuego, 1500);
        }

        function resetJuego() {
            proyectil = {
                pos: p.createVector(50, p.height - 20),
                vel: p.createVector(0, 0)
            };
            // Posicionar objetivo aleatoriamente en la mitad derecha
            objetivo = {
                x: p.random(p.width / 2, p.width - 100),
                y: p.height - 60,
                w: 40,
                h: 40
            };
            estadoMensaje = "Haz clic y arrastra hacia atrás para disparar.";
            disparado = false;
        }
        
        // Ajustar canvas al redimensionar ventana
        p.windowResized = () => {
            const container = document.getElementById('p5-game-container');
            const w = Math.min(container.offsetWidth, 800);
            p.resizeCanvas(w, 400);
        };
    };

    new p5(sketch);
}
