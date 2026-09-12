# 家庭维修事项

端口规划：`5114`

```bash
npm install
npm run dev
npm test
```

自动化测试使用 Node 内置测试运行器（无第三方依赖），通过 `tests/helpers/dom.js` 中的最小 DOM/localStorage 桩加载真实的 `src/main.js`：

```bash
npm test   # node --test tests/
```

覆盖新增、编辑、状态切换与完成时间、统计、筛选（状态/位置/优先级）、排序、搜索、移除，以及 localStorage 损坏回退与写入失败恢复。

第一版闭环：记录维修问题、按状态查看、更新处理状态、统计未完成预计费用，支持照片链接并使用localStorage保存数据。
