<script lang="ts" setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../stores/project'
import { useAuthStore } from '../../stores/auth'
import { LaunchWebDashboard, StopWebDashboard, IsWebDashboardRunning } from '../../../wailsjs/go/main/App'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()
const webRunning = ref(false)

onMounted(async () => {
  try { webRunning.value = await IsWebDashboardRunning() } catch {}
})

const projectName = computed(() => {
  const dir = projectStore.current
  return dir ? dir.split('/').filter(Boolean).pop() || dir : ''
})

const userInitial = computed(() => (authStore.username || 'U')[0].toUpperCase())

const memoryNav: { name: string; icon: string; key?: string }[] = [
  { name: 'stats', icon: 'grid' },
  { name: 'status', key: 'sessionStatus', icon: 'activity' },
  { name: 'issues', key: 'issueTracking', icon: 'alert-circle' },
  { name: 'tasks', key: 'taskManagement', icon: 'check-square' },
  { name: 'project-memories', key: 'projectMemories', icon: 'folder' },
  { name: 'user-memories', key: 'globalMemories', icon: 'user' },
  { name: 'tags', key: 'tagManagement', icon: 'tag' },
]

const systemNav: { name: string; icon: string; key?: string }[] = [
  { name: 'settings', key: 'systemSettings', icon: 'settings' },
]

function isActive(name: string) { return route.name === name }
function navigate(name: string) { router.push({ name }) }

function goBack() {
  projectStore.setCurrent('')
  router.push('/')
}

async function doLogout() {
  await authStore.logout()
  window.location.reload()
}

async function toggleWebDashboard() {
  try {
    if (webRunning.value) { await StopWebDashboard(); webRunning.value = false }
    else { await LaunchWebDashboard(); webRunning.value = true }
  } catch {}
}
</script>

<template>
  <aside class="sidebar">
    <a class="sidebar-logo" @click="goBack">
      <svg viewBox="0 0 28 28" fill="none" width="24" height="24">
        <line x1="14" y1="6" x2="6" y2="16" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
        <line x1="14" y1="6" x2="22" y2="16" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
        <line x1="6" y1="16" x2="22" y2="16" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
        <line x1="14" y1="6" x2="14" y2="24" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
        <circle cx="14" cy="6" r="3.5" fill="currentColor"/>
        <circle cx="6" cy="16" r="3" fill="currentColor"/>
        <circle cx="22" cy="16" r="3" fill="currentColor"/>
        <circle cx="14" cy="24" r="2.5" fill="currentColor"/>
      </svg>
      AIVectorMemory
    </a>

    <ul class="nav-list">
      <li class="nav-section-label">Memory</li>
      <li
        v-for="item in memoryNav" :key="item.name"
        class="nav-item" :class="{ active: isActive(item.name) }"
        @click="navigate(item.name)"
      >
        <svg v-if="item.icon === 'grid'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <svg v-else-if="item.icon === 'activity'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <svg v-else-if="item.icon === 'alert-circle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <svg v-else-if="item.icon === 'check-square'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <svg v-else-if="item.icon === 'folder'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <svg v-else-if="item.icon === 'user'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <svg v-else-if="item.icon === 'tag'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <span>{{ t(item.key || item.name) }}</span>
      </li>

      <li class="nav-section-label">System</li>
      <li
        v-for="item in systemNav" :key="item.name"
        class="nav-item" :class="{ active: isActive(item.name) }"
        @click="navigate(item.name)"
      >
        <span>{{ t(item.key || item.name) }}</span>
      </li>
    </ul>

    <div class="sidebar-bottom">
      <div class="sidebar-user" @click="toggleWebDashboard" :title="t('webDashboard')">
        <div class="avatar">{{ userInitial }}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">{{ authStore.username || 'Guest' }}</div>
          <div class="sidebar-user-project">{{ projectName }}</div>
        </div>
        <span v-if="webRunning" class="web-dot" title="Web Dashboard Running"></span>
      </div>
      <button class="sidebar-logout" @click.stop="doLogout" :title="t('auth.logout')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>

    <div class="sidebar-decor">
      <svg viewBox="0 0 192 50" fill="none">
        <line class="edge-flow" x1="20" y1="25" x2="55" y2="12" stroke="#3B82F6" stroke-width="1"/>
        <line class="edge-flow" x1="55" y1="12" x2="96" y2="35" stroke="#818CF8" stroke-width="1"/>
        <line class="edge-flow" x1="96" y1="35" x2="140" y2="18" stroke="#3B82F6" stroke-width="1"/>
        <line class="edge-flow" x1="140" y1="18" x2="172" y2="30" stroke="#06B6D4" stroke-width="1"/>
        <circle class="node-pulse" cx="20" cy="25" r="3" fill="#6366F1"/>
        <circle class="node-pulse" cx="55" cy="12" r="3.5" fill="#818CF8"/>
        <circle class="node-pulse" cx="96" cy="35" r="3" fill="#3B82F6"/>
        <circle class="node-pulse" cx="140" cy="18" r="3.5" fill="#06B6D4"/>
        <circle class="node-pulse" cx="172" cy="30" r="2.5" fill="#818CF8"/>
      </svg>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--bg-surface);
}
.sidebar-logo {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  border-bottom: 1px solid var(--bg-surface);
  letter-spacing: -0.3px;
  text-decoration: none;
  cursor: pointer;
}
.nav-list { list-style: none; padding: 8px 0; flex: 1; overflow-y: auto; }
.nav-section-label {
  padding: 16px 20px 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.nav-section-label:first-child { padding-top: 8px; }
.nav-item {
  padding: 9px 20px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 10px;
  border-left: 3px solid transparent;
}
.nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }
.nav-item:hover { background: var(--accent-bg-subtle); color: var(--text-primary); }
.nav-item.active {
  background: var(--accent-bg-light);
  color: var(--text-primary);
  border-left-color: var(--accent);
  font-weight: 500;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.15s;
}
.sidebar-user:hover { background: hsl(0 0% 100% / 0.03); }
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--color-purple));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.sidebar-user-info { flex: 1; min-width: 0; }
.sidebar-user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-user-project {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.web-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
  animation: pulse 2s infinite;
}
.sidebar-bottom {
  display: flex;
  align-items: center;
  border-top: 1px solid var(--bg-surface);
}
.sidebar-logout {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  margin-right: 8px;
  color: var(--text-muted);
  transition: color 0.15s;
  flex-shrink: 0;
}
.sidebar-logout:hover { color: var(--color-danger); }
.sidebar-logout svg { width: 18px; height: 18px; }

.sidebar-decor {
  padding: 10px 16px 14px;
  border-top: 1px solid var(--bg-surface);
  opacity: 0.5;
}
.sidebar-decor svg { width: 100%; height: 50px; }
.node-pulse { animation: nodePulse 3s ease-in-out infinite; }
.node-pulse:nth-child(2) { animation-delay: 0.6s; }
.node-pulse:nth-child(3) { animation-delay: 1.2s; }
.node-pulse:nth-child(4) { animation-delay: 1.8s; }
.edge-flow { opacity: 0.3; stroke-dasharray: 4 4; animation: edgeFlow 4s linear infinite; }
</style>
