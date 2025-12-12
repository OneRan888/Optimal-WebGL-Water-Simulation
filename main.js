function text2html(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '<br>');
}

function handleError(text) {
  var html = text2html(text);
  if (html == 'WebGL not supported') {
    html = 'Your browser does not support WebGL.<br>Please see<a href="http://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">Getting a WebGL Implementation</a>.';
  }
  var loading = document.getElementById('loading');
  loading.innerHTML = html;
  loading.style.zIndex = 1;
}

window.onerror = handleError;

var gl = GL.create();
var water;
var cubemap;
var renderer;
var angleX = -25;
var angleY = -200.5;
var spheres = [];
var useSpherePhysics = false;
var gravity;
var paused = false;
var sphereDensity = 1.0;
var activeSphereIndex = -1;
var MASS_SCALE = 40.0;
var MAX_SPEED  = 6.0;
var MAX_IMPULSE = 1.5;
var ENTRY_SPEED_MIN = 0.005;
var EXIT_SPEED_MIN  = 0.005;

// 当前物体形状：'sphere' 或 'bunny'
var shapeMode = 'sphere';

// 兔子的局部小球，用来近似体积扰动水面（在归一化 bunny 坐标系下）
var bunnyLocalOffsets = [
  new GL.Vector(0.0, 0.0, 0.0),   // 身体中心
  new GL.Vector(0.0, 0.5, 0.0),   // 上半身 / 头
  new GL.Vector(-0.3, 0.2, 0.15), // 左
  new GL.Vector(0.3, 0.2, 0.15),  // 右
  new GL.Vector(0.0, -0.3, 0.0)   // 底部
];

// bunny 子球半径占包围球半径的比例
var bunnySubRadiusFactor = 0.45;

window.onload = function() {
  var ratio = window.devicePixelRatio || 1;
  var help = document.getElementById('help');

  function onresize() {
    var width = innerWidth - help.clientWidth - 20;
    var height = innerHeight;
    gl.canvas.width = width * ratio;
    gl.canvas.height = height * ratio;
    gl.canvas.style.width = width + 'px';
    gl.canvas.style.height = height + 'px';
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.matrixMode(gl.PROJECTION);
    gl.loadIdentity();
    gl.perspective(45, gl.canvas.width / gl.canvas.height, 0.01, 100);
    gl.matrixMode(gl.MODELVIEW);
    draw();
  }

  document.body.appendChild(gl.canvas);
  gl.clearColor(0, 0, 0, 1);

  water = new Water();
  renderer = new Renderer();
  cubemap = new Cubemap({
    xneg: document.getElementById('xneg'),
    xpos: document.getElementById('xpos'),
    yneg: document.getElementById('ypos'),
    ypos: document.getElementById('ypos'),
    zneg: document.getElementById('zneg'),
    zpos: document.getElementById('zpos')
  });

  var fluiditySlider = document.getElementById('fluidity-slider');
  var fluidityValue = document.getElementById('fluidity-value');
  if (fluiditySlider) {
    var initialFluidity = parseFloat(fluiditySlider.value);
    if (isNaN(initialFluidity)) {
      initialFluidity = 1.0;
    }
    if (typeof water.setFluidity === 'function') {
      water.setFluidity(initialFluidity);
    }
    if (fluidityValue) {
      fluidityValue.textContent = initialFluidity.toFixed(2);
    }

    fluiditySlider.addEventListener('input', function(e) {
      var value = parseFloat(e.target.value);
      if (isNaN(value)) return;
      if (typeof water.setFluidity === 'function') {
        water.setFluidity(value);
      }
      if (fluidityValue) {
        fluidityValue.textContent = value.toFixed(2);
      }
    });
  }

  var densitySlider = document.getElementById('sphere-density-slider');
  var densityValue = document.getElementById('sphere-density-value');
  if (densitySlider) {
    var initialDensity = parseFloat(densitySlider.value);
    if (isNaN(initialDensity)) {
      initialDensity = 1.0;
    }
    sphereDensity = initialDensity;
    if (densityValue) {
      densityValue.textContent = initialDensity.toFixed(2);
    }

    densitySlider.addEventListener('input', function(e) {
      var value = parseFloat(e.target.value);
      if (isNaN(value)) return;
      sphereDensity = value;
      if (densityValue) {
        densityValue.textContent = value.toFixed(2);
      }
      for (var i = 0; i < spheres.length; i++) {
        var s = spheres[i];
        if (!s) continue;
        s.density = sphereDensity;
      }
    });
  }

  var calmButton = document.getElementById('calm-button');
  if (calmButton) {
    calmButton.addEventListener('click', function() {
      if (typeof water.calm === 'function') {
        water.calm();
        water.updateNormals();
        if (spheres.length > 0 && spheres[0]) {
          renderer.sphereCenter = spheres[0].center;
          renderer.sphereRadius = spheres[0].radius;
        }
        renderer.updateCaustics(water);
        draw();
      }
    });
  }

  var addBallButton = document.getElementById('add-ball-button');
  if (addBallButton) {
    addBallButton.addEventListener('click', function() {
      if (spheres.length >= 3) {
        return;
      }
      var idx = spheres.length;
      var x = -0.4 + idx * 0.4;
      var center = new GL.Vector(x, -0.75, 0.2);
      addSphere(center, 0.25, sphereDensity);
    });
  }

  var removeBallButton = document.getElementById('remove-ball-button');
  if (removeBallButton) {
    removeBallButton.addEventListener('click', function() {
      if (spheres.length <= 1) return;
      spheres.pop();
      activeSphereIndex = -1;
      mode = -1;
    });
  }

  // 形状切换按钮
  var shapeSphereButton = document.getElementById('shape-sphere-button');
  var shapeBunnyButton  = document.getElementById('shape-bunny-button');

  function switchToSphere() {
    shapeMode = 'sphere';
    renderer.shapeMode = 'sphere';
    // 多球模式，保持现有 spheres 不动
  }

  function switchToBunny() {
    shapeMode = 'bunny';
    renderer.shapeMode = 'bunny';

    // 确保至少有一个“逻辑球”作为兔子的包围球
    if (spheres.length === 0) {
      addSphere(new GL.Vector(-0.4, -0.75, 0.2), 0.25, sphereDensity);
    }
  }

  if (shapeSphereButton) {
    shapeSphereButton.addEventListener('click', function() {
      switchToSphere();
    });
  }

  if (shapeBunnyButton) {
    shapeBunnyButton.addEventListener('click', function() {
      switchToBunny();
    });
  }

  if (!water.textureA.canDrawTo() || !water.textureB.canDrawTo()) {
    throw new Error('Rendering to floating-point textures is required but not supported');
  }

  gravity = new GL.Vector(0, -4, 0);

  function addSphere(center, radius, density) {
    if (shapeMode === 'sphere' && spheres.length >= 3) return null;
    var s = {
      center: center,
      oldCenter: center,
      velocity: new GL.Vector(),
      radius: radius,
      density: (typeof density === 'number') ? density : sphereDensity
    };
    spheres.push(s);
    return s;
  }

  addSphere(new GL.Vector(-0.4, -0.75, 0.2), 0.25, sphereDensity);

  for (var i = 0; i < 20; i++) {
    water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (i & 1) ? 0.01 : -0.01);
  }

  document.getElementById('loading').innerHTML = '';
  onresize();

  var requestAnimationFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    function(callback) { setTimeout(callback, 0); };

  var prevTime = new Date().getTime();
  function animate() {
    var nextTime = new Date().getTime();
    if (!paused) {
      update((nextTime - prevTime) / 1000);
      draw();
    }
    prevTime = nextTime;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.onresize = onresize;

  var prevHit;
  var planeNormal;
  var mode = -1;
  var MODE_ADD_DROPS = 0;
  var MODE_MOVE_SPHERE = 1;
  var MODE_ORBIT_CAMERA = 2;

  var oldX, oldY;

  function startDrag(x, y) {
    oldX = x;
    oldY = y;
    var tracer = new GL.Raytracer();
    var ray = tracer.getRayForPixel(x * ratio, y * ratio);
    var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));

    var closest = null;
    var closestIndex = -1;
    for (var i = 0; i < spheres.length; i++) {
      var s = spheres[i];
      if (!s) continue;
      var hitTest = GL.Raytracer.hitTestSphere(tracer.eye, ray, s.center, s.radius);
      if (hitTest) {
        if (!closest || hitTest.t < closest.t) {
          closest = hitTest;
          closestIndex = i;
        }
      }
    }

    if (closest) {
      mode = MODE_MOVE_SPHERE;
      activeSphereIndex = closestIndex;
      prevHit = closest.hit;
      planeNormal = tracer.getRayForPixel(gl.canvas.width / 2, gl.canvas.height / 2).negative();
    } else if (Math.abs(pointOnPlane.x) < 1 && Math.abs(pointOnPlane.z) < 1) {
      mode = MODE_ADD_DROPS;
      duringDrag(x, y);
    } else {
      mode = MODE_ORBIT_CAMERA;
    }
  }

  function duringDrag(x, y) {
    switch (mode) {
      case MODE_ADD_DROPS: {
        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
        water.addDrop(pointOnPlane.x, pointOnPlane.z, 0.03, 0.01);
        if (paused) {
          water.updateNormals();
          if (spheres.length > 0 && spheres[0]) {
            renderer.sphereCenter = spheres[0].center;
            renderer.sphereRadius = spheres[0].radius;
          }
          renderer.updateCaustics(water);
        }
        break;
      }
      case MODE_MOVE_SPHERE: {
        if (activeSphereIndex < 0 || activeSphereIndex >= spheres.length) break;
        var s = spheres[activeSphereIndex];
        if (!s) break;

        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var t = -planeNormal.dot(tracer.eye.subtract(prevHit)) / planeNormal.dot(ray);
        var nextHit = tracer.eye.add(ray.multiply(t));

        s.center = s.center.add(nextHit.subtract(prevHit));
        s.center.x = Math.max(s.radius - 1, Math.min(1 - s.radius, s.center.x));
        s.center.y = Math.max(s.radius - 1, Math.min(10, s.center.y));
        s.center.z = Math.max(s.radius - 1, Math.min(1 - s.radius, s.center.z));
        prevHit = nextHit;

        if (paused) {
          if (spheres.length > 0 && spheres[0]) {
            renderer.sphereCenter = spheres[0].center;
            renderer.sphereRadius = spheres[0].radius;
          }
          renderer.updateCaustics(water);
        }
        break;
      }
      case MODE_ORBIT_CAMERA: {
        angleY -= x - oldX;
        angleX -= y - oldY;
        angleX = Math.max(-89.999, Math.min(89.999, angleX));
        break;
      }
    }
    oldX = x;
    oldY = y;
    if (paused) draw();
  }

  function stopDrag() {
    mode = -1;
    activeSphereIndex = -1;
  }

  function isHelpElement(element) {
    return element === help || element.parentNode && isHelpElement(element.parentNode);
  }

  document.onmousedown = function(e) {
    if (!isHelpElement(e.target)) {
      e.preventDefault();
      startDrag(e.pageX, e.pageY);
    }
  };

  document.onmousemove = function(e) {
    duringDrag(e.pageX, e.pageY);
  };

  document.onmouseup = function() {
    stopDrag();
  };

  document.ontouchstart = function(e) {
    if (e.touches.length === 1 && !isHelpElement(e.target)) {
      e.preventDefault();
      startDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchmove = function(e) {
    if (e.touches.length === 1) {
      duringDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchend = function(e) {
    if (e.touches.length == 0) {
      stopDrag();
    }
  };

  document.onkeydown = function(e) {
    if (e.which == ' '.charCodeAt(0)) {
      paused = !paused;
    } else if (e.which == 'G'.charCodeAt(0)) {
      useSpherePhysics = !useSpherePhysics;
    } else if (e.which == 'L'.charCodeAt(0) && paused) {
      draw();
    }
  };

  var frame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sphereMass(s) {
    if (!s) return 1.0;
    var sd = (typeof s.density === 'number') ? s.density : sphereDensity;
    sd = clamp(sd, 0.2, 5.0);
    var r3 = s.radius * s.radius * s.radius;
    var baseMass = r3 * sd;
    return baseMass * MASS_SCALE;
  }

  function submergedVolumeRatio(y, R) {
    var PI = Math.PI;
    var V_total = 4.0 / 3.0 * PI * R * R * R;

    if (y >= R) {
      return 0.0;
    }
    if (y <= -R) {
      return 1.0;
    }

    if (y >= 0) {
      var h = R - y;
      var V_cap = PI * h * h * (R - h / 3.0);
      return V_cap / V_total;
    } else {
      var h_above = R + y;
      var V_cap_above = PI * h_above * h_above * (R - h_above / 3.0);
      return (V_total - V_cap_above) / V_total;
    }
  }

  function applySplashImpulse(sourceIndex, impactSpeed, type) {
    var src = spheres[sourceIndex];
    if (!src) return;

    var fluidity = (typeof water.fluidity === 'number') ? water.fluidity : 1.0;
    fluidity = clamp(fluidity, 0.0, 1.0);

    if (fluidity <= 0.01) return;

    impactSpeed = Math.min(Math.max(impactSpeed, 0.0), 6.0);

    var baseStrength = (type === 'entry') ? 0.3 : 0.15;

    var speedBias = 0.1;
    var splashFactor = fluidity * fluidity * fluidity;
    var splashStrength = baseStrength * (impactSpeed + speedBias) * splashFactor;

    var splashRadius = 0.6 + 0.8 * fluidity;

    var sx = src.center.x;
    var sz = src.center.z;

    for (var j = 0; j < spheres.length; j++) {
      if (j === sourceIndex) continue;
      var o = spheres[j];
      if (!o) continue;

      if (o.center.y < -1.0 || o.center.y > 0.8) continue;

      var dx = o.center.x - sx;
      var dz = o.center.z - sz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1e-4 || dist > splashRadius) continue;

      var falloff = 1.0 - dist / splashRadius;
      var impulseMag = splashStrength * falloff;

      var nx = dx / dist;
      var nz = dz / dist;

      var mass = sphereMass(o);
      if (mass <= 0.0) mass = 1.0;

      var dv = impulseMag / mass;
      o.velocity.x += nx * dv;
      o.velocity.z += nz * dv;
    }
  }

  // 兔子模式下：用多个局部小球去扰动水面
  function applyBunnyWaterInteraction(baseSphere) {
    if (!baseSphere) return;

    var oldCenter = baseSphere.oldCenter;
    var center    = baseSphere.center;
    var R         = baseSphere.radius;

    for (var i = 0; i < bunnyLocalOffsets.length; i++) {
      var local = bunnyLocalOffsets[i];
      var offset = local.multiply(R);

      var oldPos = oldCenter.add(offset);
      var newPos = center.add(offset);
      var subR   = R * bunnySubRadiusFactor;

      water.moveSphere(oldPos, newPos, subR);
    }
  }

  function update(seconds) {
    if (seconds <= 0) return;
    if (seconds > 1) return;
    frame += seconds * 2;

    if (useSpherePhysics) {
      var gVal = -gravity.y;

      for (var i = 0; i < spheres.length; i++) {
        var s = spheres[i];
        if (!s) continue;

        var prevCenter = s.oldCenter;

        if (mode == MODE_MOVE_SPHERE && i === activeSphereIndex) {
          s.velocity = new GL.Vector();
        } else {
          var fluidity = (typeof water.fluidity === 'number') ? water.fluidity : 1.0;
          fluidity = clamp(fluidity, 0.0, 1.0);
          var viscosity = 1.0 - fluidity;

          var sd = (typeof s.density === 'number') ? s.density : sphereDensity;
          sd = clamp(sd, 0.2, 5.0);

          var R = s.radius;
          var f = submergedVolumeRatio(s.center.y, R);

          var buoyAccelY = gVal * (f / sd - 1.0);
          var acc = new GL.Vector(0, buoyAccelY, 0);

          if (f > 0.0) {
            var speed = s.velocity.length();
            if (speed > 1e-4) {
              var dragCoeff = (0.5 + 3.0 * viscosity) * f;
              var dragMag = dragCoeff * speed / sd;
              var drag = s.velocity.unit().multiply(-dragMag);
              acc = acc.add(drag);
            }
          }

          s.velocity = s.velocity.add(acc.multiply(seconds));
          s.center = s.center.add(s.velocity.multiply(seconds));

          var minY = s.radius - 1.0;
          if (s.center.y < minY) {
            s.center.y = minY;

            var baseRestitution = 0.55 * (1.0 - 0.75 * (1.0 - fluidity));
            if (baseRestitution < 0.0) baseRestitution = 0.0;

            var restitution = baseRestitution * 0.6;
            if (restitution < 0.0) restitution = 0.0;

            s.velocity.y = Math.abs(s.velocity.y) * restitution;
          }

          s.center.x = Math.max(s.radius - 1, Math.min(1 - s.radius, s.center.x));
          s.center.z = Math.max(s.radius - 1, Math.min(1 - s.radius, s.center.z));
        }

        var prevY = prevCenter.y;
        var newY = s.center.y;
        var effectiveVy = (newY - prevY) / seconds;

        if (prevY > 0 && newY <= 0 && effectiveVy < -ENTRY_SPEED_MIN) {
          var impactSpeedIn = Math.abs(effectiveVy);
          applySplashImpulse(i, impactSpeedIn, 'entry');
        }

        if (prevY <= 0 && newY > 0 && effectiveVy > EXIT_SPEED_MIN) {
          var impactSpeedOut = Math.abs(effectiveVy);
          applySplashImpulse(i, impactSpeedOut, 'exit');
        }
      }

      for (var i = 0; i < spheres.length; i++) {
        var a = spheres[i];
        if (!a) continue;
        for (var j = i + 1; j < spheres.length; j++) {
          var b = spheres[j];
          if (!b) continue;

          var delta = b.center.subtract(a.center);
          var dist = delta.length();
          var minDist = a.radius + b.radius;

          if (dist === 0.0) {
            delta = new GL.Vector(0.001, 0, 0);
            dist = delta.length();
          }

          if (dist < minDist) {
            var n = delta.multiply(1.0 / dist);
            var penetration = minDist - dist;

            var ma = sphereMass(a);
            var mb = sphereMass(b);
            var invMa = 1.0 / ma;
            var invMb = 1.0 / mb;
            var totalInvMass = invMa + invMb;
            if (totalInvMass <= 0.0) totalInvMass = 1.0;

            var moveA = -penetration * (invMa / totalInvMass);
            var moveB = penetration * (invMb / totalInvMass);
            a.center = a.center.add(n.multiply(moveA));
            b.center = b.center.add(n.multiply(moveB));

            var relVel = a.velocity.subtract(b.velocity);
            var relNormal = relVel.dot(n);

            if (relNormal < 0) {
              var fluidity = (typeof water.fluidity === 'number') ? water.fluidity : 1.0;
              fluidity = clamp(fluidity, 0.0, 1.0);
              var viscosity = 1.0 - fluidity;

              var baseRestitution = 0.55 * (1.0 - 0.75 * viscosity);
              if (baseRestitution < 0.0) baseRestitution = 0.0;

              var speed = Math.abs(relNormal);
              var LOW_SPEED = 0.5;

              var e;
              if (speed < LOW_SPEED) {
                e = 0.0;
              } else {
                e = baseRestitution;
              }

              var jImpulse = -(1.0 + e) * relNormal / (invMa + invMb);

              if (jImpulse > MAX_IMPULSE) jImpulse = MAX_IMPULSE;
              if (jImpulse < -MAX_IMPULSE) jImpulse = -MAX_IMPULSE;

              var impulse = n.multiply(jImpulse);
              a.velocity = a.velocity.add(impulse.multiply(invMa));
              b.velocity = b.velocity.subtract(impulse.multiply(invMb));
            }
          }
        }
      }

      for (var i = 0; i < spheres.length; i++) {
        var s = spheres[i];
        if (!s) continue;
        var vlen = s.velocity.length();
        if (vlen > MAX_SPEED) {
          s.velocity = s.velocity.unit().multiply(MAX_SPEED);
        }
      }
    }

    // 先在兔子模式下，用多小球扰动水面
    if (shapeMode === 'bunny' && spheres.length > 0 && spheres[0]) {
      applyBunnyWaterInteraction(spheres[0]);
    }

    // 再做默认的 moveSphere：
    // 兔子模式下跳过第 0 个球（它已经通过上面的多球处理了）
    for (var i = 0; i < spheres.length; i++) {
      var s = spheres[i];
      if (!s) continue;

      if (!(shapeMode === 'bunny' && i === 0)) {
        water.moveSphere(s.oldCenter, s.center, s.radius);
      }

      s.oldCenter = s.center;
    }

    water.stepSimulation();
    water.stepSimulation();
    water.updateNormals();

    if (spheres.length > 0 && spheres[0]) {
      renderer.sphereCenter = spheres[0].center;
      renderer.sphereRadius = spheres[0].radius;
    }
    renderer.updateCaustics(water);
  }

  function draw() {
    if (GL.keys.L) {
      renderer.lightDir = GL.Vector.fromAngles(
        (90 - angleY) * Math.PI / 180,
        -angleX * Math.PI / 180
      );
      if (paused) renderer.updateCaustics(water);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(0, 0, -4);
    gl.rotate(-angleX, 1, 0, 0);
    gl.rotate(-angleY, 0, 1, 0);
    gl.translate(0, 0.5, 0);

    gl.enable(gl.DEPTH_TEST);

    if (spheres.length > 0 && spheres[0]) {
      renderer.sphereCenter = spheres[0].center;
      renderer.sphereRadius = spheres[0].radius;
    }

    renderer.renderCube();
    renderer.renderWater(water, cubemap);

    if (shapeMode === 'sphere') {
      for (var i = 0; i < spheres.length; i++) {
        var s = spheres[i];
        if (!s) continue;
        renderer.sphereCenter = s.center;
        renderer.sphereRadius = s.radius;
        renderer.renderSphere();
      }
    } else if (shapeMode === 'bunny') {
      // 0号球是兔子的包围球：只渲染兔子本体（不渲染这个球）
      if (spheres.length > 0 && spheres[0]) {
        var s0 = spheres[0];
        renderer.sphereCenter = s0.center;
        renderer.sphereRadius = s0.radius;
        renderer.renderBunny();
      }

      // bunny 模式下允许再加两个球：这些球照常渲染成球体
      for (var i = 1; i < spheres.length; i++) {
        var s = spheres[i];
        if (!s) continue;
        renderer.sphereCenter = s.center;
        renderer.sphereRadius = s.radius;
        renderer.renderSphere();
      }
    }

    gl.disable(gl.DEPTH_TEST);
  }
};