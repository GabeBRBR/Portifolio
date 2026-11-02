import * as THREE from 'three';

/**
 * Section box of the viewer: bounds of the visible models and the six clipping planes.
 * Installed on ViewerEngine.prototype by mixin().
 */
export class ClipBoxMethods {
  getClipBox() {
    return this.clipBox ? { ...this.clipBox } : null;
  }

  getVisibleModelBounds() {
    const bounds = new THREE.Box3();
    this.modelRecords.forEach((record, id) => {
      if (!record.visible) return;
      const model = this.fragments?.list.get(id);
      if (!model) return;
      // Fragments keeps an exact box per model. Box3.setFromObject over its
      // BatchedMesh children is unreliable (instance transforms are not
      // applied), which displaced the section box on some models.
      if (model.box && !model.box.isEmpty()) bounds.union(model.box);
      else {
        const modelBounds = new THREE.Box3().setFromObject(model.object);
        if (!modelBounds.isEmpty()) bounds.union(modelBounds);
      }
    });
    return bounds;
  }

  resetClipBox() {
    const bounds = this.getVisibleModelBounds();
    if (bounds.isEmpty()) return null;
    const padding = 0.01;
    this.clipBox = {
      minX: bounds.min.x - padding, maxX: bounds.max.x + padding,
      minY: bounds.min.y - padding, maxY: bounds.max.y + padding,
      minZ: bounds.min.z - padding, maxZ: bounds.max.z + padding
    };
    this.applyClipBox();
    return this.getClipBox();
  }

  setClipBox(bounds) {
    if (!this.clipBox && !this.resetClipBox()) return null;
    const next = { ...this.clipBox, ...bounds };
    if (next.minX > next.maxX || next.minY > next.maxY || next.minZ > next.maxZ) return this.getClipBox();
    this.clipBox = next;
    this.applyClipBox();
    return this.getClipBox();
  }

  applyClipBox() {
    if (!this.clipBox || !this.world?.renderer) return;
    if (this.clipPlanes.length !== 6) {
      this.clipPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0)),
        new THREE.Plane(new THREE.Vector3(0, 1, 0)), new THREE.Plane(new THREE.Vector3(0, -1, 0)),
        new THREE.Plane(new THREE.Vector3(0, 0, 1)), new THREE.Plane(new THREE.Vector3(0, 0, -1))
      ];
      this.world.renderer.three.localClippingEnabled = true;
      this.clipPlanes.forEach((plane) => this.world.renderer.setPlane(true, plane, false));
    }
    const b = this.clipBox;
    [-b.minX, b.maxX, -b.minY, b.maxY, -b.minZ, b.maxZ]
      .forEach((constant, index) => { this.clipPlanes[index].constant = constant; });
    this.world.renderer.needsUpdate = true;
  }
}
