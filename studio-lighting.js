import * as THREE from 'three';

// An embedded studio reflection provides broad highlights without network assets.
// It illuminates the model only; the existing transparent viewer stays unchanged.
export function setupStudioLighting(renderer, scene) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color().setRGB(.16, .18, .21);
  const panels = [
    {position:[4,5,5],size:[5,6],radiance:[3,2.9,2.75]},
    {position:[-5,2,2],size:[4,6],radiance:[1.45,1.6,1.85]},
    {position:[2,4,-5],size:[4,5],radiance:[1.8,1.95,2.15]}
  ];
  for (const {position,size,radiance} of panels) {
    const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    material.color.setRGB(...radiance);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
    panel.position.set(...position);
    panel.lookAt(0,0,0);
    studio.add(panel);
  }

  const generator = new THREE.PMREMGenerator(renderer);
  const previous = {
    target:renderer.getRenderTarget(),toneMapping:renderer.toneMapping,
    autoClear:renderer.autoClear,xrEnabled:renderer.xr.enabled
  };
  let environment = null;
  try {
    environment = generator.fromScene(studio, .035, .1, 30, {size:128});
    scene.environment = environment.texture;
    scene.environmentIntensity = .7;
  } catch (error) {
    // Keep the material and direct lighting usable on a limited WebGL device.
    console.warn('环境反射生成失败，使用直接照明。', error);
  } finally {
    renderer.setRenderTarget(previous.target);
    renderer.toneMapping = previous.toneMapping;
    renderer.autoClear = previous.autoClear;
    renderer.xr.enabled = previous.xrEnabled;
    generator.dispose();
    studio.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      object.material.dispose();
    });
  }

  scene.add(new THREE.HemisphereLight('#ffffff', '#9caab8', .7));
  for (const [color,power,position] of [
    ['#fffaf1',1.8,[120,160,220]],
    ['#e5efff',.7,[-120,30,80]],
    ['#e8f0fa',.75,[80,80,-150]]
  ]) {
    const light = new THREE.DirectionalLight(color,power);
    light.position.set(...position);
    scene.add(light);
  }
  return environment;
}
