#!/bin/bash
# ==============================================================================
# 代码行数统计脚本 (Bash 版本)
# 功能：统计指定目录下的文件数和代码行数
# ==============================================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认目录
TARGET_DIR="src"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  -d, --dir <path>    指定要统计的目录 (默认: src)"
            echo "  -h, --help          显示此帮助信息"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            exit 1
            ;;
    esac
done

# 检查目录是否存在
if [[ ! -d "$TARGET_DIR" ]]; then
    echo -e "${RED}错误: 目录 '$TARGET_DIR' 不存在${NC}"
    exit 1
fi

# 统计文件数和行数
echo -e "${BLUE}=== $TARGET_DIR 目录代码统计 ===${NC}"
echo ""

# 统计 .ts 文件
ts_files=$(find "$TARGET_DIR" -name "*.ts" -type f | wc -l)
ts_lines=$(find "$TARGET_DIR" -name "*.ts" -type f -exec cat {} \; | wc -l)

echo -e "${YELLOW}TypeScript 文件:${NC}"
echo -e "  文件数: ${GREEN}$ts_files${NC}"
echo -e "  行数:   ${GREEN}$ts_lines${NC}"

# 统计 .tsx 文件
tsx_files=$(find "$TARGET_DIR" -name "*.tsx" -type f | wc -l)
tsx_lines=$(find "$TARGET_DIR" -name "*.tsx" -type f -exec cat {} \; | wc -l)

echo -e "\n${YELLOW}TSX 文件:${NC}"
echo -e "  文件数: ${GREEN}$tsx_files${NC}"
echo -e "  行数:   ${GREEN}$tsx_lines${NC}"

# 统计 .js 文件
js_files=$(find "$TARGET_DIR" -name "*.js" -type f | wc -l)
js_lines=$(find "$TARGET_DIR" -name "*.js" -type f -exec cat {} \; | wc -l)

echo -e "\n${YELLOW}JavaScript 文件:${NC}"
echo -e "  文件数: ${GREEN}$js_files${NC}"
echo -e "  行数:   ${GREEN}$js_lines${NC}"

# 统计 .json 文件
json_files=$(find "$TARGET_DIR" -name "*.json" -type f | wc -l)
json_lines=$(find "$TARGET_DIR" -name "*.json" -type f -exec cat {} \; | wc -l)

echo -e "\n${YELLOW}JSON 文件:${NC}"
echo -e "  文件数: ${GREEN}$json_files${NC}"
echo -e "  行数:   ${GREEN}$json_lines${NC}"

# 总计
total_files=$((ts_files + tsx_files + js_files + json_files))
total_lines=$((ts_lines + tsx_lines + js_lines + json_lines))

echo -e "\n${BLUE}=== 总计 ===${NC}"
echo -e "  总文件数: ${GREEN}$total_files${NC}"
echo -e "  总行数:   ${GREEN}$total_lines${NC}"