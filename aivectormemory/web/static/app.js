const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Theme management
(function initTheme() {
  const saved = localStorage.getItem('avm-theme') || 'dark';
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('#theme-toggle');
    if (btn) btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const next = isLight ? 'dark' : 'light';
      if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('avm-theme', next);
    });
  });
})();

let currentProject = null;

const api = (path, opts = {}) => {
  const sep = path.includes('?') ? '&' : '?';
  const url = currentProject !== null ? `/api/${path}${sep}project=${encodeURIComponent(currentProject)}` : `/api/${path}`;
  return fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());
};

const PAGE_SIZE = 10;
const state = { projectPage: 1, userPage: 1, issuePage: 1 };

const i18n = { get status() { return t('status') || {}; } };

function parseTags(v) {
  try { return typeof v === 'string' ? JSON.parse(v) : (v || []); } catch { return []; }
}
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function debounce(fn, ms) { let timer; return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); }; }

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function switchTab(tab) {
  $$('.nav-item').forEach(i => i.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  const navItem = $(`.nav-item[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');
  const panel = $(`#tab-${tab}`);
  if (panel) panel.classList.add('active');
  // Update main header title
  const titleMap = { stats: 'stats', status: 'sessionStatus', issues: 'issueTracking', tasks: 'taskManagement', 'project-memories': 'projectMemories', 'user-memories': 'globalMemories', tags: 'tagManagement', settings: 'settings' };
  const headerTitle = $('#main-header-title');
  if (headerTitle) headerTitle.textContent = t(titleMap[tab] || tab);
  const headerProj = $('#main-header-project');
  if (headerProj && currentProject) headerProj.textContent = currentProject.replace(/\\/g, '/').split('/').pop();
  loadTab(tab);
}

$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

function showModal(title, html, onSave) {
  $('#modal-title').textContent = title;
  $('#modal-content').innerHTML = html;
  const saveBtn = $('#modal-save');
  saveBtn.style.display = onSave ? 'block' : 'none';
  saveBtn.onclick = onSave;
  saveBtn.textContent = t('save');
  saveBtn.className = 'btn btn--primary';
  $('#modal').classList.remove('hidden');
}
function showConfirm(message, onConfirm, opts = {}) {
  showModal(t('confirm'), `<div style="padding:8px 0;white-space:pre-line">${escHtml(message)}</div>`, () => { hideModal(); onConfirm(); });
  const saveBtn = $('#modal-save');
  saveBtn.textContent = opts.btnText || t('confirm');
  if (opts.danger !== false) saveBtn.className = 'btn btn--danger';
}
function hideModal() { $('#modal').classList.add('hidden'); }
$$('.modal-close').forEach(b => b.addEventListener('click', hideModal));
$('.modal-overlay').addEventListener('click', hideModal);

function renderFilesChanged(json) {
  try {
    const files = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(files) || !files.length) return '';
    return `<ul class="issue-files-list">${files.map(f =>
      `<li class="issue-file-item"><code>${escHtml(f.path || f)}</code><span class="badge badge--${f.done ? 'success' : 'warning'} badge--xs">${f.done ? t('fileDone') : t('fileNotDone')}</span></li>`
    ).join('')}</ul>`;
  } catch { return `<pre>${escHtml(json)}</pre>`; }
}

function renderStructuredFields(i) {
  const fields = [
    ['issueDescription', i.description],
    ['issueInvestigation', i.investigation],
    ['issueRootCause', i.root_cause],
    ['issueSolution', i.solution],
    ['issueTestResult', i.test_result],
    ['issueNotes', i.notes],
  ];
  const hasFields = fields.some(([, v]) => v) || (i.files_changed && i.files_changed !== '[]');
  if (!hasFields) return '';
  return `<div class="issue-structured">
    ${fields.map(([key, val]) => val ? `<div class="issue-field"><span class="issue-field__label">${t(key)}</span><div class="issue-field__value">${escHtml(val)}</div></div>` : '').join('')}
    ${i.files_changed && i.files_changed !== '[]' ? `<div class="issue-field"><span class="issue-field__label">${t('issueFilesChanged')}</span><div class="issue-field__value">${renderFilesChanged(i.files_changed)}</div></div>` : ''}
    ${i.feature_id ? `<div class="issue-field"><span class="issue-field__label">${t('issueFeatureId')}</span><div class="issue-field__value"><code>${escHtml(i.feature_id)}</code></div></div>` : ''}
  </div>`;
}

function renderIssueCard(i) {
  const badgeMap = { pending: 'warning', in_progress: 'info', completed: 'success' };
  const isArchived = !!i.archived_at;
  const badge = isArchived ? 'muted' : (badgeMap[i.status] || 'muted');
  const label = i18n.status[isArchived ? 'archived' : i.status] || i.status;
  const meta = isArchived ? `${i.date} · ${t('archivedAt')} ${i.archived_at}` : `${i.date} · ${t('createdAt')} ${i.created_at}`;
  const parentTag = i.parent_id > 0 ? `<span class="issue-parent-tag">${t('relatedTo')} #${i.parent_id}</span>` : '';
  const structured = renderStructuredFields(i);
  const hasExpandable = i.content || structured;
  const actions = isArchived
    ? `<div class="issue-card__actions">
        <button class="btn btn--ghost-danger btn--sm" onclick="event.stopPropagation();deleteIssueAction(${i.issue_number}, true)">${t('delete')}</button>
      </div>`
    : `<div class="issue-card__actions">
        <button class="btn btn--ghost btn--sm" onclick="event.stopPropagation();editIssueAction(${i.issue_number})">${t('edit')}</button>
        <button class="btn btn--ghost btn--sm" onclick="event.stopPropagation();archiveIssueAction(${i.issue_number})" style="color:#FBBF24">${t('archiveIssue')}</button>
        <button class="btn btn--ghost-danger btn--sm" onclick="event.stopPropagation();deleteIssueAction(${i.issue_number}, false)">${t('delete')}</button>
      </div>`;
  return `
  <div class="issue-card" style="cursor:pointer" onclick="${isArchived ? `if(!event.target.closest('.issue-card__actions')){viewArchivedIssue(${i.issue_number})}` : `if(!event.target.closest('.issue-card__actions')){editIssueAction(${i.issue_number})}else{this.classList.toggle('expanded')}`}">
    <div class="issue-card__header">
      <div class="issue-card__title"><span class="issue-card__number">#${i.issue_number}</span>${escHtml(i.title)}${parentTag}${i.task_progress ? `<span class="issue-task-progress">${i.task_progress.done}/${i.task_progress.total}</span>` : ''}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge badge--${badge}">${escHtml(label)}</span>
        ${actions}
      </div>
    </div>
    ${i.content ? `<div class="issue-card__content">${escHtml(i.content)}</div>` : ''}
    ${structured}
    <div class="issue-card__meta">${meta}</div>
    ${hasExpandable ? `<div class="issue-card__expand">${t('clickExpand')}</div>` : ''}
  </div>`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderMemoryCard(m) {
  const tags = parseTags(m.tags);
  return `<div class="memory-card" style="cursor:pointer" onclick="if(!event.target.closest('.memory-card__actions')){editMemory('${m.id}')}">
    <div class="memory-card__header">
      <div class="memory-card__header-left">
        <div class="memory-card__id">${m.id}</div>
        <div class="memory-card__tags">${tags.map(tg => `<span class="tag">${escHtml(TAG_I18N[tg] ? t(TAG_I18N[tg]) : tg)}</span>`).join('')}</div>
        <div class="memory-card__time">${formatTime(m.created_at)}</div>
      </div>
      <div class="memory-card__actions">
        <button class="btn btn--ghost btn--sm" onclick="event.stopPropagation();editMemory('${m.id}')">${t('edit')}</button>
        <button class="btn btn--ghost-danger btn--sm" onclick="event.stopPropagation();deleteMemory('${m.id}')">${t('delete')}</button>
      </div>
    </div>
    <div class="memory-card__content">${escHtml(m.content)}</div>
  </div>`;
}

function pagerInfo(total, page, pages) {
  return `${t('total')} ${total} ${t('items')}，${page}/${pages} ${t('page')}`;
}

function buildPagerBtns(page, pages) {
  if (pages <= 7) return Array.from({length: pages}, (_, i) => i + 1);
  const s = new Set([1, pages, page]);
  for (let d = 1; d <= 2; d++) { if (page - d > 1) s.add(page - d); if (page + d < pages) s.add(page + d); }
  const arr = [...s].sort((a, b) => a - b), result = [];
  arr.forEach((n, i) => { if (i > 0 && n - arr[i - 1] > 1) result.push('...'); result.push(n); });
  return result;
}

function renderPager(containerId, page, total, onPage) {
  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  if (pages <= 1) { $(containerId).innerHTML = ''; return; }
  const items = buildPagerBtns(page, pages);
  const btns = items.map(n => n === '...' ? '<span class="pager__ellipsis">…</span>' : `<button class="pager__btn${n === page ? ' pager__btn--active' : ''}" data-page="${n}">${n}</button>`).join('');
  $(containerId).innerHTML = `<span class="pager__info">${pagerInfo(total, page, pages)}</span>${btns}`;
  $(containerId).querySelectorAll('.pager__btn').forEach(btn => {
    btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page)));
  });
}

async function loadMemoriesByScope(scope, listId, pagerId, searchId, countId, pageKey) {
  const query = $(searchId).value;
  const page = state[pageKey];
  const offset = (page - 1) * PAGE_SIZE;
  let params = `memories?scope=${scope}&limit=${PAGE_SIZE}&offset=${offset}`;
  if (query) params += `&query=${encodeURIComponent(query)}`;
  const data = await api(params);
  const memories = data.memories || [];
  const total = data.total || memories.length;

  $(countId).textContent = `${t('total')} ${total} ${t('items')}`;
  $(listId).innerHTML = memories.length
    ? memories.map(renderMemoryCard).join('')
    : `<div class="empty-state">${t('noMemories')}</div>`;

  renderPager(pagerId, page, total, p => { state[pageKey] = p; loadMemoriesByScope(scope, listId, pagerId, searchId, countId, pageKey); });
}

function loadProjectMemories() {
  loadMemoriesByScope('project', '#project-memory-list', '#project-pager', '#project-search', '#project-count', 'projectPage');
}
function loadUserMemories() {
  loadMemoriesByScope('user', '#user-memory-list', '#user-pager', '#user-search', '#user-count', 'userPage');
}

const TAG_I18N = { decision: 'catDecision', modification: 'catModification', pitfall: 'catPitfall', todo: 'catTodo', preference: 'catPreference' };

window.editMemory = async (id) => {
  const m = await api(`memories/${id}`);
  const tags = parseTags(m.tags);
  showModal(t('editMemory'), `
    <div class="form-field"><label class="form-label">${t('content')}</label>
      <textarea class="form-textarea" id="edit-content">${escHtml(m.content)}</textarea></div>
    <div class="form-field"><label class="form-label">${t('tagsCommaSep')}</label>
      <input class="form-input" id="edit-tags" value="${tags.join(', ')}"></div>
  `, async () => {
    const content = $('#edit-content').value;
    const newTags = $('#edit-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    await api(`memories/${id}`, { method: 'PUT', body: { content, tags: newTags } });
    hideModal();
    toast(t('memorySaved'));
    loadProjectMemories();
    loadUserMemories();
  });
};

window.deleteMemory = (id) => {
  showConfirm(t('confirmDelete'), async () => {
    const res = await api(`memories/${id}`, { method: 'DELETE' });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(t('memoryDeleted'));
    loadProjectMemories();
    loadUserMemories();
  });
};

function bindSearchClear(inputId, clearId, pageKey, loadFn) {
  const input = $(inputId), btn = $(clearId);
  const toggle = () => btn.classList.toggle('hidden', !input.value);
  input.addEventListener('input', debounce(() => { toggle(); state[pageKey] = 1; loadFn(); }, 300));
  btn.addEventListener('click', () => { input.value = ''; toggle(); state[pageKey] = 1; loadFn(); });
}
bindSearchClear('#project-search', '#project-search-clear', 'projectPage', loadProjectMemories);
bindSearchClear('#user-search', '#user-search-clear', 'userPage', loadUserMemories);

const MODAL_PAGE_SIZE = 10;

async function showMemoryModal(title, scope, query, page = 1, tag = null) {
  const offset = (page - 1) * MODAL_PAGE_SIZE;
  let params = `memories?scope=${scope}&limit=${MODAL_PAGE_SIZE}&offset=${offset}`;
  if (tag) params += `&tag=${encodeURIComponent(tag)}`;
  else if (query) params += `&query=${encodeURIComponent(query)}`;
  const data = await api(params);
  const memories = data.memories || [];
  const total = data.total || memories.length;
  const pages = Math.ceil(total / MODAL_PAGE_SIZE) || 1;

  const list = memories.length
    ? memories.map(renderMemoryCard).join('')
    : `<div class="empty-state">${t('noMemories')}</div>`;

  let pagerHtml = '';
  if (pages > 1) {
    const items = buildPagerBtns(page, pages);
    const btns = items.map(n => n === '...' ? '<span class="pager__ellipsis">…</span>' : `<button class="pager__btn${n === page ? ' pager__btn--active' : ''}" data-page="${n}">${n}</button>`).join('');
    pagerHtml = `<div class="pager"><span class="pager__info">${pagerInfo(total, page, pages)}</span>${btns}</div>`;
  }

  showModal(title, `<div class="modal-list">${list}</div>${pagerHtml}`);
  $$('#modal-content .pager__btn').forEach(btn => {
    btn.addEventListener('click', () => showMemoryModal(title, scope, query, parseInt(btn.dataset.page), tag));
  });
}

async function showIssueModal(title, status, page = 1) {
  const offset = (page - 1) * MODAL_PAGE_SIZE;
  const url = `issues?status=${status}&limit=${MODAL_PAGE_SIZE}&offset=${offset}`;
  const data = await api(url);
  const issues = data.issues || [];
  const total = data.total || 0;
  const pages = Math.ceil(total / MODAL_PAGE_SIZE) || 1;

  const list = issues.length ? issues.map(i => renderIssueCard(i)).join('') : `<div class="empty-state">${t('noIssues')}</div>`;

  let pagerHtml = '';
  if (pages > 1) {
    const items = buildPagerBtns(page, pages);
    const btns = items.map(n => n === '...' ? '<span class="pager__ellipsis">…</span>' : `<button class="pager__btn${n === page ? ' pager__btn--active' : ''}" data-page="${n}">${n}</button>`).join('');
    pagerHtml = `<div class="pager"><span class="pager__info">${pagerInfo(total, page, pages)}</span>${btns}</div>`;
  }

  showModal(title, `<div class="modal-list">${list}</div>${pagerHtml}`);
  $('#modal-content .pager__btn').forEach(btn => {
    btn.addEventListener('click', () => showIssueModal(title, status, parseInt(btn.dataset.page)));
  });
}

async function loadStats() {
  const [s, statusData] = await Promise.all([api('stats'), api('status')]);

  const alertEl = $('#block-alert-container');
  if (statusData && !statusData.empty && statusData.is_blocked) {
    alertEl.innerHTML = `<div class="block-alert" role="alert" onclick="switchTab('status')" style="cursor:pointer">
      <div class="block-alert__header">
        <span class="block-alert__dot"></span>
        <span class="block-alert__title">${t('blocked')}</span>
      </div>
      <div class="block-alert__reason">${escHtml(statusData.block_reason || '')}</div>
      ${statusData.current_task ? `<div class="block-alert__task"><span class="block-alert__label">${t('currentTask')}</span>${escHtml(statusData.current_task)}</div>` : ''}
    </div>`;
  } else {
    alertEl.innerHTML = `<div class="block-alert block-alert--ok" onclick="switchTab('status')" style="cursor:pointer">
      <div class="block-alert__header">
        <span class="block-alert__dot"></span>
        <span class="block-alert__title">${t('normalStatus')}</span>
      </div>
      ${statusData && statusData.current_task ? `<div class="block-alert__task"><span class="block-alert__label">${t('currentTask')}</span>${escHtml(statusData.current_task)}</div>` : ''}
    </div>`;
  }
  const mem = s.memories || {};
  const issues = s.issues || {};
  const tags = s.tags || {};
  const tagList = Object.entries(tags).sort((a, b) => b[1] - a[1]);

  const cards = [
    { label: t('projectMemories'), num: mem.project || 0, cls: 'blue', action: 'goto-tab', tab: 'project-memories', sub: '' },
    { label: t('globalMemories'), num: mem.user || 0, cls: 'cyan', action: 'goto-tab', tab: 'user-memories', sub: '' },
    { label: i18n.status.pending, num: issues.pending || 0, cls: 'warning', action: 'filter-issues', status: 'pending', sub: `${issues.in_progress || 0} ${i18n.status.in_progress}` },
    { label: i18n.status.completed, num: issues.completed || 0, cls: 'success', action: 'filter-issues', status: 'completed', sub: `${issues.archived || 0} ${i18n.status.archived}` },
  ];

  $('#stats-content').innerHTML = cards.map(c =>
    `<div class="mini-card mini-card--${c.cls}" data-action="${c.action}" data-tab="${c.tab || ''}" data-status="${c.status || ''}">
      <div class="mini-card__label">${c.label}</div>
      <div class="mini-card__number">${c.num}</div>
      ${c.sub ? `<div class="mini-card__sub">${c.sub}</div>` : ''}
    </div>`
  ).join('');

  renderVectorNetwork(tagList);

  const totalCount = (mem.project || 0) + (mem.user || 0) + (issues.pending || 0) + (issues.in_progress || 0) + (issues.completed || 0);
  const oldHint = document.getElementById('empty-stats-hint');
  if (oldHint) oldHint.remove();
  if (totalCount === 0) {
    $('#stats-content').insertAdjacentHTML('afterend', `<div id="empty-stats-hint" class="welcome-guide"><div class="welcome-guide__desc">${t('emptyStatsHint')}</div></div>`);
  }

  $$('#stats-content .mini-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      if (action === 'filter-issues') {
        const labelMap = i18n.status;
        showIssueModal(labelMap[card.dataset.status] || t('issueList'), card.dataset.status);
      } else if (action === 'goto-tab') {
        const tab = card.dataset.tab;
        const scope = tab === 'user-memories' ? 'user' : 'project';
        showMemoryModal(scope === 'user' ? t('globalMemories') : t('projectMemories'), scope, '');
      }
    });
  });
}

function renderVectorNetwork(tagList) {
  const MAX_NODES = 100, FL = 600;
  const items = tagList.slice(0, MAX_NODES);
  const container = $('#vector-network-container');
  if (!items.length) { container.innerHTML = ''; return; }

  const nodeCount = items.length;
  const R = Math.min(200, 80 + nodeCount * 2);

  const maxC = items[0][1], minC = items[items.length - 1][1] || 1;
  const colors = ['#3B82F6','#2563EB','#60A5FA','#818CF8','#A78BFA','#34D399','#F59E0B','#EF4444','#EC4899','#14B8A6','#8B5CF6','#F97316','#06B6D4','#84CC16','#E879F9'];

  const nodes3d = items.map(([label, count], i) => {
    const ratio = maxC === minC ? 0.5 : (count - minC) / (maxC - minC);
    const baseR = 4 + ratio * (nodeCount > 30 ? 8 : 14);
    const phi = Math.acos(1 - 2 * (i + 0.5) / nodeCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    return { label, count, baseR, x: R * Math.sin(phi) * Math.cos(theta), y: R * Math.cos(phi), z: R * Math.sin(phi) * Math.sin(theta), px: 0, py: 0, pz: 0 };
  });

  const edges = [];
  for (let i = 0; i < nodes3d.length; i++) {
    if (i + 1 < nodes3d.length) edges.push([i, i + 1]);
    if (i + 3 < nodes3d.length) edges.push([i, i + 3]);
  }
  if (nodes3d.length > 2) edges.push([nodes3d.length - 1, 0]);

  const vectorSub = t('vectorSub').replace('{n}', nodeCount);
  const moreLink = tagList.length > 0 ? `<a class="vector-network__more" id="vn-show-all">${t('showMore')}</a>` : '';
  container.innerHTML = `
    <div class="vector-network">
      <div class="vector-network__header">
        <div class="vector-network__left">
          <span class="vector-network__label">${t('vectorNetwork')}</span>
          <span class="vector-network__sub">${vectorSub}</span>
        </div>
        ${moreLink}
      </div>
      <svg class="vector-graph" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet"></svg>
    </div>`;

  const W = 800, H = 600;
  const svg = container.querySelector('.vector-graph');
  const ns = 'http://www.w3.org/2000/svg';

  const showAllBtn = container.querySelector('#vn-show-all');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      const html = tagList.length ? `<ul class="stat-list stat-list--tags">${tagList.map(([k, v]) =>
        `<li><a class="stat-link" data-tag="${escHtml(k)}" style="cursor:pointer"><span>${escHtml(k)}</span><span class="tag-count">${v}</span></a></li>`
      ).join('')}</ul>` : `<div class="empty-state">${t('noTags')}</div>`;
      showModal(t('allTags').replace('{n}', tagList.length), html);
      $$('#modal-content .stat-link').forEach(link => {
        link.addEventListener('click', () => { hideModal(); showMemoryModal(t('tagLabel').replace('{name}', link.dataset.tag), 'all', '', 1, link.dataset.tag); });
      });
    });
  }

  const edgeEls = edges.map(([a, b]) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('class', a % 3 === 0 ? 'vg-edge vg-edge--weak' : 'vg-edge');
    svg.appendChild(line);
    return { el: line, a, b };
  });

  const nodeEls = nodes3d.map((n, i) => {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'vg-node');
    const color = colors[i % colors.length];
    const glow = document.createElementNS(ns, 'circle');
    glow.setAttribute('class', 'vg-node__glow');
    glow.style.fill = color + '15';
    const core = document.createElementNS(ns, 'circle');
    core.setAttribute('class', 'vg-node__core');
    core.style.fill = color;
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'vg-node__label');
    text.textContent = n.label;
    g.appendChild(glow); g.appendChild(core); g.appendChild(text);
    svg.appendChild(g);
    return { g, glow, core, text, label: n.label };
  });

  let rotY = 0, rotX = 0.3, autoSpeed = 0.003, isHovering = false;
  let dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0, didDrag = false;

  const update = () => {
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    nodes3d.forEach(n => {
      const x1 = n.x * cosY - n.z * sinY, z1 = n.x * sinY + n.z * cosY;
      n.px = x1; n.py = n.y * cosX - z1 * sinX; n.pz = n.y * sinX + z1 * cosX;
    });

    const order = nodes3d.map((_, i) => i).sort((a, b) => nodes3d[b].pz - nodes3d[a].pz);

    edgeEls.forEach(({ el, a, b }) => {
      const na = nodes3d[a], nb = nodes3d[b];
      const sa = FL / (FL + na.pz), sb = FL / (FL + nb.pz);
      el.setAttribute('x1', (W / 2 + na.px * sa).toFixed(1));
      el.setAttribute('y1', (H / 2 + na.py * sa).toFixed(1));
      el.setAttribute('x2', (W / 2 + nb.px * sb).toFixed(1));
      el.setAttribute('y2', (H / 2 + nb.py * sb).toFixed(1));
      el.style.opacity = (0.08 + 0.25 * ((na.pz + nb.pz) / 2 + R) / (2 * R)).toFixed(2);
    });

    order.forEach(i => {
      const n = nodes3d[i], el = nodeEls[i];
      const s = FL / (FL + n.pz);
      const depth = (n.pz + R) / (2 * R);
      const cr = n.baseR * s, gr = cr * 2.5;
      el.g.setAttribute('transform', `translate(${(W / 2 + n.px * s).toFixed(1)},${(H / 2 + n.py * s).toFixed(1)})`);
      el.g.style.opacity = (0.4 + 0.6 * depth).toFixed(2);
      el.glow.setAttribute('r', gr.toFixed(1));
      el.core.setAttribute('r', cr.toFixed(1));
      el.text.setAttribute('dy', (gr + 10).toFixed(0));
      svg.appendChild(el.g);
    });
  };

  let animId;
  const animate = () => {
    if (!isHovering) rotY += autoSpeed;
    update();
    animId = requestAnimationFrame(animate);
  };

  svg.addEventListener('mouseenter', () => { isHovering = true; });
  svg.addEventListener('mouseleave', () => { isHovering = false; dragging = false; });
  svg.addEventListener('mousedown', (e) => { dragging = true; didDrag = false; startX = e.clientX; startY = e.clientY; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); });
  svg.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (dx * dx + dy * dy > 9) didDrag = true;
    rotY += (e.clientX - lastX) * 0.008;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.clientY - lastY) * 0.008));
    lastX = e.clientX; lastY = e.clientY;
  });
  svg.addEventListener('mouseup', (e) => {
    dragging = false;
    if (!didDrag) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const g = el && el.closest('.vg-node');
      if (g) {
        const idx = nodeEls.findIndex(n => n.g === g);
        if (idx >= 0) showMemoryModal(t('tagLabel').replace('{name}', nodeEls[idx].label), 'all', '', 1, nodeEls[idx].label);
      }
    }
  });

  update();
  animate();

  const observer = new MutationObserver(() => {
    if (!document.contains(svg)) { cancelAnimationFrame(animId); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function loadStatus() {
  const s = await api('status');
  if (s.empty) { $('#status-content').innerHTML = `<div class="empty-state">${t('noStatus')}</div>`; return; }

  const isBlocked = s.is_blocked;
  const dotClass = isBlocked ? 'status-dot--blocked' : 'status-dot--ok';
  const blockText = isBlocked ? `${t('yes')} - ${escHtml(s.block_reason || '')}` : t('no');

  const gridItems = [
    [t('blocked'), `<span class="status-dot ${dotClass}"></span>${blockText}`, 'status-item--alert'],
    [t('currentTask'), escHtml(s.current_task || '-')],
    [t('nextStep'), escHtml(s.next_step || '-')],
    [t('updateTime'), s.updated_at || '-'],
  ];

  const sections = [
    [t('progress'), s.progress],
    [t('recentChanges'), s.recent_changes],
    [t('pending'), s.pending],
  ].filter(([, arr]) => arr && arr.length);

  $('#status-content').innerHTML = `
    <div class="status-grid">
      ${gridItems.map(([label, value, cls]) =>
        `<div class="status-item${cls ? ' ' + cls : ''}">
          <div class="status-item__label">${label}</div>
          <div class="status-item__value">${value}</div>
        </div>`
      ).join('')}
    </div>
    ${sections.map(([title, items]) => `
      <div class="status-section">
        <div class="status-section__title">${title}</div>
        <div class="status-section__list">
          ${items.map(p => `<div class="status-section__item">· ${escHtml(p)}</div>`).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

async function loadIssues() {
  const date = $('#issue-date').value;
  const status = $('#issue-status-filter').value;
  const keyword = $('#issue-search')?.value?.trim() || '';
  const page = state.issuePage;
  const offset = (page - 1) * PAGE_SIZE;
  let url = `issues?limit=${PAGE_SIZE}&offset=${offset}`;
  if (date) url += `&date=${date}`;
  if (status) url += `&status=${status}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
  const data = await api(url);
  const issues = data.issues || [];
  const total = data.total || 0;

  $('#issue-list').innerHTML = issues.length ? issues.map(i => renderIssueCard(i)).join('') : `<div class="empty-state">${t('noIssues')}</div>`;
  renderPager('#issue-pager', page, total, p => { state.issuePage = p; loadIssues(); });
}

$('#issue-date').value = new Date().toISOString().slice(0, 10);
$('#issue-status-filter').value = 'all';
$('#issue-date').addEventListener('change', () => { state.issuePage = 1; loadIssues(); });
$('#issue-status-filter').addEventListener('change', () => { state.issuePage = 1; loadIssues(); });

$('#btn-issue-all')?.addEventListener('click', () => {
  $('#issue-date').value = '';
  $('#issue-status-filter').value = 'all';
  $('#issue-search').value = '';
  $('#issue-search-clear')?.classList.add('hidden');
  state.issuePage = 1;
  loadIssues();
});

$('#btn-issue-today')?.addEventListener('click', () => {
  $('#issue-date').value = new Date().toISOString().slice(0, 10);
  $('#issue-status-filter').value = 'all';
  state.issuePage = 1;
  loadIssues();
});

// status shortcut buttons
for (const [id, val] of [['btn-issue-pending','pending'],['btn-issue-inprogress','in_progress'],['btn-issue-completed','completed'],['btn-issue-archived','archived']]) {
  $(`#${id}`)?.addEventListener('click', () => {
    $('#issue-status-filter').value = val;
    state.issuePage = 1;
    loadIssues();
  });
}

// issue search: debounce input + clear button
const _issueSearchHandler = debounce(() => { state.issuePage = 1; loadIssues(); }, 300);
$('#issue-search')?.addEventListener('input', () => {
  const val = $('#issue-search').value;
  $('#issue-search-clear')?.classList.toggle('hidden', !val);
  _issueSearchHandler();
});
$('#issue-search-clear')?.addEventListener('click', () => {
  $('#issue-search').value = '';
  $('#issue-search-clear').classList.add('hidden');
  state.issuePage = 1;
  loadIssues();
});
$('#btn-issue-search')?.addEventListener('click', () => { state.issuePage = 1; loadIssues(); });
// task search clear button
const _taskSearchHandler = debounce(() => loadTasks(), 300);
$('#task-search-clear')?.addEventListener('click', () => {
  $('#task-search').value = '';
  $('#task-search-clear').classList.add('hidden');
  loadTasks();
});
$('#task-search')?.addEventListener('input', () => {
  const val = $('#task-search').value;
  $('#task-search-clear')?.classList.toggle('hidden', !val);
  _taskSearchHandler();
});

$('#btn-add-issue')?.addEventListener('click', () => {
  showModal(t('addIssue'), `
    <div class="form-field"><label class="form-label">${t('issueTitle')}</label>
      <input class="form-input" id="issue-title-input"></div>
    <div class="form-field"><label class="form-label">${t('issueContent')}</label>
      <textarea class="form-textarea" id="issue-content-input" style="min-height:120px"></textarea></div>
    <div class="form-field"><label class="form-label">${t('issueTags')}</label>
      <input class="form-input" id="issue-tags-input"></div>
  `, async () => {
    const title = $('#issue-title-input').value.trim();
    if (!title) return;
    const content = $('#issue-content-input').value;
    const tags = $('#issue-tags-input').value.split(',').map(s => s.trim()).filter(Boolean);
    const res = await api('issues', { method: 'POST', body: { title, content, tags } });
    hideModal();
    if (res.deduplicated) toast(t('issueDuplicated'), 'warning');
    else toast(t('issueCreated'));
    loadIssues();
  });
  setTimeout(() => { const inp = $('#issue-title-input'); inp && inp.focus(); }, 100);
});

window.editIssueAction = async (issueNum) => {
  const issue = await api(`issues/${issueNum}`);
  if (!issue || issue.error) return;
  const extraFields = [
    ['issueDescription', 'edit-issue-description', issue.description, 80],
    ['issueInvestigation', 'edit-issue-investigation', issue.investigation, 80],
    ['issueRootCause', 'edit-issue-rootcause', issue.root_cause, 60],
    ['issueSolution', 'edit-issue-solution', issue.solution, 60],
    ['issueFilesChanged', 'edit-issue-files', issue.files_changed && issue.files_changed !== '[]' ? issue.files_changed : '', 60],
    ['issueTestResult', 'edit-issue-testresult', issue.test_result, 60],
    ['issueNotes', 'edit-issue-notes', issue.notes, 60],
    ['issueFeatureId', 'edit-issue-featureid', issue.feature_id, 0],
  ];
  const hasExtra = extraFields.some(([,, v]) => v);
  const extraHtml = extraFields.map(([key, id, val, h]) =>
    h ? `<div class="form-field"><label class="form-label">${t(key)}</label><textarea class="form-textarea" id="${id}" style="min-height:${h}px">${escHtml(val || (key === 'issueFilesChanged' ? '[]' : ''))}</textarea></div>`
      : `<div class="form-field"><label class="form-label">${t(key)}</label><input class="form-input" id="${id}" value="${escHtml(val || '')}"></div>`
  ).join('');
  showModal(t('editIssue'), `
    <div class="form-field"><label class="form-label">${t('issueTitle')}</label>
      <input class="form-input" id="edit-issue-title" value="${escHtml(issue.title)}"></div>
    <div class="form-field"><label class="form-label">${t('allStatus')}</label>
      <select class="filter-select" id="edit-issue-status" style="width:100%">
        <option value="pending"${issue.status === 'pending' ? ' selected' : ''}>${t('status.pending')}</option>
        <option value="in_progress"${issue.status === 'in_progress' ? ' selected' : ''}>${t('status.in_progress')}</option>
        <option value="completed"${issue.status === 'completed' ? ' selected' : ''}>${t('status.completed')}</option>
      </select></div>
    <div class="form-field"><label class="form-label">${t('issueContent')}</label>
      <textarea class="form-textarea" id="edit-issue-content" style="min-height:120px">${escHtml(issue.content || '')}</textarea></div>
    <details class="issue-extra-fields" ${hasExtra ? 'open' : ''}>
      <summary class="issue-extra-toggle">${t('moreFields') || '更多字段'}</summary>
      ${extraHtml}
    </details>
    <div class="form-field"><label class="form-label">${t('issueTags')}</label>
      <input class="form-input" id="edit-issue-tags" value="${escHtml(Array.isArray(issue.tags) ? issue.tags.join(', ') : '')}"></div>
  `, async () => {
    const title = $('#edit-issue-title').value.trim();
    if (!title) return;
    const body = {
      title,
      status: $('#edit-issue-status').value,
      content: $('#edit-issue-content').value,
      description: $('#edit-issue-description').value,
      investigation: $('#edit-issue-investigation').value,
      root_cause: $('#edit-issue-rootcause').value,
      solution: $('#edit-issue-solution').value,
      files_changed: $('#edit-issue-files').value,
      test_result: $('#edit-issue-testresult').value,
      notes: $('#edit-issue-notes').value,
      feature_id: $('#edit-issue-featureid').value,
      tags: $('#edit-issue-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    };
    await api(`issues/${issueNum}`, { method: 'PUT', body });
    hideModal();
    toast(t('issueUpdated'));
    loadIssues();
  });
};

window.archiveIssueAction = (issueNum) => {
  showConfirm(t('confirmArchiveIssue'), async () => {
    const res = await api(`issues/${issueNum}?action=archive`, { method: 'DELETE' });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(t('issueArchived'));
    loadIssues();
  }, { btnText: t('archiveIssue'), danger: false });
};

window.deleteIssueAction = (issueNum, isArchived) => {
  showConfirm(t('confirmDeleteIssue'), async () => {
    const url = isArchived ? `issues/${issueNum}?action=delete&archived=true` : `issues/${issueNum}?action=delete`;
    const res = await api(url, { method: 'DELETE' });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(t('issueDeleted'));
    loadIssues();
  });
};

window.viewArchivedIssue = async (issueNum) => {
  const i = await api(`issues/${issueNum}`);
  if (!i || i.error) return;
  const fields = [
    ['issueDescription', i.description],
    ['issueInvestigation', i.investigation],
    ['issueRootCause', i.root_cause],
    ['issueSolution', i.solution],
    ['issueTestResult', i.test_result],
    ['issueNotes', i.notes],
  ];
  const fieldsHtml = fields.map(([key, val]) => val ? `<div class="issue-field"><span class="issue-field__label">${t(key)}</span><div class="issue-field__value">${escHtml(val)}</div></div>` : '').join('');
  const filesHtml = i.files_changed && i.files_changed !== '[]' ? `<div class="issue-field"><span class="issue-field__label">${t('issueFilesChanged')}</span><div class="issue-field__value">${renderFilesChanged(i.files_changed)}</div></div>` : '';
  const featureHtml = i.feature_id ? `<div class="issue-field"><span class="issue-field__label">${t('issueFeatureId')}</span><div class="issue-field__value"><code>${escHtml(i.feature_id)}</code></div></div>` : '';
  const contentHtml = i.content ? `<div class="issue-field"><span class="issue-field__label">${t('issueContent')}</span><div class="issue-field__value" style="white-space:pre-wrap">${escHtml(i.content)}</div></div>` : '';
  const meta = `${i.date} · ${t('archivedAt')} ${i.archived_at || ''}`;
  showModal(`#${i.issue_number} ${escHtml(i.title)}`, `
    <div class="issue-structured">
      ${contentHtml}${fieldsHtml}${filesHtml}${featureHtml}
    </div>
    <div class="issue-card__meta" style="margin-top:12px">${meta}</div>
  `);
  const saveBtn = $('#modal-save');
  saveBtn.style.display = 'block';
  saveBtn.textContent = t('delete');
  saveBtn.className = 'btn btn--danger';
  saveBtn.onclick = () => {
    hideModal();
    showConfirm(t('confirmDeleteIssue'), async () => {
      const res = await api(`issues/${issueNum}?action=delete&archived=true`, { method: 'DELETE' });
      if (res.error) { toast(res.error, 'error'); return; }
      toast(t('issueDeleted'));
      loadIssues();
    });
  };
};

let tagData = [], tagSelected = new Set();

const TASK_STATUS_CLASSES = { pending: 'status--pending', in_progress: 'status--progress', completed: 'status--done', skipped: 'status--skipped' };

window._expandedNodes = new Set();
window._expandedGroups = new Set();

function formatFeatureId(fid) {
  if (fid.startsWith('_sys/digest')) return t('sysDigest');
  if (fid.startsWith('issue/')) return t('issuePrefix') + fid.split('/')[1];
  return fid;
}

window.toggleNodeCollapse = (nodeId) => {
  window._expandedNodes.has(nodeId) ? window._expandedNodes.delete(nodeId) : window._expandedNodes.add(nodeId);
  loadTasks();
};

window.toggleGroupCollapse = (fid) => {
  window._expandedGroups.has(fid) ? window._expandedGroups.delete(fid) : window._expandedGroups.add(fid);
  loadTasks();
};

function renderTaskCard(t_item) {
  const cls = TASK_STATUS_CLASSES[t_item.status] || '';
  const kids = t_item.children || [];
  const editBtn = `<span class="task-action-btn" onclick="event.stopPropagation();editTaskAction(${t_item.id},'${escHtml(t_item.title).replace(/'/g,'\\&#39;')}')" title="${t('editTask')}">✎</span>`;
  const delBtn = `<span class="task-action-btn task-action-btn--danger" onclick="event.stopPropagation();deleteTaskAction(${t_item.id})" title="${t('deleteTask')}">✕</span>`;
  if (kids.length) {
    const done = kids.filter(c => c.status === 'completed').length;
    const collapsed = !window._expandedNodes?.has(t_item.id) ? ' collapsed' : '';
    return `<div class="task-node" data-id="${t_item.id}">
      <div class="task-node-header${collapsed}" onclick="toggleNodeCollapse(${t_item.id})">
        <span class="task-node-toggle">▼</span>
        <span class="task-title">${escHtml(t_item.title)}</span>
        <span class="task-node-progress">${done}/${kids.length}</span>
        <span class="task-status-badge task-status--${t_item.status}">${t('status.' + t_item.status)}</span>
        <span class="task-actions-group">
          <span class="task-action-btn" onclick="event.stopPropagation();addTaskToFeature('${escHtml(t_item.feature_id).replace(/'/g,'\\&#39;')}',${t_item.id})" title="${t('addTask')}">＋</span>
          ${editBtn}${delBtn}
        </span>
      </div>
      <div class="task-children${collapsed ? ' hidden' : ''}">${kids.map(c => {
        const cEditBtn = `<span class="task-action-btn" onclick="event.stopPropagation();editTaskAction(${c.id},'${escHtml(c.title).replace(/'/g,'\\&#39;')}')" title="${t('editTask')}">✎</span>`;
        const cDelBtn = `<span class="task-action-btn task-action-btn--danger" onclick="event.stopPropagation();deleteTaskAction(${c.id})" title="${t('deleteTask')}">✕</span>`;
        return `<div class="task-item ${TASK_STATUS_CLASSES[c.status] || ''}" data-id="${c.id}">
          <span class="task-checkbox" onclick="toggleTaskStatus(${c.id}, '${c.status}')">${c.status === 'completed' ? '☑' : c.status === 'skipped' ? '☒' : '☐'}</span>
          <span class="task-title">${escHtml(c.title)}</span>
          <span class="task-status-badge task-status--${c.status}">${t('status.' + c.status)}</span>
          <span class="task-actions-group">${cEditBtn}${cDelBtn}</span>
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  return `<div class="task-item ${cls}" data-id="${t_item.id}">
    <span class="task-checkbox" onclick="toggleTaskStatus(${t_item.id}, '${t_item.status}')">${t_item.status === 'completed' ? '☑' : t_item.status === 'skipped' ? '☒' : '☐'}</span>
    <span class="task-title">${escHtml(t_item.title)}</span>
    <span class="task-status-badge task-status--${t_item.status}">${t('status.' + t_item.status)}</span>
    <span class="task-actions-group">${editBtn}${delBtn}</span>
  </div>`;
}

async function loadTasks() {
  const featureId = $('#task-feature-filter').value;
  const status = $('#task-status-filter').value;
  const keyword = ($('#task-search')?.value || '').trim().toLowerCase();

  if (status === 'archived') {
    let url = 'tasks/archived?';
    if (featureId) url += `feature_id=${encodeURIComponent(featureId)}`;
    const data = await api(url);
    let tasks = data.tasks || [];
    if (keyword) tasks = tasks.filter(t_item => t_item.title.toLowerCase().includes(keyword) || t_item.children?.some(c => c.title.toLowerCase().includes(keyword)));
    if (!tasks.length) { $('#task-list').innerHTML = `<div class="empty-state">${t('noTasks')}</div>`; return; }
    let html = '';
    for (const node of tasks) {
      const kids = node.children || [];
      const total = kids.length || 1;
      const done = kids.length ? kids.filter(c => c.status === 'completed').length : (node.status === 'completed' ? 1 : 0);
      html += `<div class="task-group task-group--archived">
        <div class="task-group-header">
          <span class="task-group-title">${escHtml(formatFeatureId(node.feature_id))}</span>
          <span class="task-group-header-right">
            <span class="task-group-progress">${done}/${total}</span>
            <span class="task-status-badge task-status--archived">${t('status.archived')}</span>
          </span>
        </div>
        <div class="task-group-items">${kids.length ? kids.map(c => `<div class="task-card task-card--archived"><span class="task-checkbox task-checkbox--${c.status}"></span><span class="task-title">${escHtml(c.title)}</span></div>`).join('') : `<div class="task-card task-card--archived"><span class="task-checkbox task-checkbox--${node.status}"></span><span class="task-title">${escHtml(node.title)}</span></div>`}</div>
      </div>`;
    }
    $('#task-list').innerHTML = html;
    return;
  }

  let url = 'tasks?';
  if (featureId) url += `feature_id=${encodeURIComponent(featureId)}&`;
  if (status) url += `status=${status}`;
  const data = await api(url);
  let tasks = data.tasks || [];

  if (keyword) {
    const matchTask = t_item => {
      if (t_item.title.toLowerCase().includes(keyword)) return true;
      if (t_item.children?.some(c => c.title.toLowerCase().includes(keyword))) return true;
      return false;
    };
    tasks = tasks.filter(matchTask);
  }

  const features = [...new Set(tasks.map(t_item => t_item.feature_id))];
  const filterEl = $('#task-feature-filter');
  const curVal = filterEl.value;
  filterEl.innerHTML = `<option value="" data-i18n="allFeatures">${t('allFeatures')}</option>` +
    features.map(f => `<option value="${escHtml(f)}"${f === curVal ? ' selected' : ''}>${escHtml(f)}</option>`).join('');

  if (!tasks.length) {
    $('#task-list').innerHTML = `<div class="empty-state">${t('noTasks')}</div>`;
    return;
  }

  const grouped = {};
  tasks.forEach(t_item => {
    (grouped[t_item.feature_id] = grouped[t_item.feature_id] || []).push(t_item);
  });

  let html = '';
  for (const [fid, items] of Object.entries(grouped)) {
    let total = 0, done = 0, hasInProgress = false;
    items.forEach(i => {
      const kids = i.children || [];
      if (kids.length) {
        total += kids.length;
        kids.forEach(c => { if (c.status === 'completed') done++; else if (c.status === 'in_progress') hasInProgress = true; });
      } else {
        total++;
        if (i.status === 'completed') done++;
        else if (i.status === 'in_progress') hasInProgress = true;
      }
    });
    const grpStatus = done === total ? 'completed' : hasInProgress || done > 0 ? 'in_progress' : 'pending';
    const grpDate = items.reduce((min, i) => i.created_at < min ? i.created_at : min, items[0].created_at).slice(0, 10);
    const grpCollapsed = !window._expandedGroups.has(fid);
    const addBtn = `<span class="task-action-btn" onclick="event.stopPropagation();addTaskToFeature('${escHtml(fid).replace(/'/g,'\\&#39;')}')" title="${t('addTask')}">＋</span>`;
    const delGrpBtn = `<span class="task-action-btn task-action-btn--danger" onclick="event.stopPropagation();deleteFeatureGroupAction('${escHtml(fid).replace(/'/g,'\\&#39;')}')" title="${t('deleteFeatureGroup')}">✕</span>`;
    html += `<div class="task-group">
      <div class="task-group-header${grpCollapsed ? ' collapsed' : ''}" onclick="toggleGroupCollapse('${escHtml(fid).replace(/'/g,'\\&#39;')}')">
        <span class="task-group-toggle">▼</span>
        <span class="task-group-title">${escHtml(formatFeatureId(fid))}</span>
        <span class="task-group-date">${grpDate}</span>
        <span class="task-group-header-right">
          <span class="task-group-progress">${done}/${total}</span>
          <span class="task-status-badge task-status--${grpStatus}">${t('status.' + grpStatus)}</span>
          <span class="task-actions-group">${addBtn}${delGrpBtn}</span>
        </span>
      </div>
      <div class="task-group-items${grpCollapsed ? ' hidden' : ''}">${items.map(renderTaskCard).join('')}</div>
    </div>`;
  }
  $('#task-list').innerHTML = html;
}

window.toggleTaskStatus = async (id, current) => {
  const next = current === 'completed' ? 'pending' : 'completed';
  await api(`tasks/${id}`, { method: 'PUT', body: { status: next } });
  loadTasks();
};

window.addFeatureGroup = () => {
  const html = `<div class="form-field"><label class="form-label">${t('featureGroupName')}</label><input class="form-input" id="modal-fg-name"></div>
    <div class="form-field"><label class="form-label">${t('taskTitle')}</label><input class="form-input" id="modal-fg-task"></div>`;
  showModal(t('addFeatureGroup'), html, async () => {
    const name = $('#modal-fg-name').value.trim();
    const task = $('#modal-fg-task').value.trim();
    if (!name) return;
    const tasks = task ? [{ title: task }] : [];
    await api('tasks', { method: 'POST', body: { feature_id: name, tasks } });
    hideModal();
    toast(t('featureGroupCreated'));
    loadTasks();
  });
};

window.addTaskToFeature = (featureId, parentId = 0) => {
  const html = `<div class="form-field"><label class="form-label">${t('taskTitle')}</label><input class="form-input" id="modal-task-title"></div>`;
  showModal(t('addTask'), html, async () => {
    const title = $('#modal-task-title').value.trim();
    if (!title) return;
    const tasks = parentId ? [{ title, parent_id: parentId }] : [{ title }];
    await api('tasks', { method: 'POST', body: { feature_id: featureId, tasks } });
    hideModal();
    toast(t('taskCreated'));
    loadTasks();
  });
};

window.editTaskAction = (id, currentTitle) => {
  const decoded = new DOMParser().parseFromString(currentTitle, 'text/html').body.textContent;
  const html = `<div class="form-field"><label class="form-label">${t('taskTitle')}</label><input class="form-input" id="modal-edit-title" value="${escHtml(decoded)}"></div>`;
  showModal(t('editTask'), html, async () => {
    const title = $('#modal-edit-title').value.trim();
    if (!title) return;
    await api(`tasks/${id}`, { method: 'PUT', body: { title } });
    hideModal();
    toast(t('taskUpdated'));
    loadTasks();
  });
};

window.deleteTaskAction = (id) => {
  showConfirm(t('confirmDeleteTask'), async () => {
    await api(`tasks/${id}`, { method: 'DELETE' });
    toast(t('taskDeleted'));
    loadTasks();
  });
};

window.deleteFeatureGroupAction = (featureId) => {
  showConfirm(t('confirmDeleteFeatureGroup'), async () => {
    await api(`tasks?feature_id=${encodeURIComponent(featureId)}`, { method: 'DELETE' });
    toast(t('featureGroupDeleted'));
    loadTasks();
  });
};

$('#task-feature-filter')?.addEventListener('change', loadTasks);
$('#task-status-filter')?.addEventListener('change', loadTasks);

async function loadTags() {
  const query = $('#tag-search')?.value || '';
  const params = query ? `tags?query=${encodeURIComponent(query)}` : 'tags';
  const data = await api(params);
  tagData = data.tags || [];
  tagSelected.clear();
  updateTagBatchBar();
  $('#tag-total-count').textContent = `${t('total')} ${data.total || tagData.length} ${t('tagsUnit')}`;
  $('#tag-select-all').checked = false;
  renderTagTable();
}

function renderTagTable() {
  const tbody = $('#tag-table-body');
  if (!tagData.length) { tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">${t('noTags')}</div></td></tr>`; return; }
  tbody.innerHTML = tagData.map(tg => `
    <tr data-tag="${escHtml(tg.name)}">
      <td><input type="checkbox" class="tag-cell__check" ${tagSelected.has(tg.name) ? 'checked' : ''}></td>
      <td><span class="tag-cell__name">${escHtml(tg.name)}</span></td>
      <td><span class="tag-count">${tg.project_count ? `${tg.project_count} 📁` : ''}${tg.project_count && tg.user_count ? '  ' : ''}${tg.user_count ? `${tg.user_count} 🌐` : ''}</span></td>
      <td class="tag-actions">
        <button class="btn btn--ghost btn--sm tag-rename">${t('rename')}</button>
        <button class="btn btn--ghost btn--sm tag-view" style="color:#60A5FA">${t('view')}</button>
        <button class="btn btn--ghost btn--sm tag-delete" style="color:#F87171">${t('delete')}</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.tag-cell__check').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.closest('tr').dataset.tag;
      cb.checked ? tagSelected.add(name) : tagSelected.delete(name);
      updateTagBatchBar();
    });
  });
  tbody.querySelectorAll('.tag-rename').forEach(btn => {
    btn.addEventListener('click', () => renameTagAction(btn.closest('tr').dataset.tag));
  });
  tbody.querySelectorAll('.tag-view').forEach(btn => {
    btn.addEventListener('click', () => showMemoryModal(t('tagLabel').replace('{name}', btn.closest('tr').dataset.tag), 'all', '', 1, btn.closest('tr').dataset.tag));
  });
  tbody.querySelectorAll('.tag-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTagAction([btn.closest('tr').dataset.tag]));
  });
  tbody.querySelectorAll('tr[data-tag]').forEach(tr => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.tag-cell__check, .tag-actions')) return;
      renameTagAction(tr.dataset.tag);
    });
  });
}

function updateTagBatchBar() {
  const bar = $('#tag-batch-bar');
  if (tagSelected.size > 0) {
    bar.style.display = 'flex';
    $('#tag-selected-count').textContent = tagSelected.size;
  } else {
    bar.style.display = 'none';
  }
}

function renameTagAction(oldName) {
  showModal(t('renameTag'), `
    <div class="form-field"><label class="form-label">${t('currentName')}</label>
      <input class="form-input" value="${escHtml(oldName)}" disabled></div>
    <div class="form-field"><label class="form-label">${t('newName')}</label>
      <input class="form-input" id="rename-new-name" value="${escHtml(oldName)}"></div>
  `, async () => {
    const newName = $('#rename-new-name').value.trim();
    if (!newName || newName === oldName) return;
    await api('tags/rename', { method: 'PUT', body: { old_name: oldName, new_name: newName } });
    hideModal();
    toast(t('tagRenamed'));
    loadTags();
  });
  setTimeout(() => { const inp = $('#rename-new-name'); inp && inp.select(); }, 100);
}

function deleteTagAction(names) {
  showConfirm(t('confirmDeleteTag').replace('{names}', names.join(', ')), async () => {
    const res = await api('tags/delete', { method: 'DELETE', body: { tags: names } });
    if (res.error) { toast(res.error, 'error'); return; }
    toast(t('tagsDeleted'));
    loadTags();
  });
}

$('#tag-select-all')?.addEventListener('change', (e) => {
  tagSelected = e.target.checked ? new Set(tagData.map(tg => tg.name)) : new Set();
  renderTagTable();
  updateTagBatchBar();
});

$('#tag-batch-merge')?.addEventListener('click', () => {
  if (tagSelected.size < 2) return;
  const names = [...tagSelected];
  showModal(t('mergeTags'), `
    <div class="form-field"><label class="form-label">${t('mergeFollowing')}</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${names.map(n => `<span class="tag">${escHtml(n)}</span>`).join('')}</div></div>
    <div class="form-field"><label class="form-label">${t('mergeInto')}</label>
      <input class="form-input" id="merge-target" value="${escHtml(names[0])}"></div>
  `, async () => {
    const target = $('#merge-target').value.trim();
    if (!target) return;
    await api('tags/merge', { method: 'PUT', body: { source_tags: names, target_name: target } });
    hideModal();
    toast(t('tagsMerged'));
    loadTags();
  });
});

$('#tag-batch-delete')?.addEventListener('click', () => {
  if (!tagSelected.size) return;
  deleteTagAction([...tagSelected]);
});

$('#tag-batch-cancel')?.addEventListener('click', () => {
  tagSelected.clear();
  $('#tag-select-all').checked = false;
  renderTagTable();
  updateTagBatchBar();
});

const tagSearchHandler = debounce(() => { loadTags(); }, 300);
$('#tag-search')?.addEventListener('input', () => {
  const val = $('#tag-search').value;
  $('#tag-search-clear').classList.toggle('hidden', !val);
  tagSearchHandler();
});
$('#tag-search-clear')?.addEventListener('click', () => {
  $('#tag-search').value = '';
  $('#tag-search-clear').classList.add('hidden');
  loadTags();
});


async function loadSettings() {
  const el = $('#settings-content');
  if (!el) return;

  // Fetch data in parallel
  const [healthRes, statsRes, backupsRes] = await Promise.all([
    fetch('/api/maintenance/health').then(r => r.json()).catch(() => null),
    fetch('/api/maintenance/stats').then(r => r.json()).catch(() => null),
    fetch('/api/maintenance/backups').then(r => r.json()).catch(() => ({ backups: [] })),
  ]);

  const h = healthRes || {};
  const s = statsRes || {};
  const tc = s.table_counts || {};
  const backups = (backupsRes && backupsRes.backups) || [];
  const username = localStorage.getItem('avm-username') || '';

  el.innerHTML = `
    <div class="settings-section">
      <div class="section-title">${t('language')}</div>
      <div class="settings-card">
        <div id="settings-lang-switcher"></div>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">${t('dbStats')}</div>
      <div class="settings-stats-grid">
        <div class="settings-stat"><div class="settings-stat__label">${t('fileSize')}</div><div class="settings-stat__value blue">${s.file_size_mb || 0} MB</div></div>
        <div class="settings-stat"><div class="settings-stat__label">${t('projectMemories')}</div><div class="settings-stat__value blue">${tc.memories || 0}</div></div>
        <div class="settings-stat"><div class="settings-stat__label">${t('globalMemories')}</div><div class="settings-stat__value green">${tc.user_memories || 0}</div></div>
        <div class="settings-stat"><div class="settings-stat__label">${t('embeddingDim')}</div><div class="settings-stat__value purple">${s.embedding_dim || 0}</div></div>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">${t('healthCheck')}</div>
      <div class="settings-card">
        <div class="settings-health-grid">
          <div class="settings-health-item">
            <span class="settings-health-label">${t('projectMemories')} ${t('embeddingStatus')}</span>
            <span class="settings-health-value ${h.memories_missing ? 'warn' : 'ok'}">${h.vec_memories_total || 0} / ${h.memories_total || 0} ${h.memories_missing ? '(' + h.memories_missing + ' missing)' : '✓'}</span>
          </div>
          <div class="settings-health-item">
            <span class="settings-health-label">${t('globalMemories')} ${t('embeddingStatus')}</span>
            <span class="settings-health-value ${h.user_memories_missing ? 'warn' : 'ok'}">${h.vec_user_memories_total || 0} / ${h.user_memories_total || 0} ${h.user_memories_missing ? '(' + h.user_memories_missing + ' missing)' : '✓'}</span>
          </div>
          <div class="settings-health-item">
            <span class="settings-health-label">${t('orphanVectors')}</span>
            <span class="settings-health-value ${(h.orphan_vec || h.orphan_user_vec) ? 'warn' : 'ok'}">${(h.orphan_vec || 0) + (h.orphan_user_vec || 0)}</span>
          </div>
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button class="btn btn--primary btn--sm" onclick="doRepairWeb()">${t('repairOrphans')}</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">${t('backup')}</div>
      <div class="settings-card">
        <button class="btn btn--primary btn--sm" onclick="doBackupWeb()" style="margin-bottom: 12px;">${t('createBackup')}</button>
        ${backups.length ? '<div class="settings-backup-list">' + backups.slice(0, 5).map(b =>
          '<div class="settings-backup-item"><span>' + b.name + '</span><span class="settings-backup-size">' + b.size_mb + ' MB</span></div>'
        ).join('') + '</div>' : '<div style="color: var(--text-muted); font-size: 13px;">' + t('noBackups') + '</div>'}
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">${t('account')}</div>
      <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div class="avatar">${username ? username.charAt(0).toUpperCase() : 'U'}</div>
          <div><div style="font-weight: 500;">${username || 'User'}</div><div style="font-size: 12px; color: var(--text-muted);">${s.db_path || ''}</div></div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 500; margin-bottom: 8px;">${t('changePassword')}</div>
          <div style="display: flex; flex-direction: column; gap: 8px; max-width: 320px;">
            <input type="password" id="current-password" placeholder="${t('currentPassword')}" class="input" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary);">
            <input type="password" id="new-password" placeholder="${t('newPassword')}" class="input" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary);">
            <input type="password" id="confirm-new-password" placeholder="${t('confirmNewPassword')}" class="input" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary);">
            <button class="btn btn--primary btn--sm" onclick="doChangePassword()" style="align-self: flex-start;">${t('changePassword')}</button>
          </div>
        </div>
        <button class="btn btn--ghost-danger btn--sm" onclick="doLogoutWeb()">${t('auth.logout')}</button>
      </div>
    </div>
  `;

  renderLangSwitcher('settings-lang-switcher');
}

async function doRepairWeb() {
  const res = await fetch('/api/maintenance/repair', { method: 'POST' }).then(r => r.json());
  if (res.error) return toast(res.error, 'error');
  toast(t('repairSuccess') || 'Repair completed: ' + (res.orphans_deleted || 0) + ' orphans deleted', 'success');
  loadSettings();
}

async function doBackupWeb() {
  const res = await fetch('/api/maintenance/backup', { method: 'POST' }).then(r => r.json());
  if (res.error) return toast(res.error, 'error');
  toast(t('backupSuccess') || 'Backup created: ' + res.name, 'success');
  loadSettings();
}

function doLogoutWeb() {
  authToken = '';
  localStorage.removeItem('avm-token');
  localStorage.removeItem('avm-username');
  location.reload();
}

async function doChangePassword() {
  const cur = $('#current-password').value;
  const np = $('#new-password').value;
  const cnp = $('#confirm-new-password').value;
  if (!cur || !np) return toast(t('auth.fieldsRequired'), 'error');
  if (np.length < 6) return toast(t('auth.passwordTooShort'), 'error');
  if (np !== cnp) return toast(t('auth.passwordMismatch'), 'error');
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: authToken, current_password: cur, new_password: np })
  }).then(r => r.json());
  if (res.error) return toast(t('passwordChangeFailed') + ': ' + res.error, 'error');
  toast(t('passwordChanged'), 'success');
  $('#current-password').value = '';
  $('#new-password').value = '';
  $('#confirm-new-password').value = '';
}

function loadTab(tab) {
  ({
    stats: loadStats,
    'project-memories': loadProjectMemories,
    'user-memories': loadUserMemories,
    status: loadStatus,
    issues: loadIssues,
    tags: loadTags,
    tasks: loadTasks,
    settings: loadSettings,
  })[tab]?.();
}

window._reloadCurrentView = () => {
  if (currentProject) {
    const active = $('.nav-item.active');
    if (active) loadTab(active.dataset.tab);
  } else {
    loadProjects();
  }
};

const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

function loadProjects() {
  fetch('/api/projects').then(r => r.json()).then(data => {
    const grid = $('#project-grid');
    const addCard = `<div class="project-card project-card--add" onclick="showAddProjectModal()" style="animation-delay:0s">
      <div class="project-card__icon project-card__icon--add"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
      <div class="project-card__name">${t('addProject')}</div>
    </div>`;
    const cards = data.projects.map((p, i) => `
      <div class="project-card" data-project="${escHtml(p.project_dir)}" style="animation-delay:${(i + 1) * 0.05}s">
        <button class="project-card__delete" onclick="event.stopPropagation();deleteProject('${escHtml(p.project_dir)}','${escHtml(p.name)}')" title="${t('deleteProjectBtn')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <div class="project-card__icon">${folderIcon}</div>
        <div class="project-card__name">${escHtml(p.name)}</div>
        <div class="project-card__path">${escHtml(p.project_dir)}</div>
        <div class="project-card__stats">
          <div class="project-card__stat"><div class="project-card__stat-num project-card__stat-num--blue">${p.memories}</div><div class="project-card__stat-label">${t('memories')}</div></div>
          <div class="project-card__stat"><div class="project-card__stat-num project-card__stat-num--amber">${p.issues}</div><div class="project-card__stat-label">${t('issues')}</div></div>
          <div class="project-card__stat"><div class="project-card__stat-num project-card__stat-num--cyan">${p.tags}</div><div class="project-card__stat-label">${t('tags')}</div></div>
        </div>
      </div>
    `).join('');
    const welcome = data.projects.length === 0 ? `<div class="welcome-guide" style="grid-column:1/-1">
      <div class="welcome-guide__title">${t('welcomeTitle')}</div>
      <div class="welcome-guide__desc">${t('welcomeDesc').replace(/\\n/g, '<br>')}</div>
      <div class="welcome-guide__cmd">${t('welcomeCmd')}</div>
    </div>` : '';
    grid.innerHTML = addCard + cards + welcome;
    $('#project-select-footer').innerHTML = `${t('footer').replace('{n}', data.projects.length)} · <a href="https://github.com/Edlineas/aivectormemory" target="_blank" rel="noopener" style="color:#6366F1;text-decoration:none">GitHub</a>`;
    grid.querySelectorAll('.project-card[data-project]').forEach(card => {
      card.addEventListener('click', () => enterProject(card.dataset.project));
    });
  });
}

function enterProject(projectDir) {
  currentProject = projectDir;
  location.hash = encodeURIComponent(projectDir);
  $('#project-select').style.display = 'none';
  $('#app').style.display = '';
  const info = $('#sidebar-project-info');
  info.style.display = '';
  $('#sidebar-project-name').textContent = projectDir.replace(/\\/g, '/').split('/').pop();
  $$('.nav-item').forEach((el, i) => el.classList.toggle('active', i === 0));
  $$('.tab-panel').forEach(el => el.classList.remove('active'));
  $('#tab-stats').classList.add('active');
  renderLangSwitcher('lang-switcher-sidebar');
  updateSidebarUser(localStorage.getItem('avm-username') || '');
  loadStats();
}

function exitProject() {
  currentProject = null;
  location.hash = '';
  $('#app').style.display = 'none';
  $('#project-select').style.display = '';
  $('#sidebar-project-info').style.display = 'none';
  updateProjectSelectUser(localStorage.getItem('avm-username') || '');
  loadProjects();
}

function showAddProjectModal() {
  const html = `<div class="add-project-form">
    <label>${t('projectPath')}</label>
    <div class="add-project-input-row">
      <input type="text" id="add-project-path" placeholder="${t('addProjectPlaceholder')}" />
      <button class="btn-browse" onclick="browseDirs()">${t('browse')}</button>
    </div>
    <div id="dir-browser" class="dir-browser hidden">
      <div id="dir-browser-path" class="dir-browser__path"></div>
      <div id="dir-browser-list" class="dir-browser__list"></div>
    </div>
  </div>`;
  showModal(t('addProjectTitle'), html, () => {
    const path = $('#add-project-path').value.trim();
    if (!path) return toast(t('pathRequired'), 'error');
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_dir: path }) })
      .then(r => r.json()).then(d => { if (d.success) { hideModal(); toast(t('addProjectSuccess'), 'success'); toast(t('addProjectInstallHint'), 'info'); loadProjects(); } });
  });
}

function browseDirs(path) {
  const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
  fetch(url).then(r => r.json()).then(data => {
    if (data.error) return;
    const browser = $('#dir-browser');
    browser.classList.remove('hidden');
    $('#add-project-path').value = data.path;
    $('#dir-browser-path').textContent = data.path;
    const parentPath = data.path.replace(/\/[^/]+\/?$/, '') || '/';
    const items = [`<div class="dir-browser__item dir-browser__item--parent" onclick="browseDirs('${escHtml(parentPath)}')">⬆ ${t('parentDir')}</div>`];
    data.dirs.forEach(d => {
      const full = data.path.replace(/\/$/, '') + '/' + d;
      items.push(`<div class="dir-browser__item" onclick="event.stopPropagation();$('#add-project-path').value='${escHtml(full)}';browseDirs('${escHtml(full)}')">${escHtml(d)}</div>`);
    });
    $('#dir-browser-list').innerHTML = items.join('');
  });
}
window.showAddProjectModal = showAddProjectModal;
window.browseDirs = browseDirs;

window.deleteProject = function(projectDir, name) {
  showConfirm(t('confirmDeleteProject').replace('{name}', name), () => {
    fetch('/api/projects/' + encodeURIComponent(projectDir), { method: 'DELETE' })
      .then(r => r.json())
      .then(d => { if (d.success) loadProjects(); else toast(d.error || 'Failed', 'error'); });
  });
};


$('#sidebar-project-info')?.addEventListener('click', exitProject);

// 导出
$('#btn-export')?.addEventListener('click', async () => {
  const data = await api('export?scope=project');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aivectormemory-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t('exportSuccess'));
});

// 导入
$('#btn-import')?.addEventListener('click', () => $('#import-file').click());
$('#import-file')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const body = JSON.parse(text);
    const res = await api('import', { method: 'POST', body });
    if (res.imported !== undefined) {
      toast(t('importSuccess').replace('{n}', res.imported));
      loadProjectMemories();
    } else {
      toast(t('importFailed'), 'error');
    }
  } catch { toast(t('importFailed'), 'error'); }
  e.target.value = '';
});

// ============== Auth ==============

let authToken = localStorage.getItem('avm-token') || '';
let authMode = 'login'; // 'login' | 'register'

function showAuthPage() {
  $('#auth-page').style.display = '';
  $('#project-select').style.display = 'none';
  $('#app').style.display = 'none';
  renderAuthForm();
}

function hideAuthPage() {
  $('#auth-page').style.display = 'none';
}

function renderAuthForm() {
  const isLogin = authMode === 'login';
  $('#auth-title').textContent = t(isLogin ? 'auth.login' : 'auth.createAccount');
  $('#auth-desc').textContent = t(isLogin ? 'auth.loginDesc' : 'auth.createAccountDesc');
  $('#auth-submit').textContent = t(isLogin ? 'auth.login' : 'auth.createAccount');
  $('#auth-confirm-group').style.display = isLogin ? 'none' : '';
  $('#auth-error').style.display = 'none';
  $('#auth-username').value = '';
  $('#auth-password').value = '';
  $('#auth-confirm-password').value = '';
  $('#auth-switch').innerHTML = isLogin
    ? `${t('auth.noAccount')} <button class="btn-link" onclick="switchAuthMode('register')">${t('auth.register')}</button>`
    : `${t('auth.hasAccount')} <button class="btn-link" onclick="switchAuthMode('login')">${t('auth.login')}</button>`;
}

window.switchAuthMode = function(mode) {
  authMode = mode;
  renderAuthForm();
};

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  const errEl = $('#auth-error');

  if (!username || !password) {
    errEl.textContent = t('auth.fieldsRequired');
    errEl.style.display = '';
    return;
  }

  if (authMode === 'register') {
    if (password.length < 6) {
      errEl.textContent = t('auth.passwordTooShort');
      errEl.style.display = '';
      return;
    }
    if (password !== $('#auth-confirm-password').value) {
      errEl.textContent = t('auth.passwordMismatch');
      errEl.style.display = '';
      return;
    }
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then(r => r.json());
    if (res.error) {
      errEl.textContent = res.error;
      errEl.style.display = '';
      return;
    }
  }

  const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then(r => r.json());
  if (res.error) {
    errEl.textContent = res.error;
    errEl.style.display = '';
    return;
  }

  authToken = res.token;
  localStorage.setItem('avm-token', authToken);
  localStorage.setItem('avm-username', username);
  updateSidebarUser(username);
  updateProjectSelectUser(username);
  hideAuthPage();
  const hp = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
  hp ? enterProject(hp) : (($('#project-select').style.display = ''), loadProjects());
});


function updateSidebarUser(username) {
  const nameEl = $('#sidebar-user-name');
  const avatarEl = $('#sidebar-avatar');
  const projEl = $('#sidebar-user-project');
  if (nameEl && username) {
    nameEl.textContent = username;
    avatarEl.textContent = username.charAt(0).toUpperCase();
  }
  if (projEl && currentProject) {
    projEl.textContent = currentProject.replace(/\\/g, '/').split('/').pop();
  }
}

function updateProjectSelectUser(username) {
  const el = $('#project-select-user');
  if (!el || !username) return;
  el.innerHTML = `<div class="avatar">${username.charAt(0).toUpperCase()}</div><span>${username}</span><button class="btn btn--ghost-danger" onclick="doLogoutWeb()">${t('auth.logout')}</button>`;
}

async function checkAuth() {
  if (!authToken) return showAuthPage();
  try {
    const res = await fetch(`/api/auth/me?token=${encodeURIComponent(authToken)}`).then(r => r.json());
    if (res.error) {
      authToken = '';
      localStorage.removeItem('avm-token');
      return showAuthPage();
    }
    if (res.username) localStorage.setItem('avm-username', res.username);
    const uname = res.username || localStorage.getItem('avm-username') || '';
    updateSidebarUser(uname);
    updateProjectSelectUser(uname);
    hideAuthPage();
    const hp = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    hp ? enterProject(hp) : (($('#project-select').style.display = ''), loadProjects());
  } catch {
    showAuthPage();
  }
}

// 初始化
initLangFromServer();
setLang(currentLang);
renderLangSwitcher('lang-switcher-project');

checkAuth();
