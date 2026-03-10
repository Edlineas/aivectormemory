<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import TaskNode from './TaskNode.vue'
import Badge from '../common/Badge.vue'

const { t } = useI18n()

const props = defineProps<{
  group: any
  collapsed: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'add-task'): void
  (e: 'delete-group'): void
  (e: 'toggle-task', task: any): void
  (e: 'edit-task', task: any): void
  (e: 'delete-task', task: any): void
}>()

function progress() {
  if (props.group.total != null) return `${props.group.done || 0}/${props.group.total}`
  const items = props.group.tasks || []
  const done = items.filter((t: any) => t.status === 'done' || t.status === 'completed').length
  return `${done}/${items.length}`
}

function groupStatus(): { label: string; type: 'success' | 'info' | 'warning' } {
  const d = props.group.done || 0
  const tot = props.group.total || props.group.tasks?.length || 0
  if (d === tot && tot > 0) return { label: t('status.completed'), type: 'success' }
  if (d > 0) return { label: t('status.in_progress'), type: 'info' }
  return { label: t('status.pending'), type: 'warning' }
}
</script>

<template>
  <div :class="['task-group', readonly && 'task-group--archived']">
    <div :class="['task-group-header', collapsed && 'collapsed']" @click="emit('toggle-collapse')">
      <span class="task-group-toggle">&#x25BC;</span>
      <span class="task-group-title">{{ group.feature_id || group.title }}</span>
      <span v-if="group.created_at" class="task-group-date">{{ group.created_at?.slice(0, 10) }}</span>
      <div class="task-group-header-right" @click.stop>
        <span class="task-group-progress">{{ progress() }}</span>
        <Badge :type="groupStatus().type">{{ groupStatus().label }}</Badge>
        <template v-if="!readonly">
          <button class="btn btn--ghost btn--sm task-actions-group" @click="emit('add-task')">{{ t('addTask') }}</button>
          <button class="btn btn--ghost-danger btn--sm task-actions-group" @click="emit('delete-group')">{{ t('delete') }}</button>
        </template>
      </div>
    </div>
    <div v-if="!collapsed" class="task-group-items">
      <TaskNode
        v-for="task in (group.tasks || [])"
        :key="task.id"
        :task="task"
        :readonly="readonly"
        @toggle="emit('toggle-task', task)"
        @edit="emit('edit-task', task)"
        @delete="emit('delete-task', task)"
      />
    </div>
  </div>
</template>

<style scoped>
.task-group { background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border); overflow: hidden; }
.task-group--archived { opacity: 0.7; }
.task-group-header {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  background: var(--bg-primary); border-bottom: 1px solid var(--border); cursor: pointer;
}
.task-group-toggle { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; display: inline-block; width: 16px; text-align: center; flex-shrink: 0; }
.task-group-header.collapsed .task-group-toggle { transform: rotate(-90deg); }
.task-group-title { font-weight: 600; color: var(--text-heading); font-size: 14px; }
.task-group-progress { font-size: 13px; color: var(--text-secondary); background: var(--border); padding: 2px 10px; border-radius: 10px; }
.task-group-date { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
.task-group-header-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.task-group-items { padding: 4px 0; }
.task-actions-group { opacity: 0; transition: opacity 0.15s; }
.task-group-header:hover .task-actions-group { opacity: 1; }
</style>
