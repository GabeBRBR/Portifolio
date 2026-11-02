import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Exploded view: each element flies away from the model centre on the GPU.
 * Installed on ViewerEngine.prototype by mixin().
 */
export class ExplodedViewMethods {
  /** Returns sampleId -> material, using the same per-sample colours the Fragments renderer draws. */
  async getExplosionMaterials(model) {
    const [samples, rawMaterials] = await Promise.all([model.getSamples(), model.getMaterials()]);
    const byMaterial = new Map();
    rawMaterials.forEach((raw, id) => {
      byMaterial.set(id, new THREE.MeshLambertMaterial({
        color: new THREE.Color().setRGB(raw.r / 255, raw.g / 255, raw.b / 255, THREE.SRGBColorSpace),
        transparent: raw.a < 254,
        opacity: raw.a / 255,
        depthWrite: raw.a >= 254,
        side: THREE.DoubleSide,
        clippingPlanes: this.clipPlanes
      }));
    });
    const bySample = new Map();
    samples.forEach((sample, id) => { const material = byMaterial.get(sample.material); if (material) bySample.set(id, material); });
    return bySample;
  }

  /** Clone of a material whose vertices move along aExplode * uExplode in the vertex shader. */
  explodeMaterial(source) {
    const material = source.clone();
    material.clippingPlanes = this.clipPlanes;
    const uniform = this.explodeUniform;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uExplode = uniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aExplode;\nuniform float uExplode;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + aExplode * uExplode;');
    };
    material.customProgramCacheKey = () => 'bim-explode';
    return material;
  }

  async buildExplodedView() {
    if (this.explodedElements.length) return this.explodedElements;
    if (this.explosionBuildPromise) return this.explosionBuildPromise;
    const version = ++this.explosionBuildVersion;
    this.explosionBuildPromise = (async () => {
      this.setLoading(true, 'Preparando explosão por pavimento…', 0);
      const records = [...this.modelRecords.values()].filter((record) => record.visible);
      const items = [];
      let completed = 0;
      for (const record of records) {
        const model = this.fragments?.list.get(record.id);
        if (!model) continue;
        const itemIds = await model.getItemsIdsWithGeometry();
        const [meshGroups, materialSet] = await Promise.all([
          model.getItemsGeometry(itemIds),
          this.getExplosionMaterials(model)
        ]);
        model.object.updateWorldMatrix(true, true);
        const fallback = new THREE.MeshLambertMaterial({ color: '#b7b1a6', side: THREE.DoubleSide, clippingPlanes: this.clipPlanes });
        for (let itemIndex = 0; itemIndex < meshGroups.length; itemIndex += 1) {
          const meshes = meshGroups[itemIndex];
          if (!meshes?.length) continue;
          const parts = [];
          const box = new THREE.Box3();
          for (const meshData of meshes) {
            if (!meshData.positions?.length) continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshData.positions), 3));
            if (meshData.indices?.length) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(meshData.indices), 1));
            else geometry.setIndex(Array.from({ length: meshData.positions.length / 3 }, (_, i) => i));
            geometry.computeVertexNormals();
            const transform = meshData.transform?.isMatrix4
              ? meshData.transform
              : new THREE.Matrix4().fromArray(meshData.transform?.elements || meshData.transform || []);
            geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(model.object.matrixWorld, transform));
            geometry.computeBoundingBox();
            box.union(geometry.boundingBox);
            parts.push({ geometry, material: materialSet.get(meshData.sampleId) || fallback });
          }
          if (!parts.length || box.isEmpty()) continue;
          const center = box.getCenter(new THREE.Vector3());
          items.push({ center, parts });
        }
        completed += 1;
        this.setLoading(true, 'Preparando explosão por pavimento…', Math.round((completed / records.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (version !== this.explosionBuildVersion) {
        items.forEach((item) => item.parts.forEach((part) => part.geometry.dispose()));
        return [];
      }
      // Like a CAD viewer: every element flies away from the model centre along
      // its own vector (each axis scaled by the model's half-extent), on the GPU.
      const bounds = new THREE.Box3();
      items.forEach((item) => bounds.expandByPoint(item.center));
      const modelCenter = bounds.getCenter(new THREE.Vector3());
      const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(0.001, 0.001, 0.001));
      const buckets = new Map();
      items.forEach((item) => {
        const direction = item.center.clone().sub(modelCenter).divide(half);
        item.parts.forEach(({ geometry, material }) => {
          const count = geometry.getAttribute('position').count;
          const vectors = new Float32Array(count * 3);
          for (let i = 0; i < count; i += 1) direction.toArray(vectors, i * 3);
          geometry.setAttribute('aExplode', new THREE.BufferAttribute(vectors, 3));
          const bucket = buckets.get(material.uuid) || buckets.set(material.uuid, { material, geometries: [] }).get(material.uuid);
          bucket.geometries.push(geometry);
        });
      });
      const group = new THREE.Group();
      group.name = 'Explosão por elemento';
      const elements = [];
      buckets.forEach((bucket) => {
        const merged = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
        if (bucket.geometries.length > 1) bucket.geometries.forEach((geometry) => geometry.dispose());
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, this.explodeMaterial(bucket.material));
        mesh.frustumCulled = false;
        group.add(mesh);
        elements.push({ element: mesh });
      });
      this.world.scene.three.add(group);
      group.visible = false;
      this.explodedGroup = group;
      this.explodedElements = elements;
      this.explodedLevels = 0;
      return elements;
    })();
    try {
      return await this.explosionBuildPromise;
    } finally {
      this.explosionBuildPromise = null;
      this.setLoading(false);
    }
  }

  clearExplodedView() {
    this.explosionBuildVersion += 1;
    if (this.explodedGroup) {
      this.explodedGroup.removeFromParent();
      const materials = new Set();
      this.explodedGroup.traverse((object) => {
        object.geometry?.dispose?.();
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      materials.forEach((material) => material.dispose?.());
    }
    this.explodedGroup = null;
    this.explodedElements = [];
  }

  async setExplodeDistance(distance) {
    const nextDistance = Math.max(0, Number(distance) || 0);
    this.explodeDistance = nextDistance;
    if (!nextDistance) {
      if (this.explodedGroup) this.explodedGroup.visible = false;
      this.modelRecords.forEach((record, id) => {
        const model = this.fragments?.list.get(id);
        if (model) model.object.visible = record.visible;
      });
      this.buildCollisionProxy();
      this.world.renderer.needsUpdate = true;
      return;
    }
    try {
      if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
      const elements = await this.buildExplodedView();
      if (!elements.length) return;
      this.explodeUniform.value = this.explodeDistance;
      this.modelRecords.forEach((record, id) => {
        const model = this.fragments?.list.get(id);
        if (model) model.object.visible = false;
      });
      const wasVisible = this.explodedGroup.visible;
      this.explodedGroup.visible = true;
      this.world.renderer.needsUpdate = true;
      if (!wasVisible) this.showStatus(`Vista explodida ativa. Retorne a 0,0 m para reativar seleção e caminhada.`);
    } catch (error) {
      console.error('Falha ao preparar a explosão IFC:', error);
      this.explodeDistance = 0;
      this.clearExplodedView();
      this.modelRecords.forEach((record, id) => {
        const model = this.fragments?.list.get(id);
        if (model) model.object.visible = record.visible;
      });
      this.world.renderer.needsUpdate = true;
      this.showStatus(`Não foi possível preparar a explosão por elementos: ${error.message || 'erro desconhecido'}.`);
    }
  }
}
