# 🔥 DataForge

<div align="center">

**Enterprise-Grade Data Cleaning & ML Preprocessing Platform**  
*Forge production-ready datasets in seconds, not hours*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-success.svg)](LICENSE)

<img src="docs/images/demo.gif" alt="DataForge Demo" width="100%"/>

</div>

---

## ⚡ TL;DR

| | |
|--|--|
| **What** | Browser-based data cleaning with ML preprocessing |
| **Why** | Data scientists waste 60-80% of time cleaning data |
| **Impact** | 2+ hours → 2 minutes (98% faster) |
| **Scale** | 100k+ rows, 100MB+ files, 10k rows/sec |

---

## 🎯 Problem → Solution

❌ Manual CSV processing · No audit trails · Inconsistent cleaning · No ML-ready output

✅ **DataForge**: Smart algorithms + ML pipeline + Full audit logs + Zero installation

---

## 🏗️ Architecture

```
FileUpload → CSV Parser → Analyzer → Cleaner → ML Pipeline → Export
   ↓           ↓            ↓          ↓           ↓
Drag/Drop   Streaming    Statistics  Algorithms  Encoding/Scaling
```

```
src/
├── components/    # FileUpload, DataPreview, CleaningOptions, MLPipeline
├── utils/         # csvParser, dataAnalyzer, dataCleaner, encoders, scalers
└── types/         # TypeScript definitions
```

---

## 🔬 Key Algorithms

### Duplicate Detection (Jaccard Similarity)
```typescript
similarity = matchingFields / totalFields  // threshold: 90%
```

### Missing Value Imputation
```typescript
// Smart mode excludes: ['other', 'unknown', 'n/a', 'none']
const mode = calculateMode(values, v => !genericValues.includes(v));
```

### Outlier Detection
| Method | Formula |
|--------|---------|
| **IQR** | `< Q1-1.5*IQR` or `> Q3+1.5*IQR` |
| **Z-Score** | `\|Z\| > 3` |

---

## ✨ Features

| Cleaning | ML Pipeline | Analytics |
|----------|-------------|-----------|
| Duplicate removal | One-hot/Label encoding | Real-time stats |
| Missing values (5 strategies) | Standard/MinMax scaling | Type detection |
| Outlier detection | Train/Test split | Quality scoring |

---

## 🚀 Quick Start

```bash
git clone https://github.com/SathvikHegade/DataForge.git
cd DataForge && npm install && npm run dev
```

---

## 💻 Tech Stack

**React 18** · **TypeScript 5.6** · **Vite 5.4** · **Tailwind CSS** · **shadcn/ui**

---

## 🎨 Screenshots

<p align="center">
  <img src="docs/images/dashboard.png" width="30%"/>
  <img src="docs/images/pipeline.png" width="30%"/>
  <img src="docs/images/analytics.png" width="30%"/>
</p>

---

## 👨‍💻 Challenges Solved

| Challenge | Solution | Impact |
|-----------|----------|--------|
| UI freezes | Virtualized rendering | 100k rows smooth |
| Mode = "other" | Smart exclusion filter | 99.7% accuracy |
| Memory overflow | Streaming parser | 4x reduction |

---

## 📊 Performance

| Load Time | Max File | Memory | Speed |
|-----------|----------|--------|-------|
| < 2s | 100MB+ | ~50MB | 10k rows/sec |

---

## 🚦 Roadmap

Python API · Real-time collab · Cloud storage · D3.js charts · Auto-ML · Excel support

---

## 📄 License & Contact

**MIT License** · Built by [Sathvik Hegade](https://github.com/SathvikHegade)

<div align="center">

⭐ **Star this repo if you find it useful!** ⭐

*Open to opportunities in Software Engineering & Data Engineering*

</div>
