# Severson 2019 Dataset · Manual Download

The dataset that Severson, Attia et al. used in their Nature Energy 2019 paper
"Data-driven prediction of battery cycle life before capacity degradation" —
**124 commercial LFP/graphite cells cycled to end-of-life**.

We cannot fetch this fully programmatically because data.matr.io serves a JS
landing page on direct GET. Pick the path that works and download manually.

---

## Path A · data.matr.io (canonical, ~6 GB total)

**This is the path we want.** Original full dataset, three .mat batch files.

### 1. Open the project page in a browser

<https://data.matr.io/1/projects/5c48dd2bc625d700019f3204>

You should see "Severson, et al. — Data-driven prediction of battery cycle
life before capacity degradation" with a list of files.

### 2. Download these three files

| File | Approx size | Batch |
|------|-------------|-------|
| `2017-05-12_batchdata_updated_struct_errorcorrect.mat` | ~1.7 GB | Batch 1 (training) |
| `2017-06-30_batchdata_updated_struct_errorcorrect.mat` | ~1.5 GB | Batch 2 (primary test) |
| `2018-04-12_batchdata_updated_struct_errorcorrect.mat` | ~2.7 GB | Batch 3 (secondary test) |

Click each filename → the browser may prompt for a free TRI / data.matr.io
account. Sign up with any email.

### 3. Move them to the project

Save to **exactly this path** (case-sensitive on Linux/macOS, Windows is
forgiving):

```
C:/Users/user/Desktop/dev/atcc/data/raw/severson/
├── 2017-05-12_batchdata_updated_struct_errorcorrect.mat
├── 2017-06-30_batchdata_updated_struct_errorcorrect.mat
└── 2018-04-12_batchdata_updated_struct_errorcorrect.mat
```

Run the EDA notebook (`notebooks/01_severson_eda.ipynb`) — it auto-detects
this path and loads the data.

### 4. Verify

```bash
ls -la data/raw/severson/
# should show three .mat files totalling ~6 GB
```

Or in Python:

```python
import scipy.io
m = scipy.io.loadmat("data/raw/severson/2017-05-12_batchdata_updated_struct_errorcorrect.mat")
print(list(m.keys()))    # expect 'batch', plus header keys
```

(NB: the .mat files use HDF5 v7.3 internally, so `scipy.io.loadmat` may need
`simplify_cells=True` or fall back to `h5py.File`. The notebook handles both.)

---

## Path B · Pre-processed feature CSVs (fallback, < 50 MB)

If Path A is failing — slow connection, TRI account hassle, etc. — there are
community mirrors that pre-extracted just the features Severson uses:

- <https://github.com/rdbraatz/data-driven-prediction-of-battery-cycle-life> —
  the reference Severson reproduction repo (MATLAB-first, but contains
  preprocessed `.csv` outputs in the `Data/` folder of recent forks).
- <https://www.batteryarchive.org/> — TRI also publishes one-cell-per-CSV
  derivatives. Slow per-cell parsing.

Save anything you grab to `data/raw/severson/`. The notebook tries `.mat` →
`.csv` → `.h5` in that order.

---

## Path C · Skip Severson entirely (last resort)

If neither Path A nor Path B works tonight:

- Run the NASA PCoE downloader instead:
  `python scripts/download_data.py --nasa`
  (~210 MB, no auth, the URL is verified working in our `_http.py` checks)
- Update the notebook to point at NASA cells instead. We lose the 124-cell
  LFP advantage — NASA has only 4 LCO cells — but we can still demonstrate
  RUL prediction as a competence proof.

This is **plan C** because it weakens the v2.2 proposal&rsquo;s explicit
"Severson 2019 main training set" claim. Use only if A and B fail.

---

## What to do now

1. **Open browser → start Path A download in the background.**
2. While the .mat files are streaming, come back here and tell me. I will
   already have the EDA notebook skeleton running — it will pick up the data
   the moment it lands.
3. Don&rsquo;t worry about the 6 GB taking ~30 min. We can structure the
   notebook so the slow `loadmat` only runs once and caches a clean Parquet
   to `data/processed/severson_cells.parquet` that subsequent cells reload
   instantly.
