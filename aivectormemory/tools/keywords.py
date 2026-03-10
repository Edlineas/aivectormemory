"""从内容自动提取关键词标签（jieba 分词 + 英文正则）"""
import re
import jieba

# 中文停用词
_CN_STOP = frozenset(
    "的 是 在 了 不 要 有 这 那 用 做 被 把 和 与 或 但 如果 因为 所以 "
    "可以 需要 已经 一个 也 都 还 就 会 能 到 说 让 给 从 对 于 很 更 最 "
    "比较 可能 应该 然后 什么 怎么 为什么 这个 那个 哪个 所有 没有 不是 "
    "而且 以及 通过 进行 使用 支持 提供 包含 包括 设置 配置 添加 删除 "
    "修改 更新 创建 上 下 中 大 小 多 少 好 坏 高 低 长 短 新 旧 "
    "时 后 前 里 内 外 间 以上 以下 之间 建议 合理 导致 方式".split()
)

# 英文停用词
_EN_STOP = frozenset(
    "the a an is are was were be been being have has had do does did "
    "will would shall should may might can could not no nor and or but "
    "if then else when where how what which who whom this that these those "
    "it its he she they we you i my your his her our their me him us them "
    "to of in for on with at by from as into about after before between "
    "through during without along across against among within upon over "
    "also just only very much more most some any all each every both few "
    "many such than too so up out off down back away again still already".split()
)

_RE_CN = re.compile(r"[\u4e00-\u9fff]")
_RE_EN = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]{2,}")


def extract_keywords(content: str, max_kw: int = 5) -> list[str]:
    """从内容提取关键词，返回去重列表（最多 max_kw 个）"""
    if not content:
        return []
    seen, result = set(), []

    # 英文词优先（技术术语检索价值更高）
    for w in _RE_EN.findall(content):
        lw = w.lower()
        if len(result) >= max_kw:
            break
        if len(lw) <= 30 and lw not in _EN_STOP and lw not in seen:
            seen.add(lw)
            result.append(w)

    # jieba 分词提取中文关键词
    for w in jieba.cut(content, cut_all=False):
        w = w.strip()
        if len(result) >= max_kw:
            break
        if len(w) >= 2 and _RE_CN.match(w) and w not in _CN_STOP and w not in seen:
            seen.add(w)
            result.append(w)

    return result
