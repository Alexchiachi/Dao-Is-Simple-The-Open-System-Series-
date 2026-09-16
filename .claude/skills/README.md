# 專案 skills

放在這裡的 skill 會在這個倉庫裡的 Claude Code 工作階段自動可用。

| Skill | 來源 | 授權 |
| --- | --- | --- |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) · `skills/taste-skill` | MIT © 2026 Leonxlnx |

`design-taste-frontend` 是一份 1,206 行的 anti-slop 前端設計規範，涵蓋 landing page、
作品集與改版：先讀懂需求再決定設計方向、三個強度旋鈕（變化／動態／密度）、
設計系統對應表、禁用的 AI 痕跡樣態，以及交付前的檢查清單。

目錄名取自檔案 frontmatter 宣告的 `name`，而非上游的資料夾名稱（上游 13 個
skill 有 10 個兩者不一致，這一份的資料夾叫 `taste-skill`）。載入器是以目錄名
註冊 skill 的，兩者一致才能用宣告的名字叫用。檔案內容逐字保留，未經修改。上游同一個 repo 另有 brutalist、minimalist、soft、
redesign、stitch、brandkit 等 skill，需要時再各別加入。

要改為帳號層級安裝（所有專案都能用），在 Claude Code 執行：

    /plugin marketplace add Leonxlnx/taste-skill
    /plugin install taste-skill@taste-skill
