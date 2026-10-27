# 本地游戏素材清单

已从本机 `C:\Program Files (x86)\pvzHE\main.pak` 提取 4,109 个文件，保留包内目录结构。逐文件回读验证通过，原资源包 SHA-256 在提取前后相同。

## 素材目录

- `raw/images/`：基础界面、背景和图片。
- `raw/reanim/`：基础角色和动画使用的图片部件。
- `raw/new/`：改版新增的图片部件等资源。
- `raw/newbackground/`：改版背景。
- `raw/newshop/`：商店相关素材。
- `raw/sounds/`、`raw/NewSounds/`：基础与新增音频。
- `raw/compiled/`：编译后的动画和特效数据，需要转换后接入网页游戏。
- `raw/properties/`：资源配置等文件。
- `inventory.json`：完整相对路径、大小、SHA-256 校验值。

## 第一版优先候选

以下按文件名称筛选，尚未逐个做视觉或听觉检查：

- `raw/newbackground/background1A.jpg` 至 `background1D.jpg`：背景候选。
- `raw/sounds/splat.ogg`、`splat2.ogg`、`splat3.ogg`：受击音候选。
- `raw/sounds/coin.ogg`：金币音候选。
- `raw/sounds/diamond.au`：钻石音候选，需要转换为网页适用音频格式。
- `raw/compiled/reanim/Coin_gold.reanim.compiled`：金币动画数据。
- `raw/compiled/reanim/Coin_silver.reanim.compiled`：银币动画数据。
- `raw/compiled/reanim/Diamond.reanim.compiled`：钻石动画数据。

PNG、JPG、OGG 可以作为网页资源使用；角色部件仍需组合或将原动画导出为精灵图。此次只完成提取和清单整理，没有转换 compiled 动画，也没有将整个素材库接入游戏。
