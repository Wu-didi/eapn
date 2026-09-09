'use strict';
(() => {
  const data = window.REAL_ROBOT_DEMO;
  const section = document.getElementById('real-robot-case');
  if (!data || !section) return;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clips = data.clips;
  const lastTimes = clips.map(c => (c.frames - 1) / c.fps);
  const endTime = Math.max(...lastTimes);
  const masterIndex = lastTimes.indexOf(endTime);
  const step = 1 / Math.max(...clips.map(c => c.fps));
  const methodLabel = c => c.method === 'ours' ? 'Ours · Our method' : 'Baseline · Comparison baseline';
  section.innerHTML = `<div class="case-heading"><div><h3>R1 · Bimanual cloth folding</h3><small>AGILEX-PIPER · full original videos · 30 fps</small></div><span class="real-badge">REAL ROBOT</span></div>
    <div class="clips">${clips.map(c => `<div class="clip"><div class="clip-head"><b class="real-${c.method}">${methodLabel(c)}</b><span>Collection ${c.collection_id}</span></div><div class="video-wrap"><video muted playsinline preload="metadata" poster="${escape(c.poster)}" src="${escape(c.src)}" aria-label="Real-robot ${methodLabel(c)}"></video></div><div class="video-foot"><span class="real-clip-time">0.00 s</span><span>Duration ${c.duration_s.toFixed(2)} s</span></div></div>`).join('')}</div>
    <div class="controls"><div class="buttons"><button class="play" type="button">Play both</button><button class="reset" type="button">Restart</button><button class="prev" type="button">−1 frame</button><button class="next" type="button">+1 frame</button><select class="real-rate" aria-label="Real-robot video playback speed"><option value="1">1× · Original</option><option value="0.5">0.5× · Slow</option><option value="0.25">0.25× · Inspect</option></select><span class="step-readout" aria-live="off"></span></div><div class="timeline"><span>0 s</span><input class="real-timeline" type="range" min="0" max="${endTime}" value="0" step="${step}" aria-label="Shared real-robot video time in seconds"><span>${endTime.toFixed(1)} s</span></div><div class="error" role="status"></div></div>
    <p class="case-note">Both recordings start together and follow the same elapsed video time. They are not aligned by action stage, cropped, stretched or duration-normalized. After the shorter left recording ends, its final frame is held while the right recording continues.</p>
    <div class="real-downloads">${clips.map(c => `<div><b class="real-${c.method}">${methodLabel(c)}</b><a href="${escape(c.src)}" download>Original video</a><a href="${escape(c.csv)}" download>Joint CSV · ${c.joints.rows} frames</a></div>`).join('')}</div>
    <details><summary>Joint data, URDF and comparison scope</summary><p>Each CSV contains time plus seven state and action channels for each arm and was checked row by row against its JSON annotation. TCP uses six measured revolute-joint state channels per arm and the original inference URDF forward kinematics to reconstruct the symmetric gripper center. Action commands are not used and trajectories are not smoothed. All ${clips[0].frames + clips[1].frames} bimanual positions were cross-checked against the original inference implementation.</p><p>Joint timestamps contain gaps; their maximum difference from the fixed 30 fps video grid is ${clips[0].joints.max_timestamp_vs_video_grid_difference_s.toFixed(3)} / ${clips[1].joints.max_timestamp_vs_video_grid_difference_s.toFixed(3)} seconds. The page links data to video by exported frame_index and computes speed from the original t_sec. Hardware synchronization and camera/robot extrinsics have not been independently verified. No physical-jerk improvement is calculated or claimed here.</p><p>The good / bad method identity follows the provider annotation. Platform task IDs are ${clips[0].platform_task_id} / ${clips[1].platform_task_id}, and the camera viewpoints differ. Checkpoint, delay and matched initial-state information were not supplied. This is a selected qualitative comparison; video duration does not represent aggregate success.</p><p><a href="real_robot_manifest.json">File checks and data manifest</a> · <a href="real_robot/robot.urdf" download>URDF model</a> · <a href="real_robot/tcp_mapping.json">Joint mapping and TCP definition</a> · <a href="real_robot_tcp_verification.json">Framewise verification</a></p></details>`;
  const videos = [...section.querySelectorAll('video')];
  const master = videos[masterIndex];
  const slider = section.querySelector('.real-timeline');
  const rate = section.querySelector('.real-rate');
  const playButton = section.querySelector('.play');
  const errorBox = section.querySelector('.error');
  const tcpViewer = window.createRealTCPViewer?.(section, window.REAL_ROBOT_TCP);
  let time = 0, playing = false, starting = false, request = 0, generation = 0;
  const clamp = t => Math.max(0, Math.min(endTime, t));
  const frameTime = (t, i) => (Math.min(clips[i].frames - 1, Math.floor((t + 1e-7) * clips[i].fps)) + .1) / clips[i].fps;
  function display() {
    slider.value = time;
    section.dataset.time = time.toFixed(6);
    section.querySelector('.step-readout').textContent = `${time.toFixed(2)} / ${endTime.toFixed(2)} s`;
    section.querySelectorAll('.real-clip-time').forEach((el, i) => {
      el.textContent = `${Math.min(time, lastTimes[i]).toFixed(2)} s${time >= lastTimes[i] - 1e-7 ? ' · END FRAME HELD' : ''}`;
    });
    tcpViewer?.draw(time);
  }
  function pause() {
    generation++; playing = false; starting = false;
    videos.forEach(v => v.pause()); cancelAnimationFrame(request);
    playButton.textContent = 'Play both';
  }
  function seek(t) {
    time = clamp(t);
    videos.forEach((v, i) => { if (v.readyState > 0) v.currentTime = frameTime(time, i); });
    display();
  }
  function ready(v) {
    if (v.readyState >= 2) return Promise.resolve();
    if (v.error) return Promise.reject(Error('Video failed to load; use the original-file download'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); v.removeEventListener('loadeddata', loaded); v.removeEventListener('error', failed); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(Error('Video failed to load')); };
      const timer = setTimeout(() => { cleanup(); reject(Error('Video loading timed out; please retry')); }, 15000);
      v.addEventListener('loadeddata', loaded); v.addEventListener('error', failed);
      v.preload = 'auto'; v.load();
    });
  }
  function tick() {
    if (!playing) return;
    time = clamp(Math.floor((master.currentTime + 1e-7) / step) * step);
    videos.forEach((v, i) => {
      if (time >= lastTimes[i] - 1e-7) {
        v.pause();
        // Chromium may report duration (EOF) after decoding the last frame.
        // Both that endpoint and the last frame interval are valid held states.
        if (v.currentTime < lastTimes[i] - 1e-6) v.currentTime = frameTime(time, i);
      } else if (i !== masterIndex && Math.abs(v.currentTime - master.currentTime) > 1.5 / clips[i].fps) {
        v.currentTime = frameTime(time, i);
      }
    });
    display();
    if (time >= endTime - 1e-7 || master.ended) { pause(); return; }
    request = requestAnimationFrame(tick);
  }
  async function start() {
    document.dispatchEvent(new Event('demo:pause-all'));
    const ticket = generation;
    starting = true; playButton.textContent = 'Loading…'; errorBox.textContent = '';
    try {
      await Promise.all(videos.map(ready));
      if (ticket !== generation) return;
      seek(time >= endTime - 1e-7 ? 0 : time);
      videos.forEach(v => { v.playbackRate = Number(rate.value); });
      await Promise.all(videos.map((v, i) => time < lastTimes[i] - 1e-7 ? v.play() : Promise.resolve()));
      if (ticket !== generation) return;
      starting = false; playing = true; playButton.textContent = 'Pause';
      request = requestAnimationFrame(tick);
    } catch (error) {
      if (ticket !== generation) return;
      pause(); errorBox.textContent = `Unable to play: ${error.message}`;
    }
  }
  playButton.addEventListener('click', () => playing || starting ? pause() : start());
  section.querySelector('.reset').addEventListener('click', () => { pause(); seek(0); });
  section.querySelector('.prev').addEventListener('click', () => { pause(); seek(time - step); });
  section.querySelector('.next').addEventListener('click', () => { pause(); seek(time + step); });
  slider.addEventListener('input', () => { pause(); seek(Number(slider.value)); });
  rate.addEventListener('change', () => { videos.forEach(v => { v.playbackRate = Number(rate.value); }); });
  videos.forEach((v, i) => {
    v.addEventListener('loadedmetadata', () => { v.currentTime = frameTime(time, i); v.playbackRate = Number(rate.value); });
    v.addEventListener('error', () => { pause(); errorBox.textContent = `Video failed to load: ${clips[i].src}`; });
  });
  document.addEventListener('demo:pause-all', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  display();
})();
