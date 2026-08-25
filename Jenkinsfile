// 自建服务器部署流水线（Jenkins）。
//
// 与 .github/workflows/build-deploy.yml 是**并列**关系，不是替代：那条走 GHCR + GitHub
// Actions，这条走公司内网。两者最终都调服务器上的 manage.sh，健康检查与失败自动回滚
// 的逻辑只有那一份（见 manage.sh 的 pull_deploy / update_deploy）。
//
// 需要的 Jenkins 凭据（Manage Jenkins → Credentials）：
//   REGISTRY_CRED    Username with password —— 私有镜像仓库账号
//   DEPLOY_SSH_CRED  SSH Username with private key —— 目标服务器部署账号
// 需要的插件：Pipeline、SSH Agent、Docker Pipeline（可选，本文件只用 sh 调 docker CLI）
//
// 前置条件（不满足会在 Preflight 阶段直接失败，而不是等到部署一半才炸）：
//   - agent 上有 docker 且当前用户能用（挂了 docker.sock 或装了 dind）
//   - 目标服务器上已有 <DEPLOY_PATH>/.env，且内容由运维手工维护
//     —— 本流水线**永远不会**同步 .env，覆盖它等于当场丢掉线上密钥
//
// 两种投递方式由 DELIVERY 参数切换：
//   REGISTRY  推私有仓库 → 服务器 docker login + pull（增量层复用，最快）
//   OFFLINE   打成 tar.gz → scp 到服务器 → docker load（隔离网段用，每次传完整镜像）

pipeline {
    agent any

    options {
        // 部署不能并发：两次 pull-deploy 同时跑会互相覆盖 build_info.sh，
        // 回滚时恢复出来的可能是另一次构建的版本号。
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '5'))
        // 自己控制 checkout：必须先 cleanWs 再拉代码，理由见 Checkout 阶段。
        skipDefaultCheckout(true)
    }

    parameters {
        choice(
            name: 'DELIVERY',
            choices: ['REGISTRY', 'OFFLINE'],
            description: 'REGISTRY=推私有仓库后服务器 pull；OFFLINE=打离线包 scp 过去 docker load'
        )
        booleanParam(
            name: 'DEPLOY',
            defaultValue: true,
            description: '取消勾选则只构建与投递产物，不动线上服务'
        )
        booleanParam(
            name: 'RUN_QUALITY',
            defaultValue: true,
            description: 'lint / type-check / spell-check / 单测。热修复重新部署同一个 commit 时可关掉'
        )
        choice(
            name: 'PLATFORM',
            choices: ['linux/amd64', 'linux/arm64'],
            description: '目标服务器的 CPU 架构，与 agent 架构无关'
        )
    }

    environment {
        // ---- 按你们的实际环境改这一段 ----
        REGISTRY        = 'harbor.example.com'
        IMAGE_NS        = 'organova'
        REGISTRY_CRED   = 'harbor-credentials'
        DEPLOY_SSH_CRED = 'deploy-ssh-key'
        DEPLOY_HOST     = 'deploy@10.0.0.10'
        DEPLOY_PATH     = '/opt/organova-app'
        // ---------------------------------

        APP_REPO   = "${REGISTRY}/${IMAGE_NS}/organova-app"
        NGINX_REPO = "${REGISTRY}/${IMAGE_NS}/organova-nginx"

        // Dockerfile 与 package.sh 里已经指向 npmmirror；agent 上跑质量门禁的容器
        // 也用同一个源，避免「镜像构建能过、质量门禁拉不动包」这种割裂。
        NPM_REGISTRY = 'https://registry.npmmirror.com'
        PNPM_VERSION = '10.20.0'
    }

    stages {

        stage('Checkout') {
            steps {
                // 必须清干净再拉。package.sh 用 `git status --porcelain` 拦「工作区不干净」，
                // 而该命令**含未跟踪文件** —— 上一次构建被中断留下的 deploy_package/、
                // 或任何残留文件都会让这次构建直接失败，且报错指向「你有未提交的改动」，
                // 与真实原因（上一次的垃圾）毫无关系。
                // （deploy_package/ 已加进 .gitignore，这里是第二道。）
                cleanWs()
                checkout scm

                script {
                    // 必须显式 --short=7，不能用 `git rev-parse --short`。
                    // 后者是 core.abbrev=auto，长度随仓库对象数增长，仓库变大后会变成 8 位，
                    // 于是服务器会去 pull 一个不存在的 tag：构建成功、部署失败。
                    // 这与 .github/workflows/build-deploy.yml 里 ${GITHUB_SHA::7} 的口径一致。
                    env.GIT_TAG = sh(
                        returnStdout: true,
                        script: 'git rev-parse --short=7 HEAD'
                    ).trim()
                    env.GIT_BRANCH_NAME = sh(
                        returnStdout: true,
                        script: 'git rev-parse --abbrev-ref HEAD'
                    ).trim()
                    env.APP_IMAGE   = "${env.APP_REPO}:${env.GIT_TAG}"
                    env.NGINX_IMAGE = "${env.NGINX_REPO}:${env.GIT_TAG}"

                    currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.GIT_TAG} ${params.DELIVERY}"
                    currentBuild.description = params.DEPLOY ? "→ ${env.DEPLOY_HOST}" : '仅构建'
                }
            }
        }

        stage('Preflight') {
            steps {
                // 把「环境没准备好」的失败提前到 30 秒内，而不是等镜像构建完
                // （几分钟）之后才发现推不上去或连不上服务器。
                sh '''
                    set -eu
                    command -v docker >/dev/null 2>&1 || {
                        echo "agent 上没有 docker，或当前用户无权访问 docker.sock" >&2
                        exit 1
                    }
                    docker info >/dev/null 2>&1 || {
                        echo "docker daemon 不可达（检查 docker.sock 挂载或 dind 容器）" >&2
                        exit 1
                    }
                '''
                script {
                    if (params.DEPLOY) {
                        sshagent([env.DEPLOY_SSH_CRED]) {
                            // -o BatchMode=yes：密钥不对时立刻失败，而不是挂在密码提示上
                            // 等到 timeout（60 分钟）才被掐断。
                            sh '''
                                set -eu
                                ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
                                    -o ConnectTimeout=10 "$DEPLOY_HOST" \
                                    "set -eu; test -f '$DEPLOY_PATH/.env' || {
                                        echo '目标服务器缺少 $DEPLOY_PATH/.env —— 请先在服务器上执行 ./manage.sh init 并填好生产配置' >&2
                                        exit 1
                                    }; command -v curl >/dev/null || {
                                        echo '目标服务器缺少 curl —— manage.sh 的健康检查依赖它，缺失会把正常版本误判成失败并自动回滚' >&2
                                        exit 1
                                    }"
                            '''
                        }
                    }
                }
            }
        }

        stage('Quality') {
            when { expression { params.RUN_QUALITY } }
            steps {
                // 跑在容器里而不是直接 sh：agent 上不一定装了 Node/pnpm，而这条流水线
                // 唯一被保证的能力就是「能跑 docker」。若你们的 agent 本来就有 Node 22 +
                // pnpm，把整段换成 `sh 'pnpm install --frozen-lockfile && pnpm lint && ...'`
                // 会更快（省一次容器启动与依赖安装）。
                //
                // --user 与 HOME=/tmp 不能省：默认 root 跑会让 node_modules 归 root 所有，
                // 下一次 cleanWs() 删不掉，工作区从此卡死；HOME 不可写则 corepack 装不了 pnpm。
                //
                // 不起数据库：单测全是纯逻辑 + PGlite（wasm，进程内），不发起任何真实连接。
                // 与 .github/workflows/check-quality.yml 的判断一致。
                sh '''
                    set -eu
                    docker run --rm \
                        -v "$WORKSPACE":/app -w /app \
                        --user "$(id -u):$(id -g)" \
                        -e HOME=/tmp \
                        -e CI=1 \
                        -e SKIP_ENV_VALIDATION=1 \
                        node:22-alpine sh -euc '
                            corepack enable
                            corepack prepare pnpm@'"$PNPM_VERSION"' --activate
                            pnpm config set registry '"$NPM_REGISTRY"'
                            pnpm install --frozen-lockfile
                            pnpm lint
                            pnpm type-check
                            pnpm spell-check
                            pnpm test
                        '
                '''
            }
        }

        stage('Build images') {
            when { expression { params.DELIVERY == 'REGISTRY' } }
            steps {
                // 两个 target 必须同一个 commit、同一个 tag 一起构建。
                // nginx 镜像里烤进了 .next/static（见 Dockerfile 的 nginx 阶段），
                // tag 错配的表现是「页面能打开但样式全丢」—— HTML 由新版应用给出，
                // 静态资源却由旧版 nginx 提供，全部 404。排查方向极容易被带偏。
                sh '''
                    set -eu
                    docker build --platform "$PLATFORM" --target runner -t "$APP_IMAGE"   .
                    docker build --platform "$PLATFORM" --target nginx  -t "$NGINX_IMAGE" .
                '''
            }
        }

        stage('Push to registry') {
            when { expression { params.DELIVERY == 'REGISTRY' } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: env.REGISTRY_CRED,
                    usernameVariable: 'REG_USER',
                    passwordVariable: 'REG_PASS'
                )]) {
                    // sh 用单引号：让 $REG_PASS 保持为 shell 变量，不经 Groovy 插值。
                    // 插值会把明文密码写进 Jenkins 的构建日志与进程参数里。
                    // --password-stdin 同理，不用 -p。
                    sh '''
                        set -eu
                        echo "$REG_PASS" | docker login "$REGISTRY" -u "$REG_USER" --password-stdin
                        docker push "$APP_IMAGE"
                        docker push "$NGINX_IMAGE"
                        docker logout "$REGISTRY" || true
                    '''
                }
            }
        }

        stage('Package (offline)') {
            when { expression { params.DELIVERY == 'OFFLINE' } }
            steps {
                // 直接调 package.sh，不在这里重写一遍打包逻辑：离线包的格式
                // （build_info.sh 的字段名、镜像 tar 的命名）是 manage.sh update
                // 解析的契约，两处各写一份迟早对不上。
                //
                // 它内部会自己 docker build 一次。REGISTRY 模式下已经构建过时，
                // 这一次是全命中缓存的，代价接近于零。
                sh '''
                    set -eu
                    chmod +x ./package.sh
                    case "$PLATFORM" in
                        linux/arm64) ./package.sh --arm64 ;;
                        *)           ./package.sh --amd64 ;;
                    esac
                '''
                script {
                    env.PKG_FILE = sh(
                        returnStdout: true,
                        script: 'ls -t organova-app_*.tar.gz | head -1'
                    ).trim()
                    if (!env.PKG_FILE) {
                        error('package.sh 没有产出 tar.gz，检查上面的构建日志')
                    }
                }
                // 归档是为了「构建过但当时没部署」时还能拿回同一份产物做回滚。
                // 但一个包是两个完整镜像的 tar.gz，量级在几百 MB —— 归档会全部
                // 落到 Jenkins controller 的磁盘上。上面 buildDiscarder 里
                // artifactNumToKeepStr 已限制成只留最近 5 次；controller 磁盘紧张
                // 就把这一行删掉，改成部署完由服务器侧保留历史包。
                archiveArtifacts artifacts: 'organova-app_*.tar.gz', fingerprint: true
            }
        }

        stage('Deploy') {
            when { expression { params.DEPLOY } }
            steps {
                // 同步部署脚本与配置。**不含 .env** —— 生产配置由运维手工管理，
                // 同步过去等于用模板覆盖掉线上的数据库密码与 BETTER_AUTH_SECRET。
                // 这与 GitHub Actions 那条流水线的处理一致。
                sshagent([env.DEPLOY_SSH_CRED]) {
                    sh '''
                        set -eu
                        scp -o StrictHostKeyChecking=accept-new \
                            manage.sh docker-compose.yml nginx.conf .env.example \
                            "$DEPLOY_HOST:$DEPLOY_PATH/"
                    '''

                    script {
                        if (params.DELIVERY == 'REGISTRY') {
                            withCredentials([usernamePassword(
                                credentialsId: env.REGISTRY_CRED,
                                usernameVariable: 'REG_USER',
                                passwordVariable: 'REG_PASS'
                            )]) {
                                // 密码经 ssh 的 stdin 直接喂给远端的 docker login --password-stdin，
                                // 不落到命令行参数（远端 ps 看得到）也不落到日志。
                                sh '''
                                    set -eu
                                    echo "$REG_PASS" | ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" \
                                        "set -eu
                                         cd '$DEPLOY_PATH'
                                         chmod +x ./manage.sh
                                         docker login '$REGISTRY' -u '$REG_USER' --password-stdin
                                         ./manage.sh pull-deploy '$APP_IMAGE' '$NGINX_IMAGE'"
                                '''
                            }
                        } else {
                            sh '''
                                set -eu
                                scp -o StrictHostKeyChecking=accept-new "$PKG_FILE" "$DEPLOY_HOST:$DEPLOY_PATH/"
                                ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" \
                                    "set -eu
                                     cd '$DEPLOY_PATH'
                                     chmod +x ./manage.sh
                                     ./manage.sh update '$PKG_FILE'"
                            '''
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                echo "构建成功：${env.APP_IMAGE ?: env.GIT_TAG}"
                if (params.DEPLOY) {
                    echo "已部署到 ${env.DEPLOY_HOST}:${env.DEPLOY_PATH}（健康检查已通过）"
                }
            }
        }
        failure {
            // manage.sh 在健康检查失败时会自己回滚到上一版本并 dump 容器日志，
            // 那些日志就在上面的 ssh 输出里。这里只是提示去哪看，避免有人以为
            // 「部署失败 = 线上已经挂了」而去做多余的手工干预。
            echo '''部署失败。若失败发生在 Deploy 阶段，manage.sh 已自动回滚到上一版本，
线上服务应当仍然可用 —— 上面的 ssh 输出里有容器状态与最近 100 行应用日志。
确认现状：ssh 到服务器执行 ./manage.sh status 与 ./manage.sh health'''
        }
        cleanup {
            // 只清本次构建 tag 的镜像，不做 system prune —— 那会把其他项目/其他
            // 分支的构建缓存一起删掉，共享 agent 上会显著拖慢所有人的下一次构建。
            //
            // 两组 tag 都要清：REGISTRY 模式建的是 $APP_IMAGE（带仓库前缀），
            // OFFLINE 模式下镜像是 package.sh 自己建的、tag 形如
            // organova-app:<hash>，与前者完全不同名。只清前一组的话，OFFLINE
            // 模式每跑一次就在 agent 上永久留下两个几百 MB 的镜像 ——
            // 共享 agent 的磁盘会被慢慢吃光，而且看不出是谁留下的。
            //
            // package.sh 用的是裸 `git rev-parse --short`（core.abbrev=auto），
            // 与上面 GIT_TAG 的 --short=7 可能不同长度，所以这里按它的口径
            // 重新取一次，不能复用 GIT_TAG。
            sh '''
                set +e
                [ -n "${APP_IMAGE:-}" ]   && docker rmi "$APP_IMAGE"   >/dev/null 2>&1
                [ -n "${NGINX_IMAGE:-}" ] && docker rmi "$NGINX_IMAGE" >/dev/null 2>&1
                LOCAL_TAG=$(git rev-parse --short HEAD 2>/dev/null)
                if [ -n "$LOCAL_TAG" ]; then
                    docker rmi "organova-app:$LOCAL_TAG"   >/dev/null 2>&1
                    docker rmi "organova-nginx:$LOCAL_TAG" >/dev/null 2>&1
                fi
                exit 0
            '''
        }
    }
}
