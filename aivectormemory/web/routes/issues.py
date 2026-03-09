from aivectormemory.db.memory_repo import MemoryRepo
from aivectormemory.db.issue_repo import IssueRepo
from aivectormemory.db.task_repo import TaskRepo


def get_issues(cm, params, pdir):
    date = params.get("date", [None])[0]
    status = params.get("status", [None])[0]
    keyword = params.get("keyword", [None])[0]
    limit = int(params.get("limit", [20])[0])
    offset = int(params.get("offset", [0])[0])
    repo = IssueRepo(cm.conn, pdir)
    if status == "archived":
        issues, total = repo.list_archived(date=date, limit=limit, offset=offset, keyword=keyword)
    elif status == "all":
        issues, total = repo.list_all(date=date, limit=limit, offset=offset, keyword=keyword)
    elif status:
        issues, total = repo.list_by_date(date=date, status=status, limit=limit, offset=offset, keyword=keyword)
    else:
        issues, total = repo.list_by_date(date=date, limit=limit, offset=offset, keyword=keyword)
    task_repo = TaskRepo(cm.conn, pdir)
    fids = list({i.get("feature_id", "") for i in issues if i.get("feature_id")})
    progress_map = task_repo.get_task_progress_batch(fids) if fids else {}
    for issue in issues:
        fid = issue.get("feature_id", "")
        if fid and fid in progress_map:
            issue["task_progress"] = progress_map[fid]
    return {"issues": issues, "total": total}


def put_issue(handler, cm, iid, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    repo = IssueRepo(cm.conn, pdir)
    old = repo.get_by_id(iid)
    if not old:
        return {"error": "not found"}
    fields = {k: body[k] for k in ("title", "status", "content",
              "description", "investigation", "root_cause", "solution",
              "files_changed", "test_result", "notes", "feature_id", "tags") if k in body}
    result = repo.update(iid, **fields)
    if not result:
        return {"error": "not found"}
    memory_id = result.get("memory_id", "")
    if memory_id:
        mem_repo = MemoryRepo(cm.conn, pdir)
        mem = mem_repo.get_by_id(memory_id)
        if mem:
            content = f"[问题追踪] #{result['issue_number']} {result['title']}\n{result.get('content', '')}"
            updates = {"content": content}
            if "tags" in body:
                updates["tags"] = result.get("tags", [])
            mem_repo.update(memory_id, **updates)
    return result


def post_issue(handler, cm, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    title = body.get("title", "").strip()
    if not title:
        return {"error": "title required"}
    content = body.get("content", "")
    tags = body.get("tags", [])
    from datetime import date
    d = body.get("date", date.today().isoformat())

    repo = IssueRepo(cm.conn, pdir)
    parent_id = body.get("parent_id", 0)
    result = repo.create(d, title, content, tags=tags, parent_id=parent_id)
    if result.get("deduplicated"):
        return result

    mem_repo = MemoryRepo(cm.conn, pdir)
    engine = getattr(cm, "_embedding_engine", None)
    memory_id = ""
    if engine:
        mem_content = f"[问题追踪] #{result['issue_number']} {title}\n{content}"
        embedding = engine.encode(mem_content)
        session_id = getattr(cm, "session_id", 0)
        mem_result = mem_repo.insert(mem_content, tags, "project", session_id, embedding, dedup_threshold=0.99)
        memory_id = mem_result.get("id", "")
    repo.update(result["id"], memory_id=memory_id)
    result["memory_id"] = memory_id
    return result


def delete_issue(handler, cm, iid, pdir, params, is_archived=False):
    action = params.get("action", ["delete"])[0]
    repo = IssueRepo(cm.conn, pdir)
    mem_repo = MemoryRepo(cm.conn, pdir)

    if action == "archive":
        result = repo.archive(iid)
        if not result:
            return {"error": "not found"}
        return result

    if is_archived:
        result = repo.delete_archived(iid)
    else:
        result = repo.delete(iid)
    if not result:
        return {"error": "not found"}
    memory_id = result.get("memory_id", "")
    if memory_id:
        mem_repo.delete(memory_id)
    return result
