# agentflow

[English](README.md) · **繁體中文**

一套給 AI 編程代理（Claude Code、Codex、Cursor / Grok 及相容的主機程式）使用的「檔案化工作紀錄」流程。

這個倉庫是 [`agfnow/agentflow`](https://github.com/agfnow/agentflow) 的 **lolxl 移植**（Apache-2.0；見 `NOTICE`）。核心流程與腳本保持主機中立。主機身分走 `HostProvider` 登錄表（`skills/agentflow/scripts/host-provider.js`）。Codex 與 Claude 包住既有主機；**grok-bot**（別名 `grok`、`cursor`）是 Cursor / Grok 轉接器。不明主機會被擋住，不會預設成 Codex。Chef / TEAM / quiet-hours 只寫在 `skills/agentflow/providers/grok-bot/SKILL.md`，不進核心。

- **它做什麼：** AI 透過一個純文字紀錄檔（`devlog.md`）跟你對話，而不是透過終端機。每一個請求、答覆、決定、提交都寫進這個檔案，所以整個專案歷史都查得到，而且任何一個中途死掉的工作階段都能從紀錄裡復原。

- **兩層：** 一層是基礎對話流程（輪次、STATUS、Git 紀律、委派規則），任何工作都適用；另一層是需要時才載入的開發流程（需求 → 規格 → 實作 → 驗收），只有當一個願望會改變產品行為時才會載入。

## 安裝

- **當作 skill 安裝（Claude Code、Codex 及其他主機程式）：**

	```
	npx skills add lolxl/agentflow
	# 上游來源：npx skills add agfnow/agentflow
	```

- **當作 Claude Code plugin 安裝（有新版本時會自動更新）：**

	```
	/plugin marketplace add lolxl/agentflow
	# 上游來源：/plugin marketplace add agfnow/agentflow
	```

## 驗證安裝

需要 Node.js 18 或更新版本，以及 Git。

把 `AGENTFLOW_SKILL_DIR` 設為 `npx skills add` 實際安裝 `agentflow` 的資料夾，再執行已安裝的 setup 檢查：

	```sh
	AGENTFLOW_SKILL_DIR="<實際安裝的 agentflow skill 資料夾>"
	node "$AGENTFLOW_SKILL_DIR/scripts/setup.js"
	```

第一次使用 `godev` 會安裝專案的 hooks。選用 worker 無法使用時，那是可用性結果，不代表安裝失敗。

## 使用

- 在工作階段裡打 `godev`（或 `/devlog`）就啟動這套流程；打 `ag` 則是強制讓一個願望走完整的開發流程。

- 完整使用手冊隨 skill 一起安裝：`skills/agentflow/docs/AG_GUIDE.zh-tw.md`（繁體中文）與 `skills/agentflow/docs/AG_GUIDE.md`（English），裡面也寫了哪些 AI 模型強到跑得動這套流程。

## 模型路由方式

- 每個專案在筆記本旁邊的 `ag.json` 保存版本 7 設定。公開的根層 key 與設定路徑一律使用 kebab-case，包括 `schema-version`、`pipeline-roles`、`external-workers`，以及 `target-doc`、`allow-ag` 等 switches。專案自訂的 worker profiles 把 `best`、`better`、`basic`、`cheap` tiers 對應到 literal commands 與 models。不認識的 key 只會警告並忽略；格式錯誤的 JSON 或已知 key 的無效值則會被拒絕。
