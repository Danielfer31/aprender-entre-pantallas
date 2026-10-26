(function (w) {
  'use strict';
  const A=w.PodcastApp,D=w.PodcastData||{},catalog=D.catalog;
  if(!catalog){document.body.insertAdjacentHTML('afterbegin','<p role="alert">No se pudieron cargar los datos locales. Conserva assets junto a esta página.</p>');return;}
  let storage;try{storage=w.localStorage}catch(_){}
  const preferences=A.createPreferences(storage),saved=preferences.load();
  const store=A.createStore({savedIds:saved.savedIds,favoriteIds:saved.favoriteIds,preferences:saved});
  const audio=document.getElementById('audio-main');audio.src=catalog.media.path;
  const controller=A.createMediaController(audio,store);
  controller.setVolume(saved.volume);controller.setMuted(saved.muted);controller.setRate(saved.playbackRate);
  const timeline=D.timeline||D.speakers;
  if(timeline&&(timeline.media?.sha256!==catalog.media.sha256||D.waveform?.sha256!==catalog.media.sha256||D.waveform?.mediaId!==catalog.media.id))timeline.media={...timeline.media,sha256:'declared-mismatch'};
  const progressRestoration=A.createProgressRestoration(audio,controller,saved,catalog.media.id);
  const presentation=A.createPresentation({video:document.getElementById('presentation-video'),image:document.getElementById('presentation-image'),caption:document.getElementById('presentation-caption'),stage:document.getElementById('presentation-stage'),restartButton:document.getElementById('presentation-restart'),skipButton:document.getElementById('presentation-skip'),document,store,controller,catalog,timeline,onResetAudio:progressRestoration.requestReset,navigateToInicio:()=>{w.location.hash='inicio';store.dispatch({route:'inicio'})}});
  const mainController={...controller,play:presentation.play,pause:presentation.pause,toggle:presentation.toggle};
  const dialogs=A.createDialogs(document.getElementById('dialog-root'),{...controller,pause:presentation.pause},catalog);
  A.renderPlayer(document.getElementById('player-root'),store,mainController,D.waveform);
  A.renderChapters(document.getElementById('chapters-root'),store,controller,catalog.chapters);
  A.renderSpeakers(document.getElementById('speakers-root'),store,timeline,catalog.speakers);
  const reviewNote=document.getElementById('voice-review-note');if(reviewNote)reviewNote.hidden=timeline?.reviewMethod!=='machine-consensus';
  function reset(){const p=preferences.reset();store.dispatch({preferences:p,savedIds:[],favoriteIds:[]});controller.setVolume(p.volume);controller.setMuted(p.muted);controller.setRate(p.playbackRate)}
  A.renderViews(document.getElementById('view-root'),store,controller,catalog,dialogs,reset);
  const router=A.createRouter(store);router.start();
  document.addEventListener('click',event=>{const route=event.target.closest('[data-route]');if(route){event.preventDefault();router.navigate(route.dataset.route)}const open=event.target.closest('[data-open]');if(open){if(presentation.getPhase()==='intro')presentation.pause();dialogs.open(open.dataset.open,open.dataset.id)}});
  document.querySelectorAll('[data-download]').forEach(el=>{el.href=catalog.media.path;el.download='Aprender_entre_pantallas_completo.mp3';el.title='Descargar MP3 íntegro. Si el navegador lo abre, usa Guardar como.'});

  audio.addEventListener('loadedmetadata',()=>{progressRestoration.loadedMetadata();if(Math.abs(audio.duration-catalog.media.durationSeconds)>.1){if(timeline)timeline.media={...timeline.media,sha256:'duration-mismatch'};document.querySelector('[data-player-status]').textContent='La duración no coincide con el audio catalogado. Atribución de voces deshabilitada.'}});
  let lastWrite=-5,lastPreferences='';
  function persist(force){const s=store.getState();document.body.classList.toggle('reduce-motion',!!s.preferences.reducedMotion);if(!force&&Math.abs(s.media.currentTime-lastWrite)<5)return;lastWrite=s.media.currentTime;preferences.save({...s.preferences,volume:s.media.volume,muted:s.media.muted,playbackRate:s.media.playbackRate,favoriteIds:s.favoriteIds,savedIds:s.savedIds,progress:s.preferences.rememberProgress?s.media.currentTime:0,completed:s.media.ended,mediaId:catalog.media.id})}
  store.subscribe(s=>{const key=JSON.stringify([s.preferences,s.savedIds,s.favoriteIds,s.media.volume,s.media.muted,s.media.playbackRate]);const changed=key!==lastPreferences;lastPreferences=key;persist(s.media.status==='paused'||changed)});
  audio.addEventListener('pause',()=>persist(true));w.addEventListener('pagehide',()=>persist(true));
  document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.target.closest('button,a,input,select,textarea,video,[contenteditable]')&&!document.querySelector('dialog[open]')){event.preventDefault();presentation.toggle()}});
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.alt=event.target.alt||'Imagen no disponible';event.target.classList.add('media-missing')}},true);
  w.PodcastInstance={store,controller,mainController,presentation,dialogs,router};
})(window);




