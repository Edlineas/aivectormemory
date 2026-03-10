<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { useThemeStore, type ThemeMode } from '../stores/theme'
import { useAuthStore } from '../stores/auth'
import { LANGS } from '../i18n'
import {
  DetectPython, SetAutoStart, SetLanguage,
  LaunchWebDashboard, StopWebDashboard, IsWebDashboardRunning, OpenWebDashboard,
  HealthCheck, GetDBStats, RepairMissingEmbeddings, RebuildAllEmbeddings,
  BackupDB, RestoreDB, ListBackups,
} from '../../wailsjs/go/main/App'
import Badge from '../components/common/Badge.vue'
import Modal from '../components/layout/Modal.vue'

const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const themeStore = useThemeStore()
const authStore = useAuthStore()

const settings = computed(() => settingsStore.settings)
const detectedPython = ref('')
const webDashboardRunning = ref(false)

// Maintenance state
const dbStats = ref<any>(null)
const health = ref<any>(null)
const backups = ref<any[]>([])
const maintLoading = ref(true)
const repairing = ref(false)
const rebuilding = ref(false)
const confirmRebuildShow = ref(false)
const confirmRestoreShow = ref(false)
const restoreFile = ref('')

onMounted(async () => {
  try { detectedPython.value = await DetectPython() } catch {}
  try { webDashboardRunning.value = await IsWebDashboardRunning() } catch {}
  await loadMaintenance()
})

// --- Settings handlers ---
function onThemeChange(e: Event) {
  const mode = (e.target as HTMLSelectElement).value as ThemeMode
  themeStore.setMode(mode)
  settingsStore.save({ theme: mode })
}

function onLangChange(e: Event) {
  const lang = (e.target as HTMLSelectElement).value
  locale.value = lang
  settingsStore.save({ language: lang })
  SetLanguage(lang).catch((err: Error) => console.error('SetLanguage failed:', err))
}

function onDBPathChange(e: Event) { settingsStore.save({ db_path: (e.target as HTMLInputElement).value }) }
function onPythonChange(e: Event) { settingsStore.save({ python_path: (e.target as HTMLInputElement).value }) }
function onPortChange(e: Event) { settingsStore.save({ web_port: parseInt((e.target as HTMLInputElement).value) || 9080 }) }

async function onAutoStartChange(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  try {
    await SetAutoStart(checked)
    settingsStore.save({ auto_start: checked })
  } catch (err: any) { window.__toast?.show(err?.message || 'Failed', 'error') }
}

async function toggleWebDashboard() {
  try {
    if (webDashboardRunning.value) {
      await StopWebDashboard(); webDashboardRunning.value = false
      window.__toast?.show(t('webDashboardStopped'), 'success')
    } else {
      await LaunchWebDashboard(); webDashboardRunning.value = true
      window.__toast?.show(t('webDashboardRunning'), 'success')
    }
  } catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
}

async function openDashboard() {
  try { await OpenWebDashboard() } catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
}

async function doLogout() {
  await authStore.logout()
  window.location.reload()
}

// --- Maintenance handlers ---
async function loadMaintenance() {
  maintLoading.value = true
  try {
    const [s, h, b] = await Promise.all([GetDBStats(), HealthCheck(), ListBackups()])
    dbStats.value = s; health.value = h; backups.value = b || []
  } catch {}
  maintLoading.value = false
}

async function doRepair() {
  repairing.value = true
  try { await RepairMissingEmbeddings(); window.__toast?.show(t('opSuccess'), 'success'); await loadMaintenance() }
  catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
  repairing.value = false
}

async function doRebuild() {
  confirmRebuildShow.value = false; rebuilding.value = true
  try { await RebuildAllEmbeddings(); window.__toast?.show(t('opSuccess'), 'success'); await loadMaintenance() }
  catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
  rebuilding.value = false
}

async function doBackup() {
  try { await BackupDB(); window.__toast?.show(t('backupSuccess'), 'success'); backups.value = await ListBackups() || [] }
  catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
}

function openRestore(file: string) { restoreFile.value = file; confirmRestoreShow.value = true }

async function doRestore() {
  confirmRestoreShow.value = false
  try { await RestoreDB(restoreFile.value); window.__toast?.show(t('restoreSuccess'), 'success'); await loadMaintenance() }
  catch (e: any) { window.__toast?.show(e?.message || 'Failed', 'error') }
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i ? 1 : 0)} ${units[i]}`
}
</script>

<template>
  <div class="settings-view">
    <!-- Appearance -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('appearance') }}</h3>
      <div class="settings-row">
        <label class="settings-label">{{ t('appearance') }}</label>
        <select class="filter-select" :value="settings.theme" @change="onThemeChange">
          <option value="dark">{{ t('themeDark') }}</option>
          <option value="light">{{ t('themeLight') }}</option>
          <option value="system">{{ t('themeSystem') }}</option>
        </select>
      </div>
      <div class="settings-row">
        <label class="settings-label">{{ t('language') }}</label>
        <select class="filter-select" :value="locale" @change="onLangChange">
          <option v-for="(lang, code) in LANGS" :key="code" :value="code">{{ lang.label }}</option>
        </select>
      </div>
    </section>

    <!-- Data -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('dataSettings') }}</h3>
      <div class="settings-row">
        <label class="settings-label">{{ t('dbPath') }}</label>
        <input class="form-input" :value="settings.db_path" @change="onDBPathChange" placeholder="~/.aivectormemory/memory.db" />
      </div>
      <div class="settings-row">
        <label class="settings-label">{{ t('pythonPath') }}</label>
        <input class="form-input" :value="settings.python_path" @change="onPythonChange" :placeholder="detectedPython || 'python3'" />
        <span v-if="detectedPython && !settings.python_path" class="settings-hint">{{ t('autoDetected') }}: {{ detectedPython }}</span>
      </div>
    </section>

    <!-- Web Dashboard -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('webDashboard') }}</h3>
      <div class="settings-row">
        <label class="settings-label">{{ t('port') }}</label>
        <input class="form-input" type="number" :value="settings.web_port" @change="onPortChange" style="width: 120px" />
      </div>
      <div class="settings-row">
        <label class="settings-label">{{ t('webDashboard') }}</label>
        <button class="btn" :class="webDashboardRunning ? 'btn--danger' : 'btn--primary'" @click="toggleWebDashboard">
          {{ webDashboardRunning ? t('stopWebDashboard') : t('launchWebDashboard') }}
        </button>
        <button v-if="webDashboardRunning" class="btn btn--primary" style="margin-left: 8px" @click="openDashboard">
          {{ t('openWebDashboard') }}
        </button>
      </div>
    </section>

    <!-- System -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('system') }}</h3>
      <div class="settings-row">
        <label class="settings-label">{{ t('autoStart') }}</label>
        <label class="toggle">
          <input type="checkbox" :checked="settings.auto_start" @change="onAutoStartChange" />
          <span class="toggle__slider" />
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-label">{{ t('auth.logout') }}</label>
        <button class="btn btn--outline" @click="doLogout">{{ t('auth.logout') }}</button>
      </div>
    </section>

    <!-- Database & Health -->
    <section class="settings-section">
      <h3 class="section-title">
        {{ t('dbOverview') }}
        <button class="btn btn--ghost btn--sm" @click="loadMaintenance">{{ t('refresh') }}</button>
      </h3>
      <div v-if="maintLoading" class="empty-state" style="padding: 12px">Loading...</div>
      <template v-else>
        <div class="info-grid" v-if="dbStats">
          <div class="info-item">
            <span class="info-label">{{ t('fileSize') }}</span>
            <span class="info-value">{{ formatSize(dbStats.file_size) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dbPath') }}</span>
            <span class="info-value mono">{{ dbStats.path }}</span>
          </div>
          <div v-if="dbStats.tables" class="info-item" style="grid-column: 1/-1">
            <span class="info-label">{{ t('tableCounts') }}</span>
            <div class="table-counts">
              <span v-for="(count, name) in dbStats.tables" :key="name" class="table-count-item">
                <span class="table-name">{{ name }}</span>
                <span class="table-num">{{ count }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- Health Check -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('healthCheck') }}</h3>
      <template v-if="!maintLoading">
        <div v-if="health" class="health-grid">
          <div class="health-item">
            <span>{{ t('memoriesConsistency') }}</span>
            <Badge :type="health.memories_total === health.vec_memories_total ? 'success' : 'warning'">{{ health.memories_total === health.vec_memories_total ? 'OK' : 'Mismatch' }}</Badge>
          </div>
          <div class="health-item">
            <span>{{ t('userMemoriesConsistency') }}</span>
            <Badge :type="health.user_memories_total === health.vec_user_memories_total ? 'success' : 'warning'">{{ health.user_memories_total === health.vec_user_memories_total ? 'OK' : 'Mismatch' }}</Badge>
          </div>
          <div class="health-item">
            <span>{{ t('missingEmbeddings') }}</span>
            <Badge :type="((health.memories_missing || 0) + (health.user_memories_missing || 0)) === 0 ? 'success' : 'warning'">{{ (health.memories_missing || 0) + (health.user_memories_missing || 0) }}</Badge>
          </div>
          <div class="health-item">
            <span>{{ t('orphanVectors') }}</span>
            <Badge :type="((health.orphan_vec || 0) + (health.orphan_user_vec || 0)) === 0 ? 'success' : 'warning'">{{ (health.orphan_vec || 0) + (health.orphan_user_vec || 0) }}</Badge>
          </div>
        </div>
        <div class="health-actions">
          <button class="btn btn--outline" :disabled="repairing" @click="doRepair">
            {{ repairing ? '...' : t('repairEmbeddings') }}
          </button>
          <button class="btn btn--outline" :disabled="rebuilding" @click="confirmRebuildShow = true">
            {{ rebuilding ? '...' : t('rebuildEmbeddings') }}
          </button>
        </div>
      </template>
    </section>

    <!-- Backup -->
    <section class="settings-section">
      <h3 class="section-title">
        {{ t('backupManagement') }}
        <button class="btn btn--primary btn--sm" @click="doBackup">{{ t('backupDB') }}</button>
      </h3>
      <div v-if="backups.length === 0" class="empty-state" style="padding: 12px">{{ t('noBackups') }}</div>
      <ul v-else class="backup-list">
        <li v-for="b in backups" :key="b.name || b">
          <span class="backup-name">{{ b.name || b }}</span>
          <span v-if="b.size" class="backup-size">{{ formatSize(b.size) }}</span>
          <button class="btn btn--ghost btn--sm" @click="openRestore(b.name || b)">{{ t('restoreDB') }}</button>
        </li>
      </ul>
    </section>

    <!-- About -->
    <section class="settings-section">
      <h3 class="section-title">{{ t('about') }}</h3>
      <div class="settings-row">
        <label class="settings-label">{{ t('version') }}</label>
        <span class="settings-value">1.0.0</span>
      </div>
    </section>

    <!-- Modals -->
    <Modal :show="confirmRebuildShow" :title="t('rebuildEmbeddings')" :confirm-text="t('confirm')" danger @close="confirmRebuildShow = false" @confirm="doRebuild">
      <p>{{ t('confirmRebuild') }}</p>
    </Modal>
    <Modal :show="confirmRestoreShow" :title="t('restoreDB')" :confirm-text="t('confirm')" danger @close="confirmRestoreShow = false" @confirm="doRestore">
      <p>{{ t('confirmRestore') }}</p>
    </Modal>
  </div>
</template>

<style scoped>
.settings-view { display: flex; flex-direction: column; flex: 1; max-width: 700px; }
.settings-section { margin-bottom: 28px; }
.section-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 12px; display: flex; align-items: center; gap: 12px;
}
.settings-row { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.settings-label { font-size: 13px; color: var(--text-secondary); min-width: 120px; flex-shrink: 0; }
.settings-value { font-size: 14px; color: var(--text-primary); }
.settings-hint { font-size: 11px; color: var(--text-muted); }
.settings-row .form-input { flex: 1; }
.settings-row .filter-select { min-width: 160px; }

/* Toggle switch */
.toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle__slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--border); border-radius: 12px; transition: 0.3s;
}
.toggle__slider::before {
  content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px;
  background: white; border-radius: 50%; transition: 0.3s;
}
.toggle input:checked + .toggle__slider { background: var(--accent); }
.toggle input:checked + .toggle__slider::before { transform: translateX(20px); }

/* Maintenance sections */
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item { background: var(--bg-primary); border-radius: var(--radius-sm); padding: 12px 16px; }
.info-label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.info-value { font-size: 14px; color: var(--text-primary); }
.info-value.mono { font-size: 12px; word-break: break-all; }
.table-counts { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.table-count-item { display: flex; align-items: center; gap: 6px; }
.table-name { font-size: 12px; color: var(--text-secondary); }
.table-num { font-size: 14px; font-weight: 600; color: var(--accent); }

.health-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.health-item {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-primary); border-radius: var(--radius-sm);
  padding: 12px 16px; font-size: 13px; color: var(--text-primary);
}
.health-actions { display: flex; gap: 12px; }

.backup-list { list-style: none; padding: 0; }
.backup-list li {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  background: var(--bg-primary); border-radius: var(--radius-sm);
  margin-bottom: 8px; font-size: 13px;
}
.backup-name { font-size: 12px; color: var(--text-primary); flex: 1; }
.backup-size { font-size: 12px; color: var(--text-muted); }
</style>
