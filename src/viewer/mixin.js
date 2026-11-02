/**
 * Copies the methods of a helper class onto another class prototype. It lets a
 * large class such as ViewerEngine keep its public surface while its methods
 * live in focused modules (walk, collision, exploded view, section box).
 */
export function mixin(target, source) {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor') continue;
    Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name));
  }
}
