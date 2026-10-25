/*!
 * Virtual tour embed loader.
 *
 * Usage on any website (the embed key is created in the admin portal: Tour > Embed):
 *   <div data-nimto-embed="vt_YOUR_EMBED_KEY"></div>
 *   <script src="https://YOUR-DOMAIN/embed.js" async></script>
 *
 * The key only works while it is active, for a published tour, and (if the owner set any)
 * on the allowed domains.
 *
 * Optional attributes on the div:
 *   data-height="600px"        fixed height (default: responsive 16:9)
 *   data-aspect-ratio="4/3"    responsive ratio when no height is given
 *   data-rounded="false"       square corners (default: 12px radius)
 */
(function () {
  'use strict';

  var script = document.currentScript;
  // The tour is served from the same origin as this script
  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;

  function mount(el) {
    if (el.getAttribute('data-nimto-mounted') === 'true') return;
    var key = (el.getAttribute('data-nimto-embed') || '').trim();
    if (!/^vt_[A-Za-z0-9_-]{20,64}$/.test(key)) {
      console.warn('[virtual-tour] Missing or invalid data-nimto-embed key. Create one in the admin portal (Tour > Embed).', el);
      return;
    }
    el.setAttribute('data-nimto-mounted', 'true');

    var height = el.getAttribute('data-height');
    var ratio = el.getAttribute('data-aspect-ratio') || '16/9';
    var rounded = el.getAttribute('data-rounded') !== 'false';

    var wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.overflow = 'hidden';
    wrapper.style.background = '#000';
    wrapper.style.borderRadius = rounded ? '12px' : '0';
    if (height) {
      wrapper.style.height = height;
    } else {
      wrapper.style.aspectRatio = ratio;
    }

    var iframe = document.createElement('iframe');
    iframe.src = origin + '/embed/' + encodeURIComponent(key);
    iframe.title = el.getAttribute('data-title') || 'Virtual tour';
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'fullscreen; autoplay; accelerometer; gyroscope; xr-spatial-tracking');
    iframe.style.position = 'absolute';
    iframe.style.inset = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';

    wrapper.appendChild(iframe);
    el.innerHTML = '';
    el.appendChild(wrapper);
  }

  function mountAll() {
    var nodes = document.querySelectorAll('[data-nimto-embed]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }

  // Expose for sites that add the div later (single-page apps)
  window.NimtoTour = { mount: mountAll };
})();
