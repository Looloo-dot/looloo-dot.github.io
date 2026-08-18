/* louis (yiven) zhu — site.js
   Everything here is progressive enhancement. With JS off the page is
   fully readable and navigable; nothing is hidden that JS would reveal. */

(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -- 1. theme toggle ------------------------------------------------
     light-dark() resolves against the *used* color-scheme. getComputedStyle
     returns the SPECIFIED list ("light dark"), so the used scheme must be
     resolved by hand: the inline style (head script or a prior click) is
     authoritative; otherwise it is the OS preference. */
  function usedScheme() {
    var o = document.documentElement.style.colorScheme;
    if (o) return o;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncThemeColor() {
    var dark = usedScheme() === 'dark';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', dark ? '#16181A' : '#FAF9F6');
      m.removeAttribute('media');
    });
  }
  var btn = document.getElementById('theme');
  if (btn) {
    btn.addEventListener('click', function () {
      var next = usedScheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.add('theming');
      document.documentElement.style.colorScheme = next;
      localStorage.setItem('theme', next);
      syncThemeColor();
      setTimeout(function () {
        document.documentElement.classList.remove('theming');
      }, 300);
    });
  }
  if (document.documentElement.style.colorScheme) syncThemeColor();

  /* -- 2. reading progress -------------------------------------------- */
  var bar = document.querySelector('.progress b');
  if (bar && !reduce) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var h = document.documentElement;
        var max = h.scrollHeight - innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0) + ')';
        ticking = false;
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* -- 3. spine current-section marker -------------------------------- */
  var links = [].slice.call(document.querySelectorAll('.spine a'));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var visible = new Map();
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0); });
      var best = null, bestRatio = 0;
      sections.forEach(function (s) {
        var r = visible.get(s.id) || 0;
        if (r > bestRatio) { bestRatio = r; best = s.id; }
      });
      links.forEach(function (a) {
        if (a.getAttribute('href') === '#' + best) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-10% 0px -55% 0px', threshold: [0, .25, .5, 1] });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* -- 4. entrance reveals --------------------------------------------
     .rv is only ever added here, so no-JS and reduced-motion users see
     the page fully rendered with zero flicker. */
  if (!reduce && 'IntersectionObserver' in window) {
    sections.forEach(function (s) {
      var stagger = 0;
      [].slice.call(s.children).forEach(function (el) {
        if (el.matches('h2')) return;               /* headings stay put */
        el.classList.add('rv');
        el.style.setProperty('--rvi', String(stagger++));
      });
    });
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    document.querySelectorAll('.rv').forEach(function (el) { reveal.observe(el); });

    var secObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        secObs.unobserve(e.target);
      });
    }, { threshold: 0.05 });
    sections.forEach(function (s) { secObs.observe(s); });
  } else {
    sections.forEach(function (s) { s.classList.add('in'); });
  }

  /* -- 5. popovers ----------------------------------------------------
     Hover and focus are pure CSS. Here: tap-toggle for touch, Esc to
     dismiss (including hover-shown ones, per WCAG 1.4.13), and ARIA
     wiring for the span triggers. */
  var popSeq = 0;
  document.querySelectorAll('.pop').forEach(function (p) {
    var trigger = p.querySelector('[tabindex]');
    var body = p.querySelector('.pop-body');
    if (!trigger || !body) return;
    if (!body.id) body.id = 'pop-' + (++popSeq);
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', body.id);
  });
  function setExpanded(p, on) {
    var t = p.querySelector('[role="button"]');
    if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  document.addEventListener('click', function (e) {
    var pop = e.target.closest('.pop');
    document.querySelectorAll('.pop.is-open').forEach(function (p) {
      if (p !== pop) { p.classList.remove('is-open'); setExpanded(p, false); }
    });
    if (pop && !e.target.closest('.pop-body')) {
      pop.classList.toggle('is-open');
      setExpanded(pop, pop.classList.contains('is-open'));
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.pop').forEach(function (p) {
        p.classList.remove('is-open');
        p.classList.add('dismissed');       /* kills hover-shown ones too */
        setExpanded(p, false);
      });
    }
    /* Enter/Space activate the span "buttons" */
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.pop [role="button"]')) {
      e.preventDefault();
      var p = e.target.closest('.pop');
      p.classList.toggle('is-open');
      setExpanded(p, p.classList.contains('is-open'));
    }
  });
  document.addEventListener('mouseover', function (e) {
    var p = e.target.closest && e.target.closest('.pop.dismissed');
    if (!p) return;
    /* re-arm only after the pointer has left once; mouseover on a fresh
       entry means the pointer came back deliberately */
    p.classList.remove('dismissed');
  });

  /* -- 5b. click ripple ------------------------------------------------
     No cursor follower. The only site-wide cursor effect is tied to
     ACTION: every click emits one expanding ripple ring — the ocean's
     language, echoed. It exists for half a second and is gone. */
  if (!reduce) {
    document.addEventListener('pointerdown', function (e) {
      if (e.clientX === 0 && e.clientY === 0) return;   /* keyboard "clicks" */
      var ping = document.createElement('div');
      ping.className = 'ping';
      ping.style.left = e.clientX + 'px';
      ping.style.top = e.clientY + 'px';
      document.body.appendChild(ping);
      ping.addEventListener('animationend', function () { ping.remove(); });
      setTimeout(function () { ping.remove(); }, 800);  /* belt and braces */
    }, { passive: true });
  }

  /* -- 6. keyboard: 1–5 jump to sections, 0 to top --------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;

    if (e.key === '0') { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
    var i = parseInt(e.key, 10);
    if (i >= 1 && i <= sections.length) {
      sections[i - 1].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }
  });
}());
