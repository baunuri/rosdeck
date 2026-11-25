import type { ExpoWebGLRenderingContext } from 'expo-gl';

/**
 * Layered GPU scene for the 3D View. Every layer's geometry is uploaded once when
 * its data changes; a frame is one camera matrix plus one draw call per layer, so
 * orbiting costs the same whatever the point count. Layers draw back to front in
 * DRAW_ORDER (no depth buffer: ground textures first, markers last).
 */

export type Rgba = [number, number, number, number];
export type TextureLayer = 'map' | 'globalCostmap' | 'localCostmap';
export type ShapeLayer = 'grid' | 'path' | 'footprint' | 'robot' | 'goal';
/** 'cloud:<topic>' allows any number of point clouds. */
export type PointLayer = 'scan' | `cloud:${string}`;
/** Per-vertex coloured geometry (TF axes, markers). */
export type ColoredLayer = 'tf' | 'markerTriangles' | 'markerLines' | 'markerPoints';
type LayerName = TextureLayer | ShapeLayer | PointLayer | ColoredLayer;

// Back to front; a layer named 'base:detail' sorts with 'base'.
const DRAW_ORDER = [
  'grid', 'map', 'globalCostmap', 'localCostmap', 'path', 'footprint',
  'markerTriangles', 'markerLines', 'markerPoints', 'scan', 'cloud', 'tf', 'robot', 'goal',
];
const orderOf = (name: string) => DRAW_ORDER.indexOf(name.split(':')[0]);

const POINTS_VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
uniform float uSize;
uniform vec2 uZ;        // zMin, 1 / zSpan (height colouring)
varying float vT;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = uSize;
  vT = clamp((aPos.z - uZ.x) * uZ.y, 0.0, 1.0);
}`;

// Flat colour, or the six-stop height gradient when uHeight = 1.
const POINTS_FS = `
precision mediump float;
uniform vec4 uColor;
uniform float uHeight;
varying float vT;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  float s = vT * 5.0;
  vec3 c = mix(vec3(0.145, 0.388, 0.922), vec3(0.024, 0.714, 0.831), clamp(s, 0.0, 1.0));
  c = mix(c, vec3(0.133, 0.773, 0.369), clamp(s - 1.0, 0.0, 1.0));
  c = mix(c, vec3(0.639, 0.902, 0.208), clamp(s - 2.0, 0.0, 1.0));
  c = mix(c, vec3(0.984, 0.749, 0.141), clamp(s - 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.937, 0.267, 0.267), clamp(s - 4.0, 0.0, 1.0));
  gl_FragColor = vec4(mix(uColor.rgb, c, uHeight), uColor.a);
}`;

const FLAT_VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;

const FLAT_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

const COLORED_VS = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uMVP;
uniform float uSize;
varying vec4 vColor;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); gl_PointSize = uSize; vColor = aColor; }`;

const COLORED_FS = `
precision mediump float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;

const TEX_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uMVP;
varying vec2 vUV;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); vUV = aUV; }`;

const TEX_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uOpacity;
varying vec2 vUV;
void main() { vec4 t = texture2D(uTex, vUV); gl_FragColor = vec4(t.rgb, t.a * uOpacity); }`;

// Pixel rows from gridToRgbaFast run top (max y) to bottom, hence v = 1 at the origin row.
const QUAD_UV = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

interface PointStyle { color: Rgba; size: number; heightColored?: boolean; zMin?: number; zMax?: number }
interface ShapeStyle { color: Rgba; mode: 'lines' | 'strip' | 'triangles' | 'loop' }
export interface GridImage {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Fixed-frame corners [x,y,z]×4: origin, +x edge, +y edge, far corner. */
  corners: Float32Array;
  opacity: number;
}

type Mode = 'lines' | 'strip' | 'loop' | 'triangles' | 'points';
type Layer =
  | { kind: 'colored'; buffer: WebGLBuffer; colorBuffer: WebGLBuffer; count: number; mode: Mode; size: number }
  | { kind: 'points'; buffer: WebGLBuffer; count: number; style: PointStyle }
  | { kind: 'shape'; buffer: WebGLBuffer; count: number; style: ShapeStyle }
  | { kind: 'texture'; buffer: WebGLBuffer; texture: WebGLTexture; opacity: number };

export interface SceneRenderer {
  setPoints(name: PointLayer, xyz: Float32Array | null, style?: PointStyle): void;
  setShape(name: ShapeLayer, xyz: Float32Array | null, style?: ShapeStyle): void;
  /** `rgba` holds 4 floats (0-1) per vertex. `size` is the point size for mode 'points'. */
  setColored(name: ColoredLayer, xyz: Float32Array | null, rgba?: Float32Array, mode?: Mode, size?: number): void;
  /** Point-cloud layer names currently present (to drop clouds whose topic was removed). */
  pointLayers(): string[];
  setTexture(name: TextureLayer, image: GridImage | null): void;
  /** Re-places an existing texture layer (TF moved) without re-uploading its pixels. */
  moveTexture(name: TextureLayer, corners: Float32Array): void;
  draw(mvp: Float32Array): void;
}

function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`3D View shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`3D View program: ${gl.getProgramInfoLog(p)}`);
  // Uniform locations cached: each lookup is a native call, and draw() needs dozens per frame.
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
    return cache.get(name)!;
  };
  return { p, aPos: gl.getAttribLocation(p, 'aPos'), aUV: gl.getAttribLocation(p, 'aUV'), u };
}

export function createSceneRenderer(gl: ExpoWebGLRenderingContext): SceneRenderer {
  const points = program(gl, POINTS_VS, POINTS_FS);
  const flat = program(gl, FLAT_VS, FLAT_FS);
  const tex = program(gl, TEX_VS, TEX_FS);
  const colored = program(gl, COLORED_VS, COLORED_FS);
  const aColor = gl.getAttribLocation(colored.p, 'aColor');
  const uvBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_UV, gl.STATIC_DRAW);
  const layers = new Map<LayerName, Layer>();

  const upload = (existing: WebGLBuffer | undefined, data: Float32Array) => {
    const buffer = existing ?? gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    return buffer;
  };
  const drop = (name: LayerName) => {
    const layer = layers.get(name);
    if (!layer) return;
    gl.deleteBuffer(layer.buffer);
    if (layer.kind === 'texture') gl.deleteTexture(layer.texture);
    if (layer.kind === 'colored') gl.deleteBuffer(layer.colorBuffer);
    layers.delete(name);
  };

  return {
    setPoints(name, xyz, style) {
      if (!xyz || xyz.length === 0 || !style) return drop(name);
      const prev = layers.get(name);
      const buffer = upload(prev?.buffer, xyz);
      layers.set(name, { kind: 'points', buffer, count: Math.floor(xyz.length / 3), style });
    },

    setShape(name, xyz, style) {
      if (!xyz || xyz.length === 0 || !style) return drop(name);
      const prev = layers.get(name);
      const buffer = upload(prev?.buffer, xyz);
      layers.set(name, { kind: 'shape', buffer, count: Math.floor(xyz.length / 3), style });
    },

    setColored(name, xyz, rgba, mode = 'lines', size = 1) {
      if (!xyz || xyz.length === 0 || !rgba) return drop(name);
      const prev = layers.get(name);
      const buffer = upload(prev?.buffer, xyz);
      const colorBuffer = upload(prev?.kind === 'colored' ? prev.colorBuffer : undefined, rgba);
      layers.set(name, { kind: 'colored', buffer, colorBuffer, count: Math.floor(xyz.length / 3), mode, size });
    },

    pointLayers() {
      return [...layers.keys()].filter((name) => name.startsWith('cloud:'));
    },

    setTexture(name, image) {
      if (!image) return drop(name);
      const prev = layers.get(name);
      const buffer = upload(prev?.buffer, image.corners);
      const texture = prev?.kind === 'texture' ? prev.texture : gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Occupancy grids are rarely power-of-two sized: WebGL1 then needs clamp + no mipmaps.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.rgba);
      layers.set(name, { kind: 'texture', buffer, texture, opacity: image.opacity });
    },

    moveTexture(name, corners) {
      const layer = layers.get(name);
      if (layer?.kind === 'texture') upload(layer.buffer, corners);
    },

    draw(mvp) {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.027, 0.039, 0.059, 1); // #070A0F, the widget background
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Camera matrix set once per program per frame (each GL call is a native round trip).
      for (const prog of [points, flat, tex, colored]) {
        gl.useProgram(prog.p);
        gl.uniformMatrix4fv(prog.u('uMVP'), false, mvp);
      }
      const ordered = [...layers.keys()].sort((a, b) => orderOf(a) - orderOf(b));
      for (const name of ordered) {
        const layer = layers.get(name)!;
        const glMode = (mode: Mode) => mode === 'lines' ? gl.LINES : mode === 'strip' ? gl.LINE_STRIP
          : mode === 'loop' ? gl.LINE_LOOP : mode === 'points' ? gl.POINTS : gl.TRIANGLES;
        if (layer.kind === 'colored') {
          gl.useProgram(colored.p);
          gl.uniform1f(colored.u('uSize'), layer.size);
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
          gl.enableVertexAttribArray(colored.aPos);
          gl.vertexAttribPointer(colored.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.colorBuffer);
          gl.enableVertexAttribArray(aColor);
          gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);
          gl.drawArrays(glMode(layer.mode), 0, layer.count);
          gl.disableVertexAttribArray(aColor);
        } else if (layer.kind === 'texture') {
          gl.useProgram(tex.p);
          gl.uniform1f(tex.u('uOpacity'), layer.opacity);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, layer.texture);
          gl.uniform1i(tex.u('uTex'), 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
          gl.enableVertexAttribArray(tex.aPos);
          gl.vertexAttribPointer(tex.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
          gl.enableVertexAttribArray(tex.aUV);
          gl.vertexAttribPointer(tex.aUV, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disableVertexAttribArray(tex.aUV);
        } else if (layer.kind === 'points') {
          const { color, size, heightColored, zMin = 0, zMax = 1 } = layer.style;
          gl.useProgram(points.p);
          gl.uniform1f(points.u('uSize'), size);
          gl.uniform4f(points.u('uColor'), ...color);
          gl.uniform1f(points.u('uHeight'), heightColored ? 1 : 0);
          gl.uniform2f(points.u('uZ'), zMin, 1 / Math.max(0.01, zMax - zMin));
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
          gl.enableVertexAttribArray(points.aPos);
          gl.vertexAttribPointer(points.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, layer.count);
        } else {
          gl.useProgram(flat.p);
          gl.uniform4f(flat.u('uColor'), ...layer.style.color);
          gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
          gl.enableVertexAttribArray(flat.aPos);
          gl.vertexAttribPointer(flat.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(glMode(layer.style.mode), 0, layer.count);
        }
      }
      gl.flush();
      gl.endFrameEXP();
    },
  };
}
