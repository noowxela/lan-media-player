# 更新说明 · Changelog

<!-- Generated from src/lib/changelog.json by `node scripts/changelog-md.js`. Edit the JSON, not this file. -->

## v1.0.1 (build 2) · 2026-10-26

### 新功能 · New

- 后台共享 + 记住电脑 (配对): 锁屏 / 切到后台后电脑自动重连, 不用再输 PIN 或点 Accept · Background sharing + remembered (paired) computers that reconnect automatically
- 共享状态横幅: 任何页面都能看到 已连接 / 休眠 / 重连中, 一键停止 · Sharing banner on every screen
- 设置里新增 "锁屏保持连接 (静音保活)" 开关 · Keep-connected-when-locked toggle (silent audio keep-alive)
- 删除授权: 每次连接只问一次 "允许删除", 断开 30 分钟内重连不用再问; 横幅可一键撤销 · Delete permission asked once per connection (kept for 30 min of disconnect), revoke from the banner
- 设置 > 关于 · 版本: 显示 app 版本、build、提交、构建时间、LAN API 和功能; 点一下复制 · About section with version, build, commit, build time, LAN API and features (tap to copy)
- 更新说明: 新版本第一次打开时显示 "本次更新" · What's new sheet after an update

### 修复 · Fixes

- 安全: 只有 PIN 不能再读写数据, 必须是已允许的连接 (token) · Security: a PIN alone no longer gives data access, an accepted connection token is required
- 手机锁屏后电脑断开连接的问题 · Computer lost the connection when the phone was locked

### 改进 · Improvements

- 删除的音乐 / 文件先放进 app 回收站, 保留 30 天 · Deleted music / files are kept in the app trash for 30 days
- 曲库删除可以选 "删除, 30 分钟内不再询问" · Library deletes: "Delete, don't ask again (30 min)"
- 电脑端可以看到手机 app 的版本和更新说明 · The dashboard shows the phone app version and release notes

## v1.0.0 (build 1) · 2026-10-21

### 新功能 · New

- 第一个版本: 本地 MP3 播放、Wi-Fi 局域网传歌 / 照片 / 文件 · First version: local MP3 player, Wi-Fi LAN transfer of music / photos / files
