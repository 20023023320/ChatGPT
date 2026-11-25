# 图索

在 Windows 上双击「图索.exe」，即可使用本机 Microsoft Edge 离线检索零件草图、编辑 CAD 模型和导出 STL。源代码版本可直接打开 index.html。

桌面版资源和浏览器资料保存在当前用户的 %LOCALAPPDATA%\TuSuo。移动程序后仍使用同一资料目录。原网页版的仓库和历史保存在原浏览器中。

在装有 .NET Framework 4.x 编译工具的 64 位 Windows 上运行 `powershell -ExecutionPolicy Bypass -File build.ps1`，生成 dist 下的可执行文件。建模库许可证见 vendor/jscad-2.13.0/LICENSE。
