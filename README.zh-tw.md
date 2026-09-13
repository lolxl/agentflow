# Agentflow v8.2.0

[English](README.md) · **繁體中文**

幫 AI 助理準備一本專案筆記，明天開新的對話，也能接著今天的工作做。

Agentflow 適用於 **Codex 和 Claude Code**，會把你的要求、決定、進度和結果保存在容易閱讀的檔案裡。改文件、修程式，或分好幾次完成一個專案，都能用。

- **直接開始：** 輸入 `godev`，再用平常說話的方式交代任務。

- **找到結果：** 打開助理最後訊息提到的筆記，通常是 `.agentflow/devlog.md`。

- **最快的入門方式：** 直接問你的 agent：「這件事要怎麼用 Agentflow skill 來做？」它可以配合你的專案說明用法。

## 安裝

需要 Node.js 18 或更新版本，以及可正常使用的 Codex 或 Claude Code。要保留版本紀錄、建立功能工作區，或使用某些安裝方式時，需要 Git。一般筆記工作可以在還不是 Git 儲存庫的資料夾裡進行。

在終端機執行以下指令，再選擇助理和安裝範圍：

```sh
npx skills add agfnow/agentflow
```

若要使用 Claude Code 外掛，先在 Claude Code 加入外掛市集：

```text
/plugin marketplace add agfnow/agentflow
```

接著從該市集安裝 `agentflow` 外掛。外掛是否自動更新，依你的 [Claude Code 市集設定](https://code.claude.com/docs/en/discover-plugins#configure-auto-updates)而定。安裝或更新後，請開啟新的助理對話。

## 控場模型怎麼選

使用 Codex 時，Agentflow 維護者依自己的使用經驗，建議以 **`gpt-5.6-sol/low` 作為表現最穩定的控場模型**：模型選 `gpt-5.6-sol`，推理程度選 `low`。控場就是負責和你對話、安排工作、檢查成果的主要助理。這項建議不會自動更動你的模型設定。另見[官方模型說明](https://developers.openai.com/api/docs/models/gpt-5.6-sol)。

## 記得更新

如果透過 `npx skills add` 安裝，建議定期執行：

```sh
npx skills update agentflow
```

目前 [Skills CLI](https://github.com/vercel-labs/skills#skills-update) 是依已安裝的 skill 名稱更新。`agfnow/agentflow` 是安裝來源，因此 `npx skills update agfnow/agentflow` 不是目前依名稱更新的語法。全域安裝可加上 `-g`；專案內安裝則在該專案執行，並加上 `-p`。

若想自動更新，建議在 macOS 或 Linux 設定每週一次的 **crontab 工作排程**。可以直接請 agent 協助，依你的安裝位置設定。[使用指南](skills/agentflow/docs/AG_GUIDE.zh-tw.md#定期更新-skill)提供週一上午更新的範例，包含完整路徑與執行紀錄。

## 試著交代一件事

在助理對話中輸入：

```text
godev
幫我改寫歡迎頁，讓第一次來的人也看得懂。
保留現有連結，做好後先讓我檢查，不要上傳。
```

小事可以簡單處理。`fast-lane` 讓一項任務由目前的助理完成，略過外部審查，但保留必要檢查和自行審查。`cross-check` 要求獨立檢查已完成的成果；`ag` 則在專案的 `allow-ag` 設定允許時，要求完整開發流程。

對話會留在筆記裡。換新對話後，輸入 `godev` 就能接續尚未完成的要求。有 Git 時，Agentflow 通常會提交完成的工作，並在設有遠端儲存庫時推送；如果只想在本機完成，請先說明。

## 檢查安裝

請 agent 執行 `agf setup`；如果指令捷徑已可使用，也能直接在終端機執行。`agf setup --fix` 會先備份 shell 設定，再補上缺少的捷徑。選用的協作助理無法使用，不一定代表安裝失敗。安裝專案 hooks 後，若收到重新啟動提醒，照做即可。

## 接著看

- [日常使用指南](skills/agentflow/docs/AG_GUIDE.zh-tw.md)，最上方保留 YouTube 介紹影片。

- [English user guide](skills/agentflow/docs/AG_GUIDE.md)。

- [版本更新紀錄](CHANGELOG.md)，最新版本放在最上方。

- [指令參考](skills/agentflow/scripts/README.md)，供進階設定與問題排除使用。

專案設定保存在 `ag.json`，目前使用設定格式版本 7。輸入 `settings` 即可查看。設定格式版號與 Agentflow 發佈版號不同；模型組合放在 `external-workers`，顧問角色設定放在 `pipeline-roles`。
