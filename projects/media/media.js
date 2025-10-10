// ----- Config -----
const PRIMARY_VIDEO_ID = (typeof YT_VIDEO_ID !== 'undefined' && YT_VIDEO_ID) ? YT_VIDEO_ID : 'vrOQDW6yTFI';
// Use this to sanity-check your device/network if the primary fails to render:
const TEST_VIDEO_ID = 'M7lc1UVf-VE'; // Official YouTube IFrame API demo video (always embeddable)

let ytPlayer;
let videoEnded = false;

// Build controls (Play / Pause / Replay) and hint
(function addControls(){
  const controls = document.createElement('section');
  controls.className = 'controls';
  controls.innerHTML = `
    <button id="playBoth" class="btn">▶︎ Play Both</button>
    <button id="pauseBoth" class="btn btn-ghost">⏸ Pause Both</button>
    <button id="replayVideo" class="btn btn-ghost" disabled>↺ Replay Video</button>
    <span id="hint" class="hint" hidden>If Spotify doesn’t start, tap the Spotify player once (autoplay policy).</span>
  `;
  document.body.insertBefore(controls, document.querySelector('.media-layout'));
})();

// Add overlay wrapper + fallback area
(function prepareVideoPane(){
  const pane = document.querySelector('.video-section');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div id="ytPlayer" style="width:100%;height:100%"></div>
    <div id="endedOverlay" class="end-overlay" hidden>
      <div class="end-overlay-inner">
        <p class="hint">Video ended — Spotify continues below.</p>
        <button id="overlayReplay" class="btn">Replay Video</button>
      </div>
    </div>
    <div id="fallbackOverlay" class="end-overlay" hidden>
      <div class="end-overlay-inner" id="fallbackInner"></div>
    </div>
  `;
  pane.replaceChildren(wrap);
})();

// Initialize YouTube player
window.onYouTubeIframeAPIReady = function () {
  createPlayer(PRIMARY_VIDEO_ID);
};

function createPlayer(videoId) {
  ytPlayer = new YT.Player('ytPlayer', {
    videoId,
    playerVars: { rel:0, modestbranding:1, playsinline:1, origin: window.location.origin },
    events: {
      onReady: () => {
        document.getElementById('playBoth').disabled = false;
        document.getElementById('replayVideo').disabled = false;
      },
      onStateChange: (e) => {
        const endedOverlay = document.getElementById('endedOverlay');
        if (e.data === YT.PlayerState.ENDED) {
          videoEnded = true;
          endedOverlay.hidden = false;
        } else if (e.data === YT.PlayerState.PLAYING) {
          videoEnded = false;
          endedOverlay.hidden = true;
        }
      },
      onError: (e) => {
        // 2 = invalid param; 5 = not supported; 101/150 = embedding not allowed by owner
        showYTBackupUI(videoId, e?.data);
      }
    }
  });
}

// Fallback UI for non-embeddable / blocked videos
function showYTBackupUI(videoId, code) {
  try { ytPlayer && ytPlayer.destroy && ytPlayer.destroy(); } catch {}
  const fb = document.getElementById('fallbackOverlay');
  const inner = document.getElementById('fallbackInner');
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  inner.innerHTML = `
    <p class="hint" style="margin:0 0 6px 0;">This video can’t be embedded (error ${code || '—'}). You can still watch it on YouTube.</p>
    <img src="${thumb}" alt="Video thumbnail" style="max-width:70%;border-radius:8px;border:1px solid rgba(255,255,255,.2);margin:8px auto;">
    <div>
      <a class="btn" href="${watchUrl}" target="_blank" rel="noopener">▶︎ Watch on YouTube</a>
      <button id="tryTestVideo" class="btn btn-ghost" style="margin-left:8px;">Try test video</button>
    </div>
  `;
  fb.hidden = false;

  // Allow quick sanity-check of the environment with YouTube's demo video
  document.getElementById('tryTestVideo').addEventListener('click', () => {
    fb.hidden = true;
    createPlayer(TEST_VIDEO_ID);
  });
}

// Controls
document.addEventListener('click', (e) => {
  const id = e.target.id;
  if (id === 'playBoth') {
    try { ytPlayer && ytPlayer.playVideo(); } catch {}
    // Nudge Spotify: best-effort postMessage (may still need user tap)
    const spotify = document.querySelector('.audio-section iframe');
    try { spotify.contentWindow.postMessage({ type: 'play' }, '*'); } catch {}
    const hint = document.getElementById('hint');
    hint.hidden = false;
    setTimeout(() => hint.hidden = true, 4000);
  }
  if (id === 'pauseBoth') {
    try { ytPlayer && ytPlayer.pauseVideo(); } catch {}
    // Spotify usually needs user pause inside its own player
  }
  if (id === 'replayVideo' || id === 'overlayReplay') {
    try { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); } catch {}
    const endedOverlay = document.getElementById('endedOverlay');
    endedOverlay.hidden = true;
  }
});

// Media Session API (nice-to-have)
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Media Page',
    artist: 'lloki',
    album: 'Synchronized'
  });
  navigator.mediaSession.setActionHandler('play', () => document.getElementById('playBoth').click());
  navigator.mediaSession.setActionHandler('pause', () => document.getElementById('pauseBoth').click());
}


