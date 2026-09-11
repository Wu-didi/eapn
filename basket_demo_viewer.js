'use strict';
(() => {
  const root = document.getElementById('basket-real-robot-cases');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const trials = [1, 3].map(number => ({
    number,
    clips: [
      {
        method: 'ours',
        label: 'EAPN · Ours',
        src: `assets/basket-demo/trial-${number}-eapn.mp4`,
        poster: `assets/basket-demo/trial-${number}-eapn.png`,
      },
      {
        method: 'baseline',
        label: 'π0.5 · Baseline',
        src: `assets/basket-demo/trial-${number}-baseline.mp4`,
        poster: `assets/basket-demo/trial-${number}-baseline.png`,
      },
    ],
  }));

  const escape = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));

  root.innerHTML = trials.map(trial => `
    <article class="real-case basket-trial" id="basket-trial-${trial.number}">
      <div class="case-heading">
        <div><h3>R2.${trial.number} · Object storage · Trial ${String(trial.number).padStart(2, '0')}</h3><small>AGILEX-PIPER · top-head camera · full original videos · 10 fps</small></div>
        <span class="real-badge">REAL ROBOT</span>
      </div>
      <div class="clips">${trial.clips.map(clip => `
        <div class="clip">
          <div class="clip-head"><b class="real-${clip.method}">${escape(clip.label)}</b><span class="basket-outcome">SUCCESS</span></div>
          <div class="video-wrap"><video muted playsinline preload="metadata" poster="${escape(clip.poster)}" src="${escape(clip.src)}" aria-label="Object-storage Trial ${trial.number}, ${escape(clip.label)}"></video></div>
          <div class="video-foot"><span class="real-clip-time">0.00 s</span><span class="basket-duration">Loading metadata…</span></div>
        </div>`).join('')}</div>
      <div class="controls">
        <div class="buttons">
          <button class="play" type="button">Play both</button>
          <button class="reset" type="button">Restart</button>
          <button class="prev" type="button">−1 frame</button>
          <button class="next" type="button">+1 frame</button>
          <select class="real-rate" aria-label="Trial ${trial.number} video playback speed"><option value="1">1× · Original</option><option value="0.5">0.5× · Slow</option><option value="0.25">0.25× · Inspect</option></select>
          <span class="step-readout" aria-live="off">0.00 / 0.00 s</span>
        </div>
        <div class="timeline"><span>0 s</span><input class="real-timeline" type="range" min="0" max="0" value="0" step="0.1" aria-label="Trial ${trial.number} shared video time in seconds"><span class="basket-end-time">0.0 s</span></div>
        <div class="error" role="status"></div>
      </div>
      <div class="real-downloads">${trial.clips.map(clip => `<div><b class="real-${clip.method}">${escape(clip.label)}</b><a href="${escape(clip.src)}" download>Original video</a></div>`).join('')}</div>
    </article>`).join('');

  root.querySelectorAll('.basket-trial').forEach(section => {
    const fps = 10;
    const step = 1 / fps;
    const videos = [...section.querySelectorAll('video')];
    const slider = section.querySelector('.real-timeline');
    const rate = section.querySelector('.real-rate');
    const playButton = section.querySelector('.play');
    const errorBox = section.querySelector('.error');
    let lastTimes = videos.map(() => 0);
    let endTime = 0;
    let time = 0;
    let playing = false;
    let starting = false;
    let request = 0;
    let generation = 0;

    const clamp = value => Math.max(0, Math.min(endTime, value));
    const frameCount = index => Math.max(1, Math.round((videos[index].duration || step) * fps));
    const frameTime = (value, index) => {
      const frame = Math.min(frameCount(index) - 1, Math.floor((value + 1e-7) * fps));
      return Math.min(videos[index].duration || Infinity, (frame + 0.1) / fps);
    };
    const masterIndex = () => lastTimes.indexOf(Math.max(...lastTimes));

    function refreshMetadata() {
      lastTimes = videos.map(video => Number.isFinite(video.duration) ? Math.max(0, video.duration - step) : 0);
      endTime = Math.max(...lastTimes);
      slider.max = String(endTime);
      section.querySelector('.basket-end-time').textContent = `${endTime.toFixed(1)} s`;
      section.querySelectorAll('.basket-duration').forEach((element, index) => {
        const duration = videos[index].duration;
        element.textContent = Number.isFinite(duration) ? `Duration ${duration.toFixed(2)} s` : 'Metadata unavailable';
      });
    }

    function display() {
      slider.value = String(time);
      section.dataset.time = time.toFixed(6);
      section.querySelector('.step-readout').textContent = `${time.toFixed(2)} / ${endTime.toFixed(2)} s`;
      section.querySelectorAll('.real-clip-time').forEach((element, index) => {
        element.textContent = `${Math.min(time, lastTimes[index]).toFixed(2)} s${endTime > 0 && time >= lastTimes[index] - 1e-7 ? ' · END FRAME HELD' : ''}`;
      });
    }

    function pause() {
      generation += 1;
      playing = false;
      starting = false;
      videos.forEach(video => video.pause());
      cancelAnimationFrame(request);
      playButton.textContent = 'Play both';
    }

    function seek(value) {
      time = clamp(value);
      videos.forEach((video, index) => {
        if (video.readyState > 0) video.currentTime = frameTime(time, index);
      });
      display();
    }

    function ready(video) {
      if (video.readyState >= 2) return Promise.resolve();
      if (video.error) return Promise.reject(Error('Video failed to load; use the original-file download'));
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener('loadeddata', loaded);
          video.removeEventListener('error', failed);
        };
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(Error('Video failed to load')); };
        const timer = setTimeout(() => { cleanup(); reject(Error('Video loading timed out; please retry')); }, 15000);
        video.addEventListener('loadeddata', loaded);
        video.addEventListener('error', failed);
        video.preload = 'auto';
        video.load();
      });
    }

    function tick() {
      if (!playing) return;
      const master = videos[masterIndex()];
      time = clamp(Math.floor((master.currentTime + 1e-7) / step) * step);
      videos.forEach((video, index) => {
        if (time >= lastTimes[index] - 1e-7) {
          video.pause();
          if (video.currentTime < lastTimes[index] - 1e-6) video.currentTime = frameTime(time, index);
        } else if (index !== masterIndex() && Math.abs(video.currentTime - master.currentTime) > 1.5 / fps) {
          video.currentTime = frameTime(time, index);
        }
      });
      display();
      if (time >= endTime - 1e-7 || master.ended) { pause(); return; }
      request = requestAnimationFrame(tick);
    }

    async function start() {
      document.dispatchEvent(new Event('demo:pause-all'));
      const ticket = generation;
      starting = true;
      playButton.textContent = 'Loading…';
      errorBox.textContent = '';
      try {
        await Promise.all(videos.map(ready));
        refreshMetadata();
        if (ticket !== generation) return;
        seek(time >= endTime - 1e-7 ? 0 : time);
        videos.forEach(video => { video.playbackRate = Number(rate.value); });
        await Promise.all(videos.map((video, index) => time < lastTimes[index] - 1e-7 ? video.play() : Promise.resolve()));
        if (ticket !== generation) return;
        starting = false;
        playing = true;
        playButton.textContent = 'Pause';
        request = requestAnimationFrame(tick);
      } catch (error) {
        if (ticket !== generation) return;
        pause();
        errorBox.textContent = `Unable to play: ${error.message}`;
      }
    }

    playButton.addEventListener('click', () => playing || starting ? pause() : start());
    section.querySelector('.reset').addEventListener('click', () => { pause(); seek(0); });
    section.querySelector('.prev').addEventListener('click', () => { pause(); seek(time - step); });
    section.querySelector('.next').addEventListener('click', () => { pause(); seek(time + step); });
    slider.addEventListener('input', () => { pause(); seek(Number(slider.value)); });
    rate.addEventListener('change', () => { videos.forEach(video => { video.playbackRate = Number(rate.value); }); });
    videos.forEach((video, index) => {
      video.addEventListener('loadedmetadata', () => {
        refreshMetadata();
        video.currentTime = frameTime(time, index);
        video.playbackRate = Number(rate.value);
        display();
      });
      video.addEventListener('error', () => {
        pause();
        errorBox.textContent = `Video failed to load: ${trials[Number(section.id.split('-').at(-1)) - 1].clips[index].src}`;
      });
    });
    document.addEventListener('demo:pause-all', pause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    display();
  });
})();
