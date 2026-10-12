import { initScene } from './scene.js';
import * as UI from './ui.js';

function boot() {
  try {
    initScene(document.getElementById('world'), document.getElementById('labels'), {
      onChar: id => UI.onCharClick(id),
      onBuilding: id => UI.onBuildingClick(id),
    });
  } catch (err) {
    console.error(err);
    document.getElementById('nogl').hidden = false;
  }
  UI.init();
  document.getElementById('loading')?.remove();
}
boot();
