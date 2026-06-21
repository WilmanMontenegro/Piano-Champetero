/** URL and path helpers for sampler files (flat or nested under samplers/). */

/**
 * @param {string} relativePath path under samplers/ (may include subfolders)
 * @returns {string}
 */
export function samplerUrl(relativePath) {
  if (!relativePath) return '';
  return (
    'samplers/' +
    relativePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/')
  );
}

/** @param {string} path */
export function samplerBasename(path) {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * @param {string} stored
 * @param {Map<string, string>} byFullPath lower path -> path
 * @param {Map<string, string[]>} byBasename lower basename -> paths
 */
export function resolveSamplerPath(stored, byFullPath, byBasename) {
  if (!stored) return '';
  const key = stored.replace(/\\/g, '/');
  const lower = key.toLowerCase();
  if (byFullPath.has(lower)) return byFullPath.get(lower);

  const base = samplerBasename(key).toLowerCase();
  const matches = byBasename.get(base);
  if (!matches?.length) return key;
  if (matches.length === 1) return matches[0];
  const exact = matches.find((p) => p.toLowerCase() === lower);
  return exact || matches[0];
}
