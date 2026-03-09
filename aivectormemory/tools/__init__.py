TOOL_DEFINITIONS = [
    {
        "name": "remember",
        "description": "存入一条记忆。支持用户级（跨项目）和项目级存储，自动去重（相似度>0.95则更新）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "记忆内容，Markdown 格式。命令类须含完整可执行命令，流程类须含具体步骤，禁止模糊缩写"},
                "tags": {"oneOf": [{"type": "array", "items": {"type": "string"}}, {"type": "string"}], "description": "标签列表（数组或逗号分隔字符串）"},
                "scope": {"type": "string", "enum": ["user", "project"], "default": "project", "description": "作用域"}
            },
            "required": ["content", "tags"]
        }
    },
    {
        "name": "recall",
        "description": "语义搜索回忆记忆。通过向量相似度匹配，即使用词不同也能找到相关记忆。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索内容（语义搜索，可选）"},
                "scope": {"type": "string", "enum": ["user", "project", "all"], "default": "all"},
                "tags": {"oneOf": [{"type": "array", "items": {"type": "string"}}, {"type": "string"}], "description": "按标签过滤。query+tags 时默认 OR 匹配（任一标签命中即可），仅 tags 时默认 AND 匹配（精确分类浏览）"},
                "tags_mode": {"type": "string", "enum": ["any", "all"], "description": "标签匹配模式：any=任一匹配，all=全部匹配。默认智能选择（query+tags→any，仅tags→all）"},
                "top_k": {"type": "integer", "default": 5, "description": "返回结果数量"},
                "source": {"type": "string", "enum": ["manual", "experience"], "description": "按来源过滤：manual=项目知识, experience=归档经验。不传则不过滤"},
                "brief": {"type": "boolean", "default": False, "description": "精简模式：true 时只返回 content 和 tags，省略 id/session_id/created_at 等元数据，适合启动加载场景节省上下文"}
            }
        }
    },
    {
        "name": "forget",
        "description": "删除一条或多条记忆。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "memory_id": {"type": "string", "description": "单个记忆 ID"},
                "memory_ids": {"type": "array", "items": {"type": "string"}, "description": "多个记忆 ID"},
                "tags": {"oneOf": [{"type": "array", "items": {"type": "string"}}, {"type": "string"}], "description": "按标签批量删除，删除所有匹配标签的记忆"},
                "scope": {"type": "string", "enum": ["user", "project", "all"], "default": "all", "description": "配合 tags 使用，限定删除范围"}
            }
        }
    },
    {
        "name": "status",
        "description": "读取或更新会话状态（阻塞状态、当前任务、进度等）。不传 state 参数则读取，传则部分更新。progress 为只读计算字段，自动从 track 活跃问题 + task 未完成任务聚合生成，无需手动写入。清空列表字段时使用 clear_fields 参数（因部分 IDE 会过滤空数组）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "state": {
                    "type": "object",
                    "description": "要更新的字段（部分更新）。progress 为只读字段，传入会被忽略。",
                    "properties": {
                        "is_blocked": {"type": "boolean"},
                        "block_reason": {"type": "string"},
                        "next_step": {"type": "string"},
                        "current_task": {"type": "string"},
                        "recent_changes": {"type": "array", "items": {"type": "string"}},
                        "pending": {"type": "array", "items": {"type": "string"}}
                    }
                },
                "clear_fields": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["recent_changes", "pending"]},
                    "description": "要清空的列表字段名。用于绕过部分 IDE 过滤空数组的问题，例如传 [\"pending\"] 等同于 state.pending=[]。"
                }
            }
        }
    },
    {
        "name": "track",
        "description": "问题跟踪：create/update/archive/delete/list 五个 action。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "update", "archive", "delete", "list"]},
                "title": {"type": "string", "description": "问题标题（create）"},
                "date": {"type": "string", "description": "日期 YYYY-MM-DD"},
                "issue_id": {"type": "integer", "description": "list 时传入可查单条问题（活跃+归档都查），避免拉全量列表"},
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                "content": {"type": "string", "description": "问题描述（create 时必填，简述问题现象和背景）"},
                "parent_id": {"type": "integer", "description": "父问题 ID（create，可选，默认 0）"},
                "description": {"type": "string", "description": "问题描述"},
                "investigation": {"type": "string", "description": "排查过程（逐步记录）"},
                "root_cause": {"type": "string", "description": "根本原因"},
                "solution": {"type": "string", "description": "解决方案"},
                "files_changed": {"type": "string", "description": "修改文件清单（JSON 数组）"},
                "test_result": {"type": "string", "description": "自测结果"},
                "notes": {"type": "string", "description": "注意事项"},
                "feature_id": {"type": "string", "description": "关联功能标识"},
                "brief": {"type": "boolean", "default": True, "description": "list 时是否只返回摘要（id/title/status/date），默认 true。需要详情用 issue_id 查单条"},
                "limit": {"type": "integer", "default": 50, "description": "list 时返回条数上限，默认 50"}
            },
            "required": ["action"]
        }
    },
    {
        "name": "task",
        "description": "任务管理：batch_create/update/list/delete/archive。update 更新状态后自动同步所有 IDE 的 tasks.md checkbox，并联动同步关联问题状态。archive 将指定功能组的所有任务移入归档表。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["batch_create", "update", "list", "delete", "archive"]},
                "feature_id": {"type": "string", "description": "关联的功能标识（list 时必填）"},
                "tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "sort_order": {"type": "integer", "default": 0},
                            "children": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string"},
                                        "sort_order": {"type": "integer", "default": 0}
                                    },
                                    "required": ["title"]
                                },
                                "description": "子任务列表（可选，最多一级嵌套）"
                            }
                        },
                        "required": ["title"]
                    },
                    "description": "任务列表（batch_create）"
                },
                "task_id": {"type": "integer", "description": "任务 ID（update）"},
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "skipped"], "description": "任务状态"},
                "title": {"type": "string", "description": "任务标题（update 时可选修改）"}
            },
            "required": ["action"]
        }
    },
    {
        "name": "readme",
        "description": "README 生成工具：从 TOOL_DEFINITIONS/pyproject.toml/STEERING_CONTENT 自动生成 README 内容，支持多语言和差异对比。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["generate", "diff"], "default": "generate", "description": "generate=生成内容, diff=对比差异"},
                "lang": {"type": "string", "default": "en", "description": "语言：en/zh-TW/ja/de/fr/es"},
                "sections": {"type": "array", "items": {"type": "string"}, "description": "指定生成的章节（可选）：header/tools/deps"}
            }
        }
    },
    {
        "name": "auto_save",
        "description": "【每次对话结束前必须调用】自动保存用户偏好。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "preferences": {"oneOf": [{"type": "array", "items": {"type": "string"}}, {"type": "string"}], "description": "用户表达的技术偏好（固定 scope=user，跨项目通用）"},
                "extra_tags": {"oneOf": [{"type": "array", "items": {"type": "string"}}, {"type": "string"}], "description": "额外标签"}
            }
        }
    }
]

from aivectormemory.tools.remember import handle_remember
from aivectormemory.tools.recall import handle_recall
from aivectormemory.tools.forget import handle_forget
from aivectormemory.tools.status import handle_status
from aivectormemory.tools.track import handle_track
from aivectormemory.tools.auto_save import handle_auto_save
from aivectormemory.tools.task import handle_task
from aivectormemory.tools.readme import handle_readme

TOOL_HANDLERS = {
    "remember": handle_remember,
    "recall": handle_recall,
    "forget": handle_forget,
    "status": handle_status,
    "track": handle_track,
    "auto_save": handle_auto_save,
    "task": handle_task,
    "readme": handle_readme,
}
