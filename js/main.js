/* =========================================================
   LUDO · interacción y modo presentación
   - Navegación por teclado entre escenas (y pasos dentro de las escenas fijadas)
   - Raíl de tareas, contador y regla de progreso
   - Cambio de tono del fondo según la escena
   - Animaciones con GSAP + ScrollTrigger
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');

  const body = document.body;
  const slides = $$('[data-slide]');
  const faq = $('#faq');
  const zones = [...slides, faq];
  const FAQ_INDEX = zones.length - 1;

  const topbar = $('.topbar');
  const counterNow = $('#counterNow');
  const rulerFill = $('.ruler__fill');
  const railBtns = $$('.rail [data-goto]');
  const faqBtn = $('.rail [data-goto-faq]');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  body.classList.add('tone-light');

  /* ---------- Medidas: dónde empieza cada escena y paradas del teclado ---------- */
  const sceneMap = new Map(); // escena fijada → { st, n }
  let starts = [];
  let stops = [];

  function topOf(el) {
    const box = el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    return box.getBoundingClientRect().top + window.scrollY;
  }

  function measure() {
    starts = zones.map(z => Math.round(topOf(z)));
    stops = [];
    slides.forEach((s, i) => {
      const scene = sceneMap.get(s);
      if (scene) {
        const { st, n } = scene;
        const range = st.end - st.start;
        for (let k = 0; k < n; k++) stops.push(Math.round(st.start + range * (k / n) + (k ? 6 : 0)));
      } else {
        stops.push(starts[i]);
      }
    });
  }

  /* ---------- Estado actual ---------- */
  let current = -1;

  function applyZone(idx) {
    const tone = zones[idx].dataset.tone || 'light';
    body.classList.remove('tone-light', 'tone-dark', 'tone-fresh', 'tone-brand');
    body.classList.add('tone-' + tone);

    const onFaq = idx === FAQ_INDEX;
    const sIdx = Math.min(idx, slides.length - 1);
    counterNow.textContent = onFaq ? 'FAQ' : pad(sIdx + 1);

    railBtns.forEach((b, i) => {
      b.classList.toggle('is-done', i < sIdx || onFaq);
      b.classList.toggle('is-current', i === sIdx && !onFaq);
      if (i === sIdx && !onFaq) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    if (faqBtn) faqBtn.classList.toggle('is-current', onFaq);
    slides.forEach((s, i) => s.classList.toggle('is-done', i < sIdx || onFaq));
  }

  function update() {
    const y = window.scrollY;
    const probe = y + window.innerHeight * 0.4;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= probe) idx = i;
    if (idx !== current) { current = idx; applyZone(idx); }

    const last = starts[slides.length - 1] || 1;
    rulerFill.style.transform = `scaleX(${Math.min(1, Math.max(0, y / last))})`;
    topbar.classList.toggle('is-scrolled', y > window.innerHeight * 0.55);
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  function refreshLayout() { measure(); update(); }

  /* ---------- Navegación ---------- */
  let lastTarget = null;
  let lastTime = 0;

  function goTo(y) {
    lastTarget = Math.max(0, Math.round(y));
    lastTime = performance.now();
    window.scrollTo({ top: lastTarget, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
  function baseY() {
    // Si se pulsa varias veces seguidas, avanzamos desde el último destino
    return lastTarget !== null && performance.now() - lastTime < 900 ? lastTarget : window.scrollY;
  }
  function next() {
    const y = baseY();
    const t = stops.find(s => s > y + 8);
    if (t !== undefined) goTo(t);
  }
  function prev() {
    const y = baseY();
    const t = [...stops].reverse().find(s => s < y - 8);
    goTo(t !== undefined ? t : 0);
  }
  function goToZone(i) { if (starts[i] !== undefined) goTo(starts[i]); }

  railBtns.forEach(b => b.addEventListener('click', () => goToZone(+b.dataset.goto)));
  if (faqBtn) faqBtn.addEventListener('click', () => goToZone(FAQ_INDEX));

  // Enlaces internos (#portada, #problema…)
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const i = zones.findIndex(z => z.id === id);
      if (i < 0) return;
      e.preventDefault();
      goToZone(i);
    });
  });

  /* ---------- Vídeo ---------- */
  const video = $('#ludoVideo');
  const videoPlay = $('#videoPlay');
  const videoSlide = $('#video');

  function playVideo() {
    video.controls = true;
    videoPlay.hidden = true;
    const p = video.play();
    if (p && p.catch) p.catch(() => { videoPlay.hidden = false; });
  }
  function toggleVideo() {
    if (video.paused) playVideo(); else video.pause();
  }
  if (video && videoPlay) {
    videoPlay.addEventListener('click', playVideo);
    video.addEventListener('ended', () => {
      video.controls = false;
      video.currentTime = 0;
      videoPlay.hidden = false;
    });
    // Se pausa solo al salir de la slide del vídeo
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        entries.forEach(en => { if (!en.isIntersecting && !video.paused) video.pause(); });
      }, { threshold: 0.25 }).observe(videoSlide);
    }
  }

  /* ---------- Pantalla completa ---------- */
  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else if (document.exitFullscreen) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) { /* no disponible */ }
  }


  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

    switch (e.key) {
      case ' ': case 'Enter':
        if (e.target.closest('button, summary, a, video')) return;
        // En la slide del vídeo, Espacio / Enter reproduce o pausa
        if (video && zones[current] === videoSlide) { e.preventDefault(); toggleVideo(); break; }
        if (e.key === 'Enter') return;
        e.preventDefault(); next(); break;
      case 'ArrowRight': case 'ArrowDown': case 'PageDown':
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); goTo(0); break;
      case 'End':
        e.preventDefault(); goToZone(slides.length - 1); break;
      case 'f': case 'F':
        toggleFullscreen(); break;
      case 'b': case 'B':
        goToZone(FAQ_INDEX); break;
    }
  });

  /* ---------- Mockup: tareas que se tachan y cronómetro ---------- */
  function mockLoop() {
    const items = $$('.mock__list li');
    let i = 1;
    setInterval(() => {
      if (i >= items.length) {
        items.forEach((li, k) => li.classList.toggle('is-done', k === 0));
        i = 1;
        return;
      }
      items[i].classList.add('is-done');
      i++;
    }, 1500);

    const timers = [$('#mockTimer'), $('#stepTimer')].filter(Boolean);
    let secs = 25 * 60;
    setInterval(() => {
      secs = secs <= 0 ? 25 * 60 : secs - 1;
      const t = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
      timers.forEach(el => { el.textContent = t; });
    }, 1000);
  }

  /* ---------- Texto que se rellena con el scroll ---------- */
  function splitWords(el) {
    if (el.dataset.split) return;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = w;
      el.appendChild(span);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.dataset.split = '1';
  }

  /* ---------- Escenas fijadas (pasos con el scroll) ---------- */
  function setStep(scene, k) {
    $$('[data-step]', scene).forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('is-active', s === k);
      el.classList.toggle('is-past', s < k);
    });
  }
  function showAllSteps() {
    $$('.scene').forEach(scene => {
      $$('.moment, .step', scene).forEach(el => el.classList.remove('is-active', 'is-past'));
    });
  }

  function buildScenes() {
    $$('.scene[data-steps]').forEach(scene => {
      const n = +scene.dataset.steps;
      let last = -1;
      const st = ScrollTrigger.create({
        trigger: scene,
        start: 'top top',
        end: '+=' + n * 80 + '%',
        pin: true,
        anticipatePin: 1,
        onUpdate: self => {
          const k = Math.min(n - 1, Math.floor(self.progress * n));
          if (k !== last) { last = k; setStep(scene, k); }
        }
      });
      sceneMap.set(scene, { st, n });
      setStep(scene, 0);
    });
  }

  /* ---------- Animaciones ---------- */
  function heroIntro() {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.hero__symbol', { scale: 0, rotate: -25, opacity: 0, duration: 1, ease: 'back.out(1.8)' })
      .from('.hero__word', { yPercent: 105, duration: 1 }, '-=.6')
      .from('.hero .eyebrow', { opacity: 0, y: 10, duration: .6 }, '-=.7')
      .from('.hero__slogan', { opacity: 0, y: 24, duration: .8 }, '-=.6')
      .from('.hero__actions', { opacity: 0, y: 16, duration: .6 }, '-=.5')
      .from('.mock', { opacity: 0, y: 50, rotate: -3, duration: 1.1 }, '-=1')
      .from('.sticker', { scale: 0, rotate: -60, duration: .8, ease: 'back.out(2)' }, '-=.3');
  }

  function ringAnim() {
    $$('.ring').forEach(r => {
      const v = Math.max(0, Math.min(100, parseFloat(r.dataset.value) || 0));
      const arc = $('.ring__arc', r);
      const out = $('.ring__val', r);
      const C = 2 * Math.PI * 54;
      const obj = { v: 0 };
      gsap.set(arc, { strokeDasharray: C, strokeDashoffset: C });
      out.textContent = '0';
      const tl = gsap.timeline({ paused: true })
        .to(arc, { strokeDashoffset: C * (1 - v / 100), duration: 1.8, ease: 'power2.out' }, 0)
        .to(obj, { v, duration: 1.8, ease: 'power2.out', onUpdate: () => { out.textContent = Math.round(obj.v); } }, 0);
      ScrollTrigger.create({
        trigger: r,
        start: 'top 85%',
        onEnter: () => tl.restart(),
        onEnterBack: () => tl.restart(),
        onLeaveBack: () => { tl.pause(0); out.textContent = '0'; }
      });
    });
    gsap.from('.split__img', {
      opacity: 0, y: 40, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#problema', start: 'top 60%', toggleActions: 'play none none reverse' }
    });
  }

  function personaAnim() {
    gsap.from('.persona__photo', {
      opacity: 0, x: -60, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#cliente', start: 'top 60%', toggleActions: 'play none none reverse' }
    });
    gsap.from('.persona__card > *', {
      opacity: 0, x: 40, duration: .8, ease: 'power3.out', stagger: .08,
      scrollTrigger: { trigger: '#cliente', start: 'top 60%', toggleActions: 'play none none reverse' }
    });
  }

  function fillAnim() {
    $$('[data-fill]').forEach(el => {
      splitWords(el);
      gsap.fromTo($$('.w', el), { opacity: .15 }, {
        opacity: 1, stagger: .1, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'bottom 75%', scrub: .4 }
      });
    });
  }

  function versusAnim() {
    const st = { trigger: '.versus', start: 'top 80%', toggleActions: 'play none none reverse' };
    gsap.from('.vs-card--them', { opacity: 0, x: -40, duration: .7, ease: 'power3.out', scrollTrigger: st });
    gsap.from('.vs-card--us', { opacity: 0, x: 40, duration: .7, delay: .35, ease: 'power3.out', scrollTrigger: { ...st } });
    gsap.from('.versus .mark', { scale: 0, duration: .5, stagger: .35, delay: .5, ease: 'back.out(2.6)', scrollTrigger: { ...st } });
  }

  function videoAnim() {
    gsap.from('.video__frame', {
      opacity: 0, scale: .94, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#video', start: 'top 60%', toggleActions: 'play none none reverse' }
    });
  }

  function closingAnim() {
    const st = { trigger: '#cierre', start: 'top 55%', toggleActions: 'play none none reverse' };
    gsap.from('.closing__word', { yPercent: 25, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: st });
    gsap.from('.closing__slogan span', { y: 40, opacity: 0, duration: .7, stagger: .28, delay: .3, ease: 'back.out(1.7)', scrollTrigger: { ...st } });
  }

  /* ---------- Arranque ---------- */
  function init() {
    if (!hasGsap) {
      // Sin GSAP la página sigue funcionando: sin animaciones ni escenas fijadas
      showAllSteps();
      refreshLayout();
      window.addEventListener('resize', refreshLayout);
      window.addEventListener('load', refreshLayout);
      return;
    }

    const mm = gsap.matchMedia();
    mm.add({
      desktop: '(min-width: 761px)',
      reduce: '(prefers-reduced-motion: reduce)'
    }, ctx => {
      const { desktop, reduce } = ctx.conditions;

      // Las escenas fijadas se crean primero para que el resto calcule bien sus posiciones
      if (desktop && !reduce) buildScenes(); else showAllSteps();

      if (!reduce) {
        heroIntro();
        ringAnim();
        personaAnim();
        fillAnim();
        versusAnim();
        videoAnim();
        closingAnim();
      }

      return () => { sceneMap.clear(); };
    });

    ScrollTrigger.addEventListener('refresh', refreshLayout);
    ScrollTrigger.refresh();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  if (!reduceMotion.matches) mockLoop();
  init();
  refreshLayout();
})();
