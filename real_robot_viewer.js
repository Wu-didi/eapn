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
  section.innerHTML = `<div class="case-heading"><div><h3>R1 · 双臂叠衣</h3><small>AGILEX-PIPER · 原始完整视频 · 30 fps</small></div><span class="real-badge">REAL ROBOT</span></div>
    <div class="clips">${clips.map(c => `<div class="clip"><div class="clip-head"><b class="real-${c.method}">${c.method === 'ours' ? 'Ours · 我们的方法' : 'Baseline · 对比基线'}</b><span>记录 ${c.collection_id}</span></div><div class="video-wrap"><video muted playsinline preload="metadata" poster="${escape(c.poster)}" src="${escape(c.src)}" aria-label="真机 ${escape(c.label)}"></video></div><div class="video-foot"><span class="real-clip-time">0.00 s</span><span>视频时长 ${c.duration_s.toFixed(2)} s</span></div></div>`).join('')}</div>
    <div class="controls"><div class="buttons"><button class="play" type="button">同步播放</button><button class="reset" type="button">从头</button><button class="prev" type="button">−1 帧</button><button class="next" type="button">+1 帧</button><select class="real-rate" aria-label="真机视频播放速度"><option value="1">1× · 原速</option><option value="0.5">0.5× · 慢放</option><option value="0.25">0.25× · 细看</option></select><span class="step-readout" aria-live="off"></span></div><div class="timeline"><span>0 s</span><input class="real-timeline" type="range" min="0" max="${endTime}" value="0" step="${step}" aria-label="真机共同视频时间（秒）"><span>${endTime.toFixed(1)} s</span></div><div class="error" role="status"></div></div>
    <p class="case-note">从各自视频起点按相同经过时间播放，不按动作阶段对齐、不裁剪、不拉伸。左侧结束后保持末帧，右侧继续；可慢放观察双臂展开、放下和折叠时的动作衔接。</p>
    <div class="real-downloads">${clips.map(c => `<div><b class="real-${c.method}">${escape(c.label)}</b><a href="${escape(c.src)}" download>下载原始视频</a><a href="${escape(c.csv)}" download>关节 CSV · ${c.joints.rows} 帧</a></div>`).join('')}</div>
    <details><summary>关节数据、URDF 与对比说明</summary><p>每份 CSV 含时间列，以及左右臂各 7 个 state 和 action 通道，已核对与对应 JSON 标注逐行一致。TCP 使用左右臂各 6 个实测旋转关节 state，经 inference 原有 URDF 正运动学计算到夹爪对称中心；不使用 action 指令，也不对轨迹做平滑。全部 ${clips[0].frames + clips[1].frames} 帧的双臂位置已与原有 inference 计算实现交叉核对。</p><p>关节时间戳存在跳步，与固定 30 fps 视频的时间格点最大相差 ${clips[0].joints.max_timestamp_vs_video_grid_difference_s.toFixed(3)} / ${clips[1].joints.max_timestamp_vs_video_grid_difference_s.toFixed(3)} 秒。页面按导出 frame_index 关联视频，速度按原始 t_sec 计算；尚未独立核验硬件同步及相机/机器人外参。这里不计算或声称物理 jerk 改善。</p><p>good / bad 的方法身份按提供者标注。两段记录的平台 task ID 为 ${clips[0].platform_task_id} / ${clips[1].platform_task_id}，相机视角不同；checkpoint、延迟和初始状态配对信息未提供。这是精选真机定性展示，视频时长不代表整体成功率。</p><p><a href="real_robot_manifest.json">原文件校验与数据清单</a> · <a href="real_robot/robot.urdf" download>URDF 模型</a> · <a href="real_robot/tcp_mapping.json">关节映射及 TCP 定义</a> · <a href="real_robot_tcp_verification.json">逐帧计算核验</a></p></details>`;
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
      el.textContent = `${Math.min(time, lastTimes[i]).toFixed(2)} s${time >= lastTimes[i] - 1e-7 ? ' · 末帧保持' : ''}`;
    });
    tcpViewer?.draw(time);
  }
  function pause() {
    generation++; playing = false; starting = false;
    videos.forEach(v => v.pause()); cancelAnimationFrame(request);
    playButton.textContent = '同步播放';
  }
  function seek(t) {
    time = clamp(t);
    videos.forEach((v, i) => { if (v.readyState > 0) v.currentTime = frameTime(time, i); });
    display();
  }
  function ready(v) {
    if (v.readyState >= 2) return Promise.resolve();
    if (v.error) return Promise.reject(Error('视频加载失败，请下载原始文件查看'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); v.removeEventListener('loadeddata', loaded); v.removeEventListener('error', failed); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(Error('视频加载失败')); };
      const timer = setTimeout(() => { cleanup(); reject(Error('视频加载超时，请重试')); }, 15000);
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
    starting = true; playButton.textContent = '加载中…'; errorBox.textContent = '';
    try {
      await Promise.all(videos.map(ready));
      if (ticket !== generation) return;
      seek(time >= endTime - 1e-7 ? 0 : time);
      videos.forEach(v => { v.playbackRate = Number(rate.value); });
      await Promise.all(videos.map((v, i) => time < lastTimes[i] - 1e-7 ? v.play() : Promise.resolve()));
      if (ticket !== generation) return;
      starting = false; playing = true; playButton.textContent = '暂停';
      request = requestAnimationFrame(tick);
    } catch (error) {
      if (ticket !== generation) return;
      pause(); errorBox.textContent = `无法播放：${error.message}`;
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
    v.addEventListener('error', () => { pause(); errorBox.textContent = `视频加载失败：${clips[i].src}`; });
  });
  document.addEventListener('demo:pause-all', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  display();
})();
