"use client";

import {useEffect, useRef} from "react";

const VERTEX_SHADER = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform vec2 u_mouse;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
    vec2 u = f*f*(3.-2.*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
    float v = 0., a = 0.5;
    for(int i=0; i<6; i++){ v += a*noise(p); p *= 2.05; a *= 0.5; }
    return v;
}

void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
    vec2 m = (u_mouse - 0.5*u_res) / u_res.y;

    float t = u_t * 0.06;
    vec2 q = uv * 1.6;
    q += 0.6 * vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, -t)));
    q += 0.4 * vec2(fbm(q*1.8 + t*0.8), fbm(q*1.8 - t*0.6));

    float n = fbm(q*1.2 + t);

    float md = length(uv - m*0.6);
    float spot = exp(-md*1.8);

    vec3 black = vec3(0.027, 0.027, 0.039);
    vec3 deepRed = vec3(0.34, 0.06, 0.07);
    vec3 hotRed = vec3(0.94, 0.30, 0.29);
    vec3 amber = vec3(1.0, 0.55, 0.30);

    float band = smoothstep(0.35, 0.85, n);
    vec3 col = mix(black, deepRed, band);
    col = mix(col, hotRed, smoothstep(0.55, 0.92, n)*0.85);
    col = mix(col, amber, smoothstep(0.82, 1.0, n)*0.4);

    col += hotRed * 0.18 * spot;

    float lines = abs(sin((uv.x*8.0 + n*4.0) - t*2.0));
    lines = smoothstep(0.985, 1.0, 1.0 - lines);
    col += hotRed * lines * 0.3;

    float vig = smoothstep(1.15, 0.3, length(uv*vec2(0.9, 1.1)));
    col *= mix(0.35, 1.0, vig);

    col *= 0.92;
    col = pow(col, vec3(1.02));

    gl_FragColor = vec4(col, 1.0);
}
`;

export function HeroShader() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", {antialias: false, alpha: true});
        if (!gl) {
            canvas.style.background = "radial-gradient(ellipse at center, #2a0e10, #07070a 70%)";
            return;
        }

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type);
            if (!s) return null;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(s));
            }
            return s;
        };

        const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vs || !fs) return;

        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const uRes = gl.getUniformLocation(prog, "u_res");
        const uT = gl.getUniformLocation(prog, "u_t");
        const uM = gl.getUniformLocation(prog, "u_mouse");

        let mx = 0;
        let my = 0;
        let tx = 0;
        let ty = 0;

        const hero = canvas.closest(".hero") as HTMLElement | null;
        const onMove = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            tx = (e.clientX - r.left) * (canvas.width / r.width);
            ty = (r.height - (e.clientY - r.top)) * (canvas.height / r.height);
        };
        hero?.addEventListener("mousemove", onMove);

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const r = canvas.getBoundingClientRect();
            canvas.width = r.width * dpr;
            canvas.height = r.height * dpr;
            gl.viewport(0, 0, canvas.width, canvas.height);
            mx = canvas.width / 2;
            my = canvas.height / 2;
            tx = mx;
            ty = my;
        };
        window.addEventListener("resize", resize);
        resize();

        const start = performance.now();
        let raf = 0;
        const frame = () => {
            mx += (tx - mx) * 0.05;
            my += (ty - my) * 0.05;
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uT, (performance.now() - start) / 1000);
            gl.uniform2f(uM, mx, my);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            raf = requestAnimationFrame(frame);
        };
        frame();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
            hero?.removeEventListener("mousemove", onMove);
        };
    }, []);

    return <canvas ref={canvasRef} />;
}
