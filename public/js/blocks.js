// Constructor
var container,
  renderer,
  camera,
  scene,
  material,
  cubes,
  animating = false;

var bigness = 300;

function init() {

  // Grab our container div
  container = document.getElementById("viewport");

  // Create the Three.js renderer, add it to our div
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  renderer.setClearColor(0x000000, 0); // the default
  renderer.setSize(container.offsetWidth, container.offsetHeight);
  container.appendChild(renderer.domElement);

  // Create a new Three.js scene
  scene = new THREE.Scene();

  // Put in a camera
  camera = new THREE.PerspectiveCamera(45, container.offsetWidth / container.offsetHeight, 1, 4000);
  camera.position.z = bigness * 7;


  scene.fog = new THREE.Fog(0x000000, 1, 15000);

  var lightpoint = new THREE.PointLight(0xffffff);
  lightpoint.position.set(bigness, bigness, bigness);
  scene.add(lightpoint);

  var light = new THREE.AmbientLight(0x888888);
  scene.add(light);


  // Now, create a Phong material to show shading; pass in the map
  material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    morphTargets: false
  });

  cubes = [];

  addCubes();

  animate();


  $('.animationlinks a')
    .on('mouseenter', function () {
      animating = true;

      var colors = [];
      for (var i = 0; i < 2; i++) {
        colors.push(randMinMax(10, 40));
      }

      var color = '0x' + colors.join('');

      light.color.setHex(color);

    })
    .on('mouseleave', function () {
      animating = false;
      light.color.setHex(0x888888);
    });

}


function addCubes() {
  for (var i = 0; i < randMinMax(75, 95); i++) {
    addCube();
  }
}

function randMinMax(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addCube() {
  // Create the cube geometry
  var hBig = bigness / 1.5;
  var lBig = bigness / 10;


  var geometry = new THREE.CubeGeometry(randMinMax(lBig, hBig), randMinMax(lBig, hBig), randMinMax(lBig, hBig));

  // And put the geometry and material together into a mesh
  cube = new THREE.Mesh(geometry, material);

  var hw = (container.offsetWidth * 0.5) + hBig;
  var hh = (container.offsetHeight * 0.5) + hBig;

  cube.position.set(randMinMax(-hw, hw), randMinMax(-hh, hh), randMinMax(-hBig, bigness));

  // Turn it toward the scene, or we won't see the cube shape!
  cube.rotation.x = Math.PI / randMinMax(-5, 5);
  cube.rotation.y = Math.PI / randMinMax(-5, 5);
  cubes.push(cube);
  // Add the cube to o
  scene.add(cube);
}

function animate() {
  renderer.render(scene, camera);

  if (animating) {
    for (var i = 0, ii = cubes.length; i < ii; i++) {
      var thisCube = cubes[i];
      thisCube.rotation.x += 0.00004 * i;
      thisCube.rotation.y += 0.00003 * i;
      checkRotation(0.000006);
    }
  }

  requestAnimationFrame(animate);
}

function checkRotation(rotSpeed) {

  var x = camera.position.x,
    y = camera.position.y,
    z = camera.position.z;
  camera.position.x = x * Math.cos(rotSpeed) + z * Math.sin(rotSpeed);
  camera.position.z = z * Math.cos(rotSpeed) - x * Math.sin(rotSpeed);
  camera.lookAt(scene.position);
}


function clean() {
  for (var i = 0, ii = cubes.length; i < ii; i++) {
    scene.remove(cubes[i]);
  }
}

var adjust;

function adjustCanvas() {

  if (adjust) {
    clearTimeout(adjust);
  }

  adjust = setTimeout(function () {
    //clean();
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    //addCubes();
  }, 150);
}





window.onload = init;
window.onresize = adjustCanvas;
