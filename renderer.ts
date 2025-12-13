import { FilterSettings } from './types';

export class WebGLRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram | null = null;
  texture: WebGLTexture | null = null;
  
  // Buffers
  positionBuffer: WebGLBuffer | null = null;
  texCoordBuffer: WebGLBuffer | null = null;
  
  // Attribute/Uniform Locations
  positionLocation: number = 0;
  texCoordLocation: number = 0;
  imageLocation: WebGLUniformLocation | null = null;
  
  // Filter Uniforms
  u_brightness: WebGLUniformLocation | null = null;
  u_contrast: WebGLUniformLocation | null = null;
  u_saturation: WebGLUniformLocation | null = null;
  u_hue: WebGLUniformLocation | null = null;
  u_sepia: WebGLUniformLocation | null = null;
  u_blur: WebGLUniformLocation | null = null;
  u_mirror: WebGLUniformLocation | null = null;
  u_temperature: WebGLUniformLocation | null = null;
  u_tint: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }); // preserveDrawingBuffer is crucial for taking photos
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.init();
  }

  private init() {
    const { gl } = this;

    // Vertex Shader
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      uniform float u_mirror;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        // Flip Y because WebGL 0,0 is bottom-left, Video is top-left
        // Handle Mirroring (X axis)
        vec2 texCoord = a_texCoord;
        if (u_mirror > 0.5) {
           texCoord.x = 1.0 - texCoord.x;
        }
        v_texCoord = vec2(texCoord.x, 1.0 - texCoord.y);
      }
    `;

    // Fragment Shader (Filters)
    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      
      uniform float u_brightness; // 1.0 = normal
      uniform float u_contrast;   // 1.0 = normal
      uniform float u_saturation; // 1.0 = normal
      uniform float u_hue;        // 0.0 = normal (degrees)
      uniform float u_sepia;      // 0.0 = normal (amount)
      uniform float u_blur;       // 0.0 = none, range 0-50
      uniform float u_temperature;// 0.0 = normal, -0.5 to 0.5
      uniform float u_tint;       // 0.0 = normal, -0.5 to 0.5

      // Hue adjustment helper
      vec3 rgb2yiq(vec3 c) {
        return vec3(
          0.299 * c.r + 0.587 * c.g + 0.114 * c.b,
          0.596 * c.r - 0.275 * c.g - 0.321 * c.b,
          0.212 * c.r - 0.523 * c.g + 0.311 * c.b
        );
      }
      vec3 yiq2rgb(vec3 c) {
        return vec3(
          1.0 * c.x + 0.956 * c.y + 0.621 * c.z,
          1.0 * c.x - 0.272 * c.y - 0.647 * c.z,
          1.0 * c.x - 1.105 * c.y + 1.702 * c.z
        );
      }

      void main() {
        vec4 color = vec4(0.0);
        
        // Simple Convolution Blur (Simulating Gaussian)
        if (u_blur > 0.1) {
             float total = 0.0;
             float step = 0.001 * (1.0 + u_blur / 10.0);
             for (float x = -2.0; x <= 2.0; x++) {
                 for (float y = -2.0; y <= 2.0; y++) {
                      vec2 offset = vec2(x, y) * step;
                      color += texture2D(u_image, v_texCoord + offset);
                      total += 1.0;
                 }
             }
             color = color / total;
        } else {
             color = texture2D(u_image, v_texCoord);
        }

        vec3 rgb = color.rgb;

        // 1. Temperature (Blue <-> Amber)
        // Warm: Increase Red, Decrease Blue
        // Cool: Decrease Red, Increase Blue
        rgb.r += u_temperature * 0.15;
        rgb.b -= u_temperature * 0.15;

        // 2. Tint (Green <-> Magenta)
        // Green: Increase Green
        // Magenta: Decrease Green
        rgb.g += u_tint * 0.15;

        // 3. Brightness
        rgb = rgb * u_brightness;

        // 4. Contrast
        rgb = (rgb - 0.5) * u_contrast + 0.5;

        // 5. Saturation
        float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
        rgb = mix(vec3(gray), rgb, u_saturation);

        // 6. Sepia
        if (u_sepia > 0.0) {
           vec3 sepiaColor = vec3(
             dot(rgb, vec3(0.393, 0.769, 0.189)),
             dot(rgb, vec3(0.349, 0.686, 0.168)),
             dot(rgb, vec3(0.272, 0.534, 0.131))
           );
           rgb = mix(rgb, sepiaColor, u_sepia / 100.0);
        }

        // 7. Hue
        if (u_hue != 0.0) {
           vec3 yiq = rgb2yiq(rgb);
           float hueRad = u_hue * 3.14159 / 180.0;
           float chroma = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
           float hue = atan(yiq.z, yiq.y) + hueRad;
           yiq.y = chroma * cos(hue);
           yiq.z = chroma * sin(hue);
           rgb = yiq2rgb(yiq);
        }

        gl_FragColor = vec4(rgb, color.a);
      }
    `;

    this.program = this.createProgram(gl, vsSource, fsSource);
    if (!this.program) return;

    gl.useProgram(this.program);

    // Look up locations
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
    
    this.imageLocation = gl.getUniformLocation(this.program, "u_image");
    this.u_brightness = gl.getUniformLocation(this.program, "u_brightness");
    this.u_contrast = gl.getUniformLocation(this.program, "u_contrast");
    this.u_saturation = gl.getUniformLocation(this.program, "u_saturation");
    this.u_hue = gl.getUniformLocation(this.program, "u_hue");
    this.u_sepia = gl.getUniformLocation(this.program, "u_sepia");
    this.u_blur = gl.getUniformLocation(this.program, "u_blur");
    this.u_mirror = gl.getUniformLocation(this.program, "u_mirror");
    this.u_temperature = gl.getUniformLocation(this.program, "u_temperature");
    this.u_tint = gl.getUniformLocation(this.program, "u_tint");

    // Create a buffer for the rectangle
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]), gl.STATIC_DRAW);

    // Create buffer for texture coords
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0,
    ]), gl.STATIC_DRAW);

    // Create a texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  render(source: HTMLVideoElement | HTMLImageElement, filters: FilterSettings, mirror: boolean) {
    const { gl } = this;
    if (!this.program || !this.texture || !this.positionBuffer || !this.texCoordBuffer) return;

    gl.useProgram(this.program);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // 1. Bind Position
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 2. Bind TexCoord
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.texCoordLocation);
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    
    // Set uniforms
    gl.uniform1i(this.imageLocation, 0);
    gl.uniform1f(this.u_brightness, filters.brightness / 100);
    gl.uniform1f(this.u_contrast, filters.contrast / 100);
    gl.uniform1f(this.u_saturation, filters.saturation / 100);
    gl.uniform1f(this.u_hue, filters.hue);
    gl.uniform1f(this.u_sepia, filters.sepia);
    gl.uniform1f(this.u_blur, filters.blur);
    gl.uniform1f(this.u_temperature, filters.temperature / 100); // Normalize -50..50 to -0.5..0.5
    gl.uniform1f(this.u_tint, filters.tint / 100); // Normalize -50..50 to -0.5..0.5
    gl.uniform1f(this.u_mirror, mirror ? 1.0 : 0.0);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  
  private createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
    const program = gl.createProgram();
    if (!program) return null;
    const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vs);
    const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fs);
    if (!vertexShader || !fragmentShader) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return shader;
  }
}