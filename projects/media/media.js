// Config
const YT_VIDEO_ID = typeof YT_VIDEO_ID !== 'undefined' ? YT_VIDEO_ID : 'vrOQDW6yTFI';

let ytPlayer;
let videoEnded = false;

// Inject controls (play both / pause both / replay)
(function addControls(){
  const controls = document.createElement('section');
  controls.className = 'controls';
  controls.innerHTML = `
    <button id="playBoth" class="btn">▶︎ Play Both</button>
    <button id="pauseBoth" class="btn btn-ghost">⏸ Pause Both</button>
    <button id="replayVideo" class="btn btn-ghost" disabled>↺ Replay Video</button>
    <span id="hint" class="hint" hidden>If Spotify doesn’t start, tap inside the Spotify player once to enable audio.</span>
  `;
  document.body.insertBefore(controls, document.querySelector('.media-layout'));
})();

// Build YouTube container with end overlay
(function addOverlay(){
  const video = document.querySelector('.video-section');
  const wrapper = document.createElement('div');
  wrapper.className = 'overlay';
  wrapper.innerHTML = `
    <div id="player"></div>
    <div id="endedOverlay" class="end-overlay" hidden>
      <div class="end-overlay-inner">
        <p class="hint">Video ended — Spotify continues below.</p>
        <button id="overlayReplay" class="btn">Replay Video</button>
      </div>
    </div>
  `;
  video.replaceChildren(wrapper);
})();

// YouTube IFrame API hook
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('player', {
    videoId: YT_VIDEO_ID,
    playerVars: { rel:0, modestbranding:1, playsinline:1, origin: window.location.origin },
    events: {
      onReady: () => {
        document.getElementById('playBoth').disabled = false;
        document.getElementById('replayVideo').disabled = false;
      },
      onStateChange: (e) => {
        const overlay = document.getElementById('endedOverlay');
        if (e.data === YT.PlayerState.ENDED) {
          videoEnded = true;
          overlay.hidden = false;
        } else if (e.data === YT.PlayerState.PLAYING) {
          videoEnded = false;
          overlay.hidden = true;
        }
      }
    }
  });
};

// Controls
document.getElementById('playBoth').addEventListener('click', () => {
  try { ytPlayer && ytPlayer.playVideo(); } catch {}
  // Nudge Spotify: best-effort (embed postMessage is limited)
  const spotify = document.querySelector('.audio-section iframe');
  try { spotify.contentWindow.postMessage({ type: 'play' }, '*'); } catch {}
  // Show hint the first time in case autoplay policy blocks it
  const hint = document.getElementById('hint');
  hint.hidden = false;
  setTimeout(() => hint.hidden = true, 4500);
});

document.getElementById('pauseBoth').addEventListener('click', () => {
  try { ytPlayer && ytPlayer.pauseVideo(); } catch {}
  // Spotify embed usually needs user pause inside the frame.
});

document.getElementById('replayVideo').addEventListener('click', () => {
  try { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); } catch {}
  document.getElementById('endedOverlay').hidden = true;
});

document.getElementById('overlayReplay').addEventListener('click', () => {
  document.getElementById('replayVideo').click();
});

// Media Session API (nice-to-have)
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Media Page',
    artist: 'lloki',
    album: 'Synchronized'
  });
  navigator.mediaSession.setActionHandler('play', () => {
    document.getElementById('playBoth').click();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    document.getElementById('pauseBoth').click();
  });
}
