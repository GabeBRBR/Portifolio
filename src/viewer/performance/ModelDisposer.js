const disposeMaterialTextures = (material) => {
  Object.values(material).forEach((value) => {
    if (value?.isTexture) value.dispose();
  });
};

/** Owns the resource lifetime of one loaded IFC model. */
export class ModelDisposer {
  dispose(record, api) {
    const meshes = record.meshes || [];
    const meshCount = meshes.length;
    const geometries = new Set();
    const materials = new Set();

    meshes.forEach((mesh) => {
      mesh.removeFromParent();
      if (mesh.geometry) geometries.add(mesh.geometry);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean).forEach((material) => materials.add(material));
      mesh.userData = {};
    });

    geometries.forEach((geometry) => {
      geometry.disposeBoundsTree?.();
      geometry.dispose();
    });
    materials.forEach((material) => {
      disposeMaterialTextures(material);
      material.dispose();
    });

    record.group?.removeFromParent();
    record.meshes.length = 0;
    record.floors?.clear();
    record.group = null;
    if (Number.isInteger(record.modelID)) api?.CloseModel(record.modelID);
    record.modelID = null;

    return { meshes: meshCount, geometries: geometries.size, materials: materials.size };
  }
}
