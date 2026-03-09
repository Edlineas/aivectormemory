import { ref } from 'vue'
import {
  GetIssues, GetIssueDetail, CreateIssue, UpdateIssue,
  ArchiveIssue, DeleteIssue,
} from '../../wailsjs/go/main/App'
import { useProjectStore } from '../stores/project'

const PAGE_SIZE = 20

export function useIssues() {
  const projectStore = useProjectStore()
  const issues = ref<any[]>([])
  const total = ref(0)
  const page = ref(1)
  const statusFilter = ref('all')
  const dateFilter = ref('')
  const query = ref('')
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const dir = projectStore.current
      const offset = (page.value - 1) * PAGE_SIZE
      const data = await GetIssues(dir, statusFilter.value, dateFilter.value, query.value, PAGE_SIZE, offset)
      issues.value = data?.issues || []
      total.value = data?.total || 0
    } catch {
      issues.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  async function getDetail(id: number) {
    return await GetIssueDetail(id, projectStore.current)
  }

  async function create(title: string, content: string, status: string, tags: string[], parentId: number) {
    return await CreateIssue(projectStore.current, title, content, status, tags, parentId)
  }

  async function update(id: number, field: string, value: string) {
    return await UpdateIssue(id, projectStore.current, JSON.stringify({ [field]: value }))
  }

  async function updateFull(id: number, data: Record<string, any>) {
    return await UpdateIssue(id, projectStore.current, JSON.stringify(data))
  }

  async function archive(id: number) {
    await ArchiveIssue(id, projectStore.current)
  }

  async function remove(id: number, isArchived: boolean) {
    await DeleteIssue(id, projectStore.current, isArchived)
  }

  function setPage(p: number) { page.value = p; load() }
  function setStatus(s: string) { statusFilter.value = s; page.value = 1; load() }
  function setDate(d: string) { dateFilter.value = d; page.value = 1; load() }
  function setQuery(q: string) { query.value = q; page.value = 1; load() }

  return {
    issues, total, page, statusFilter, dateFilter, query, loading,
    load, getDetail, create, update, updateFull, archive, remove,
    setPage, setStatus, setDate, setQuery, PAGE_SIZE,
  }
}
