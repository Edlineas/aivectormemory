import json

from aivectormemory.utils import now_iso, safe_table
from aivectormemory.db.memory_repo import MemoryRepo
from aivectormemory.db.user_memory_repo import UserMemoryRepo


def get_memories(cm, params, pdir):
    scope = params.get("scope", ["all"])[0]
    query = params.get("query", [None])[0]
    tag = params.get("tag", [None])[0]
    source = params.get("source", [None])[0]
    exclude_tags = params.get("exclude_tags", [None])[0]
    limit = int(params.get("limit", [100])[0])
    offset = int(params.get("offset", [0])[0])

    repo = MemoryRepo(cm.conn, pdir)
    user_repo = UserMemoryRepo(cm.conn)

    if tag:
        if scope == "user":
            all_rows = user_repo.list_by_tags([tag], limit=9999, source=source)
        elif scope == "project":
            all_rows = repo.list_by_tags([tag], scope="project", project_dir=pdir, limit=9999, source=source)
        else:
            proj_rows = repo.list_by_tags([tag], scope="project", project_dir=pdir, limit=9999, source=source)
            user_rows = user_repo.list_by_tags([tag], limit=9999, source=source)
            all_rows = proj_rows + user_rows
        if query:
            q = query.lower()
            all_rows = [r for r in all_rows if q in r.get("content", "").lower()]
        total = len(all_rows)
        results = all_rows[offset:offset + limit]
    elif exclude_tags:
        ex_set = set(exclude_tags.split(","))
        if scope == "user":
            all_rows = user_repo.get_all(limit=9999)
        elif scope == "project":
            all_rows = repo.get_all(limit=9999, offset=0, project_dir=pdir)
        else:
            all_rows = repo.get_all(limit=9999, offset=0) + user_repo.get_all(limit=9999)
        all_rows = [r for r in all_rows if not ex_set.intersection(json.loads(r["tags"]) if isinstance(r["tags"], str) else (r["tags"] or []))]
        if source:
            all_rows = [r for r in all_rows if r.get("source", "manual") == source]
        if query:
            q = query.lower()
            all_rows = [r for r in all_rows if q in r.get("content", "").lower()]
        total = len(all_rows)
        results = all_rows[offset:offset + limit]
    else:
        if query:
            if scope == "user":
                all_rows = user_repo.get_all(limit=9999)
            elif scope == "project":
                all_rows = repo.get_all(limit=9999, offset=0, project_dir=pdir)
            else:
                all_rows = repo.get_all(limit=9999, offset=0) + user_repo.get_all(limit=9999)
            if source:
                all_rows = [r for r in all_rows if r.get("source", "manual") == source]
            q = query.lower()
            all_rows = [r for r in all_rows if q in r.get("content", "").lower()]
            total = len(all_rows)
            results = all_rows[offset:offset + limit]
        else:
            if scope == "user":
                rows = user_repo.get_all(limit=limit, offset=offset)
                total = user_repo.count()
            elif scope == "project":
                rows = repo.get_all(limit=limit, offset=offset, project_dir=pdir)
                total = repo.count(project_dir=pdir)
            else:
                rows = repo.get_all(limit=limit, offset=offset)
                total = repo.count() + user_repo.count()
                if len(rows) < limit:
                    user_rows = user_repo.get_all(limit=limit - len(rows))
                    rows = rows + user_rows
            if source:
                rows = [r for r in rows if r.get("source", "manual") == source]
            results = rows

    return {"memories": results, "total": total}


def get_memory_detail(cm, mid, pdir):
    repo = MemoryRepo(cm.conn, pdir)
    mem = repo.get_by_id(mid)
    if mem:
        return mem
    user_repo = UserMemoryRepo(cm.conn)
    mem = user_repo.get_by_id(mid)
    return mem or {"error": "not found"}


def put_memory(handler, cm, mid, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    repo = MemoryRepo(cm.conn, pdir)
    mem = repo.get_by_id(mid)
    if not mem:
        user_repo = UserMemoryRepo(cm.conn)
        mem = user_repo.get_by_id(mid)
    else:
        user_repo = None
    if not mem:
        return {"error": "not found"}

    updates = {}
    if "content" in body:
        updates["content"] = body["content"]
    if "tags" in body:
        updates["tags"] = body["tags"]
    if not updates:
        return mem

    if user_repo is not None:
        return user_repo.update(mid, **updates)
    return repo.update(mid, **updates)


def delete_memory(cm, mid, pdir):
    repo = MemoryRepo(cm.conn, pdir)
    if repo.delete(mid):
        return {"deleted": True, "id": mid}
    user_repo = UserMemoryRepo(cm.conn)
    if user_repo.delete(mid):
        return {"deleted": True, "id": mid}
    return {"error": "not found"}


def delete_memories_batch(handler, cm, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    ids = body.get("ids", [])
    repo = MemoryRepo(cm.conn, pdir)
    user_repo = UserMemoryRepo(cm.conn)
    deleted = []
    for mid in ids:
        if repo.delete(mid):
            deleted.append(mid)
        elif user_repo.delete(mid):
            deleted.append(mid)
    return {"deleted_count": len(deleted), "ids": deleted}


def export_memories(cm, params, pdir):
    scope = params.get("scope", ["all"])[0]
    repo = MemoryRepo(cm.conn, pdir)
    user_repo = UserMemoryRepo(cm.conn)

    if scope == "user":
        memories = user_repo.get_all(limit=999999)
        vec_table = "vec_user_memories"
    elif scope == "project":
        memories = repo.get_all(limit=999999, project_dir=pdir)
        vec_table = "vec_memories"
    else:
        memories = repo.get_all(limit=999999) + user_repo.get_all(limit=999999)
        vec_table = None

    result = []
    for m in memories:
        entry = dict(m)
        tbl = vec_table
        if tbl is None:
            tbl = "vec_user_memories" if user_repo.get_by_id(m["id"]) else "vec_memories"
        row = cm.conn.execute(f"SELECT embedding FROM {safe_table(tbl)} WHERE id=?", (m["id"],)).fetchone()
        if row:
            raw = row["embedding"]
            if isinstance(raw, (bytes, memoryview)):
                import struct
                if len(raw) >= 4 and len(raw) % 4 == 0:
                    entry["embedding"] = list(struct.unpack(f'{len(raw)//4}f', raw))
                else:
                    entry["embedding"] = None
            else:
                try:
                    entry["embedding"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    entry["embedding"] = None
        else:
            entry["embedding"] = None
        result.append(entry)
    return {"memories": result, "count": len(result), "project_dir": pdir}


def import_memories(handler, cm, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    items = body.get("memories", [])
    if not items:
        return {"error": "no memories to import"}
    repo = MemoryRepo(cm.conn, pdir)
    user_repo = UserMemoryRepo(cm.conn)
    imported, skipped = 0, 0
    for item in items:
        mid = item.get("id", "")
        if not mid or repo.get_by_id(mid) or user_repo.get_by_id(mid):
            skipped += 1
            continue
        now = now_iso()
        tags = item.get("tags", "[]")
        tags_str = json.dumps(tags, ensure_ascii=False) if isinstance(tags, list) else tags
        scope = item.get("scope", "project")
        embedding = item.get("embedding")
        if not embedding:
            from aivectormemory.embedding.engine import EmbeddingEngine
            embedding = EmbeddingEngine().encode(item.get("content", ""))
        if scope == "user":
            cm.conn.execute(
                "INSERT INTO user_memories (id, content, tags, source, session_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                (mid, item.get("content", ""), tags_str, item.get("source", "manual"),
                 item.get("session_id", 0), item.get("created_at", now), now))
            cm.conn.execute("INSERT INTO vec_user_memories (id, embedding) VALUES (?,?)", (mid, json.dumps(embedding)))
        else:
            cm.conn.execute(
                "INSERT INTO memories (id, content, tags, scope, project_dir, session_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (mid, item.get("content", ""), tags_str, scope,
                 item.get("project_dir", pdir), item.get("session_id", 0), item.get("created_at", now), now))
            cm.conn.execute("INSERT INTO vec_memories (id, embedding) VALUES (?,?)", (mid, json.dumps(embedding)))
        imported += 1
    cm.conn.commit()
    return {"imported": imported, "skipped": skipped}


def search_memories(handler, cm, pdir):
    from aivectormemory.web.api import _read_body
    body = _read_body(handler)
    query = body.get("query", "").strip()
    if not query:
        return {"error": "query required"}
    top_k = body.get("top_k", 20)
    scope = body.get("scope", "all")
    tags = body.get("tags", [])

    engine = getattr(cm, "_embedding_engine", None)
    if not engine:
        return {"error": "embedding engine not loaded"}

    embedding = engine.encode(query)
    repo = MemoryRepo(cm.conn, pdir)
    user_repo = UserMemoryRepo(cm.conn)

    if scope == "user":
        if tags:
            results = user_repo.search_by_vector_with_tags(embedding, tags, top_k=top_k)
        else:
            results = user_repo.search_by_vector(embedding, top_k=top_k)
    elif scope == "project":
        if tags:
            results = repo.search_by_vector_with_tags(embedding, tags, top_k=top_k, scope="project", project_dir=pdir)
        else:
            results = repo.search_by_vector(embedding, top_k=top_k, scope="project", project_dir=pdir)
    else:
        if tags:
            proj_results = repo.search_by_vector_with_tags(embedding, tags, top_k=top_k, scope="project", project_dir=pdir)
            user_results = user_repo.search_by_vector_with_tags(embedding, tags, top_k=top_k)
        else:
            proj_results = repo.search_by_vector(embedding, top_k=top_k, scope="project", project_dir=pdir)
            user_results = user_repo.search_by_vector(embedding, top_k=top_k)
        results = sorted(proj_results + user_results, key=lambda x: x.get("distance", 0))[:top_k]

    for r in results:
        r["similarity"] = round(1 - (r.get("distance", 0) ** 2) / 2, 4)
    return {"results": results, "count": len(results), "query": query}
