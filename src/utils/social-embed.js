const HOSTS = {
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch']),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  youtube: new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']),
  x: new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']),
};

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function youtubeId(url) {
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (url.pathname === '/watch') return url.searchParams.get('v') || '';
  const match = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  return match?.[1] || '';
}

export function resolveSocialEmbed(value) {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const canonicalUrl = url.toString();

  if (HOSTS.facebook.has(url.hostname)) {
    const isVideo = url.hostname.endsWith('fb.watch') || /\/(?:videos|reel|watch)\b/i.test(url.pathname);
    const plugin = isVideo ? 'video.php' : 'post.php';
    const params = new URLSearchParams({ href: canonicalUrl, width: '700', show_text: isVideo ? 'false' : 'true' });
    return {
      platform: 'facebook',
      label: 'Facebook',
      originalUrl: canonicalUrl,
      embedUrl: `https://www.facebook.com/plugins/${plugin}?${params}`,
      layout: isVideo ? 'video' : 'post',
    };
  }

  if (HOSTS.instagram.has(url.hostname)) {
    const match = /^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (!match) return null;
    const [, kind, id] = match;
    return {
      platform: 'instagram',
      label: 'Instagram',
      originalUrl: `https://www.instagram.com/${kind}/${id}/`,
      embedUrl: `https://www.instagram.com/${kind}/${id}/embed/captioned/`,
      layout: 'portrait',
    };
  }

  if (HOSTS.youtube.has(url.hostname)) {
    const id = youtubeId(url);
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return {
      platform: 'youtube',
      label: 'YouTube',
      originalUrl: canonicalUrl,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      layout: 'video',
    };
  }

  if (HOSTS.tiktok.has(url.hostname)) {
    const id = /\/video\/(\d{8,30})/.exec(url.pathname)?.[1];
    if (!id) return null;
    return {
      platform: 'tiktok',
      label: 'TikTok',
      originalUrl: canonicalUrl,
      embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=0&description=1&music_info=1`,
      layout: 'portrait',
    };
  }

  if (HOSTS.x.has(url.hostname)) {
    const id = /\/status\/(\d{5,30})/.exec(url.pathname)?.[1];
    if (!id) return null;
    return {
      platform: 'x',
      label: 'X',
      originalUrl: canonicalUrl,
      embedUrl: '',
      postId: id,
      layout: 'post',
    };
  }

  return null;
}

export const supportedSocialHosts = Object.freeze(['Facebook', 'Instagram', 'YouTube', 'TikTok', 'X']);
