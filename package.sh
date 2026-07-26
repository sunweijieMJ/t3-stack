#!/bin/bash

# 一键构建 Docker 镜像并打包部署文件
# 用法: ./package.sh [--arm64|--amd64]
#   --amd64   构建 linux/amd64 镜像（默认）
#   --arm64   构建 linux/arm64 镜像
#
# 产出物: organova-app_<hash>_<arch>_<timestamp>.tar.gz
# 解压后目录结构:
#   deploy_package/
#   ├── build_info.sh                # 构建元信息（镜像名、hash 等，同时供 docker-compose 读取）
#   ├── manage.sh                    # 管理脚本
#   ├── organova-app_<hash>.tar      # Next.js 应用镜像
#   ├── organova-nginx_<hash>.tar    # Nginx 镜像
#   ├── docker-compose.yml           # compose 编排文件
#   ├── nginx.conf                   # nginx 配置
#   └── .env.example                 # 环境变量模板

set -euo pipefail

# 日志函数
log_info() { echo -e "\033[0;32m[INFO]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# 清理函数（仅在错误时调用）
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf deploy_package
}

# 错误处理
handle_error() {
    log_error "An error occurred on line $1"
    cleanup
    exit 1
}

# 设置错误处理（仅 ERR，不在正常退出时清理，因为 tar 打包后 deploy_package 仍需保留到打包完成）
trap 'handle_error $LINENO' ERR

# 检查必需工具
check_requirements() {
    local required_tools="docker git"
    for tool in $required_tools; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
}

# 构建 Docker 镜像（runner + nginx 两个 target）
build_docker_images() {
    log_info "构建平台: ${platform}"

    log_info "Building app image (runner target)..."
    docker build --platform "${platform}" -t "${appImageTag}" --target runner .

    log_info "Building nginx image (nginx target)..."
    docker build --platform "${platform}" -t "${nginxImageTag}" --target nginx .
}

# 准备部署文件
prepare_deployment_files() {
    log_info "Preparing deployment files..."
    mkdir -p deploy_package

    # 保存两个镜像
    local app_tar="${appImageTag//:/_}.tar"
    local nginx_tar="${nginxImageTag//:/_}.tar"

    log_info "Exporting app image..."
    docker save "${appImageTag}" -o "deploy_package/${app_tar}"

    log_info "Exporting nginx image..."
    docker save "${nginxImageTag}" -o "deploy_package/${nginx_tar}"

    # 复制部署所需的配置文件
    cp docker-compose.yml deploy_package/
    cp nginx.conf deploy_package/
    cp .env.example deploy_package/
    cp manage.sh deploy_package/
    # 显式补可执行位：tar 会原样保留模式，运维解包后要直接 ./manage.sh update
    chmod +x deploy_package/manage.sh

    # 写入构建信息（变量名与 docker-compose.yml 对齐，可直接 source）
    # 这里曾额外写 APP_DOCKER_MD5 / NGINX_DOCKER_MD5，已移除：
    # manage.sh 从来不校验它们，而 docker load 本身会校验镜像 layer 的 digest，
    # tar 传输损坏会直接 load 失败。留一个「算了但从不校验」的字段，
    # 反而会让人误以为有完整性保护。
    cat > deploy_package/build_info.sh << EOF
COMMIT_HASH="${gitHash}"
BUILD_AT="${dateTime}"
BRANCH="${gitBranch}"
APP_IMAGE="${appImageTag}"
NGINX_IMAGE="${nginxImageTag}"
EOF
}

# 主函数
main() {
    local start_time=$(date +%s)

    # 解析参数
    platform="linux/amd64"
    local arch="amd64"
    local allow_dirty=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --arm64)  platform="linux/arm64"; arch="arm64"; shift ;;
            --amd64)  platform="linux/amd64"; arch="amd64"; shift ;;
            --allow-dirty) allow_dirty=true; shift ;;
            *)
                log_error "未知参数: $1"
                echo "用法: $0 [--arm64|--amd64] [--allow-dirty]"
                exit 1
                ;;
        esac
    done

    # 检查依赖
    check_requirements

    # 定义变量
    gitBranch=$(git rev-parse --abbrev-ref HEAD)
    gitHash=$(git rev-parse --short HEAD)

    # 镜像 tag 用 commit hash，但 Dockerfile 是 COPY . . —— 未提交的改动会一起被打进镜像。
    # 不拦住的话，同一个 tag 可能对应完全不同的产物，「上传旧包按 tag 回滚」就不可靠了。
    if [ -n "$(git status --porcelain)" ]; then
        if [ "$allow_dirty" = false ]; then
            log_error "工作区有未提交的改动，构建产物将与 commit ${gitHash} 不一致。"
            log_error "请先提交（或 stash），或显式使用 --allow-dirty 构建调试包。"
            git status --short >&2
            exit 1
        fi
        # 允许脏构建时，给 tag 打上 -dirty，让产物自己说明来源不可复现
        gitHash="${gitHash}-dirty"
        log_error "警告：工作区不干净，镜像 tag 已标记为 ${gitHash}（不可复现，勿用于生产）"
    fi
    dateTime=$(date "+%Y-%m-%d_%H-%M-%S")
    imagePrefix='organova-app'
    appImageTag="${imagePrefix}:${gitHash}"
    nginxImageTag="organova-nginx:${gitHash}"
    packageName="${imagePrefix}_${gitHash}_${arch}_${dateTime}.tar.gz"

    log_info "=========================================="
    log_info "构建信息:"
    log_info "  分支:       ${gitBranch}"
    log_info "  Hash:       ${gitHash}"
    log_info "  平台:       ${platform}"
    log_info "  App 镜像:   ${appImageTag}"
    log_info "  Nginx 镜像: ${nginxImageTag}"
    log_info "=========================================="

    # 执行构建步骤
    build_docker_images
    prepare_deployment_files

    # 创建部署包
    log_info "Creating deployment package..."
    tar --no-xattrs -czf "${packageName}" deploy_package

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # 清理中间产物
    rm -rf deploy_package

    log_info "=========================================="
    log_info "构建完成！耗时 ${duration} 秒"
    log_info "部署包: ${packageName}"
    log_info "App 镜像:   ${appImageTag}"
    log_info "Nginx 镜像: ${nginxImageTag}"
    log_info ""
    log_info "部署步骤:"
    log_info "  1. scp ${packageName} user@server:/opt/organova-app/"
    log_info "  2. ./manage.sh update ${packageName}"
    log_info "=========================================="
}

# 执行主函数
main "$@"
