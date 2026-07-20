// Node ESM loader: strips the browser ?v= cache-bust so real modules import unchanged.
export async function resolve(spec, ctx, next) {
  return next(spec.includes('?v=') ? spec.split('?v=')[0] : spec, ctx);
}
