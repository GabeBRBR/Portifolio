/**
 * Pure polygon helpers for the walking collider. A triangle is cut by the IFC
 * door and window openings it crosses, so the wall keeps its real aperture.
 * No Three.js import here: the functions only need vectors with x/y/z,
 * clone() and lerp(), which keeps them testable in Node.
 */

export function subtractDoorPortals(triangle, portals) {
  let polygons = [triangle];
  for (const portal of portals) {
    polygons = polygons.flatMap((polygon) => subtractBoxFromPolygon(polygon, portal));
    if (!polygons.length) break;
  }
  return polygons;
}

export function subtractBoxFromPolygon(polygon, box) {
  let remainder = polygon;
  const outside = [];
  const planes = [
    ['x', box.min.x, true], ['x', box.max.x, false],
    ['y', box.min.y, true], ['y', box.max.y, false],
    ['z', box.min.z, true], ['z', box.max.z, false]
  ];
  for (const [axis, value, keepGreater] of planes) {
    if (remainder.length < 3) break;
    const inside = clipPolygonToHalfSpace(remainder, axis, value, keepGreater);
    const rejected = clipPolygonToHalfSpace(remainder, axis, value, !keepGreater);
    if (rejected.length >= 3) outside.push(rejected);
    remainder = inside;
  }
  // `remainder` is inside every plane, therefore inside the portal and is
  // intentionally discarded. Everything in `outside` keeps the source
  // face's exact curvature and only loses the aperture itself.
  return outside;
}

export function clipPolygonToHalfSpace(polygon, axis, value, keepGreater) {
  const result = [];
  const epsilon = 1e-7;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = current[axis] - value;
    const nextDistance = next[axis] - value;
    const currentInside = keepGreater ? currentDistance >= -epsilon : currentDistance <= epsilon;
    const nextInside = keepGreater ? nextDistance >= -epsilon : nextDistance <= epsilon;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const fraction = currentDistance / (currentDistance - nextDistance);
      result.push(current.clone().lerp(next, fraction));
    }
  }
  return result;
}
