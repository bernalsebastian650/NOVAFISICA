/**
 * NOVAFÍSICA - Cinemática del tiro parabólico.
 *
 * Módulo puro: no depende del DOM ni de p5.js, por lo que se puede probar en aislamiento.
 *
 * Convenciones físicas:
 *   - Ángulo θ en radianes, medido desde +x en sentido antihorario ("arriba" es positivo).
 *   - Unidades: píxeles y segundos (independiente de la tasa de refresco de pantalla).
 *   - La inversión del eje y del canvas (y crece hacia abajo) se hace en un único punto: posicion().
 *
 * Ecuaciones:
 *   x(t) = x0 + v0 · cos(θ) · t
 *   y(t) = y0 - ( v0 · sin(θ) · t - ½ · g · t² )      (resta por el eje y del canvas)
 */
class Cinematica {
    /** Aceleración de la gravedad en px/s² (0.25 px/frame² a 60 fps = 900 px/s²). */
    static GRAVEDAD = 900;

    /** Velocidad inicial (px/s) por cada píxel de arrastre. */
    static VELOCIDAD_POR_PX_ARRASTRE = 7.2;

    /** Arrastre máximo considerado (px): acota v0 y evita disparos fuera de escala. */
    static ARRASTRE_MAX = 200;

    /**
     * Convierte un arrastre tipo "honda" en parámetros de lanzamiento.
     * @param {number} dx  ancla.x - puntero.x (px, coordenadas de canvas)
     * @param {number} dy  ancla.y - puntero.y (px, coordenadas de canvas, y hacia abajo)
     * @returns {{v0: number, theta: number}} velocidad inicial (px/s) y ángulo (rad)
     */
    static lanzamientoDesdeArrastre(dx, dy) {
        const arrastre = Math.min(Math.hypot(dx, dy), Cinematica.ARRASTRE_MAX);
        return {
            v0: arrastre * Cinematica.VELOCIDAD_POR_PX_ARRASTRE,
            theta: Math.atan2(-dy, dx) // se invierte dy: en física "arriba" es positivo
        };
    }

    /**
     * Posición en coordenadas de canvas en el instante t.
     * @param {{x0: number, y0: number, v0: number, theta: number}} lanzamiento
     * @param {number} t segundos desde el disparo
     * @param {number} [g] gravedad en px/s²
     * @returns {{x: number, y: number}}
     */
    static posicion({ x0, y0, v0, theta }, t, g = Cinematica.GRAVEDAD) {
        const x = x0 + v0 * Math.cos(theta) * t;
        const alturaFisica = v0 * Math.sin(theta) * t - 0.5 * g * t * t;
        return { x, y: y0 - alturaFisica };
    }

    /**
     * Componente vertical de la velocidad (física: positiva hacia arriba) en el instante t.
     * @returns {number} px/s
     */
    static velocidadVertical({ v0, theta }, t, g = Cinematica.GRAVEDAD) {
        return v0 * Math.sin(theta) - g * t;
    }
}
