import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSocialEmbed, supportedSocialHosts } from '../src/utils/social-embed.js';

test('SocialEmbed acepta sólo publicaciones de plataformas conocidas', () => {
  const cases = [
    ['https://www.facebook.com/usuario/videos/123456789/', 'facebook', 'video.php'],
    ['https://www.instagram.com/reel/AbC_123/', 'instagram', '/reel/AbC_123/embed/'],
    ['https://youtu.be/M7lc1UVf-VE', 'youtube', 'youtube-nocookie.com/embed/M7lc1UVf-VE'],
    ['https://www.tiktok.com/@cuenta/video/6718335390845095173', 'tiktok', '/player/v1/6718335390845095173'],
    ['https://x.com/cuenta/status/1234567890123456789', 'x', ''],
  ];
  for (const [url, platform, embedFragment] of cases) {
    const result = resolveSocialEmbed(url);
    assert.equal(result.platform, platform);
    assert.ok(result.embedUrl.includes(embedFragment));
  }
  assert.equal(supportedSocialHosts.length, 5);
  assert.equal(resolveSocialEmbed('javascript:alert(1)'), null);
  assert.equal(resolveSocialEmbed('https://example.com/video/123'), null);
  assert.equal(resolveSocialEmbed('https://www.instagram.com/explore/'), null);
});
