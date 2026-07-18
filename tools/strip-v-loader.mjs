// Node resolve hook: strips the browser cache-bust '?v=...' from import specifiers so the
// game's ES modules load as ONE instance under node (mirrors the browser, where every
// importer uses the same ?v). Used by tools/validate_data.mjs.
export async function resolve(specifier, context, nextResolve) {
  const clean = specifier.replace(/\?v=[0-9]+/, '');
  return nextResolve(clean, context);
}
