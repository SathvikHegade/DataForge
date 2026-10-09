"""
DataForge Visualisation Engine — fully schema-driven and dataset-agnostic.

Design principles
-----------------
* No dataset-specific column names, dataset names, or hardcoded assumptions.
* Every axis label, chart title, tooltip key, and aggregation label is derived
  from the chart configuration and actual column metadata.
* Column-type detection is multi-class: numeric, date, datetime, boolean,
  identifier, high_cardinality, ordinal, categorical.
* Chart compatibility, valid column lists, allowed aggregations, and column
  multiplicity requirements are all computed from the detected types.
* Recommendations are computed algorithmically from the dataset schema.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import polars as pl


# ---------------------------------------------------------------------------
# Type sets
# ---------------------------------------------------------------------------

NUMERIC_TYPES = {
    pl.Int8, pl.Int16, pl.Int32, pl.Int64,
    pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
    pl.Float32, pl.Float64,
}

DATE_TYPES = {pl.Date, pl.Datetime}
BOOL_TYPES = {pl.Boolean}
DURATION_TYPES = {pl.Duration}
TIME_TYPES = {pl.Time}

# Heuristic thresholds
_HIGH_CARDINALITY_THRESHOLD = 50   # > 50 unique string values -> high_cardinality
_IDENTIFIER_MAX_UNIQUE_RATIO = 0.95  # >95% rows unique -> probable id column


# ---------------------------------------------------------------------------
# JSON serialisation helpers
# ---------------------------------------------------------------------------

def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


# ---------------------------------------------------------------------------
# Column-type classification
# ---------------------------------------------------------------------------

def _classify_column(df: pl.DataFrame, name: str) -> str:
    """
    Return a fine-grained semantic type string for *name* in *df*.

    Returned values:
        numeric, date, datetime, boolean, time, duration,
        identifier, high_cardinality, ordinal, categorical
    """
    series = df.get_column(name)
    dtype = series.dtype

    if dtype in NUMERIC_TYPES:
        return "numeric"
    if dtype == pl.Date:
        return "date"
    if dtype == pl.Datetime:
        return "datetime"
    if dtype in BOOL_TYPES:
        return "boolean"
    if dtype in DURATION_TYPES:
        return "duration"
    if dtype in TIME_TYPES:
        return "time"

    # String / Categorical / Enum -- inspect cardinality
    n_rows = max(df.height, 1)
    try:
        n_unique = series.drop_nulls().n_unique()
    except Exception:
        n_unique = n_rows  # assume worst case

    unique_ratio = n_unique / n_rows

    if unique_ratio >= _IDENTIFIER_MAX_UNIQUE_RATIO and n_unique > 20:
        return "identifier"
    if n_unique > _HIGH_CARDINALITY_THRESHOLD:
        return "high_cardinality"
    if n_unique <= 2:
        return "boolean"  # treat binary strings as boolean
    return "categorical"


def _column_type_map(df: pl.DataFrame) -> Dict[str, str]:
    return {name: _classify_column(df, name) for name in df.columns}


# ---------------------------------------------------------------------------
# Column-group helpers (derived from type map)
# ---------------------------------------------------------------------------

def _numeric_columns(df: pl.DataFrame) -> List[str]:
    return [n for n, dtype in zip(df.columns, df.dtypes) if dtype in NUMERIC_TYPES]


def _date_columns(df: pl.DataFrame) -> List[str]:
    return [n for n, dtype in zip(df.columns, df.dtypes) if dtype in DATE_TYPES]


def _boolean_columns(df: pl.DataFrame, type_map: Dict[str, str]) -> List[str]:
    return [n for n in df.columns if type_map[n] == "boolean"]


def _categorical_columns(df: pl.DataFrame, type_map: Dict[str, str]) -> List[str]:
    """Return true categorical columns -- excludes numeric, date, identifier, high-cardinality."""
    ok = {"categorical", "ordinal", "boolean"}
    return [n for n in df.columns if type_map[n] in ok]


def _ordered_x_columns(df: pl.DataFrame, type_map: Dict[str, str]) -> List[str]:
    """Columns suitable as an ordered X axis for a line chart."""
    ok = {"date", "datetime", "numeric", "ordinal"}
    return [n for n in df.columns if type_map[n] in ok]


# ---------------------------------------------------------------------------
# Sampling / guard helpers
# ---------------------------------------------------------------------------

def _require_columns(df: pl.DataFrame, columns: Iterable[Optional[str]]) -> List[str]:
    selected = [c for c in columns if c]
    missing = [c for c in selected if c not in df.columns]
    if missing:
        raise ValueError(f"Unknown column(s): {', '.join(missing)}")
    return selected


def _numeric_values(df: pl.DataFrame, column: str) -> np.ndarray:
    values = df.get_column(column).drop_nulls().to_numpy()
    values = np.asarray(values, dtype=float)
    return values[np.isfinite(values)]


def _sample_frame(df: pl.DataFrame, sample_size: int) -> pl.DataFrame:
    if df.height <= sample_size:
        return df
    return df.sample(n=sample_size, with_replacement=False, seed=42)


# ---------------------------------------------------------------------------
# Dynamic title / label generation
# ---------------------------------------------------------------------------

_AGG_LABELS: Dict[str, str] = {
    "count":   "Count",
    "sum":     "Sum",
    "mean":    "Mean",
    "median":  "Median",
    "min":     "Min",
    "max":     "Max",
    "std":     "Std Dev",
    "nunique": "Unique Count",
}


def _agg_label(agg: str) -> str:
    return _AGG_LABELS.get(agg, agg.title())


def _make_title(chart_type: str, columns: List[str], agg: Optional[str] = None) -> str:
    """Generate a human-readable chart title from chart type, columns, and aggregation."""
    if chart_type in {"histogram", "kde", "violin"}:
        return f"Distribution of {columns[0]}" if columns else "Distribution"
    if chart_type == "box":
        return f"Box Plot of {columns[0]}" if columns else "Box Plot"
    if chart_type == "outlier":
        return f"Outlier Analysis — {columns[0]}" if columns else "Outlier Analysis"
    if chart_type in {"bar", "class_distribution"}:
        col = columns[0] if columns else "Category"
        agg_lbl = _agg_label(agg or "count")
        return f"{agg_lbl} by {col}"
    if chart_type == "scatter":
        if len(columns) >= 2:
            return f"{columns[0]} vs {columns[1]}"
        return "Scatter Plot"
    if chart_type == "line":
        if len(columns) >= 2:
            return f"{columns[1]} over {columns[0]}"
        return "Line Chart"
    if chart_type == "grouped_box":
        if len(columns) >= 2:
            return f"{columns[0]} by {columns[1]}"
        return "Grouped Box Plot"
    if chart_type == "correlation_heatmap":
        return "Correlation Heatmap"
    if chart_type == "pair_plot":
        return f"Pair Plot Matrix ({len(columns)} × {len(columns)})" if len(columns) >= 2 else "Pair Plot Matrix"
    if chart_type == "missing_bar":
        return "Missing Values by Column"
    if chart_type == "missing_heatmap":
        return "Missing Value Pattern"
    return chart_type.replace("_", " ").title()


def _make_axis_labels(
    chart_type: str,
    columns: List[str],
    agg: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Return (x_label, y_label) dynamically derived from the chart configuration.
    Never hardcodes column names from any particular dataset.
    """
    agg_lbl = _agg_label(agg or "count")

    if chart_type in {"histogram", "kde", "violin"}:
        col = columns[0] if columns else "Value"
        return col, "Frequency" if chart_type == "histogram" else "Density"

    if chart_type in {"box", "outlier"}:
        col = columns[0] if columns else "Column"
        return col, col

    if chart_type in {"bar", "class_distribution"}:
        col = columns[0] if columns else "Category"
        return col, agg_lbl

    if chart_type == "scatter":
        x = columns[0] if columns else "X"
        y = columns[1] if len(columns) > 1 else "Y"
        return x, y

    if chart_type == "line":
        x = columns[0] if columns else "X"
        y = columns[1] if len(columns) > 1 else "Y"
        return x, y

    if chart_type == "grouped_box":
        num_col = columns[0] if columns else "Value"
        cat_col = columns[1] if len(columns) > 1 else "Group"
        return cat_col, num_col

    if chart_type == "correlation_heatmap":
        return "Feature", "Feature"

    if chart_type == "missing_bar":
        return "Column", "Missing Count"

    if chart_type == "missing_heatmap":
        return "Column", "Row"

    if chart_type == "pair_plot":
        return "Variables (Columns)", "Variables (Rows)"

    return "", ""


# ---------------------------------------------------------------------------
# Aggregation engine
# ---------------------------------------------------------------------------

def _apply_aggregation(df: pl.DataFrame, group_col: str, value_col: str, agg: str) -> pl.DataFrame:
    """Group *df* by *group_col* and apply *agg* on *value_col*. Returns sorted frame."""
    numeric_cols = set(_numeric_columns(df))
    if agg == "count":
        result = (
            df.group_by(group_col, maintain_order=False)
            .len(name="y")
            .sort("y", descending=True)
            .head(30)
        )
        return result.rename({group_col: "x"})
    if agg == "nunique":
        if not value_col or value_col not in df.columns:
            raise ValueError(f"Value column '{value_col}' not found for aggregation.")
        result = (
            df.group_by(group_col, maintain_order=False)
            .agg(pl.col(value_col).drop_nulls().n_unique().alias("y"))
            .sort("y", descending=True)
            .head(30)
        )
        return result.rename({group_col: "x"})

    agg_exprs = {
        "sum":    pl.col(value_col).sum(),
        "mean":   pl.col(value_col).mean(),
        "median": pl.col(value_col).median(),
        "min":    pl.col(value_col).min(),
        "max":    pl.col(value_col).max(),
        "std":    pl.col(value_col).std(),
    }
    if agg not in agg_exprs:
        raise ValueError(f"Unknown aggregation: {agg!r}")
    if not value_col or value_col not in numeric_cols:
        raise ValueError(f"Aggregation '{agg}' requires a numeric value column. Got: {value_col!r}")

    result = (
        df.group_by(group_col, maintain_order=False)
        .agg(agg_exprs[agg].alias("y"))
        .sort("y", descending=True)
        .head(30)
    )
    return result.rename({group_col: "x"})


# ---------------------------------------------------------------------------
# Chart-data computation helpers
# ---------------------------------------------------------------------------

def _distribution_stats(values: np.ndarray) -> Dict[str, Any]:
    if len(values) == 0:
        return {"count": 0, "mean": None, "median": None, "min": None, "max": None}
    return {
        "count":  int(len(values)),
        "mean":   round(float(np.mean(values)), 4),
        "median": round(float(np.median(values)), 4),
        "min":    round(float(np.min(values)), 4),
        "max":    round(float(np.max(values)), 4),
    }


def _histogram(values: np.ndarray, bins: int) -> List[Dict[str, Any]]:
    if len(values) == 0:
        return []
    if np.min(values) == np.max(values):
        return [{"bin_start": float(values[0]), "bin_end": float(values[0]), "count": int(len(values))}]
    counts, edges = np.histogram(values, bins=bins)
    return [
        {
            "bin_start": round(float(edges[i]), 6),
            "bin_end":   round(float(edges[i + 1]), 6),
            "count":     int(counts[i]),
        }
        for i in range(len(counts))
    ]


def _kde(values: np.ndarray) -> List[Dict[str, float]]:
    if len(values) < 2 or np.min(values) == np.max(values):
        return []
    bandwidth = max(1.06 * np.std(values) * len(values) ** (-1 / 5), 1e-9)
    x_values = np.linspace(float(np.min(values)), float(np.max(values)), 80)
    density = np.exp(-0.5 * ((x_values[:, None] - values[None, :]) / bandwidth) ** 2).sum(axis=1)
    density /= len(values) * bandwidth * math.sqrt(2 * math.pi)
    return [{"x": round(float(x), 6), "density": round(float(y), 8)} for x, y in zip(x_values, density)]


def _box(values: np.ndarray) -> Dict[str, Any]:
    if len(values) == 0:
        return {
            "count": 0, "min": None, "q1": None, "median": None,
            "q3": None, "max": None, "outlier_count": 0, "outliers": [],
        }
    q1, median, q3 = np.percentile(values, [25, 50, 75])
    iqr = q3 - q1
    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outliers = values[(values < low) | (values > high)]
    return {
        "count":         int(len(values)),
        "min":           float(np.min(values)),
        "q1":            float(q1),
        "median":        float(median),
        "q3":            float(q3),
        "max":           float(np.max(values)),
        "lower_fence":   float(low),
        "upper_fence":   float(high),
        "outlier_count": int(len(outliers)),
        "outliers":      [float(v) for v in outliers[:100]],
    }


# ---------------------------------------------------------------------------
# Recommendations -- algorithmically derived from schema
# ---------------------------------------------------------------------------

def _recommendations(df: pl.DataFrame) -> List[Dict[str, Any]]:
    """
    Build chart recommendations from the actual dataset schema.
    No column names or dataset names are hardcoded here.
    """
    type_map = _column_type_map(df)
    numeric = _numeric_columns(df)
    dates = _date_columns(df)
    categoricals = _categorical_columns(df, type_map)
    n_rows = df.height

    recs: List[Dict[str, Any]] = []

    if numeric:
        col = numeric[0]
        recs.append({"chart_type": "histogram", "columns": [col], "reason": f"Inspect frequency distribution of '{col}'."})
        recs.append({"chart_type": "kde",        "columns": [col], "reason": f"Inspect the smoothed distribution shape of '{col}'."})
        recs.append({"chart_type": "box",        "columns": [col], "reason": f"Review spread and potential outliers in '{col}'."})

    if categoricals:
        col = categoricals[0]
        recs.append({"chart_type": "bar", "columns": [col], "reason": f"Compare category frequencies in '{col}'."})

    if len(numeric) >= 2:
        recs.append({"chart_type": "scatter",             "columns": numeric[:2],  "reason": f"Explore relationship between '{numeric[0]}' and '{numeric[1]}'."})
        recs.append({"chart_type": "correlation_heatmap", "columns": numeric[:6], "reason": "Review linear relationships between all numeric features."})

    if numeric and categoricals:
        recs.append({"chart_type": "grouped_box", "columns": [numeric[0], categoricals[0]], "reason": f"Compare '{numeric[0]}' distribution across '{categoricals[0]}' groups."})

    if dates and numeric:
        recs.append({"chart_type": "line", "columns": [dates[0], numeric[0]], "reason": f"Inspect '{numeric[0]}' trend over time ('{dates[0]}')."})

    has_missing = any(df.get_column(col).null_count() > 0 for col in df.columns)
    if has_missing:
        recs.append({"chart_type": "missing_bar", "columns": [], "reason": "Quantify missing values by column."})
        if n_rows <= 5000:
            recs.append({"chart_type": "missing_heatmap", "columns": [], "reason": "Find row-level missingness patterns."})

    if len(numeric) >= 3:
        recs.append({"chart_type": "pair_plot", "columns": numeric[:4], "reason": "Explore pairwise feature relationships."})

    return recs


# ---------------------------------------------------------------------------
# Schema metadata endpoint
# ---------------------------------------------------------------------------

def metadata(df: pl.DataFrame, dataset_id: str, version_id: str, version_number: int) -> Dict[str, Any]:
    """
    Return rich schema metadata needed by the frontend to present
    schema-driven, dataset-agnostic chart controls.
    """
    type_map = _column_type_map(df)
    numeric = _numeric_columns(df)
    dates = _date_columns(df)

    chart_compatibility: Dict[str, Dict[str, Any]] = {
        "histogram":          {"required_types": ["numeric"],                 "n_columns": 1,  "aggregations": []},
        "kde":                {"required_types": ["numeric"],                 "n_columns": 1,  "aggregations": []},
        "box":                {"required_types": ["numeric"],                 "n_columns": 1,  "aggregations": []},
        "outlier":            {"required_types": ["numeric"],                 "n_columns": 1,  "aggregations": []},
        "violin":             {"required_types": ["numeric"],                 "n_columns": 1,  "aggregations": []},
        "bar":                {"required_types": ["categorical", "boolean"],  "n_columns": 1,  "aggregations": ["count", "sum", "mean", "median", "min", "max", "std", "nunique"]},
        "class_distribution": {"required_types": ["categorical", "boolean"],  "n_columns": 1,  "aggregations": ["count"]},
        "scatter":            {"required_types": ["numeric"],                 "n_columns": 2,  "aggregations": []},
        "line":               {"required_types": ["numeric", "date", "datetime"], "n_columns": 2, "aggregations": []},
        "grouped_box":        {"required_types": ["numeric", "categorical"],  "n_columns": 2,  "aggregations": []},
        "correlation_heatmap":{"required_types": ["numeric"],                 "n_columns": -1, "aggregations": []},
        "pair_plot":          {"required_types": ["numeric"],                 "n_columns": -1, "min_columns": 2, "max_columns": 6, "aggregations": []},
        "missing_bar":        {"required_types": [],                          "n_columns": 0,  "aggregations": []},
        "missing_heatmap":    {"required_types": [],                          "n_columns": 0,  "aggregations": []},
    }

    return {
        "dataset_id":         dataset_id,
        "version_id":         version_id,
        "version_number":     version_number,
        "row_count":          df.height,
        "columns":            df.columns,
        "column_types":       type_map,
        "numeric_columns":    numeric,
        "categorical_columns": _categorical_columns(df, type_map),
        "date_columns":       dates,
        "boolean_columns":    _boolean_columns(df, type_map),
        "missing_columns":    [n for n in df.columns if df.get_column(n).null_count() > 0],
        "recommendations":    _recommendations(df),
        "chart_compatibility": chart_compatibility,
    }


# ---------------------------------------------------------------------------
# Main chart generation entry point
# ---------------------------------------------------------------------------

def generate_chart(
    df: pl.DataFrame,
    chart_type: str,
    columns: List[str],
    x_column: Optional[str],
    y_column: Optional[str],
    group_column: Optional[str],
    bins: int,
    correlation_method: str,
    sample_size: int,
    aggregation: str = "count",
    value_column: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute chart data for *chart_type* from *df*.

    All titles, axis labels, and tooltips are derived from the chart
    configuration and column names — never from hardcoded dataset assumptions.
    """
    selected = _require_columns(df, [*columns, x_column, y_column, group_column])
    type_map = _column_type_map(df)
    numeric = set(_numeric_columns(df))
    frame = _sample_frame(df, sample_size)

    # Resolve the primary column list for title/label generation
    if x_column and y_column:
        effective_columns: List[str] = [x_column, y_column]
    elif selected:
        effective_columns = selected
    else:
        effective_columns = []

    title = _make_title(chart_type, effective_columns, aggregation)
    x_label, y_label = _make_axis_labels(chart_type, effective_columns, aggregation)
    insights: List[Dict[str, Any]] = []

    # -----------------------------------------------------------------------
    # Distribution charts
    # -----------------------------------------------------------------------
    if chart_type in {"histogram", "kde", "box", "violin", "outlier"}:
        column = effective_columns[0] if effective_columns else None
        if not column or column not in numeric:
            raise ValueError(f"'{chart_type}' requires one numeric/numerical column. Got: {column!r}")

        values = _numeric_values(frame, column)
        stats = _distribution_stats(values)

        if chart_type == "histogram":
            data = _histogram(values, bins)
            insights = [
                {"label": "Mean",   "value": stats["mean"]},
                {"label": "Median", "value": stats["median"]},
                {"label": "Count",  "value": stats["count"]},
            ]
        elif chart_type == "kde":
            data = _kde(values)
            insights = [
                {"label": "Observations", "value": stats["count"]},
                {"label": "Mean",         "value": stats["mean"]},
                {"label": "Std Dev",      "value": round(float(np.std(values)), 4) if len(values) > 0 else None},
            ]
        elif chart_type == "violin":
            data = _kde(values)
            insights = [
                {"label": "Observations", "value": stats["count"]},
                {"label": "Median",       "value": stats["median"]},
            ]
        else:  # box / outlier
            data = [{"column": column, **_box(values)}]
            box = data[0]
            insights = [
                {"label": "Median",            "value": box["median"]},
                {"label": "IQR",               "value": round(float(box["q3"] - box["q1"]), 4) if box["q1"] is not None else None},
                {"label": "Potential outliers", "value": box["outlier_count"]},
            ]

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": x_label,
            "y_axis_label": y_label,
            "data":         data,
            "insights":     insights,
            "metadata": {
                "sampled":     frame.height < df.height,
                "sample_size": frame.height,
                "row_count":   df.height,
                "column":      column,
                "column_type": type_map.get(column, "numeric"),
            },
        }

    # -----------------------------------------------------------------------
    # Bar / class_distribution
    # -----------------------------------------------------------------------
    if chart_type in {"bar", "class_distribution"}:
        column = effective_columns[0] if effective_columns else None
        if not column:
            raise ValueError("Bar chart requires one column.")

        agg = aggregation if chart_type != "class_distribution" else "count"
        val_col = value_column or (effective_columns[1] if len(effective_columns) > 1 else "")

        agg_result = _apply_aggregation(frame, column, val_col, agg)
        total = frame.height or 1
        data = []
        for row in agg_result.to_dicts():
            entry: Dict[str, Any] = {
                "value":      str(row["x"]),
                "y":          _json_value(row["y"]),
                "count":      int(row["y"]) if agg == "count" else None,
                "percentage": round(float(row["y"]) / total * 100, 2) if agg == "count" else None,
            }
            data.append(entry)

        insights = [
            {"label": "Categories shown", "value": len(data)},
            {"label": "Aggregation",      "value": _agg_label(agg)},
            {"label": "Largest class",    "value": data[0]["value"] if data else None},
        ]

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": x_label,
            "y_axis_label": y_label,
            "data":         data,
            "insights":     insights,
            "metadata": {
                "sampled":     frame.height < df.height,
                "sample_size": frame.height,
                "row_count":   df.height,
                "column":      column,
                "aggregation": agg,
                "agg_label":   _agg_label(agg),
            },
        }

    # -----------------------------------------------------------------------
    # Scatter
    # -----------------------------------------------------------------------
    if chart_type == "scatter":
        xcol = x_column or (effective_columns[0] if effective_columns else None)
        ycol = y_column or (effective_columns[1] if len(effective_columns) > 1 else None)
        if not xcol or not ycol:
            raise ValueError("Scatter plot requires two columns (x and y).")
        if xcol not in numeric or ycol not in numeric:
            raise ValueError("Scatter plot requires two numeric columns.")

        pairs = frame.select([xcol, ycol]).drop_nulls().to_dicts()
        data = [{"x": _json_value(row[xcol]), "y": _json_value(row[ycol])} for row in pairs]

        corr = None
        if len(data) > 1:
            xs = [p["x"] for p in data if p["x"] is not None]
            ys = [p["y"] for p in data if p["y"] is not None]
            if len(xs) > 1 and len(ys) == len(xs):
                c = float(np.corrcoef(xs, ys)[0, 1])
                corr = round(c, 4) if math.isfinite(c) else None

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": xcol,
            "y_axis_label": ycol,
            "data":         data,
            "insights":     [
                {"label": "Correlation", "value": corr},
                {"label": "Data points", "value": len(data)},
            ],
            "metadata": {
                "sampled":     frame.height < df.height,
                "sample_size": len(data),
                "row_count":   df.height,
                "x_column":    xcol,
                "y_column":    ycol,
            },
        }

    # -----------------------------------------------------------------------
    # Correlation heatmap
    # -----------------------------------------------------------------------
    if chart_type == "correlation_heatmap":
        chosen = [c for c in (effective_columns or _numeric_columns(df)) if c in numeric][:6]
        if len(chosen) < 2:
            raise ValueError("Correlation heatmap requires at least two numeric columns.")
        matrix = frame.select(chosen).to_pandas().corr(method=correlation_method)
        data = [
            {
                "x": x, "y": y,
                "value": round(float(matrix.loc[y, x]), 5) if not math.isnan(matrix.loc[y, x]) else None,
            }
            for y in chosen for x in chosen
        ]

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": "Feature",
            "y_axis_label": "Feature",
            "data":         data,
            "insights":     [
                {"label": "Features", "value": len(chosen)},
                {"label": "Method",   "value": correlation_method},
            ],
            "metadata": {"columns": chosen, "row_count": df.height},
        }

    # -----------------------------------------------------------------------
    # Pair plot
    # -----------------------------------------------------------------------
    if chart_type == "pair_plot":
        # Resolve requested columns: must be numeric
        if effective_columns:
            non_numeric = [c for c in effective_columns if c not in numeric]
            if non_numeric:
                raise ValueError(
                    f"Pair plot requires numeric columns. '{non_numeric[0]}' is non-numeric."
                )
            chosen = [c for c in effective_columns if c in numeric]
        else:
            chosen = _numeric_columns(df)

        if len(chosen) < 2:
            raise ValueError("Pair plot requires at least two compatible numeric columns.")

        # Cap selection at 6 columns to protect against quadratic explosion (6x6 = 36 plots)
        chosen = chosen[:6]
        n_cols = len(chosen)

        # 1. Diagonal: Distribution histograms & stats computed over the complete dataset
        diagonal: Dict[str, Any] = {}
        for col in chosen:
            vals = _numeric_values(df, col)
            st = _distribution_stats(vals)
            diag_bins = min(max(bins, 10), 25)
            hist = _histogram(vals, diag_bins)
            diagonal[col] = {
                "column": col,
                "histogram": hist,
                "stats": st,
            }

        # 2. Pairwise correlations computed with pairwise drop_nulls over the complete dataset
        correlations: Dict[str, float] = {}
        for col_i in chosen:
            for col_j in chosen:
                pair_key = f"{col_i}__{col_j}"
                if col_i == col_j:
                    correlations[pair_key] = 1.0
                else:
                    pair_df = df.select([col_i, col_j]).drop_nulls()
                    if pair_df.height < 2:
                        correlations[pair_key] = 0.0
                    else:
                        v_i = pair_df.get_column(col_i).to_numpy()
                        v_j = pair_df.get_column(col_j).to_numpy()
                        v_i = np.asarray(v_i, dtype=float)
                        v_j = np.asarray(v_j, dtype=float)
                        mask = np.isfinite(v_i) & np.isfinite(v_j)
                        v_i, v_j = v_i[mask], v_j[mask]
                        if len(v_i) >= 2 and np.std(v_i) > 0 and np.std(v_j) > 0:
                            r = float(np.corrcoef(v_i, v_j)[0, 1])
                            correlations[pair_key] = round(r, 4) if math.isfinite(r) else 0.0
                        else:
                            correlations[pair_key] = 0.0

        # 3. Column bounds for consistent scaling across the matrix
        column_bounds: Dict[str, Dict[str, float]] = {}
        for col in chosen:
            vals = _numeric_values(df, col)
            if len(vals) > 0:
                c_min = float(np.min(vals))
                c_max = float(np.max(vals))
                if c_min == c_max:
                    c_min -= 1.0
                    c_max += 1.0
                column_bounds[col] = {"min": round(c_min, 4), "max": round(c_max, 4)}
            else:
                column_bounds[col] = {"min": 0.0, "max": 1.0}

        # 4. Server-side deterministic sampling for scatter points (up to 400 points)
        clean_df = df.select(chosen).drop_nulls()
        scatter_limit = min(sample_size, 400)
        is_sampled = clean_df.height > scatter_limit
        if is_sampled:
            sampled_df = clean_df.sample(n=scatter_limit, with_replacement=False, seed=42)
        else:
            sampled_df = clean_df

        sample_points = [
            {col: _json_value(row[col]) for col in chosen}
            for row in sampled_df.to_dicts()
        ]

        # 5. Build N x N cells definitions
        cells: List[List[Dict[str, Any]]] = []
        for i, row_col in enumerate(chosen):
            row_cells: List[Dict[str, Any]] = []
            for j, col_col in enumerate(chosen):
                pair_key = f"{row_col}__{col_col}"
                row_cells.append({
                    "row_index": i,
                    "col_index": j,
                    "row_column": row_col,
                    "col_column": col_col,
                    "is_diagonal": (i == j),
                    "correlation": correlations.get(pair_key, 1.0 if i == j else 0.0),
                })
            cells.append(row_cells)

        matrix_data = {
            "columns": chosen,
            "matrix_size": n_cols,
            "diagonal": diagonal,
            "column_bounds": column_bounds,
            "correlations": correlations,
            "sample_points": sample_points,
            "cells": cells,
        }

        off_diag_corrs = [
            abs(correlations[f"{c1}__{c2}"])
            for i, c1 in enumerate(chosen)
            for j, c2 in enumerate(chosen)
            if i != j
        ]
        avg_abs_corr = round(sum(off_diag_corrs) / len(off_diag_corrs), 3) if off_diag_corrs else 0.0

        insights = [
            {"label": "Matrix Grid", "value": f"{n_cols} × {n_cols} ({n_cols * n_cols} cells)"},
            {"label": "Variables", "value": n_cols},
            {"label": "Scatter Sample", "value": f"{len(sample_points):,} points"},
            {"label": "Avg |Correlation|", "value": avg_abs_corr},
        ]

        return {
            "chart_type":   chart_type,
            "title":        title or f"Pair Plot Matrix ({n_cols} × {n_cols})",
            "x_axis_label": "Feature (Columns)",
            "y_axis_label": "Feature (Rows)",
            "data":         matrix_data,
            "insights":     insights,
            "metadata": {
                "columns":     chosen,
                "matrix_size": n_cols,
                "sampled":     is_sampled,
                "sample_size": len(sample_points),
                "row_count":   df.height,
            },
        }

    # -----------------------------------------------------------------------
    # Grouped box
    # -----------------------------------------------------------------------
    if chart_type == "grouped_box":
        num_col = x_column or (effective_columns[0] if effective_columns else None)
        cat_col = y_column or group_column or (effective_columns[1] if len(effective_columns) > 1 else None)
        if not num_col or not cat_col:
            raise ValueError("Grouped box plot requires a numeric column and a categorical column.")
        if num_col not in numeric:
            raise ValueError(f"'{num_col}' is not a numeric column.")

        groups = frame.select([num_col, cat_col]).drop_nulls().group_by(cat_col, maintain_order=False)
        data = []
        for group_key, group_frame in groups:
            group = group_key[0] if isinstance(group_key, tuple) else group_key
            data.append({"group": str(group), **_box(_numeric_values(group_frame, num_col))})

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": cat_col,
            "y_axis_label": num_col,
            "data":         data[:30],
            "insights":     [{"label": "Groups shown", "value": len(data[:30])}],
            "metadata":     {"row_count": df.height, "numeric_column": num_col, "group_column": cat_col},
        }

    # -----------------------------------------------------------------------
    # Line chart
    # -----------------------------------------------------------------------
    if chart_type == "line":
        xcol = x_column or (effective_columns[0] if effective_columns else None)
        ycol = y_column or (effective_columns[1] if len(effective_columns) > 1 else None)
        if not xcol or not ycol:
            raise ValueError("Line chart requires an X (ordered/date) column and a numeric Y column.")
        if ycol not in numeric:
            raise ValueError(f"Y column '{ycol}' must be numeric for a line chart.")

        date_cols = set(_date_columns(df))
        if xcol not in numeric and xcol not in date_cols:
            raise ValueError(f"X column '{xcol}' must be numeric or date/datetime.")

        data = [
            {"x": str(row[xcol]), "y": _json_value(row[ycol])}
            for row in frame.select([xcol, ycol]).drop_nulls().sort(xcol).head(2000).to_dicts()
        ]

        return {
            "chart_type":   chart_type,
            "title":        title,
            "x_axis_label": xcol,
            "y_axis_label": ycol,
            "data":         data,
            "insights":     [{"label": "Points shown", "value": len(data)}],
            "metadata":     {"row_count": df.height},
        }

    # -----------------------------------------------------------------------
    # Missing value charts
    # -----------------------------------------------------------------------
    if chart_type == "missing_bar":
        data = [
            {
                "column":     col,
                "missing":    int(df.get_column(col).null_count()),
                "percentage": round(df.get_column(col).null_count() / (df.height or 1) * 100, 2),
            }
            for col in df.columns
        ]
        return {
            "chart_type":   chart_type,
            "title":        "Missing Values by Column",
            "x_axis_label": "Column",
            "y_axis_label": "Missing Count",
            "data":         data,
            "insights":     [{"label": "Columns with missing values", "value": sum(1 for d in data if d["missing"] > 0)}],
            "metadata":     {"row_count": df.height},
        }

    if chart_type == "missing_heatmap":
        heat_frame = _sample_frame(df, min(sample_size, 200)).select(df.columns)
        data = [
            {"row": idx, "column": col, "missing": heat_frame.get_column(col)[idx] is None}
            for idx in range(heat_frame.height)
            for col in df.columns
        ]
        return {
            "chart_type":   chart_type,
            "title":        "Missing Value Pattern",
            "x_axis_label": "Column",
            "y_axis_label": "Row",
            "data":         data,
            "insights":     [{"label": "Rows shown", "value": heat_frame.height}],
            "metadata":     {"row_count": df.height, "sampled": heat_frame.height < df.height},
        }

    raise ValueError(f"Unsupported chart type: {chart_type!r}")
