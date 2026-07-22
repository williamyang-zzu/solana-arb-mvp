# solana-arb-mvp

极简 Pumpfun AMM ↔ Meteora DLMM 原子 swap MVP 骨架。

第一版目标：

```text
Pump Buy IX
+
DLMM Sell IX
+
simulateTransaction
```

> 当前骨架已经包含配置、钱包、WSOL/ATA 工具、交易组装、simulate 主流程；两个 DEX 的具体 swap instruction 构造位置先留 TODO。

## 初始化

```bash
cd solana-arb-mvp
npm install
cp .env.example .env
```

编辑 `.env`：

```bash
RPC_URL=你的主网RPC
KEYPAIR_PATH=~/.config/solana/id.json
TOKEN_MINT=目标token mint
PUMP_POOL=Pumpfun AMM pool
DLMM_PAIR=Meteora DLMM pair
INPUT_SOL=0.001
SLIPPAGE_BPS=300
SEND_TX=false
```

检查类型：

```bash
npm run check
```

运行：

```bash
npm run dev
```

## 目录说明

```text
src/config/      读取 env，集中管理配置
src/wallet/      加载钱包、ATA、WSOL wrap/close 工具
src/dex/         Pumpfun 和 Meteora 的 quote/swap ix 构造
src/arb/         套利执行主流程：quote -> build ix -> tx -> simulate/send
src/utils/       日志、instruction 打印、数字工具
src/main.ts      CLI 程序入口
```


## 里程碑记录

```text
首次完成Pump AMM买入和Meteora DLMM卖出的原子transaction         https://solscan.io/tx/2WJx9jBnwgdbK1NmVAuDgC9Fy1X8JzqFmCrWMmR14Mfjy6KeiFdgbHUhmFaf3Si3X2vpVCiDkNiqPPfYjFDMEDqw
```
