import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateReleaseVersion(tag, appInfoVersion, html) {
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag || '');
  if (!match) throw new Error('A tag deve ser vX.Y.Z estável.');
  const version = match[1];
  const versions = Array.from(
    html.matchAll(/window\.__PALCO_APPV__\s*\|\|\s*(['"])(\d+\.\d+\.\d+)\1/g),
    item => item[2],
  );
  if (appInfoVersion !== version || !versions.length || versions.some(value => value !== version)) {
    throw new Error('Tag, appinfo e fallback de versão do HTML devem ser iguais.');
  }
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = JSON.parse(readFileSync('webos/appinfo.json', 'utf8'));
  const version = validateReleaseVersion(
    process.argv[2], info.version, readFileSync('webos/index.html', 'utf8'),
  );
  console.log(`tag/appinfo/HTML: ${version} OK`);
}
