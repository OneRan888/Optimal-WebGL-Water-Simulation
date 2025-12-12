/*
 * WebGL Water
 * http://madebyevan.com/webgl-water/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 */


function _mergeUniforms(a, b) {
  var o = {};
  for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; }
  for (var k2 in b) { if (Object.prototype.hasOwnProperty.call(b, k2)) o[k2] = b[k2]; }
  return o;
}

var helperFunctions = `
  const float IOR_AIR = 1.0;
  const float IOR_WATER = 1.333;
  const vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);
  const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);
  const float poolHeight = 1.0;
  uniform vec3 light;
  uniform vec3 sphereCenter;
  uniform float sphereRadius;
  uniform sampler2D tiles;
  uniform sampler2D wallTiles;
  uniform sampler2D causticTex;
  uniform sampler2D water;

  vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {
    vec3 tMin = (cubeMin - origin) / ray;
    vec3 tMax = (cubeMax - origin) / ray;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {
    vec3 toSphere = origin - sphereCenter;
    float a = dot(ray, ray);
    float b = 2.0 * dot(toSphere, ray);
    float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;
    float discriminant = b * b - 4.0 * a * c;
    if (discriminant > 0.0) {
      float t = (-b - sqrt(discriminant)) / (2.0 * a);
      if (t > 0.0) return t;
    }
    return 1.0e6;
  }

  vec3 getSphereColor(vec3 point) {
    vec3 color = vec3(0.5);

    /* ambient occlusion with walls */
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.x)) / sphereRadius, 3.0);
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.z)) / sphereRadius, 3.0);
    color *= 1.0 - 0.9 / pow((point.y + 1.0 + sphereRadius) / sphereRadius, 3.0);

    /* caustics */
    vec3 sphereNormal = (point - sphereCenter) / sphereRadius;
    vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
    float diffuse = max(0.0, dot(-refractedLight, sphereNormal)) * 0.5;
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);
    if (point.y < info.r) {
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);
      diffuse *= caustic.r * 4.0;
    }
    color += diffuse;

    return color;
  }

  vec3 getWallColor(vec3 point) {
    float scale = 0.5;

    vec3 wallColor;
    vec3 normal;
    if (abs(point.x) > 0.999) {
      wallColor = texture2D(wallTiles, point.yz * 0.5 + vec2(1.0, 0.5)).rgb;
      normal = vec3(-point.x, 0.0, 0.0);
    } else if (abs(point.z) > 0.999) {
      wallColor = texture2D(wallTiles, point.yx * 0.5 + vec2(1.0, 0.5)).rgb;
      normal = vec3(0.0, 0.0, -point.z);
    } else {
      wallColor = texture2D(tiles, point.xz * 0.5 + 0.5).rgb;
      normal = vec3(0.0, 1.0, 0.0);
    }

    scale /= length(point); /* pool ambient occlusion */
    scale *= 1.0 - 0.9 / pow(length(point - sphereCenter) / sphereRadius, 4.0); /* sphere ambient occlusion */

    /* caustics */
    vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
    float diffuse = max(0.0, dot(refractedLight, normal));
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);
    if (point.y < info.r) {
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);
      scale += diffuse * caustic.r * 2.0 * caustic.g;
    } else {
      /* shadow for the rim of the pool */
      vec2 t = intersectCube(point, refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      diffuse *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (point.y + refractedLight.y * t.y - 2.0 / 12.0)));

      scale += diffuse * 0.5;
    }

    return wallColor * scale;
  }
`;


var helperFunctionsMulti = `
  const float IOR_AIR = 1.0;
  const float IOR_WATER = 1.333;
  const vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);
  const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);
  const float poolHeight = 1.0;
  uniform vec3 light;

  uniform vec3 sphereCenter0;
  uniform vec3 sphereCenter1;
  uniform vec3 sphereCenter2;
  uniform float sphereRadius0;
  uniform float sphereRadius1;
  uniform float sphereRadius2;

  uniform sampler2D tiles;
  uniform sampler2D wallTiles;
  uniform sampler2D causticTex;
  uniform sampler2D water;

  vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {
    vec3 tMin = (cubeMin - origin) / ray;
    vec3 tMax = (cubeMax - origin) / ray;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {
    vec3 toSphere = origin - sphereCenter;
    float a = dot(ray, ray);
    float b = 2.0 * dot(toSphere, ray);
    float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;
    float discriminant = b * b - 4.0 * a * c;
    if (discriminant > 0.0) {
      float t = (-b - sqrt(discriminant)) / (2.0 * a);
      if (t > 0.0) return t;
    }
    return 1.0e6;
  }

  float intersectSphereActive(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {
    if (sphereRadius <= 1.0e-6) return 1.0e6;
    return intersectSphere(origin, ray, sphereCenter, sphereRadius);
  }

  /* returns vec4(t, id, 0, 0), where id is 0/1/2, or -1 for none */
  vec4 intersectSpheres(vec3 origin, vec3 ray) {
    float t0 = intersectSphereActive(origin, ray, sphereCenter0, sphereRadius0);
    float t1 = intersectSphereActive(origin, ray, sphereCenter1, sphereRadius1);
    float t2 = intersectSphereActive(origin, ray, sphereCenter2, sphereRadius2);

    float t = t0;
    float id = 0.0;
    if (t1 < t) { t = t1; id = 1.0; }
    if (t2 < t) { t = t2; id = 2.0; }
    if (t >= 1.0e6) id = -1.0;
    return vec4(t, id, 0.0, 0.0);
  }

  vec3 getSphereColorAt(vec3 point, vec3 sphereCenter, float sphereRadius) {
    vec3 color = vec3(0.5);

    /* ambient occlusion with walls */
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.x)) / sphereRadius, 3.0);
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.z)) / sphereRadius, 3.0);
    color *= 1.0 - 0.9 / pow((point.y + 1.0 + sphereRadius) / sphereRadius, 3.0);

    /* caustics */
    vec3 sphereNormal = (point - sphereCenter) / sphereRadius;
    vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
    float diffuse = max(0.0, dot(-refractedLight, sphereNormal)) * 0.5;
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);
    if (point.y < info.r) {
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);
      diffuse *= caustic.r * 4.0;
    }
    color += diffuse;

    return color;
  }

  vec3 getWallColor(vec3 point) {
    float scale = 0.5;

    vec3 wallColor;
    vec3 normal;
    if (abs(point.x) > 0.999) {
      wallColor = texture2D(wallTiles, point.yz * 0.5 + vec2(1.0, 0.5)).rgb;
      normal = vec3(-point.x, 0.0, 0.0);
    } else if (abs(point.z) > 0.999) {
      wallColor = texture2D(wallTiles, point.yx * 0.5 + vec2(1.0, 0.5)).rgb;
      normal = vec3(0.0, 0.0, -point.z);
    } else {
      wallColor = texture2D(tiles, point.xz * 0.5 + 0.5).rgb;
      normal = vec3(0.0, 1.0, 0.0);
    }

    scale /= length(point); /* pool ambient occlusion */

    /* sphere ambient occlusion (support up to 3 spheres) */
    if (sphereRadius0 > 1.0e-6) scale *= 1.0 - 0.9 / pow(length(point - sphereCenter0) / sphereRadius0, 4.0);
    if (sphereRadius1 > 1.0e-6) scale *= 1.0 - 0.9 / pow(length(point - sphereCenter1) / sphereRadius1, 4.0);
    if (sphereRadius2 > 1.0e-6) scale *= 1.0 - 0.9 / pow(length(point - sphereCenter2) / sphereRadius2, 4.0);

    /* caustics */
    vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
    float diffuse = max(0.0, dot(refractedLight, normal));

    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);
    if (point.y < info.r) {
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);
      scale += diffuse * caustic.r * 2.0 * caustic.g;
    } else {
      /* shadow for the rim of the pool */
      vec2 t = intersectCube(point, refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      diffuse *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (point.y + refractedLight.y * t.y - 2.0 / 12.0)));

      scale += diffuse * 0.5;
    }

    return wallColor * scale;
  }
`;


var waterVertexSource = `
  uniform sampler2D water;
  varying vec3 position;
  void main() {
    vec4 info = texture2D(water, gl_Vertex.xy * 0.5 + 0.5);
    position = gl_Vertex.xzy;
    position.y += info.r;
    gl_Position = gl_ModelViewProjectionMatrix * vec4(position, 1.0);
  }
`;

var waterFragmentSourceAbove = helperFunctionsMulti + `
  uniform vec3 eye;
  varying vec3 position;
  uniform samplerCube sky;

  vec3 getSurfaceRayColor(vec3 origin, vec3 ray, vec3 waterColor) {
    vec3 color;
    vec4 hit = intersectSpheres(origin, ray);
    float q = hit.x;
    float sid = hit.y;
    if (q < 1.0e6) {
      vec3 p = origin + ray * q;
      if (sid < 0.5) {
        color = getSphereColorAt(p, sphereCenter0, sphereRadius0);
      } else if (sid < 1.5) {
        color = getSphereColorAt(p, sphereCenter1, sphereRadius1);
      } else {
        color = getSphereColorAt(p, sphereCenter2, sphereRadius2);
      }
    } else if (ray.y < 0.0) {
      vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      color = getWallColor(origin + ray * t.y);
    } else {
      vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      vec3 hit = origin + ray * t.y;
      if (hit.y < 2.0 / 12.0) {
        color = getWallColor(hit);
      } else {
        color = textureCube(sky, ray).rgb;
        color += vec3(pow(max(0.0, dot(light, ray)), 5000.0)) * vec3(10.0, 8.0, 6.0);
      }
    }
    if (ray.y < 0.0) color *= waterColor;
    return color;
  }

  void main() {
    vec2 coord = position.xz * 0.5 + 0.5;
    vec4 info = texture2D(water, coord);

    /* make water look more "peaked" */
    for (int i = 0; i < 5; i++) {
      coord += info.ba * 0.005;
      info = texture2D(water, coord);
    }

    vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);
    vec3 incomingRay = normalize(position - eye);

    vec3 reflectedRay = reflect(incomingRay, normal);
    vec3 refractedRay = refract(incomingRay, normal, IOR_AIR / IOR_WATER);
    float fresnel = mix(0.25, 1.0, pow(1.0 - dot(normal, -incomingRay), 3.0));

    vec3 reflectedColor = getSurfaceRayColor(position, reflectedRay, abovewaterColor);
    vec3 refractedColor = getSurfaceRayColor(position, refractedRay, abovewaterColor);

    gl_FragColor = vec4(mix(refractedColor, reflectedColor, fresnel), 1.0);
  }
`;

var waterFragmentSourceUnder = helperFunctionsMulti + `
  uniform vec3 eye;
  varying vec3 position;
  uniform samplerCube sky;

  vec3 getSurfaceRayColor(vec3 origin, vec3 ray, vec3 waterColor) {
    vec3 color;
    vec4 hit = intersectSpheres(origin, ray);
    float q = hit.x;
    float sid = hit.y;
    if (q < 1.0e6) {
      vec3 p = origin + ray * q;
      if (sid < 0.5) {
        color = getSphereColorAt(p, sphereCenter0, sphereRadius0);
      } else if (sid < 1.5) {
        color = getSphereColorAt(p, sphereCenter1, sphereRadius1);
      } else {
        color = getSphereColorAt(p, sphereCenter2, sphereRadius2);
      }
    } else if (ray.y < 0.0) {
      vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      color = getWallColor(origin + ray * t.y);
    } else {
      vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      vec3 hit = origin + ray * t.y;
      if (hit.y < 2.0 / 12.0) {
        color = getWallColor(hit);
      } else {
        color = textureCube(sky, ray).rgb;
        color += vec3(pow(max(0.0, dot(light, ray)), 5000.0)) * vec3(10.0, 8.0, 6.0);
      }
    }
    if (ray.y < 0.0) color *= waterColor;
    return color;
  }

  void main() {
    vec2 coord = position.xz * 0.5 + 0.5;
    vec4 info = texture2D(water, coord);

    /* make water look more "peaked" */
    for (int i = 0; i < 5; i++) {
      coord += info.ba * 0.005;
      info = texture2D(water, coord);
    }

    vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);
    vec3 incomingRay = normalize(position - eye);

    normal = -normal;
    vec3 reflectedRay = reflect(incomingRay, normal);
    vec3 refractedRay = refract(incomingRay, normal, IOR_WATER / IOR_AIR);
    float fresnel = mix(0.5, 1.0, pow(1.0 - dot(normal, -incomingRay), 3.0));

    vec3 reflectedColor = getSurfaceRayColor(position, reflectedRay, underwaterColor);
    vec3 refractedColor = getSurfaceRayColor(position, refractedRay, vec3(1.0)) * vec3(0.8, 1.0, 1.1);

    gl_FragColor = vec4(mix(reflectedColor, refractedColor, (1.0 - fresnel) * length(refractedRay)), 1.0);
  }
`;

var sphereVertexSource = helperFunctions + `
  varying vec3 position;
  void main() {
    position = sphereCenter + gl_Vertex.xyz * sphereRadius;
    gl_Position = gl_ModelViewProjectionMatrix * vec4(position, 1.0);
  }
`;

var sphereFragmentSource = helperFunctions + `
  varying vec3 position;
  void main() {
    gl_FragColor = vec4(getSphereColor(position), 1.0);
    vec4 info = texture2D(water, position.xz * 0.5 + 0.5);
    if (position.y < info.r) {
      gl_FragColor.rgb *= underwaterColor * 1.2;
    }
  }
`;

var bunnyVertexSource = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(gl_NormalMatrix * gl_Normal);
    gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
  }
`;

var bunnyFragmentSource = `
  uniform vec3 light;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 L = normalize(light);
    float diff = max(0.0, dot(-L, n));
    vec3 base = vec3(0.8, 0.8, 0.7);
    vec3 color = base * (0.3 + 0.7 * diff);
    gl_FragColor = vec4(color, 1.0);
  }
`;

var cubeVertexSource = helperFunctionsMulti + `
  varying vec3 position;
  void main() {
    position = gl_Vertex.xyz;
    position.y = ((1.0 - position.y) * (7.0 / 12.0) - 1.0) * poolHeight;
    gl_Position = gl_ModelViewProjectionMatrix * vec4(position, 1.0);
  }
`;

var cubeFragmentSource = helperFunctionsMulti + `
  varying vec3 position;
  void main() {
    gl_FragColor = vec4(getWallColor(position), 1.0);
    vec4 info = texture2D(water, position.xz * 0.5 + 0.5);
    if (position.y < info.r) {
      gl_FragColor.rgb *= underwaterColor * 1.2;
    }
  }
`;

function Renderer() {
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    wrap: gl.REPEAT,
    format: gl.RGB
  });

  var _wallImg = document.getElementById('wallTiles') || document.getElementById('tiles');
  this.wallTexture = GL.Texture.fromImage(_wallImg, {
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    wrap: gl.REPEAT,
    format: gl.RGB
  });
this.lightDir = new GL.Vector(2.0, 2.0, -1.0).unit();
  this.causticTex = new GL.Texture(1024, 1024);

  // 当前物体形状：'sphere' 或 'bunny'（main.js 会改这个值）
  this.shapeMode = 'sphere';

  this.waterMesh = GL.Mesh.plane({ detail: 200 });
  this.waterShaders = [
    new GL.Shader(waterVertexSource, waterFragmentSourceAbove),
    new GL.Shader(waterVertexSource, waterFragmentSourceUnder)
  ];

  // 原来的球 mesh + shader
  this.sphereMesh = GL.Mesh.sphere({ detail: 10 });
  this.sphereShader = new GL.Shader(sphereVertexSource, sphereFragmentSource);

  // ====== 斯坦福兔子 mesh + shader ======
  // bunnyMeshData 来自 stanford-bunny.js，形如：
  // var bunnyMeshData = { vertices: [ [x,y,z], [x,y,z], ... ], triangles: [...] };
  this.bunnyMesh = GL.Mesh.load(bunnyMeshData);
  if (!this.bunnyMesh.normals) {
    this.bunnyMesh.computeNormals();   // 用 LightGL 自己算法线
  }
  this.bunnyShader = new GL.Shader(bunnyVertexSource, bunnyFragmentSource);
  // ====== 兔子部分结束 ======

  this.cubeMesh = GL.Mesh.cube();
  this.cubeMesh.triangles.splice(4, 2);
  this.cubeMesh.compile();
  this.cubeShader = new GL.Shader(cubeVertexSource, cubeFragmentSource);

  this.sphereCenter = new GL.Vector();
  this.sphereRadius = 0;

  var hasDerivatives = !!gl.getExtension('OES_standard_derivatives');
  var causticsVertexSource = helperFunctionsMulti + `    varying vec3 oldPos;
    varying vec3 newPos;
    varying vec3 ray;

    // Bunny shadow proxy spheres (used only in bunny mode)
    uniform float bunnyMode; // 1.0 when bunny mode, 0.0 otherwise
    uniform vec3 bunnyOffset0;
    uniform vec3 bunnyOffset1;
    uniform vec3 bunnyOffset2;
    uniform vec3 bunnyOffset3;
    uniform vec3 bunnyOffset4;
    uniform float bunnySubRadiusFactor; // sub-sphere radius = sphereRadius0 * bunnySubRadiusFactor

    /* project the ray onto the plane */
    vec3 project(vec3 origin, vec3 ray, vec3 refractedLight) {
      vec2 tcube = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      origin += ray * tcube.y;
      float tplane = (-origin.y - 1.0) / refractedLight.y;
      return origin + refractedLight * tplane;
    }

    void main() {
      vec4 info = texture2D(water, gl_Vertex.xy * 0.5 + 0.5);
      info.ba *= 0.5;
      vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);

      /* project the vertices along the refracted vertex ray */
      vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
      ray = refract(-light, normal, IOR_AIR / IOR_WATER);
      oldPos = project(gl_Vertex.xzy, refractedLight, refractedLight);
      newPos = project(gl_Vertex.xzy + vec3(0.0, info.r, 0.0), ray, refractedLight);

      gl_Position = vec4(0.75 * (newPos.xz + refractedLight.xz / refractedLight.y), 0.0, 1.0);
    }
  `;

  var causticsFragmentSource =
    (hasDerivatives ? '#extension GL_OES_standard_derivatives : enable\n' : '') +
    helperFunctionsMulti + `
    varying vec3 oldPos;
    varying vec3 newPos;
    varying vec3 ray;

    // Bunny shadow proxy spheres (used only in bunny mode)
    uniform float bunnyMode; // 1.0 when bunny mode, 0.0 otherwise
    uniform vec3 bunnyOffset0;
    uniform vec3 bunnyOffset1;
    uniform vec3 bunnyOffset2;
    uniform vec3 bunnyOffset3;
    uniform vec3 bunnyOffset4;
    uniform float bunnySubRadiusFactor; // sub-sphere radius = sphereRadius0 * bunnySubRadiusFactor

    void main() {
  ` +
    (hasDerivatives
      ? `
      /* if the triangle gets smaller, it gets brighter, and vice versa */
      float oldArea = length(dFdx(oldPos)) * length(dFdy(oldPos));
      float newArea = length(dFdx(newPos)) * length(dFdy(newPos));
      gl_FragColor = vec4(oldArea / newArea * 0.2, 1.0, 0.0, 0.0);
    `
      : `
      gl_FragColor = vec4(0.2, 0.2, 0.0, 0.0);
    `) +
    `
      vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);

            /* compute blob shadows (up to 3 spheres) and only draw if blocking the light */
      float shadow = 1.0;

      // Sphere #0: in bunny mode, approximate bunny bottom shadow using multiple sub-spheres.
      if (sphereRadius0 > 1.0e-6) {
        if (bunnyMode > 0.5) {
          float subR = sphereRadius0 * bunnySubRadiusFactor;

          // If factor is invalid, fall back to single-sphere behavior
          if (subR > 1.0e-6) {
            vec3 c;
            vec3 dir;
            vec3 area;
            float sh;
            float dist;

            c = sphereCenter0 + bunnyOffset0 * sphereRadius0;
            dir = (c - newPos) / subR;
            area = cross(dir, refractedLight);
            sh = dot(area, area);
            dist = dot(dir, -refractedLight);
            sh = 1.0 + (sh - 1.0) / (0.05 + dist * 0.025);
            sh = clamp(1.0 / (1.0 + exp(-sh)), 0.0, 1.0);
            sh = mix(1.0, sh, clamp(dist * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh);

            c = sphereCenter0 + bunnyOffset1 * sphereRadius0;
            dir = (c - newPos) / subR;
            area = cross(dir, refractedLight);
            sh = dot(area, area);
            dist = dot(dir, -refractedLight);
            sh = 1.0 + (sh - 1.0) / (0.05 + dist * 0.025);
            sh = clamp(1.0 / (1.0 + exp(-sh)), 0.0, 1.0);
            sh = mix(1.0, sh, clamp(dist * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh);

            c = sphereCenter0 + bunnyOffset2 * sphereRadius0;
            dir = (c - newPos) / subR;
            area = cross(dir, refractedLight);
            sh = dot(area, area);
            dist = dot(dir, -refractedLight);
            sh = 1.0 + (sh - 1.0) / (0.05 + dist * 0.025);
            sh = clamp(1.0 / (1.0 + exp(-sh)), 0.0, 1.0);
            sh = mix(1.0, sh, clamp(dist * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh);

            c = sphereCenter0 + bunnyOffset3 * sphereRadius0;
            dir = (c - newPos) / subR;
            area = cross(dir, refractedLight);
            sh = dot(area, area);
            dist = dot(dir, -refractedLight);
            sh = 1.0 + (sh - 1.0) / (0.05 + dist * 0.025);
            sh = clamp(1.0 / (1.0 + exp(-sh)), 0.0, 1.0);
            sh = mix(1.0, sh, clamp(dist * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh);

            c = sphereCenter0 + bunnyOffset4 * sphereRadius0;
            dir = (c - newPos) / subR;
            area = cross(dir, refractedLight);
            sh = dot(area, area);
            dist = dot(dir, -refractedLight);
            sh = 1.0 + (sh - 1.0) / (0.05 + dist * 0.025);
            sh = clamp(1.0 / (1.0 + exp(-sh)), 0.0, 1.0);
            sh = mix(1.0, sh, clamp(dist * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh);
          } else {
            vec3 dir0 = (sphereCenter0 - newPos) / sphereRadius0;
            vec3 area0 = cross(dir0, refractedLight);
            float sh0 = dot(area0, area0);
            float dist0 = dot(dir0, -refractedLight);
            sh0 = 1.0 + (sh0 - 1.0) / (0.05 + dist0 * 0.025);
            sh0 = clamp(1.0 / (1.0 + exp(-sh0)), 0.0, 1.0);
            sh0 = mix(1.0, sh0, clamp(dist0 * 2.0, 0.0, 1.0));
            shadow = min(shadow, sh0);
          }
        } else {
          vec3 dir0 = (sphereCenter0 - newPos) / sphereRadius0;
          vec3 area0 = cross(dir0, refractedLight);
          float sh0 = dot(area0, area0);
          float dist0 = dot(dir0, -refractedLight);
          sh0 = 1.0 + (sh0 - 1.0) / (0.05 + dist0 * 0.025);
          sh0 = clamp(1.0 / (1.0 + exp(-sh0)), 0.0, 1.0);
          sh0 = mix(1.0, sh0, clamp(dist0 * 2.0, 0.0, 1.0));
          shadow = min(shadow, sh0);
        }
      }

      if (sphereRadius1 > 1.0e-6) {
        vec3 dir1 = (sphereCenter1 - newPos) / sphereRadius1;
        vec3 area1 = cross(dir1, refractedLight);
        float sh1 = dot(area1, area1);
        float dist1 = dot(dir1, -refractedLight);
        sh1 = 1.0 + (sh1 - 1.0) / (0.05 + dist1 * 0.025);
        sh1 = clamp(1.0 / (1.0 + exp(-sh1)), 0.0, 1.0);
        sh1 = mix(1.0, sh1, clamp(dist1 * 2.0, 0.0, 1.0));
        shadow = min(shadow, sh1);
      }

      if (sphereRadius2 > 1.0e-6) {
        vec3 dir2 = (sphereCenter2 - newPos) / sphereRadius2;
        vec3 area2 = cross(dir2, refractedLight);
        float sh2 = dot(area2, area2);
        float dist2 = dot(dir2, -refractedLight);
        sh2 = 1.0 + (sh2 - 1.0) / (0.05 + dist2 * 0.025);
        sh2 = clamp(1.0 / (1.0 + exp(-sh2)), 0.0, 1.0);
        sh2 = mix(1.0, sh2, clamp(dist2 * 2.0, 0.0, 1.0));
        shadow = min(shadow, sh2);
      }

      gl_FragColor.g = shadow;

      /* shadow for the rim of the pool */
      vec2 t = intersectCube(newPos, -refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
      gl_FragColor.r *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (newPos.y - refractedLight.y * t.y - 2.0 / 12.0)));
    }
  `;

  this.causticsShader = new GL.Shader(causticsVertexSource, causticsFragmentSource);
}


Renderer.prototype._getOpticsSphereUniforms = function () {
  // 用于水面反射/折射、墙面 AO 等“光学求交”的球集合
  // - sphere 模式：使用 spheres[0..2]
  // - bunny 模式：排除 0 号（兔子的包围球不参与水面映射），只使用 spheres[1..2]
  var c0 = new GL.Vector(0, 0, 0), c1 = new GL.Vector(0, 0, 0), c2 = new GL.Vector(0, 0, 0);
  var r0 = 0, r1 = 0, r2 = 0;

  try {
    if (typeof spheres !== 'undefined' && spheres && spheres.length) {
      if (this.shapeMode === 'bunny') {
        // optics: use spheres[1], spheres[2]
        if (spheres[1]) { c0 = spheres[1].center; r0 = spheres[1].radius; }
        if (spheres[2]) { c1 = spheres[2].center; r1 = spheres[2].radius; }
      } else {
        // sphere mode: use spheres[0], [1], [2]
        if (spheres[0]) { c0 = spheres[0].center; r0 = spheres[0].radius; }
        if (spheres[1]) { c1 = spheres[1].center; r1 = spheres[1].radius; }
        if (spheres[2]) { c2 = spheres[2].center; r2 = spheres[2].radius; }
      }
    }
  } catch (e) {}

  return {
    sphereCenter0: c0,
    sphereCenter1: c1,
    sphereCenter2: c2,
    sphereRadius0: r0,
    sphereRadius1: r1,
    sphereRadius2: r2
  };
};

Renderer.prototype._getCausticsSphereUniforms = function () {
  // 用于池底焦散/阴影的球集合
  // - sphere 模式：spheres[0..2]
  // - bunny 模式：包含 0 号（兔子包围球投影到池底）+ spheres[1..2]
  var c0 = new GL.Vector(0, 0, 0), c1 = new GL.Vector(0, 0, 0), c2 = new GL.Vector(0, 0, 0);
  var r0 = 0, r1 = 0, r2 = 0;

  try {
    if (typeof spheres !== 'undefined' && spheres && spheres.length) {
      if (spheres[0]) { c0 = spheres[0].center; r0 = spheres[0].radius; }
      if (spheres[1]) { c1 = spheres[1].center; r1 = spheres[1].radius; }
      if (spheres[2]) { c2 = spheres[2].center; r2 = spheres[2].radius; }
    } else {
      // fallback：至少别让 shader 里出现 NaN
      if (this.sphereCenter) c0 = this.sphereCenter;
      if (this.sphereRadius) r0 = this.sphereRadius;
    }
  } catch (e) {}

  return {
    sphereCenter0: c0,
    sphereCenter1: c1,
    sphereCenter2: c2,
    sphereRadius0: r0,
    sphereRadius1: r1,
    sphereRadius2: r2
  };
};



Renderer.prototype._getBunnyShadowUniforms = function () {
  // Bunny shadow proxy spheres for caustics: centers are computed in shader as:
  // sphereCenter0 + bunnyOffset[i] * sphereRadius0
  // and radius = sphereRadius0 * bunnySubRadiusFactor
  var bunnyMode = (this.shapeMode === 'bunny') ? 1.0 : 0.0;

  // Defaults match main.js (bunnyLocalOffsets + bunnySubRadiusFactor)
  var offsets = [
    [0.0, 0.0, 0.0],
    [0.0, 0.5, 0.0],
    [-0.3, 0.2, 0.15],
    [0.3, 0.2, 0.15],
    [0.0, -0.3, 0.0]
  ];
  var factor = 0.45;

  try {
    if (typeof bunnySubRadiusFactor !== 'undefined' && isFinite(bunnySubRadiusFactor)) {
      factor = bunnySubRadiusFactor;
    }
    if (typeof bunnyLocalOffsets !== 'undefined' && bunnyLocalOffsets && bunnyLocalOffsets.length >= 5) {
      offsets = [];
      for (var i = 0; i < 5; i++) {
        var v = bunnyLocalOffsets[i];
        offsets.push([v.x, v.y, v.z]);
      }
    }
  } catch (e) {}

  return {
    bunnyMode: bunnyMode,
    bunnyOffset0: offsets[0],
    bunnyOffset1: offsets[1],
    bunnyOffset2: offsets[2],
    bunnyOffset3: offsets[3],
    bunnyOffset4: offsets[4],
    bunnySubRadiusFactor: factor
  };
};

Renderer.prototype.updateCaustics = function (water) {
  if (!this.causticsShader) return;
  var this_ = this;
  this.causticTex.drawTo(function () {
    gl.clear(gl.COLOR_BUFFER_BIT);
    water.textureA.bind(0);
    this_.causticsShader
      .uniforms(_mergeUniforms(_mergeUniforms({
      light: this_.lightDir,
      water: 0
    }, this_._getCausticsSphereUniforms()), this_._getBunnyShadowUniforms()))
    .draw(this_.waterMesh);
  });
};

Renderer.prototype.renderWater = function (water, sky) {
  var tracer = new GL.Raytracer();
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  this.wallTexture.bind(2);
  sky.bind(3);
  this.causticTex.bind(4);
  gl.enable(gl.CULL_FACE);
  for (var i = 0; i < 2; i++) {
    gl.cullFace(i ? gl.BACK : gl.FRONT);
    this.waterShaders[i]
      .uniforms(_mergeUniforms({
        light: this.lightDir,
        water: 0,
        tiles: 1,
        wallTiles: 2,
        sky: 3,
        causticTex: 4,
        eye: tracer.eye
      }, this._getOpticsSphereUniforms()))
      .draw(this.waterMesh);
  }
  gl.disable(gl.CULL_FACE);
};

Renderer.prototype.renderSphere = function () {
  // 这里的 water 是全局的模拟对象，与原项目一致
  water.textureA.bind(0);
  this.causticTex.bind(1);
  this.sphereShader
    .uniforms({
      light: this.lightDir,
      water: 0,
      causticTex: 1,
      sphereCenter: this.sphereCenter,
      sphereRadius: this.sphereRadius
    })
    .draw(this.sphereMesh);
};

// 渲染斯坦福兔子（用球心 / 半径作为整体位移和缩放）
Renderer.prototype.renderBunny = function () {
  var c = this.sphereCenter || new GL.Vector(0, 0, 0);
  var r = this.sphereRadius || 0.25;

  gl.pushMatrix();
  gl.translate(c.x, c.y, c.z);
  gl.scale(r, r, r);

  this.bunnyShader
    .uniforms({
      light: this.lightDir
    })
    .draw(this.bunnyMesh);

  gl.popMatrix();
};

Renderer.prototype.renderCube = function () {
  gl.enable(gl.CULL_FACE);
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  this.wallTexture.bind(2);
  this.causticTex.bind(3);
  this.cubeShader
    .uniforms(_mergeUniforms({
      light: this.lightDir,
      water: 0,
      tiles: 1,
      wallTiles: 2,
      causticTex: 3
    }, this._getOpticsSphereUniforms()))
    .draw(this.cubeMesh);
  gl.disable(gl.CULL_FACE);
};