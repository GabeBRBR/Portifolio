import * as THREE from 'three';
import { LodMode } from '@thatopen/fragments';

/**
 * First-person walk: placement, PointerLock input, collision-aware stepping and LOD policy.
 * Installed on ViewerEngine.prototype by mixin().
 */
export class WalkMethods {
  async startWalkPlacement() {
    if (this.plan) await this.exitPlan({ fit: false });
    this.setMeasureMode(null);
    if (!this.collisionProxy) return this.showStatus('Aguarde o carregamento de uma disciplina para iniciar a caminhada.');
    this.clearSelection();
    // The highlighter also listens to canvas clicks. Disable it before the
    // placement click so it is reserved exclusively for choosing the floor.
    if (this.highlighter) this.highlighter.enabled = false;
    this.walk.mode = 'placement';
    this.onModeChange?.({ walk: 'placement' });
    this.world.renderer.three.domElement.classList.add('ifc-place-cursor');
    this.walkHelp?.classList.remove('hidden');
    this.walkCrosshair?.classList.add('hidden');
    this.showStatus('Clique em qualquer elemento visível para posicionar-se. Depois use WASD, Espaço para pular e Shift para correr.');
  }

  async exitWalk({ fit = true } = {}) {
    const wasWalking = this.walk.mode !== 'orbit';
    this.walk.mode = 'orbit';
    this.onModeChange?.({ walk: 'orbit' });
    this.walk.keys.clear();
    this.walk.jumpRequested = false;
    this.walk.velocityY = 0;
    this.walk.accumulator = 0;
    this.walk.grounded = false;
    if (this.walkControls?.isLocked) this.walkControls.unlock();
    if (this.highlighter) this.highlighter.enabled = true;
    this.world?.camera && (this.world.camera.controls.enabled = true);
    this.world?.renderer?.three.domElement.classList.remove('ifc-place-cursor');
    this.walkHelp?.classList.add('hidden');
    this.walkCrosshair?.classList.add('hidden');
    // In orbit Fragments can return to its normal, efficient camera culling.
    // The no-cull policy is only needed while the user's eye is inside a
    // model, where an incomplete LOD tile at the frame edge is very visible.
    if (wasWalking) await this.setWalkLodPolicy(false);
    if (wasWalking && fit) await this.fit();
    if (wasWalking) this.showStatus('Caminhada encerrada. Órbita e zoom restaurados.');
  }

  async onWalkCanvasClick(event) {
    if (this.walk.mode === 'placement') {
      try {
        // Both pickers are read-only and do not touch the Highlighter. The
        // placement click must never select an item or populate its properties.
        const visualHit = await this.pickWalkSurface(event);
        const obstacleHit = this.pickObstacleCollision(event);
        const colliderHit = this.pickCollision(event);
        const hit = visualHit
          || obstacleHit
          || colliderHit
          || this.pickModelBounds(event);
        if (!hit?.point) return this.showStatus('Não foi possível localizar este ponto no modelo. Clique diretamente em uma geometria visível.');

        // Any element can start a walk. Prefer a horizontal surface below the
        // click, but keep the clicked elevation when the point is over void so
        // gravity can take over naturally.
        const camera = this.world.camera.three;
        this.world.scene.three.updateMatrixWorld(true);
        const spawnFeet = this.walkVectors.next.copy(hit.point);
        // A wall click is accepted as a spawn request, but its point lies on
        // the solid surface. Move the player-radius toward the visible side
        // before looking for the floor; otherwise the eye begins inside the
        // wall and near-plane clipping looks like passing through it.
        if (obstacleHit?.face && obstacleHit.point.distanceTo(hit.point) < 0.75) {
          const normal = this.walkVectors.normal.copy(obstacleHit.face.normal).transformDirection(obstacleHit.object.matrixWorld);
          if (Math.abs(normal.y) < 0.55) {
            normal.y = 0;
            spawnFeet.addScaledVector(normal.normalize(), this.walk.radius + 0.06);
          }
        }
        const floor = this.findFloorAt(spawnFeet.x, spawnFeet.z, spawnFeet.y + 0.12, 80);
        spawnFeet.y = floor?.point.y ?? spawnFeet.y;

        // Suspend orbit ownership before writing the camera position. Calling
        // CameraControls.setLookAt here was the source of the stale-orbit spawn.
        this.world.camera.controls.enabled = false;
        camera.zoom = 1;
        camera.updateProjectionMatrix();
        this.walk.zoom = 1;
        this.walk.feet.copy(spawnFeet);
        this.resolvePlayerCapsule(this.walk.feet);
        this.walk.spawnFeet.copy(spawnFeet);
        this.walk.lastSafeFeet.copy(this.walk.feet);
        this.walk.hasSafeFeet = !!floor;
        this.walk.lastFloorY = floor?.point.y ?? null;
        this.walk.velocityY = 0;
        this.walk.grounded = !!floor;
        this.walk.airborneSince = floor ? 0 : performance.now();
        this.syncCameraToPlayer();
        if (this.highlighter) {
          await this.highlighter.clear('select');
          this.highlighter.enabled = false;
        }
        // Do not rebuild the collision BVH here. Constructing it while the
        // pointer is being locked can stall the main thread on complex models;
        // the proxy prepared at load/visibility time remains in use.
        this.walk.accumulator = 0;
        this.walk.mode = 'walk';
        this.onModeChange?.({ walk: 'walk' });
        this.walk.lastFragmentsUpdate = 0;
        // First-person view must never replace a wall/beam at the edge of the
        // canvas with a coarser or missing fragment. Keep all *visible model*
        // geometry resident during walking; visibility toggles still apply and
        // the regular LOD/culling policy returns as soon as walking ends.
        void this.setWalkLodPolicy(true);
        this.updateFragmentsForWalk();
        this.walkHelp?.classList.add('hidden');
        this.walkCrosshair?.classList.remove('hidden');
        this.world.renderer.three.domElement.classList.remove('ifc-place-cursor');
        this.walkControls.lock(true);
      } catch (error) {
        console.error('Falha ao posicionar caminhada:', error);
        this.showStatus(`Não foi possível iniciar a caminhada: ${error.message || 'erro no raycast'}.`);
      }
      return;
    }
    if (this.walk.mode === 'walk' && this.measureMode) return;
    if (this.walk.mode === 'walk' && !this.walkControls.isLocked) {
      this.walk.mouseReleased = false;
      this.walkControls.lock(true);
      return;
    }
    if (this.walk.mode === 'walk') await this.selectAtCrosshair(event);
  }

  /**
   * While the pointer is locked the cursor does not exist, so a click selects
   * whatever sits under the centre-screen crosshair. Ctrl adds to the selection.
   */
  async selectAtCrosshair(event) {
    if (!this.highlighter || this.explodeDistance) return;
    const hit = await Promise.race([
      this.sceneRaycaster.castRay({ items: [], position: new THREE.Vector2(0, 0) }),
      new Promise((resolve) => setTimeout(() => resolve(null), 800))
    ]).catch(() => null);
    const modelId = hit?.fragments?.modelId;
    const localId = hit?.localId;
    if (modelId === undefined || localId === undefined || localId === null) {
      if (!event.ctrlKey) await this.clearSelection();
      return;
    }
    // The Highlighter stays disabled in walk mode so its own click handler
    // (which reads the frozen mouse position) cannot fire; enable it only for
    // this explicit, crosshair-based selection.
    this.highlighter.enabled = true;
    try {
      await this.highlighter.highlightByID('select', { [modelId]: new Set([localId]) }, !event.ctrlKey, false);
    } finally {
      if (this.walk.mode === 'walk') this.highlighter.enabled = false;
    }
    this.emitSelection();
    this.requestFrames();
  }

  onWalkUnlock() {
    if (this.walk.mode !== 'walk') return;
    this.walk.keys.clear();
    this.walk.jumpRequested = false;
    this.walk.mouseReleased = true;
    this.walk.ignoreEscapeUntil = performance.now() + 150;
    this.showStatus('Mouse liberado. Clique no modelo para continuar caminhando ou pressione Esc novamente para sair.');
  }

  onWalkWheel(event) {
    if (this.walk.mode !== 'walk' || !this.walkControls?.isLocked) return;
    event.preventDefault();
    this.walk.zoom = THREE.MathUtils.clamp(this.walk.zoom - event.deltaY * 0.0015, 0.65, 2.5);
    this.world.camera.three.zoom = this.walk.zoom;
    this.world.camera.three.updateProjectionMatrix();
    this.world.renderer.needsUpdate = true;
  }

  onWalkKey(event, down) {
    if (this.walk.mode !== 'walk') return;
    if (event.code === 'Escape' && down) {
      if (this.walkControls?.isLocked) this.walkControls.unlock();
      else if (performance.now() >= this.walk.ignoreEscapeUntil) this.exitWalk();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (down && !event.repeat) this.walk.jumpRequested = true;
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      if (down) this.walk.keys.add(event.code); else this.walk.keys.delete(event.code);
    }
  }

  pickCollision(event) {
    if (!this.collisionProxy) return null;
    const raycaster = this.createPointerRaycaster(event);
    return raycaster.intersectObjects([this.floorCollider, this.obstacleCollider].filter(Boolean), false)[0] || null;
  }

  pickObstacleCollision(event) {
    if (!this.obstacleCollider) return null;
    return this.createPointerRaycaster(event).intersectObject(this.obstacleCollider, false)[0] || null;
  }

  createPointerRaycaster(event) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    raycaster.setFromCamera(mouse, this.world.camera.three);
    return raycaster;
  }

  pickModelBounds(event) {
    if (this.collisionBounds.isEmpty()) return null;
    const raycaster = this.createPointerRaycaster(event);
    const point = raycaster.ray.intersectBox(this.collisionBounds, new THREE.Vector3());
    return point ? { point, distance: point.distanceTo(raycaster.ray.origin) } : null;
  }

  async pickWalkSurface(event) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    // Passing an empty item list asks SimpleRaycaster to use only the fast
    // Fragments picker. It avoids a slow worker request for every federation
    // member and, importantly, cannot hang the placement click.
    return Promise.race([
      this.sceneRaycaster.castRay({ items: [], position: mouse }),
      new Promise((resolve) => setTimeout(() => resolve(null), 800))
    ]);
  }

  collisionRay(origin, direction, far, role = 'all') {
    const targets = role === 'floor'
      ? [this.floorCollider]
      : role === 'obstacle'
        ? [this.obstacleCollider]
        : [this.floorCollider, this.obstacleCollider];
    const colliders = targets.filter(Boolean);
    if (!colliders.length) return null;
    // One shared raycaster: this runs several times per physics step.
    const raycaster = (this.collisionRaycaster ??= new THREE.Raycaster());
    raycaster.set(origin, direction);
    raycaster.near = 0;
    raycaster.far = far;
    raycaster.firstHitOnly = true;
    return raycaster.intersectObjects(colliders, false)[0] || null;
  }

  findFloorAt(x, z, startY, maxDrop = 6) {
    const origin = this.walkVectors.origin.set(x, startY, z);
    const hit = this.collisionRay(origin, this.walkVectors.down, maxDrop, 'floor');
    if (!hit?.face) return null;
    const normal = this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return normal.y > 0.55 ? hit : null;
  }

  floorBelow(feet, lift = 0.35, maxDrop = 6) {
    return this.findFloorAt(feet.x, feet.z, feet.y + lift, lift + maxDrop);
  }

  hitsWall(feet, direction, distance) {
    if (!distance) return false;
    // The final probe sits at eye level. The old upper probe stopped below
    // the camera, allowing it to clip a low wall even when the feet were
    // stopped correctly.
    return [0.2, this.walk.height * 0.55, this.walk.height - 0.04].some((height) => {
      const origin = this.walkVectors.origin.copy(feet).addScaledVector(direction, 0.01);
      origin.y += height;
      const hit = this.collisionRay(origin, direction, distance + this.walk.radius, 'obstacle');
      if (!hit?.face || hit.distance >= distance + this.walk.radius) return false;
      const blocks = Math.abs(this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y) < 0.55;
      if (blocks) this.reportCollisionContact(hit, 'ray lateral');
      return blocks;
    });
  }

  resolvePlayerCapsule(feet) {
    const boundsTree = this.obstacleCollider?.geometry?.boundsTree;
    if (!boundsTree) return null;
    const radius = this.walk.radius;
    const {
      capsuleSegment, capsuleBox, capsuleStart, capsuleCorrection,
      trianglePoint, capsulePoint, capsuleDirection
    } = this.walkVectors;

    capsuleSegment.start.copy(feet).addScaledVector(this.walkVectors.up, radius);
    // The physical body extends above the 1.70 m eye position. If the capsule
    // ended at eye height its rounded cap would have zero horizontal radius
    // exactly where the camera sits, allowing the view to enter a wall while
    // the lower body remained outside.
    capsuleSegment.end.copy(feet).addScaledVector(this.walkVectors.up, this.walk.bodyHeight - radius);
    capsuleStart.copy(capsuleSegment.start);
    capsuleBox.makeEmpty();
    capsuleBox.expandByPoint(capsuleSegment.start);
    capsuleBox.expandByPoint(capsuleSegment.end);
    capsuleBox.min.addScalar(-radius);
    capsuleBox.max.addScalar(radius);

    let capsuleContact = null;
    boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(capsuleBox),
      intersectsTriangle: (triangle) => {
        const distance = triangle.closestPointToSegment(capsuleSegment, trianglePoint, capsulePoint);
        if (distance >= radius) return false;
        if (!capsuleContact) capsuleContact = trianglePoint.clone();
        const depth = radius - distance;
        capsuleDirection.subVectors(capsulePoint, trianglePoint);
        if (capsuleDirection.lengthSq() < 1e-10) {
          triangle.getNormal(capsuleDirection);
          capsuleSegment.getCenter(capsulePoint).sub(trianglePoint);
          if (capsuleDirection.dot(capsulePoint) < 0) capsuleDirection.negate();
        } else {
          capsuleDirection.normalize();
        }
        capsuleSegment.start.addScaledVector(capsuleDirection, depth);
        capsuleSegment.end.addScaledVector(capsuleDirection, depth);
        return false;
      }
    });

    capsuleCorrection.subVectors(capsuleSegment.start, capsuleStart);
    if (capsuleContact) {
      this.reportCollisionContact({ object: this.obstacleCollider, faceIndex: -1, point: capsuleContact }, 'cápsula');
    }
    feet.add(capsuleCorrection);
    return capsuleCorrection;
  }

  syncCameraToPlayer() {
    const camera = this.world.camera.three;
    camera.position.copy(this.walk.feet).addScaledVector(this.walkVectors.up, this.walk.height);
    camera.updateMatrixWorld(true);
    this.updateFragmentsForWalk();
    this.world.renderer.needsUpdate = true;
  }

  updateFragmentsForWalk() {
    if (!this.fragments || this.walk.mode !== 'walk') return;
    const now = performance.now();
    // Avoid starting overlapping async refreshes from the 60 Hz physics loop.
    // The manager itself enforces the same 40 ms cap, but this guard avoids
    // allocating promises that cannot produce a new view request.
    if (now - this.walk.lastFragmentsUpdate < 40) return;
    this.walk.lastFragmentsUpdate = now;
    this.fragments.core.update().catch((error) => console.warn('Atualização de visibilidade da caminhada falhou:', error));
  }

  async setWalkLodPolicy(walking) {
    if (!this.fragments) return;
    const mode = walking ? LodMode.ALL_VISIBLE : LodMode.DEFAULT;
    const updates = [];
    this.modelRecords.forEach((record, id) => {
      if (!record.visible) return;
      const model = this.fragments.list.get(id);
      if (model) updates.push(model.setLodMode(mode));
    });
    await Promise.allSettled(updates);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  recoverWalk(reason) {
    const feet = this.walk.hasSafeFeet ? this.walk.lastSafeFeet : this.walk.spawnFeet;
    this.walk.feet.copy(feet);
    this.walk.velocityY = 0;
    this.walk.grounded = this.walk.hasSafeFeet;
    this.walk.airborneSince = 0;
    this.walk.lastFloorY = feet.y;
    this.syncCameraToPlayer();
    this.showStatus(`Posição recuperada (${reason}).`);
  }

  reportWalkDebug(rayStartedAt) {
    if (!this.onWalkDebug || !new URLSearchParams(window.location.search).has('ifcDebug')) return;
    const now = performance.now();
    if (now - this.walk.lastDebugAt < 350) return;
    this.walk.lastDebugAt = now;
    const { feet, grounded, velocityY, lastFloorY } = this.walk;
    const contact = this.lastCollisionContact && now - this.lastCollisionContact.at < 1500
      ? `\nÚltimo contato: ${this.lastCollisionContact.mechanism} · ${this.lastCollisionContact.origin} · categoria candidata: ${this.lastCollisionContact.classes} · triângulo ${this.lastCollisionContact.faceIndex} · ponto ${this.lastCollisionContact.point.x.toFixed(2)}, ${this.lastCollisionContact.point.y.toFixed(2)}, ${this.lastCollisionContact.point.z.toFixed(2)}`
      : '';
    const alignment = this.collisionAlignmentDebug ? `\nAlinhamento do colisor:\n${this.collisionAlignmentDebug}` : '';
    this.onWalkDebug(`Caminhada: pés ${feet.x.toFixed(2)}, ${feet.y.toFixed(2)}, ${feet.z.toFixed(2)} · ${grounded ? 'no chão' : 'no ar'} · vY ${velocityY.toFixed(2)} · piso ${lastFloorY?.toFixed(2) ?? '—'} · raycast ${(performance.now() - rayStartedAt).toFixed(2)} ms${contact}${alignment}`);
  }

  stepWalk(delta) {
    if (this.walk.jumpRequested && this.walk.grounded) {
      this.walk.velocityY = 8.5;
      this.walk.grounded = false;
      this.walk.airborneSince = performance.now();
    }
    this.walk.jumpRequested = false;
    const speed = this.walk.keys.has('ShiftLeft') || this.walk.keys.has('ShiftRight') ? this.walk.run : this.walk.speed;
    const forwardInput = Number(this.walk.keys.has('KeyW')) - Number(this.walk.keys.has('KeyS'));
    const sideInput = Number(this.walk.keys.has('KeyD')) - Number(this.walk.keys.has('KeyA'));
    const { move, forward, right, next } = this.walkVectors;
    this.walkControls.getDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.0001) forward.normalize();
    right.set(-forward.z, 0, forward.x);
    move.copy(forward).multiplyScalar(forwardInput).addScaledVector(right, sideInput);
    if (move.lengthSq()) {
      move.normalize();
      const heading = this.walkVectors.heading.copy(move);
      move.multiplyScalar(speed * delta);
      next.copy(this.walk.feet).add(move);
      const step = this.floorBelow(next, this.walk.stepHeight + 0.08, this.walk.stepHeight + 0.14);
      const stepY = step?.point.y;
      // A floor detected at the same height is normal while facing a wall;
      // it must not turn that wall into an allowed "step". Only a real rise
      // up to 20 cm qualifies for automatic stair/threshold climbing.
      const canStep = this.walk.grounded && stepY !== undefined
        && stepY > this.walk.feet.y + 0.04
        && stepY <= this.walk.feet.y + this.walk.stepHeight;
      if (!this.hitsWall(this.walk.feet, heading, move.length()) || canStep) {
        this.walk.feet.x = next.x;
        this.walk.feet.z = next.z;
        if (canStep) {
          this.walk.feet.y = stepY;
          this.walk.velocityY = 0;
          this.walk.grounded = true;
          this.walk.lastSafeFeet.copy(this.walk.feet);
          this.walk.hasSafeFeet = true;
          this.walk.lastFloorY = stepY;
        }
      }
    }
    this.walk.velocityY = Math.max(this.walk.velocityY - this.walk.gravity * delta, -this.walk.terminalVelocity);
    const floor = this.floorBelow(this.walk.feet, 0.35, 6);
    const floorY = floor?.point.y;
    const nextY = this.walk.feet.y + this.walk.velocityY * delta;
    if (floorY !== undefined && this.walk.velocityY <= 0 && floorY <= this.walk.feet.y + 0.08 && nextY <= floorY) {
      this.walk.feet.y = floorY;
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.walk.airborneSince = 0;
      this.walk.lastSafeFeet.copy(this.walk.feet);
      this.walk.hasSafeFeet = true;
      this.walk.lastFloorY = floorY;
    } else {
      this.walk.feet.y = nextY;
      this.walk.grounded = false;
      if (!this.walk.airborneSince) this.walk.airborneSince = performance.now();
    }
    // Rays remain useful for floor snapping and automatic 20 cm steps, but
    // the capsule is authoritative for solid collision. It resolves corners,
    // oblique movement and any residual intersection across the full body.
    const capsuleCorrection = this.resolvePlayerCapsule(this.walk.feet);
    if (capsuleCorrection?.y > 0.001 && this.walk.velocityY <= 0) {
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.walk.airborneSince = 0;
      this.walk.lastFloorY = this.walk.feet.y;
    }
    if (this.walk.grounded) {
      this.walk.lastSafeFeet.copy(this.walk.feet);
      this.walk.hasSafeFeet = true;
    }
    this.syncCameraToPlayer();
    if (this.walk.feet.y < this.walk.worldMinY) this.recoverWalk('queda fora do modelo');
    else if (this.walk.airborneSince && performance.now() - this.walk.airborneSince > 10000) this.recoverWalk('queda sem apoio');
  }

  updateWalk(delta) {
    if (this.walk.mode !== 'walk' || !this.walkControls?.isLocked) return;
    const rayStartedAt = performance.now();
    this.walk.accumulator = Math.min(this.walk.accumulator + Math.min(delta, 0.1), this.walk.fixedStep * 5);
    while (this.walk.accumulator >= this.walk.fixedStep) {
      this.stepWalk(this.walk.fixedStep);
      this.walk.accumulator -= this.walk.fixedStep;
    }
    this.reportWalkDebug(rayStartedAt);
  }

  animateWalk() {
    requestAnimationFrame(() => this.animateWalk());
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.walk.lastFrame) / 1000);
    this.walk.lastFrame = now;
    // Nothing to measure or move while the viewer is closed.
    if (this.world && !this.world.enabled) return;
    this.updateAdaptiveQuality(now);
    this.updateWalk(delta);
  }
}
