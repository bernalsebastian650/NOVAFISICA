/**
 * NOVAFÍSICA - Controlador de interfaz (Emil Kowalski Edition)
 *
 * Orden de carga (index.html): Cinematica.js → GestorProgreso.js → RetoParabolico.js → SimuladorBase.js →
 *   SimuladorParabolico.js → SimuladorNewton.js → SimuladorOndas.js → Laboratorio.js → Carrusel.js → script.js
 *
 *   GestorProgreso      → estado y localStorage (sin DOM)
 *   RetoParabolico      → reto gamificado de #desafios en p5.js (sin estado de usuario)
 *   Laboratorio         → pestañas de #interactivo; un solo simulador p5 vivo a la vez
 *   SimuladorParabolico / SimuladorNewton / SimuladorOndas → simuladores del laboratorio (SimuladorBase)
 *   Carrusel            → galería automática de #interactivo (sin estado de usuario)
 *   script.js           → une las piezas: toasts, render del progreso, login y scroll
 */

// ==========================================
// 1. SISTEMA DE TOASTS (Estilo Sonner)
// ==========================================
// Consulta única de reducción de movimiento: toda animación programática debe validarla antes de ejecutarse
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Lee un token CSS (:root) para que curvas y duraciones vivan solo en styles.css */
const tokenCSS = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

class ToastSystem {
    static MAX_VISIBLES = 4;
    static DURACION_MS = 4000;
    static RESPALDO_SALIDA_MS = 800;
    static ICONOS = Object.freeze({ success: '🏆', error: '💔', info: '✨' });

    constructor() {
        this.container = document.getElementById('toast-container');
        if (this.container) {
            // Lectores de pantalla anuncian los avisos sin robar el foco
            this.container.setAttribute('role', 'status');
            this.container.setAttribute('aria-live', 'polite');
        }
    }

    /**
     * FLIP: ejecuta una mutación del DOM y anima los toasts existentes
     * desde su posición anterior a la nueva, evitando saltos bruscos en el stack.
     */
    _flip(mutar) {
        const existentes = [...this.container.children];
        const antes = new Map(existentes.map(el => [el, el.getBoundingClientRect().top]));
        mutar();
        if (reducedMotion.matches) return;

        const curva = tokenCSS('--smooth');
        const duracion = parseFloat(tokenCSS('--dur-fast')) * 1000;

        existentes.forEach(el => {
            if (!el.isConnected) return;
            const delta = antes.get(el) - el.getBoundingClientRect().top;
            if (!delta) return;
            el.animate(
                [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
                { duration: duracion, easing: curva }
            );
        });
    }

    /** Inicia la animación de salida y limpia el DOM al terminar (con respaldo si no llega animationend). */
    _retirar(toast) {
        if (toast.classList.contains('exiting')) return;
        clearTimeout(toast._temporizador);
        toast.classList.add('exiting');

        let retirado = false;
        const eliminar = () => {
            if (retirado) return;
            retirado = true;
            this._flip(() => toast.remove());
        };
        toast.addEventListener('animationend', eliminar, { once: true });
        setTimeout(eliminar, ToastSystem.RESPALDO_SALIDA_MS);
    }

    show(message, type = 'info') {
        if (!this.container) return;

        // Tope de avisos simultáneos: el más antiguo se retira para no saturar la pantalla
        const activos = [...this.container.children].filter(el => !el.classList.contains('exiting'));
        if (activos.length >= ToastSystem.MAX_VISIBLES) this._retirar(activos[0]);

        const toast = document.createElement('div');
        toast.className = 'toast';

        const icono = document.createElement('span');
        icono.className = 'toast-icon';
        icono.textContent = ToastSystem.ICONOS[type] ?? ToastSystem.ICONOS.info;

        const texto = document.createElement('span');
        texto.textContent = message; // textContent: el mensaje nunca se interpreta como HTML

        toast.append(icono, document.createTextNode(' '), texto);
        this._flip(() => this.container.appendChild(toast));

        // Remover automáticamente después de 4 segundos
        toast._temporizador = setTimeout(() => this._retirar(toast), ToastSystem.DURACION_MS);
    }
}

const toast = new ToastSystem();

// ==========================================
// 2. INTERFAZ DEL PROGRESO (render + avisos)
// ==========================================
/**
 * Traduce los eventos de GestorProgreso en DOM y toasts.
 * Solo lee el estado (copia inmutable): jamás lo modifica ni toca localStorage.
 */
class InterfazProgreso {
    static INSIGNIAS = Object.freeze({
        explorador: { icono: '🌌', titulo: 'Explorador Cuántico' },
        francotirador: { icono: '🎯', titulo: 'Tiro Parabólico' }
    });
    static ICONO_BATERIA = '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M16 20H8V6h8v14zm2-16h-3V2h-6v2H6v18h12V4z"/></svg>';

    constructor(avisos) {
        this._avisos = avisos;
        this._elementos = {
            perfil: document.getElementById('user-profile-display'),
            xp: document.getElementById('ui-xp'),
            racha: document.getElementById('ui-racha'),
            vidas: document.getElementById('ui-vidas'),
            insignias: document.getElementById('ui-insignias')
        };
        this._firmaVidas = null;
        this._firmaInsignias = null;
    }

    /** Oyente de GestorProgreso: refresca la vista y avisa del hito. */
    reaccionar(evento, estado) {
        if (!estado) return;
        this.renderizar(estado);
        this._avisar(evento, estado);
    }

    renderizar(estado) {
        const { perfil, xp, racha } = this._elementos;
        if (perfil) perfil.textContent = `Explorador: ${estado.email.split('@')[0]}`;
        if (xp) xp.textContent = `${estado.xp} XP`;
        if (racha) racha.textContent = `${estado.racha} Días`;

        this._renderizarVidas(estado.vidas);
        this._renderizarInsignias(estado.insignias);
    }

    /** Solo reconstruye el DOM si las vidas cambiaron (evita reiniciar hovers/animaciones). */
    _renderizarVidas(vidas) {
        const { vidas: contenedor } = this._elementos;
        if (!contenedor || this._firmaVidas === vidas) return;
        this._firmaVidas = vidas;

        const baterias = Array.from({ length: GestorProgreso.VIDAS_MAX }, (_, i) => {
            const bateria = document.createElement('span');
            bateria.className = i < vidas ? 'battery' : 'battery empty';
            bateria.innerHTML = InterfazProgreso.ICONO_BATERIA; // constante propia, sin datos de usuario
            return bateria;
        });
        contenedor.replaceChildren(...baterias);
    }

    _renderizarInsignias(ids) {
        const { insignias: contenedor } = this._elementos;
        const firma = ids.join('|');
        if (!contenedor || this._firmaInsignias === firma) return;
        this._firmaInsignias = firma;

        const tarjetas = ids
            .filter((id) => InterfazProgreso.INSIGNIAS[id])
            .map((id) => {
                const { icono, titulo } = InterfazProgreso.INSIGNIAS[id];
                const tarjeta = document.createElement('div');
                tarjeta.className = 'badge glass';

                const iconoEl = document.createElement('div');
                iconoEl.className = 'badge-icon';
                iconoEl.textContent = icono;

                const tituloEl = document.createElement('h4');
                tituloEl.textContent = titulo;

                tarjeta.append(iconoEl, tituloEl);
                return tarjeta;
            });
        contenedor.replaceChildren(...tarjetas);
    }

    /** Pulso de XP: la animación vive en CSS (.is-bumping), JS solo alterna la clase */
    _pulsarXP() {
        const xp = this._elementos.xp;
        if (!xp) return;
        requestAnimationFrame(() => {
            xp.classList.add('is-bumping');
            setTimeout(() => xp.classList.remove('is-bumping'), 400);
        });
    }

    _avisar(evento) {
        const aviso = (mensaje, tipo) => this._avisos.show(mensaje, tipo);
        switch (evento.tipo) {
            case 'sesion':
                if (evento.nueva) aviso('Nueva aventura iniciada. ¡Exploremos el universo!', 'info');
                else aviso('Progreso cargado exitosamente. ¡Bienvenido de vuelta!', 'success');
                break;
            case 'xp':
                this._pulsarXP();
                aviso(`+${evento.cantidad} XP Obtenida`, 'success');
                break;
            case 'insignia': {
                const info = InterfazProgreso.INSIGNIAS[evento.id];
                if (info) aviso(`¡Insignia Desbloqueada: ${info.titulo}!`, 'success');
                break;
            }
            case 'vida-perdida':
                // Con la última vida se muestra solo el aviso de "agotadas"
                if (evento.restantes > 0) aviso('¡Cuidado! Has perdido una vida.', 'error');
                break;
            case 'vidas-agotadas':
                aviso(MENSAJE_SIN_VIDAS, 'error');
                break;
            case 'vidas-recargadas':
                aviso('Energía vital recargada. ¡Nuevo día, nuevos retos!', 'info');
                break;
            case 'racha-incrementada':
                aviso(`¡Racha de ${evento.racha} días! Sigue así.`, 'success');
                break;
            case 'racha-reiniciada':
                aviso('Perdiste tu racha. ¡Empieza una nueva hoy!', 'error');
                break;
            case 'datos-corruptos':
                aviso('Tu progreso guardado estaba dañado: iniciamos uno nuevo.', 'error');
                break;
            case 'guardado-fallido':
                aviso('No se pudo guardar tu progreso en este navegador.', 'error');
                break;
            case 'sincronizado':
                aviso('Progreso actualizado desde otra pestaña.', 'info');
                break;
        }
    }
}

// ==========================================
// 3. ENSAMBLAJE: ESTADO ↔ INTERFAZ ↔ SIMULADOR
// ==========================================
const MENSAJE_SIN_VIDAS = 'Sin energía vital. Vuelve mañana para recargarla.';
const XP_POR_ACIERTO = 100;

const gestor = new GestorProgreso();
const interfaz = new InterfazProgreso(toast);
let simulador = null;

// Flujo único de datos: acción → GestorProgreso (guarda) → evento → interfaz (DOM + toast) → simulador (bloqueo)
gestor.suscribir((evento, estado) => {
    interfaz.reaccionar(evento, estado);
    sincronizarBloqueoSimulador();
});

function sincronizarBloqueoSimulador() {
    if (simulador) simulador.establecerBloqueo(!gestor.tieneVidas, MENSAJE_SIN_VIDAS);
}

function leerColoresSimulador() {
    return {
        fondo: tokenCSS('--bg-main'),
        estructura: tokenCSS('--dark-blue'),
        objetivo: tokenCSS('--accent-purple'),
        canon: tokenCSS('--accent-cyan'),
        guia: tokenCSS('--text-muted'),
        mensaje: tokenCSS('--text-light')
    };
}

/** Idempotente: una sola instancia del simulador por sesión. */
function iniciarSimulador() {
    if (simulador) return;
    if (typeof p5 === 'undefined') {
        toast.show('No se pudo cargar el simulador (p5.js). Revisa tu conexión.', 'error');
        return;
    }

    simulador = new RetoParabolico({
        contenedor: document.getElementById('p5-game-container'),
        colores: leerColoresSimulador(),
        alResolver: (resultado) => {
            if (resultado === 'acierto') gestor.sumarXP(XP_POR_ACIERTO);
            else gestor.restarVida();
        }
    });
    sincronizarBloqueoSimulador();
}

/** Paleta del laboratorio (fondo oscuro). Solo tokens hex: p5.color no interpreta color-mix(). */
function leerColoresLaboratorio() {
    return {
        fondo: tokenCSS('--dark-blue'),
        texto: tokenCSS('--white'),
        tenue: tokenCSS('--text-muted'),
        cian: tokenCSS('--accent-cyan'),
        violeta: tokenCSS('--accent-violet'),
        teal: tokenCSS('--accent-teal')
    };
}

let laboratorio = null;

/** Idempotente. Cada fábrica crea un simulador nuevo: Laboratorio destruye el anterior al cambiar de pestaña. */
function iniciarLaboratorio() {
    const raiz = document.getElementById('laboratorio');
    if (laboratorio || !raiz || typeof p5 === 'undefined') return;

    const colores = leerColoresLaboratorio();
    laboratorio = new Laboratorio(raiz, {
        parabolico: (panel) => new SimuladorParabolico({ panel, colores }),
        newton: (panel) => new SimuladorNewton({ panel, colores }),
        ondas: (panel) => new SimuladorOndas({ panel, colores })
    });
}

// ==========================================
// 4. INICIALIZACIÓN DEL DOM Y LÓGICA UI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initSmoothScrolling();
    initScrollAnimations();
    initCarrusel();
});

function initCarrusel() {
    const contenedor = document.querySelector('#interactivo .carousel-container');
    if (contenedor) new Carrusel(contenedor);
}

function initLogin() {
    const modal = document.getElementById('login-modal');
    const mainContent = document.getElementById('main-content');
    const btnLogin = document.getElementById('btn-login');
    const emailInput = document.getElementById('user-email');

    // display (is-rendered) y opacity (visible) en frames distintos: así el fade-in sí se anima
    const mostrarContenido = () => {
        mainContent.classList.add('is-rendered');
        modal.classList.add('hidden');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                mainContent.classList.add('visible');
                iniciarSimulador(); // el contenedor ya tiene layout: el canvas toma su ancho real
                iniciarLaboratorio();
            });
        });
    };

    // Recarga accidental: sesión de menos de 1 h → no se vuelve a pedir el correo
    if (gestor.restaurarSesion()) {
        mostrarContenido();
        return;
    }

    const ingresar = () => {
        const email = emailInput.value.trim();
        if (!GestorProgreso.esEmailValido(email)) {
            toast.show('Ingresa un correo electrónico válido para continuar.', 'error');

            // Shake de validación: keyframes en CSS; se reinicia la clase para poder repetirlo
            emailInput.classList.remove('shake');
            void emailInput.offsetWidth; // fuerza reflow para reiniciar la animación
            emailInput.classList.add('shake');
            emailInput.addEventListener('animationend', () => {
                emailInput.classList.remove('shake');
            }, { once: true });
            return;
        }

        btnLogin.disabled = true; // evita doble envío mientras transiciona
        gestor.iniciarSesion(email);
        mostrarContenido();
    };

    btnLogin.addEventListener('click', ingresar);
    emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ingresar();
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
                // El scroll suave programático ignora el CSS: se valida reduced-motion aquí
                targetSection.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
            }
        });
    });
}

function initScrollAnimations() {
    // Con reduced-motion no se oculta nada: el contenido aparece directamente
    if (reducedMotion.matches) return;

    const contenedorCanvas = document.getElementById('p5-game-container');

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;

            requestAnimationFrame(() => el.classList.add('in-view'));

            // La variante .reveal--fade solo anima opacity; el resto anima transform
            const propiedad = el.classList.contains('reveal--fade') ? 'opacity' : 'transform';

            // Al terminar el reveal se retiran las clases para que el hover/active propio de cada tarjeta recupere el control
            const limpiar = (e) => {
                if (e && (e.target !== el || e.propertyName !== propiedad)) return;
                el.classList.remove('reveal', 'reveal--fade', 'in-view');
                el.style.removeProperty('--reveal-i');
                el.removeEventListener('transitionend', limpiar);
                clearTimeout(respaldo);
            };
            // Respaldo: si transitionend no se dispara (pestaña en segundo plano) no se deja el reveal pegado
            const respaldo = setTimeout(() => limpiar(), 2000);
            el.addEventListener('transitionend', limpiar);
            obs.unobserve(el);
        });
    }, { threshold: 0.15 });

    // Stagger: índice del elemento dentro de su contenedor (máx. 5 pasos de 60ms)
    const indicePorPadre = new Map();
    document.querySelectorAll('.section-title, .video-card, .challenge-card, .glass:not(.modal-content)').forEach(el => {
        const indice = indicePorPadre.get(el.parentElement) ?? 0;
        indicePorPadre.set(el.parentElement, indice + 1);
        el.style.setProperty('--reveal-i', Math.min(indice, 5)); // variable CSS (dato), no una propiedad animada
        el.classList.add('reveal');
        // EXCEPCIÓN p5.js: el árbol que contiene el canvas nunca recibe transform, solo fade
        if (contenedorCanvas && el.contains(contenedorCanvas)) el.classList.add('reveal--fade');
        observer.observe(el);
    });
}
