<script lang="ts" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Badge from '../common/Badge.vue'

const { t } = useI18n()

const props = defineProps<{
  task: any
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', task: any): void
  (e: 'edit', task: any): void
  (e: 'delete', task: any): void
}>()

const expanded = ref(false)

const statusIcon: Record<string, string> = {
  pending: '\u25CB',
  in_progress: '\u25D4',
  completed: '\u2714',
  done: '\u2714',
  skipped: '\u2718',
  archived: '\u25CF',
}

const statusBadge: Record<string, 'warning' | 'info' | 'success' | 'muted'> = {
  pending: 'warning',
  in_progress: 'info',
  completed: 'success',
  done: 'success',
  skipped: 'muted',
  archived: 'muted',
}

function childProgress() {
  const kids = props.task.children || []
  const done = kids.filter((c: any) => c.status === 'completed' || c.status === 'done').length
  return `${done}/${kids.length}`
}

function nodeStatus(): 'success' | 'info' | 'warning' | 'muted' {
  const kids = props.task.children || []
  const done = kids.filter((c: any) => c.status === 'completed' || c.status === 'done').length
  if (done === kids.length && kids.length > 0) return 'success'
  if (done > 0) return 'info'
  return 'warning'
}
</script>

<template>
  <!-- Parent node with children -->
  <div v-if="task.children?.length" class="task-node">
    <div :class="['task-node-header', !expanded && 'collapsed']" @click="expanded = !expanded">
      <span class="task-node-toggle">&#x25BC;</span>
      <span class="task-title">{{ task.title }}</span>
      <span class="task-node-progress">{{ childProgress() }}</span>
      <Badge :type="nodeStatus()">{{ t(`status.${nodeStatus() === 'success' ? 'completed' : nodeStatus() === 'info' ? 'in_progress' : 'pending'}`) }}</Badge>
      <div v-if="!readonly" class="task-actions-group" @click.stop>
        <button class="btn btn--ghost btn--sm" @click="emit('edit', task)">{{ t('edit') }}</button>
        <button class="btn btn--ghost-danger btn--sm" @click="emit('delete', task)">{{ t('delete') }}</button>
      </div>
    </div>
    <div v-if="expanded" class="task-children">
      <div
        v-for="child in task.children" :key="child.id"
        :class="['task-item', `status--${child.status}`]"
      >
        <span class="task-checkbox" @click.stop="!readonly && emit('toggle', child)">{{ statusIcon[child.status] || '\u25CB' }}</span>
        <span class="task-title">{{ child.title }}</span>
        <Badge v-if="child.status && child.status !== 'pending'" :type="statusBadge[child.status] || 'muted'">
          {{ t(`status.${child.status}`) }}
        </Badge>
        <div v-if="!readonly" class="task-actions-group" @click.stop>
          <button class="btn btn--ghost btn--sm" @click="emit('edit', child)">{{ t('edit') }}</button>
          <button class="btn btn--ghost-danger btn--sm" @click="emit('delete', child)">{{ t('delete') }}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Leaf node (no children) -->
  <div v-else :class="['task-item', `status--${task.status}`]">
    <span class="task-checkbox" @click.stop="!readonly && emit('toggle', task)">{{ statusIcon[task.status] || '\u25CB' }}</span>
    <span class="task-title">{{ task.title }}</span>
    <Badge v-if="task.status && task.status !== 'pending'" :type="statusBadge[task.status] || 'muted'">
      {{ t(`status.${task.status}`) }}
    </Badge>
    <div v-if="!readonly" class="task-actions-group" @click.stop>
      <button class="btn btn--ghost btn--sm" @click="emit('edit', task)">{{ t('edit') }}</button>
      <button class="btn btn--ghost-danger btn--sm" @click="emit('delete', task)">{{ t('delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.task-node { border-bottom: 1px solid var(--border); }
.task-node:last-child { border-bottom: none; }
.task-node-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; cursor: pointer; transition: background 0.15s;
}
.task-node-header:hover { background: var(--accent-bg-subtle); }
.task-node-toggle { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; display: inline-block; width: 16px; text-align: center; flex-shrink: 0; }
.task-node-header.collapsed .task-node-toggle { transform: rotate(-90deg); }
.task-node-progress { font-size: 12px; color: var(--text-secondary); background: var(--border); padding: 1px 8px; border-radius: 10px; }
.task-children { padding-left: 24px; }
.task-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; transition: background 0.15s; cursor: default;
}
.task-item:hover { background: var(--accent-bg-subtle); }
.task-checkbox {
  cursor: pointer; font-size: 16px; color: var(--text-muted);
  user-select: none; flex-shrink: 0;
}
.task-item.status--done .task-checkbox,
.task-item.status--completed .task-checkbox { color: var(--color-success-dot); }
.task-item.status--skipped .task-checkbox { color: var(--color-error); }
.task-title { font-size: 13px; color: var(--text-heading); flex: 1; }
.task-actions-group { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; margin-left: auto; }
.task-node-header:hover .task-actions-group,
.task-item:hover .task-actions-group { opacity: 1; }
</style>
