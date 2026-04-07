/**
 * DOM Cleaning Utilities — auto-invoked, not manual.
 * Three pure functions that generate JS strings for page.evaluate() / executeScript().
 *
 * Based on OpenCLI (https://github.com/jackwener/opencli) by jackwener
 * Licensed under Apache-2.0. Modified for AutoCLI.
 */

const DomClean = (() => {

  /**
   * Generate JS to wait until DOM stops changing.
   * @param {number} maxMs - Maximum wait time (default 5000)
   * @param {number} quietMs - Quiet period to consider stable (default 500)
   * @returns {string} JS code string
   */
  function waitForDomStableJs(maxMs = 5000, quietMs = 500) {
    return `
      new Promise(resolve => {
        if (!document.body) {
          setTimeout(() => resolve('nobody'), ${maxMs});
          return;
        }
        let timer = null;
        let cap = null;
        const done = (reason) => {
          clearTimeout(timer);
          clearTimeout(cap);
          obs.disconnect();
          resolve(reason);
        };
        const resetQuiet = () => {
          clearTimeout(timer);
          timer = setTimeout(() => done('quiet'), ${quietMs});
        };
        const obs = new MutationObserver(resetQuiet);
        obs.observe(document.body, { childList: true, subtree: true, attributes: true });
        resetQuiet();
        cap = setTimeout(() => done('capped'), ${maxMs});
      })
    `;
  }

  /**
   * Generate JS to smoothly scroll the page to trigger lazy loading.
   * @param {number} pages - Number of viewport heights to scroll (default 3)
   * @param {number} stepPx - Pixels per scroll step (default 200)
   * @param {number} stepMs - Delay between steps in ms (default 200)
   * @returns {string} JS code string
   */
  function smoothScrollJs(pages = 3, stepPx = 200, stepMs = 200) {
    return `
      (async () => {
        if (!document.body) return;
        var vh = window.innerHeight;
        var totalPx = vh * ${pages};
        var step = ${stepPx};
        var delay = ${stepMs};
        var scrolled = 0;

        function findScrollTarget() {
          var candidates = [document.scrollingElement, document.documentElement, document.body];
          var selectors = ['[class*="scroll"]', '[class*="content"]', 'main', '[role="main"]'];
          for (var s = 0; s < selectors.length; s++) {
            try {
              var el = document.querySelector(selectors[s]);
              if (el && el.scrollHeight > el.clientHeight + 100) candidates.unshift(el);
            } catch(e) {}
          }
          for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && candidates[i].scrollHeight > candidates[i].clientHeight + 100) return candidates[i];
          }
          return document.documentElement;
        }

        var target = findScrollTarget();

        while (scrolled < totalPx) {
          var beforeY = target.scrollTop;

          var evt = new WheelEvent('wheel', {
            deltaY: step, deltaX: 0, deltaMode: 0,
            bubbles: true, cancelable: true, view: window
          });
          (target === document.documentElement || target === document.body
            ? document : target).dispatchEvent(evt);

          target.scrollBy ? target.scrollBy({ top: step, behavior: 'instant' }) : (target.scrollTop += step);
          window.scrollBy({ top: step, behavior: 'instant' });

          target.dispatchEvent(new Event('scroll', { bubbles: true }));
          window.dispatchEvent(new Event('scroll'));

          await new Promise(function(r) { setTimeout(r, delay); });

          var afterY = target.scrollTop;
          scrolled += step;

          if (afterY === beforeY && window.scrollY === beforeY) {
            await new Promise(function(r) { setTimeout(r, 800); });
            target.scrollBy ? target.scrollBy({ top: step, behavior: 'instant' }) : (target.scrollTop += step);
            window.scrollBy({ top: step, behavior: 'instant' });
            await new Promise(function(r) { setTimeout(r, delay); });
            if (target.scrollTop === afterY && window.scrollY === beforeY) break;
          }

          if (scrolled % vh < step) {
            await new Promise(function(r) { setTimeout(r, 300); });
          }
        }
      })()
    `;
  }

  /**
   * Generate JS to produce a clean, selector-friendly DOM snapshot.
   * Preserves full tree structure so CSS selectors remain valid.
   * @param {object} opts
   * @param {number} opts.maxDepth - Maximum DOM depth (default 40)
   * @param {number} opts.maxTextLength - Max text per node (default 80)
   * @param {number} opts.maxSiblings - Max repeated siblings before collapsing (default 2)
   * @param {number} opts.maxAttrLength - Max attribute value length (default 80)
   * @returns {string} JS code string that returns cleaned HTML string
   */
  function selectorSnapshotJs(opts = {}) {
    const maxDepth = Math.max(1, Math.min(opts.maxDepth || 40, 200));
    const maxTextLength = opts.maxTextLength || 80;
    const maxSiblings = opts.maxSiblings || 2;
    const maxAttrLength = opts.maxAttrLength || 80;

    return `
(() => {
  'use strict';

  const MAX_DEPTH = ${maxDepth};
  const MAX_TEXT = ${maxTextLength};
  const MAX_SIBLINGS = ${maxSiblings};
  const MAX_ATTR_LEN = ${maxAttrLength};

  const STRIP_ATTRS = new Set([
    'style',
    'onclick', 'onload', 'onerror', 'onsubmit', 'onchange', 'onfocus',
    'onblur', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup',
    'onkeypress', 'onscroll', 'onresize', 'ontouchstart', 'ontouchmove',
    'oncontextmenu', 'ondblclick', 'oninput', 'onwheel',
    'nonce', 'integrity', 'crossorigin',
  ]);
  const FRAMEWORK_ATTR_RE = /^data-(v-[a-f0-9]+|reactid|reactroot|styled|emotion|css-|sa-|sentry)/;
  const EMPTY_TAGS = new Set(['script', 'style', 'noscript']);
  const COLLAPSE_TAGS = new Set(['svg', 'canvas', 'object', 'embed']);
  const SKIP_TAGS = new Set(['br', 'wbr', 'col']);
  const HEAD_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'link']);

  var iframeCount = 0;
  var MAX_IFRAMES = 5;

  function truncate(s, max) {
    if (!s || s.length <= max) return s;
    return s.substring(0, max) + '…';
  }

  function serializeAttrs(el) {
    const parts = [];
    for (const attr of el.attributes) {
      const name = attr.name;
      if (STRIP_ATTRS.has(name)) continue;
      if (FRAMEWORK_ATTR_RE.test(name)) continue;
      if (name.startsWith('on')) continue;
      let val = attr.value.trim();
      if (!val) { parts.push(name); continue; }
      if (val.startsWith('data:')) { val = 'data:…'; }
      val = truncate(val, MAX_ATTR_LEN);
      parts.push(name + '="' + val.replace(/"/g, '&quot;') + '"');
    }
    return parts.join(' ');
  }

  function structuralSig(el) {
    if (el.nodeType !== 1) return '';
    var tag = el.tagName.toLowerCase();
    var cls = typeof el.className === 'string' ? el.className.trim() : '';
    var role = el.getAttribute('role') || '';
    var childCount = el.children.length;
    var bucket = childCount <= 4 ? '' + childCount : childCount <= 9 ? '5-9' : childCount <= 19 ? '10-19' : '20+';
    var childTags = '';
    var kids = el.children;
    for (var ci = 0; ci < Math.min(kids.length, 4); ci++) {
      childTags += kids[ci].tagName.toLowerCase() + ',';
    }
    return tag + '|' + cls + '|' + role + '|' + bucket + '|' + childTags;
  }

  var MIN_DEDUP_DEPTH = 8;
  var MIN_DEDUP_RUN = 4;
  const lines = [];

  function walkHead(el, depth) {
    var indent = '  '.repeat(depth);
    lines.push(indent + '<head>');
    for (var hi = 0; hi < el.children.length; hi++) {
      var child = el.children[hi];
      var ctag = child.tagName.toLowerCase();
      if (HEAD_SKIP_TAGS.has(ctag)) continue;
      var cattrs = serializeAttrs(child);
      var ctext = child.textContent ? child.textContent.trim() : '';
      if (ctext) {
        lines.push('  '.repeat(depth + 1) + '<' + ctag + (cattrs ? ' ' + cattrs : '') + '>' + truncate(ctext, MAX_TEXT) + '</' + ctag + '>');
      } else {
        lines.push('  '.repeat(depth + 1) + '<' + ctag + (cattrs ? ' ' + cattrs : '') + ' />');
      }
    }
    lines.push(indent + '</head>');
  }

  function walk(el, depth) {
    if (depth > MAX_DEPTH) return;
    if (el.nodeType === 3) {
      const t = el.textContent.trim();
      if (t) lines.push('  '.repeat(depth) + truncate(t, MAX_TEXT));
      return;
    }
    if (el.nodeType !== 1) return;

    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'head') { walkHead(el, depth); return; }

    const attrs = serializeAttrs(el);
    const indent = '  '.repeat(depth);

    if (EMPTY_TAGS.has(tag)) { lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + ' />'); return; }
    if (COLLAPSE_TAGS.has(tag)) { lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + ' />'); return; }

    if (tag === 'iframe') {
      if (iframeCount < MAX_IFRAMES) {
        try {
          var iframeDoc = el.contentDocument;
          if (iframeDoc && iframeDoc.body) {
            iframeCount++;
            lines.push(indent + '<iframe' + (attrs ? ' ' + attrs : '') + '> <!-- same-origin -->');
            walk(iframeDoc.body, depth + 1);
            lines.push(indent + '</iframe>');
            return;
          }
        } catch(e) {}
      }
      lines.push(indent + '<iframe' + (attrs ? ' ' + attrs : '') + ' /> <!-- cross-origin -->');
      return;
    }

    if (tag === 'video' || tag === 'audio') {
      var sources = el.querySelectorAll('source');
      if (sources.length > 0) {
        lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + '>');
        for (var si = 0; si < sources.length; si++) {
          lines.push('  '.repeat(depth + 1) + '<source ' + serializeAttrs(sources[si]) + ' />');
        }
        lines.push(indent + '</' + tag + '>');
      } else {
        lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + ' />');
      }
      return;
    }

    const childNodes = Array.from(el.childNodes).filter(function(n) {
      if (n.nodeType === 1) return !SKIP_TAGS.has(n.tagName.toLowerCase());
      if (n.nodeType === 3) return n.textContent.trim().length > 0;
      return false;
    });

    if (childNodes.length === 0) { lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + ' />'); return; }

    const hasElementChild = childNodes.some(function(n) { return n.nodeType === 1; });
    if (!hasElementChild) {
      const text = truncate(el.textContent.trim(), MAX_TEXT);
      lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + '>' + text + '</' + tag + '>');
      return;
    }

    lines.push(indent + '<' + tag + (attrs ? ' ' + attrs : '') + '>');

    var i = 0;
    while (i < childNodes.length) {
      var child = childNodes[i];
      if (child.nodeType === 3) { walk(child, depth + 1); i++; continue; }

      var sig = (depth >= MIN_DEDUP_DEPTH) ? structuralSig(child) : '';
      var runLen = 1;
      if (sig) {
        while (i + runLen < childNodes.length &&
               childNodes[i + runLen].nodeType === 1 &&
               structuralSig(childNodes[i + runLen]) === sig) {
          runLen++;
        }
      }

      if (runLen >= MIN_DEDUP_RUN && sig) {
        for (var j = 0; j < MAX_SIBLINGS; j++) {
          walk(childNodes[i + j], depth + 1);
        }
        var remaining = runLen - MAX_SIBLINGS;
        lines.push('  '.repeat(depth + 1) + '<!-- ×' + remaining + ' more ' + child.tagName.toLowerCase() + ' -->');
        i += runLen;
      } else {
        walk(child, depth + 1);
        i++;
      }
    }

    if (el.shadowRoot) {
      lines.push('  '.repeat(depth + 1) + '<!-- shadow-root -->');
      var shadowChildren = Array.from(el.shadowRoot.childNodes);
      for (var sc = 0; sc < shadowChildren.length; sc++) {
        walk(shadowChildren[sc], depth + 1);
      }
      lines.push('  '.repeat(depth + 1) + '<!-- /shadow-root -->');
    }

    lines.push(indent + '</' + tag + '>');
  }

  var root = document.documentElement || document.body;
  if (root) walk(root, 0);
  return lines.join('\\n');
})()
    `.trim();
  }

  /**
   * Run the full clean pipeline: wait → scroll → wait → snapshot.
   * Returns a single async JS string that can be executed via executeScript.
   * @param {object} opts - Options for the pipeline
   * @param {number} opts.scrollPages - Pages to scroll (default 3)
   * @param {number} opts.maxDepth - DOM depth limit (default 40)
   * @param {number} opts.maxTextLength - Text truncation (default 80)
   * @param {number} opts.maxSiblings - Sibling collapse (default 2)
   * @param {number} opts.maxAttrLength - Attr truncation (default 80)
   * @returns {string} Async JS code that returns cleaned HTML string
   */
  function fullCleanPipelineJs(opts = {}) {
    const waitJs = waitForDomStableJs(5000, 500);
    const scrollJs = smoothScrollJs(opts.scrollPages || 3);
    const waitJs2 = waitForDomStableJs(5000, 500);
    const snapshotJs = selectorSnapshotJs({
      maxDepth: opts.maxDepth || 40,
      maxTextLength: opts.maxTextLength || 80,
      maxSiblings: opts.maxSiblings || 2,
      maxAttrLength: opts.maxAttrLength || 80,
    });

    return `
      (async () => {
        // Step 1: Wait for initial DOM stable
        await (${waitJs});

        // Step 2: Scroll to trigger lazy loading
        await (${scrollJs});

        // Step 3: Scroll back to top
        window.scrollTo(0, 0);

        // Step 4: Wait for DOM stable again
        await (${waitJs2});

        // Step 5: Generate clean snapshot
        return (${snapshotJs});
      })()
    `;
  }

  return {
    waitForDomStableJs,
    smoothScrollJs,
    selectorSnapshotJs,
    fullCleanPipelineJs,
  };
})();

if (typeof window !== 'undefined') {
  window.__autocliDomClean = DomClean;
}
