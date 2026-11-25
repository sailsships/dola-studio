
(() => {
  'use strict';
  if (window.__anne1575Bridge) return;
  const LIMIT = 15;
  const TARGET_MODEL = 'seedance_v2.0';
  const state = window.__anne1575Bridge = { installed: true, patched: 0, seen: [] };
  const hit = () => { state.patched += 1; };

  const pathOf = raw => {
    try { return new URL(raw, location.href).pathname.replace(/\/$/, ''); } catch { return ''; }
  };
  const isSkillPack = raw => pathOf(raw) === '/samantha/skill/pack';
  const isActionBar = raw => pathOf(raw) === '/alice/slot/action_bar_v3/get_item_conf';

  // ── A. skill pack：value==='duration' && options[] / model_capability ──
  function patchDurationOptions(node) {
    let patched = false;
    const seen = new Set();
    const walk = value => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value.value === 'duration' && Array.isArray(value.options)) {
        const template = value.options.find(o => String(o && o.value) === '10') || value.options[0] || {};
        if (!value.options.some(o => String(o && o.value) === String(LIMIT))) {
          const extra = Object.assign({}, template);
          extra.show_name = LIMIT + 's';
          extra.value = String(LIMIT);
          extra.is_default = false;
          extra.sub_display = template.sub_display || '';
          value.options.push(extra);
        }
        for (const option of value.options) option.is_default = Number(option && option.value) === LIMIT;
        patched = true;
      }
      if (value.model_capability && typeof value.model_capability === 'object') {
        const capability = value.model_capability[TARGET_MODEL];
        if (capability && typeof capability === 'object') {
          const list = Array.isArray(capability.supported_durations)
            ? capability.supported_durations.map(String) : [];
          if (!list.includes(String(LIMIT))) list.push(String(LIMIT));
          capability.supported_durations = list;
          patched = true;
        }
      }
      for (const child of Object.values(value)) walk(child);
    };
    walk(node);
    return patched;
  }

  // ── B. action bar：option_list / 滑杆两种形态 ──
  function patchActionBarConfig(node) {
    let patched = false;
    const seen = new Set();
    const walk = (value, parent, parentKey) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
            (trimmed.includes('video-duration') || trimmed.includes('video-model'))) {
          try {
            const parsed = JSON.parse(value);
            const changed = walk(parsed, null, '');
            if (changed && parent) parent[parentKey] = JSON.stringify(parsed);
            return changed;
          } catch { return false; }
        }
        return false;
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return false;
      seen.add(value);
      let changed = false;

      if (value.key === 'video-duration' && Array.isArray(value.option_list)) {
        const template = value.option_list.find(o => String(o && o.option_key) === '10') || value.option_list[0] || {};
        if (!value.option_list.some(o => Number(o && o.option_key) === LIMIT)) {
          const extra = Object.assign({}, template);
          extra.id = 3;
          extra.display_text = LIMIT + 's';
          extra.message_text = '';
          extra.option_key = String(LIMIT);
          value.option_list.push(extra);
        }
        value.default_selection_index = 4;
        value.default_selection_id = 4;
        changed = true;
      }

      if (value.key === 'video-duration' || value.key === 'video_duration') {
        if (typeof value.upper_bound === 'number' && value.upper_bound < LIMIT) {
          value.upper_bound = LIMIT; changed = true;
        }
        if (typeof value.max === 'number' && value.max < LIMIT) {
          value.max = LIMIT; changed = true;
        }
        if (typeof value.default_selected_duration === 'number' &&
            value.default_selected_duration > LIMIT) {
          value.default_selected_duration = LIMIT; changed = true;
        }
        // 11 秒起会打“升级会员”角标，把门槛抬到上限之上
        if (typeof value.tag_starting_duration === 'number' && value.tag_starting_duration <= LIMIT) {
          value.tag_starting_duration = LIMIT + 1; changed = true;
        }
        const tag = value.tag;
        if (tag && typeof tag === 'object' &&
            typeof tag.tag_starting_duration === 'number' && tag.tag_starting_duration <= LIMIT) {
          tag.tag_starting_duration = LIMIT + 1; changed = true;
        }
      }

      for (const [key, child] of Object.entries(value)) {
        if (walk(child, value, key)) changed = true;
      }
      return changed;
    };
    patched = walk(node, null, '');
    return patched;
  }

  function patchText(kind, raw) {
    if (typeof raw !== 'string' || !raw) return raw;
    try {
      const json = JSON.parse(raw);
      const changed = kind === 'action' ? patchActionBarConfig(json) : patchDurationOptions(json);
      if (!changed) return raw;
      hit();
      return JSON.stringify(json);
    } catch { return raw; }
  }

  const SKIP = new Set(['content-length', 'content-encoding', 'transfer-encoding']);
  function rebuild(response, body) {
    const headers = new Headers(response.headers);
    for (const name of Array.from(headers.keys())) if (SKIP.has(name.toLowerCase())) headers.delete(name);
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const kind = isActionBar(url) ? 'action' : isSkillPack(url) ? 'skill' : '';
      const result = originalFetch.call(this, input, init);
      if (!kind) return result;
      state.seen.push(kind + ' ' + String(url).slice(0, 100));
      return Promise.resolve(result).then(async response => {
        try {
          const text = await response.clone().text();
          const patched = patchText(kind, text);
          return patched === text ? response : rebuild(response, patched);
        } catch { return response; }
      });
    };
  }

  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!proto) return;
  const textGetter = Object.getOwnPropertyDescriptor(proto, 'responseText')?.get;
  const responseGetter = Object.getOwnPropertyDescriptor(proto, 'response')?.get;
  const originalOpen = proto.open;
  if (typeof originalOpen !== 'function') return;

  proto.open = function (method, url) {
    try {
      const raw = String(url || '');
      const kind = isActionBar(raw) ? 'action' : isSkillPack(raw) ? 'skill' : '';
      if (kind) {
        state.seen.push(kind + ' ' + raw.slice(0, 100));
        const self = this;
        if (textGetter) {
          Object.defineProperty(self, 'responseText', {
            configurable: true,
            get: () => patchText(kind, textGetter.call(self))
          });
        }
        if (responseGetter) {
          Object.defineProperty(self, 'response', {
            configurable: true,
            get: () => {
              const value = responseGetter.call(self);
              if (typeof value === 'string') return patchText(kind, value);
              if (value && typeof value === 'object') {
                const changed = kind === 'action' ? patchActionBarConfig(value) : patchDurationOptions(value);
                if (changed) hit();
              }
              return value;
            }
          });
        }
      }
    } catch { }
    return originalOpen.apply(this, arguments);
  };
})();
