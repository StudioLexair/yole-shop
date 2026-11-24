import { describe, expect, it } from 'vitest';
import {
  buildOfficialRedirectUrl,
  isAllowedEmbedOrigin,
  isAuthorizedHost,
  isBlockedMirrorHost,
} from './antiClone';

describe('antiClone Yole Shop', () => {
  it('autoriza los dominios oficiales, bloquea espejo pages.dev y clones externos', () => {
    expect(isAuthorizedHost('yoleshop.ddns.net')).toBe(true);
    expect(isAuthorizedHost('yole-shop.vercel.app')).toBe(true);
    expect(isAuthorizedHost('yole-shop-demo.vercel.app')).toBe(true);

    // Espejo yole-shop.pages.dev bloqueado y redirigido al dominio oficial
    expect(isBlockedMirrorHost('yole-shop.pages.dev')).toBe(true);
    expect(isBlockedMirrorHost('8d738268.yole-shop.pages.dev')).toBe(true);
    expect(isAuthorizedHost('yole-shop.pages.dev')).toBe(false);
    expect(isAuthorizedHost('abc123.yole-shop.pages.dev')).toBe(false);

    expect(
      buildOfficialRedirectUrl({ pathname: '/gestor', search: '?g=MARCELIS', hash: '' })
    ).toBe('https://yoleshop.ddns.net/gestor?g=MARCELIS');

    expect(isAuthorizedHost('clon-yoleshop.com')).toBe(false);
    expect(isAuthorizedHost('evil-site.vercel.app')).toBe(false);
    expect(isAuthorizedHost('localhost', false)).toBe(false);
    expect(isAuthorizedHost('localhost', true)).toBe(true);
  });

  it('permite incrustación segura únicamente desde Studio Lexair y dominios propios', () => {
    expect(isAllowedEmbedOrigin('https://studiolexair.ddns.net/portafolio')).toBe(true);
    expect(isAllowedEmbedOrigin('https://studiolexair.pages.dev/')).toBe(true);
    expect(isAllowedEmbedOrigin('https://studio-lexair.vercel.app/')).toBe(true);
    expect(isAllowedEmbedOrigin('https://yoleshop.ddns.net/')).toBe(true);

    expect(isAllowedEmbedOrigin('https://sitio-ajeno.com/')).toBe(false);
    expect(isAllowedEmbedOrigin('http://studiolexair.ddns.net/')).toBe(false);
  });
});
