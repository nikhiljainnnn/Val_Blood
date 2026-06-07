import { useEffect, useRef } from "react";

// ── Shared vertex shader ────────────────────────────────────────────────────
const VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ── BUFFER A: Wave PDE simulation ───────────────────────────────────────────
// Discrete 2D wave equation:
//   pVel += delta * Laplacian(pressure) / 4   (wave propagation)
//   pressure += delta * pVel
//   pVel -= 0.005 * delta * pressure           (spring / gravity restoring)
//   pVel *= (1 - 0.002 * delta)               (velocity damping)
//   pressure *= 0.999                          (pressure bleed)
// Mouse: treated as a moving pressure source — injects +pressure at cursor pos
// Boundary: reflective (Neumann BC) — waves bounce off edges
const BUFFER_A_FS = `
precision highp float;
uniform sampler2D u_prev;
uniform vec2      u_res;
uniform vec2      u_mouse;       // current mouse in pixels (flipped Y)
uniform vec2      u_mousePrev;   // previous frame mouse position
uniform float     u_hasInit;     // 1 after first frame
varying vec2      v_uv;
 
const float DELTA = 1.0;
 
void main() {
  // cold start
  if (u_hasInit < 0.5) {
    // seed uniform water surface with tiny random-ish perturbation
    // so it looks "pre-wet" from frame 0
    vec2 fc = v_uv * u_res;
    float seed = sin(fc.x * 0.31) * cos(fc.y * 0.27) * 0.04;
    gl_FragColor = vec4(seed, 0.0, 0.0, 0.0);
    return;
  }
 
  vec2 px = 1.0 / u_res;
  vec2 fc = v_uv * u_res;
 
  float pressure = texture2D(u_prev, v_uv).x;
  float pVel     = texture2D(u_prev, v_uv).y;
 
  float pr = texture2D(u_prev, v_uv + vec2( px.x,  0.0 )).x;
  float pl = texture2D(u_prev, v_uv + vec2(-px.x,  0.0 )).x;
  float pu = texture2D(u_prev, v_uv + vec2( 0.0,   px.y)).x;
  float pd = texture2D(u_prev, v_uv + vec2( 0.0,  -px.y)).x;
 
  // reflective boundary (Neumann BC)
  if (fc.x < 1.0)             pl = pr;
  if (fc.x > u_res.x - 1.0)  pr = pl;
  if (fc.y < 1.0)             pd = pu;
  if (fc.y > u_res.y - 1.0)  pu = pd;
 
  // discrete Laplacian — 4-neighbour stencil
  pVel += DELTA * (-2.0 * pressure + pr + pl) / 4.0;
  pVel += DELTA * (-2.0 * pressure + pu + pd) / 4.0;
 
  // integrate
  pressure += DELTA * pVel;
 
  // spring restoring force (makes it look like water, not sound)
  pVel -= 0.005 * DELTA * pressure;
 
  // damping
  pVel     *= 1.0 - 0.002 * DELTA;
  pressure *= 0.999;
 
  // ── Mouse obstacle / source ──────────────────────────────────────────────
  // The mouse is modelled as a moving pressure source:
  // inject positive pressure as cursor moves (velocity proportional to speed)
  float distCur  = distance(fc, u_mouse);
  float distPrev = distance(fc, u_mousePrev);
  float radius   = 28.0;
 
  if (distCur < radius) {
    // Gaussian blob centred on cursor
    float falloff = exp(-distCur * distCur / (2.0 * (radius * 0.4) * (radius * 0.4)));
    // strength scales with how far the mouse moved this frame
    float speed   = clamp(length(u_mouse - u_mousePrev) * 0.06, 0.0, 2.5);
    pressure += falloff * (1.8 + speed);
  }
 
  // xyzw = pressure, pVel, ∂p/∂x, ∂p/∂y
  gl_FragColor = vec4(pressure, pVel, (pr - pl) * 0.5, (pu - pd) * 0.5);
}`;

// ── IMAGE: Rendering — refraction + Fresnel + Blinn-Phong ──────────────────
// Exactly the Shadertoy Image shader logic:
//   1. Sample gradient from sim buffer → surface normal
//   2. Refract UV to get displaced scene lookup
//   3. Fresnel blend between refracted scene and water colour
//   4. Add specular highlight
const IMAGE_FS = `
precision highp float;
uniform sampler2D u_sim;    // Buffer A output
uniform sampler2D u_scene;  // background scene texture
uniform vec2      u_res;
uniform float     u_time;
varying vec2      v_uv;
 
void main() {
  vec4  data     = texture2D(u_sim, v_uv);
  float pressure = data.x;
  vec2  gradient = data.zw;           // (∂p/∂x, ∂p/∂y)
 
  // height-field surface normal
  vec3 N = normalize(vec3(-gradient * 3.5, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);      // viewer straight above
 
  // Schlick Fresnel
  float cosTheta = max(dot(N, V), 0.0);
  float F0       = 0.035;
  float fresnel  = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
 
  // refraction — displace UV by normal XY scaled by wave amplitude
  float amp       = clamp(abs(pressure) * 5.0, 0.0, 1.0);
  vec2  refractUV = v_uv + N.xy * 0.024 * amp;
  refractUV       = clamp(refractUV, 0.001, 0.999);
 
  vec4 scene = texture2D(u_scene, refractUV);
 
  // water colour — deep blood-red palette (RakSetu theme)
  vec3 waterDeep    = vec3(0.40, 0.01, 0.04);
  vec3 waterShallow = vec3(0.65, 0.07, 0.09);
  vec3 waterColor   = mix(waterDeep, waterShallow,
                          clamp(abs(pressure) * 3.0, 0.0, 1.0));
 
  // Blinn-Phong specular — sun from upper-left
  vec3  L    = normalize(vec3(-0.4, 0.7, 1.0));
  vec3  H    = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 80.0);
 
  // Fresnel-driven opacity: calm water = mostly scene, wave crests = water colour
  float opacity = clamp(0.28 + fresnel * 0.35 + abs(pressure) * 0.20, 0.0, 0.80);
 
  vec3 col  = mix(scene.rgb, waterColor, opacity);
  col      += vec3(1.0, 0.85, 0.65) * spec * 1.2;                   // warm glint
  col      += vec3(0.03, 0.20, 0.55) * max(-pressure, 0.0) * 0.4;   // blue trough scatter
 
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ── WebGL helpers ───────────────────────────────────────────────────────────
function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error("Shader compile error:", gl.getShaderInfoLog(s));
    return s;
}

function makeProgram(gl: WebGLRenderingContext, fsSrc: string): WebGLProgram {
    const p = gl.createProgram()!;
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        console.error("Program link error:", gl.getProgramInfoLog(p));
    return p;
}

function makeTexture(
    gl: WebGLRenderingContext,
    w: number, h: number,
    data: ArrayBufferView | null = null,
    linear = true
): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
}

function makeFramebuffer(gl: WebGLRenderingContext, tex: WebGLTexture): WebGLFramebuffer {
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
}

function u(gl: WebGLRenderingContext, prog: WebGLProgram, name: string) {
    return gl.getUniformLocation(prog, name);
}

function bindQuad(gl: WebGLRenderingContext, prog: WebGLProgram, buf: WebGLBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// Generate a scene background texture that mimics RakSetu dark palette
// so refraction bends real-looking colours underneath the water surface
function buildSceneTexture(gl: WebGLRenderingContext, W: number, H: number): WebGLTexture {
    const px = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const nx = x / W;
            const ny = y / H;
            // vignette darkening toward edges
            const vx = 1.0 - Math.abs(nx - 0.5) * 2.0;
            const vy = 1.0 - Math.abs(ny - 0.5) * 2.0;
            const v = Math.pow(vx * vy, 0.4);
            px[i] = Math.round((8 + nx * 22 + ny * 10) * v);  // R — crimson tint
            px[i + 1] = Math.round((0 + nx * 2) * v);  // G
            px[i + 2] = Math.round((18 + nx * 18 + ny * 12) * v);  // B — purple depth
            px[i + 3] = 255;
        }
    }
    return makeTexture(gl, W, H, px);
}

// ── Component ───────────────────────────────────────────────────────────────
export default function FluidBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const gl = (
            canvas.getContext("webgl2") ||
            canvas.getContext("webgl", { preserveDrawingBuffer: false })
        ) as WebGLRenderingContext;

        if (!gl) { console.error("FluidBackground: WebGL not supported"); return; }

        // ── Snake cursor ─────────────────────────────────────────────────────────
        const COLORS = [
            "#ffb56b", "#fdaf69", "#f89d63", "#f59761", "#ef865e", "#ec805d",
            "#e36e5c", "#df685c", "#d5585c", "#d1525c", "#c5415d", "#c03b5d",
            "#b22c5e", "#ac265e", "#9c155f", "#950f5f", "#830060", "#7c0060",
            "#680060", "#60005f",
        ];

        const coords = { x: -999, y: -999 };
        const circleEls = Array.from(document.querySelectorAll<HTMLElement>(".circle"));
        const circlePos = circleEls.map(() => ({ x: 0, y: 0 }));
        circleEls.forEach((c, i) => { c.style.backgroundColor = COLORS[i % COLORS.length]; });

        const onSnakeMove = (e: MouseEvent) => { coords.x = e.clientX; coords.y = e.clientY; };
        window.addEventListener("mousemove", onSnakeMove);

        let snakeRaf: number;
        function animateCircles() {
            let x = coords.x, y = coords.y;
            circleEls.forEach((c, i) => {
                c.style.left = (x - 12) + "px";
                c.style.top = (y - 12) + "px";
                c.style.scale = String((circleEls.length - i) / circleEls.length);
                circlePos[i].x = x;
                circlePos[i].y = y;
                const next = circlePos[i + 1] ?? circlePos[0];
                x += (next.x - x) * 0.3;
                y += (next.y - y) * 0.3;
            });
            snakeRaf = requestAnimationFrame(animateCircles);
        }
        animateCircles();

        // ── WebGL setup ──────────────────────────────────────────────────────────
        const simProg = makeProgram(gl, BUFFER_A_FS);
        const dispProg = makeProgram(gl, IMAGE_FS);

        const quadBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        let W = 0, H = 0;
        let texA: WebGLTexture, texB: WebGLTexture;
        let fbA: WebGLFramebuffer, fbB: WebGLFramebuffer;
        let sceneTex: WebGLTexture;
        let frame = 0;
        const startTime = Date.now();

        function resize() {
            W = window.innerWidth; H = window.innerHeight;
            canvas.width = W; canvas.height = H;
            gl.viewport(0, 0, W, H);
            if (texA) { gl.deleteTexture(texA); gl.deleteTexture(texB); }
            texA = makeTexture(gl, W, H, null, false); fbA = makeFramebuffer(gl, texA);
            texB = makeTexture(gl, W, H, null, false); fbB = makeFramebuffer(gl, texB);
            if (sceneTex) gl.deleteTexture(sceneTex);
            sceneTex = buildSceneTexture(gl, W, H);
            frame = 0;
        }

        resize();
        window.addEventListener("resize", resize);

        const mouse = { x: -999, y: -999 };
        const mousePrev = { x: -999, y: -999 };

        function setMouse(cx: number, cy: number) {
            const r = canvas.getBoundingClientRect();
            mousePrev.x = mouse.x; mousePrev.y = mouse.y;
            mouse.x = (cx - r.left) * (W / r.width);
            mouse.y = H - (cy - r.top) * (H / r.height);
        }

        const onMove = (e: MouseEvent) => setMouse(e.clientX, e.clientY);
        const onTouch = (e: TouchEvent) => { e.preventDefault(); setMouse(e.touches[0].clientX, e.touches[0].clientY); };
        const onTouchEnd = () => { mousePrev.x = mouse.x; mousePrev.y = mouse.y; };

        window.addEventListener("mousemove", onMove);
        canvas.addEventListener("touchmove", onTouch, { passive: false });
        canvas.addEventListener("touchstart", onTouch, { passive: false });
        canvas.addEventListener("touchend", onTouchEnd);

        let autoTimer: ReturnType<typeof setTimeout>;
        function scheduleRipple() {
            const ox = mouse.x, oy = mouse.y;
            const rx = 80 + Math.random() * (W - 160);
            const ry = 80 + Math.random() * (H - 160);
            mousePrev.x = rx - 5; mousePrev.y = ry - 5;
            mouse.x = rx; mouse.y = ry;
            setTimeout(() => { mousePrev.x = mouse.x; mousePrev.y = mouse.y; mouse.x = ox; mouse.y = oy; }, 120);
            autoTimer = setTimeout(scheduleRipple, 1800 + Math.random() * 2500);
        }
        autoTimer = setTimeout(scheduleRipple, 400);

        let rafId: number;
        function tick() {
            const t = (Date.now() - startTime) / 1000;

            gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
            gl.viewport(0, 0, W, H);
            gl.useProgram(simProg);
            bindQuad(gl, simProg, quadBuf);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texA);
            gl.uniform1i(u(gl, simProg, "u_prev"), 0);
            gl.uniform2f(u(gl, simProg, "u_res"), W, H);
            gl.uniform2f(u(gl, simProg, "u_mouse"), mouse.x, mouse.y);
            gl.uniform2f(u(gl, simProg, "u_mousePrev"), mousePrev.x, mousePrev.y);
            gl.uniform1f(u(gl, simProg, "u_hasInit"), frame > 0 ? 1.0 : 0.0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, W, H);
            gl.useProgram(dispProg);
            bindQuad(gl, dispProg, quadBuf);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texB);
            gl.uniform1i(u(gl, dispProg, "u_sim"), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, sceneTex);
            gl.uniform1i(u(gl, dispProg, "u_scene"), 1);
            gl.uniform2f(u(gl, dispProg, "u_res"), W, H);
            gl.uniform1f(u(gl, dispProg, "u_time"), t);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            [texA, texB] = [texB, texA];
            [fbA, fbB] = [fbB, fbA];
            frame++;
            rafId = requestAnimationFrame(tick);
        }
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            cancelAnimationFrame(snakeRaf);       // ← was commented out before
            clearTimeout(autoTimer);
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mousemove", onSnakeMove);  // ← separate listener
            canvas.removeEventListener("touchmove", onTouch);
            canvas.removeEventListener("touchstart", onTouch);
            canvas.removeEventListener("touchend", onTouchEnd);
            gl.deleteBuffer(quadBuf);
            gl.deleteTexture(texA);
            gl.deleteTexture(texB);
            gl.deleteTexture(sceneTex);
            gl.deleteFramebuffer(fbA);
            gl.deleteFramebuffer(fbB);
        };
    }, []);

    return (
        <>
            {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="circle" />
            ))}
            <canvas
                ref={canvasRef}
                style={{
                    position: "fixed", top: 0, left: 0,
                    width: "100vw", height: "100vh",
                    zIndex: 0, pointerEvents: "none", display: "block",
                }}
            />
        </>
    );
}