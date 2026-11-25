import type { ExpoWebGLRenderingContext } from 'expo-gl';

/**
 * GPU point renderer. A cloud is uploaded once as a vertex buffer (the parser's
 * Float32Array, untouched); each frame only sets a few camera uniforms and issues
 * one draw call, so orbiting costs the same for 1k or 100k points.
 *
 * Projection (orthographic, metres → pixels), matching the old CPU version except
 * that world-up now maps to screen-up (the fork's formula had z inverted):
 *   rx = cos(yaw)·x − sin(yaw)·y
 *   ry = sin(yaw)·x + cos(yaw)·y
 *   up = cos(pitch)·ry + sin(pitch)·z
 */
const VERTEX = `
attribute vec3 aPos;
uniform vec2 uYaw;      // cos, sin
uniform vec2 uPitch;    // cos, sin
uniform vec2 uScale;    // metres -> clip space, per axis
uniform vec2 uZ;        // zMin, 1 / zSpan
uniform float uSize;
varying float vT;
void main() {
  float rx = uYaw.x * aPos.x - uYaw.y * aPos.y;
  float ry = uYaw.y * aPos.x + uYaw.x * aPos.y;
  float up = uPitch.x * ry + uPitch.y * aPos.z;
  gl_Position = vec4(rx * uScale.x, up * uScale.y, 0.0, 1.0);
  gl_PointSize = uSize;
  vT = clamp((aPos.z - uZ.x) * uZ.y, 0.0, 1.0);
}`;

// Height gradient: the widget's previous six colours, blended continuously.
const FRAGMENT = `
precision mediump float;
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
  gl_FragColor = vec4(c, 1.0);
}`;

export interface Camera { yaw: number; pitch: number; zoom: number }

export interface PointRenderer {
  /** xyz relative to the view centre, flat [x,y,z,...]. */
  setCloud(xyz: Float32Array, zMin: number, zMax: number): void;
  draw(camera: Camera, viewMeters: number, pointSize: number): void;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Point shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function createPointRenderer(gl: ExpoWebGLRenderingContext): PointRenderer {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Point program: ${gl.getProgramInfoLog(program)}`);
  }
  const aPos = gl.getAttribLocation(program, 'aPos');
  const u = (name: string) => gl.getUniformLocation(program, name);
  const uYaw = u('uYaw'), uPitch = u('uPitch'), uScale = u('uScale'), uZ = u('uZ'), uSize = u('uSize');
  const buffer = gl.createBuffer();
  let count = 0;
  let zMin = 0;
  let zInvSpan = 1;

  return {
    setCloud(xyz, min, max) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, xyz, gl.DYNAMIC_DRAW);
      count = Math.floor(xyz.length / 3);
      zMin = min;
      zInvSpan = 1 / Math.max(0.01, max - min);
    },
    draw(camera, viewMeters, pointSize) {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.027, 0.039, 0.059, 1); // #070A0F, the widget background
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count > 0) {
        const pixelsPerMeter = (Math.min(w, h) / Math.max(1, viewMeters)) * camera.zoom;
        gl.useProgram(program);
        gl.uniform2f(uYaw, Math.cos(camera.yaw), Math.sin(camera.yaw));
        gl.uniform2f(uPitch, Math.cos(camera.pitch), Math.sin(camera.pitch));
        gl.uniform2f(uScale, (2 * pixelsPerMeter) / w, (2 * pixelsPerMeter) / h);
        gl.uniform2f(uZ, zMin, zInvSpan);
        gl.uniform1f(uSize, pointSize);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, count);
      }
      gl.flush();
      gl.endFrameEXP();
    },
  };
}
