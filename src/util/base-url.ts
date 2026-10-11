/**
 * Directory the pdflip script was loaded from. The pdf.js files are looked up relative
 * to it (`<base>/pdfjs/…`), so the package works from any path without configuration.
 */
let baseUrl: string | undefined;

export function setBaseUrl(url: string): void {
  baseUrl = url.endsWith('/') ? url : `${url}/`;
}

export function getBaseUrl(): string {
  if (baseUrl) {
    return baseUrl;
  }
  const script = document.querySelector<HTMLScriptElement>('script[src*="pdflip"]');
  if (script?.src) {
    setBaseUrl(new URL('.', script.src).href);
    return baseUrl!;
  }
  return new URL('./', document.baseURI).href;
}

export function resolveAsset(path: string): string {
  return new URL(path, getBaseUrl()).href;
}
