# 下一阶段开发交接说明

## 当前已完成

- 项目目录与模块边界。
- 六个核心 API 的 Route Handler 占位。
- Zod DTO 边界与步骤字段 allowlist。
- Prisma Schema 草案。
- README、API、ERD、算法、状态机、测试矩阵、AI 复盘文档。
- 无公网依赖的 `npm run mock:dev` 本地演示页。

## 暂不实现

- 真实数据库连接与迁移执行。
- 真实健康算法。
- 真实订阅系统。
- 复杂前端交互。

## 下一层开发者优先级

1. 安装依赖并执行 Prisma migrate。
2. 用 Prisma Client 替换 `src/lib/db.ts` stub。
3. 实现 sessions、assessments、results、billing 四个 service。
4. 先写权限字段泄露测试，再实现 result serializer。
5. 补齐 Playwright 主流程。
