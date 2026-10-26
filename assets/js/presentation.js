(function (w) {
  'use strict';
  const A = w.PodcastApp;
  A.createProgressRestoration = function (audio, controller, saved, mediaId) {
    let restored = false, cancelled = false, pendingReset = false;
    return {
      requestReset() { cancelled = true; pendingReset = !(Number.isFinite(audio.duration) && audio.duration > 0); },
      loadedMetadata() {
        if (pendingReset) { controller.seek(0); pendingReset = false; }
        else if (!restored && !cancelled && saved.rememberProgress && saved.mediaId === mediaId && !saved.completed) controller.seek(saved.progress);
        restored = true;
      }
    };
  };
  A.createPresentation = function (options) {
    const { video, image, caption, stage, restartButton, skipButton, store, controller, catalog, timeline } = options;
    const document = options.document || video.ownerDocument;
    const group = 'assets/img/presenters/group.png';
    const groupNames = catalog.speakers.map(speaker => speaker.name).join(' · ');
    const montage = catalog.presentation || catalog.resources?.find(resource => resource.id === 'montage-video');
    const montageDuration = montage?.durationSeconds || 74;
    if (montage?.path && (video.getAttribute ? video.getAttribute('src') !== montage.path : video.src !== montage.path)) video.src = montage.path;
    let phase = 'ready';
    let videoStatus = 'idle', videoError = '', intent = 0, destroyed = false;
    const listeners = [];
    function listen(target, event, fn, capture) {
      if (!target?.addEventListener) return;
      target.addEventListener(event, fn, capture);
      listeners.push(() => target.removeEventListener(event, fn, capture));
    }
    function picture(state) {
      if (!image || !caption) return;
      if (phase === 'intro' || phase === 'ready') {
        caption.textContent = videoError || 'Montaje visual · 16 planos · ' + A.formatTime(video.currentTime) + ' / ' + A.formatTime(video.duration || montageDuration);
        return;
      }
      const ids = phase === 'podcast' ? A.speakingState(state.media, timeline, catalog.media.sha256).speakerIds : [];
      const profiles = ids.map(id => catalog.speakers.find(s => s.id === id)).filter(Boolean);
      const portrait = profiles.length === 1 ? profiles[0].portrait : group;
      if (image.getAttribute ? image.getAttribute('src') !== portrait : image.src !== portrait) image.src = portrait;
      image.alt = profiles.length === 1 ? profiles[0].name + ', panelista que habla' : groupNames;
      image.dataset.speaker = profiles.length === 1 ? profiles[0].id : 'group';
      caption.textContent = profiles.length ? profiles.map(p => p.name).join(' y ') + ' · Hablando' : phase === 'ready' ? groupNames + ' · Listos para comenzar' : 'Aprender entre pantallas · Conducen ' + groupNames;
    }
    function paint() {
      if (destroyed) return;
      stage.dataset.phase = phase;
      video.hidden = phase === 'podcast';
      image.hidden = phase !== 'podcast';
      if (skipButton) skipButton.hidden = phase === 'podcast';
      picture(store.getState());
    }
    function snapshot() {
      paint();
      store.dispatch({ presentation: { phase, status: videoStatus, currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0, duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : montageDuration, error: videoError } });
    }
    function neutralizeOtherMedia(except) {
      if (!document?.querySelectorAll) return;
      document.querySelectorAll('audio,video').forEach(media => { if (media !== except && !media.paused) media.pause(); });
    }
    async function play() {
      if (phase === 'podcast') return controller.play();
      if (store.getState().route !== 'inicio') {
        if (options.navigateToInicio) options.navigateToInicio();
        else store.dispatch({ route: 'inicio' });
      }
      const token = ++intent;
      if (phase === 'ready') video.currentTime = 0;
      phase = 'intro'; videoError = ''; videoStatus = 'loading';
      controller.pause(); neutralizeOtherMedia(video); snapshot();
      try {
        if (video.error && typeof video.load === 'function') video.load();
        await video.play();
        return token === intent;
      } catch (_) {
        if (token === intent && phase === 'intro') {
          videoStatus = 'error'; videoError = 'Montaje no disponible. Reintenta o pulsa Saltar al podcast.'; snapshot();
        }
        return false;
      }
    }
    function pause() {
      ++intent;
      if (phase === 'intro') video.pause();
      controller.pause();
    }
    function cancelIntro() {
      ++intent; phase = 'podcast'; videoStatus = 'paused'; videoError = ''; video.pause(); snapshot();
    }
    async function finish() {
      if (phase !== 'intro') return false;
      options.onResetAudio?.(); cancelIntro(); controller.seek(0);
      return controller.play();
    }
    async function skip() {
      options.onResetAudio?.(); cancelIntro(); controller.seek(0); return controller.play();
    }
    async function restart() {
      options.onResetAudio?.(); ++intent; controller.pause(); controller.seek(0); video.pause(); video.currentTime = 0;
      phase = 'ready'; return play();
    }
    function toggle() {
      if (phase === 'intro') return video.paused ? play() : pause();
      if (phase === 'ready') return play();
      return store.getState().media.status === 'playing' ? controller.pause() : controller.play();
    }
    listen(video, 'play', () => { if (video.paused) return; phase = 'intro'; controller.pause(); neutralizeOtherMedia(video); videoStatus = 'loading'; snapshot(); });
    listen(video, 'playing', () => { videoStatus = 'playing'; videoError = ''; snapshot(); });
    listen(video, 'pause', () => { if (phase === 'intro') { videoStatus = 'paused'; snapshot(); } });
    listen(video, 'waiting', () => { videoStatus = 'waiting'; snapshot(); });
    listen(video, 'timeupdate', snapshot);
    listen(video, 'loadedmetadata', snapshot);
    listen(video, 'error', () => { videoStatus = 'error'; videoError = 'Montaje no disponible. Reintenta o pulsa Saltar al podcast.'; snapshot(); });
    listen(video, 'ended', finish);
    listen(controller.audio, 'play', () => { if (controller.audio.paused) return; if (phase !== 'podcast') cancelIntro(); neutralizeOtherMedia(controller.audio); });
    listen(document, 'play', event => {
      const target = event.target;
      if (target === video || target === controller.audio) return;
      if (target?.tagName === 'VIDEO' || target?.tagName === 'AUDIO') { video.pause(); neutralizeOtherMedia(target); }
    }, true);
    listen(document, 'click', event => { if (event.target.closest?.('[data-chapter]')) cancelIntro(); }, true);
    listen(restartButton, 'click', restart);
    listen(skipButton, 'click', skip);
    const unsubscribe = store.subscribe(state => {
      video.volume = state.media.volume; video.muted = state.media.muted; video.playbackRate = state.media.playbackRate;
      if (state.route !== 'inicio' && phase === 'intro' && !video.paused) video.pause();
      picture(state);
    });
    snapshot();
    return { play, pause, toggle, restart, skip, cancelIntro, getPhase: () => phase,
      destroy() { destroyed = true; ++intent; unsubscribe(); listeners.forEach(fn => fn()); video.pause(); } };
  };
})(window);


