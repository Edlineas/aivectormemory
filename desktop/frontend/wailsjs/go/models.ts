export namespace backup {
	
	export class BackupInfo {
	    filename: string;
	    path: string;
	    size_bytes: number;
	    size_mb: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.path = source["path"];
	        this.size_bytes = source["size_bytes"];
	        this.size_mb = source["size_mb"];
	        this.created_at = source["created_at"];
	    }
	}

}

export namespace db {
	
	export class DBStats {
	    file_size_bytes: number;
	    file_size_mb: number;
	    db_path: string;
	    table_counts: Record<string, number>;
	    embedding_dim: number;
	    project_distribution: Record<string, number>;
	    scope_distribution: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new DBStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file_size_bytes = source["file_size_bytes"];
	        this.file_size_mb = source["file_size_mb"];
	        this.db_path = source["db_path"];
	        this.table_counts = source["table_counts"];
	        this.embedding_dim = source["embedding_dim"];
	        this.project_distribution = source["project_distribution"];
	        this.scope_distribution = source["scope_distribution"];
	    }
	}
	export class HealthReport {
	    memories_total: number;
	    vec_memories_total: number;
	    memories_missing: number;
	    user_memories_total: number;
	    vec_user_memories_total: number;
	    user_memories_missing: number;
	    orphan_vec: number;
	    orphan_user_vec: number;
	
	    static createFrom(source: any = {}) {
	        return new HealthReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.memories_total = source["memories_total"];
	        this.vec_memories_total = source["vec_memories_total"];
	        this.memories_missing = source["memories_missing"];
	        this.user_memories_total = source["user_memories_total"];
	        this.vec_user_memories_total = source["vec_user_memories_total"];
	        this.user_memories_missing = source["user_memories_missing"];
	        this.orphan_vec = source["orphan_vec"];
	        this.orphan_user_vec = source["orphan_user_vec"];
	    }
	}
	export class Issue {
	    id: number;
	    project_dir: string;
	    issue_number: number;
	    date: string;
	    title: string;
	    status: string;
	    content: string;
	    tags: string[];
	    description: string;
	    investigation: string;
	    root_cause: string;
	    solution: string;
	    files_changed: string;
	    test_result: string;
	    notes: string;
	    feature_id: string;
	    parent_id: number;
	    created_at: string;
	    updated_at: string;
	    task_progress?: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new Issue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_dir = source["project_dir"];
	        this.issue_number = source["issue_number"];
	        this.date = source["date"];
	        this.title = source["title"];
	        this.status = source["status"];
	        this.content = source["content"];
	        this.tags = source["tags"];
	        this.description = source["description"];
	        this.investigation = source["investigation"];
	        this.root_cause = source["root_cause"];
	        this.solution = source["solution"];
	        this.files_changed = source["files_changed"];
	        this.test_result = source["test_result"];
	        this.notes = source["notes"];
	        this.feature_id = source["feature_id"];
	        this.parent_id = source["parent_id"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	        this.task_progress = source["task_progress"];
	    }
	}
	export class IssueListResult {
	    issues: Issue[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new IssueListResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.issues = this.convertValues(source["issues"], Issue);
	        this.total = source["total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Memory {
	    id: string;
	    content: string;
	    tags: string[];
	    scope?: string;
	    source: string;
	    project_dir?: string;
	    session_id: number;
	    created_at: string;
	    updated_at: string;
	    similarity?: number;
	
	    static createFrom(source: any = {}) {
	        return new Memory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.content = source["content"];
	        this.tags = source["tags"];
	        this.scope = source["scope"];
	        this.source = source["source"];
	        this.project_dir = source["project_dir"];
	        this.session_id = source["session_id"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	        this.similarity = source["similarity"];
	    }
	}
	export class MemoryExport {
	    id: string;
	    content: string;
	    tags: string[];
	    scope?: string;
	    source: string;
	    project_dir?: string;
	    session_id: number;
	    created_at: string;
	    updated_at: string;
	    similarity?: number;
	    embedding: number[];
	
	    static createFrom(source: any = {}) {
	        return new MemoryExport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.content = source["content"];
	        this.tags = source["tags"];
	        this.scope = source["scope"];
	        this.source = source["source"];
	        this.project_dir = source["project_dir"];
	        this.session_id = source["session_id"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	        this.similarity = source["similarity"];
	        this.embedding = source["embedding"];
	    }
	}
	export class MemoryListResult {
	    memories: Memory[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new MemoryListResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.memories = this.convertValues(source["memories"], Memory);
	        this.total = source["total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Project {
	    project_dir: string;
	    name: string;
	    memories: number;
	    user_memories: number;
	    issues: number;
	    tags: number;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project_dir = source["project_dir"];
	        this.name = source["name"];
	        this.memories = source["memories"];
	        this.user_memories = source["user_memories"];
	        this.issues = source["issues"];
	        this.tags = source["tags"];
	    }
	}
	export class SessionState {
	    id: number;
	    project_dir: string;
	    is_blocked: boolean;
	    block_reason: string;
	    next_step: string;
	    current_task: string;
	    progress: string[];
	    recent_changes: string[];
	    pending: string[];
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_dir = source["project_dir"];
	        this.is_blocked = source["is_blocked"];
	        this.block_reason = source["block_reason"];
	        this.next_step = source["next_step"];
	        this.current_task = source["current_task"];
	        this.progress = source["progress"];
	        this.recent_changes = source["recent_changes"];
	        this.pending = source["pending"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class TagInfo {
	    name: string;
	    count: number;
	    project_count: number;
	    user_count: number;
	
	    static createFrom(source: any = {}) {
	        return new TagInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.count = source["count"];
	        this.project_count = source["project_count"];
	        this.user_count = source["user_count"];
	    }
	}
	export class Task {
	    id: number;
	    project_dir: string;
	    feature_id: string;
	    title: string;
	    status: string;
	    sort_order: number;
	    parent_id: number;
	    task_type: string;
	    metadata: string;
	    created_at: string;
	    updated_at: string;
	    children?: Task[];
	
	    static createFrom(source: any = {}) {
	        return new Task(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_dir = source["project_dir"];
	        this.feature_id = source["feature_id"];
	        this.title = source["title"];
	        this.status = source["status"];
	        this.sort_order = source["sort_order"];
	        this.parent_id = source["parent_id"];
	        this.task_type = source["task_type"];
	        this.metadata = source["metadata"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	        this.children = this.convertValues(source["children"], Task);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TaskGroup {
	    feature_id: string;
	    tasks: Task[];
	    total: number;
	    done: number;
	
	    static createFrom(source: any = {}) {
	        return new TaskGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.feature_id = source["feature_id"];
	        this.tasks = this.convertValues(source["tasks"], Task);
	        this.total = source["total"];
	        this.done = source["done"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class Settings {
	    theme: string;
	    language: string;
	    db_path: string;
	    python_path: string;
	    web_port: number;
	    auto_start: boolean;
	    last_project: string;
	    window_width: number;
	    window_height: number;
	    window_x: number;
	    window_y: number;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.language = source["language"];
	        this.db_path = source["db_path"];
	        this.python_path = source["python_path"];
	        this.web_port = source["web_port"];
	        this.auto_start = source["auto_start"];
	        this.last_project = source["last_project"];
	        this.window_width = source["window_width"];
	        this.window_height = source["window_height"];
	        this.window_x = source["window_x"];
	        this.window_y = source["window_y"];
	    }
	}

}
