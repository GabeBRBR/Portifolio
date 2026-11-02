import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { subtractDoorPortals } from './geometry/polygonClip.js';

/**
 * Walking colliders: builds floor and obstacle meshes from IFC geometry or the hosted .collider files.
 * Installed on ViewerEngine.prototype by mixin().
 */
export class CollisionMethods {
  async createLocalCollisionData(model) {
    // Hosted models keep their pre-built colliders. Local IFCs must not sample
    // the BatchedMesh used by the renderer: its GPU-oriented ranges can differ
    // from the source representation after an import. The Fragments worker
    // returns each IFC item's original mesh and its own transform instead.
    model.object.updateWorldMatrix(true, true);
    const modelWorldInverse = new THREE.Matrix4().copy(model.object.matrixWorld).invert();
    const [doorPortals, floorIds, obstacleIds] = await Promise.all([
      this.getLocalDoorPortals(model, modelWorldInverse),
      this.getLocalCollisionCategoryIds(model, [/^IFC(?:SLAB|COVERING|STAIR(?:FLIGHT)?|RAMP|FOOTING|PAVEMENT|BUILDINGELEMENTPROXY)$/i]),
      this.getLocalCollisionCategoryIds(model, [/^IFC(?:WALL(?:STANDARDCASE)?|COLUMN|BEAM|CURTAINWALL)$/i])
    ]);
    const [floors, obstacles] = await Promise.all([
      this.extractLocalCollisionRole(model, floorIds, 'floor', doorPortals),
      this.extractLocalCollisionRole(model, obstacleIds, 'obstacle', doorPortals)
    ]);
    // A thin footprint is preferable to a missing walking surface, but it is
    // deliberately only a last-resort floor and never creates box obstacles.
    const fallback = floors.positions.length ? null : this.createLocalBoundsFloor(model, modelWorldInverse);
    return {
      coordinateSpace: 'model-local',
      floors: floors.positions.length ? floors : fallback.floors,
      obstacles,
      partial: !floors.positions.length,
      debug: {
        floorItems: floorIds.length,
        obstacleItems: obstacleIds.length,
        floorTriangles: floors.indices.length / 3,
        obstacleTriangles: obstacles.indices.length / 3,
        doorPortals: doorPortals.length
      }
    };
  }

  async getLocalCollisionCategoryIds(model, categories) {
    const byCategory = await model.getItemsOfCategories(categories);
    return [...new Set(Object.values(byCategory).flat())];
  }

  async extractLocalCollisionRole(model, localIds, role, doorPortals) {
    if (!localIds.length) return this.emptyCollisionSource();
    let meshGroups;
    try {
      meshGroups = await model.getItemsGeometry(localIds);
    } catch (error) {
      console.warn(`Não foi possível extrair a geometria IFC de ${role}:`, error);
      return this.emptyCollisionSource();
    }
    const positions = [];
    const indices = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (const meshes of meshGroups || []) {
      for (const mesh of meshes || []) {
        if (!mesh.positions?.length || !mesh.transform) continue;
        const transform = mesh.transform.isMatrix4
          ? mesh.transform
          : new THREE.Matrix4().fromArray(mesh.transform.elements || mesh.transform);
        const sourceIndices = mesh.indices || null;
        const sourceCount = sourceIndices?.length || Math.floor(mesh.positions.length / 3);
        for (let offset = 0; offset + 2 < sourceCount; offset += 3) {
          const ia = sourceIndices ? sourceIndices[offset] : offset;
          const ib = sourceIndices ? sourceIndices[offset + 1] : offset + 1;
          const ic = sourceIndices ? sourceIndices[offset + 2] : offset + 2;
          if (ia == null || ib == null || ic == null) continue;
          a.fromArray(mesh.positions, ia * 3).applyMatrix4(transform);
          b.fromArray(mesh.positions, ib * 3).applyMatrix4(transform);
          c.fromArray(mesh.positions, ic * 3).applyMatrix4(transform);
          normal.subVectors(b, a).cross(this.walkVectors.next.subVectors(c, a));
          if (normal.lengthSq() < 1e-10) continue;
          normal.normalize();
          const supportsWalking = normal.y > 0.45;
          const blocksWalking = Math.abs(normal.y) <= 0.55;
          if (role === 'floor' ? !supportsWalking : !blocksWalking) continue;
          const pieces = role === 'obstacle'
            ? subtractDoorPortals([a.clone(), b.clone(), c.clone()], doorPortals)
            : [[a, b, c]];
          for (const polygon of pieces) {
            for (let vertex = 1; vertex + 1 < polygon.length; vertex += 1) {
              const base = positions.length / 3;
              const first = polygon[0];
              const second = polygon[vertex];
              const third = polygon[vertex + 1];
              positions.push(first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z);
              indices.push(base, base + 1, base + 2);
            }
          }
        }
      }
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  }

  async getLocalDoorPortals(model, modelWorldInverse) {
    const [openingsByCategory, doorsByCategory] = await Promise.all([
      model.getItemsOfCategories([/^IFCOPENINGELEMENT$/i]),
      model.getItemsOfCategories([/^IFCDOOR$/i])
    ]);
    // Prefer IFC openings: they encode the actual void in the wall, while a
    // door's representation can include its leaf or swing. Older exports that
    // omit openings still use the door's own dimensions as a narrow fallback.
    const openingIds = [...new Set(Object.values(openingsByCategory).flat())];
    const doorIds = openingIds.length ? openingIds : [...new Set(Object.values(doorsByCategory).flat())];
    if (!doorIds.length) return [];

    // Ask the Fragments data worker for the bounds of each door. The previous
    // approach hid and re-shown every batched instance to derive these bounds;
    // on dense Revit exports that visibility transaction could never settle.
    const boxes = await model.getBoxes(doorIds);
    // Only a 2 cm tolerance is needed to avoid an invisible frame catching
    // the player. Larger padding made visible door openings much wider than
    // their IFC representation.
    return boxes
      .filter((bounds) => bounds?.min && bounds?.max)
      // Bounds returned through the Fragments worker preserve `isBox3`, but
      // are plain structured-clone objects in some browser/worker versions.
      // Rebuild a native Box3 instead of calling its prototype's `clone`.
      .map((bounds) => new THREE.Box3(
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
      ).applyMatrix4(modelWorldInverse).expandByScalar(0.02));
  }

  createLocalBoundsFloor(model, modelWorldInverse = new THREE.Matrix4().copy(model.object.matrixWorld).invert()) {
    const bounds = new THREE.Box3().setFromObject(model.object);
    if (bounds.isEmpty()) {
      return { floors: this.emptyCollisionSource(), obstacles: this.emptyCollisionSource() };
    }
    bounds.applyMatrix4(modelWorldInverse);
    const { min, max } = bounds;
    const y = min.y - 0.01;
    const positions = new Float32Array([
      min.x, y, min.z, max.x, y, min.z, max.x, y, max.z,
      min.x, y, min.z, max.x, y, max.z, min.x, y, max.z
    ]);
    return { floors: { positions, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }, obstacles: this.emptyCollisionSource() };
  }

  emptyCollisionSource() {
    return { positions: new Float32Array(), indices: new Uint32Array() };
  }

  buildCollisionProxy() {
    this.disposeColliderMesh(this.floorCollider);
    this.disposeColliderMesh(this.obstacleCollider);
    this.floorCollider = null;
    this.obstacleCollider = null;
    const records = [...this.modelRecords.values()].filter((record) => record.visible && record.colliderData);
    this.floorCollider = this.createColliderMesh(records, 'floors');
    this.obstacleCollider = this.createColliderMesh(records, 'obstacles');
    const bounds = new THREE.Box3();
    [this.floorCollider, this.obstacleCollider].forEach((mesh) => {
      if (mesh?.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox);
    });
    this.collisionProxy = !!(this.floorCollider || this.obstacleCollider);
    this.collisionBounds.copy(bounds);
    this.walk.worldMinY = bounds.isEmpty() ? -Infinity : bounds.min.y - 8;
    this.updateCollisionAlignmentDiagnostics(records);
    this.syncCollisionDebugVisuals();
  }

  async loadCollider(url, coordinateSpace = 'model-local') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`colisor de caminhada não encontrado (${response.status})`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 24) throw new Error('arquivo de colisor truncado ou corrompido');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x49464343 || view.getUint32(4, true) !== 1) {
      throw new Error('formato de colisor incompatível');
    }
    const floorPositions = view.getUint32(8, true);
    const floorIndices = view.getUint32(12, true);
    const obstaclePositions = view.getUint32(16, true);
    const obstacleIndices = view.getUint32(20, true);
    let offset = 24;
    if (offset + (floorPositions + floorIndices + obstaclePositions + obstacleIndices) * 4 > buffer.byteLength) {
      throw new Error('arquivo de colisor truncado ou corrompido');
    }
    const floors = {
      positions: new Float32Array(buffer, offset, floorPositions),
      indices: new Uint32Array(buffer, offset += floorPositions * 4, floorIndices)
    };
    offset += floorIndices * 4;
    const obstacles = {
      positions: new Float32Array(buffer, offset, obstaclePositions),
      indices: new Uint32Array(buffer, offset += obstaclePositions * 4, obstacleIndices)
    };
    return { coordinateSpace, floors, obstacles };
  }

  createColliderMesh(records, role) {
    // Some IFCs contain only slabs/floors or only vertical elements. A missing
    // optional source must mean "no collider of this role", never abort the
    // import with `positions is undefined`.
    const sources = records
      .map((record) => ({ record, source: record.colliderData?.[role], model: this.fragments.list.get(record.id) }))
      .filter(({ source, model }) => source?.positions?.length && source?.indices?.length && model);
    if (!sources.length) return null;
    const positionCount = sources.reduce((sum, { source }) => sum + source.positions.length, 0);
    const indexCount = sources.reduce((sum, { source }) => sum + source.indices.length, 0);
    const positions = new Float32Array(positionCount);
    const indices = new Uint32Array(indexCount);
    let positionOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;
    const sourceRanges = [];
    let triangleOffset = 0;
    const point = new THREE.Vector3();
    for (const { record, source, model } of sources) {
      model.object.updateWorldMatrix(true, true);
      const coordinateSpace = record.colliderData?.coordinateSpace || 'model-local';
      const collisionToWorld = coordinateSpace === 'world'
        ? new THREE.Matrix4()
        : model.object.matrixWorld.clone();
      const sourceBounds = new THREE.Box3();
      for (let offset = 0; offset < source.positions.length; offset += 3) {
        point.set(source.positions[offset], source.positions[offset + 1], source.positions[offset + 2]).applyMatrix4(collisionToWorld);
        positions[positionOffset + offset] = point.x;
        positions[positionOffset + offset + 1] = point.y;
        positions[positionOffset + offset + 2] = point.z;
        sourceBounds.expandByPoint(point);
      }
      for (let index = 0; index < source.indices.length; index += 1) indices[indexOffset + index] = source.indices[index] + vertexOffset;
      const triangles = source.indices.length / 3;
      sourceRanges.push({
        start: triangleOffset, end: triangleOffset + triangles, record,
        coordinateSpace, collisionToWorld, worldBounds: sourceBounds
      });
      triangleOffset += triangles;
      positionOffset += source.positions.length;
      indexOffset += source.indices.length;
      vertexOffset += source.positions.length / 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.boundsTree = new MeshBVH(geometry, { targetLeafSize: 24, setBoundingBox: false });
    const material = new THREE.MeshBasicMaterial({
      color: role === 'obstacles' ? '#ef4444' : '#f59e0b', side: THREE.DoubleSide,
      transparent: true, opacity: 0.24, depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.raycast = acceleratedRaycast;
    mesh.name = `Diagnóstico de colisão: ${role}`;
    mesh.userData.collisionRole = role;
    mesh.userData.sourceRanges = sourceRanges;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  updateCollisionAlignmentDiagnostics(records) {
    if (!this.collisionDebugEnabled) return;
    const ranges = [this.floorCollider, this.obstacleCollider]
      .flatMap((collider) => collider?.userData?.sourceRanges || []);
    const messages = [];
    for (const record of records) {
      const model = this.fragments.list.get(record.id);
      const modelRanges = ranges.filter((range) => range.record.id === record.id);
      if (!model || !modelRanges.length) continue;
      model.object.updateWorldMatrix(true, true);
      const collisionBounds = new THREE.Box3();
      modelRanges.forEach((range) => collisionBounds.union(range.worldBounds));
      const visualBounds = new THREE.Box3().setFromObject(model.object);
      if (collisionBounds.isEmpty() || visualBounds.isEmpty()) continue;
      const collisionCenter = collisionBounds.getCenter(new THREE.Vector3());
      const visualCenter = visualBounds.getCenter(new THREE.Vector3());
      const centerDelta = collisionCenter.distanceTo(visualCenter);
      const applied = modelRanges[0].collisionToWorld.elements;
      const state = centerDelta > 1.2 ? 'deslocado' : 'alinhado';
      const stats = record.colliderData?.debug;
      const coverage = stats
        ? ` · ${stats.floorTriangles} triângulos de piso, ${stats.obstacleTriangles} de obstáculo · ${stats.doorPortals} vão(ãos)`
        : '';
      const partial = record.colliderData?.partial ? ' · cobertura parcial' : '';
      messages.push(`${record.discipline || record.name}: Δcentro ${centerDelta.toFixed(2)} m (${state}) · translação ${applied[12].toFixed(2)}, ${applied[13].toFixed(2)}, ${applied[14].toFixed(2)}${coverage}${partial}`);
    }
    this.collisionAlignmentDebug = messages.join('\n');
  }

  disposeColliderMesh(mesh) {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry?.disposeBoundsTree?.();
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }

  syncCollisionDebugVisuals() {
    const colliders = [this.floorCollider, this.obstacleCollider].filter(Boolean);
    for (const collider of colliders) {
      if (this.collisionDebugEnabled) {
        if (!collider.parent) this.world.scene.three.add(collider);
        collider.visible = true;
        collider.renderOrder = 100;
      } else {
        collider.removeFromParent();
      }
    }
    this.world?.renderer && (this.world.renderer.needsUpdate = true);
  }

  reportCollisionContact(hit, mechanism) {
    if (!this.collisionDebugEnabled || !hit) return;
    const now = performance.now();
    if (this.lastCollisionContact && now - this.lastCollisionContact.at < 160) return;
    const ranges = hit.object?.userData?.sourceRanges || [];
    const range = ranges.find((entry) => hit.faceIndex >= entry.start && hit.faceIndex < entry.end);
    const record = range?.record;
    const origin = record
      ? `${record.discipline || 'IFC'} · ${record.name || record.id}`
      : 'origem não identificada';
    const classes = record?.source === 'local'
      ? 'IFCWALL, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCCURTAINWALL, IFCSTAIR, IFCRAMP, IFCFOOTING ou IFCPAVEMENT'
      : 'colisor otimizado pré-gerado';
    this.lastCollisionContact = { at: now, mechanism, origin, classes, faceIndex: hit.faceIndex, point: hit.point.clone() };
    this.onWalkDebug?.(`COLISÃO ${mechanism}: ${origin} · categoria candidata: ${classes} · triângulo ${hit.faceIndex} · ponto ${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}`);
  }

  async hideSpaces(model) {
    if (this.spacesVisible) return;
    const byCategory = await model.getItemsOfCategories([/^IFCSPACE$/i]);
    const spaces = Object.values(byCategory).flat();
    if (spaces.length) await model.setVisible(spaces, false);
  }
}
