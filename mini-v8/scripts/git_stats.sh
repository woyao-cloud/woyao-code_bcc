#!/bin/bash
# ==============================================================================
# Git 代码提交统计脚本
# 功能：统计 Git 仓库的提交次数、代码行数、文件数等信息
# ==============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认参数
AUTHOR=""
SINCE=""
UNTIL=""
BRANCH=""
VERBOSE=false
SHOW_HELP=false

# 打印帮助信息
print_help() {
    echo "Git 代码提交统计脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -a, --author <name>    按作者筛选 (支持部分匹配)"
    echo "  -s, --since <date>     开始日期 (格式: YYYY-MM-DD)"
    echo "  -u, --until <date>     结束日期 (格式: YYYY-MM-DD)"
    echo "  -b, --branch <name>    指定分支名"
    echo "  -v, --verbose          显示详细信息"
    echo "  -h, --help             显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                        # 统计所有提交"
    echo "  $0 -a \"John\"              # 统计 John 的提交"
    echo "  $0 -s 2024-01-01         # 统计 2024 年之后的提交"
    echo "  $0 -s 2024-01-01 -u 2024-12-31  # 统计 2024 全年"
    echo "  $0 -b main -a \"Dev\"       # 统计 main 分支上 Dev 的提交"
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -a|--author)
                AUTHOR="$2"
                shift 2
                ;;
            -s|--since)
                SINCE="$2"
                shift 2
                ;;
            -u|--until)
                UNTIL="$2"
                shift 2
                ;;
            -b|--branch)
                BRANCH="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                SHOW_HELP=true
                shift
                ;;
            *)
                echo "未知选项: $1"
                print_help
                exit 1
                ;;
        esac
    done
}

# 构建 git log 参数
build_git_params() {
    local params=""
    
    if [[ -n "$BRANCH" ]]; then
        params="$params $BRANCH"
    fi
    
    if [[ -n "$AUTHOR" ]]; then
        params="$params --author=\"$AUTHOR\""
    fi
    
    if [[ -n "$SINCE" ]]; then
        params="$params --since=\"$SINCE\""
    fi
    
    if [[ -n "$UNTIL" ]]; then
        params="$params --until=\"$UNTIL\""
    fi
    
    echo "$params"
}

# 主统计函数
main() {
    # 检查是否在 Git 仓库中
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo -e "${RED}错误: 不在 Git 仓库中${NC}"
        exit 1
    fi
    
    # 获取参数
    local git_params=$(build_git_params)
    
    echo -e "${BLUE}===========================================${NC}"
    echo -e "${BLUE}        Git 代码提交统计报告${NC}"
    echo -e "${BLUE}===========================================${NC}"
    echo ""
    
    # 打印筛选条件
    if [[ -n "$AUTHOR" || -n "$SINCE" || -n "$UNTIL" || -n "$BRANCH" ]]; then
        echo -e "${YELLOW}筛选条件:${NC}"
        [[ -n "$BRANCH" ]] && echo "  分支: $BRANCH"
        [[ -n "$AUTHOR" ]] && echo "  作者: $AUTHOR"
        [[ -n "$SINCE" ]] && echo "  开始日期: $SINCE"
        [[ -n "$UNTIL" ]] && echo "  结束日期: $UNTIL"
        echo ""
    fi
    
    # 统计提交次数
    echo -e "${YELLOW}【提交统计】${NC}"
    local total_commits=$(eval "git log $git_params --oneline | wc -l")
    echo -e "  ${GREEN}总提交次数: $total_commits${NC}"
    
    # 统计代码行数变化
    echo -e "\n${YELLOW}【代码行数统计】${NC}"
    local stats=$(eval "git log $git_params --numstat --format='' | awk '{add+=\$1; del+=\$2} END {print add, del}'")
    local added=$(echo "$stats" | awk '{print $1}')
    local deleted=$(echo "$stats" | awk '{print $2}')
    local net_change=$((added - deleted))
    
    echo -e "  ${GREEN}新增行数: $added${NC}"
    echo -e "  ${RED}删除行数: $deleted${NC}"
    echo -e "  ${BLUE}净增行数: $net_change${NC}"
    
    # 统计文件数
    echo -e "\n${YELLOW}【文件统计】${NC}"
    local total_files=$(eval "git log $git_params --numstat --format='' | awk '{print \$3}' | sort -u | wc -l")
    local modified_files=$(eval "git log $git_params --name-only --format='' | sort -u | wc -l")
    echo -e "  ${GREEN}修改的文件数: $total_files${NC}"
    echo -e "  ${BLUE}涉及的文件总数: $modified_files${NC}"
    
    # 统计提交者
    echo -e "\n${YELLOW}【提交者统计】${NC}"
    eval "git log $git_params --format='%aN' | sort | uniq -c | sort -nr | head -10" | while read count name; do
        echo -e "  ${GREEN}$count${NC} - $name"
    done
    
    # 按日期统计（周/月）
    echo -e "\n${YELLOW}【时间分布】${NC}"
    echo -e "  按周统计:"
    eval "git log $git_params --format='%ad' --date=short | sort | uniq -c | tail -10" | while read count date; do
        echo -e "    $date: ${GREEN}$count${NC} 次提交"
    done
    
    # 详细模式：显示最近提交
    if $VERBOSE; then
        echo -e "\n${YELLOW}【最近提交】${NC}"
        eval "git log $git_params --oneline -10" | while read commit; do
            echo -e "  $commit"
        done
    fi
    
    echo -e "\n${BLUE}===========================================${NC}"
    echo -e "${BLUE}                 统计完成${NC}"
    echo -e "${BLUE}===========================================${NC}"
}

# 入口
parse_args "$@"

if $SHOW_HELP; then
    print_help
    exit 0
fi

main