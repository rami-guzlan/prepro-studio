/* The review page (/review/<token>): no sign-in. Shows the shared Brand Kit
   sections and sends feedback to POST /api/review/<token>/feedback. */
(function () {
  var token = document.body.getAttribute('data-token');
  var api = '/api/review/' + encodeURIComponent(token);
  var root = document.getElementById('app');
  var DRAFT = 'prepro.review.' + token;
  var draft = { name: '', decision: '', overall: '', items: {} };
  try {
    var saved = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (saved && typeof saved === 'object') draft = Object.assign(draft, saved, { items: saved.items || {} });
  } catch (e) {}
  function keep() {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(draft));
    } catch (e) {}
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  var fileUrl = function (name) {
    return api + '/file/' + encodeURIComponent(name);
  };
  var ext = function (name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  };
  var IMG = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'];
  var VID = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
  var AUD = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'];
  function size(b) {
    if (!b) return '';
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  }

  /** A player address for YouTube, Vimeo, Google Drive and Loom links. */
  function embedOf(url) {
    var m;
    try {
      var u = new URL(url);
      var h = u.hostname.replace(/^www\.|^m\./, '');
      if (h === 'youtu.be') return 'https://www.youtube-nocookie.com/embed/' + u.pathname.slice(1).split('/')[0];
      if (h === 'youtube.com') {
        if (u.searchParams.get('v')) return 'https://www.youtube-nocookie.com/embed/' + u.searchParams.get('v');
        if ((m = /^\/(shorts|embed|live)\/([\w-]+)/.exec(u.pathname))) return 'https://www.youtube-nocookie.com/embed/' + m[2];
      }
      if (h === 'vimeo.com' && (m = /^\/(\d+)(?:\/(\w+))?/.exec(u.pathname))) return 'https://player.vimeo.com/video/' + m[1] + (m[2] ? '?h=' + m[2] : '');
      if (h === 'player.vimeo.com') return url;
      if (h === 'drive.google.com' && (m = /\/file\/d\/([\w-]+)/.exec(u.pathname))) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
      if (h === 'loom.com' && (m = /^\/share\/(\w+)/.exec(u.pathname))) return 'https://www.loom.com/embed/' + m[1];
    } catch (e) {}
    return '';
  }

  function zoom(src) {
    var box = el('div', { class: 'lightbox', onclick: function () { box.remove(); } }, [el('img', { src: src, alt: '' })]);
    document.body.appendChild(box);
    var onKey = function (e) {
      if (e.key === 'Escape') {
        box.remove();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function media(it) {
    var fx = ext(it.fileName || it.file);
    if (it.kind === 'color') {
      return el('div', { class: 'media' }, [el('div', { class: 'swatch', style: 'background:' + (/^#?[0-9a-f]{3,8}$/i.test(it.value) ? (it.value[0] === '#' ? it.value : '#' + it.value) : 'transparent') }, [el('span', { style: 'background:var(--card);color:var(--ink);padding:2px 8px;border-radius:6px', text: it.value || '' })])]);
    }
    if (it.kind === 'font') return el('div', { class: 'media' }, [el('div', { class: 'font', style: 'font-family:"' + String(it.value || '').replace(/["\\]/g, '') + '",sans-serif', text: it.value || it.name || 'Aa' })]);
    if (it.file && VID.indexOf(fx) >= 0) return el('div', { class: 'media' }, [el('video', { src: fileUrl(it.file), controls: true, preload: 'metadata', playsinline: true, poster: it.image && it.image !== it.file ? fileUrl(it.image) : null })]);
    if (it.file && AUD.indexOf(fx) >= 0) return el('div', { class: 'media' }, [el('audio', { src: fileUrl(it.file), controls: true, preload: 'metadata' })]);
    var embed = it.url && embedOf(it.url);
    if (embed && (it.kind === 'video' || it.kind === 'audio' || !it.image)) {
      return el('div', { class: 'media' }, [el('iframe', { src: embed, allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy', title: it.name || 'Video' })]);
    }
    var pic = it.image || (it.file && IMG.indexOf(fx) >= 0 ? it.file : '');
    if (pic) {
      var src = fileUrl(pic);
      return el('div', { class: 'media' }, [el('img', { src: src, alt: it.name || '', loading: 'lazy', onclick: function () { zoom(src); } })]);
    }
    if (it.file) return el('div', { class: 'media' }, [el('div', { class: 'file' }, [el('strong', { text: (fx || 'file').toUpperCase() }), el('span', { text: it.fileName || '' })])]);
    if (it.url) return el('div', { class: 'media' }, [el('div', { class: 'file' }, [el('span', { text: 'Link' })])]);
    return el('div', { class: 'media' }, [el('div', { class: 'file' }, [el('span', { text: 'Nothing to preview' })])]);
  }

  function decideButtons(get, set, labels) {
    var wrap = el('div', { class: 'decide' });
    function draw() {
      wrap.textContent = '';
      [['approve', labels[0]], ['changes', labels[1]]].forEach(function (d) {
        var on = get() === d[0];
        wrap.appendChild(el('button', { type: 'button', class: (on ? 'on ' : '') + d[0], 'aria-pressed': on ? 'true' : 'false', text: d[1], onclick: function () { set(on ? '' : d[0]); draw(); } }));
      });
    }
    draw();
    return wrap;
  }

  function item(it) {
    var fb = draft.items[it.id] || (draft.items[it.id] = { decision: '', comment: '' });
    var card = el('div', { class: 'item ' + (fb.decision || '') });
    var links = [];
    if (it.file) links.push(el('a', { href: fileUrl(it.file), target: '_blank', rel: 'noopener', text: 'Open ' + (it.fileName || 'file') + (it.fileSize ? ' (' + size(it.fileSize) + ')' : '') }));
    if (it.url) links.push(el('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open link' }));
    var comment = el('textarea', { placeholder: 'Comment (optional)', 'aria-label': 'Comment on ' + (it.name || 'this item'), oninput: function (e) { fb.comment = e.target.value; keep(); } });
    comment.value = fb.comment || '';
    card.appendChild(media(it));
    card.appendChild(
      el('div', { class: 'body' }, [
        it.name ? el('div', { class: 'name', text: it.name }) : null,
        it.notes ? el('div', { class: 'notes', text: it.notes }) : null,
        links.length ? el('div', { class: 'open' }, links.reduce(function (a, l, i) { if (i) a.push(' · '); a.push(l); return a; }, [])) : null,
        it.tags && it.tags.length ? el('div', { class: 'tags', text: it.tags.map(function (t) { return '#' + t; }).join('  ') }) : null,
        decideButtons(function () { return fb.decision; }, function (v) { fb.decision = v; card.className = 'item ' + v; keep(); }, ['Approve', 'Needs changes']),
        comment,
      ]),
    );
    return card;
  }

  function sendBox(data) {
    var err = el('div', { class: 'err', role: 'alert' });
    var name = el('input', { type: 'text', placeholder: 'Your name', autocomplete: 'name', oninput: function (e) { draft.name = e.target.value; keep(); } });
    name.value = draft.name || '';
    var overall = el('textarea', { placeholder: 'Anything else? (optional)', style: 'min-height:96px', oninput: function (e) { draft.overall = e.target.value; keep(); } });
    overall.value = draft.overall || '';
    var btn = el('button', { type: 'button', class: 'primary', text: 'Send feedback' });
    var box = el('div', { class: 'send' }, [
      el('h2', { text: 'Send your feedback' }),
      el('p', { class: 'muted small', text: 'Your notes on each item above go with it. ' + (data.from ? data.from + ' sees them in PrePro Studio.' : '') }),
      el('label', { text: 'Overall' }),
      decideButtons(function () { return draft.decision; }, function (v) { draft.decision = v; keep(); }, ['Approve all', 'Needs changes']),
      el('label', { text: 'Overall comment' }),
      overall,
      el('label', { text: 'Your name' }),
      name,
      el('div', { class: 'row' }, [btn, err]),
    ]);
    btn.addEventListener('click', function () {
      err.textContent = '';
      var items = {};
      Object.keys(draft.items).forEach(function (id) {
        var f = draft.items[id];
        if (f && (f.decision || (f.comment || '').trim())) items[id] = { decision: f.decision, comment: f.comment };
      });
      btn.disabled = true;
      btn.textContent = 'Sending…';
      fetch(api + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: draft.name, decision: draft.decision, overall: draft.overall, items: items }) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.error || 'Could not send (error ' + r.status + ')');
          });
        })
        .then(function () {
          var who = draft.name;
          draft = { name: who, decision: '', overall: '', items: {} };
          keep();
          box.textContent = '';
          box.appendChild(el('p', { class: 'done', text: 'Thank you' + (who ? ', ' + who : '') + '. Your feedback was sent' + (data.from ? ' to ' + data.from : '') + '.' }));
          box.appendChild(el('p', { class: 'muted small', text: 'You can come back to this link and send more at any time while it is open.' }));
          box.appendChild(el('div', { class: 'row' }, [el('button', { type: 'button', text: 'Send more feedback', onclick: function () { render(data); window.scrollTo(0, 0); } })]));
        })
        .catch(function (e) {
          err.textContent = e.message;
          btn.disabled = false;
          btn.textContent = 'Send feedback';
        });
    });
    return box;
  }

  function render(data) {
    root.textContent = '';
    document.title = data.title + ' · Review';
    root.appendChild(el('h1', { text: data.title }));
    root.appendChild(el('div', { class: 'from', text: [data.from && 'From ' + data.from, data.space].filter(Boolean).join(' · ') }));
    if (data.message) root.appendChild(el('p', { class: 'message', text: data.message }));
    root.appendChild(el('p', { class: 'how', text: 'Mark each item Approve or Needs changes and add a comment where it helps, then send your feedback at the bottom. No account needed.' }));
    var total = 0;
    data.sections.forEach(function (s) {
      total += s.items.length;
      root.appendChild(el('h2', {}, [s.title, el('span', { class: 'n', text: String(s.items.length) })]));
      if (!s.items.length) root.appendChild(el('p', { class: 'empty', text: 'Nothing here yet.' }));
      else if (!s.items.some(function (i) { return i.campaign; })) root.appendChild(el('div', { class: 'grid' }, s.items.map(item)));
      else {
        // campaign resources: general ones first, then one group per campaign
        var groups = [];
        s.items.forEach(function (i) {
          var g = groups.find(function (x) { return x.name === i.campaign; });
          if (!g) groups.push((g = { name: i.campaign, items: [] }));
          g.items.push(i);
        });
        groups.sort(function (a, b) { return (a.name ? 1 : 0) - (b.name ? 1 : 0); });
        groups.forEach(function (g) {
          root.appendChild(el('h3', { class: 'group', text: g.name || 'General' }));
          root.appendChild(el('div', { class: 'grid' }, g.items.map(item)));
        });
      }
    });
    if (total) root.appendChild(sendBox(data));
  }

  fetch(api)
    .then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'This review link does not work.');
        return j;
      });
    })
    .then(render)
    .catch(function (e) {
      root.textContent = '';
      root.appendChild(el('div', { class: 'box' }, [el('h1', { text: 'Review unavailable' }), el('p', { class: 'muted', text: e.message })]));
    });
})();
