# FloatClip

FloatClip 是一个基于 Tauri 的桌面悬浮剪贴板工具。它会在屏幕上显示一个常驻悬浮按钮，点击后打开剪贴板历史面板，可以保存文本、图片和文件记录，并一键重新写回系统剪贴板。

当前版本主要面向 Windows。文本和图片剪贴板能力来自 Tauri 插件，文件剪贴板能力使用 Windows `CF_HDROP` 实现。

## 功能

- 屏幕常驻的悬浮剪贴板按钮
- 支持文本、图片、文件剪贴板历史
- 鼠标悬停预览历史内容
- 点击历史项即可写回系统剪贴板
- 支持自定义悬浮按钮图标、圆角和透明度
- 支持设置开机启动
- 支持打包 Windows NSIS 安装包

## 环境要求

### 系统

- Windows 10 / Windows 11
- 已安装 Microsoft Edge WebView2 Runtime

Windows 11 通常已自带 WebView2。Windows 10 如果缺失，可以从微软官方下载安装 WebView2 Runtime。

### 开发环境

- Node.js：建议 `20.19.0` 或更高版本，或 `22.12.0` 及以上
- npm：随 Node.js 安装
- Rust：稳定版 stable toolchain
- Cargo：随 Rust 安装
- Microsoft C++ Build Tools / Visual Studio Build Tools

Rust 可以通过 `rustup` 安装。Windows 上编译 Tauri/Rust 项目通常还需要安装 Visual Studio Build Tools，并勾选 C++ 桌面开发相关组件。

### 项目依赖

本项目使用：

- Tauri 2
- Vite 8
- Rust 2021 edition
- `@tauri-apps/api`
- `@tauri-apps/plugin-clipboard-manager`
- `@tauri-apps/plugin-dialog`
- `tauri-plugin-autostart`

## 开发运行

安装前端依赖：

```powershell
npm install
```

启动 Tauri 开发模式：

```powershell
npm run tauri:dev
```

只构建前端：

```powershell
npm run build
```

检查 Rust 后端：

```powershell
cd src-tauri
cargo check
```

## 打包

在 Windows 上运行：

```powershell
.\build-windows.bat
```

打包产物会输出到：

```text
src-tauri/target/release/bundle
```

## 项目结构

- `src/`：前端代码，包含主面板、悬浮按钮和设置窗口
- `src-tauri/`：Rust 后端、Tauri 配置和 Windows 剪贴板集成
- `public/`：静态资源
- `build-windows.bat`：Windows 打包脚本

## 隐私说明

FloatClip 的剪贴板历史保存在本机应用数据目录中。图片历史会以本地文件形式保存到同一应用数据目录下。本项目不包含云同步、账号系统或远程上传逻辑。

## 许可证

本项目基于 MIT 许可证开源，详见 [LICENSE](LICENSE)。
